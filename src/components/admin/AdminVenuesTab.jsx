import { useState, useEffect } from 'react';
import { Plus, MapPin, X } from 'lucide-react';
import { db } from '@/api/db';
import { Spinner } from './shared';
import VenueProfile from './VenueProfile';

const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const EMPTY_VENUE = { name: '', address: '', notes: '', status: 'Active' };

export default function AdminVenuesTab({ triggerAdd }) {
  const [venues, setVenues] = useState([]);
  const [courts, setCourts] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_VENUE);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [vs, cs, as] = await Promise.all([
      db.entities.Venue.list('name', 200).catch(() => []),
      db.entities.Court.list('name', 200).catch(() => []),
      db.entities.TrainingAllocation.list('-created_date', 500).catch(() => []),
    ]);
    setVenues(vs); setCourts(cs); setAllocations(as);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!triggerAdd) return; setShowAdd(true); }, [triggerAdd]);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveVenue = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await db.entities.Venue.create(form);
      setShowAdd(false); setForm(EMPTY_VENUE); load();
    } catch (e) {
      alert('Error saving venue: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const getCourtCount = (venueId) => courts.filter(c => c.venue_id === venueId).length;
  const getAllocCount = (venueId) => allocations.filter(a => a.venue_id === venueId || (!a.venue_id && venues.find(v => v.id === venueId)?.name === a.venue)).length;

  if (selected) {
    return (
      <VenueProfile
        venue={selected}
        courts={courts.filter(c => c.venue_id === selected.id)}
        allocations={allocations.filter(a => a.venue_id === selected.id || (!a.venue_id && a.venue === selected.name))}
        allAllocations={allocations}
        onBack={() => { setSelected(null); load(); }}
        onCourtAdded={load}
      />
    );
  }

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-lg">{venues.length} Venue{venues.length !== 1 ? 's' : ''}</h2>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
            <Plus size={14} /> New Venue
          </button>
        </div>

        {venues.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
              <MapPin size={24} className="text-slate-300" />
            </div>
            <p className="font-semibold text-slate-700">No venues yet</p>
            <p className="text-xs text-slate-400">Add your club venues to start managing court bookings.</p>
            <button onClick={() => setShowAdd(true)} className="mx-auto flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
              <Plus size={14} /> Add First Venue
            </button>
          </div>
        ) : venues.map(v => {
          const courtCount = getCourtCount(v.id);
          const allocCount = getAllocCount(v.id);
          return (
            <button key={v.id} onClick={() => setSelected(v)}
              className="w-full bg-white rounded-2xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                  {v.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900">{v.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${v.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{v.status}</span>
                  </div>
                  {v.address && <p className="text-xs text-slate-400 mt-0.5">{v.address}</p>}
                  <div className="flex gap-3 mt-1 text-xs text-slate-400">
                    <span>{courtCount} court{courtCount !== 1 ? 's' : ''}</span>
                    <span>{allocCount} booking{allocCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span className="text-slate-300 text-lg">→</span>
              </div>
            </button>
          );
        })}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">New Venue</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Venue Name *</label>
                <input value={form.name} onChange={e => upd('name', e.target.value)} placeholder="e.g. Wayville" className={IC} autoFocus />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Address</label>
                <input value={form.address} onChange={e => upd('address', e.target.value)} placeholder="Street address" className={IC} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} rows={2} placeholder="Parking, access notes…" className={IC + ' resize-none'} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
              <button onClick={saveVenue} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
                {saving ? 'Saving…' : 'Create Venue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}