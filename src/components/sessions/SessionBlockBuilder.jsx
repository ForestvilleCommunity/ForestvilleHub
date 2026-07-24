import { useState, useMemo } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X, Pencil, Clock } from 'lucide-react';
import DrillPicker from './DrillPicker';

const uid = () => Math.random().toString(36).slice(2, 9);

export const BLOCK_TYPES = ['Warm-up', 'Skill Development', 'Team Concept', 'Live Play', 'Cool Down', 'Custom'];

// Elapsed minutes -> "0:00" / "1:05"
function fmtElapsed(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// "HH:MM" start-of-day + elapsed minutes -> "9:05 AM"
function fmtClock(startTime, elapsedMins) {
  const [sh, sm] = startTime.split(':').map(Number);
  const total = sh * 60 + sm + elapsedMins;
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

const COLORS = {
  'Warm-up':           { border: 'border-amber-200',  bg: 'bg-amber-50',  badge: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-400' },
  'Skill Development': { border: 'border-blue-200',   bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  'Team Concept':      { border: 'border-purple-200', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  'Live Play':         { border: 'border-red-200',    bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
  'Cool Down':         { border: 'border-teal-200',   bg: 'bg-teal-50',   badge: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-500' },
  'Custom':            { border: 'border-slate-200',  bg: 'bg-slate-50',  badge: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
};

export function createDefaultBlocks() {
  return [{ id: 'main-block', title: 'Main Session', block_type: 'Skill Development', notes: '', order: 0 }];
}

export default function SessionBlockBuilder({ blocks, sessionDrills, user, onBlocksChange, onDrillsChange, teamId, startTime }) {
  const [expandedBlock, setExpandedBlock] = useState(blocks[0]?.id || null);
  const [showPickerFor, setShowPickerFor] = useState(null);
  const [editingTitle, setEditingTitle] = useState(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [targetingDrill, setTargetingDrill] = useState(null); // { drillId, blockId }
  const [targetForm, setTargetForm] = useState({ goal_type: 'Makes', goal_target: '', session_notes: '' });
  const [timeMode, setTimeMode] = useState('elapsed'); // 'elapsed' | 'clock'

  // Running start-time per drill, in display order (block order, then in-block order) —
  // always derived from current blocks/durations, never stored.
  const timeline = useMemo(() => {
    const map = new Map();
    let cursor = 0;
    blocks.forEach(block => {
      sessionDrills.filter(sd => sd.block_id === block.id).forEach(sd => {
        map.set(`${block.id}:${sd.drill?.id}`, cursor);
        cursor += Number(sd.duration) || sd.drill?.duration_minutes || 0;
      });
    });
    return map;
  }, [blocks, sessionDrills]);

  const startLabel = (blockId, drillId) => {
    const mins = timeline.get(`${blockId}:${drillId}`) ?? 0;
    return timeMode === 'clock' && startTime ? fmtClock(startTime, mins) : fmtElapsed(mins);
  };

  const saveTarget = () => {
    if (!targetingDrill) return;
    onDrillsChange(sessionDrills.map(sd =>
      sd.drill?.id === targetingDrill.drillId && sd.block_id === targetingDrill.blockId
        ? { ...sd, goal_type: targetForm.goal_type, goal_target: targetForm.goal_target, session_notes: targetForm.session_notes }
        : sd
    ));
    setTargetingDrill(null);
  };

  // Total session duration from all drills
  const totalDuration = sessionDrills.reduce((s, sd) => s + (Number(sd.duration) || 0), 0);

  const addBlockOfType = (type) => {
    const nb = { id: uid(), title: type, block_type: type, notes: '', order: blocks.length };
    onBlocksChange([...blocks, nb]);
    setExpandedBlock(nb.id);
    setAddingBlock(false);
  };

  const updateBlock = (id, field, value) => onBlocksChange(blocks.map(b => b.id === id ? { ...b, [field]: value } : b));

  const deleteBlock = (id) => {
    const remaining = blocks.filter(b => b.id !== id);
    onBlocksChange(remaining);
    // Move orphaned drills to first remaining block
    const fallbackId = remaining[0]?.id || null;
    onDrillsChange(sessionDrills.map(sd => sd.block_id === id ? { ...sd, block_id: fallbackId } : sd));
    if (expandedBlock === id) setExpandedBlock(remaining[0]?.id || null);
  };

  const moveBlock = (id, dir) => {
    const idx = blocks.findIndex(b => b.id === id);
    const nb = [...blocks];
    const si = dir === 'up' ? idx - 1 : idx + 1;
    if (si < 0 || si >= nb.length) return;
    [nb[idx], nb[si]] = [nb[si], nb[idx]];
    onBlocksChange(nb.map((b, i) => ({ ...b, order: i })));
  };

  // Add drill to a specific block — same drill allowed in multiple blocks, but NOT twice in same block
  const addDrillToBlock = (drill, blockId) => {
    const alreadyInBlock = sessionDrills.find(sd => sd.drill?.id === drill.id && sd.block_id === blockId);
    if (!alreadyInBlock) {
      onDrillsChange([...sessionDrills, {
        drill, block_id: blockId,
        duration: drill.duration_minutes || 5,
        session_notes: '', goal_type: '', goal_target: '', goal_result: '',
        order: sessionDrills.length + 1,
      }]);
    }
  };

  // Remove specific drill from specific block (not from other blocks)
  const removeDrillFromBlock = (drillId, blockId) => {
    onDrillsChange(sessionDrills.filter(sd => !(sd.drill?.id === drillId && sd.block_id === blockId)));
  };

  return (
    <div className="space-y-3">
      {/* Total summary */}
      {totalDuration > 0 && (
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Clock size={12} />
            <span>~{totalDuration} min total · {blocks.length} block{blocks.length !== 1 ? 's' : ''} · {sessionDrills.length} drill{sessionDrills.length !== 1 ? 's' : ''}</span>
          </div>
          {startTime && (
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
              {[['elapsed', 'Elapsed'], ['clock', 'Clock']].map(([mode, label]) => (
                <button key={mode} onClick={() => setTimeMode(mode)}
                  className={`text-xs font-semibold px-2 py-1 rounded-md transition-colors ${timeMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Block list */}
      {blocks.map((block, idx) => {
        const blockDrills = sessionDrills.filter(sd => sd.block_id === block.id);
        const blockDuration = blockDrills.reduce((s, sd) => s + (Number(sd.duration) || 0), 0);
        const isExpanded = expandedBlock === block.id;
        const c = COLORS[block.block_type] || COLORS['Custom'];
        // Per-block selected drill ids (for DrillPicker checked state)
        const blockDrillIds = blockDrills.map(sd => sd.drill?.id).filter(Boolean);

        return (
          <div key={block.id} className={`rounded-2xl border-2 ${c.border} overflow-hidden`}>
            {/* Header */}
            <div className={`${c.bg} px-4 py-3 flex items-center gap-2`}>
              {/* Reorder arrows */}
              <div className="flex flex-col shrink-0 -gap-1">
                <button onClick={() => moveBlock(block.id, 'up')} disabled={idx === 0}
                  className="disabled:opacity-20 text-slate-400 hover:text-slate-600 leading-none py-0.5"><ChevronUp size={13} /></button>
                <button onClick={() => moveBlock(block.id, 'down')} disabled={idx === blocks.length - 1}
                  className="disabled:opacity-20 text-slate-400 hover:text-slate-600 leading-none py-0.5"><ChevronDown size={13} /></button>
              </div>

              {/* Colored dot */}
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />

              {/* Title */}
              <div className="flex-1 min-w-0">
                {editingTitle === block.id ? (
                  <input autoFocus value={block.title}
                    onChange={e => updateBlock(block.id, 'title', e.target.value)}
                    onBlur={() => setEditingTitle(null)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(null); }}
                    className="w-full text-sm font-bold bg-white border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-sm text-slate-900 truncate">{block.title}</p>
                    <button onClick={() => setEditingTitle(block.id)} className="text-slate-300 hover:text-slate-500 shrink-0">
                      <Pencil size={11} />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${c.badge}`}>{block.block_type}</span>
                  {blockDuration > 0 && (
                    <span className="text-xs text-slate-400 flex items-center gap-0.5">
                      <Clock size={10} />{blockDuration}m
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{blockDrills.length} drill{blockDrills.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Expand/collapse */}
              <button onClick={() => { setExpandedBlock(isExpanded ? null : block.id); setShowPickerFor(null); }}
                className="text-xs font-semibold text-blue-600 px-2 py-1.5 rounded-xl hover:bg-blue-50 shrink-0">
                {isExpanded ? 'Done' : 'Open'}
              </button>

              {/* Delete (not if only block) */}
              {blocks.length > 1 && (
                <button onClick={() => deleteBlock(block.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl shrink-0 transition-colors">
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {/* Expanded area */}
            {isExpanded && (
              <div className="bg-white border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
                {/* Notes */}
                <textarea value={block.notes || ''} rows={2}
                  onChange={e => updateBlock(block.id, 'notes', e.target.value)}
                  placeholder="Block notes (optional)..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />

                {/* Drills in block — picker shown directly, no extra "Add Drills" step */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Add drills</p>
                  <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl mb-3 bg-white">
                    <DrillPicker
                      user={user}
                      teamId={teamId}
                      selectedDrillIds={blockDrillIds}
                      onAdd={d => addDrillToBlock(d, block.id)}
                      onRemove={drillId => removeDrillFromBlock(drillId, block.id)}
                    />
                  </div>

                  {blockDrills.length > 0 && (
                    <>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">In this block ({blockDrills.length})</p>
                    <div className="space-y-1.5">
                      {blockDrills.map((sd) => {
                        const isTargeting = targetingDrill?.drillId === sd.drill?.id && targetingDrill?.blockId === block.id;
                        const hasTarget = sd.goal_type && sd.goal_target;
                        return (
                          <div key={`${sd.drill?.id}-${block.id}`} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                            <div className="px-3 py-2 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <span className="shrink-0 text-xs font-bold text-slate-500 bg-slate-200 rounded px-1.5 py-0.5 font-mono">
                                    {startLabel(block.id, sd.drill?.id)}
                                  </span>
                                  <p className="text-xs font-semibold text-slate-800 truncate">{sd.drill?.name}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="number" min="1"
                                      value={sd.duration || sd.drill?.duration_minutes || ''}
                                      onChange={e => onDrillsChange(sessionDrills.map(x =>
                                        x.drill?.id === sd.drill?.id && x.block_id === block.id
                                          ? { ...x, duration: Number(e.target.value) || 0 } : x
                                      ))}
                                      onClick={e => e.stopPropagation()}
                                      className="w-10 text-xs text-center border border-slate-200 rounded-lg py-0.5 bg-white focus:ring-1 focus:ring-blue-400 focus:outline-none"
                                    />
                                    <span className="text-xs text-slate-400">m</span>
                                  </div>
                                  <button onClick={() => removeDrillFromBlock(sd.drill?.id, block.id)} className="p-1 text-slate-300 hover:text-red-500">
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setTargetingDrill({ drillId: sd.drill?.id, blockId: block.id });
                                  setTargetForm({ goal_type: sd.goal_type || 'Makes', goal_target: sd.goal_target || '', session_notes: sd.session_notes || '' });
                                }}
                                className={`text-xs font-bold px-2.5 py-1.5 rounded-lg w-full text-left transition-colors ${
                                  hasTarget
                                    ? 'text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100'
                                    : 'text-blue-700 bg-blue-100 hover:bg-blue-200 border border-blue-200'
                                }`}>
                                {hasTarget ? `✎ ${sd.goal_type}: ${sd.goal_target}` : '+ Add Target'}
                              </button>
                            </div>
                            {isTargeting && (
                              <div className="border-t border-blue-100 bg-blue-50 px-3 py-2.5 space-y-2">
                                <div className="flex gap-1.5 flex-wrap">
                                  {['Makes', 'Stops', 'Reps', 'Custom'].map(type => (
                                    <button key={type}
                                      onClick={() => setTargetForm(f => ({ ...f, goal_type: type }))}
                                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                                        targetForm.goal_type === type ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-50'
                                      }`}>
                                      {type}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={targetForm.goal_target}
                                    onChange={e => setTargetForm(f => ({ ...f, goal_target: e.target.value }))}
                                    placeholder="Target (e.g. 25)"
                                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                  <input
                                    type="text"
                                    value={targetForm.session_notes}
                                    onChange={e => setTargetForm(f => ({ ...f, session_notes: e.target.value }))}
                                    placeholder="Notes (optional)"
                                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={saveTarget} className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">Save Target</button>
                                  <button onClick={() => setTargetingDrill(null)} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-white">Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Collapsed drill preview */}
            {!isExpanded && blockDrills.length > 0 && (
              <div className="bg-white border-t border-slate-100 px-4 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {blockDrills.map((sd) => (
                    <span key={`${sd.drill?.id}-${block.id}`} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-500 truncate max-w-[180px]">
                      {sd.drill?.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add block */}
      {addingBlock ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-blue-300 p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Choose block type</p>
          <div className="grid grid-cols-2 gap-2">
            {BLOCK_TYPES.map(type => {
              const c = COLORS[type] || COLORS['Custom'];
              return (
                <button key={type} onClick={() => addBlockOfType(type)}
                  className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 ${c.border} ${c.bg} hover:shadow-sm transition-all active:scale-95 text-left`}>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                  <span className="text-sm font-bold text-slate-800">{type}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => setAddingBlock(false)} className="w-full mt-2 py-2 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAddingBlock(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-500 text-sm font-semibold transition-colors active:scale-95">
          <Plus size={16} /> Add Block
        </button>
      )}
    </div>
  );
}