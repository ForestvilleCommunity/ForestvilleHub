import { useState, useEffect } from 'react';
import { Plus, Users, X, Check, Search, SlidersHorizontal, MoreHorizontal, FileDown, Settings, Wrench, Mail } from 'lucide-react';
import Pagination from './Pagination';
import { db } from '@/api/db';
import { INPUT, PlaceholderTab, Spinner, Field } from './shared';
import EmailComposeModal from './EmailComposeModal';
import { downloadCSV } from '@/lib/csvExport';
import OptionsMenu from './OptionsMenu';
import CustomReportModal from './CustomReportModal';
import CustomExportModal from './CustomExportModal';
import TeamProfile from './TeamProfile';
import MemberProfile from './MemberProfile';
import AdminSquadsTab from './AdminSquadsTab';
import AssignMemberModal from './AssignMemberModal';
import { getCurrentSeason } from '@/lib/season';

const getEmptyForm = () => {
  const season = getCurrentSeason();
  return { team_name: '', age_group: '', gender: '', program_type: '', season: season.name || '' };
};

function StatCard({ label, value, color = 'text-blue-700' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
      <p className={`text-3xl font-black ${color}`}>{value}</p>
      <p className="text-sm font-semibold text-slate-700 mt-0.5">{label}</p>
    </div>
  );
}

const TEAMS_SETTINGS_KEY = 'coachpad_teams_settings';
const TEAMS_SETTINGS_DEFAULT = { sortOrder: 'name_asc', perPage: 25, defaultSection: 'Teams' };
function loadTeamsSettings() { try { return { ...TEAMS_SETTINGS_DEFAULT, ...JSON.parse(localStorage.getItem(TEAMS_SETTINGS_KEY) || '{}') }; } catch { return TEAMS_SETTINGS_DEFAULT; } }
// Age method is shared with DevHub settings
const DEVHUB_SETTINGS_KEY_REF = 'coachpad_devhub_settings';
function loadAgeMethod() { try { return JSON.parse(localStorage.getItem(DEVHUB_SETTINGS_KEY_REF) || '{}').ageMethod || 'dec31'; } catch { return 'dec31'; } }
function saveAgeMethod(v) { try { const s = JSON.parse(localStorage.getItem(DEVHUB_SETTINGS_KEY_REF) || '{}'); localStorage.setItem(DEVHUB_SETTINGS_KEY_REF, JSON.stringify({ ...s, ageMethod: v })); } catch {} }

export default function AdminTeamsTab({ onProfileClick, resetTrigger, section: sectionProp, onSectionChange, triggerAdd, triggerAddSquad, triggerExport, triggerSettings, triggerEmail }) {
  const [localSection, setLocalSection] = useState('Teams');
  const section = sectionProp ?? localSection;
  const setSection = onSectionChange ?? setLocalSection;
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCustomExport, setShowCustomExport] = useState(false);
  const [settings, setSettings] = useState(loadTeamsSettings);
  const [draftSettings, setDraftSettings] = useState(settings);
  const [draftAgeMethod, setDraftAgeMethod] = useState(loadAgeMethod);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [access, setAccess] = useState([]);
  const [users, setUsers] = useState([]);
  const [trainingAllocs, setTrainingAllocs] = useState([]);
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [assignCoachModal, setAssignCoachModal] = useState(null);
  const [assignMemberModal, setAssignMemberModal] = useState(null);
  const [form, setForm] = useState(getEmptyForm);
  const [squadId, setSquadId] = useState('');
  const [newTeamCoachId, setNewTeamCoachId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showReport, setShowReport] = useState(null);
  const [selectedBulkTeamIds, setSelectedBulkTeamIds] = useState(new Set());
  const toggleBulkTeam = (id) => setSelectedBulkTeamIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [selectMode, setSelectMode] = useState(false);
  const exitSelectMode = () => { setSelectMode(false); setSelectedBulkTeamIds(new Set()); };
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [filterAgeGroup, setFilterAgeGroup] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterSquadId, setFilterSquadId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [emailModal, setEmailModal] = useState(null); // { targetType, targetIds, targetLabel } | null
  const PAGE_SIZE = settings.perPage;
  const [teamsPage, setTeamsPage] = useState(0);
  useEffect(() => { setTeamsPage(0); }, [teamSearch, filterAgeGroup, filterGender, filterSquadId, showArchived, settings.perPage]);

  useEffect(() => { if (resetTrigger) { setSection('Teams'); setSelectedTeam(null); setShowAdd(false); setEditModal(null); setFilterAgeGroup(''); setFilterGender(''); setFilterSquadId(''); load(); } }, [resetTrigger]);
  useEffect(() => { if (!triggerAdd) return; setForm(getEmptyForm()); setSquadId(''); setShowAdd(true); }, [triggerAdd]);
  const [triggerSquadAdd, setTriggerSquadAdd] = useState(0);
  useEffect(() => { if (!triggerAddSquad) return; setSection('Squads'); setTriggerSquadAdd(c => c + 1); }, [triggerAddSquad]);
  useEffect(() => { if (!triggerExport) return; setShowExport(true); }, [triggerExport]);
  useEffect(() => { if (!triggerSettings) return; setSelectedTeam(null); setDraftSettings(loadTeamsSettings()); setDraftAgeMethod(loadAgeMethod()); setShowSettings(true); }, [triggerSettings]);
  useEffect(() => { if (!triggerEmail) return; setEmailModal({ targetType: 'all', targetIds: [], targetLabel: 'All Members' }); }, [triggerEmail]);
  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [t, sq, u] = await Promise.all([
        db.entities.Team.filterAll({ visibility: 'Club' }, '-created_date'),
        db.entities.Squad.list('-created_date', 500).catch(() => []),
        db.entities.User.list('-created_date', 500).catch(() => []),
      ]);
      setTeams(t); setSquads(sq); setUsers(u);
      const [m, ch, a] = await Promise.all([
        db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date'),
        db.entities.ClubChallenge.list('-created_date', 100).catch(() => []),
        db.entities.UserTeamAccess.list('-created_date', 1000).catch(() => []),
      ]);
      setMembers(m); setChallenges(ch); setAccess(a);
      const ta = await db.entities.TrainingAllocation.list('-created_date', 500).catch(() => []);
      setTrainingAllocs(ta);
    } finally {
      setLoading(false);
    }
  };

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveTeam = async () => {
    if (!form.team_name.trim()) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const { squad_id, ...teamData } = form;
      const created = await db.entities.Team.create({ ...teamData, owner_user_email: me.email, owner_id: me.id, visibility: 'Club', status: 'Active' });
      if (squadId) {
        const sq = squads.find(s => s.id === squadId);
        if (sq) {
          const tids = (() => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } })();
          await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify([...tids, created.id]) });
        }
      }
      if (newTeamCoachId) {
        const coach = users.find(u => u.id === newTeamCoachId);
        if (coach) await db.entities.UserTeamAccess.create({ user_email: coach.email, team_id: created.id, role: 'Coach' }).catch(() => {});
      }
      setForm(getEmptyForm()); setSquadId(''); setNewTeamCoachId(''); setShowAdd(false); load();
    } catch (e) {
      alert('Error saving team: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateTeam = async () => {
    if (!form.team_name.trim() || !editModal) return;
    setSaving(true);
    try {
      await db.entities.Team.update(editModal.id, form);
      const allSq = await db.entities.Squad.list('-created_date', 200).catch(() => []);
      for (const sq of allSq) {
        const tids = (() => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } })();
        const has = tids.includes(editModal.id);
        if (has && sq.id !== squadId) await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify(tids.filter(id => id !== editModal.id)) });
        else if (!has && sq.id === squadId) await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify([...tids, editModal.id]) });
      }
      setEditModal(null); load();
    } catch (e) {
      alert('Error updating team: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const openTeamEdit = (team) => {
    const cSq = squads.find(sq => { try { return JSON.parse(sq.team_ids || '[]').includes(team.id); } catch { return false; } });
    setForm({ team_name: team.team_name, age_group: team.age_group || '', gender: team.gender || '', program_type: team.program_type || '', season: team.season || '' });
    setSquadId(cSq?.id || '');
    setEditModal(team);
  };

  const archiveTeam = async (team) => { await db.entities.Team.update(team.id, { status: 'Inactive' }); setDeleteConfirm(null); load(); };
  const unarchiveTeam = async (team) => { await db.entities.Team.update(team.id, { status: 'Active' }); load(); };
  const deleteTeam = async (team) => {
    const allSq = await db.entities.Squad.list('-created_date', 200).catch(() => []);
    for (const sq of allSq) {
      const tids = (() => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } })();
      if (tids.includes(team.id)) await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify(tids.filter(id => id !== team.id)) });
    }
    await Promise.all(access.filter(a => a.team_id === team.id).map(a => db.entities.UserTeamAccess.delete(a.id)));
    // Remove Player records and clear team_id from Members linked to this team
    const [teamPlayers, teamMembers] = await Promise.all([
      db.entities.Player.filter({ team_id: team.id }, '-created_date', 500).catch(() => []),
      db.entities.Member.filter({ team_id: team.id }, '-created_date', 500).catch(() => []),
    ]);
    await Promise.all([
      ...teamPlayers.map(p => db.entities.Player.delete(p.id).catch(() => {})),
      ...teamMembers.map(m => db.entities.Member.update(m.id, { team_id: null }).catch(() => {})),
    ]);
    await db.entities.Team.delete(team.id);
    setDeleteConfirm(null); load();
  };

  const assignCoach = async (teamId, userEmail) => {
    if (!access.some(a => a.team_id === teamId && a.user_email === userEmail)) {
      await db.entities.UserTeamAccess.create({ team_id: teamId, user_email: userEmail, role: 'coach', can_edit: true, assigned_by_admin: true });
      load();
    }
    setAssignCoachModal(null);
  };
  const removeCoach = async (accId) => { await db.entities.UserTeamAccess.delete(accId); load(); };

  const getMemberCount = (teamId) => members.filter(m => m.team_id === teamId && m.status !== 'Archived').length;
  const getTeamCoaches = (teamId) => access.filter(a => a.team_id === teamId).map(a => ({ ...a, ...users.find(u => u.email === a.user_email) }));
  const coaches = users.filter(u => u.role !== 'admin');

  const exportTeams = (list) => downloadCSV(list.map(t => ({ team_name: t.team_name, age_group: t.age_group || '', gender: t.gender || '', program_type: t.program_type || '', season: t.season || '', status: t.status || '', member_count: getMemberCount(t.id) })), 'teams.csv');

  const FEMALE_WORDS = /\b(girl|girls|woman|women|female|ladies|lady)\b/i;
  const autoAssignTeamGenders = async () => {
    const needsUpdate = teams.filter(t => !t.gender);
    if (needsUpdate.length === 0) { alert('All teams already have a gender assigned.'); return; }
    if (!window.confirm(`Auto-assign gender to ${needsUpdate.length} teams without one?\n\nTeams with "girl/girls/woman/women" in the name → Female. All others → Male.`)) return;
    await Promise.all(needsUpdate.map(t =>
      db.entities.Team.update(t.id, { gender: FEMALE_WORDS.test(t.team_name) ? 'Female' : 'Male' })
    ));
    load();
  };

  // Roster export — one row per member, with their team
  const exportRosters = (list) => {
    const rows = [];
    list.forEach(t => {
      const roster = members.filter(m => m.team_id === t.id && m.status !== 'Archived');
      if (roster.length === 0) { rows.push({ team: t.team_name, member: '', jersey: '', gender: '', date_of_birth: '' }); return; }
      roster.forEach(m => rows.push({
        team: t.team_name, member: m.name, jersey: m.jersey_number ?? '',
        gender: m.gender || '', date_of_birth: m.date_of_birth || '',
      }));
    });
    downloadCSV(rows, 'teams-with-rosters.csv');
  };

  // Squad exports (squads belong to this tab's Teams/Squads view)
  const squadTeamIds = (sq) => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } };
  const exportSquadList = () => downloadCSV((squads || []).map(sq => {
    const tids = squadTeamIds(sq);
    return {
      name: sq.name, age_group: sq.age_group || '', gender: sq.gender || '', season: sq.season || '',
      teams: tids.length,
      members: members.filter(m => tids.includes(m.team_id) && m.status !== 'Archived').length,
      coaches: new Set(access.filter(a => tids.includes(a.team_id)).map(a => a.user_email)).size,
      status: sq.status || '',
    };
  }), 'squads.csv');
  const exportSquadMembers = () => {
    const rows = [];
    (squads || []).forEach(sq => {
      const tids = squadTeamIds(sq);
      members.filter(m => tids.includes(m.team_id) && m.status !== 'Archived').forEach(m => rows.push({
        squad: sq.name, member: m.name, team: teams.find(t => t.id === m.team_id)?.team_name || '',
        jersey: m.jersey_number ?? '', gender: m.gender || '', date_of_birth: m.date_of_birth || '',
      }));
    });
    downloadCSV(rows.length ? rows : [{ squad: '', note: 'No members in any squad' }], 'squad-members.csv');
  };

  const runTeamsExport = (scope) => {
    switch (scope) {
      case 'active':        return exportTeams(teams.filter(t => t.status !== 'Inactive'));
      case 'rosters':       return exportRosters(teams);
      case 'squads':        return exportSquadList();
      case 'squad_members': return exportSquadMembers();
      case 'all':
      default:              return exportTeams(teams);
    }
  };

  // --- Team Profile view ---
  if (selectedTeam) {
    const teamCoaches = getTeamCoaches(selectedTeam.id).map(c => users.find(u => u.email === c.user_email)).filter(Boolean);
    return (
      <>
        <TeamProfile
          team={selectedTeam}
          members={members}
          coaches={teamCoaches}
          challenges={challenges}
          initialSquads={squads}
          initialUsers={users}
          initialAccess={access}
          onBack={() => setSelectedTeam(null)}
          onMemberClick={m => onProfileClick?.('member', m)}
          onCoachClick={c => onProfileClick?.('coach', c)}
          onSquadClick={sq => onProfileClick?.('squad', sq)}
          onAssignCoach={() => setAssignCoachModal(selectedTeam)}
          onEdit={() => { openTeamEdit(selectedTeam); setSelectedTeam(null); }}
          onArchive={() => { archiveTeam(selectedTeam); setSelectedTeam(null); }}
          onDelete={() => { setDeleteConfirm({ type: 'delete', team: selectedTeam }); setSelectedTeam(null); }}
          onAddMember={() => setAssignMemberModal(selectedTeam)}
          onOpenSettings={() => { setDraftSettings(loadTeamsSettings()); setShowSettings(true); }}
          onSaved={load}
        />
        {assignMemberModal && (
          <AssignMemberModal
            team={assignMemberModal}
            onClose={() => setAssignMemberModal(null)}
            onSaved={load}
          />
        )}
        {assignCoachModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setAssignCoachModal(null)}>
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm">Assign Coach — {assignCoachModal.team_name}</h3>
                <button onClick={() => setAssignCoachModal(null)} className="text-slate-400"><X size={16} /></button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {coaches.length === 0
                  ? <p className="text-sm text-slate-400 text-center py-4">No coaches registered yet.</p>
                  : coaches.map(u => {
                    const already = access.some(a => a.team_id === assignCoachModal.id && a.user_email === u.email);
                    return (
                      <button key={u.id} onClick={() => !already && assignCoach(assignCoachModal.id, u.email)} disabled={already}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${already ? 'border-green-200 bg-green-50 cursor-default' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                        <div className="font-semibold">{u.full_name || u.email}</div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                        {already && <div className="text-xs text-green-600 mt-0.5">✓ Already assigned</div>}
                      </button>
                    );
                  })}
              </div>
              <button onClick={() => setAssignCoachModal(null)} className="mt-4 w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-semibold">Close</button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (loading) return <Spinner />;

  const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const renderAddForm = () => (
    <div className="p-4 space-y-3 max-w-2xl mx-auto">
      <Field label="Team Name *">
        <input value={form.team_name} onChange={e => upd('team_name', e.target.value)} placeholder="e.g. U12 Boys" className={IC} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Age Group"><input value={form.age_group} onChange={e => upd('age_group', e.target.value)} placeholder="U12, U14…" className={IC} /></Field>
        <Field label="Gender">
          <select value={form.gender} onChange={e => upd('gender', e.target.value)} className={IC}>
            <option value="">—</option><option value="Male">Boys</option><option value="Female">Girls</option><option value="Mixed">Mixed</option>
          </select>
        </Field>
        <Field label="Season"><input value={form.season} onChange={e => upd('season', e.target.value)} placeholder="2025/26" className={IC} /></Field>
        <Field label="Competition">
          <select value={form.program_type} onChange={e => upd('program_type', e.target.value)} className={IC}>
            <option value="">—</option><option value="Club">Club</option><option value="Academy">Academy</option><option value="Domestic">Domestic</option><option value="District">District</option>
          </select>
        </Field>
      </div>
      {squads.length > 0 && (
        <Field label="Squad">
          <select value={squadId} onChange={e => setSquadId(e.target.value)} className={IC}>
            <option value="">No Squad</option>
            {squads.filter(s => s.status !== 'Archived').map(s => <option key={s.id} value={s.id}>{s.name}{s.age_group ? ` (${s.age_group})` : ''}</option>)}
          </select>
        </Field>
      )}
      {users.length > 0 && (
        <Field label="Assign Coach (optional)">
          <select value={newTeamCoachId} onChange={e => setNewTeamCoachId(e.target.value)} className={IC}>
            <option value="">— No coach —</option>
            {users.filter(u => u.role !== 'admin').map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
        </Field>
      )}
      <div className="flex gap-2 pb-8">
        <button onClick={saveTeam} disabled={saving || !form.team_name.trim()}
          className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Create Team'}
        </button>
        <button onClick={() => { setShowAdd(false); setForm(getEmptyForm()); }}
          className="px-4 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">

      {/* Section toggle */}
      <div className="flex shrink-0 border-b border-slate-200 bg-white">
        {['Teams', 'Squads'].map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors text-center ${section === s ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Teams section */}
      {section === 'Teams' && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {showAdd && (
            <div className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="bg-slate-50 rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between shrink-0">
                  <h2 className="font-bold text-slate-900">New Team</h2>
                  <button onClick={() => { setShowAdd(false); setForm(getEmptyForm()); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {renderAddForm()}
                </div>
              </div>
            </div>
          )}
          {(() => {
            const hasFilters = filterAgeGroup || filterGender || filterSquadId;
            const filteredTeams = teams.filter(t => {
              if (!showArchived && t.status === 'Inactive') return false;
              if (teamSearch && !t.team_name.toLowerCase().includes(teamSearch.toLowerCase())) return false;
              if (filterAgeGroup && t.age_group !== filterAgeGroup) return false;
              if (filterGender && t.gender !== filterGender) return false;
              if (filterSquadId) {
                const sq = squads.find(s => s.id === filterSquadId);
                if (!sq) return false;
                try { if (!JSON.parse(sq.team_ids || '[]').includes(t.id)) return false; } catch { return false; }
              }
              return true;
            });
            const archivedCount = teams.filter(t => t.status === 'Inactive').length;
            return (
              <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setShowMoreMenu(false)}>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Total Teams" value={teams.length} color="text-blue-700" />
                    <StatCard label="Total Squads" value={squads.length} color="text-indigo-700" />
                  </div>

                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="Search teams…"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setShowFilters(true)}
                      className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${hasFilters ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <SlidersHorizontal size={13} /> Filters
                      {hasFilters && <span className="bg-white text-blue-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-black">{[filterAgeGroup, filterGender, filterSquadId].filter(Boolean).length}</span>}
                    </button>
                    {archivedCount > 0 && (
                      <button onClick={() => setShowArchived(a => !a)}
                        className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${showArchived ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        {showArchived ? '✓ ' : ''}Archived ({archivedCount})
                      </button>
                    )}
                    <button onClick={() => { setSelectMode(s => !s); setSelectedBulkTeamIds(new Set()); }}
                      className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 ${selectMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      <Check size={14} /> Select
                    </button>
                    <span className="text-xs text-slate-400 ml-auto">{filteredTeams.length} team{filteredTeams.length !== 1 ? 's' : ''}</span>
                    <div className="relative">
                      <button onClick={e => { e.stopPropagation(); setShowMoreMenu(v => !v); }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                      {showMoreMenu && (
                        <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[180px]">
                          <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Export</p>
                          <button onClick={() => { exportTeams(teams); setShowMoreMenu(false); }}
                            className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                            <FileDown size={13} className="text-slate-400 shrink-0" /> Export Teams CSV
                          </button>
                          <button onClick={() => { setShowMoreMenu(false); setShowExport(false); setShowCustomExport(true); }}
                            className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                            <FileDown size={13} className="text-slate-400 shrink-0" /> Custom Export…
                          </button>
                          <div className="border-t border-slate-100 mt-1 pt-1">
                            {teams.some(t => !t.gender) && (
                              <button onClick={() => { autoAssignTeamGenders(); setShowMoreMenu(false); }}
                                className="w-full text-left px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 flex items-center gap-2">
                                ⚡ Auto-assign team genders
                              </button>
                            )}
                            <button onClick={() => { setEmailModal({ targetType: 'all', targetIds: [], targetLabel: 'All Members' }); setShowMoreMenu(false); }}
                              className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <Mail size={13} className="shrink-0" /> Email
                            </button>
                            <button onClick={() => { setDraftSettings(loadTeamsSettings()); setShowSettings(true); setShowMoreMenu(false); }}
                              className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <Settings size={13} className="shrink-0" /> Settings
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {filteredTeams.length === 0 ? (
                    <p className="text-center text-slate-400 py-12 text-sm">No teams found.</p>
                  ) : filteredTeams.slice(teamsPage * PAGE_SIZE, (teamsPage + 1) * PAGE_SIZE).map(team => {
                    const teamCoaches = getTeamCoaches(team.id);
                    const memberCount = getMemberCount(team.id);
                    const squadForTeam = squads.find(sq => { try { return JSON.parse(sq.team_ids || '[]').includes(team.id); } catch { return false; } });
                    const isArchived = team.status === 'Inactive';
                    const hasTraining = trainingAllocs.some(a => a.team_id === team.id || (squadForTeam && a.squad_id === squadForTeam.id));
                    return (
                      <div key={team.id}
                        onClick={() => selectMode ? setSelectedBulkTeamIds(prev => { const n = new Set(prev); n.has(team.id) ? n.delete(team.id) : n.add(team.id); return n; }) : setSelectedTeam(team)}
                        className={`rounded-2xl border p-4 cursor-pointer transition-all ${
                          isArchived
                            ? 'bg-slate-50 border-slate-200 opacity-70 hover:opacity-100 hover:border-slate-300'
                            : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                        } ${selectMode && selectedBulkTeamIds.has(team.id) ? 'border-blue-400 bg-blue-50' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          {selectMode && <input type="checkbox" checked={selectedBulkTeamIds.has(team.id)} onChange={e => { e.stopPropagation(); toggleBulkTeam(team.id); }} onClick={e => e.stopPropagation()} className="shrink-0 w-4 h-4 accent-blue-600 mt-1" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`font-bold ${isArchived ? 'text-slate-400' : 'text-slate-900'}`}>{team.team_name}</h3>
                              {isArchived && <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-semibold">Archived</span>}
                              {!isArchived && !hasTraining && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">⚠ No training</span>}
                              {team.age_group && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{team.age_group}</span>}
                              {team.gender && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{team.gender}</span>}
                              {team.program_type
                                ? <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{team.program_type}</span>
                                : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">⚠ No program type</span>}
                              {squadForTeam
                                ? <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{squadForTeam.name}</span>
                                : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">⚠ No squad</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1"><Users size={11} /> {memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                              {team.season && <span>{team.season}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                              <span className="text-xs text-slate-400 shrink-0">Coaches:</span>
                              {teamCoaches.length === 0
                                ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">⚠ No coach</span>
                                : teamCoaches.map(c => {
                                  const u = users.find(u => u.email === c.user_email);
                                  return (
                                    <span key={c.id} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-lg font-medium">
                                      {u?.full_name || c.user_email}
                                      <button onClick={e => { e.stopPropagation(); removeCoach(c.id); }} className="text-blue-300 hover:text-red-500 ml-0.5 font-bold leading-none">×</button>
                                    </span>
                                  );
                                })}
                            </div>
                          </div>
                          <OptionsMenu items={[
                            { label: 'Edit team', action: () => openTeamEdit(team) },
                            { label: 'Assign coach', action: () => setAssignCoachModal(team) },
                            { label: 'Email team', action: () => setEmailModal({ targetType: 'team', targetIds: [team.id], targetLabel: team.team_name }) },
                            { divider: true },
                            isArchived
                              ? { label: 'Unarchive team', action: () => unarchiveTeam(team) }
                              : { label: 'Archive team', action: () => setDeleteConfirm({ type: 'archive', team }) },
                            { label: 'Delete team', action: () => setDeleteConfirm({ type: 'delete', team }), danger: true },
                          ]} />
                        </div>
                      </div>
                    );
                  })}
                  <Pagination page={teamsPage} totalPages={Math.ceil(filteredTeams.length / PAGE_SIZE)} onPage={setTeamsPage} />
                </div>

                {/* Bulk bar */}
                {selectMode && (
                  <div className="shrink-0 bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
                    <span className="text-sm font-semibold flex-1">
                      {selectedBulkTeamIds.size > 0 ? `${selectedBulkTeamIds.size} team${selectedBulkTeamIds.size !== 1 ? 's' : ''} selected` : 'Tap teams to select'}
                    </span>
                    <div className="flex gap-1.5">
                      <button onClick={exitSelectMode} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl font-semibold">Cancel</button>
                      <button onClick={() => setEmailModal({ targetType: 'team', targetIds: [...selectedBulkTeamIds], targetLabel: `${selectedBulkTeamIds.size} team${selectedBulkTeamIds.size !== 1 ? 's' : ''}` })} disabled={selectedBulkTeamIds.size === 0} className="text-xs bg-white text-slate-900 font-bold hover:bg-slate-100 px-2.5 py-1.5 rounded-xl disabled:opacity-40 flex items-center gap-1"><Mail size={12} /> Email</button>
                      <button onClick={() => exportTeams(teams.filter(t => selectedBulkTeamIds.has(t.id)))} disabled={selectedBulkTeamIds.size === 0} className="text-xs bg-white text-slate-900 font-bold hover:bg-slate-100 px-2.5 py-1.5 rounded-xl disabled:opacity-40">Export CSV</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Filter drawer */}
          {showFilters && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={() => setShowFilters(false)}>
              <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">Filters</h2>
                  <button onClick={() => setShowFilters(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
                </div>
                <div className="px-5 py-4 space-y-4">
                  {[...new Set(teams.map(t => t.age_group).filter(Boolean))].sort().length > 0 && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Age Group</label>
                      <select value={filterAgeGroup} onChange={e => setFilterAgeGroup(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">All</option>
                        {[...new Set(teams.map(t => t.age_group).filter(Boolean))].sort().map(ag => (
                          <option key={ag} value={ag}>{ag}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Gender</label>
                    <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">All</option>
                      <option value="Male">Boys</option>
                      <option value="Female">Girls</option>
                      <option value="Mixed">Mixed</option>
                    </select>
                  </div>
                  {squads.length > 0 && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Squad</label>
                      <select value={filterSquadId} onChange={e => setFilterSquadId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">All Squads</option>
                        {squads.filter(s => s.status !== 'Archived').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="px-5 pb-6 flex gap-3">
                  {(filterAgeGroup || filterGender || filterSquadId) && (
                    <button onClick={() => { setFilterAgeGroup(''); setFilterGender(''); setFilterSquadId(''); setShowFilters(false); }}
                      className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Clear All</button>
                  )}
                  <button onClick={() => setShowFilters(false)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">Done</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Squads section — always mounted so triggerAdd only fires on actual change */}
      <div className={`flex-1 overflow-hidden ${section === 'Squads' ? '' : 'hidden'}`}>
        <AdminSquadsTab onProfileClick={onProfileClick} triggerAdd={triggerSquadAdd} />
      </div>

      {showReport && <CustomReportModal onClose={() => setShowReport(null)} />}

      {/* Delete/Archive confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 mb-2">{deleteConfirm.type === 'delete' ? 'Delete Team' : 'Archive Team'}</h3>
            <p className="text-sm text-slate-600 mb-4">{deleteConfirm.type === 'delete' ? `Permanently delete "${deleteConfirm.team.team_name}"?` : `Archive "${deleteConfirm.team.team_name}"?`}</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={() => deleteConfirm.type === 'delete' ? deleteTeam(deleteConfirm.team) : archiveTeam(deleteConfirm.team)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white ${deleteConfirm.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                {deleteConfirm.type === 'delete' ? 'Delete' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-2" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Edit Team</h3>
              <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <Field label="Team Name *"><input value={form.team_name} onChange={e => upd('team_name', e.target.value)} className={IC} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Age Group"><input value={form.age_group} onChange={e => upd('age_group', e.target.value)} className={IC} /></Field>
                <Field label="Gender">
                  <select value={form.gender} onChange={e => upd('gender', e.target.value)} className={IC}>
                    <option value="">—</option><option value="Male">Boys</option><option value="Female">Girls</option><option value="Mixed">Mixed</option>
                  </select>
                </Field>
                <Field label="Season"><input value={form.season} onChange={e => upd('season', e.target.value)} className={IC} /></Field>
                <Field label="Competition">
                  <select value={form.program_type} onChange={e => upd('program_type', e.target.value)} className={IC}>
                    <option value="">—</option><option value="Club">Club</option><option value="Academy">Academy</option><option value="Domestic">Domestic</option><option value="District">District</option>
                  </select>
                </Field>
              </div>
              {squads.length > 0 && (
                <Field label="Squad">
                  <select value={squadId} onChange={e => setSquadId(e.target.value)} className={IC}>
                    <option value="">No Squad</option>
                    {squads.filter(s => s.status !== 'Archived').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div className="flex gap-2 px-4 pb-4">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm">Cancel</button>
              <button onClick={updateTeam} disabled={saving || !form.team_name.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {saving ? 'Saving…' : 'Update Team'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign coach modal */}
      {assignCoachModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setAssignCoachModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm">Assign Coach — {assignCoachModal.team_name}</h3>
              <button onClick={() => setAssignCoachModal(null)} className="text-slate-400"><X size={16} /></button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {coaches.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4">No coaches registered yet.</p>
                : coaches.map(u => {
                  const already = access.some(a => a.team_id === assignCoachModal.id && a.user_email === u.email);
                  return (
                    <button key={u.id} onClick={() => !already && assignCoach(assignCoachModal.id, u.email)} disabled={already}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${already ? 'border-green-200 bg-green-50 cursor-default' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                      <div className="font-semibold">{u.full_name || u.email}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                      {already && <div className="text-xs text-green-600 mt-0.5">✓ Already assigned</div>}
                    </button>
                  );
                })}
            </div>
            <button onClick={() => setAssignCoachModal(null)} className="mt-4 w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-semibold">Close</button>
          </div>
        </div>
      )}

      {/* Add member modal (from team profile) */}
      {assignMemberModal && (
        <AssignMemberModal
          team={assignMemberModal}
          squads={squads}
          onClose={() => setAssignMemberModal(null)}
          onSaved={() => { setAssignMemberModal(null); load(); }}
        />
      )}

      {/* Export page overlay */}
      {showExport && (
        <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
            <button onClick={() => setShowExport(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            <h2 className="font-bold text-slate-900">Export Teams</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-2xl w-full mx-auto space-y-3">
            <p className="text-sm text-slate-500">Choose what to export. Files download as CSV.</p>
            <button onClick={() => { runTeamsExport('all'); setShowExport(false); }}
              className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
              <FileDown size={18} className="text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm">All teams</p>
                <p className="text-xs text-slate-400">Every team ({teams.length}) with member counts.</p>
              </div>
            </button>
            <button onClick={() => { setShowExport(false); setShowCustomExport(true); }}
              className="w-full text-left bg-white rounded-2xl border-2 border-dashed border-slate-300 p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
              <SlidersHorizontal size={18} className="text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm">Custom export…</p>
                <p className="text-xs text-slate-400">Pick exactly which columns to include.</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {showCustomExport && (
        <CustomExportModal
          title="Custom Team Export"
          fields={[
            { key: 'team_name', label: 'Team name' },
            { key: 'age_group', label: 'Age group' },
            { key: 'gender', label: 'Gender' },
            { key: 'program_type', label: 'Program type' },
            { key: 'season', label: 'Season' },
            { key: 'status', label: 'Status' },
            { key: 'member_count', label: 'Member count' },
          ]}
          rows={teams.map(t => ({
            team_id: t.id, team_name: t.team_name, age_group: t.age_group || '', gender: t.gender || '',
            program_type: t.program_type || '', season: t.season || '', status: t.status || '',
            member_count: getMemberCount(t.id),
          }))}
          filename="teams-custom.csv"
          rowLabelKey="team_name"
          rowFilterLabel="Teams"
          rowIdKey="team_id"
          squads={squads}
          onClose={() => setShowCustomExport(false)}
        />
      )}

      {/* Settings page overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-white z-20 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
            <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            <h2 className="font-bold text-slate-900">Teams Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-2xl w-full mx-auto">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Default sort order</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[['name_asc','Name A → Z'],['name_desc','Name Z → A'],['newest','Newest first'],['oldest','Oldest first']].map(([v,l]) => (
                  <button key={v} onClick={() => setDraftSettings(s => ({ ...s, sortOrder: v }))}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${draftSettings.sortOrder === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Teams per page</p>
              <div className="flex gap-2">
                {[25, 50, 100].map(n => (
                  <button key={n} onClick={() => setDraftSettings(s => ({ ...s, perPage: n }))}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${draftSettings.perPage === n ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Default view</p>
              <div className="flex gap-2">
                {['Teams', 'Squads'].map(v => (
                  <button key={v} onClick={() => setDraftSettings(s => ({ ...s, defaultSection: v }))}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${draftSettings.defaultSection === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="shrink-0 px-5 pb-6 pt-3 border-t border-slate-100 flex gap-2">
            <button onClick={() => setShowSettings(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
            <button onClick={() => {
              localStorage.setItem(TEAMS_SETTINGS_KEY, JSON.stringify(draftSettings));
              setSettings(draftSettings);
              saveAgeMethod(draftAgeMethod);
              setShowSettings(false);
            }} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
              Save Settings
            </button>
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