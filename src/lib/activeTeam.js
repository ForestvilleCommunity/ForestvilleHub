// Module-level store for active team — user-email-namespaced to prevent cross-user leakage

let activeTeam = null;
let _currentUserEmail = null;
const listeners = new Set();

export const getActiveTeam = () => activeTeam;

// Call this once we know the current user's email (e.g. in Layout after auth.me())
export const initActiveTeamForUser = (email) => {
  if (!email) return;
  if (_currentUserEmail === email) return; // already initialised for this user
  _currentUserEmail = email;
  try {
    const key = `coachpad_active_team_${email}`;
    const stored = localStorage.getItem(key);
    activeTeam = stored ? JSON.parse(stored) : null;
  } catch { activeTeam = null; }
  listeners.forEach(fn => fn(activeTeam));
};

export const setActiveTeam = (team) => {
  activeTeam = team;
  if (_currentUserEmail) {
    try {
      localStorage.setItem(`coachpad_active_team_${_currentUserEmail}`, JSON.stringify(team));
    } catch {}
  }
  listeners.forEach(fn => fn(team));
};

export const clearActiveTeam = () => {
  activeTeam = null;
  _currentUserEmail = null;
  listeners.forEach(fn => fn(null));
};

export const subscribeActiveTeam = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};