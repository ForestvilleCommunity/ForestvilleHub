import { useState } from 'react';
import { X, RotateCcw, Trash2, Check } from 'lucide-react';
import { db } from '@/api/db';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hrs < 24)   return `${hrs}h ago`;
  return `${days}d ago`;
}

export default function ImportHistoryModal({ onClose, onUndone }) {
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('coachpad_import_history') || '[]'); }
    catch { return []; }
  });
  const [undoing, setUndoing] = useState(null);
  const [undone, setUndone] = useState(new Set());
  const [confirmId, setConfirmId] = useState(null);

  const saveHistory = (next) => {
    setHistory(next);
    localStorage.setItem('coachpad_import_history', JSON.stringify(next));
  };

  const undo = async (entry) => {
    setUndoing(entry.id);
    try {
      await Promise.all([
        ...(entry.createdPlayerIds || []).map(id => db.entities.Player.delete(id).catch(() => {})),
        ...(entry.createdMemberIds || []).map(id => db.entities.Member.delete(id).catch(() => {})),
      ]);
      setUndone(prev => new Set([...prev, entry.id]));
      // Remove from history
      saveHistory(history.filter(h => h.id !== entry.id));
      onUndone?.();
    } catch (e) {
      alert('Error undoing import: ' + e.message);
    } finally {
      setUndoing(null);
      setConfirmId(null);
    }
  };

  const clearAll = () => {
    saveHistory([]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-bold text-slate-900">Import History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Last 10 imports — undo removes all created members</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {history.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10">No import history found.</p>
          )}
          {history.map(entry => {
            const isUndone = undone.has(entry.id);
            const isUndoing = undoing === entry.id;
            const isConfirming = confirmId === entry.id;
            return (
              <div key={entry.id} className="px-5 py-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {entry.created} member{entry.created !== 1 ? 's' : ''} imported
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {timeAgo(entry.date)}
                    {entry.newTeams > 0 ? ` · ${entry.newTeams} new team${entry.newTeams !== 1 ? 's' : ''}` : ''}
                    {entry.newSquads > 0 ? ` · ${entry.newSquads} new squad${entry.newSquads !== 1 ? 's' : ''}` : ''}
                    {entry.duplicates > 0 ? ` · ${entry.duplicates} skipped` : ''}
                  </p>
                </div>
                <div className="shrink-0">
                  {isUndone ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                      <Check size={13} /> Undone
                    </span>
                  ) : isConfirming ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setConfirmId(null)}
                        className="text-xs text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100">Cancel</button>
                      <button onClick={() => undo(entry)} disabled={isUndoing}
                        className="text-xs text-white bg-red-500 px-2 py-1 rounded-lg hover:bg-red-600 font-semibold disabled:opacity-50">
                        {isUndoing ? 'Undoing…' : 'Confirm'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(entry.id)}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 font-semibold transition-colors">
                      <RotateCcw size={12} /> Undo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 shrink-0 flex items-center justify-between">
            <button onClick={clearAll}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
              <Trash2 size={12} /> Clear history
            </button>
            <button onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
