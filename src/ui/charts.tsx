import { useState } from 'react';
import type { Domain } from '../core/types';

// Small dependency-free SVG charts. Categorical slots validated (dark surface #10132A) with the
// dataviz palette validator: lightness band, chroma, CVD ΔE ≥ 8, contrast ≥ 3:1 — all pass.
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#9085e9', '#d55181'];

export const DOMAIN_COLOR: Record<Domain, string> = {
  verbal: SERIES[0],
  visual: SERIES[1],
  associative: SERIES[2],
  narrative: SERIES[3],
  working: SERIES[4],
  speed: SERIES[5],
  reasoning: SERIES[1], // transfer battery only; never charted alongside training domains
};

export interface Series {
  key: string;
  label: string;
  color: string;
  points: { x: number; y: number; tip?: string }[];
}

const W = 640;
const H = 220;
const PAD = { l: 40, r: 12, t: 12, b: 24 };

/** Multi-series line chart over an index x-axis (block number), with crosshair tooltip and legend. */
export function LineChart({ series, yMax = 1, yFormat = (v: number) => `${Math.round(v * 100)}%`, xLabel }: { series: Series[]; yMax?: number; yFormat?: (v: number) => string; xLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxX = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.x)));
  const sx = (x: number) => PAD.l + ((x - 1) / Math.max(1, maxX - 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => PAD.t + (1 - y / yMax) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            const idx = Math.round(1 + ((x - PAD.l) / (W - PAD.l - PAD.r)) * (maxX - 1));
            setHover(Math.min(maxX, Math.max(1, idx)));
          }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke="#262B52" strokeWidth="1" />
              <text x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="#9AA0C3">
                {yFormat(v)}
              </text>
            </g>
          ))}
          {xLabel && (
            <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="10" fill="#9AA0C3">
              {xLabel}
            </text>
          )}
          {hover !== null && <line x1={sx(hover)} x2={sx(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#9AA0C3" strokeDasharray="3 3" />}
          {series.map((s) => (
            <g key={s.key}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p) => `${sx(p.x)},${sy(Math.min(yMax, p.y))}`).join(' ')} />
              {s.points.map((p) => (
                <circle key={p.x} cx={sx(p.x)} cy={sy(Math.min(yMax, p.y))} r={hover === p.x ? 5 : s.points.length > 30 ? 0 : 3} fill={s.color} stroke="#10132A" strokeWidth="2" />
              ))}
            </g>
          ))}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-2 rounded-lg border border-line bg-void/95 px-3 py-2 text-xs shadow-lg" style={{ left: `${Math.min(70, (sx(hover) / W) * 100)}%` }}>
            <div className="mb-1 text-dim">#{hover}</div>
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hover);
              return p ? (
                <div key={s.key} className="flex items-center gap-2 text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}: <span className="font-mono">{yFormat(p.y)}</span>
                  {p.tip && <span className="text-dim">· {p.tip}</span>}
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Grouped horizontal bars: one row per measure, one bar per assessment. */
export function GroupedBars({ rows, groups, format }: { rows: { label: string; values: (number | null)[] }[]; groups: { label: string; color: string }[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        {groups.map((g) => (
          <span key={g.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full" style={{ background: g.color }} />
            {g.label}
          </span>
        ))}
      </div>
      <div className="space-y-4">
        {rows.map((r) => {
          const max = Math.max(1e-9, ...r.values.map((v) => Math.abs(v ?? 0)));
          return (
            <div key={r.label}>
              <div className="mb-1 text-xs text-ink">{r.label}</div>
              <div className="space-y-[2px]">
                {r.values.map((v, i) => {
                  const id = `${r.label}-${i}`;
                  return (
                    <div key={i} className="flex items-center gap-2" onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                      <div className="h-3 flex-1 rounded-r bg-panel2/60">
                        {v !== null && <div className="h-3 rounded-r" style={{ width: `${Math.max(0, (v / max) * 100)}%`, background: groups[i].color, opacity: hover && hover !== id ? 0.55 : 1 }} />}
                      </div>
                      <span className={`w-16 text-right font-mono text-xs ${hover === id ? 'text-white' : 'text-dim'}`}>{v === null ? '—' : format(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
