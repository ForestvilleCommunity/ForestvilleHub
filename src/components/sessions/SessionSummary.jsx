import { useState, useEffect } from 'react';
import { X, Pencil, FileDown, CheckCircle, Clock, Check, Users } from 'lucide-react';
import AttendancePanel from '@/components/sessions/AttendancePanel';
import { db } from '@/api/db';
import { exportSession } from '@/lib/exportHTML';
import { format } from 'date-fns';
import { toast } from 'sonner';

const DRILL_STATUS_STYLES = {
  Completed: 'border-green-200 bg-green-50',
  Skipped:   'border-slate-200 bg-slate-50',
  Pending:   'border-amber-200 bg-amber-50',
};

const STATUS_TEXT = {
  Completed: 'text-green-700',
  Skipped:   'text-slate-400',
  Pending:   'text-amber-700',
};

export default function SessionSummary({ session, teamName, onClose, onEdit }) {
  const [sessionDrills, setSessionDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDrillId, setEditingDrillId] = useState(null);
  const [drillEdits, setDrillEdits] = useState({});
  const [savingDrill, setSavingDrill] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesEdit, setNotesEdit] = useState(session.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    db.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      const sds = await db.entities.SessionDrill.filter({ session_id: session.id }, 'order');
      const drills = await Promise.all(sds.map(sd => db.entities.Drill.get(sd.drill_id).catch(() => null)));
      setSessionDrills(sds.map((sd, i) => ({ ...sd, drill: drills[i] })));
      setLoading(false);
    };
    load();
  }, [session.id]);

  const completedCount = sessionDrills.filter(sd => sd.status === 'Completed').length;
  const totalMinutes = sessionDrills.reduce((sum, sd) => sum + (Number(sd.duration) || sd.drill?.duration_minutes || 0), 0);
  const dateStr = session.date ? format(new Date(session.date + 'T00:00:00'), 'EEEE, d MMMM yyyy') : '—';

  const startEditDrill = (sd) => {
    setEditingDrillId(sd.id);
    setDrillEdits({ goal_result: sd.goal_result || '', session_notes: sd.session_notes || '', status: sd.status || 'Completed' });
  };

  const saveDrillEdit = async (sdId) => {
    setSavingDrill(true);
    const edits = drillEdits;
    await db.entities.SessionDrill.update(sdId, edits);
    setSessionDrills(prev => prev.map(sd => sd.id === sdId ? { ...sd, ...edits } : sd));
    setEditingDrillId(null);
    setSavingDrill(false);
    toast.success('Saved!');
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    await db.entities.Session.update(session.id, { notes: notesEdit });
    setSavingNotes(false);
    setEditingNotes(false);
    toast.success('Notes saved!');
  };

  const handleExport = () => exportSession(session, sessionDrills, teamName || '');

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-2xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">Session Summary</p>
            <h2 className="font-black text-xl text-slate-900 leading-tight truncate">{session.session_name}</h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full mt-2">
              <CheckCircle size={12} /> {session.status || 'Completed'}
            </span>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 ml-3 shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Meta grid */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="grid grid-cols-2 gap-2">
              <MetaBox label="Date" value={dateStr} />
              {session.duration_minutes && <MetaBox label="Duration" value={`${session.duration_minutes} min`} />}
              {teamName && <MetaBox label="Team" value={teamName} />}
              {session.session_type && <MetaBox label="Type" value={session.session_type} />}
              {session.focus_category && <MetaBox label="Focus" value={session.focus_category} />}
            </div>
          </div>

          {/* Stats */}
          {!loading && sessionDrills.length > 0 && (
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="grid grid-cols-3 gap-2">
                <StatBox value={completedCount} label="Drills Done" color="text-green-600 bg-green-50" />
                <StatBox value={sessionDrills.length} label="Total Drills" color="text-blue-600 bg-blue-50" />
                <StatBox value={totalMinutes} label="Minutes" color="text-slate-700 bg-slate-50" />
              </div>
            </div>
          )}

          {/* Drill breakdown with inline edit */}
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Drill Breakdown</p>
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
              </div>
            ) : sessionDrills.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No drills recorded</p>
            ) : (
              <div className="space-y-2">
                {sessionDrills.map((sd, i) => {
                  const statusStyle = DRILL_STATUS_STYLES[sd.status] || DRILL_STATUS_STYLES.Pending;
                  const statusText = STATUS_TEXT[sd.status] || STATUS_TEXT.Pending;
                  const drillMins = sd.duration || sd.drill?.duration_minutes;
                  const isEditing = editingDrillId === sd.id;

                  return (
                    <div key={sd.id || i} className={`rounded-xl border p-3 ${statusStyle}`}>
                      {/* Header row */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <p className="font-bold text-sm text-slate-900 flex-1 truncate">{sd.drill?.name || 'Unknown Drill'}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusText}`}>{sd.status || 'Pending'}</span>
                        {!isEditing && (
                          <button onClick={() => startEditDrill(sd)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded-lg transition-colors">
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>

                      {/* Data display (when not editing) */}
                      {!isEditing && (
                        <div className="ml-7 space-y-1">
                          {drillMins && (
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock size={10} /> {drillMins} min
                            </p>
                          )}
                          {sd.goal_type && (
                            <div className="text-xs text-slate-600">
                              <span className="font-semibold">Goal:</span> {sd.goal_type}
                              {sd.goal_target && <span> · Target: <span className="font-semibold text-slate-800">{sd.goal_target}</span></span>}
                              {sd.goal_result && <span className="ml-2 text-green-700 font-semibold">→ {sd.goal_result}</span>}
                            </div>
                          )}
                          {!sd.goal_type && sd.goal_result && (
                            <p className="text-xs text-green-700 font-semibold">Result: {sd.goal_result}</p>
                          )}
                          {sd.session_notes && (
                            <p className="text-xs text-slate-500 italic">"{sd.session_notes}"</p>
                          )}
                        </div>
                      )}

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="ml-7 mt-2 space-y-2">
                          <div className="grid grid-cols-3 gap-1.5">
                            {(['Completed', 'Skipped', 'Pending']).map(s => (
                              <button key={s} onClick={() => setDrillEdits(e => ({ ...e, status: s }))}
                                className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${drillEdits.status === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                          <input
                            value={drillEdits.goal_result}
                            onChange={e => setDrillEdits(d => ({ ...d, goal_result: e.target.value }))}
                            placeholder="Result (e.g. 8/10)"
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <textarea
                            value={drillEdits.session_notes}
                            onChange={e => setDrillEdits(d => ({ ...d, session_notes: e.target.value }))}
                            placeholder="Notes..."
                            rows={2}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setEditingDrillId(null)}
                              className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold">
                              Cancel
                            </button>
                            <button onClick={() => saveDrillEdit(sd.id)} disabled={savingDrill}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-50">
                              <Check size={12} />{savingDrill ? '...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Session notes (inline editable) */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session Notes</p>
              {!editingNotes ? (
                <button onClick={() => { setEditingNotes(true); setNotesEdit(session.notes || ''); }}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50">
                  <Pencil size={11} /> Edit
                </button>
              ) : (
                <button onClick={saveNotes} disabled={savingNotes}
                  className="flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-800 disabled:opacity-50">
                  <Check size={12} />{savingNotes ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea value={notesEdit} onChange={e => setNotesEdit(e.target.value)}
                  placeholder="Add session notes, reflections, or coaching observations..."
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <button onClick={() => setEditingNotes(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
              </div>
            ) : session.notes ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{session.notes}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">No notes yet — tap Edit to add reflections</p>
            )}
          </div>

          {/* Focus / strategy */}
          {(session.focus_outcome || session.counter_strategies) && (
            <div className="px-5 py-4">
              {session.focus_outcome && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Desired Outcome</p>
                  <p className="text-sm text-slate-700">{session.focus_outcome}</p>
                </div>
              )}
              {session.counter_strategies && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Counter Strategies</p>
                  <p className="text-sm text-slate-700">{session.counter_strategies}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors shrink-0">
            <FileDown size={14} /> Export
          </button>
          <button onClick={() => setShowAttendance(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors shrink-0">
            <Users size={14} /> Attendance
          </button>
          <button onClick={() => onEdit(session)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors">
            <Pencil size={14} /> Edit Session
          </button>
        </div>
      </div>
      {showAttendance && (
        <AttendancePanel
          session={session}
          user={user}
          onClose={() => setShowAttendance(false)}
        />
      )}
    </div>
  );
}

function MetaBox({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="font-semibold text-slate-900 text-sm leading-tight">{value}</p>
    </div>
  );
}

function StatBox({ value, label, color }) {
  return (
    <div className={`rounded-xl p-3 text-center ${color}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}