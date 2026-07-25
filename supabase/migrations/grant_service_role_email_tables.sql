-- Same root cause as grant_service_role_notify_tables.sql: these tables only
-- had `grant ... to authenticated` from Phase 1, never to `service_role`.
-- The send-email Edge Function always connects as service_role (bypassing
-- RLS by design), so without this it can't read the very row it was just
-- told to send — it surfaced as a misleading "Email not found" 404 instead
-- of the real "permission denied for table emails".
grant all on public.email_templates  to service_role;
grant all on public.emails           to service_role;
grant all on public.email_recipients to service_role;
