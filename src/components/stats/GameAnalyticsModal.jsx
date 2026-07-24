import { useState } from 'react';
import { X, BarChart2 } from 'lucide-react';

const RESULT_COLORS = {
  Win:  'text-green-600 bg-green-50',
  Loss: 'text-red-600 bg-red-50',
  Draw: 'text-amber-600 bg-amber-50',
  TBD:  'text-slate-500 bg-slate-100',
};
const RESULT_BAR = {
  Win: '#16a34a', Loss: '#dc2626', Draw: '#d97706', TBD: '#94a3b8',
};

export default function GameAnalyticsModal({ games, allStatNames, initialStat, onClose }) {
  const [statName, setStatName] = useState(initialStat || allStatNames[0] || '');
  const [resultFilter, setResultFilter] = useState('All');

  const chartData = (() => {
    if (statName === 'DReb%') {
      return games.map(g => {
        const d = Number(g.stats.find(s => s.name === 'Our Defensive Rebounds')?.result) || 0;
        const o = Number(g.stats.find(s => s.name === 'Opponent Offensive Rebounds')?.result) || 0;
        const total = d + o;
        if (!total) return null;
        return { label: `vs. ${g.opponent}`, date: g.date, result: g.result, value: Math.round((d / total) * 100) };
      }).filter(Boolean);
    }
    if (statName === 'OReb%') {
      return games.map(g => {
        const o = Number(g.stats.find(s => s.name === 'Our Offensive Rebounds')?.result) || 0;
        const d = Number(g.stats.find(s => s.name === 'Opponent Defensive Rebounds')?.result) || 0;
        const total = o + d;
        if (!total) return null;
        return { label: `vs. ${g.opponent}`, date: g.date, result: g.result, value: Math.round((o / total) * 100) };
      }).filter(Boolean);
    }
    return games.map(g => ({
      label: `vs. ${g.opponent}`, date: g.date, result: g.result,
      value: g.stats.find(s => s.name === statName)?.result ?? null,
    })).filter(d => d.value !== null);
  })();

  const filtered = resultFilter === 'All' ? chartData : chartData.filter(d => d.result === resultFilter);
  const maxVal = Math.max(...filtered.map(d => Number(d.value) || 0), 1);
  const isPercent = statName === 'DReb%' || statName === 'OReb%';

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-black text-lg text-slate-900">Game Analytics</h2>
            <p className="text-xs text-slate-400 mt-0.5">{games.length} game{games.length !== 1 ? 's' : ''} with stats</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0 flex gap-2">
          <select value={statName} onChange={e => setStatName(e.target.value)}
            className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none">
            {allStatNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none">
            {['All', 'Win', 'Loss', 'Draw', 'TBD'].map(r => (
              <option key={r} value={r}>{r === 'All' ? 'All Results' : r}</option>
            ))}
          </select>
        </div>

        {/* Game list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <BarChart2 size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No games match this filter</p>
            </div>
          ) : filtered.map((d, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex-1 min-w-0 mr-3">
                  <span className="text-sm font-semibold text-slate-800 block truncate">{d.label}</span>
                  <span className="text-xs text-slate-400">{d.date}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${RESULT_COLORS[d.result] || RESULT_COLORS.TBD}`}>{d.result}</span>
                  <span className="text-sm font-black text-slate-800 w-12 text-right">{isPercent ? `${d.value}%` : d.value}</span>
                </div>
              </div>
              <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max((Number(d.value) / maxVal) * 100, 4)}%`, background: RESULT_BAR[d.result] || RESULT_BAR.TBD }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}