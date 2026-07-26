-- ============================================================
-- CoachPad / HoopCoach — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor (project: crmyspiuzngpwfvdrbaj)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS / AUTH
-- Supabase Auth handles the auth.users table automatically.
-- We extend it with a public profiles table.
-- ============================================================

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text unique not null,
  full_name    text,
  role         text not null default 'coach' check (role in ('admin', 'coach', 'jdo', 'doc')),
  account_status text not null default 'Active' check (account_status in ('Active', 'Suspended', 'Pending Deletion')),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- VENUES + COURTS
-- ============================================================

create table public.venues (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  address     text,
  suburb      text,
  latitude    numeric,
  longitude   numeric,
  notes       text,
  status      text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.courts (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  name        text not null,
  court_type  text,
  notes       text,
  status      text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- SQUADS + TEAMS
-- ============================================================

create table public.squads (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  age_group    text,
  gender       text,
  program_type text,
  season       text,
  team_ids     text default '[]',
  visibility   text not null default 'Club' check (visibility in ('Club', 'Private')),
  owner_user_email text,
  status       text not null default 'Active' check (status in ('Active', 'Archived')),
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.teams (
  id           uuid primary key default uuid_generate_v4(),
  team_name    text not null,
  age_group    text,
  gender       text,
  program_type text,
  season       text,
  squad_id     uuid references public.squads(id) on delete set null,
  visibility   text not null default 'Club' check (visibility in ('Club', 'Private')),
  status       text not null default 'Active' check (status in ('Active', 'Inactive', 'Archived')),
  owner_id          uuid references auth.users(id),
  owner_user_email  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Coach ↔ Team bridge
create table public.user_team_access (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  user_email        text,
  team_id           uuid not null references public.teams(id) on delete cascade,
  role              text not null default 'coach',
  can_edit          boolean not null default true,
  assigned_by_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (user_id, team_id)
);

-- ============================================================
-- MEMBERS + PLAYERS
-- ============================================================

create table public.members (
  id                      uuid primary key default uuid_generate_v4(),
  name                    text not null,
  date_of_birth           date,
  gender                  text,
  email                   text,
  phone                   text,
  address                 text,
  team_id                 uuid references public.teams(id) on delete set null,
  position                text,
  jersey_number           integer,
  uniform_number          integer,
  parent_name             text,
  parent_phone            text,
  parent_email            text,
  secondary_contact_name  text,
  school                  text,
  medical_conditions      text,
  medication              text,
  other_conditions        text,
  notes                   text,
  status                  text not null default 'Active' check (status in ('Active', 'Inactive', 'Archived')),
  visibility              text not null default 'Club' check (visibility in ('Club', 'Private')),
  owner_id                uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.players (
  id             uuid primary key default uuid_generate_v4(),
  member_id      uuid references public.members(id) on delete set null,
  team_id        uuid not null references public.teams(id) on delete cascade,
  name           text not null,
  jersey_number  integer,
  position       text,
  date_of_birth  date,
  injury_status  text not null default 'Healthy' check (injury_status in ('Healthy', 'Injured', 'Unavailable')),
  status         text not null default 'Active' check (status in ('Active', 'Inactive')),
  visibility     text not null default 'Club' check (visibility in ('Club', 'Private')),
  owner_id       uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (member_id, team_id)  -- prevents duplicate player records per member+team
);

create table public.player_notes (
  id         uuid primary key default uuid_generate_v4(),
  player_id  uuid references public.players(id) on delete cascade,
  member_id  uuid references public.members(id) on delete cascade,
  team_id    uuid references public.teams(id) on delete set null,
  author_id  uuid references auth.users(id),
  note_type  text default 'General',
  content    text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TRAINING ALLOCATIONS
-- ============================================================

create table public.training_allocations (
  id           uuid primary key default uuid_generate_v4(),
  team_id      uuid references public.teams(id) on delete cascade,
  squad_id     uuid references public.squads(id) on delete cascade,
  venue_id     uuid references public.venues(id) on delete set null,
  court_id     uuid references public.courts(id) on delete set null,
  day_of_week  text,
  start_time   time,
  end_time     time,
  notes        text,
  status       text not null default 'Active' check (status in ('Active', 'Inactive')),
  pause_start  date,
  pause_end    date,
  pending_note text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  check (team_id is not null or squad_id is not null)
);

-- ============================================================
-- DRILLS + FAVORITES
-- ============================================================

create table public.drills (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  item_type        text not null default 'Drill' check (item_type in ('Drill', 'Play')),
  description      text,
  coaching_points  text,
  theme            text,
  duration_minutes integer,
  min_players      integer,
  max_players      integer,
  difficulty_level integer check (difficulty_level between 1 and 3),
  visibility       text not null default 'Private' check (visibility in ('Private', 'Club', 'Template')),
  status           text not null default 'Active' check (status in ('Active', 'Draft', 'Archived')),
  image_url        text,
  extra_images     jsonb default '[]',
  drawing_data     jsonb default '[]',
  team_ids         text default '[]',
  owner_id         uuid references auth.users(id),
  owner_user_email text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.drill_favorites (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  drill_id   uuid not null references public.drills(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, drill_id)
);

-- ============================================================
-- SESSIONS + SESSION DRILLS
-- ============================================================

create table public.sessions (
  id                  uuid primary key default uuid_generate_v4(),
  session_name        text not null,
  session_type        text not null default 'Team' check (session_type in ('Team', 'Private')),
  team_id             uuid references public.teams(id) on delete set null,
  owner_id            uuid references auth.users(id),
  date                date,
  start_time          time,
  venue_id            uuid references public.venues(id) on delete set null,
  court_id            uuid references public.courts(id) on delete set null,
  duration_minutes    integer,
  status              text not null default 'Planned' check (status in ('Planned', 'In Progress', 'Completed', 'Cancelled')),
  focus_target        text,
  focus_category      text,
  focus_outcome       text,
  opponent_name       text,
  opponent_strategy   text,
  counter_strategies  text,
  notes               text,
  player_ids          jsonb default '[]',
  session_blocks      jsonb default '[]',
  owner_user_email    text,
  level               text,
  season_name         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.session_drills (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references public.sessions(id) on delete cascade,
  drill_id      uuid not null references public.drills(id) on delete restrict,
  block_id      text,
  "order"       integer not null default 0,
  duration      integer,
  status        text not null default 'Pending' check (status in ('Pending', 'Completed', 'Skipped')),
  goal_type     text,
  goal_target   text,
  goal_result   text,
  session_notes text,
  challenge_id  uuid,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- ATTENDANCE
-- ============================================================

create table public.attendance_records (
  id               uuid primary key default uuid_generate_v4(),
  session_id       uuid not null references public.sessions(id) on delete cascade,
  team_id          uuid references public.teams(id) on delete set null,
  player_id        uuid references public.players(id) on delete set null,
  member_id        uuid references public.members(id) on delete set null,
  coach_id         uuid references auth.users(id),
  status           text not null default 'Present' check (status in ('Present', 'Absent', 'Late', 'Injured', 'Excused')),
  date             date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (session_id, player_id)  -- prevents duplicate attendance per player per session
);

-- ============================================================
-- CHALLENGES + RESULTS
-- ============================================================

create table public.club_challenges (
  id                   uuid primary key default uuid_generate_v4(),
  title                text not null,
  description          text,
  challenge_type       text,
  focus_category       text,
  drill_id             uuid references public.drills(id) on delete set null,
  goal_type            text,
  goal_target          text,
  assigned_team_ids    jsonb default '[]',
  assigned_squad_ids   jsonb default '[]',
  start_date           date,
  end_date             date,
  status               text not null default 'Draft' check (status in ('Draft', 'Active', 'Completed', 'Archived')),
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.challenge_results (
  id               uuid primary key default uuid_generate_v4(),
  challenge_id     uuid not null references public.club_challenges(id) on delete cascade,
  session_id       uuid references public.sessions(id) on delete set null,
  session_drill_id uuid references public.session_drills(id) on delete set null,
  drill_id         uuid references public.drills(id) on delete set null,
  team_id          uuid references public.teams(id) on delete set null,
  coach_id         uuid references auth.users(id),
  goal_type        text,
  target_value     text,
  result_value     text,
  notes            text,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- GAMES
-- ============================================================

create table public.games (
  id                  uuid primary key default uuid_generate_v4(),
  team_id             uuid references public.teams(id) on delete cascade,
  owner_id            uuid references auth.users(id),
  game_date           date,
  opponent            text,
  location            text,
  our_score           integer,
  opponent_score      integer,
  result              text check (result in ('Win', 'Loss', 'Draw', 'TBD')),
  player_availability jsonb default '[]',
  starting_five       jsonb default '[]',
  notes               text,
  status              text not null default 'Planned' check (status in ('Planned', 'In Progress', 'Completed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index on public.members (team_id);
create index on public.members (status);
create index on public.players (team_id);
create index on public.players (member_id);
create index on public.players (owner_id);
create index on public.sessions (team_id);
create index on public.sessions (owner_id);
create index on public.sessions (date desc);
create index on public.session_drills (session_id);
create index on public.attendance_records (session_id);
create index on public.attendance_records (player_id);
create index on public.attendance_records (member_id);
create index on public.attendance_records (date desc);
create index on public.challenge_results (challenge_id);
create index on public.challenge_results (team_id);
create index on public.user_team_access (user_id);
create index on public.user_team_access (team_id);
create index on public.drills (owner_id);
create index on public.drills (visibility);
create index on public.training_allocations (team_id);
create index on public.training_allocations (squad_id);
create index on public.training_allocations (venue_id);

-- ============================================================
-- CLUB SETTINGS
-- Single shared row so "current season" is the same for every coach,
-- instead of living separately in each browser's localStorage.
-- ============================================================

create table public.club_settings (
  id                         uuid primary key default uuid_generate_v4(),
  current_season_name       text not null default '2025-2026',
  current_season_start_date date not null default '2025-01-01',
  booking_window_days       integer,
  updated_by                uuid references auth.users(id),
  updated_at                timestamptz not null default now()
);
-- Tables aren't automatically covered by Supabase's default role grants — without
-- this every query 403s regardless of RLS policies. RLS still governs row access.
grant select, insert, update, delete on public.club_settings to authenticated;

-- ============================================================
-- EMAIL FEATURE — templates, send log, per-recipient delivery log
-- ============================================================

create table public.email_templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  subject     text not null,
  body        text not null,
  audience    text not null check (audience in ('members', 'coaches')),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Subject/body are snapshotted here so editing/deleting a template later
-- never changes what a historical send log shows.
create table public.emails (
  id               uuid primary key default uuid_generate_v4(),
  template_id      uuid references public.email_templates(id) on delete set null,
  subject          text not null,
  body             text not null,
  audience         text not null check (audience in ('members', 'coaches')),
  target_type      text not null check (target_type in ('all', 'role', 'team', 'squad', 'individual')),
  target_ids       jsonb not null default '[]',
  recipient_count  integer not null default 0,
  status           text not null default 'Draft' check (status in ('Draft', 'Sending', 'Sent', 'Failed', 'Partial')),
  sent_by          uuid references auth.users(id),
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  -- "Send as yourself" customization — from_name changes the display name,
  -- reply_to can be any address (see add_email_sender_customization.sql).
  from_name        text,
  reply_to         text
);

-- recipient_name/recipient_email are snapshotted — if a parent's email
-- changes later, the historical log still shows what was actually used.
create table public.email_recipients (
  id                 uuid primary key default uuid_generate_v4(),
  email_id           uuid not null references public.emails(id) on delete cascade,
  member_id          uuid references public.members(id) on delete set null,
  profile_id         uuid references public.profiles(id) on delete set null,
  recipient_name     text not null,
  recipient_email    text not null,
  status             text not null default 'Pending' check (status in ('Pending', 'Sent', 'Failed', 'Bounced')),
  provider_message_id text,
  error_message      text,
  sent_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index on public.email_recipients (email_id);
create index on public.emails (status);

grant select, insert, update, delete on public.email_templates to authenticated;
grant select, insert, update, delete on public.emails to authenticated;
grant select, insert, update, delete on public.email_recipients to authenticated;

-- The send-email Edge Function connects as service_role (bypasses RLS by
-- design) — without this grant it can't even read the row it was told to
-- send, surfacing as a misleading "Email not found" 404 instead of the real
-- "permission denied for table emails" (see grant_service_role_email_tables.sql).
grant all on public.email_templates  to service_role;
grant all on public.emails           to service_role;
grant all on public.email_recipients to service_role;

-- ============================================================
-- NOTIFICATIONS
-- Written by the notify-session-change Edge Function (service role,
-- bypasses RLS). Authenticated users only ever read/mark-read their own.
-- ============================================================

create table public.notifications (
  id           uuid primary key default uuid_generate_v4(),
  recipient_id uuid references public.profiles(id) not null,
  session_id   uuid references public.sessions(id) on delete cascade,
  type         text not null,
  message      text not null,
  is_read      boolean not null default false,
  email_sent   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index on public.notifications (recipient_id, is_read);

grant select, update on public.notifications to authenticated;

-- ============================================================
-- PUSH SUBSCRIPTIONS
-- One row per browser/device a coach has opted into Web Push on. Written
-- directly by the client; read by the notify-session-change Edge Function
-- (service role) to actually deliver the push.
-- ============================================================

create table public.push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id) not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index on public.push_subscriptions (user_id);

grant select, insert, delete on public.push_subscriptions to authenticated;

-- ============================================================
-- updated_at auto-update trigger
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles       for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.venues         for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.squads         for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.teams          for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.members        for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.players        for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.drills         for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.sessions       for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.attendance_records for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.club_challenges for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.club_settings  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.email_templates for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.games          for each row execute procedure public.set_updated_at();
