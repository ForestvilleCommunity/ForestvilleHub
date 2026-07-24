import { useState, useEffect } from 'react';
import { X, Download, Loader2, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/api/db';
import { downloadCSV } from '@/lib/csvExport';

// ── Data section definitions ────────────────────────────────────
const MEMBER_SECTIONS = [
  { id: 'personal',   label: 'Personal Information',      desc: 'name, DOB, age, gender' },
  { id: 'contact',    label: 'Contact Details',            desc: 'email, phone, address' },
  { id: 'parent',     label: 'Parent / Guardian',          desc: 'parent name, email, phone, secondary contact' },
  { id: 'player',     label: 'Player Profile',             desc: 'position, jersey number' },
  { id: 'team_squad', label: 'Team & Squad',               desc: 'team name, squad name, age group' },
  { id: 'training',   label: 'Training Schedule',          desc: 'venue, court, day, time' },
  { id: 'attendance', label: 'Attendance Summary',         desc: 'sessions, rate %, present / absent / late', live: true },
  { id: 'medical',    label: 'Medical Information',        desc: 'conditions, medication, other notes' },
  { id: 'notes',      label: 'Notes',                      desc: 'admin notes' },
];

const TEAM_SECTIONS = [
  { id: 'basic',    label: 'Team Details',      desc: 'name, age group, gender, program, season' },
  { id: 'training', label: 'Training Schedule', desc: 'venue, court, day, start / end time' },
  { id: 'counts',   label: 'Member Count',      desc: 'active member count' },
];

const SQUAD_SECTIONS = [
  { id: 'basic',  label: 'Squad Details', desc: 'name, age group, season, status' },
  { id: 'counts', label: 'Counts',        desc: 'team count, member count' },
];

function getAge(dob) {
  if (!dob) return '';
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

function getSquadForTeam(squads, teamId) {
  return squads.find(s => { try { return JSON.parse(s.team_ids || '[]').includes(teamId); } catch { return false; } });
}

function getSquadTeamIds(sq) {
  try { return JSON.parse(sq.team_ids || '[]'); } catch { return []; }
}

// ── Step indicator ──────────────────────────────────────────────
function Steps({ current, total }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${i + 1 === current ? 'w-6 bg-blue-600' : i + 1 < current ? 'w-3 bg-blue-300' : 'w-3 bg-slate-200'}`} />
      ))}
    </div>
  );
}

// ── Section checkbox ────────────────────────────────────────────
function SectionToggle({ section, checked, onToggle }) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="w-4 h-4 accent-blue-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{section.label}</p>
        <p className="text-xs text-slate-400">{section.desc}</p>
      </div>
      {section.live && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium shrink-0">Live</span>}
    </label>
  );
}

// ── Main modal ──────────────────────────────────────────────────
export default function CustomReportModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [scope, setScope] = useState('members');
  const [recordFilter, setRecordFilter] = useState('all'); // 'all' | 'by_team' | 'by_squad'
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set());
  const [selectedSquadIds, setSelectedSquadIds] = useState(new Set());
  const [sections, setSections] = useState(new Set(['personal', 'contact', 'team_squad']));
  const [exporting, setExporting] = useState(false);

  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [squads, setSquads] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date'),
      db.entities.Team.filterAll({ visibility: 'Club' }, '-created_date'),
      db.entities.Squad.list('-created_date', 200).catch(() => []),
    ]).then(([m, t, sq]) => {
      setMembers(m); setTeams(t); setSquads(sq);
      // default all selected
      setSelectedTeamIds(new Set(t.map(x => x.id)));
      setSelectedSquadIds(new Set(sq.map(x => x.id)));
      setDataLoading(false);
    }).catch(() => {
      toast.error("Couldn't load report data. Please close and try again.");
      setDataLoading(false);
    });
  }, []);

  const toggleTeam = id => setSelectedTeamIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSquad = id => setSelectedSquadIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSection = id => setSections(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Derived: which records will be exported
  const getTargetMembers = () => {
    if (scope !== 'members') return [];
    if (recordFilter === 'all') return members;
    if (recordFilter === 'by_team') return members.filter(m => selectedTeamIds.has(m.team_id));
    if (recordFilter === 'by_squad') {
      const teamIds = squads.filter(sq => selectedSquadIds.has(sq.id)).flatMap(getSquadTeamIds);
      return members.filter(m => teamIds.includes(m.team_id));
    }
    return members;
  };

  const getTargetTeams = () => scope === 'teams' ? teams.filter(t => selectedTeamIds.has(t.id)) : [];
  const getTargetSquads = () => scope === 'squads' ? squads.filter(sq => selectedSquadIds.has(sq.id)) : [];

  const recordCount = scope === 'members' ? getTargetMembers().length
    : scope === 'teams' ? getTargetTeams().length
    : getTargetSquads().length;

  const currentSections = scope === 'members' ? MEMBER_SECTIONS : scope === 'teams' ? TEAM_SECTIONS : SQUAD_SECTIONS;

  // When scope changes, reset sections to sensible defaults
  const handleScopeChange = (s) => {
    setScope(s);
    if (s === 'members') setSections(new Set(['personal', 'contact', 'team_squad']));
    else if (s === 'teams') setSections(new Set(['basic', 'training']));
    else setSections(new Set(['basic', 'counts']));
  };

  const doExport = async () => {
    setExporting(true);
    try {
    let rows = [];

    if (scope === 'members') {
      const targets = getTargetMembers();
      let attMap = {};
      if (sections.has('attendance')) {
        const targetTeamIds = [...new Set(targets.map(m => m.team_id).filter(Boolean))];
        // Single batched query (team_id IN [...]) instead of one request per team,
        // and no per-team row cap so large clubs don't get truncated attendance stats.
        const attResults = targetTeamIds.length > 0
          ? await db.entities.AttendanceRecord.filterAll({ team_id: targetTeamIds }, '-date').catch(() => [])
          : [];
        // Deduplicate by (player_id, session_id) — last record wins
        const dedupMap = new Map();
        attResults.forEach(r => {
          const pid = r.player_id || r.member_id;
          if (pid && r.session_id) dedupMap.set(`${pid}:${r.session_id}`, r);
        });
        dedupMap.forEach(r => {
          const key = r.member_id || r.player_id;
          if (key) { if (!attMap[key]) attMap[key] = []; attMap[key].push(r); }
        });
      }
      rows = targets.map(m => {
        const row = {};
        const team = teams.find(t => t.id === m.team_id);
        const squad = getSquadForTeam(squads, m.team_id);
        if (sections.has('personal'))   Object.assign(row, { name: m.name||'', date_of_birth: m.date_of_birth||'', age: getAge(m.date_of_birth), gender: m.gender||'' });
        if (sections.has('contact'))    Object.assign(row, { email: m.email||'', phone: m.phone||'', address: m.address||'' });
        if (sections.has('parent'))     Object.assign(row, { parent_name: m.parent_name||'', parent_email: m.parent_email||'', parent_phone: m.parent_phone||'', secondary_contact: m.secondary_contact_name||'' });
        if (sections.has('player'))     Object.assign(row, { position: m.position||'', jersey_number: m.jersey_number||'' });
        if (sections.has('team_squad')) Object.assign(row, { team: team?.team_name||'', squad: squad?.name||'', age_group: team?.age_group||'' });
        if (sections.has('training'))   Object.assign(row, { training_venue: team?.training_venue||'', training_court: team?.training_court||'', training_day: team?.training_day||'', training_start: team?.training_start_time||'', training_end: team?.training_end_time||'' });
        if (sections.has('attendance')) {
          const mAtt = attMap[m.id] || [];
          const present = mAtt.filter(r => r.status === 'Present').length;
          const absent  = mAtt.filter(r => r.status === 'Absent').length;
          const late    = mAtt.filter(r => r.status === 'Late').length;
          const injured = mAtt.filter(r => r.status === 'Injured').length;
          const excused = mAtt.filter(r => r.status === 'Excused').length;
          const total   = mAtt.length;
          Object.assign(row, { sessions_recorded: new Set(mAtt.map(r => r.session_id)).size, attendance_rate_pct: total > 0 ? Math.round(((present+late+excused)/total)*100) : '', present, absent, late, injured, excused });
        }
        if (sections.has('medical'))    Object.assign(row, { medical_conditions: m.medical_conditions||'', medication: m.medication||'', other_conditions: m.other_conditions||'' });
        if (sections.has('notes'))      row.notes = m.notes||'';
        return row;
      });
    } else if (scope === 'teams') {
      const targets = getTargetTeams();
      const activeMembersByTeam = members.reduce((acc, m) => {
        if (m.status !== 'Archived') { acc[m.team_id] = (acc[m.team_id]||0) + 1; }
        return acc;
      }, {});
      rows = targets.map(t => {
        const row = {};
        if (sections.has('basic'))    Object.assign(row, { team_name: t.team_name||'', age_group: t.age_group||'', gender: t.gender||'', program_type: t.program_type||'', season: t.season||'', status: t.status||'' });
        if (sections.has('training')) Object.assign(row, { training_venue: t.training_venue||'', training_court: t.training_court||'', training_day: t.training_day||'', training_start_time: t.training_start_time||'', training_end_time: t.training_end_time||'' });
        if (sections.has('counts'))   row.member_count = activeMembersByTeam[t.id] || 0;
        return row;
      });
    } else {
      const targets = getTargetSquads();
      rows = targets.map(sq => {
        const teamIds = getSquadTeamIds(sq);
        const row = {};
        if (sections.has('basic'))  Object.assign(row, { name: sq.name||'', age_group: sq.age_group||'', season: sq.season||'', status: sq.status||'' });
        if (sections.has('counts')) Object.assign(row, { team_count: teamIds.length, member_count: members.filter(m => teamIds.includes(m.team_id) && m.status !== 'Archived').length });
        return row;
      });
    }

    downloadCSV(rows.length > 0 ? rows : [{ note: 'No records' }], `${scope}-report.csv`);
    onClose();
    } catch (e) {
      toast.error('Export failed: ' + (e?.message || 'unknown error') + '. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const canProceed = step === 1 ? true
    : step === 2 ? recordCount > 0
    : step === 3 ? sections.size > 0
    : true;

  const SCOPE_OPTIONS = [
    { id: 'members', label: 'Members',   desc: 'Export individual member records', count: members.length },
    { id: 'teams',   label: 'Team List', desc: 'Export team details and training', count: teams.length },
    { id: 'squads',  label: 'Squad List', desc: 'Export squad groupings',          count: squads.length },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-bold text-slate-900">Custom Report Builder</h3>
            <div className="flex items-center gap-3 mt-1.5">
              <Steps current={step} total={3} />
              <p className="text-xs text-slate-400">
                {step === 1 ? 'Choose what to export' : step === 2 ? 'Select records' : 'Choose data sections'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 ml-4"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {exporting ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Building your report…</p>
            </div>
          ) : dataLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Step 1: Scope ───────────────────────────────── */}
              {step === 1 && (
                <>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">What would you like to export?</p>
                  {SCOPE_OPTIONS.map(s => (
                    <button key={s.id} onClick={() => handleScopeChange(s.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-colors ${scope === s.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${scope === s.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                        {scope === s.id && <Check size={11} className="text-white" />}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800 text-sm">{s.label}</p>
                        <p className="text-xs text-slate-400">{s.desc}</p>
                      </div>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{s.count}</span>
                    </button>
                  ))}
                </>
              )}

              {/* ── Step 2: Records ─────────────────────────────── */}
              {step === 2 && scope === 'members' && (
                <>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Which members to include?</p>
                  {[
                    { id: 'all', label: 'All Members', desc: `${members.length} members across all teams` },
                    { id: 'by_team', label: 'Filter by Team', desc: 'Select specific teams' },
                    { id: 'by_squad', label: 'Filter by Squad', desc: 'Select specific squads' },
                  ].map(opt => (
                    <button key={opt.id} onClick={() => setRecordFilter(opt.id)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors ${recordFilter === opt.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${recordFilter === opt.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                        {recordFilter === opt.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{opt.label}</p>
                        <p className="text-xs text-slate-400">{opt.desc}</p>
                      </div>
                    </button>
                  ))}

                  {recordFilter === 'by_team' && teams.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-500">Select Teams</p>
                        <button onClick={() => setSelectedTeamIds(selectedTeamIds.size === teams.length ? new Set() : new Set(teams.map(t => t.id)))} className="text-xs text-blue-600 hover:underline">{selectedTeamIds.size === teams.length ? 'Deselect all' : 'Select all'}</button>
                      </div>
                      {teams.map(t => (
                        <label key={t.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${selectedTeamIds.has(t.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                          <input type="checkbox" checked={selectedTeamIds.has(t.id)} onChange={() => toggleTeam(t.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
                          <span className="text-sm font-medium text-slate-800">{t.team_name}</span>
                          {t.age_group && <span className="text-xs text-slate-400 ml-auto">{t.age_group}</span>}
                        </label>
                      ))}
                    </div>
                  )}

                  {recordFilter === 'by_squad' && squads.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-500">Select Squads</p>
                        <button onClick={() => setSelectedSquadIds(selectedSquadIds.size === squads.length ? new Set() : new Set(squads.map(s => s.id)))} className="text-xs text-blue-600 hover:underline">{selectedSquadIds.size === squads.length ? 'Deselect all' : 'Select all'}</button>
                      </div>
                      {squads.filter(s => s.status !== 'Archived').map(sq => (
                        <label key={sq.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${selectedSquadIds.has(sq.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                          <input type="checkbox" checked={selectedSquadIds.has(sq.id)} onChange={() => toggleSquad(sq.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
                          <span className="text-sm font-medium text-slate-800">{sq.name}</span>
                          {sq.age_group && <span className="text-xs text-slate-400 ml-auto">{sq.age_group}</span>}
                        </label>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-slate-400 text-center pt-1">{recordCount} member{recordCount !== 1 ? 's' : ''} will be included</p>
                </>
              )}

              {step === 2 && scope === 'teams' && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Teams</p>
                    <button onClick={() => setSelectedTeamIds(selectedTeamIds.size === teams.length ? new Set() : new Set(teams.map(t => t.id)))} className="text-xs text-blue-600 hover:underline">{selectedTeamIds.size === teams.length ? 'Deselect all' : 'Select all'}</button>
                  </div>
                  {teams.map(t => (
                    <label key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedTeamIds.has(t.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input type="checkbox" checked={selectedTeamIds.has(t.id)} onChange={() => toggleTeam(t.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
                      <span className="text-sm font-medium text-slate-800 flex-1">{t.team_name}</span>
                      {t.age_group && <span className="text-xs text-slate-400">{t.age_group}</span>}
                      {t.gender && <span className="text-xs text-slate-400">{t.gender}</span>}
                    </label>
                  ))}
                  <p className="text-xs text-slate-400 text-center pt-1">{recordCount} team{recordCount !== 1 ? 's' : ''} selected</p>
                </>
              )}

              {step === 2 && scope === 'squads' && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Squads</p>
                    <button onClick={() => setSelectedSquadIds(selectedSquadIds.size === squads.length ? new Set() : new Set(squads.map(s => s.id)))} className="text-xs text-blue-600 hover:underline">{selectedSquadIds.size === squads.length ? 'Deselect all' : 'Select all'}</button>
                  </div>
                  {squads.filter(s => s.status !== 'Archived').map(sq => (
                    <label key={sq.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedSquadIds.has(sq.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input type="checkbox" checked={selectedSquadIds.has(sq.id)} onChange={() => toggleSquad(sq.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
                      <span className="text-sm font-medium text-slate-800 flex-1">{sq.name}</span>
                      {sq.age_group && <span className="text-xs text-slate-400">{sq.age_group}</span>}
                    </label>
                  ))}
                  <p className="text-xs text-slate-400 text-center pt-1">{recordCount} squad{recordCount !== 1 ? 's' : ''} selected</p>
                </>
              )}

              {/* ── Step 3: Data Sections ───────────────────────── */}
              {step === 3 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Choose data to include</p>
                    <button onClick={() => setSections(sections.size === currentSections.length ? new Set() : new Set(currentSections.map(s => s.id)))} className="text-xs text-blue-600 hover:underline">{sections.size === currentSections.length ? 'Deselect all' : 'Select all'}</button>
                  </div>
                  {currentSections.map(s => (
                    <SectionToggle key={s.id} section={s} checked={sections.has(s.id)} onToggle={() => toggleSection(s.id)} />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 font-semibold">
              <ChevronLeft size={15} /> Back
            </button>
          ) : (
            <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 font-semibold">Cancel</button>
          )}

          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed || dataLoading}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={doExport} disabled={exporting || sections.size === 0 || recordCount === 0}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {exporting ? <><Loader2 size={14} className="animate-spin" /> Exporting…</> : <><Download size={14} /> Export {recordCount} {scope === 'members' ? 'member' : scope === 'teams' ? 'team' : 'squad'}{recordCount !== 1 ? 's' : ''}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
