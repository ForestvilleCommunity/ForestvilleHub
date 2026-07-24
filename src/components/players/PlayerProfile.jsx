import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowLeft, User, Clock, Target, Calendar, CheckCircle2, TrendingUp, MessageSquare, Percent } from 'lucide-react';
import { db } from '@/api/db';
import { format } from 'date-fns';

const DEV_CATEGORIES = [
  'Ball Handling', 'Finishing', 'Shooting', 'Passing', 'Decision Making',
  'Defense', 'Footwork', 'Transition', 'Confidence', 'Basketball IQ', 'Rebounding', 'Athletic Movement',
];

function parsePlayerIds(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return []; }
}

function getProgressStatus(dataPoints) {
  const numeric = dataPoints.filter(p => !isNaN(parseFloat(p.target)) && !isNaN(parseFloat(p.result)) && parseFloat(p.target) !== 0);
  if (numeric.length === 0) return 'none';
  const avg = numeric.reduce((s, p) => s + parseFloat(p.result) / parseFloat(p.target), 0) / numeric.length;
  if (avg >= 0.88) return 'strong';
  if (avg >= 0.68) return 'improving';
  return 'attention';
}

const SNAP_CONFIG = {
  strong:    { label: 'Strong Progress',    color: 'bg-green-50 border-green-200 text-green-700', dot: 'bg-green-500' },
  improving: { label: 'Improving',          color: 'bg-blue-50 border-blue-200 text-blue-700',    dot: 'bg-blue-500' },
  attention: { label: 'Needs More Practice',color: 'bg-red-50 border-red-200 text-red-600',       dot: 'bg-red-500' },
  none:      { label: 'Not Yet Tracked',    color: 'bg-slate-50 border-slate-200 text-slate-400', dot: 'bg-slate-300' },
};

function niceMax(val) {
  if (!val || val <= 5) return 10;
  const steps = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300];
  const target = val * 1.25;
  return steps.find(s => s >= target) || Math.ceil(target / 10) * 10;
}

export default function PlayerProfile({ player, teamName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => { if (player) load(); }, [player]);

  const load = async () => {
    setLoading(true);
    try {
      const me = await db.auth.me().catch(() => null);

      // Private sessions linked to this player
      const [owned, teamSessions, attendanceRecords] = await Promise.all([
        me ? db.entities.Session.filter({ session_type: 'Private', owner_user_email: me.email }).catch(() => []) : Promise.resolve([]),
        player.team_id ? db.entities.Session.filter({ team_id: player.team_id, status: 'Completed' }).catch(() => []) : Promise.resolve([]),
        db.entities.AttendanceRecord.filter({ player_id: player.id }).catch(() => []),
      ]);
      const presentSessionIds = new Set(attendanceRecords.filter(r => r.status === 'Present' || r.status === 'Late').map(r => r.session_id));
      const attendanceTotal = attendanceRecords.length;
      const attendancePresentLike = attendanceRecords.filter(r => r.status === 'Present' || r.status === 'Late' || r.status === 'Excused').length;
      const attendanceRate = attendanceTotal > 0 ? Math.round((attendancePresentLike / attendanceTotal) * 100) : null;
      const privateMatches = owned.filter(s => parsePlayerIds(s.player_ids).includes(player.id));
      const teamMatches = teamSessions.filter(s => presentSessionIds.has(s.id));
      const allPlayerSessions = [...privateMatches];
      teamMatches.forEach(s => { if (!allPlayerSessions.find(m => m.id === s.id)) allPlayerSessions.push(s); });
      const completed = allPlayerSessions.filter(s => s.status === 'Completed');

      // Load all SessionDrills for completed sessions (single batched query, not one per session)
      let sessionDrills = [];
      if (completed.length > 0) {
        const all = await db.entities.SessionDrill.filter({ session_id: completed.map(s => s.id) }).catch(() => []);
        sessionDrills = all.filter(sd => sd.status === 'Completed');
      }

      // Enrich with session date
      const sessionDateMap = {};
      completed.forEach(s => { sessionDateMap[s.id] = s.date; });

      // Total training time
      const totalMins = sessionDrills.reduce((s, sd) => s + (Number(sd.duration) || 0), 0);

      // Goals completed (has both target and result)
      const goalsCompleted = sessionDrills.filter(sd => sd.goal_target && sd.goal_result).length;

      // Fetch drill names for records without drill_name (single batched query, not one per drill)
      const idsNeeded = [...new Set(sessionDrills.filter(sd => sd.drill_id && !sd.drill_name).map(sd => sd.drill_id))];
      const drillMap = {};
      if (idsNeeded.length > 0) {
        const drills = await db.entities.Drill.filter({ id: idsNeeded }).catch(() => []);
        drills.forEach(d => { drillMap[d.id] = d; });
      }

      // Enrich sessionDrills with drill name + category
      const enriched = sessionDrills.map(sd => ({
        ...sd,
        resolvedName: sd.drill_name || drillMap[sd.drill_id]?.name || 'Unknown Drill',
        resolvedCategory: sd.focus_category || drillMap[sd.drill_id]?.theme || null,
        sessionDate: sessionDateMap[sd.session_id] || null,
      }));

      // Category frequency map
      const catMap = {};
      enriched.forEach(sd => {
        const cat = sd.resolvedCategory;
        if (!cat || !DEV_CATEGORIES.includes(cat)) return;
        if (!catMap[cat]) catMap[cat] = { count: 0, dataPoints: [] };
        catMap[cat].count++;
        if (sd.goal_target && sd.goal_result) {
          catMap[cat].dataPoints.push({ target: sd.goal_target, result: sd.goal_result });
        }
      });
      const categories = Object.entries(catMap)
        .map(([name, v]) => ({ name, count: v.count, status: getProgressStatus(v.dataPoints) }))
        .sort((a, b) => b.count - a.count);

      // Top drills
      const drillUsage = {};
      enriched.forEach(sd => {
        const key = sd.drill_id || sd.resolvedName;
        if (!drillUsage[key]) drillUsage[key] = { name: sd.resolvedName, category: sd.resolvedCategory, count: 0, points: [] };
        drillUsage[key].count++;
        if (sd.goal_target && sd.goal_result && sd.sessionDate) {
          drillUsage[key].points.push({ date: sd.sessionDate, target: sd.goal_target, result: sd.goal_result });
        }
      });
      const topDrills = Object.values(drillUsage).sort((a, b) => b.count - a.count).slice(0, 5);

      // Coach notes timeline — from sessionDrills + sessions
      const notes = [];
      enriched.forEach(sd => {
        if (sd.session_notes?.trim()) {
          notes.push({ date: sd.sessionDate, text: sd.session_notes, drill: sd.resolvedName });
        }
      });
      completed.forEach(s => {
        if (s.notes?.trim()) notes.push({ date: s.date, text: s.notes, drill: null });
      });
      notes.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      setData({ totalSessions: completed.length, totalMins, goalsCompleted, attendanceRate, categories, topDrills, notes });
    } catch {
      setData({ error: true });
    }
    setLoading(false);
  };

  const dob = player.date_of_birth;
  const age = dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000)) : null;
  const hasData = data && !data.error && (data.totalSessions > 0 || data.categories.length > 0);

  return (
    <div className="bg-slate-50 min-h-full pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-4 pt-4 pb-6 text-white">
        <button onClick={onClose} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-4 transition-colors">
          <ArrowLeft size={16} /> Players
        </button>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-slate-700 rounded-2xl flex items-center justify-center text-white text-2xl font-black shrink-0">
            {player.jersey_number != null ? `#${player.jersey_number}` : <User size={24} />}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-2xl leading-tight">{player.name}</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {[teamName, player.position, age && `Age ${age}`].filter(Boolean).join(' · ')}
            </p>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {player.status && player.status !== 'Active' && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{player.status}</span>
              )}
              {player.injury_status && player.injury_status !== 'Healthy' && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{player.injury_status}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3">
        {/* Quick stats row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard icon={<Calendar size={16} />} value={data?.totalSessions ?? '—'} label="Sessions" loading={loading} />
          <StatCard icon={<Clock size={16} />} value={data?.totalMins ? `${data.totalMins}m` : '—'} label="Training Time" loading={loading} />
          <StatCard icon={<CheckCircle2 size={16} />} value={data?.goalsCompleted ?? '—'} label="Goals Hit" loading={loading} />
          <StatCard icon={<Percent size={16} />} value={data?.attendanceRate != null ? `${data.attendanceRate}%` : '—'} label="Attendance" loading={loading} />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : !hasData ? (
          <EmptyState />
        ) : (
          <>
            {/* Development Snapshot */}
            {data.categories.length > 0 && (
              <Section title="Progress Snapshot" icon={<TrendingUp size={14} />}>
              <p className="text-xs text-slate-400 -mt-1 mb-3">A quick look at how each area is coming along</p>
                <div className="grid grid-cols-2 gap-2">
                  {data.categories.slice(0, 6).map(cat => {
                    const cfg = SNAP_CONFIG[cat.status];
                    return (
                      <div key={cat.name} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${cfg.color}`}>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{cat.name}</p>
                          <p className="text-xs opacity-70">{cfg.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Most Trained Skills bar chart */}
            {data.categories.length > 0 && (
              <Section title="Most Practiced Skills">
                <div className="space-y-2.5">
                  {data.categories.slice(0, 6).map(cat => {
                    const max = data.categories[0].count;
                    const pct = Math.round((cat.count / max) * 100);
                    return (
                      <div key={cat.name} className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-28 shrink-0 truncate">{cat.name}</span>
                        <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-6 text-right shrink-0">{cat.count}</span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Top Drills + Progression */}
            {data.topDrills.length > 0 && (
              <Section title="How They're Improving" icon={<Target size={14} />}>
                <p className="text-xs text-slate-400 mb-4">How they're tracking against goals over time</p>
                <div className="space-y-6">
                  {data.topDrills.slice(0, 3).map((d, i) => {
                    const chartData = d.points
                      .filter(p => !isNaN(parseFloat(p.target)) && !isNaN(parseFloat(p.result)))
                      .sort((a, b) => new Date(a.date) - new Date(b.date))
                      .map(p => ({
                        date: format(new Date(p.date + 'T12:00:00'), 'd MMM'),
                        Target: parseFloat(p.target),
                        Result: parseFloat(p.result),
                      }));
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-bold text-slate-800 flex-1 truncate">{d.name}</p>
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg shrink-0">{d.count}×</span>
                        </div>
                        {chartData.length >= 2 ? (
                          <>
                            <div className="flex items-center gap-4 mb-2">
                              <LegendDot color="bg-blue-500" label="Goal" />
                              <LegendDot color="bg-orange-500" label="Result" />
                            </div>
                            <ResponsiveContainer width="100%" height={100}>
                              <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                <YAxis
                                  domain={[0, niceMax(Math.max(...chartData.map(p => Math.max(p.Target || 0, p.Result || 0))))]} 
                                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                                  width={28}
                                  tickCount={4}
                                />
                                <Line type="monotone" dataKey="Target" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                                <Line type="monotone" dataKey="Result" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} />
                                <Tooltip
                                  contentStyle={{ fontSize: '11px', padding: '4px 8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2.5">
                            {chartData.length === 1
                              ? `Latest: ${chartData[0].Result} / ${chartData[0].Target} · needs 2+ sessions for a trend`
                              : `${d.count} session${d.count !== 1 ? 's' : ''} · add goal targets to see trends`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Coach Notes Timeline */}
            {data.notes.length > 0 && (
              <Section title="Coach Observations" icon={<MessageSquare size={14} />}>
                <p className="text-xs text-slate-400 mb-3">A record of observations and moments that matter</p>
                <div className="space-y-3">
                  {data.notes.slice(0, 10).map((note, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5" />
                        {i < data.notes.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        {note.date && (
                          <p className="text-xs text-slate-400 mb-0.5">
                            {format(new Date(note.date + 'T12:00:00'), 'd MMM yyyy')}
                            {note.drill && <span className="text-slate-300"> · {note.drill}</span>}
                          </p>
                        )}
                        <p className="text-sm text-slate-700 leading-relaxed">{note.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* Player notes */}
        {player.notes && (
          <Section title="Profile Notes">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{player.notes}</p>
          </Section>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, loading }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-3 flex flex-col items-center gap-1 shadow-sm">
      <span className="text-slate-400">{icon}</span>
      <p className="text-2xl font-black text-slate-900">{loading ? '—' : value}</p>
      <p className="text-xs text-slate-400 text-center leading-tight">{label}</p>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-3">
      <div className="flex items-center gap-1.5 mb-3">
        {icon && <span className="text-slate-400">{icon}</span>}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-0.5 rounded-full ${color}`} />
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <TrendingUp size={28} className="text-blue-400" />
      </div>
      <p className="font-bold text-slate-700 mb-2">No development work yet</p>
      <p className="text-sm text-slate-400 leading-relaxed">
        This player hasn't completed any private development sessions yet.
      </p>
      <p className="text-xs text-blue-600 font-semibold mt-3">
        Create a private session and add this player to start building their progress story.
      </p>
    </div>
  );
}