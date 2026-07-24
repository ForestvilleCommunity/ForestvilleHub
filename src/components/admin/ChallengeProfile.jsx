import { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Users, BarChart2, Target } from 'lucide-react';
import { db } from '@/api/db';
import OptionsMenu from './OptionsMenu';
import { downloadCSV } from '@/lib/csvExport';

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-400 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 flex-1">{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-slate-400" />
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const STATUS_COLORS = { Draft: 'bg-slate-100 text-slate-600', Active: 'bg-green-100 text-green-700', Completed: 'bg-blue-100 text-blue-700', Archived: 'bg-amber-100 text-amber-700' };

export default function ChallengeProfile({ challenge, teams, drills, onBack, onEdit, onDuplicate, onArchive, onDelete, onTeamClick }) {
  const [results, setResults] = useState(null);
  const [assignedSquads, setAssignedSquads] = useState([]);
  const [coachEmailById, setCoachEmailById] = useState({});
  useEffect(() => {
    db.entities.ChallengeResult.filter({ challenge_id: challenge.id })
      .then(async (rs) => {
        setResults(rs);
        // Results only store coach_id — resolve to email for display/export.
        const coachIds = [...new Set(rs.map(r => r.coach_id).filter(Boolean))];
        if (coachIds.length > 0) {
          const profiles = await db.entities.User.filter({ id: coachIds }).catch(() => []);
          setCoachEmailById(Object.fromEntries(profiles.map(p => [p.id, p.email])));
        }
      })
      .catch(() => setResults([]));
    const sqIds = (() => { try { return JSON.parse(challenge.assigned_squad_ids || '[]'); } catch { return []; } })();
    if (sqIds.length > 0) {
      db.entities.Squad.list('-created_date', 200).then(all => setAssignedSquads(all.filter(sq => sqIds.includes(sq.id)))).catch(() => {});
    } else {
      setAssignedSquads([]);
    }
  }, [challenge.id]);

  const assignedTeams = (() => {
    try {
      const ids = JSON.parse(challenge.target_teams || '[]');
      return ids.map(id => teams?.find(t => t.id === id)).filter(Boolean);
    } catch { return []; }
  })();

  const assignedDrillNames = (() => {
    try {
      const ids = JSON.parse(challenge.assigned_drill_ids || '[]');
      return ids.map(id => drills?.find(d => d.id === id)?.name).filter(Boolean).join(', ');
    } catch { return challenge.assigned_drill_name || ''; }
  })();

  const menuItems = [
    { label: 'Edit Challenge', action: onEdit },
    { label: 'Duplicate Challenge', action: onDuplicate },
    { label: 'Archive Challenge', action: onArchive },
    { divider: true },
    { label: 'Email Assigned Coaches', disabled: true },
    { label: 'Download Report', disabled: true },
    { divider: true },
    { label: 'Delete Challenge', danger: true, action: onDelete },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-600 font-semibold text-sm shrink-0">
          <ArrowLeft size={16} /> Back
        </button>
        <div className={`px-3 py-1 rounded-xl text-sm font-bold ${STATUS_COLORS[challenge.status] || STATUS_COLORS.Draft}`}>
          {challenge.status}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-900 text-lg leading-tight truncate">{challenge.title}</h2>
          <p className="text-xs text-slate-400">{challenge.item_type || challenge.challenge_type || 'Challenge'}</p>
        </div>
        <OptionsMenu items={menuItems} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl w-full mx-auto">
        <Section icon={Trophy} title="Challenge Details">
          <Row label="Type" value={challenge.item_type || 'Challenge'} />
          <Row label="Category" value={challenge.challenge_type} />
          <Row label="Description" value={challenge.description} />
          <Row label="Assigned Drills" value={assignedDrillNames} />
          <Row label="Age Groups" value={challenge.target_age_groups} />
        </Section>

        <Section icon={Target} title="Target & Dates">
          <Row label="Target / Goal" value={challenge.target} />
          <Row label="Start Date" value={challenge.start_date} />
          <Row label="Due Date" value={challenge.end_date} />
          {challenge.notes && <Row label="Notes" value={challenge.notes} />}
        </Section>

        <Section icon={Users} title={`Assigned Teams (${assignedTeams.length})`}>
          {assignedTeams.length === 0
            ? <p className="text-sm text-slate-400 italic">No teams specifically assigned (may target by age group)</p>
            : assignedTeams.map(t => (
              <button
                key={t.id}
                onClick={() => onTeamClick?.(t)}
                className={`w-full flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-left transition-colors ${onTeamClick ? 'hover:bg-blue-50 cursor-pointer rounded-lg -mx-1 px-1' : ''}`}
              >
                <div className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xs shrink-0">
                  {t.team_name?.substring(0, 2).toUpperCase()}
                </div>
                <p className={`text-sm font-medium flex-1 ${onTeamClick ? 'text-blue-600 hover:underline' : 'text-slate-800'}`}>
                  {t.team_name}{t.age_group ? ` (${t.age_group})` : ''}
                </p>
                {onTeamClick && <span className="text-xs text-blue-400 shrink-0">→</span>}
              </button>
            ))}
        </Section>

        {assignedSquads.length > 0 && (
          <Section icon={Users} title={`Assigned Squads (${assignedSquads.length})`}>
            {assignedSquads.map(sq => {
              const tc = (() => { try { return JSON.parse(sq.team_ids || '[]').length; } catch { return 0; } })();
              return (
                <div key={sq.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                  <div className="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-bold text-xs shrink-0">
                    {sq.name?.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{sq.name}</p>
                    <p className="text-xs text-slate-400">{tc} team{tc !== 1 ? 's' : ''}{sq.age_group ? ` · ${sq.age_group}` : ''}</p>
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        <Section icon={BarChart2} title={`Completion & Results${results ? ` (${results.length})` : ''}`}>
          {results === null ? (
            <p className="text-sm text-slate-400 italic text-center py-2">Loading…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-3">No results recorded yet. Coaches complete this through sessions.</p>
          ) : (
            <>
              {(() => {
                const numeric = results.filter(r => r.result_value && !isNaN(Number(r.result_value))).map(r => Number(r.result_value));
                const avg = numeric.length > 0 ? (numeric.reduce((a, b) => a + b, 0) / numeric.length).toFixed(1) : null;
                return (
                  <div className={avg ? 'grid grid-cols-4 gap-2 mb-4' : 'grid grid-cols-3 gap-2 mb-4'}>
                    {[
                      { label: 'Completions', value: results.length },
                      { label: 'Coaches', value: new Set(results.map(r => r.coach_id).filter(Boolean)).size },
                      { label: 'Teams', value: new Set(results.map(r => r.team_id).filter(Boolean)).size },
                      ...(avg ? [{ label: 'Avg Result', value: avg }] : []),
                    ].map(s => (
                      <div key={s.label} className="bg-blue-50 rounded-xl p-2.5 text-center">
                        <p className="text-xl font-black text-blue-700">{s.value}</p>
                        <p className="text-xs text-blue-500 font-medium">{s.label}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {results.slice(0, 8).map(r => (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-700">{r.result_value || '—'}</span>
                      {r.goal_type && <span className="text-xs text-slate-400">{r.goal_type}</span>}
                    </div>
                    {r.notes && <p className="text-xs text-slate-500 truncate">{r.notes}</p>}
                  </div>
                  <p className="text-xs text-slate-400 shrink-0">{r.completed_at?.substring(0, 10) || ''}</p>
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <button onClick={() => downloadCSV(results.map(r => ({
                  coach: coachEmailById[r.coach_id] || '', result: r.result_value || '',
                  goal_type: r.goal_type || '', target: r.target_value || '',
                  notes: r.notes || '', date: r.completed_at?.substring(0, 10) || '',
                })), `${challenge.title.replace(/\s+/g, '_')}_results.csv`)}
                  className="text-xs text-blue-600 font-semibold px-3 py-1.5 bg-blue-50 rounded-xl hover:bg-blue-100">
                  Export Results CSV
                </button>
              </div>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}