import { useState } from 'react';
import { X, Check, FileDown, Search } from 'lucide-react';
import { downloadCSV } from '@/lib/csvExport';

/**
 * Reusable custom-export builder.
 *  - title:          heading shown in the modal
 *  - fields:         [{ key, label }] — the columns the user can pick
 *  - rows:           array of full row objects keyed by every field key
 *  - filename:       CSV filename
 *  - rowLabelKey:    optional — shows a row-filter section using this field as display name
 *  - rowFilterLabel: section heading for the row filter (default "Rows")
 *  - rowIdKey:       optional — key in each row that holds the row's ID (for squad matching)
 *  - squads:         optional — array of squad objects with team_ids JSON for squad quick-select
 */
export default function CustomExportModal({ title, fields, rows, filename, onClose, rowLabelKey, rowFilterLabel = 'Rows', rowIdKey, squads }) {
  const [selected, setSelected] = useState(fields.map(f => f.key));
  const [selectedRowIdxs, setSelectedRowIdxs] = useState(null); // null = all
  const [rowSearch, setRowSearch] = useState('');

  const toggle = (key) =>
    setSelected(s => (s.includes(key) ? s.filter(k => k !== key) : [...s, key]));

  const toggleRow = (idx) =>
    setSelectedRowIdxs(prev => {
      const base = prev ?? new Set(rows.map((_, i) => i));
      const next = new Set(base);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next.size === rows.length ? null : next;
    });

  const selectAll = () => setSelectedRowIdxs(null);
  const deselectAll = () => setSelectedRowIdxs(new Set());

  const selectBySquad = (sq) => {
    let ids;
    try { ids = new Set(JSON.parse(sq.team_ids || '[]')); } catch { ids = new Set(); }
    const squadIdxs = rows.map((r, i) => ({ r, i })).filter(({ r }) => rowIdKey && ids.has(r[rowIdKey])).map(({ i }) => i);
    if (squadIdxs.length === 0) return;
    setSelectedRowIdxs(prev => {
      const base = prev ?? new Set(rows.map((_, i) => i));
      const next = new Set(base);
      const allOn = squadIdxs.every(i => next.has(i));
      if (allOn) squadIdxs.forEach(i => next.delete(i));
      else squadIdxs.forEach(i => next.add(i));
      return next.size === rows.length ? null : next;
    });
  };

  const activeRows = selectedRowIdxs ? rows.filter((_, i) => selectedRowIdxs.has(i)) : rows;

  const run = () => {
    const ordered = fields.filter(f => selected.includes(f.key)).map(f => f.key);
    const out = activeRows.map(r => {
      const picked = {};
      ordered.forEach(k => { picked[k] = r[k]; });
      return picked;
    });
    downloadCSV(out.length ? out : [{ note: 'No rows' }], filename);
    onClose();
  };

  const filteredBySearch = rowLabelKey
    ? rows.map((r, i) => ({ r, i })).filter(({ r }) => !rowSearch || (r[rowLabelKey] || '').toLowerCase().includes(rowSearch.toLowerCase()))
    : [];

  const activeSquads = squads ? squads.filter(s => s.status !== 'Archived') : [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
          <h2 className="font-bold text-slate-900">{title}</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Columns */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Columns to include</p>
              <div className="flex gap-2">
                <button onClick={() => setSelected(fields.map(f => f.key))} className="text-xs text-blue-600 font-semibold hover:underline">All</button>
                <button onClick={() => setSelected([fields[0].key])} className="text-xs text-slate-400 font-semibold hover:underline">Reset</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {fields.map(f => {
                const on = selected.includes(f.key);
                return (
                  <button key={f.key} onClick={() => toggle(f.key)}
                    className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium text-left transition-colors ${on ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                      {on && <Check size={12} className="text-white" strokeWidth={3} />}
                    </span>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row filter */}
          {rowLabelKey && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{rowFilterLabel}</p>
                <div className="flex items-center gap-2">
                  {selectedRowIdxs && selectedRowIdxs.size > 0 && (
                    <button onClick={selectAll} className="text-xs text-blue-600 font-semibold hover:underline">All ({rows.length})</button>
                  )}
                  {!selectedRowIdxs && (
                    <button onClick={deselectAll} className="text-xs text-slate-400 font-semibold hover:underline">None</button>
                  )}
                  {selectedRowIdxs && selectedRowIdxs.size === 0 && (
                    <button onClick={selectAll} className="text-xs text-blue-600 font-semibold hover:underline">All ({rows.length})</button>
                  )}
                </div>
              </div>

              {/* Squad quick-select */}
              {activeSquads.length > 0 && rowIdKey && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Quick-select by squad</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeSquads.map(sq => {
                      let ids;
                      try { ids = new Set(JSON.parse(sq.team_ids || '[]')); } catch { ids = new Set(); }
                      const squadIdxs = rows.map((r, i) => ({ r, i })).filter(({ r }) => ids.has(r[rowIdKey])).map(({ i }) => i);
                      if (squadIdxs.length === 0) return null;
                      const allOn = squadIdxs.every(i => selectedRowIdxs ? selectedRowIdxs.has(i) : true);
                      return (
                        <button key={sq.id} onClick={() => selectBySquad(sq)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                            allOn ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                          }`}>
                          {sq.name} <span className="opacity-70">({squadIdxs.length})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!selectedRowIdxs && <p className="text-xs text-slate-400">All {rows.length} included. Select below to narrow down.</p>}
              {selectedRowIdxs && selectedRowIdxs.size === 0 && <p className="text-xs text-amber-600">No {rowFilterLabel.toLowerCase()} selected — export will be empty.</p>}

              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={rowSearch} onChange={e => setRowSearch(e.target.value)} placeholder={`Search ${rows.length} ${rowFilterLabel.toLowerCase()}…`}
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredBySearch.map(({ r, i }) => {
                  const on = selectedRowIdxs ? selectedRowIdxs.has(i) : true;
                  return (
                    <button key={i} onClick={() => toggleRow(i)}
                      className={`w-full flex items-center gap-2 py-2.5 px-3 text-sm font-medium text-left transition-colors ${on ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                        {on && <Check size={12} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{r[rowLabelKey]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-4 flex items-center gap-3">
          <p className="text-sm text-slate-500 flex-1">{activeRows.length} row{activeRows.length !== 1 ? 's' : ''} · {selected.length} field{selected.length !== 1 ? 's' : ''}</p>
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={run} disabled={selected.length === 0 || activeRows.length === 0}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <FileDown size={15} /> Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
