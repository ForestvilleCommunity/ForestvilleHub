-- ============================================================
-- Add notifications table (session change alerts: email + in-app)
-- Run in Supabase SQL Editor
-- ============================================================
-- Rows are written by the notify-session-change Edge Function using the
-- service role key (bypasses RLS below). Authenticated users can only ever
-- read/mark-read their own notifications.

create table if not exists public.notifications (
  id           uuid primary key default uuid_generate_v4(),
  recipient_id uuid references public.profiles(id) not null,
  session_id   uuid references public.sessions(id) on delete cascade,
  type         text not null,
  message      text not null,
  is_read      boolean not null default false,
  email_sent   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, is_read);

-- New tables aren't automatically covered by Supabase's default role grants —
-- without this, every query 403s with "permission denied for table notifications"
-- even though RLS policies below are correct. RLS still governs which rows are
-- visible/writable; this just allows the authenticated role to query the table at all.
grant select, update on public.notifications to authenticated;

alter table public.notifications enable row level security;

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
  on public.notifications for select using (recipient_id = auth.uid());

drop policy if exists "Users can mark own notifications read" on public.notifications;
create policy "Users can mark own notifications read"
  on public.notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
