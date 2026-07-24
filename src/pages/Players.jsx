import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Search, Plus, Users, X } from 'lucide-react';
import Pagination from '@/components/admin/Pagination';
import { db } from '@/api/db';
import { getActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';
import { getAccessibleTeams, getAccessiblePlayers } from '@/lib/teamAccess';
import PlayerCard from '@/components/players/PlayerCard';
import AddEditPlayerModal from '@/components/players/AddEditPlayerModal';
import PlayerProfile from '@/components/players/PlayerProfile';

const STATUS_FILTERS = ['All', 'Active', 'Inactive', 'Injured'];
const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'jersey', label: 'Jersey #' },
  { value: 'team', label: 'Team' },
  { value: 'recent', label: 'Recently Added' },
];

export default function Players() {
  const [user, setUser] = useState(null);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeTeam, setActiveTeamState] = useState(getActiveTeam());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [teamFilter, setTeamFilter] = useState('All');
  const [sortBy, setSortBy] = useState('name_asc');
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editPlayer, setEditPlayer] = useState(null);
  const [deletePlayer, setDeletePlayer] = useState(null);
  const [viewPlayer, setViewPlayer] = useState(null);

  useEffect(() => {
    db.auth.me().then(u => { setUser(u); }).catch(() => {});
    const unsub = subscribeActiveTeam((t) => setActiveTeamState(t));
    return unsub;
  }, []);

  useEffect(() => { if (user) load(); }, [user, activeTeam]);

  const load = async () => {
    setLoading(true);
    const [playerList, teamList, memberList] = await Promise.all([
      getAccessiblePlayers(user, activeTeam?.id),
      getAccessibleTeams(user),
      db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
    ]);
    // Merge jersey_number from linked member when player doesn't have one
    const memberMap = memberList.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});
    const enriched = playerList.map(p => {
      if ((p.jersey_number == null || p.jersey_number === '') && p.member_id && memberMap[p.member_id]?.jersey_number != null) {
        return { ...p, jersey_number: memberMap[p.member_id].jersey_number };
      }
      return p;
    });
    setPlayers(enriched);
    setTeams(teamList);
    setLoading(false);
  };

  // Reset pagination when filters change
  useEffect(() => { setPage(0); }, [search, statusFilter, teamFilter, sortBy]);

  const teamMap = teams.reduce((acc, t) => { acc[t.id] = t.team_name; return acc; }, {});

  const filtered = players
    .filter(p => {
      if (statusFilter === 'Active') return p.status === 'Active';
      if (statusFilter === 'Inactive') return p.status === 'Inactive';
      if (statusFilter === 'Injured') return p.injury_status && p.injury_status !== 'Healthy';
      return true;
    })
    .filter(p => teamFilter === 'All' || p.team_id === teamFilter)
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      if (sortBy === 'jersey') return (a.jersey_number ?? 99) - (b.jersey_number ?? 99);
      if (sortBy === 'team') return (teamMap[a.team_id] || '').localeCompare(teamMap[b.team_id] || '');
      if (sortBy === 'recent') return new Date(b.created_date) - new Date(a.created_date);
      return (a.name || '').localeCompare(b.name || '');
    });

  const handleDelete = (player) => setDeletePlayer(player);
  const confirmDelete = async () => {
    try {
      await db.entities.Player.delete(deletePlayer.id);
    } catch {
      toast.error('Could not delete player. You may not have permission.');
      setDeletePlayer(null);
      return;
    }
    setDeletePlayer(null);
    load();
  };

  const handleEdit = (player) => { setEditPlayer(player); setShowModal(true); };
  const handleAdd = () => { setEditPlayer(null); setShowModal(true); };
  const handleSave = () => { setShowModal(false); setEditPlayer(null); load(); };

  // Club players (visibility='Club') can only be managed by admins
  // Coaches can only edit/delete players they personally created (Private)
  const canManagePlayer = (player) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return player.visibility !== 'Club' && (player.owner_user_email === user.email || player.created_by_id === user.id);
  };

  return (
    <div>
      <div className="px-4 pt-5 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Players</h1>
            <p className="text-sm text-slate-500">
              {activeTeam ? activeTeam.team_name : `${players.length} player${players.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={handleAdd}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-200">
            <Plus size={16} />Add Player
          </button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="flex gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
            {STATUS_FILTERS.map(f => <option key={f} value={f}>{f === 'All' ? 'All Statuses' : f}</option>)}
          </select>
          {!activeTeam && teams.length > 1 && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
              className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="All">All Teams</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
            </select>
          )}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="px-4 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <Users size={28} className="text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700">
              {search || statusFilter !== 'All' ? 'No players match' : 'No players yet'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {!search && statusFilter === 'All' && 'Tap "Add Player" to build your roster'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-400 font-medium pb-2">{filtered.length} player{filtered.length !== 1 ? 's' : ''}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(player => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  teamName={!activeTeam ? teamMap[player.team_id] : null}
                  onViewProfile={setViewPlayer}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  canEdit={canManagePlayer(player)}
                  canDelete={canManagePlayer(player)}
                />
              ))}
            </div>
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPage={setPage} />
          </>
        )}
      </div>

      {deletePlayer && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg text-slate-900 mb-1">Delete player?</h3>
            <p className="text-sm text-slate-500 mb-6">This will remove <strong>{deletePlayer.name}</strong> and their linked private development data.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletePlayer(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {viewPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center" onClick={() => setViewPlayer(null)}>
          <div className="relative bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-3xl overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewPlayer(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 text-white flex items-center justify-center backdrop-blur-sm transition-colors">
              <X size={16} />
            </button>
            <PlayerProfile
              player={viewPlayer}
              teamName={teamMap[viewPlayer.team_id]}
              onClose={() => setViewPlayer(null)}
            />
          </div>
        </div>
      )}

      {showModal && (
        <AddEditPlayerModal
          player={editPlayer}
          defaultTeamId={activeTeam?.id}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditPlayer(null); }}
        />
      )}
    </div>
  );
}