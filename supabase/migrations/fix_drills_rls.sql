-- ============================================================
-- Fix drills RLS policies
-- Run in Supabase SQL Editor
-- ============================================================

-- 0. Safety net: team_ids / owner_user_email are used by the app (AdminDrillsTab,
--    DrillLibrary, drillAccess.js) but were missing from schema.sql — add them if
--    they don't already exist on the live table.
alter table public.drills add column if not exists team_ids text default '[]';
alter table public.drills add column if not exists owner_user_email text;

-- 1. Fix SELECT: coaches should only see Club drills assigned to their specific teams
--    (old policy let any coach with ANY team access see ALL Club drills)
drop policy if exists "Users can view own drills, club drills on their teams, and templates" on public.drills;

create policy "Users can view own drills, club drills on their teams, and templates"
  on public.drills for select using (
    owner_id = auth.uid()
    or visibility = 'Template'
    or public.is_admin()
    or (
      visibility = 'Club'
      and exists (
        select 1 from public.user_team_access uta
        where uta.user_id = auth.uid()
        and coalesce(team_ids, '[]') like '%' || uta.team_id::text || '%'
      )
    )
  );

-- 2. Fix UPDATE: coaches can only update their own Private drills, not Club drills
drop policy if exists "Owners and admins can update drills" on public.drills;

create policy "Owners and admins can update drills"
  on public.drills for update using (
    public.is_admin()
    or (owner_id = auth.uid() and visibility = 'Private')
  );

-- 3. Fix DELETE: coaches can only delete their own Private drills, not Club drills
drop policy if exists "Owners and admins can delete drills" on public.drills;

create policy "Owners and admins can delete drills"
  on public.drills for delete using (
    public.is_admin()
    or (owner_id = auth.uid() and visibility = 'Private')
  );

-- 4. Backfill any admin-created Club drills still missing owner_id
--    (captures drills created from AdminDrillsTab before this fix)
update public.drills d
set owner_id = u.id
from auth.users u
where d.owner_id is null
  and d.visibility = 'Club'
  and d.owner_user_email = u.email;
