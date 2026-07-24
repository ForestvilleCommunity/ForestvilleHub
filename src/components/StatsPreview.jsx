import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, ChevronRight } from 'lucide-react';
import { db } from '@/api/db';
import { getAccessibleTeams } from '@/lib/teamAccess';

const RESULT_COLORS = {
  Win:  'text-green-700 bg-green-100',
  Loss: 'text-red-700 bg-red-100',
  Draw: 'text-amber-700 bg-amber-100',
  TBD:  'text-slate-500 bg-slate-100',
};

export default function StatsPreview({ user }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const teams = await getAccessibleTeams(user);
      const teamIds = teams.map(t => t.id);
      if (teamIds.length === 0) { setData({}); return; }

      const [sessions, games] = await Promise.all([
        Promise.all(teamIds.map(tid => db.entities.Session.filter({ team_id: tid }))).then(r => r.flat()),
        Promise.all(teamIds.map(tid => db.entities.Game.filter({ team_id: tid }))).then(r => r.flat()),
      ]);

      const completedSessions = sessions.filter(s => s.status === 'Completed');
      const totalMins = completedSessions.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
      const sortedGames = [...games].sort((a, b) => new Date(b.game_date) - new Date(a.game_date));

      setData({
        sessionsCompleted: completedSessions.length,
        gamesRecorded: games.length,
        totalMins,
        latestGame: sortedGames[0] || null,
      });
    };
    load().catch(() => setData({}));
  }, [user]);

  if (!data) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-slate-500" />
          <p className="font-bold text-sm text-slate-900">Stats Overview</p>
        </div>
        <button onClick={() => navigate('/stats')}
          className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
          View Stats <ChevronRight size={12} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <MiniStat label="Sessions" value={data.sessionsCompleted ?? 0} />
        <MiniStat label="Games" value={data.gamesRecorded ?? 0} />
        <MiniStat label="Train. Mins" value={data.totalMins ?? 0} />
      </div>

      {data.latestGame && (
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
          <span className="text-xs text-slate-400 shrink-0">Latest:</span>
          <span className="text-xs font-semibold text-slate-800 flex-1 truncate">
            vs. {data.latestGame.opponent}
          </span>
          {data.latestGame.result && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${RESULT_COLORS[data.latestGame.result] || RESULT_COLORS.TBD}`}>
              {data.latestGame.result}
              {data.latestGame.our_score != null
                ? ` ${data.latestGame.our_score}–${data.latestGame.opponent_score}`
                : ''}
            </span>
          )}
        </div>
      )}

      {!data.latestGame && data.sessionsCompleted === 0 && (
        <p className="text-xs text-slate-400 text-center py-1">
          Complete sessions and games to see activity here
        </p>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}