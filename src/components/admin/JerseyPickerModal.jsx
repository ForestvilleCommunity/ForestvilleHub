/**
 * JerseyPickerModal
 * Grid of 00+0–99 with full conflict awareness:
 *   Red    = same-team taken (disabled)
 *   Orange = would create District cross-year conflict (±1 birth year, same gender)
 *   Purple = would create cross-scope note (District ↔ Domestic, ±1 year, same gender)
 *   Amber  = would create Domestic cross-year reminder
 *   Green  = fully free
 */
import { useMemo, useState } from 'react';
import { X, Check } from 'lucide-react';
import { db } from '@/api/db';

const NUMBERS = ['00', ...Array.from({ length: 100 }, (_, i) => String(i))];
const getBirthYear = (dob) => dob ? new Date(dob + 'T00:00:00').getFullYear() : null;

export default function JerseyPickerModal({ member, teamMembers, allMembers, teams, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(String(member.jersey_number ?? ''));

  const teamMap = useMemo(() =>
    (teams || []).reduce((acc, t) => { acc[t.id] = t; return acc; }, {}),
  [teams]);

  // Same-team numbers taken by others
  const sameTeamTaken = useMemo(() => {
    const s = new Set();
    teamMembers.forEach(m => {
      if (m.id !== member.id && m.jersey_number != null && m.jersey_number !== '')
        s.add(String(m.jersey_number));
    });
    return s;
  }, [teamMembers, member.id]);

  // Pre-compute conflict severity for every candidate number
  const conflictMap = useMemo(() => {
    if (!allMembers) return {};
    const memberYear   = getBirthYear(member.date_of_birth);
    const memberGender = teamMap[member.team_id]?.gender || member.gender || 'Male';
    const memberScope  = teamMap[member.team_id]?.program_type === 'District' ? 'District' : 'Domestic';

    const map = {};
    NUMBERS.forEach(num => {
      if (sameTeamTaken.has(num)) { map[num] = 'taken'; return; }

      const others = allMembers.filter(m =>
        m.id !== member.id &&
        m.status !== 'Archived' &&
        m.team_id &&
        String(m.jersey_number) === num
      );

      if (!others.length || memberYear == null) return;

      // Same gender, birth year within ±1
      const nearSameGender = others.filter(m => {
        const mg = teamMap[m.team_id]?.gender || m.gender || 'Male';
        const yr = getBirthYear(m.date_of_birth);
        return mg === memberGender && yr != null && Math.abs(yr - memberYear) <= 1;
      });

      if (!nearSameGender.length) return;

      const hasDistrict = nearSameGender.some(m => teamMap[m.team_id]?.program_type === 'District');
      const hasDomestic = nearSameGender.some(m => teamMap[m.team_id]?.program_type !== 'District');

      if (memberScope === 'District' && hasDistrict)      map[num] = 'district';
      else if (memberScope === 'Domestic' && hasDomestic) map[num] = 'domestic';
      else if (hasDistrict || hasDomestic)                map[num] = 'cross';
    });
    return map;
  }, [allMembers, member, teamMap, sameTeamTaken]);

  const current = String(member.jersey_number ?? '');

  const save = async () => {
    if (!selected || selected === current) { onClose(); return; }
    setSaving(true);
    await db.entities.Member.update(member.id, {
      jersey_number: selected === '' ? null : (selected === '00' ? '00' : Number(selected)),
    });
    onSaved?.();
    onClose();
  };

  const cellClass = (num) => {
    if (num === selected)
      return 'bg-blue-600 text-white font-black border-blue-700 scale-110 shadow-md';
    const conflict = conflictMap[num];
    if (conflict === 'taken')
      return 'bg-red-100 text-red-500 font-semibold border-red-200 opacity-70 cursor-not-allowed';
    if (num === current)
      return 'bg-blue-100 text-blue-800 font-bold border-blue-300 hover:bg-blue-200 cursor-pointer';
    if (conflict === 'district')
      return 'bg-orange-100 text-orange-700 font-semibold border-orange-300 hover:bg-orange-200 cursor-pointer';
    if (conflict === 'cross')
      return 'bg-purple-50 text-purple-700 font-semibold border-purple-300 hover:bg-purple-100 cursor-pointer';
    if (conflict === 'domestic')
      return 'bg-amber-50 text-amber-700 font-semibold border-amber-200 hover:bg-amber-100 cursor-pointer';
    return 'bg-green-50 text-green-800 font-semibold border-green-200 hover:bg-green-100 cursor-pointer';
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="font-bold text-slate-900 text-sm">Reassign Jersey</p>
            <p className="text-xs text-slate-500 mt-0.5">{member.name} — currently #{member.jersey_number ?? '—'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-100 text-[10px] shrink-0 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block" />Free</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" />Taken</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100 border border-orange-300 inline-block" />District conflict</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-50 border border-purple-300 inline-block" />Cross-scope</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block" />Domestic reminder</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600 inline-block" />Selected</span>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto p-4 flex-1">
          <div className="grid grid-cols-8 gap-1.5">
            {NUMBERS.map(num => {
              const isTaken = conflictMap[num] === 'taken';
              return (
                <button
                  key={num}
                  disabled={isTaken}
                  onClick={() => !isTaken && setSelected(num)}
                  className={`aspect-square rounded-lg border text-xs transition-all ${cellClass(num)}`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 font-semibold">Cancel</button>
          <button onClick={save} disabled={saving || !selected || selected === current}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
            {saving ? 'Saving…' : <><Check size={14} /> Assign #{selected || '—'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
