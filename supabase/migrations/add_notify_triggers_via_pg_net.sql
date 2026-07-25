-- The Supabase dashboard's old point-and-click "Database Webhooks" UI isn't
-- available in this project (its trigger-creation UI only lists plain
-- Postgres functions, not HTTP/Edge-Function actions). This recreates the
-- same behavior directly: a trigger function that fires an async HTTP POST
-- to the Edge Function via pg_net, matching the exact payload shape
-- (type/table/record/old_record) both notify-*-change functions expect.
--
-- Replace <ANON_KEY> below with your VITE_SUPABASE_ANON_KEY value (same one
-- already in your .env — it's meant to be public, safe to use here).
--
-- Replace <WEBHOOK_SECRET> with the SAME value set as the WEBHOOK_SECRET
-- secret on both notify-session-change and notify-schedule-change. This one
-- is NOT safe to commit — it's what stops anyone from POSTing fake payloads
-- straight to those functions to spam real coaches with fake notifications/
-- emails. Keep the real value out of version control; paste it only when
-- running this in the SQL Editor.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_edge_function()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text;
  payload jsonb;
begin
  fn_url := case tg_table_name
    when 'sessions' then 'https://crmyspiuzngpwfvdrbaj.supabase.co/functions/v1/notify-session-change'
    when 'training_allocations' then 'https://crmyspiuzngpwfvdrbaj.supabase.co/functions/v1/notify-schedule-change'
  end;

  payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'record', case when tg_op <> 'DELETE' then to_jsonb(new) else null end,
    'old_record', case when tg_op <> 'INSERT' then to_jsonb(old) else null end
  );

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-webhook-secret', '<WEBHOOK_SECRET>'
    ),
    body := payload
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists notify_session_change_trigger on public.sessions;
create trigger notify_session_change_trigger
  after update on public.sessions
  for each row execute function public.notify_edge_function();

drop trigger if exists notify_schedule_change_trigger on public.training_allocations;
create trigger notify_schedule_change_trigger
  after insert or update or delete on public.training_allocations
  for each row execute function public.notify_edge_function();
