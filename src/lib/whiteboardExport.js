// Generates inline SVG strings for each whiteboard phase — used in exports

const ACTION_COLORS = {
  pass:     '#3b82f6',
  cut:      '#f97316',
  drive:    '#ea580c',
  screen:   '#a855f7',
  shot:     '#ef4444',
  dribble:  '#22c55e',
  handoff:  '#14b8a6',
  closeout: '#ef4444',
  help:     '#22c55e',
  rotate:   '#8b5cf6',
  boxout:   '#f59e0b',
};

const ACTION_DASH = {
  pass: '10 5', shot: '8 4', dribble: '4 3', handoff: '6 3', help: '6 3', rotate: '6 3',
};

const ACTION_WIDTH = {
  pass: 2, cut: 2.5, drive: 3.5, screen: 4, shot: 2,
};

// Simplified half-court SVG background (matches CourtSVG component, viewBox 0 0 470 500)
function courtBg() {
  const LINE = '#94a3b8';
  const LW = 1.5;
  const PAINT = '#f0f4ff';
  const bx = 235, by = 448, r3 = 239;
  const dx = bx - 30;
  const c3Y = (by - Math.sqrt(r3 * r3 - dx * dx)).toFixed(1);
  const raR = 40;
  return `
    <rect x="0" y="0" width="470" height="500" fill="#ffffff"/>
    <rect x="155" y="310" width="160" height="190" fill="${PAINT}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M 175 310 A 60 60 0 0 1 295 310" fill="${PAINT}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M 175 310 A 60 60 0 0 0 295 310" fill="none" stroke="${LINE}" stroke-width="${LW}" stroke-dasharray="6 4"/>
    <line x1="30" y1="500" x2="30" y2="${c3Y}" stroke="${LINE}" stroke-width="${LW}"/>
    <line x1="440" y1="500" x2="440" y2="${c3Y}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M 30 ${c3Y} A ${r3} ${r3} 0 0 1 440 ${c3Y}" fill="none" stroke="${LINE}" stroke-width="${LW}"/>
    <line x1="205" y1="494" x2="265" y2="494" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${bx}" cy="${by}" r="12" fill="none" stroke="#f97316" stroke-width="2"/>
    <path d="M ${bx - raR} ${by} A ${raR} ${raR} 0 0 0 ${bx + raR} ${by}" fill="none" stroke="${LINE}" stroke-width="${LW}"/>
    <rect x="0" y="0" width="470" height="500" fill="none" stroke="${LINE}" stroke-width="2"/>
    <line x1="0" y1="0" x2="470" y2="0" stroke="${LINE}" stroke-width="2"/>
  `;
}

function drivePathExport(pts) {
  if (!pts || pts.length < 2) return '';
  const start = pts[0], end = pts[pts.length - 1];
  const dx = end.x - start.x, dy = end.y - start.y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const nx = -dy/len, ny = dx/len;
  const amp = 14;
  const steps = Math.max(4, Math.floor(len / 22));
  let d = `M ${start.x} ${start.y}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = start.x + dx * t;
    const py = start.y + dy * t;
    const sign = i % 2 === 0 ? 1 : -1;
    d += i === steps
      ? ` L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
      : ` L ${(px + nx * amp * sign).toFixed(1)} ${(py + ny * amp * sign).toFixed(1)}`;
  }
  return d;
}

function qBezierPath(start, cp, end) {
  return `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`;
}

function renderAction(action) {
  const color = ACTION_COLORS[action.type] || '#f97316';
  const width = ACTION_WIDTH[action.type] || 2.5;
  const dash = ACTION_DASH[action.type];
  const pts = action.points || [];
  if (pts.length < 2) return '';

  const start = pts[0], end = pts[pts.length - 1];
  let d;
  if (action.type === 'drive') {
    d = drivePathExport(pts);
  } else if (pts.length === 2) {
    const defCp = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const cp = action.controlPoint || defCp;
    d = qBezierPath(start, cp, end);
  } else {
    d = `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x} ${p.y}`).join('');
  }

  const dashAttr = dash ? `stroke-dasharray="${dash}"` : '';
  const arrow = action.type !== 'screen'
    ? `<defs><marker id="a${action.id}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill="${color}"/></marker></defs>`
    : '';
  const markerEnd = action.type !== 'screen' ? `marker-end="url(#a${action.id})"` : '';

  let screenBar = '';
  if (action.type === 'screen') {
    const p1 = pts[pts.length - 2], p2 = pts[pts.length - 1];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const px = -dy/len * 20, py = dx/len * 20;
    screenBar = `<line x1="${p2.x-px}" y1="${p2.y-py}" x2="${p2.x+px}" y2="${p2.y+py}" stroke="${color}" stroke-width="${width * 1.5}" stroke-linecap="round"/>`;
  }

  return `${arrow}<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" ${dashAttr} stroke-linecap="round" stroke-linejoin="round" ${markerEnd}/>${screenBar}`;
}

function renderPlayer(player) {
  const isOff = ['1','2','3','4','5'].includes(player.type);
  const isDef = ['X1','X2','X3','X4','X5'].includes(player.type);
  const fill = isOff ? '#1e293b' : isDef ? '#ffffff' : '#f97316';
  const stroke = '#1e293b';
  const textColor = isOff ? '#ffffff' : '#1e293b';
  const r = player.type === 'cone' ? 10 : 16;
  const fontSize = (player.label || '').length > 2 ? 8 : 10;
  return `<circle cx="${player.x}" cy="${player.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text x="${player.x}" y="${player.y}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-size="${fontSize}" font-weight="bold" font-family="Arial,sans-serif">${player.label || ''}</text>`;
}

/**
 * Returns array of inline SVG HTML strings, one per phase.
 * Each SVG uses viewBox "0 0 470 500" (half-court).
 */
export function renderPhasesToSVGStrings(drawingData) {
  if (!drawingData) return [];
  let state;
  try { state = JSON.parse(drawingData); } catch { return []; }
  if (!state?.phases?.length) return [];

  return state.phases.map(phase => {
    const actions = (phase.actions || []).map(renderAction).join('');
    const players = (phase.players || []).map(renderPlayer).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 500" style="width:100%;max-width:340px;border-radius:8px;border:1px solid #e2e8f0;display:block;">${courtBg()}${actions}${players}</svg>`;
  });
}