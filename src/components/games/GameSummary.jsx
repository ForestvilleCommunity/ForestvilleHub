import { useState, useEffect } from 'react';
import { X, Pencil, Play, Trophy, Plus, Minus, Check } from 'lucide-react';
import { db } from '@/api/db';
import { format } from 'date-fns';
import { toast } from 'sonner';

const RESULT_STYLES = {
  Win:  'bg-green-100 text-green-700 border-green-200',
  Loss: 'bg-red-100 text-red-700 border-red-200',
  Draw: 'bg-amber-100 text-amber-700 border-amber-200',
  TBD:  'bg-slate-100 text-slate-500 border-slate-200',
};

function safeJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function formatDuration(seconds) {
  if (!seconds) return null;
  return `${Math.floor(seconds / 60)} min`;
}

export default function GameSummary({ game, teamName, onClose, onEdit, onStart }) {
  const [players, setPlayers] = useState([]);
  const [editableStats, setEditableStats] = useState([]);
  const [isEditingStats, setIsEditingStats] = useState(false);
  const [savingStats, setSavingStats] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesEdit, setNotesEdit] = useState(game.notes || '');
  const [editingReminders, setEditingReminders] = useState(false);
  const [remindersEdit, setRemindersEdit] = useState(game.reminders || '');
  const [savingField, setSavingField] = useState(false);

  const teamStats = safeJson(game.team_stats) || [];
  const availability = safeJson(game.player_availability) || {};
  const startingFive = safeJson(game.starting_five) || [];
  const matchups = safeJson(game.matchups) || [];
  const specialPlays = safeJson(game.special_plays) || [];
  const trackedDuration = formatDuration(game.game_timer_seconds);

  useEffect(() => {
    setEditableStats(teamStats.map(s => ({ ...s })));
    if (game.team_id) {
      db.entities.Player.filter({ team_id: game.team_id }).then(setPlayers).catch(() => {});
    }
  }, [game]);

  const adjustStat = (index, delta) => {
    setEditableStats(prev => prev.map((s, i) => i === index
      ? { ...s, result: Math.max(0, (s.result || 0) + delta) } : s
    ));
  };

  const saveStats = async () => {
    setSavingStats(true);
    try {
      await db.entities.Game.update(game.id, { team_stats: JSON.stringify(editableStats) });
      toast.success('Stats updated!');
      setIsEditingStats(false);
    } catch (e) {
      toast.error('Error saving stats: ' + e.message);
    } finally {
      setSavingStats(false);
    }
  };

  const saveField = async (field, value) => {
    setSavingField(true);
    try {
      await db.entities.Game.update(game.id, { [field]: value });
      toast.success('Saved!');
      if (field === 'notes') setEditingNotes(false);
      if (field === 'reminders') setEditingReminders(false);
    } catch (e) {
      toast.error('Error saving: ' + e.message);
    } finally {
      setSavingField(false);
    }
  };

  const dateStr = game.game_date ? format(new Date(game.game_date + 'T00:00:00'), 'EEEE, d MMMM yyyy') : '—';
  const scoreStr = game.result !== 'TBD' && (game.our_score !== undefined || game.opponent_score !== undefined)
    ? `${game.our_score ?? '—'} – ${game.opponent_score ?? '—'}` : null;
  const playerMap = players.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
  const isCompleted = !!(game.team_stats || (game.result && game.result !== 'TBD'));

  const getPlayerLabel = (id) => {
    const p = playerMap[id];
    if (p) return `#${p.jersey_number ?? ''} ${p.name}`.trim();
    if (id && id.length < 20) return id; // short text, might be a name
    return '—';
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-2xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Game Summary</p>
            <h2 className="font-black text-xl text-slate-900 leading-tight">vs. {game.opponent}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {game.result && (
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${RESULT_STYLES[game.result] || RESULT_STYLES.TBD}`}>
                  <Trophy size={11} /> {game.result}
                </span>
              )}
              {trackedDuration && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full font-medium">
                  Tracked: {trackedDuration}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 ml-3 shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Meta */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="grid grid-cols-2 gap-2">
              <MetaBox label="Date" value={dateStr} />
              {teamName && <MetaBox label="Team" value={teamName} />}
              {game.location && <MetaBox label="Location" value={game.location} />}
              {game.season && <MetaBox label="Season" value={game.season} />}
              {scoreStr && <MetaBox label="Score" value={scoreStr} />}
            </div>
          </div>

          {/* Starting Five */}
          {startingFive.length > 0 && (
            <Section title="Starting Five">
              <div className="flex flex-wrap gap-2">
                {startingFive.map((pid, i) => (
                  <span key={i} className="bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl">
                    {getPlayerLabel(pid)}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Player Availability */}
          {players.length > 0 && (availability.in?.length > 0 || availability.out?.length > 0 || availability.questionable?.length > 0) && (
            <Section title="Player Availability">
              <div className="grid grid-cols-2 gap-2">
                {players.map(p => {
                  const status = availability.in?.includes(p.id) ? 'Available'
                    : availability.out?.includes(p.id) ? 'Unavailable'
                    : availability.questionable?.includes(p.id) ? 'Questionable'
                    : null;
                  if (!status) return null;
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${status === 'Available' ? 'bg-green-500' : status === 'Unavailable' ? 'bg-red-500' : 'bg-amber-400'}`} />
                      <span className="text-slate-700 truncate">{p.name}</span>
                      <span className={`font-semibold shrink-0 ${status === 'Available' ? 'text-green-600' : status === 'Unavailable' ? 'text-red-500' : 'text-amber-500'}`}>{status}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Matchups — display player names, never raw IDs */}
          {matchups.length > 0 && (
            <Section title="Matchups">
              <div className="space-y-1.5">
                {matchups.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-xl px-3 py-2">
                    <span className="font-semibold text-slate-900 flex-1">{getPlayerLabel(m.our)}</span>
                    <span className="text-slate-400 text-xs font-bold">vs</span>
                    <span className="font-semibold text-slate-600 flex-1 text-right">{m.their || '—'}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Special Plays */}
          {specialPlays.length > 0 && (
            <Section title="Special Plays">
              <div className="flex flex-wrap gap-2">
                {specialPlays.map((play, i) => (
                  <span key={i} className="bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
                    {typeof play === 'string' ? play : play.name || play}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Substitution Plan */}
          {game.substitution_plan && (
            <Section title="Substitution Plan">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{game.substitution_plan}</p>
            </Section>
          )}

          {/* Team Stats */}
          {editableStats.length > 0 && (
            <Section title="Team Stats" action={
              isEditingStats ? (
                <button onClick={saveStats} disabled={savingStats}
                  className="flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-800 px-2 py-1 rounded-lg hover:bg-green-50 disabled:opacity-50">
                  <Check size={12} />{savingStats ? 'Saving...' : 'Save'}
                </button>
              ) : (
                <button onClick={() => setIsEditingStats(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50">
                  <Pencil size={11} /> Edit
                </button>
              )
            }>
              <div className="space-y-2">
                {editableStats.map((stat, i) => {
                  const met = stat.target !== undefined && (stat.result || 0) >= stat.target;
                  return (
                    <div key={i} className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${met ? 'bg-green-50' : 'bg-slate-50'}`}>
                      <span className="text-sm font-semibold text-slate-900">{stat.name}</span>
                      {isEditingStats ? (
                        <div className="flex items-center gap-1.5">
                          {stat.target !== undefined && <span className="text-xs text-slate-400">Target: {stat.target}</span>}
                          <button onClick={() => adjustStat(i, -1)} className="w-7 h-7 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center"><Minus size={12} /></button>
                          <span className={`font-black text-lg w-10 text-center ${met ? 'text-green-600' : 'text-slate-900'}`}>{stat.result || 0}</span>
                          <button onClick={() => adjustStat(i, 1)} className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center justify-center"><Plus size={12} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-sm">
                          {stat.target !== undefined && <span className="text-slate-400">Target: {stat.target}</span>}
                          {stat.result !== undefined && <span className={`font-black text-lg ${met ? 'text-green-600' : 'text-slate-700'}`}>{stat.result}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Reminders */}
          <Section title="Reminders" action={
            !editingReminders ? (
              <button onClick={() => { setEditingReminders(true); setRemindersEdit(game.reminders || ''); }}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50">
                <Pencil size={11} /> Edit
              </button>
            ) : (
              <button onClick={() => saveField('reminders', remindersEdit)} disabled={savingField}
                className="flex items-center gap-1 text-xs font-bold text-green-600 disabled:opacity-50">
                <Check size={12} />{savingField ? '...' : 'Save'}
              </button>
            )
          }>
            {editingReminders ? (
              <div className="space-y-2">
                <textarea value={remindersEdit} onChange={e => setRemindersEdit(e.target.value)}
                  placeholder="Add reminders..." rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <button onClick={() => setEditingReminders(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
              </div>
            ) : game.reminders ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{game.reminders}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">No reminders — tap Edit to add</p>
            )}
          </Section>

          {/* Notes */}
          <Section title="Notes" action={
            !editingNotes ? (
              <button onClick={() => { setEditingNotes(true); setNotesEdit(game.notes || ''); }}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50">
                <Pencil size={11} /> Edit
              </button>
            ) : (
              <button onClick={() => saveField('notes', notesEdit)} disabled={savingField}
                className="flex items-center gap-1 text-xs font-bold text-green-600 disabled:opacity-50">
                <Check size={12} />{savingField ? '...' : 'Save'}
              </button>
            )
          }>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea value={notesEdit} onChange={e => setNotesEdit(e.target.value)}
                  placeholder="Add game notes..." rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <button onClick={() => setEditingNotes(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
              </div>
            ) : game.notes ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{game.notes}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">No notes — tap Edit to add</p>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 shrink-0">
          {!isCompleted && onStart && (
            <button onClick={() => onStart(game)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shrink-0">
              <Play size={14} /> Start Game
            </button>
          )}
          <button onClick={() => onEdit(game)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold">
            <Pencil size={14} /> Edit Game
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function MetaBox({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="font-semibold text-slate-900 text-sm leading-tight">{value}</p>
    </div>
  );
}