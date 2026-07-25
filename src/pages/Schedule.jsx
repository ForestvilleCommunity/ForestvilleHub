import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MapPin, Clock, CalendarClock, ClipboardPlus } from 'lucide-react';
import { db } from '@/api/db';
import { getActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';
import { getCurrentSeason } from '@/lib/season';
import SessionSummary from '@/components/sessions/SessionSummary';

const WEEKDAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const WEEKS_AHEAD = 4;

function fmt12(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function timeToMins(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
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

function directionsUrl(venue) {
  if (!venue) return null;
  if (venue.latitude != null && venue.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`;
  }
  const query = venue.address || venue.name;
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(getActiveTeam());
  const [allocations, setAllocations] = useState([]);
  const [venuesById, setVenuesById] = useState({});
  const [courtsById, setCourtsById] = useState({});
  const [sessionsByDate, setSessionsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [creatingKey, setCreatingKey] = useState(null);
  const [summarySession, setSummarySession] = useState(null);

  useEffect(() => { db.auth.me().then(setUser).catch(() => {}); }, []);
  useEffect(() => subscribeActiveTeam(t => setTeam(t)), []);

  useEffect(() => {
    if (!team?.id) { setAllocations([]); setSessionsByDate({}); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      db.entities.TrainingAllocation.list('-created_date', 500).catch(() => []),
      db.entities.Venue.list().catch(() => []),
      db.entities.Court.list().catch(() => []),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
      db.entities.Session.filter({ team_id: team.id, session_type: 'Team' }, '-created_date', 500).catch(() => []),
    ]).then(([allocs, venues, courts, squads, sessions]) => {
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
      // Last-created session wins if a team somehow has two on the same date.
      const byDate = {};
      sessions.forEach(s => { if (s.date) byDate[s.date] = s; });
      setSessionsByDate(byDate);
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

  const planSession = async (alloc, key) => {
    const ds = dateStr(alloc.date);
    const existing = sessionsByDate[ds];
    if (existing) {
      setSummarySession(existing);
      return;
    }
    setCreatingKey(key);
    try {
      const startMins = timeToMins(alloc.start_time);
      const endMins = timeToMins(alloc.end_time);
      const duration = startMins != null && endMins != null && endMins > startMins ? endMins - startMins : undefined;
      const created = await db.entities.Session.create({
        session_name: `${team.team_name} Training`,
        session_type: 'Team',
        team_id: team.id,
        date: ds,
        start_time: alloc.start_time || null,
        duration_minutes: duration,
        venue_id: alloc.venue_id || null,
        court_id: alloc.court_id || null,
        status: 'Planned',
        owner_user_email: user?.email,
        owner_id: user?.id,
        session_blocks: JSON.stringify([]),
        season_name: getCurrentSeason().name,
      });
      navigate(`/sessions/${created.id}/edit`);
    } catch (e) {
      toast.error('Could not create a session for this training. Please try again.');
      setCreatingKey(null);
    }
  };

  return (
    <div>
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-xl font-bold text-slate-900">Calendar</h1>
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
              const key = `${a.id}-${i}`;
              const existing = sessionsByDate[dateStr(a.date)];
              const isCreating = creatingKey === key;
              return (
                <div key={key} className="px-4 py-3.5 flex items-center gap-3">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                    {fmtDateLabel(a.date)}
                  </span>
                  {a.start_time && (
                    <span className="flex items-center gap-1 text-sm text-slate-500 shrink-0">
                      <Clock size={12} />{fmt12(a.start_time)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-sm text-slate-400 truncate flex-1 min-w-0">
                    <MapPin size={12} className="shrink-0" />
                    {venue || court
                      ? `${venue?.name || 'No venue'}${court ? ` · ${court.name}` : ''}`
                      : 'No venue set'}
                  </span>
                  <button
                    onClick={() => planSession(a, key)}
                    disabled={isCreating}
                    className={`shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      existing ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isCreating ? '…' : existing ? 'View Session' : (<><ClipboardPlus size={12} /> Plan Session</>)}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {summarySession && (
        <SessionSummary
          session={summarySession}
          teamName={team?.team_name}
          onClose={() => setSummarySession(null)}
          onEdit={s => { setSummarySession(null); navigate(`/sessions/${s.id}/edit`); }}
        />
      )}
    </div>
  );
}
