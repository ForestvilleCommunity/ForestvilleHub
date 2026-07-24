import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { db } from '@/api/db';
import TeamProfile from './TeamProfile';
import MemberProfile from './MemberProfile';
import SquadProfile from './SquadProfile';
import CoachProfile from './CoachProfile';
import ChallengeProfile from './ChallengeProfile';
import AssignMemberModal from './AssignMemberModal';
import TeamEditModal from './TeamEditModal';
import SquadEditModal from './SquadEditModal';
import MemberEditScreen from './MemberEditScreen';

export default function AdminProfilePanel({ stack, onPush, onPop }) {
  const [shared, setShared] = useState({ teams: [], users: [], members: [], players: [], drills: [], challenges: [], access: [], squads: [] });
  const [assignMemberTeam, setAssignMemberTeam] = useState(null);
  const [assignCoachModal, setAssignCoachModal] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Edit modal state
  const [editTeam, setEditTeam]     = useState(null);
  const [editSquad, setEditSquad]   = useState(null);
  const [editMember, setEditMember] = useState(null);

  const load = () => Promise.all([
    db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000),
    db.entities.User.list('-created_date', 500),
    db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date'),
    db.entities.Player.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
    db.entities.Drill.list('-created_date', 500),
    db.entities.ClubChallenge.list('-created_date', 200),
    db.entities.UserTeamAccess.list('-created_date', 1000),
    db.entities.Squad.list('-created_date', 500).catch(() => []),
  ]).then(([teams, users, members, players, drills, challenges, access, squads]) => {
    setShared({ teams, users: users.filter(u => u.role !== 'admin'), members, players, drills, challenges, access, squads });
    setLoaded(true);
  }).catch(() => setLoaded(true));

  useEffect(() => { load(); }, []);

  if (stack.length === 0) return null;

  const current = stack[stack.length - 1];
  const { type, data: entity } = current;

  const getCoachTeams = (email) =>
    shared.access.filter(a => a.user_email === email)
      .map(a => shared.teams.find(t => t.id === a.team_id)).filter(Boolean);

  const getTeamCoaches = (teamId) =>
    shared.access.filter(a => a.team_id === teamId)
      .map(a => shared.users.find(u => u.email === a.user_email)).filter(Boolean);

  const reload = () => { load(); };

  const handleSuspendCoach = async (user) => {
    const suspended = user.account_status === 'Suspended';
    await db.entities.User.update(user.id, { account_status: suspended ? 'Active' : 'Suspended' });
    reload();
  };

  const handleArchiveSquad = async (squad) => {
    if (!window.confirm(`Archive "${squad.name}"?`)) return;
    await db.entities.Squad.update(squad.id, { status: 'Archived' });
    reload();
    onPop();
  };

  const handleDeleteSquad = async (squad) => {
    if (!window.confirm(`Permanently delete "${squad.name}"? This cannot be undone.`)) return;
    await db.entities.Squad.delete(squad.id);
    reload();
    onPop();
  };

  const handleArchiveTeam = async (team) => {
    await db.entities.Team.update(team.id, { status: 'Inactive' });
    reload();
    onPop();
  };

  const handleDeleteTeam = async (team) => {
    if (!window.confirm(`Delete "${team.team_name}"? This cannot be undone.`)) return;
    const [teamPlayers, teamMembers] = await Promise.all([
      db.entities.Player.filter({ team_id: team.id }, '-created_date', 500).catch(() => []),
      db.entities.Member.filter({ team_id: team.id }, '-created_date', 500).catch(() => []),
    ]);
    await Promise.all([
      ...teamPlayers.map(p => db.entities.Player.delete(p.id).catch(() => {})),
      ...teamMembers.map(m => db.entities.Member.update(m.id, { team_id: null }).catch(() => {})),
    ]);
    await db.entities.Team.delete(team.id);
    reload();
    onPop();
  };

  const handleDeleteMember = async (member) => {
    if (!window.confirm(`Delete ${member.name}? This cannot be undone.`)) return;
    const linkedPlayers = await db.entities.Player.filter({ member_id: member.id }, '-created_date', 50).catch(() => []);
    await Promise.all(linkedPlayers.map(p => db.entities.Player.delete(p.id).catch(() => {})));
    await db.entities.Member.delete(member.id);
    reload();
    onPop();
  };

  const assignCoach = async (teamId, userEmail) => {
    if (shared.access.some(a => a.team_id === teamId && a.user_email === userEmail)) return;
    await db.entities.UserTeamAccess.create({ team_id: teamId, user_email: userEmail, role: 'coach', can_edit: true, assigned_by_admin: true });
    reload();
  };

  return (
    <div className="absolute inset-0 bg-slate-50 z-40 flex flex-col">
      {/* Breadcrumb — only show when 2+ levels deep */}
      {stack.length > 1 && (
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-1.5 flex-wrap shrink-0">
          {stack.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs">
              {i > 0 && <span className="text-slate-300">›</span>}
              <span className={i === stack.length - 1 ? 'text-slate-800 font-semibold' : 'text-slate-400'}>
                {item.type === 'team' ? item.data.team_name
                  : item.type === 'member' ? item.data.name
                  : item.type === 'coach' ? (item.data.full_name || item.data.email)
                  : item.type === 'challenge' ? item.data.title
                  : item.data.name || item.type}
              </span>
            </span>
          ))}
        </div>
      )}

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {type === 'team' && (
            <TeamProfile
              team={entity}
              members={null}
              coaches={getTeamCoaches(entity.id)}
              challenges={shared.challenges}
              initialSquads={shared.squads}
              initialUsers={shared.users}
              initialAccess={shared.access}
              onBack={onPop}
              onEdit={() => setEditTeam(entity)}
              onMemberClick={m => onPush('member', m)}
              onCoachClick={c => onPush('coach', c)}
              onSquadClick={sq => onPush('squad', sq)}
              onAddMember={() => setAssignMemberTeam(entity)}
              onAssignCoach={() => setAssignCoachModal(entity)}
              onArchive={() => handleArchiveTeam(entity)}
              onDelete={() => handleDeleteTeam(entity)}
            />
          )}
          {type === 'squad' && (() => {
            const sqTeamIds = (() => { try { return JSON.parse(entity.team_ids || '[]'); } catch { return []; } })();
            const squadTeams = shared.teams.filter(t => sqTeamIds.includes(t.id));
            const squadMembers = shared.members.filter(m => sqTeamIds.includes(m.team_id) && m.status !== 'Archived');
            const coachEmails = [...new Set(shared.access.filter(a => sqTeamIds.includes(a.team_id)).map(a => a.user_email))];
            const squadCoaches = coachEmails.map(e => shared.users.find(u => u.email === e)).filter(Boolean);
            return (
              <SquadProfile
                squad={entity}
                squadTeams={squadTeams}
                squadMembers={squadMembers}
                squadCoaches={squadCoaches}
                squadAttendance={null}
                squadChallengeResults={null}
                teams={shared.teams}
                onBack={onPop}
                onEdit={() => setEditSquad(entity)}
                onArchive={() => handleArchiveSquad(entity)}
                onDelete={() => handleDeleteSquad(entity)}
                onTeamClick={t => onPush('team', t)}
                onMemberClick={m => onPush('member', m)}
                onCoachClick={c => onPush('coach', c)}
              />
            );
          })()}
          {type === 'member' && (
            editMember ? (
              <MemberEditScreen
                member={editMember}
                teams={shared.teams}
                squads={shared.squads}
                allMembers={shared.members}
                onBack={() => setEditMember(null)}
                onSaved={() => { setEditMember(null); reload(); }}
              />
            ) : (
              <MemberProfile
                member={entity}
                teams={shared.teams}
                linkedPlayer={shared.players.find(p => p.member_id === entity.id && p.status !== 'Inactive') || null}
                isAdmin={true}
                onBack={onPop}
                onEdit={() => setEditMember(entity)}
                onDelete={() => handleDeleteMember(entity)}
                onTeamClick={t => onPush('team', t)}
              />
            )
          )}
          {type === 'coach' && (
            <CoachProfile
              user={entity}
              assignedTeams={getCoachTeams(entity.email)}
              onBack={onPop}
              onTeamClick={t => onPush('team', t)}
              onAssignTeam={null}
              onSuspend={() => handleSuspendCoach(entity)}
            />
          )}
          {type === 'challenge' && (
            <ChallengeProfile
              challenge={entity}
              teams={shared.teams}
              drills={shared.drills}
              onBack={onPop}
              onEdit={() => {}}
              onDuplicate={() => {}}
              onArchive={() => {}}
              onTeamClick={t => onPush('team', t)}
            />
          )}
        </div>
      )}

      {assignMemberTeam && (
        <AssignMemberModal
          team={assignMemberTeam}
          onClose={() => setAssignMemberTeam(null)}
          onSaved={reload}
        />
      )}

      {assignCoachModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setAssignCoachModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm">Assign Coach — {assignCoachModal.team_name}</h3>
              <button onClick={() => setAssignCoachModal(null)} className="text-slate-400"><X size={16} /></button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {shared.users.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4">No coaches registered yet.</p>
                : shared.users.map(u => {
                  const already = shared.access.some(a => a.team_id === assignCoachModal.id && a.user_email === u.email);
                  return (
                    <button key={u.id} onClick={() => !already && assignCoach(assignCoachModal.id, u.email)} disabled={already}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${already ? 'border-green-200 bg-green-50 cursor-default' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                      <div className="font-semibold">{u.full_name || u.email}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                      {already && <div className="text-xs text-green-600 mt-0.5">✓ Already assigned</div>}
                    </button>
                  );
                })}
            </div>
            <button onClick={() => setAssignCoachModal(null)} className="mt-4 w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-semibold">Close</button>
          </div>
        </div>
      )}

      {editTeam && (
        <TeamEditModal
          team={editTeam}
          onSave={() => { setEditTeam(null); reload(); }}
          onClose={() => setEditTeam(null)}
          onAddMember={() => setAssignMemberTeam(editTeam)}
          initialSquads={shared.squads}
          initialUsers={shared.users}
          initialAccess={shared.access}
        />
      )}

      {editSquad && (
        <SquadEditModal
          squad={editSquad}
          onSave={() => { setEditSquad(null); reload(); }}
          onClose={() => setEditSquad(null)}
        />
      )}
    </div>
  );
}
