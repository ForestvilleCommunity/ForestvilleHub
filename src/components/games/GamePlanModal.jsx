import { useState, useEffect } from 'react';
import { X, Pencil, Calendar, MapPin, FileDown } from 'lucide-react';
import { exportGamePlan } from '@/lib/exportHTML';
import { format } from 'date-fns';
import { db } from '@/api/db';
import { getAccessiblePlayers } from '@/lib/teamAccess';

const safeParse = (str, fallback) => {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
};

const RESULT_COLORS = {
  Win: 'bg-green-100 text-green-700',
  Loss: 'bg-red-100 text-red-600',
  Draw: 'bg-amber-100 text-amber-700',
  TBD: 'bg-slate-100 text-slate-500',
};

export default function GamePlanModal({ game, teamName, onClose, onEdit }) {
  const [players, setPlayers] = useState([]);
  const [plays, setPlays] = useState([]);

  const availability = safeParse(game.player_availability, { in: [], out: [], questionable: [] });
  const startingFive = safeParse(game.starting_five, []);
  const matchups = safeParse(game.matchups, []);
  const specialPlayIds = safeParse(game.special_plays, []);

  useEffect(() => {
    async function load() {
      const user = await db.auth.me().catch(() => null);
      if (!user || !game.team_id) return;
      const pl = await getAccessiblePlayers(user, game.team_id);
      setPlayers(pl);
      if (specialPlayIds.length === 0) { setPlays([]); return; }
      const drills = await db.entities.Drill.filter({ id: specialPlayIds }).catch(() => []);
      setPlays(drills);
    }
    load();
  }, [game.id]);

  const playerMap = players.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
  const dateStr = game.game_date ? format(new Date(game.game_date), 'EEE d MMM yyyy') : '—';
  const scoreStr = game.result !== 'TBD' && game.our_score !== undefined ? `${game.our_score} – ${game.opponent_score}` : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-black text-xl text-slate-900">vs {game.opponent}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${RESULT_COLORS[game.result] || ''}`}>
                {scoreStr || game.result || 'TBD'}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Calendar size={11} />{dateStr}</span>
              {game.location && <span className="flex items-center gap-1"><MapPin size={11} />{game.location}</span>}
              {teamName && <span className="font-semibold text-slate-700">{teamName}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 ml-2 shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {/* Player Availability */}
          {players.length > 0 && (
            <Section title="Player Availability">
              <div className="space-y-1.5">
                {players.map(p => {
                  const bucket = availability.in.includes(p.id) ? 'in' : availability.out.includes(p.id) ? 'out' : availability.questionable.includes(p.id) ? 'questionable' : null;
                  const label = bucket === 'in' ? { text: 'IN', cls: 'bg-green-100 text-green-700' } : bucket === 'out' ? { text: 'OUT', cls: 'bg-red-100 text-red-600' } : bucket === 'questionable' ? { text: '?', cls: 'bg-amber-100 text-amber-700' } : null;
                  return (
                    <div key={p.id} className="flex items-center gap-2 py-1">
                      <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">
                        {p.jersey_number !== undefined ? `#${p.jersey_number}` : '—'}
                      </div>
                      <p className="flex-1 text-sm text-slate-800">{p.name}</p>
                      {label && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${label.cls}`}>{label.text}</span>}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Starting Five */}
          {startingFive.length > 0 && (
            <Section title={`Starting Five (${startingFive.length}/5)`}>
              <div className="grid grid-cols-2 gap-2">
                {startingFive.map((id, i) => {
                  const p = playerMap[id];
                  if (!p) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 bg-slate-900 rounded-xl px-3 py-2">
                      <span className="text-slate-500 text-xs w-4">{i + 1}.</span>
                      <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center text-xs font-black shrink-0">
                        {p.jersey_number !== undefined ? `#${p.jersey_number}` : '—'}
                      </div>
                      <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Matchups */}
          {matchups.length > 0 && (
            <Section title="Matchups">
              <div className="space-y-1.5">
                {matchups.map((mu, i) => {
                  const p = playerMap[mu.our];
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-800 w-28 truncate">{p?.name || '—'}</span>
                      <span className="text-slate-400 text-xs">vs</span>
                      <span className="text-slate-600">{mu.their || '—'}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Substitution Plan */}
          {game.substitution_plan && (
            <Section title="Substitution Plan">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{game.substitution_plan}</p>
            </Section>
          )}

          {/* Special Plays */}
          {plays.length > 0 && (
            <Section title="Special Plays">
              <div className="space-y-1.5">
                {plays.map(play => (
                  <div key={play.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                    <span className="text-sm font-semibold text-slate-800">{play.name}</span>
                    <span className="text-xs text-slate-400 ml-auto">{play.play_category || play.theme}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Reminders */}
          {game.reminders && (
            <Section title="Reminders">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{game.reminders}</p>
            </Section>
          )}

          {/* Notes */}
          {game.notes && (
            <Section title="Notes">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{game.notes}</p>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
            Close
          </button>
          <button onClick={() => exportGamePlan(game, players, plays, teamName)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors">
            <FileDown size={14} />
            Export
          </button>
          <button onClick={() => onEdit(game)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold">
            <Pencil size={14} />
            Edit Game Plan
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}