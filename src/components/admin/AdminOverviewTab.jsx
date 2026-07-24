import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/api/db';
import { Trash2 } from 'lucide-react';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const TODAY = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`;
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

const CARDS = [
  { key: 'members',  label: 'Total Members',   bg: 'bg-blue-600',   icon: '👥' },
  { key: 'teams',    label: 'Active Teams',     bg: 'bg-green-600',  icon: '🏀' },
  { key: 'coaches',  label: 'Coaches',          bg: 'bg-amber-600',  icon: '👤' },
  { key: 'sessions', label: 'Sessions This Month', bg: 'bg-indigo-600', icon: '📅' },
];

export default function AdminOverviewTab({ onTabChange }) {
  const navigate = useNavigate();
  const [stats, setStats]             = useState(null);
  const [recentSessions, setRecent]   = useState([]);
  const [todayTraining, setToday]     = useState([]);
  const [unassigned, setUnassigned]   = useState(0);
  const [teams, setTeams]             = useState([]);
  const [squads, setSquads]           = useState([]);
  const [deleteStep, setDeleteStep]   = useState(0); // 0=hidden, 1=confirm, 2=deleting, 3=done
  const [importStep, setImportStep]   = useState(0); // 0=idle, 1=running, 2=done, 3=error
  const [importLog,  setImportLog]    = useState([]);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { start, end } = monthRange();

    const [members, teamList, squadList, users, sessions, allSessions, allocations] = await Promise.all([
      db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000).catch(() => []),
      db.entities.Squad.list('-created_date', 500).catch(() => []),
      db.entities.User.list('-created_date', 500).catch(() => []),
      db.entities.Session.list('-date', 1000).catch(() => []),
      db.entities.Session.list('-date', 1000).catch(() => []),
      db.entities.TrainingAllocation.list('start_time', 500).catch(() => []),
    ]);

    const activeMembers = members.filter(m => m.status !== 'Archived');
    const activeTeams   = teamList.filter(t => t.status !== 'Inactive');
    const coaches       = users.filter(u => u.role !== 'admin');

    const monthSessions = sessions.filter(s => s.date >= start && s.date <= end);

    setTeams(teamList);
    setSquads(squadList);

    setStats({
      members:  activeMembers.length,
      teams:    activeTeams.length,
      coaches:  coaches.length,
      sessions: monthSessions.length,
    });

    // Recent sessions — last 5
    const recent = allSessions.slice(0, 5);
    setRecent(recent);

    // Today's training allocations
    setToday(allocations.filter(a => a.day === TODAY));

    // Members with no team assigned
    setUnassigned(activeMembers.filter(m => !m.team_id).length);
  };

  const deleteAll = async (entity, filter) => {
    while (true) {
      const records = filter
        ? await entity.filter(filter, '-created_date', 1000).catch(() => [])
        : await entity.list('-created_date', 1000).catch(() => []);
      if (!records.length) break;
      await Promise.all(records.map(r => entity.delete(r.id).catch(() => {})));
    }
  };

  const deleteEverything = async () => {
    setDeleteStep(2);
    setDeleteError(null);
    try {
      // Delete dependants first, then parents
      await deleteAll(db.entities.AttendanceRecord);
      await deleteAll(db.entities.PlayerNote);
      await deleteAll(db.entities.PlayerEvaluation);
      await deleteAll(db.entities.CoachEvaluation);
      await deleteAll(db.entities.TeamEvaluation);
      await deleteAll(db.entities.EvaluationSession);
      await deleteAll(db.entities.ChallengeResult);
      await deleteAll(db.entities.ClubChallenge);
      await deleteAll(db.entities.SessionDrill);
      await deleteAll(db.entities.DrillFavorite);
      await deleteAll(db.entities.TrainingAllocation);
      await deleteAll(db.entities.UserTeamAccess);
      await deleteAll(db.entities.Session);
      await deleteAll(db.entities.Game);
      await deleteAll(db.entities.Player);
      // Delete members without filter to catch any visibility value
      await deleteAll(db.entities.Member);
      await deleteAll(db.entities.Squad);
      await deleteAll(db.entities.Team, { visibility: 'Club' });
      await deleteAll(db.entities.Drill, { visibility: 'Club' });

      // Clear CoachPad localStorage keys
      Object.keys(localStorage).filter(k => k.startsWith('coachpad_')).forEach(k => localStorage.removeItem(k));

      setDeleteStep(3);
      setStats({ members: 0, teams: 0, coaches: 0, sessions: 0 });
      // Reload the page so all tabs reflect the empty state
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setDeleteError(e.message || 'Unknown error');
      setDeleteStep(1);
    }
  };

  const importFEBCTraining = async () => {
    setImportStep(1);
    const log = [];
    const addLog = msg => { log.push(msg); setImportLog([...log]); };

    const VENUES_DATA = [
      { name: 'Seymour',     courts: ['1'] },
      { name: 'Nazareth',    courts: ['1', '2'] },
      { name: 'Cabra',       courts: ['1', '2'] },
      { name: 'Wayville',    courts: ['1', '2', '3'] },
      { name: 'Concordia',   courts: ['1'] },
      { name: 'Westminster', courts: ['1', '2'] },
      { name: 'PAC',         courts: ['1', '2'] },
      { name: 'Unley',       courts: ['1'] },
      { name: 'Repat',       courts: ['1'] },
      { name: 'Parkside',    courts: ['1'] },
      { name: 'Westbourne',  courts: ['1'] },
      { name: 'CBC',         courts: ['1'] },
    ];
    const SCHEDULE = [
      { day:'Monday',    start:'18:00', end:'19:30', venue:'Concordia',   court:'1', team:'U18G2' },
      { day:'Monday',    start:'18:00', end:'19:30', venue:'Westminster', court:'1', team:'NBL1M' },
      { day:'Monday',    start:'18:00', end:'19:30', venue:'Westminster', court:'2', team:'NBL1M' },
      { day:'Monday',    start:'18:00', end:'19:30', venue:'Repat',       court:'1', team:'U14B2' },
      { day:'Monday',    start:'18:00', end:'19:30', venue:'Repat',       court:'1', team:'NBL1W' },
      { day:'Monday',    start:'18:00', end:'19:30', venue:'Parkside',    court:'1', team:'U14G3' },
      { day:'Monday',    start:'19:30', end:'21:00', venue:'Concordia',   court:'1', team:'YLW' },
      { day:'Monday',    start:'19:30', end:'21:00', venue:'Repat',       court:'1', team:'U16B4' },
      { day:'Monday',    start:'19:30', end:'21:00', venue:'Repat',       court:'1', team:'NBL1W' },
      { day:'Monday',    start:'19:30', end:'21:00', venue:'Parkside',    court:'1', team:'U18G1' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Seymour',     court:'1', team:'U14B1' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Nazareth',    court:'1', team:'U14B4' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Nazareth',    court:'2', team:'U14G1' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Cabra',       court:'1', team:'U14B2' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Cabra',       court:'2', team:'U14B3' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Wayville',    court:'2', team:'U12B2' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Westminster', court:'1', team:'U16G3' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Westminster', court:'2', team:'U14G4' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'PAC',         court:'1', team:'U12B3' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'PAC',         court:'2', team:'U12B3' },
      { day:'Tuesday',   start:'18:00', end:'19:30', venue:'Unley',       court:'1', team:'U14G2' },
      { day:'Tuesday',   start:'19:30', end:'21:00', venue:'Seymour',     court:'1', team:'U16B2' },
      { day:'Tuesday',   start:'19:30', end:'21:00', venue:'Nazareth',    court:'1', team:'U16G2' },
      { day:'Tuesday',   start:'19:30', end:'21:00', venue:'Cabra',       court:'1', team:'U16B4' },
      { day:'Tuesday',   start:'19:30', end:'21:00', venue:'Cabra',       court:'2', team:'U18B2' },
      { day:'Tuesday',   start:'19:30', end:'21:00', venue:'Wayville',    court:'2', team:'U18B3' },
      { day:'Tuesday',   start:'19:30', end:'21:00', venue:'Westminster', court:'2', team:'U16B3' },
      { day:'Tuesday',   start:'19:30', end:'21:00', venue:'PAC',         court:'2', team:'U16B5' },
      { day:'Tuesday',   start:'19:30', end:'21:00', venue:'Unley',       court:'1', team:'U18B4' },
      { day:'Wednesday', start:'18:00', end:'19:30', venue:'Nazareth',    court:'1', team:'U12G2' },
      { day:'Wednesday', start:'18:00', end:'19:30', venue:'Nazareth',    court:'2', team:'U12G3' },
      { day:'Wednesday', start:'18:00', end:'19:30', venue:'Concordia',   court:'1', team:'U10B1' },
      { day:'Wednesday', start:'18:00', end:'19:30', venue:'Westminster', court:'1', team:'U16B1' },
      { day:'Wednesday', start:'18:00', end:'19:30', venue:'Westminster', court:'2', team:'U18B1' },
      { day:'Wednesday', start:'18:00', end:'19:30', venue:'Repat',       court:'1', team:'U12G1' },
      { day:'Wednesday', start:'18:00', end:'19:30', venue:'Parkside',    court:'1', team:'U10B2' },
      { day:'Wednesday', start:'19:30', end:'21:00', venue:'Nazareth',    court:'1', team:'U16G1' },
      { day:'Wednesday', start:'19:30', end:'21:00', venue:'Nazareth',    court:'2', team:'U18G1' },
      { day:'Thursday',  start:'18:00', end:'19:30', venue:'Nazareth',    court:'1', team:'NBL1M' },
      { day:'Thursday',  start:'18:00', end:'19:30', venue:'Nazareth',    court:'2', team:'NBL1M' },
      { day:'Thursday',  start:'18:00', end:'19:30', venue:'Cabra',       court:'1', team:'U10G1' },
      { day:'Thursday',  start:'18:00', end:'19:30', venue:'Cabra',       court:'2', team:'U10G2' },
      { day:'Thursday',  start:'18:00', end:'19:30', venue:'Parkside',    court:'1', team:'U12B1' },
      { day:'Thursday',  start:'19:30', end:'21:00', venue:'Nazareth',    court:'1', team:'NBL1M' },
      { day:'Thursday',  start:'19:30', end:'21:00', venue:'Nazareth',    court:'2', team:'NBL1M' },
      { day:'Thursday',  start:'19:30', end:'21:00', venue:'Cabra',       court:'1', team:'NBL1W' },
      { day:'Thursday',  start:'19:30', end:'21:00', venue:'Cabra',       court:'2', team:'NBL1W' },
      { day:'Sunday',    start:'08:30', end:'10:00', venue:'Wayville',    court:'1', team:'U12G1' },
      { day:'Sunday',    start:'08:30', end:'10:00', venue:'Wayville',    court:'2', team:'U12G2' },
      { day:'Sunday',    start:'08:30', end:'10:00', venue:'Wayville',    court:'3', team:'U12G3' },
      { day:'Sunday',    start:'08:30', end:'10:00', venue:'Westbourne',  court:'1', team:'U10G2' },
      { day:'Sunday',    start:'08:30', end:'10:00', venue:'Cabra',       court:'1', team:'U18B1' },
      { day:'Sunday',    start:'08:30', end:'10:00', venue:'Cabra',       court:'2', team:'U18B2' },
      { day:'Sunday',    start:'08:30', end:'10:00', venue:'CBC',         court:'1', team:'U14G3' },
      { day:'Sunday',    start:'08:30', end:'10:00', venue:'CBC',         court:'1', team:'U14G4' },
      { day:'Sunday',    start:'10:00', end:'11:30', venue:'Wayville',    court:'1', team:'U14G1' },
      { day:'Sunday',    start:'10:00', end:'11:30', venue:'Wayville',    court:'2', team:'U14G2' },
      { day:'Sunday',    start:'10:00', end:'11:30', venue:'Wayville',    court:'3', team:'U16G1' },
      { day:'Sunday',    start:'10:00', end:'11:30', venue:'Westbourne',  court:'1', team:'U10G1' },
      { day:'Sunday',    start:'10:00', end:'11:30', venue:'Cabra',       court:'1', team:'U14B3' },
      { day:'Sunday',    start:'10:00', end:'11:30', venue:'Cabra',       court:'2', team:'U16B2' },
      { day:'Sunday',    start:'11:30', end:'13:00', venue:'Wayville',    court:'1', team:'U16G2' },
      { day:'Sunday',    start:'11:30', end:'13:00', venue:'Wayville',    court:'2', team:'U16G3' },
      { day:'Sunday',    start:'11:30', end:'13:00', venue:'Wayville',    court:'3', team:'U16G3' },
      { day:'Sunday',    start:'11:30', end:'13:00', venue:'Cabra',       court:'1', team:'U18B3' },
      { day:'Sunday',    start:'11:30', end:'13:00', venue:'Cabra',       court:'2', team:'U18B4' },
      { day:'Sunday',    start:'11:30', end:'13:00', venue:'CBC',         court:'1', team:'U14B4' },
      { day:'Sunday',    start:'13:00', end:'14:30', venue:'Wayville',    court:'1', team:'U10B1' },
      { day:'Sunday',    start:'13:00', end:'14:30', venue:'Wayville',    court:'2', team:'U10B2' },
      { day:'Sunday',    start:'13:00', end:'14:30', venue:'Cabra',       court:'1', team:'U16B5' },
      { day:'Sunday',    start:'13:00', end:'14:30', venue:'Cabra',       court:'2', team:'U12B2' },
      { day:'Sunday',    start:'14:30', end:'16:00', venue:'Wayville',    court:'1', team:'U16B3' },
      { day:'Sunday',    start:'14:30', end:'16:00', venue:'Cabra',       court:'1', team:'U16B1' },
      { day:'Sunday',    start:'14:30', end:'16:00', venue:'Cabra',       court:'2', team:'U12B1' },
      { day:'Sunday',    start:'16:00', end:'17:30', venue:'Wayville',    court:'1', team:'U14B1' },
      { day:'Sunday',    start:'16:00', end:'17:30', venue:'Cabra',       court:'1', team:'U12B3' },
      { day:'Sunday',    start:'16:00', end:'17:30', venue:'Cabra',       court:'2', team:'U12B3' },
      { day:'Sunday',    start:'19:00', end:'20:30', venue:'Wayville',    court:'1', team:'YLM' },
      { day:'Sunday',    start:'19:00', end:'20:30', venue:'Wayville',    court:'2', team:'YLM' },
      { day:'Sunday',    start:'19:00', end:'20:30', venue:'Wayville',    court:'3', team:'YLM' },
    ];

    try {
      // Fetch current data
      addLog('Fetching existing data…');
      const [existingVenues, existingCourts, allSquads, existingAllocs] = await Promise.all([
        db.entities.Venue.list('-created_date', 500).catch(() => []),
        db.entities.Court.list('-created_date', 1000).catch(() => []),
        db.entities.Squad.list('-created_date', 500).catch(() => []),
        db.entities.TrainingAllocation.list('-created_date', 1000).catch(() => []),
      ]);

      // Delete existing FEBC allocations (squad-linked OR team-linked at our venues)
      const schedCodes = new Set(SCHEDULE.map(e => e.team));
      const febcVenues = new Set(VENUES_DATA.map(v => v.name.toLowerCase()));
      const toDelete = existingAllocs.filter(a => {
        if (a.squad_id && allSquads.find(s => s.id === a.squad_id && schedCodes.has(s.name))) return true;
        if (a.allocation_type === 'Team' && a.venue && febcVenues.has(a.venue.toLowerCase())) return true;
        return false;
      });
      if (toDelete.length) {
        addLog(`  Removing ${toDelete.length} existing allocations…`);
        await Promise.all(toDelete.map(a => db.entities.TrainingAllocation.delete(a.id).catch(() => {})));
      }

      const norm = s => (s || '').toLowerCase().trim();
      const findVenue = name => existingVenues.find(v => norm(v.name).includes(norm(name)) || norm(name).includes(norm(v.name)));
      const findCourt = (vid, num) => existingCourts.find(c => c.venue_id === vid && (c.name === num || c.name === `Court ${num}` || norm(c.name).includes(num)));
      const findSquad = code => allSquads.find(s => norm(s.name) === norm(code)) || null;

      // Create missing venues + courts
      addLog('Creating venues and courts…');
      for (const vd of VENUES_DATA) {
        let venue = findVenue(vd.name);
        if (!venue) {
          venue = await db.entities.Venue.create({ name: vd.name });
          existingVenues.push(venue);
          addLog(`  + Venue: ${vd.name}`);
        }
        for (const num of vd.courts) {
          if (!findCourt(venue.id, num)) {
            const court = await db.entities.Court.create({ name: num, venue_id: venue.id });
            existingCourts.push(court);
            addLog(`  + Court: ${vd.name} ${num}`);
          }
        }
      }

      // Create allocations
      addLog('Creating training allocations…');
      let ok = 0, skipped = 0;
      for (const entry of SCHEDULE) {
        const venue = findVenue(entry.venue);
        const squad = findSquad(entry.team);
        if (!venue || !squad) { skipped++; addLog(`  ⚠ Skipped: ${entry.team} @ ${entry.venue}`); continue; }
        const court = findCourt(venue.id, entry.court);
        await db.entities.TrainingAllocation.create({
          day: entry.day, start_time: entry.start, end_time: entry.end,
          venue_id: venue.id, venue: venue.name,
          court_id: court?.id || null, court: court?.name || entry.court,
          allocation_type: 'Squad', squad_id: squad.id, team_id: null,
        });
        ok++;
      }
      addLog(`✓ Done — ${ok} allocations created, ${skipped} skipped (no squad match)`);
      setImportStep(2);
    } catch (e) {
      addLog(`✗ Error: ${e.message}`);
      setImportStep(2);
    }
  };

  if (!stats) return (
    <div className="p-12 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  const getTeamName  = a => a.team_id  ? (teams.find(t => t.id === a.team_id)?.team_name ?? 'Unknown') : null;
  const getSquadName = a => a.squad_id ? (squads.find(s => s.id === a.squad_id)?.name ?? 'Unknown') : null;
  const getName      = a => getTeamName(a) || getSquadName(a) || 'Unknown';

  const getSessionTeam = s => teams.find(t => t.id === s.team_id)?.team_name ?? '—';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-4xl mx-auto">

      {/* Stat cards */}
      <div>
        <h2 className="font-bold text-slate-900 text-lg mb-3">Club Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CARDS.map(({ key, label, bg, icon }) => (
            <div key={key} className={`${bg} rounded-2xl p-4 text-white`}>
              <div className="text-2xl mb-1">{icon}</div>
              <p className="text-3xl font-black">{stats[key] ?? 0}</p>
              <p className="text-xs font-semibold mt-1 text-white/80">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Attention banner */}
      {unassigned > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-amber-500 text-xl">⚠️</span>
          <p className="text-sm text-amber-800 font-medium">
            <span className="font-bold">{unassigned} member{unassigned > 1 ? 's' : ''}</span> not assigned to a team — head to the Members tab to sort this out.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Recent sessions */}
        <div>
          <h3 className="font-bold text-slate-900 mb-3">Recent Sessions</h3>
          {recentSessions.length === 0 ? (
            <div className="bg-slate-50 rounded-2xl p-5 text-center text-sm text-slate-400">No sessions recorded yet.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {recentSessions.slice(0, 3).map(s => (
                <div key={s.id} className="flex items-center px-4 py-3 gap-3">
                  <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                    {s.date ? new Date(s.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{getSessionTeam(s)}</p>
                    <p className="text-xs text-slate-400 truncate">{s.session_name || 'Training session'}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    s.status === 'Completed' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {s.status || 'Logged'}
                  </span>
                </div>
              ))}
              <button onClick={() => navigate('/sessions')}
                className="w-full py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors text-center">
                See all sessions →
              </button>
            </div>
          )}
        </div>

        {/* Today's training */}
        <div>
          <h3 className="font-bold text-slate-900 mb-3">Today's Training <span className="text-slate-400 font-normal text-sm">({TODAY})</span></h3>
          {todayTraining.length === 0 ? (
            <div className="bg-slate-50 rounded-2xl p-5 text-center text-sm text-slate-400">Nothing scheduled for today.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {todayTraining.slice(0, 3).map(a => (
                <div key={a.id} className="flex items-center px-4 py-3 gap-3">
                  <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                    🏀
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{getName(a)}</p>
                    <p className="text-xs text-slate-400">
                      {[a.start_time && fmt12(a.start_time), a.end_time && fmt12(a.end_time)].filter(Boolean).join(' – ')}
                    </p>
                  </div>
                </div>
              ))}
              {(todayTraining.length > 3 || true) && (
                <button onClick={() => onTabChange?.('training')}
                  className="w-full py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors text-center">
                  {todayTraining.length > 3 ? `See all (${todayTraining.length - 3} more) →` : 'View full schedule →'}
                </button>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Danger Zone */}
      <div className="border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Danger Zone</p>
          <p className="text-xs text-slate-400 mt-0.5">Delete all members, teams, sessions and club data.</p>
        </div>
        {deleteStep === 0 && (
          <button onClick={() => setDeleteStep(1)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 text-xs font-semibold rounded-xl transition-colors">
            <Trash2 size={13} /> Delete Everything
          </button>
        )}
        {deleteStep === 1 && (
          <div className="shrink-0 flex items-center gap-2">
            {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
            <button onClick={() => setDeleteStep(0)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={deleteEverything}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors">
              Yes, delete everything
            </button>
          </div>
        )}
        {deleteStep === 2 && (
          <div className="shrink-0 flex items-center gap-2 text-xs text-slate-400">
            <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-red-400 rounded-full animate-spin" />
            Deleting…
          </div>
        )}
        {deleteStep === 3 && (
          <span className="shrink-0 text-xs font-semibold text-green-600">All data deleted.</span>
        )}
      </div>

    </div>
  );
}
