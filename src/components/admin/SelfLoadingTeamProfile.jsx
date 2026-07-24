/**
 * SelfLoadingTeamProfile
 * Loads its own data so ANY profile can navigate to the same TeamProfile
 * without needing parents to pass members/coaches/challenges.
 */
import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/api/db';
import TeamProfile from './TeamProfile';

export default function SelfLoadingTeamProfile({ team, onBack, onEdit, isAdmin = true }) {
  const [members, setMembers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team?.id) return;
    Promise.all([
      db.entities.Member.filter({ team_id: team.id }).catch(() => []),
      db.entities.UserTeamAccess.filter({ team_id: team.id }).catch(() => []),
      db.entities.User.list('-created_date', 200).catch(() => []),
      db.entities.ClubChallenge.list('-created_date', 100).catch(() => []),
    ]).then(([ms, acc, us, chs]) => {
      setMembers(ms);
      setCoaches(acc.map(a => us.find(u => u.email === a.user_email)).filter(Boolean));
      setChallenges(chs);
      setLoading(false);
    });
  }, [team?.id]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ArrowLeft size={18} />
          </button>
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
            {team?.team_name?.substring(0, 2).toUpperCase()}
          </div>
          <p className="font-bold text-slate-900">{team?.team_name}</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-7 h-7 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <TeamProfile
      team={team}
      members={members}
      coaches={coaches}
      challenges={challenges}
      onBack={onBack}
      onEdit={onEdit || (() => {})}
      isAdmin={isAdmin}
    />
  );
}