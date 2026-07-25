import { useState, useEffect } from 'react';
import { CalendarDays, MapPin, LayoutGrid, List, X, Plus } from 'lucide-react';
import { db } from '@/api/db';
import AdminVenuesTab from './AdminVenuesTab';
import TrainingScheduleTab from './TrainingScheduleTab';
import { Spinner } from './shared';
import SearchableSelect from './SearchableSelect';
import { getBookingWindowDays, setBookingWindowDays } from '@/lib/season.js';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const EMPTY_ALLOC = { entity: '', day: '', start_time: '', end_time: '', venue_id: '', court_id: '', notes: '' };
const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function AddTrainingModal({ onClose, onSaved, initialVenues, initialCourts, initialTeams, initialSquads }) {
  const [teams,  setTeams]  = useState(initialTeams  || []);
  const [squads, setSquads] = useState(initialSquads || []);
  const [venues, setVenues] = useState(initialVenues || []);
  const [courts, setCourts] = useState(initialCourts || []);
  const [form, setForm] = useState(EMPTY_ALLOC);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetches = [];
    if (!initialTeams)  fetches.push(db.entities.Team.filter({ visibility: 'Club' }, 'team_name', 1000).catch(() => []).then(setTeams));
    if (!initialSquads) fetches.push(db.entities.Squad.list('name', 200).catch(() => []).then(setSquads));
    if (!initialVenues) fetches.push(db.entities.Venue.filter({ status: 'Active' }, 'name', 200).catch(() => []).then(setVenues));
    if (!initialCourts) fetches.push(db.entities.Court.list('name', 200).catch(() => []).then(setCourts));
    if (fetches.length > 0) Promise.all(fetches);
  }, []);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const filteredCourts = courts.filter(c => !form.venue_id || c.venue_id === form.venue_id);

  const save = async () => {
    if (!form.entity || !form.day || !form.start_time) { setError('Team/Squad, day and start time are required.'); return; }
    setSaving(true);
    setError('');
    const [type, id] = form.entity.split(':');
    const payload = {
      day: form.day,
      start_time: form.start_time,
      end_time: form.end_time || null,
      venue_id: form.venue_id || null,
      court_id: form.court_id || null,
      notes: form.notes || null,
      ...(type === 'team' ? { team_id: id } : { squad_id: id }),
    };
    try {
      await db.entities.TrainingAllocation.create(payload);
      onSaved();
    } catch (e) {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
          <h2 className="font-bold text-slate-900">Add Training</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Team or Squad *</label>
            <SearchableSelect
              value={form.entity}
              onChange={val => upd('entity', val)}
              placeholder="Select…"
              groups={[
                { label: 'Teams',  options: teams.map(t => ({ value: `team:${t.id}`,  label: t.team_name })) },
                { label: 'Squads', options: squads.map(s => ({ value: `squad:${s.id}`, label: s.name })) },
              ]}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Day *</label>
            <select value={form.day} onChange={e => upd('day', e.target.value)} className={IC}>
              <option value="">Select day…</option>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Start *</label>
              <input type="time" value={form.start_time} onChange={e => upd('start_time', e.target.value)} className={IC} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">End</label>
              <input type="time" value={form.end_time} onChange={e => upd('end_time', e.target.value)} className={IC} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Venue</label>
            <select value={form.venue_id} onChange={e => { upd('venue_id', e.target.value); upd('court_id', ''); }} className={IC}>
              <option value="">Any venue</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          {filteredCourts.length > 0 && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Court</label>
              <select value={form.court_id} onChange={e => upd('court_id', e.target.value)} className={IC}>
                <option value="">Any court</option>
                {filteredCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Notes</label>
            <input value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="Optional notes…" className={IC} />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
        <div className="shrink-0 px-5 pb-5 pt-3 flex gap-3 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Training'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrainingSettingsModal({ onClose }) {
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = getBookingWindowDays();
    if (current !== undefined) setDays(current == null ? '' : String(current));
    else db.entities.ClubSettings.list().then(rows => {
      const v = rows?.[0]?.booking_window_days;
      setDays(v == null ? '' : String(v));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setBookingWindowDays(days.trim() === '' ? null : Number(days));
      onClose();
    } catch (e) {
      alert('Error saving settings: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
          <h2 className="font-bold text-slate-900">Schedule Settings</h2>
        </div>
        <div className="p-5 space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Booking window (days)</label>
          <input type="number" min="0" value={days} onChange={e => setDays(e.target.value)}
            placeholder="No limit" className={IC} />
          <p className="text-xs text-slate-400">
            Coaches won't be able to book a session with a venue/court further than this many days ahead.
            Leave blank for no limit. Admins are never limited.
          </p>
        </div>
        <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const SUB_TABS = [
  { id: 'schedule',   label: 'Schedule' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'venues',     label: 'Venues' },
];

function StatCard({ label, value, sub, color = 'bg-blue-50 text-blue-700' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
      <p className={`text-3xl font-black ${color}`}>{value}</p>
      <p className="text-sm font-semibold text-slate-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CourtsTab() {
  const [venues, setVenues] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingCourtVenue, setAddingCourtVenue] = useState(null);
  const [newCourtName, setNewCourtName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      db.entities.Venue.list('name', 200).catch(() => []),
      db.entities.Court.list('name', 200).catch(() => []),
    ]).then(([vs, cs]) => { setVenues(vs); setCourts(cs); setLoading(false); });
  }, []);

  const addCourt = async (venueId) => {
    if (!newCourtName.trim()) return;
    setSaving(true);
    const c = await db.entities.Court.create({ venue_id: venueId, name: newCourtName.trim() });
    setCourts(prev => [...prev, c]);
    setNewCourtName(''); setAddingCourtVenue(null); setSaving(false);
  };

  const deleteCourt = async (id) => {
    await db.entities.Court.delete(id);
    setCourts(prev => prev.filter(c => c.id !== id));
  };

  if (loading) return <Spinner />;

  if (venues.length === 0) return (
    <div className="p-6 text-center text-slate-400 text-sm">No venues yet. Add venues first in the Venues tab.</div>
  );

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      {venues.map(v => {
        const venueCourts = courts.filter(c => c.venue_id === v.id);
        return (
          <div key={v.id} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-slate-900">{v.name}</h3>
                {v.address && <p className="text-xs text-slate-400">{v.address}</p>}
              </div>
              <button onClick={() => { setAddingCourtVenue(v.id); setNewCourtName(''); }}
                className="text-xs text-blue-600 font-semibold hover:text-blue-700 px-3 py-1.5 bg-blue-50 rounded-xl">
                + Add Court
              </button>
            </div>
            {addingCourtVenue === v.id && (
              <div className="flex gap-2 mb-3">
                <input value={newCourtName} onChange={e => setNewCourtName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCourt(v.id)}
                  placeholder="Court name e.g. Court 1"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus />
                <button onClick={() => addCourt(v.id)} disabled={saving || !newCourtName.trim()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                  {saving ? '…' : 'Add'}
                </button>
                <button onClick={() => setAddingCourtVenue(null)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-500">×</button>
              </div>
            )}
            {venueCourts.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No courts added.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {venueCourts.map(c => (
                  <span key={c.id} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs px-3 py-1.5 rounded-xl font-medium">
                    {c.name}
                    <button onClick={() => deleteCourt(c.id)} className="text-slate-400 hover:text-red-500 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminTrainingTab({ onProfileClick, resetTrigger, subTab: subTabProp, onSubTabChange, triggerAddVenue, triggerAddTraining, triggerSettings }) {
  const [localSubTab, setLocalSubTab] = useState('schedule');
  const subTab = subTabProp ?? localSubTab;
  const setSubTab = onSubTabChange ?? setLocalSubTab;
  const [overviewData, setOverviewData] = useState(null);
  const [showAddTraining, setShowAddTraining] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedDays, setExpandedDays] = useState({});

  useEffect(() => { if (resetTrigger) { setSubTab('schedule'); setShowAddTraining(false); setShowSettings(false); } }, [resetTrigger]);
  useEffect(() => { if (!triggerAddTraining) return; setShowAddTraining(true); }, [triggerAddTraining]);
  useEffect(() => { if (!triggerSettings) return; setShowSettings(true); }, [triggerSettings]);

  const loadOverview = () => {
    Promise.all([
      db.entities.Venue.list('name', 200).catch(() => []),
      db.entities.Court.list('name', 200).catch(() => []),
      db.entities.TrainingAllocation.list('-created_date', 500).catch(() => []),
      db.entities.Team.filter({ visibility: 'Club' }, 'team_name', 1000).catch(() => []),
      db.entities.Squad.list('name', 200).catch(() => []),
    ]).then(([vs, cs, as, ts, sqs]) => {
      setOverviewData({ venues: vs, courts: cs, allocations: as, teams: ts, squads: sqs });
    });
  };

  useEffect(() => { if (subTab === 'statistics') loadOverview(); }, [subTab]);

  const todayName = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  return (
    <div className="flex flex-col h-full">
      {showAddTraining && (
        <AddTrainingModal
          onClose={() => setShowAddTraining(false)}
          onSaved={() => { setShowAddTraining(false); loadOverview(); }}
          initialVenues={overviewData?.venues}
          initialCourts={overviewData?.courts}
          initialTeams={overviewData?.teams}
          initialSquads={overviewData?.squads}
        />
      )}

      {showSettings && <TrainingSettingsModal onClose={() => setShowSettings(false)} />}

      {/* Sub-tab bar */}
      <div className="bg-white border-b border-slate-200 flex shrink-0 overflow-x-auto">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-1 min-w-fit px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${subTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {subTab === 'schedule' && (
          <TrainingScheduleTab onProfileClick={onProfileClick} />
        )}

        {subTab === 'statistics' && (
          <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-4">
            {!overviewData ? <Spinner /> : (() => {
              const { venues, courts, allocations, teams, squads } = overviewData;
              const getTeamName = a => a.team_id ? (teams.find(t => t.id === a.team_id)?.team_name ?? 'Unknown') : null;
              const getSquadName = a => a.squad_id ? (squads.find(s => s.id === a.squad_id)?.name ?? 'Unknown') : null;
              const getName = a => getTeamName(a) || getSquadName(a) || '—';
              const getVenue = a => venues.find(v => v.id === a.venue_id)?.name || a.venue || null;
              const getCourt = a => courts.find(c => c.id === a.court_id)?.name || a.court || null;
              const todayAllocs = allocations.filter(a => a.day === todayName).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
              const byDay = DAYS.reduce((acc, d) => { const al = allocations.filter(a => a.day === d); if (al.length) acc[d] = al; return acc; }, {});

              return (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Venues" value={venues.filter(v => v.status !== 'Inactive').length} color="text-blue-700" />
                    <StatCard label="Courts" value={courts.length} color="text-indigo-700" />
                    <StatCard label="Sessions" value={allocations.length} color="text-green-700" />
                    <StatCard label="Active Days" value={Object.keys(byDay).length} color="text-amber-700" />
                  </div>

                  {/* Today's training */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today — {todayName}</p>
                      <button onClick={() => setShowAddTraining(true)} className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:underline">
                        <Plus size={13} /> Add Training
                      </button>
                    </div>
                    {todayAllocs.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center text-slate-400 text-sm">No training scheduled for today</div>
                    ) : (
                      <div className="space-y-2">
                        {todayAllocs.map(a => (
                          <div key={a.id} className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                            <div className="w-2 h-8 rounded-full bg-blue-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 text-sm truncate">{getName(a)}</p>
                              <p className="text-xs text-slate-400">{[a.start_time && fmt12(a.start_time), a.end_time && fmt12(a.end_time)].filter(Boolean).join(' – ')}{getVenue(a) ? ` · ${getVenue(a)}` : ''}{getCourt(a) ? ` · ${getCourt(a)}` : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Weekly breakdown */}
                  {Object.keys(byDay).length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Weekly Schedule</p>
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        {Object.entries(byDay).map(([day, allocs], i) => {
                          const sorted = allocs.sort((a,b) => (a.start_time||'').localeCompare(b.start_time||''));
                          const expanded = !!expandedDays[day];
                          const shown = expanded ? sorted : sorted.slice(0, 3);
                          const hiddenCount = sorted.length - shown.length;
                          return (
                            <div key={day} className={`px-4 py-3 flex items-start gap-3 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                              <span className="text-xs font-bold text-slate-400 w-20 shrink-0 pt-0.5">{day.slice(0,3).toUpperCase()}</span>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {shown.map(a => (
                                  <span key={a.id} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg font-medium">
                                    {getName(a)}{a.start_time ? ` ${fmt12(a.start_time)}` : ''}
                                  </span>
                                ))}
                                {hiddenCount > 0 && (
                                  <button
                                    onClick={() => setExpandedDays(prev => ({ ...prev, [day]: true }))}
                                    className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 font-semibold"
                                  >
                                    +{hiddenCount} more
                                  </button>
                                )}
                                {expanded && sorted.length > 3 && (
                                  <button
                                    onClick={() => setExpandedDays(prev => ({ ...prev, [day]: false }))}
                                    className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 font-semibold"
                                  >
                                    Show less
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {subTab === 'venues' && (
          <AdminVenuesTab />
        )}
      </div>
    </div>
  );
}
