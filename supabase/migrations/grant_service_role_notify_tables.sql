-- This project revokes default Postgres role privileges broadly (same
-- reason club_settings needed an explicit grant earlier) — and it looks
-- like `service_role` itself never got one either, which is why the
-- notify-*-change Edge Functions (which always connect as service_role,
-- bypassing RLS by design) were hitting "permission denied for table
-- squads" instead of actually reading it. service_role is never exposed
-- to end users — it's safe and correct for it to have full access here.
grant all on public.venues                to service_role;
grant all on public.courts                to service_role;
grant all on public.teams                 to service_role;
grant all on public.squads                to service_role;
grant all on public.user_team_access      to service_role;
grant all on public.profiles              to service_role;
grant all on public.notifications         to service_role;
grant all on public.push_subscriptions    to service_role;
grant all on public.sessions              to service_role;
grant all on public.training_allocations  to service_role;
