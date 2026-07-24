-- ============================================================
-- Add push_subscriptions table (Web Push — real device notifications
-- even when the app/browser tab is closed)
-- Run in Supabase SQL Editor
-- ============================================================
-- Each row is one browser/device's push subscription. A coach can have
-- several (phone + laptop). Written directly by the client (coach opts in),
-- read by the notify-session-change Edge Function using the service role key.

create table if not exists public.push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id) not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- New tables aren't automatically covered by Supabase's default role grants —
-- without this, every query 403s with "permission denied for table push_subscriptions"
-- even though RLS policies below are correct. RLS still governs which rows are
-- visible/writable; this just allows the authenticated role to query the table at all.
grant select, insert, delete on public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
