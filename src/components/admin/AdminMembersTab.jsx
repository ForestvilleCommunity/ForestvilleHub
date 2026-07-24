import { useState, useEffect } from 'react';
import { Plus, Search, ChevronDown, ChevronUp, X, Upload, SlidersHorizontal, MoreHorizontal, FileDown, Settings, Wrench, Mail, Check } from 'lucide-react';
import Pagination from './Pagination';
import MemberImportModal from './MemberImportModal';
import ImportHistoryModal from './ImportHistoryModal';
import CustomReportModal from './CustomReportModal';
import { downloadCSV } from '@/lib/csvExport';
import { db } from '@/api/db';
import { INPUT, Spinner, Field } from './shared';
import OptionsMenu from './OptionsMenu';
import MemberProfile from './MemberProfile';
import MemberEditScreen from './MemberEditScreen';
import JerseyConflictReport from './JerseyConflictReport';
import JerseyMatrix from './JerseyMatrix';
import { getCurrentSeason } from '@/lib/season.js';

const MEMBERS_SETTINGS_KEY = 'coachpad_members_settings';
const MEMBERS_SETTINGS_DEFAULT = { sortOrder: 'name_asc', perPage: 25, defaultStatus: 'Active', visibleFields: ['gender', 'age', 'team', 'position'] };
function loadMembersSettings() { try { const saved = JSON.parse(localStorage.getItem(MEMBERS_SETTINGS_KEY) || '{}'); return { ...MEMBERS_SETTINGS_DEFAULT, ...saved, visibleFields: saved.visibleFields ?? MEMBERS_SETTINGS_DEFAULT.visibleFields }; } catch { return MEMBERS_SETTINGS_DEFAULT; } }

const MEMBER_FIELD_OPTIONS = [
  { key: 'gender',    label: 'Gender' },
  { key: 'age',       label: 'Age' },
  { key: 'team',      label: 'Team' },
  { key: 'position',  label: 'Position' },
  { key: 'email',     label: 'Email' },
  { key: 'jersey',    label: 'Jersey #' },
];

// Columns available in the custom CSV export (order = column order in the file).
const MEMBER_EXPORT_FIELDS = [
  { key: 'name',               label: 'Name' },
  { key: 'date_of_birth',      label: 'Date of birth' },
  { key: 'gender',             label: 'Gender' },
  { key: 'email',              label: 'Email' },
  { key: 'phone',              label: 'Phone' },
  { key: 'team',               label: 'Team' },
  { key: 'squad',              label: 'Squad' },
  { key: 'uniform_number',     label: 'Jersey #' },
  { key: 'parent_name',        label: 'Parent name' },
  { key: 'parent_phone',       label: 'Parent phone' },
  { key: 'parent_email',       label: 'Parent email' },
  { key: 'school',             label: 'School' },
  { key: 'medical_conditions', label: 'Medical conditions' },
  { key: 'notes',              label: 'Notes' },
  { key: 'status',             label: 'Status' },
];

const POSITIONS = ['Point Guard','Shooting Guard','Small Forward','Power Forward','Center','Guard','Forward','Utility'];
const EMPTY = {
  name:'', date_of_birth:'', gender:'', email:'', phone:'', address:'',
  team_id:'', position:'', jersey_number:'', parent_name:'', parent_phone:'',
  parent_email:'', secondary_contact:'', school:'', medical_conditions:'',
  medication:'', other_conditions:'', notes:'', status:'Active', visibility:'Club',
};

export default function AdminMembersTab({ onProfileClick, filterOpen, onFilterClose, resetTrigger, triggerAdd, triggerImport, triggerExport, triggerSettings, triggerStats }) {
  const [showForm, setShowForm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [members, setMembers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterStatus, setFilterStatus] = useState('Active');
  const [filterGender, setFilterGender] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [editScreen, setEditScreen] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set());
  const toggleMemberSelect = (id, e) => { e.stopPropagation(); setSelectedMemberIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const exitSelectMode = () => { setSelectMode(false); setSelectedMemberIds(new Set()); };
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState(['basic', 'contact']);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [customExport, setCustomExport] = useState(false);
  const [exportFields, setExportFields] = useState(MEMBER_EXPORT_FIELDS.map(f => f.key));
  const [exportStatus, setExportStatus] = useState('All');
  const [exportTeamIds, setExportTeamIds] = useState([]); // empty = all teams
  const [exportSquadIds, setExportSquadIds] = useState([]); // empty = all squads
  const [exportTeamSearch, setExportTeamSearch] = useState('');
  const [settings, setSettings] = useState(loadMembersSettings);
  const [draftSettings, setDraftSettings] = useState(settings);
  const [draftAgeMethod, setDraftAgeMethod] = useState(() => { try { return JSON.parse(localStorage.getItem('coachpad_devhub_settings') || '{}').ageMethod || 'dec31'; } catch { return 'dec31'; } });
  const PAGE_SIZE = settings.perPage;
  const [page, setPage] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [showReport, setShowReport] = useState(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [jerseyTab, setJerseyTab] = useState('conflicts'); // 'conflicts' | 'matrix'

  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => { if (filterOpen) setShowFilters(true); }, [filterOpen]);
  useEffect(() => { if (!resetTrigger) return; setShowForm(false); setSelectedMember(null); setEditScreen(null); load(); }, [resetTrigger]);
  useEffect(() => { if (!triggerAdd) return; setForm(EMPTY); setOpenSections(['basic', 'contact']); setShowForm(true); }, [triggerAdd]);
  useEffect(() => { if (!triggerImport) return; setShowImport(true); }, [triggerImport]);
  useEffect(() => {
    if (!triggerExport) return;
    setCustomExport(false);
    setExportFields(MEMBER_EXPORT_FIELDS.map(f => f.key));
    setExportStatus('All');
    setExportTeamIds([]);
    setExportSquadIds([]);
    setExportTeamSearch('');
    setShowExport(true);
  }, [triggerExport]);
  useEffect(() => { if (!triggerStats) return; setShowStats(true); }, [triggerStats]);
  useEffect(() => { if (!triggerSettings) return; setSelectedMember(null); setDraftSettings(loadMembersSettings()); try { setDraftAgeMethod(JSON.parse(localStorage.getItem('coachpad_devhub_settings') || '{}').ageMethod || 'dec31'); } catch {} setShowSettings(true); }, [triggerSettings]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [m, t, sq] = await Promise.all([
        db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date'),
        db.entities.Team.filterAll({ visibility: 'Club' }, '-created_date'),
        db.entities.Squad.list('-created_date', 500).catch(() => []),
      ]);
      setMembers(m); setTeams(t); setSquads(sq);
      db.entities.Player.filterAll({ visibility: 'Club' }, '-created_date')
        .then(setPlayers).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSection = (s) => setOpenSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const getLinkedPlayer = (memberId) => players.find(p => p.member_id === memberId);
  const getTeamName = (id) => teams.find(t => t.id === id)?.team_name || 'Unassigned';

  const [seasonEndYear, setSeasonEndYear] = useState(() => {
    const s = getCurrentSeason();
    const m = (s.name || '').match(/\d{4}-(\d{4})/);
    return m ? parseInt(m[1]) : new Date().getFullYear();
  });
  useEffect(() => {
    const handler = () => {
      const s = getCurrentSeason();
      const m = (s.name || '').match(/\d{4}-(\d{4})/);
      setSeasonEndYear(m ? parseInt(m[1]) : new Date().getFullYear());
    };
    window.addEventListener('setCurrentSeason', handler);
    return () => window.removeEventListener('setCurrentSeason', handler);
  }, []);

  const getAge = (dob) => {
    if (!dob) return null;
    return seasonEndYear - new Date(dob + 'T00:00:00').getFullYear();
  };

  const saveForm = async (isEdit = false) => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const me = await db.auth.me();
      const memberData = {
        name: form.name.trim(),
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        team_id: form.team_id || null,
        position: form.position || null,
        jersey_number: form.jersey_number !== '' ? Number(form.jersey_number) : null,
        parent_name: form.parent_name || null,
        parent_phone: form.parent_phone || null,
        parent_email: form.parent_email || null,
        secondary_contact_name: form.secondary_contact || null,
        school: form.school || null,
        medical_conditions: form.medical_conditions || null,
        medication: form.medication || null,
        other_conditions: form.other_conditions || null,
        notes: form.notes || null,
        status: form.status,
        visibility: form.visibility,
        owner_id: me.id,
        owner_user_email: me.email,
      };

      const created = await db.entities.Member.create(memberData);
      const memberId = created.id;

      if (form.team_id) {
        const existing = await db.entities.Player.filter({ member_id: memberId, team_id: form.team_id }).catch(() => []);
        if (existing.length === 0) {
          const playerData = {
            name: form.name, team_id: form.team_id, member_id: memberId,
            owner_id: me.id, owner_user_email: me.email, visibility: 'Club',
            status: form.status === 'Active' ? 'Active' : 'Inactive',
            date_of_birth: form.date_of_birth || null,
            position: form.position || null,
            jersey_number: form.jersey_number !== '' ? Number(form.jersey_number) : null,
          };
          await db.entities.Player.create({ ...playerData, injury_status: 'Healthy' });
        }
      }

      setForm(EMPTY);
      setShowForm(false);
      load();
    } catch (e) {
      alert('Error saving member: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const setMemberStatus = async (m, status) => {
    await db.entities.Member.update(m.id, { status });
    const linked = getLinkedPlayer(m.id);
    if (linked) await db.entities.Player.update(linked.id, { status: status === 'Active' ? 'Active' : 'Inactive' });
    load();
  };

  const deleteMember = async (m) => {
    if (!window.confirm(`Delete ${m.name}? This cannot be undone.`)) return;
    const linkedPlayers = await db.entities.Player.filter({ member_id: m.id }, '-created_date', 50).catch(() => []);
    await Promise.all(linkedPlayers.map(p => db.entities.Player.delete(p.id).catch(() => {})));
    await db.entities.Member.delete(m.id);
    load();
  };

  const memberRow = (m) => {
    const team = teams.find(t => t.id === m.team_id);
    const squad = squads.find(s => { try { return JSON.parse(s.team_ids || '[]').includes(m.team_id); } catch { return false; } });
    return {
      name: m.name, date_of_birth: m.date_of_birth || '', gender: m.gender || '',
      email: m.email || '', phone: m.phone || '',
      team: team?.team_name || '', squad: squad?.name || '',
      uniform_number: m.jersey_number ?? '',
      parent_name: m.parent_name || '', parent_phone: m.parent_phone || '',
      parent_email: m.parent_email || '', school: m.school || '',
      medical_conditions: m.medical_conditions || '', notes: m.notes || '',
      status: m.status || '',
    };
  };

  const exportTeamIdSet = (() => {
    // If squads are selected, expand to all team IDs in those squads
    if (exportSquadIds.length > 0) {
      const ids = new Set(exportTeamIds);
      exportSquadIds.forEach(sqId => {
        const sq = squads.find(s => s.id === sqId);
        if (sq) { try { JSON.parse(sq.team_ids || '[]').forEach(tid => ids.add(tid)); } catch {} }
      });
      return [...ids];
    }
    return exportTeamIds;
  })();

  // Custom export — build a CSV from chosen fields, status and teams.
  const runCustomExport = () => {
    const orderedKeys = MEMBER_EXPORT_FIELDS.filter(f => exportFields.includes(f.key)).map(f => f.key);
    const statusFiltered = members.filter(m =>
      exportStatus === 'All' ? true : exportStatus === 'Active' ? m.status !== 'Archived' : m.status === 'Archived'
    );
    const teamFiltered = exportTeamIdSet.length === 0 ? statusFiltered : statusFiltered.filter(m => exportTeamIdSet.includes(m.team_id));
    const rows = teamFiltered.map(m => {
      const full = memberRow(m);
      const picked = {};
      orderedKeys.forEach(k => { picked[k] = full[k]; });
      return picked;
    });
    downloadCSV(rows, 'members-custom.csv');
  };

  // Count of members matching the current custom-export filters (for the button).
  const customExportCount = (() => {
    const statusFiltered = members.filter(m =>
      exportStatus === 'All' ? true : exportStatus === 'Active' ? m.status !== 'Archived' : m.status === 'Archived'
    );
    return exportTeamIdSet.length === 0 ? statusFiltered.length : statusFiltered.filter(m => exportTeamIdSet.includes(m.team_id)).length;
  })();

  const exportMembers = (list, filename = 'members.csv') => downloadCSV(list.map(memberRow), filename);

  // Scoped export dispatcher — driven by the sidebar Export submenu
  const runMembersExport = (scope) => {
    const active = members.filter(m => m.status !== 'Archived');
    switch (scope) {
      case 'active':   return exportMembers(active, 'members-active.csv');
      case 'archived': return exportMembers(members.filter(m => m.status === 'Archived'), 'members-archived.csv');
      case 'by_team': {
        const sorted = [...members].sort((a, b) =>
          (teams.find(t => t.id === a.team_id)?.team_name || 'zzz').localeCompare(teams.find(t => t.id === b.team_id)?.team_name || 'zzz')
          || (a.name || '').localeCompare(b.name || ''));
        return exportMembers(sorted, 'members-by-team.csv');
      }
      case 'by_squad': {
        const squadOf = (m) => squads.find(s => { try { return JSON.parse(s.team_ids || '[]').includes(m.team_id); } catch { return false; } })?.name || 'zzz';
        const sorted = [...members].sort((a, b) => squadOf(a).localeCompare(squadOf(b)) || (a.name || '').localeCompare(b.name || ''));
        return exportMembers(sorted, 'members-by-squad.csv');
      }
      case 'all':
      default:         return exportMembers(members);
    }
  };

  const openEdit = (m) => { setEditScreen(m); };

  // Reset pagination when filters change
  useEffect(() => { setPage(0); }, [search, filterTeam, filterStatus, filterGender, filterProgram]);

  const filtered = (() => {
    const base = members.filter(m => {
      const st = filterStatus === 'All' ? true : filterStatus === 'Active' ? m.status !== 'Archived' : m.status === 'Archived';
      const tm = !filterTeam || m.team_id === filterTeam;
      const gd = !filterGender || m.gender === filterGender;
      const pg = !filterProgram || teams.find(t => t.id === m.team_id)?.program_type === filterProgram;
      const sr = !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.email?.toLowerCase().includes(search.toLowerCase());
      return st && tm && gd && pg && sr;
    });
    const lastName = (m) => { const parts = (m.name || '').trim().split(' '); return parts[parts.length - 1]; };
    switch (settings.sortOrder) {
      case 'name_desc':      return [...base].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'last_name_asc':  return [...base].sort((a, b) => lastName(a).localeCompare(lastName(b)));
      case 'age_asc':        return [...base].sort((a, b) => (b.date_of_birth || '').localeCompare(a.date_of_birth || ''));
      case 'age_desc':       return [...base].sort((a, b) => (a.date_of_birth || '').localeCompare(b.date_of_birth || ''));
      case 'newest':         return [...base].sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
      case 'oldest':         return [...base].sort((a, b) => (a.created_date || '').localeCompare(b.created_date || ''));
      default:               return [...base].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
  })();

  const REPORT_ITEMS = [
    { label: 'Export All Members', action: () => exportMembers(members), ready: true },
    { label: 'Uniform Number Report', action: () => {
        const sqList = squads;
        downloadCSV(members.filter(m => m.status !== 'Archived').map(m => {
          const team = teams.find(t => t.id === m.team_id);
          const squad = sqList.find(s => { try { return JSON.parse(s.team_ids || '[]').includes(m.team_id); } catch { return false; } });
          return {
            member: m.name, uniform_number: m.jersey_number ?? '',
            team: team?.team_name || '', squad: squad?.name || '',
            competition: team?.program_type || '', age_group: team?.age_group || '',
            gender: m.gender || '',
          };
        }).sort((a, b) => (a.uniform_number ?? 999) - (b.uniform_number ?? 999)), 'uniform_numbers.csv');
      }, ready: true },
    { label: 'Custom Export…', action: () => setShowReport('custom'), ready: true },
    { label: 'Export Attendance', ready: false },
  ];

  if (editScreen) {
    return (
      <MemberEditScreen
        member={editScreen}
        teams={teams}
        squads={squads}
        allMembers={members}
        onBack={() => setEditScreen(null)}
        onSaved={() => { setEditScreen(null); load(); }}
      />
    );
  }

  if (selectedMember) {
    return (
      <MemberProfile
        member={selectedMember}
        teams={teams}
        linkedPlayer={getLinkedPlayer(selectedMember.id)}
        isAdmin={true}
        onBack={() => setSelectedMember(null)}
        onEdit={() => { setSelectedMember(null); setEditScreen(selectedMember); }}
        onDelete={() => { deleteMember(selectedMember); setSelectedMember(null); }}
        onTeamClick={team => onProfileClick?.('team', team)}
      />
    );
  }

  // ── Member form as a render function (NOT a component) — prevents input focus loss ──
  const renderMemberForm = (isEdit) => (
    <div className="p-4 space-y-3 max-w-2xl mx-auto">
      <FS id="basic" title="Basic Information" open={openSections.includes('basic')} toggle={() => toggleSection('basic')}>
        <Field label="Full Name *">
          <input value={form.name} onChange={e => upd('name', e.target.value)} placeholder="First Last" className={INPUT} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date of Birth">
            <input type="date" value={form.date_of_birth} onChange={e => upd('date_of_birth', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Gender">
            <select value={form.gender} onChange={e => upd('gender', e.target.value)} className={INPUT}>
              <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
          </Field>
          <Field label="Team">
            <select value={form.team_id} onChange={e => upd('team_id', e.target.value)} className={INPUT}>
              <option value="">Unassigned</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
            </select>
          </Field>
          {form.team_id && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 px-1 -mt-1">
              <span>Squad:</span>
              {(() => { const sq = squads.find(s => { try { return JSON.parse(s.team_ids||'[]').includes(form.team_id); } catch { return false; } }); return sq ? <span className="font-semibold text-indigo-600">{sq.name}</span> : <span className="text-slate-400">No squad</span>; })()}
            </div>
          )}
          <Field label="Status">
            <select value={form.status} onChange={e => upd('status', e.target.value)} className={INPUT}>
              <option value="Active">Active</option><option value="Archived">Archived</option>
            </select>
          </Field>
          <Field label="Jersey #">
            <input type="number" value={form.jersey_number} onChange={e => upd('jersey_number', e.target.value)} placeholder="10" className={INPUT} />
          </Field>
          <Field label="Position">
            <select value={form.position} onChange={e => upd('position', e.target.value)} className={INPUT}>
              <option value="">—</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
      </FS>

      <FS id="contact" title="Contact Details" open={openSections.includes('contact')} toggle={() => toggleSection('contact')}>
        <Field label="Email"><input type="email" value={form.email} onChange={e => upd('email', e.target.value)} placeholder="email@example.com" className={INPUT} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={e => upd('phone', e.target.value)} placeholder="+1 555 000 0000" className={INPUT} /></Field>
        <Field label="Address"><input value={form.address} onChange={e => upd('address', e.target.value)} placeholder="Street, City" className={INPUT} /></Field>
      </FS>

      <FS id="parent" title="Parent / Guardian" open={openSections.includes('parent')} toggle={() => toggleSection('parent')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Parent Name"><input value={form.parent_name} onChange={e => upd('parent_name', e.target.value)} placeholder="Full name" className={INPUT} /></Field>
          <Field label="Parent Phone"><input value={form.parent_phone} onChange={e => upd('parent_phone', e.target.value)} placeholder="+1 555 000 0000" className={INPUT} /></Field>
        </div>
        <Field label="Parent Email"><input type="email" value={form.parent_email} onChange={e => upd('parent_email', e.target.value)} placeholder="parent@email.com" className={INPUT} /></Field>
        <Field label="Secondary Contact"><input value={form.secondary_contact} onChange={e => upd('secondary_contact', e.target.value)} placeholder="Name, Phone, Relationship" className={INPUT} /></Field>
      </FS>

      <FS id="background" title="Background (Optional)" open={openSections.includes('background')} toggle={() => toggleSection('background')}>
        <Field label="School Attending"><input value={form.school} onChange={e => upd('school', e.target.value)} placeholder="School name" className={INPUT} /></Field>
      </FS>

      <FS id="medical" title="Medical Information" open={openSections.includes('medical')} toggle={() => toggleSection('medical')}>
        <Field label="Medical Conditions"><textarea value={form.medical_conditions} onChange={e => upd('medical_conditions', e.target.value)} placeholder="Any known conditions…" rows={2} className={INPUT + ' resize-none'} /></Field>
        <Field label="Medication / Instructions"><textarea value={form.medication} onChange={e => upd('medication', e.target.value)} placeholder="Medication or instructions…" rows={2} className={INPUT + ' resize-none'} /></Field>
        <Field label="Other Conditions"><textarea value={form.other_conditions} onChange={e => upd('other_conditions', e.target.value)} placeholder="Allergies, dietary, other…" rows={2} className={INPUT + ' resize-none'} /></Field>
      </FS>

      <FS id="notes" title="Notes" open={openSections.includes('notes')} toggle={() => toggleSection('notes')}>
        <Field label="Additional Notes"><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="Any other information…" rows={3} className={INPUT + ' resize-none'} /></Field>
      </FS>

      <div className="flex gap-2 pt-2 pb-8">
        <button onClick={() => saveForm(isEdit)} disabled={saving || !form.name.trim()}
          className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Update Member' : 'Add Member'}
        </button>
        {isEdit && <button onClick={() => setShowForm(false)} className="px-4 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold">Cancel</button>}
      </div>
    </div>
  );

  if (loading) return <Spinner />;

  const closeFilter = () => { setShowFilters(false); onFilterClose?.(); };
  const hasFilters = filterTeam || filterStatus !== 'Active' || filterGender || filterProgram;

  return (
    <div className="flex flex-col h-full">
      {/* Mobile filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeFilter} />
          <div className="relative w-80 max-w-[90vw] bg-white max-h-[80vh] flex flex-col shadow-2xl rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-slate-100">
              <p className="font-bold text-slate-800 text-base">Filter Members</p>
              <button onClick={closeFilter} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-5 flex-1 overflow-y-auto">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Status</p>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {['Active', 'Archived', 'All'].map(f => (
                    <button key={f} onClick={() => setFilterStatus(f)}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${filterStatus === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gender</p>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {[['', 'All'], ['Male', 'Boys'], ['Female', 'Girls']].map(([val, label]) => (
                    <button key={val} onClick={() => setFilterGender(val)}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${filterGender === val ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Program</p>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {[['', 'All'], ['District', 'District'], ['Domestic', 'Domestic'], ['Academy', 'Academy']].map(([val, label]) => (
                    <button key={val} onClick={() => setFilterProgram(val)}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${filterProgram === val ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Team</p>
                <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Teams</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2">
              {hasFilters && (
                <button onClick={() => { setFilterTeam(''); setFilterStatus('Active'); setFilterGender(''); setFilterProgram(''); }}
                  className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Clear all
                </button>
              )}
              <button onClick={closeFilter}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
                Done
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Member list */}
      <div className="flex-1 overflow-y-auto" onClick={() => setShowMoreMenu(false)}>
        <div className="p-4 space-y-4 max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-2xl p-4 text-center border border-slate-200">
              <p className="text-3xl font-black text-blue-700">{members.filter(m => m.status !== 'Archived').length}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">Total Members</p>
            </div>
            <div className="bg-indigo-50 rounded-2xl p-4 text-center border border-slate-200">
              <p className="text-3xl font-black text-indigo-700">{members.filter(m => m.gender === 'Male' && m.status !== 'Archived').length}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">Male</p>
            </div>
            <div className="bg-pink-50 rounded-2xl p-4 text-center border border-slate-200">
              <p className="text-3xl font-black text-pink-600">{members.filter(m => m.gender === 'Female' && m.status !== 'Archived').length}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">Female</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            {['Active', 'Archived', 'All'].map(f => (
              <button key={f} onClick={() => setFilterStatus(f)}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${filterStatus === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(true)}
              className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${hasFilters ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <SlidersHorizontal size={13} />
              Filters
              {hasFilters && <span className="bg-white text-blue-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-black">{[filterTeam, filterStatus !== 'Active' ? filterStatus : '', filterGender, filterProgram].filter(Boolean).length}</span>}
            </button>
            <button onClick={() => { setSelectMode(s => !s); setSelectedMemberIds(new Set()); }}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 ${selectMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Check size={14} /> Select
            </button>
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</span>
            <div className="relative">
              <button onClick={e => { e.stopPropagation(); setShowMoreMenu(v => !v); }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
                <MoreHorizontal size={16} />
              </button>
              {showMoreMenu && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[200px]">
                  <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Import</p>
                  <button onClick={() => { setShowImport(true); setShowMoreMenu(false); }}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                    <Upload size={13} className="text-slate-400 shrink-0" /> Import CSV / Excel
                  </button>
                  <button onClick={() => { setShowImportHistory(true); setShowMoreMenu(false); }}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                    <Upload size={13} className="text-slate-400 shrink-0" /> Import History &amp; Undo
                  </button>
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Export</p>
                    {REPORT_ITEMS.map(item => (
                      <button key={item.label} onClick={() => { if (item.ready && item.action) { item.action(); setShowMoreMenu(false); } }}
                        disabled={!item.ready}
                        className="w-full text-left px-4 py-2 text-xs font-semibold transition-colors text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2">
                        <FileDown size={13} className="text-slate-400 shrink-0" /> {item.label}
                        {!item.ready && <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Soon</span>}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button disabled className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-400 flex items-center gap-2">
                      <Mail size={13} className="shrink-0" /> Email <span className="ml-auto text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">Soon</span>
                    </button>
                    <button onClick={() => { setDraftSettings(loadMembersSettings()); setShowSettings(true); setShowMoreMenu(false); }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <Settings size={13} className="shrink-0" /> Settings
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Jersey Numbers — opens as full-screen modal */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Jersey Numbers</p>
                <p className="text-xs text-slate-400">Conflict check and cross-year assignment matrix</p>
                {(() => {
                  const unassigned = members.filter(m => m.status !== 'Archived' && (m.jersey_number == null || m.jersey_number === '') && !/\bboard\b/i.test(teams.find(t => t.id === m.team_id)?.team_name || '')).length;
                  return unassigned > 0 ? (
                    <p className="text-xs text-amber-600 font-semibold mt-0.5">{unassigned} member{unassigned !== 1 ? 's' : ''} without a jersey number</p>
                  ) : null;
                })()}
              </div>
              <button
                onClick={() => setShowConflicts(true)}
                className="text-xs text-blue-600 font-bold bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100">
                Open
              </button>
            </div>
          </div>

          {/* Jersey full-screen modal */}
          {showConflicts && (
            <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
              <div className="bg-white flex flex-col h-full w-full shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                  <p className="font-bold text-slate-900">Jersey Numbers</p>
                  <button onClick={() => setShowConflicts(false)} className="text-slate-400 hover:text-slate-700">✕</button>
                </div>
                {/* Sub-tabs + dev randomise */}
                <div className="flex items-center border-b border-slate-100 px-4 pt-2 gap-1 shrink-0">
                  {[{ id: 'conflicts', label: 'Conflict Check' }, { id: 'matrix', label: 'Number Matrix' }].map(t => (
                    <button key={t.id} onClick={() => setJerseyTab(t.id)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-colors ${jerseyTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {jerseyTab === 'conflicts'
                    ? <JerseyConflictReport members={members} teams={teams} onMemberUpdated={load} />
                    : <JerseyMatrix members={members} teams={teams} />
                  }
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {filtered.length === 0
              ? <p className="text-center text-slate-400 py-12 text-sm">No members found.</p>
              : filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(m => {
                const age = getAge(m.date_of_birth);
                const archived = m.status === 'Archived';
                return (
                  <div key={m.id}
                    onClick={() => selectMode ? setSelectedMemberIds(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; }) : setSelectedMember(m)}
                    className={`bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all ${archived ? 'opacity-60' : ''} ${selectMode && selectedMemberIds.has(m.id) ? 'border-blue-400 bg-blue-50' : ''}`}>
                    {selectMode && <input type="checkbox" checked={selectedMemberIds.has(m.id)} onChange={e => toggleMemberSelect(m.id, e)} onClick={e => e.stopPropagation()} className="shrink-0 w-4 h-4 accent-blue-600" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 text-sm">{m.name}</p>
                        {settings.visibleFields.includes('gender') && m.gender && <span className="text-xs text-slate-400">{m.gender}</span>}
                        {settings.visibleFields.includes('jersey') && m.jersey_number != null && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">#{m.jersey_number}</span>}
                        {!m.team_id && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">⚠ No team</span>}
                        {archived && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Archived</span>}
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {[
                          settings.visibleFields.includes('team') && getTeamName(m.team_id),
                          settings.visibleFields.includes('age') && age !== null && `Age ${age}`,
                          settings.visibleFields.includes('position') && m.position,
                          settings.visibleFields.includes('email') && m.email,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <OptionsMenu items={[
                      { label: 'Edit member', action: () => openEdit(m) },
                      { label: archived ? 'Restore member' : 'Archive member', action: () => setMemberStatus(m, archived ? 'Active' : 'Archived') },
                      { divider: true },
                      { label: 'Email member', disabled: true },
                      { label: 'Invoice member', disabled: true },
                      { label: 'Notes & documents', disabled: true },
                      { label: 'Member history', disabled: true },
                      { label: 'Download report', disabled: true },
                      { divider: true },
                      { label: 'Delete member', danger: true, action: () => deleteMember(m) },
                    ]} />
                  </div>
                );
              })}
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPage={setPage} />
          </div>
        </div>
      </div>

      {/* Bulk selection bar */}
      {selectMode && (
        <div className="shrink-0 bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-semibold flex-1">
            {selectedMemberIds.size > 0 ? `${selectedMemberIds.size} member${selectedMemberIds.size !== 1 ? 's' : ''} selected` : 'Tap members to select'}
          </span>
          <div className="flex gap-2">
            <button onClick={exitSelectMode} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl font-semibold">Cancel</button>
            <button
              onClick={() => {
                const emails = members.filter(m => selectedMemberIds.has(m.id) && m.email).map(m => m.email).join(',');
                if (emails) window.open(`mailto:${emails}`);
              }}
              disabled={selectedMemberIds.size === 0}
              className="text-xs bg-white text-slate-900 font-bold hover:bg-slate-100 px-2.5 py-1.5 rounded-xl disabled:opacity-40">Email</button>
            <button
              onClick={async () => {
                if (!window.confirm(`Archive ${selectedMemberIds.size} member${selectedMemberIds.size !== 1 ? 's' : ''}?`)) return;
                await Promise.all([...selectedMemberIds].map(id => db.entities.Member.update(id, { status: 'Archived' })));
                exitSelectMode();
                load();
              }}
              disabled={selectedMemberIds.size === 0}
              className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-xl font-semibold disabled:opacity-40">Archive</button>
            <button onClick={() => setShowReport(true)} disabled={selectedMemberIds.size === 0} className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-xl font-semibold disabled:opacity-40">Export CSV</button>
          </div>
        </div>
      )}

      {showReport && (
        <CustomReportModal onClose={() => setShowReport(null)} />
      )}

      {showImport && (
        <MemberImportModal
          onClose={() => setShowImport(false)}
          existingTeams={teams}
          existingMembers={members}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      {showImportHistory && (
        <ImportHistoryModal
          onClose={() => setShowImportHistory(false)}
          onUndone={() => { setShowImportHistory(false); load(); }}
        />
      )}

      {/* Add Member form overlay */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-slate-50 rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-slate-900">Add Member</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderMemberForm(false)}
            </div>
          </div>
        </div>
      )}

      {/* Export page overlay */}
      {showExport && (
        <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
            <button onClick={() => customExport ? setCustomExport(false) : setShowExport(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              {customExport ? <ChevronUp size={18} className="-rotate-90" /> : <X size={18} />}
            </button>
            <h2 className="font-bold text-slate-900">{customExport ? 'Custom Export' : 'Export Members'}</h2>
          </div>

          {!customExport ? (
            <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-2xl w-full mx-auto space-y-3">
              <p className="text-sm text-slate-500">Choose what to export. Files download as CSV.</p>
              {[
                { scope: 'all', title: 'All members', desc: `Every member (${members.length}) with full details.` },
              ].map(o => (
                <button key={o.scope} onClick={() => { runMembersExport(o.scope); setShowExport(false); }}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
                  <FileDown size={18} className="text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{o.title}</p>
                    <p className="text-xs text-slate-400">{o.desc}</p>
                  </div>
                </button>
              ))}

              {/* Custom export entry */}
              <button onClick={() => setCustomExport(true)}
                className="w-full text-left bg-white rounded-2xl border-2 border-dashed border-slate-300 p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
                <SlidersHorizontal size={18} className="text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">Custom export…</p>
                  <p className="text-xs text-slate-400">Pick exactly which fields, teams and members to include.</p>
                </div>
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-2xl w-full mx-auto space-y-6">
                {/* Fields */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fields to include</p>
                    <div className="flex gap-2">
                      <button onClick={() => setExportFields(MEMBER_EXPORT_FIELDS.map(f => f.key))} className="text-xs text-blue-600 font-semibold hover:underline">All</button>
                      <button onClick={() => setExportFields(['name'])} className="text-xs text-slate-400 font-semibold hover:underline">Reset</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {MEMBER_EXPORT_FIELDS.map(f => {
                      const on = exportFields.includes(f.key);
                      return (
                        <button key={f.key} onClick={() => setExportFields(s => on ? s.filter(k => k !== f.key) : [...s, f.key])}
                          className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium text-left transition-colors ${on ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                            {on && <Check size={12} className="text-white" strokeWidth={3} />}
                          </span>
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Members to include</p>
                  <div className="flex gap-2">
                    {['All', 'Active', 'Archived'].map(v => (
                      <button key={v} onClick={() => setExportStatus(v)}
                        className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${exportStatus === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Squads */}
                {squads.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Squads</p>
                      {exportSquadIds.length > 0 && <button onClick={() => setExportSquadIds([])} className="text-xs text-blue-600 font-semibold hover:underline">Clear</button>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {squads.map(sq => {
                        const on = exportSquadIds.includes(sq.id);
                        return (
                          <button key={sq.id} onClick={() => setExportSquadIds(s => on ? s.filter(id => id !== sq.id) : [...s, sq.id])}
                            className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium text-left transition-colors ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                              {on && <Check size={12} className="text-white" strokeWidth={3} />}
                            </span>
                            <span className="truncate">{sq.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Teams */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Teams</p>
                    {exportTeamIds.length > 0 && <button onClick={() => setExportTeamIds([])} className="text-xs text-blue-600 font-semibold hover:underline">Clear</button>}
                  </div>
                  {(exportTeamIds.length === 0 && exportSquadIds.length === 0) && <p className="text-xs text-slate-400 mb-2">All teams included. Select squads or teams below to narrow it down.</p>}
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={exportTeamSearch} onChange={e => setExportTeamSearch(e.target.value)} placeholder={`Search ${teams.length} teams…`}
                      className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {teams.filter(t => !exportTeamSearch || (t.team_name || '').toLowerCase().includes(exportTeamSearch.toLowerCase())).map(t => {
                      const on = exportTeamIds.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => setExportTeamIds(s => on ? s.filter(id => id !== t.id) : [...s, t.id])}
                          className={`w-full flex items-center gap-2 py-2.5 px-3 text-sm font-medium text-left transition-colors ${on ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                            {on && <Check size={12} className="text-white" strokeWidth={3} />}
                          </span>
                          <span className="truncate">{t.team_name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sticky footer */}
              <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
                <div className="max-w-2xl w-full mx-auto flex items-center gap-3">
                  <p className="text-sm text-slate-500 flex-1">{customExportCount} member{customExportCount !== 1 ? 's' : ''} · {exportFields.length} field{exportFields.length !== 1 ? 's' : ''}</p>
                  <button onClick={() => { setCustomExport(false); }} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
                  <button onClick={() => { runCustomExport(); setShowExport(false); }} disabled={exportFields.length === 0 || customExportCount === 0}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                    <FileDown size={15} /> Export CSV
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Statistics page overlay */}
      {showStats && (() => {
        const active = members.filter(m => m.status !== 'Archived');
        const archived = members.filter(m => m.status === 'Archived');
        const male = active.filter(m => m.gender === 'Male').length;
        const female = active.filter(m => m.gender === 'Female').length;
        const other = active.filter(m => m.gender && m.gender !== 'Male' && m.gender !== 'Female').length;
        const noGender = active.length - male - female - other;

        // Age groups — group by team's age_group field
        const ageGroups = {};
        active.forEach(m => {
          const team = teams.find(t => t.id === m.team_id);
          const group = team?.age_group || 'Unassigned';
          ageGroups[group] = (ageGroups[group] || 0) + 1;
        });

        // Teams
        const teamCounts = {};
        active.forEach(m => {
          const name = teams.find(t => t.id === m.team_id)?.team_name || 'Unassigned';
          teamCounts[name] = (teamCounts[name] || 0) + 1;
        });

        // Positions
        const posCounts = {};
        active.forEach(m => {
          const p = m.position || 'Not set';
          posCounts[p] = (posCounts[p] || 0) + 1;
        });

        const Bar = ({ label, count, total, color = 'bg-blue-500' }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-700 font-medium truncate max-w-[60%]">{label}</span>
                <span className="text-slate-500">{count} <span className="text-slate-400">({pct}%)</span></span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        };

        const Section = ({ title, children }) => (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{title}</p>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">{children}</div>
          </div>
        );

        return (
          <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
              <button onClick={() => setShowStats(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              <h2 className="font-bold text-slate-900">Member Statistics</h2>
              <span className="ml-auto text-xs text-slate-400">{active.length} active members</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5 max-w-2xl w-full">

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                {[['Total', members.length, 'text-blue-700 bg-blue-50'],['Active', active.length, 'text-green-700 bg-green-50'],['Archived', archived.length, 'text-amber-700 bg-amber-50']].map(([l,v,c]) => (
                  <div key={l} className={`rounded-2xl border border-slate-200 p-3 text-center ${c.split(' ')[1]}`}>
                    <p className={`text-2xl font-black ${c.split(' ')[0]}`}>{v}</p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">{l}</p>
                  </div>
                ))}
              </div>

              <Section title="Gender">
                <Bar label="Male" count={male} total={active.length} color="bg-blue-500" />
                <Bar label="Female" count={female} total={active.length} color="bg-pink-500" />
                {other > 0 && <Bar label="Other" count={other} total={active.length} color="bg-purple-500" />}
                {noGender > 0 && <Bar label="Not set" count={noGender} total={active.length} color="bg-slate-300" />}
              </Section>

              <Section title="Age Groups">
                {Object.entries(ageGroups).sort((a,b) => b[1]-a[1]).map(([g, n]) => (
                  <Bar key={g} label={g} count={n} total={active.length} color="bg-indigo-500" />
                ))}
              </Section>

              <Section title="By Team">
                {Object.entries(teamCounts).sort((a,b) => b[1]-a[1]).map(([t, n]) => (
                  <Bar key={t} label={t} count={n} total={active.length} color="bg-teal-500" />
                ))}
              </Section>

              {Object.keys(posCounts).filter(p => p !== 'Not set').length > 0 && (
                <Section title="Positions">
                  {Object.entries(posCounts).filter(([p]) => p !== 'Not set').sort((a,b) => b[1]-a[1]).map(([p, n]) => (
                    <Bar key={p} label={p} count={n} total={active.length} color="bg-orange-500" />
                  ))}
                </Section>
              )}
            </div>
          </div>
        );
      })()}

      {/* Settings page overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-white z-20 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
            <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            <h2 className="font-bold text-slate-900">Members Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-2xl w-full mx-auto">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Default sort order</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[['name_asc','Name A → Z'],['name_desc','Name Z → A'],['last_name_asc','Last Name A → Z'],['age_asc','Age (youngest first)'],['age_desc','Age (oldest first)'],['newest','Newest registered'],['oldest','Oldest registered']].map(([v,l]) => (
                  <button key={v} onClick={() => setDraftSettings(s => ({ ...s, sortOrder: v }))}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${draftSettings.sortOrder === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Default status filter</p>
              <div className="flex gap-2">
                {['Active','All','Archived'].map(v => (
                  <button key={v} onClick={() => setDraftSettings(s => ({ ...s, defaultStatus: v }))}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${draftSettings.defaultStatus === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Members per page</p>
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
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Player age calculation</p>
              <div className="flex gap-2">
                {[{ value: 'dec31', label: 'Age (Dec 31)' }, { value: 'today', label: 'Age today' }].map(opt => (
                  <button key={opt.value} onClick={() => setDraftAgeMethod(opt.value)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${draftAgeMethod === opt.value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Dec 31 is the Australian basketball standard. Applies across all admin views.</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Fields to show in member list</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MEMBER_FIELD_OPTIONS.map(({ key, label }) => {
                  const on = draftSettings.visibleFields.includes(key);
                  return (
                    <button key={key} onClick={() => setDraftSettings(s => ({
                      ...s,
                      visibleFields: on ? s.visibleFields.filter(f => f !== key) : [...s.visibleFields, key]
                    }))}
                      className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors text-left ${on ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {on && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="shrink-0 px-5 pb-6 pt-3 border-t border-slate-100 flex gap-2">
            <button onClick={() => setShowSettings(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
            <button onClick={() => {
              localStorage.setItem(MEMBERS_SETTINGS_KEY, JSON.stringify(draftSettings));
              setSettings(draftSettings);
              setFilterStatus(draftSettings.defaultStatus === 'All' ? '' : draftSettings.defaultStatus);
              try { const s = JSON.parse(localStorage.getItem('coachpad_devhub_settings') || '{}'); localStorage.setItem('coachpad_devhub_settings', JSON.stringify({ ...s, ageMethod: draftAgeMethod })); } catch {}
              setShowSettings(false);
            }} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FS({ id, title, open, toggle, children }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
        {title}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}
