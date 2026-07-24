import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '@/api/db';
import { getCurrentSeason } from '@/lib/season';
import TrainingAllocationPanel from './TrainingAllocationPanel';

const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const SECTIONS = ['Info', 'Assignments', 'Training', 'Notes'];

function SectionHeader({ title, open, toggle }) {
  return (
    <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">
      {title}
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
  );
}

export default function TeamEditModal({ team, onSave, onClose, onAddMember, initialSquads, initialUsers, initialAccess }) {
  const [squads, setSquads] = useState(initialSquads || []);
  const [users, setUsers] = useState(initialUsers || []);
  const [access, setAccess] = useState(initialAccess || []);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    team_name: team.team_name || '',
    age_group: team.age_group || '',
    gender: team.gender || '',
    program_type: team.program_type || '',
    season: team.season || getCurrentSeason().name || '',
    status: team.status || 'Active',
  });
  const [squadId, setSquadId] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(['Info', 'Assignments']);
  const [showAssignCoach, setShowAssignCoach] = useState(false);

  useEffect(() => {
    const fetches = [];
    if (!initialSquads) fetches.push(db.entities.Squad.list('-created_date', 200).catch(() => []));
    if (!initialUsers)  fetches.push(db.entities.User.list('-created_date', 200));
    if (!initialAccess) fetches.push(db.entities.UserTeamAccess.list('-created_date', 500));
    fetches.push(db.entities.Member.filter({ visibility: 'Club', team_id: team.id }, '-created_date', 200).catch(() => []));

    Promise.all(fetches).then(results => {
      let idx = 0;
      const sqs = initialSquads || results[idx++];
      const us  = initialUsers  || results[idx++];
      const acc = initialAccess || results[idx++];
      const ms  = results[idx];
      setSquads(sqs.filter(s => s.status !== 'Archived'));
      setUsers(us.filter(u => u.role !== 'admin'));
      setAccess(acc);
      setMembers(ms);
      const sq = sqs.find(s => { try { return JSON.parse(s.team_ids || '[]').includes(team.id); } catch { return false; } });
      setSquadId(sq?.id || '');
    });
  }, [team.id]);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSection = (s) => setOpen(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const teamCoaches = access.filter(a => a.team_id === team.id).map(a => users.find(u => u.email === a.user_email)).filter(Boolean);
  const availableCoaches = users.filter(u => !access.some(a => a.team_id === team.id && a.user_email === u.email));

  const assignCoach = async (email) => {
    const created = await db.entities.UserTeamAccess.create({ team_id: team.id, user_email: email, role: 'coach', can_edit: true, assigned_by_admin: true });
    setAccess(prev => [...prev, created]);
  };
  const removeCoach = async (accId) => {
    await db.entities.UserTeamAccess.delete(accId);
    setAccess(prev => prev.filter(a => a.id !== accId));
  };

  const save = async () => {
    if (!form.team_name.trim()) return alert('Team name is required.');
    const missing = [];
    if (!form.age_group.trim()) missing.push('Age Group');
    if (!form.program_type) missing.push('Competition type');
    if (missing.length > 0) {
      const go = window.confirm(
        `⚠️ Missing information\n\n${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set for this team.\n\nTeams without this information won't appear correctly in squads and reports.\n\nSave anyway?`
      );
      if (!go) return;
    }
    setSaving(true);
    try {
      const { notes: _notes, ...teamFields } = form;
      await db.entities.Team.update(team.id, teamFields);
      const allSq = await db.entities.Squad.list('-created_date', 200).catch(() => []);
      for (const sq of allSq) {
        const tids = (() => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } })();
        const has = tids.includes(team.id);
        if (has && sq.id !== squadId) {
          await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify(tids.filter(id => id !== team.id)) });
        } else if (!has && sq.id === squadId) {
          await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify([...tids, team.id]) });
        }
      }
      onSave?.();
    } catch (e) {
      alert('Error saving team: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">Edit — {team.team_name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X size={20} /></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {/* Info */}
          <div>
            <SectionHeader title="Team Information" open={open.includes('Info')} toggle={() => toggleSection('Info')} />
            {open.includes('Info') && (
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Team Name *</label>
                  <input value={form.team_name} onChange={e => upd('team_name', e.target.value)} className={IC} />
                </div>
                <div className="grid grid-cols-2 gap-2">
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
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Competition</label>
                    <select value={form.program_type} onChange={e => upd('program_type', e.target.value)} className={IC}>
                      <option value="">—</option><option value="Club">Club</option><option value="Academy">Academy</option><option value="Domestic">Domestic</option><option value="District">District</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Season</label>
                    <input value={form.season} onChange={e => upd('season', e.target.value)} className={IC} placeholder="2025/26" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Status</label>
                    <select value={form.status} onChange={e => upd('status', e.target.value)} className={IC}>
                      <option value="Active">Active</option><option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Assignments */}
          <div>
            <SectionHeader title="Assignments" open={open.includes('Assignments')} toggle={() => toggleSection('Assignments')} />
            {open.includes('Assignments') && (
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Squad</label>
                  <select value={squadId} onChange={e => setSquadId(e.target.value)} className={IC}>
                    <option value="">No Squad</option>
                    {squads.map(s => <option key={s.id} value={s.id}>{s.name}{s.age_group ? ` (${s.age_group})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500">Coaches ({teamCoaches.length})</p>
                    {availableCoaches.length > 0 && (
                      <button onClick={() => setShowAssignCoach(v => !v)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50">
                        {showAssignCoach ? 'Done' : '+ Assign'}
                      </button>
                    )}
                  </div>
                  {teamCoaches.length === 0 && !showAssignCoach && (
                    <p className="text-xs text-slate-400 italic py-1">No coaches assigned yet.</p>
                  )}
                  <div className="space-y-0">
                    {teamCoaches.map(c => {
                      const acc = access.find(a => a.team_id === team.id && a.user_email === c.email);
                      return (
                        <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{c.full_name || c.email}</p>
                            {c.full_name && <p className="text-xs text-slate-400">{c.email}</p>}
                          </div>
                          <button onClick={() => acc && removeCoach(acc.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 shrink-0">
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {showAssignCoach && availableCoaches.length > 0 && (
                    <div className="mt-2 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                      <p className="text-xs font-semibold text-slate-400 px-3 pt-2 pb-1 uppercase tracking-wider">Available Coaches</p>
                      {availableCoaches.map(c => (
                        <button key={c.id} onClick={() => { assignCoach(c.email); setShowAssignCoach(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-blue-50 border-t border-slate-100 first:border-0 transition-colors">
                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0">
                            {(c.full_name || c.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{c.full_name || c.email}</p>
                            {c.full_name && <p className="text-xs text-slate-400">{c.email}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-500">Members ({members.filter(m => m.status !== 'Archived').length} active)</p>
                    {onAddMember && <button onClick={onAddMember} className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50">+ Add</button>}
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {members.filter(m => m.status !== 'Archived').slice(0, 15).map(m => (
                      <div key={m.id} className="text-xs text-slate-600 py-1 border-b border-slate-100 last:border-0">
                        {m.jersey_number ? `#${m.jersey_number} ` : ''}{m.name}{m.position ? ` · ${m.position}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Training */}
          <div>
            <SectionHeader title="Training Allocations" open={open.includes('Training')} toggle={() => toggleSection('Training')} />
            {open.includes('Training') && (
              <div className="p-4">
                <TrainingAllocationPanel entityType="Team" entityId={team.id} entityName={team.team_name} />
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving || !form.team_name.trim()}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}