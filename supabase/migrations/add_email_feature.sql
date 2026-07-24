-- ============================================================
-- Add Email feature: templates, send log, recipient log
-- Run in Supabase SQL Editor
-- ============================================================

-- 0. Fix a pre-existing gap: the UI (AdminDashboard.jsx, Layout.jsx) already
--    treats 'doc' as a valid staff role, but the database never allowed it.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'coach', 'jdo', 'doc'));

-- 1. Reusable email content
create table if not exists public.email_templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  subject     text not null,
  body        text not null,
  audience    text not null check (audience in ('members', 'coaches')),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. One row per send event (draft or sent). Subject/body are snapshotted
--    here so editing or deleting a template later never changes history.
create table if not exists public.emails (
  id               uuid primary key default uuid_generate_v4(),
  template_id      uuid references public.email_templates(id) on delete set null,
  subject          text not null,
  body             text not null,
  audience         text not null check (audience in ('members', 'coaches')),
  target_type      text not null check (target_type in ('all', 'role', 'team', 'squad', 'individual')),
  target_ids       jsonb not null default '[]',
  recipient_count  integer not null default 0,
  status           text not null default 'Draft' check (status in ('Draft', 'Sending', 'Sent', 'Failed', 'Partial')),
  sent_by          uuid references auth.users(id),
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);

-- 3. One row per actual person a message went (or will go) to.
create table if not exists public.email_recipients (
  id                 uuid primary key default uuid_generate_v4(),
  email_id           uuid not null references public.emails(id) on delete cascade,
  member_id          uuid references public.members(id) on delete set null,
  profile_id         uuid references public.profiles(id) on delete set null,
  recipient_name     text not null,
  recipient_email    text not null,
  status             text not null default 'Pending' check (status in ('Pending', 'Sent', 'Failed', 'Bounced')),
  provider_message_id text,
  error_message      text,
  sent_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists email_recipients_email_id_idx on public.email_recipients (email_id);
create index if not exists emails_status_idx on public.emails (status);

-- Grants — new tables aren't automatically covered by Supabase's default role
-- grants (learned this the hard way with club_settings). RLS below still
-- governs which rows are actually visible/writable.
grant select, insert, update, delete on public.email_templates to authenticated;
grant select, insert, update, delete on public.emails to authenticated;
grant select, insert, update, delete on public.email_recipients to authenticated;

alter table public.email_templates enable row level security;
alter table public.emails enable row level security;
alter table public.email_recipients enable row level security;

-- Admin-only in both directions — matches the existing UI, which only
-- exposes Email entry points inside the Club Admin area.
drop policy if exists "Admins can manage email templates" on public.email_templates;
create policy "Admins can manage email templates"
  on public.email_templates for all using (public.is_admin());

drop policy if exists "Admins can manage emails" on public.emails;
create policy "Admins can manage emails"
  on public.emails for all using (public.is_admin());

drop policy if exists "Admins can manage email recipients" on public.email_recipients;
create policy "Admins can manage email recipients"
  on public.email_recipients for all using (public.is_admin());

drop trigger if exists set_updated_at on public.email_templates;
create trigger set_updated_at before update on public.email_templates
  for each row execute procedure public.set_updated_at();
