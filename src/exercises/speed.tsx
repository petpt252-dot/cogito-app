import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { genSpeedTrials, type Cube, type Segment, type Side, type SpeedTask, type SpeedTrial } from '../core/cogito';
import { mean, round } from '../core/stats';
import { realClock } from '../core/timer';
import { Stage } from './shared';
import { Button, Kbd, cx, useKey } from '../ui/kit';
import { useAnswerKeys } from '../ui/answerKeys';
import { playErrorSound } from '../ui/feedbackSound';

// P1–P6 perceptual speed (COGITO-inspired). Two-choice judgements under an adaptive response deadline:
// F = left answer, J = right answer. A response after the deadline counts as an error (timeout).

// One block = one COGITO speed trial of 40 items.
export const SPEED_TRIALS = 40;
export const SPEED_ITI_MS = 400;

const ANSWER_KEYS: Record<SpeedTask, [string, string]> = {
  P1: ['speed.odd', 'speed.even'],
  P2: ['speed.vowel', 'speed.consonant'],
  P3: ['speed.symmetric', 'speed.asymmetric'],
  P4: ['speed.same', 'speed.different'],
  P5: ['speed.same', 'speed.different'],
  P6: ['speed.same', 'speed.mirror'],
};

export function SymmetryView({ segments, size = 180 }: { segments: Segment[]; size?: number }) {
  const s = (v: number) => 10 + v * 13.33;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="line figure">
      <rect x="1" y="1" width="98" height="98" rx="10" fill="#10132A" stroke="#262B52" />
      {segments.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={s(x1)} y1={s(y1)} x2={s(x2)} y2={s(y2)} stroke="#E6E8F5" strokeWidth="3.5" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Isometric rendering of a polycube (painter's algorithm over unit cubes). */
export function CubeView({ cubes, size = 170 }: { cubes: Cube[]; size?: number }) {
  const S = 16;
  const P = (x: number, y: number, z: number): [number, number] => [(x - y) * S * 0.866, (x + y) * S * 0.5 - z * S];
  const sorted = cubes.slice().sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]) || a[2] - b[2]);
  const faces: { pts: [number, number][]; fill: string }[] = [];
  for (const [x, y, z] of sorted) {
    faces.push({ pts: [P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], fill: '#B9A2FF' });
    faces.push({ pts: [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)], fill: '#7C5CE0' });
    faces.push({ pts: [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], fill: '#4B3A9A' });
  }
  const xs = faces.flatMap((f) => f.pts.map((p) => p[0]));
  const ys = faces.flatMap((f) => f.pts.map((p) => p[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) + 12;
  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
  return (
    <svg viewBox={`${cx0 - span / 2} ${cy0 - span / 2} ${span} ${span}`} width={size} height={size} role="img" aria-label="3D figure" className="rounded-xl bg-panel2/50">
      {faces.map((f, i) => (
        <polygon key={i} points={f.pts.map((p) => p.join(',')).join(' ')} fill={f.fill} stroke="#090B16" strokeWidth="0.8" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function Stimulus({ trial }: { trial: SpeedTrial }) {
  switch (trial.task) {
    case 'P1':
      return <div className="font-mono text-7xl text-white">{trial.digit}</div>;
    case 'P2':
      return <div className="font-mono text-7xl text-white">{trial.letter}</div>;
    case 'P3':
      return <SymmetryView segments={trial.segments} />;
    case 'P4':
    case 'P5':
      return (
        <div className="space-y-3 text-center font-mono text-4xl tracking-[0.35em] text-white">
          <div>{trial.a}</div>
          <div>{trial.b}</div>
        </div>
      );
    case 'P6':
      return (
        <div className="flex flex-wrap justify-center gap-6">
          <CubeView cubes={trial.a} />
          <CubeView cubes={trial.b} />
        </div>
      );
  }
}

interface Resp {
  ok: boolean;
  timeout: boolean;
  rt: number | null;
}

export function SpeedExercise({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const task = ctx.exerciseId as SpeedTask;
  const deadline = ctx.params.deadline;
  const trials = useMemo(() => genSpeedTrials(task, ctx.seed, SPEED_TRIALS), [ctx.seed]);
  const [i, setI] = useState(-1); // -1: inter-trial interval before trial 0
  const [showing, setShowing] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const onset = useRef(0);
  const responses = useRef<Resp[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockStart = useRef(realClock.now());
  const [left, right] = ANSWER_KEYS[task];

  const finish = () => {
    const r = responses.current;
    const correct = r.filter((x) => x.ok).length;
    const rts = r.filter((x) => x.ok && x.rt !== null).map((x) => x.rt as number);
    const minutes = (realClock.now() - blockStart.current) / 60000;
    onDone({
      accuracy: correct / r.length,
      metrics: {
        correct,
        errors: r.filter((x) => !x.ok && !x.timeout).length,
        timeouts: r.filter((x) => x.timeout).length,
        meanRtMs: rts.length ? Math.round(mean(rts)) : null,
        throughput: round(correct / Math.max(minutes, 1e-6), 1),
      },
      conditionKey: `${task}|deadline=${deadline}|n=${SPEED_TRIALS}`,
      params: { deadline },
    });
  };

  const next = (idx: number) => {
    setShowing(false);
    timer.current = setTimeout(() => {
      if (idx >= trials.length) return finish();
      setI(idx);
      setShowing(true);
      // Stamp onset now; refine to the first painted frame if it arrives before a response.
      // (Frames are throttled in background tabs, so a frame stamp alone can be stale.)
      onset.current = realClock.now();
      requestAnimationFrame(() => {
        if (!responses.current[idx]) onset.current = Math.max(onset.current, realClock.now());
      });
      timer.current = setTimeout(() => record(idx, null), deadline);
    }, SPEED_ITI_MS);
  };

  const record = (idx: number, side: Side | null) => {
    if (timer.current) clearTimeout(timer.current);
    const rt = side ? Math.round(realClock.now() - onset.current) : null;
    // A response registered after the deadline (e.g. a delayed timer) is still a timeout.
    const late = rt !== null && rt > deadline;
    const ok = side !== null && !late && side === trials[idx].answer;
    responses.current[idx] = { ok, timeout: side === null || late, rt: late ? null : rt };
    setFlash(ok ? 'ok' : 'bad');
    if (!ok && ctx.settings.errorSound) playErrorSound();
    setTimeout(() => setFlash(null), 150);
    next(idx + 1);
  };

  useEffect(() => {
    next(0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const answer = (side: Side) => {
    if (!showing || i < 0 || responses.current[i]) return;
    record(i, side);
  };
  const keys = useAnswerKeys();
  useKey([keys.left, keys.right], (e) => answer(e.key.toLowerCase() === keys.left ? 'left' : 'right'));

  return (
    <Stage title={`${t(`ex.${task}.name`)} · ${Math.max(1, i + 1)} / ${trials.length} · ${deadline} ms`}>
      <div className={cx('flex min-h-[220px] items-center justify-center rounded-2xl border transition', flash === 'ok' ? 'border-ok/50' : flash === 'bad' ? 'border-bad/60' : 'border-transparent')}>
        {showing && i >= 0 ? <Stimulus trial={trials[i]} /> : <span className="text-2xl text-line">+</span>}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Button variant="ghost" onPointerDown={() => answer('left')} onClick={(e) => e.detail === 0 && answer('left')} className="py-3">
          <Kbd>{keys.left.toUpperCase()}</Kbd> {t(left)}
        </Button>
        <Button variant="ghost" onPointerDown={() => answer('right')} onClick={(e) => e.detail === 0 && answer('right')} className="py-3">
          {t(right)} <Kbd>{keys.right.toUpperCase()}</Kbd>
        </Button>
      </div>
    </Stage>
  );
}
