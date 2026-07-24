import { useState, useEffect } from 'react';
import { X, Search, UserPlus, Check } from 'lucide-react';
import { db } from '@/api/db';

export default function AssignMemberModal({ team, onClose, onSaved }) {
  const [allMembers, setAllMembers] = useState([]);
  const [activePlayers, setActivePlayers] = useState([]);
  const [query, setQuery] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterAgeGroup, setFilterAgeGroup] = useState('');
  const [assigning, setAssigning] = useState(null);
  const [assigned, setAssigned] = useState(new Set());

  useEffect(() => {
    Promise.all([
      db.entities.Member.filterAll({ visibility: 'Club' }, 'name').catch(() => []),
      db.entities.Player.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
    ]).then(([all, players]) => {
      const active = all.filter(m => m.status !== 'Archived');
      setAllMembers(active);
      setActivePlayers(players.filter(p => p.status === 'Active'));
      // Repair: reactivate any Inactive Player records for members that have a team assigned
      const withTeam = active.filter(m => m.team_id);
      if (withTeam.length === 0) return;
      const inactivePlayers = players.filter(p => p.status === 'Inactive' || !p.status);
      withTeam.forEach(m => {
        const stale = inactivePlayers.find(p => p.member_id === m.id);
        if (stale) db.entities.Player.update(stale.id, { status: 'Active', team_id: m.team_id }).catch(() => {});
      });
    }).catch(() => setAllMembers([]));
  }, []);

  // Members already on this team — by team_id OR by active Player record
  const onTeamMemberIds = new Set([
    ...allMembers.filter(m => m.team_id === team?.id).map(m => m.id),
    ...activePlayers.filter(p => p.team_id === team?.id).map(p => p.member_id).filter(Boolean),
  ]);

  const filtered = allMembers.filter(m => {
    if (onTeamMemberIds.has(m.id)) return false;
    if (query && !m.name?.toLowerCase().includes(query.toLowerCase())) return false;
    if (filterGender && m.gender !== filterGender) return false;
    if (filterAgeGroup && m.age_group !== filterAgeGroup) return false;
    return true;
  });

  const ageGroups = [...new Set(allMembers.map(m => m.age_group).filter(Boolean))].sort();
  const genders = [...new Set(allMembers.map(m => m.gender).filter(Boolean))].sort();

  const assign = async (member) => {
    if (!team?.id || assigning) return;
    setAssigning(member.id);
    try {
      const me = await db.auth.me();
      await db.entities.Member.update(member.id, { team_id: team.id });
      // Update existing Player record if one exists, otherwise create
      const existingPlayers = await db.entities.Player.filter({ member_id: member.id }, '-created_date', 10).catch(() => []);
      const existing = existingPlayers[0];
      if (existing) {
        await db.entities.Player.update(existing.id, {
          team_id: team.id,
          status: 'Active',
          name: member.name,
        }).catch(() => {});
      } else {
        await db.entities.Player.create({
          name: member.name,
          team_id: team.id,
          member_id: member.id,
          owner_id: me.id,
          visibility: 'Club',
          status: 'Active',
          date_of_birth: member.date_of_birth || undefined,
          injury_status: 'Healthy',
        }).catch(() => {});
      }
      setAssigned(prev => new Set([...prev, member.id]));
      onSaved?.();
    } catch (e) {
      alert('Error assigning member: ' + e.message);
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-bold text-slate-900">Add Members to Team</h3>
            {team && <p className="text-xs text-slate-400 mt-0.5">{team.team_name}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {/* Search + filters */}
        <div className="px-4 py-3 space-y-2 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name…"
              autoFocus
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select value={filterGender} onChange={e => setFilterGender(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All genders</option>
              {genders.map(g => <option key={g}>{g}</option>)}
            </select>
            <select value={filterAgeGroup} onChange={e => setFilterAgeGroup(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All age groups</option>
              {ageGroups.map(ag => <option key={ag}>{ag}</option>)}
            </select>
          </div>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {allMembers.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">Loading members…</p>
          )}
          {allMembers.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              {query || filterGender || filterAgeGroup ? 'No members match your filters.' : 'All members are already on this team.'}
            </p>
          )}
          {filtered.map(m => {
            const isAssigned = assigned.has(m.id);
            const isLoading = assigning === m.id;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                  {(m.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {[m.age_group, m.gender, m.date_of_birth ? `DOB ${m.date_of_birth}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => !isAssigned && assign(m)}
                  disabled={isLoading || isAssigned}
                  className={`shrink-0 p-1.5 rounded-full transition-colors ${
                    isAssigned
                      ? 'bg-green-100 text-green-600 cursor-default'
                      : isLoading
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  {isAssigned ? <Check size={16} /> : <UserPlus size={16} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {assigned.size > 0 ? `${assigned.size} member${assigned.size > 1 ? 's' : ''} added` : `${filtered.length} available`}
          </p>
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
