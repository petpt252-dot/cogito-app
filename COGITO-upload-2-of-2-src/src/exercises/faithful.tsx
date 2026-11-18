import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExOutcome, ExProps } from './types';
import type { Metrics } from '../core/types';
import { useI18n } from '../i18n';
import {
  genAlphaBlock,
  genAlphaList,
  genCrtCalibration,
  genCrtTrials,
  genFribbleTrials,
  genStrictNBack,
  lagsOf,
  PT_LEVELS,
  SEGS,
  type AlphaItem,
  type CrtTask,
  type Fribble,
  type Seg,
} from '../core/faithful';
import { createRng } from '../core/rng';
import { mean, round } from '../core/stats';
import { realClock, runDynamicSequence, runSequence } from '../core/timer';
import { alphaStep, frameStep, msToFrames, timeStep } from '../core/staircase';
import type { ExerciseId } from '../core/types';
import { useStallHandler } from './stall';
import { Fixation, Gate, Stage } from './shared';
import { Kbd, useKey } from '../ui/kit';
import { useAnswerKeys } from '../ui/answerKeys';
import { playErrorSound } from '../ui/feedbackSound';

// COGITO-faithful versions of the tasks whose procedure differs from the adaptive ones: original alpha span,
// spatial 3-back with the study's sequence rules, masked choice reaction tasks on a calculator "8", and
// figural comparison of part-based objects. Responses: F = left answer (no / odd / vowel / symmetric / same),
// J = right answer. Parameters come from ctx.params (see core/faithful.ts faithfulParams).

function Keys({ left, right, onLeft, onRight, active = true }: { left: string; right: string; onLeft: () => void; onRight: () => void; active?: boolean }) {
  const keys = useAnswerKeys();
  return (
    <div className="mt-6 grid grid-cols-2 gap-4">
      {[
        { k: keys.left.toUpperCase(), label: left, fn: onLeft },
        { k: keys.right.toUpperCase(), label: right, fn: onRight },
      ].map((b) => (
        <button
          key={b.k}
          type="button"
          disabled={!active}
          onPointerDown={b.fn}
          onClick={(e) => e.detail === 0 && b.fn()}
          className="rounded-xl border border-white/15 bg-white/[0.04] py-3 text-ink hover:border-violet disabled:opacity-40"
        >
          <Kbd>{b.k}</Kbd> {b.label}
        </button>
      ))}
    </div>
  );
}

// ---------- G4 alpha span, original procedure ----------

/** Each consonant appears with a number: does the number give the letter's alphabetical position among the letters so far? */
export function AlphaSpanOriginal({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const pt = ctx.params.pt ?? PT_LEVELS.alpha[1];
  const isi = ctx.params.isi ?? 500;
  const nLists = ctx.params.lists ?? 4;
  // Staircase mode: each list's length follows the previous list's accuracy (see core/staircase.ts).
  const staircase = !!ctx.staircase;
  const fixedLists = useMemo(() => (staircase ? null : genAlphaBlock(ctx.seed, nLists, ctx.params.length ?? 10)), [ctx.seed]);
  const lengthRef = useRef(ctx.params.length ?? 10);
  const lists = useRef<AlphaItem[][]>(fixedLists ?? []);
  const listAt = (li: number) => {
    if (!lists.current[li]) {
      const len = lengthRef.current;
      lists.current[li] = genAlphaList(createRng(`${ctx.seed}:${li}`), len, Math.max(1, Math.round(len / 2)));
    }
    return lists.current[li];
  };
  const [started, setStarted] = useState(false);
  const [list, setList] = useState(0);
  const [phase, setPhase] = useState<'fix' | 'run'>('fix');
  const [item, setItem] = useState(-1);
  const [visible, setVisible] = useState(false);
  const cur = useRef(-1);
  const resp = useRef<(boolean | undefined)[][]>(Array.from({ length: nLists }, () => []));
  const onStall = useStallHandler();
  const answer = (yes: boolean) => {
    if (cur.current < 0 || resp.current[list][cur.current] !== undefined) return;
    resp.current[list][cur.current] = yes;
  };
  const keys = useAnswerKeys();
  useKey([keys.left, keys.right], (e) => answer(e.key.toLowerCase() === keys.right), started && phase === 'run');

  useEffect(() => {
    if (phase !== 'run') return;
    const L = listAt(list);
    const s = runSequence(
      L.flatMap(() => [pt, isi]),
      (k) => {
        if (k % 2 === 0) {
          cur.current = k / 2;
          setItem(k / 2);
          setVisible(true);
        } else setVisible(false);
      },
      () => {
        cur.current = -1;
        if (staircase) {
          const ok = L.filter((it, k) => resp.current[list][k] === it.target).length;
          lengthRef.current = alphaStep(L.length, ok / L.length);
        }
        if (list + 1 < nLists) {
          setList(list + 1);
          setItem(-1);
          setPhase('fix');
          return;
        }
        let correct = 0, hits = 0, cr = 0, none = 0, n = 0;
        lists.current.forEach((Lx, li) =>
          Lx.forEach((it, k) => {
            n++;
            const r = resp.current[li][k];
            if (r === undefined) none++;
            else if (r === it.target) {
              correct++;
              if (it.target) hits++;
              else cr++;
            }
          }),
        );
        onDone({
          accuracy: correct / n,
          metrics: { correct, items: n, hits, correctRejections: cr, noResponse: none, ...(staircase ? { letters: lengthRef.current } : {}) },
          conditionKey: staircase ? `S-G4|pt=${pt}|isi=${isi}` : `F-G4|len=${lists.current[0].length}|pt=${pt}|isi=${isi}`,
          params: { pt, isi, ...(staircase ? { stairNext: lengthRef.current } : {}) },
        });
      },
      realClock,
      onStall,
    );
    return () => s.cancel();
  }, [phase, list]);

  if (!started)
    return (
      <Gate title={t('ex.G4.name')} onGo={() => setStarted(true)} label={t('common.start')}>
        <p className="text-center text-white">{t('faithful.alphaInstr')}</p>
      </Gate>
    );
  if (phase === 'fix') return <Fixation onDone={() => setPhase('run')} />;
  const L = listAt(list);
  const it = item >= 0 ? L[item] : null;
  return (
    <Stage title={`${t('ex.G4.name')} · ${list + 1} / ${nLists} · ${Math.max(1, item + 1)} / ${L.length}`}>
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
        {visible && it && (
          <>
            <div className="font-mono text-7xl text-white">{it.letter}</div>
            <div className="font-mono text-4xl text-volt">{it.shown}</div>
          </>
        )}
      </div>
      <Keys left={t('faithful.no')} right={t('faithful.yes')} onLeft={() => answer(false)} onRight={() => answer(true)} />
    </Stage>
  );
}

// ---------- G6 spatial 3-back, study rules ----------

export function NBackFaithful({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const stim = ctx.params.stim ?? 500;
  const isi = ctx.params.isi ?? PT_LEVELS.nbackIsi[1];
  const seq = useMemo(() => genStrictNBack(ctx.seed, ctx.params.dots ?? 39), [ctx.seed]);
  const lags = useMemo(() => lagsOf(seq), [seq]);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<'fix' | 'run'>('fix');
  const [i, setI] = useState(-1);
  const [visible, setVisible] = useState(false);
  const cur = useRef(-1);
  const resp = useRef<(boolean | undefined)[]>([]);
  const onStall = useStallHandler();
  const answer = (match: boolean) => {
    if (cur.current < 3 || resp.current[cur.current] !== undefined) return;
    resp.current[cur.current] = match;
  };
  const keys = useAnswerKeys();
  useKey([keys.left, keys.right], (e) => answer(e.key.toLowerCase() === keys.right), started && phase === 'run');

  // Staircase mode: the interval after each dot follows the answers so far (correct → shorter, error → longer).
  const staircase = !!ctx.staircase;
  const isiRef = useRef(isi);
  const scored = useRef(-1);
  const scoreUpTo = (last: number) => {
    for (let k = Math.max(3, scored.current + 1); k <= last; k++) isiRef.current = timeStep('G6', isiRef.current, resp.current[k] === (lags[k] === 3));
    scored.current = Math.max(scored.current, last);
  };

  useEffect(() => {
    if (phase !== 'run') return;
    const s = runDynamicSequence(
      seq.length * 2,
      (k) => (k % 2 === 0 ? stim : staircase ? isiRef.current : isi),
      (k) => {
        if (k % 2 === 0) {
          // the previous dot's answer window has just closed
          if (staircase && k >= 2) scoreUpTo(k / 2 - 1);
          cur.current = k / 2;
          setI(k / 2);
          setVisible(true);
        } else setVisible(false);
      },
      () => {
        if (staircase) scoreUpTo(seq.length - 1);
        let correct = 0, hits = 0, misses = 0, fa = 0, lureFa = 0, none = 0;
        const n = seq.length - 3;
        for (let k = 3; k < seq.length; k++) {
          const target = lags[k] === 3;
          const r = resp.current[k];
          if (r === undefined) none++;
          if (r === target) correct++;
          if (target) r === true ? hits++ : misses++;
          else if (r === true) {
            fa++;
            if (lags[k] > 0) lureFa++;
          }
        }
        onDone({
          accuracy: correct / n,
          metrics: { correct, items: n, hits, misses, falseAlarms: fa, lureFalseAlarms: lureFa, noResponse: none, ...(staircase ? { intervalMs: isiRef.current } : {}) },
          conditionKey: staircase ? `S-G6|n=3|dots=${seq.length}|stim=${stim}` : `F-G6|n=3|dots=${seq.length}|stim=${stim}|isi=${isi}`,
          params: { stim, isi, ...(staircase ? { stairNext: isiRef.current } : {}) },
        });
      },
      realClock,
      onStall,
    );
    return () => s.cancel();
  }, [phase]);

  if (!started)
    return (
      <Gate title={t('ex.G6.name')} onGo={() => setStarted(true)} label={t('common.start')}>
        <p className="text-center text-white">{t('faithful.nbackInstr')}</p>
      </Gate>
    );
  if (phase === 'fix') return <Fixation onDone={() => setPhase('run')} ms={1200} />;
  return (
    <Stage title={`3-back · ${Math.max(1, i + 1)} / ${seq.length}`}>
      <div className="mx-auto grid w-64 grid-cols-4 gap-2">
        {Array.from({ length: 16 }, (_, c) => (
          <div key={c} className="flex aspect-square items-center justify-center rounded-lg border border-line bg-panel2/60">
            {visible && seq[i] === c && <span className="h-7 w-7 rounded-full bg-white" />}
          </div>
        ))}
      </div>
      <Keys left={t('faithful.noMatch')} right={t('faithful.match')} onLeft={() => answer(false)} onRight={() => answer(true)} active={i >= 3} />
    </Stage>
  );
}

// ---------- P1–P3 masked choice reaction tasks ----------

const SEG_PATH: Record<Seg, string> = {
  a: 'M24 10 H76',
  b: 'M80 14 V56',
  c: 'M80 64 V106',
  d: 'M24 110 H76',
  e: 'M20 64 V106',
  f: 'M20 14 V56',
  g: 'M24 60 H76',
};
/** Mask: the full "8" plus lines extending from it in 10 directions (as described in the study). */
const MASK_EXTRA = ['M20 10 L6 0', 'M80 10 L94 0', 'M20 110 L6 120', 'M80 110 L94 120', 'M50 10 V0', 'M50 110 V120', 'M20 60 H4', 'M80 60 H96', 'M20 35 L6 30', 'M80 85 L94 90'];

export function SegmentFigure({ segs, mask = false, size = 150 }: { segs: Seg[]; mask?: boolean; size?: number }) {
  const lit = new Set(mask ? SEGS : segs);
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} role="img" aria-hidden="true">
      {SEGS.map((s) => (
        <path key={s} d={SEG_PATH[s]} stroke={lit.has(s) ? '#E6E8F5' : 'transparent'} strokeWidth="9" strokeLinecap="round" />
      ))}
      {mask && MASK_EXTRA.map((d, i) => <path key={i} d={d} stroke="#E6E8F5" strokeWidth="9" strokeLinecap="round" />)}
    </svg>
  );
}

const CRT_LABELS: Record<CrtTask, [string, string]> = {
  P1: ['speed.odd', 'speed.even'],
  P2: ['speed.vowel', 'speed.consonant'],
  P3: ['speed.symmetric', 'speed.asymmetric'],
};
export const CRT_FIX_MS = 500;
/** ASSUMPTION: the paper does not give the mask duration or the response window. */
export const CRT_MASK_MS = 300;
export const CRT_RESPONSE_MS = 2500;

/** Median screen refresh interval, from 30 animation frames. */
function measureFrame(): Promise<number> {
  return new Promise((resolve) => {
    const ts: number[] = [];
    const tick = (t: number) => {
      ts.push(t);
      if (ts.length < 31) requestAnimationFrame(tick);
      else {
        const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b);
        resolve(d[Math.floor(d.length / 2)]);
      }
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Stimulus drawn on a calculator "8", shown for a number of screen frames, then masked. Frame counts are
 * derived from the measured refresh rate, so on a 60 Hz screen 24/47/94 ms become 1/3/6 frames (17/50/100 ms);
 * the real durations are recorded. Calibration (ctx.fixed.calibration) mixes the three levels evenly.
 */
export function MaskedCrt({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const task = ctx.exerciseId as CrtTask;
  const calibration = ctx.fixed?.calibration === true;
  const trials = useMemo(
    () => (calibration ? genCrtCalibration(task, ctx.seed) : genCrtTrials(task, ctx.seed, ctx.params.items ?? 40).map((x) => ({ ...x, level: -1 }))),
    [ctx.seed],
  );
  const levelMs = (x: { fast: boolean; level: number }) => (x.level >= 0 ? PT_LEVELS.maskMs[x.level] : x.fast ? (ctx.params.fastMs ?? 24) : (ctx.params.slowMs ?? 94));
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [view, setView] = useState<'fix' | 'blank' | 'resp'>('fix');
  const stimRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const frameMs = useRef(16.7);
  const awaiting = useRef(false);
  const results = useRef<{ ok: boolean; level: number; fast: boolean; shownMs: number }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shownMs = useRef(0);
  const onStall = useStallHandler();
  // Staircase mode: one masking time (ms, from ctx.params.maskMs), adjusted per item in whole frames of this screen
  // (3 correct → 1 frame less, error → 1 more) and reported back in ms.
  const staircase = !!ctx.staircase;
  const framesRef = useRef(0);
  const streak = useRef(0);
  const framesFor = (tr: { fast: boolean; level: number }) => (staircase ? framesRef.current : Math.max(1, Math.round(levelMs(tr) / frameMs.current)));

  const finish = () => {
    const r = results.current;
    const acc = (xs: typeof r) => (xs.length ? xs.filter((x) => x.ok).length / xs.length : 0);
    if (staircase) {
      onDone({
        accuracy: acc(r),
        metrics: { correct: r.filter((x) => x.ok).length, items: r.length, maskFrames: framesRef.current, shownMs: round(mean(r.map((x) => x.shownMs)), 1), frameMs: round(frameMs.current, 1) },
        conditionKey: `S-${task}|items=${r.length}`,
        params: { stairNext: Math.round(framesRef.current * frameMs.current) },
      });
      return;
    }
    const metrics: Metrics = calibration
        ? { correct: r.filter((x) => x.ok).length, items: r.length, frameMs: round(frameMs.current, 1) }
        : {
            correct: r.filter((x) => x.ok).length,
            items: r.length,
            fastAccuracy: round(acc(r.filter((x) => x.fast))),
            slowAccuracy: round(acc(r.filter((x) => !x.fast))),
            fastShownMs: round(mean(r.filter((x) => x.fast).map((x) => x.shownMs)), 1),
            slowShownMs: round(mean(r.filter((x) => !x.fast).map((x) => x.shownMs)), 1),
            frameMs: round(frameMs.current, 1),
          };
    const out: ExOutcome = {
      accuracy: acc(r),
      metrics,
      conditionKey: `F-${task}|fast=${ctx.params.fastMs}|slow=${ctx.params.slowMs}`,
      detail: calibration ? { levelAccuracy: [0, 1, 2].map((l) => acc(r.filter((x) => x.level === l))) } : undefined,
    };
    onDone(out);
  };

  const record = (side: 'left' | 'right' | null) => {
    if (!awaiting.current) return;
    awaiting.current = false;
    timers.current.forEach(clearTimeout);
    const tr = trials[i];
    results.current.push({ ok: side === tr.answer, level: tr.level, fast: tr.fast, shownMs: shownMs.current });
    if (side !== tr.answer && ctx.settings.errorSound) playErrorSound();
    if (staircase) {
      const next = frameStep(task, framesRef.current, side === tr.answer, streak.current, frameMs.current);
      framesRef.current = next.frames;
      streak.current = next.streak;
    }
    if (i + 1 >= trials.length) finish();
    else {
      setI(i + 1);
      setView('fix');
    }
  };
  const keys = useAnswerKeys();
  useKey([keys.left, keys.right], (e) => record(e.key.toLowerCase() === keys.left ? 'left' : 'right'), started);

  // Run one item whenever the index changes: fixation → stimulus for k frames → mask → response window.
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    const tr = trials[i];
    const frames = framesFor(tr);
    timers.current.push(
      setTimeout(() => {
        if (cancelled) return;
        if (document.hidden) return onStall?.();
        setView('blank');
        let k = 0;
        let t0 = 0;
        const step = (ts: number) => {
          if (cancelled) return;
          if (k === 0) {
            t0 = ts;
            if (stimRef.current) stimRef.current.style.visibility = 'visible';
          }
          if (k === frames) {
            if (stimRef.current) stimRef.current.style.visibility = 'hidden';
            if (maskRef.current) maskRef.current.style.visibility = 'visible';
            shownMs.current = ts - t0;
            // A frame far longer than expected means the stimulus was not shown as intended.
            if (shownMs.current > frames * frameMs.current + 3 * frameMs.current + 50) return onStall?.();
            awaiting.current = true;
            timers.current.push(setTimeout(() => maskRef.current && (maskRef.current.style.visibility = 'hidden'), CRT_MASK_MS));
            timers.current.push(setTimeout(() => record(null), CRT_RESPONSE_MS));
            setView('resp');
            return;
          }
          k++;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, CRT_FIX_MS),
    );
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
    };
  }, [i, started]);

  if (!started)
    return (
      <Gate
        title={t(`ex.${task}.name`)}
        onGo={async () => {
          frameMs.current = await measureFrame();
          framesRef.current = msToFrames(ctx.params.maskMs ?? 150, frameMs.current);
          setStarted(true);
        }}
        label={t('common.start')}
      >
        <p className="text-center text-white">{t('faithful.crtInstr', { left: t(CRT_LABELS[task][0]), right: t(CRT_LABELS[task][1]) })}</p>
      </Gate>
    );
  const tr = trials[i];
  return (
    <Stage title={`${t(`ex.${task}.name`)} · ${i + 1} / ${trials.length}`}>
      <div className="relative mx-auto flex h-[200px] w-[160px] items-center justify-center">
        {view === 'fix' && <span className="text-3xl text-line">+</span>}
        <div ref={stimRef} className="absolute inset-0 flex items-center justify-center" style={{ visibility: 'hidden' }}>
          <SegmentFigure segs={tr.segs} />
        </div>
        <div ref={maskRef} className="absolute inset-0 flex items-center justify-center" style={{ visibility: 'hidden' }}>
          <SegmentFigure segs={[]} mask />
        </div>
      </div>
      <Keys left={t(CRT_LABELS[task][0])} right={t(CRT_LABELS[task][1])} onLeft={() => record('left')} onRight={() => record('right')} active={view === 'resp'} />
    </Stage>
  );
}

// ---------- two-choice comparison (P4, P5, P6) ----------

function TwoChoiceBlock<T>(p: {
  title: string;
  instructions: string;
  items: { item: T; answer: 'left' | 'right' }[];
  render: (item: T) => ReactNode;
  labels: [string, string];
  deadline: number;
  conditionKey: string;
  onDone: ExProps['onDone'];
  /** Staircase mode: the answer time adapts after every item (see core/staircase.ts timeStep). */
  stairId?: ExerciseId;
  sound?: boolean;
}) {
  const { t } = useI18n();
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(-1);
  const results = useRef<{ ok: boolean; rt: number | null }[]>([]);
  const onset = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(p.deadline);
  const finish = () => {
    const r = results.current;
    const rts = r.filter((x) => x.ok && x.rt !== null).map((x) => x.rt as number);
    p.onDone({
      accuracy: r.filter((x) => x.ok).length / r.length,
      metrics: {
        correct: r.filter((x) => x.ok).length,
        items: r.length,
        timeouts: r.filter((x) => x.rt === null).length,
        meanRtMs: rts.length ? Math.round(mean(rts)) : null,
        ...(p.stairId ? { deadlineMs: deadline.current } : {}),
      },
      conditionKey: p.conditionKey,
      params: p.stairId ? { stairNext: deadline.current } : undefined,
    });
  };
  const show = (k: number) => {
    timer.current = setTimeout(() => {
      if (k >= p.items.length) return finish();
      setI(k);
      onset.current = realClock.now();
      timer.current = setTimeout(() => record(k, null), deadline.current);
    }, 400);
  };
  const record = (k: number, side: 'left' | 'right' | null) => {
    if (results.current[k] || k < 0) return;
    if (timer.current) clearTimeout(timer.current);
    const ok = side === p.items[k].answer;
    results.current[k] = { ok, rt: side ? Math.round(realClock.now() - onset.current) : null };
    if (p.stairId) deadline.current = timeStep(p.stairId, deadline.current, ok);
    if (!ok && p.sound) playErrorSound();
    setI(-1);
    show(k + 1);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const keys = useAnswerKeys();
  useKey([keys.left, keys.right], (e) => record(i, e.key.toLowerCase() === keys.left ? 'left' : 'right'), started && i >= 0);
  if (!started)
    return (
      <Gate title={p.title} onGo={() => (setStarted(true), show(0))} label={t('common.start')}>
        <p className="text-center text-white">{p.instructions}</p>
      </Gate>
    );
  return (
    <Stage title={`${p.title} · ${Math.max(1, i + 1)} / ${p.items.length}`}>
      <div className="flex min-h-[220px] items-center justify-center">{i >= 0 ? p.render(p.items[i].item) : <span className="text-2xl text-line">+</span>}</div>
      <Keys left={p.labels[0]} right={p.labels[1]} onLeft={() => record(i, 'left')} onRight={() => record(i, 'right')} active={i >= 0} />
    </Stage>
  );
}

/** P4/P5: two strings of five digits (1–9) or consonants side by side; if different, one character differs. */
export function StringCompareFaithful({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const task = ctx.exerciseId as 'P4' | 'P5';
  const items = useMemo(() => {
    const rng = createRng(ctx.seed);
    const alphabet = task === 'P4' ? '123456789'.split('') : 'BCDFGHJKLMNPQRSTVWXZ'.split('');
    const n = ctx.params.items ?? 40;
    return rng.shuffle(Array.from({ length: n }, (_, k) => (k % 2 ? 'right' : 'left') as 'left' | 'right')).map((answer) => {
      const a = Array.from({ length: 5 }, () => rng.pick(alphabet)).join('');
      let b = a;
      if (answer === 'right') {
        const j = rng.int(0, 4);
        b = a.slice(0, j) + rng.pick(alphabet.filter((x) => x !== a[j])) + a.slice(j + 1);
      }
      return { item: { a, b }, answer };
    });
  }, [ctx.seed]);
  return (
    <TwoChoiceBlock
      title={t(`ex.${task}.name`)}
      instructions={t('faithful.compareInstr')}
      items={items}
      render={({ a, b }) => (
        <div className="flex flex-wrap items-center justify-center gap-10 font-mono text-4xl tracking-[0.3em] text-white">
          <span>{a}</span>
          <span>{b}</span>
        </div>
      )}
      labels={[t('speed.same'), t('speed.different')]}
      deadline={ctx.params.deadline ?? 4000}
      conditionKey={ctx.staircase ? `S-${task}|n=${items.length}` : `F-${task}|n=${items.length}|deadline=${ctx.params.deadline ?? 4000}`}
      stairId={ctx.staircase ? task : undefined}
      sound={ctx.settings.errorSound}
      onDone={onDone}
    />
  );
}

const PART_HUES = [265, 205, 160, 35, 340, 120];

/** A part-based 3-D-looking object ("fribble"-like): a shaded body with four parts in fixed slots. */
export function FribbleView({ f, size = 170 }: { f: Fribble; size?: number }) {
  const id = `fr${f.body}${f.hue}${f.parts.join('')}${Math.random().toString(36).slice(2, 6)}`;
  const hue = PART_HUES[f.hue];
  const slots: [number, number, number][] = [
    [50, 16, 0],
    [14, 52, -90],
    [86, 52, 90],
    [50, 90, 180],
  ];
  const body =
    f.body === 0 ? <ellipse cx="50" cy="53" rx="27" ry="22" fill={`url(#${id}b)`} /> : f.body === 1 ? <rect x="26" y="33" width="48" height="40" rx="12" fill={`url(#${id}b)`} /> : <path d="M50 28 C76 28 80 58 70 74 C62 84 38 84 30 74 C20 58 24 28 50 28 Z" fill={`url(#${id}b)`} />;
  const part = (shape: number, k: number) => {
    const [x, y, rot] = slots[k];
    const c = `hsl(${(hue + 40 * (k + 1)) % 360} 70% 62%)`;
    const shapes = [
      <circle key="s" r="9" fill={c} />,
      <path key="c" d="M-9 7 L0 -11 L9 7 Z" fill={c} />,
      <rect key="r" x="-6" y="-10" width="12" height="18" rx="3" fill={c} />,
      <circle key="o" r="8" fill="none" stroke={c} strokeWidth="4" />,
      <path key="t" d="M-10 6 Q0 -16 10 6 Z" fill={c} />,
    ];
    return (
      <g key={k} transform={`translate(${x} ${y}) rotate(${rot})`}>
        <line x1="0" y1="10" x2="0" y2="18" stroke="#8A8FB8" strokeWidth="3" />
        {shapes[shape]}
      </g>
    );
  };
  return (
    <svg viewBox="0 0 100 106" width={size} height={size * 1.06} role="img" aria-label="object" className="rounded-xl bg-panel2/50">
      <defs>
        <radialGradient id={`${id}b`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={`hsl(${hue} 80% 78%)`} />
          <stop offset="1" stopColor={`hsl(${hue} 55% 35%)`} />
        </radialGradient>
      </defs>
      {f.parts.map(part)}
      {body}
    </svg>
  );
}

/** P6: are the two objects exactly the same, or different in one part? */
export function FribbleCompare({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const items = useMemo(() => genFribbleTrials(ctx.seed, ctx.params.items ?? 40).map((x) => ({ item: { a: x.a, b: x.b }, answer: x.answer })), [ctx.seed]);
  return (
    <TwoChoiceBlock
      title={t('ex.P6.name')}
      instructions={t('faithful.fribbleInstr')}
      items={items}
      render={({ a, b }) => (
        <div className="flex flex-wrap justify-center gap-8">
          <FribbleView f={a} />
          <FribbleView f={b} />
        </div>
      )}
      labels={[t('speed.same'), t('speed.different')]}
      deadline={ctx.params.deadline ?? 6000}
      conditionKey={ctx.staircase ? `S-P6|n=${items.length}` : `F-P6|n=${items.length}|deadline=${ctx.params.deadline ?? 6000}`}
      stairId={ctx.staircase ? 'P6' : undefined}
      sound={ctx.settings.errorSound}
      onDone={onDone}
    />
  );
}

export const isFaithfulCrt = (id: string): id is CrtTask => id === 'P1' || id === 'P2' || id === 'P3';
