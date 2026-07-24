import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit3, Clock, MapPin } from 'lucide-react';
import { db } from '@/api/db';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const EMPTY = { venue_id: '', court_id: '', day: '', start_time: '', end_time: '', notes: '' };

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

export default function TrainingAllocationPanel({ entityType, entityId, entityName, fallbackSquadId, autoOpenAdd, showAddButton = true, readOnly = false }) {
  const [allocations, setAllocations] = useState([]);
  const [allAllocations, setAllAllocations] = useState([]);
  const [venues, setVenues] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [clashWarning, setClashWarning] = useState(null);

  const load = async () => {
    setLoading(true);
    const [all, vs, cs] = await Promise.all([
      db.entities.TrainingAllocation.list('-created_date', 500).catch(() => []),
      db.entities.Venue.filter({ status: 'Active' }, 'name', 200).catch(() => []),
      db.entities.Court.list('name', 200).catch(() => []),
    ]);
    setAllAllocations(all);
    setVenues(vs);
    setCourts(cs);
    const direct = entityType === 'Team'
      ? all.filter(a => a.team_id === entityId)
      : all.filter(a => a.squad_id === entityId);
    const result = (direct.length === 0 && fallbackSquadId)
      ? all.filter(a => a.squad_id === fallbackSquadId)
      : direct;
    setAllocations(result);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityId]);

  // Re-filter when fallbackSquadId arrives (it loads async in the parent)
  useEffect(() => {
    if (!fallbackSquadId || !allAllocations.length) return;
    const direct = entityType === 'Team'
      ? allAllocations.filter(a => a.team_id === entityId)
      : allAllocations.filter(a => a.squad_id === entityId);
    if (direct.length === 0) {
      setAllocations(allAllocations.filter(a => a.squad_id === fallbackSquadId));
    }
  }, [fallbackSquadId, allAllocations]);

  useEffect(() => {
    if (autoOpenAdd && !loading) openAdd();
  }, [autoOpenAdd, loading]);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filteredCourts = courts.filter(c => !form.venue_id || c.venue_id === form.venue_id);

  const getVenueName = (a) => a.venue || venues.find(v => v.id === a.venue_id)?.name || '';
  const getCourtName = (a) => a.court || courts.find(c => c.id === a.court_id)?.name || '';

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (a) => {
    setEditing(a);
    setForm({
      venue_id: a.venue_id || '',
      court_id: a.court_id || '',
      day: a.day || '',
      start_time: a.start_time || '',
      end_time: a.end_time || '',
      notes: a.notes || '',
    });
    setShowForm(true);
  };

  // Convert HH:MM to minutes for overlap comparison
  const toMins = (t) => { if (!t) return null; const [h, m] = t.split(':'); return parseInt(h) * 60 + parseInt(m); };

  const timesOverlap = (s1, e1, s2, e2) => {
    const a = toMins(s1), b = toMins(e1), c = toMins(s2), d = toMins(e2);
    if (a === null || c === null) return false;
    // If no end times, treat as point-in-time exact match
    if (b === null && d === null) return a === c;
    const aEnd = b ?? a + 1;
    const cEnd = d ?? c + 1;
    // Overlap: a < cEnd && c < aEnd
    return a < cEnd && c < aEnd;
  };

  const findClash = () => allAllocations.find(a => {
    if (a.id === editing?.id) return false;
    if (a.day !== form.day) return false;
    // Venue match
    const venueMatch = form.venue_id && a.venue_id
      ? form.venue_id === a.venue_id
      : (getVenueName(a)||'').toLowerCase() === (venues.find(v => v.id === form.venue_id)?.name || '').toLowerCase();
    if (!venueMatch) return false;
    // Court match
    const courtMatch = form.court_id && a.court_id
      ? form.court_id === a.court_id
      : (getCourtName(a)||'') === (courts.find(c => c.id === form.court_id)?.name || '');
    if (!courtMatch) return false;
    // Time overlap
    return timesOverlap(form.start_time, form.end_time, a.start_time, a.end_time);
  });

  const doSave = async (force = false) => {
    if (!force) {
      const clash = findClash();
      if (clash) { setClashWarning(clash); return; }
    }
    setSaving(true);
    try {
      const selectedVenue = venues.find(v => v.id === form.venue_id);
      const selectedCourt = courts.find(c => c.id === form.court_id);
      const payload = {
        day: form.day,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        notes: form.notes || null,
        venue_id: form.venue_id || null,
        court_id: form.court_id || null,
        venue: selectedVenue?.name || '',
        court: selectedCourt?.name || '',
        allocation_type: entityType,
        team_id: entityType === 'Team' ? entityId : null,
        squad_id: entityType === 'Squad' ? entityId : null,
      };
      if (editing) {
        await db.entities.TrainingAllocation.update(editing.id, payload);
      } else {
        await db.entities.TrainingAllocation.create(payload);
      }
      setShowForm(false); setEditing(null); setClashWarning(null);
      load();
    } catch (e) {
      alert('Error saving allocation: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => { await db.entities.TrainingAllocation.delete(id); load(); };

  if (loading) return <div className="flex items-center justify-center py-4"><div className="w-5 h-5 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-1">
      {allocations.length === 0 && !showForm && (
        <p className="text-sm text-slate-400 italic text-center py-2">No training times set.</p>
      )}

      {allocations.map(a => (
        <div key={a.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-800">{a.day}</span>
              {(a.start_time || a.end_time) && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={10} />{fmt12(a.start_time)}{a.end_time ? ` – ${fmt12(a.end_time)}` : ''}
                </span>
              )}
            </div>
            {(getVenueName(a) || getCourtName(a)) && (
              <span className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                <MapPin size={10} />{getVenueName(a)}{getCourtName(a) ? ` · ${getCourtName(a)}` : ''}
              </span>
            )}
          </div>
          {!readOnly && <button onClick={() => openEdit(a)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"><Edit3 size={13} /></button>}
          {!readOnly && <button onClick={() => del(a.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={13} /></button>}
        </div>
      ))}

      {!showForm && showAddButton && (
        <button onClick={openAdd}
          className="w-full flex items-center gap-1.5 justify-center py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-xl border border-dashed border-blue-200 transition-colors mt-1">
          <Plus size={13} /> Add Training Time
        </button>
      )}

      {showForm && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2 mt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs font-semibold text-slate-500 block mb-1">Day *</label>
              <select value={form.day} onChange={e => upd('day', e.target.value)} className={IC}>
                <option value="">—</option>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Venue</label>
              {venues.length > 0 ? (
                <select value={form.venue_id} onChange={e => { upd('venue_id', e.target.value); upd('court_id', ''); }} className={IC}>
                  <option value="">— Select Venue —</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              ) : (
                <input value={form.venue_id} onChange={e => upd('venue_id', e.target.value)} placeholder="e.g. Wayville" className={IC} />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Court</label>
              {venues.length > 0 && form.venue_id ? (
                <select value={form.court_id} onChange={e => upd('court_id', e.target.value)} className={IC}>
                  <option value="">— Select Court —</option>
                  {filteredCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <input value={form.court_id} onChange={e => upd('court_id', e.target.value)} placeholder="e.g. Court 1" className={IC} />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Start Time</label>
              <input type="time" value={form.start_time} onChange={e => upd('start_time', e.target.value)} className={IC} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">End Time</label>
              <input type="time" value={form.end_time} onChange={e => upd('end_time', e.target.value)} className={IC} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 block mb-1">Notes</label>
              <input value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="Optional notes" className={IC} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => doSave(false)} disabled={saving || !form.day}
              className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-blue-700">
              {saving ? 'Saving…' : editing ? 'Update' : 'Add'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}

      {clashWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 mb-2">⚠️ Training Clash</h3>
            <p className="text-sm text-slate-600 mb-1">
              <strong>{clashWarning.day}</strong> at <strong>{getVenueName(clashWarning)}{getCourtName(clashWarning) ? ` · ${getCourtName(clashWarning)}` : ''}</strong>
              {clashWarning.start_time && ` (${fmt12(clashWarning.start_time)})`} is already allocated to another {clashWarning.allocation_type}.
            </p>
            <p className="text-xs text-slate-400 mb-4">Continue if this is intentional.</p>
            <div className="flex gap-2">
              <button onClick={() => setClashWarning(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={() => doSave(true)} className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700">Allocate Anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}