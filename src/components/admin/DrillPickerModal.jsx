import { useState, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';
import { db } from '@/api/db';

const THEMES = ['Ball Handling','Finishing','Shooting','Passing','Footwork','Decision Making','Defense','Transition','Small-Sided Games','Team Concepts','Competitive'];

export default function DrillPickerModal({ selectedIds = [], onConfirm, onClose }) {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All'); // All / Drill / Play
  const [themeFilter, setThemeFilter] = useState('');
  const [selected, setSelected] = useState(new Set(selectedIds));

  useEffect(() => {
    db.entities.Drill.list('-created_date', 500)
      .then(ds => { setDrills(ds); setLoading(false); });
  }, []);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = drills.filter(d => {
    const mType = typeFilter === 'All' || d.item_type === typeFilter;
    const mTheme = !themeFilter || d.theme === themeFilter;
    const mSearch = !search || d.name?.toLowerCase().includes(search.toLowerCase());
    return mType && mTheme && mSearch;
  });

  const confirm = () => {
    const selectedDrills = drills.filter(d => selected.has(d.id));
    onConfirm(selectedDrills);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-bold text-slate-900">Select Drills / Plays</h3>
            {selected.size > 0 && <p className="text-xs text-blue-600 mt-0.5">{selected.size} selected</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-slate-100 space-y-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search drills and plays…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
              {['All','Drill','Play'].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${typeFilter === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                  {t}
                </button>
              ))}
            </div>
            <select value={themeFilter} onChange={e => setThemeFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0">
              <option value="">All Themes</option>
              {THEMES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading && <p className="text-center text-slate-400 py-8 text-sm">Loading…</p>}
          {!loading && filtered.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">No drills found.</p>}
          {filtered.map(d => {
            const isSelected = selected.has(d.id);
            return (
              <button key={d.id} onClick={() => toggle(d.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                }`}>
                  {isSelected && <Check size={12} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{d.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {d.item_type || 'Drill'}{d.theme ? ` · ${d.theme}` : ''}{d.level ? ` · Level ${d.level}` : ''}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${d.item_type === 'Play' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                  {d.item_type || 'Drill'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={confirm}
            className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700">
            Confirm {selected.size > 0 ? `(${selected.size} selected)` : ''}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}