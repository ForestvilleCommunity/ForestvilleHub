import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Calendar, Plus } from 'lucide-react';
import AddChallengeToSessionModal from './AddChallengeToSessionModal';

export default function ChallengeCard({ challenge, squads = [] }) {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);

  const daysLeft = challenge.end_date
    ? Math.max(0, Math.ceil((new Date(challenge.end_date + 'T23:59:59') - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  const targetLabel = challenge.target_value && challenge.goal_type
    ? `${challenge.target_value} ${challenge.goal_type}`
    : challenge.target_value
      ? challenge.target_value
      : challenge.target;

  const sqIds = (() => { try { return JSON.parse(challenge.assigned_squad_ids || '[]'); } catch { return []; } })();
  const directTeamIds = (() => { try { return JSON.parse(challenge.target_teams || '[]'); } catch { return []; } })();
  const squadNames = squads.filter(s => sqIds.includes(s.id)).map(s => s.name);
  const showSquadLabel = squadNames.length > 0 && directTeamIds.length === 0;

  return (
    <>
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-4 text-white shadow-lg shadow-blue-200">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
            <Trophy size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-0.5">
              {challenge.challenge_type || 'Club Challenge'}
            </p>
            <p className="font-bold text-white leading-tight">{challenge.title}</p>
            {targetLabel && (
              <p className="text-blue-200 text-xs mt-1">🎯 Target: <span className="font-semibold text-white">{targetLabel}</span></p>
            )}
            {showSquadLabel && (
              <p className="text-blue-200 text-xs mt-0.5">📋 Via: <span className="font-semibold text-white">{squadNames.join(', ')}</span></p>
            )}
          </div>
        </div>

        {challenge.description && (
          <p className="text-blue-100 text-xs leading-relaxed mb-3 pl-12 line-clamp-2">{challenge.description}</p>
        )}

        <div className="flex items-center justify-between pl-12 gap-2">
          {daysLeft !== null ? (
            <div className="flex items-center gap-1.5 text-xs text-blue-200 shrink-0">
              <Calendar size={11} />
              <span>{daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}</span>
            </div>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={() => navigate('/challenges')}
              className="text-xs font-semibold text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl transition-colors active:scale-95">
              View
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-colors active:scale-95">
              <Plus size={11} /> Add to Session
            </button>
          </div>
        </div>
      </div>

      {showAdd && (
        <AddChallengeToSessionModal challenge={challenge} onClose={() => setShowAdd(false)} />
      )}
    </>
  );
}