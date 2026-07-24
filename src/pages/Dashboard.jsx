import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/api/db';
import Onboarding from '@/components/Onboarding';
import { getActiveTeam, subscribeActiveTeam } from '@/lib/activeTeam';
import { createDemoData } from '@/lib/createDemoData';
import WelcomeOverlay from '@/components/WelcomeOverlay';
import { getAccessiblePlayers, getAccessibleTeams } from '@/lib/teamAccess';
import { CalendarPlus, Dumbbell, Users, ChevronRight } from 'lucide-react';
import StatsPreview from '@/components/dashboard/StatsPreview';
import NextSessionCard from '@/components/dashboard/NextSessionCard';
import ChallengeCard from '@/components/challenges/ChallengeCard';

function parseJsonIds(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [activeTeam, setActiveTeamState] = useState(getActiveTeam());
  const [playerCount, setPlayerCount] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [teamChallenges, setTeamChallenges] = useState([]);
  const [challengeSquads, setChallengeSquads] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeActiveTeam((team) => setActiveTeamState(team));

    db.auth.me().then(async u => {
      setUser(u);
      // User-specific key so different accounts never share onboarding state
      const onboardingKey = `coachpad_onboarding_done_${u.email}`;
      if (!localStorage.getItem(onboardingKey)) {
        const teams = await getAccessibleTeams(u);
        if (teams.length === 0) {
          setShowOnboarding(true);
        } else {
          // Has teams but onboarding not marked — mark it done so we don't re-check every load
          localStorage.setItem(onboardingKey, '1');
        }
      }
      setCheckingSetup(false);
      // Load player count after setup check
      const currentActiveTeam = getActiveTeam();
      const players = await getAccessiblePlayers(u, currentActiveTeam?.id).catch(() => []);
      setPlayerCount(players.filter(p => p.status !== 'Inactive').length);

    }).catch(() => setCheckingSetup(false));

    return unsub;
  }, []);

  useEffect(() => {
    if (user && !checkingSetup) {
      getAccessiblePlayers(user, activeTeam?.id)
        .then(players => setPlayerCount(players.filter(p => p.status !== 'Inactive').length))
        .catch(() => setPlayerCount(0));
    }
  }, [activeTeam]);

  // Active club challenges targeted at this coach's current team — either
  // directly (target_teams) or via a squad the team belongs to (assigned_squad_ids).
  useEffect(() => {
    if (!activeTeam?.id) { setTeamChallenges([]); return; }
    Promise.all([
      db.entities.ClubChallenge.filter({ status: 'Active' }, '-created_date', 200).catch(() => []),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
    ]).then(([challenges, squads]) => {
      setChallengeSquads(squads);
      const relevant = challenges.filter(ch => {
        const teamIds = parseJsonIds(ch.target_teams);
        if (teamIds.length === 0 && parseJsonIds(ch.assigned_squad_ids).length === 0) return true; // unscoped = club-wide
        if (teamIds.includes(activeTeam.id)) return true;
        const squadIds = parseJsonIds(ch.assigned_squad_ids);
        return squads.some(sq => squadIds.includes(sq.id) && parseJsonIds(sq.team_ids).includes(activeTeam.id));
      });
      setTeamChallenges(relevant);
    });
  }, [activeTeam?.id]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.full_name?.split(' ')[0] || 'Coach';

  const dismissOnboarding = async (reload = false) => {
    if (user?.email) {
      // Create demo data once for new users
      const demoKey = `coachpad_demo_done_${user.email}`;
      if (!localStorage.getItem(demoKey)) {
        await createDemoData(user);
        localStorage.setItem(demoKey, '1');
        localStorage.setItem(`coachpad_onboarding_done_${user.email}`, '1');
        setShowOnboarding(false);
        setShowWelcome(true);
        return;
      }
      localStorage.setItem(`coachpad_onboarding_done_${user.email}`, '1');
    }
    setShowOnboarding(false);
    if (reload) window.location.reload();
  };

  // Show loading state while checking setup — never flash dashboard first
  if (checkingSetup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Setting up CoachPad…</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {showWelcome && (
        <WelcomeOverlay onClose={() => { setShowWelcome(false); window.location.reload(); }} />
      )}
      {showOnboarding && user && (
        <Onboarding
          user={user}
          onComplete={() => dismissOnboarding(true)}
          onSkip={() => dismissOnboarding(false)}
        />
      )}
      {/* Welcome */}
      <div>
        <p className="text-slate-500 text-sm">{greeting()},</p>
        <h1 className="text-2xl font-bold text-slate-900">{firstName} 👋</h1>
        {activeTeam && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-sm text-slate-500">{activeTeam.team_name}</span>
            {activeTeam.age_group && (
              <span className="text-sm text-slate-400">· {activeTeam.age_group}</span>
            )}
          </div>
        )}
      </div>

      {/* Quick stat */}
      {activeTeam && (
        <button
          onClick={() => navigate('/players')}
          className="w-full bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
            <Users size={22} className="text-blue-600" />
          </div>
          <div className="text-left flex-1">
            <p className="text-2xl font-bold text-slate-900">
              {playerCount === null ? '—' : playerCount}
            </p>
            <p className="text-sm text-slate-500">Players on roster</p>
          </div>
          <ChevronRight size={18} className="text-slate-300" />
        </button>
      )}

      {/* Active challenges targeted at this team */}
      {teamChallenges.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Club Challenge{teamChallenges.length !== 1 ? 's' : ''}
          </p>
          {teamChallenges.map(ch => (
            <ChallengeCard key={ch.id} challenge={ch} squads={challengeSquads} />
          ))}
        </div>
      )}

      <NextSessionCard />

      {/* Primary CTAs */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Actions</p>
        <button
          onClick={() => navigate('/sessions/new')}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all text-white rounded-2xl p-5 flex items-center gap-4 shadow-lg shadow-blue-200"
        >
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
            <CalendarPlus size={24} />
          </div>
          <div className="text-left">
            <p className="font-bold text-lg">New Session</p>
            <p className="text-blue-200 text-sm">Plan your next practice</p>
          </div>
        </button>
        <button
          onClick={() => navigate('/drills/new')}
          className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] transition-all text-white rounded-2xl p-5 flex items-center gap-4 shadow-lg shadow-orange-200"
        >
          <div className="w-12 h-12 bg-orange-400 rounded-xl flex items-center justify-center">
            <Dumbbell size={24} />
          </div>
          <div className="text-left">
            <p className="font-bold text-lg">New Drill</p>
            <p className="text-orange-100 text-sm">Add to your drill library</p>
          </div>
        </button>
      </div>



      <StatsPreview />

      {/* No team state */}
      {!activeTeam && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
          <p className="text-amber-800 font-medium text-sm">No active team selected</p>
          <p className="text-amber-600 text-xs mt-1">Use the team selector above to choose or create a team</p>
        </div>
      )}
    </div>
  );
}