import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Building2, Users, UserCircle, Trophy, BarChart2, CalendarDays, Brain, Menu, X, SlidersHorizontal, Layers, BookOpen, Plus, ChevronDown, ChevronUp, Download, Upload, Mail, Settings2, RefreshCw } from 'lucide-react';
import SeasonRolloverModal from '@/components/admin/SeasonRolloverModal';
import { getCurrentSeason, subscribeSeasonChange } from '@/lib/season.js';
import { db } from '@/api/db';
import ErrorBoundary from '@/components/ErrorBoundary';
import AdminMembersTab from '@/components/admin/AdminMembersTab';
import AdminTeamsTab from '@/components/admin/AdminTeamsTab';
import AdminCoachesTab from '@/components/admin/AdminCoachesTab';
import AdminSquadsTab from '@/components/admin/AdminSquadsTab';
import AdminProfilePanel from '@/components/admin/AdminProfilePanel';
import AdminOverviewTab from '@/components/admin/AdminOverviewTab';
import AdminTrainingTab from '@/components/admin/AdminTrainingTab';
import AdminDevelopmentHubTab from '@/components/admin/AdminDevelopmentHubTab';
import AdminDrillsTab from '@/components/admin/AdminDrillsTab';
import AdminChallengesTab from '@/components/admin/AdminChallengesTab';

const ADMIN_TABS = [
  { id: 'overview',     label: 'Overview',         icon: BarChart2,    roles: ['admin'],              section: 'ORGANIZATION' },
  { id: 'members',      label: 'Members',          icon: Users,        roles: ['admin'],              section: 'ORGANIZATION' },
  { id: 'teams',        label: 'Teams',            icon: Building2,    roles: ['admin'],              section: 'ORGANIZATION' },
  { id: 'coaches',      label: 'Coaches',          icon: UserCircle,   roles: ['admin'],              section: 'ORGANIZATION' },
  { id: 'training',     label: 'Schedule',         icon: CalendarDays, roles: ['admin'],              section: 'ORGANIZATION' },
  { id: 'development',  label: 'Development Hub',  icon: Brain,        roles: ['admin', 'jdo', 'doc'], section: 'DEVELOPMENT' },
  { id: 'library',      label: 'Library',          icon: BookOpen,     roles: ['admin', 'jdo', 'doc'], section: 'DEVELOPMENT' },
  { id: 'challenges',   label: 'Challenges',       icon: Trophy,       roles: ['admin'],              section: 'ENGAGEMENT' },
];

const ALLOWED_ROLES = ['admin', 'jdo', 'doc'];

const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function AddTeamSquadModal({ onClose, onSaved }) {
  const [mode, setMode] = useState('team');
  const [teams, setTeams] = useState([]);
  const [squads, setSquads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [teamForm, setTeamForm] = useState({ team_name: '', age_group: '', gender: '', program_type: '', season: '' });
  const [teamSquadId, setTeamSquadId] = useState('');
  const [teamCoachId, setTeamCoachId] = useState('');
  const [squadForm, setSquadForm] = useState({ name: '', description: '', age_group: '', season: '' });
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [squadCoachId, setSquadCoachId] = useState('');
  const [tSearch, setTSearch] = useState('');
  const [tGender, setTGender] = useState('');
  const [tProgram, setTProgram] = useState('');
  const [saving, setSaving] = useState(false);
  const updT = (k, v) => setTeamForm(f => ({ ...f, [k]: v }));
  const updS = (k, v) => setSquadForm(f => ({ ...f, [k]: v }));
  const toggleTeam = (id) => setSelectedTeamIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // Auto-name squad from selected teams
  useEffect(() => {
    if (selectedTeamIds.length === 0) return;
    const selected = teams.filter(t => selectedTeamIds.includes(t.id));
    const ageGroups = [...new Set(selected.map(t => t.age_group).filter(Boolean))];
    const genders = [...new Set(selected.map(t => t.gender).filter(Boolean))];
    const ag = ageGroups.length === 1 ? ageGroups[0] : '';
    const gMap = { Male: 'Boys', Female: 'Girls', Mixed: 'Mixed' };
    const gLabel = genders.length === 1 ? (gMap[genders[0]] || genders[0]) : '';
    const parts = [ag, gLabel, 'Squad'].filter(Boolean);
    const autoName = parts.join(' ');
    if (autoName && autoName !== 'Squad') {
      setSquadForm(f => ({ ...f, name: autoName, age_group: ag || f.age_group }));
    }
  }, [selectedTeamIds]);

  useEffect(() => {
    Promise.all([
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 200),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
      db.entities.User.list('-created_date', 200),
    ]).then(([t, sq, u]) => {
      setTeams(t);
      setSquads(sq.filter(s => s.status !== 'Archived'));
      setUsers(u.filter(x => x.role !== 'admin'));
      setLoadingData(false);
    });
  }, []);

  const saveTeam = async () => {
    if (!teamForm.team_name.trim()) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const created = await db.entities.Team.create({ ...teamForm, owner_user_email: me.email, owner_id: me.id, visibility: 'Club', status: 'Active' });
      if (teamSquadId) {
        const sq = squads.find(s => s.id === teamSquadId);
        if (sq) { const ids = (() => { try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; } })(); await db.entities.Squad.update(sq.id, { team_ids: JSON.stringify([...ids, created.id]) }); }
      }
      let coachAssignFailed = false;
      if (teamCoachId) {
        const c = users.find(u => u.id === teamCoachId);
        if (c) await db.entities.UserTeamAccess.create({ user_email: c.email, team_id: created.id, role: 'Coach' }).catch(() => { coachAssignFailed = true; });
      }
      onSaved();
      if (coachAssignFailed) alert('Team created, but assigning the coach failed — assign them manually from the team profile.');
    } catch (e) { alert('Error: ' + e.message); } finally { setSaving(false); }
  };

  const saveSquad = async () => {
    if (!squadForm.name.trim()) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const created = await db.entities.Squad.create({ ...squadForm, team_ids: JSON.stringify(selectedTeamIds), visibility: 'Club', owner_user_email: me.email, status: 'Active' });
      let coachAssignFailures = 0;
      if (squadCoachId && selectedTeamIds.length > 0) {
        const c = users.find(u => u.id === squadCoachId);
        if (c) for (const tid of selectedTeamIds) await db.entities.UserTeamAccess.create({ user_email: c.email, team_id: tid, role: 'Coach' }).catch(() => { coachAssignFailures++; });
      }
      onSaved();
      if (coachAssignFailures > 0) alert(`Squad created, but assigning the coach to ${coachAssignFailures} team${coachAssignFailures !== 1 ? 's' : ''} failed — assign them manually.`);
    } catch (e) { alert('Error: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900 text-lg">Add to Teams</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>
        <div className="px-5 pt-3 shrink-0">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {[['team', 'Team'], ['squad', 'Squad']].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loadingData ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>
          ) : mode === 'team' ? (<>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">Team Name *</label><input value={teamForm.team_name} onChange={e => updT('team_name', e.target.value)} placeholder="e.g. U12 Boys" className={IC} autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Age Group</label><input value={teamForm.age_group} onChange={e => updT('age_group', e.target.value)} placeholder="U12, U14…" className={IC} /></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Gender</label><select value={teamForm.gender} onChange={e => updT('gender', e.target.value)} className={IC}><option value="">—</option><option value="Male">Boys</option><option value="Female">Girls</option><option value="Mixed">Mixed</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Season</label><input value={teamForm.season} onChange={e => updT('season', e.target.value)} placeholder="2025/26" className={IC} /></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Program</label><select value={teamForm.program_type} onChange={e => updT('program_type', e.target.value)} className={IC}><option value="">—</option><option value="Club">Club</option><option value="Academy">Academy</option><option value="Domestic">Domestic</option><option value="District">District</option></select></div>
            </div>
            {squads.length > 0 && <div><label className="block text-xs font-semibold text-slate-600 mb-1">Squad (optional)</label><select value={teamSquadId} onChange={e => setTeamSquadId(e.target.value)} className={IC}><option value="">No Squad</option>{squads.map(s => <option key={s.id} value={s.id}>{s.name}{s.age_group ? ` (${s.age_group})` : ''}</option>)}</select></div>}
            {users.length > 0 && <div><label className="block text-xs font-semibold text-slate-600 mb-1">Coach (optional)</label><select value={teamCoachId} onChange={e => setTeamCoachId(e.target.value)} className={IC}><option value="">— No coach —</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select></div>}
          </>) : (<>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">Squad Name *</label><input value={squadForm.name} onChange={e => updS('name', e.target.value)} placeholder="e.g. U10 Squad" className={IC} autoFocus /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">Description</label><textarea value={squadForm.description} onChange={e => updS('description', e.target.value)} rows={2} placeholder="Optional description" className={IC} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Age Group</label><input value={squadForm.age_group} onChange={e => updS('age_group', e.target.value)} placeholder="U10, U12…" className={IC} /></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Season</label><input value={squadForm.season} onChange={e => updS('season', e.target.value)} placeholder="2025/26" className={IC} /></div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Assign Teams (optional)</p>
              <div className="flex flex-wrap gap-2 mb-2">
                <input value={tSearch} onChange={e => setTSearch(e.target.value)} placeholder="Search teams…" className="flex-1 min-w-[120px] border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <select value={tGender} onChange={e => setTGender(e.target.value)} className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="">All Genders</option><option value="Male">Boys</option><option value="Female">Girls</option><option value="Mixed">Mixed</option></select>
                <select value={tProgram} onChange={e => setTProgram(e.target.value)} className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="">All Programs</option>{[...new Set(teams.map(t => t.program_type).filter(Boolean))].sort().map(p => <option key={p}>{p}</option>)}</select>
              </div>
              <div className="flex flex-wrap gap-2">
                {teams.filter(t => (!tSearch || t.team_name?.toLowerCase().includes(tSearch.toLowerCase())) && (!tGender || t.gender === tGender) && (!tProgram || t.program_type === tProgram)).map(t => (
                  <button key={t.id} onClick={() => toggleTeam(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${selectedTeamIds.includes(t.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                    {t.team_name}
                  </button>
                ))}
              </div>
              {selectedTeamIds.length > 0 && <p className="text-xs text-slate-500 mt-1.5">{selectedTeamIds.length} team{selectedTeamIds.length !== 1 ? 's' : ''} selected</p>}
            </div>
            {users.length > 0 && <div><label className="block text-xs font-semibold text-slate-600 mb-1">Coach (optional)</label><select value={squadCoachId} onChange={e => setSquadCoachId(e.target.value)} className={IC}><option value="">— No coach —</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select></div>}
          </>)}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <button onClick={mode === 'team' ? saveTeam : saveSquad}
            disabled={saving || (mode === 'team' ? !teamForm.team_name.trim() : !squadForm.name.trim())}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : mode === 'team' ? 'Create Team' : 'Create Squad'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('admin');
  const [profileStack, setProfileStack] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [adminFilterOpen, setAdminFilterOpen] = useState(false);
  const [resetCounters, setResetCounters] = useState({});

  // Sub-nav state — lifted so sidebar can control each tab's section/actions
  const [teamsSection, setTeamsSection] = useState('Teams');
  const [triggerTeamsAdd, setTriggerTeamsAdd] = useState(0);
  const [triggerTeamsAddSquad, setTriggerTeamsAddSquad] = useState(0);
  const [showTeamsAddPicker, setShowTeamsAddPicker] = useState(false);
  const [triggerMembersAdd, setTriggerMembersAdd] = useState(0);
  const [triggerMembersImport, setTriggerMembersImport] = useState(0);
  const [triggerCoachesAdd, setTriggerCoachesAdd] = useState(0);
  const [triggerTeamsExport, setTriggerTeamsExport] = useState(0);
  const [triggerMembersExport, setTriggerMembersExport] = useState(0);
  const [triggerCoachesExport, setTriggerCoachesExport] = useState(0);
  const [triggerTeamsSettings, setTriggerTeamsSettings] = useState(0);
  const [triggerMembersSettings, setTriggerMembersSettings] = useState(0);
  const [triggerCoachesSettings, setTriggerCoachesSettings] = useState(0);
  const [triggerMembersStats, setTriggerMembersStats] = useState(0);
  const [triggerTeamsEmail, setTriggerTeamsEmail] = useState(0);
  const [triggerMembersEmail, setTriggerMembersEmail] = useState(0);
  const [triggerCoachesEmail, setTriggerCoachesEmail] = useState(0);
  const [trainingSubTab, setTrainingSubTab] = useState('schedule');
  const [triggerAddVenue, setTriggerAddVenue] = useState(0);
  const [triggerAddTraining, setTriggerAddTraining] = useState(0);
  const [triggerTrainingSettings, setTriggerTrainingSettings] = useState(0);
  const [triggerAddDrill, setTriggerAddDrill] = useState(0);
  const [triggerExportDrills, setTriggerExportDrills] = useState(0);
  const [triggerImportDrills, setTriggerImportDrills] = useState(0);
  const [triggerLibrarySettings, setTriggerLibrarySettings] = useState(0);
  const [triggerDevSettings, setTriggerDevSettings] = useState(0);
  const [triggerChallengesAdd, setTriggerChallengesAdd] = useState(0);
  const [triggerChallengesExport, setTriggerChallengesExport] = useState(0);
  const [subNavOpen, setSubNavOpen] = useState(true);
  const [showRollover, setShowRollover] = useState(false);
  const [currentSeason, setCurrentSeasonState] = useState(getCurrentSeason);

  useEffect(() => {
    setCurrentSeasonState(getCurrentSeason());
    return subscribeSeasonChange(() => setCurrentSeasonState(getCurrentSeason()));
  }, []);

  // Repair: reactivate Player records for members that have a team assigned but whose Player is Inactive
  useEffect(() => {
    async function repairInactivePlayers() {
      try {
        const [members, players] = await Promise.all([
          db.entities.Member.filter({ visibility: 'Club' }, '-created_date', 500).catch(() => []),
          db.entities.Player.filter({ visibility: 'Club' }, '-created_date', 500).catch(() => []),
        ]);
        const membersWithTeam = members.filter(m => m.team_id && m.status !== 'Archived');
        const inactivePlayers = players.filter(p => p.status === 'Inactive' || !p.status);
        await Promise.all(
          membersWithTeam.map(m => {
            const stale = inactivePlayers.find(p => p.member_id === m.id);
            if (stale) return db.entities.Player.update(stale.id, { status: 'Active', team_id: m.team_id }).catch(() => {});
            return Promise.resolve();
          })
        );
      } catch {}
    }
    repairInactivePlayers();
  }, []);

  const SUB_NAV_TABS = ['teams', 'members', 'coaches', 'training', 'library', 'challenges', 'development'];

  const pushProfile = (type, data) => setProfileStack(s => [...s, { type, data }]);
  const popProfile = () => setProfileStack(s => s.slice(0, -1));
  const handleTabChange = (id) => {
    // Clicking the sidebar item for a tab always jumps back to that tab's
    // top-level list — including when you're already on it, deep in a
    // pushed profile (member/team/coach) or an in-tab detail view. Without
    // this, the only way out of a nested profile was clicking "Back"
    // repeatedly.
    setActiveTab(id);
    setProfileStack([]);
    setMobileNavOpen(false);
    setAdminFilterOpen(false);
    setResetCounters(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
    setSubNavOpen(true);
  };

  const TABS_WITH_FILTERS = ['members', 'development'];

  useEffect(() => {
    db.auth.me().then(u => {
      if (!ALLOWED_ROLES.includes(u?.role)) { navigate('/'); return; }
      setUserRole(u.role);
      if (u.role !== 'admin') setActiveTab('development');
      setLoading(false);
    }).catch(() => navigate('/'));
  }, []);

  // Sub-nav item style helpers
  const subItem = (active) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left ${
      active ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
    }`;
  const subItemSoon = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left text-slate-600 opacity-40 cursor-not-allowed font-medium';

  // Sub-nav rendered beneath the active tab button in the sidebar
  const renderTabSubNav = (id) => {
    if (!subNavOpen) return null;
    if (id === 'teams' && activeTab === 'teams') return (
      <div className="px-3 pt-0.5 pb-2 space-y-0.5">
        <button onClick={() => setShowTeamsAddPicker(true)} className={subItem(false)}>
          <Plus size={15} /> Add
        </button>
        <button onClick={() => setTriggerTeamsExport(c => c + 1)} className={subItem(false)}>
          <Download size={15} /> Export
        </button>
        <button onClick={() => setTriggerTeamsEmail(c => c + 1)} className={subItem(false)}>
          <Mail size={15} /> Email
        </button>
        <button onClick={() => setTriggerTeamsSettings(c => c + 1)} className={subItem(false)}>
          <Settings2 size={15} /> Settings
        </button>
      </div>
    );
    if (id === 'members' && activeTab === 'members') return (
      <div className="px-3 pt-0.5 pb-2 space-y-0.5">
        <button onClick={() => setTriggerMembersAdd(c => c + 1)} className={subItem(false)}>
          <Plus size={15} /> Add Member
        </button>
        <button onClick={() => setTriggerMembersImport(c => c + 1)} className={subItem(false)}>
          <Upload size={15} /> Import
        </button>
        <button onClick={() => setTriggerMembersExport(c => c + 1)} className={subItem(false)}>
          <Download size={15} /> Export
        </button>
        <button onClick={() => setTriggerMembersStats(c => c + 1)} className={subItem(false)}>
          <BarChart2 size={15} /> Statistics
        </button>
        <button onClick={() => setTriggerMembersEmail(c => c + 1)} className={subItem(false)}>
          <Mail size={15} /> Email
        </button>
        <button onClick={() => setTriggerMembersSettings(c => c + 1)} className={subItem(false)}>
          <Settings2 size={15} /> Settings
        </button>
      </div>
    );
    if (id === 'library' && activeTab === 'library') return (
      <div className="px-3 pt-0.5 pb-2 space-y-0.5">
        <button onClick={() => setTriggerAddDrill(c => c + 1)} className={subItem(false)}>
          <Plus size={15} /> Add Drill
        </button>

        <button onClick={() => setTriggerExportDrills(c => c + 1)} className={subItem(false)}>
          <Download size={15} /> Export
        </button>
        <button onClick={() => setTriggerLibrarySettings(c => c + 1)} className={subItem(false)}>
          <Settings2 size={15} /> Settings
        </button>
      </div>
    );
    if (id === 'challenges' && activeTab === 'challenges') return (
      <div className="px-3 pt-0.5 pb-2 space-y-0.5">
        <button onClick={() => setTriggerChallengesAdd(c => c + 1)} className={subItem(false)}>
          <Plus size={15} /> Add Challenge
        </button>
        <button onClick={() => setTriggerChallengesExport(c => c + 1)} className={subItem(false)}>
          <Download size={15} /> Export
        </button>
        <button disabled className={subItemSoon}>
          <Settings2 size={15} /> Settings <span className="ml-auto text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">Soon</span>
        </button>
      </div>
    );
    if (id === 'development' && activeTab === 'development') return (
      <div className="px-3 pt-0.5 pb-2 space-y-0.5">
        <button onClick={() => setTriggerDevSettings(c => c + 1)} className={subItem(false)}>
          <Settings2 size={15} /> Settings
        </button>
      </div>
    );
    if (id === 'training' && activeTab === 'training') return (
      <div className="px-3 pt-0.5 pb-2 space-y-0.5">
        <button onClick={() => setTriggerAddTraining(c => c + 1)} className={subItem(false)}>
          <Plus size={15} /> Add Training
        </button>
        <button onClick={() => setTrainingSubTab('venues')} className={subItem(false)}>
          <Plus size={15} /> Add Venue
        </button>
        <button onClick={() => setTriggerTrainingSettings(c => c + 1)} className={subItem(false)}>
          <Settings2 size={15} /> Settings
        </button>
      </div>
    );
    if (id === 'coaches' && activeTab === 'coaches') return (
      <div className="px-3 pt-0.5 pb-2 space-y-0.5">
        <button onClick={() => setTriggerCoachesAdd(c => c + 1)} className={subItem(false)}>
          <Plus size={15} /> Add Coach
        </button>
        <button onClick={() => setTriggerCoachesExport(c => c + 1)} className={subItem(false)}>
          <Download size={15} /> Export
        </button>
        <button onClick={() => setTriggerCoachesEmail(c => c + 1)} className={subItem(false)}>
          <Mail size={15} /> Email
        </button>
        <button onClick={() => setTriggerCoachesSettings(c => c + 1)} className={subItem(false)}>
          <Settings2 size={15} /> Settings
        </button>
      </div>
    );
    return null;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center" style={{ zIndex: 100 }}>
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row" style={{ zIndex: 100 }}>

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 bg-slate-950 flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-blue-400" />
            <span className="font-bold text-white text-sm">
              {userRole === 'admin' ? 'Club Admin' : userRole === 'jdo' ? 'JDO Portal' : 'DOC Portal'}
            </span>
          </div>
          <button onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={13} /> Back to Dashboard
          </button>
        </div>
        <nav className="flex-1 p-3 overflow-y-auto dark-scroll">
          {(() => {
            const tabs = ADMIN_TABS.filter(t => t.roles.includes(userRole));
            let lastSection = null;
            return tabs.map(({ id, label, icon: Icon, section }) => {
              const showHeader = section !== lastSection;
              lastSection = section;
              return (
                <div key={id}>
                  {showHeader && (
                    <p className="text-[10px] font-bold tracking-widest text-slate-600 uppercase px-3 pt-4 pb-1.5 first:pt-1">
                      {section}
                    </p>
                  )}
                  <button onClick={() => handleTabChange(id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left ${
                      activeTab === id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}>
                    <Icon size={16} />
                    <span className="flex-1">{label}</span>
                    {activeTab === id && SUB_NAV_TABS.includes(id) && (
                      subNavOpen ? <ChevronUp size={13} className="shrink-0 opacity-70" /> : <ChevronDown size={13} className="shrink-0 opacity-70" />
                    )}
                  </button>
                  {renderTabSubNav(id)}
                </div>
              );
            });
          })()}
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600 bg-slate-800 px-2 py-1 rounded-lg">
              {userRole === 'admin' ? 'Admin Only' : userRole.toUpperCase()}
            </span>
            <span className="text-xs text-blue-400 font-semibold bg-blue-950 px-2 py-1 rounded-lg truncate max-w-[120px]">
              {currentSeason.name}
            </span>
          </div>
          {userRole === 'admin' && (
            <button onClick={() => setShowRollover(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:bg-slate-800 hover:text-white font-medium transition-colors">
              <RefreshCw size={12} /> Season Rollover
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-slate-50">

        {/* Mobile header */}
        <div className="md:hidden bg-slate-950 text-white px-4 py-3.5 flex items-center gap-3 shrink-0">
          <button onClick={() => navigate('/')} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <Shield size={16} className="text-blue-400" />
          <h1 className="font-bold flex-1">
            {ADMIN_TABS.find(t => t.id === activeTab)?.label ?? 'Club Admin'}
          </h1>
          <button onClick={() => setMobileNavOpen(true)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            <Menu size={22} />
          </button>
        </div>

        {/* Mobile slide-in nav drawer */}
        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
            <div className="relative w-64 max-w-[80vw] bg-slate-950 h-full flex flex-col shadow-2xl">
              <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-blue-400" />
                  <span className="font-bold text-white text-sm">
                    {userRole === 'admin' ? 'Club Admin' : userRole === 'jdo' ? 'JDO Portal' : 'DOC Portal'}
                  </span>
                </div>
                <button onClick={() => setMobileNavOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                  <X size={18} />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto dark-scroll">
                {ADMIN_TABS.filter(t => t.roles.includes(userRole)).map(({ id, label, icon: Icon }) => (
                  <div key={id}>
                    <button onClick={() => handleTabChange(id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors text-left ${
                        activeTab === id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}>
                      <Icon size={16} />
                      {label}
                    </button>
                    {renderTabSubNav(id)}
                  </div>
                ))}
              </nav>
              <div className="p-4 border-t border-slate-800">
                <button onClick={() => navigate('/')}
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft size={13} /> Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab content — all tabs stay mounted to avoid re-fetching on tab switch */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <div className={activeTab === 'overview'     ? 'contents' : 'hidden'}><ErrorBoundary><AdminOverviewTab    resetTrigger={resetCounters.overview} onTabChange={setActiveTab} /></ErrorBoundary></div>
          <div className={activeTab === 'members'      ? 'contents' : 'hidden'}><ErrorBoundary><AdminMembersTab     onProfileClick={pushProfile} filterOpen={adminFilterOpen} onFilterClose={() => setAdminFilterOpen(false)} resetTrigger={resetCounters.members} triggerAdd={triggerMembersAdd} triggerImport={triggerMembersImport} triggerExport={triggerMembersExport} triggerSettings={triggerMembersSettings} triggerStats={triggerMembersStats} triggerEmail={triggerMembersEmail} /></ErrorBoundary></div>
          <div className={activeTab === 'teams'        ? 'contents' : 'hidden'}><ErrorBoundary><AdminTeamsTab       onProfileClick={pushProfile} resetTrigger={resetCounters.teams} section={teamsSection} onSectionChange={setTeamsSection} triggerAdd={triggerTeamsAdd} triggerAddSquad={triggerTeamsAddSquad} triggerExport={triggerTeamsExport} triggerSettings={triggerTeamsSettings} triggerEmail={triggerTeamsEmail} /></ErrorBoundary></div>
          <div className={activeTab === 'coaches'      ? 'contents' : 'hidden'}><ErrorBoundary><AdminCoachesTab     onProfileClick={pushProfile} resetTrigger={resetCounters.coaches} triggerAdd={triggerCoachesAdd} triggerExport={triggerCoachesExport} triggerSettings={triggerCoachesSettings} triggerEmail={triggerCoachesEmail} /></ErrorBoundary></div>
          <div className={activeTab === 'training'     ? 'contents' : 'hidden'}><ErrorBoundary><AdminTrainingTab    onProfileClick={pushProfile} resetTrigger={resetCounters.training} subTab={trainingSubTab} onSubTabChange={setTrainingSubTab} triggerAddVenue={triggerAddVenue} triggerAddTraining={triggerAddTraining} triggerSettings={triggerTrainingSettings} /></ErrorBoundary></div>
          <div className={activeTab === 'development'  ? 'contents' : 'hidden'}><ErrorBoundary><AdminDevelopmentHubTab filterOpen={adminFilterOpen} onFilterClose={() => setAdminFilterOpen(false)} resetTrigger={resetCounters.development} triggerSettings={triggerDevSettings} /></ErrorBoundary></div>
          <div className={activeTab === 'library'      ? 'contents' : 'hidden'}><AdminDrillsTab      resetTrigger={resetCounters.library} triggerAdd={triggerAddDrill} triggerExport={triggerExportDrills} triggerImport={triggerImportDrills} triggerSettings={triggerLibrarySettings} /></div>
          <div className={activeTab === 'challenges'   ? 'contents' : 'hidden'}><AdminChallengesTab  onProfileClick={pushProfile} resetTrigger={resetCounters.challenges} triggerAdd={triggerChallengesAdd} triggerExport={triggerChallengesExport} /></div>
          {profileStack.length > 0 && (
            <AdminProfilePanel stack={profileStack} onPush={pushProfile} onPop={popProfile} />
          )}
        </div>
      </div>

      {showRollover && (
        <SeasonRolloverModal
          onClose={() => setShowRollover(false)}
          onDone={() => {
            setCurrentSeasonState(getCurrentSeason());
            setResetCounters(c => ({
              ...c,
              overview: (c.overview || 0) + 1,
              members:  (c.members  || 0) + 1,
              teams:    (c.teams    || 0) + 1,
              coaches:  (c.coaches  || 0) + 1,
            }));
            setShowRollover(false);
          }}
        />
      )}

      {showTeamsAddPicker && (
        <AddTeamSquadModal
          onClose={() => setShowTeamsAddPicker(false)}
          onSaved={() => { setShowTeamsAddPicker(false); setResetCounters(c => ({ ...c, teams: (c.teams || 0) + 1 })); }}
        />
      )}
    </div>
  );
}
