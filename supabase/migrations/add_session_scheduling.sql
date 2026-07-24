-- ============================================================
-- Add venue/court/start_time to sessions + lat/long to venues
-- Run in Supabase SQL Editor
-- ============================================================
-- Lets a session carry its own venue/court/start time (auto-suggested from
-- training_allocations at creation time, but editable per-session), so the
-- coach home view and the session-change notifier can both read them
-- directly off sessions instead of re-deriving from the weekly schedule.

alter table public.venues add column if not exists latitude numeric;
alter table public.venues add column if not exists longitude numeric;

alter table public.sessions add column if not exists venue_id uuid references public.venues(id) on delete set null;
alter table public.sessions add column if not exists court_id uuid references public.courts(id) on delete set null;
alter table public.sessions add column if not exists start_time time;
