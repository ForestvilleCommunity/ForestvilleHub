import { Pencil, Eye, Trash2, Clock, Lock, Shield, Star } from 'lucide-react';

const LEVEL_LABELS = { 1: 'Beginner', 2: 'Moderate', 3: 'Advanced' };
const LEVEL_COLORS = { 1: 'bg-green-100 text-green-700', 2: 'bg-amber-100 text-amber-700', 3: 'bg-red-100 text-red-700' };
const TYPE_COLORS = { Drill: 'bg-blue-100 text-blue-700', Play: 'bg-orange-100 text-orange-700' };

export default function DrillCard({ drill, canEdit, isFavorite, onToggleFavorite, onEdit, onView, onDelete }) {
  const playBg = 'bg-gradient-to-br from-orange-400 to-orange-600';
  const drillBg = 'bg-gradient-to-br from-blue-500 to-blue-700';
  const colorBg = drill.item_type === 'Play' ? playBg : drillBg;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
      {/* Preview thumbnail — only if image uploaded */}
      {drill.image_url && (
        <img src={drill.image_url} alt={drill.name} className="w-full h-28 object-cover" />
      )}

      {/* Card body */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-slate-900 leading-tight flex-1 truncate text-sm">{drill.name}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleFavorite && (
              <button onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
                className="p-0.5 rounded-lg transition-colors hover:bg-amber-50">
                <Star size={15} className={isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-400'} />
              </button>
            )}
            {drill.visibility === 'Club' ? (
              <Shield size={13} className="text-blue-400" />
            ) : (
              <Lock size={13} className="text-slate-300" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-2.5">
          {drill.item_type && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TYPE_COLORS[drill.item_type] || 'bg-slate-100 text-slate-600'}`}>
              {drill.item_type}
            </span>
          )}
          {drill.theme && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{drill.theme}</span>
          )}
          {drill.level && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${LEVEL_COLORS[drill.level] || ''}`}>
              {LEVEL_LABELS[drill.level]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
          {drill.duration_minutes && (
            <span className="flex items-center gap-1">
              <Clock size={11} />{drill.duration_minutes} min
            </span>
          )}
          {drill.age_group && <span>{drill.age_group}</span>}
        </div>

        <div className="flex gap-2">
          <button onClick={() => onView(drill)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            <Eye size={14} />View
          </button>
          {canEdit && (
            <>
              <button onClick={() => onEdit(drill)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-blue-200 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil size={14} />Edit
              </button>
              <button onClick={() => onDelete(drill)}
                className="p-2 rounded-xl border border-red-100 text-red-400 hover:bg-red-50 transition-colors">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}