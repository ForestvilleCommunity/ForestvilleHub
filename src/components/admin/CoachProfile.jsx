import { ArrowLeft, UserCircle, BarChart2 } from 'lucide-react';
import OptionsMenu from './OptionsMenu';

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

export default function CoachProfile({ user, assignedTeams, onBack, onAssignTeam, onTeamClick, onSuspend }) {
  const suspended = user.account_status === 'Suspended';

  const menuItems = [
    ...(onAssignTeam ? [{ label: 'Assign teams', action: onAssignTeam }] : []),
    { label: suspended ? 'Activate coach' : 'Suspend coach', action: onSuspend, danger: !suspended },
    ...(user.email ? [{ divider: true }, { label: 'Email coach', action: () => window.open(`mailto:${user.email}`) }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0 ${suspended ? 'bg-slate-300 text-slate-500' : 'bg-slate-900 text-white'}`}>
          {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-slate-900 text-lg leading-tight">{user.full_name || '—'}</h2>
            {suspended && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">Suspended</span>}
          </div>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>
        <OptionsMenu items={menuItems} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl w-full mx-auto">
        <Section icon={UserCircle} title="Coach Details">
          <div className="flex gap-3 py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-400 w-28 shrink-0 pt-0.5">Name</span>
            <span className="text-sm text-slate-800">{user.full_name || '—'}</span>
          </div>
          <div className="flex gap-3 py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-400 w-28 shrink-0 pt-0.5">Email</span>
            <span className="text-sm text-slate-800">{user.email}</span>
          </div>
          <div className="flex gap-3 py-2">
            <span className="text-xs font-semibold text-slate-400 w-28 shrink-0 pt-0.5">Status</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${suspended ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
              {user.account_status || 'Active'}
            </span>
          </div>
        </Section>

        <Section icon={UserCircle} title={`Assigned Teams (${assignedTeams.length})`}>
          {assignedTeams.length === 0
            ? <p className="text-sm text-slate-400 italic">No teams assigned yet.</p>
            : assignedTeams.map((t, i) => (
              <button
                key={i}
                onClick={() => onTeamClick?.(t)}
                className={`w-full flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-left transition-colors ${onTeamClick ? 'hover:bg-blue-50 cursor-pointer rounded-lg -mx-1 px-1' : ''}`}
              >
                <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xs shrink-0">
                  {t.team_name?.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${onTeamClick ? 'text-blue-600 hover:underline' : 'text-slate-800'}`}>{t.team_name}</p>
                  {t.age_group && <p className="text-xs text-slate-400">{t.age_group}</p>}
                </div>
                {onTeamClick && <span className="text-xs text-blue-400 shrink-0">→</span>}
              </button>
            ))}
        </Section>

        <Section icon={BarChart2} title="Activity & Stats">
          <p className="text-sm text-slate-400 italic text-center py-3">Coach session completion and activity data will appear here in a future update.</p>
        </Section>
      </div>
    </div>
  );
}