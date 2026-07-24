import { useState, useEffect } from 'react';
import { X, ChevronRight, RefreshCw, Users, CheckCircle, AlertTriangle } from 'lucide-react';
import { db } from '@/api/db';
import { getCurrentSeason, setCurrentSeason, getAgeGroupForYear, teamNameToAgeGroup } from '@/lib/season.js';

function nextSeasonDefault() {
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

function nextSeasonStartDefault() {
  return `${new Date().getFullYear()}-01-01`;
}

export default function SeasonRolloverModal({ onClose, onDone }) {
  const current = getCurrentSeason();
  const [step, setStep] = useState('name');

  // Step 1 — new season details
  const [newName, setNewName] = useState(nextSeasonDefault);
  const [newStart, setNewStart] = useState(nextSeasonStartDefault);

  // Step 2 — preview data
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Step 3 — roster choice
  const [rosterChoice, setRosterChoice] = useState('keep'); // 'keep' | 'clear' | 'custom'
  const [keepTeamIds, setKeepTeamIds] = useState(new Set()); // used when rosterChoice === 'custom'

  // Step 4 — executing
  const [executing, setExecuting] = useState(false);
  const [execLog, setExecLog] = useState('');
  const [result, setResult] = useState(null);

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const [players, members, teams] = await Promise.all([
        db.entities.Player.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
        db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
        db.entities.Team.filterAll({ visibility: 'Club' }, '-created_date').catch(() => []),
      ]);

      const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
      const teamMap   = Object.fromEntries(teams.map(t => [t.id, t]));

      // Use the END year of the new season as the BA age cutoff (Dec 31 of that year).
      const seasonMatch = newName.match(/(\d{4})-(\d{4})/);
      const nextYear = seasonMatch ? parseInt(seasonMatch[2]) : new Date(newStart).getFullYear() + 1;
      const agingOut = [];
      const seenMemberIds = new Set();

      // Check active Player records (team-roster assignments)
      const activePlayers = players.filter(p => p.status !== 'Inactive');
      activePlayers.forEach(p => {
        const member = memberMap[p.member_id];
        const team   = teamMap[p.team_id];
        if (!member?.date_of_birth || !team) return;
        seenMemberIds.add(member.id);
        const currentGroup = teamNameToAgeGroup(team.team_name);
        if (!currentGroup || currentGroup === 'Seniors') return;
        const nextGroup = getAgeGroupForYear(member.date_of_birth, member.gender, nextYear);
        if (nextGroup && nextGroup !== currentGroup) {
          agingOut.push({ playerName: member.name, teamName: team.team_name, currentGroup, nextGroup });
        }
      });

      // Also check Members with team_id set directly (catches members without a Player record)
      members.filter(m => m.team_id && m.status !== 'Archived' && !seenMemberIds.has(m.id)).forEach(m => {
        const team = teamMap[m.team_id];
        if (!m.date_of_birth || !team) return;
        const currentGroup = teamNameToAgeGroup(team.team_name);
        if (!currentGroup || currentGroup === 'Seniors') return;
        const nextGroup = getAgeGroupForYear(m.date_of_birth, m.gender, nextYear);
        if (nextGroup && nextGroup !== currentGroup) {
          agingOut.push({ playerName: m.name, teamName: team.team_name, currentGroup, nextGroup });
        }
      });

      // Count members assigned to a team (via Player or Member.team_id)
      const membersOnTeams = new Set([
        ...activePlayers.map(p => p.member_id).filter(Boolean),
        ...members.filter(m => m.team_id && m.status !== 'Archived').map(m => m.id),
      ]).size;

      // Group aging-out by team
      const byTeam = {};
      agingOut.forEach(a => {
        if (!byTeam[a.teamName]) byTeam[a.teamName] = [];
        byTeam[a.teamName].push(a);
      });

      setPreview({
        totalMembers: members.filter(m => m.status !== 'Archived').length,
        totalPlayers: membersOnTeams,
        totalTeams: teams.length,
        agingOut,
        byTeam,
        teamList: teams,
      });
    } finally {
      setLoadingPreview(false);
    }
  }

  function goToPreview() {
    if (!newName.trim()) return;
    setStep('preview');
    loadPreview();
  }

  async function doRollover() {
    setExecuting(true);
    let deactivated = 0;
    let failures = 0;
    try {
      if (rosterChoice === 'clear' || rosterChoice === 'custom') {
        setExecLog('Loading player records…');
        const players = await db.entities.Player.filterAll({ visibility: 'Club' }, '-created_date');
        const toDeactivate = players.filter(p => {
          if (p.status === 'Inactive') return false;
          if (rosterChoice === 'custom') return !keepTeamIds.has(p.team_id);
          return true;
        });
        setExecLog(`Deactivating ${toDeactivate.length} player records…`);
        const playerResults = await Promise.allSettled(toDeactivate.map(p => db.entities.Player.update(p.id, { status: 'Inactive' })));
        deactivated = playerResults.filter(r => r.status === 'fulfilled').length;
        failures += playerResults.filter(r => r.status === 'rejected').length;

        setExecLog('Clearing team assignments from member profiles…');
        const members = await db.entities.Member.filterAll({ visibility: 'Club' }, '-created_date');
        const membersWithTeam = members.filter(m => {
          if (!m.team_id) return false;
          if (rosterChoice === 'custom') return !keepTeamIds.has(m.team_id);
          return true;
        });
        const memberResults = await Promise.allSettled(membersWithTeam.map(m => db.entities.Member.update(m.id, { team_id: null })));
        failures += memberResults.filter(r => r.status === 'rejected').length;
      }

      setExecLog('Saving new season…');
      await setCurrentSeason({ name: newName.trim(), startDate: newStart });

      setResult({ deactivated, failures, newName: newName.trim() });
      setStep('done');
    } catch (e) {
      setExecLog('');
      alert(`Rollover failed partway through: ${e.message}\n\nSome records may have already been updated — check the Members and Teams tabs before running this again.`);
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-900">Season Rollover</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {/* Step indicator */}
        {step !== 'done' && (
          <div className="flex items-center gap-1 px-5 pt-4 pb-0 shrink-0">
            {['name', 'preview', 'roster', 'confirm'].map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center
                  ${step === s ? 'bg-blue-600 text-white' :
                    ['name','preview','roster','confirm'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {i + 1}
                </div>
                {i < 3 && <div className={`h-0.5 w-8 ${['name','preview','roster','confirm'].indexOf(step) > i ? 'bg-green-500' : 'bg-slate-100'}`} />}
              </div>
            ))}
            <span className="ml-2 text-xs text-slate-500 font-medium">
              {step === 'name' && 'Name the new season'}
              {step === 'preview' && 'Review age advances'}
              {step === 'roster' && 'Roster choice'}
              {step === 'confirm' && 'Ready to rollover'}
            </span>
          </div>
        )}

        {/* ── Step 1: Name ── */}
        {step === 'name' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-800">Current season: <span className="font-bold">{current.name}</span></p>
              <p className="text-xs text-amber-700 mt-0.5">Started {current.startDate}. Rolling over will close this season and start a new one.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">New Season Name</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. 2026-2027"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Season Start Date</label>
                <input
                  type="date"
                  value={newStart}
                  onChange={e => setNewStart(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Sessions and games from this date forward will belong to the new season.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {loadingPreview ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Analysing rosters…</p>
              </div>
            ) : preview && (
              <>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Members', value: preview.totalMembers, color: 'bg-blue-50 text-blue-800' },
                    { label: 'On Teams', value: preview.totalPlayers, color: 'bg-indigo-50 text-indigo-800' },
                    { label: 'Teams', value: preview.totalTeams, color: 'bg-slate-50 text-slate-700' },
                    { label: 'Aging Out', value: preview.agingOut.length, color: preview.agingOut.length > 0 ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800' },
                  ].map(s => (
                    <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                      <p className="text-2xl font-black">{s.value}</p>
                      <p className="text-xs font-semibold mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {preview.agingOut.length === 0 ? (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                    <p className="text-sm font-semibold text-green-800">No players aging out of their current team.</p>
                    <p className="text-xs text-green-700 mt-0.5">All players fit their age group for {new Date(newStart).getFullYear()}.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Players aging out by team</p>
                    {Object.entries(preview.byTeam).map(([teamName, players]) => (
                      <div key={teamName} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-amber-900">{teamName}</p>
                          <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-semibold">{players.length} aging out</span>
                        </div>
                        <div className="space-y-1">
                          {players.map((p, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-amber-800">
                              <Users size={10} className="shrink-0" />
                              <span className="font-medium">{p.playerName}</span>
                              <span className="text-amber-600">{p.currentGroup} → {p.nextGroup}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2">
                      These players will need to be re-assigned to their new age group team after rollover.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Step 3: Roster choice ── */}
        {step === 'roster' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-sm text-slate-600">How should CoachPad handle the current team rosters when rolling over to <strong>{newName}</strong>?</p>

            <button onClick={() => setRosterChoice('keep')}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${rosterChoice === 'keep' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${rosterChoice === 'keep' ? 'border-blue-600' : 'border-slate-300'}`}>
                  {rosterChoice === 'keep' && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Keep current rosters</p>
                  <p className="text-xs text-slate-500 mt-0.5">Players stay on their teams. Best when most of the roster carries over.</p>
                </div>
              </div>
            </button>

            <button onClick={() => setRosterChoice('clear')}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${rosterChoice === 'clear' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${rosterChoice === 'clear' ? 'border-orange-600' : 'border-slate-300'}`}>
                  {rosterChoice === 'clear' && <div className="w-2 h-2 rounded-full bg-orange-600" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Clear all rosters</p>
                  <p className="text-xs text-slate-500 mt-0.5">All {preview?.totalPlayers ?? ''} active player records are deactivated. Coaches rebuild from the member list. Best after a big restructure or age-group shake-up.</p>
                </div>
              </div>
            </button>

            <button onClick={() => setRosterChoice('custom')}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${rosterChoice === 'custom' ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${rosterChoice === 'custom' ? 'border-purple-600' : 'border-slate-300'}`}>
                  {rosterChoice === 'custom' && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Custom — choose by team</p>
                  <p className="text-xs text-slate-500 mt-0.5">Select which teams keep their roster. All others are cleared.</p>
                </div>
              </div>
            </button>

            {rosterChoice === 'custom' && preview?.totalTeams > 0 && (
              <div className="border border-purple-100 rounded-xl overflow-hidden">
                <div className="bg-purple-50 px-3 py-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-purple-700">Teams to KEEP (tick = keep roster)</p>
                  <div className="flex gap-2">
                    <button onClick={() => {
                      // need teams list from preview — store it
                      setKeepTeamIds(new Set(preview.teamList?.map(t => t.id) || []));
                    }} className="text-xs text-purple-600 font-semibold hover:underline">All</button>
                    <button onClick={() => setKeepTeamIds(new Set())}
                      className="text-xs text-purple-600 font-semibold hover:underline">None</button>
                  </div>
                </div>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {(preview.teamList || []).map(t => (
                    <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={keepTeamIds.has(t.id)}
                        onChange={e => {
                          const next = new Set(keepTeamIds);
                          e.target.checked ? next.add(t.id) : next.delete(t.id);
                          setKeepTeamIds(next);
                        }}
                        className="w-4 h-4 accent-purple-600 shrink-0" />
                      <span className="text-sm text-slate-800 truncate">{t.team_name}</span>
                      {t.age_group && <span className="text-xs text-slate-400 ml-auto shrink-0">{t.age_group}</span>}
                    </label>
                  ))}
                </div>
                <div className="bg-purple-50 px-3 py-2">
                  <p className="text-xs text-purple-700">
                    {keepTeamIds.size} team{keepTeamIds.size !== 1 ? 's' : ''} keeping roster ·{' '}
                    {(preview.teamList?.length || 0) - keepTeamIds.size} clearing
                  </p>
                </div>
              </div>
            )}

            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500">
                <strong>Members are never affected</strong> — their profiles, evaluations, and history are always preserved.
                Only the team-assignment (Player) records change.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirm ── */}
        {step === 'confirm' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
              {[
                { label: 'New season', value: newName },
                { label: 'Start date', value: newStart },
                { label: 'Rosters', value: rosterChoice === 'keep' ? 'Carry forward (no change)' : rosterChoice === 'custom' ? `Keep ${keepTeamIds.size} team${keepTeamIds.size !== 1 ? 's' : ''}, clear ${(preview?.teamList?.length || 0) - keepTeamIds.size}` : `Clear all ${preview?.totalPlayers ?? ''} assignments` },
              ].map(r => (
                <div key={r.label} className="flex justify-between px-4 py-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{r.label}</span>
                  <span className="text-sm font-semibold text-slate-800">{r.value}</span>
                </div>
              ))}
            </div>

            {(rosterChoice === 'clear' || rosterChoice === 'custom') && (
              <div className="flex items-start gap-3 bg-orange-50 border border-orange-100 rounded-xl p-4">
                <AlertTriangle size={16} className="text-orange-600 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-800">
                  <strong>This cannot be undone.</strong>{' '}
                  {rosterChoice === 'custom'
                    ? `Rosters for ${(preview?.teamList?.length || 0) - keepTeamIds.size} team(s) will be cleared.`
                    : `All ${preview?.totalPlayers ?? ''} team-assignment records will be removed.`}
                  {' '}Member profiles and history are always preserved.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && result && (
          <div className="flex-1 p-8 flex flex-col items-center gap-4">
            <CheckCircle size={52} className="text-green-500" />
            <div className="text-center">
              <h4 className="font-bold text-slate-900 text-lg">Rollover Complete!</h4>
              <p className="text-sm text-slate-600 mt-2">
                <strong>{result.newName}</strong> is now the active season.
                {result.deactivated > 0 && ` ${result.deactivated} player records deactivated.`}
              </p>
            </div>
            {result.failures > 0 && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4 w-full">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <strong>{result.failures} record{result.failures !== 1 ? 's' : ''} failed to update</strong> — most rosters were cleared, but a few players or members may still show their old team. Check the Members and Teams tabs and re-run if needed.
                </p>
              </div>
            )}
            <div className="bg-blue-50 rounded-xl p-4 w-full text-xs text-blue-800 space-y-1">
              <p>✅ All new sessions and games will be tagged to <strong>{result.newName}</strong>.</p>
              {result.deactivated > 0 && <p>✅ Rosters cleared — coaches can rebuild from the Members list.</p>}
              <p>✅ All historical data from previous seasons is preserved.</p>
            </div>
            <button onClick={() => { onDone?.(); onClose(); }}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
              Done
            </button>
          </div>
        )}

        {/* Footer buttons */}
        {step !== 'done' && (
          <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
            {step !== 'name' && (
              <button onClick={() => {
                if (step === 'preview') setStep('name');
                if (step === 'roster') setStep('preview');
                if (step === 'confirm') setStep('roster');
              }} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 font-semibold">
                ← Back
              </button>
            )}
            {step === 'name' && (
              <button onClick={goToPreview} disabled={!newName.trim() || !newStart}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                Next <ChevronRight size={15} />
              </button>
            )}
            {step === 'preview' && (
              <button onClick={() => setStep('roster')} disabled={loadingPreview}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                Next <ChevronRight size={15} />
              </button>
            )}
            {step === 'roster' && (
              <button onClick={() => setStep('confirm')}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
                Review & Confirm <ChevronRight size={15} />
              </button>
            )}
            {step === 'confirm' && (
              <button onClick={doRollover} disabled={executing}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm disabled:opacity-50">
                {executing ? execLog || 'Rolling over…' : '✓ Confirm Rollover'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
