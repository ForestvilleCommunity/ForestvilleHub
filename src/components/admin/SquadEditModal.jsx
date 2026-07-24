import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '@/api/db';
import TrainingAllocationPanel from './TrainingAllocationPanel';

const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function SectionHeader({ title, open, toggle }) {
  return (
    <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">
      {title}
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
  );
}

export default function SquadEditModal({ squad, onSave, onClose }) {
  const [allTeams, setAllTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [access, setAccess] = useState([]);
  const [form, setForm] = useState({
    name: squad.name || '',
    age_group: squad.age_group || '',
    gender: squad.gender || '',
    season: squad.season || '',
    status: squad.status || 'Active',
    notes: squad.notes || '',
    description: squad.description || '',
  });
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(['Info']);

  useEffect(() => {
    Promise.all([
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000),
      db.entities.User.list('-created_date', 200),
      db.entities.UserTeamAccess.list('-created_date', 500),
    ]).then(([ts, us, acc]) => {
      setAllTeams(ts);
      setUsers(us.filter(u => u.role !== 'admin'));
      setAccess(acc);
    });
    try { setSelectedTeamIds(JSON.parse(squad.team_ids || '[]')); } catch { setSelectedTeamIds([]); }
  }, [squad.id]);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSection = (s) => setOpen(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const toggleTeam = (id) => setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const squadCoachEmails = [...new Set(access.filter(a => selectedTeamIds.includes(a.team_id)).map(a => a.user_email))];
  const squadCoaches = squadCoachEmails.map(e => users.find(u => u.email === e)).filter(Boolean);

  const visibleTeams = allTeams.filter(t =>
    !teamSearch || t.team_name?.toLowerCase().includes(teamSearch.toLowerCase()) ||
    t.age_group?.toLowerCase().includes(teamSearch.toLowerCase())
  );

  const save = async () => {
    setSaving(true);
    try {
      const { description: _desc, ...formRest } = form;
      await db.entities.Squad.update(squad.id, { ...formRest, team_ids: JSON.stringify(selectedTeamIds) });
      onSave?.();
    } catch (e) {
      alert('Error saving squad: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">Edit — {squad.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {/* Info */}
          <div>
            <SectionHeader title="Squad Information" open={open.includes('Info')} toggle={() => toggleSection('Info')} />
            {open.includes('Info') && (
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Squad Name *</label>
                  <input value={form.name} onChange={e => upd('name', e.target.value)} className={IC} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Description</label>
                  <textarea value={form.description} onChange={e => upd('description', e.target.value)} rows={2} className={IC + ' resize-none'} placeholder="Optional" />
                </div>
                <div className="grid grid-cols-2 gap-2">
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
            )}
          </div>

          {/* Assignments */}
          <div>
            <SectionHeader title="Assignments" open={open.includes('Assignments')} toggle={() => toggleSection('Assignments')} />
            {open.includes('Assignments') && (
              <div className="p-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500">Teams ({selectedTeamIds.length} selected)</p>
                  </div>
                  <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                    placeholder="Search teams…"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {visibleTeams.map(t => {
                      const sel = selectedTeamIds.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => toggleTeam(t.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-colors ${sel ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}>
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 text-xs font-bold ${sel ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>{sel ? '✓' : ''}</span>
                          <span className="font-semibold text-slate-800">{t.team_name}</span>
                          {t.age_group && <span className="text-xs text-slate-400">{t.age_group}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {squadCoaches.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Coaches (via teams)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {squadCoaches.map(c => (
                        <span key={c.id} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-xl font-medium">{c.full_name || c.email}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Training */}
          <div>
            <SectionHeader title="Training Allocations" open={open.includes('Training')} toggle={() => toggleSection('Training')} />
            {open.includes('Training') && (
              <div className="p-4">
                <TrainingAllocationPanel entityType="Squad" entityId={squad.id} entityName={squad.name} />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <SectionHeader title="Notes" open={open.includes('Notes')} toggle={() => toggleSection('Notes')} />
            {open.includes('Notes') && (
              <div className="p-4">
                <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} rows={4}
                  placeholder="Internal notes about this squad…"
                  className={IC + ' resize-none'} />
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 flex gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-indigo-700">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
