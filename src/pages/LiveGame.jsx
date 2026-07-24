import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, Check, PlusCircle, X, Play, Pause, RotateCcw, Pencil, ChevronRight } from 'lucide-react';
import { db } from '@/api/db';
import { toast } from 'sonner';

const DEFAULT_STATS = [
  { name: 'Our Offensive Rebounds', result: 0, section: 'us' },
  { name: 'Our Defensive Rebounds', result: 0, section: 'us' },
  { name: 'Turnovers', result: 0, section: 'us' },
  { name: 'FGA', result: 0, section: 'us' },
  { name: 'FTA', result: 0, section: 'us' },
  { name: 'Paint Touches', result: 0, section: 'us' },
  { name: 'Deflections', result: 0, section: 'us' },
  { name: 'Opponent Offensive Rebounds', result: 0, section: 'them' },
  { name: 'Opponent Defensive Rebounds', result: 0, section: 'them' },
];

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function safeParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export default function LiveGame() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [stats, setStats] = useState(DEFAULT_STATS.map(s => ({ ...s })));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupMode, setSetupMode] = useState(true);

  const [showAddStat, setShowAddStat] = useState(false);
  const [newStatName, setNewStatName] = useState('');
  const [newStatSection, setNewStatSection] = useState('us');
  const [renamingIndex, setRenamingIndex] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const [gameSeconds, setGameSeconds] = useState(0);
  const [gameRunning, setGameRunning] = useState(false);
  const timerRef = useRef(null);
  const [showResultPrompt, setShowResultPrompt] = useState(false);
  const [resultData, setResultData] = useState({ result: 'TBD', our_score: '', opponent_score: '' });

  // Persist live stat/timer progress to sessionStorage so an accidental refresh can resume
  const draftKey = `live_game_draft_${gameId}`;
  const saveDraft = (nextStats, nextSeconds) => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ stats: nextStats, gameSeconds: nextSeconds })); } catch {}
  };
  const clearDraft = () => { try { sessionStorage.removeItem(draftKey); } catch {} };

  useEffect(() => {
    if (gameRunning) {
      timerRef.current = setInterval(() => setGameSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gameRunning]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (setupMode) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [setupMode]);

  // Autosave stat/timer progress locally whenever it changes (separate from the explicit server Save)
  useEffect(() => {
    if (!loading && !setupMode) saveDraft(stats, gameSeconds);
  }, [stats, gameSeconds, loading, setupMode]);

  useEffect(() => {
    db.entities.Game.get(gameId).then(g => {
      setGame(g);
      const saved = safeParse(g.team_stats);
      if (saved && saved.length > 0) {
        setStats(saved);
        setSetupMode(false);
      }
      if (g.game_timer_seconds) setGameSeconds(g.game_timer_seconds);

      // Restore any local draft progress newer than what's on the server
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft.stats?.length) { setStats(draft.stats); setSetupMode(false); }
          if (draft.gameSeconds) setGameSeconds(draft.gameSeconds);
          toast('Game progress restored.', { duration: 3000 });
        }
      } catch {}

      setLoading(false);
    });
    return () => clearInterval(timerRef.current);
  }, [gameId]);

  const removeStat = (index) => setStats(prev => prev.filter((_, i) => i !== index));
  const renameStat = (index, name) => setStats(prev => prev.map((s, i) => i === index ? { ...s, name } : s));
  const addStat = () => {
    if (!newStatName.trim()) return;
    setStats(prev => [...prev, { name: newStatName.trim(), result: 0, section: newStatSection }]);
    setNewStatName('');
    setShowAddStat(false);
  };

  const adjust = (index, delta) => setStats(prev => prev.map((s, i) =>
    i === index ? { ...s, result: Math.max(0, (s.result || 0) + delta) } : s
  ));

  const handleSave = async () => {
    setSaving(true);
    try {
      await db.entities.Game.update(gameId, { team_stats: JSON.stringify(stats), game_timer_seconds: gameSeconds });
      clearDraft();
      toast.success('Stats saved!');
    } catch (e) {
      toast.error('Error saving: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setGameRunning(false);
    setSaving(true);
    try {
      await db.entities.Game.update(gameId, { team_stats: JSON.stringify(stats), game_timer_seconds: gameSeconds });
      clearDraft();
      setShowResultPrompt(true);
    } catch (e) {
      toast.error('Error saving stats: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveResult = async () => {
    const updates = { result: resultData.result };
    if (resultData.our_score !== '') updates.our_score = Number(resultData.our_score);
    if (resultData.opponent_score !== '') updates.opponent_score = Number(resultData.opponent_score);
    setSaving(true);
    try {
      await db.entities.Game.update(gameId, updates);
      clearDraft();
      toast.success('Game saved!');
      navigate('/games');
    } catch (e) {
      toast.error('Error saving result: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  // SETUP SCREEN
  if (setupMode) {
    return (
      <div className="fixed inset-0 flex flex-col bg-slate-900 text-white" style={{ zIndex: 100 }}>
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
          <button onClick={() => navigate('/games')} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">vs. {game?.opponent}</p>
            <p className="text-slate-400 text-xs">Choose stats to track</p>
          </div>
          <button onClick={() => setSetupMode(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold">
            Start <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Stats to Track — pencil to rename, X to remove
          </p>

          {/* OUR STATS */}
          <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Our Stats</p>
          <div className="space-y-2 mb-4">
            {stats.map((stat, i) => stat.section !== 'them' && (
              <div key={i} className="flex items-center gap-3 bg-slate-800 rounded-xl border border-slate-700 px-4 py-3">
                {renamingIndex === i ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => { if (renameValue.trim()) renameStat(i, renameValue.trim()); setRenamingIndex(null); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { if (renameValue.trim()) renameStat(i, renameValue.trim()); setRenamingIndex(null); }
                      if (e.key === 'Escape') setRenamingIndex(null);
                    }}
                    className="live-input flex-1 bg-slate-700 text-white px-2 py-1 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <span className="flex-1 text-sm font-semibold">{stat.name}</span>
                )}
                <button onClick={() => { setRenamingIndex(i); setRenameValue(stat.name); }}
                  className="p-1.5 text-slate-500 hover:text-white rounded-lg transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => removeStat(i)}
                  className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))}  
          </div>

          {/* OPPONENT STATS */}
          <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Opponent Stats</p>
          <div className="space-y-2 mb-4">
            {stats.map((stat, i) => stat.section === 'them' && (
              <div key={i} className="flex items-center gap-3 bg-slate-800 rounded-xl border border-red-900/30 px-4 py-3">
                {renamingIndex === i ? (
                  <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => { if (renameValue.trim()) renameStat(i, renameValue.trim()); setRenamingIndex(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') { if (renameValue.trim()) renameStat(i, renameValue.trim()); setRenamingIndex(null); } if (e.key === 'Escape') setRenamingIndex(null); }}
                    className="live-input flex-1 bg-slate-700 text-white px-2 py-1 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                ) : (
                  <span className="flex-1 text-sm font-semibold">{stat.name}</span>
                )}
                <button onClick={() => { setRenamingIndex(i); setRenameValue(stat.name); }} className="p-1.5 text-slate-500 hover:text-white rounded-lg"><Pencil size={14} /></button>
                <button onClick={() => removeStat(i)} className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg"><X size={14} /></button>
              </div>
            ))}
          </div>

          {showAddStat ? (
            <div className="mt-3 bg-slate-800 rounded-2xl border border-slate-700 p-4 space-y-3">
              <p className="font-semibold text-sm">Add Custom Stat</p>
              <input
                autoFocus
                value={newStatName}
                onChange={e => setNewStatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addStat(); if (e.key === 'Escape') setShowAddStat(false); }}
                placeholder="e.g. Assists, Steals..."
                className="live-input w-full px-3 py-2.5 rounded-xl bg-slate-700 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 mb-2">
                <button onClick={() => setNewStatSection('us')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${newStatSection === 'us' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>Our Stat</button>
                <button onClick={() => setNewStatSection('them')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${newStatSection === 'them' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-400'}`}>Opp. Stat</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowAddStat(false)} className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-semibold">Cancel</button>
                <button onClick={addStat} className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold">Add</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddStat(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 hover:border-blue-500 hover:text-blue-400 text-sm font-semibold transition-colors">
              <PlusCircle size={16} /> Add Custom Stat
            </button>
          )}
        </div>

        <div className="bg-slate-950 border-t border-slate-800 px-4 py-4 shrink-0">
          <button onClick={() => setSetupMode(false)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 font-bold text-base active:scale-95 transition-all">
            <Play size={20} /> Start Tracking ({stats.length} stats)
          </button>
        </div>
      </div>
    );
  }

  // LIVE SCREEN
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 text-white" style={{ zIndex: 100 }}>
      {/* Result Prompt Overlay */}
      {showResultPrompt && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-5 border border-slate-700">
            <div>
              <p className="text-xs font-bold text-green-400 uppercase tracking-widest mb-1">Stats Saved</p>
              <h2 className="font-black text-xl text-white">Add game result?</h2>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">Result</p>
              <div className="grid grid-cols-4 gap-1.5">
                {['Win', 'Loss', 'Draw', 'TBD'].map(r => (
                  <button key={r} onClick={() => setResultData(d => ({ ...d, result: r }))}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      resultData.result === r
                        ? r === 'Win' ? 'bg-green-600 text-white' : r === 'Loss' ? 'bg-red-600 text-white' : r === 'Draw' ? 'bg-amber-500 text-white' : 'bg-slate-500 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}>{r}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1.5">Our Score</p>
                <input type="number" value={resultData.our_score}
                  onChange={e => setResultData(d => ({ ...d, our_score: e.target.value }))}
                  placeholder="0"
                  className="live-input w-full px-3 py-2.5 rounded-xl bg-slate-700 text-white text-2xl font-black text-center placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1.5">Their Score</p>
                <input type="number" value={resultData.opponent_score}
                  onChange={e => setResultData(d => ({ ...d, opponent_score: e.target.value }))}
                  placeholder="0"
                  className="live-input w-full px-3 py-2.5 rounded-xl bg-slate-700 text-white text-2xl font-black text-center placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={handleSaveResult}
                className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 font-bold text-white text-base transition-colors">
                Save Result
              </button>
              <button onClick={() => setShowResultPrompt(false)}
                className="w-full py-2.5 rounded-xl border border-slate-600 text-slate-400 text-sm font-semibold hover:border-slate-500 transition-colors">
                Continue Tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
        <button onClick={() => navigate('/games')} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">vs. {game?.opponent}</p>
          <p className="text-slate-400 text-xs">Live Game Mode</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-semibold disabled:opacity-50">
          <Check size={14} />{saving ? '...' : 'Save'}
        </button>
      </div>

      {/* Timer */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <p className="text-3xl font-black font-mono tracking-tight text-white">{formatTime(gameSeconds)}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setGameRunning(r => !r)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-colors ${gameRunning ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {gameRunning ? <><Pause size={14} /> Pause</> : <><Play size={14} /> {gameSeconds > 0 ? 'Resume' : 'Start'}</>}
          </button>
          <button onClick={() => { setGameSeconds(0); setGameRunning(false); }}
            className="p-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Stats — grouped */}
      <div className="flex-1 overflow-y-auto p-4 pb-6">
        {/* OUR STATS */}
        <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3">Our Stats</p>
        <div className="space-y-2.5 mb-5">
          {stats.map((stat, i) => stat.section !== 'them' && (
            <div key={i} className="rounded-2xl border border-slate-700 bg-slate-800 p-3 flex items-center gap-3">
              <p className="flex-1 font-semibold text-sm truncate text-white">{stat.name}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => adjust(i, -1)} className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center active:scale-95"><Minus size={18} /></button>
                <span className="text-3xl font-black w-12 text-center text-white">{stat.result || 0}</span>
                <button onClick={() => adjust(i, 1)} className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center active:scale-95"><Plus size={18} /></button>
              </div>
            </div>
          ))}
        </div>
        {/* OPPONENT STATS */}
        <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">Opponent Stats</p>
        <div className="space-y-2.5">
          {stats.map((stat, i) => stat.section === 'them' && (
            <div key={i} className="rounded-2xl border border-red-900/40 bg-slate-800 p-3 flex items-center gap-3">
              <p className="flex-1 font-semibold text-sm truncate text-white">{stat.name}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => adjust(i, -1)} className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center active:scale-95"><Minus size={18} /></button>
                <span className="text-3xl font-black w-12 text-center text-white">{stat.result || 0}</span>
                <button onClick={() => adjust(i, 1)} className="w-10 h-10 rounded-xl bg-red-700 hover:bg-red-600 flex items-center justify-center active:scale-95"><Plus size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-950 border-t border-slate-800 px-4 py-4 shrink-0">
        <button onClick={handleFinish} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-green-600 hover:bg-green-700 font-bold text-base disabled:opacity-50 active:scale-95 transition-all">
          <Check size={20} /> Finish and Save Stats
        </button>
      </div>
    </div>
  );
}