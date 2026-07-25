import { useState, useEffect } from 'react';
import Pagination from './Pagination';

const COACHES_SETTINGS_KEY = 'coachpad_coaches_settings';
const COACHES_SETTINGS_DEFAULT = { sortOrder: 'name_asc', perPage: 25 };
function loadCoachesSettings() { try { return { ...COACHES_SETTINGS_DEFAULT, ...JSON.parse(localStorage.getItem(COACHES_SETTINGS_KEY) || '{}') }; } catch { return COACHES_SETTINGS_DEFAULT; } }
import { Plus, X, MoreHorizontal, FileDown, Settings, Wrench, Mail, Check, SlidersHorizontal, Search } from 'lucide-react';
import { db } from '@/api/db';
import { Spinner } from './shared';
import OptionsMenu from './OptionsMenu';
import { downloadCSV } from '@/lib/csvExport';
import CoachProfile from './CoachProfile';
import CreateCoachPanel from './CreateCoachPanel';
import CustomExportModal from './CustomExportModal';
import EmailComposeModal from './EmailComposeModal';

export default function AdminCoachesTab({ onProfileClick, resetTrigger, triggerAdd, triggerExport, triggerSettings, triggerEmail }) {
  const [showForm, setShowForm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCustomExport, setShowCustomExport] = useState(false);
  const [settings, setSettings] = useState(loadCoachesSettings);
  const [draftSettings, setDraftSettings] = useState(settings);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [access, setAccess] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterTeam, setFilterTeam] = useState('');
  const [coachSearch, setCoachSearch] = useState('');
  const [selectedCoachIds, setSelectedCoachIds] = useState(new Set());
  const [emailModal, setEmailModal] = useState(null); // { targetType, targetIds, targetLabel } | null
  const PAGE_SIZE = settings.perPage;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [coachSearch, settings.perPage]);
  const toggleCoach = (id) => setSelectedCoachIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelectMode = () => { setSelectMode(false); setSelectedCoachIds(new Set()); };

  useEffect(() => { if (resetTrigger) { setShowForm(false); setSelectedCoach(null); setAssignModal(null); setFilterTeam(''); } }, [resetTrigger]);
  useEffect(() => { setAssignSearch(''); }, [assignModal]);
  useEffect(() => { if (!triggerAdd) return; setShowForm(true); }, [triggerAdd]);
  useEffect(() => { if (!triggerExport) return; setShowExport(true); }, [triggerExport]);
  useEffect(() => { if (!triggerSettings) return; setSelectedCoach(null); setDraftSettings(loadCoachesSettings()); setShowSettings(true); }, [triggerSettings]);
  useEffect(() => { if (!triggerEmail) return; setEmailModal({ targetType: 'all', targetIds: [], targetLabel: 'All Coaches' }); }, [triggerEmail]);
  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [u, t, a] = await Promise.all([
      db.entities.User.list('-created_date', 200),
      db.entities.Team.filter({ visibility: 'Club' }, '-created_date', 1000),
      db.entities.UserTeamAccess.list('-created_date', 500),
    ]);
    setUsers(u.filter(x => x.role !== 'admin'));
    setTeams(t); setAccess(a);
    setLoading(false);
  };

  const assignTeam = async (userEmail, teamId) => {
    if (!access.some(a => a.user_email === userEmail && a.team_id === teamId)) {
      await db.entities.UserTeamAccess.create({ user_email: userEmail, team_id: teamId, role: 'coach', can_edit: true, assigned_by_admin: true });
      load();
    }
    setAssignModal(null);
  };

  const removeTeam = async (accId) => { await db.entities.UserTeamAccess.delete(accId); load(); };

  const exportCoaches = (list) => {
    downloadCSV(list.map(u => ({
      full_name: u.full_name || '', email: u.email || '',
      teams: getCoachTeams(u.email).map(t => t.team_name).join(', '),
      status: u.account_status || 'Active',
    })), 'coaches.csv');
  };

  const runCoachesExport = (scope) => {
    switch (scope) {
      case 'assignments':
        return downloadCSV(access.map(a => ({ coach_email: a.user_email, team: teams.find(t => t.id === a.team_id)?.team_name || a.team_id, role: a.role || 'coach' })), 'coach-assignments.csv');
      case 'all':
      default:
        return exportCoaches(users);
    }
  };

  const toggleSuspend = async (user) => {
    const suspended = user.account_status === 'Suspended';
    await db.entities.User.update(user.id, { account_status: suspended ? 'Active' : 'Suspended' });
    load();
  };

  const getCoachTeams = (email) =>
    access.filter(a => a.user_email === email).map(a => teams.find(t => t.id === a.team_id)).filter(Boolean);

  const REPORT_ITEMS = [
    { label: 'Export Coach List', sub: `${users.length} coaches`, action: () => exportCoaches(users), ready: true },
    { label: 'Export Coach Assignments', sub: 'Coach → team assignments', action: () => downloadCSV(
        access.map(a => ({ coach_email: a.user_email, team: teams.find(t => t.id === a.team_id)?.team_name || a.team_id, role: a.role || 'coach' })),
        'coach_assignments.csv'), ready: true },
  ];

  // Coach profile view
  if (selectedCoach) {
    return (
      <CoachProfile
        user={selectedCoach}
        assignedTeams={getCoachTeams(selectedCoach.email)}
        onBack={() => setSelectedCoach(null)}
        onAssignTeam={() => { setAssignModal(selectedCoach); setSelectedCoach(null); }}
        onTeamClick={team => onProfileClick?.('team', team)}
        onSuspend={() => toggleSuspend(selectedCoach)}
      />
    );
  }

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col h-full">

      {/* Coach list */}
      <div className="flex-1 overflow-y-auto" onClick={() => setShowMoreMenu(false)}>
        <div className="p-4 space-y-3 max-w-4xl mx-auto">
          <div className="bg-blue-50 rounded-2xl p-4 text-center border border-slate-200 mb-2">
            <p className="text-4xl font-black text-blue-700">{users.length}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">Total Coaches</p>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={coachSearch} onChange={e => setCoachSearch(e.target.value)} placeholder="Search coaches…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(true)}
              className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${filterTeam ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <SlidersHorizontal size={13} /> Filters
              {filterTeam && <span className="bg-white text-blue-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-black">1</span>}
            </button>
            <button onClick={() => { setSelectMode(s => !s); setSelectedCoachIds(new Set()); }}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 ${selectMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Check size={14} /> Select
            </button>
            <span className="text-xs text-slate-400 ml-auto">{users.filter(u => (!coachSearch || (u.full_name || u.email || '').toLowerCase().includes(coachSearch.toLowerCase())) && (!filterTeam || getCoachTeams(u.email).some(t => t.id === filterTeam))).length} coach{users.length !== 1 ? 'es' : ''}</span>
            <div className="relative">
              <button onClick={e => { e.stopPropagation(); setShowMoreMenu(v => !v); }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
                <MoreHorizontal size={16} />
              </button>
              {showMoreMenu && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[220px]">
                  <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reports</p>
                  {REPORT_ITEMS.map(item => (
                    <button key={item.label} onClick={() => { if (item.ready && item.action) { item.action(); setShowMoreMenu(false); } }}
                      disabled={!item.ready}
                      className="w-full text-left px-4 py-2 text-xs font-semibold transition-colors text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2">
                      <FileDown size={13} className="text-slate-400 shrink-0" /> {item.label}
                      {!item.ready && <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Soon</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {users.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
              <p className="text-slate-500 font-medium">No coaches registered yet</p>
              <p className="text-slate-400 text-sm">Invite coaches via the invite system — they appear here once registered.</p>
            </div>
          ) : (() => {
            const filteredCoaches = users.filter(u => {
              if (coachSearch && !(u.full_name || u.email || '').toLowerCase().includes(coachSearch.toLowerCase())) return false;
              if (filterTeam && !getCoachTeams(u.email).some(t => t.id === filterTeam)) return false;
              return true;
            });
            return (<>
            {filteredCoaches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(user => {
            const coachTeams = getCoachTeams(user.email);
            const suspended = user.account_status === 'Suspended';
            return (
              <div key={user.id}
                onClick={() => selectMode ? toggleCoach(user.id) : setSelectedCoach(user)}
                className={`bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all ${selectMode && selectedCoachIds.has(user.id) ? 'border-blue-400 bg-blue-50' : ''}`}>
                <div className="flex items-center gap-3">
                  {selectMode && <input type="checkbox" checked={selectedCoachIds.has(user.id)} onChange={e => { e.stopPropagation(); toggleCoach(user.id); }} onClick={e => e.stopPropagation()} className="shrink-0 w-4 h-4 accent-blue-600" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm">{user.full_name || '—'}</p>
                      {suspended && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">Suspended</span>}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {coachTeams.length === 0
                        ? 'No teams assigned'
                        : coachTeams.map(t => t.team_name).join(', ')}
                    </p>
                  </div>
                  <OptionsMenu items={[
                    { label: 'Assign team', action: () => { setAssignModal(user); } },
                    { label: suspended ? 'Activate coach' : 'Suspend coach', action: () => toggleSuspend(user), danger: !suspended },
                    { divider: true },
                    { label: 'Email coach', action: () => setEmailModal({ targetType: 'individual', targetIds: [user.id], targetLabel: user.full_name || user.email }) },
                    { label: 'Coach history', disabled: true },
                    { label: 'Reports', disabled: true },
                  ]} />
                </div>
              </div>
            );
          })}
            <Pagination page={page} totalPages={Math.ceil(filteredCoaches.length / PAGE_SIZE)} onPage={setPage} />
            </>);
          })()}
        </div>
      </div>

      {/* Bulk selection bar */}
      {selectMode && (
        <div className="shrink-0 bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-semibold flex-1">
            {selectedCoachIds.size > 0 ? `${selectedCoachIds.size} coach${selectedCoachIds.size !== 1 ? 'es' : ''} selected` : 'Tap coaches to select'}
          </span>
          <div className="flex gap-2">
            <button onClick={exitSelectMode} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl font-semibold">Cancel</button>
            <button
              onClick={() => setEmailModal({ targetType: 'individual', targetIds: [...selectedCoachIds], targetLabel: `${selectedCoachIds.size} Coach${selectedCoachIds.size !== 1 ? 'es' : ''}` })}
              disabled={selectedCoachIds.size === 0}
              className="text-xs bg-white text-slate-900 font-bold hover:bg-slate-100 px-2.5 py-1.5 rounded-xl disabled:opacity-40">Email</button>
            <button onClick={() => exportCoaches(users.filter(u => selectedCoachIds.has(u.id)))} disabled={selectedCoachIds.size === 0} className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-xl font-semibold disabled:opacity-40">Export CSV</button>
          </div>
        </div>
      )}

      {/* Filter modal */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowFilters(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-80 max-w-[90vw] bg-white max-h-[80vh] flex flex-col shadow-2xl rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Filters</h2>
              <button onClick={() => setShowFilters(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Team</label>
                <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Teams</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              {filterTeam && (
                <button onClick={() => { setFilterTeam(''); setShowFilters(false); }}
                  className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Clear</button>
              )}
              <button onClick={() => setShowFilters(false)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign team modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setAssignModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 text-sm">Assign Teams</h3>
              <button onClick={() => setAssignModal(null)} className="text-slate-400"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">{assignModal.full_name || assignModal.email}</p>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)}
                placeholder="Search teams..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {teams.filter(t => !assignSearch || t.team_name?.toLowerCase().includes(assignSearch.toLowerCase())).map(t => {
                const already = access.some(a => a.user_email === assignModal.email && a.team_id === t.id);
                const acc = access.find(a => a.user_email === assignModal.email && a.team_id === t.id);
                return (
                  <div key={t.id} className={`flex items-center px-4 py-3 rounded-xl border text-sm transition-colors ${already ? 'border-green-200 bg-green-50' : 'border-slate-200'}`}>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800">{t.team_name}</div>
                      {t.age_group && <div className="text-xs text-slate-400">{t.age_group}</div>}
                    </div>
                    {already
                      ? <button onClick={() => { removeTeam(acc.id); load(); }} className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove</button>
                      : <button onClick={() => assignTeam(assignModal.email, t.id)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">Assign</button>}
                  </div>
                );
              })}
              {teams.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No teams yet.</p>}
              {teams.length > 0 && teams.filter(t => !assignSearch || t.team_name?.toLowerCase().includes(assignSearch.toLowerCase())).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No teams match "{assignSearch}".</p>
              )}
            </div>
            <button onClick={() => setAssignModal(null)} className="mt-4 w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-semibold">Done</button>
          </div>
        </div>
      )}

      {/* Export page overlay */}
      {showExport && (
        <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
            <button onClick={() => setShowExport(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            <h2 className="font-bold text-slate-900">Export Coaches</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-2xl w-full mx-auto space-y-3">
            <p className="text-sm text-slate-500">Choose what to export. Files download as CSV.</p>
            <button onClick={() => { runCoachesExport('all'); setShowExport(false); }}
              className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
              <FileDown size={18} className="text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm">All coaches</p>
                <p className="text-xs text-slate-400">Every coach ({users.length}) with their teams.</p>
              </div>
            </button>
            <button onClick={() => { setShowExport(false); setShowCustomExport(true); }}
              className="w-full text-left bg-white rounded-2xl border-2 border-dashed border-slate-300 p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
              <SlidersHorizontal size={18} className="text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm">Custom export…</p>
                <p className="text-xs text-slate-400">Pick exactly which columns to include.</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {showCustomExport && (
        <CustomExportModal
          title="Custom Coach Export"
          fields={[
            { key: 'full_name', label: 'Name' },
            { key: 'email', label: 'Email' },
            { key: 'teams', label: 'Teams' },
            { key: 'status', label: 'Status' },
          ]}
          rows={users.map(u => ({
            full_name: u.full_name || '', email: u.email || '',
            teams: getCoachTeams(u.email).map(t => t.team_name).join(', '),
            status: u.account_status || 'Active',
          }))}
          filename="coaches-custom.csv"
          onClose={() => setShowCustomExport(false)}
        />
      )}

      {/* Settings page overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-white z-20 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
            <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            <h2 className="font-bold text-slate-900">Coaches Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-2xl w-full mx-auto">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Default sort order</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[['name_asc','Name A → Z'],['name_desc','Name Z → A'],['newest','Newest first'],['oldest','Oldest first']].map(([v,l]) => (
                  <button key={v} onClick={() => setDraftSettings(s => ({ ...s, sortOrder: v }))}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${draftSettings.sortOrder === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Coaches per page</p>
              <div className="flex gap-2">
                {[25, 50, 100].map(n => (
                  <button key={n} onClick={() => setDraftSettings(s => ({ ...s, perPage: n }))}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${draftSettings.perPage === n ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="shrink-0 px-5 pb-6 pt-3 border-t border-slate-100 flex gap-2">
            <button onClick={() => setShowSettings(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancel</button>
            <button onClick={() => {
              localStorage.setItem(COACHES_SETTINGS_KEY, JSON.stringify(draftSettings));
              setSettings(draftSettings);
              setShowSettings(false);
            }} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Add Coach form overlay */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-slate-900">Add Coach</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CreateCoachPanel onCreated={() => { load(); setShowForm(false); }} teams={teams} access={access} />
            </div>
          </div>
        </div>
      )}

      {emailModal && (
        <EmailComposeModal
          audience="coaches"
          targetType={emailModal.targetType}
          targetIds={emailModal.targetIds}
          targetLabel={emailModal.targetLabel}
          onClose={() => setEmailModal(null)}
        />
      )}
    </div>
  );
}

