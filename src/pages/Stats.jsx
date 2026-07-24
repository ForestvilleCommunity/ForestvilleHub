import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import DrillAnalyticsModal from '@/components/stats/DrillAnalyticsModal';
import GameAnalyticsModal from '@/components/stats/GameAnalyticsModal';
import { BarChart2, Calendar, Trophy, Clock, Target, TrendingUp, Dumbbell, Shield, Sparkles } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/api/db';
import { getAccessibleTeams } from '@/lib/teamAccess';
import { getActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';
import { format } from 'date-fns';

const RESULT_COLORS = {
  Win:  'text-green-600 bg-green-50',
  Loss: 'text-red-600 bg-red-50',
  Draw: 'text-amber-600 bg-amber-50',
  TBD:  'text-slate-500 bg-slate-100',
};

const RESULT_BAR_COLORS = {
  Win:  '#16a34a',
  Loss: '#dc2626',
  Draw: '#d97706',
  TBD:  '#94a3b8',
};

function safeParseStats(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return []; }
}

// Groups timeline data into readable buckets based on density
function bucketTimeline(timeline) {
  const valid = timeline.filter(p => p.rawDate || p.date);
  if (valid.length <= 10) return valid;

  const sorted = [...valid].sort((a, b) => new Date(a.rawDate || 0) - new Date(b.rawDate || 0));
  const n = sorted.length;
  const monthly = n > 30;

  const groups = {};
  sorted.forEach(p => {
    if (!p.rawDate) return;
    const d = new Date(p.rawDate + 'T00:00:00');
    let key, label;
    if (monthly) {
      key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      label = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    } else {
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
      const week = Math.ceil((d.getDate() + firstDay) / 7);
      key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}-W${week}`;
      label = `W${week}`;
    }
    if (!groups[key]) groups[key] = { date: label, targets: [], results: [] };
    groups[key].targets.push(p.target);
    groups[key].results.push(p.result);
  });

  return Object.values(groups).map(g => ({
    date: g.date,
    target: Math.round(g.targets.reduce((s, v) => s + v, 0) / g.targets.length * 10) / 10,
    result: Math.round(g.results.reduce((s, v) => s + v, 0) / g.results.length * 10) / 10,
  })).slice(-12);
}

export default function Stats() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [activeTeam, setActiveTeamState] = useState(getActiveTeam());
  const [selectedStatChart, setSelectedStatChart] = useState('');
  const [showDrillModal, setShowDrillModal] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [gameModalInitStat, setGameModalInitStat] = useState('');
  const [rebTab, setRebTab] = useState('DReb%');
  const [showAllThemes, setShowAllThemes] = useState(false);

  useEffect(() => {
    const unsub = subscribeActiveTeam(t => setActiveTeamState(t));
    return unsub;
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setSummary(null);
      const user = await db.auth.me();
      const activeTeamSnap = getActiveTeam();
      const teams = await getAccessibleTeams(user);
      const teamIds = activeTeamSnap ? [activeTeamSnap.id] : teams.map(t => t.id);

      if (teamIds.length === 0) { setSummary({ noTeams: true }); setLoading(false); return; }

      const [teamSessions, ownSessions, allGames] = await Promise.all([
        Promise.all(teamIds.map(tid => db.entities.Session.filter({ team_id: tid }))).then(r => r.flat()),
        activeTeamSnap ? Promise.resolve([]) : db.entities.Session.filter({ owner_id: user.id }, '-date').catch(() => []),
        Promise.all(teamIds.map(tid => db.entities.Game.filter({ team_id: tid }))).then(r => r.flat()),
      ]);
      const allSessions = [...teamSessions];
      ownSessions.forEach(s => { if (!allSessions.find(m => m.id === s.id)) allSessions.push(s); });

      const completedSessions = allSessions.filter(s => s.status === 'Completed');

      let allSessionDrills = [];
      if (completedSessions.length > 0) {
        const chunks = await Promise.all(completedSessions.map(s => db.entities.SessionDrill.filter({ session_id: s.id })));
        allSessionDrills = chunks.flat();
      }

      const totalMins = allSessionDrills.reduce((sum, sd) => sum + (Number(sd.duration) || 0), 0);

      let drillMap = {};
      if (allSessionDrills.length > 0) {
        const drillIds = [...new Set(allSessionDrills.map(sd => sd.drill_id).filter(Boolean))];
        const drills = await Promise.all(drillIds.map(id => db.entities.Drill.get(id).catch(() => null)));
        drills.filter(Boolean).forEach(d => { drillMap[d.id] = d; });
      }

      const drillThemes = {};
      allSessionDrills.forEach(sd => {
        const d = drillMap[sd.drill_id];
        if (d?.theme) drillThemes[d.theme] = (drillThemes[d.theme] || 0) + 1;
      });
      const topThemes = Object.entries(drillThemes).sort((a, b) => b[1] - a[1]).slice(0, 6);

      const sessionDateMap = {};
      completedSessions.forEach(s => { sessionDateMap[s.id] = s.date; });

      const drillUsageMap = {};
      allSessionDrills.filter(sd => sd.status === 'Completed').forEach(sd => {
        const key = sd.drill_id;
        if (!key) return;
        if (!drillUsageMap[key]) {
          drillUsageMap[key] = { name: drillMap[key]?.name || 'Unknown Drill', count: 0, totalMins: 0, goalPcts: [], goalTimeline: [] };
        }
        drillUsageMap[key].count++;
        drillUsageMap[key].totalMins += Number(sd.duration) || 0;
        if (sd.goal_target && sd.goal_result) {
          const tNum = Number(sd.goal_target);
          const rNum = Number(sd.goal_result);
          if (!isNaN(tNum) && !isNaN(rNum) && tNum !== 0) {
            drillUsageMap[key].goalPcts.push(Math.round((rNum / tNum) * 100));
            drillUsageMap[key].goalTimeline.push({
              rawDate: sessionDateMap[sd.session_id] || '',
              date: sessionDateMap[sd.session_id] ? format(new Date(sessionDateMap[sd.session_id] + 'T00:00:00'), 'd/M') : '?',
              target: tNum,
              result: rNum,
            });
          }
        }
      });
      // Sort goalTimeline by date ascending
      Object.values(drillUsageMap).forEach(d => {
        d.goalTimeline.sort((a, b) => new Date(a.rawDate || 0) - new Date(b.rawDate || 0));
      });
      const drillUsage = Object.values(drillUsageMap)
        .sort((a, b) => b.count - a.count)
        .map(d => ({
          ...d,
          avgGoalPct: d.goalPcts.length > 0 ? Math.round(d.goalPcts.reduce((s, v) => s + v, 0) / d.goalPcts.length) : null,
        }));

      // Newest first for preview lists
      const gamesSortedDesc = [...allGames].sort((a, b) => new Date(b.game_date) - new Date(a.game_date));

      // DReb% per game (newest first)
      const drebGames = [];
      gamesSortedDesc.forEach(g => {
        const gs = safeParseStats(g.team_stats);
        const drebStat = gs.find(s => s.name === 'Our Defensive Rebounds' || /^(def\.?\s*reb|dreb)/i.test(s.name));
        const oppOrebStat = gs.find(s => s.name === 'Opponent Offensive Rebounds' || /^opp(onent)?\s*(off|oreb)/i.test(s.name));
        if (drebStat && oppOrebStat) {
          const d = Number(drebStat.result) || 0;
          const o = Number(oppOrebStat.result) || 0;
          const total = d + o;
          if (total > 0) drebGames.push({ opponent: g.opponent, date: g.game_date ? format(new Date(g.game_date + 'T00:00:00'), 'd MMM') : '', drebPct: Math.round((d / total) * 100) });
        }
      });

      // OReb% per game (newest first)
      const orebGames = [];
      gamesSortedDesc.forEach(g => {
        const gs = safeParseStats(g.team_stats);
        const orebStat = gs.find(s => s.name === 'Our Offensive Rebounds' || /^(off\.?\s*reb|oreb)/i.test(s.name));
        const oppDrebStat = gs.find(s => s.name === 'Opponent Defensive Rebounds' || /^opp(onent)?\s*(def|dreb)/i.test(s.name));
        if (orebStat && oppDrebStat) {
          const o = Number(orebStat.result) || 0;
          const d = Number(oppDrebStat.result) || 0;
          const total = o + d;
          if (total > 0) orebGames.push({ opponent: g.opponent, date: g.game_date ? format(new Date(g.game_date + 'T00:00:00'), 'd MMM') : '', orebPct: Math.round((o / total) * 100) });
        }
      });

      // Games for stat chart (ascending for timeline)
      const gamesForChart = [...allGames]
        .filter(g => g.team_stats)
        .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
        .map(g => ({
          opponent: g.opponent,
          date: g.game_date ? format(new Date(g.game_date + 'T00:00:00'), 'd MMM') : '',
          result: g.result || 'TBD',
          stats: safeParseStats(g.team_stats),
        }));

      const latestGame = gamesSortedDesc[0] || null;
      const latestGameStats = latestGame?.team_stats
        ? safeParseStats(latestGame.team_stats).filter(s => (s.result || 0) > 0)
        : [];

      setSummary({
        sessionsTotal: allSessions.length,
        sessionsCompleted: completedSessions.length,
        gamesRecorded: allGames.length,
        totalMins,
        drillsDone: allSessionDrills.filter(sd => sd.status === 'Completed').length,
        drillsTotal: allSessionDrills.length,
        topThemes,
        drillUsage,
        drebGames,
        orebGames,
        gamesForChart,
        latestGame,
        latestGameStats,
      });
      setLoading(false);
    };
    load().catch(() => setLoading(false));
  }, [activeTeam]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );

  if (!summary || summary?.noTeams) return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <BarChart2 size={40} className="mx-auto text-slate-300 mb-4" />
      <h2 className="font-bold text-slate-700 text-xl mb-2">No teams yet</h2>
      <p className="text-slate-500 text-sm">Create a team and start recording sessions and games to see your stats.</p>
    </div>
  );

  const {
    sessionsTotal, sessionsCompleted, gamesRecorded, totalMins,
    drillsDone, drillsTotal, topThemes, drillUsage, drebGames, orebGames,
    gamesForChart, latestGame, latestGameStats,
  } = summary;

  const maxThemeCount = topThemes[0]?.[1] || 1;
  const maxDrillCount = drillUsage[0]?.count || 1;

  const rawStatNames = [...new Set((gamesForChart || []).flatMap(g => g.stats.map(s => s.name)))].sort();
  const allStatNames = ['DReb%', 'OReb%', ...rawStatNames];
  const chartStat = selectedStatChart || allStatNames[0] || '';
  const isPercentStat = chartStat === 'DReb%' || chartStat === 'OReb%';

  const chartData = (() => {
    if (chartStat === 'DReb%') {
      return (gamesForChart || []).map(g => {
        const d = Number(g.stats.find(s => s.name === 'Our Defensive Rebounds')?.result) || 0;
        const o = Number(g.stats.find(s => s.name === 'Opponent Offensive Rebounds')?.result) || 0;
        const total = d + o;
        if (!total) return null;
        return { label: `vs. ${g.opponent}`, date: g.date, result: g.result, value: Math.round((d / total) * 100) };
      }).filter(Boolean);
    }
    if (chartStat === 'OReb%') {
      return (gamesForChart || []).map(g => {
        const o = Number(g.stats.find(s => s.name === 'Our Offensive Rebounds')?.result) || 0;
        const d = Number(g.stats.find(s => s.name === 'Opponent Defensive Rebounds')?.result) || 0;
        const total = o + d;
        if (!total) return null;
        return { label: `vs. ${g.opponent}`, date: g.date, result: g.result, value: Math.round((o / total) * 100) };
      }).filter(Boolean);
    }
    return (gamesForChart || []).map(g => ({
      label: `vs. ${g.opponent}`, date: g.date, result: g.result,
      value: g.stats.find(s => s.name === chartStat)?.result ?? null,
    })).filter(d => d.value !== null);
  })();

  // Preview: newest 3 (chartData is ascending, slice(-3) gets most recent)
  const displayChartData = chartData.slice(-3).reverse();
  const maxChartVal = Math.max(...displayChartData.map(d => Number(d.value) || 0), 1);

  // Active rebounding data
  const activeRebGames = rebTab === 'DReb%' ? drebGames : orebGames;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-black text-2xl text-slate-900">Stats Overview</h1>
          <p className="text-slate-500 text-sm mt-0.5">{activeTeam ? activeTeam.team_name : 'Your coaching activity at a glance'}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl px-3 py-1.5">
          <Sparkles size={13} className="text-purple-500" />
          <span className="text-xs font-semibold text-purple-700">Insights</span>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Calendar size={18} className="text-blue-600" />} label="Sessions Completed" value={sessionsCompleted} sub={`of ${sessionsTotal} planned`} color="bg-blue-50" />
        <StatCard icon={<Trophy size={18} className="text-amber-600" />} label="Games Recorded" value={gamesRecorded} color="bg-amber-50" />
        <StatCard icon={<Clock size={18} className="text-green-600" />} label="Training Minutes" value={totalMins} color="bg-green-50" />
        <StatCard icon={<Target size={18} className="text-purple-600" />} label="Drills Run" value={drillsDone} sub={drillsTotal > 0 ? `of ${drillsTotal} assigned` : undefined} color="bg-purple-50" />
      </div>

      {/* Game Analysis */}
      {gamesRecorded > 0 && (
        <div>
          <SectionHeader icon={<Trophy size={15} />} title="Game Analysis" />

          {/* Result vs Stat */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} className="text-slate-500" />
                <h2 className="font-bold text-slate-900">Result vs Stat</h2>
              </div>
              {allStatNames.length > 0 && (
                <Select value={chartStat} onValueChange={setSelectedStatChart}>
                  <SelectTrigger className="text-xs h-8 w-36 border-slate-200 text-slate-700 bg-white">
                    <SelectValue placeholder="Select stat" />
                  </SelectTrigger>
                  <SelectContent>
                    {allStatNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            {displayChartData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Track stats in Live Game to see patterns here.</p>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-3">Most recent games</p>
                <div className="space-y-2.5">
                  {displayChartData.map((d, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500 truncate max-w-[60%]">{d.label} <span className="text-slate-400">{d.date}</span></span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${RESULT_COLORS[d.result] || RESULT_COLORS.TBD}`}>{d.result}</span>
                          <span className="text-sm font-black text-slate-800 w-12 text-right">{isPercentStat ? `${d.value}%` : d.value}</span>
                        </div>
                      </div>
                      <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.max((Number(d.value) / maxChartVal) * 100, 4)}%`, background: RESULT_BAR_COLORS[d.result] || RESULT_BAR_COLORS.TBD }} />
                      </div>
                    </div>
                  ))}
                </div>
                {chartData.length > 3 && (
                  <button onClick={() => { setGameModalInitStat(''); setShowGameModal(true); }}
                    className="mt-3 w-full text-xs font-semibold text-blue-600 hover:text-blue-800 py-2 rounded-xl hover:bg-blue-50 transition-colors">
                    See More ({chartData.length - 3} more games)
                  </button>
                )}
              </>
            )}
          </div>

          {/* Rebounding Efficiency — combined DReb% + OReb% */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-slate-500" />
                <h2 className="font-bold text-slate-900">Rebounding Efficiency</h2>
              </div>
              {/* Segmented toggle */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                {['DReb%', 'OReb%'].map(tab => (
                  <button key={tab} onClick={() => setRebTab(tab)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${rebTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Definition */}
            <div className="mb-4">
              {rebTab === 'DReb%' ? (
                <div>
                  <p className="text-xs text-slate-600">How often we secure rebounds on our defensive end.</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">DReb ÷ (DReb + Opp OReb)</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-slate-600">How often we win second-chance rebounds on offense.</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">OReb ÷ (OReb + Opp DReb)</p>
                </div>
              )}
            </div>

            {activeRebGames.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {rebTab === 'DReb%'
                  ? <>Track <strong className="text-slate-600">Our Def. Rebounds</strong> + <strong className="text-slate-600">Opp. Off. Rebounds</strong> to unlock.</>
                  : <>Track <strong className="text-slate-600">Our Off. Rebounds</strong> + <strong className="text-slate-600">Opp. Def. Rebounds</strong> to unlock.</>
                }
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {activeRebGames.slice(0, 3).map((g, i) => {
                    const pct = rebTab === 'DReb%' ? g.drebPct : g.orebPct;
                    const good = rebTab === 'DReb%' ? pct >= 70 : pct >= 35;
                    const ok = rebTab === 'DReb%' ? pct >= 50 : pct >= 25;
                    const color = good ? '#16a34a' : ok ? '#d97706' : '#dc2626';
                    const textColor = good ? 'text-green-600' : ok ? 'text-amber-600' : 'text-red-500';
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">vs. {g.opponent} <span className="text-slate-400">{g.date}</span></span>
                          <span className={`text-sm font-black ${textColor}`}>{pct}%</span>
                        </div>
                        <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {activeRebGames.length > 3 && (
                  <button onClick={() => { setGameModalInitStat(rebTab); setShowGameModal(true); }}
                    className="mt-3 w-full text-xs font-semibold text-blue-600 hover:text-blue-800 py-2 rounded-xl hover:bg-blue-50 transition-colors">
                    See More ({activeRebGames.length - 3} more games)
                  </button>
                )}
              </>
            )}
          </div>

          {/* Latest Game */}
          {latestGame && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3"><Trophy size={16} className="text-slate-500" /><h2 className="font-bold text-slate-900">Latest Game</h2></div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1">
                  <p className="font-bold text-slate-900">vs. {latestGame.opponent}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{latestGame.game_date ? format(new Date(latestGame.game_date + 'T00:00:00'), 'd MMM yyyy') : '—'}</p>
                </div>
                {(latestGame.our_score != null || latestGame.opponent_score != null) && <p className="text-2xl font-black text-slate-900">{latestGame.our_score ?? '—'} – {latestGame.opponent_score ?? '—'}</p>}
                {latestGame.result && <span className={`text-xs font-bold px-3 py-1 rounded-full ${RESULT_COLORS[latestGame.result] || RESULT_COLORS.TBD}`}>{latestGame.result}</span>}
              </div>
              {latestGameStats.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {latestGameStats.slice(0, 6).map((stat, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500 truncate">{stat.name}</span>
                      <span className="text-sm font-bold text-slate-900 shrink-0 ml-2">{stat.result}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Team Practice Insights */}
      {(topThemes.length > 0 || drillUsage.length > 0) && (
        <div>
          <SectionHeader icon={<Dumbbell size={15} />} title="Team Practice Insights" />

          {topThemes.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
              <div className="flex items-center gap-2 mb-4"><TrendingUp size={16} className="text-slate-500" /><h2 className="font-bold text-slate-900">Most Trained Themes</h2></div>
              <div className="space-y-3">
                {(showAllThemes ? topThemes : topThemes.slice(0, 3)).map(([theme, count]) => (
                  <div key={theme} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-28 shrink-0">{theme}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full bg-slate-800 rounded-full" style={{ width: `${(count / maxThemeCount) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-500 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
              {topThemes.length > 3 && (
                <button onClick={() => setShowAllThemes(v => !v)}
                  className="mt-3 w-full text-xs font-semibold text-blue-600 hover:text-blue-800 py-2 rounded-xl hover:bg-blue-50 transition-colors">
                  {showAllThemes ? 'Show Less' : `See More (${topThemes.length - 3} more themes)`}
                </button>
              )}
            </div>
          )}

          {drillUsage.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4"><Dumbbell size={16} className="text-slate-500" /><h2 className="font-bold text-slate-900">Most Used Drills</h2></div>
              <div className="space-y-5">
                {drillUsage.slice(0, 3).map((d, i) => {
                  const rawPoints = bucketTimeline(d.goalTimeline || []);
                  const chartPoints = rawPoints.slice(-10);
                  const maxDataVal = Math.max(...chartPoints.map(p => Math.max(p.target || 0, p.result || 0)), 1);
                  const yMax = maxDataVal <= 20 ? 20 : maxDataVal <= 50 ? 50 : maxDataVal <= 100 ? 100 : Math.ceil(maxDataVal * 1.2);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-slate-700 font-semibold truncate max-w-[55%]">{d.name}</span>
                        <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
                          {d.totalMins > 0 && <span>{d.totalMins} min</span>}
                          <span className="font-bold text-slate-700">{d.count}×</span>
                        </div>
                      </div>
                      <div className="bg-slate-100 rounded-full h-2 overflow-hidden mb-3">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(d.count / maxDrillCount) * 100}%` }} />
                      </div>
                      {chartPoints.length >= 2 ? (
                        <div className="mt-3">
                          <ResponsiveContainer width="100%" height={130}>
                            <LineChart data={chartPoints} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                              />
                              <YAxis
                                domain={[0, yMax]}
                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                tickLine={false}
                                axisLine={false}
                                width={28}
                              />
                              <Tooltip
                                contentStyle={{ fontSize: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '6px 10px' }}
                                formatter={(value, name) => [value, name.charAt(0).toUpperCase() + name.slice(1)]}
                              />
                              <Legend
                                iconType="circle"
                                iconSize={8}
                                wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
                                formatter={(value) => <span style={{ color: '#64748b' }}>{value.charAt(0).toUpperCase() + value.slice(1)}</span>}
                              />
                              <Line type="monotone" dataKey="target" name="target" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                              <Line type="monotone" dataKey="result" name="result" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                            </LineChart>
                          </ResponsiveContainer>
                          {d.avgGoalPct !== null && <p className="text-xs text-slate-400 mt-1">Avg: {d.avgGoalPct}% of target</p>}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-2 italic">Complete this drill again to unlock progress trends.</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {drillUsage.length > 3 && (
                <button onClick={() => setShowDrillModal(true)}
                  className="mt-3 w-full text-xs font-semibold text-blue-600 hover:text-blue-800 py-2 rounded-xl hover:bg-blue-50 transition-colors">
                  See More ({drillUsage.length - 3} more drills)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Coaching nudge */}
      {(sessionsCompleted < 5 || gamesRecorded < 3) && sessionsCompleted + gamesRecorded > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-xl shrink-0">📈</span>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {sessionsCompleted < 3
                ? `Track ${Math.max(3 - sessionsCompleted, 1)} more sessions to unlock stronger player trends.`
                : gamesRecorded < 3
                  ? `Record ${Math.max(3 - gamesRecorded, 1)} more games to reveal win/loss patterns.`
                  : 'More game data improves your coaching insights.'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">CoachPad gets smarter the more you coach.</p>
          </div>
        </div>
      )}

      {sessionsCompleted === 0 && gamesRecorded === 0 && (
        <div className="text-center py-8 text-slate-400">
          <BarChart2 size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No activity yet</p>
          <p className="text-xs mt-1">Complete sessions and games to see your stats here</p>
        </div>
      )}

      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-2xl p-4 flex items-center gap-3">
        <Sparkles size={20} className="text-purple-400 shrink-0" />
        <div>
          <p className="text-sm font-bold text-purple-900">Advanced Insights — Coming Soon</p>
          <p className="text-xs text-purple-600 mt-0.5">Player development tracking, trend analysis, and season reports.</p>
        </div>
      </div>

      {showDrillModal && (
        <DrillAnalyticsModal
          drills={drillUsage.map(d => ({ ...d, timeline: bucketTimeline(d.goalTimeline || []) }))}
          title="Team Drill Analytics"
          onClose={() => setShowDrillModal(false)}
        />
      )}
      {showGameModal && (
        <GameAnalyticsModal
          games={gamesForChart || []}
          allStatNames={allStatNames}
          initialStat={gameModalInitStat}
          onClose={() => setShowGameModal(false)}
        />
      )}
    </div>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-slate-400">{icon}</span>
      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h2>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className={`rounded-2xl border border-slate-200 p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-semibold text-slate-500">{label}</span></div>
      <p className="text-3xl font-black text-slate-900">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}