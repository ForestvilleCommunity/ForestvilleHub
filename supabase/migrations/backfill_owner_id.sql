-- Backfill owner_id on sessions and drills where it is missing
-- by matching owner_user_email against auth.users.email
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Sessions
UPDATE public.sessions s
SET owner_id = u.id
FROM auth.users u
WHERE s.owner_id IS NULL
  AND s.owner_user_email = u.email;

-- Drills
UPDATE public.drills d
SET owner_id = u.id
FROM auth.users u
WHERE d.owner_id IS NULL
  AND d.owner_user_email = u.email;
