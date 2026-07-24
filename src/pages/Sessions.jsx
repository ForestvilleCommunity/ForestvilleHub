import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Calendar, Filter, X, Trash2 } from 'lucide-react';
import Pagination from '@/components/admin/Pagination';
import HelpBubble from '@/components/HelpBubble';
import { exportSession } from '@/lib/exportHTML';
import { db } from '@/api/db';
import { getAccessibleTeams } from '@/lib/teamAccess';
import { getAccessibleSessions } from '@/lib/sessionAccess';
import { getActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';
import SessionCard from '@/components/sessions/SessionCard';
import SessionSummary from '@/components/sessions/SessionSummary';
import { format } from 'date-fns';

const STATUSES = ['All', 'Planned', 'In Progress', 'Completed', 'Cancelled'];

export default function Sessions() {
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeTeam, setActiveTeamState] = useState(getActiveTeam());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [summarySession, setSummarySession] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    db.auth.me().then(setUser).catch(() => {});
    const unsub = subscribeActiveTeam(t => setActiveTeamState(t));
    return unsub;
  }, []);
  useEffect(() => { if (user) load(); }, [user, activeTeam]);

  const load = async () => {
    setLoading(true);
    const [teamList, sessionList] = await Promise.all([
      getAccessibleTeams(user),
      getAccessibleSessions(user, activeTeam?.id),
    ]);
    setTeams(teamList);
    setSessions(sessionList);
    setLoading(false);
  };

  const handleDelete = (session) => {
    setDeleteConfirm(session);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await db.entities.Session.delete(deleteConfirm.id);
    } catch {
      // ignore — Supabase throws on hard errors only
    }
    // Supabase RLS silently blocks deletes on old sessions without owner_id.
    // Verify by trying to fetch; if it still exists, cancel it instead.
    try {
      await db.entities.Session.get(deleteConfirm.id);
      // Session still exists — fall back to cancelling
      await db.entities.Session.update(deleteConfirm.id, { status: 'Cancelled' }).catch(() => {});
      toast.success('Session cancelled.');
    } catch {
      // get threw = session is gone = delete worked
      toast.success('Session deleted.');
    }
    setDeleteConfirm(null);
    load();
  };

  const handleExport = async (session) => {
    const drills = await db.entities.SessionDrill.filter({ session_id: session.id }, 'order');
    const drillDetails = await Promise.all(drills.map(sd => db.entities.Drill.get(sd.drill_id).catch(() => null)));
    const sessionDrills = drills.map((sd, i) => ({ ...sd, drill: drillDetails[i] })).filter(sd => sd.drill);
    exportSession(session, sessionDrills, teamMap[session.team_id] || '');
  };

  const handleDuplicate = async (session) => {
    const { id, created_date, updated_date, ...rest } = session;
    const copy = await db.entities.Session.create({ ...rest, session_name: `${rest.session_name} (Copy)`, status: 'Planned', owner_id: user?.id, owner_user_email: user?.email });
    // Copy session drills
    const drills = await db.entities.SessionDrill.filter({ session_id: session.id });
    await Promise.all(drills.map(sd => {
      const { id: sdId, created_date: c, updated_date: u, ...sdRest } = sd;
      return db.entities.SessionDrill.create({ ...sdRest, session_id: copy.id });
    }));
    load();
  };

  // Reset pagination when filters change
  useEffect(() => { setPage(0); }, [search, statusFilter, typeFilter, sortOrder]);

  const teamMap = teams.reduce((acc, t) => { acc[t.id] = t.team_name; return acc; }, {});
  const today = new Date().toISOString().split('T')[0];

  const activeFilterCount = (statusFilter !== 'All' ? 1 : 0) + (typeFilter !== 'All' ? 1 : 0) + (sortOrder !== 'newest' ? 1 : 0);

  const filtered = sessions
    .filter(s => statusFilter === 'All' || s.status === statusFilter)
    .filter(s => typeFilter === 'All' || s.session_type === typeFilter)
    .filter(s => !search || s.session_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'oldest') return new Date(a.date) - new Date(b.date);
      if (sortOrder === 'upcoming') {
        const today2 = new Date().toISOString().split('T')[0];
        const aF = a.date >= today2, bF = b.date >= today2;
        if (aF !== bF) return aF ? -1 : 1;
        return new Date(a.date) - new Date(b.date);
      }
      return new Date(b.date) - new Date(a.date);
    });

  return (
    <div>
      <div className="px-4 pt-5 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Sessions</h1>
            <p className="text-sm text-slate-500">{activeTeam ? activeTeam.team_name : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}</p>
          </div>
          <button
            onClick={() => navigate('/sessions/new')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-200"
          >
            <Plus size={16} />
            New Session
          </button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sessions..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

      </div>

      <HelpBubble id="sessions" text="💡 Add goals to drills when building a session. Tracking targets vs results powers your player insights." />

      <div className="px-4 pb-3">
        <button onClick={() => setShowFilters(true)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${activeFilterCount > 0 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
          <Filter size={15} />
          Filters
          {activeFilterCount > 0 && <span className="bg-white text-blue-600 rounded-full text-xs font-black w-5 h-5 flex items-center justify-center">{activeFilterCount}</span>}
        </button>

      </div>

      <div className="px-4 pb-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-7 h-7 border-3 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <Calendar size={28} className="text-blue-400" />
            </div>
            <p className="font-semibold text-slate-700">{search ? 'No sessions match' : 'No sessions yet'}</p>
            <p className="text-sm text-slate-400 mt-1">Tap "New Session" to plan your first practice</p>
          </div>
        ) : (
          <>
            {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(session => (
              <SessionCard
                key={session.id}
                session={session}
                teamName={teamMap[session.team_id]}
                onEdit={s => navigate(`/sessions/${s.id}/edit`)}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onStart={s => navigate(`/sessions/${s.id}/live`)}
                onExport={handleExport}
                onViewSummary={s => setSummarySession(s)}
                canDelete={user?.role === 'admin' || session.owner_user_email === user?.email}
              />
            ))}
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPage={setPage} />
          </>
        )}
      </div>

      {showFilters && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowFilters(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Filters</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setStatusFilter('All'); setTypeFilter('All'); setSortOrder('newest'); }}
                  className="text-xs text-blue-600 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50">Reset</button>
                <button onClick={() => setShowFilters(false)} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      statusFilter === s ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>{s === 'All' ? 'All' : s}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Type</p>
              <div className="flex gap-2">
                {['All', 'Team', 'Private'].map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      typeFilter === t ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sort</p>
              <div className="flex gap-2">
                {[['newest','Newest'], ['oldest','Oldest'], ['upcoming','Upcoming']].map(([v, l]) => (
                  <button key={v} onClick={() => setSortOrder(v)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      sortOrder === v ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>{l}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setShowFilters(false)}
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm">
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {summarySession && (
        <SessionSummary
          session={summarySession}
          teamName={teamMap[summarySession.team_id]}
          onClose={() => setSummarySession(null)}
          onEdit={s => { setSummarySession(null); navigate(`/sessions/${s.id}/edit`); }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-900 text-lg">Delete Session?</h3>
              <p className="text-sm text-slate-500 mt-1">
                <span className="font-semibold text-slate-700">{deleteConfirm.session_name}</span> will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}