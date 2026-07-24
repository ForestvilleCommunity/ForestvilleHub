import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';
import { useState, useMemo } from 'react';

const GOAL_TYPES = ['Reps', 'Makes', 'Laps', 'Time', 'Custom'];

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

export default function SessionTimeline({ sessionDrills, onChange, startTime }) {
  const [expanded, setExpanded] = useState({});
  const [timeMode, setTimeMode] = useState('elapsed'); // 'elapsed' | 'clock'

  // Running start-time per drill, in display order — always derived from
  // current order/durations, never stored.
  const startMinutes = useMemo(() => {
    let cursor = 0;
    return sessionDrills.map(sd => {
      const start = cursor;
      cursor += Number(sd.duration) || sd.drill?.duration_minutes || 0;
      return start;
    });
  }, [sessionDrills]);

  const startLabel = (index) => {
    const mins = startMinutes[index] ?? 0;
    return timeMode === 'clock' && startTime ? fmtClock(startTime, mins) : fmtElapsed(mins);
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(sessionDrills);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    onChange(items.map((item, idx) => ({ ...item, order: idx + 1 })));
  };

  const update = (index, field, value) => {
    onChange(sessionDrills.map((sd, i) => i === index ? { ...sd, [field]: value } : sd));
  };

  const adjustDuration = (index, delta) => {
    const current = Number(sessionDrills[index].duration) || sessionDrills[index].drill?.duration_minutes || 5;
    update(index, 'duration', Math.max(1, current + delta));
  };

  const remove = (index) => {
    onChange(sessionDrills.filter((_, i) => i !== index).map((sd, i) => ({ ...sd, order: i + 1 })));
  };

  const toggle = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  if (sessionDrills.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p className="text-sm font-medium">No drills added yet</p>
        <p className="text-xs mt-1">Use the drill picker to add drills</p>
      </div>
    );
  }

  const totalMins = sessionDrills.reduce((sum, sd) => sum + (Number(sd.duration) || sd.drill?.duration_minutes || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs text-slate-500">Total: {totalMins} min · {sessionDrills.length} drill{sessionDrills.length !== 1 ? 's' : ''}</p>
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

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="session-timeline">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {sessionDrills.map((sd, index) => {
                const key = `${sd.drill?.id}-${index}`;
                const isExpanded = expanded[key];
                const duration = Number(sd.duration) || sd.drill?.duration_minutes || 5;
                const hasGoalOrNotes = sd.goal_type || sd.session_notes;

                return (
                  <Draggable key={key} draggableId={key} index={index}>
                    {(prov, snap) => (
                      <div ref={prov.innerRef} {...prov.draggableProps}
                        className={`bg-white rounded-xl border transition-all ${snap.isDragging ? 'border-blue-400 shadow-lg' : 'border-slate-200'}`}>
                        <div className="p-3">
                          {/* Row 1: Drag + Number + Name + Expand/Delete */}
                          <div className="flex items-center gap-2">
                            <div {...prov.dragHandleProps} className="text-slate-300 hover:text-slate-500 cursor-grab shrink-0">
                              <GripVertical size={18} />
                            </div>
                            <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                              {index + 1}
                            </div>
                            <span className="shrink-0 text-xs font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 font-mono">
                              {startLabel(index)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-slate-900 truncate">{sd.drill?.name || 'Unknown Drill'}</p>
                              <p className="text-xs text-slate-400">{sd.drill?.theme}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {(hasGoalOrNotes || isExpanded) ? (
                                <button onClick={() => toggle(key)} className="p-1 text-slate-400 hover:text-slate-600">
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              ) : (
                                <button onClick={() => toggle(key)}
                                  className="text-xs font-semibold text-blue-500 hover:text-blue-700 px-1.5 whitespace-nowrap">
                                  + Target
                                </button>
                              )}
                              <button onClick={() => remove(index)} className="p-1 text-red-400 hover:text-red-600">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Row 2: Duration controls (on their own line, no overlap) */}
                          <div className="flex items-center gap-2 mt-2 ml-8">
                            <button onClick={() => adjustDuration(index, -5)}
                              className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors">
                              <Minus size={12} />
                            </button>
                            <span className="text-xs font-semibold text-slate-700 w-14 text-center">{duration} min</span>
                            <button onClick={() => adjustDuration(index, 5)}
                              className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors">
                              <Plus size={12} />
                            </button>
                            {sd.goal_type && !isExpanded && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold truncate max-w-24">
                                {sd.goal_type}{sd.goal_target ? `: ${sd.goal_target}` : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
                            <p className="text-xs text-slate-400 italic">Optional: set a target, like "20 makes" or "8/10 free throws."</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-xs font-semibold text-slate-500 mb-1 block">Goal Type</label>
                                <select value={sd.goal_type || ''} onChange={e => update(index, 'goal_type', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                                  <option value="">None</option>
                                  {GOAL_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 mb-1 block">Target</label>
                                <input value={sd.goal_target || ''} onChange={e => update(index, 'goal_target', e.target.value)}
                                  placeholder="e.g. 8/10"
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 mb-1 block">Result</label>
                                <input value={sd.goal_result || ''} onChange={e => update(index, 'goal_result', e.target.value)}
                                  placeholder="Actual"
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-500 mb-1 block">Session Notes</label>
                              <textarea value={sd.session_notes || ''} onChange={e => update(index, 'session_notes', e.target.value)}
                                rows={2} placeholder="Notes for this drill..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}