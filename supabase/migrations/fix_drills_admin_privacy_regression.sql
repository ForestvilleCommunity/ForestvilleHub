-- ============================================================
-- URGENT: fix a privacy regression introduced by fix_drills_rls.sql
-- Run in Supabase SQL Editor immediately
-- ============================================================
-- fix_drills_rls.sql (run earlier this session) accidentally placed
-- `public.is_admin()` as a standalone OR condition, which let admins see
-- EVERY drill regardless of visibility — including other coaches' Private
-- drills. This restores the intended behavior: admins see every Club drill
-- (to manage the library) but never anyone's Private drills.

drop policy if exists "Users can view own drills, club drills on their teams, and templates" on public.drills;

create policy "Users can view own drills, club drills on their teams, and templates"
  on public.drills for select using (
    owner_id = auth.uid()
    or visibility = 'Template'
    or (
      visibility = 'Club'
      and (
        public.is_admin()
        or exists (
          select 1 from public.user_team_access uta
          where uta.user_id = auth.uid()
          and coalesce(team_ids, '[]') like '%' || uta.team_id::text || '%'
        )
      )
    )
  );
