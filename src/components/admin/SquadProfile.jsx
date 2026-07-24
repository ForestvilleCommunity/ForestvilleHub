import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Building2, BarChart2, FileText, Clock, Trophy, ClipboardList } from 'lucide-react';
import TrainingAllocationPanel from './TrainingAllocationPanel';
import SquadEditModal from './SquadEditModal';
import { db } from '@/api/db';
import { downloadCSV } from '@/lib/csvExport';
import OptionsMenu from './OptionsMenu';

const TABS = ['Overview', 'Development', 'History'];

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
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
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

function ClickableRow({ label, subtitle, onClick }) {
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

export default function SquadProfile({
  squad, squadTeams, squadMembers, squadCoaches,
  squadAttendance: attProp, squadChallengeResults: crProp,
  teams,
  onBack, onEdit, onArchive, onDelete,
  onTeamClick, onMemberClick, onCoachClick,
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');
  const [att, setAtt] = useState(attProp || null);
  const [cr, setCr] = useState(crProp || null);
  const [autoOpenTraining, setAutoOpenTraining] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [coachEmailById, setCoachEmailById] = useState({});

  // Challenge results only store coach_id — resolve to email for display/export.
  useEffect(() => {
    const coachIds = [...new Set((cr || []).map(r => r.coach_id).filter(Boolean))].filter(id => !(id in coachEmailById));
    if (coachIds.length === 0) return;
    db.entities.User.filter({ id: coachIds }).then(profiles => {
      setCoachEmailById(prev => ({ ...prev, ...Object.fromEntries(profiles.map(p => [p.id, p.email])) }));
    }).catch(() => {});
  }, [cr]);

  // Self-load development data when dev tab opened (if not pre-loaded)
  useEffect(() => {
    if (activeTab === 'Development') {
      const teamIds = (squadTeams || []).map(t => t.id);
      if (att === null && teamIds.length > 0) {
        db.entities.AttendanceRecord.list('-date', 1000)
          .then(all => setAtt(all.filter(r => teamIds.includes(r.team_id))))
          .catch(() => setAtt([]));
      }
      if (cr === null && teamIds.length > 0) {
        db.entities.ChallengeResult.list('-created_date', 200)
          .then(all => setCr(all.filter(r => teamIds.includes(r.team_id))))
          .catch(() => setCr([]));
      }
    }
  }, [activeTab]);

  const safeAtt = att || [];
  const safeCr = cr || [];
  const loading = activeTab === 'Development' && (att === null || cr === null) && (squadTeams || []).length > 0;

  const statusColor = squad.status === 'Archived' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';

  const menuItems = [
    { label: 'Edit Squad', action: () => setShowEditModal(true) },
    { label: 'Add Training', action: () => { setActiveTab('Overview'); setAutoOpenTraining(t => !t); } },
    { label: 'Assign Teams', action: () => setShowEditModal(true) },
    { divider: true },
    ...(onArchive ? [{ label: squad.status === 'Active' ? 'Archive Squad' : 'Activate Squad', action: onArchive }] : []),
    ...(onDelete ? [{ label: 'Delete Squad', danger: true, action: onDelete }] : []),
    { divider: true },
    { label: 'Open Full Page', action: () => navigate(`/admin/squad/${squad.id}`) },
  ];

  // Squad-level totals
  const totalAtt = safeAtt.length;
  const sqPresent = safeAtt.filter(r => r.status === 'Present').length;
  const sqLate = safeAtt.filter(r => r.status === 'Late').length;
  const sqAbsent = safeAtt.filter(r => r.status === 'Absent').length;
  const sqInjured = safeAtt.filter(r => r.status === 'Injured').length;
  const sqExcused = safeAtt.filter(r => r.status === 'Excused').length;
  const sqRate = totalAtt > 0 ? Math.round(((sqPresent + sqLate + sqExcused) / totalAtt) * 100) : 0;

  const exportMemberAttendanceSummary = () => {
    const rows = (squadMembers || []).map(m => {
      const mAtt = safeAtt.filter(r => r.member_id === m.id || r.player_id === m.id);
      const mSessions = new Set(mAtt.map(r => r.session_id)).size;
      const mPresent = mAtt.filter(r => r.status === 'Present').length;
      const mAbsent = mAtt.filter(r => r.status === 'Absent').length;
      const mLate = mAtt.filter(r => r.status === 'Late').length;
      const mInjured = mAtt.filter(r => r.status === 'Injured').length;
      const mExcused = mAtt.filter(r => r.status === 'Excused').length;
      const mTotal = mAtt.length;
      const team = (teams || []).find(t => t.id === m.team_id);
      return {
        name: m.name || '', date_of_birth: m.date_of_birth || '',
        age: getAge(m.date_of_birth) ?? '',
        gender: m.gender || '', email: m.email || '', phone: m.phone || '',
        parent_name: m.parent_name || '', parent_email: m.parent_email || '', parent_phone: m.parent_phone || '',
        team: team?.team_name || '', squad: squad.name,
        sessions_recorded: mSessions,
        attendance_rate_pct: mTotal > 0 ? Math.round(((mPresent + mLate + mExcused) / mTotal) * 100) : '',
        present: mPresent, absent: mAbsent, late: mLate, injured: mInjured, excused: mExcused,
      };
    });
    downloadCSV(rows.length > 0 ? rows : [{ note: 'No members' }], `${squad.name.replace(/\s+/g,'_')}_attendance_summary.csv`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
          {squad.name?.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-slate-900 text-lg leading-tight">{squad.name}</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>{squad.status || 'Active'}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {[squad.age_group, squad.gender, squad.season].filter(Boolean).join(' · ')}
          </p>
        </div>
        <OptionsMenu items={menuItems} />
      </div>

      {showEditModal && (
        <SquadEditModal
          squad={squad}
          onSave={() => setShowEditModal(false)}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 flex shrink-0">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-xs font-bold transition-colors border-b-2 ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl w-full mx-auto">

        {activeTab === 'Overview' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Teams', value: (squadTeams || []).length, bg: 'bg-blue-50', t: 'text-blue-700', s: 'text-blue-500' },
                { label: 'Members', value: (squadMembers || []).length, bg: 'bg-indigo-50', t: 'text-indigo-700', s: 'text-indigo-500' },
                { label: 'Coaches', value: (squadCoaches || []).length, bg: 'bg-slate-50', t: 'text-slate-700', s: 'text-slate-500' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl border border-slate-200 p-3 text-center`}>
                  <p className={`text-2xl font-black ${s.t}`}>{s.value}</p>
                  <p className={`text-xs font-medium ${s.s}`}>{s.label}</p>
                </div>
              ))}
            </div>

            <Section icon={Building2} title="Squad Information">
              <Row label="Squad Name" value={squad.name} />
              <Row label="Age Group" value={squad.age_group} />
              <Row label="Gender" value={squad.gender} />
              <Row label="Season" value={squad.season} />
              <Row label="Description" value={squad.description} />
              <Row label="Status" value={squad.status || 'Active'} />
            </Section>

            <Section icon={Building2} title={`Teams (${(squadTeams || []).length})`}
              placeholder={(squadTeams || []).length === 0 ? 'No teams assigned to this squad' : null}>
              {(squadTeams || []).map(t => (
                <ClickableRow key={t.id}
                  label={t.team_name}
                  subtitle={[t.age_group, t.gender].filter(Boolean).join(' · ')}
                  onClick={() => onTeamClick?.(t)} />
              ))}
            </Section>

            <TrainingAllocationPanel entityType="Squad" entityId={squad.id} entityName={squad.name} autoOpenAdd={autoOpenTraining} />

            <Section icon={Users} title={`Coaches (${(squadCoaches || []).length})`}
              placeholder={(squadCoaches || []).length === 0 ? 'No coaches assigned to squad teams' : null}>
              {(squadCoaches || []).map(c => (
                <ClickableRow key={c.id}
                  label={c.full_name || '—'}
                  subtitle={c.email}
                  onClick={() => onCoachClick?.(c)} />
              ))}
            </Section>

            <Section icon={Users} title={`Members (${(squadMembers || []).length})`}
              placeholder={(squadMembers || []).length === 0 ? 'No active members in this squad' : null}>
              {(squadMembers || []).slice(0, 20).map(m => (
                <ClickableRow key={m.id}
                  label={m.name}
                  subtitle={(teams || []).find(t => t.id === m.team_id)?.team_name || ''}
                  onClick={() => onMemberClick?.(m)} />
              ))}
              {(squadMembers || []).length > 20 && <p className="text-xs text-slate-400 text-center pt-2">+{(squadMembers || []).length - 20} more</p>}
            </Section>
          </>
        )}

        {activeTab === 'Development' && (
          <>
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
                <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Teams', value: (squadTeams || []).length, bg: 'bg-blue-50', t: 'text-blue-700' },
                    { label: 'Members', value: (squadMembers || []).length, bg: 'bg-indigo-50', t: 'text-indigo-700' },
                    { label: 'Att. Rate', value: totalAtt > 0 ? `${sqRate}%` : '—', bg: 'bg-green-50', t: 'text-green-700' },
                    { label: 'Completions', value: safeCr.length, bg: 'bg-amber-50', t: 'text-amber-700' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
                      <p className={`text-3xl font-black ${s.t}`}>{s.value}</p>
                      <p className="text-xs font-medium text-slate-500 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Attendance breakdown */}
                {totalAtt > 0 && (
                  <Section icon={ClipboardList} title="Attendance Breakdown">
                    <div className="grid grid-cols-5 gap-1.5 mb-4">
                      {[
                        { label: 'Present', value: sqPresent, bg: 'bg-green-50', t: 'text-green-700' },
                        { label: 'Absent', value: sqAbsent, bg: 'bg-red-50', t: 'text-red-700' },
                        { label: 'Late', value: sqLate, bg: 'bg-amber-50', t: 'text-amber-700' },
                        { label: 'Injured', value: sqInjured, bg: 'bg-pink-50', t: 'text-pink-700' },
                        { label: 'Excused', value: sqExcused, bg: 'bg-blue-50', t: 'text-blue-700' },
                      ].map(s => (
                        <div key={s.label} className={`${s.bg} rounded-xl p-1.5 text-center`}>
                          <p className={`text-base font-black ${s.t}`}>{s.value}</p>
                          <p className="text-xs font-medium text-slate-400 leading-tight">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={exportMemberAttendanceSummary}
                      className="text-xs text-indigo-600 font-semibold px-3 py-1.5 bg-indigo-50 rounded-xl hover:bg-indigo-100">
                      Export Member Attendance Summary
                    </button>
                  </Section>
                )}

                {/* Per-team breakdown */}
                <Section icon={BarChart2} title="Team Breakdown">
                  {(squadTeams || []).length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-2">No teams in this squad.</p>
                  ) : (squadTeams || []).map(t => {
                    const teamAtt = safeAtt.filter(r => r.team_id === t.id);
                    const teamSessions = new Set(teamAtt.map(r => r.session_id)).size;
                    const teamPresent = teamAtt.filter(r => r.status === 'Present').length;
                    const teamLate = teamAtt.filter(r => r.status === 'Late').length;
                    const teamExcused = teamAtt.filter(r => r.status === 'Excused').length;
                    const teamTotal = teamAtt.length;
                    const teamRate = teamTotal > 0 ? Math.round(((teamPresent + teamLate + teamExcused) / teamTotal) * 100) : 0;
                    const teamCR = safeCr.filter(r => r.team_id === t.id).length;
                    return (
                      <div key={t.id} className="py-2.5 border-b border-slate-100 last:border-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <button onClick={() => onTeamClick?.(t)}
                            className="text-sm font-semibold text-blue-600 hover:underline cursor-pointer">
                            {t.team_name}
                          </button>
                          {teamCR > 0 && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{teamCR} results</span>}
                        </div>
                        <div className="flex gap-3 text-xs text-slate-400">
                          <span>{teamSessions > 0 ? `${teamSessions} session${teamSessions !== 1 ? 's' : ''}` : 'No sessions'}</span>
                          <span>{teamTotal > 0 ? `${teamRate}% att.` : 'No data'}</span>
                        </div>
                      </div>
                    );
                  })}
                </Section>

                {/* Challenge results compact */}
                {safeCr.length > 0 && (
                  <Section icon={Trophy} title={`Challenge Results (${safeCr.length})`}>
                    {safeCr.slice(0, 5).map(r => (
                      <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                        <span className="text-sm text-slate-700 font-medium flex-1 truncate">{r.result_value || '—'}</span>
                        <span className="text-xs text-slate-400 ml-2 shrink-0">{r.completed_at?.substring(0,10) || ''}</span>
                      </div>
                    ))}
                    <div className="pt-3 border-t border-slate-100 mt-2">
                      <button onClick={() => downloadCSV(safeCr.map(r => ({
                        squad: squad.name, team: (squadTeams || []).find(t => t.id === r.team_id)?.team_name || '',
                        challenge_id: r.challenge_id || '', result: r.result_value || '',
                        target: r.target_value || '', coach: coachEmailById[r.coach_id] || '', date: r.completed_at?.substring(0,10) || '',
                      })), `${squad.name.replace(/\s+/g,'_')}_challenge_results.csv`)}
                        className="text-xs text-indigo-600 font-semibold px-3 py-1.5 bg-indigo-50 rounded-xl hover:bg-indigo-100">
                        Export Challenge Results CSV
                      </button>
                    </div>
                  </Section>
                )}

                {totalAtt === 0 && safeCr.length === 0 && (
                  <p className="text-sm text-slate-400 italic text-center py-6">No development data recorded yet.</p>
                )}
              </>
            )}
          </>
        )}


        {activeTab === 'History' && (
          <>
            <PlaceholderCard icon={Clock} title="Squad History"
              description="Team additions, removals, and squad status changes will be logged here." />
            <PlaceholderCard icon={Users} title="Coach Activity"
              description="Coach assignments and activity across squad teams will appear here." />
          </>
        )}
      </div>
    </div>
  );
}