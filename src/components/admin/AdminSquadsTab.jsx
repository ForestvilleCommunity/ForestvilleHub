import { useState, useEffect } from 'react';
import { Plus, ArrowLeft, Users, Building2, BarChart2, X, Check, Search, Mail } from 'lucide-react';
import { db } from '@/api/db';
import { Spinner } from './shared';
import { downloadCSV } from '@/lib/csvExport';
import OptionsMenu from './OptionsMenu';
import SquadProfile from './SquadProfile';
import EmailComposeModal from './EmailComposeModal';

const EMPTY_FORM = { name: '', description: '', age_group: '', gender: '', season: '' };
const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function AdminSquadsTab({ onProfileClick, triggerAdd }) {
  const [showForm, setShowForm] = useState(false);
  const [squads, setSquads] = useState([]);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [access, setAccess] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSquad, setSelectedSquad] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [newSquadCoachId, setNewSquadCoachId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [squadSearch, setSquadSearch] = useState('');
  const [squadStatusFilter, setSquadStatusFilter] = useState('Active');
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [squadSearch]);
  useEffect(() => { if (!triggerAdd) return; setShowForm(true); }, [triggerAdd]);
  const [selectedBulkSquadIds, setSelectedBulkSquadIds] = useState(new Set());
  const toggleBulkSquad = (id) => setSelectedBulkSquadIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelectMode = () => { setSelectMode(false); setSelectedBulkSquadIds(new Set()); };
  const [emailModal, setEmailModal] = useState(null); // { targetType, targetIds, targetLabel } | null
  const [squadAttendance, setSquadAttendance] = useState([]);
  const [squadChallengeResults, setSquadChallengeResults] = useState([]);

  const [tSearch, setTSearch] = useState('');
  const [tAge, setTAge] = useState('');
  const [tGender, setTGender] = useState('');
  const [tProgram, setTProgram] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [sq, t, m, a, u] = await Promise.all([
        db.entities.Squad.list('-created_date', 500).catch(() => []),
        db.entities.Team.filterAll({ visibility: 'Club' }, '-created_date'),
        db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date'),
        db.entities.UserTeamAccess.list('-created_date', 1000).catch(() => []),
        db.entities.User.list('-created_date', 500).catch(() => []),
      ]);
      setSquads(sq); setTeams(t); setMembers(m); setAccess(a);
      setUsers(u.filter(x => x.role !== 'admin'));
    } finally {
      setLoading(false);
    }
  };

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTeam = (id) => setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Auto-name squad from selected teams when creating
  useEffect(() => {
    if (editing || selectedTeamIds.length === 0) return;
    const selected = teams.filter(t => selectedTeamIds.includes(t.id));
    const ageGroups = [...new Set(selected.map(t => t.age_group).filter(Boolean))];
    const genders = [...new Set(selected.map(t => t.gender).filter(Boolean))];
    const ag = ageGroups.length === 1 ? ageGroups[0] : '';
    const gMap = { Male: 'Boys', Female: 'Girls', Mixed: 'Mixed' };
    const gLabel = genders.length === 1 ? (gMap[genders[0]] || genders[0]) : '';
    const parts = [ag, gLabel, 'Squad'].filter(Boolean);
    const autoName = parts.join(' ');
    if (autoName && autoName !== 'Squad') {
      setForm(f => ({ ...f, name: autoName, age_group: ag || f.age_group, gender: genders[0] || f.gender }));
    }
  }, [selectedTeamIds, editing]);

  const getSquadTeamIds = (sq) => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } };
  const getTeamCount = (sq) => getSquadTeamIds(sq).length;
  const getMemberCount = (sq) => {
    const ids = getSquadTeamIds(sq);
    return members.filter(m => ids.includes(m.team_id) && m.status !== 'Archived').length;
  };
  useEffect(() => {
    if (!selectedSquad) return;
    const teamIds = getSquadTeamIds(selectedSquad);
    if (teamIds.length === 0) return;
    db.entities.AttendanceRecord.list('-date', 300).then(all =>
      setSquadAttendance(all.filter(r => teamIds.includes(r.team_id)))
    ).catch(() => {});
    db.entities.ChallengeResult.list('-created_date', 100).then(all =>
      setSquadChallengeResults(all.filter(r => teamIds.includes(r.team_id)))
    ).catch(() => {});
  }, [selectedSquad?.id]);

  const getCoachCount = (sq) => {
    const ids = getSquadTeamIds(sq);
    return new Set(access.filter(a => ids.includes(a.team_id)).map(a => a.user_email)).size;
  };

  const exportSquadList = (list) => {
    downloadCSV(list.map(sq => ({
      name: sq.name, age_group: sq.age_group || '', gender: sq.gender || '',
      season: sq.season || '', teams: getTeamCount(sq),
      members: getMemberCount(sq), coaches: getCoachCount(sq), status: sq.status || '',
    })), 'squad-list-export.csv');
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const { description: _desc, ...formRest } = form;
      const payload = { ...formRest, team_ids: JSON.stringify(selectedTeamIds), visibility: 'Club', owner_user_email: me.email };
      if (editing?.id) {
        await db.entities.Squad.update(editing.id, payload);
      } else {
        const created = await db.entities.Squad.create({ ...payload, status: 'Active' });
        if (newSquadCoachId && !editing) {
          const coach = users.find(u => u.id === newSquadCoachId);
          if (coach && created?.id) {
            for (const tid of selectedTeamIds) {
              await db.entities.UserTeamAccess.create({ user_email: coach.email, team_id: tid, role: 'Coach' }).catch(() => {});
            }
          }
        }
      }
      setEditing(null); setForm(EMPTY_FORM); setSelectedTeamIds([]); setNewSquadCoachId('');
      setShowForm(false);
      load();
    } catch (e) {
      alert('Error saving squad: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (sq) => {
    setEditing(sq);
    setForm({ name: sq.name||'', description: sq.description||'', age_group: sq.age_group||'', gender: sq.gender||'', season: sq.season||'' });
    try { setSelectedTeamIds(JSON.parse(sq.team_ids || '[]')); } catch { setSelectedTeamIds([]); }
    setShowForm(true);
  };

  const toggleStatus = async (sq) => {
    await db.entities.Squad.update(sq.id, { status: sq.status === 'Active' ? 'Archived' : 'Active' });
    load();
  };

  const deleteSquad = async (sq) => {
    await db.entities.Squad.delete(sq.id);
    setDeleteConfirm(null);
    if (selectedSquad?.id === sq.id) setSelectedSquad(null);
    load();
  };


  // ── Squad Profile ─────────────────────────────────────────────
  if (selectedSquad) {
    const squadTeamIds = getSquadTeamIds(selectedSquad);
    const squadTeams = teams.filter(t => squadTeamIds.includes(t.id));
    const squadMembers = members.filter(m => squadTeamIds.includes(m.team_id) && m.status !== 'Archived');
    const coachEmails = [...new Set(access.filter(a => squadTeamIds.includes(a.team_id)).map(a => a.user_email))];
    const squadCoaches = coachEmails.map(e => users.find(u => u.email === e)).filter(Boolean);

    return (
      <SquadProfile
        squad={selectedSquad}
        squadTeams={squadTeams}
        squadMembers={squadMembers}
        squadCoaches={squadCoaches}
        squadAttendance={squadAttendance}
        squadChallengeResults={squadChallengeResults}
        teams={teams}
        onBack={() => setSelectedSquad(null)}
        onEdit={() => { openEdit(selectedSquad); setSelectedSquad(null); }}
        onArchive={() => { toggleStatus(selectedSquad); setSelectedSquad(null); }}
        onDelete={() => setDeleteConfirm(selectedSquad)}
        onTeamClick={t => onProfileClick?.('team', t)}
        onMemberClick={m => onProfileClick?.('member', m)}
        onCoachClick={c => onProfileClick?.('coach', c)}
      />
    );
  }

  const renderForm = () => (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-500">Squad Name *</label>
              {!editing && selectedTeamIds.length > 0 && <span className="text-xs text-indigo-500">Auto-named from teams — edit to customise</span>}
            </div>
            <input className={IC} value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Select teams below to auto-name, or type manually" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-500 block mb-1">Description</label>
            <textarea className={IC} rows={2} value={form.description} onChange={e => upd('description', e.target.value)} placeholder="Optional description" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Age Group</label>
            <input className={IC} value={form.age_group} onChange={e => upd('age_group', e.target.value)} placeholder="U10, U12…" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Season</label>
            <input className={IC} value={form.season} onChange={e => upd('season', e.target.value)} placeholder="2025/26" />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">Assign Teams</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <input value={tSearch} onChange={e => setTSearch(e.target.value)} placeholder="Search teams…"
              className="flex-1 min-w-[160px] border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <select value={tAge} onChange={e => setTAge(e.target.value)}
              className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">All Ages</option>
              {[...new Set(teams.map(t => t.age_group).filter(Boolean))].sort().map(ag => <option key={ag} value={ag}>{ag}</option>)}
            </select>
            <select value={tGender} onChange={e => setTGender(e.target.value)}
              className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">All Genders</option>
              <option value="Male">Boys</option><option value="Female">Girls</option><option value="Mixed">Mixed</option>
            </select>
            <select value={tProgram} onChange={e => setTProgram(e.target.value)}
              className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">All Programs</option>
              {[...new Set(teams.map(t => t.program_type).filter(Boolean))].sort().map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {teams.length === 0
            ? <p className="text-sm text-slate-400 italic">No club teams available.</p>
            : <div className="flex flex-wrap gap-2">
              {teams.filter(t => {
                if (tSearch && !t.team_name?.toLowerCase().includes(tSearch.toLowerCase())) return false;
                if (tAge && t.age_group !== tAge) return false;
                if (tGender && t.gender !== tGender) return false;
                if (tProgram && t.program_type !== tProgram) return false;
                return true;
              }).map(t => (
                <button key={t.id} onClick={() => toggleTeam(t.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${selectedTeamIds.includes(t.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                  {t.team_name}{t.age_group ? ` (${t.age_group})` : ''}
                </button>
              ))}
            </div>}
          {selectedTeamIds.length > 0 && <p className="text-xs text-slate-500 mt-1.5">{selectedTeamIds.length} team{selectedTeamIds.length !== 1 ? 's' : ''} selected</p>}
        </div>

        {!editing && users.filter(u => u.role !== 'admin').length > 0 && (
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Assign Coach (optional)</label>
            <select value={newSquadCoachId} onChange={e => setNewSquadCoachId(e.target.value)}
              className={IC}>
              <option value="">— No coach —</option>
              {users.filter(u => u.role !== 'admin').map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex gap-3 pb-8">
        <button onClick={save} disabled={saving || !form.name.trim()}
          className="flex-1 bg-indigo-600 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 hover:bg-indigo-700">
          {saving ? 'Saving…' : editing ? 'Update Squad' : 'Create Squad'}
        </button>
        {editing && (
          <button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(false); }}
            className="px-6 py-3 border border-slate-200 rounded-xl text-sm text-slate-600">Cancel</button>
        )}
      </div>
    </div>
  );

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col h-full">
      {/* Header bar — standard search + select */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={squadSearch} onChange={e => setSquadSearch(e.target.value)} placeholder="Search squads…"
            className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setSelectMode(s => !s); setSelectedBulkSquadIds(new Set()); }}
          className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 ${selectMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          <Check size={14} /> Select
        </button>
      </div>

      {/* Squad list */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 max-w-4xl mx-auto">
          <div className="flex gap-2 flex-wrap">
            {['Active', 'Archived', 'All'].map(f => (
              <button key={f} onClick={() => setSquadStatusFilter(f)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${squadStatusFilter === f ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {f}
              </button>
            ))}
          </div>
          {squads.length === 0
            ? <p className="text-center text-slate-400 py-12 text-sm">No squads yet. Create a squad to group teams together.</p>
            : (() => {
              const filteredSquads = squads.filter(s => {
                if (squadStatusFilter !== 'All' && s.status !== squadStatusFilter) return false;
                if (squadSearch && !s.name.toLowerCase().includes(squadSearch.toLowerCase())) return false;
                return true;
              });
              return (<>
              {filteredSquads.map(sq => (
              <div key={sq.id}
                onClick={() => selectMode ? toggleBulkSquad(sq.id) : setSelectedSquad(sq)}
                className={`bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all ${selectMode && selectedBulkSquadIds.has(sq.id) ? 'border-indigo-400 bg-indigo-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  {selectMode && <input type="checkbox" checked={selectedBulkSquadIds.has(sq.id)}
                    onChange={e => { e.stopPropagation(); toggleBulkSquad(sq.id); }}
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 w-4 h-4 accent-indigo-600 mt-1" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sq.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{sq.status}</span>
                      {sq.age_group && <span className="text-xs text-slate-400">{sq.age_group}</span>}
                      {sq.season && <span className="text-xs text-slate-400">{sq.season}</span>}
                    </div>
                    <h3 className="font-bold text-slate-900">{sq.name}</h3>
                    {sq.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{sq.description}</p>}
                    <div className="flex gap-4 mt-2 text-xs text-slate-400">
                      <span>🏀 {getTeamCount(sq)} teams</span>
                      <span>👥 {getMemberCount(sq)} members</span>
                      <span>👤 {getCoachCount(sq)} coaches</span>
                    </div>
                  </div>
                  <OptionsMenu items={[
                    { label: 'Edit Squad', action: () => openEdit(sq) },
                    { label: sq.status === 'Active' ? 'Archive' : 'Activate', action: () => toggleStatus(sq) },
                    { divider: true },
                    { label: 'Delete Squad', action: () => setDeleteConfirm(sq), danger: true },
                  ]} />
                </div>
              </div>
            ))}
              </>);
            })()}
        </div>
      </div>

      {selectMode && (
        <div className="shrink-0 bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-semibold flex-1">
            {selectedBulkSquadIds.size > 0 ? `${selectedBulkSquadIds.size} squad${selectedBulkSquadIds.size !== 1 ? 's' : ''} selected` : 'Tap squads to select'}
          </span>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={exitSelectMode} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl font-semibold">Cancel</button>
            <button onClick={() => setEmailModal({ targetType: 'squad', targetIds: [...selectedBulkSquadIds], targetLabel: `${selectedBulkSquadIds.size} squad${selectedBulkSquadIds.size !== 1 ? 's' : ''}` })} disabled={selectedBulkSquadIds.size === 0} className="text-xs bg-white text-slate-900 font-bold hover:bg-slate-100 px-2.5 py-1.5 rounded-xl disabled:opacity-40 flex items-center gap-1"><Mail size={12} /> Email</button>
            <button onClick={() => exportSquadList(squads.filter(s => selectedBulkSquadIds.has(s.id)))} disabled={selectedBulkSquadIds.size === 0} className="text-xs bg-white text-slate-900 font-bold hover:bg-slate-100 px-2.5 py-1.5 rounded-xl disabled:opacity-40">Export CSV</button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 mb-2">Delete Squad</h3>
            <p className="text-sm text-slate-600 mb-1">Delete "<strong>{deleteConfirm.name}</strong>"?</p>
            <p className="text-xs text-slate-400 mb-5">Teams in this squad will NOT be deleted — only the squad grouping is removed.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={() => deleteSquad(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Squad form overlay */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-slate-50 rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-slate-900">{editing ? 'Edit Squad' : 'New Squad'}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderForm()}
            </div>
          </div>
        </div>
      )}

      {emailModal && (
        <EmailComposeModal
          audience="members"
          targetType={emailModal.targetType}
          targetIds={emailModal.targetIds}
          targetLabel={emailModal.targetLabel}
          onClose={() => setEmailModal(null)}
        />
      )}
    </div>
  );
}
