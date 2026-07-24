import { useRef, useState, useCallback, useEffect } from 'react';
import CourtSVG, { HALF_COURT_VIEWBOX, FULL_COURT_VIEWBOX } from './CourtSVG';

const ACTION_STYLES = {
  pass:      { color: '#3b82f6', width: 2,   dash: '10 5', marker: 'arrow' },
  cut:       { color: '#f97316', width: 2.5, dash: 'none', marker: 'arrow' },
  drive:     { color: '#ea580c', width: 3.5, dash: 'none', marker: 'arrow' },
  screen:    { color: '#a855f7', width: 4,   dash: 'none', marker: 'block' },
  shot:      { color: '#ef4444', width: 2,   dash: '8 4',  marker: 'arrow' },
  dribble:   { color: '#22c55e', width: 2.5, dash: '4 3',  marker: 'arrow' },
  handoff:   { color: '#14b8a6', width: 2,   dash: '6 3',  marker: 'arrow' },
  closeout:  { color: '#ef4444', width: 2.5, dash: 'none', marker: 'arrow' },
  help:      { color: '#22c55e', width: 2,   dash: '6 3',  marker: 'arrow' },
  rotate:    { color: '#8b5cf6', width: 2,   dash: '6 3',  marker: 'arrow' },
  boxout:    { color: '#f59e0b', width: 2.5, dash: 'none', marker: 'arrow' },
};

const PLAYER_STYLE = {
  offense: { fill: '#1e293b', stroke: '#1e293b', text: '#fff' },
  defense: { fill: '#ffffff', stroke: '#1e293b', text: '#1e293b' },
  cone:    { fill: '#f97316', stroke: '#ea580c', text: '#fff' },
  text:    { fill: '#eff6ff', stroke: '#3b82f6',  text: '#1e40af' },
};

function isOffense(player) {
  if (player.role === 'defense' || player.role === 'cone') return false;
  if (player.role === 'offense') return true;
  return ['1','2','3','4','5'].includes(player.type);
}
function isDefense(player) {
  if (player.role === 'defense') return true;
  if (player.role) return false;
  return ['X1','X2','X3','X4','X5'].includes(player.type);
}
function getPlayerStyle(type) {
  if (isOffense(type)) return PLAYER_STYLE.offense;
  if (isDefense(type)) return PLAYER_STYLE.defense;
  if (type === 'cone') return PLAYER_STYLE.cone;
  return PLAYER_STYLE.text;
}

// Get point on quadratic bezier at t=0.5 (actual midpoint on curve)
function bezierMidpoint(start, cp, end) {
  return {
    x: 0.25 * start.x + 0.5 * cp.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * cp.y + 0.25 * end.y,
  };
}

// Convert visual midpoint back to bezier control point
function nodeToControlPoint(nodePt, start, end) {
  return {
    x: 2 * nodePt.x - 0.5 * (start.x + end.x),
    y: 2 * nodePt.y - 0.5 * (start.y + end.y),
  };
}

function smoothPath(points) {
  if (!points || points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i+1].x)/2, y: (points[i].y + points[i+1].y)/2 };
    d += ` Q ${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`;
  }
  d += ` L ${points[points.length-1].x} ${points[points.length-1].y}`;
  return d;
}

// Detect nearest player to a SVG point (returns player id or null)
function detectPlayerIds(pts, players) {
  const THRESHOLD = 35;
  const findNear = (pt) => {
    let best = null, bd = THRESHOLD;
    players.forEach(p => {
      const d = Math.sqrt((p.x - pt.x)**2 + (p.y - pt.y)**2);
      if (d < bd) { bd = d; best = p; }
    });
    return best?.id || null;
  };
  return { fromPlayerId: findNear(pts[0]), toPlayerId: findNear(pts[pts.length - 1]) };
}

// Curved zigzag/dribble drive path using bezier control point
function curvedDrivePath(start, cp, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const steps = Math.max(4, Math.floor(len / 22));
  const amp = 14;
  let d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = (1-t)*(1-t)*start.x + 2*(1-t)*t*cp.x + t*t*end.x;
    const py = (1-t)*(1-t)*start.y + 2*(1-t)*t*cp.y + t*t*end.y;
    const tx2 = 2*(1-t)*(cp.x-start.x) + 2*t*(end.x-cp.x);
    const ty2 = 2*(1-t)*(cp.y-start.y) + 2*t*(end.y-cp.y);
    const tlen = Math.sqrt(tx2*tx2 + ty2*ty2) || 1;
    const nx = -ty2/tlen, ny = tx2/tlen;
    const sign = i % 2 === 0 ? 1 : -1;
    if (i === steps) {
      d += ` L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    } else {
      d += ` L ${(px + nx * amp * sign).toFixed(1)} ${(py + ny * amp * sign).toFixed(1)}`;
    }
  }
  return d;
}

function ActionPath({ action, onDelete, isDeleteMode, cpOverride, onCpPointerDown, isSelected, onSelect }) {
  const style = ACTION_STYLES[action.type] || ACTION_STYLES.cut;
  const pts = action.points;
  if (!pts || pts.length < 2) return null;

  const start = pts[0];
  const end = pts[pts.length - 1];

  let d, cp, nodePt;
  if (action.type === 'drive') {
    const defCp = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    cp = cpOverride || action.controlPoint || defCp;
    d = curvedDrivePath(start, cp, end);
    nodePt = bezierMidpoint(start, cp, end);
  } else if (pts.length === 2) {
    const defaultCp = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    cp = cpOverride || action.controlPoint || defaultCp;
    d = `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`;
    // Show node at actual t=0.5 midpoint on curve (not at cp)
    nodePt = bezierMidpoint(start, cp, end);
  } else {
    d = smoothPath(pts);
  }

  const markerId = `arrow-${action.type}`;
  const markerEnd = style.marker !== 'block' ? `url(#${markerId})` : undefined;

  let screenBar = null;
  if (action.type === 'screen' && pts.length >= 2) {
    const p1 = pts[pts.length - 2], p2 = pts[pts.length - 1];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx+dy*dy) || 1;
    const px = -dy/len * 20, py = dx/len * 20;
    screenBar = <line x1={p2.x-px} y1={p2.y-py} x2={p2.x+px} y2={p2.y+py}
      stroke={style.color} strokeWidth={style.width * 1.5} strokeLinecap="round" />;
  }

  const handleClick = (e) => {
    e.stopPropagation();
    if (isDeleteMode) onDelete(action.id);
    else if (onSelect) onSelect(action.id);
  };

  return (
    <g
      onClick={handleClick}
      style={{ cursor: isDeleteMode || onSelect ? 'pointer' : 'default' }}
    >
      {/* Selection highlight */}
      {isSelected && <path d={d} fill="none" stroke="#ef4444" strokeWidth={style.width + 6} strokeLinecap="round" opacity={0.25} />}
      <path
        d={d}
        fill="none"
        stroke={style.color}
        strokeWidth={style.width}
        strokeDasharray={style.dash === 'none' ? undefined : style.dash}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={markerEnd}
        style={{ filter: isDeleteMode ? 'drop-shadow(0 0 3px red)' : undefined }}
      />
      {screenBar}
      {/* Wide invisible hit area */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
      {/* Curve control node (shown at t=0.5 on the actual curve) */}
      {nodePt && !isDeleteMode && !isSelected && onCpPointerDown && (
        <circle
          cx={nodePt.x}
          cy={nodePt.y}
          r={6}
          fill="rgba(255,255,255,0.9)"
          stroke={style.color}
          strokeWidth={2}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => { e.stopPropagation(); onCpPointerDown(e, action); }}
          onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); onCpPointerDown(e, action); }}
        />
      )}
    </g>
  );
}

function ArrowDefs() {
  return (
    <defs>
      {Object.entries(ACTION_STYLES).map(([type, style]) => (
        <marker key={type} id={`arrow-${type}`} markerWidth="8" markerHeight="8"
          refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill={style.color} />
        </marker>
      ))}
    </defs>
  );
}

export default function WhiteboardCanvas({ wb, selectedTool, onToolDone }) {
  const svgRef = useRef(null);
  const [dragState, setDragState] = useState(null);   // { playerId, offsetX, offsetY, initX, initY }
  const [selectedPlayerSvgPos, setSelectedPlayerSvgPos] = useState(null);

  const svgToScreen = useCallback((svgX, svgY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = svgX; pt.y = svgY;
    const s = pt.matrixTransform(svg.getScreenCTM());
    const cr = svg.getBoundingClientRect();
    return { x: s.x - cr.left, y: s.y - cr.top };
  }, []);
  const [dragOverride, setDragOverride] = useState(null);
  const [drawState, setDrawState] = useState(null);
  const [cpDragState, setCpDragState] = useState(null); // { actionId, startPt, endPt, offsetX, offsetY }
  const [cpDragOverride, setCpDragOverride] = useState(null); // cp control point position
  const [renamingPlayer, setRenamingPlayer] = useState(null);
  const [renameLabel, setRenameLabel] = useState('');
  // Contextual delete selection
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedActionId, setSelectedActionId] = useState(null);

  // Clear state when tool changes
  useEffect(() => {
    setDrawState(null);
    setSelectedPlayerId(null);
    setSelectedActionId(null);
  }, [selectedTool]);

  const courtType = wb.state.courtType;
  const viewBox = courtType === 'full' ? FULL_COURT_VIEWBOX : HALF_COURT_VIEWBOX;
  const isActionTool = selectedTool && ACTION_STYLES[selectedTool];
  const isPlayerTool = selectedTool && !ACTION_STYLES[selectedTool] && selectedTool !== 'delete';
  const isDeleteMode = selectedTool === 'delete';
  const noTool = !selectedTool;

  const getSVGPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const getEventCoords = (e) => {
    if (e.touches && e.touches.length > 0) return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    return { clientX: e.clientX, clientY: e.clientY };
  };

  const handleSVGClick = useCallback((e) => {
    if (dragState || cpDragState) return;
    const { clientX, clientY } = getEventCoords(e);
    const { x, y } = getSVGPoint(clientX, clientY);

    // No tool: clear selection (background click)
    if (noTool) {
      setSelectedPlayerId(null);
      setSelectedPlayerSvgPos(null);
      setSelectedActionId(null);
      return;
    }
    if (isPlayerTool) {
      wb.addPlayer(selectedTool, x, y, selectedTool);
      onToolDone && onToolDone('player');
      return;
    }
    if (isActionTool) {
      if (!drawState) {
        setDrawState({ type: selectedTool, points: [{ x, y }] });
      } else {
        const pts = [...drawState.points, { x, y }];
        const { fromPlayerId, toPlayerId } = detectPlayerIds(pts, wb.currentPhase?.players || []);
        wb.addAction(drawState.type, pts, fromPlayerId, toPlayerId);
        setDrawState(null);
        onToolDone && onToolDone('action');
      }
      return;
    }
  }, [dragState, cpDragState, noTool, isPlayerTool, isActionTool, selectedTool, drawState, wb, getSVGPoint, onToolDone]);

  const handleSVGDoubleClick = useCallback((e) => {
    if (drawState && drawState.points.length >= 2) {
      const pts = drawState.points;
      const { fromPlayerId, toPlayerId } = detectPlayerIds(pts, wb.currentPhase?.players || []);
      wb.addAction(drawState.type, pts, fromPlayerId, toPlayerId);
      setDrawState(null);
      onToolDone && onToolDone('action');
    }
  }, [drawState, wb, onToolDone]);

  const handlePlayerPointerDown = useCallback((e, player) => {
    e.stopPropagation();
    if (isDeleteMode) { wb.deletePlayer(player.id); return; }
    const { clientX, clientY } = getEventCoords(e);
    const { x, y } = getSVGPoint(clientX, clientY);
    // Store original player position for tap detection
    setDragState({ playerId: player.id, offsetX: x - player.x, offsetY: y - player.y, initX: player.x, initY: player.y });
  }, [isDeleteMode, wb, getSVGPoint]);

  // Cursor-on-node for cp drag: pass action (not pre-computed cp)
  const handleCpPointerDown = useCallback((e, action) => {
    const { clientX, clientY } = getEventCoords(e);
    const { x, y } = getSVGPoint(clientX, clientY);
    const pts = action.points;
    const start = pts[0], end = pts[pts.length - 1];
    const defCp = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const cp = action.controlPoint || defCp;
    // Node is at t=0.5 on curve
    const nodePt = bezierMidpoint(start, cp, end);
    setCpDragState({
      actionId: action.id,
      startPt: start,
      endPt: end,
      offsetX: x - nodePt.x,
      offsetY: y - nodePt.y,
    });
  }, [getSVGPoint]);

  const handlePointerMove = useCallback((e) => {
    const { clientX, clientY } = getEventCoords(e);
    const { x, y } = getSVGPoint(clientX, clientY);
    if (dragState) {
      setDragOverride({ id: dragState.playerId, x: x - dragState.offsetX, y: y - dragState.offsetY });
    }
    if (cpDragState) {
      // Dragged node position → convert to bezier control point
      const newNodeX = x - cpDragState.offsetX;
      const newNodeY = y - cpDragState.offsetY;
      const newCp = nodeToControlPoint(
        { x: newNodeX, y: newNodeY },
        cpDragState.startPt,
        cpDragState.endPt
      );
      setCpDragOverride({ actionId: cpDragState.actionId, x: newCp.x, y: newCp.y });
    }
  }, [dragState, cpDragState, getSVGPoint]);

  const DRAG_THRESHOLD = 8;

  const handlePointerUp = useCallback(() => {
    if (dragState) {
      const moved = dragOverride && (
        Math.abs(dragOverride.x - dragState.initX) > DRAG_THRESHOLD ||
        Math.abs(dragOverride.y - dragState.initY) > DRAG_THRESHOLD
      );
      if (moved) {
        wb.movePlayer(dragState.playerId, dragOverride.x, dragOverride.y);
      } else if (noTool && !isDeleteMode) {
        // Tap (not drag) → contextual menu
        const toggling = selectedPlayerId === dragState.playerId;
        setSelectedPlayerId(toggling ? null : dragState.playerId);
        setSelectedPlayerSvgPos(toggling ? null : { x: dragState.initX, y: dragState.initY });
        setSelectedActionId(null);
      }
    }
    if (cpDragState && cpDragOverride) {
      wb.updateActionControlPoint(cpDragState.actionId, { x: cpDragOverride.x, y: cpDragOverride.y });
    }
    setDragState(null); setDragOverride(null);
    setCpDragState(null); setCpDragOverride(null);
  }, [dragState, dragOverride, cpDragState, cpDragOverride, wb, noTool, isDeleteMode]);

  const handlePlayerDoubleClick = useCallback((e, player) => {
    e.stopPropagation();
    setRenamingPlayer(player);
    setRenameLabel(player.label);
  }, []);

  let cursor = 'default';
  if (isPlayerTool || isActionTool) cursor = 'crosshair';
  if (isDeleteMode) cursor = 'not-allowed';
  if (dragState || cpDragState) cursor = 'grabbing';

  return (
    <div className="relative w-full h-full select-none">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full"
        style={{ display: 'block', cursor, touchAction: 'none' }}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleSVGClick}
        onDoubleClick={handleSVGDoubleClick}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchMove={(e) => { e.preventDefault(); handlePointerMove(e); }}
        onTouchEnd={handlePointerUp}
      >
        <ArrowDefs />
        <CourtSVG courtType={courtType} />

        {/* Actions */}
        {wb.currentPhase?.actions?.map(action => {
          const cpOv = cpDragOverride?.actionId === action.id
            ? { x: cpDragOverride.x, y: cpDragOverride.y }
            : null;
          return (
            <ActionPath
              key={action.id}
              action={action}
              onDelete={wb.deleteAction}
              isDeleteMode={isDeleteMode}
              cpOverride={cpOv}
              onCpPointerDown={!isDeleteMode && !selectedActionId ? handleCpPointerDown : null}
              isSelected={selectedActionId === action.id}
              onSelect={noTool && !isDeleteMode
                ? (id) => { setSelectedActionId(prev => prev === id ? null : id); setSelectedPlayerId(null); }
                : null
              }
            />
          );
        })}

        {/* Drawing preview */}
        {drawState && drawState.points.length >= 1 && (
          <g opacity="0.6">
            {drawState.points.length >= 2 && (
              <path d={smoothPath(drawState.points)} fill="none"
                stroke={ACTION_STYLES[drawState.type]?.color || '#666'}
                strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />
            )}
            {drawState.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="4" fill={ACTION_STYLES[drawState.type]?.color || '#666'} />
            ))}
          </g>
        )}

        {/* Players */}
        {wb.currentPhase?.players?.map(player => {
          const pos = dragOverride?.id === player.id ? dragOverride : player;
          const isSelected = selectedPlayerId === player.id;
          const off = isOffense(player);
          const def = isDefense(player);
          const hasBall = player.hasBall === true;
          return (
            <g key={player.id} transform={`translate(${pos.x}, ${pos.y})`}
              onMouseDown={(e) => handlePlayerPointerDown(e, player)}
              onTouchStart={(e) => { e.preventDefault(); handlePlayerPointerDown(e, player); }}
              onDoubleClick={(e) => handlePlayerDoubleClick(e, player)}
              style={{ cursor: isDeleteMode ? 'not-allowed' : dragState?.playerId === player.id ? 'grabbing' : 'grab' }}>
              {/* Invisible hit area ensures all player types are draggable/tappable */}
              <circle r={22} fill="transparent" />
              {/* Selection ring */}
              {isSelected && <circle r={22} fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" />}
              {/* Cone */}
              {player.type === 'cone' && (
                <>
                  <circle r={10} fill="#f97316" stroke="#ea580c" strokeWidth={2} />
                  <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={8} fontWeight="bold"
                    fontFamily="Inter, sans-serif" style={{ userSelect: 'none', pointerEvents: 'none' }}>C</text>
                </>
              )}
              {/* Offense with ball: white circle, black outline, black number */}
              {off && hasBall && (
                <>
                  <circle r={18} fill="white" stroke="#1e293b" strokeWidth={2.5} />
                  <text textAnchor="middle" dominantBaseline="central" fill="#1e293b"
                    fontSize={player.label.length > 2 ? 11 : 15} fontWeight="800"
                    fontFamily="Inter, sans-serif" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {player.label}
                  </text>
                </>
              )}
              {/* Offense without ball: dark circle, white number */}
              {off && !hasBall && (
                <>
                  <circle r={18} fill="#1e293b" stroke="#1e293b" strokeWidth={2} />
                  <text textAnchor="middle" dominantBaseline="central" fill="white"
                    fontSize={player.label.length > 2 ? 11 : 15} fontWeight="800"
                    fontFamily="Inter, sans-serif" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {player.label}
                  </text>
                </>
              )}
              {/* Defense: red text, no circle */}
              {def && (
                <text textAnchor="middle" dominantBaseline="central" fill="#dc2626"
                  fontSize={player.label.length > 2 ? 11 : 15} fontWeight="800"
                  fontFamily="Inter, sans-serif" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {player.label}
                </text>
              )}
            </g>
          );
        })}

        {null /* contextual menu rendered as HTML overlay below */}

        {/* Contextual delete button for selected action */}
        {selectedActionId && noTool && (() => {
          const action = wb.currentPhase?.actions?.find(a => a.id === selectedActionId);
          if (!action || action.points.length < 2) return null;
          const start = action.points[0], end = action.points[action.points.length - 1];
          const defCp = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
          const cp = action.controlPoint || defCp;
          const mid = bezierMidpoint(start, cp, end);
          return (
            <g key="ctx-del-action"
              transform={`translate(${mid.x + 14}, ${mid.y - 14})`}
              onClick={(e) => { e.stopPropagation(); wb.deleteAction(selectedActionId); setSelectedActionId(null); }}
              style={{ cursor: 'pointer' }}>
              <circle r={18} fill="#ef4444" stroke="white" strokeWidth={2} opacity={0.95} />
              <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={22} fontWeight="bold"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>×</text>
            </g>
          );
        })()}
      </svg>

      {/* HTML contextual menu for selected player */}
      {selectedPlayerId && noTool && selectedPlayerSvgPos && (() => {
        const player = wb.currentPhase?.players?.find(p => p.id === selectedPlayerId);
        if (!player) return null;
        const screen = svgToScreen(selectedPlayerSvgPos.x, selectedPlayerSvgPos.y);
        return (
          <div
            className="absolute z-30 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl py-1 min-w-[148px]"
            style={{ left: Math.min(screen.x + 20, 260), top: Math.max(screen.y - 160, 4) }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {isOffense(player) && !player.hasBall && (
              <MenuItem onClick={() => { wb.setPlayerBall(player.id, true); setSelectedPlayerId(null); setSelectedPlayerSvgPos(null); }}>🏀 Give Ball</MenuItem>
            )}
            {isOffense(player) && player.hasBall && (
              <MenuItem onClick={() => { wb.setPlayerBall(player.id, false); setSelectedPlayerId(null); setSelectedPlayerSvgPos(null); }}>○ Remove Ball</MenuItem>
            )}
            <MenuItem onClick={() => { wb.updatePlayerType && wb.updatePlayerType(player.id, 'offense'); setSelectedPlayerId(null); setSelectedPlayerSvgPos(null); }}>→ Set Offense</MenuItem>
            <MenuItem onClick={() => { wb.updatePlayerType && wb.updatePlayerType(player.id, 'defense'); setSelectedPlayerId(null); setSelectedPlayerSvgPos(null); }}>✕ Set Defense</MenuItem>
            <div className="h-px bg-slate-700 my-1" />
            <MenuItem onClick={() => { setRenamingPlayer(player); setRenameLabel(player.label); setSelectedPlayerId(null); setSelectedPlayerSvgPos(null); }}>✎ Rename</MenuItem>
            <MenuItem danger onClick={() => { wb.deletePlayer(player.id); setSelectedPlayerId(null); setSelectedPlayerSvgPos(null); }}>Delete</MenuItem>
          </div>
        );
      })()}

      {/* Drawing hint */}
      {drawState && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          <button onClick={() => { if (drawState.points.length >= 2) { const pts = drawState.points; const { fromPlayerId, toPlayerId } = detectPlayerIds(pts, wb.currentPhase?.players || []); wb.addAction(drawState.type, pts, fromPlayerId, toPlayerId); setDrawState(null); onToolDone && onToolDone('action'); } }}
            disabled={drawState.points.length < 2}
            className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow disabled:opacity-50">
            ✓ Done
          </button>
          <button onClick={() => setDrawState(null)}
            className="bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow">
            ✕ Cancel
          </button>
        </div>
      )}

      {/* Rename modal */}
      {renamingPlayer && (
        <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center" onClick={() => setRenamingPlayer(null)}>
          <div className="bg-white rounded-2xl p-5 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 mb-3">Rename Player</h3>
            <input autoFocus value={renameLabel} onChange={e => setRenameLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { wb.renamePlayer(renamingPlayer.id, renameLabel); setRenamingPlayer(null); }
                if (e.key === 'Escape') setRenamingPlayer(null);
              }}
              placeholder="e.g. PG, 12, Shooter"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              maxLength={4} />
            <div className="flex gap-2">
              <button onClick={() => { wb.renamePlayer(renamingPlayer.id, renameLabel); setRenamingPlayer(null); }}
                className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-semibold">Save</button>
              <button onClick={() => setRenamingPlayer(null)}
                className="flex-1 border border-slate-200 rounded-xl py-2 text-sm text-slate-600">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-700 transition-colors ${danger ? 'text-red-400 hover:text-red-300' : 'text-white'}`}>
      {children}
    </button>
  );
}

export { ACTION_STYLES };