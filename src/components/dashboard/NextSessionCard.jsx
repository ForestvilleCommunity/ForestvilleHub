import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, Navigation, ChevronRight } from 'lucide-react';
import { db } from '@/api/db';
import { getAccessibleTeams } from '@/lib/teamAccess';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fmt12(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function fmtDateLabel(dateStr) {
  const today = todayStr();
  const tomorrow = (() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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

export default function NextSessionCard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null);
  const [teams, setTeams] = useState([]);
  const [venuesById, setVenuesById] = useState({});
  const [courtsById, setCourtsById] = useState({});

  useEffect(() => {
    const load = async () => {
      const user = await db.auth.me().catch(() => null);
      if (!user) return;
      const accessibleTeams = await getAccessibleTeams(user);
      const teamIds = accessibleTeams.map(t => t.id);

      const [teamSessions, ownSessions, venueList, courtList] = await Promise.all([
        teamIds.length ? db.entities.Session.filter({ team_id: teamIds }).catch(() => []) : Promise.resolve([]),
        db.entities.Session.filter({ owner_id: user.id }).catch(() => []),
        db.entities.Venue.list().catch(() => []),
        db.entities.Court.list().catch(() => []),
      ]);

      const merged = new Map();
      [...teamSessions, ...ownSessions].forEach(s => merged.set(s.id, s));

      const today = todayStr();
      const upcoming = Array.from(merged.values())
        .filter(s => s.date >= today && s.status !== 'Cancelled')
        .sort((a, b) => (a.date === b.date ? (a.start_time || '').localeCompare(b.start_time || '') : a.date.localeCompare(b.date)));

      const nextDate = upcoming[0]?.date;
      setSessions(nextDate ? upcoming.filter(s => s.date === nextDate) : []);
      setTeams(accessibleTeams);
      setVenuesById(Object.fromEntries(venueList.map(v => [v.id, v])));
      setCourtsById(Object.fromEntries(courtList.map(c => [c.id, c])));
    };
    load().catch(() => setSessions([]));
  }, []);

  if (!sessions || sessions.length === 0) return null;
  const isToday = sessions[0].date === todayStr();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-slate-500" />
        <p className="font-bold text-slate-900 text-sm">Where am I training {isToday ? 'today' : 'next'}</p>
      </div>
      <div className="space-y-2">
        {sessions.map(s => {
          const team = teams.find(t => t.id === s.team_id);
          const venue = venuesById[s.venue_id];
          const court = courtsById[s.court_id];
          const dirUrl = directionsUrl(venue);
          const timeLabel = fmt12(s.start_time);

          return (
            <button key={s.id} onClick={() => navigate(`/sessions/${s.id}/edit`)}
              className="w-full text-left bg-slate-50 hover:bg-slate-100 rounded-xl p-3 flex items-start gap-3 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{fmtDateLabel(s.date)}</span>
                  {timeLabel && <span className="text-xs text-slate-500 font-semibold flex items-center gap-1"><Clock size={10} />{timeLabel}</span>}
                </div>
                <p className="font-semibold text-sm text-slate-900 mt-1 truncate">{s.session_name}{team ? ` · ${team.team_name}` : ''}</p>
                {(venue || court) ? (
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <MapPin size={10} className="shrink-0" />
                    <span className="truncate">{venue?.name}{court ? ` · ${court.name}` : ''}</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic mt-0.5">No venue set</p>
                )}
                {venue?.address && <p className="text-xs text-slate-400 mt-0.5 truncate">{venue.address}</p>}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                {dirUrl && (
                  <a href={dirUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 rounded-lg px-2 py-1">
                    <Navigation size={11} /> Directions
                  </a>
                )}
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
