import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save, Check, ChevronDown, ChevronUp, UserCheck, Users, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/api/db';
import { getAccessibleTeams, getAccessiblePlayers } from '@/lib/teamAccess';
import { getCurrentSeason } from '@/lib/season.js';
import { getAccessibleDrills } from '@/lib/drillAccess';
import PlayerSelector from '@/components/games/PlayerSelector';

const DEFAULT_FORM = { game_date: '', team_id: '', opponent: '', location: '', notes: '', result: 'TBD', our_score: '', opponent_score: '' };

const safeParse = (str, fallback) => {
  if (Array.isArray(str) || (str && typeof str === 'object')) return str;
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
};

export default function GameBuilder() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!gameId;

  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [plays, setPlays] = useState([]);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [locationMode, setLocationMode] = useState('Home'); // 'Home' | 'Away' | 'Custom'
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [expanded, setExpanded] = useState({ availability: true, starting: false, matchups: false, subs: false, plays: false, reminders: false });

  // Game plan state
  const [availability, setAvailability] = useState({ in: [], out: [], questionable: [] });
  const [startingFive, setStartingFive] = useState([]);
  const [matchups, setMatchups] = useState([]);
  const [subPlan, setSubPlan] = useState('');
  const [specialPlays, setSpecialPlays] = useState([]);
  const [reminders, setReminders] = useState('');

  // Selectors
  const [showPlayerSelector, setShowPlayerSelector] = useState(null);
  const initialSnapshotRef = useRef(null);
  const justSavedRef = useRef(false);

  const snapshot = () => JSON.stringify({ form, availability, startingFive, matchups, subPlan, specialPlays, reminders });
  const isDirty = () => initialSnapshotRef.current !== null && snapshot() !== initialSnapshotRef.current;

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
    if (isDirty() && !window.confirm('You have unsaved changes to this game. Leave without saving?')) return;
    navigate('/games');
  };

  useEffect(() => {
    db.auth.me().then(async u => {
      setUser(u);
      const tl = await getAccessibleTeams(u);
      setTeams(tl);
      if (isEdit) await loadGame(tl, u);
      else { setLoading(false); initialSnapshotRef.current = snapshot(); }
    }).catch(() => setLoading(false));
  }, []);

  const loadPlayers = async (teamId, u) => {
    const pl = await getAccessiblePlayers(u || user, teamId);
    setPlayers(pl.filter(p => p.status === 'Active' || !p.status));
    const drillList = await getAccessibleDrills(u || user);
    setPlays(drillList.filter(d => d.item_type === 'Play'));
  };

  const loadGame = async (tl, u) => {
    const game = await db.entities.Game.get(gameId);
    const loc = game.location || '';
    const mode = loc === 'Home' ? 'Home' : loc === 'Away' ? 'Away' : loc ? 'Custom' : 'Home';
    setLocationMode(mode);
    const loadedForm = { game_date: game.game_date || '', team_id: game.team_id || '', opponent: game.opponent || '', location: loc, notes: game.notes || '', result: game.result || 'TBD', our_score: game.our_score || '', opponent_score: game.opponent_score || '' };
    const loadedAvailability = safeParse(game.player_availability, { in: [], out: [], questionable: [] });
    const loadedStartingFive = safeParse(game.starting_five, []);
    const loadedMatchups = safeParse(game.matchups, []);
    const loadedSubPlan = game.substitution_plan || '';
    const loadedSpecialPlays = safeParse(game.special_plays, []);
    const loadedReminders = game.reminders || '';
    setForm(loadedForm);
    setAvailability(loadedAvailability);
    setStartingFive(loadedStartingFive);
    setMatchups(loadedMatchups);
    setSubPlan(loadedSubPlan);
    setSpecialPlays(loadedSpecialPlays);
    setReminders(loadedReminders);
    if (game.team_id) await loadPlayers(game.team_id, u);
    initialSnapshotRef.current = JSON.stringify({ form: loadedForm, availability: loadedAvailability, startingFive: loadedStartingFive, matchups: loadedMatchups, subPlan: loadedSubPlan, specialPlays: loadedSpecialPlays, reminders: loadedReminders });
    setLoading(false);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  const handleTeamSelect = async (teamId) => {
    set('team_id', teamId);
    await loadPlayers(teamId);
  };

  const validate = () => {
    const errs = {};
    if (step >= 1 && !form.team_id) errs.team_id = 'Please select a team';
    if (step >= 2) {
      if (!form.opponent?.trim()) errs.opponent = 'Opponent is required';
      if (!form.game_date) errs.game_date = 'Game date is required';
    }
    return errs;
  };

  const nextStep = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); toast.error('Please complete required fields.'); return; }
    setErrors({});
    if (step === 2 && players.length === 0) loadPlayers(form.team_id);
    setStep(s => Math.min(s + 1, 3));
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); toast.error('Please complete required fields.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        team_id: form.team_id || null,
        our_score: form.our_score !== '' ? Number(form.our_score) : undefined,
        opponent_score: form.opponent_score !== '' ? Number(form.opponent_score) : undefined,
        player_availability: JSON.stringify(availability), starting_five: JSON.stringify(startingFive),
        matchups: JSON.stringify(matchups), substitution_plan: subPlan, special_plays: JSON.stringify(specialPlays), reminders,
        owner_user_email: user?.email, owner_id: user?.id,
        season_name: getCurrentSeason().name,
      };
      if (isEdit) { await db.entities.Game.update(gameId, payload); toast.success('Game updated!'); }
      else { await db.entities.Game.create(payload); toast.success('Game created!'); }
      justSavedRef.current = true;
      navigate('/games');
    } catch (e) {
      toast.error('Error saving game: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const playerMap = players.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});

  const availabilityToggle = (playerId, bucket) => {
    setAvailability(a => {
      const next = { in: a.in.filter(id => id !== playerId), out: a.out.filter(id => id !== playerId), questionable: a.questionable.filter(id => id !== playerId) };
      if (!a[bucket]?.includes(playerId)) next[bucket] = [...(next[bucket] || []), playerId];
      return next;
    });
  };

  const matchupOursPlayer = (sfPlayerId, theirName) => {
    setMatchups(m => {
      const existing = m.find(mu => mu.our === sfPlayerId);
      if (existing) return m.map(mu => mu.our === sfPlayerId ? { ...mu, their: theirName } : mu);
      return [...m, { our: sfPlayerId, their: theirName }];
    });
  };

  if (loading) return <div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50" style={{ zIndex: 100 }}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={handleLeave} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"><ArrowLeft size={20} /></button>
        <h1 className="font-bold text-slate-900 flex-1">{isEdit ? 'Edit Game' : 'New Game'}</h1>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl">
          <Save size={15} />{saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Steps */}
      <div className="bg-white border-b border-slate-100 px-4 py-2 flex gap-1 shrink-0">
        {['Team', 'Details', 'Game Plan'].map((label, i) => {
          const n = i + 1;
          const active = step === n, done = step > n;
          return (
            <button key={n} onClick={() => { if (n < step) setStep(n); }}
              className={`flex-1 flex flex-col items-center py-1.5 rounded-xl text-xs font-semibold transition-colors ${active ? 'bg-slate-900 text-white' : done ? 'bg-green-100 text-green-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs mb-0.5 ${active ? 'bg-slate-700 text-white' : done ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {done ? <Check size={10} /> : n}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Step 1: Team */}
        {step === 1 && (
          <div className="p-5 space-y-3 max-w-lg mx-auto">
            <h2 className="font-bold text-xl text-slate-900">Choose a team</h2>
            {errors.team_id && <p className="text-sm text-red-500">{errors.team_id}</p>}
            {teams.map(team => (
              <button key={team.id} onClick={() => handleTeamSelect(team.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-colors ${form.team_id === team.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${form.team_id === team.id ? 'bg-slate-900' : 'bg-slate-200'}`}>
                  <span className={`font-black text-sm ${form.team_id === team.id ? 'text-white' : 'text-slate-500'}`}>{team.team_name?.charAt(0)}</span>
                </div>
                <div className="flex-1"><p className="font-bold text-slate-900">{team.team_name}</p><p className="text-xs text-slate-500">{team.age_group}</p></div>
                {form.team_id === team.id && <Check size={18} className="text-slate-900 shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Game Details */}
        {step === 2 && (
          <div className="p-5 space-y-4 max-w-lg mx-auto">
            <h2 className="font-bold text-xl text-slate-900">Game Details</h2>
            <GField label="Opponent" required error={errors.opponent}><input value={form.opponent} onChange={e => set('opponent', e.target.value)} placeholder="e.g. River Eagles" className={gi(errors.opponent)} /></GField>
            <div className="grid grid-cols-2 gap-3">
              <GField label="Game Date" required error={errors.game_date}><input type="date" value={form.game_date} onChange={e => set('game_date', e.target.value)} className={gi(errors.game_date)} /></GField>
              <GField label="Location">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    {['Home', 'Away', 'Custom'].map(m => (
                      <button key={m} type="button" onClick={() => { setLocationMode(m); if (m !== 'Custom') set('location', m); else set('location', ''); }}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                          locationMode === m ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}>{m}</button>
                    ))}
                  </div>
                  {locationMode === 'Custom' && (
                    <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Enter location..." className={gi()} />
                  )}
                </div>
              </GField>
            </div>

            <GField label="Result">
              <div className="flex gap-2">
                {['TBD', 'Win', 'Loss', 'Draw'].map(r => (
                  <button key={r} onClick={() => set('result', r)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${form.result === r ? (r === 'Win' ? 'bg-green-600 border-green-600 text-white' : r === 'Loss' ? 'bg-red-600 border-red-600 text-white' : 'bg-slate-800 border-slate-800 text-white') : 'border-slate-200 text-slate-600'}`}>{r}</button>
                ))}
              </div>
            </GField>
            {form.result !== 'TBD' && (
              <div className="grid grid-cols-2 gap-3">
                <GField label="Our Score"><input type="number" value={form.our_score} onChange={e => set('our_score', e.target.value)} placeholder="0" className={gi()} /></GField>
                <GField label="Their Score"><input type="number" value={form.opponent_score} onChange={e => set('opponent_score', e.target.value)} placeholder="0" className={gi()} /></GField>
              </div>
            )}
            <GField label="Notes"><textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Pre-game notes..." className={`${gi()} resize-none`} /></GField>
          </div>
        )}

        {/* Step 3: Game Plan */}
        {step === 3 && (
          <div className="p-4 space-y-3 max-w-lg mx-auto">
            <h2 className="font-bold text-xl text-slate-900">Game Plan</h2>

            {/* Player Availability */}
            <Section title="Player Availability" icon={<UserCheck size={16} />} expanded={expanded.availability} onToggle={() => toggle('availability')}>
              {players.length === 0 ? <p className="text-xs text-slate-400">No players on this team</p> : (
                <div className="space-y-2">
                  {players.map(p => {
                    const bucket = availability.in.includes(p.id) ? 'in' : availability.out.includes(p.id) ? 'out' : availability.questionable.includes(p.id) ? 'questionable' : null;
                    return (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">
                            {p.jersey_number !== undefined ? `#${p.jersey_number}` : '—'}
                          </div>
                          <p className="text-sm font-medium text-slate-800">{p.name}</p>
                        </div>
                        <div className="flex gap-1">
                          {[['in', 'IN', 'bg-green-600'], ['out', 'OUT', 'bg-red-500'], ['questionable', '?', 'bg-amber-500']].map(([b, label, col]) => (
                            <button key={b} onClick={() => availabilityToggle(p.id, b)}
                              className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${bucket === b ? `${col} text-white` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Starting Five */}
            <Section title={`Starting Five (${startingFive.length}/5)`} icon={<Users size={16} />} expanded={expanded.starting} onToggle={() => toggle('starting')}>
              <div className="space-y-1.5 mb-2">
                {startingFive.length === 0 && <p className="text-xs text-slate-400">No starters selected</p>}
                {startingFive.map(id => {
                  const p = playerMap[id];
                  if (!p) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">
                        {p.jersey_number !== undefined ? `#${p.jersey_number}` : '—'}
                      </div>
                      <p className="flex-1 text-sm font-medium text-slate-800">{p.name}</p>
                      <button onClick={() => setStartingFive(sf => sf.filter(i => i !== id))} className="text-red-400 hover:text-red-600"><Minus size={14} /></button>
                    </div>
                  );
                })}
              </div>
              {startingFive.length < 5 && (
                <button onClick={() => setShowPlayerSelector('starting')}
                  className="w-full py-2 border-2 border-dashed border-slate-300 rounded-xl text-xs font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors">
                  + Add Starter
                </button>
              )}
            </Section>

            {/* Matchups */}
            <Section title="Matchups" expanded={expanded.matchups} onToggle={() => toggle('matchups')}>
              {startingFive.length === 0 ? <p className="text-xs text-slate-400">Select starters first</p> : (
                <div className="space-y-2">
                  {startingFive.map(id => {
                    const p = playerMap[id];
                    if (!p) return null;
                    const mu = matchups.find(m => m.our === id);
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">
                          {p.jersey_number !== undefined ? `#${p.jersey_number}` : '—'}
                        </div>
                        <p className="text-xs font-medium text-slate-700 w-20 truncate">{p.name}</p>
                        <span className="text-slate-300 text-xs">vs</span>
                        <input
                          value={mu?.their || ''}
                          onChange={e => matchupOursPlayer(id, e.target.value)}
                          placeholder="Their player"
                          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Substitution Plan */}
            <Section title="Substitution Plan" expanded={expanded.subs} onToggle={() => toggle('subs')}>
              <textarea rows={3} value={subPlan} onChange={e => setSubPlan(e.target.value)} placeholder="e.g. Sub #4 for #1 at 4 min mark..." className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
            </Section>

            {/* Special Plays */}
            <Section title={`Special Plays (${specialPlays.length})`} expanded={expanded.plays} onToggle={() => toggle('plays')}>
              {plays.length === 0 ? <p className="text-xs text-slate-400">No plays in your library yet. Add plays in the Drill Library.</p> : (
                <div className="space-y-1.5">
                  {plays.map(play => {
                    const isSelected = specialPlays.includes(play.id);
                    return (
                      <button key={play.id} onClick={() => setSpecialPlays(sp => isSelected ? sp.filter(id => id !== play.id) : [...sp, play.id])}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${isSelected ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-white bg-white' : 'border-slate-300'}`}>
                          {isSelected && <Check size={10} className="text-slate-900" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-800'}`}>{play.name}</p>
                          <p className={`text-xs ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>{play.play_category || play.theme}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Reminders */}
            <Section title="Reminders" expanded={expanded.reminders} onToggle={() => toggle('reminders')}>
              <textarea rows={3} value={reminders} onChange={e => setReminders(e.target.value)} placeholder="Last-minute notes for game day..." className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
            </Section>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 flex gap-3 shrink-0">
        {step > 1 && <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm"><ArrowLeft size={16} /> Back</button>}
        {step < 3 ? (
          <button onClick={nextStep} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm">Next <ArrowRight size={16} /></button>
        ) : (
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-sm">
            <Save size={16} />{saving ? 'Saving...' : 'Save Game'}
          </button>
        )}
      </div>

      {/* Player selector modals */}
      {showPlayerSelector === 'starting' && (
        <PlayerSelector
          players={players}
          selectedIds={startingFive}
          onChange={(ids) => setStartingFive(ids.slice(0, 5))}
          maxSelect={5}
          title="Select Starting Five (max 5)"
          onClose={() => setShowPlayerSelector(null)}
        />
      )}
    </div>
  );
}

function Section({ title, icon, expanded, onToggle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          {icon && <span className="text-slate-500">{icon}</span>}
          <p className="font-semibold text-sm text-slate-900">{title}</p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
function GField({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
function gi(err) { return `w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white ${err ? 'border-red-400' : 'border-slate-200'}`; }