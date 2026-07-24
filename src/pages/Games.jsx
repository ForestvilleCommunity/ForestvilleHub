import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Trophy } from 'lucide-react';
import Pagination from '@/components/admin/Pagination';
import HelpBubble from '@/components/HelpBubble';
import { db } from '@/api/db';
import { getAccessibleTeams } from '@/lib/teamAccess';
import { getAccessibleGames } from '@/lib/sessionAccess';
import { getActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';
import GameCard from '@/components/games/GameCard';
import GamePlanModal from '@/components/games/GamePlanModal';
import GameSummary from '@/components/games/GameSummary';

export default function Games() {
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeTeam, setActiveTeamState] = useState(getActiveTeam());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [gamePlanGame, setGamePlanGame] = useState(null);
  const [summaryGame, setSummaryGame] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    db.auth.me().then(setUser).catch(() => {});
    const unsub = subscribeActiveTeam(t => setActiveTeamState(t));
    return unsub;
  }, []);
  useEffect(() => { if (user) load(); }, [user, activeTeam]);

  const load = async () => {
    setLoading(true);
    const [teamList, gameList] = await Promise.all([
      getAccessibleTeams(user),
      getAccessibleGames(user, activeTeam?.id),
    ]);
    setTeams(teamList);
    setGames(gameList);
    setLoading(false);
  };

  const handleDelete = async (game) => {
    if (deleteConfirm?.id === game.id) {
      await db.entities.Game.delete(game.id);
      setDeleteConfirm(null);
      load();
    } else {
      setDeleteConfirm(game);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  // Reset pagination when filters change
  useEffect(() => { setPage(0); }, [search, resultFilter, sortBy]);

  const teamMap = teams.reduce((acc, t) => { acc[t.id] = t.team_name; return acc; }, {});

  const filtered = games
    .filter(g => resultFilter === 'All' || g.result === resultFilter)
    .filter(g => !search || g.opponent?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.game_date) - new Date(b.game_date);
      if (sortBy === 'upcoming') return new Date(a.game_date) - new Date(b.game_date);
      return new Date(b.game_date) - new Date(a.game_date);
    });

  return (
    <div>
      <div className="px-4 pt-5 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Games</h1>
            <p className="text-sm text-slate-500">{activeTeam ? activeTeam.team_name : `${games.length} game${games.length !== 1 ? 's' : ''}`}</p>
          </div>
          <button onClick={() => navigate('/games/new')}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-slate-200">
            <Plus size={16} />
            New Game
          </button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by opponent..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>

        <div className="flex gap-2">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400">
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="upcoming">Upcoming</option>
          </select>
          <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
            className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400">
            <option value="All">All Results</option>
            {['Win', 'Loss', 'Draw', 'TBD'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <HelpBubble id="games" text="💡 Track only the stats that matter to your coaching style. Start simple and add more as you go." />

      <div className="px-4 pb-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-[3px] border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <Trophy size={28} className="text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700">{search || resultFilter !== 'All' ? 'No games match' : 'No games yet'}</p>
            <p className="text-sm text-slate-400 mt-1">Tap "New Game" to add a game</p>
          </div>
        ) : (
          <>
            {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(game => (
              <div key={game.id}>
                <GameCard
                  game={game}
                  teamName={teamMap[game.team_id]}
                  onEdit={g => navigate(`/games/${g.id}/edit`)}
                  onDelete={handleDelete}
                  onViewSummary={g => setSummaryGame(g)}
                  onStart={g => navigate(`/games/${g.id}/live`)}
                />
                {deleteConfirm?.id === game.id && (
                  <p className="text-xs text-red-500 text-center mt-1 animate-pulse">Tap delete again to confirm</p>
                )}
              </div>
            ))}
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPage={setPage} />
          </>
        )}
      </div>

      {summaryGame && (
        <GameSummary
          game={summaryGame}
          teamName={teamMap[summaryGame.team_id]}
          onClose={() => setSummaryGame(null)}
          onEdit={g => { setSummaryGame(null); navigate(`/games/${g.id}/edit`); }}
          onStart={g => { setSummaryGame(null); navigate(`/games/${g.id}/live`); }}
        />
      )}
    </div>
  );
}