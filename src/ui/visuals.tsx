import type { FaceParams, Glyph } from '../core/generate';
import { COLORS, type ColorKey, type Shape } from '../content/visual';

// Locally generated SVG stimuli: fictional faces, abstract glyphs and scene shapes.

const SKIN = ['#F6D7C3', '#EBC2A0', '#D8A47F', '#B97F5A', '#8D5A3B', '#5E3A26'];
const HAIR = ['#1F1A17', '#4A2F1E', '#8A5A2B', '#C99A4B', '#B8B8C0', '#7A2E1F'];
const BG = ['#1E2350', '#2B1E50', '#173A4A', '#3A1E3E', '#1E3A33'];

export function Face({ p, size = 150 }: { p: FaceParams; size?: number }) {
  const skin = SKIN[p.skin];
  const hair = HAIR[p.hairColor];
  const rx = [38, 34, 42][p.shape];
  const ry = [48, 50, 44][p.shape];
  const eyeY = 96;
  const eyeR = [4, 5, 3.5, 4.5][p.eyes];
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="fictional face" className="rounded-2xl">
      <rect width="200" height="200" rx="24" fill={BG[p.bg]} />
      {/* neck & shoulders */}
      <rect x="84" y="140" width="32" height="30" fill={skin} />
      <path d="M40 200 Q100 150 160 200 Z" fill="#3A3F6E" />
      {/* long hair behind head */}
      {p.hair === 3 && <path d={`M${100 - rx - 6} 90 Q100 10 ${100 + rx + 6} 90 L${100 + rx + 4} 160 L${100 - rx - 4} 160 Z`} fill={hair} />}
      {p.hair === 5 && <ellipse cx="100" cy="82" rx={rx + 14} ry={ry + 4} fill={hair} />}
      {/* head */}
      <ellipse cx="100" cy="100" rx={rx} ry={ry} fill={skin} />
      {/* ears */}
      <ellipse cx={100 - rx} cy="102" rx="6" ry="10" fill={skin} />
      <ellipse cx={100 + rx} cy="102" rx="6" ry="10" fill={skin} />
      {/* hair top */}
      {p.hair === 0 && <path d={`M${100 - rx} 92 Q100 30 ${100 + rx} 92 Q100 62 ${100 - rx} 92 Z`} fill={hair} />}
      {p.hair === 1 && <path d={`M${100 - rx - 2} 98 Q90 36 ${100 + rx + 2} 98 L${100 + rx - 6} 74 Q100 58 ${100 - rx + 8} 76 Z`} fill={hair} />}
      {p.hair === 2 && <rect x={100 - rx} y="52" width={rx * 2} height="22" rx="11" fill={hair} />}
      {(p.hair === 3 || p.hair === 5) && <path d={`M${100 - rx} 90 Q100 40 ${100 + rx} 90 Q100 66 ${100 - rx} 90 Z`} fill={hair} />}
      {p.hair === 4 && (
        <g fill={hair}>
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={i} cx={100 - rx + 6 + (i * (rx * 2 - 12)) / 6} cy={60 + (i % 2) * 4} r="10" />
          ))}
        </g>
      )}
      {/* brows */}
      {p.brows === 0 && <g stroke={hair} strokeWidth="3" strokeLinecap="round"><path d="M74 84 L90 82" /><path d="M110 82 L126 84" /></g>}
      {p.brows === 1 && <g stroke={hair} strokeWidth="4" strokeLinecap="round"><path d="M74 86 Q82 78 90 84" /><path d="M110 84 Q118 78 126 86" /></g>}
      {p.brows === 2 && <g stroke={hair} strokeWidth="2.5" strokeLinecap="round"><path d="M74 82 L90 86" /><path d="M110 86 L126 82" /></g>}
      {/* eyes */}
      <circle cx="82" cy={eyeY} r={eyeR} fill="#1A1A22" />
      <circle cx="118" cy={eyeY} r={eyeR} fill="#1A1A22" />
      {p.glasses && (
        <g fill="none" stroke="#C9CCE8" strokeWidth="2.5">
          <circle cx="82" cy={eyeY} r="11" />
          <circle cx="118" cy={eyeY} r="11" />
          <path d="M93 96 L107 96" />
        </g>
      )}
      {/* nose */}
      {p.nose === 0 && <path d="M100 100 L95 116 L102 117" stroke="#00000044" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
      {p.nose === 1 && <ellipse cx="100" cy="114" rx="6" ry="4" fill="#00000026" />}
      {p.nose === 2 && <path d="M100 98 L100 116" stroke="#00000040" strokeWidth="3" strokeLinecap="round" />}
      {/* beard */}
      {p.beard && <path d={`M${100 - rx + 6} 112 Q100 ${100 + ry + 14} ${100 + rx - 6} 112 Q100 ${120 + ry / 3} ${100 - rx + 6} 112 Z`} fill={hair} opacity="0.9" />}
      {/* mouth */}
      {p.mouth === 0 && <path d="M86 128 Q100 138 114 128" stroke="#7A2A2A" strokeWidth="3" fill="none" strokeLinecap="round" />}
      {p.mouth === 1 && <path d="M88 130 L112 130" stroke="#7A2A2A" strokeWidth="3" strokeLinecap="round" />}
      {p.mouth === 2 && <ellipse cx="100" cy="130" rx="8" ry="5" fill="#7A2A2A" />}
    </svg>
  );
}

export function GlyphView({ g, size = 96, selected, muted }: { g: Glyph; size?: number; selected?: boolean; muted?: boolean }) {
  const s = (v: number) => 14 + v * 18;
  const color = `hsl(${g.hue} 90% 68%)`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="abstract figure" className={selected ? 'drop-shadow-[0_0_10px_rgba(155,107,255,.8)]' : ''}>
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#10132A" stroke={selected ? '#9B6BFF' : '#262B52'} strokeWidth={selected ? 3 : 1.5} />
      <polyline points={g.points.map(([x, y]) => `${s(x)},${s(y)}`).join(' ')} fill="none" stroke={muted ? '#5A6090' : color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {g.dot && <circle cx={s(g.dot[0])} cy={s(g.dot[1])} r="6" fill={muted ? '#5A6090' : '#E6E8F5'} />}
    </svg>
  );
}

function shapePath(shape: Shape): JSX.Element {
  switch (shape) {
    case 'circle':
      return <circle cx="50" cy="50" r="34" />;
    case 'square':
      return <rect x="18" y="18" width="64" height="64" rx="6" />;
    case 'triangle':
      return <polygon points="50,14 88,84 12,84" />;
    case 'star':
      return <polygon points="50,10 61,38 91,38 67,56 76,86 50,68 24,86 33,56 9,38 39,38" />;
    case 'diamond':
      return <polygon points="50,10 86,50 50,90 14,50" />;
    case 'hexagon':
      return <polygon points="28,14 72,14 92,50 72,86 28,86 8,50" />;
    case 'cross':
      return <polygon points="38,12 62,12 62,38 88,38 88,62 62,62 62,88 38,88 38,62 12,62 12,38 38,38" />;
    case 'ring':
      return <path d="M50 14a36 36 0 1 0 0.01 0Zm0 18a18 18 0 1 1 -0.01 0Z" fillRule="evenodd" />;
    case 'heart':
      return <path d="M50 86 C10 60 12 24 34 20 C44 18 50 26 50 32 C50 26 56 18 66 20 C88 24 90 60 50 86Z" />;
    case 'moon':
      return <path d="M62 12 A38 38 0 1 0 62 88 A30 30 0 1 1 62 12Z" />;
  }
}

export function ShapeIcon({ shape, color = 'white', size = 56 }: { shape: Shape; color?: ColorKey | 'neutral'; size?: number }) {
  const fill = color === 'neutral' ? '#9AA0C3' : COLORS[color];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={shape}>
      <g fill={fill}>{shapePath(shape)}</g>
    </svg>
  );
}
