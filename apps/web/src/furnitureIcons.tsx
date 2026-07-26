/**
 * Top-down (plan-view) schematic icons per catalog item, drawn in local unit space
 * (x in [-w/2, w/2], y in [-d/2, d/2], meters — matching PlanEditor's existing furniture
 * <g transform="translate(pos) rotate(...)"> convention) so they scale to each item's
 * real footprint rather than showing a plain rectangle for everything.
 */
export function FurnitureIcon({
  catalogId,
  w,
  d,
  fill,
  stroke,
}: {
  catalogId: string;
  w: number;
  d: number;
  fill: string;
  stroke: string;
}) {
  const sw = Math.max(0.015, Math.min(w, d) * 0.03); // stroke width scales with the piece

  switch (catalogId) {
    case 'sofa-2seat':
    case 'sofa-3seat':
    case 'armchair':
    case 'lounge-chair': {
      const armW = catalogId === 'armchair' || catalogId === 'lounge-chair' ? w * 0.16 : w * 0.09;
      const backD = d * 0.22;
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={d * 0.12} fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect x={-w / 2 + armW * 0.6} y={-d / 2} width={w - armW * 1.2} height={backD} fill={stroke} opacity={0.35} />
          <rect x={-w / 2} y={-d / 2} width={armW} height={d} rx={armW * 0.4} fill={stroke} opacity={0.25} />
          <rect x={w / 2 - armW} y={-d / 2} width={armW} height={d} rx={armW * 0.4} fill={stroke} opacity={0.25} />
        </g>
      );
    }
    case 'bench':
      return <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={d * 0.2} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case 'desk-chair': {
      const r = Math.min(w, d) / 2;
      return (
        <g>
          <circle cx={0} cy={0} r={r * 0.92} fill={fill} stroke={stroke} strokeWidth={sw} />
          <path d={`M ${-r * 0.75} ${-r * 0.55} A ${r * 0.95} ${r * 0.95} 0 0 1 ${r * 0.75} ${-r * 0.55}`} fill="none" stroke={stroke} strokeWidth={sw * 1.6} opacity={0.6} />
          <circle cx={0} cy={0} r={r * 0.12} fill={stroke} opacity={0.5} />
        </g>
      );
    }
    case 'bar-stool': {
      const r = Math.min(w, d) / 2;
      return (
        <g>
          <circle cx={0} cy={0} r={r * 0.92} fill={fill} stroke={stroke} strokeWidth={sw} />
          <circle cx={0} cy={0} r={r * 0.12} fill={stroke} opacity={0.5} />
        </g>
      );
    }
    case 'coffee-table':
    case 'dining-table':
    case 'side-table':
    case 'desk':
    case 'round-table':
    case 'corner-desk': {
      const legSize = Math.min(w, d) * 0.09;
      const inset = Math.min(w, d) * 0.1;
      const legs: [number, number][] = [
        [-w / 2 + inset, -d / 2 + inset],
        [w / 2 - inset - legSize, -d / 2 + inset],
        [-w / 2 + inset, d / 2 - inset - legSize],
        [w / 2 - inset - legSize, d / 2 - inset - legSize],
      ];
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={Math.min(w, d) * 0.05} fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect
            x={-w / 2 + inset * 0.6}
            y={-d / 2 + inset * 0.6}
            width={w - inset * 1.2}
            height={d - inset * 1.2}
            fill="none"
            stroke={stroke}
            strokeWidth={sw * 0.7}
            opacity={0.5}
          />
          {legs.map(([lx, ly], i) => (
            <rect key={i} x={lx} y={ly} width={legSize} height={legSize} fill={stroke} opacity={0.4} />
          ))}
        </g>
      );
    }
    case 'bed-double':
    case 'bed-single': {
      const pillowW = w * 0.4;
      const pillowD = d * 0.14;
      const pillowGap = w * 0.06;
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={w * 0.04} fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect x={-pillowW - pillowGap / 2} y={-d / 2 + pillowD * 0.5} width={pillowW} height={pillowD} rx={pillowD * 0.3} fill={stroke} opacity={0.3} />
          <rect x={pillowGap / 2} y={-d / 2 + pillowD * 0.5} width={pillowW} height={pillowD} rx={pillowD * 0.3} fill={stroke} opacity={0.3} />
          <rect x={-w / 2} y={d / 2 - d * 0.16} width={w} height={d * 0.16} fill={stroke} opacity={0.2} />
        </g>
      );
    }
    case 'bookshelf': {
      const n = 4;
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          {Array.from({ length: n - 1 }, (_, i) => {
            const x = -w / 2 + (w / n) * (i + 1);
            return <line key={i} x1={x} y1={-d / 2} x2={x} y2={d / 2} stroke={stroke} strokeWidth={sw * 0.6} opacity={0.5} />;
          })}
        </g>
      );
    }
    case 'wardrobe': {
      // Two hinged doors — a center seam plus a small handle mark on each half.
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          <line x1={0} y1={-d / 2} x2={0} y2={d / 2} stroke={stroke} strokeWidth={sw * 0.8} opacity={0.5} />
          <circle cx={-w * 0.08} cy={0} r={Math.min(w, d) * 0.04} fill={stroke} opacity={0.5} />
          <circle cx={w * 0.08} cy={0} r={Math.min(w, d) * 0.04} fill={stroke} opacity={0.5} />
        </g>
      );
    }
    case 'tv-stand':
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={d * 0.15} fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect x={-w * 0.42} y={-d / 2} width={w * 0.84} height={d * 0.4} fill={stroke} opacity={0.3} />
        </g>
      );
    case 'floor-lamp': {
      const r = Math.min(w, d) / 2;
      return (
        <g>
          <circle cx={0} cy={0} r={r * 0.9} fill={fill} stroke={stroke} strokeWidth={sw} opacity={0.6} />
          <circle cx={0} cy={0} r={r * 0.28} fill={stroke} />
        </g>
      );
    }
    case 'plant':
    case 'plant-small': {
      const r = Math.min(w, d) / 2;
      const leafR = r * 0.55;
      const angles = [0, 72, 144, 216, 288];
      return (
        <g>
          {angles.map((a) => {
            const rad = (a * Math.PI) / 180;
            return <circle key={a} cx={Math.cos(rad) * r * 0.55} cy={Math.sin(rad) * r * 0.55} r={leafR} fill={fill} opacity={0.55} />;
          })}
          <circle cx={0} cy={0} r={r * 0.6} fill={fill} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    }
    case 'rug': {
      const inset = Math.min(w, d) * 0.1;
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={Math.min(w, d) * 0.06} fill={fill} stroke={stroke} strokeWidth={sw} opacity={0.5} />
          <rect
            x={-w / 2 + inset}
            y={-d / 2 + inset}
            width={w - inset * 2}
            height={d - inset * 2}
            rx={Math.min(w, d) * 0.04}
            fill="none"
            stroke={stroke}
            strokeWidth={sw * 0.7}
            opacity={0.6}
          />
        </g>
      );
    }
    case 'rug-round': {
      const r = Math.min(w, d) / 2;
      const inset = r * 0.18;
      return (
        <g>
          <circle cx={0} cy={0} r={r} fill={fill} stroke={stroke} strokeWidth={sw} opacity={0.5} />
          <circle cx={0} cy={0} r={r - inset} fill="none" stroke={stroke} strokeWidth={sw * 0.7} opacity={0.6} />
        </g>
      );
    }
    case 'coat-rack': {
      const r = Math.min(w, d) / 2;
      return (
        <g>
          <circle cx={0} cy={0} r={r * 0.85} fill={fill} stroke={stroke} strokeWidth={sw} opacity={0.55} />
          <circle cx={0} cy={0} r={r * 0.18} fill={stroke} />
        </g>
      );
    }
    default:
      return <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />;
  }
}
