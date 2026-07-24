import { useState } from 'react';
import { Undo2, Redo2, Copy, Trash2, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

export default function DrillToolbar({ wb }) {
  const { state } = wb;
  const totalPhases = state.phases.length;
  const currentIdx = state.currentPhaseIndex;
  const currentPhase = state.phases[currentIdx] || {};
  const [confirmClear, setConfirmClear] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);

  if (!controlsOpen) {
    return (
      <div className="bg-slate-900 border-b border-slate-700 px-2 py-1.5 flex justify-center shrink-0">
        <button onClick={() => setControlsOpen(true)}
          className="px-5 py-1.5 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-semibold transition-colors">
          ▼ Show Controls
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border-b border-slate-700 px-3 py-2 space-y-1.5 shrink-0 select-none">

      {/* Row 1 (all screens): Court toggle + Clear Board */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-semibold shrink-0">Court:</span>
        <div className="flex rounded-lg overflow-hidden border border-slate-700 shrink-0">
          <button onClick={() => wb.setCourt('half')}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${state.courtType === 'half' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            Half
          </button>
          <button onClick={() => wb.setCourt('full')}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${state.courtType === 'full' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            Full
          </button>
        </div>
        <button
          onClick={() => setControlsOpen(false)}
          className="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-semibold transition-colors">
          ▲ Hide Controls
        </button>
        <div className="flex-1" />
        {confirmClear ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-red-400 font-semibold">Clear all?</span>
            <button onClick={() => { wb.clearBoard(); setConfirmClear(false); }}
              className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold">Yes</button>
            <button onClick={() => setConfirmClear(false)}
              className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirmClear(true)}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 hover:bg-red-900/50 text-xs font-semibold transition-colors">
            <X size={11} /> Clear Board
          </button>
        )}
      </div>

      {/* Row 2 Desktop/Tablet: Phase nav + phase actions + Undo/Redo all on one row */}
      <div className="hidden md:flex items-center gap-1.5 flex-nowrap">
        <span className="text-xs text-slate-500 font-semibold shrink-0">Phase:</span>
        <Btn onClick={wb.addPhase} title="Add Phase"><Plus size={12} /><span className="ml-0.5">Add Phase</span></Btn>
        <SquareBtn onClick={() => wb.goToPhase(currentIdx - 1)} disabled={currentIdx === 0} title="Previous"><ChevronLeft size={14} /></SquareBtn>
        <span className="text-xs text-white font-bold px-1 whitespace-nowrap min-w-[48px] text-center bg-slate-700 rounded-md py-1">{currentIdx + 1} of {totalPhases}</span>
        <SquareBtn onClick={() => wb.goToPhase(currentIdx + 1)} disabled={currentIdx >= totalPhases - 1} title="Next"><ChevronRight size={14} /></SquareBtn>
        <Btn onClick={wb.clonePhase} title="Duplicate Phase"><Copy size={12} /><span className="ml-0.5">Duplicate</span></Btn>
        <button onClick={wb.deletePhase} disabled={totalPhases <= 1} title="Delete current phase"
          className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg border border-red-900/60 text-red-500/70 hover:bg-red-950/30 disabled:opacity-30 text-xs font-semibold transition-colors shrink-0">
          <Trash2 size={12} /><span className="ml-0.5">Delete Phase</span>
        </button>
        <div className="flex-1" />
        <SquareBtn onClick={wb.undo} disabled={!wb.canUndo} title="Undo"><Undo2 size={13} /></SquareBtn>
        <SquareBtn onClick={wb.redo} disabled={!wb.canRedo} title="Redo"><Redo2 size={13} /></SquareBtn>
      </div>

      {/* Row 2 Mobile: Phase nav + Undo/Redo */}
      <div className="flex md:hidden items-center gap-1.5">
        <span className="text-xs text-slate-500 font-semibold shrink-0">Phase:</span>
        <SquareBtn onClick={() => wb.goToPhase(currentIdx - 1)} disabled={currentIdx === 0}><ChevronLeft size={14} /></SquareBtn>
        <span className="text-xs text-white font-bold px-2 py-1 whitespace-nowrap bg-slate-700 rounded-md">{currentIdx + 1} of {totalPhases}</span>
        <SquareBtn onClick={() => wb.goToPhase(currentIdx + 1)} disabled={currentIdx >= totalPhases - 1}><ChevronRight size={14} /></SquareBtn>
        <div className="flex-1" />
        <SquareBtn onClick={wb.undo} disabled={!wb.canUndo} title="Undo"><Undo2 size={13} /></SquareBtn>
        <SquareBtn onClick={wb.redo} disabled={!wb.canRedo} title="Redo"><Redo2 size={13} /></SquareBtn>
      </div>

      {/* Row 3 Mobile: Phase actions */}
      <div className="flex md:hidden items-center justify-start gap-1.5 flex-wrap">
        <Btn onClick={wb.addPhase}><Plus size={12} /><span className="ml-0.5">Add Phase</span></Btn>
        <Btn onClick={wb.clonePhase}><Copy size={12} /><span className="ml-0.5">Dup</span></Btn>
        <button onClick={wb.deletePhase} disabled={totalPhases <= 1}
          className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg border border-red-900/60 text-red-500/70 hover:bg-red-950/30 disabled:opacity-30 text-xs font-semibold transition-colors shrink-0">
          <Trash2 size={12} /><span className="ml-0.5">Del Phase</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-semibold shrink-0 w-8">Title:</span>
        <input
          value={currentPhase.title || `Phase ${currentIdx + 1}`}
          onChange={e => wb.renamePhase(e.target.value)}
          placeholder="Phase title"
          className="live-input flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-semibold shrink-0 w-8">Desc:</span>
        <input
          value={currentPhase.description || ''}
          onChange={e => wb.updatePhaseDescription(e.target.value)}
          placeholder="Short description (optional)"
          className="live-input flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}

function SquareBtn({ children, onClick, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0">
      {children}
    </button>
  );
}

function Btn({ children, onClick, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="flex items-center px-2 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-30 text-xs font-semibold transition-colors shrink-0">
      {children}
    </button>
  );
}