import { useState, useEffect } from 'react';
import { MapPin, Clock, CalendarClock } from 'lucide-react';
import { db } from '@/api/db';
import { getActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';

const WEEKDAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const WEEKS_AHEAD = 4;

function fmt12(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

// All calendar dates matching a weekday name within the next `weeksAhead` weeks (today included).
function upcomingDatesForDay(dayName, weeksAhead) {
  const targetIdx = WEEKDAY_INDEX[dayName];
  if (targetIdx == null) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < weeksAhead * 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === targetIdx) dates.push(d);
  }
  return dates;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateLabel(d) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function Schedule() {
  const [team, setTeam] = useState(getActiveTeam());
  const [allocations, setAllocations] = useState([]);
  const [venuesById, setVenuesById] = useState({});
  const [courtsById, setCourtsById] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeActiveTeam(t => setTeam(t)), []);

  useEffect(() => {
    if (!team?.id) { setAllocations([]); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      db.entities.TrainingAllocation.list('-created_date', 500).catch(() => []),
      db.entities.Venue.list().catch(() => []),
      db.entities.Court.list().catch(() => []),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
    ]).then(([allocs, venues, courts, squads]) => {
      // Allocations are assigned per-team OR per-squad (squads.team_ids is the source of
      // truth for membership — teams.squad_id exists in the schema but isn't reliably
      // populated, so don't rely on it; find the squad the same way AdminTeamsTab does).
      const squadForTeam = squads.find(sq => {
        try { return JSON.parse(sq.team_ids || '[]').includes(team.id); } catch { return false; }
      });
      const relevant = allocs.filter(a =>
        a.status !== 'Inactive' && (a.team_id === team.id || (squadForTeam && a.squad_id === squadForTeam.id))
      );
      setAllocations(relevant);
      setVenuesById(Object.fromEntries(venues.map(v => [v.id, v])));
      setCourtsById(Object.fromEntries(courts.map(c => [c.id, c])));
      setLoading(false);
    });
  }, [team?.id]);

  const upcoming = allocations
    .flatMap(a => upcomingDatesForDay(a.day, WEEKS_AHEAD).map(date => ({ ...a, date })))
    .filter(a => {
      if (!a.pause_start || !a.pause_end) return true;
      const s = dateStr(a.date);
      return s < a.pause_start || s > a.pause_end;
    })
    .sort((a, b) => a.date - b.date || (a.start_time || '').localeCompare(b.start_time || ''));

  return (
    <div>
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-xl font-bold text-slate-900">Schedule</h1>
        <p className="text-sm text-slate-500">{team ? team.team_name : 'Select a team to see its schedule'}</p>
      </div>

      <div className="px-4 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-7 h-7 border-3 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>
        ) : !team?.id ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <CalendarClock size={28} className="text-blue-400" />
            </div>
            <p className="font-semibold text-slate-700">No team selected</p>
            <p className="text-sm text-slate-400 mt-1">Pick a team from the switcher to see its upcoming schedule</p>
          </div>
        ) : upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <CalendarClock size={28} className="text-blue-400" />
            </div>
            <p className="font-semibold text-slate-700">No upcoming training</p>
            <p className="text-sm text-slate-400 mt-1">This team has no recurring training allocation yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
            {upcoming.map((a, i) => {
              const venue = venuesById[a.venue_id];
              const court = courtsById[a.court_id];
              return (
                <div key={`${a.id}-${i}`} className="px-4 py-3.5 flex items-center gap-3">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                    {fmtDateLabel(a.date)}
                  </span>
                  {a.start_time && (
                    <span className="flex items-center gap-1 text-sm text-slate-500 shrink-0">
                      <Clock size={12} />{fmt12(a.start_time)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-sm text-slate-400 truncate">
                    <MapPin size={12} className="shrink-0" />
                    {venue || court
                      ? `${venue?.name || 'No venue'}${court ? ` · ${court.name}` : ''}`
                      : 'No venue set'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
