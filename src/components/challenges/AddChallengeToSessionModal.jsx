import { useState, useEffect } from 'react';
import { X, CalendarPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/api/db';

export default function AddChallengeToSessionModal({ challenge, onClose }) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [drills, setDrills] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await db.auth.me();
      // Merge direct teams + squad teams
      const directTeamIds = (() => { try { return JSON.parse(challenge.target_teams || '[]'); } catch { return []; } })();
      const squadIds = (() => { try { return JSON.parse(challenge.assigned_squad_ids || '[]'); } catch { return []; } })();
      let allMergedIds = [...directTeamIds];
      if (squadIds.length > 0) {
        const allSquads = await db.entities.Squad.list('-created_date', 200).catch(() => []);
        const squadTeamIds = allSquads
          .filter(sq => squadIds.includes(sq.id))
          .flatMap(sq => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } });
        allMergedIds = [...new Set([...allMergedIds, ...squadTeamIds])];
      }
      let idsToLoad = allMergedIds;
      if (me.role !== 'admin') {
        const accesses = await db.entities.UserTeamAccess.filter({ user_email: me.email }).catch(() => []);
        const coachTeamIds = accesses.map(a => a.team_id);
        idsToLoad = allMergedIds.filter(id => coachTeamIds.includes(id));
      }

      const loadedTeams = await Promise.all(idsToLoad.map(id => db.entities.Team.get(id).catch(() => null)));
      const validTeams = loadedTeams.filter(Boolean);
      setTeams(validTeams);
      if (validTeams.length > 0) setTeamId(validTeams[0].id);

      const drillIds = (() => { try { return JSON.parse(challenge.assigned_drill_ids || '[]'); } catch { return []; } })();
      const loadedDrills = await Promise.all(drillIds.map(id => db.entities.Drill.get(id).catch(() => null)));
      setDrills(loadedDrills.filter(Boolean));
      setLoading(false);
    };
    load();
  }, [challenge.id]);

  const handleCreate = async () => {
    if (!teamId || !date) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const session = await db.entities.Session.create({
        session_name: `Challenge – ${challenge.title}`,
        session_type: 'Team',
        team_id: teamId,
        date,
        status: 'Planned',
        owner_user_email: me.email,
        owner_id: me.id,
      });
      for (let i = 0; i < drills.length; i++) {
        const d = drills[i];
        await db.entities.SessionDrill.create({
          session_id: session.id,
          drill_id: d.id,
          challenge_id: challenge.id,
          goal_type: challenge.goal_type || null,
          goal_target: challenge.target_value || challenge.target || null,
          session_notes: challenge.target_notes || null,
          duration: challenge.challenge_duration_minutes ? Number(challenge.challenge_duration_minutes) : (d.duration_minutes || undefined),
          order: i + 1,
          status: 'Pending',
        });
      }
      onClose();
      navigate(`/sessions/${session.id}/live`);
    } catch (e) {
      alert('Error creating session: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const targetLabel = challenge.target_value
    ? `${challenge.target_value} ${challenge.goal_type || ''}`.trim()
    : challenge.target;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Add to Session</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{challenge.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Drills */}
            {drills.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3 border border-amber-100">
                No drills assigned to this challenge yet. Ask your admin to add drills.
              </p>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Drills ({drills.length})</p>
                <div className="space-y-1">
                  {drills.map(d => (
                    <div key={d.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-slate-400">⚙</span>
                      <span className="font-medium text-slate-800">{d.name}</span>
                      {d.theme && <span className="text-xs text-slate-400 ml-auto">{d.theme}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team selector */}
            {teams.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Team</label>
                <select value={teamId} onChange={e => setTeamId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                </select>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Session Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Target preview */}
            {targetLabel && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-blue-600 mb-0.5">🎯 Challenge Target</p>
                <p className="text-sm font-bold text-blue-900">{targetLabel}</p>
                {challenge.target_notes && <p className="text-xs text-blue-700 mt-0.5">{challenge.target_notes}</p>}
              </div>
            )}

            <button onClick={handleCreate} disabled={saving || drills.length === 0 || !teamId}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-50 transition-colors">
              <CalendarPlus size={16} />
              {saving ? 'Creating Session…' : 'Start Challenge Session'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}