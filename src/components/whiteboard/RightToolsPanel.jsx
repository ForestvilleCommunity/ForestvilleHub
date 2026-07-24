import { ACTION_STYLES } from './WhiteboardCanvas';

const PLAYER_TOOLS = [
  { id: '1',  label: '1',  group: 'offense' },
  { id: '2',  label: '2',  group: 'offense' },
  { id: '3',  label: '3',  group: 'offense' },
  { id: '4',  label: '4',  group: 'offense' },
  { id: '5',  label: '5',  group: 'offense' },
  { id: 'X1', label: 'X1', group: 'defense' },
  { id: 'X2', label: 'X2', group: 'defense' },
  { id: 'X3', label: 'X3', group: 'defense' },
  { id: 'X4', label: 'X4', group: 'defense' },
  { id: 'X5', label: 'X5', group: 'defense' },
  { id: 'cone', label: '▲', group: 'object' },
];

const ACTION_TOOLS = [
  { id: 'pass',   label: 'Pass',   desc: 'Dashed line' },
  { id: 'cut',    label: 'Cut',    desc: 'Solid arrow' },
  { id: 'drive',  label: 'Drive',  desc: 'Bold arrow' },
  { id: 'screen', label: 'Screen', desc: 'T-block' },
  { id: 'shot',   label: 'Shot',   desc: 'Shot arc' },
];

export default function RightToolsPanel({ selectedTool, onToolSelect }) {
  const select = (id) => onToolSelect(selectedTool === id ? null : id);

  return (
    <div className="w-full h-full bg-slate-800 overflow-y-auto p-2">
      <div className="flex gap-2">
        {/* Left: Players */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Players</p>
          <div className="grid grid-cols-5 gap-1 mb-1.5">
            {PLAYER_TOOLS.filter(t => t.group === 'offense').map(tool => (
              <PlayerBtn key={tool.id} tool={tool} selected={selectedTool === tool.id} onSelect={select} isOffense />
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1 mb-1.5">
            {PLAYER_TOOLS.filter(t => t.group === 'defense').map(tool => (
              <PlayerBtn key={tool.id} tool={tool} selected={selectedTool === tool.id} onSelect={select} isOffense={false} />
            ))}
          </div>
          {PLAYER_TOOLS.filter(t => t.group === 'object').map(tool => (
            <button key={tool.id} onClick={() => select(tool.id)}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                selectedTool === tool.id ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}>
              {tool.label} Cone
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="w-24 shrink-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Actions</p>
          <div className="space-y-1">
            {ACTION_TOOLS.map(tool => {
              const style = ACTION_STYLES[tool.id];
              const isSelected = selectedTool === tool.id;
              return (
                <button key={tool.id} onClick={() => select(tool.id)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isSelected ? 'bg-slate-600 ring-1 ring-slate-400 text-white' : 'hover:bg-slate-700 text-slate-300'
                  }`}>
                  <svg width="18" height="8" className="shrink-0">
                    <line x1="1" y1="4" x2="13" y2="4" stroke={style?.color || '#fff'} strokeWidth="1.5"
                      strokeDasharray={style?.dash === 'none' ? undefined : style?.dash} strokeLinecap="round" />
                    <polygon points="11,1.5 17,4 11,6.5" fill={style?.color || '#fff'} />
                  </svg>
                  {tool.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hint */}
      {selectedTool && (
        <div className="mt-2 bg-slate-700 rounded-lg p-2 text-xs text-slate-300">
          {ACTION_STYLES[selectedTool]
            ? <><span className="font-semibold text-white">{selectedTool}: </span>Click start, click end. Drag midpoint to curve.</>
            : 'Click anywhere on the court to place.'}
        </div>
      )}
    </div>
  );
}

function PlayerBtn({ tool, selected, onSelect, isOffense }) {
  return (
    <button
      onClick={() => onSelect(tool.id)}
      className={`aspect-square rounded-full text-xs font-black border-2 transition-all ${
        selected ? 'ring-2 ring-blue-400 scale-110' : 'hover:scale-105'
      } ${
        isOffense
          ? 'bg-slate-900 border-slate-700 text-white'
          : 'bg-white border-slate-600 text-slate-900'
      }`}
      style={{ fontSize: tool.label.length > 2 ? 8 : 10 }}
    >
      {tool.label}
    </button>
  );
}