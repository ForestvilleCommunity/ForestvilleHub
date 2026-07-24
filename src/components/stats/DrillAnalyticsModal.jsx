import { useState } from 'react';
import { X, Search, Dumbbell } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function DrillAnalyticsModal({ drills, title = 'Drill Analytics', onClose }) {
  const [search, setSearch] = useState('');

  const filtered = drills.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-black text-lg text-slate-900">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{drills.length} drill{drills.length !== 1 ? 's' : ''} tracked</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search drills..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Dumbbell size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No drills match your search</p>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-6">
              {filtered.map((d, i) => {
                const timeline = d.timeline || d.goalTimeline || [];
                const hasChart = timeline.length >= 2;
                const maxVal = hasChart
                  ? Math.max(...timeline.map(p => Math.max(p.target || 0, p.result || 0)), 1)
                  : 1;
                const yDomain = [0, Math.ceil(maxVal * 1.15) || 10];

                return (
                  <div key={i} className="pb-5 border-b border-slate-100 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-bold text-slate-900 flex-1 mr-2">{d.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.totalMins > 0 && <span className="text-xs text-slate-400">{d.totalMins}m</span>}
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{d.count}×</span>
                      </div>
                    </div>
                    {d.theme && <p className="text-xs text-slate-400 mb-2">{d.theme}</p>}

                    {hasChart ? (
                      <>
                        <div className="flex items-center gap-3 mb-1.5">
                          <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-blue-500 rounded" /><span className="text-xs text-slate-400">Target</span></div>
                          <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-orange-500 rounded" /><span className="text-xs text-slate-400">Result</span></div>
                        </div>
                        <ResponsiveContainer width="100%" height={95}>
                          <LineChart data={timeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                            <YAxis domain={yDomain} tick={{ fontSize: 9, fill: '#94a3b8' }} width={28} tickCount={4} />
                            <Line type="monotone" dataKey="target" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="result" stroke="#f97316" strokeWidth={2} dot={{ r: 2.5, fill: '#f97316' }} />
                            <Tooltip contentStyle={{ fontSize: '11px', padding: '4px 8px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                          </LineChart>
                        </ResponsiveContainer>
                        {d.avgGoalPct != null && (
                          <p className="text-xs text-slate-400 mt-1">Avg achievement: <span className="font-semibold text-slate-600">{d.avgGoalPct}%</span></p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 italic py-2">Complete this drill again to unlock progress trends.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}