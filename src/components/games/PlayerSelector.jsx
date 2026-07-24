import { useState } from 'react';
import { Search, X, Check } from 'lucide-react';

export default function PlayerSelector({ players, selectedIds, onChange, maxSelect = null, title = 'Select Players', onClose }) {
  const [search, setSearch] = useState('');

  const filtered = players.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    (p.jersey_number !== undefined && String(p.jersey_number).includes(search))
  );

  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      if (maxSelect && selectedIds.length >= maxSelect) return;
      onChange([...selectedIds, id]);
    }
  };

  const selected = players.filter(p => selectedIds.includes(p.id));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">{title}</h3>
            {maxSelect && <p className="text-xs text-slate-400 mt-0.5">{selectedIds.length}/{maxSelect} selected</p>}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide border-b border-slate-100">
            {selected.map(p => (
              <button key={p.id} onClick={() => toggle(p.id)}
                className="shrink-0 flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors">
                {p.jersey_number !== undefined ? `#${p.jersey_number} ` : ''}{p.name}
                <X size={10} />
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search players..."
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
          {filtered.map(player => {
            const isSelected = selectedIds.includes(player.id);
            const isDisabled = !isSelected && maxSelect && selectedIds.length >= maxSelect;
            return (
              <button
                key={player.id}
                onClick={() => toggle(player.id)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors disabled:opacity-40 ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">
                  {player.jersey_number !== undefined ? `#${player.jersey_number}` : '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-900">{player.name}</p>
                  {player.position && <p className="text-xs text-slate-400">{player.position}</p>}
                </div>
                {isSelected && <Check size={18} className="text-blue-600 shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-center py-8 text-slate-400 text-sm">No players found</p>}
        </div>

        <div className="px-4 pb-5 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl">
            Done ({selectedIds.length} selected)
          </button>
        </div>
      </div>
    </div>
  );
}