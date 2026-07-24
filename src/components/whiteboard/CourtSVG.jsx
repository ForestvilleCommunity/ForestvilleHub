// Pure SVG basketball court elements (no <svg> wrapper — embedded inside WhiteboardCanvas SVG)

const LINE = '#94a3b8';
const LINE_W = 1.5;
const PAINT = '#f0f4ff';
const BG = '#ffffff';

function HalfCourt() {
  // viewBox: 0 0 470 500  (47ft x 50ft at 10px/ft)
  // Basket at (235, 448), baseline y=500, half-court y=0
  const bx = 235, by = 448;
  const r3 = 239;

  // Corner 3 line top: where arc intersects x=30 and x=440
  const dx = bx - 30;
  const corner3Y = by - Math.sqrt(r3 * r3 - dx * dx);

  // Restricted arc (toward baseline)
  const raR = 40;

  return (
    <g>
      {/* Court background */}
      <rect x="0" y="0" width="470" height="500" fill={BG} />

      {/* Paint / Key */}
      <rect x="155" y="310" width="160" height="190" fill={PAINT} stroke={LINE} strokeWidth={LINE_W} />

      {/* Free throw semi-circle (upper, solid) */}
      <path
        d={`M 175 310 A 60 60 0 0 1 295 310`}
        fill={PAINT} stroke={LINE} strokeWidth={LINE_W}
      />
      {/* Free throw semi-circle (lower, dashed) */}
      <path
        d={`M 175 310 A 60 60 0 0 0 295 310`}
        fill="none" stroke={LINE} strokeWidth={LINE_W} strokeDasharray="6 4"
      />

      {/* 3-point corner lines */}
      <line x1="30" y1="500" x2="30" y2={corner3Y} stroke={LINE} strokeWidth={LINE_W} />
      <line x1="440" y1="500" x2="440" y2={corner3Y} stroke={LINE} strokeWidth={LINE_W} />

      {/* 3-point arc */}
      <path
        d={`M 30 ${corner3Y.toFixed(1)} A ${r3} ${r3} 0 0 1 440 ${corner3Y.toFixed(1)}`}
        fill="none" stroke={LINE} strokeWidth={LINE_W}
      />

      {/* Backboard */}
      <line x1="205" y1="494" x2="265" y2="494" stroke={LINE} strokeWidth={3} strokeLinecap="round" />

      {/* Rim / Hoop */}
      <circle cx={bx} cy={by} r="12" fill="none" stroke="#f97316" strokeWidth={2} />

      {/* Restricted arc (toward baseline) */}
      <path
        d={`M ${bx - raR} ${by} A ${raR} ${raR} 0 0 0 ${bx + raR} ${by}`}
        fill="none" stroke={LINE} strokeWidth={LINE_W}
      />

      {/* Court boundary */}
      <rect x="0" y="0" width="470" height="500" fill="none" stroke={LINE} strokeWidth={2} />

      {/* Half court line */}
      <line x1="0" y1="0" x2="470" y2="0" stroke={LINE} strokeWidth={2} />

      {/* Lane blocks */}
      {[340, 365, 390, 415].map(y => (
        <g key={y}>
          <line x1="155" y1={y} x2="145" y2={y} stroke={LINE} strokeWidth={LINE_W} />
          <line x1="315" y1={y} x2="325" y2={y} stroke={LINE} strokeWidth={LINE_W} />
        </g>
      ))}
    </g>
  );
}

function FullCourt() {
  // viewBox: 0 0 940 500  (94ft x 50ft at 10px/ft)
  const lbx = 52, rBx = 888, by = 250;
  const r3 = 239;
  const raR = 40;

  // Corner 3 for left basket: x = lbx + sqrt(r3^2 - (by-30)^2)
  const dy = by - 30;
  const corner3X = Math.sqrt(r3 * r3 - dy * dy);
  const lCorner3X = lbx + corner3X;
  const rCorner3X = rBx - corner3X;

  return (
    <g>
      {/* Court background */}
      <rect x="0" y="0" width="940" height="500" fill={BG} />

      {/* Left paint */}
      <rect x="0" y="170" width="190" height="160" fill={PAINT} stroke={LINE} strokeWidth={LINE_W} />
      {/* Right paint */}
      <rect x="750" y="170" width="190" height="160" fill={PAINT} stroke={LINE} strokeWidth={LINE_W} />

      {/* Left FT semi-circle (outer) */}
      <path d={`M 190 170 A 60 60 0 0 1 190 330`} fill={PAINT} stroke={LINE} strokeWidth={LINE_W} />
      <path d={`M 190 170 A 60 60 0 0 0 190 330`} fill="none" stroke={LINE} strokeWidth={LINE_W} strokeDasharray="6 4" />

      {/* Right FT semi-circle */}
      <path d={`M 750 170 A 60 60 0 0 0 750 330`} fill={PAINT} stroke={LINE} strokeWidth={LINE_W} />
      <path d={`M 750 170 A 60 60 0 0 1 750 330`} fill="none" stroke={LINE} strokeWidth={LINE_W} strokeDasharray="6 4" />

      {/* Left corner 3 lines */}
      <line x1="0" y1="30" x2={lCorner3X.toFixed(1)} y2="30" stroke={LINE} strokeWidth={LINE_W} />
      <line x1="0" y1="470" x2={lCorner3X.toFixed(1)} y2="470" stroke={LINE} strokeWidth={LINE_W} />

      {/* Left 3pt arc */}
      <path d={`M ${lCorner3X.toFixed(1)} 30 A ${r3} ${r3} 0 0 1 ${lCorner3X.toFixed(1)} 470`}
        fill="none" stroke={LINE} strokeWidth={LINE_W} />

      {/* Right corner 3 lines */}
      <line x1={rCorner3X.toFixed(1)} y1="30" x2="940" y2="30" stroke={LINE} strokeWidth={LINE_W} />
      <line x1={rCorner3X.toFixed(1)} y1="470" x2="940" y2="470" stroke={LINE} strokeWidth={LINE_W} />

      {/* Right 3pt arc */}
      <path d={`M ${rCorner3X.toFixed(1)} 30 A ${r3} ${r3} 0 0 0 ${rCorner3X.toFixed(1)} 470`}
        fill="none" stroke={LINE} strokeWidth={LINE_W} />

      {/* Left backboard & hoop */}
      <line x1="5" y1="220" x2="5" y2="280" stroke={LINE} strokeWidth={3} strokeLinecap="round" />
      <circle cx={lbx} cy={by} r="12" fill="none" stroke="#f97316" strokeWidth={2} />

      {/* Right backboard & hoop */}
      <line x1="935" y1="220" x2="935" y2="280" stroke={LINE} strokeWidth={3} strokeLinecap="round" />
      <circle cx={rBx} cy={by} r="12" fill="none" stroke="#f97316" strokeWidth={2} />

      {/* Left restricted arc */}
      <path d={`M ${lbx} ${by - raR} A ${raR} ${raR} 0 0 1 ${lbx} ${by + raR}`}
        fill="none" stroke={LINE} strokeWidth={LINE_W} />

      {/* Right restricted arc */}
      <path d={`M ${rBx} ${by - raR} A ${raR} ${raR} 0 0 0 ${rBx} ${by + raR}`}
        fill="none" stroke={LINE} strokeWidth={LINE_W} />

      {/* Centre line */}
      <line x1="470" y1="0" x2="470" y2="500" stroke={LINE} strokeWidth={LINE_W} />

      {/* Centre circles */}
      <circle cx="470" cy="250" r="60" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <circle cx="470" cy="250" r="20" fill="none" stroke={LINE} strokeWidth={LINE_W} />

      {/* Court boundary */}
      <rect x="0" y="0" width="940" height="500" fill="none" stroke={LINE} strokeWidth={2} />

      {/* Lane blocks */}
      {[200, 220, 240, 260].map(x => (
        <g key={x}>
          <line x1={x} y1="170" x2={x} y2="160" stroke={LINE} strokeWidth={LINE_W} />
          <line x1={x} y1="330" x2={x} y2="340" stroke={LINE} strokeWidth={LINE_W} />
          <line x1={940 - x} y1="170" x2={940 - x} y2="160" stroke={LINE} strokeWidth={LINE_W} />
          <line x1={940 - x} y1="330" x2={940 - x} y2="340" stroke={LINE} strokeWidth={LINE_W} />
        </g>
      ))}
    </g>
  );
}

export const HALF_COURT_VIEWBOX = '0 0 470 500';
export const FULL_COURT_VIEWBOX = '0 0 940 500';

export default function CourtSVG({ courtType }) {
  return courtType === 'full' ? <FullCourt /> : <HalfCourt />;
}