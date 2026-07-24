import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, Check, Users, CalendarPlus, Dumbbell, Trophy, Sparkles } from 'lucide-react';
import CreateTeamModal from './teams/CreateTeamModal';

const STEPS = [
  null, // 0 = welcome
  {
    step: 1, iconBg: 'bg-blue-100', icon: <Users size={28} className="text-blue-600" />,
    title: 'Create your first team',
    subtitle: 'Teams organise your players, sessions, games, and stats.',
    cta: 'Create Team', action: 'create_team',
  },
  {
    step: 2, iconBg: 'bg-purple-100', icon: <Users size={28} className="text-purple-600" />,
    title: 'Add your first player',
    subtitle: 'Players unlock private development tracking and progress insights.',
    cta: 'Add Player', action: 'navigate', to: '/players',
  },
  {
    step: 3, iconBg: 'bg-blue-100', icon: <CalendarPlus size={28} className="text-blue-600" />,
    title: 'Plan your first session',
    subtitle: 'Create a team session or a private development workout.',
    cta: 'Plan Session', action: 'navigate', to: '/sessions/new',
  },
  {
    step: 4, iconBg: 'bg-orange-100', icon: <Dumbbell size={28} className="text-orange-600" />,
    title: 'Explore the drill library',
    subtitle: 'Duplicate built-in drills and customise them for your coaching style.',
    cta: 'Open Drill Library', action: 'navigate', to: '/drills',
  },
  {
    step: 5, iconBg: 'bg-amber-100', icon: <Trophy size={28} className="text-amber-600" />,
    title: 'Track your first game',
    subtitle: 'Record live team stats and discover patterns that help you win.',
    cta: 'Start Game', action: 'navigate', to: '/games',
  },
];

export default function Onboarding({ user, onComplete, onSkip }) {
  const [screen, setScreen] = useState('welcome');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamCreated, setTeamCreated] = useState(false);
  const navigate = useNavigate();

  const progress = typeof screen === 'number' ? screen : screen === 'done' ? 5 : 0;
  const currentStep = typeof screen === 'number' && screen >= 1 ? STEPS[screen] : null;

  const handleAction = (step) => {
    if (step.action === 'create_team') {
      setShowCreateTeam(true);
    } else {
      navigate(step.to);
      onSkip();
    }
  };

  const handleTeamCreated = () => {
    setShowCreateTeam(false);
    setTeamCreated(true);
    setTimeout(() => setScreen(2), 500);
  };

  const next = () => {
    if (typeof screen === 'number' && screen < 5) setScreen(s => s + 1);
    else setScreen('done');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl">

          {/* Progress bar */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex gap-1.5">
              {[1,2,3,4,5].map(i => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= progress ? 'bg-blue-600 w-7' : 'bg-slate-200 w-4'
                }`} />
              ))}
            </div>
            <button onClick={onSkip} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>

          {/* Welcome */}
          {screen === 'welcome' && (
            <div className="px-6 pb-8 pt-2 text-center">
              <div className="text-5xl mb-5">👋</div>
              <h2 className="font-black text-2xl text-slate-900 mb-2">Welcome Coach</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-2">Let's get your coaching setup ready<br />in under 60 seconds.</p>
              <p className="text-xs text-slate-400 mb-7">Step 1 of 5</p>
              <button onClick={() => setScreen(1)}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base active:scale-95 transition-all shadow-lg shadow-blue-200">
                Start <ArrowRight size={18} />
              </button>
              <button onClick={onSkip} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 py-2 transition-colors">
                Skip for now
              </button>
            </div>
          )}

          {/* Steps 1–5 */}
          {currentStep && (
            <div className="px-6 pb-8 pt-2">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 ${currentStep.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                  {currentStep.icon}
                </div>
                <p className="text-xs font-semibold text-slate-400 mb-1.5">Step {currentStep.step} of 5</p>
                <h2 className="font-black text-xl text-slate-900 mb-2">{currentStep.title}</h2>
                <p className="text-slate-500 text-sm leading-relaxed">{currentStep.subtitle}</p>
              </div>

              {screen === 1 && teamCreated && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
                  <Check size={16} className="text-green-600 shrink-0" />
                  <p className="text-sm font-semibold text-green-700">Team created! Let's keep going.</p>
                </div>
              )}

              <button onClick={() => handleAction(currentStep)}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base active:scale-95 transition-all shadow-md shadow-blue-200">
                {currentStep.cta} <ArrowRight size={18} />
              </button>

              <div className="flex gap-2 mt-3">
                {typeof screen === 'number' && screen > 1 && (
                  <button onClick={() => setScreen(s => s - 1)}
                    className="flex-1 py-2.5 text-sm text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 font-medium transition-colors">
                    ← Back
                  </button>
                )}
                <button onClick={next}
                  className={`${typeof screen === 'number' && screen > 1 ? 'flex-1' : 'w-full'} py-2.5 text-sm text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 font-medium transition-colors`}>
                  Skip step →
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {screen === 'done' && (
            <div className="px-6 pb-8 pt-2 text-center">
              <div className="text-5xl mb-5">🏀</div>
              <h2 className="font-black text-2xl text-slate-900 mb-2">You're ready to coach</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">CoachPad gets smarter the more you coach.</p>
              <button onClick={onComplete}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-base active:scale-95 transition-all">
                <Sparkles size={18} /> Enter CoachPad
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreateTeam && (
        <CreateTeamModal onCreated={handleTeamCreated} onClose={() => setShowCreateTeam(false)} />
      )}
    </>
  );
}