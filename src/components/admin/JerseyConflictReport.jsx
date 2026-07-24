import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Download, ChevronDown, ChevronUp, Info, Hash } from 'lucide-react';
import { downloadCSV } from '@/lib/csvExport';
import JerseyPickerModal from './JerseyPickerModal';

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

function pluralise(n, s, p) { return `${n} ${n === 1 ? s : p}`; }

const getBirthYear  = (dob) => dob ? new Date(dob + 'T00:00:00').getFullYear() : null;
// Gender comes from the team record; fall back to member gender
const getMemberGender = (m, teamMap) => teamMap[m.team_id]?.gender || m.gender || 'Male';

function ConflictGroup({ title, subtitle, conflicts, severity, onExport, onReassign }) {
  const [open, setOpen] = useState(false);
  const count = conflicts.length;
  const isWarn     = severity === 'warn';
  const isCross    = severity === 'cross';
  const isDistrict = severity === 'district';
  const col = isCross
    ? { bg: 'bg-purple-500',  light: 'bg-purple-50',  border: 'border-purple-200',  badge: 'bg-purple-500',  ring: 'border-l-purple-300',  text: 'text-purple-700',  dot: 'bg-purple-100 text-purple-700' }
    : isWarn
    ? { bg: 'bg-amber-500',   light: 'bg-amber-50',   border: 'border-amber-200',   badge: 'bg-amber-500',   ring: 'border-l-amber-300',   text: 'text-amber-700',   dot: 'bg-amber-100 text-amber-700' }
    : isDistrict
    ? { bg: 'bg-orange-500',  light: 'bg-orange-50',  border: 'border-orange-200',  badge: 'bg-orange-500',  ring: 'border-l-orange-300',  text: 'text-orange-700',  dot: 'bg-orange-100 text-orange-700' }
    : { bg: 'bg-red-500',     light: 'bg-red-50',     border: 'border-red-200',     badge: 'bg-red-500',     ring: 'border-l-red-200',     text: 'text-red-700',     dot: 'bg-red-100 text-red-700' };

  if (count === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
        <CheckCircle size={18} className="text-green-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-green-600 font-medium">No conflicts — all clear</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border ${col.border} overflow-hidden`}>
      <div className="w-full flex items-center gap-3 px-4 py-4 text-left">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${col.bg}`}>
          {isCross || isWarn ? <Info size={15} className="text-white" /> : <AlertTriangle size={15} className="text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className={`text-xs font-black px-2.5 py-1 rounded-full ${col.badge} text-white shrink-0`}>
          {pluralise(count, 'conflict', 'conflicts')}
        </span>
        <button onClick={() => setOpen(o => !o)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
          {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {conflicts.map((conflict, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{conflict.context}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.dot}`}>#{conflict.number}</span>
                {conflict.yearRange && (
                  <span className="text-xs text-slate-400 font-medium">{conflict.yearRange}</span>
                )}
              </div>
              <div className="space-y-1">
                {conflict.records.map((r, j) => (
                  <div key={j} className={`flex items-center gap-2 pl-2 border-l-2 ${col.ring}`}>
                    <div className={`w-6 h-6 ${col.dot} rounded-lg flex items-center justify-center font-black text-xs shrink-0`}>
                      {r.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-slate-800">{r.name}</span>
                      {r.sub && <span className="text-xs text-slate-400 ml-2">{r.sub}</span>}
                    </div>
                    {onReassign && r.id && (
                      <button onClick={() => onReassign(r.id, r._teamId || conflict._teamId)}
                        className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors">
                        <Hash size={9} /> Reassign
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {onExport && (
            <div className="px-4 py-3 bg-slate-50">
              <button onClick={onExport}
                className="flex items-center gap-1.5 text-xs text-blue-600 font-bold hover:text-blue-700">
                <Download size={12} /> Export conflicts CSV
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const BOARD_TEAM = /\bboard\b/i;

function UnassignedSection({ members, teams, allMembers, onAssign }) {
  const [open, setOpen] = useState(false);
  const teamMap = useMemo(() => (teams || []).reduce((acc, t) => { acc[t.id] = t; return acc; }, {}), [teams]);
  // Exclude archived and board-team members — board roles don't need jerseys
  const unassigned = members.filter(m =>
    m.status !== 'Archived' &&
    (m.jersey_number == null || m.jersey_number === '') &&
    !BOARD_TEAM.test(teamMap[m.team_id]?.team_name || '')
  );
  if (!unassigned.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 transition-colors text-left">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-400">
          <Info size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">No Jersey Assigned</p>
          <p className="text-xs text-slate-500">Active members without a jersey number (board teams excluded)</p>
        </div>
        <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-400 text-white shrink-0">
          {unassigned.length} member{unassigned.length !== 1 ? 's' : ''}
        </span>
        {open ? <ChevronUp size={15} className="text-slate-400 shrink-0" /> : <ChevronDown size={15} className="text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {unassigned.map(m => (
            <div key={m.id} className="flex items-center gap-2 px-4 py-2.5">
              <div className="w-6 h-6 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center font-black text-xs shrink-0">
                {m.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span className="text-sm text-slate-800 font-medium flex-1">{m.name}</span>
              {onAssign && (
                <button onClick={() => onAssign(m.id, m.team_id)}
                  className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors">
                  <Hash size={9} /> Assign
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JerseyConflictReport({ members, teams, onMemberUpdated }) {
  const [pickerTarget, setPickerTarget] = useState(null); // { member, teamMembers }

  const teamMap = useMemo(() =>
    teams.reduce((acc, t) => { acc[t.id] = t; return acc; }, {}),
  [teams]);

  const active = useMemo(() =>
    members.filter(m =>
      m.jersey_number != null && m.jersey_number !== '' &&
      m.status !== 'Archived' && m.team_id
    ),
  [members]);

  // ── 1. Same-team conflicts (always hard) ──────────────────────────────────
  const sameTeamConflicts = useMemo(() => {
    const grouped = groupBy(active, m => `${m.team_id}__${m.jersey_number}`);
    return Object.entries(grouped)
      .filter(([, g]) => g.length > 1)
      .map(([key, group]) => {
        const [teamId, numStr] = key.split('__');
        const team = teamMap[teamId];
        return {
          context: team?.team_name ?? 'Unknown Team',
          number: numStr,
          _teamId: teamId,
          records: group.map(m => ({
            id: m.id,
            name: m.name,
            initials: m.name?.charAt(0)?.toUpperCase() || '?',
            sub: m.position || null,
          })),
          _raw: group,
        };
      })
      .sort((a, b) => a.context.localeCompare(b.context) || Number(a.number) - Number(b.number));
  }, [active, teamMap]);

  // ── 2. Cross-team, cross-year (±1 year), by competition type ─────────────
  const crossYearConflicts = useMemo(() => {
    // Only members with a known birth year and team
    const withYear = active.filter(m => getBirthYear(m.date_of_birth));

    const byJerseyAndType = groupBy(withYear, m => {
      const progType = teamMap[m.team_id]?.program_type || '';
      const scope  = progType === 'District' ? 'District' : 'Domestic';
      const gender = getMemberGender(m, teamMap);
      return `${scope}__${gender}__${m.jersey_number}`;
    });

    const districtConflicts = [];
    const domesticConflicts = [];

    Object.entries(byJerseyAndType).forEach(([key, group]) => {
      const [scope, gender, numStr] = key.split('__');
      // Find all pairs within ±1 birth year (different members)
      const conflictingIds = new Set();
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const yA = getBirthYear(group[i].date_of_birth);
          const yB = getBirthYear(group[j].date_of_birth);
          if (Math.abs(yA - yB) <= 1) {
            conflictingIds.add(group[i].id);
            conflictingIds.add(group[j].id);
          }
        }
      }
      if (conflictingIds.size === 0) return;

      // Skip if already caught by same-team check
      const conflictGroup = group.filter(m => conflictingIds.has(m.id));
      const years = [...new Set(conflictGroup.map(m => getBirthYear(m.date_of_birth)))].sort();

      const entry = {
        context: `${scope} · ${gender} · #${numStr}`,
        number: numStr,
        _teamId: null,
        yearRange: `Born ${years[0]}–${years[years.length - 1]}`,
        records: conflictGroup.map(m => ({
          id: m.id,
          name: m.name,
          initials: m.name?.charAt(0)?.toUpperCase() || '?',
          sub: `${getBirthYear(m.date_of_birth)} · ${teamMap[m.team_id]?.team_name ?? ''}`,
          _teamId: m.team_id,
        })),
        _raw: conflictGroup,
      };

      if (scope === 'District') districtConflicts.push(entry);
      else domesticConflicts.push(entry);
    });

    const sort = arr => arr.sort((a, b) => Number(a.number) - Number(b.number));
    return { district: sort(districtConflicts), domestic: sort(domesticConflicts) };
  }, [active, teamMap]);

  // ── 3. Cross-scope warnings (District ↔ Domestic, ±1 year, soft purple) ──
  const crossScopeConflicts = useMemo(() => {
    const withYear = active.filter(m => getBirthYear(m.date_of_birth));
    // Group by gender + jersey so Boys and Girls never cross-flag each other
    const byJersey = groupBy(withYear, m => `${getMemberGender(m, teamMap)}__${m.jersey_number}`);
    const results = [];

    Object.entries(byJersey).forEach(([key, group]) => {
      const [, numStr] = key.split('__');
      const district = group.filter(m => teamMap[m.team_id]?.program_type === 'District');
      const domestic = group.filter(m => teamMap[m.team_id]?.program_type !== 'District');
      if (!district.length || !domestic.length) return;

      const conflictingIds = new Set();
      for (const d of district) {
        for (const o of domestic) {
          if (Math.abs(getBirthYear(d.date_of_birth) - getBirthYear(o.date_of_birth)) <= 1) {
            conflictingIds.add(d.id);
            conflictingIds.add(o.id);
          }
        }
      }
      if (conflictingIds.size === 0) return;

      const conflictGroup = group.filter(m => conflictingIds.has(m.id));
      const years = [...new Set(conflictGroup.map(m => getBirthYear(m.date_of_birth)))].sort();
      const sharedGender = getMemberGender(conflictGroup[0], teamMap);
      results.push({
        context: `Cross-Scope · ${sharedGender} · #${numStr}`,
        number: numStr,
        _teamId: null,
        yearRange: `Born ${years[0]}–${years[years.length - 1]}`,
        records: conflictGroup.map(m => ({
          id: m.id,
          name: m.name,
          initials: m.name?.charAt(0)?.toUpperCase() || '?',
          sub: `${getBirthYear(m.date_of_birth)} · ${teamMap[m.team_id]?.team_name ?? ''} · ${teamMap[m.team_id]?.program_type ?? ''}`,
          _teamId: m.team_id,
        })),
        _raw: conflictGroup,
      });
    });

    return results.sort((a, b) => Number(a.number) - Number(b.number));
  }, [active, teamMap]);

  const exportCSV = (conflicts, filename) => {
    downloadCSV(
      conflicts.flatMap(c => c._raw.map(m => ({
        jersey_number: c.number,
        member_name: m.name,
        birth_year: getBirthYear(m.date_of_birth) || '',
        team: teamMap[m.team_id]?.team_name || '',
        program_type: teamMap[m.team_id]?.program_type || '',
      }))),
      filename
    );
  };

  const totalHard  = sameTeamConflicts.length + crossYearConflicts.district.length;
  const totalSoft  = crossYearConflicts.domestic.length;
  const totalCross = crossScopeConflicts.length;

  const handleReassign = (memberId, teamId) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    const resolvedTeamId = teamId || member.team_id;
    const teamMembers = members.filter(m => m.team_id === resolvedTeamId && m.status !== 'Archived');
    setPickerTarget({ member, teamMembers });
  };

  return (
    <div className="space-y-4">
      {pickerTarget && (
        <JerseyPickerModal
          member={pickerTarget.member}
          teamMembers={pickerTarget.teamMembers}
          allMembers={members}
          teams={teams}
          onClose={() => setPickerTarget(null)}
          onSaved={() => { setPickerTarget(null); onMemberUpdated?.(); }}
        />
      )}
      {/* Summary banner */}
      <div className={`rounded-2xl p-4 flex items-center gap-3 ${
        totalHard > 0 ? 'bg-red-50 border border-red-200'
        : totalCross > 0 ? 'bg-purple-50 border border-purple-200'
        : totalSoft > 0 ? 'bg-amber-50 border border-amber-200'
        : 'bg-green-50 border border-green-200'
      }`}>
        {totalHard > 0
          ? <AlertTriangle size={20} className="text-red-600 shrink-0" />
          : totalCross > 0 || totalSoft > 0
            ? <Info size={20} className={totalCross > 0 ? 'text-purple-600 shrink-0' : 'text-amber-600 shrink-0'} />
            : <CheckCircle size={20} className="text-green-600 shrink-0" />
        }
        <div>
          <p className={`text-sm font-bold ${totalHard > 0 ? 'text-red-800' : totalCross > 0 ? 'text-purple-800' : totalSoft > 0 ? 'text-amber-800' : 'text-green-800'}`}>
            {totalHard === 0 && totalSoft === 0 && totalCross === 0
              ? 'No jersey conflicts found'
              : [
                  totalHard  > 0 && `${pluralise(totalHard,  'hard conflict',    'hard conflicts')}`,
                  totalCross > 0 && `${pluralise(totalCross, 'cross-scope note',  'cross-scope notes')}`,
                  totalSoft  > 0 && `${pluralise(totalSoft,  'domestic conflict', 'domestic conflicts')}`,
                ].filter(Boolean).join(' · ')
            }
          </p>
          <p className={`text-xs mt-0.5 ${totalHard > 0 ? 'text-red-600' : totalCross > 0 ? 'text-purple-600' : totalSoft > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {totalHard === 0 && totalSoft === 0 && totalCross === 0
              ? 'All jersey numbers are unique across teams and adjacent birth years'
              : 'Scoped by competition type and birth year ±1 year'
            }
          </p>
        </div>
      </div>

      {/* Same-team conflicts */}
      <ConflictGroup
        title="Same-Team Conflicts"
        subtitle="Two or more members on the same team sharing a jersey number"
        conflicts={sameTeamConflicts}
        severity="hard"
        onReassign={handleReassign}
        onExport={sameTeamConflicts.length > 0 ? () => exportCSV(sameTeamConflicts, 'jersey_same_team.csv') : null}
      />

      {/* District cross-year (hard) */}
      <ConflictGroup
        title="District — Cross-Year Conflicts"
        subtitle="District players with the same jersey number born within 1 year of each other"
        conflicts={crossYearConflicts.district}
        severity="district"
        onReassign={handleReassign}
        onExport={crossYearConflicts.district.length > 0 ? () => exportCSV(crossYearConflicts.district, 'jersey_district_conflicts.csv') : null}
      />

      {/* Domestic cross-year (amber conflict) */}
      <ConflictGroup
        title="Domestic — Cross-Year Conflicts"
        subtitle="Domestic players sharing a jersey number born within 1 year of each other"
        conflicts={crossYearConflicts.domestic}
        severity="warn"
        onReassign={handleReassign}
        onExport={crossYearConflicts.domestic.length > 0 ? () => exportCSV(crossYearConflicts.domestic, 'jersey_domestic_conflicts.csv') : null}
      />

      {/* Cross-scope District ↔ Domestic (purple reminder) */}
      <ConflictGroup
        title="Cross-Scope Reminder — District ↔ Domestic"
        subtitle="A District and a Domestic player share a jersey number and are born within 1 year of each other"
        conflicts={crossScopeConflicts}
        severity="cross"
        onReassign={handleReassign}
        onExport={crossScopeConflicts.length > 0 ? () => exportCSV(crossScopeConflicts, 'jersey_cross_scope.csv') : null}
      />

      {/* Unassigned members */}
      <UnassignedSection members={members} teams={teams} allMembers={members} onAssign={handleReassign} />

      <p className="text-xs text-slate-400 text-center pb-2">
        Scope: same competition type · birth year ±1 · active members only. Edit numbers from the member profile.
      </p>
    </div>
  );
}
