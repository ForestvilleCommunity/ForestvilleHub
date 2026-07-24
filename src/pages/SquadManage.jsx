import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2 } from 'lucide-react';
import { db } from '@/api/db';
import TrainingAllocationPanel from '@/components/admin/TrainingAllocationPanel';

const TABS = ['Info', 'Teams', 'Training', 'Notes'];
const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function SquadManage() {
  const { squadId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Info');
  const [squad, setSquad] = useState(null);
  const [allTeams, setAllTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [access, setAccess] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [authorized, setAuthorized] = useState(false);

  // Admin-only management page — gate before loading any data.
  useEffect(() => {
    db.auth.me()
      .then(u => { if (u?.role !== 'admin') { navigate('/'); return; } setAuthorized(true); })
      .catch(() => navigate('/'));
  }, []);

  useEffect(() => { if (authorized) load(); }, [authorized, squadId]);

  const load = async () => {
    setLoading(true);
    const [sqs, ts, ms, acc, us] = await Promise.all([
      db.entities.Squad.list('-created_date', 200).catch(() => []),
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 200),
      db.entities.Member.filter({ visibility: 'Club' }, '-created_date', 500),
      db.entities.UserTeamAccess.list('-created_date', 500),
      db.entities.User.list('-created_date', 200),
    ]);
    const found = sqs.find(s => s.id === squadId);
    setSquad(found || null);
    setAllTeams(ts); setMembers(ms); setAccess(acc);
    setUsers(us.filter(u => u.role !== 'admin'));
    if (found) {
      setForm({
        name: found.name || '',
        description: found.description || '',
        age_group: found.age_group || '',
        gender: found.gender || '',
        season: found.season || '',
        status: found.status || 'Active',
        notes: found.notes || '',
      });
      try { setSelectedTeamIds(JSON.parse(found.team_ids || '[]')); } catch { setSelectedTeamIds([]); }
    }
    setLoading(false);
  };

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTeam = (id) => setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const saveInfo = async () => {
    setSaving(true);
    try {
      const { description: _desc, ...formRest } = form;
      await db.entities.Squad.update(squadId, { ...formRest, team_ids: JSON.stringify(selectedTeamIds) });
      load();
    } catch (e) {
      alert('Error saving squad: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const squadTeams = allTeams.filter(t => selectedTeamIds.includes(t.id));
  const squadMembers = members.filter(m => selectedTeamIds.includes(m.team_id) && m.status !== 'Archived');
  const coachEmails = [...new Set(access.filter(a => selectedTeamIds.includes(a.team_id)).map(a => a.user_email))];
  const squadCoaches = coachEmails.map(e => users.find(u => u.email === e)).filter(Boolean);

  const visibleTeams = allTeams.filter(t =>
    !teamSearch || t.team_name?.toLowerCase().includes(teamSearch.toLowerCase()) ||
    t.age_group?.toLowerCase().includes(teamSearch.toLowerCase())
  );

  if (loading) return (
    <div className="fixed inset-0 bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  if (!squad) return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center gap-4">
      <p className="text-slate-500">Squad not found.</p>
      <button onClick={() => navigate('/admin')} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold">Back to Admin</button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col" style={{ zIndex: 100 }}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/admin')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
          {squad.name?.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-slate-900 text-lg leading-tight">{squad.name}</h1>
          <p className="text-xs text-slate-400">{[squad.age_group, squad.gender, squad.season].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${squad.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{squad.status}</span>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 flex shrink-0 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 min-w-fit px-4 py-3 text-xs font-bold whitespace-nowrap transition-colors border-b-2 ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-4">

        {activeTab === 'Info' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Squad Information</h3>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Squad Name *</label>
                <input value={form.name} onChange={e => upd('name', e.target.value)} className={IC} placeholder="Squad name" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Description</label>
                <textarea value={form.description} onChange={e => upd('description', e.target.value)} rows={2} className={IC + ' resize-none'} placeholder="Optional description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Age Group</label>
                  <input value={form.age_group} onChange={e => upd('age_group', e.target.value)} className={IC} placeholder="U12, U14…" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Season</label>
                  <input value={form.season} onChange={e => upd('season', e.target.value)} className={IC} placeholder="2025/26" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Status</label>
                  <select value={form.status} onChange={e => upd('status', e.target.value)} className={IC}>
                    <option value="Active">Active</option><option value="Archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>
            <button onClick={saveInfo} disabled={saving || !form.name?.trim()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-indigo-700">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}

        {activeTab === 'Teams' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Assigned Teams ({squadTeams.length})
              </h3>
              <div className="flex items-center gap-2 mb-4">
                <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                  placeholder="Search teams…"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                {teamSearch && <button onClick={() => setTeamSearch('')} className="text-slate-400 hover:text-slate-700 text-sm px-2">×</button>}
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {visibleTeams.map(t => {
                  const selected = selectedTeamIds.includes(t.id);
                  return (
                    <button key={t.id} onClick={() => toggleTeam(t.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${selected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {selected && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm">{t.team_name}</p>
                        <p className="text-xs text-slate-400">{[t.age_group, t.gender].filter(Boolean).join(' · ')}</p>
                      </div>
                    </button>
                  );
                })}
                {visibleTeams.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No teams match.</p>}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">{selectedTeamIds.length} team{selectedTeamIds.length !== 1 ? 's' : ''} selected · {squadMembers.length} active members · {squadCoaches.length} coaches</p>
              </div>
            </div>
            <button onClick={saveInfo} disabled={saving}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-indigo-700">
              {saving ? 'Saving…' : 'Save Team Assignments'}
            </button>
          </div>
        )}

        {activeTab === 'Training' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Training Allocations</h3>
            <TrainingAllocationPanel entityType="Squad" entityId={squadId} entityName={squad.name} />
          </div>
        )}

        {activeTab === 'Notes' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Squad Notes</h3>
              <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} rows={6}
                placeholder="Internal notes about this squad…" className={IC + ' resize-none'} />
            </div>
            <button onClick={saveInfo} disabled={saving}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-indigo-700">
              {saving ? 'Saving…' : 'Save Notes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}