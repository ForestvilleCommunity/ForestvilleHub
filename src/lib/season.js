import { db } from '@/api/db';

const KEY = 'coachpad_season';
const DEFAULT_SEASON = { name: '2025-2026', startDate: '2025-01-01' };

// In-memory cache, populated from the shared `club_settings` table on app
// startup via initSeasonFromServer(). Falls back to a localStorage mirror
// (stale but instant) until that fetch completes, then to a hardcoded default.
let cachedSeason = null;
let cachedSettingsId = null;

function readLocalMirror() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!stored) return null;
    // Migrate old "YYYY Season" format → "YYYY-YYYY"
    if (/^\d{4} Season$/.test(stored.name)) {
      const y = parseInt(stored.name);
      return { ...stored, name: `${y - 1}-${y}` };
    }
    return stored;
  } catch { return null; }
}

function writeLocalMirror(season) {
  try { localStorage.setItem(KEY, JSON.stringify(season)); } catch {}
}

export function getCurrentSeason() {
  return cachedSeason || readLocalMirror() || DEFAULT_SEASON;
}

// Call once on app startup (after auth) to sync from the shared database
// row so every coach's device agrees on the current season, instead of
// each browser trusting only its own localStorage.
export async function initSeasonFromServer() {
  try {
    const rows = await db.entities.ClubSettings.list();
    const row = rows?.[0];
    if (!row) return;
    cachedSettingsId = row.id;
    cachedSeason = { name: row.current_season_name, startDate: row.current_season_start_date };
    writeLocalMirror(cachedSeason);
    window.dispatchEvent(new Event('coachpad-season-change'));
  } catch {
    // Offline or RLS hiccup — keep using the local mirror/default silently.
  }
}

export async function setCurrentSeason(season) {
  writeLocalMirror(season);
  cachedSeason = season;
  window.dispatchEvent(new Event('coachpad-season-change'));

  const me = await db.auth.me().catch(() => null);
  const payload = {
    current_season_name: season.name,
    current_season_start_date: season.startDate,
    updated_by: me?.id || null,
  };
  if (!cachedSettingsId) {
    const rows = await db.entities.ClubSettings.list().catch(() => []);
    cachedSettingsId = rows?.[0]?.id || null;
  }
  if (cachedSettingsId) {
    await db.entities.ClubSettings.update(cachedSettingsId, payload);
  } else {
    const created = await db.entities.ClubSettings.create(payload);
    cachedSettingsId = created.id;
  }
}

export function subscribeSeasonChange(fn) {
  window.addEventListener('coachpad-season-change', fn);
  return () => window.removeEventListener('coachpad-season-change', fn);
}

// Forestville Eagles age groups in progression order
export const AGE_GROUPS = ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'U21B', 'U23W', 'Seniors'];

// BA age cutoff = Dec 31 of the season year.
// "Under N" means strictly under N → age must be ≤ N-1.
export function getAgeGroupForYear(dob, gender, year) {
  if (!dob) return null;
  const age = year - new Date(dob + 'T00:00:00').getFullYear();
  const isFemale = /f|w|girl|woman/i.test(gender || '');
  if (age <= 7)  return 'U8';
  if (age <= 9)  return 'U10';
  if (age <= 11) return 'U12';
  if (age <= 13) return 'U14';
  if (age <= 15) return 'U16';
  if (age <= 17) return 'U18';
  if (!isFemale && age <= 20) return 'U21B';
  if (isFemale  && age <= 22) return 'U23W';
  return 'Seniors';
}

// Infer age group from team name
export function teamNameToAgeGroup(teamName) {
  if (!teamName) return null;
  const n = teamName.toLowerCase();
  if (n.includes('u8')  || n.includes('under 8')  || n.includes('under8'))  return 'U8';
  if (n.includes('u10') || n.includes('under 10') || n.includes('under10')) return 'U10';
  if (n.includes('u12') || n.includes('under 12') || n.includes('under12')) return 'U12';
  if (n.includes('u14') || n.includes('under 14') || n.includes('under14')) return 'U14';
  if (n.includes('u16') || n.includes('under 16') || n.includes('under16')) return 'U16';
  if (n.includes('u18') || n.includes('under 18') || n.includes('under18')) return 'U18';
  if (n.includes('u21') || n.includes('under 21') || n.includes('21b'))     return 'U21B';
  if (n.includes('u23') || n.includes('under 23') || n.includes('23w'))     return 'U23W';
  if (n.includes('senior')) return 'Seniors';
  return null;
}
