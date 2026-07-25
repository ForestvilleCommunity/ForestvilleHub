-- One-off "move this occurrence to a different venue" — reuses the existing
-- pause_start/pause_end date range to scope which date(s) it applies to.
-- Presence of override_venue_id distinguishes "moved" from "cancelled"
-- (pause_start/pause_end set with no override = cancelled, same as before).
alter table public.training_allocations add column if not exists override_venue_id uuid references public.venues(id) on delete set null;
alter table public.training_allocations add column if not exists override_court_id uuid references public.courts(id) on delete set null;
