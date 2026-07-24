import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/api/db';
import DrillViewModal from '@/components/drills/DrillViewModal';

export default function DrillDetail() {
  const { drillId } = useParams();
  const navigate = useNavigate();
  const [drill, setDrill] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    Promise.all([
      db.entities.Drill.get(drillId),
      db.auth.me().catch(() => null),
    ]).then(([d, u]) => {
      setDrill(d);
      setUser(u);
    }).catch(() => navigate('/drills', { replace: true }));
  }, [drillId]);

  if (!drill) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <DrillViewModal
      drill={drill}
      currentUser={user}
      onClose={() => navigate('/drills')}
      onEdit={() => navigate(`/drills/${drillId}/edit`)}
    />
  );
}