import { db } from '@/api/db';

function parseIds(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || '[]'); } catch { return []; }
}

export async function getAccessibleDrills(user) {
  if (!user) return [];

  const [ownDrills, accessRecords] = await Promise.all([
    db.entities.Drill.filter({ owner_id: user.id }, '-created_date'),
    db.entities.UserTeamAccess.filter({ user_id: user.id }),
  ]);

  const isAdmin = user.role === 'admin';
  const hasClubAccess = isAdmin || accessRecords.length > 0;
  let clubDrills = [];
  if (hasClubAccess) {
    const all = await db.entities.Drill.filter({ visibility: 'Club' }, '-created_date').catch(() => []);
    if (isAdmin) {
      // Admins see all club drills
      clubDrills = all;
    } else {
      // Coaches only see drills assigned to their teams
      const teamIds = accessRecords.map(a => a.team_id);
      clubDrills = all.filter(d => {
        const assigned = parseIds(d.team_ids);
        return teamIds.some(id => assigned.includes(id));
      });
    }
  }

  const merged = [...ownDrills];
  clubDrills.forEach(d => {
    if (!merged.find(m => m.id === d.id)) merged.push(d);
  });
  return merged;
}

export function canEditDrill(drill, user) {
  if (!user || !drill) return false;
  if (user.role === 'admin') return true;
  // Club and Template drills are admin-controlled — coaches can only edit their own Private drills
  if (drill.visibility === 'Club' || drill.visibility === 'Template') return false;
  return drill.owner_id === user.id;
}
