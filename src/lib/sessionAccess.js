import { db } from '@/api/db';
import { getAccessibleTeams } from './teamAccess';

async function getTeamIds(user) {
  const teams = await getAccessibleTeams(user);
  return teams.map(t => t.id);
}

export async function getAccessibleSessions(user, activeTeamId = null) {
  if (!user) return [];
  if (activeTeamId) {
    return db.entities.Session.filter({ team_id: activeTeamId }, '-date').catch(() => []);
  }
  const teamIds = await getTeamIds(user);
  const [ownSessions, ...teamSessionArrays] = await Promise.all([
    db.entities.Session.filter({ owner_id: user.id }, '-date'),
    ...teamIds.map(id => db.entities.Session.filter({ team_id: id }, '-date').catch(() => [])),
  ]);
  const merged = [...ownSessions];
  teamSessionArrays.flat().forEach(s => { if (!merged.find(m => m.id === s.id)) merged.push(s); });
  return merged.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function getAccessibleGames(user, activeTeamId = null) {
  if (!user) return [];
  if (activeTeamId) {
    return db.entities.Game.filter({ team_id: activeTeamId }, '-game_date').catch(() => []);
  }
  const teamIds = await getTeamIds(user);
  const [ownGames, ...teamGameArrays] = await Promise.all([
    db.entities.Game.filter({ owner_id: user.id }, '-game_date'),
    ...teamIds.map(id => db.entities.Game.filter({ team_id: id }, '-game_date').catch(() => [])),
  ]);
  const merged = [...ownGames];
  teamGameArrays.flat().forEach(g => { if (!merged.find(m => m.id === g.id)) merged.push(g); });
  return merged.sort((a, b) => new Date(b.game_date) - new Date(a.game_date));
}
