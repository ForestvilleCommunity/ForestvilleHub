import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, CheckCircle, SkipForward, ChevronRight, X, Users, Plus, Search } from 'lucide-react';
import AttendancePanel from '@/components/sessions/AttendancePanel';
import { db } from '@/api/db';
import { toast } from 'sonner';
import { getAccessibleDrills } from '@/lib/drillAccess';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function LiveSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [sessionDrills, setSessionDrills] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);
  const [resultPrompt, setResultPrompt] = useState(false);
  const [sessionBlocks, setSessionBlocks] = useState([]);
  const [resultInput, setResultInput] = useState('');
  const [resultNotes, setResultNotes] = useState('');
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [user, setUser] = useState(null);
  const [showRollCall, setShowRollCall] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState(null); // 'recorded' | 'skipped' | null
  const [rollCallPlayers, setRollCallPlayers] = useState([]);
  const [rollCallMap, setRollCallMap] = useState({});
  const [savingRollCall, setSavingRollCall] = useState(false);
  const [showAttendanceEdit, setShowAttendanceEdit] = useState(false);
  const [showAddDrill, setShowAddDrill] = useState(false);
  const [libraryDrills, setLibraryDrills] = useState([]);
  const [drillSearch, setDrillSearch] = useState('');
  const [addingDrill, setAddingDrill] = useState(false);

  const saveRollCall = async () => {
    setSavingRollCall(true);
    const date = session.date || new Date().toISOString().split('T')[0];
    try {
      const existing = await db.entities.AttendanceRecord.filter({ session_id: sessionId }).catch(() => []);
      const existingByPlayer = {};
      existing.forEach(r => { if (r.player_id) existingByPlayer[r.player_id] = r.id; });
      await Promise.all(rollCallPlayers.map(p => {
        const status = rollCallMap[p.id] || 'Present';
        if (existingByPlayer[p.id]) {
          return db.entities.AttendanceRecord.update(existingByPlayer[p.id], { status });
        }
        return db.entities.AttendanceRecord.create({
          session_id: sessionId, team_id: session.team_id,
          player_id: p.id, coach_id: user?.id,
          status, date,
        });
      }));
      setAttendanceStatus('recorded');
      saveDraft(currentIndex, sessionDrills, 'recorded');
      toast.success('Attendance saved!');
      setShowRollCall(false);
    } catch {
      toast.error('Some attendance records failed to save. Please try again.');
    }
    setSavingRollCall(false);
  };

  const markAllRollCall = (status) => {
    const map = {};
    rollCallPlayers.forEach(p => { map[p.id] = status; });
    setRollCallMap(map);
  };

  // Persist drill progress to sessionStorage so a reload can resume
  const draftKey = `live_session_draft_${sessionId}`;
  const saveDraft = (index, drills, attStatus) => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ currentIndex: index, drillStatuses: drills.map(d => ({ id: d.id, status: d.status })), attendanceStatus: attStatus }));
    } catch {}
  };
  const clearDraft = () => { try { sessionStorage.removeItem(draftKey); } catch {} };

  useEffect(() => {
    loadSession();
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      clearInterval(intervalRef.current);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  // Reset countdown timer when current drill changes
  useEffect(() => {
    if (sessionDrills.length > 0) {
      const d = sessionDrills[currentIndex];
      const dur = ((d?.duration || d?.drill?.duration_minutes) || 5) * 60;
      setSeconds(dur);
      setRunning(false);
      clearInterval(intervalRef.current);
    }
  }, [currentIndex, sessionDrills.length]);

  // Stop timer at 0
  useEffect(() => {
    if (seconds === 0 && running) { setRunning(false); clearInterval(intervalRef.current); }
  }, [seconds]);

  const loadSession = async () => {
    const me = await db.auth.me().catch(() => null);
    setUser(me);
    let s;
    try {
      s = await db.entities.Session.get(sessionId);
    } catch {
      toast.error('Could not load session.');
      setLoading(false);
      return;
    }
    setSession(s);
    if (s.session_blocks) {
      try {
        const pb = JSON.parse(s.session_blocks);
        if (pb && pb.length > 0) setSessionBlocks(pb);
      } catch {}
    }
    const [sds, rollPlayers] = await Promise.all([
      db.entities.SessionDrill.filter({ session_id: sessionId }, 'order'),
      s.team_id ? db.entities.Player.filter({ team_id: s.team_id, status: 'Active' }).catch(() => []) : Promise.resolve([]),
    ]);
    const drills = await Promise.all(sds.map(sd => db.entities.Drill.get(sd.drill_id).catch(() => null)));
    const hydratedDrills = sds.map((sd, i) => ({ ...sd, drill: drills[i] })).filter(sd => sd.drill);

    // Restore draft progress if available
    let restoredIndex = 0;
    let restoredAttStatus = null;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        restoredIndex = draft.currentIndex ?? 0;
        restoredAttStatus = draft.attendanceStatus ?? null;
        draft.drillStatuses?.forEach(({ id, status }) => {
          const d = hydratedDrills.find(x => x.id === id);
          if (d) d.status = status;
        });
        toast('Session progress restored.', { duration: 3000 });
      }
    } catch {}

    setSessionDrills(hydratedDrills);
    setCurrentIndex(restoredIndex);
    if (restoredAttStatus) setAttendanceStatus(restoredAttStatus);
    await db.entities.Session.update(sessionId, { status: 'In Progress' }).catch(() => {
      toast.error("Couldn't mark this session as In Progress — it may still show as Planned elsewhere.");
    });
    setRollCallPlayers(rollPlayers);
    const defaultMap = {};
    rollPlayers.forEach(p => { defaultMap[p.id] = 'Present'; });
    setRollCallMap(defaultMap);
    setLoading(false);
    if (rollPlayers.length > 0) setShowRollCall(true);
  };

  const openAddDrill = async () => {
    if (libraryDrills.length === 0) {
      const drills = await getAccessibleDrills(user).catch(() => []);
      setLibraryDrills(drills);
    }
    setDrillSearch('');
    setShowAddDrill(true);
  };

  const addDrillLive = async (drill) => {
    setAddingDrill(true);
    try {
      const nextOrder = sessionDrills.length > 0 ? Math.max(...sessionDrills.map(sd => sd.order ?? 0)) + 1 : 0;
      const sd = await db.entities.SessionDrill.create({ session_id: sessionId, drill_id: drill.id, order: nextOrder, status: 'Pending' }).catch(() => ({ drill_id: drill.id, order: nextOrder, status: 'Pending' }));
      setSessionDrills(prev => [...prev, { ...sd, drill }]);
      setShowAddDrill(false);
    } catch (e) {
      toast.error('Could not add drill.');
    } finally {
      setAddingDrill(false);
    }
  };

  const markDrillStatus = async (index, status) => {
    const sd = sessionDrills[index];
    if (sd?.id) {
      try {
        await db.entities.SessionDrill.update(sd.id, { status });
      } catch {
        toast.error("Couldn't save this drill's status. Please try again.");
        return false;
      }
    }
    setSessionDrills(prev => {
      const updated = prev.map((item, i) => i === index ? { ...item, status } : item);
      saveDraft(currentIndex, updated, attendanceStatus);
      return updated;
    });
    return true;
  };

  const advanceDrill = async () => {
    if (currentIndex < sessionDrills.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      saveDraft(next, sessionDrills, attendanceStatus);
    } else {
      // Last drill done - show confirmation before finishing
      setFinishConfirm(true);
    }
  };

  const finishSession = async () => {
    try {
      await db.entities.Session.update(sessionId, { status: 'Completed' });
    } catch {
      toast.error("Couldn't mark the session as completed. Please try again.");
      return;
    }
    clearDraft();
    toast.success('Session completed!');
    navigate('/sessions');
  };

  const completeDrill = async () => {
    // Always show result/notes prompt first
    if (!resultPrompt) {
      setResultPrompt(true);
      setResultInput(current?.goal_result || '');
      setResultNotes(current?.session_notes || '');
      setRunning(false);
      return;
    }
    const updates = {};
    if (resultInput.trim()) updates.goal_result = resultInput.trim();
    if (resultNotes.trim()) updates.session_notes = resultNotes.trim();
    if (Object.keys(updates).length && current?.id) {
      try {
        await db.entities.SessionDrill.update(current.id, updates);
      } catch {
        toast.error("Couldn't save your result/notes. Please try again.");
        return;
      }
      setSessionDrills(prev => prev.map((item, i) => i === currentIndex ? { ...item, ...updates } : item));
    }
    if (current?.challenge_id) {
      const presentIds = rollCallPlayers.length > 0
        ? rollCallPlayers.filter(p => { const s = rollCallMap[p.id] || 'Present'; return s === 'Present' || s === 'Late'; }).map(p => p.id)
        : [];
      await db.entities.ChallengeResult.create({
        challenge_id: current.challenge_id,
        session_id: sessionId,
        session_drill_id: current.id,
        drill_id: current.drill_id,
        team_id: session?.team_id,
        coach_id: user?.id,
        goal_type: current.goal_type || null,
        target_value: current.goal_target || null,
        result_value: resultInput.trim() || null,
        notes: resultNotes.trim() || null,
        completed_at: new Date().toISOString(),
      }).catch(() => {});
    }
    setResultPrompt(false);
    setResultInput('');
    setResultNotes('');
    if (await markDrillStatus(currentIndex, 'Completed')) await advanceDrill();
  };

  const skipDrill = async () => {
    setResultPrompt(false);
    if (await markDrillStatus(currentIndex, 'Skipped')) await advanceDrill();
  };

  const skipResult = async () => {
    setResultPrompt(false);
    setResultInput('');
    setResultNotes('');
    if (await markDrillStatus(currentIndex, 'Completed')) await advanceDrill();
  };

  const prevDrill = () => {
    if (currentIndex > 0) {
      setResultPrompt(false);
      setCurrentIndex(i => i - 1);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  const current = sessionDrills[currentIndex];
  const next = sessionDrills[currentIndex + 1];
  const progress = sessionDrills.length > 0
    ? (sessionDrills.filter(sd => sd.status === 'Completed' || sd.status === 'Skipped').length / sessionDrills.length) * 100
    : 0;
  const drillDuration = (current?.duration || current?.drill?.duration_minutes || 0) * 60;
  const currentBlock = sessionBlocks.find(b => b.id === current?.block_id);

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 text-white" style={{ zIndex: 100 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
        <button onClick={() => navigate('/sessions')} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="font-bold text-sm text-white">{session?.session_name}</p>
          <div className="flex items-center gap-2">
            <p className="text-slate-300 text-xs">{currentIndex + 1} / {sessionDrills.length} drills</p>
            {currentIndex > 0 && (
              <button onClick={prevDrill} className="text-xs text-slate-500 hover:text-slate-300 font-semibold">Prev</button>
            )}
          </div>
        </div>
        {attendanceStatus === 'recorded' ? (
          <button onClick={() => setShowAttendanceEdit(true)}
            className="text-xs text-green-400 font-bold px-2.5 py-1.5 rounded-xl border border-green-700/50 hover:border-green-500">
            P Attendance
          </button>
        ) : attendanceStatus === 'skipped' ? (
          <button onClick={() => setShowAttendanceEdit(true)}
            className="text-xs text-slate-400 font-semibold px-2.5 py-1.5 rounded-xl border border-slate-700 hover:text-white">
            Record Roll
          </button>
        ) : (
          <button onClick={() => setShowAttendanceEdit(true)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white font-medium px-2.5 py-1.5 rounded-xl border border-slate-700">
            <Users size={12} /> Roll
          </button>
        )}
        <button onClick={() => navigate('/sessions')} className="text-xs text-slate-400 hover:text-white font-medium px-3 py-1.5 rounded-xl border border-slate-700">
          Exit
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-800 shrink-0">
        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {sessionDrills.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400">
            <p>No drills in this session</p>
            <button onClick={openAddDrill}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition-colors">
              <Plus size={15} /> Add drill
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
            {/* Current drill */}
            <div className="bg-slate-800 rounded-2xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {currentBlock && (
                  <span className="bg-slate-700 text-slate-300 text-xs font-bold px-2.5 py-1 rounded-full border border-slate-600">
                    {currentBlock.title}
                  </span>
                )}
                <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  Drill {currentIndex + 1}
                </span>
                {current?.drill?.theme && (
                  <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">{current.drill.theme}</span>
                )}
                {current?.challenge_id && (
                  <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">Challenge</span>
                )}
              </div>
              <h2 className="text-2xl font-black text-white mb-1">{current?.drill?.name}</h2>
              {current?.drill?.description && (
                <p className="text-slate-400 text-sm leading-relaxed">{current.drill.description}</p>
              )}
            </div>

            {/* Timer */}
            <div className="bg-slate-800 rounded-2xl p-5 mb-4 text-center">
              <p className="text-6xl font-black tracking-tight text-white font-mono mb-2">{formatTime(seconds)}</p>
              {drillDuration > 0 && (
                <div className="mb-3">
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-1000 rounded-full"
                      style={{ width: `${Math.min((seconds / drillDuration) * 100, 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {seconds === 0 ? 'Time up!' : `${current?.duration || current?.drill?.duration_minutes || '--'} min total`}
                  </p>
                </div>
              )}
              <button onClick={() => setRunning(r => !r)}
                className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-base transition-colors ${running ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {running ? <><Pause size={20} /> Pause</> : <><Play size={20} /> {seconds > 0 ? 'Start' : 'Restart'}</>}
              </button>
            </div>

            {/* Notes & Goals */}
            {(current?.session_notes || current?.goal_type || current?.drill?.coaching_points) && (
              <div className="bg-slate-800 rounded-2xl p-4 mb-4 space-y-3">
                {current?.goal_type && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Goal</p>
                    <p className="text-white font-semibold">{current.goal_type}: <span className="text-blue-400">{current.goal_target}</span></p>
                  </div>
                )}
                {current?.session_notes && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-slate-300 text-sm">{current.session_notes}</p>
                  </div>
                )}
                {current?.drill?.coaching_points && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Coaching Points</p>
                    <p className="text-slate-300 text-sm">{current.drill.coaching_points}</p>
                  </div>
                )}
              </div>
            )}

            {/* Result prompt */}
            {resultPrompt && (
              <div className="bg-blue-950/70 border border-blue-700/50 rounded-2xl p-4 mb-4 space-y-3">
                <p className="text-sm font-bold text-white">{current?.challenge_id ? 'Challenge Result' : ((current?.goal_result || current?.session_notes) ? 'Review & Update' : 'Complete Drill')}</p>
                {current?.challenge_id && current?.goal_target && (
                  <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl px-3 py-2">
                    <p className="text-xs text-amber-300 font-semibold mb-0.5">Target</p>
                    <p className="text-white font-bold text-sm">{current.goal_type ? `${current.goal_type}: ` : ''}{current.goal_target}</p>
                  </div>
                )}
                {!current?.challenge_id && current?.goal_target && (
                  <p className="text-xs text-blue-300">
                    Target: {current?.goal_type && `${current.goal_type}: `}
                    <span className="font-semibold text-white">{current.goal_target}</span>
                  </p>
                )}
                <input value={resultInput} onChange={e => setResultInput(e.target.value)}
                  placeholder={current?.goal_target ? 'Enter result (e.g. 8/10)' : 'Result (optional)'} autoFocus
                  className="live-input w-full px-3 py-2.5 rounded-xl bg-slate-700 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <textarea value={resultNotes} onChange={e => setResultNotes(e.target.value)}
                  placeholder="Notes (optional)" rows={2}
                  className="live-input w-full px-3 py-2 rounded-xl bg-slate-700 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={skipResult} className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-semibold">
                    Complete
                  </button>
                  <button onClick={completeDrill} className="py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-sm font-semibold">
                    Save &amp; Complete
                  </button>
                </div>
              </div>
            )}

            {/* Next drill preview */}
            {next && !resultPrompt && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-2">
                  <ChevronRight size={14} className="text-slate-500" />
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Up Next</p>
                </div>
                <p className="font-semibold text-white mt-1">{next.drill?.name}</p>
                {next.drill?.theme && <p className="text-xs text-slate-400">{next.drill.theme}</p>}
              </div>
            )}

            {/* Action buttons */}
            {!resultPrompt && (
              <div className="flex flex-col gap-2 mt-auto">
                <button onClick={completeDrill}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-green-600 hover:bg-green-700 font-bold text-base transition-colors active:scale-95">
                  <CheckCircle size={20} /> Complete Drill
                </button>
                <div className="flex gap-2 mt-1">
                  <button onClick={skipDrill}
                    className="flex-1 py-2 text-xs text-slate-400 hover:text-slate-300 border border-slate-700/40 rounded-xl transition-colors font-medium">
                    Skip
                  </button>
                  {currentIndex > 0 && (
                    <button onClick={prevDrill}
                      className="flex-1 py-2 text-xs text-slate-500 hover:text-slate-400 border border-slate-600/50 rounded-xl transition-colors font-medium">
                      Prev
                    </button>
                  )}
                  <button onClick={openAddDrill}
                    className="px-3 py-2 text-xs text-slate-500 hover:text-slate-300 border border-slate-700/40 rounded-xl transition-colors font-medium flex items-center gap-1">
                    <Plus size={12} /> Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Roll Call Screen - shown before drills begin */}
      {showRollCall && (
        <div className="fixed inset-0 bg-slate-900 flex flex-col" style={{ zIndex: 110 }}>
          <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="font-bold text-white text-lg">Roll Call</h2>
              <p className="text-slate-400 text-xs mt-0.5">{session?.session_name} &middot; {rollCallPlayers.length} players</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => markAllRollCall('Present')}
                className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-xl font-semibold">All Present</button>
              <button onClick={() => markAllRollCall('Absent')}
                className="text-xs px-3 py-1.5 bg-red-900/60 hover:bg-red-800/60 text-red-300 rounded-xl font-semibold">All Absent</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {rollCallPlayers.map(p => {
              const st = rollCallMap[p.id] || 'Present';
              const BTN = { Present: 'bg-green-600', Absent: 'bg-red-600', Late: 'bg-amber-500', Injured: 'bg-pink-600', Excused: 'bg-slate-600' };
              return (
                <div key={p.id} className="bg-slate-800 rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{p.jersey_number ? `#${p.jersey_number} ` : ''}{p.name}</p>
                    {p.position && <p className="text-slate-400 text-xs">{p.position}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {['Present','Absent','Late','Injured','Excused'].map(s => (
                      <button key={s} onClick={() => setRollCallMap(prev => ({ ...prev, [p.id]: s }))}
                        title={s}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${st === s ? BTN[s] + ' text-white scale-110' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                        {s === 'Present' ? 'P' : s === 'Absent' ? 'A' : s === 'Late' ? 'L' : s === 'Injured' ? 'I' : 'E'}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
            <button onClick={saveRollCall} disabled={savingRollCall}
              className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-black text-base rounded-2xl disabled:opacity-50 transition-colors">
              {savingRollCall ? 'Saving...' : `Save Attendance & Start Drills`}
            </button>
            <button onClick={() => { setShowRollCall(false); setAttendanceStatus('skipped'); }}
              className="w-full py-2.5 text-slate-500 hover:text-slate-300 text-sm font-semibold transition-colors">
              Skip Attendance
            </button>
          </div>
        </div>
      )}

      {/* Edit Attendance via AttendancePanel */}
      {showAttendanceEdit && session && (
        <AttendancePanel
          session={session}
          user={user}
          onClose={() => { setShowAttendanceEdit(false); setAttendanceStatus('recorded'); }}
        />
      )}

      {/* Add Drill Modal */}
      {showAddDrill && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md border border-slate-700 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
              <h3 className="font-bold text-white">Add drill to session</h3>
              <button onClick={() => setShowAddDrill(false)} className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="px-4 py-3 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  value={drillSearch}
                  onChange={e => setDrillSearch(e.target.value)}
                  placeholder="Search drills..."
                  className="w-full bg-slate-700 text-white placeholder-slate-400 text-sm rounded-xl pl-9 pr-3 py-2.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-1.5">
              {libraryDrills
                .filter(d => !drillSearch || d.name?.toLowerCase().includes(drillSearch.toLowerCase()))
                .slice(0, 50)
                .map(d => (
                  <button key={d.id} onClick={() => addDrillLive(d)} disabled={addingDrill}
                    className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors disabled:opacity-50">
                    <p className="font-semibold text-white text-sm">{d.name}</p>
                    {d.theme && <p className="text-xs text-slate-400 mt-0.5">{d.theme}</p>}
                  </button>
                ))}
              {libraryDrills.filter(d => !drillSearch || d.name?.toLowerCase().includes(drillSearch.toLowerCase())).length === 0 && (
                <p className="text-center text-slate-500 text-sm py-8">No drills found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finish Session Confirmation Modal */}
      {finishConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">All drills complete!</h3>
              <button onClick={() => setFinishConfirm(false)} className="p-1 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-slate-300 text-sm mb-2">You've completed all drills. Ready to finish the session?</p>
            {!attendanceStatus && rollCallPlayers.length > 0 && (
              <p className="text-amber-400 text-xs font-semibold mb-4">Ã¢Å¡Â  Attendance has not been recorded for this session.</p>
            )}
            <div className="flex flex-col gap-2">
              <button onClick={finishSession}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 font-bold text-base">
                Finish Session
              </button>
              <button onClick={() => setFinishConfirm(false)}
                className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-semibold text-sm text-slate-200">
                Stay in Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}