import { useState, useRef, useEffect } from 'react';
import { Pencil, Trash2, Play, Copy, Clock, Target, Calendar, FileDown, CheckCircle, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_COLORS = {
  Planned: 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  Completed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-slate-100 text-slate-400',
};

export default function SessionCard({ session, teamName, onEdit, onDelete, onDuplicate, onStart, onExport, onViewSummary, canDelete = true }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const dateStr = session.date ? format(new Date(session.date), 'EEE d MMM') : '—';

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-slate-900 leading-tight flex-1">{session.session_name}</h3>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[session.status] || 'bg-slate-100 text-slate-500'}`}>
          {session.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3">
        <span className="flex items-center gap-1"><Calendar size={11} />{dateStr}</span>
        {session.duration_minutes && <span className="flex items-center gap-1"><Clock size={11} />{session.duration_minutes} min</span>}
        {teamName && <span className="font-medium text-slate-700">{teamName}</span>}
        {session.focus_target && <span className="flex items-center gap-1"><Target size={11} />Focus: {session.focus_target}</span>}
        <span className={`px-2 py-0.5 rounded-full font-semibold ${session.session_type === 'Private' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
          {session.session_type}
        </span>
      </div>

      <div className="flex gap-2">
        {session.status === 'Completed' ? (
          <button onClick={() => onViewSummary ? onViewSummary(session) : onEdit(session)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
            <CheckCircle size={13} />
            View Summary
          </button>
        ) : (
          <button onClick={() => onStart(session)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
            <Play size={13} />
            {session.status === 'In Progress' ? 'Resume' : 'Start'}
          </button>
        )}

        {/* Options menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-1 bg-white rounded-xl shadow-xl border border-slate-100 min-w-[160px] z-50 overflow-hidden">
              <button onClick={() => { onEdit(session); setMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                <Pencil size={13} className="text-slate-400" /> Edit
              </button>
              <button onClick={() => { onDuplicate(session); setMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                <Copy size={13} className="text-slate-400" /> Duplicate
              </button>
              {onExport && (
                <button onClick={() => { onExport(session); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <FileDown size={13} className="text-slate-400" /> Export PDF
                </button>
              )}
              {canDelete && (
                <>
                  <div className="border-t border-slate-100" />
                  <button onClick={() => { onDelete(session); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={13} /> Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
