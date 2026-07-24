-- ============================================================
-- Add club_settings table — shared "current season" for all coaches
-- Run in Supabase SQL Editor
-- ============================================================
-- Previously the "current season" (used to tag new sessions/games and to
-- compute age groups) lived only in each browser's localStorage. Running
-- Season Rollover on one device never updated any other coach's device,
-- so different coaches could end up tagging the same real-world season
-- with different names. This table gives every coach one shared source
-- of truth.

create table if not exists public.club_settings (
  id                         uuid primary key default uuid_generate_v4(),
  current_season_name       text not null default '2025-2026',
  current_season_start_date date not null default '2025-01-01',
  updated_by                uuid references auth.users(id),
  updated_at                timestamptz not null default now()
);

-- Seed the single settings row if the table is empty
insert into public.club_settings (current_season_name, current_season_start_date)
select '2025-2026', '2025-01-01'
where not exists (select 1 from public.club_settings);

-- New tables aren't automatically covered by Supabase's default role grants —
-- without this, every query 403s with "permission denied for table club_settings"
-- even though RLS policies below are correct. RLS still governs which rows are
-- visible/writable; this just allows the authenticated role to query the table at all.
grant select, insert, update, delete on public.club_settings to authenticated;

alter table public.club_settings enable row level security;

drop policy if exists "Authenticated users can view club settings" on public.club_settings;
create policy "Authenticated users can view club settings"
  on public.club_settings for select using (auth.uid() is not null);

drop policy if exists "Admins can manage club settings" on public.club_settings;
create policy "Admins can manage club settings"
  on public.club_settings for all using (public.is_admin());

drop trigger if exists set_updated_at on public.club_settings;
create trigger set_updated_at before update on public.club_settings
  for each row execute procedure public.set_updated_at();
