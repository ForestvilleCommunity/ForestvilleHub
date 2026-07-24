import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

/**
 * SearchableSelect — drop-in replacement for <select> with a search input.
 *
 * Props:
 *   value        string  — controlled value
 *   onChange     fn(val) — called when selection changes
 *   placeholder  string  — shown when nothing selected
 *   options      [{value, label}]  — flat list (mutually exclusive with groups)
 *   groups       [{label, options: [{value, label}]}]  — grouped list
 *   className    string  — applied to the trigger button
 *   disabled     bool
 */
export default function SearchableSelect({ value, onChange, placeholder = 'Select…', options, groups, className = '', disabled = false }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const ref                 = useRef();
  const inputRef            = useRef();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else setQuery('');
  }, [open]);

  // Normalise to groups format internally
  const allGroups = groups
    ? groups
    : [{ label: null, options: options || [] }];

  const q = query.toLowerCase();
  const filteredGroups = allGroups.map(g => ({
    ...g,
    options: q ? g.options.filter(o => o.label.toLowerCase().includes(q)) : g.options,
  })).filter(g => g.options.length > 0);

  // Find current label
  const allOptions = allGroups.flatMap(g => g.options);
  const currentLabel = allOptions.find(o => o.value === value)?.label ?? '';

  const select = (val) => {
    onChange(val);
    setOpen(false);
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  const triggerClass = `w-full flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-300'} ${className}`;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => !disabled && setOpen(v => !v)} className={triggerClass} disabled={disabled}>
        <span className={`flex-1 truncate ${currentLabel ? 'text-slate-900' : 'text-slate-400'}`}>
          {currentLabel || placeholder}
        </span>
        {value && !disabled ? (
          <X size={14} className="text-slate-400 hover:text-slate-600 shrink-0" onClick={clear} />
        ) : (
          <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="flex-1 text-sm outline-none placeholder-slate-400"
            />
            {query && <button type="button" onClick={() => setQuery('')}><X size={13} className="text-slate-400 hover:text-slate-600" /></button>}
          </div>

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto">
            {filteredGroups.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No results</p>
            )}
            {filteredGroups.map((g, gi) => (
              <div key={gi}>
                {g.label && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 pt-2 pb-1">{g.label}</p>
                )}
                {g.options.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => select(o.value)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${o.value === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-800'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
