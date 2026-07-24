import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, X, MapPin, Clock, Users, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { db } from '@/api/db';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

export default function VenueProfile({ venue, courts: initialCourts, allocations, allAllocations, onBack, onCourtAdded }) {
  const [courts, setCourts] = useState(initialCourts || []);
  const [teams, setTeams] = useState([]);
  const [squads, setSquads] = useState([]);
  const [showAddCourt, setShowAddCourt] = useState(false);
  const [newCourtName, setNewCourtName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingVenue, setEditingVenue] = useState(false);
  const [venueForm, setVenueForm] = useState({
    name: venue.name || '', address: venue.address || '', notes: venue.notes || '', status: venue.status || 'Active',
    latitude: venue.latitude ?? '', longitude: venue.longitude ?? '',
  });
  const [showMenu, setShowMenu] = useState(false);
  const [localVenue, setLocalVenue] = useState(venue);

  useEffect(() => {
    Promise.all([
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
    ]).then(([t, s]) => { setTeams(t); setSquads(s); });
  }, []);

  const saveVenue = async () => {
    const payload = {
      ...venueForm,
      latitude: venueForm.latitude === '' ? null : Number(venueForm.latitude),
      longitude: venueForm.longitude === '' ? null : Number(venueForm.longitude),
    };
    await db.entities.Venue.update(venue.id, payload);
    setLocalVenue({ ...localVenue, ...payload });
    setEditingVenue(false);
  };

  const addCourt = async () => {
    if (!newCourtName.trim()) return;
    setSaving(true);
    try {
      const c = await db.entities.Court.create({ venue_id: venue.id, name: newCourtName.trim() });
      setCourts(prev => [...prev, c]);
      setNewCourtName('');
      setShowAddCourt(false);
      onCourtAdded?.();
    } catch (e) {
      alert('Error adding court: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCourt = async (courtId) => {
    await db.entities.Court.delete(courtId);
    setCourts(prev => prev.filter(c => c.id !== courtId));
    onCourtAdded?.();
  };

  const getEntityName = (alloc) => {
    if (alloc.allocation_type === 'Squad') {
      return squads.find(s => s.id === alloc.squad_id)?.name || '—';
    }
    return teams.find(t => t.id === alloc.team_id)?.team_name || '—';
  };

  const getEntityType = (alloc) => alloc.allocation_type;

  // Group allocations by day → court
  const grouped = DAYS.reduce((acc, day) => {
    const dayAllocs = allocations.filter(a => a.day === day);
    if (dayAllocs.length === 0) return acc;

    // Group by court
    const byCourt = {};
    dayAllocs.forEach(a => {
      const courtName = courts.find(c => c.id === a.court_id)?.name || a.court || 'No Court';
      if (!byCourt[courtName]) byCourt[courtName] = [];
      byCourt[courtName].push(a);
    });

    // Sort courts by name, bookings by time
    const sortedCourts = Object.keys(byCourt).sort();
    const courtBlocks = sortedCourts.map(courtName => ({
      courtName,
      bookings: byCourt[courtName].sort((a, b) => (a.start_time||'').localeCompare(b.start_time||'')),
    }));

    acc[day] = courtBlocks;
    return acc;
  }, {});

  const activeDays = DAYS.filter(d => grouped[d]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
          {venue.name?.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-900 text-lg leading-tight">{localVenue.name}</h2>
          {localVenue.address && <p className="text-xs text-slate-400 mt-0.5">{localVenue.address}</p>}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${localVenue.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{localVenue.status}</span>
        <div className="relative">
          <button onClick={() => setShowMenu(v => !v)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <MoreHorizontal size={18} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-slate-200 z-50 min-w-[160px] py-1" onClick={() => setShowMenu(false)}>
              <button onClick={() => setEditingVenue(true)} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Pencil size={13} /> Edit Venue
              </button>
              <button onClick={() => { setShowAddCourt(true); setShowMenu(false); }} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Plus size={13} /> Add Court
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button onClick={() => { if (window.confirm('Delete this venue?')) db.entities.Venue.delete(venue.id).then(onBack); }} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <Trash2 size={13} /> Delete Venue
              </button>
            </div>
          )}
        </div>
      </div>

      {editingVenue && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingVenue(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 mb-3">Edit Venue</h3>
            <div className="space-y-2">
              {[['name','Name *'], ['address','Address'], ['notes','Notes']].map(([k, label]) => (
                <div key={k}>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">{label}</label>
                  <input value={venueForm[k]} onChange={e => setVenueForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Coordinates (optional — gives coaches a precise "Get Directions" link)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="any" placeholder="Latitude" value={venueForm.latitude}
                    onChange={e => setVenueForm(f => ({ ...f, latitude: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" step="any" placeholder="Longitude" value={venueForm.longitude}
                    onChange={e => setVenueForm(f => ({ ...f, longitude: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Status</label>
                <select value={venueForm.status} onChange={e => setVenueForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="Active">Active</option><option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingVenue(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm">Cancel</button>
              <button onClick={saveVenue} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-6">

        {/* Courts management */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Courts ({courts.length})</h3>
            <button onClick={() => setShowAddCourt(v => !v)}
              className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-700">
              <Plus size={13} /> Add Court
            </button>
          </div>
          {showAddCourt && (
            <div className="flex gap-2 mb-3">
              <input value={newCourtName} onChange={e => setNewCourtName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCourt()}
                placeholder="Court name, e.g. Court 1" className={IC} autoFocus />
              <button onClick={addCourt} disabled={saving || !newCourtName.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {saving ? '…' : 'Add'}
              </button>
              <button onClick={() => { setShowAddCourt(false); setNewCourtName(''); }}
                className="px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-500">×</button>
            </div>
          )}
          {courts.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No courts added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {courts.map(c => (
                <span key={c.id} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs px-3 py-1.5 rounded-xl font-medium">
                  {c.name}
                  <button onClick={() => deleteCourt(c.id)} className="text-slate-400 hover:text-red-500 ml-0.5 font-bold">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Weekly schedule */}
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Weekly Schedule</h3>
          {activeDays.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <MapPin size={24} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No bookings at this venue yet.</p>
              <p className="text-xs text-slate-400 mt-1">Assign training allocations to teams or squads with this venue selected.</p>
            </div>
          ) : activeDays.map(day => (
            <div key={day} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">{day}</h4>
              </div>
              <div className="space-y-3">
                {grouped[day].map(({ courtName, bookings }) => (
                  <div key={courtName} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-600">{courtName}</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {bookings.map(b => {
                        const name = getEntityName(b);
                        const type = getEntityType(b);
                        const timeStr = b.start_time ? `${fmt12(b.start_time)}${b.end_time ? ` – ${fmt12(b.end_time)}` : ''}` : null;
                        return (
                          <div key={b.id} className="px-4 py-3 flex items-center gap-3">
                            <div className={`w-8 h-8 ${type === 'Squad' ? 'bg-indigo-600' : 'bg-blue-600'} text-white rounded-lg flex items-center justify-center font-black text-xs shrink-0`}>
                              {name?.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 text-sm">{name}</p>
                              <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                                {timeStr && <span className="flex items-center gap-1"><Clock size={10} />{timeStr}</span>}
                                {type === 'Squad' && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">Squad</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {venue.notes && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Notes</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{venue.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
