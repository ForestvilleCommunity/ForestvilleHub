import { useState, useEffect } from 'react';
import { ArrowLeft, User, Phone, Heart, FileText, BarChart2, ClipboardList, Clock, Trophy } from 'lucide-react';

import OptionsMenu from './OptionsMenu';
import { db } from '@/api/db';
import { downloadCSV } from '@/lib/csvExport';
import { getCurrentSeason, getAgeGroupForYear } from '@/lib/season.js';

const TABS = ['Overview', 'Development', 'History'];
const HISTORY_PAGE_SIZE = 20;

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-400 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 flex-1">{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children, placeholder }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-0.5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-slate-400" />
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
      </div>
      {placeholder
        ? <p className="text-sm text-slate-400 italic text-center py-3">{placeholder}</p>
        : children}
    </div>
  );
}

function PlaceholderCard({ icon: Icon, title, description }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-2">
      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
        <Icon size={18} className="text-slate-400" />
      </div>
      <p className="font-semibold text-slate-700 text-sm">{title}</p>
      <p className="text-xs text-slate-400">{description}</p>
      <span className="inline-block bg-slate-100 text-slate-500 text-xs px-3 py-1 rounded-full font-medium">Coming Soon</span>
    </div>
  );
}

function readAgeMethod() {
  try { return JSON.parse(localStorage.getItem('coachpad_devhub_settings') || '{}').ageMethod || 'dec31'; }
  catch { return 'dec31'; }
}
function getSeasonEndYear() {
  try {
    const s = JSON.parse(localStorage.getItem('coachpad_season') || 'null');
    const m = (s?.name || '').match(/\d{4}-(\d{4})/);
    return m ? parseInt(m[1]) : new Date().getFullYear();
  } catch { return new Date().getFullYear(); }
}
function getAge(dob) {
  if (!dob) return null;
  const b = new Date(dob + 'T00:00:00');
  if (readAgeMethod() === 'dec31') return getSeasonEndYear() - b.getFullYear();
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}
function getAgeLabel(seasonEndYear) {
  return readAgeMethod() === 'dec31' ? ` (as at 31 Dec ${seasonEndYear})` : '';
}

export default function MemberProfile({ member, teams, linkedPlayer, onBack, onEdit, onDelete, onTeamClick, isAdmin = true }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [historyPage, setHistoryPage] = useState(0);
  const [attendance, setAttendance] = useState(null);
  const [challengeResults, setChallengeResults] = useState(null);
  const [playerNotes, setPlayerNotes] = useState(null);
  const [playerEvals, setPlayerEvals] = useState(null);

  useEffect(() => {
    if ((activeTab === 'Development' || activeTab === 'History') && linkedPlayer?.id) {
      if (attendance === null) {
        db.entities.AttendanceRecord.filter({ player_id: linkedPlayer.id }, '-date', 100)
          .then(setAttendance).catch(() => setAttendance([]));
      }
      if (challengeResults === null) {
        db.entities.ChallengeResult.list('-created_date', 200)
          .then(all => setChallengeResults(all.filter(r => {
            if (r.player_id === linkedPlayer.id || r.player_id === member.id) return true;
            try { return JSON.parse(r.player_ids || '[]').includes(linkedPlayer.id) || JSON.parse(r.player_ids || '[]').includes(member.id); } catch { return false; }
          }))).catch(() => setChallengeResults([]));
      }
      if (playerNotes === null) {
        Promise.all([
          db.entities.PlayerNote.filter({ player_id: linkedPlayer.id }, '-created_date', 50).catch(() => []),
          linkedPlayer.id !== member.id
            ? db.entities.PlayerNote.filter({ player_id: member.id }, '-created_date', 50).catch(() => [])
            : Promise.resolve([]),
        ]).then(([a, b]) => {
          const seen = new Set();
          setPlayerNotes([...a, ...b].filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true; }));
        });
      }
      if (playerEvals === null) {
        // Dev Hub saves evaluations with member.id as player_id; coach sessions use linkedPlayer.id
        // Fetch both and deduplicate so ratings from both sources appear
        Promise.all([
          db.entities.PlayerEvaluation.filter({ player_id: linkedPlayer.id }, '-evaluation_date', 100).catch(() => []),
          linkedPlayer.id !== member.id
            ? db.entities.PlayerEvaluation.filter({ player_id: member.id }, '-evaluation_date', 100).catch(() => [])
            : Promise.resolve([]),
        ]).then(([a, b]) => {
          const seen = new Set();
          setPlayerEvals([...a, ...b]
            .sort((x, y) => new Date(y.evaluation_date) - new Date(x.evaluation_date))
            .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; }));
        });
      }
    }
  }, [activeTab, linkedPlayer?.id]);

  const team = teams?.find(t => t.id === member.team_id);
  const age = getAge(member.date_of_birth);
  const currentSeason = getCurrentSeason();
  const seasonEndYear = (() => { const m = (currentSeason.name || '').match(/\d{4}-(\d{4})/); return m ? parseInt(m[1]) : new Date().getFullYear(); })();
  const suggestedAgeGroup = getAgeGroupForYear(member.date_of_birth, member.gender, seasonEndYear);
  const STATUS_COLOR = member.status === 'Archived' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
  const parsedNoteMap = Object.fromEntries(
    (member.notes || '').split('\n')
      .map(line => { const i = line.indexOf(':'); return i > 0 ? [line.substring(0, i).trim(), line.substring(i + 1).trim()] : null; })
      .filter(Boolean)
  );
  const registrationDate = parsedNoteMap['Registered on'] ||
    (member.created_date ? new Date(member.created_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : null);
  const parentsOccupation = parsedNoteMap['Parents occupation'] || parsedNoteMap["Parent's occupation"];

  const adminOptions = [
    { label: 'Edit member', action: onEdit },
    ...(member.email ? [{ label: 'Email member', action: () => window.open(`mailto:${member.email}`) }] : []),
    { divider: true },
    { label: 'Delete member', danger: true, action: onDelete || (() => {}) },
  ];

  const coachOptions = [
    { label: 'Add coach note', disabled: true },
    { label: 'View history', disabled: true },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-lg shrink-0">
          {member.jersey_number || member.name?.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-slate-900 text-lg leading-tight">{member.name}</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR}`}>{member.status || 'Active'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs flex-wrap mt-0.5">
            {team ? (
              <button onClick={() => team && onTeamClick?.(team)}
                className="font-medium text-blue-600 hover:underline cursor-pointer">
                {team.team_name}
              </button>
            ) : <span className="text-slate-400">No team</span>}
            {age !== null && <><span className="text-slate-300">·</span><span className="text-slate-400">Age {age}</span></>}
            {member.position && <><span className="text-slate-300">·</span><span className="text-slate-400">{member.position}</span></>}
          </div>
        </div>
        <OptionsMenu items={isAdmin ? adminOptions : coachOptions} />
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 flex shrink-0">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-xs font-bold transition-colors border-b-2 ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl w-full mx-auto">

        {activeTab === 'Overview' && (
          <>
            <Section icon={User} title="Personal Information">
              <Row label="Date of Birth" value={member.date_of_birth ? `${member.date_of_birth}${age !== null ? ` (Age ${age})` : ''}` : null} />
              <Row label="Gender" value={member.gender} />
              <Row label="Age" value={age !== null ? `${age} yrs${getAgeLabel(seasonEndYear)}` : null} />
              <Row label="Age Group" value={suggestedAgeGroup ? `${suggestedAgeGroup} (${currentSeason.name})` : null} />
              <Row label="Jersey #" value={member.jersey_number != null ? `#${member.jersey_number}` : null} />
              <Row label="Position" value={member.position} />
              <Row label="Registered" value={registrationDate} />

              <Row label="Team" value={team
                ? <button onClick={() => onTeamClick?.(team)} className="text-blue-600 hover:underline font-medium text-left">{team.team_name}</button>
                : null} />
              <Row label="School" value={member.school} />
            </Section>

            <Section icon={Phone} title="Contact Details">
              <Row label="Email" value={member.email} />
              <Row label="Phone" value={member.phone} />
              <Row label="Address" value={member.address} />
            </Section>

            <Section icon={User} title="Parent / Guardian">
              <Row label="Parent Name" value={member.parent_name} />
              <Row label="Parent Phone" value={member.parent_phone} />
              <Row label="Parent Email" value={member.parent_email} />
              <Row label="Secondary Contact" value={member.secondary_contact} />
              {parentsOccupation && <Row label="Parent Occupation" value={parentsOccupation} />}
            </Section>

            {(member.medical_conditions || member.medication || member.other_conditions) && (
              <Section icon={Heart} title="Medical Information">
                <Row label="Medical Conditions" value={member.medical_conditions} />
                <Row label="Medication" value={member.medication} />
                <Row label="Other Conditions" value={member.other_conditions} />
              </Section>
            )}

            {(linkedPlayer || member.notes) && (() => {
              const allNoteRows = (member.notes || '').split('\n')
                .map(line => { const i = line.indexOf(':'); return i > 0 ? { label: line.substring(0, i).trim(), value: line.substring(i + 1).trim() } : null; })
                .filter(p => p && p.label && p.value && p.value.toLowerCase() !== 'n/a' && p.value !== '');
              const noteRows = allNoteRows.filter(p => p.label !== 'Registered on' && p.label !== 'Parents occupation' && p.label !== "Parent's occupation");
              return (
                <Section icon={BarChart2} title="Player Status">
                  {linkedPlayer && <Row label="Injury Status" value={linkedPlayer.injury_status} />}
                  {linkedPlayer && linkedPlayer.status && linkedPlayer.status !== 'Inactive' && <Row label="Status" value={linkedPlayer.status} />}
                  {noteRows.map(p => <Row key={p.label} label={p.label} value={p.value} />)}
                </Section>
              );
            })()}
          </>
        )}

        {activeTab === 'Development' && (
          <>
            {!linkedPlayer ? (
              <Section icon={BarChart2} title="Development">
                <p className="text-sm text-slate-400 italic text-center py-3">No player record linked yet.</p>
              </Section>
            ) : (playerEvals === null || challengeResults === null || playerNotes === null) ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
                <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (() => {
              const evals = playerEvals || [];
              const avg = evals.length > 0
                ? (evals.reduce((s, e) => s + (e.rating ?? 0), 0) / evals.length).toFixed(1)
                : null;
              const lastEval = evals[0];
              const attTotal = (attendance || []).length;
              const attPresent = (attendance || []).filter(r => r.status === 'Present').length;
              const attLate = (attendance || []).filter(r => r.status === 'Late').length;
              const attExcused = (attendance || []).filter(r => r.status === 'Excused').length;
              const attRate = attTotal > 0 ? Math.round(((attPresent + attLate + attExcused) / attTotal) * 100) : null;
              return (
                <>
                  {/* Summary stats */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Avg Rating', value: avg !== null ? `${avg}/10` : '—', bg: 'bg-violet-50', t: 'text-violet-700' },
                      { label: 'Observations', value: evals.length, bg: 'bg-blue-50', t: 'text-blue-700' },
                      { label: 'Att. Rate', value: attRate !== null ? `${attRate}%` : '—', bg: 'bg-green-50', t: 'text-green-700' },
                    ].map(s => (
                      <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center`}>
                        <p className={`text-lg font-black ${s.t}`}>{s.value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Recent observations */}
                  <Section icon={BarChart2} title={`Recent Observations (${evals.length})`}
                    placeholder={evals.length === 0 ? 'No observations recorded in the Development Hub yet.' : null}>
                    {evals.slice(0, 3).map(ev => (
                      <div key={ev.id} className="py-2.5 border-b border-slate-100 last:border-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-bold ${ev.rating >= 7 ? 'text-green-600' : ev.rating >= 5 ? 'text-amber-600' : 'text-red-500'}`}>
                            {ev.rating !== null && ev.rating !== undefined ? `${ev.rating}/10` : '—'}
                          </span>
                          <span className="text-xs text-slate-400">{ev.evaluation_date || ''}</span>
                        </div>
                        {ev.strengths && <p className="text-xs text-slate-600"><span className="font-semibold text-green-600">↑</span> {ev.strengths}</p>}
                        {ev.growth_areas && <p className="text-xs text-slate-500"><span className="font-semibold text-amber-500">↗</span> {ev.growth_areas}</p>}
                      </div>
                    ))}
                    {evals.length > 3 && (
                      <button onClick={() => setActiveTab('History')}
                        className="w-full mt-1 py-2 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-xl transition-colors">
                        See all {evals.length} observations →
                      </button>
                    )}
                  </Section>

                  {/* Recent coach notes */}
                  <Section icon={ClipboardList} title={`Coach Notes (${(playerNotes||[]).length})`}
                    placeholder={(playerNotes||[]).length === 0 ? 'No coach notes recorded yet.' : null}>
                    {(playerNotes||[]).slice(0, 3).map(n => (
                      <div key={n.id} className="py-2 border-b border-slate-100 last:border-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-semibold text-slate-500">{n.coach_user_email}</span>
                          <span className="text-xs text-slate-400">{n.created_date?.substring(0,10) || ''}</span>
                        </div>
                        <p className="text-sm text-slate-700">{n.note}</p>
                      </div>
                    ))}
                    {(playerNotes||[]).length > 3 && <p className="text-xs text-slate-400 text-center pt-1">+{(playerNotes||[]).length - 3} more in Development Hub</p>}
                  </Section>

                  {/* Challenge highlights */}
                  {(challengeResults||[]).length > 0 && (
                    <Section icon={Trophy} title={`Challenge Results (${(challengeResults||[]).length})`}>
                      {(challengeResults||[]).slice(0, 4).map(r => (
                        <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                          <span className="text-sm font-semibold text-slate-800 truncate flex-1">{r.result_value || '—'}</span>
                          <span className="text-xs text-slate-400 ml-2 shrink-0">{r.completed_at?.substring(0,10) || ''}</span>
                        </div>
                      ))}
                    </Section>
                  )}
                </>
              );
            })()}
          </>
        )}

        {activeTab === 'History' && (() => {
          const loading = !linkedPlayer || attendance === null || playerNotes === null || challengeResults === null || playerEvals === null;
          if (!linkedPlayer) return (
            <Section icon={ClipboardList} title="History">
              <p className="text-sm text-slate-400 italic text-center py-3">No player record linked yet.</p>
            </Section>
          );
          if (loading) return (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
              <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          );
          const events = [
            ...(attendance || []).map(r => ({
              date: r.date || '',
              label: `Training — ${r.status || 'Attended'}`,
              sub: r.notes || null,
              dot: r.status === 'Present' ? 'bg-green-400' : r.status === 'Absent' ? 'bg-red-400' : r.status === 'Late' ? 'bg-amber-400' : 'bg-slate-300',
            })),
            ...(playerEvals || []).map(e => ({
              date: e.evaluation_date || '',
              label: `Observation — Rating ${e.rating ?? '—'}`,
              sub: e.strengths || e.notes || null,
              dot: 'bg-violet-400',
            })),
            ...(playerNotes || []).map(n => {
              const isTransfer = (n.note || '').startsWith('[Transfer]');
              return {
                date: n.created_date?.substring(0,10) || '',
                label: isTransfer ? (n.note.replace('[Transfer] ', '')) : 'Coach Note',
                sub: isTransfer ? null : (n.note || null),
                dot: isTransfer ? 'bg-indigo-500' : 'bg-blue-400',
              };
            }),
            ...(challengeResults || []).map(r => ({
              date: r.completed_at?.substring(0,10) || '',
              label: `Challenge — ${r.result_value || ''}`,
              sub: r.target_value ? `Target: ${r.target_value}` : null,
              dot: 'bg-amber-400',
            })),
          ].filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date));

          const pageStart = historyPage * HISTORY_PAGE_SIZE;
          const pageEnd = pageStart + HISTORY_PAGE_SIZE;
          const pageEvents = events.slice(pageStart, pageEnd);
          const totalPages = Math.ceil(events.length / HISTORY_PAGE_SIZE);
          return events.length === 0 ? (
            <Section icon={ClipboardList} title="Activity History" placeholder="No activity recorded for this player yet." />
          ) : (
            <Section icon={ClipboardList} title={`Activity History (${events.length})`}>
              {pageEvents.map((e, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                  <div className={`w-2 h-2 rounded-full ${e.dot} mt-1.5 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{e.label}</p>
                    {e.sub && <p className="text-xs text-slate-400 truncate">{e.sub}</p>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{e.date}</span>
                </div>
              ))}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 mt-1">
                  <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    ← Previous
                  </button>
                  <span className="text-xs text-slate-400">{historyPage + 1} / {totalPages}</span>
                  <button onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))} disabled={historyPage >= totalPages - 1}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    Next →
                  </button>
                </div>
              )}
            </Section>
          );
        })()}
      </div>
    </div>
  );
}