-- ============================================================
-- Add booking_window_days to club_settings
-- Run in Supabase SQL Editor
-- ============================================================
-- Club-wide cap on how far ahead a coach can create a session that claims
-- a venue/court, so one team can't lock out a court for the whole season.
-- Null = no limit. Admins are exempt (they already control the recurring
-- weekly schedule directly via training_allocations).

alter table public.club_settings add column if not exists booking_window_days integer;
