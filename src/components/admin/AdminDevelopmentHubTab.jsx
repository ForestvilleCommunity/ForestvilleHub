import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Plus, Search, SlidersHorizontal, Pencil, Trash2, ChevronDown, ChevronUp, Check, X, Eye, MessageSquare, Trophy, UserCircle } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { db } from '@/api/db';
import { Spinner, Field, INPUT } from './shared';
import AdminDrillsTab from './AdminDrillsTab';
import OptionsMenu from './OptionsMenu';
import Pagination from './Pagination';

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function calcAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const n = new Date();
  let age = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}
function calcAgeDec31(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  return new Date().getFullYear() - d.getFullYear();
}

function avgOfField(arr, field) {
  if (!arr?.length) return null;
  const vals = arr.map(e => parseFloat(e[field])).filter(v => !isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function calcTrend(arr, field) {
  if (!arr || arr.length < 2) return 'flat';
  const sorted = [...arr].sort((a, b) =>
    new Date(a.observation_date || a.evaluation_date) - new Date(b.observation_date || b.evaluation_date)
  );
  const last = parseFloat(sorted[sorted.length - 1][field]);
  const prev = parseFloat(sorted[sorted.length - 2][field]);
  if (isNaN(last) || isNaN(prev)) return 'flat';
  if (last > prev + 0.2) return 'up';
  if (last < prev - 0.2) return 'down';
  return 'flat';
}

function ratingInfo(r) {
  const n = parseFloat(r);
  if (isNaN(n)) return { label: 'No Data', color: 'bg-slate-100 text-slate-400' };
  if (n < 3.0) return { label: 'Significant Support', color: 'bg-red-100 text-red-700' };
  if (n < 5.0) return { label: 'Developing',          color: 'bg-orange-100 text-orange-700' };
  if (n < 7.0) return { label: 'On Track',            color: 'bg-yellow-100 text-yellow-800' };
  if (n < 8.5) return { label: 'Strong',              color: 'bg-green-100 text-green-700' };
  return             { label: 'Exceptional',          color: 'bg-purple-100 text-purple-700' };
}

// Just the text colour for a rating number, matching the rating scale.
function ratingTextColor(r) {
  const n = parseFloat(r);
  if (isNaN(n)) return 'text-slate-200';
  if (n < 3.0) return 'text-red-600';
  if (n < 5.0) return 'text-orange-600';
  if (n < 7.0) return 'text-yellow-700';
  if (n < 8.5) return 'text-green-600';
  return 'text-purple-700';
}

// For 1—10 team component ratings
function sessionRatingInfo(r) {
  const n = parseFloat(r);
  if (isNaN(n)) return { label: 'No Data', color: 'bg-slate-100 text-slate-400' };
  if (n < 3.0) return { label: 'Significant Support', color: 'bg-red-100 text-red-700' };
  if (n < 5.0) return { label: 'Developing',          color: 'bg-orange-100 text-orange-700' };
  if (n < 7.0) return { label: 'On Track',            color: 'bg-yellow-100 text-yellow-800' };
  if (n < 8.5) return { label: 'Strong',              color: 'bg-green-100 text-green-700' };
  return             { label: 'Exceptional',          color: 'bg-purple-100 text-purple-700' };
}

// Returns the display rating for a session (prefers overall_rating, falls back to team_rating)
function sessionRating(s) {
  if (s?.overall_rating != null) return s.overall_rating;
  return s?.team_rating ?? null;
}

function calcComponentAvg(f) {
  const vals = [f.intensity_rating, f.communication_rating, f.compete_rating, f.body_language_rating]
    .map(v => parseFloat(v)).filter(v => !isNaN(v) && v >= 1 && v <= 10);
  if (vals.length < 4) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / 4) * 10) / 10;
}

const RESULT_OPTIONS = ['win', 'loss', 'draw'];
const COMPONENT_FIELDS = [
  { key: 'intensity_rating',      label: 'Intensity' },
  { key: 'communication_rating',  label: 'Communication' },
  { key: 'compete_rating',        label: 'Compete Level' },
  { key: 'body_language_rating',  label: 'Body Language' },
];

function fmtR(r) {
  const n = parseFloat(r);
  return isNaN(n) ? '—' : n.toFixed(1);
}

function fmtDate(d) {
  if (!d) return '—';
  try { return format(parseISO(d), 'd MMM yyyy'); } catch { return String(d); }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Extract a meaningful short label for a team avatar
// e.g. age_group "U14 Boys" → "14", name "Raptors" → "Ra"
function teamLabel(team) {
  const src = team.age_group || team.team_name || '?';
  const num = src.match(/\d+/);
  if (num) return num[0];
  return src.substring(0, 2).toUpperCase();
}

// â"€â"€ Atoms â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function RatingBadge({ rating }) {
  const { label, color } = ratingInfo(rating);
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>;
}

function TrendIcon({ trend }) {
  if (trend === 'up')   return <TrendingUp   size={13} className="text-green-500" />;
  if (trend === 'down') return <TrendingDown size={13} className="text-red-500" />;
  return <Minus size={13} className="text-slate-300" />;
}

function RatingInput({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">{label}</label>
      <input type="number" min="0" max="9.9" step="0.1" value={value}
        onChange={e => onChange(e.target.value)} className={INPUT + ' font-mono'} placeholder="0.0" />
    </div>
  );
}

// â"€â"€ Development Graph â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function DevGraph({ data, maxY = 10, color = '#2563eb', label = 'Rating' }) {
  if (!data || data.length < 2) return (
    <div className="h-28 flex items-center justify-center text-xs text-slate-300 italic bg-slate-50 rounded-xl">
      Not enough data for a graph yet
    </div>
  );
  const mid = maxY / 2;
  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, maxY]} tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0', padding: '4px 8px' }}
            formatter={(v) => [`${parseFloat(v).toFixed(1)} / ${maxY}`, label]}
            labelStyle={{ color: '#64748b', fontWeight: 600 }}
          />
          <ReferenceLine y={mid} stroke="#e2e8f0" strokeDasharray="4 2" />
          <Line
            type="monotone" dataKey="value" stroke={color} strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ConfirmDelete({ onConfirm, onCancel, label = 'observation' }) {
  return (
    <span className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-2 py-1">
      <span className="text-xs text-red-700 font-semibold">Delete?</span>
      <button onClick={onCancel} className="text-xs text-slate-500 font-semibold px-1.5 py-0.5 rounded hover:bg-white">No</button>
      <button onClick={onConfirm} className="text-xs text-white bg-red-600 font-bold px-1.5 py-0.5 rounded hover:bg-red-700">Yes</button>
    </span>
  );
}

// â"€â"€ Player Observation Detail â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function PlayerObsDetail({ ev, member, users, onBack, onSaved }) {
  const observer = users.find(u => u.id === ev.observer_id);
  const { color } = ratingInfo(ev.rating);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ rating: String(ev.rating ?? ''), strengths: ev.strengths || '', growth_areas: ev.growth_areas || '', notes: ev.notes || '' });
  const [saving, setSaving] = useState(false);
  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  const saveEdit = async () => {
    const r = parseFloat(editForm.rating);
    if (isNaN(r) || r < 0 || r > 9.9) return alert('Rating must be 0.0 — 9.9');
    setSaving(true);
    try {
      await db.entities.PlayerEvaluation.update(ev.id, {
        rating:       parseFloat(r.toFixed(1)),
        strengths:    editForm.strengths.trim()    || null,
        growth_areas: editForm.growth_areas.trim() || null,
        notes:        editForm.notes.trim()        || null,
      });
      setEditing(false);
      onSaved();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const deleteEval = async () => {
    try {
      await db.entities.PlayerEvaluation.delete(ev.id);
      onBack();
      onSaved();
    } catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
        <ArrowLeft size={15} /> Back to {member.name}
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900">{fmtDate(ev.evaluation_date)}</p>
            {observer && <p className="text-xs text-slate-400 mt-0.5">Observed by {observer.full_name || observer.email}</p>}
          </div>
          {!editing && (
            <OptionsMenu items={[
              { label: 'Edit', action: () => setEditing(true) },
              { label: 'Delete', danger: true, action: () => { if (window.confirm('Delete this observation?')) deleteEval(); } },
            ]} />
          )}
        </div>

        {editing ? (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <RatingInput label="Rating (0.0—9.9)" value={editForm.rating} onChange={v => setEF('rating', v)} />
            <Field label="Strengths">
              <textarea rows={2} value={editForm.strengths} onChange={e => setEF('strengths', e.target.value)} className={INPUT + ' resize-none'} />
            </Field>
            <Field label="Growth Areas">
              <textarea rows={2} value={editForm.growth_areas} onChange={e => setEF('growth_areas', e.target.value)} className={INPUT + ' resize-none'} />
            </Field>
            <Field label="Notes">
              <textarea rows={2} value={editForm.notes} onChange={e => setEF('notes', e.target.value)} className={INPUT + ' resize-none'} />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="text-sm text-slate-500 px-3 py-1.5 rounded-xl border border-slate-200">Cancel</button>
              <button onClick={saveEdit} disabled={saving}
                className="text-sm font-bold text-white bg-blue-600 px-4 py-1.5 rounded-xl disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${color}`}>
              <span className="text-xs font-bold opacity-70 uppercase tracking-wide">Rating</span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black">{fmtR(ev.rating)}</span>
                <span className="text-sm font-semibold opacity-60">/ 9.9</span>
              </div>
            </div>
            <div><RatingBadge rating={ev.rating} /></div>
            {ev.strengths    && <div><p className="text-xs font-bold text-green-600 uppercase tracking-wide">Strengths</p><p className="text-sm text-slate-700 mt-0.5">{ev.strengths}</p></div>}
            {ev.growth_areas && <div><p className="text-xs font-bold text-orange-500 uppercase tracking-wide">Growth Areas</p><p className="text-sm text-slate-700 mt-0.5">{ev.growth_areas}</p></div>}
            {ev.notes        && <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Notes</p><p className="text-sm text-slate-700 mt-0.5">{ev.notes}</p></div>}
            {!ev.strengths && !ev.growth_areas && !ev.notes && (
              <p className="text-sm text-slate-300 italic text-center py-2">No notes recorded for this observation.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// â"€â"€ Coach Observation Detail â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function CoachObsDetail({ ev, user, onBack, onSaved }) {
  const { color } = ratingInfo(ev.overall_rating);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    ...COACH_FIELDS.reduce((a, f) => ({ ...a, [f.key]: String(ev[f.key] ?? '') }), {}),
    notes: ev.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  const calcOverall = (f) => {
    const vals = COACH_FIELDS.map(cf => parseFloat(f[cf.key])).filter(v => !isNaN(v));
    return vals.length === COACH_FIELDS.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null;
  };

  const saveEdit = async () => {
    const vals = COACH_FIELDS.map(cf => parseFloat(editForm[cf.key]));
    if (vals.some(v => isNaN(v))) return alert('Please fill all rating fields');
    setSaving(true);
    try {
      await db.entities.CoachEvaluation.update(ev.id, {
        ...COACH_FIELDS.reduce((a, f) => ({ ...a, [f.key]: parseFloat(parseFloat(editForm[f.key]).toFixed(1)) }), {}),
        overall_rating: calcOverall(editForm),
        notes: editForm.notes?.trim() || null,
      });
      setEditing(false);
      onSaved();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const deleteEval = async () => {
    try {
      await db.entities.CoachEvaluation.delete(ev.id);
      onBack();
      onSaved();
    } catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
        <ArrowLeft size={15} /> Back to {user.full_name || user.email}
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">{fmtDate(ev.evaluation_date)}</p>
          {!editing && (
            <OptionsMenu items={[
              { label: 'Edit', action: () => setEditing(true) },
              { label: 'Delete', danger: true, action: () => { if (window.confirm('Delete this observation?')) deleteEval(); } },
            ]} />
          )}
        </div>

        {editing ? (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {COACH_FIELDS.map(f => (
                <RatingInput key={f.key} label={f.label} value={editForm[f.key] ?? ''} onChange={v => setEF(f.key, v)} />
              ))}
            </div>
            <Field label="Notes">
              <textarea rows={2} value={editForm.notes || ''} onChange={e => setEF('notes', e.target.value)} className={INPUT + ' resize-none'} />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="text-sm text-slate-500 px-3 py-1.5 rounded-xl border border-slate-200">Cancel</button>
              <button onClick={saveEdit} disabled={saving}
                className="text-sm font-bold text-white bg-blue-600 px-4 py-1.5 rounded-xl disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${color}`}>
              <span className="text-xs font-bold opacity-70 uppercase tracking-wide">Overall</span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black">{fmtR(ev.overall_rating)}</span>
                <span className="text-sm font-semibold opacity-60">/ 9.9</span>
              </div>
            </div>
            {ev.overall_rating != null && <div><RatingBadge rating={ev.overall_rating} /></div>}
            <div className="grid grid-cols-3 gap-1.5">
              {COACH_FIELDS.map(f => (
                <div key={f.key} className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                  <p className="text-sm font-black text-slate-800">{fmtR(ev[f.key])}</p>
                  <p className="text-xs text-slate-400 leading-tight mt-0.5">{f.label}</p>
                </div>
              ))}
            </div>
            {ev.notes && <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Notes</p><p className="text-sm text-slate-700 mt-0.5">{ev.notes}</p></div>}
            {!ev.notes && <p className="text-sm text-slate-300 italic text-center py-2">No notes recorded for this observation.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// â"€â"€ Intelligence Dashboard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function IntelligenceDashboard({ members, teams, users, sessions, playerEvals, coachEvals }) {
  const now        = new Date();
  const monthStart = startOfMonth(now).toISOString().slice(0, 10);
  const monthEnd   = endOfMonth(now).toISOString().slice(0, 10);

  const sessThisMonth   = sessions.filter(s => s.observation_date >= monthStart && s.observation_date <= monthEnd).length;
  const teamsObserved   = new Set(sessions.map(s => s.team_id)).size;
  const playersObserved = new Set(playerEvals.map(e => e.player_id)).size;

  const teamsNeedSupport = teams.filter(t => {
    const avg = avgOfField(sessions.filter(s => s.team_id === t.id), 'team_rating');
    return avg !== null && avg < 5.0;
  });

  const bestTeam = (() => {
    let best = null, bestDelta = -Infinity;
    teams.forEach(t => {
      const ts = [...sessions.filter(s => s.team_id === t.id)]
        .sort((a, b) => new Date(a.observation_date) - new Date(b.observation_date));
      if (ts.length < 2) return;
      const delta = parseFloat(ts[ts.length - 1].team_rating) - parseFloat(ts[ts.length - 2].team_rating);
      if (!isNaN(delta) && delta > bestDelta) { bestDelta = delta; best = { t, delta }; }
    });
    return best ? `${best.t.team_name} (+${best.delta.toFixed(1)})` : '—';
  })();

  const bestPlayer = (() => {
    let best = null, bestDelta = -Infinity;
    members.forEach(m => {
      const evs = [...playerEvals.filter(e => e.player_id === m.id)]
        .sort((a, b) => new Date(a.evaluation_date) - new Date(b.evaluation_date));
      if (evs.length < 2) return;
      const delta = parseFloat(evs[evs.length - 1].rating) - parseFloat(evs[evs.length - 2].rating);
      if (!isNaN(delta) && delta > bestDelta) { bestDelta = delta; best = { m, delta }; }
    });
    return best ? `${best.m.name} (+${best.delta.toFixed(1)})` : '—';
  })();

  return (
    <div className="bg-slate-900 text-white px-4 py-4 space-y-3 shrink-0">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Club Intelligence</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { val: teamsObserved,   label: 'Teams Observed' },
          { val: playersObserved, label: 'Players Observed' },
          { val: sessions.length, label: 'Total Sessions' },
          { val: sessThisMonth,   label: 'Sessions This Month' },
        ].map(s => (
          <div key={s.label} className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl font-black">{s.val}</p>
            <p className="text-xs text-white/60 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div className="bg-green-900/40 rounded-xl px-3 py-2">
          <p className="text-green-400 font-semibold">← Top Improving Team</p>
          <p className="text-white font-bold mt-0.5">{bestTeam}</p>
        </div>
        <div className="bg-green-900/40 rounded-xl px-3 py-2">
          <p className="text-green-400 font-semibold">← Top Improving Player</p>
          <p className="text-white font-bold mt-0.5">{bestPlayer}</p>
        </div>
      </div>
      {teamsNeedSupport.length > 0 && (
        <div className="bg-red-900/40 rounded-xl px-3 py-2 text-xs">
          <p className="text-red-400 font-semibold">âš  Teams Requiring Support ({teamsNeedSupport.length})</p>
          <p className="text-white/80 mt-0.5 truncate">{teamsNeedSupport.map(t => t.team_name).join(', ')}</p>
        </div>
      )}
    </div>
  );
}

// â"€â"€ New Session Form (unified single screen) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function NewSessionForm({ team, members, users, playerEvals, coachEvals, currentUser, onSaved, onClose }) {
  const teamMembers = members.filter(m => m.team_id === team.id);
  const coach       = users.find(u => u.email === team.owner_user_email);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    observation_date:     todayStr(),
    observation_type:     'training',
    result:               '',
    intensity_rating:     '',
    communication_rating: '',
    compete_rating:       '',
    body_language_rating: '',
    strengths:            '',
    growth_areas:         '',
    notes:                '',
    offense_notes:        '',
    defense_notes:        '',
  });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const overall = calcComponentAvg(form);

  // â"€â"€ Coach form â"€â"€
  const [coachExpanded, setCoachExpanded] = useState(false);
  const [coachForm, setCoachForm] = useState({
    communication_rating: '', organisation_rating: '', teaching_rating: '',
    engagement_rating: '', leadership_rating: '', culture_rating: '', notes: '',
  });
  const setCF = (k, v) => setCoachForm(f => ({ ...f, [k]: v }));
  const coachOverall = (() => {
    const vals = COACH_FIELDS.map(f => parseFloat(coachForm[f.key])).filter(v => !isNaN(v) && v >= 0 && v <= 9.9);
    return vals.length === COACH_FIELDS.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  })();
  const coachFilled = COACH_FIELDS.every(f => coachForm[f.key].toString().trim() !== '');
  const coachEvalHistory = coach ? (coachEvals || []).filter(e => e.coach_id === coach.id) : [];
  const coachAvg  = avgOfField(coachEvalHistory, 'overall_rating');
  const coachLast = coachEvalHistory.length
    ? [...coachEvalHistory].sort((a, b) => new Date(b.evaluation_date) - new Date(a.evaluation_date))[0]?.overall_rating
    : null;

  // â"€â"€ Player forms â"€â"€
  const [pForms,   setPForms]   = useState({});
  const [expanded, setExpanded] = useState(new Set());

  const setPF = (id, k, v) => {
    setPForms(f => ({ ...f, [id]: { rating: '', strengths: '', growth_areas: '', notes: '', useTeamDate: true, ...(f[id] || {}), [k]: v } }));
  };

  const ensurePForm = (id) => {
    setPForms(f => f[id] ? f : { ...f, [id]: { rating: '', strengths: '', growth_areas: '', notes: '', useTeamDate: true } });
  };

  const toggleExpand = (id) => {
    ensurePForm(id);
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const expandAll  = () => { teamMembers.forEach(m => ensurePForm(m.id)); setExpanded(new Set(teamMembers.map(m => m.id))); };
  const collapseAll = () => setExpanded(new Set());

  // A player card is "filled" if it has a rating entered
  const filledCount = teamMembers.filter(m => pForms[m.id]?.rating?.toString().trim() !== '' && pForms[m.id]?.rating !== undefined).length;

  const handleSaveAll = async () => {
    // Validate all 4 component ratings are filled and in range
    for (const cf of COMPONENT_FIELDS) {
      const v = parseFloat(form[cf.key]);
      if (isNaN(v)) return alert(`${cf.label} rating is required (1—10)`);
      if (v < 1 || v > 10) return alert(`${cf.label} must be between 1 and 10`);
    }
    if (form.observation_type === 'game' && !form.result) return alert('Please select a game result');

    // Validate filled player forms
    const filledPlayers = teamMembers.filter(m => {
      const pf = pForms[m.id];
      return pf && pf.rating !== undefined && pf.rating.toString().trim() !== '';
    });
    for (const m of filledPlayers) {
      const pr = parseFloat(pForms[m.id].rating);
      if (isNaN(pr) || pr < 0 || pr > 9.9) return alert(`${m.name}: rating must be 0.0 — 9.9`);
    }

    const computedOverall = calcComponentAvg(form);
    setSaving(true);
    try {
      const coach = users.find(u => u.email === team.owner_user_email);
      const sess = await db.entities.EvaluationSession.create({
        team_id:              team.id,
        coach_id:             coach?.id || null,
        observation_date:     form.observation_date,
        observation_type:     form.observation_type,
        result:               form.observation_type === 'game' ? form.result : null,
        intensity_rating:     parseFloat(parseFloat(form.intensity_rating).toFixed(1)),
        communication_rating: parseFloat(parseFloat(form.communication_rating).toFixed(1)),
        compete_rating:       parseFloat(parseFloat(form.compete_rating).toFixed(1)),
        body_language_rating: parseFloat(parseFloat(form.body_language_rating).toFixed(1)),
        overall_rating:       computedOverall,
        team_rating:          computedOverall,   // backward compat
        strengths:            form.strengths.trim()     || null,
        growth_areas:         form.growth_areas.trim()  || null,
        notes:                form.notes.trim()         || null,
        offense_notes:        form.observation_type === 'game' ? (form.offense_notes.trim() || null) : null,
        defense_notes:        form.observation_type === 'game' ? (form.defense_notes.trim() || null) : null,
        observer_id:          currentUser?.id           || null,
      });

      await Promise.all(filledPlayers.map(m => {
        const pf = pForms[m.id];
        const evalDate = pf.useTeamDate !== false ? form.observation_date : (pf.customDate || form.observation_date);
        return db.entities.PlayerEvaluation.create({
          evaluation_session_id: sess.id,
          player_id:             m.id,
          team_id:               team.id,
          evaluation_date:       evalDate,
          rating:                parseFloat(parseFloat(pf.rating).toFixed(1)),
          strengths:             pf.strengths?.trim()    || null,
          growth_areas:          pf.growth_areas?.trim() || null,
          notes:                 pf.notes?.trim()        || null,
          observer_id:           currentUser?.id         || null,
        });
      }));

      // Save coach eval if all fields are filled
      if (coachFilled && coach) {
        await db.entities.CoachEvaluation.create({
          evaluation_session_id: sess.id,
          coach_id:              coach.id,
          evaluation_date:       form.observation_date,
          communication_rating:  parseFloat(parseFloat(coachForm.communication_rating).toFixed(1)),
          organisation_rating:   parseFloat(parseFloat(coachForm.organisation_rating).toFixed(1)),
          teaching_rating:       parseFloat(parseFloat(coachForm.teaching_rating).toFixed(1)),
          engagement_rating:     parseFloat(parseFloat(coachForm.engagement_rating).toFixed(1)),
          leadership_rating:     parseFloat(parseFloat(coachForm.leadership_rating).toFixed(1)),
          culture_rating:        parseFloat(parseFloat(coachForm.culture_rating).toFixed(1)),
          overall_rating:        coachOverall,
          notes:                 coachForm.notes.trim() || null,
          observer_id:           currentUser?.id        || null,
        });
      }

      onSaved();
      onClose();
    } catch (err) { alert('Error saving: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-bold text-slate-900 text-sm">New Observation — {team.team_name}</h4>
          <p className="text-xs text-slate-500 italic mt-0.5">The score is the summary. The notes are the gold.</p>
        </div>
        <button onClick={onClose}><X size={16} className="text-slate-400 hover:text-slate-700" /></button>
      </div>

      {/* â"€â"€ Observation type selector â"€â"€ */}
      <div className="flex gap-2">
        {[
          { val: 'training', label: '🏀 Training Session' },
          { val: 'game',     label: '🏆 Game' },
        ].map(opt => (
          <button key={opt.val} onClick={() => setF('observation_type', opt.val)}
            className={`flex-1 py-2 text-sm font-bold rounded-xl border-2 transition-colors ${
              form.observation_type === opt.val
                ? opt.val === 'game' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-blue-500 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* â"€â"€ Team observation fields â"€â"€ */}
      <div className={`rounded-xl border p-3 space-y-3 ${form.observation_type === 'game' ? 'bg-amber-50 border-amber-100' : 'bg-white border-blue-100'}`}>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          {form.observation_type === 'game' ? 'Game Observation' : 'Training Observation'}
        </p>

        <div className={`grid gap-3 ${form.observation_type === 'game' ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
          <Field label="Date">
            <input type="date" value={form.observation_date} onChange={e => setF('observation_date', e.target.value)} className={INPUT} />
          </Field>
          {form.observation_type === 'game' && (
            <Field label="Result">
              <select value={form.result} onChange={e => setF('result', e.target.value)} className={INPUT + ' bg-white capitalize'}>
                <option value="">Select result…</option>
                {RESULT_OPTIONS.map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </Field>
          )}
        </div>

        {/* Component ratings */}
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">Rating Components (1—10)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {COMPONENT_FIELDS.map(cf => (
              <div key={cf.key}>
                <label className="text-xs font-semibold text-slate-500 block mb-1">{cf.label}</label>
                <input type="number" min="1" max="10" step="0.1" value={form[cf.key]}
                  onChange={e => setF(cf.key, e.target.value)}
                  className={INPUT + ' font-mono text-center'} placeholder="—" />
              </div>
            ))}
          </div>
        </div>

        {/* Auto-calculated overall */}
        <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${
          overall !== null
            ? form.observation_type === 'game' ? 'bg-amber-100' : 'bg-blue-100'
            : 'bg-slate-100'
        }`}>
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Overall Rating</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-black ${overall !== null ? (form.observation_type === 'game' ? 'text-amber-800' : 'text-blue-700') : 'text-slate-300'}`}>
              {overall !== null ? overall.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-slate-400 font-semibold">/ 10</span>
          </div>
        </div>

        {/* Game-specific fields */}
        {form.observation_type === 'game' && (
          <>
            <Field label="Offense">
              <textarea rows={2} value={form.offense_notes} onChange={e => setF('offense_notes', e.target.value)}
                placeholder="Offensive performance, spacing, transition…" className={INPUT + ' resize-none'} />
            </Field>
            <Field label="Defense">
              <textarea rows={2} value={form.defense_notes} onChange={e => setF('defense_notes', e.target.value)}
                placeholder="Defensive effort, closeouts, rotations…" className={INPUT + ' resize-none'} />
            </Field>
          </>
        )}

        <Field label="Strengths">
          <textarea rows={2} value={form.strengths} onChange={e => setF('strengths', e.target.value)}
            placeholder="What did the team do well?" className={INPUT + ' resize-none'} />
        </Field>
        <Field label="Growth Areas">
          <textarea rows={2} value={form.growth_areas} onChange={e => setF('growth_areas', e.target.value)}
            placeholder="What does the team need to improve?" className={INPUT + ' resize-none'} />
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)}
            placeholder="Context, energy, anything else..." className={INPUT + ' resize-none'} />
        </Field>
      </div>

      {/* â"€â"€ Coach observation â"€â"€ */}
      {coach && (
        <div className={`rounded-xl border transition-all bg-white ${coachFilled ? 'border-blue-300' : 'border-slate-200'}`}>
          <button onClick={() => setCoachExpanded(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
            <div className={`w-7 h-7 rounded-lg text-white flex items-center justify-center font-black text-xs shrink-0 ${coachFilled ? 'bg-blue-600' : 'bg-slate-700'}`}>
              {coachFilled ? <Check size={12} /> : (coach.full_name || coach.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-900 text-sm">{coach.full_name || coach.email}</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-semibold">Coach</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {coachAvg  !== null && <span className="text-xs text-slate-500">Avg <span className="font-bold text-slate-700">{fmtR(coachAvg)}</span></span>}
                {coachLast !== null && <span className="text-xs text-slate-400">Last <span className="font-semibold">{fmtR(coachLast)}</span></span>}
                {coachAvg === null && <span className="text-xs text-slate-300 italic">No history</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {coachFilled && coachOverall !== null && (
                <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700">{fmtR(coachOverall)}</span>
              )}
              <span className="text-xs text-slate-400 font-semibold">{coachExpanded ? '▲' : '▼'}</span>
            </div>
          </button>

          {coachExpanded && (
            <div className="px-3 pb-3 space-y-2.5 border-t border-slate-100 pt-2.5">
              <p className="text-xs text-slate-400 italic">All 6 fields required · 0.0—9.9 scale</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {COACH_FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">{f.label}</label>
                    <input type="number" min="0" max="9.9" step="0.1" value={coachForm[f.key]}
                      onChange={e => setCF(f.key, e.target.value)}
                      className={INPUT + ' font-mono text-center'} placeholder="—" />
                  </div>
                ))}
              </div>
              {coachOverall !== null && (
                <div className="bg-blue-50 rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Overall</span>
                  <span className="text-lg font-black text-blue-700">{fmtR(coachOverall)}</span>
                </div>
              )}
              <Field label="Notes">
                <textarea rows={2} value={coachForm.notes} onChange={e => setCF('notes', e.target.value)}
                  placeholder="Coaching quality, session management, communication…" className={INPUT + ' resize-none'} />
              </Field>
            </div>
          )}
        </div>
      )}

      {/* â"€â"€ Player evaluations â"€â"€ */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Players in This Team
            {filledCount > 0 && <span className="ml-2 text-blue-600 font-bold normal-case tracking-normal">{filledCount} filled</span>}
          </p>
          {teamMembers.length > 0 && (
            <div className="flex gap-2">
              <button onClick={expandAll}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">
                Expand All
              </button>
              <button onClick={collapseAll}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
                Collapse All
              </button>
            </div>
          )}
        </div>

        {teamMembers.length === 0
          ? <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-4 text-center">
              No players registered in this team.
            </p>
          : <div className="space-y-2">
              {teamMembers.map(m => {
                const isExpanded = expanded.has(m.id);
                const pf         = pForms[m.id] || {};
                const isFilled   = pf.rating !== undefined && pf.rating.toString().trim() !== '';
                const age        = calcAge(m.date_of_birth);
                const mEvals     = [...(playerEvals || []).filter(e => e.player_id === m.id)]
                  .sort((a, b) => new Date(b.evaluation_date) - new Date(a.evaluation_date));
                const avgRating  = avgOfField(mEvals, 'rating');
                const lastRating = mEvals[0]?.rating ?? null;
                const { color: badgeColor } = ratingInfo(isFilled ? pf.rating : avgRating);

                return (
                  <div key={m.id} className={`rounded-xl border transition-all bg-white ${isFilled ? 'border-blue-300' : 'border-slate-200'}`}>

                    {/* Player row header */}
                    <button onClick={() => toggleExpand(m.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                      {/* Avatar */}
                      <div className={`w-7 h-7 rounded-lg text-white flex items-center justify-center font-black text-xs shrink-0 ${isFilled ? 'bg-blue-600' : 'bg-slate-800'}`}>
                        {isFilled
                          ? <Check size={12} />
                          : (m.name || '?').charAt(0).toUpperCase()
                        }
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm">{m.name}</span>
                          {age !== null && <span className="text-xs text-slate-400">{age} yrs</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {avgRating !== null && (
                            <span className="text-xs text-slate-500">Avg <span className="font-bold text-slate-700">{fmtR(avgRating)}</span></span>
                          )}
                          {lastRating !== null && (
                            <span className="text-xs text-slate-400">Last <span className="font-semibold">{fmtR(lastRating)}</span></span>
                          )}
                          {avgRating === null && lastRating === null && (
                            <span className="text-xs text-slate-300 italic">No history</span>
                          )}
                        </div>
                      </div>

                      {/* Current rating badge or chevron */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isFilled && (
                          <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${badgeColor}`}>{fmtR(pf.rating)}</span>
                        )}
                        {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      </div>
                    </button>

                    {/* Expanded form */}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2.5 border-t border-slate-100 pt-2.5">

                        {/* Smart date toggle */}
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer select-none">
                          <input type="checkbox" checked={pf.useTeamDate !== false}
                            onChange={e => setPF(m.id, 'useTeamDate', e.target.checked)}
                            className="accent-blue-600 w-3.5 h-3.5" />
                          Use team date ({fmtDate(form.observation_date)})
                        </label>
                        {pf.useTeamDate === false && (
                          <Field label="Custom Date">
                            <input type="date" value={pf.customDate || form.observation_date}
                              onChange={e => setPF(m.id, 'customDate', e.target.value)} className={INPUT} />
                          </Field>
                        )}

                        <RatingInput label="Rating (0.0—9.9)" value={pf.rating || ''} onChange={v => setPF(m.id, 'rating', v)} />
                        <Field label="Strengths">
                          <textarea rows={2} value={pf.strengths || ''} onChange={e => setPF(m.id, 'strengths', e.target.value)}
                            placeholder="What did this player do well?" className={INPUT + ' resize-none'} />
                        </Field>
                        <Field label="Growth Areas">
                          <textarea rows={2} value={pf.growth_areas || ''} onChange={e => setPF(m.id, 'growth_areas', e.target.value)}
                            placeholder="Where do they need to improve?" className={INPUT + ' resize-none'} />
                        </Field>
                        <Field label="Notes">
                          <textarea rows={2} value={pf.notes || ''} onChange={e => setPF(m.id, 'notes', e.target.value)}
                            placeholder="Context, patterns, character..." className={INPUT + ' resize-none'} />
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
        }
      </div>

      {/* â"€â"€ Save button â"€â"€ */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-blue-100">
        <p className="text-xs text-slate-400">
          {[
            filledCount > 0 && `${filledCount} player eval${filledCount !== 1 ? 's' : ''}`,
            coachFilled && 'coach eval',
          ].filter(Boolean).length > 0
            ? `Also saving: ${[filledCount > 0 && `${filledCount} player eval${filledCount !== 1 ? 's' : ''}`, coachFilled && 'coach eval'].filter(Boolean).join(' + ')}`
            : 'Player + coach evaluations are optional'
          }
        </p>
        <div className="flex gap-2 shrink-0">
          <button onClick={onClose} className="text-sm text-slate-500 px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
            Cancel
          </button>
          <button onClick={handleSaveAll} disabled={saving}
            className="text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-xl disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Observation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// â"€â"€ Session Detail â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function SessionDetail({ session, team, members, users, playerEvals, coachEvals, onBack, onSaved, onSelectPlayer, onSelectCoach }) {
  const observer           = users.find(u => u.id === session.observer_id);
  const sessionPlayerEvals = playerEvals.filter(e => e.evaluation_session_id === session.id);
  const linkedCoachEval    = (coachEvals || []).find(c => c.evaluation_session_id === session.id);
  const dispRating         = sessionRating(session);
  const isGame             = session.observation_type === 'game';
  const { color }          = sessionRatingInfo(dispRating);

  const [editing,               setEditing]               = useState(false);
  const [confirmDeleteSession,  setConfirmDeleteSession]  = useState(false);
  const [savingSession,         setSavingSession]         = useState(false);
  const [editForm, setEditForm] = useState({
    observation_date:     session.observation_date,
    result:               session.result               || '',
    intensity_rating:     String(session.intensity_rating     ?? ''),
    communication_rating: String(session.communication_rating ?? ''),
    compete_rating:       String(session.compete_rating       ?? ''),
    body_language_rating: String(session.body_language_rating ?? ''),
    strengths:            session.strengths    || '',
    growth_areas:         session.growth_areas || '',
    notes:                session.notes        || '',
    offense_notes:        session.offense_notes || '',
    defense_notes:        session.defense_notes || '',
  });
  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }));
  const editOverall = calcComponentAvg(editForm);

  const [expandedEval,   setExpandedEval]   = useState(null);
  const [editingEval,    setEditingEval]    = useState(null);
  const [editEvalForm,   setEditEvalForm]   = useState({});
  const [confirmDelEval, setConfirmDelEval] = useState(null);
  const [savingEval,     setSavingEval]     = useState(false);
  const [openMenu,       setOpenMenu]       = useState(null);
  const setEEF = (k, v) => setEditEvalForm(f => ({ ...f, [k]: v }));

  const saveSession = async () => {
    for (const cf of COMPONENT_FIELDS) {
      const v = parseFloat(editForm[cf.key]);
      if (isNaN(v) || v < 1 || v > 10) return alert(`${cf.label} must be 1—10`);
    }
    const computed = calcComponentAvg(editForm);
    setSavingSession(true);
    try {
      await db.entities.EvaluationSession.update(session.id, {
        observation_date:     editForm.observation_date,
        result:               isGame ? editForm.result || null : null,
        intensity_rating:     parseFloat(parseFloat(editForm.intensity_rating).toFixed(1)),
        communication_rating: parseFloat(parseFloat(editForm.communication_rating).toFixed(1)),
        compete_rating:       parseFloat(parseFloat(editForm.compete_rating).toFixed(1)),
        body_language_rating: parseFloat(parseFloat(editForm.body_language_rating).toFixed(1)),
        overall_rating:       computed,
        team_rating:          computed,
        strengths:            editForm.strengths.trim()    || null,
        growth_areas:         editForm.growth_areas.trim() || null,
        notes:                editForm.notes.trim()        || null,
        offense_notes:        isGame ? (editForm.offense_notes.trim() || null) : null,
        defense_notes:        isGame ? (editForm.defense_notes.trim() || null) : null,
      });
      setEditing(false);
      onSaved();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSavingSession(false); }
  };

  const deleteSession = async () => {
    try {
      await db.entities.EvaluationSession.delete(session.id);
      onBack(); onSaved();
    } catch (err) { alert('Error: ' + err.message); }
  };

  const startEditEval = (ev) => {
    setEditingEval(ev.id);
    setEditEvalForm({ rating: String(ev.rating ?? ''), strengths: ev.strengths || '', growth_areas: ev.growth_areas || '', notes: ev.notes || '' });
  };

  const saveEval = async (ev) => {
    const r = parseFloat(editEvalForm.rating);
    if (isNaN(r) || r < 0 || r > 9.9) return alert('Rating must be 0.0 — 9.9');
    setSavingEval(true);
    try {
      await db.entities.PlayerEvaluation.update(ev.id, {
        rating:       parseFloat(r.toFixed(1)),
        strengths:    editEvalForm.strengths.trim()    || null,
        growth_areas: editEvalForm.growth_areas.trim() || null,
        notes:        editEvalForm.notes.trim()        || null,
      });
      setEditingEval(null); onSaved();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSavingEval(false); }
  };

  const deleteEval = async (id) => {
    try { await db.entities.PlayerEvaluation.delete(id); setConfirmDelEval(null); onSaved(); }
    catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
        <ArrowLeft size={15} /> Back to {team.team_name}
      </button>

      {/* Team observation card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900">{fmtDate(session.observation_date)}</p>
            {observer && (
              <p className="text-xs text-slate-400 mt-0.5">
                Observed by {observer.full_name || observer.email}
              </p>
            )}
            {session.coach_id && (() => {
              const sessionCoach = users.find(u => u.id === session.coach_id);
              return sessionCoach && onSelectCoach ? (
                <button onClick={() => onSelectCoach(sessionCoach)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold mt-0.5 flex items-center gap-1">
                  {sessionCoach.full_name || sessionCoach.email} → View Coach Profile
                </button>
              ) : null;
            })()}
          </div>
          {!editing && (
            <OptionsMenu items={[
              { label: 'Edit', action: () => setEditing(true) },
              { label: 'Delete', danger: true, action: () => { if (window.confirm('Delete this observation?')) deleteSession(); } },
            ]} />
          )}
        </div>

        {editing ? (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" value={editForm.observation_date} onChange={e => setEF('observation_date', e.target.value)} className={INPUT} />
              </Field>
              {isGame && (
                <Field label="Result">
                  <select value={editForm.result} onChange={e => setEF('result', e.target.value)} className={INPUT + ' bg-white capitalize'}>
                    <option value="">Select…</option>
                    {RESULT_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {COMPONENT_FIELDS.map(cf => (
                <div key={cf.key}>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">{cf.label}</label>
                  <input type="number" min="1" max="10" step="0.1" value={editForm[cf.key]}
                    onChange={e => setEF(cf.key, e.target.value)} className={INPUT + ' font-mono text-center'} placeholder="—" />
                </div>
              ))}
            </div>
            <div className="bg-slate-100 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Overall</span>
              <span className="text-xl font-black text-slate-700">{editOverall !== null ? `${editOverall.toFixed(1)} / 10` : '—'}</span>
            </div>
            {isGame && (
              <>
                <Field label="Offense">
                  <textarea rows={2} value={editForm.offense_notes} onChange={e => setEF('offense_notes', e.target.value)} className={INPUT + ' resize-none'} />
                </Field>
                <Field label="Defense">
                  <textarea rows={2} value={editForm.defense_notes} onChange={e => setEF('defense_notes', e.target.value)} className={INPUT + ' resize-none'} />
                </Field>
              </>
            )}
            <Field label="Strengths">
              <textarea rows={2} value={editForm.strengths} onChange={e => setEF('strengths', e.target.value)} className={INPUT + ' resize-none'} />
            </Field>
            <Field label="Growth Areas">
              <textarea rows={2} value={editForm.growth_areas} onChange={e => setEF('growth_areas', e.target.value)} className={INPUT + ' resize-none'} />
            </Field>
            <Field label="Notes">
              <textarea rows={2} value={editForm.notes} onChange={e => setEF('notes', e.target.value)} className={INPUT + ' resize-none'} />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="text-sm text-slate-500 px-3 py-1.5 rounded-xl border border-slate-200">Cancel</button>
              <button onClick={saveSession} disabled={savingSession}
                className="text-sm font-bold text-white bg-blue-600 px-4 py-1.5 rounded-xl disabled:opacity-50">
                {savingSession ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Type badge + result + overall rating */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isGame ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>
                {isGame ? '🏆 Game' : '🏀 Training'}
              </span>
              {isGame && session.result && (
                <span className={`text-xs font-bold px-2 py-1 rounded-lg capitalize ${
                  session.result === 'win' ? 'bg-green-100 text-green-700' :
                  session.result === 'loss' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                }`}>{session.result}</span>
              )}
            </div>

            {/* Overall rating */}
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-black px-3 py-1 rounded-xl ${color}`}>
                {dispRating !== null ? `${parseFloat(dispRating).toFixed(1)}` : '—'}
              </span>
              <div>
                <p className="text-xs text-slate-400 font-semibold">/ 10  Overall</p>
                {dispRating !== null && <span className={`text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 inline-block ${color}`}>{sessionRatingInfo(dispRating).label}</span>}
              </div>
            </div>

            {/* Component breakdown */}
            {session.intensity_rating != null && (
              <div className="grid grid-cols-4 gap-1.5">
                {COMPONENT_FIELDS.map(cf => (
                  <div key={cf.key} className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                    <p className="text-sm font-black text-slate-800">{fmtR(session[cf.key])}</p>
                    <p className="text-xs text-slate-400 leading-tight mt-0.5">{cf.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Game sections */}
            {isGame && session.offense_notes && (
              <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Offense</p>
                <p className="text-sm text-slate-700 mt-0.5">{session.offense_notes}</p>
              </div>
            )}
            {isGame && session.defense_notes && (
              <div>
                <p className="text-xs font-bold text-red-500 uppercase tracking-wide">Defense</p>
                <p className="text-sm text-slate-700 mt-0.5">{session.defense_notes}</p>
              </div>
            )}

            {session.strengths && (
              <div>
                <p className="text-xs font-bold text-green-600 uppercase tracking-wide">Strengths</p>
                <p className="text-sm text-slate-700 mt-0.5">{session.strengths}</p>
              </div>
            )}
            {session.growth_areas && (
              <div>
                <p className="text-xs font-bold text-orange-500 uppercase tracking-wide">Growth Areas</p>
                <p className="text-sm text-slate-700 mt-0.5">{session.growth_areas}</p>
              </div>
            )}
            {session.notes && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Notes</p>
                <p className="text-sm text-slate-700 mt-0.5">{session.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Coach evaluation linked to this session */}
      {linkedCoachEval && (() => {
        const coachUser = users.find(u => u.id === linkedCoachEval.coach_id);
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Coach Evaluation</h3>
              {coachUser && (
                <button onClick={() => onSelectCoach?.(coachUser)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                  {coachUser.full_name || coachUser.email} →
                </button>
              )}
            </div>
            {linkedCoachEval.overall_rating != null && (
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-black px-3 py-1 rounded-xl ${sessionRatingInfo(linkedCoachEval.overall_rating).color}`}>
                  {parseFloat(linkedCoachEval.overall_rating).toFixed(1)}
                </span>
                <span className="text-xs text-slate-400 font-semibold">/ 10  Overall</span>
              </div>
            )}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
              {COACH_FIELDS.map(cf => linkedCoachEval[cf.key] != null && (
                <div key={cf.key} className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                  <p className="text-sm font-black text-slate-800">{fmtR(linkedCoachEval[cf.key])}</p>
                  <p className="text-xs text-slate-400 leading-tight mt-0.5">{cf.label}</p>
                </div>
              ))}
            </div>
            {linkedCoachEval.notes && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Notes</p>
                <p className="text-sm text-slate-700 mt-0.5">{linkedCoachEval.notes}</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Players evaluated */}
      <div className="space-y-2">
        <h3 className="font-bold text-slate-900 text-sm">
          Players Evaluated <span className="text-slate-400 font-normal">({sessionPlayerEvals.length})</span>
        </h3>
        {sessionPlayerEvals.length === 0
          ? <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center text-slate-400 text-sm">
              No player evaluations in this session.
            </div>
          : sessionPlayerEvals.map(ev => {
              const member      = members.find(m => m.id === ev.player_id);
              const isExpanded  = expandedEval === ev.id;
              const isEditingEv = editingEval === ev.id;
              const isMenuOpen  = openMenu === ev.id;
              const { color: evColor } = ratingInfo(ev.rating);
              return (
                <div key={ev.id} className="bg-white rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2 px-4 py-3">
                    {/* Name — click to go to player profile */}
                    <button
                      onClick={() => member && onSelectPlayer?.(member)}
                      className="flex-1 font-semibold text-slate-900 text-sm text-left hover:text-blue-600 transition-colors truncate"
                    >
                      {member?.name || 'Unknown Player'}
                    </button>

                    {/* Rating badge */}
                    <span className={`text-sm font-black px-2 py-0.5 rounded-lg shrink-0 ${evColor}`}>
                      {fmtR(ev.rating)}
                    </span>

                    {/* Three-dot menu */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setOpenMenu(isMenuOpen ? null : ev.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-base leading-none font-bold"
                      >
                        ···
                      </button>
                      {isMenuOpen && (
                        <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-36">
                          {member && (
                            <button
                              onClick={() => { onSelectPlayer?.(member); setOpenMenu(null); }}
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <UserCircle size={13} /> View Player
                            </button>
                          )}
                          <button
                            onClick={() => { setExpandedEval(isExpanded ? null : ev.id); setOpenMenu(null); }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                            <Eye size={13} /> View Notes
                          </button>
                          <button
                            onClick={() => { startEditEval(ev); setExpandedEval(ev.id); setOpenMenu(null); }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                            <Pencil size={13} /> Edit Score
                          </button>
                          <div className="border-t border-slate-100 mt-1 pt-1">
                            {confirmDelEval === ev.id
                              ? <div className="px-3 py-1.5">
                                  <ConfirmDelete onConfirm={() => { deleteEval(ev.id); setOpenMenu(null); }} onCancel={() => setConfirmDelEval(null)} />
                                </div>
                              : <button
                                  onClick={() => { setConfirmDelEval(ev.id); }}
                                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                  <Trash2 size={13} /> Delete Score
                                </button>
                            }
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail / edit form */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                      {isEditingEv ? (
                        <div className="space-y-3">
                          <RatingInput label="Rating" value={editEvalForm.rating} onChange={v => setEEF('rating', v)} />
                          <Field label="Strengths">
                            <textarea rows={2} value={editEvalForm.strengths} onChange={e => setEEF('strengths', e.target.value)} className={INPUT + ' resize-none'} />
                          </Field>
                          <Field label="Growth Areas">
                            <textarea rows={2} value={editEvalForm.growth_areas} onChange={e => setEEF('growth_areas', e.target.value)} className={INPUT + ' resize-none'} />
                          </Field>
                          <Field label="Notes">
                            <textarea rows={2} value={editEvalForm.notes} onChange={e => setEEF('notes', e.target.value)} className={INPUT + ' resize-none'} />
                          </Field>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setEditingEval(null); setExpandedEval(null); }} className="text-sm text-slate-500 px-3 py-1.5 rounded-xl border border-slate-200">Cancel</button>
                            <button onClick={() => saveEval(ev)} disabled={savingEval}
                              className="text-sm font-bold text-white bg-blue-600 px-4 py-1.5 rounded-xl disabled:opacity-50">
                              {savingEval ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {ev.strengths    && <div><p className="text-xs font-bold text-green-600 uppercase tracking-wide">Strengths</p><p className="text-sm text-slate-700">{ev.strengths}</p></div>}
                          {ev.growth_areas && <div><p className="text-xs font-bold text-orange-500 uppercase tracking-wide">Growth Areas</p><p className="text-sm text-slate-700">{ev.growth_areas}</p></div>}
                          {ev.notes        && <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Notes</p><p className="text-sm text-slate-700">{ev.notes}</p></div>}
                          {!ev.strengths && !ev.growth_areas && !ev.notes && (
                            <p className="text-xs text-slate-300 italic">No notes recorded for this evaluation.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// â"€â"€ Team Profile â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function TeamProfile({ team, users, sessions, playerEvals, coachEvals, members, currentUser, obsPerPage = 25, onBack, onSaved, onSelectPlayer, onSelectCoach }) {
  const teamSessions = [...sessions.filter(s => s.team_id === team.id)]
    .sort((a, b) => new Date(b.observation_date) - new Date(a.observation_date));
  const [obsVisible, setObsVisible] = useState(obsPerPage);
  const coach   = users.find(u => u.email === team.owner_user_email);
  const latest  = sessionRating(teamSessions[0]);
  const avg     = (() => {
    const vals = teamSessions.map(s => sessionRating(s)).filter(v => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  })();

  const [teamAttendance, setTeamAttendance]   = useState(null);
  const [teamChallenges, setTeamChallenges]   = useState(null);
  useEffect(() => {
    if (team.id) {
      db.entities.AttendanceRecord.filter({ team_id: team.id }, '-date', 500)
        .then(setTeamAttendance).catch(() => setTeamAttendance([]));
      db.entities.ChallengeResult.filter({ team_id: team.id }, '-completed_at', 100)
        .then(setTeamChallenges).catch(() => setTeamChallenges([]));
    }
  }, [team.id]);

  const [showForm,        setShowForm]        = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showAllObs,      setShowAllObs]      = useState(false);
  const [allObsPage,      setAllObsPage]      = useState(0);
  const ALL_OBS_PAGE_SIZE = 20;

  if (showAllObs) {
    const totalPages = Math.ceil(teamSessions.length / ALL_OBS_PAGE_SIZE);
    const pageItems = teamSessions.slice(allObsPage * ALL_OBS_PAGE_SIZE, (allObsPage + 1) * ALL_OBS_PAGE_SIZE);
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
        <button onClick={() => setShowAllObs(false)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
          <ArrowLeft size={15} /> Back to {team.team_name}
        </button>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">All Observations — {team.team_name}</h3>
          <span className="text-xs text-slate-400">{teamSessions.length} total</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Rating</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Players</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map(s => {
                const playerCount = playerEvals.filter(e => e.evaluation_session_id === s.id).length;
                const sr = sessionRating(s);
                const { color } = sessionRatingInfo(sr);
                const isGame = s.observation_type === 'game';
                return (
                  <tr key={s.id} onClick={() => { setShowAllObs(false); setSelectedSession(s); }}
                    className="cursor-pointer hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 text-xs">{fmtDate(s.observation_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${isGame ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isGame ? '🏆 Game' : '🏀 Training'}
                      </span>
                      {isGame && s.result && (
                        <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded-md capitalize ${s.result === 'win' ? 'bg-green-100 text-green-700' : s.result === 'loss' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{s.result}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${color}`}>{sr !== null ? parseFloat(sr).toFixed(1) : '—'}</span>
                      <span className="text-xs text-slate-400 ml-1">/ 10</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs">{playerCount > 0 ? `${playerCount} player${playerCount !== 1 ? 's' : ''}` : '—'}</td>
                    <td className="px-4 py-3 text-slate-300"><Eye size={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setAllObsPage(p => Math.max(0, p - 1))} disabled={allObsPage === 0}
                className="text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                â† Previous
              </button>
              <span className="text-xs text-slate-400">Page {allObsPage + 1} of {totalPages}</span>
              <button onClick={() => setAllObsPage(p => Math.min(totalPages - 1, p + 1))} disabled={allObsPage >= totalPages - 1}
                className="text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectedSession) {
    const fresh = sessions.find(s => s.id === selectedSession.id) || selectedSession;
    return (
      <SessionDetail
        session={fresh} team={team} members={members} users={users}
        playerEvals={playerEvals} coachEvals={coachEvals}
        onBack={() => setSelectedSession(null)} onSaved={onSaved}
        onSelectPlayer={onSelectPlayer} onSelectCoach={onSelectCoach}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
        <ArrowLeft size={15} /> Back to Teams
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-slate-900 text-lg">{team.team_name}</h2>
            <div className="flex gap-2 mt-1 flex-wrap">
              {team.age_group && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{team.age_group}</span>}
              {coach && <span className="text-xs text-slate-400">{coach.full_name || coach.email}</span>}
            </div>
          </div>
          <button onClick={() => { setShowForm(true); }}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl shrink-0 transition-colors">
            <Plus size={14} /> New Observation
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          {[
            { label: 'Current Rating', val: latest !== null ? `${parseFloat(latest).toFixed(1)} / 10` : '—' },
            { label: 'Avg Rating',     val: avg    !== null ? `${parseFloat(avg).toFixed(1)} / 10`    : '—' },
            { label: 'Last Session',   val: teamSessions[0] ? fmtDate(teamSessions[0].observation_date) : '—' },
            { label: 'Total Sessions', val: teamSessions.length },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3">
              <p className="text-base font-black text-slate-900 leading-tight">{s.val}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        {avg !== null && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sessionRatingInfo(avg).color}`}>
            {sessionRatingInfo(avg).label}
          </span>
        )}

        {/* Development graph */}
        <DevGraph
          data={[...teamSessions].reverse().map(s => ({
            date: s.observation_date ? format(parseISO(s.observation_date), 'd MMM') : '',
            value: sessionRating(s),
          })).filter(d => d.value != null)}
          maxY={10}
          color="#2563eb"
          label="Team Rating"
        />
      </div>

      {/* New session form */}
      {showForm && (
        <NewSessionForm
          team={team} members={members} users={users} playerEvals={playerEvals} coachEvals={coachEvals} currentUser={currentUser}
          onSaved={onSaved} onClose={() => setShowForm(false)}
        />
      )}

      {/* Team Attendance */}
      {teamAttendance !== null && (() => {
        const total   = teamAttendance.length;
        const present = teamAttendance.filter(r => r.status === 'Present').length;
        const late    = teamAttendance.filter(r => r.status === 'Late').length;
        const absent  = teamAttendance.filter(r => r.status === 'Absent').length;
        const injured = teamAttendance.filter(r => r.status === 'Injured').length;
        const excused = teamAttendance.filter(r => r.status === 'Excused').length;
        const rate    = total > 0 ? Math.round(((present + late + excused) / total) * 100) : null;
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Team Attendance</h3>
              {rate !== null && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rate >= 80 ? 'bg-green-100 text-green-700' : rate >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{rate}%</span>}
            </div>
            {total === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-2">No attendance records yet.</p>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { label: 'Present', value: present, bg: 'bg-green-50', t: 'text-green-700' },
                  { label: 'Absent',  value: absent,  bg: 'bg-red-50',   t: 'text-red-700' },
                  { label: 'Late',    value: late,    bg: 'bg-amber-50', t: 'text-amber-700' },
                  { label: 'Injured', value: injured, bg: 'bg-pink-50',  t: 'text-pink-700' },
                  { label: 'Excused', value: excused, bg: 'bg-blue-50',  t: 'text-blue-700' },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-1.5 text-center`}>
                    <p className={`text-base font-black ${s.t}`}>{s.value}</p>
                    <p className="text-xs font-medium text-slate-400 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Team Challenges */}
      {teamChallenges !== null && teamChallenges.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-amber-500" />
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Challenge Results ({teamChallenges.length})</h3>
          </div>
          {teamChallenges.slice(0, 8).map(r => (
            <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
              <span className="text-xs text-slate-500">{r.completed_at ? format(parseISO(r.completed_at), 'd MMM yyyy') : '—'}</span>
              <span className="text-xs font-semibold text-slate-700">{r.result_value ?? '—'}</span>
              {r.target_value && <span className="text-xs text-slate-400">Target: {r.target_value}</span>}
            </div>
          ))}
          {teamChallenges.length > 8 && <p className="text-xs text-slate-400 text-center">+{teamChallenges.length - 8} more</p>}
        </div>
      )}

      {/* Observation history */}
      <div className="space-y-2">
        <h3 className="font-bold text-slate-900 text-sm">Observation History</h3>
        {teamSessions.length === 0
          ? <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
              No observations yet — click <strong>New Observation</strong> to get started.
            </div>
          : <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Rating</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Players</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamSessions.slice(0, obsVisible).map(s => {
                    const playerCount = playerEvals.filter(e => e.evaluation_session_id === s.id).length;
                    const sr          = sessionRating(s);
                    const { color }   = sessionRatingInfo(sr);
                    const isGameRow   = s.observation_type === 'game';
                    return (
                      <tr key={s.id} onClick={() => setSelectedSession(s)}
                        className="cursor-pointer hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 text-xs">{fmtDate(s.observation_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${isGameRow ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {isGameRow ? '🏆 Game' : '🏀 Training'}
                            </span>
                            {isGameRow && s.result && (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md capitalize ${
                                s.result === 'win' ? 'bg-green-100 text-green-700' :
                                s.result === 'loss' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                              }`}>{s.result}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${color}`}>
                            {sr !== null ? `${parseFloat(sr).toFixed(1)}` : '—'}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">/ 10</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs">
                          {playerCount > 0 ? `${playerCount} player${playerCount !== 1 ? 's' : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <Eye size={14} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button onClick={() => setShowAllObs(true)}
                className="w-full py-2.5 border-t border-slate-100 text-sm text-slate-500 hover:bg-slate-50 font-semibold bg-white">
                {teamSessions.length > obsPerPage
                  ? `See all observations (${teamSessions.length - obsPerPage} more)`
                  : `See all observations (${teamSessions.length})`}
              </button>
            </div>
        }
      </div>
    </div>
  );
}

// â"€â"€ Teams List â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const DH_PAGE = 25;

// â"€â"€ Dev Hub settings (persisted) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const DEVHUB_SETTINGS_KEY = 'coachpad_devhub_settings';
const DEVHUB_SETTINGS_DEFAULT = { obsPerPage: 3, ageMethod: 'dec31', listPageSize: 25 };
function loadDevHubSettings() {
  try { return { ...DEVHUB_SETTINGS_DEFAULT, ...JSON.parse(localStorage.getItem(DEVHUB_SETTINGS_KEY) || '{}') }; }
  catch { return DEVHUB_SETTINGS_DEFAULT; }
}

// Small "Load more" control reused by the observation histories.
function LoadMore({ shown, total, onMore }) {
  if (total <= shown) return null;
  return (
    <button onClick={onMore}
      className="w-full py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 mt-2">
      Load more ({total - shown} of {total} remaining)
    </button>
  );
}
function TeamsList({ teams, users, sessions, playerEvals, onSelectTeam, search, pageSize = 25 }) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, teams]);
  const filtered = teams.filter(t => !search || (t.team_name || '').toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return (
    <div className="p-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
        {teams.length === 0 ? 'No club teams yet.' : 'No teams match your search.'}
      </div>
    </div>
  );
  return (
    <div className="p-4 space-y-2 w-full min-w-0">
      {filtered.slice(page * pageSize, (page + 1) * pageSize).map(t => {
        const ts     = sessions.filter(s => s.team_id === t.id);
        const latest = ts.length ? [...ts].sort((a, b) => new Date(b.observation_date) - new Date(a.observation_date))[0] : null;
        const vals   = ts.map(s => sessionRating(s)).filter(v => v != null);
        const avg    = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
        const trend  = calcTrend(ts, 'overall_rating');
        const coach  = users.find(u => u.email === t.owner_user_email);
        return (
          <div key={t.id} onClick={() => onSelectTeam(t)}
            className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-900">{t.team_name}</p>
                  {t.age_group && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold">{t.age_group}</span>}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {coach ? (coach.full_name || coach.email) : 'No coach'}
                  {latest ? ` · Last obs ${fmtDate(latest.observation_date)}` : ' · No observations'}
                  {ts.length > 0 ? ` · ${ts.length} session${ts.length !== 1 ? 's' : ''}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TrendIcon trend={trend} />
                <div className="text-right">
                  <p className={`text-xl font-black leading-none ${ratingTextColor(avg)}`}>
                    {avg !== null ? parseFloat(avg).toFixed(1) : '—'}
                  </p>
                  {avg !== null && <p className="text-xs text-slate-400">/ 10</p>}
                </div>
              </div>
            </div>
            {avg !== null && (
              <div className="mt-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sessionRatingInfo(avg).color}`}>
                  {sessionRatingInfo(avg).label}
                </span>
              </div>
            )}
          </div>
        );
      })}
      <Pagination page={page} totalPages={Math.ceil(filtered.length / pageSize)} onPage={setPage} />
    </div>
  );
}

// â"€â"€ Player History â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function PlayerHistory({ member, teams, users, sessions, playerEvals, onBack, onSaved, onSelectTeam, currentUser, ageMethod = 'dec31', obsPerPage = 3 }) {
  const evals = [...playerEvals.filter(e => e.player_id === member.id)]
    .sort((a, b) => new Date(b.evaluation_date) - new Date(a.evaluation_date));
  const [obsVisible, setObsVisible] = useState(obsPerPage);
  const [showAllAtt, setShowAllAtt] = useState(false);
  const team = teams.find(t => t.id === member.team_id);
  const age  = ageMethod === 'dec31' ? calcAgeDec31(member.date_of_birth) : calcAge(member.date_of_birth);
  const avg  = avgOfField(evals, 'rating');
  const [attendance, setAttendance] = useState(null);
  const [playerNotes, setPlayerNotes] = useState(null);
  const [challenges, setChallenges] = useState(null);
  useEffect(() => {
    if (!member.id) return;
    // Resolve the Player entity linked to this Member so we can fetch by both IDs
    db.entities.Player.filter({ member_id: member.id }, '-created_date', 5)
      .then(players => {
        const linkedId = players[0]?.id || null;
        const ids = linkedId && linkedId !== member.id ? [member.id, linkedId] : [member.id];

        // Attendance — may be stored under either ID
        Promise.all(ids.map(id => db.entities.AttendanceRecord.filter({ player_id: id }, '-date', 200).catch(() => [])))
          .then(results => {
            const seen = new Set();
            setAttendance(results.flat().sort((a, b) => new Date(b.date) - new Date(a.date)).filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; }));
          });

        // Notes — same dual fetch
        Promise.all(ids.map(id => db.entities.PlayerNote.filter({ player_id: id }, '-created_date', 100).catch(() => [])))
          .then(results => {
            const seen = new Set();
            setPlayerNotes(results.flat().sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; }));
          });

        // Challenge results
        db.entities.ChallengeResult.list('-completed_at', 200)
          .then(all => {
            const mine = all.filter(r => {
              if (ids.includes(r.player_id)) return true;
              try { const pids = Array.isArray(r.player_ids) ? r.player_ids : JSON.parse(r.player_ids || '[]'); return ids.some(id => pids.includes(id)); } catch { return false; }
            });
            setChallenges(mine);
          }).catch(() => setChallenges([]));
      }).catch(() => {
        // fallback: fetch by member.id only
        db.entities.AttendanceRecord.filter({ player_id: member.id }, '-date', 200).then(setAttendance).catch(() => setAttendance([]));
        db.entities.PlayerNote.filter({ player_id: member.id }, '-created_date', 100).then(setPlayerNotes).catch(() => setPlayerNotes([]));
        setChallenges([]);
      });
  }, [member.id]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState({ evaluation_date: todayStr(), rating: '', strengths: '', growth_areas: '', notes: '' });
  const setAF = (k, v) => setAddForm(f => ({ ...f, [k]: v }));
  const [savingAdd, setSavingAdd]     = useState(false);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText]         = useState('');
  const [savingNote, setSavingNote]     = useState(false);
  const saveNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const created = await db.entities.PlayerNote.create({
        player_id:       member.id,
        team_id:         team?.id || null,
        note:            noteText.trim(),
        coach_user_email: currentUser?.email || null,
        created_date:    new Date().toISOString(),
      });
      setPlayerNotes(prev => [created, ...(prev || [])]);
      setNoteText('');
      setShowNoteForm(false);
      onSaved();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSavingNote(false); }
  };

  const saveAdd = async () => {
    const r = parseFloat(addForm.rating);
    if (isNaN(r) || r < 0 || r > 9.9) return alert('Rating must be 0.0 — 9.9');
    setSavingAdd(true);
    try {
      await db.entities.PlayerEvaluation.create({
        player_id:       member.id,
        team_id:         team?.id  || null,
        evaluation_date: addForm.evaluation_date,
        rating:          parseFloat(r.toFixed(1)),
        strengths:       addForm.strengths.trim()    || null,
        growth_areas:    addForm.growth_areas.trim() || null,
        notes:           addForm.notes.trim()        || null,
        observer_id:     currentUser?.id             || null,
      });
      setAddForm({ evaluation_date: todayStr(), rating: '', strengths: '', growth_areas: '', notes: '' });
      setShowAddForm(false);
      onSaved();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSavingAdd(false); }
  };

  const [selectedObs, setSelectedObs] = useState(null);
  const [showAllObs, setShowAllObs] = useState(false);
  const [allObsPage, setAllObsPage] = useState(0);
  const ALL_OBS_PAGE_SIZE = 20;

  const freshObs = selectedObs ? evals.find(e => e.id === selectedObs.id) : null;
  if (selectedObs) {
    if (!freshObs) { setSelectedObs(null); }
    else return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <PlayerObsDetail ev={freshObs} member={member} users={users}
          onBack={() => setSelectedObs(null)}
          onSaved={onSaved}
        />
      </div>
    );
  }

  if (showAllObs) {
    const totalPages = Math.ceil(evals.length / ALL_OBS_PAGE_SIZE);
    const pageEvals = evals.slice(allObsPage * ALL_OBS_PAGE_SIZE, (allObsPage + 1) * ALL_OBS_PAGE_SIZE);
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
        <button onClick={() => setShowAllObs(false)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
          <ArrowLeft size={15} /> Back to {member.name}
        </button>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">All Observations — {member.name}</h3>
          <span className="text-xs text-slate-400">{evals.length} total</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Rating</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Coach</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageEvals.map(ev => {
                const observer = users.find(u => u.id === ev.observer_id);
                const { color } = ratingInfo(ev.rating);
                return (
                  <tr key={ev.id} onClick={() => { setShowAllObs(false); setSelectedObs(ev); }}
                    className="cursor-pointer hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 text-xs">{fmtDate(ev.evaluation_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${color}`}>{fmtR(ev.rating)}</span>
                      <span className="text-xs text-slate-400 ml-1">/ 10</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{observer ? (observer.full_name || observer.email) : '—'}</td>
                    <td className="px-4 py-3 text-slate-300"><Eye size={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setAllObsPage(p => Math.max(0, p - 1))} disabled={allObsPage === 0}
                className="text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                â† Previous
              </button>
              <span className="text-xs text-slate-400">Page {allObsPage + 1} of {totalPages}</span>
              <button onClick={() => setAllObsPage(p => Math.min(totalPages - 1, p + 1))} disabled={allObsPage >= totalPages - 1}
                className="text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
        <ArrowLeft size={15} /> Back to Players
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-lg shrink-0">
            {(member.name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-black text-slate-900 text-lg">{member.name}</h2>
            <div className="flex flex-wrap gap-2 mt-1 items-center">
              {team && (
                <button onClick={() => onSelectTeam?.(team)}
                  className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold hover:bg-blue-100 transition-colors">
                  {team.team_name}
                </button>
              )}
              {age !== null && <span className="text-xs text-slate-400 font-semibold">Age {age}{ageMethod === 'dec31' ? ' (as at 31 Dec)' : ''}</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Avg Rating',   val: fmtR(avg) },
            { label: 'Observations', val: evals.length },
            { label: 'Last Seen',    val: evals[0] ? fmtDate(evals[0].evaluation_date) : '—' },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3">
              <p className="text-base font-black text-slate-900">{s.val}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
        {avg !== null && <RatingBadge rating={avg} />}
        <DevGraph
          data={[...evals].reverse().map(ev => ({
            date: ev.evaluation_date ? format(parseISO(ev.evaluation_date), 'd MMM') : '',
            value: ev.rating,
          })).filter(d => d.value != null)}
          maxY={9.9}
          color="#7c3aed"
          label="Player Rating"
        />
      </div>

      {/* Attendance summary */}
      {attendance !== null && (() => {
        const total = attendance.length;
        const present = attendance.filter(r => r.status === 'Present').length;
        const late = attendance.filter(r => r.status === 'Late').length;
        const absent = attendance.filter(r => r.status === 'Absent').length;
        const injured = attendance.filter(r => r.status === 'Injured').length;
        const excused = attendance.filter(r => r.status === 'Excused').length;
        const rate = total > 0 ? Math.round(((present + late + excused) / total) * 100) : null;
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attendance</h3>
              {rate !== null && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rate >= 80 ? 'bg-green-100 text-green-700' : rate >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{rate}%</span>}
            </div>
            {total === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-2">No attendance records yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { label: 'Present', value: present, bg: 'bg-green-50', t: 'text-green-700' },
                    { label: 'Absent', value: absent, bg: 'bg-red-50', t: 'text-red-700' },
                    { label: 'Late', value: late, bg: 'bg-amber-50', t: 'text-amber-700' },
                    { label: 'Injured', value: injured, bg: 'bg-pink-50', t: 'text-pink-700' },
                    { label: 'Excused', value: excused, bg: 'bg-blue-50', t: 'text-blue-700' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-1.5 text-center`}>
                      <p className={`text-base font-black ${s.t}`}>{s.value}</p>
                      <p className="text-xs font-medium text-slate-400 leading-tight">{s.label}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowAllAtt(true)}
                  className="w-full pt-1 text-xs text-blue-600 hover:text-blue-700 font-semibold text-center hover:bg-blue-50 py-2 rounded-xl transition-colors">
                  See all {attendance.length} records →
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* Observation History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Observation History</h3>
          <button onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl transition-colors">
            <Plus size={14} /> Add Observation
          </button>
        </div>

        {showAddForm && (
          <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">New Player Observation</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" value={addForm.evaluation_date} onChange={e => setAF('evaluation_date', e.target.value)} className={INPUT} />
              </Field>
              <RatingInput label="Rating (0.0—9.9)" value={addForm.rating} onChange={v => setAF('rating', v)} />
            </div>
            <Field label="Strengths">
              <textarea rows={2} value={addForm.strengths} onChange={e => setAF('strengths', e.target.value)}
                placeholder="What did this player do well?" className={INPUT + ' resize-none'} />
            </Field>
            <Field label="Growth Areas">
              <textarea rows={2} value={addForm.growth_areas} onChange={e => setAF('growth_areas', e.target.value)}
                placeholder="Where do they need to improve?" className={INPUT + ' resize-none'} />
            </Field>
            <Field label="Notes">
              <textarea rows={2} value={addForm.notes} onChange={e => setAF('notes', e.target.value)}
                placeholder="Context, patterns, character..." className={INPUT + ' resize-none'} />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddForm(false)} className="text-sm text-slate-500 px-3 py-1.5 rounded-xl border border-slate-200 bg-white">Cancel</button>
              <button onClick={saveAdd} disabled={savingAdd}
                className="text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-xl disabled:opacity-50">
                {savingAdd ? 'Saving…' : 'Save Observation'}
              </button>
            </div>
          </div>
        )}

        {evals.length === 0
          ? <p className="text-sm text-slate-400 text-center py-6">No observations recorded yet.</p>
          : <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Rating</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Coach</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evals.slice(0, obsPerPage).map(ev => {
                    const observer = users.find(u => u.id === ev.observer_id);
                    const { color } = ratingInfo(ev.rating);
                    return (
                      <tr key={ev.id} onClick={() => setSelectedObs(ev)}
                        className="cursor-pointer hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 text-xs">{fmtDate(ev.evaluation_date)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${color}`}>{fmtR(ev.rating)}</span>
                          <span className="text-xs text-slate-400 ml-1">/ 10</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell truncate max-w-[120px]">
                          {observer ? (observer.full_name || observer.email) : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-300"><Eye size={14} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {evals.length > obsPerPage && (
                <button onClick={() => setShowAllObs(true)}
                  className="w-full py-2.5 border-t border-slate-100 text-sm text-slate-500 hover:bg-slate-50 font-semibold bg-white">
                  See all observations ({evals.length - obsPerPage} more)
                </button>
              )}
            </div>
        }
      </div>

      {/* Challenge Results */}
      {challenges !== null && challenges.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-amber-500" />
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Challenge Results</h3>
          </div>
          {challenges.slice(0, 6).map(r => (
            <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
              <span className="text-xs text-slate-500">{r.completed_at ? format(parseISO(r.completed_at), 'd MMM yyyy') : '—'}</span>
              <span className="text-xs font-semibold text-slate-700">{r.result_value ?? '—'}</span>
              {r.target_value && <span className="text-xs text-slate-400">Target: {r.target_value}</span>}
            </div>
          ))}
          {challenges.length > 6 && <p className="text-xs text-slate-400 text-center">+{challenges.length - 6} more</p>}
        </div>
      )}

      {/* Coach Notes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-slate-400" />
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Coach Notes</h3>
          </div>
          <button onClick={() => setShowNoteForm(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors">
            <Plus size={12} /> Add Note
          </button>
        </div>
        {showNoteForm && (
          <div className="space-y-2">
            <textarea rows={3} value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder="Add a coaching note about this player…"
              className={INPUT + ' resize-none w-full'} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowNoteForm(false); setNoteText(''); }}
                className="text-xs text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 bg-white">Cancel</button>
              <button onClick={saveNote} disabled={savingNote || !noteText.trim()}
                className="text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 px-3 py-1.5 rounded-lg disabled:opacity-50">
                {savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        )}
        {playerNotes === null ? (
          <div className="flex justify-center py-2"><div className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : playerNotes.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-2">No notes recorded yet.</p>
        ) : playerNotes.slice(0, 6).map(n => (
          <div key={n.id} className="py-2 border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500">{n.coach_user_email || 'Coach'}</span>
              <span className="text-xs text-slate-400">{n.created_date ? format(parseISO(n.created_date), 'd MMM yyyy') : '—'}</span>
            </div>
            <p className="text-sm text-slate-700 leading-snug">{n.note}</p>
          </div>
        ))}
        {(playerNotes || []).length > 6 && <p className="text-xs text-slate-400 text-center">+{playerNotes.length - 6} more</p>}
      </div>

    </div>

    {/* Attendance full-screen overlay */}
    {showAllAtt && attendance && (
      <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
            <button onClick={() => setShowAllAtt(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-slate-900 text-sm truncate">Attendance — {member.name}</h2>
              <p className="text-xs text-slate-400">{attendance.length} records</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-1">
              {attendance.map(r => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-sm text-slate-600">{r.date || '—'}</span>
                  <span className={`text-sm font-semibold ${r.status === 'Present' ? 'text-green-600' : r.status === 'Absent' ? 'text-red-600' : r.status === 'Late' ? 'text-amber-600' : r.status === 'Excused' ? 'text-blue-600' : 'text-pink-600'}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// â"€â"€ Players List â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function PlayersList({ members, teams, users, playerEvals, onSelectPlayer, search, ageMethod = 'dec31', pageSize = 25 }) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, members]);
  const filtered = members.filter(m => !search || (m.name || '').toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return (
    <div className="p-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
        {members.length === 0 ? 'No active players yet.' : 'No players match your search.'}
      </div>
    </div>
  );
  return (
    <div className="p-4 space-y-2 w-full min-w-0">
      {filtered.slice(page * pageSize, (page + 1) * pageSize).map(m => {
        const evals    = playerEvals.filter(e => e.player_id === m.id);
        const avg      = avgOfField(evals, 'rating');
        const trend    = calcTrend(evals, 'rating');
        const age      = ageMethod === 'dec31' ? calcAgeDec31(m.date_of_birth) : calcAge(m.date_of_birth);
        const team     = teams.find(t => t.id === m.team_id);
        const lastEval = evals.length ? [...evals].sort((a, b) => new Date(b.evaluation_date) - new Date(a.evaluation_date))[0] : null;
        return (
          <div key={m.id} onClick={() => onSelectPlayer(m)}
            className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-900 text-sm">{m.name}</p>
                  {age !== null && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">Age {age}</span>}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {team?.team_name || 'No team'}
                  {lastEval ? ` · Last obs ${fmtDate(lastEval.evaluation_date)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TrendIcon trend={trend} />
                <p className={`text-lg font-black ${avg !== null ? 'text-slate-900' : 'text-slate-200'}`}>{fmtR(avg)}</p>
              </div>
            </div>
            {avg !== null && <div className="mt-2"><RatingBadge rating={avg} /></div>}
          </div>
        );
      })}
      <Pagination page={page} totalPages={Math.ceil(filtered.length / pageSize)} onPage={setPage} />
    </div>
  );
}

// â"€â"€ Coach Profile â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const COACH_FIELDS = [
  { key: 'communication_rating', label: 'Communication' },
  { key: 'organisation_rating',  label: 'Organisation' },
  { key: 'teaching_rating',      label: 'Teaching' },
  { key: 'engagement_rating',    label: 'Engagement' },
  { key: 'leadership_rating',    label: 'Leadership' },
  { key: 'culture_rating',       label: 'Culture' },
];

function CoachProfile({ user, teams, access, coachEvals, currentUser, onBack, onSaved, obsPerPage = 25 }) {
  const evals      = [...coachEvals.filter(e => e.coach_id === user.id)].sort((a, b) => new Date(b.evaluation_date) - new Date(a.evaluation_date));
  const [showAllObs, setShowAllObs] = useState(false);
  const [allObsPage, setAllObsPage] = useState(0);
  const ALL_OBS_PAGE_SIZE = 20;
  const coachTeams = access.filter(a => a.user_email === user.email).map(a => teams.find(t => t.id === a.team_id)).filter(Boolean);
  const avg        = avgOfField(evals, 'overall_rating');

  const blankForm = () => ({ evaluation_date: todayStr(), communication_rating: '', organisation_rating: '', teaching_rating: '', engagement_rating: '', leadership_rating: '', culture_rating: '', notes: '' });
  const [showForm,    setShowForm]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [form,        setForm]        = useState(blankForm());
  const [selectedObs, setSelectedObs] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const calcOverall = (f) => {
    const vals = COACH_FIELDS.map(cf => parseFloat(f[cf.key])).filter(v => !isNaN(v));
    return vals.length === COACH_FIELDS.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null;
  };

  const save = async () => {
    const vals = COACH_FIELDS.map(cf => parseFloat(form[cf.key]));
    if (vals.some(v => isNaN(v))) return alert('Please fill all rating fields');
    if (vals.some(v => v < 0 || v > 9.9)) return alert('All ratings must be 0.0 — 9.9');
    setSaving(true);
    try {
      await db.entities.CoachEvaluation.create({
        coach_id:              user.id,
        evaluation_date:       form.evaluation_date,
        communication_rating:  parseFloat(parseFloat(form.communication_rating).toFixed(1)),
        organisation_rating:   parseFloat(parseFloat(form.organisation_rating).toFixed(1)),
        teaching_rating:       parseFloat(parseFloat(form.teaching_rating).toFixed(1)),
        engagement_rating:     parseFloat(parseFloat(form.engagement_rating).toFixed(1)),
        leadership_rating:     parseFloat(parseFloat(form.leadership_rating).toFixed(1)),
        culture_rating:        parseFloat(parseFloat(form.culture_rating).toFixed(1)),
        overall_rating:        calcOverall(form),
        notes:                 form.notes.trim() || null,
        observer_id:           currentUser?.id   || null,
      });
      setForm(blankForm()); setShowForm(false); onSaved();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const freshObs = selectedObs ? evals.find(e => e.id === selectedObs.id) : null;
  if (selectedObs) {
    if (!freshObs) { setSelectedObs(null); }
    else return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <CoachObsDetail ev={freshObs} user={user}
          onBack={() => setSelectedObs(null)}
          onSaved={onSaved}
        />
      </div>
    );
  }

  if (showAllObs) {
    const totalPages = Math.ceil(evals.length / ALL_OBS_PAGE_SIZE);
    const pageEvals = evals.slice(allObsPage * ALL_OBS_PAGE_SIZE, (allObsPage + 1) * ALL_OBS_PAGE_SIZE);
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
        <button onClick={() => setShowAllObs(false)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
          <ArrowLeft size={15} /> Back to {user.full_name || user.email}
        </button>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">All Observations — {user.full_name || user.email}</h3>
          <span className="text-xs text-slate-400">{evals.length} total</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Overall</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Notes</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageEvals.map(ev => {
                const { color } = ratingInfo(ev.overall_rating);
                return (
                  <tr key={ev.id} onClick={() => { setShowAllObs(false); setSelectedObs(ev); }}
                    className="cursor-pointer hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 text-xs">{fmtDate(ev.evaluation_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${color}`}>{fmtR(ev.overall_rating)}</span>
                      <span className="text-xs text-slate-400 ml-1">/ 10</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell truncate max-w-[200px]">{ev.notes || '—'}</td>
                    <td className="px-4 py-3 text-slate-300"><Eye size={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setAllObsPage(p => Math.max(0, p - 1))} disabled={allObsPage === 0}
                className="text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                â† Previous
              </button>
              <span className="text-xs text-slate-400">Page {allObsPage + 1} of {totalPages}</span>
              <button onClick={() => setAllObsPage(p => Math.min(totalPages - 1, p + 1))} disabled={allObsPage >= totalPages - 1}
                className="text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold">
        <ArrowLeft size={15} /> Back to Coaches
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-lg shrink-0">
            {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-black text-slate-900 text-lg">{user.full_name || user.email}</h2>
            <p className="text-xs text-slate-400 mt-1">{coachTeams.length > 0 ? coachTeams.map(t => t.team_name).join(', ') : 'No teams'}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Avg Rating',   val: fmtR(avg) },
            { label: 'Observations', val: evals.length },
            { label: 'Last Seen',    val: evals[0] ? fmtDate(evals[0].evaluation_date) : '—' },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3">
              <p className="text-base font-black text-slate-900">{s.val}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
        {avg !== null && <RatingBadge rating={avg} />}

        {/* Development graph */}
        <DevGraph
          data={[...evals].reverse().map(ev => ({
            date: ev.evaluation_date ? format(parseISO(ev.evaluation_date), 'd MMM') : '',
            value: ev.overall_rating,
          })).filter(d => d.value != null)}
          maxY={9.9}
          color="#0891b2"
          label="Coach Rating"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Observations</h3>
          <button onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl transition-colors">
            <Plus size={14} /> Add Observation
          </button>
        </div>

        {showForm && (
          <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4 space-y-3">
            <h4 className="font-bold text-slate-900 text-sm">New Coach Observation</h4>
            <Field label="Date">
              <input type="date" value={form.evaluation_date} onChange={e => set('evaluation_date', e.target.value)} className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {COACH_FIELDS.map(f => (
                <RatingInput key={f.key} label={f.label} value={form[f.key]} onChange={v => set(f.key, v)} />
              ))}
            </div>
            {calcOverall(form) !== null && (
              <div className="bg-white rounded-xl px-4 py-2 text-sm text-slate-700">
                Overall: <span className="text-blue-600 font-black text-lg">{calcOverall(form)}</span>
              </div>
            )}
            <Field label="Notes">
              <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Teaching quality, session energy, how they handled challenges..." className={INPUT + ' resize-none'} />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-slate-500 px-3 py-1.5 rounded-xl border border-slate-200 bg-white">Cancel</button>
              <button onClick={save} disabled={saving} className="text-sm font-bold text-white bg-blue-600 px-4 py-1.5 rounded-xl disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Observation'}
              </button>
            </div>
          </div>
        )}

        {evals.length === 0
          ? <p className="text-sm text-slate-400 text-center py-6">No observations yet.</p>
          : <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Overall</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Notes</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evals.slice(0, obsPerPage).map(ev => {
                    const { color } = ratingInfo(ev.overall_rating);
                    return (
                      <tr key={ev.id} onClick={() => setSelectedObs(ev)}
                        className="cursor-pointer hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 text-xs">{fmtDate(ev.evaluation_date)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${color}`}>{fmtR(ev.overall_rating)}</span>
                          <span className="text-xs text-slate-400 ml-1">/ 10</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell truncate max-w-[200px]">{ev.notes || '—'}</td>
                        <td className="px-4 py-3 text-slate-300"><Eye size={14} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {evals.length > obsPerPage && (
                <button onClick={() => setShowAllObs(true)}
                  className="w-full py-2.5 border-t border-slate-100 text-sm text-slate-500 hover:bg-slate-50 font-semibold bg-white">
                  See all observations ({evals.length - obsPerPage} more)
                </button>
              )}
            </div>
        }
      </div>
    </div>
  );
}

// â"€â"€ Coaches List â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function CoachesList({ users, teams, access, coachEvals, onSelectCoach, search }) {
  const coaches = users.filter(u => u.role !== 'admin' && (!search || (u.full_name || u.email || '').toLowerCase().includes(search.toLowerCase())));
  if (coaches.length === 0) return (
    <div className="p-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No coaches found.</div>
    </div>
  );
  return (
    <div className="p-4 space-y-2 w-full min-w-0">
      {coaches.map(u => {
        const evals      = coachEvals.filter(e => e.coach_id === u.id);
        const avg        = avgOfField(evals, 'overall_rating');
        const trend      = calcTrend(evals, 'overall_rating');
        const coachTeams = access.filter(a => a.user_email === u.email).map(a => teams.find(t => t.id === a.team_id)).filter(Boolean);
        return (
          <div key={u.id} onClick={() => onSelectCoach(u)}
            className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm">{u.full_name || u.email}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {coachTeams.length > 0 ? coachTeams.map(t => t.team_name).join(', ') : 'No teams'}
                  {evals.length > 0 ? ` · ${evals.length} observation${evals.length !== 1 ? 's' : ''}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TrendIcon trend={trend} />
                <p className={`text-lg font-black ${avg !== null ? 'text-slate-900' : 'text-slate-200'}`}>{fmtR(avg)}</p>
              </div>
            </div>
            {avg !== null && <div className="mt-2"><RatingBadge rating={avg} /></div>}
          </div>
        );
      })}
    </div>
  );
}

// â"€â"€ Main Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const MAIN_TABS = ['Teams', 'Players', 'Coaches'];

export default function AdminDevelopmentHubTab({ filterOpen, onFilterClose, resetTrigger, mainTab: mainTabProp, onMainTabChange, triggerAddDrill, triggerExportDrills, triggerImportDrills, triggerSettings }) {
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [devSettings, setDevSettings] = useState(loadDevHubSettings);
  const [draftDevSettings, setDraftDevSettings] = useState(devSettings);
  useEffect(() => { if (!triggerSettings) return; setSelectedTeam(null); setSelectedPlayer(null); setSelectedCoach(null); setDraftDevSettings(loadDevHubSettings()); setShowSettings(true); }, [triggerSettings]);
  const [members,     setMembers]     = useState([]);
  const [teams,       setTeams]       = useState([]);
  const [squads,      setSquads]      = useState([]);
  const [users,       setUsers]       = useState([]);
  const [access,      setAccess]      = useState([]);
  const [sessions,    setSessions]    = useState([]);
  const [playerEvals, setPlayerEvals] = useState([]);
  const [coachEvals,  setCoachEvals]  = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const [localMainTab,   setLocalMainTab]   = useState('Teams');
  const mainTab    = mainTabProp    ?? localMainTab;
  const setMainTab = onMainTabChange ?? setLocalMainTab;
  const [search,         setSearch]         = useState('');
  const [filterAgeGroup,     setFilterAgeGroup]     = useState('');
  const [filterSquad,        setFilterSquad]        = useState('');
  const [filterGender,       setFilterGender]       = useState('');
  const [filterSeason,       setFilterSeason]       = useState('');
  const [filterProgramType,  setFilterProgramType]  = useState('');
  const [showFilters,    setShowFilters]    = useState(false);

  const [selectedTeam,   setSelectedTeam]   = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedCoach,  setSelectedCoach]  = useState(null);

  useEffect(() => { load(); }, []);
  useEffect(() => { if (filterOpen) setShowFilters(true); }, [filterOpen]);
  useEffect(() => {
    if (!resetTrigger) return;
    setSelectedTeam(null); setSelectedPlayer(null); setSelectedCoach(null);
    setMainTab('Teams'); setSearch('');
    setFilterAgeGroup(''); setFilterSquad(''); setFilterGender(''); setFilterSeason(''); setFilterProgramType('');
  }, [resetTrigger]);

  const load = async () => {
    setLoading(true);
    try {
      const [me, m, t, sq, u, a, sess, pe, ce] = await Promise.all([
        db.auth.me().catch(() => null),
        db.entities.Member.filterAll({ visibility: 'Club' }, 'name').catch(() => []),
        db.entities.Team.filter({ visibility: 'Club' }, 'team_name', 1000).catch(() => []),
        db.entities.Squad.list('name', 200).catch(() => []),
        db.entities.User.list('full_name', 200).catch(() => []),
        db.entities.UserTeamAccess.list('-created_date', 500).catch(() => []),
        db.entities.EvaluationSession.list('-observation_date', 500).catch(() => []),
        db.entities.PlayerEvaluation.list('-evaluation_date', 1000).catch(() => []),
        db.entities.CoachEvaluation.list('-evaluation_date', 500).catch(() => []),
      ]);
      setCurrentUser(me); setMembers(m); setTeams(t); setSquads(sq); setUsers(u); setAccess(a);
      setSessions(sess); setPlayerEvals(pe); setCoachEvals(ce);
    } catch (e) { console.error('Dev Hub load error:', e); }
    finally { setLoading(false); }
  };

  const ageGroups    = useMemo(() => [...new Set(teams.map(t => t.age_group).filter(Boolean))].sort(), [teams]);
  const genders      = useMemo(() => [...new Set(teams.map(t => t.gender).filter(Boolean))].sort(), [teams]);
  const seasons      = useMemo(() => [...new Set(teams.map(t => t.season).filter(Boolean))].sort(), [teams]);
  const programTypes = useMemo(() => [...new Set(teams.map(t => t.program_type).filter(Boolean))].sort(), [teams]);
  const activeSquads = useMemo(() => squads.filter(s => s.status !== 'Archived'), [squads]);

  const filteredTeams = useMemo(() => {
    return teams.filter(t => {
      if (filterAgeGroup    && t.age_group    !== filterAgeGroup)    return false;
      if (filterGender      && t.gender      !== filterGender)      return false;
      if (filterSeason      && t.season      !== filterSeason)      return false;
      if (filterProgramType && t.program_type !== filterProgramType) return false;
      if (filterSquad) {
        const sq = squads.find(s => s.id === filterSquad);
        if (!sq) return false;
        let ids = [];
        try { ids = JSON.parse(sq.team_ids || '[]'); } catch { ids = []; }
        if (!ids.includes(t.id)) return false;
      }
      return true;
    });
  }, [teams, squads, filterAgeGroup, filterGender, filterSeason, filterSquad, filterProgramType]);

  if (loading) return (
    <div className="flex-1 flex flex-col">
      <div className="p-12 flex justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    </div>
  );

  // Profile views
  if (selectedTeam) return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <TeamProfile
        team={selectedTeam} users={users} sessions={sessions}
        playerEvals={playerEvals} coachEvals={coachEvals} members={members} currentUser={currentUser}
        obsPerPage={devSettings.obsPerPage}
        onBack={() => setSelectedTeam(null)} onSaved={load}
        onSelectPlayer={setSelectedPlayer} onSelectCoach={setSelectedCoach}
      />
    </div>
  );

  if (selectedPlayer) return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <PlayerHistory
        member={selectedPlayer} teams={teams} users={users}
        sessions={sessions} playerEvals={playerEvals} currentUser={currentUser}
        ageMethod={devSettings.ageMethod}
        onBack={() => setSelectedPlayer(null)} onSaved={load}
        onSelectTeam={t => { setSelectedPlayer(null); setSelectedTeam(t); }}
      />
    </div>
  );

  if (selectedCoach) return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <CoachProfile
        user={selectedCoach} teams={teams} access={access}
        coachEvals={coachEvals} currentUser={currentUser}
        obsPerPage={devSettings.obsPerPage}
        onBack={() => setSelectedCoach(null)} onSaved={load}
      />
    </div>
  );

  // Main list view
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">

      {/* Settings page overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-slate-50 z-30 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
            <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            <h2 className="font-bold text-slate-900">Development Hub Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-2xl w-full mx-auto space-y-6">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">List page size</p>
              <div className="flex gap-2">
                {[10, 25, 50, 100].map(n => (
                  <button key={n} onClick={() => setDraftDevSettings(s => ({ ...s, listPageSize: n }))}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${draftDevSettings.listPageSize === n ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">How many teams or players to show per page in the Teams and Players lists.</p>
            </div>
            <div>
              <p className={'text-xs font-bold text-slate-500 uppercase tracking-wider mb-3'}>Observation records per page</p>
              <div className={'flex gap-2'}>
                {[10, 25, 50, 100].map(n => (
                  <button key={n} onClick={() => setDraftDevSettings(s => ({ ...s, obsPerPage: n }))}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${draftDevSettings.obsPerPage === n ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className={'text-xs text-slate-400 mt-2'}>How many observations to show before a See all button on team, player and coach histories.</p>
            </div>
          </div>
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 flex items-center gap-3">
            <div className="flex-1" />
            <button onClick={() => setShowSettings(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
            <button onClick={() => { localStorage.setItem(DEVHUB_SETTINGS_KEY, JSON.stringify(draftDevSettings)); setDevSettings(draftDevSettings); setShowSettings(false); }}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">Save Settings</button>
          </div>
        </div>
      )}

      {/* Filter drawer — all screen sizes */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowFilters(false); onFilterClose?.(); }} />
          {/* Drawer */}
          <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-slate-100">
              <p className="font-bold text-slate-800 text-base">Filters</p>
              <button onClick={() => { setShowFilters(false); onFilterClose?.(); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <Field label="Program Type">
                <select value={filterProgramType} onChange={e => setFilterProgramType(e.target.value)} className={INPUT + ' bg-white'}>
                  <option value="">All Programs</option>
                  {programTypes.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </Field>
              <Field label="Age Group">
                <select value={filterAgeGroup} onChange={e => setFilterAgeGroup(e.target.value)} className={INPUT + ' bg-white'}>
                  <option value="">All Ages</option>
                  {ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                </select>
              </Field>
              <Field label="Squad">
                <select value={filterSquad} onChange={e => setFilterSquad(e.target.value)} className={INPUT + ' bg-white'}>
                  <option value="">All Squads</option>
                  {activeSquads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Gender">
                <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className={INPUT + ' bg-white'}>
                  <option value="">All Genders</option>
                  {genders.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Competition / Season">
                <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} className={INPUT + ' bg-white'}>
                  <option value="">All Seasons</option>
                  {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>

              <div className="border-t border-slate-100 pt-4 space-y-1.5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Rating Scale</p>
                {[
                  { range: '0.0—2.9', label: 'Significant Support', color: 'bg-red-100 text-red-700' },
                  { range: '3.0—4.9', label: 'Developing',          color: 'bg-orange-100 text-orange-700' },
                  { range: '5.0—6.9', label: 'On Track',            color: 'bg-yellow-100 text-yellow-800' },
                  { range: '7.0—8.4', label: 'Strong',              color: 'bg-green-100 text-green-700' },
                  { range: '8.5—9.9', label: 'Exceptional',         color: 'bg-purple-100 text-purple-700' },
                ].map(s => (
                  <div key={s.range} className={`text-xs px-2 py-1 rounded-lg ${s.color}`}>
                    <span className="font-mono">{s.range}</span>
                    <div className="font-semibold">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2">
              {(filterAgeGroup || filterSquad || filterGender || filterSeason || filterProgramType) && (
                <button onClick={() => { setFilterAgeGroup(''); setFilterSquad(''); setFilterGender(''); setFilterSeason(''); setFilterProgramType(''); }}
                  className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Clear all
                </button>
              )}
              <button onClick={() => { setShowFilters(false); onFilterClose?.(); }}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* Main tabs */}
          <div className="bg-white border-b border-slate-200 flex shrink-0">
            {MAIN_TABS.map(tab => (
              <button key={tab} onClick={() => { setMainTab(tab); setSearch(''); }}
                className={`flex-1 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors text-center ${
                  mainTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}>
                {tab}
              </button>
            ))}
          </div>

          {/* Search + Filter button — hidden on Library tab (has its own) */}
          <div className={`bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2 shrink-0 ${mainTab === 'Library' ? 'hidden' : ''}`}>
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${mainTab.toLowerCase()}…`}
                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                filterAgeGroup || filterSquad || filterGender || filterSeason || filterProgramType ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              <SlidersHorizontal size={13} /> Filters
            </button>
          </div>

          {/* Lists */}
          <div className="flex-1 overflow-y-auto">
            {mainTab === 'Teams'        && <TeamsList        teams={filteredTeams} users={users} sessions={sessions} playerEvals={playerEvals} onSelectTeam={setSelectedTeam} search={search} pageSize={devSettings.listPageSize} />}
            {mainTab === 'Players'      && <PlayersList      members={members}     teams={teams} users={users}       playerEvals={playerEvals} onSelectPlayer={setSelectedPlayer} search={search} ageMethod={devSettings.ageMethod} pageSize={devSettings.listPageSize} />}
            {mainTab === 'Coaches'      && <CoachesList      users={users} teams={teams} access={access} coachEvals={coachEvals} onSelectCoach={setSelectedCoach} search={search} />}
          </div>
      </div>
    </div>
  );
}

