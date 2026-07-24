import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, Calendar, Trophy, Clock, ChevronRight } from 'lucide-react';
import { db } from '@/api/db';
import { getAccessibleTeams } from '@/lib/teamAccess';

const RESULT_COLOR = { Win: 'text-green-600', Loss: 'text-red-600', Draw: 'text-amber-600', TBD: 'text-slate-400' };

export default function StatsPreview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = async () => {
      const user = await db.auth.me().catch(() => null);
      if (!user) return;
      const teams = await getAccessibleTeams(user);
      const teamIds = teams.map(t => t.id);
      if (!teamIds.length) return;

      const [allSessions, allGames] = await Promise.all([
        db.entities.Session.filter({ team_id: teamIds }).catch(() => []),
        db.entities.Game.filter({ team_id: teamIds }).catch(() => []),
      ]);

      const completed = allSessions.filter(s => s.status === 'Completed');
      const totalMins = completed.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
      const latestGame = [...allGames].sort((a, b) => new Date(b.game_date) - new Date(a.game_date))[0] || null;

      setData({ sessionsCompleted: completed.length, gamesRecorded: allGames.length, totalMins, latestGame });
    };
    load().catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-slate-500" />
          <p className="font-bold text-slate-900 text-sm">Activity</p>
        </div>
        <button onClick={() => navigate('/stats')}
          className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800">
          View Stats <ChevronRight size={12} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat icon={<Calendar size={13} className="text-blue-500" />} label="Sessions" value={data.sessionsCompleted} />
        <MiniStat icon={<Trophy size={13} className="text-amber-500" />} label="Games" value={data.gamesRecorded} />
        <MiniStat icon={<Clock size={13} className="text-green-500" />} label="Minutes" value={data.totalMins} />
      </div>
      {data.latestGame && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Last game: <span className="font-semibold text-slate-700">vs. {data.latestGame.opponent}</span>
          </p>
          <span className={`text-xs font-bold ${RESULT_COLOR[data.latestGame.result] || RESULT_COLOR.TBD}`}>
            {data.latestGame.result || 'TBD'}
          </span>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <p className="text-xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}