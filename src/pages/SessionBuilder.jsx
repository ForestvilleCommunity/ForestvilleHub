import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save, Check, Users, User } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/api/db';
import { getAccessibleTeams, getAccessiblePlayers } from '@/lib/teamAccess';
import { getCurrentSeason, getBookingWindowDays } from '@/lib/season.js';
import DrillPicker from '@/components/sessions/DrillPicker';
import SessionTimeline from '@/components/sessions/SessionTimeline';
import SessionBlockBuilder, { createDefaultBlocks } from '@/components/sessions/SessionBlockBuilder';

const FOCUS_CATEGORIES = ['Offense', 'Defense', 'Transition', 'Shooting', 'Ballhandling', 'Conditioning', 'Rebounding', 'Set Plays'];
const PRIVATE_FOCUS_OPTIONS = ['Offense', 'Defense', 'Shooting', 'Ball Handling', 'Finishing', 'Passing', 'Footwork', 'Confidence', 'Custom'];

// Local YYYY-MM-DD for today (so a new session defaults to today's date)
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Local YYYY-MM-DD for today + n days
const dateStrPlusDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DEFAULT_FORM = {
  session_name: '', session_type: 'Team', team_id: '', date: '',
  duration_minutes: '', focus_target: '', focus_category: '',
  focus_outcome: '', opponent_name: '', opponent_strategy: '',
  counter_strategies: '', notes: '', status: 'Planned',
  venue_id: '', court_id: '', start_time: '',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Steps: 1=Type, 2=Team/Players, 3=Details, 4=Drills, 5=Timeline
const STEP_LABELS_TEAM = ['Type', 'Team', 'Details', 'Structure'];
const STEP_LABELS_PRIVATE = ['Type', 'Players', 'Details', 'Structure'];

export default function SessionBuilder() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!sessionId;

  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [venues, setVenues] = useState([]);
  const [courts, setCourts] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [venueTouched, setVenueTouched] = useState(false);
  const [bookingWindowDays, setBookingWindowDaysState] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => ({ ...DEFAULT_FORM, date: todayStr() }));
  const [selectedPrivatePlayers, setSelectedPrivatePlayers] = useState([]);
  const [sessionDrills, setSessionDrills] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [sessionBlocks, setSessionBlocks] = useState(() => createDefaultBlocks());
  const initialSnapshotRef = useRef(null);
  const justSavedRef = useRef(false);

  useEffect(() => {
    db.auth.me().then(async (u) => {
      setUser(u);
      const [teamList, playerList, venueList, courtList, allocationList] = await Promise.all([
        getAccessibleTeams(u),
        getAccessiblePlayers(u),
        db.entities.Venue.filter({ status: 'Active' }, 'name', 200).catch(() => []),
        db.entities.Court.list('name', 200).catch(() => []),
        db.entities.TrainingAllocation.list('-created_date', 500).catch(() => []),
      ]);
      setTeams(teamList);
      setAllPlayers(playerList);
      setVenues(venueList);
      setCourts(courtList);
      setAllocations(allocationList);
      const cachedWindow = getBookingWindowDays();
      if (cachedWindow !== undefined) {
        setBookingWindowDaysState(cachedWindow);
      } else {
        db.entities.ClubSettings.list().then(rows => {
          setBookingWindowDaysState(rows?.[0]?.booking_window_days ?? null);
        }).catch(() => setBookingWindowDaysState(null));
      }
      if (isEdit) {
        await loadSession();
      } else {
        setLoading(false);
        initialSnapshotRef.current = JSON.stringify({ form, sessionDrills: [], sessionBlocks, selectedPrivatePlayers: [] });
      }
    }).catch(() => setLoading(false));
  }, []);

  const isDirty = () => JSON.stringify({ form, sessionDrills, sessionBlocks, selectedPrivatePlayers }) !== initialSnapshotRef.current;

  useEffect(() => {
    const handler = (e) => {
      if (justSavedRef.current || !isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  const handleLeave = () => {
    if (isDirty() && !window.confirm('You have unsaved changes to this session. Leave without saving?')) return;
    // Go back to wherever the coach actually came from (Sessions list, Schedule's
    // "Plan Session", etc.) instead of always landing on the generic Sessions list.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/sessions');
  };

  const loadSession = async () => {
    const session = await db.entities.Session.get(sessionId);
    const loadedForm = {
      session_name: session.session_name || '',
      session_type: session.session_type || 'Team',
      team_id: session.team_id || '',
      date: session.date || '',
      duration_minutes: session.duration_minutes || '',
      focus_target: session.focus_target || '',
      focus_category: session.focus_category || '',
      focus_outcome: session.focus_outcome || '',
      opponent_name: session.opponent_name || '',
      opponent_strategy: session.opponent_strategy || '',
      counter_strategies: session.counter_strategies || '',
      notes: session.notes || '',
      status: session.status || 'Planned',
      venue_id: session.venue_id || '',
      court_id: session.court_id || '',
      start_time: session.start_time || '',
    };
    setForm(loadedForm);
    setVenueTouched(true); // never auto-overwrite venue/court on an existing session
    let loadedPlayers = [];
    if (session.player_ids) {
      try {
        loadedPlayers = Array.isArray(session.player_ids) ? session.player_ids : JSON.parse(session.player_ids);
        setSelectedPrivatePlayers(loadedPlayers);
      } catch {}
    }
    let loadedBlocks = sessionBlocks;
    if (session.session_blocks) {
      try {
        const pb = Array.isArray(session.session_blocks) ? session.session_blocks : JSON.parse(session.session_blocks);
        if (pb && pb.length > 0) { loadedBlocks = pb; setSessionBlocks(pb); }
      } catch {}
    }
    const sds = await db.entities.SessionDrill.filter({ session_id: sessionId }, 'order');
    const drillDetails = await Promise.all(sds.map(sd => db.entities.Drill.get(sd.drill_id).catch(() => null)));
    const defBid = 'main-block';
    const loadedDrills = sds.map((sd, i) => ({ ...sd, drill: drillDetails[i], block_id: sd.block_id || defBid })).filter(sd => sd.drill);
    setSessionDrills(loadedDrills);
    initialSnapshotRef.current = JSON.stringify({ form: loadedForm, sessionDrills: loadedDrills, sessionBlocks: loadedBlocks, selectedPrivatePlayers: loadedPlayers });
    setLoading(false);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-suggest venue/court/start time from the team's weekly training schedule —
  // best-effort only, never overwrites a value the coach has already set/touched.
  useEffect(() => {
    if (venueTouched || form.session_type !== 'Team' || !form.team_id || !form.date) return;
    const weekday = WEEKDAYS[new Date(`${form.date}T00:00:00`).getDay()];
    const match = allocations.find(a => a.team_id === form.team_id && a.day === weekday);
    if (match) {
      setForm(f => ({
        ...f,
        venue_id: match.venue_id || f.venue_id,
        court_id: match.court_id || f.court_id,
        start_time: match.start_time || f.start_time,
      }));
    }
  }, [form.team_id, form.date, allocations, venueTouched]);

  const filteredCourts = courts.filter(c => !form.venue_id || c.venue_id === form.venue_id);

  const setVenueField = (k, v) => { setVenueTouched(true); set(k, v); };

  const validate = () => {
    const errs = {};
    if (step === 2 && form.session_type === 'Team' && !form.team_id) errs.team_id = 'Please select a team';
    if (step === 2 && form.session_type === 'Private' && selectedPrivatePlayers.length === 0) errs.players = 'Please select at least one player';
    if (step >= 3) {
      if (!form.session_name?.trim()) errs.session_name = 'Session name is required';
      if (!form.date) errs.date = 'Date is required';
    }
    return errs;
  };

  const nextStep = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); toast.error('Please complete the required fields.'); return; }
    setErrors({});
    setStep(s => Math.min(s + 1, 4));
  };

  const handleSave = async () => {
    const errs = {};
    if (!form.session_name?.trim()) errs.session_name = 'Session name is required';
    if (!form.date) errs.date = 'Date is required';
    // Booking window: only applies when the session actually claims a venue —
    // this is about capping how far ahead a court gets reserved, not a general
    // limit on planning sessions. Admins set the policy, so they're exempt.
    if (form.date && form.venue_id && user?.role !== 'admin' && bookingWindowDays != null) {
      const maxDate = dateStrPlusDays(bookingWindowDays);
      if (form.date > maxDate) {
        errs.date = `Sessions with a venue can only be booked up to ${bookingWindowDays} day${bookingWindowDays !== 1 ? 's' : ''} in advance (on or before ${maxDate}).`;
      }
    }
    if (Object.keys(errs).length) { setErrors(errs); toast.error('Please complete the required fields.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        team_id: form.team_id || null,
        venue_id: form.venue_id || null,
        court_id: form.court_id || null,
        start_time: form.start_time || null,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : undefined,
        owner_user_email: user?.email,
        owner_id: user?.id,
        player_ids: form.session_type === 'Private' && selectedPrivatePlayers.length > 0
          ? JSON.stringify(selectedPrivatePlayers)
          : undefined,
        session_blocks: JSON.stringify(sessionBlocks),
        season_name: getCurrentSeason().name,
      };
      let sid = sessionId;
      if (isEdit) {
        await db.entities.Session.update(sessionId, payload);
      } else {
        const created = await db.entities.Session.create(payload);
        sid = created.id;
      }
      if (sid) {
        const existing = await db.entities.SessionDrill.filter({ session_id: sid }).catch(() => []);
        await Promise.all(existing.map(sd => db.entities.SessionDrill.delete(sd.id).catch(() => {})));
        const validDrills = sessionDrills.filter(sd => sd.drill?.id);
        await Promise.all(validDrills.map((sd, i) => db.entities.SessionDrill.create({
          session_id: sid,
          drill_id: sd.drill.id,
          block_id: sd.block_id,
          order: i + 1,
          duration: sd.duration ? Number(sd.duration) : undefined,
          session_notes: sd.session_notes,
          goal_type: sd.goal_type,
          goal_target: sd.goal_target,
          goal_result: sd.goal_result,
          status: sd.status,
        }).catch(() => {})));
      }
      toast.success(isEdit ? 'Session updated!' : 'Session created!');
      justSavedRef.current = true;
      navigate('/sessions');
      // Keep saving=true — button stays disabled until component unmounts on navigation
    } catch (e) {
      toast.error('Error saving session: ' + e.message);
      setSaving(false);
    }
  };

  const addDrill = (drill) => {
    if (!sessionDrills.find(sd => sd.drill?.id === drill.id)) {
      const firstBlockId = sessionBlocks[0]?.id || 'main-block';
      setSessionDrills(prev => [...prev, { drill, block_id: firstBlockId, duration: drill.duration_minutes || 5, session_notes: '', goal_type: '', goal_target: '', goal_result: '', order: prev.length + 1 }]);
    }
  };
  const removeDrill = (drillId) => setSessionDrills(prev => prev.filter(sd => sd.drill?.id !== drillId));
  const selectedDrillIds = sessionDrills.map(sd => sd.drill?.id).filter(Boolean);

  const STEPS = form.session_type === 'Private' ? STEP_LABELS_PRIVATE : STEP_LABELS_TEAM;

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  // EDIT MODE: fast single-page summary form
  if (isEdit) {
    const STATUS_OPTIONS = ['Planned', 'In Progress', 'Completed', 'Cancelled'];
    const STATUS_COLORS = {
      'Planned': 'bg-blue-600 border-blue-600 text-white',
      'In Progress': 'bg-amber-500 border-amber-500 text-white',
      'Completed': 'bg-green-600 border-green-600 text-white',
      'Cancelled': 'bg-slate-400 border-slate-400 text-white',
    };
    return (
      <div className="fixed inset-0 flex flex-col bg-slate-50" style={{ zIndex: 100 }}>
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={handleLeave} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-slate-900 flex-1">Edit Session</h1>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl">
            <Save size={15} />{saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-lg mx-auto p-4 space-y-4">

            {/* Status */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => set('status', s)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      form.status === s ? (STATUS_COLORS[s] || 'bg-slate-600 border-slate-600 text-white') : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Basic info */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
              <FormField label="Session Name" required error={errors.session_name}>
                <input value={form.session_name} onChange={e => set('session_name', e.target.value)}
                  placeholder="e.g. Tuesday Practice" className={inp(errors.session_name)} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Date" required error={errors.date}>
                  <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inp(errors.date)} />
                </FormField>
                <FormField label="Duration (mins)">
                  <input type="number" value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} placeholder="90" className={inp()} />
                </FormField>
              </div>
              {form.session_type === 'Team' && (
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Venue">
                    <select value={form.venue_id} onChange={e => { setVenueField('venue_id', e.target.value); set('court_id', ''); }} className={inp()}>
                      <option value="">— Select —</option>
                      {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Court">
                    <select value={form.court_id} onChange={e => setVenueField('court_id', e.target.value)} className={inp()} disabled={!form.venue_id}>
                      <option value="">— Select —</option>
                      {filteredCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Start Time">
                    <input type="time" value={form.start_time} onChange={e => setVenueField('start_time', e.target.value)} className={inp()} />
                  </FormField>
                </div>
              )}
              {form.focus_target && (
                <FormField label="Focus">
                  <select value={form.focus_category} onChange={e => set('focus_category', e.target.value)} className={inp()}>
                    <option value="">No category</option>
                    {FOCUS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
              )}
              <FormField label="Notes">
                <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Session notes..." className={`${inp()} resize-none`} />
              </FormField>
            </div>

            {/* Timeline + Add Drills */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-slate-900">Session Timeline</h2>
                <button onClick={() => setShowDrillPicker(v => !v)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50">
                  {showDrillPicker ? '✕ Close' : '+ Add Drills'}
                </button>
              </div>
              {showDrillPicker && (
                <div className="mb-4 max-h-64 overflow-y-auto border border-slate-100 rounded-xl">
                  <DrillPicker user={user} selectedDrillIds={selectedDrillIds} onAdd={addDrill} onRemove={removeDrill} />
                </div>
              )}
              <p className="text-xs text-slate-400 mb-3">Drag to reorder, adjust durations and goals</p>
              <SessionTimeline sessionDrills={sessionDrills} onChange={setSessionDrills} startTime={form.start_time} />
            </div>

          </div>
        </div>

        <div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm">
            <Save size={16} />{saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50" style={{ zIndex: 100 }}>
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={handleLeave} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-slate-900 flex-1">{isEdit ? 'Edit Session' : 'New Session'}</h1>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl">
          <Save size={15} />{saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Step indicator */}
      <div className="bg-white border-b border-slate-100 px-4 py-2 flex gap-1 shrink-0">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n, done = step > n;
          return (
            <button key={n} onClick={() => { if (n < step) setStep(n); }}
              className={`flex-1 flex flex-col items-center py-1.5 rounded-xl text-xs font-semibold transition-colors ${active ? 'bg-blue-600 text-white' : done ? 'bg-green-100 text-green-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs mb-0.5 ${active ? 'bg-blue-500 text-white' : done ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {done ? <Check size={10} /> : n}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Step 1: Session Type */}
        {step === 1 && (
          <div className="p-5 space-y-4 max-w-lg mx-auto">
            <h2 className="font-bold text-xl text-slate-900">Choose Session Type</h2>
            <div className="space-y-3">
              <button onClick={() => { set('session_type', 'Team'); }}
                className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-colors ${form.session_type === 'Team' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${form.session_type === 'Team' ? 'bg-blue-600' : 'bg-slate-200'}`}>
                  <Users size={22} className={form.session_type === 'Team' ? 'text-white' : 'text-slate-500'} />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Team Session</p>
                  <p className="text-sm text-slate-500 mt-0.5">Practice for the whole team</p>
                </div>
                {form.session_type === 'Team' && <Check size={20} className="text-blue-600 ml-auto shrink-0" />}
              </button>

              <button onClick={() => { set('session_type', 'Private'); set('team_id', ''); }}
                className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-colors ${form.session_type === 'Private' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${form.session_type === 'Private' ? 'bg-orange-500' : 'bg-slate-200'}`}>
                  <User size={22} className={form.session_type === 'Private' ? 'text-white' : 'text-slate-500'} />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Private Session</p>
                  <p className="text-sm text-slate-500 mt-0.5">Individual or small group training</p>
                </div>
                {form.session_type === 'Private' && <Check size={20} className="text-orange-500 ml-auto shrink-0" />}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Team OR Players */}
        {step === 2 && form.session_type === 'Team' && (
          <div className="p-5 space-y-3 max-w-lg mx-auto">
            <h2 className="font-bold text-xl text-slate-900">Choose a team</h2>
            {errors.team_id && <p className="text-sm text-red-500">{errors.team_id}</p>}
            {teams.map(team => (
              <button key={team.id} onClick={() => set('team_id', team.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-colors ${form.team_id === team.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${form.team_id === team.id ? 'bg-blue-600' : 'bg-slate-200'}`}>
                  <span className={`font-black text-sm ${form.team_id === team.id ? 'text-white' : 'text-slate-500'}`}>{team.team_name?.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{team.team_name}</p>
                  <p className="text-xs text-slate-500">{team.age_group}{team.program_type ? ` · ${team.program_type}` : ''}</p>
                </div>
                {form.team_id === team.id && <Check size={18} className="text-blue-600 shrink-0" />}
              </button>
            ))}
            {teams.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No teams available</p>}
          </div>
        )}

        {step === 2 && form.session_type === 'Private' && (
          <div className="p-5 space-y-3 max-w-lg mx-auto">
            <h2 className="font-bold text-xl text-slate-900">Select Players</h2>
            <p className="text-sm text-slate-500">Choose one or more players for this private session.</p>
            {errors.players && <p className="text-sm text-red-500">{errors.players}</p>}
            {allPlayers.map(player => {
              const sel = selectedPrivatePlayers.includes(player.id);
              return (
                <button key={player.id} onClick={() => setSelectedPrivatePlayers(prev => sel ? prev.filter(id => id !== player.id) : [...prev, player.id])}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${sel ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">
                    {player.jersey_number !== undefined ? `#${player.jersey_number}` : '—'}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-slate-900">{player.name}</p>
                    {player.position && <p className="text-xs text-slate-400">{player.position}</p>}
                  </div>
                  {sel && <Check size={18} className="text-orange-500 shrink-0" />}
                </button>
              );
            })}
            {allPlayers.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No players found</p>}
            {selectedPrivatePlayers.length > 0 && (
              <p className="text-xs text-orange-600 font-semibold text-center">{selectedPrivatePlayers.length} player{selectedPrivatePlayers.length !== 1 ? 's' : ''} selected</p>
            )}
          </div>
        )}

        {/* Step 3: Session Details */}
        {step === 3 && (
          <div className="p-5 space-y-4 max-w-lg mx-auto">
            <h2 className="font-bold text-xl text-slate-900">Session Details</h2>

            <FormField label="Session Name" required error={errors.session_name}>
              <input value={form.session_name} onChange={e => set('session_name', e.target.value)}
                placeholder="e.g. Tuesday Practice — Offense" className={inp(errors.session_name)} />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Date" required error={errors.date}>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inp(errors.date)} />
              </FormField>
              <FormField label="Duration (mins)">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => set('duration_minutes', Math.max(5, (Number(form.duration_minutes) || 0) - 5))}
                    className="w-10 h-10 rounded-xl border border-slate-200 text-slate-600 font-bold text-lg flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 shrink-0">−</button>
                  <input type="number" value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} placeholder="90"
                    className={`${inp()} text-center text-base font-semibold`} />
                  <button type="button" onClick={() => set('duration_minutes', (Number(form.duration_minutes) || 0) + 5)}
                    className="w-10 h-10 rounded-xl border border-slate-200 text-slate-600 font-bold text-lg flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 shrink-0">+</button>
                </div>
              </FormField>
            </div>

            {form.session_type === 'Team' && (
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Venue">
                  <select value={form.venue_id} onChange={e => { setVenueField('venue_id', e.target.value); set('court_id', ''); }} className={inp()}>
                    <option value="">— Select —</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Court">
                  <select value={form.court_id} onChange={e => setVenueField('court_id', e.target.value)} className={inp()} disabled={!form.venue_id}>
                    <option value="">— Select —</option>
                    {filteredCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Start Time">
                  <input type="time" value={form.start_time} onChange={e => setVenueField('start_time', e.target.value)} className={inp()} />
                </FormField>
              </div>
            )}

            {form.session_type === 'Team' ? (
              <>
                <FormField label="Focus Target">
                  <div className="flex gap-2">
                    {['Us', 'Opponent', ''].map(t => (
                      <button key={t} onClick={() => set('focus_target', t)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${form.focus_target === t ? (t === 'Opponent' ? 'bg-red-600 border-red-600 text-white' : t === 'Us' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-300 border-slate-300 text-slate-700') : 'border-slate-200 text-slate-600'}`}>
                        {t || 'None'}
                      </button>
                    ))}
                  </div>
                </FormField>
                {form.focus_target === 'Us' && (
                  <>
                    <FormField label="Focus Category">
                      <select value={form.focus_category} onChange={e => set('focus_category', e.target.value)} className={inp()}>
                        <option value="">Select category</option>
                        {FOCUS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Desired Outcome">
                      <textarea rows={2} value={form.focus_outcome} onChange={e => set('focus_outcome', e.target.value)}
                        placeholder="What do you want the team to achieve?" className={`${inp()} resize-none`} />
                    </FormField>
                  </>
                )}
                {form.focus_target === 'Opponent' && (
                  <>
                    <FormField label="Opponent Name">
                      <input value={form.opponent_name} onChange={e => set('opponent_name', e.target.value)} placeholder="e.g. River Eagles" className={inp()} />
                    </FormField>
                    <FormField label="Their Strategy">
                      <textarea rows={2} value={form.opponent_strategy} onChange={e => set('opponent_strategy', e.target.value)}
                        placeholder="How do they play?" className={`${inp()} resize-none`} />
                    </FormField>
                    <FormField label="Counter Strategies">
                      <textarea rows={2} value={form.counter_strategies} onChange={e => set('counter_strategies', e.target.value)}
                        placeholder="How will you respond?" className={`${inp()} resize-none`} />
                    </FormField>
                  </>
                )}
              </>
            ) : (
              <FormField label="Focus Area">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {PRIVATE_FOCUS_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => { set('focus_category', opt); set('focus_target', 'Us'); }}
                      className={`py-2.5 text-xs font-semibold rounded-xl border-2 transition-colors ${
                        form.focus_category === opt ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}>{opt}
                    </button>
                  ))}
                </div>
                {form.focus_category === 'Custom' && (
                  <input value={form.focus_outcome} onChange={e => set('focus_outcome', e.target.value)}
                    placeholder="Describe the focus area..." className={inp()} />
                )}
              </FormField>
            )}

            <FormField label="General Notes">
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Any additional notes..." className={`${inp()} resize-none`} />
            </FormField>
          </div>
        )}

        {/* Step 4: Session Structure — blocks + drills combined */}
        {step === 4 && (
          <div className="p-4 max-w-lg mx-auto pb-8">
            <h2 className="font-bold text-xl text-slate-900 mb-1">Build Your Practice</h2>
            <p className="text-sm text-slate-500 mb-4">Structure your session into blocks, then add drills to each.</p>
            {(() => {
              const totalMins = sessionDrills.reduce((s, sd) => s + (Number(sd.duration) || 0), 0);
              const sessionMins = Number(form.duration_minutes) || 0;
              if (totalMins > 0 && sessionMins > 0 && totalMins > sessionMins) {
                return (
                  <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm text-amber-800">
                    <span className="font-bold shrink-0">⚠</span>
                    <span>Drill total is <strong>{totalMins} min</strong> but session duration is <strong>{sessionMins} min</strong>. You can still save — just a heads up.</span>
                  </div>
                );
              }
              return null;
            })()}
            <SessionBlockBuilder
              blocks={sessionBlocks}
              sessionDrills={sessionDrills}
              user={user}
              teamId={form.team_id || null}
              onBlocksChange={setSessionBlocks}
              onDrillsChange={setSessionDrills}
              startTime={form.start_time}
            />
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 flex gap-3 shrink-0">
        {step > 1 && (
          <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm">
            <ArrowLeft size={16} /> Back
          </button>
        )}
        {step < 4 ? (
          <button onClick={nextStep} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm">
            Next <ArrowRight size={16} />
          </button>
        ) : (
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm">
            <Save size={16} />{saving ? 'Saving...' : 'Save Session'}
          </button>
        )}
      </div>
    </div>
  );
}

function FormField({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
function inp(err) {
  return `w-full px-3 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${err ? 'border-red-400' : 'border-slate-200'}`;
}