/**
 * JerseyMatrix
 * Live number-assignment grid (jersey 00–99 × birth year) + FEBC-style Excel export.
 * Conflict scope: same competition type (District = hard, other = soft) × birth year ±1.
 */
import { useMemo, useState } from 'react';
import { Download, Grid3x3 } from 'lucide-react';
import * as XLSX from 'xlsx';

const getBirthYear    = (dob) => dob ? new Date(dob + 'T00:00:00').getFullYear() : null;
const getScope        = (team) => team?.program_type === 'District' ? 'District' : 'Domestic';
const getMemberGender = (m, teamMap) => teamMap[m.team_id]?.gender || m.gender || 'Male';

// Returns conflict sets matching the 4 severities used in JerseyConflictReport:
//   hard  = District cross-year ±1
//   soft  = Domestic cross-year ±1
//   cross = District ↔ Domestic cross-year ±1 (purple)
//   (same-team hard conflicts are subsumed into `hard`)
function buildConflictSet(active, teamMap) {
  // sameTeam=red, district=orange, soft=amber, cross=purple
  const conflicting = { sameTeam: new Set(), district: new Set(), soft: new Set(), cross: new Set() };

  // Same-team conflicts
  const byTeamJersey = {};
  active.forEach(m => {
    const key = `${m.team_id}__${m.jersey_number}`;
    (byTeamJersey[key] = byTeamJersey[key] || []).push(m);
  });
  Object.values(byTeamJersey).forEach(group => {
    if (group.length > 1) group.forEach(m => conflicting.sameTeam.add(m.id));
  });

  // Within-scope cross-year (District or Domestic) — gender-separated
  const byKey = {};
  active.forEach(m => {
    const yr = getBirthYear(m.date_of_birth);
    if (yr == null) return;
    const scope  = getScope(teamMap[m.team_id]);
    const gender = getMemberGender(m, teamMap);
    const key = `${scope}__${gender}__${m.jersey_number}`;
    (byKey[key] = byKey[key] || []).push({ ...m, _yr: yr });
  });
  Object.entries(byKey).forEach(([key, group]) => {
    const scope = key.split('__')[0];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (Math.abs(group[i]._yr - group[j]._yr) <= 1) {
          const target = scope === 'District' ? conflicting.district : conflicting.soft;
          target.add(group[i].id);
          target.add(group[j].id);
        }
      }
    }
  });

  // Cross-scope (District ↔ Domestic) — still gender-separated
  const byJersey = {};
  active.forEach(m => {
    const yr = getBirthYear(m.date_of_birth);
    if (yr == null) return;
    const gender = getMemberGender(m, teamMap);
    const key = `${gender}__${m.jersey_number}`;
    (byJersey[key] = byJersey[key] || []).push({ ...m, _yr: yr });
  });
  Object.values(byJersey).forEach(group => {
    const district = group.filter(m => teamMap[m.team_id]?.program_type === 'District');
    const domestic = group.filter(m => teamMap[m.team_id]?.program_type !== 'District');
    for (const d of district) {
      for (const o of domestic) {
        if (Math.abs(d._yr - o._yr) <= 1) {
          conflicting.cross.add(d.id);
          conflicting.cross.add(o.id);
        }
      }
    }
  });

  return conflicting;
}

// Jersey order: "00" first, then 0–99
const JERSEY_ROWS = ['00', ...Array.from({ length: 100 }, (_, i) => String(i))];

function exportToExcel(members, teamMap) {
  const wb = XLSX.utils.book_new();
  const conflicting = buildConflictSet(
    members.filter(m => m.jersey_number != null && m.jersey_number !== '' && m.status !== 'Archived' && m.team_id && getBirthYear(m.date_of_birth)),
    teamMap
  );

  ['Male', 'Female'].forEach(gender => {
    const gMembers = members.filter(m => {
      if (m.status === 'Archived' || !m.team_id || m.jersey_number == null || m.jersey_number === '' || !getBirthYear(m.date_of_birth)) return false;
      const tg = teamMap[m.team_id]?.gender || m.gender || 'Male';
      return gender === 'Male' ? tg !== 'Female' : tg === 'Female';
    });

    const years = [...new Set(gMembers.map(m => getBirthYear(m.date_of_birth)).filter(Boolean))].sort((a, b) => a - b);
    if (!years.length) return;

    // Age group row (row 1): derive from team age_group
    const ageGroupRow = [gender === 'Male' ? 'Boys' : 'Girls', ...years.map(yr => {
      const match = gMembers.find(m => getBirthYear(m.date_of_birth) === yr);
      return teamMap[match?.team_id]?.age_group || '';
    })];
    const yearRow = [null, ...years];

    // Build lookup: jersey → year → names
    const lookup = {};
    gMembers.forEach(m => {
      const yr  = getBirthYear(m.date_of_birth);
      const num = String(m.jersey_number);
      const scope = getScope(teamMap[m.team_id]);
      const suffix = scope === 'District' ? '' : ' (Dom)';
      if (!lookup[num]) lookup[num] = {};
      if (!lookup[num][yr]) lookup[num][yr] = [];
      lookup[num][yr].push(m.name + suffix);
    });

    // Only rows that have at least one name (matches the matrix display)
    const activeNums = JERSEY_ROWS.filter(num => lookup[num] && Object.keys(lookup[num]).length > 0);
    const dataRows = activeNums.map(num => [
      num,
      ...years.map(yr => (lookup[num]?.[yr] || []).join(' / ') || null),
    ]);

    const aoa = [ageGroupRow, yearRow, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Force jersey number column (A, col 0) to be text so '00' and '0' don't collapse
    activeNums.forEach((num, i) => {
      const addr = XLSX.utils.encode_cell({ r: i + 2, c: 0 });
      if (ws[addr]) { ws[addr].t = 's'; ws[addr].v = num; ws[addr].w = num; }
    });

    // --- Styling ---
    const numCols = years.length + 1;
    const numRows = aoa.length;

    // Column widths
    ws['!cols'] = [{ wch: 6 }, ...years.map(() => ({ wch: 22 }))];

    // Cell styles (xlsx community edition supports limited styling via xl/styles)
    // We'll use the standard approach: set fill on conflict cells
    for (let r = 2; r < numRows; r++) {  // data rows start at index 2
      const num = activeNums[r - 2];
      for (let c = 1; c < numCols; c++) {
        const yr = years[c - 1];
        const members_here = gMembers.filter(m =>
          String(m.jersey_number) === num && getBirthYear(m.date_of_birth) === yr
        );
        if (!members_here.length) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        const isSameTeam = members_here.some(m => conflicting.sameTeam.has(m.id));
        const isDistrict = !isSameTeam && members_here.some(m => conflicting.district.has(m.id));
        const isCross    = !isSameTeam && !isDistrict && members_here.some(m => conflicting.cross.has(m.id));
        const isSoft     = !isSameTeam && !isDistrict && !isCross && members_here.some(m => conflicting.soft.has(m.id));
        if (isSameTeam || isDistrict || isCross || isSoft) {
          if (!ws[addr]) ws[addr] = { v: aoa[r][c], t: 's' };
          ws[addr].s = {
            fill: { fgColor: { rgb: isSameTeam ? 'FFCDD2' : isDistrict ? 'FFEDD5' : isCross ? 'E9D5FF' : 'FFF9C4' } },
            font: { bold: true, color: { rgb: isSameTeam ? 'B71C1C' : isDistrict ? 'C2410C' : isCross ? '6B21A8' : '827717' } },
          };
        }
      }
    }

    // Header styling
    for (let c = 0; c < numCols; c++) {
      ['00', '01'].forEach((rIdx, ri) => {
        const addr = XLSX.utils.encode_cell({ r: ri, c });
        if (!ws[addr]) return;
        ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E3F2FD' } } };
      });
    }

    XLSX.utils.book_append_sheet(wb, ws, gender === 'Male' ? 'Boys' : 'Girls');
  });

  XLSX.writeFile(wb, 'FEBC_Jersey_Numbers.xlsx');
}

export default function JerseyMatrix({ members, teams }) {
  const [genderFilter, setGenderFilter] = useState('All');
  const [scopeFilter,  setScopeFilter]  = useState('All');

  const teamMap = useMemo(() =>
    teams.reduce((acc, t) => { acc[t.id] = t; return acc; }, {}),
  [teams]);

  const active = useMemo(() =>
    members.filter(m =>
      m.jersey_number != null && m.jersey_number !== '' &&
      m.status !== 'Archived' && m.team_id &&
      getBirthYear(m.date_of_birth)
    ),
  [members]);

  const conflicting = useMemo(() => buildConflictSet(active, teamMap), [active, teamMap]);

  // Filtered members for display — use team.gender (set by import or auto-assign)
  const displayMembers = useMemo(() => active.filter(m => {
    if (genderFilter !== 'All') {
      const tg = teamMap[m.team_id]?.gender || m.gender || 'Male';
      if (tg !== genderFilter) return false;
    }
    if (scopeFilter !== 'All' && getScope(teamMap[m.team_id]) !== scopeFilter) return false;
    return true;
  }), [active, genderFilter, scopeFilter, teamMap]);

  // Birth years from filtered set
  const years = useMemo(() =>
    [...new Set(displayMembers.map(m => getBirthYear(m.date_of_birth)))].sort((a, b) => a - b),
  [displayMembers]);

  // Lookup: jersey → year → members
  const lookup = useMemo(() => {
    const map = {};
    displayMembers.forEach(m => {
      const num = String(m.jersey_number);
      const yr  = getBirthYear(m.date_of_birth);
      if (!map[num]) map[num] = {};
      if (!map[num][yr]) map[num][yr] = [];
      map[num][yr].push(m);
    });
    return map;
  }, [displayMembers]);

  // Rows that have at least one entry (to keep the grid lean)
  const activeRows = useMemo(() =>
    JERSEY_ROWS.filter(num => lookup[num] && Object.keys(lookup[num]).length > 0),
  [lookup]);

  if (active.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-6">
        <Grid3x3 size={32} className="text-slate-200" />
        <p className="text-sm text-slate-400">No members with jersey numbers and birth dates yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
          {['All', 'Male', 'Female'].map(g => (
            <button key={g} onClick={() => setGenderFilter(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${genderFilter === g ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              {g === 'All' ? 'All' : g === 'Male' ? 'Boys' : 'Girls'}
            </button>
          ))}
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
          {['All', 'District', 'Domestic'].map(s => (
            <button key={s} onClick={() => setScopeFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${scopeFilter === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-200 border border-red-400 inline-block" />Same-team</span>
            <span className="flex items-center gap-1 ml-1"><span className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-300 inline-block" />District cross-year</span>
            <span className="flex items-center gap-1 ml-1"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" />Domestic cross-year</span>
            <span className="flex items-center gap-1 ml-1"><span className="w-3 h-3 rounded-sm bg-purple-200 border border-purple-400 inline-block" />Cross-scope reminder</span>
          </div>
          <button
            onClick={() => exportToExcel(members, teamMap)}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-2 rounded-xl transition-colors">
            <Download size={13} /> Export XLSX
          </button>
        </div>
      </div>

      {/* Matrix grid */}
      {years.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No data for selected filters.</p>
      ) : (
        <div className="overflow-auto rounded-2xl border border-slate-200 max-h-[60vh]">
          <table className="text-xs border-collapse" style={{ minWidth: years.length * 130 + 60 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 text-white">
                <th className="sticky left-0 z-20 bg-slate-800 text-center px-2 py-2 border-r border-slate-700 font-bold w-12">#</th>
                {years.map(yr => (
                  <th key={yr} className="px-2 py-2 border-r border-slate-700 font-bold text-center min-w-[130px]">
                    <div>{yr}</div>
                    <div className="text-slate-400 font-normal text-[10px]">
                      {(() => {
                        const sample = displayMembers.find(m => getBirthYear(m.date_of_birth) === yr);
                        return teamMap[sample?.team_id]?.age_group || '';
                      })()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeRows.map((num, ri) => (
                <tr key={num} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="sticky left-0 z-10 bg-inherit text-center font-black text-slate-600 px-2 py-1.5 border-r border-slate-200 border-b border-b-slate-100">
                    {num}
                  </td>
                  {years.map(yr => {
                    const cell = lookup[num]?.[yr] || [];
                    const isSameTeam = cell.some(m => conflicting.sameTeam.has(m.id));
                    const isDistrict = !isSameTeam && cell.some(m => conflicting.district.has(m.id));
                    // Cross-scope (purple) only when this cell itself has a district+domestic mix
                    const cellCrossed = !isSameTeam && !isDistrict && cell.some(m => conflicting.cross.has(m.id));
                    const cellHasDistrict = cell.some(m => teamMap[m.team_id]?.program_type === 'District');
                    const cellHasDomestic = cell.some(m => teamMap[m.team_id]?.program_type !== 'District');
                    const isCross = cellCrossed && cellHasDistrict && cellHasDomestic;
                    const isSoft  = !isSameTeam && !isDistrict && !isCross && cell.some(m => conflicting.soft.has(m.id));
                    const bg      = isSameTeam ? 'bg-red-100'    : isDistrict ? 'bg-orange-100' : isCross ? 'bg-purple-50'  : isSoft ? 'bg-amber-50'  : '';
                    const border  = isSameTeam ? 'border border-red-300' : isDistrict ? 'border border-orange-300' : isCross ? 'border border-purple-200' : isSoft ? 'border border-amber-200' : '';
                    const textCol = isSameTeam ? 'text-red-800'  : isDistrict ? 'text-orange-800' : isCross ? 'text-purple-800' : isSoft ? 'text-amber-800' : 'text-slate-800';
                    return (
                      <td key={yr} className={`px-2 py-1.5 border-r border-slate-100 border-b border-b-slate-100 align-top ${bg} ${border}`}>
                        {cell.map((m, i) => {
                          const scope = getScope(teamMap[m.team_id]);
                          return (
                            <div key={i} className="leading-tight">
                              <span className={`font-semibold ${textCol}`}>{m.name}</span>
                              {scope === 'Domestic' && (
                                <span className="text-slate-400 font-normal"> (Dom)</span>
                              )}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        Only rows with assignments shown · (Dom) = Domestic · Red = Same-team · Orange = District conflict · Amber = Domestic conflict · Purple = Cross-scope reminder
      </p>
    </div>
  );
}
