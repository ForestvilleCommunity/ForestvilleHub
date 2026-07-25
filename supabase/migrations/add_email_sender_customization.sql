-- Lets a compose sending admin customise how an email appears to recipients:
-- from_name changes the display name (the underlying address stays whatever
-- RESEND_FROM_EMAIL/the verified Resend domain is — Resend requires the
-- sending address itself to be on a verified domain, that can't change per
-- admin without verifying a new domain per admin). reply_to can be ANY real
-- address (e.g. the admin's own personal inbox), since replies aren't
-- restricted the way the From address is.
alter table public.emails add column if not exists from_name text;
alter table public.emails add column if not exists reply_to text;
