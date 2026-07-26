import { db } from '@/api/db';

/**
 * Returns teams the current user can access.
 * - Coaches: own teams (owner_id) + assigned teams (user_team_access)
 * - Admins: all club teams
 */
export async function getAccessibleTeams(user) {
  if (!user) return [];

  if (user.role === 'admin') {
    const [clubTeams, ownPrivate] = await Promise.all([
      db.entities.Team.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
      db.entities.Team.filter({ owner_id: user.id, visibility: 'Private' }).catch(() => []),
    ]);
    const seen = new Set();
    return [...clubTeams, ...ownPrivate].filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  }

  const [accessRecords, ownTeams] = await Promise.all([
    db.entities.UserTeamAccess.filter({ user_id: user.id }),
    db.entities.Team.filter({ owner_id: user.id }),
  ]);

  const assignedIds = [...new Set(accessRecords.map(r => r.team_id).filter(Boolean))];
  const assignedTeams = assignedIds.length
    ? await db.entities.Team.filter({ id: assignedIds }).catch(() => [])
    : [];

  const merged = [...assignedTeams];
  ownTeams.forEach(t => {
    if (!merged.find(m => m.id === t.id)) merged.push(t);
  });
  return merged;
}

/**
 * Returns players the current user can access.
 * Optionally filtered by activeTeamId.
 */
export async function getAccessiblePlayers(user, activeTeamId = null) {
  if (!user) return [];

  const accessibleTeams = await getAccessibleTeams(user);
  const accessibleIds = accessibleTeams.map(t => t.id);
  if (!accessibleIds.length) return [];

  const targetIds = activeTeamId && accessibleIds.includes(activeTeamId)
    ? [activeTeamId]
    : accessibleIds;

  return db.entities.Player.filter({ team_id: targetIds }, '-created_date').catch(() => []);
}
