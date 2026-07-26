-- Two RLS tightenings found in a July 2026 follow-up gap scan.

-- 1) drills UPDATE/DELETE: the earlier privacy-regression fix
-- (fix_drills_admin_privacy_regression.sql) only corrected the SELECT policy.
-- The write policies still had is_admin() OR'd at the top level, unscoped by
-- visibility, so an admin could edit or delete any coach's Private drill.
drop policy if exists "Owners and admins can update drills" on public.drills;
create policy "Owners and admins can update drills"
  on public.drills for update using (
    (owner_id = auth.uid() and visibility = 'Private')
    or (public.is_admin() and visibility in ('Club', 'Template'))
  );

drop policy if exists "Owners and admins can delete drills" on public.drills;
create policy "Owners and admins can delete drills"
  on public.drills for delete using (
    (owner_id = auth.uid() and visibility = 'Private')
    or (public.is_admin() and visibility in ('Club', 'Template'))
  );

-- 2) squads SELECT ignored squads.visibility entirely — every authenticated
-- user could read every squad regardless of Private/Club. Latent only (no
-- coach-facing flow currently creates a Private squad), tightened for
-- consistency with teams/drills.
drop policy if exists "Authenticated users can view squads" on public.squads;
create policy "Authenticated users can view squads"
  on public.squads for select using (
    visibility = 'Club' or public.is_admin() or created_by = auth.uid()
  );
