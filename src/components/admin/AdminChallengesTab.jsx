import { useState, useEffect, useRef } from 'react';
import { Plus, X, Search, SlidersHorizontal, MoreHorizontal, FileDown, Settings, Wrench } from 'lucide-react';
import { db } from '@/api/db';
import { Spinner } from './shared';
import { downloadCSV } from '@/lib/csvExport';
import OptionsMenu from './OptionsMenu';
import ChallengeProfile from './ChallengeProfile';
const CHALLENGE_CATS = ['Weekly Drill Focus','Skill Challenge','Team Concept','Shooting Challenge','Defensive Challenge','Coach Education','Custom'];
const DRILL_THEMES = ['Ball Handling','Finishing','Shooting','Passing','Footwork','Decision Making','Defense','Transition','Small-Sided Games','Team Concepts','Competitive','Press Break','Rebounding'];
const STATUS_COLORS = { Draft: 'bg-slate-100 text-slate-600', Active: 'bg-green-100 text-green-700', Completed: 'bg-blue-100 text-blue-700', Archived: 'bg-amber-100 text-amber-700' };
const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const EMPTY_FORM = {
  title: '', description: '', item_type: 'Challenge', challenge_type: '',
  assigned_drill_ids: '[]', target: '', target_age_groups: '',
  target_teams: '[]', start_date: '', end_date: '', notes: '',
  goal_type: 'Makes', target_value: '', target_notes: '', challenge_duration_minutes: '',
};

export default function AdminChallengesTab({ onProfileClick, resetTrigger, triggerAdd, triggerExport }) {
  const [showForm, setShowForm] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [challenges, setChallenges] = useState([]);
  const [teams, setTeams] = useState([]);
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [editing, setEditing] = useState(null);
  const [squads, setSquads] = useState([]);
  const [selectedSquadIds, setSelectedSquadIds] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('Active');
  // Drill picker state
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [drillSearch, setDrillSearch] = useState('');
  const [drillTypeFilter, setDrillTypeFilter] = useState('All');
  const [drillThemeFilter, setDrillThemeFilter] = useState('');
  const [selectedDrillIds, setSelectedDrillIds] = useState([]);
  // Team selector state
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamSquadFilter, setTeamSquadFilter] = useState('');
  const [showSquadPicker, setShowSquadPicker] = useState(false);
  const [squadSearch, setSquadSearch] = useState('');

  useEffect(() => { if (resetTrigger) { setShowForm(false); setSelectedChallenge(null); setEditing(null); } }, [resetTrigger]);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!triggerAdd) return; openAdd(); }, [triggerAdd]);
  useEffect(() => { if (!triggerExport) return; exportChallenges(); }, [triggerExport]);

  const exportChallenges = () => downloadCSV(challenges.map(ch => ({
    title: ch.title, type: ch.item_type || 'Challenge', category: ch.challenge_type || '', status: ch.status || '',
    goal_type: ch.goal_type || '', target: ch.target_value || '', start: ch.start_date || '', end: ch.end_date || '',
  })), 'challenges.csv');

  const load = async () => {
    setLoading(true);
    const [cs, ts, ds, sq] = await Promise.all([
      db.entities.ClubChallenge.list('-created_date', 200),
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000),
      db.entities.Drill.list('-created_date', 500),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
    ]);
    setChallenges(cs); setTeams(ts); setDrills(ds); setSquads(sq);
    setLoading(false);
  };

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSelectedDrillIds([]);
    setSelectedTeamIds([]);
    setSelectedSquadIds([]);
    setTeamSearch('');
    setTeamSquadFilter('');
    setSquadSearch('');
    setShowForm(true);
  };

  const openEdit = (ch) => {
    setEditing(ch);
    // Only pull in the fields the form actually manages — spreading the raw DB row
    // risks echoing columns like `drill_id`/`id`/`created_by` back into the update
    // payload. `drill_id` is a real uuid column that must stay null; coercing it to
    // '' (as an earlier version of this code did for every null field) makes Postgres
    // reject the save with "invalid input syntax for type uuid". Null-coalesce to ''
    // only for the known editable fields, since those are bound to controlled inputs.
    const editableFields = Object.fromEntries(
      Object.keys(EMPTY_FORM).map(k => [k, ch[k] === null || ch[k] === undefined ? EMPTY_FORM[k] : ch[k]])
    );
    setForm(editableFields);
    try { setSelectedDrillIds(JSON.parse(ch.assigned_drill_ids || '[]')); } catch { setSelectedDrillIds([]); }
    try { setSelectedTeamIds(JSON.parse(ch.target_teams || '[]')); } catch { setSelectedTeamIds([]); }
    try { setSelectedSquadIds(JSON.parse(ch.assigned_squad_ids || '[]')); } catch { setSelectedSquadIds([]); }
    setTeamSearch('');
    setTeamSquadFilter('');
    setSquadSearch('');
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const payload = {
        ...form,
        // The Duration field is a numeric column — an empty string (left blank)
        // fails with "invalid input syntax for type integer"; null is required instead.
        challenge_duration_minutes: form.challenge_duration_minutes === '' ? null : form.challenge_duration_minutes,
        assigned_drill_ids: JSON.stringify(selectedDrillIds),
        target_teams: JSON.stringify(selectedTeamIds),
        assigned_squad_ids: JSON.stringify(selectedSquadIds),
        assigned_drill_name: selectedDrillIds.length > 0
          ? drills.filter(d => selectedDrillIds.includes(d.id)).map(d => d.name).join(', ')
          : '',
      };
      if (editing?.id) {
        await db.entities.ClubChallenge.update(editing.id, payload);
      } else {
        await db.entities.ClubChallenge.create({ ...payload, status: 'Active', created_by: me.id });
      }

      // A drill's own team_ids controls who can see it, independent of the challenge's
      // targeting — a coach whose team is targeted by this challenge but not by the
      // drill itself would see the challenge but "Add to Session" would show no drills
      // (RLS correctly hides drills not shared with their team). Keep the two in sync:
      // whichever teams this challenge targets, make sure the assigned drills are
      // shared with them too.
      if (selectedDrillIds.length > 0) {
        const squadTeamIds = squads.filter(sq => selectedSquadIds.includes(sq.id)).flatMap(sq => getSquadTeamIds(sq));
        const allTargetTeamIds = [...new Set([...selectedTeamIds, ...squadTeamIds])];
        if (allTargetTeamIds.length > 0) {
          await Promise.all(selectedDrillIds.map(async (drillId) => {
            const drill = drills.find(d => d.id === drillId);
            if (!drill) return;
            const currentTeamIds = (() => { try { return JSON.parse(drill.team_ids || '[]'); } catch { return []; } })();
            const merged = [...new Set([...currentTeamIds, ...allTargetTeamIds])];
            if (merged.length !== currentTeamIds.length) {
              await db.entities.Drill.update(drillId, { team_ids: JSON.stringify(merged) }).catch(() => {});
            }
          }));
        }
      }

      setEditing(null);
      setForm(EMPTY_FORM);
      setSelectedDrillIds([]);
      setSelectedTeamIds([]);
      setShowForm(false);
      load();
    } catch (e) {
      alert('Error saving challenge: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id, status) => { await db.entities.ClubChallenge.update(id, { status }); load(); };

  const duplicate = async (ch) => {
    const me = await db.auth.me();
    const { id, created_date, updated_date, ...rest } = ch;
    await db.entities.ClubChallenge.create({ ...rest, title: ch.title + ' (copy)', status: 'Draft', created_by: me.id });
    load();
  };

  const deleteChallenge = async (ch) => {
    if (!window.confirm(`Delete "${ch.title}"? This can't be undone.`)) return;
    try {
      await db.entities.ClubChallenge.delete(ch.id);
      load();
    } catch (e) {
      alert('Error deleting challenge: ' + e.message);
    }
  };

  const filtered = challenges
    .filter(c => filterStatus === 'All' || c.status === filterStatus)
    .filter(c => !search || c.title?.toLowerCase().includes(search.toLowerCase()));

  const getDrillNames = (ids) => {
    try {
      const parsed = JSON.parse(ids || '[]');
      return parsed.map(id => drills.find(d => d.id === id)?.name).filter(Boolean).join(', ');
    } catch { return ''; }
  };

  const getTeamNames = (ids) => {
    try {
      const parsed = JSON.parse(ids || '[]');
      return parsed.map(id => teams.find(t => t.id === id)?.team_name).filter(Boolean).join(', ');
    } catch { return ''; }
  };

  // Drill picker filter — only Club/Template drills are eligible for a challenge.
  // A coach can never see another user's Private drill, so assigning one here would
  // silently break "Add to Session" for every coach the challenge is targeted at.
  const filteredDrills = drills.filter(d => {
    if (d.visibility !== 'Club' && d.visibility !== 'Template') return false;
    const mt = drillTypeFilter === 'All' || (d.item_type || 'Drill') === drillTypeFilter;
    const mth = !drillThemeFilter || d.theme === drillThemeFilter;
    const ms = !drillSearch || d.name?.toLowerCase().includes(drillSearch.toLowerCase());
    return mt && mth && ms;
  });

  // Team picker filter — search by name, optionally narrowed to one squad
  const getSquadTeamIds = (sq) => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } };
  const filteredTeams = teams.filter(t => {
    const ms = !teamSearch || t.team_name?.toLowerCase().includes(teamSearch.toLowerCase());
    if (!ms) return false;
    if (!teamSquadFilter) return true;
    const squad = squads.find(s => s.id === teamSquadFilter);
    return squad ? getSquadTeamIds(squad).includes(t.id) : true;
  });

  // Squad picker filter
  const filteredSquads = squads.filter(s => {
    if (s.status === 'Archived') return false;
    return !squadSearch || s.name?.toLowerCase().includes(squadSearch.toLowerCase());
  });

  const toggleDrill = (id) => setSelectedDrillIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleTeam = (id) => setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSquad = (id) => setSelectedSquadIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);



  if (selectedChallenge) {
    return (
      <ChallengeProfile
        challenge={selectedChallenge}
        teams={teams}
        drills={drills}
        onBack={() => setSelectedChallenge(null)}
        onEdit={() => { openEdit(selectedChallenge); setSelectedChallenge(null); }}
        onDuplicate={() => { duplicate(selectedChallenge); setSelectedChallenge(null); }}
        onArchive={() => { setStatus(selectedChallenge.id, 'Archived'); setSelectedChallenge(null); }}
        onDelete={() => { deleteChallenge(selectedChallenge); setSelectedChallenge(null); }}
        onTeamClick={t => onProfileClick?.('team', t)}
      />
    );
  }

  if (loading) return <Spinner />;

  // Render function (NOT a component) to prevent input focus loss on each keystroke
  const renderChallengeForm = () => (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">

        {/* Type toggle */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Type</p>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            {['Challenge', 'Event'].map(t => (
              <button key={t} onClick={() => upd('item_type', t)}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${form.item_type === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <F label="Title *"><input className={IC} value={form.title} onChange={e => upd('title', e.target.value)} placeholder="e.g. Finishing Week" /></F>
          </div>
          <div className="md:col-span-2">
            <F label="Description"><textarea className={IC} rows={2} value={form.description} onChange={e => upd('description', e.target.value)} placeholder="What coaches and players need to do…" /></F>
          </div>
          <F label="Category">
            <select className={IC} value={form.challenge_type} onChange={e => upd('challenge_type', e.target.value)}>
              <option value="">Select…</option>
              {CHALLENGE_CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </F>
          <F label="Goal Type">
            <select className={IC} value={form.goal_type} onChange={e => upd('goal_type', e.target.value)}>
              {['Makes','Reps','Minutes','Rounds','Attempts','Custom'].map(t => <option key={t}>{t}</option>)}
            </select>
          </F>
          <F label="Target Value">
            <input className={IC} value={form.target_value} onChange={e => upd('target_value', e.target.value)} placeholder="e.g. 20" />
          </F>
          <F label="Duration (mins)">
            <input type="number" className={IC} value={form.challenge_duration_minutes} onChange={e => upd('challenge_duration_minutes', e.target.value ? Number(e.target.value) : '')} placeholder="e.g. 8" />
          </F>
          <div className="md:col-span-2">
            <F label="Target Notes (coaching cue)">
              <input className={IC} value={form.target_notes} onChange={e => upd('target_notes', e.target.value)} placeholder="e.g. Focus on balance and footwork" />
            </F>
          </div>
          <F label="Start Date"><input className={IC} type="date" value={form.start_date} onChange={e => upd('start_date', e.target.value)} /></F>
          <F label="Due / End Date"><input className={IC} type="date" value={form.end_date} onChange={e => upd('end_date', e.target.value)} /></F>
          <F label="Target Age Groups">
            <input className={IC} value={form.target_age_groups} onChange={e => upd('target_age_groups', e.target.value)} placeholder="e.g. U12, U14" />
          </F>
          <div className="md:col-span-2">
            <F label="Notes for Coaches"><textarea className={IC} rows={2} value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="Focus points, key coaching cues…" /></F>
          </div>
        </div>

        {/* ── Drill / Play Selector ──────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assigned Drills / Plays</p>
          <button onClick={() => setShowDrillPicker(true)}
            className="w-full flex items-center justify-between px-4 py-3 border border-dashed border-blue-300 rounded-xl text-sm hover:bg-blue-50 transition-colors">
            <span className={selectedDrillIds.length ? 'text-slate-800 font-medium' : 'text-slate-400'}>
              {selectedDrillIds.length === 0
                ? 'Select drills / plays from library…'
                : `${selectedDrillIds.length} drill${selectedDrillIds.length !== 1 ? 's' : ''} selected`}
            </span>
            <span className="text-blue-600 text-xs font-semibold">Browse →</span>
          </button>
          {selectedDrillIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedDrillIds.map(id => {
                const d = drills.find(x => x.id === id);
                return d ? (
                  <span key={id} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-lg font-medium">
                    {d.item_type === 'Play' ? '▶' : '⚙'} {d.name}
                    <button onClick={() => toggleDrill(id)} className="text-blue-400 hover:text-red-500 ml-0.5 font-bold">×</button>
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* ── Team Selector ─────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assign to Teams</p>
          {teams.length === 0
            ? <p className="text-sm text-slate-400 italic">No club teams available. Create teams first.</p>
            : <button onClick={() => setShowTeamPicker(true)}
                className="w-full flex items-center justify-between px-4 py-3 border border-dashed border-blue-300 rounded-xl text-sm hover:bg-blue-50 transition-colors">
                <span className="text-slate-500">Select teams…</span>
                <span className="text-blue-600 font-semibold">Browse →</span>
              </button>}
          {selectedTeamIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedTeamIds.map(id => {
                const t = teams.find(x => x.id === id);
                return t ? (
                  <span key={id} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-lg font-medium">
                    {t.team_name}
                    <button onClick={() => toggleTeam(id)} className="text-blue-400 hover:text-red-500 ml-0.5 font-bold">×</button>
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        {squads.filter(s => s.status !== 'Archived').length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assign to Squads</p>
            <button onClick={() => setShowSquadPicker(true)}
              className="w-full flex items-center justify-between px-4 py-3 border border-dashed border-indigo-300 rounded-xl text-sm hover:bg-indigo-50 transition-colors">
              <span className="text-slate-500">Select squads…</span>
              <span className="text-indigo-600 font-semibold">Browse →</span>
            </button>
            {selectedSquadIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedSquadIds.map(id => {
                  const s = squads.find(x => x.id === id);
                  return s ? (
                    <span key={id} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 text-xs px-2.5 py-1 rounded-lg font-medium">
                      {s.name}
                      <button onClick={() => toggleSquad(id)} className="text-indigo-400 hover:text-red-500 ml-0.5 font-bold">×</button>
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-4 pb-8">
        <button onClick={save} disabled={saving || !form.title.trim()}
          className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
          {saving ? 'Saving…' : editing ? 'Update' : `Create ${form.item_type}`}
        </button>
        <button onClick={closeForm}
          className="px-6 py-3 border border-slate-200 rounded-xl text-sm text-slate-600">Cancel</button>
      </div>

      {/* ── Drill Picker Modal ───────────────────────────────────── */}
      {showDrillPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-2" onClick={() => setShowDrillPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-900">Select Drills &amp; Plays</h3>
              <button onClick={() => setShowDrillPicker(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            {/* Filters */}
            <div className="px-4 pt-3 pb-2 space-y-2 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={drillSearch} onChange={e => setDrillSearch(e.target.value)} placeholder="Search drills…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2 overflow-x-auto">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
                  {['All','Drill','Play'].map(t => (
                    <button key={t} onClick={() => setDrillTypeFilter(t)}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors ${drillTypeFilter === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{t}</button>
                  ))}
                </div>
                <select value={drillThemeFilter} onChange={e => setDrillThemeFilter(e.target.value)}
                  className="border border-slate-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none shrink-0">
                  <option value="">All Themes</option>
                  {DRILL_THEMES.map(th => <option key={th} value={th}>{th}</option>)}
                </select>
              </div>
            </div>
            {/* Drill list */}
            <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1">
              {filteredDrills.length === 0
                ? <p className="text-center text-slate-400 py-8 text-sm">No drills found.</p>
                : filteredDrills.map(d => {
                  const selected = selectedDrillIds.includes(d.id);
                  return (
                    <button key={d.id} onClick={() => toggleDrill(d.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center gap-3 ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-blue-200'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {selected && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{d.name}</p>
                        <p className="text-xs text-slate-400">{d.item_type || 'Drill'}{d.theme ? ` · ${d.theme}` : ''}</p>
                      </div>
                    </button>
                  );
                })}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowDrillPicker(false)}
                className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-blue-700">
                Done — {selectedDrillIds.length} selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Team Picker Modal ────────────────────────────────────── */}
      {showTeamPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-2" onClick={() => setShowTeamPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-900">Select Teams</h3>
              <button onClick={() => setShowTeamPicker(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            {/* Filters */}
            <div className="px-4 pt-3 pb-2 space-y-2 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="Search teams…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {squads.length > 0 && (
                <select value={teamSquadFilter} onChange={e => setTeamSquadFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none">
                  <option value="">All Squads</option>
                  {squads.filter(s => s.status !== 'Archived').map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.age_group ? ` (${s.age_group})` : ''}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{filteredTeams.length} team{filteredTeams.length !== 1 ? 's' : ''}</span>
                <div className="flex gap-3">
                  <button onClick={() => setSelectedTeamIds(prev => [...new Set([...prev, ...filteredTeams.map(t => t.id)])])}
                    className="text-xs text-blue-600 font-semibold hover:underline">Select all shown</button>
                  <button onClick={() => setSelectedTeamIds(prev => prev.filter(id => !filteredTeams.some(t => t.id === id)))}
                    className="text-xs text-slate-500 font-semibold hover:underline">Clear shown</button>
                </div>
              </div>
            </div>
            {/* Team list */}
            <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1">
              {filteredTeams.length === 0
                ? <p className="text-center text-slate-400 py-8 text-sm">No teams found.</p>
                : filteredTeams.map(t => {
                  const selected = selectedTeamIds.includes(t.id);
                  return (
                    <button key={t.id} onClick={() => toggleTeam(t.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center gap-3 ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-blue-200'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {selected && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{t.team_name}</p>
                        {t.age_group && <p className="text-xs text-slate-400">{t.age_group}</p>}
                      </div>
                    </button>
                  );
                })}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowTeamPicker(false)}
                className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-blue-700">
                Done — {selectedTeamIds.length} selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Squad Picker Modal ───────────────────────────────────── */}
      {showSquadPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-2" onClick={() => setShowSquadPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-900">Select Squads</h3>
              <button onClick={() => setShowSquadPicker(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={squadSearch} onChange={e => setSquadSearch(e.target.value)} placeholder="Search squads…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1">
              {filteredSquads.length === 0
                ? <p className="text-center text-slate-400 py-8 text-sm">No squads found.</p>
                : filteredSquads.map(s => {
                  const selected = selectedSquadIds.includes(s.id);
                  return (
                    <button key={s.id} onClick={() => toggleSquad(s.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center gap-3 ${selected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {selected && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                        {s.age_group && <p className="text-xs text-slate-400">{s.age_group}</p>}
                      </div>
                    </button>
                  );
                })}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowSquadPicker(false)}
                className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-indigo-700">
                Done — {selectedSquadIds.length} selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header bar — standard search + filters */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search challenges…"
            className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="relative">
          <button onClick={() => setShowFilterMenu(v => !v)}
            className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${filterStatus !== 'Active' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <SlidersHorizontal size={13} /> Filters
          </button>
          {showFilterMenu && (
            <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[130px]">
              {['Active','Draft','Completed','Archived','All'].map(s => (
                <button key={s} onClick={() => { setFilterStatus(s); setShowFilterMenu(false); }}
                  className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors ${filterStatus === s ? 'text-blue-600 bg-blue-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Challenge list */}
      <div className="flex-1 overflow-y-auto" onClick={() => setShowFilterMenu(false)}>
        <div className="p-4 space-y-3 max-w-4xl mx-auto">
          {filtered.length === 0
            ? <p className="text-center text-slate-400 py-12 text-sm">No challenges found.</p>
            : filtered.map(ch => {
              const drillNames = getDrillNames(ch.assigned_drill_ids);
              const teamNames = getTeamNames(ch.target_teams);
              return (
                <div key={ch.id} onClick={() => setSelectedChallenge(ch)}
                  className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[ch.status] || STATUS_COLORS.Draft}`}>{ch.status}</span>
                        {ch.item_type && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ch.item_type === 'Event' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-600'}`}>{ch.item_type}</span>}
                        {ch.challenge_type && <span className="text-xs text-slate-400">{ch.challenge_type}</span>}
                      </div>
                      <h3 className="font-bold text-slate-900">{ch.title}</h3>
                      {ch.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{ch.description}</p>}
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-400">
                        {ch.target && <span>🎯 {ch.target}</span>}
                        {drillNames && <span>⚙ {drillNames}</span>}
                        {teamNames && <span>👥 {teamNames}</span>}
                        {ch.end_date && <span>📅 {ch.end_date}</span>}
                      </div>
                    </div>
                    <OptionsMenu items={[
                      { label: 'Edit', action: () => openEdit(ch) },
                      { label: 'Duplicate', action: () => duplicate(ch) },
                      { label: ch.status !== 'Active' ? 'Activate' : 'Mark Complete', action: () => setStatus(ch.id, ch.status !== 'Active' ? 'Active' : 'Completed') },
                      { label: 'Archive', action: () => setStatus(ch.id, 'Archived') },
                      { divider: true },
                      { label: 'Delete', danger: true, action: () => deleteChallenge(ch) },
                    ]} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Add / Edit form overlay */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-slate-50 rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-slate-900">{editing ? 'Edit Challenge / Event' : 'New Challenge / Event'}</h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderChallengeForm()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, children }) {
  return <div><p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>{children}</div>;
}
