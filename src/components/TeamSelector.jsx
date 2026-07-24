import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Shield, Lock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/api/db';
import { getActiveTeam, setActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';
import { getAccessibleTeams } from '@/lib/teamAccess';
import CreateTeamModal from './teams/CreateTeamModal';

export default function TeamSelector() {
  const [teams, setTeams] = useState([]);
  const [activeTeam, setActiveTeamState] = useState(getActiveTeam());
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteCounts, setDeleteCounts] = useState(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const unsub = subscribeActiveTeam(setActiveTeamState);
    loadTeams();
    // Re-validate every 2 minutes in case admin changes team assignments
    const interval = setInterval(loadTeams, 120000);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadTeams = async () => {
    try {
      const user = await db.auth.me();
      setCurrentUser(user);
      const result = await getAccessibleTeams(user);
      setTeams(result);
      const current = getActiveTeam();
      if (current && !result.find(t => t.id === current.id)) {
        // Stored team no longer exists — clear it
        setActiveTeam(result.length ? result[0] : null);
      } else if (!current && result.length) {
        setActiveTeam(result[0]);
      }
    } catch (e) {}
  };

  const handleTeamCreated = async (team) => {
    setShowCreate(false);
    await loadTeams();
    setActiveTeam(team);
  };

  const canDeleteTeam = (team) =>
    team.owner_user_email === currentUser?.email || team.owner_id === currentUser?.id;

  const prepareDelete = async (e, team) => {
    e.stopPropagation();
    setOpen(false);
    if (!canDeleteTeam(team)) return;
    setLoadingCounts(true);
    setDeleteConfirm(team);
    const [sessions, players, games] = await Promise.all([
      db.entities.Session.filter({ team_id: team.id }).catch(() => []),
      db.entities.Player.filter({ team_id: team.id }).catch(() => []),
      db.entities.Game.filter({ team_id: team.id }).catch(() => []),
    ]);
    const privatePlayers = players.filter(p => p.visibility !== 'Club' && (p.owner_user_email === currentUser?.email));
    setDeleteCounts({ sessions: sessions.length, players: privatePlayers.length, games: games.length });
    setLoadingCounts(false);
  };

  const cascadeDeleteTeam = async (team) => {
    if (!canDeleteTeam(team)) return;
    setDeleting(true);
    try {
      // 1. Sessions → session drills (fetch all sessions' drills in parallel, not one session at a time)
      const sessions = await db.entities.Session.filter({ team_id: team.id }).catch(() => []);
      const sdrillsBySession = await Promise.all(sessions.map(s => db.entities.SessionDrill.filter({ session_id: s.id }).catch(() => [])));
      await Promise.all(sdrillsBySession.flat().map(sd => db.entities.SessionDrill.delete(sd.id)));
      await Promise.all(sessions.map(s => db.entities.Session.delete(s.id)));
      // 2. Games
      const games = await db.entities.Game.filter({ team_id: team.id }).catch(() => []);
      await Promise.all(games.map(g => db.entities.Game.delete(g.id)));
      // 3. Private players for this team only
      const players = await db.entities.Player.filter({ team_id: team.id }).catch(() => []);
      const mine = players.filter(p => p.visibility !== 'Club' && (p.owner_user_email === currentUser.email || p.created_by_id === currentUser.id));
      await Promise.all(mine.map(p => db.entities.Player.delete(p.id)));
      // 4. UserTeamAccess
      const access = await db.entities.UserTeamAccess.filter({ team_id: team.id }).catch(() => []);
      await Promise.all(access.map(a => db.entities.UserTeamAccess.delete(a.id)));
      // 5. Delete team
      await db.entities.Team.delete(team.id);
      if (getActiveTeam()?.id === team.id) setActiveTeam(null);
      setDeleteConfirm(null);
      toast.success(`${team.team_name || 'Team'} deleted`);
      await loadTeams();
    } catch (e) {
      console.error('Delete failed:', e);
      toast.error(`Couldn't fully delete this team (${e?.message || 'unknown error'}). Some data may have been partially removed — please check and try again.`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 transition-colors px-3 py-1.5 rounded-lg text-sm text-white max-w-[160px]"
      >
        <span className="truncate text-left">
          {activeTeam ? activeTeam.team_name : 'Select Team'}
        </span>
        <ChevronDown size={13} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 min-w-[220px] w-max max-w-[90vw] z-50 overflow-hidden flex flex-col max-h-[70vh]">
          <div className="px-3 py-2 border-b border-slate-100 shrink-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Teams</p>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0">
            {teams.length === 0 && (
              <div className="px-4 py-3 text-sm text-slate-400 text-center">No teams yet</div>
            )}

            {teams.map(team => (
              <div key={team.id} className="relative group flex items-center">
                <button
                  onClick={() => { setActiveTeam(team); setOpen(false); }}
                  className={`flex-1 px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors ${activeTeam?.id === team.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}
                >
                  {team.visibility === 'Club' ? (
                    <Shield size={13} className="text-blue-400 shrink-0" />
                  ) : (
                    <Lock size={13} className="text-slate-300 shrink-0" />
                  )}
                  <span className="truncate flex-1">{team.team_name}</span>
                  {team.age_group && <span className="text-xs text-slate-400 shrink-0">{team.age_group}</span>}
                </button>
                {canDeleteTeam(team) && (
                  <button
                    onClick={(e) => prepareDelete(e, team)}
                    title="Delete this team"
                    className="shrink-0 mr-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 px-3 py-2 shrink-0">
            <button
              onClick={() => { setOpen(false); setShowCreate(true); }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Create Team
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateTeamModal onCreated={handleTeamCreated} onClose={() => setShowCreate(false)} />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg text-slate-900 mb-1">Delete this team?</h3>
            <p className="text-sm text-slate-500 mb-4">
              This will permanently delete <strong>{deleteConfirm.team_name}</strong> and all private records linked to it, including:
            </p>
            {loadingCounts ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-5">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                Counting affected records…
              </div>
            ) : deleteCounts && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-5 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-700">Private players</span>
                  <span className="font-bold text-red-800">{deleteCounts.players}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-700">Training sessions</span>
                  <span className="font-bold text-red-800">{deleteCounts.sessions}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-700">Games</span>
                  <span className="font-bold text-red-800">{deleteCounts.games}</span>
                </div>
              </div>
            )}
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-5">
              Club players and admin-created records are not affected.
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteConfirm(null); setDeleteCounts(null); }} disabled={deleting}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => cascadeDeleteTeam(deleteConfirm)} disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}