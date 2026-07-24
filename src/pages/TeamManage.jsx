import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, UserCircle, Building2, FileText, Clock, Plus, X } from 'lucide-react';
import { db } from '@/api/db';
import TrainingAllocationPanel from '@/components/admin/TrainingAllocationPanel';

const TABS = ['Info', 'Coaches', 'Members', 'Training'];
const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function TeamManage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Info');
  const [team, setTeam] = useState(null);
  const [squads, setSquads] = useState([]);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [access, setAccess] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [squadId, setSquadId] = useState('');
  const [authorized, setAuthorized] = useState(false);

  // Admin-only management page — gate before loading any data.
  useEffect(() => {
    db.auth.me()
      .then(u => { if (u?.role !== 'admin') { navigate('/'); return; } setAuthorized(true); })
      .catch(() => navigate('/'));
  }, []);

  useEffect(() => { if (authorized) load(); }, [authorized, teamId]);

  const load = async () => {
    setLoading(true);
    const [ts, sqs, ms, acc, us] = await Promise.all([
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 200),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
      db.entities.Member.filter({ visibility: 'Club' }, '-created_date', 500),
      db.entities.UserTeamAccess.list('-created_date', 500),
      db.entities.User.list('-created_date', 200),
    ]);
    const found = ts.find(t => t.id === teamId);
    setTeam(found || null);
    setTeams(ts);
    setSquads(sqs);
    setMembers(ms);
    setAccess(acc);
    setUsers(us);
    if (found) {
      setForm({
        team_name: found.team_name || '',
        age_group: found.age_group || '',
        gender: found.gender || '',
        program_type: found.program_type || '',
        season: found.season || '',
        status: found.status || 'Active',
      });
      const sq = sqs.find(s => { try { return JSON.parse(s.team_ids||'[]').includes(teamId); } catch { return false; } });
      setSquadId(sq?.id || '');
    }
    setLoading(false);
  };

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveInfo = async () => {
    setSaving(true);
    try {
      const { notes: _notes, ...teamFields } = form;
      await db.entities.Team.update(teamId, teamFields);
      const allSq = await db.entities.Squad.list('-created_date', 200).catch(() => []);
      for (const sq of allSq) {
        const tids = (() => { try { return JSON.parse(sq.team_ids||'[]'); } catch { return []; } })();
        const has = tids.includes(teamId);
        if (has && sq.id !== squadId) {
          await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify(tids.filter(id => id !== teamId)) });
        } else if (!has && sq.id === squadId) {
          await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify([...tids, teamId]) });
        }
      }
      load();
    } catch (e) {
      alert('Error saving team: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const teamMembers = members.filter(m => m.team_id === teamId && m.status !== 'Archived');
  const teamCoaches = access.filter(a => a.team_id === teamId).map(a => users.find(u => u.email === a.user_email)).filter(Boolean);
  const availableCoaches = users.filter(u => u.role !== 'admin' && !access.some(a => a.team_id === teamId && a.user_email === u.email));

  const assignCoach = async (email) => {
    await db.entities.UserTeamAccess.create({ team_id: teamId, user_email: email, role: 'coach', can_edit: true, assigned_by_admin: true });
    load();
  };
  const removeCoach = async (accId) => { await db.entities.UserTeamAccess.delete(accId); load(); };

  if (loading) return (
    <div className="fixed inset-0 bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  if (!team) return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center gap-4">
      <p className="text-slate-500">Team not found.</p>
      <button onClick={() => navigate('/admin')} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">Back to Admin</button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col" style={{ zIndex: 100 }}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/admin')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
          {team.team_name?.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-slate-900 text-lg leading-tight">{team.team_name}</h1>
          <p className="text-xs text-slate-400">{[team.age_group, team.gender, team.season].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${team.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{team.status}</span>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 flex shrink-0 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 min-w-fit px-4 py-3 text-xs font-bold whitespace-nowrap transition-colors border-b-2 ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-4">

        {activeTab === 'Info' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Team Information</h3>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Team Name *</label>
                <input value={form.team_name} onChange={e => upd('team_name', e.target.value)} className={IC} placeholder="Team name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Age Group</label>
                  <input value={form.age_group} onChange={e => upd('age_group', e.target.value)} className={IC} placeholder="U12, U14…" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Gender</label>
                  <select value={form.gender} onChange={e => upd('gender', e.target.value)} className={IC}>
                    <option value="">—</option><option value="Male">Boys</option><option value="Female">Girls</option><option value="Mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Season</label>
                  <input value={form.season} onChange={e => upd('season', e.target.value)} className={IC} placeholder="2025/26" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Program Type</label>
                  <select value={form.program_type} onChange={e => upd('program_type', e.target.value)} className={IC}>
                    <option value="">—</option><option value="Club">Club</option><option value="Academy">Academy</option><option value="Domestic">Domestic</option><option value="District">District</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Status</label>
                  <select value={form.status} onChange={e => upd('status', e.target.value)} className={IC}>
                    <option value="Active">Active</option><option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Squad Assignment</h3>
              <select value={squadId} onChange={e => setSquadId(e.target.value)} className={IC}>
                <option value="">No Squad</option>
                {squads.filter(s => s.status !== 'Archived').map(s => <option key={s.id} value={s.id}>{s.name}{s.age_group ? ` (${s.age_group})` : ''}</option>)}
              </select>
            </div>

            <button onClick={saveInfo} disabled={saving || !form.team_name?.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-blue-700">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}

        {activeTab === 'Coaches' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Assigned Coaches ({teamCoaches.length})</h3>
              {teamCoaches.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No coaches assigned.</p>
              ) : teamCoaches.map(c => {
                const acc = access.find(a => a.team_id === teamId && a.user_email === c.email);
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                    <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs shrink-0">
                      {(c.full_name || c.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{c.full_name || '—'}</p>
                      <p className="text-xs text-slate-400">{c.email}</p>
                    </div>
                    <button onClick={() => acc && removeCoach(acc.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-1 hover:bg-red-50 rounded-lg">Remove</button>
                  </div>
                );
              })}
            </div>
            {availableCoaches.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Add Coach</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {availableCoaches.map(c => (
                    <button key={c.id} onClick={() => assignCoach(c.email)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors text-left">
                      <div className="w-8 h-8 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center font-black text-xs shrink-0">
                        {(c.full_name || c.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{c.full_name || '—'}</p>
                        <p className="text-xs text-slate-400">{c.email}</p>
                      </div>
                      <span className="ml-auto text-xs text-blue-600 font-semibold">Assign</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Members' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Members ({teamMembers.length})</h3>
            </div>
            {teamMembers.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No active members.</p>
            ) : teamMembers.map(m => (
              <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs shrink-0">
                  {m.jersey_number || m.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">{m.name}</p>
                  <p className="text-xs text-slate-400">{[m.position, m.gender].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'Training' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Training Allocations</h3>
            <TrainingAllocationPanel entityType="Team" entityId={teamId} entityName={team.team_name} />
          </div>
        )}

      </div>
    </div>
  );
}