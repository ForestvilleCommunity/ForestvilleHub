import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/api/db';
import PlayerProfile from '@/components/players/PlayerProfile';

export default function PlayerDetail() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [player, setPlayer] = useState(null);
  const [team, setTeam] = useState(null);

  useEffect(() => {
    db.entities.Player.get(playerId)
      .then(async p => {
        setPlayer(p);
        if (p.team_id) {
          db.entities.Team.get(p.team_id).then(t => setTeam(t)).catch(() => {});
        }
      })
      .catch(() => navigate('/players', { replace: true }));
  }, [playerId]);

  if (!player) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <PlayerProfile
        player={player}
        teamName={team?.team_name}
        onClose={() => navigate('/players')}
      />
    </div>
  );
}