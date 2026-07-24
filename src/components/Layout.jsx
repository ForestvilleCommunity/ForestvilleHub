import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Users, Dumbbell, CalendarCheck, Trophy, LogOut, BarChart2, UserCircle, Trash2, ShieldAlert, Shield } from 'lucide-react';
import { toast } from 'sonner';
import HelpDrawer from './HelpDrawer';
import { db } from '@/api/db';
import TeamSelector from './TeamSelector';
import NotificationBell from './NotificationBell';
import { clearActiveTeam, initActiveTeamForUser } from '@/lib/activeTeam';

const navItems = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/players', label: 'Players', icon: Users },
  { path: '/sessions', label: 'Sessions', icon: CalendarCheck },
  { path: '/drills', label: 'Drills', icon: Dumbbell },
  { path: '/games', label: 'Games', icon: Trophy },
  { path: '/stats', label: 'Stats', icon: BarChart2 },
];

export default function Layout() {
  const location = useLocation();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    db.auth.me().then(u => {
      setCurrentUser(u);
      if (u?.email) initActiveTeamForUser(u.email);
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    clearActiveTeam();
    await db.auth.logout();
    // Only clear app-specific keys, not the Supabase session tokens
    Object.keys(localStorage)
      .filter(k => k.startsWith('coachpad_') || k.startsWith('base44_'))
      .forEach(k => localStorage.removeItem(k));
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    if (!currentUser || deleting) return;
    setDeleting(true);
    try {
      const email = currentUser.email;
      // Load all owned data in parallel
      const [teams, sessions, drills, games, favorites] = await Promise.all([
        db.entities.Team.filter({ owner_user_email: email }),
        db.entities.Session.filter({ owner_user_email: email }),
        db.entities.Drill.filter({ owner_user_email: email }),
        db.entities.Game.filter({ owner_user_email: email }),
        db.entities.DrillFavorite.filter({ user_email: email }),
      ]);
      // Fetch players + session-drills for every owned team/session in parallel, not one at a time
      const [playersByTeam, sessionDrillsBySession] = await Promise.all([
        Promise.all(teams.map(team => db.entities.Player.filter({ team_id: team.id }))),
        Promise.all(sessions.map(session => db.entities.SessionDrill.filter({ session_id: session.id }))),
      ]);
      const players = playersByTeam.flat();
      const sessionDrills = sessionDrillsBySession.flat();

      const results = await Promise.allSettled([
        ...players.map(p => db.entities.Player.delete(p.id)),
        ...sessionDrills.map(sd => db.entities.SessionDrill.delete(sd.id)),
        ...teams.map(t => db.entities.Team.delete(t.id)),
        ...sessions.map(s => db.entities.Session.delete(s.id)),
        ...drills.map(d => db.entities.Drill.delete(d.id)),
        ...games.map(g => db.entities.Game.delete(g.id)),
        ...favorites.map(f => db.entities.DrillFavorite.delete(f.id)),
      ]);
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        toast.error(`Couldn't fully delete your data (${failures.length} item${failures.length !== 1 ? 's' : ''} failed). Your account was NOT deleted — please try again or contact an admin.`);
        setDeleting(false);
        setDeleteConfirm(false);
        return;
      }
      // Delete user record
      await db.entities.User.delete(currentUser.id);
    } catch (e) {
      toast.error('Account deletion failed: ' + (e?.message || 'unknown error') + '. Please try again or contact an admin.');
      setDeleting(false);
      setDeleteConfirm(false);
      return;
    }
    clearActiveTeam();
    await db.auth.logout();
    Object.keys(localStorage)
      .filter(k => k.startsWith('coachpad_') || k.startsWith('base44_'))
      .forEach(k => localStorage.removeItem(k));
  };

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      {/* Sidebar — shown on md+ (tablet and desktop) */}
      <aside className="hidden md:flex flex-col w-56 bg-slate-950 text-white fixed left-0 top-0 bottom-0 z-40 shrink-0">
        <div className="px-5 py-5 border-b border-slate-800">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-white font-black text-xs">CP</span>
            </div>
            <span className="font-bold text-base tracking-tight">CoachPad</span>
          </Link>
        </div>
        <div className="px-3 py-3 border-b border-slate-800 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <TeamSelector />
          </div>
          <NotificationBell userId={currentUser?.id} />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link key={path} to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}>
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800 space-y-1">
          {currentUser?.role === 'admin' && (
            <Link to="/admin"
              className="flex items-center gap-2 px-3 py-2.5 w-full rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors">
              <ShieldAlert size={18} />
              Club Admin
            </Link>
          )}
          <Link to="/account"
            className="flex items-center gap-2 px-3 py-2.5 w-full rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors">
            <UserCircle size={18} />
            My Account
          </Link>
          {deleteConfirm ? (
            <div className="px-3 py-2 rounded-xl bg-red-900/30 border border-red-800">
              <p className="text-xs text-red-300 mb-2">{deleting ? 'Deleting all data...' : 'This permanently deletes your account and all data.'}</p>
              {!deleting && (
                <div className="flex gap-2">
                  <button onClick={handleDeleteAccount} className="flex-1 text-xs font-bold text-red-300 hover:text-red-100 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-900 transition-colors">Confirm</button>
                  <button onClick={() => setDeleteConfirm(false)} className="flex-1 text-xs font-bold text-slate-400 hover:text-white py-1.5 rounded-lg hover:bg-slate-700 transition-colors">Cancel</button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={handleDeleteAccount}
              className="flex items-center gap-2 px-3 py-2.5 w-full rounded-xl text-slate-500 hover:text-red-400 hover:bg-slate-800 text-sm font-medium transition-colors">
              <Trash2 size={18} />
              Delete Account
            </button>
          )}
          <button onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2.5 w-full rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors">
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content wrapper — h-screen + overflow-hidden prevents body scroll shake on mobile */}
      <div className="flex-1 md:ml-56 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header — hidden on md+ */}
        <header className="md:hidden bg-slate-900 text-white px-4 flex items-center justify-between shrink-0 z-40 shadow-lg" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xs">CP</span>
            </div>
            <span className="font-bold text-base tracking-tight">CoachPad</span>
          </Link>
          <div className="flex items-center gap-2">
            <TeamSelector />
            <NotificationBell userId={currentUser?.id} />
            <div className="relative">
              <button onClick={() => setShowAccountMenu(v => !v)}
                className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
                <UserCircle size={19} />
              </button>
              {showAccountMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 rounded-xl shadow-xl border border-slate-700 z-50 overflow-hidden">
                  {['admin', 'jdo', 'doc'].includes(currentUser?.role) && (
                    <Link to="/admin" onClick={() => setShowAccountMenu(false)}
                      className="flex items-center gap-2 w-full px-4 py-3 text-sm font-semibold text-blue-400 hover:bg-slate-700 hover:text-blue-300 transition-colors border-b border-slate-700">
                      <Shield size={15} /> Club Admin
                    </Link>
                  )}
                  <Link to="/account" onClick={() => setShowAccountMenu(false)}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                    <UserCircle size={15} /> My Account
                  </Link>
                  <button onClick={() => { setShowAccountMenu(false); handleLogout(); }}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors border-t border-slate-700">
                    <LogOut size={15} /> Logout
                  </button>
                  {deleteConfirm ? (
                    <div className="px-4 py-3 bg-red-900/40 border-t border-slate-700">
                      <p className="text-xs text-red-300 mb-2">Are you sure?</p>
                      <div className="flex gap-2">
                        <button onClick={() => { setShowAccountMenu(false); handleDeleteAccount(); }} className="flex-1 text-xs font-bold text-white bg-red-600 rounded-lg py-1.5">Delete</button>
                        <button onClick={() => setDeleteConfirm(false)} className="flex-1 text-xs font-bold text-slate-300 hover:text-white">No</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(true)}
                      className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-400 hover:bg-slate-700 transition-colors border-t border-slate-700">
                      <Trash2 size={15} /> Delete Account
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content — scrolls within the container, not the body */}
        <main className="flex-1 min-h-0 overflow-y-auto pb-24 md:pb-6 overflow-x-hidden">
          <div className="max-w-5xl mx-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ x: 14, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -14, opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Mobile Bottom Nav — hidden on md+ */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {navItems.filter(item => item.path !== '/').map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link key={path} to={path}
                className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-medium transition-colors ${
                  active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}>
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Help menu overlay */}
      <HelpDrawer />
    </div>
  );
}