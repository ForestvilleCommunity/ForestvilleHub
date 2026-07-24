import { useState, useEffect } from 'react';
import { Search, Plus, Check } from 'lucide-react';
import { db } from '@/api/db';
import { getAccessibleDrills } from '@/lib/drillAccess';

const LEVEL_LABELS = { 1: 'Beginner', 2: 'Moderate', 3: 'Advanced' };

const SKILL_FILTERS = [
  { value: 'All', label: 'All Skills' },
  { value: 'Shooting', label: 'Shooting' },
  { value: 'Ballhandling', label: 'Ball Handling' },
  { value: 'Passing', label: 'Passing' },
  { value: 'Defense', label: 'Defense' },
  { value: 'Offense', label: 'Team Offense' },
  { value: 'Transition', label: 'Transition' },
  { value: 'Rebounding', label: 'Rebounding' },
  { value: 'Conditioning', label: 'Conditioning' },
  { value: 'Other', label: 'Other' },
];

function parseTeamIds(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || '[]'); } catch { return []; }
}

export default function DrillPicker({ user, selectedDrillIds, onAdd, onRemove, teamId }) {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [themeFilter, setThemeFilter] = useState('All');

  useEffect(() => {
    if (user) {
      Promise.all([
        getAccessibleDrills(user).catch(() => []),
        db.entities.Drill.filter({ visibility: 'Template', status: 'Active' }).catch(() => []),
      ]).then(([userDrills, templateDrills]) => {
        let combined = [...userDrills];
        templateDrills.forEach(t => { if (!combined.find(d => d.id === t.id)) combined.push(t); });
        // Filter club drills to only those assigned to the session's team
        if (teamId) {
          combined = combined.filter(d => {
            if (d.visibility !== 'Club') return true; // keep own/template drills
            return parseTeamIds(d.team_ids).includes(teamId);
          });
        }
        setDrills(combined);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [user, teamId]);

  const filtered = drills
    .filter(d => themeFilter === 'All' || d.theme === themeFilter)
    .filter(d => !search || d.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-2">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search drills..."
          className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Skill filter */}
      <select value={themeFilter} onChange={e => setThemeFilter(e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
        {SKILL_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading drills...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No drills found</div>
        ) : (
          filtered.map(drill => {
            const added = selectedDrillIds.includes(drill.id);
            return (
              <div key={drill.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${added ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{drill.name}</p>
                  <p className="text-xs text-slate-400">{drill.theme}{drill.level ? ` · ${LEVEL_LABELS[drill.level] || ''}` : ''}{drill.duration_minutes ? ` · ${drill.duration_minutes}min` : ''}</p>
                </div>
                <button
                  onClick={() => added ? onRemove(drill.id) : onAdd(drill)}
                  className={`p-2 rounded-xl transition-colors shrink-0 ${added ? 'bg-blue-600 text-white hover:bg-red-500' : 'bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white'}`}
                >
                  {added ? <Check size={16} /> : <Plus size={16} />}
                </button>
              </div>
            );
          })
        )}
      </div>

      {selectedDrillIds.length > 0 && (
        <p className="text-xs text-blue-600 font-semibold text-center pt-2">
          {selectedDrillIds.length} drill{selectedDrillIds.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}