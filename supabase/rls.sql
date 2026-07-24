-- ============================================================
-- CoachPad — Row Level Security Policies
-- Run AFTER schema.sql in Supabase SQL Editor
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles           enable row level security;
alter table public.venues              enable row level security;
alter table public.courts              enable row level security;
alter table public.squads              enable row level security;
alter table public.teams               enable row level security;
alter table public.user_team_access    enable row level security;
alter table public.members             enable row level security;
alter table public.players             enable row level security;
alter table public.player_notes        enable row level security;
alter table public.training_allocations enable row level security;
alter table public.drills              enable row level security;
alter table public.drill_favorites     enable row level security;
alter table public.sessions            enable row level security;
alter table public.session_drills      enable row level security;
alter table public.attendance_records  enable row level security;
alter table public.club_challenges     enable row level security;
alter table public.challenge_results   enable row level security;
alter table public.games               enable row level security;
alter table public.club_settings       enable row level security;
alter table public.email_templates     enable row level security;
alter table public.emails              enable row level security;
alter table public.email_recipients    enable row level security;
alter table public.notifications       enable row level security;

-- ── Helper: is the current user an admin? ───────────────────
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;
revoke execute on function public.is_admin() from anon;

-- ── Helper: team IDs the current user can access ────────────
create or replace function public.accessible_team_ids()
returns setof uuid language sql security definer set search_path = '' as $$
  select team_id from public.user_team_access where user_id = auth.uid()
  union
  select id from public.teams where owner_id = auth.uid();
$$;
revoke execute on function public.accessible_team_ids() from anon;
revoke execute on function public.handle_new_user() from anon;

-- ============================================================
-- PROFILES
-- ============================================================
create policy "Users can read own profile"
  on public.profiles for select using (id = auth.uid());

create policy "Admins can read all profiles"
  on public.profiles for select using (public.is_admin());

create policy "Users can insert own profile"
  on public.profiles for insert with check (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update using (id = auth.uid());

create policy "Admins can update any profile"
  on public.profiles for update using (public.is_admin());

-- ── Prevent privilege escalation ────────────────────────────
-- The "update own profile" policy lets a user edit their own row, but it must
-- NOT let them grant themselves admin or un-suspend their account. RLS WITH CHECK
-- cannot compare against the OLD row, so we enforce it with a BEFORE UPDATE trigger.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Admins may change anything.
  if public.is_admin() then
    return new;
  end if;
  -- Non-admins may not change their role or account status.
  if new.role is distinct from old.role then
    raise exception 'Not authorized to change role';
  end if;
  if new.account_status is distinct from old.account_status then
    raise exception 'Not authorized to change account status';
  end if;
  return new;
end;
$$;
revoke execute on function public.prevent_profile_privilege_escalation() from anon;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute procedure public.prevent_profile_privilege_escalation();

-- ============================================================
-- VENUES + COURTS  (admin write, all authenticated read)
-- ============================================================
create policy "Authenticated users can view venues"
  on public.venues for select using (auth.uid() is not null);

create policy "Admins can manage venues"
  on public.venues for all using (public.is_admin());

create policy "Authenticated users can view courts"
  on public.courts for select using (auth.uid() is not null);

create policy "Admins can manage courts"
  on public.courts for all using (public.is_admin());

-- ============================================================
-- SQUADS  (admin write, all authenticated read)
-- ============================================================
create policy "Authenticated users can view squads"
  on public.squads for select using (auth.uid() is not null);

create policy "Admins can manage squads"
  on public.squads for all using (public.is_admin());

-- ============================================================
-- TEAMS
-- ============================================================
create policy "Users can view club teams or own teams"
  on public.teams for select using (
    visibility = 'Club' or owner_id = auth.uid() or public.is_admin()
  );

create policy "Admins can manage all teams"
  on public.teams for all using (public.is_admin());

create policy "Coaches can manage own private teams"
  on public.teams for all using (owner_id = auth.uid() and visibility = 'Private');

-- ============================================================
-- USER_TEAM_ACCESS
-- ============================================================
create policy "Users can view their own access records"
  on public.user_team_access for select using (user_id = auth.uid());

create policy "Admins can manage all access records"
  on public.user_team_access for all using (public.is_admin());

-- ============================================================
-- MEMBERS
-- ============================================================
create policy "Users can view club members on their teams"
  on public.members for select using (
    public.is_admin()
    or (visibility = 'Club' and team_id in (select public.accessible_team_ids()))
    or owner_id = auth.uid()
  );

create policy "Admins can manage all members"
  on public.members for all using (public.is_admin());

create policy "Coaches can manage own private members"
  on public.members for all using (owner_id = auth.uid() and visibility = 'Private');

-- ============================================================
-- PLAYERS
-- ============================================================
create policy "Users can view players on accessible teams"
  on public.players for select using (
    public.is_admin()
    or team_id in (select public.accessible_team_ids())
    or owner_id = auth.uid()
  );

create policy "Admins can manage all players"
  on public.players for all using (public.is_admin());

create policy "Coaches can create players on their teams"
  on public.players for insert with check (
    public.is_admin()
    or team_id in (select public.accessible_team_ids())
    or owner_id = auth.uid()
  );

create policy "Coaches can update players on their teams"
  on public.players for update using (
    public.is_admin()
    or team_id in (select public.accessible_team_ids())
    or owner_id = auth.uid()
  );

-- ============================================================
-- PLAYER NOTES
-- ============================================================
create policy "Users can view notes for accessible players"
  on public.player_notes for select using (
    public.is_admin()
    or author_id = auth.uid()
    or team_id in (select public.accessible_team_ids())
  );

create policy "Coaches can create and update own notes"
  on public.player_notes for all using (author_id = auth.uid());

create policy "Admins can manage all notes"
  on public.player_notes for all using (public.is_admin());

-- ============================================================
-- TRAINING ALLOCATIONS
-- ============================================================
-- Authenticated users may see allocations for club teams, squads (club-level),
-- or teams they have access to — but NOT other users' private-team schedules.
create policy "Users can view allocations for visible teams and squads"
  on public.training_allocations for select using (
    auth.uid() is not null and (
      public.is_admin()
      or squad_id is not null
      or team_id in (select id from public.teams where visibility = 'Club')
      or team_id in (select public.accessible_team_ids())
    )
  );

create policy "Admins can manage training allocations"
  on public.training_allocations for all using (public.is_admin());

-- ============================================================
-- DRILLS
-- ============================================================
-- Coaches only see Club drills assigned to their own teams (team_ids), not every Club drill.
-- Admins see every Club drill (to manage the library) but never another user's Private drills.
create policy "Users can view own drills, club drills on their teams, and templates"
  on public.drills for select using (
    owner_id = auth.uid()
    or visibility = 'Template'
    or (
      visibility = 'Club'
      and (
        public.is_admin()
        or exists (
          select 1 from public.user_team_access uta
          where uta.user_id = auth.uid()
          and coalesce(team_ids, '[]') like '%' || uta.team_id::text || '%'
        )
      )
    )
  );

create policy "Coaches can create drills"
  on public.drills for insert with check (auth.uid() is not null);

-- Coaches can only edit/delete their own Private drills; Club drills are admin-managed.
create policy "Owners and admins can update drills"
  on public.drills for update using (
    public.is_admin()
    or (owner_id = auth.uid() and visibility = 'Private')
  );

create policy "Owners and admins can delete drills"
  on public.drills for delete using (
    public.is_admin()
    or (owner_id = auth.uid() and visibility = 'Private')
  );

-- ============================================================
-- DRILL FAVORITES
-- ============================================================
create policy "Users manage own favorites"
  on public.drill_favorites for all using (user_id = auth.uid());

-- ============================================================
-- SESSIONS
-- ============================================================
create policy "Users can view own sessions and team sessions"
  on public.sessions for select using (
    owner_id = auth.uid()
    or team_id in (select public.accessible_team_ids())
    or public.is_admin()
  );

create policy "Coaches can create sessions"
  on public.sessions for insert with check (auth.uid() is not null);

create policy "Owners and admins can update sessions"
  on public.sessions for update using (owner_id = auth.uid() or public.is_admin());

create policy "Owners and admins can delete sessions"
  on public.sessions for delete using (owner_id = auth.uid() or public.is_admin());

-- ============================================================
-- SESSION DRILLS
-- ============================================================
create policy "Users can view session drills for accessible sessions"
  on public.session_drills for select using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
      and (s.owner_id = auth.uid() or s.team_id in (select public.accessible_team_ids()) or public.is_admin())
    )
  );

create policy "Coaches can manage session drills for own sessions"
  on public.session_drills for all using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and (s.owner_id = auth.uid() or public.is_admin())
    )
  );

-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================
create policy "Users can view attendance for accessible teams"
  on public.attendance_records for select using (
    public.is_admin()
    or coach_id = auth.uid()
    or team_id in (select public.accessible_team_ids())
  );

create policy "Coaches can create and update attendance for their sessions"
  on public.attendance_records for all using (
    public.is_admin()
    or coach_id = auth.uid()
    or exists (
      select 1 from public.sessions s
      where s.id = session_id and (s.owner_id = auth.uid() or s.team_id in (select public.accessible_team_ids()))
    )
  );

-- ============================================================
-- CLUB CHALLENGES
-- ============================================================
create policy "Authenticated users can view active challenges"
  on public.club_challenges for select using (
    auth.uid() is not null
    and (status != 'Draft' or public.is_admin() or created_by = auth.uid())
  );

create policy "Admins can manage all challenges"
  on public.club_challenges for all using (public.is_admin());

-- ============================================================
-- CHALLENGE RESULTS
-- ============================================================
create policy "Coaches can view and manage own challenge results"
  on public.challenge_results for all using (
    coach_id = auth.uid()
    or public.is_admin()
    or team_id in (select public.accessible_team_ids())
  );

-- ============================================================
-- GAMES
-- ============================================================
create policy "Users can view games for accessible teams"
  on public.games for select using (
    owner_id = auth.uid()
    or team_id in (select public.accessible_team_ids())
    or public.is_admin()
  );

create policy "Coaches can manage own games"
  on public.games for all using (owner_id = auth.uid() or public.is_admin());

-- ============================================================
-- CLUB SETTINGS  (shared "current season" — admin write, all authenticated read)
-- ============================================================
create policy "Authenticated users can view club settings"
  on public.club_settings for select using (auth.uid() is not null);

create policy "Admins can manage club settings"
  on public.club_settings for all using (public.is_admin());

-- ============================================================
-- EMAIL FEATURE  (admin-only — matches the existing UI, which only exposes
-- Email entry points inside the Club Admin area)
-- ============================================================
create policy "Admins can manage email templates"
  on public.email_templates for all using (public.is_admin());

create policy "Admins can manage emails"
  on public.emails for all using (public.is_admin());

create policy "Admins can manage email recipients"
  on public.email_recipients for all using (public.is_admin());

-- ============================================================
-- NOTIFICATIONS  (each user reads/marks-read only their own — inserts come
-- from the notify-session-change Edge Function via the service role key)
-- ============================================================
create policy "Users can view own notifications"
  on public.notifications for select using (recipient_id = auth.uid());

create policy "Users can mark own notifications read"
  on public.notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
