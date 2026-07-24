import { Pencil, Trash2, AlertCircle } from 'lucide-react';

function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const injuryColors = {
  Healthy: 'bg-green-100 text-green-700',
  Injured: 'bg-red-100 text-red-700',
  Doubtful: 'bg-amber-100 text-amber-700',
  Suspended: 'bg-purple-100 text-purple-700',
};

export default function PlayerCard({ player, teamName, onEdit, onDelete, onViewProfile, canEdit = true, canDelete = true }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 hover:border-slate-300 hover:shadow-sm transition-all">
      {/* Jersey — click to view profile */}
      <button
        onClick={() => onViewProfile?.(player)}
        className="w-11 h-11 bg-slate-900 text-white rounded-xl flex items-center justify-center shrink-0 hover:bg-slate-700 transition-colors"
      >
        <span className="font-black text-sm">
          {player.jersey_number !== undefined && player.jersey_number !== null && player.jersey_number !== ''
            ? `#${player.jersey_number}`
            : '—'}
        </span>
      </button>

      {/* Info — click to view profile */}
      <button onClick={() => onViewProfile?.(player)} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900 truncate">{player.name}</p>
          {player.injury_status && player.injury_status !== 'Healthy' && (
            <AlertCircle size={14} className="text-amber-500 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {player.position && (
            <span className="text-xs text-slate-500">{player.position}</span>
          )}
          {teamName && (
            <span className="text-xs text-slate-400">· {teamName}</span>
          )}
          <span className="text-xs text-slate-400">
            {player.date_of_birth ? `Age ${calcAge(player.date_of_birth)}` : 'Age not set'}
          </span>
        </div>
        {player.injury_status && player.injury_status !== 'Healthy' && (
          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${injuryColors[player.injury_status] || ''}`}>
            {player.injury_status}
          </span>
        )}
      </button>

      {/* Actions — only shown when coach owns this player */}
      {(canEdit || canDelete) && (
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(player); }}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
            >
              <Pencil size={16} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(player); }}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}