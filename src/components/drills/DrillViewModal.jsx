import { useState, useEffect } from 'react';
import { X, Pencil, Copy, Clock, Play, FileDown } from 'lucide-react';
import { exportDrill } from '@/lib/exportHTML';
import { db } from '@/api/db';
import { canEditDrill } from '@/lib/drillAccess';
import DrillMediaViewer from './DrillMediaViewer';

const LEVEL_LABELS = { 1: 'Beginner', 2: 'Moderate', 3: 'Advanced' };
const LEVEL_COLORS = { 1: 'bg-green-100 text-green-700', 2: 'bg-amber-100 text-amber-700', 3: 'bg-red-100 text-red-700' };
const TYPE_COLORS = { Drill: 'bg-blue-100 text-blue-700', Play: 'bg-orange-100 text-orange-700' };

export default function DrillViewModal({ drill, onClose, onEdit, onDuplicate }) {
  const [user, setUser] = useState(null);
  const [dupDialog, setDupDialog] = useState(false);

  useEffect(() => {
    db.auth.me().then(setUser).catch(() => {});
  }, []);

  const canEdit = canEditDrill(drill, user);

  const handleDuplicate = (withMedia) => {
    setDupDialog(false);
    onDuplicate(drill, withMedia);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-xl text-slate-900 truncate">{drill.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {drill.item_type && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TYPE_COLORS[drill.item_type] || 'bg-slate-100 text-slate-600'}`}>
                  {drill.item_type}
                </span>
              )}
              {(drill.theme || drill.play_category) && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                  {drill.play_category || drill.theme}
                </span>
              )}
              {drill.level && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${LEVEL_COLORS[drill.level] || ''}`}>
                  {LEVEL_LABELS[drill.level]}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 ml-2 shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Meta row */}
          {(drill.duration_minutes || drill.age_group) && (
            <div className="flex gap-4 px-5 py-3 border-b border-slate-100 text-sm text-slate-500">
              {drill.duration_minutes && (
                <span className="flex items-center gap-1.5"><Clock size={14} />{drill.duration_minutes} min</span>
              )}
              {drill.age_group && <span>{drill.age_group}</span>}
            </div>
          )}

          {/* Unified media viewer — images + whiteboard phases in one carousel */}
          <DrillMediaViewer drill={drill} />

          {drill.description && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{drill.description}</p>
            </div>
          )}

          {drill.coaching_points && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Coaching Points</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{drill.coaching_points}</p>
            </div>
          )}

          {drill.progressions && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Progressions</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{drill.progressions}</p>
            </div>
          )}

          {drill.video_url && (
            <div className="px-5 py-4">
              <a href={drill.video_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-red-100 transition-colors">
                <Play size={16} /> Watch Video
              </a>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 shrink-0">
          <button
            onClick={() => setDupDialog(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            <Copy size={14} /> Duplicate
          </button>
          <button
            onClick={() => exportDrill(drill)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-200 text-emerald-700 bg-emerald-50 text-sm font-semibold hover:bg-emerald-100 transition-colors"
          >
            <FileDown size={14} /> Export
          </button>
          {canEdit && (
            <button
              onClick={() => onEdit(drill)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Duplicate media dialog */}
      {dupDialog && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl">
            <h3 className="font-black text-slate-900 text-lg mb-1">Duplicate media too?</h3>
            <p className="text-sm text-slate-500 mb-5">
              Keep uploaded diagram images and whiteboard phases?
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleDuplicate(true)}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors"
              >
                Yes — keep diagrams & whiteboard
              </button>
              <button
                onClick={() => handleDuplicate(false)}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
              >
                No — structure only
              </button>
              <button
                onClick={() => setDupDialog(false)}
                className="w-full py-2 text-slate-400 text-sm hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}