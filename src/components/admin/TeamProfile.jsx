import { useState, useEffect } from 'react';
import { ArrowLeft, Users, UserCircle, Trophy, BarChart2, ClipboardList, FileText, Clock, Mail, X } from 'lucide-react';
import TrainingAllocationPanel from './TrainingAllocationPanel';
import TeamEditModal from './TeamEditModal';
import { db } from '@/api/db';
import { downloadCSV } from '@/lib/csvExport';
import OptionsMenu from './OptionsMenu';

const TABS = ['Overview', 'Development', 'History'];
const IC = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-400 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 flex-1">{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children, placeholder, action }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-slate-400" />
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1">{title}</h3>
        {action}
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

function ClickableRow({ label, onClick, subtitle }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-left hover:bg-blue-50 rounded-lg -mx-1 px-1 transition-colors cursor-pointer">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-600 hover:underline">{label}</p>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      <span className="text-xs text-blue-400 shrink-0">→</span>
    </button>
  );
}

function getAge(dob) {
  if (!dob) return null;
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

export default function TeamProfile({ team, members, coaches, challenges, onBack, onEdit, onMemberClick, onCoachClick, onSquadClick, onAssignCoach, onArchive, onDelete, onAddMember, onOpenSettings, initialSquads, initialUsers, initialAccess }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [autoOpenTraining] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loadedMembers, setLoadedMembers] = useState(null);
  const [teamAttendance, setTeamAttendance] = useState(null);
  const [teamChallengeResults, setTeamChallengeResults] = useState(null);
  const [teamSessions, setTeamSessions] = useState(null);
  const [teamTransferNotes, setTeamTransferNotes] = useState(null);
  const [squad, setSquad] = useState(null);
  const [coachEmailById, setCoachEmailById] = useState({});

  // Challenge results only store coach_id — resolve to email for display/export.
  useEffect(() => {
    const coachIds = [...new Set((teamChallengeResults || []).map(r => r.coach_id).filter(Boolean))].filter(id => !(id in coachEmailById));
    if (coachIds.length === 0) return;
    db.entities.User.filter({ id: coachIds }).then(profiles => {
      setCoachEmailById(prev => ({ ...prev, ...Object.fromEntries(profiles.map(p => [p.id, p.email])) }));
    }).catch(() => {});
  }, [teamChallengeResults]);

  useEffect(() => {
    if (members === null || members === undefined) {
      db.entities.Member.filter({ team_id: team.id, visibility: 'Club' })
        .then(setLoadedMembers).catch(() => setLoadedMembers([]));
    }
  }, [team.id]);

  useEffect(() => {
    db.entities.Squad.list('-created_date', 200).then(all => {
      const found = all.find(sq => {
        try { return JSON.parse(sq.team_ids || '[]').includes(team.id); } catch { return false; }
      });
      setSquad(found || null);
    }).catch(() => {});
  }, [team.id]);

  useEffect(() => {
    if (activeTab === 'Development') {
      if (teamAttendance === null) {
        db.entities.AttendanceRecord.filter({ team_id: team.id }, '-date', 500)
          .then(setTeamAttendance).catch(() => setTeamAttendance([]));
      }
      if (teamChallengeResults === null) {
        db.entities.ChallengeResult.filter({ team_id: team.id }, '-created_date', 100)
          .then(setTeamChallengeResults).catch(() => setTeamChallengeResults([]));
      }
    }
    if (activeTab === 'History') {
      if (teamSessions === null) {
        db.entities.Session.filter({ team_id: team.id }, '-date', 100)
          .then(setTeamSessions).catch(() => setTeamSessions([]));
      }
      if (teamTransferNotes === null) {
        db.entities.PlayerNote.filter({ team_id: team.id }, '-created_date', 200)
          .then(notes => setTeamTransferNotes(notes.filter(n => (n.note || '').startsWith('[Transfer]'))))
          .catch(() => setTeamTransferNotes([]));
      }
    }
  }, [activeTab, team.id]);

  const displayMembers = (members !== null && members !== undefined)
    ? members.filter(m => m.team_id === team.id && m.status !== 'Archived')
    : (loadedMembers || []);

  const teamChallenges = (challenges || []).filter(ch => {
    try { return JSON.parse(ch.target_teams || '[]').includes(team.id); } catch { return false; }
  });

  const statusColor = team.status === 'Inactive' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';

  const exportThisTeam = () => {
    const rows = displayMembers.map(m => ({
      name: m.name || '', jersey_number: m.jersey_number ?? '', gender: m.gender || '',
      date_of_birth: m.date_of_birth || '', position: m.position || '', email: m.email || '',
      phone: m.phone || '', team: team.team_name, status: m.status || '',
    }));
    downloadCSV(rows.length ? rows : [{ team: team.team_name, note: 'No members' }], `${team.team_name.replace(/\s+/g, '_')}_roster.csv`);
  };

  const menuItems = [
    { label: 'Edit Team', action: () => setShowEditModal(true) },
    { label: 'Email Team', action: () => setShowEmail(true) },
    { label: 'Invoice Team', disabled: true },
    { divider: true },
    ...(onOpenSettings ? [{ label: 'Settings', action: onOpenSettings }] : []),
    { label: 'Export', action: exportThisTeam },
    { label: 'Team History', action: () => setShowHistory(true) },
    { divider: true },
    ...(onArchive ? [{ label: 'Archive Team', action: onArchive }] : []),
    ...(onDelete ? [{ label: 'Delete Team', danger: true, action: onDelete }] : []),
  ];

  // Development tab data
  const att = teamAttendance || [];
  const total = att.length;
  const present = att.filter(r => r.status === 'Present').length;
  const late = att.filter(r => r.status === 'Late').length;
  const absent = att.filter(r => r.status === 'Absent').length;
  const injured = att.filter(r => r.status === 'Injured').length;
  const excused = att.filter(r => r.status === 'Excused').length;
  const sessions = new Set(att.map(r => r.session_id)).size;
  const rate = total > 0 ? Math.round(((present + late + excused) / total) * 100) : 0;
  const cr = teamChallengeResults || [];

  const exportMemberAttendanceSummary = () => {
    const rows = displayMembers.map(m => {
      const mAtt = att.filter(r => r.member_id === m.id || r.player_id === m.id);
      const mSessions = new Set(mAtt.map(r => r.session_id)).size;
      const mPresent = mAtt.filter(r => r.status === 'Present').length;
      const mAbsent = mAtt.filter(r => r.status === 'Absent').length;
      const mLate = mAtt.filter(r => r.status === 'Late').length;
      const mInjured = mAtt.filter(r => r.status === 'Injured').length;
      const mExcused = mAtt.filter(r => r.status === 'Excused').length;
      const mTotal = mAtt.length;
      return {
        name: m.name || '',
        date_of_birth: m.date_of_birth || '',
        age: getAge(m.date_of_birth) ?? '',
        gender: m.gender || '',
        email: m.email || '',
        phone: m.phone || '',
        parent_name: m.parent_name || '',
        parent_email: m.parent_email || '',
        parent_phone: m.parent_phone || '',
        team: team.team_name,
        squad: squad?.name || '',
        sessions_recorded: mSessions,
        attendance_rate_pct: mTotal > 0 ? Math.round(((mPresent + mLate + mExcused) / mTotal) * 100) : '',
        present: mPresent,
        absent: mAbsent,
        late: mLate,
        injured: mInjured,
        excused: mExcused,
      };
    });
    downloadCSV(rows.length > 0 ? rows : [{ note: 'No members' }], `${team.team_name.replace(/\s+/g,'_')}_attendance_summary.csv`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
          {team.team_name?.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-slate-900 text-lg leading-tight">{team.team_name}</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>{team.status || 'Active'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs flex-wrap mt-0.5">
            {team.age_group && <span className="text-slate-400">{team.age_group}</span>}
            {team.gender && <><span className="text-slate-300">·</span><span className="text-slate-400">{team.gender}</span></>}
            {squad && (
              <><span className="text-slate-300">·</span>
              <button onClick={() => onSquadClick?.(squad)} className="text-indigo-600 font-medium hover:underline cursor-pointer">{squad.name}</button></>
            )}
          </div>
        </div>
        <OptionsMenu items={menuItems} />
        </div>

        {showEditModal && (
          <TeamEditModal
            team={team}
            onSave={() => { setShowEditModal(false); }}
            onClose={() => setShowEditModal(false)}
            onAddMember={onAddMember}
            initialSquads={initialSquads}
            initialUsers={initialUsers}
            initialAccess={initialAccess}
          />
        )}

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
            {(!team.age_group || !team.program_type) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2">
                <span className="text-amber-500 text-base shrink-0">⚠️</span>
                <div>
                  <p className="text-xs font-bold text-amber-800">Incomplete team information</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {[!team.age_group && 'Age Group', !team.program_type && 'Competition type'].filter(Boolean).join(' and ')} {!team.age_group && !team.program_type ? 'are' : 'is'} not set.
                    This team won't appear correctly in squads and reports.
                  </p>
                  <button onClick={() => setShowEditModal(true)} className="text-xs font-bold text-amber-800 underline mt-1">Fix now →</button>
                </div>
              </div>
            )}
            <Section icon={UserCircle} title="Team Information">
              <Row label="Team Name" value={team.team_name} />
              <Row label="Age Group" value={team.age_group} />
              <Row label="Gender" value={team.gender} />
              <Row label="Program Type" value={team.program_type} />
              <Row label="Season" value={team.season} />
              <Row label="Squad" value={squad
                ? <button onClick={() => onSquadClick?.(squad)} className="text-indigo-600 font-medium hover:underline text-left">{squad.name}</button>
                : null} />
              <Row label="Status" value={team.status || 'Active'} />
            </Section>

            <Section icon={Users} title={`Members (${displayMembers.length})`}
              placeholder={!(members !== null && members !== undefined ? true : loadedMembers !== null) ? 'Loading…' : displayMembers.length === 0 ? 'No active members' : null}
              action={onAddMember ? <button onClick={onAddMember} className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">+ Add</button> : null}>
              {displayMembers.slice(0, 20).map(m => (
                <ClickableRow key={m.id}
                  label={m.name}
                  subtitle={[m.position, m.jersey_number ? `#${m.jersey_number}` : null].filter(Boolean).join(' · ')}
                  onClick={() => onMemberClick?.(m)} />
              ))}
              {displayMembers.length > 20 && <p className="text-xs text-slate-400 text-center pt-2">+{displayMembers.length - 20} more</p>}
            </Section>

            <Section icon={UserCircle} title={`Coaches (${(coaches || []).length})`}
              placeholder={(coaches || []).length === 0 ? 'No coaches assigned' : null}
              action={onAssignCoach ? <button onClick={onAssignCoach} className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">+ Add</button> : null}>
              {(coaches || []).map((c, i) => (
                <ClickableRow key={i}
                  label={c.full_name || c.email || '—'}
                  subtitle={c.email}
                  onClick={() => onCoachClick?.(c)} />
              ))}
            </Section>

            <Section icon={Clock} title="Training">
              <TrainingAllocationPanel entityType="Team" entityId={team.id} entityName={team.team_name} fallbackSquadId={squad?.id} autoOpenAdd={autoOpenTraining} showAddButton={false} readOnly />
            </Section>

            {teamChallenges.length > 0 && (
              <Section icon={Trophy} title="Assigned Challenges">
                {teamChallenges.map(ch => (
                  <div key={ch.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${ch.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{ch.status}</span>
                    <p className="text-sm text-slate-800">{ch.title}</p>
                  </div>
                ))}
              </Section>
            )}
          </>
        )}

        {activeTab === 'Development' && (
          <>
            {teamAttendance === null ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
                <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Members', value: displayMembers.length, bg: 'bg-blue-50', t: 'text-blue-700' },
                    { label: 'Sessions', value: sessions, bg: 'bg-indigo-50', t: 'text-indigo-700' },
                    { label: 'Att. Rate', value: total > 0 ? `${rate}%` : '—', bg: 'bg-green-50', t: 'text-green-700' },
                    { label: 'Completions', value: cr.length, bg: 'bg-amber-50', t: 'text-amber-700' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
                      <p className={`text-3xl font-black ${s.t}`}>{s.value}</p>
                      <p className="text-xs font-medium text-slate-500 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Attendance breakdown */}
                {total > 0 && (
                  <Section icon={ClipboardList} title="Attendance Breakdown">
                    <div className="grid grid-cols-5 gap-1.5 mb-3">
                      {[
                        { label: 'Present', value: present, bg: 'bg-green-50', t: 'text-green-700' },
                        { label: 'Absent', value: absent, bg: 'bg-red-50', t: 'text-red-700' },
                        { label: 'Late', value: late, bg: 'bg-amber-50', t: 'text-amber-700' },
                        { label: 'Injured', value: injured, bg: 'bg-pink-50', t: 'text-pink-700' },
                        { label: 'Excused', value: excused, bg: 'bg-blue-50', t: 'text-blue-700' },
                      ].map(s => (
                        <div key={s.label} className={`${s.bg} rounded-xl p-1.5 text-center`}>
                          <p className={`text-base font-black ${s.t}`}>{s.value}</p>
                          <p className="text-xs font-medium text-slate-400 leading-tight">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-slate-100 mt-1">
                      <button onClick={exportMemberAttendanceSummary}
                        className="text-xs text-blue-600 font-semibold px-3 py-1.5 bg-blue-50 rounded-xl hover:bg-blue-100">
                        Export Member Attendance Summary
                      </button>
                    </div>
                  </Section>
                )}

                {/* Challenge results */}
                {cr.length > 0 && (
                  <Section icon={Trophy} title={`Challenge Results (${cr.length})`}>
                    {cr.slice(0, 6).map(r => (
                      <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                        <span className="text-sm text-slate-700 font-medium flex-1 truncate">{r.result_value || '—'}</span>
                        <span className="text-xs text-slate-400 ml-2 shrink-0">{r.completed_at?.substring(0,10) || ''}</span>
                      </div>
                    ))}
                    <div className="pt-3 border-t border-slate-100 mt-2">
                      <button onClick={() => downloadCSV(cr.map(r => ({
                        team: team.team_name, challenge_id: r.challenge_id || '', result: r.result_value || '',
                        target: r.target_value || '', coach: coachEmailById[r.coach_id] || '', date: r.completed_at?.substring(0,10) || ''
                      })), `${team.team_name.replace(/\s+/g,'_')}_challenge_results.csv`)}
                        className="text-xs text-blue-600 font-semibold px-3 py-1.5 bg-blue-50 rounded-xl hover:bg-blue-100">
                        Export Challenge Results CSV
                      </button>
                    </div>
                  </Section>
                )}

                {total === 0 && cr.length === 0 && (
                  <p className="text-sm text-slate-400 italic text-center py-6">No development data recorded yet.</p>
                )}

                {/* Team notes — merged here from the former Notes tab */}
                {team.notes ? (
                  <Section icon={FileText} title="Team Notes">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{team.notes}</p>
                  </Section>
                ) : (
                  <Section icon={FileText} title="Team Notes" placeholder="No notes added for this team yet." />
                )}
                <PlaceholderCard icon={ClipboardList} title="Coach Notes"
                  description="Notes added by coaches assigned to this team will appear here." />
              </>
            )}
          </>
        )}

        {activeTab === 'History' && (
          <>
            {teamSessions === null ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
                <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (
              <Section icon={ClipboardList} title={`Sessions (${teamSessions.length})`}
                placeholder={teamSessions.length === 0 ? 'No sessions recorded for this team yet.' : null}>
                {teamSessions.map(s => (
                  <div key={s.id} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{s.session_name || 'Training Session'}</p>
                      {s.focus && <p className="text-xs text-slate-400 truncate">{s.focus}</p>}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{s.date || ''}</span>
                  </div>
                ))}
              </Section>
            )}

            {teamTransferNotes !== null && (
              <Section icon={ClipboardList} title={`Player Movements (${teamTransferNotes.length})`}
                placeholder={teamTransferNotes.length === 0 ? 'No player transfers recorded for this team yet.' : null}>
                {teamTransferNotes.map(n => (
                  <div key={n.id} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{(n.note || '').replace('[Transfer] ', '')}</p>
                      {n.coach_user_email && <p className="text-xs text-slate-400">by {n.coach_user_email}</p>}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{(n.created_date || '').substring(0, 10)}</span>
                  </div>
                ))}
              </Section>
            )}

            {team.created_date && (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Team Created</p>
                <p className="text-sm text-slate-700">{new Date(team.created_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                {team.season && <p className="text-xs text-slate-400 mt-0.5">Season: {team.season}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {showEmail && (
        <EmailTeamModal
          teamName={team.team_name}
          recipients={[...new Set(displayMembers.flatMap(m => [m.email, m.parent_email]).filter(Boolean))]}
          onClose={() => setShowEmail(false)}
        />
      )}

      {showHistory && (
        <TeamHistoryModal
          team={team}
          coaches={coaches || []}
          memberCount={displayMembers.length}
          sessionCount={sessions}
          challengeCount={cr.length}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function EmailTeamModal({ teamName, recipients, onClose }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const openEmailApp = () => {
    const mailto = `mailto:?bcc=${encodeURIComponent(recipients.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Email {teamName}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{recipients.length} recipient{recipients.length !== 1 ? 's' : ''} · members + parents</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {recipients.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No email addresses on file for this team's members.</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} className={IC} placeholder="e.g. Training update" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className={IC} placeholder="Write your message…" />
              </div>
              <p className="text-xs text-slate-400">Recipients are added as BCC to protect privacy. This opens your email app to review and send.</p>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={openEmailApp} disabled={recipients.length === 0}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            <Mail size={15} /> Open in email app
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamHistoryModal({ team, coaches, memberCount, sessionCount, challengeCount, onClose }) {
  const created = team.created_at || team.created_date;
  const fmt = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const rows = [
    { label: 'Created', value: fmt(created) },
    { label: 'Current status', value: team.status || 'Active' },
    { label: 'Program type', value: team.program_type || '⚠ Not set' },
    { label: 'Age group', value: team.age_group || '—' },
    { label: 'Coaches assigned', value: coaches.length ? coaches.map(c => c.full_name || c.email).join(', ') : 'None' },
    { label: 'Active members', value: memberCount },
    { label: 'Training sessions logged', value: sessionCount },
    { label: 'Challenge results recorded', value: challengeCount },
  ];
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><Clock size={16} className="text-slate-400" /> {team.team_name} — History</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {rows.map(r => (
            <div key={r.label} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className="text-xs font-semibold text-slate-400 shrink-0 pt-0.5">{r.label}</span>
              <span className="text-sm text-slate-800 text-right">{r.value}</span>
            </div>
          ))}
          <p className="text-xs text-slate-400 pt-3">A detailed change log (coach moves, status changes, member transfers) will appear here as activity is recorded.</p>
        </div>
      </div>
    </div>
  );
}