-- ============================================================
-- CoachPad — RLS for evaluation tables
-- Run AFTER rls.sql in the Supabase SQL Editor.
--
-- These tables (player_evaluations, team_evaluations, coach_evaluations,
-- evaluation_sessions) are used by the Development Hub but were NOT defined
-- in schema.sql. If they were created without RLS, ANY authenticated user can
-- read/write every evaluation — a serious privacy breach. This script enables
-- RLS and locks access down. It is guarded with to_regclass() so it is safe to
-- run even if a given table does not exist yet.
-- ============================================================

-- ── Helper: is the current user an evaluator (admin / JDO / DOC)? ──
create or replace function public.is_evaluator()
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'jdo', 'doc')
  );
$$;
revoke execute on function public.is_evaluator() from anon;

do $$
declare
  t text;
  eval_tables text[] := array['player_evaluations', 'team_evaluations', 'coach_evaluations', 'evaluation_sessions'];
begin
  foreach t in array eval_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'Skipping %, table does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Drop existing policies (idempotent re-run)
    execute format('drop policy if exists "evaluators and observers can read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "evaluators and observers can write %1$s" on public.%1$I', t);

    -- Read: admins/evaluators, and the observer who recorded it.
    execute format($f$
      create policy "evaluators and observers can read %1$s"
        on public.%1$I for select using (
          public.is_evaluator() or observer_id = auth.uid()
        )
    $f$, t);

    -- Write (insert/update/delete): admins/evaluators, and the observer who owns the record.
    execute format($f$
      create policy "evaluators and observers can write %1$s"
        on public.%1$I for all using (
          public.is_evaluator() or observer_id = auth.uid()
        ) with check (
          public.is_evaluator() or observer_id = auth.uid()
        )
    $f$, t);
  end loop;

  -- Additionally: a coach may read their OWN coach evaluation (coach_id = their profile id).
  if to_regclass('public.coach_evaluations') is not null then
    drop policy if exists "coaches can read own coach evaluations" on public.coach_evaluations;
    create policy "coaches can read own coach evaluations"
      on public.coach_evaluations for select using (coach_id = auth.uid());
  end if;
end $$;
