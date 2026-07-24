import { Pencil, Trash2, Play, BarChart2, Calendar, MapPin } from 'lucide-react';
import { format } from 'date-fns';

const RESULT_COLORS = {
  Win:  'bg-green-100 text-green-700',
  Loss: 'bg-red-100 text-red-600',
  Draw: 'bg-amber-100 text-amber-700',
  TBD:  'bg-slate-100 text-slate-500',
};

export default function GameCard({ game, teamName, onEdit, onDelete, onViewSummary, onStart }) {
  const dateStr = game.game_date ? format(new Date(game.game_date), 'EEE d MMM yyyy') : '—';
  const scoreStr = (game.our_score !== undefined && game.opponent_score !== undefined && game.result !== 'TBD')
    ? `${game.our_score} – ${game.opponent_score}`
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-bold text-slate-900 text-base">vs {game.opponent}</h3>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${RESULT_COLORS[game.result] || 'bg-slate-100 text-slate-500'}`}>
          {scoreStr || game.result || 'TBD'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3">
        <span className="flex items-center gap-1"><Calendar size={11} />{dateStr}</span>
        {game.location && <span className="flex items-center gap-1"><MapPin size={11} />{game.location}</span>}
        {teamName && <span className="font-semibold text-slate-700">{teamName}</span>}
      </div>

      <div className="flex gap-2">
        {((Array.isArray(game.team_stats) ? game.team_stats.length > 0 : !!game.team_stats) || (game.result && game.result !== 'TBD')) ? (
          <button onClick={() => onViewSummary && onViewSummary(game)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-700 hover:bg-green-800 text-white text-xs font-semibold transition-colors">
            <BarChart2 size={13} /> View Summary
          </button>
        ) : (
          <>
            <button onClick={() => onStart && onStart(game)}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
              <Play size={12} /> Start
            </button>
            <button onClick={() => onViewSummary && onViewSummary(game)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors">
              <BarChart2 size={13} /> Summary
            </button>
          </>
        )}
        <button onClick={() => onEdit(game)} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(game)} className="p-2 rounded-xl border border-red-100 text-red-400 hover:bg-red-50 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}