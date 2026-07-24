import { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { db } from '@/api/db';
import { getAccessibleTeams } from '@/lib/teamAccess';
import CreateTeamModal from '@/components/teams/CreateTeamModal';

const POSITIONS = ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center', 'Guard', 'Forward', 'Utility'];
const INJURY_STATUSES = ['Healthy', 'Injured', 'Unavailable'];

export default function AddEditPlayerModal({ player, defaultTeamId, onSave, onClose }) {
  const [teams, setTeams] = useState([]);
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [form, setForm] = useState({
    name: player?.name || '',
    team_id: player?.team_id || defaultTeamId || '',
    jersey_number: player?.jersey_number || '',
    position: player?.position || '',
    date_of_birth: player?.date_of_birth || '',
    injury_status: player?.injury_status || 'Healthy',
    status: player?.status || 'Active',
  });

  useEffect(() => { loadTeams(); }, []);

  const loadTeams = async () => {
    const me = await db.auth.me();
    setUser(me);
    const result = await getAccessibleTeams(me);
    setTeams(result);
    if (!form.team_id && result.length) {
      // Default to first Private team if coach, otherwise first team
      const firstPrivate = result.find(t => t.visibility === 'Private');
      const defaultId = me.role !== 'admin' && firstPrivate ? firstPrivate.id : result[0].id;
      setForm(f => ({ ...f, team_id: f.team_id || defaultId }));
    }
  };

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const selectedTeam = teams.find(t => t.id === form.team_id);
  const isClubTeamSelected = selectedTeam?.visibility === 'Club';
  const isCoach = user?.role !== 'admin';
  const cannotAddToClub = isCoach && isClubTeamSelected;

  const handleSave = async () => {
    if (!form.name.trim() || !form.team_id || cannotAddToClub) return;
    setSaving(true);
    try {
      const me = user || await db.auth.me();
      const payload = {
        ...form,
        jersey_number: form.jersey_number ? Number(form.jersey_number) : undefined,
        date_of_birth: form.date_of_birth || undefined,
        owner_id: me.id,
      };
      if (player) {
        await db.entities.Player.update(player.id, payload);
      } else {
        await db.entities.Player.create(payload);
      }
      onSave();
    } catch (e) {
      alert('Error saving player: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-end justify-center sm:items-center">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl sm:rounded-t-2xl">
          <h2 className="font-bold text-lg text-slate-900">{player ? 'Edit Player' : 'Add Player'}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Team */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-slate-700">Team *</label>
              {isCoach && (
                <button type="button" onClick={() => setShowCreateTeam(true)}
                  className="text-xs text-blue-600 font-semibold hover:underline">+ Create new team</button>
              )}
            </div>
            <select value={form.team_id} onChange={e => set('team_id', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select a team</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.team_name}{t.age_group ? ` (${t.age_group})` : ''}</option>
              ))}
            </select>

            {cannotAddToClub && (
              <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-snug">
                  Players on Club teams are managed by your club admin. You can only add players to your own private teams.
                </p>
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Player Name *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* DOB */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date of Birth</label>
            <input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jersey #</label>
              <input type="number" value={form.jersey_number} onChange={e => set('jersey_number', e.target.value)}
                placeholder="00" min="0" max="99"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Position</label>
              <select value={form.position} onChange={e => set('position', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Position</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Injury Status</label>
              <select value={form.injury_status} onChange={e => set('injury_status', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {INJURY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.team_id || cannotAddToClub}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
            <Save size={18} />
            {saving ? 'Saving...' : player ? 'Save Changes' : 'Add Player'}
          </button>
        </div>
      </div>

      {showCreateTeam && (
        <CreateTeamModal
          onCreated={async (team) => {
            setShowCreateTeam(false);
            const me = user || await db.auth.me();
            const result = await getAccessibleTeams(me);
            setTeams(result);
            set('team_id', team.id);
          }}
          onClose={() => setShowCreateTeam(false)}
        />
      )}
    </div>
  );
}
