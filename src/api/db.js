/**
 * CoachPad data client — a thin, ergonomic wrapper over Supabase.
 * Exposes the `db` object used throughout the app.
 *
 * Entity API surface:
 *   Entity.list(sortExpr?, limit?)         → all rows
 *   Entity.filter(where, sortExpr?, limit?) → filtered rows
 *   Entity.get(id)                          → single row (throws on not-found)
 *   Entity.create(data)                     → inserted row
 *   Entity.update(id, data)                 → updated row
 *   Entity.delete(id)                       → void
 *
 * sortExpr: '-field' = descending, 'field' = ascending
 */

import { supabase } from './supabaseClient';

// ── helpers ────────────────────────────────────────────────────────────────

// Legacy data used 'created_date' / 'updated_date'; Supabase schema uses 'created_at' / 'updated_at'
const COLUMN_MAP = {
  created_date: 'created_at',
  updated_date: 'updated_at',
};

function parseSort(sortExpr) {
  if (!sortExpr) return null;
  const descending = sortExpr.startsWith('-');
  const raw = descending ? sortExpr.slice(1) : sortExpr;
  const column = COLUMN_MAP[raw] || raw;
  return { column, ascending: !descending };
}

function applySort(query, sortExpr) {
  if (!sortExpr) return query;
  const { column, ascending } = parseSort(sortExpr);
  return query.order(column, { ascending });
}

function applyLimit(query, limit) {
  if (!limit) return query;
  return query.limit(limit);
}

function applyFilter(query, where) {
  if (!where) return query;
  for (const [rawKey, value] of Object.entries(where)) {
    const key = COLUMN_MAP[rawKey] || rawKey;
    if (Array.isArray(value)) {
      query = query.in(key, value);
    } else if (value === null) {
      query = query.is(key, null);
    } else {
      query = query.eq(key, value);
    }
  }
  return query;
}

async function throwOnError({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ── email → uuid lookup (for user_team_access assignments) ────────────────

async function resolveUserIdFromEmail(email) {
  if (!email) return null;
  const { data } = await supabase.from('profiles').select('id').eq('email', email).single();
  return data?.id || null;
}

// Enrich payload: if user_email present but user_id missing, look up the UUID.
// If owner_user_email present but owner_id missing, look up the UUID.
async function enrichPayload(table, payload) {
  const p = { ...payload };
  if (table === 'user_team_access' && p.user_email && !p.user_id) {
    p.user_id = await resolveUserIdFromEmail(p.user_email);
  }
  return p;
}

// ── entity factory ─────────────────────────────────────────────────────────

function makeEntity(table) {
  return {
    async list(sortExpr, limit) {
      let q = supabase.from(table).select('*');
      q = applySort(q, sortExpr);
      q = applyLimit(q, limit);
      return throwOnError(await q);
    },

    async filter(where, sortExpr, limit) {
      let q = supabase.from(table).select('*');
      q = applyFilter(q, where);
      q = applySort(q, sortExpr);
      q = applyLimit(q, limit);
      return throwOnError(await q);
    },

    async filterAll(where, sortExpr) {
      const PAGE = 1000;
      let from = 0;
      const all = [];
      while (true) {
        let q = supabase.from(table).select('*').range(from, from + PAGE - 1);
        q = applyFilter(q, where);
        q = applySort(q, sortExpr);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },

    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      return data;
    },

    async create(payload) {
      const enriched = await enrichPayload(table, payload);
      const { data, error } = await supabase.from(table).insert(enriched).select().single();
      if (error) throw new Error(error.message);
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async createMany(payloads) {
      if (!payloads.length) return [];
      const { data, error } = await supabase.from(table).insert(payloads).select();
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

// ── auth shim ──────────────────────────────────────────────────────────────
// db.auth.me() was called in a few places to get the current user.
// We return the profile row merged with the auth user, matching the shape
// the app expects: { id, email, full_name, role, account_status }

const auth = {
  async logout() {
    await supabase.auth.signOut();
  },

  async me() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Not authenticated');

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.user_metadata?.full_name || '',
      role: profile?.role || 'coach',
      account_status: profile?.account_status || 'Active',
      ...profile,
    };
  },
};

// ── integrations shim ───────────────────────────────────────────────────────
// The app calls db.integrations.Core.UploadFile. We provide a drop-in that
// returns a base64 data URL so image features work without a configured Supabase
// Storage bucket. For production, swap this to supabase.storage.from(bucket).upload().

const integrations = {
  Core: {
    async UploadFile({ file }) {
      if (!file) throw new Error('No file provided');
      const file_url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      return { file_url };
    },
  },
};

// ── entity name → table mapping ────────────────────────────────────────────
// Entity names (PascalCase) → Supabase table names (snake_case)

export const db = {
  auth,
  integrations,
  entities: {
    Member:             makeEntity('members'),
    Player:             makeEntity('players'),
    Team:               makeEntity('teams'),
    Squad:              makeEntity('squads'),
    UserTeamAccess:     makeEntity('user_team_access'),
    Session:            makeEntity('sessions'),
    SessionDrill:       makeEntity('session_drills'),
    AttendanceRecord:   makeEntity('attendance_records'),
    ClubChallenge:      makeEntity('club_challenges'),
    ChallengeResult:    makeEntity('challenge_results'),
    Drill:              makeEntity('drills'),
    DrillFavorite:      makeEntity('drill_favorites'),
    PlayerNote:         makeEntity('player_notes'),
    Venue:              makeEntity('venues'),
    Court:              makeEntity('courts'),
    TrainingAllocation: makeEntity('training_allocations'),
    Game:               makeEntity('games'),
    User:               makeEntity('profiles'),
    PlayerEvaluation:   makeEntity('player_evaluations'),
    TeamEvaluation:     makeEntity('team_evaluations'),
    CoachEvaluation:    makeEntity('coach_evaluations'),
    EvaluationSession:  makeEntity('evaluation_sessions'),
    ClubSettings:       makeEntity('club_settings'),
    EmailTemplate:      makeEntity('email_templates'),
    Email:              makeEntity('emails'),
    EmailRecipient:     makeEntity('email_recipients'),
    Notification:       makeEntity('notifications'),
    PushSubscription:   makeEntity('push_subscriptions'),
  },
};
