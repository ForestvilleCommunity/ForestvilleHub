/**
 * Resolves an Email's target_type/target_ids into an actual list of
 * recipients. Kept in one place so the compose UI, a preview screen, and
 * the send Edge Function all agree on exactly who "Team X" or "Role: doc"
 * means — instead of each re-implementing the same filters slightly differently.
 */

// Same safe-parse convention as getSquadTeamIds() in AdminSquadsTab.jsx —
// team_ids is stored as a JSON array serialized into a text column.
function parseTeamIds(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

// ── Members (players/families) ──────────────────────────────────────────
// Always restricted to visibility:'Club' + status:'Active' — never surfaces
// a coach's private/personal roster, matching the rule enforced everywhere
// else admin code touches Member/Team/Player/Drill.
export function resolveMemberRecipients(targetType, targetIds, { members, squads }) {
  const pool = (members || []).filter(m => m.visibility === 'Club' && m.status === 'Active');
  const ids = new Set(targetIds || []);

  let matched;
  if (targetType === 'all') {
    matched = pool;
  } else if (targetType === 'team') {
    matched = pool.filter(m => ids.has(m.team_id));
  } else if (targetType === 'squad') {
    const squadTeamIds = new Set(
      (squads || []).filter(sq => ids.has(sq.id)).flatMap(sq => parseTeamIds(sq.team_ids))
    );
    matched = pool.filter(m => squadTeamIds.has(m.team_id));
  } else if (targetType === 'individual') {
    matched = pool.filter(m => ids.has(m.id));
  } else {
    matched = [];
  }

  // Member's own email takes priority (some teams — e.g. Senior Men, Board —
  // are adults); falls back to the parent/guardian contact for minors.
  return matched.map(m => {
    const email = m.email || m.parent_email || null;
    return { member_id: m.id, name: m.name, email, reachable: !!email };
  });
}

// ── Coaches / staff (profiles) ──────────────────────────────────────────
export function resolveCoachRecipients(targetType, targetIds, { profiles, userTeamAccess, squads }) {
  const pool = (profiles || []).filter(p => p.account_status === 'Active');
  const ids = new Set(targetIds || []);

  const staffIdsForTeams = (teamIds) => new Set(
    (userTeamAccess || []).filter(a => teamIds.has(a.team_id)).map(a => a.user_id)
  );

  let matched;
  if (targetType === 'all') {
    matched = pool;
  } else if (targetType === 'role') {
    matched = pool.filter(p => ids.has(p.role));
  } else if (targetType === 'team') {
    const staffIds = staffIdsForTeams(ids);
    matched = pool.filter(p => staffIds.has(p.id));
  } else if (targetType === 'squad') {
    const squadTeamIds = new Set(
      (squads || []).filter(sq => ids.has(sq.id)).flatMap(sq => parseTeamIds(sq.team_ids))
    );
    const staffIds = staffIdsForTeams(squadTeamIds);
    matched = pool.filter(p => staffIds.has(p.id));
  } else if (targetType === 'individual') {
    matched = pool.filter(p => ids.has(p.id));
  } else {
    matched = [];
  }

  return matched.map(p => ({
    profile_id: p.id,
    name: p.full_name || p.email,
    email: p.email,
    reachable: !!p.email,
  }));
}

// Convenience entry point for the compose UI/send function — picks the right
// resolver based on the email's audience.
export function resolveRecipients(audience, targetType, targetIds, data) {
  return audience === 'coaches'
    ? resolveCoachRecipients(targetType, targetIds, data)
    : resolveMemberRecipients(targetType, targetIds, data);
}
