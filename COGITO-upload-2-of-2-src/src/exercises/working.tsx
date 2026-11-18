import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { createRng } from '../core/rng';
import { genDigits, genNBack, genRunning, genSpanBlock, genUpdating, type NBackMode } from '../core/generate';
import { backwardOf, scoreNBack, scoreRunning, scoreSequence, sequencedOf } from '../core/scoring';
import { mean, round } from '../core/stats';
import { realClock, runSequence } from '../core/timer';
import { useStallHandler } from './stall';
import { NUMERIC_DIGITS, NUMERIC_NBACK } from '../core/nearTransfer';
import { genStrictUpdating, UPDATING_GAP_MS, UPDATING_INITIAL_MS } from '../core/faithful';
import { updatingStep } from '../core/staircase';
import { Fixation, Gate, Stage, Ticker } from './shared';
import { Button, Kbd, cx, useKey } from '../ui/kit';

export const DIGIT_ON_MS = 800;
export const DIGIT_OFF_MS = 200;

/** Shows digits one at a time (drift-free timing). */
function DigitStream({ digits, onDone, label }: { digits: number[]; onDone: () => void; label: string }) {
  const [shown, setShown] = useState<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const onStall = useStallHandler();
  useEffect(() => {
    const durations = digits.flatMap(() => [DIGIT_ON_MS, DIGIT_OFF_MS]);
    const s = runSequence(durations, (i) => setShown(i % 2 === 0 ? digits[i / 2] : null), () => done.current(), realClock, onStall);
    return () => s.cancel();
  }, []);
  return (
    <Stage title={label}>
      <div className="flex min-h-[180px] items-center justify-center font-mono text-7xl text-white">{shown ?? ''}</div>
    </Stage>
  );
}

function DigitAnswer({ prompt, onSubmit }: { prompt: string; onSubmit: (digits: number[]) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState('');
  const submit = () => onSubmit(v.replace(/\D/g, '').split('').map(Number));
  return (
    <Stage title={prompt} footer={<Button onClick={submit}>{t('common.submit')} <Kbd>Enter</Kbd></Button>}>
      <input autoCapitalize="off" autoCorrect="off" spellCheck={false}
        autoFocus
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/[^\d\s]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="mx-auto block w-full max-w-xs rounded-xl border border-line bg-void/60 px-4 py-3 text-center font-mono text-3xl tracking-[0.3em] text-white focus:border-violet focus:outline-none"
      />
    </Stage>
  );
}

export type SpanMode = 'forward' | 'backward' | 'sequencing';

function expected(mode: SpanMode, digits: number[]) {
  return mode === 'forward' ? digits : mode === 'backward' ? backwardOf(digits) : sequencedOf(digits);
}

/**
 * E1 Digit span. Training: a block of 5 trials at one length (adaptive across blocks).
 * Assessment (`fixed.staircase`): backward span from 2 to 8, 2 trials per length, stop after two failures at a length.
 */
export function DigitSpan({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const mode = (ctx.variant as SpanMode) ?? 'forward';
  const staircase = !!ctx.fixed?.staircase;
  const rng = useMemo(() => createRng(ctx.seed), [ctx.seed]);
  const block = useMemo(() => (staircase ? [] : genSpanBlock(ctx.seed, ctx.params.length)), [ctx.seed]);
  const [trial, setTrial] = useState(0);
  const [len, setLen] = useState<number>((ctx.fixed?.min as number) ?? ctx.params.length);
  const [digits, setDigits] = useState<number[]>(() => (staircase ? genDigits(rng, (ctx.fixed?.min as number) ?? 2) : block[0]));
  const [phase, setPhase] = useState<'fix' | 'show' | 'answer'>('fix');
  const results = useRef<{ len: number; ok: boolean; positions: number }[]>([]);
  const prompt = t(mode === 'forward' ? 'span.promptForward' : mode === 'backward' ? 'span.promptBackward' : 'span.promptSequencing');

  const finish = () => {
    const r = results.current;
    if (staircase) {
      const span = Math.max(0, ...r.filter((x) => x.ok).map((x) => x.len));
      onDone({
        accuracy: r.filter((x) => x.ok).length / r.length,
        metrics: { span, correct: r.filter((x) => x.ok).length, trials: r.length },
        conditionKey: `span-${mode}|staircase`,
        params: { mode },
      });
    } else {
      const correct = r.filter((x) => x.ok).length;
      onDone({
        accuracy: correct / r.length,
        metrics: { correct, trials: r.length, span: correct >= 3 ? ctx.params.length : null, exact: round(mean(r.map((x) => x.positions / x.len))) },
        conditionKey: `E1-${mode}|len=${ctx.params.length}|rate=${DIGIT_ON_MS + DIGIT_OFF_MS}`,
        params: { mode },
      });
    }
  };

  if (phase === 'fix') return <Fixation onDone={() => setPhase('show')} />;
  if (phase === 'show') return <DigitStream key={`${trial}`} digits={digits} label={`${t(`span.${mode}`)} · ${digits.length}`} onDone={() => setPhase('answer')} />;
  return (
    <DigitAnswer
      key={trial}
      prompt={prompt}
      onSubmit={(answer) => {
        const s = scoreSequence(expected(mode, digits), answer);
        results.current.push({ len: digits.length, ok: s.exact, positions: s.positions });
        if (staircase) {
          const atLen = results.current.filter((x) => x.len === len);
          const max = (ctx.fixed?.max as number) ?? 8;
          const per = (ctx.fixed?.perLength as number) ?? 2;
          if (atLen.length >= per) {
            if (atLen.every((x) => !x.ok) || len >= max) return finish();
            setLen(len + 1);
            setDigits(genDigits(rng, len + 1));
          } else setDigits(genDigits(rng, len));
          setTrial(trial + 1);
          setPhase('fix');
          return;
        }
        if (trial + 1 >= block.length) return finish();
        setDigits(block[trial + 1]);
        setTrial(trial + 1);
        setPhase('fix');
      }}
    />
  );
}

/** E2 Running memory span. */
export function RunningMemory({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const n = ctx.params.window;
  const streams = useMemo(() => genRunning(ctx.seed, n), [ctx.seed]);
  const [trial, setTrial] = useState(0);
  const [phase, setPhase] = useState<'fix' | 'show' | 'answer'>('fix');
  const results = useRef<number[]>([]);
  if (phase === 'fix') return <Fixation onDone={() => setPhase('show')} />;
  if (phase === 'show') return <DigitStream key={trial} digits={streams[trial]} label={`${t('common.trial')} ${trial + 1} / ${streams.length}`} onDone={() => setPhase('answer')} />;
  return (
    <DigitAnswer
      key={trial}
      prompt={t('running.prompt', { n })}
      onSubmit={(answer) => {
        const target = streams[trial].slice(-n);
        results.current.push(scoreRunning(target, answer).proportion);
        if (trial + 1 < streams.length) {
          setTrial(trial + 1);
          setPhase('fix');
          return;
        }
        const acc = mean(results.current);
        onDone({
          accuracy: acc,
          metrics: { exact: round(acc), correct: results.current.filter((x) => x === 1).length, trials: streams.length },
          conditionKey: `E2|n=${n}|rate=${DIGIT_ON_MS + DIGIT_OFF_MS}`,
        });
      }}
    />
  );
}

export const UPDATE_INITIAL_MS = 3000;
export const UPDATE_OP_MS = 1500;

/** E3 Memory updating. */
export function MemoryUpdating({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  // E3 varies slots/operations; G5 (COGITO-style) keeps 4 values and 8 operations and adapts presentation time.
  const slots = ctx.params.slots ?? 4;
  const nOps = ctx.params.ops ?? 8;
  // Staircase mode (COGITO adaptive): the time per operation adapts after every problem.
  const [opMs, setOpMs] = useState(ctx.params.opMs ?? UPDATE_OP_MS);
  // Faithful protocol: 4 s to study the digits, 0.5 s gap, operations of −8…+8 never on the same cell twice in a
  // row, the calibrated time per operation and a 0.25 s gap (Schmiedek et al., 2010).
  const faithful = !!ctx.faithful;
  const opGap = faithful ? ctx.params.isi : 300;
  // G5 blocks hold 4 problems, so COGITO's 8 per session = 2 blocks.
  const trials = useMemo(
    () => (faithful ? genStrictUpdating(ctx.seed, ctx.params.problems ?? 4) : genUpdating(ctx.seed, slots, nOps, ctx.exerciseId === 'G5' ? 4 : 3)),
    [ctx.seed],
  );
  const [trial, setTrial] = useState(0);
  const [phase, setPhase] = useState<'fix' | 'initial' | 'ops' | 'answer'>('fix');
  const [op, setOp] = useState(0);
  const [blank, setBlank] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const results = useRef<number[]>([]);
  const tr = trials[trial];
  const boxes = (content: (i: number) => React.ReactNode) => (
    <div className="flex flex-wrap justify-center gap-3">
      {tr.initial.map((_, i) => (
        <div key={i} className="flex h-24 w-20 items-center justify-center rounded-xl border border-line bg-panel2 font-mono text-4xl text-white">
          {content(i)}
        </div>
      ))}
    </div>
  );
  if (phase === 'fix') return <Fixation onDone={() => setPhase('initial')} />;
  if (phase === 'initial')
    return (
      <Stage title={`${t('common.memorize')} · ${t('common.trial')} ${trial + 1} / ${trials.length}`}>
        {boxes((i) => tr.initial[i])}
        <Ticker ms={faithful ? UPDATING_INITIAL_MS + UPDATING_GAP_MS : UPDATE_INITIAL_MS} onDone={() => setPhase('ops')} />
      </Stage>
    );
  if (phase === 'ops') {
    const o = tr.operations[op];
    return (
      <Stage title={`${op + 1} / ${tr.operations.length}`}>
        {boxes((i) => (!blank && i === o.slot ? <span className="text-volt">{o.delta > 0 ? `+${o.delta}` : `−${-o.delta}`}</span> : <span className="text-line">?</span>))}
        <Ticker
          key={`${op}-${blank}`}
          ms={blank ? opGap : opMs}
          onDone={() => {
            if (!blank) setBlank(true);
            else if (op + 1 < tr.operations.length) {
              setBlank(false);
              setOp(op + 1);
            } else {
              setAnswers(tr.initial.map(() => ''));
              setPhase('answer');
            }
          }}
        />
      </Stage>
    );
  }
  const submit = () => {
    const ok = tr.final.filter((v, i) => Number(answers[i]) === v && answers[i] !== '').length;
    const nextOp = ctx.staircase ? updatingStep(opMs, ok) : opMs;
    if (ctx.staircase) setOpMs(nextOp);
    results.current.push(ok / tr.final.length);
    if (trial + 1 < trials.length) {
      setTrial(trial + 1);
      setOp(0);
      setBlank(false);
      setPhase('fix');
      return;
    }
    const acc = mean(results.current);
    if (ctx.staircase) {
      onDone({ accuracy: acc, metrics: { exact: round(acc), trials: trials.length, opMs: nextOp }, conditionKey: `S-${ctx.exerciseId}|slots=${slots}|ops=${nOps}`, params: { stairNext: nextOp } });
      return;
    }
    onDone({ accuracy: acc, metrics: { exact: round(acc), trials: trials.length }, conditionKey: `${faithful ? 'F-' : ''}${ctx.exerciseId}|slots=${slots}|ops=${nOps}|op=${opMs}` });
  };
  return (
    <Stage title={t('updating.prompt')} footer={<Button onClick={submit}>{t('common.submit')} <Kbd>Enter</Kbd></Button>}>
      <div className="flex flex-wrap justify-center gap-3">
        {answers.map((a, i) => (
          <input autoCapitalize="off" autoCorrect="off" spellCheck={false}
            key={i}
            autoFocus={i === 0}
            inputMode="numeric"
            maxLength={1}
            value={a}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(-1);
              setAnswers(answers.map((x, j) => (j === i ? v : x)));
              if (v) (e.target.nextElementSibling as HTMLInputElement | null)?.focus();
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="h-24 w-20 rounded-xl border border-line bg-void/60 text-center font-mono text-4xl text-white focus:border-violet focus:outline-none"
          />
        ))}
      </div>
    </Stage>
  );
}

function speak(letter: string, lang: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(letter);
    u.lang = lang === 'pt' ? 'pt-PT' : 'en-GB';
    u.rate = 1.1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* audio is optional */
  }
}

/** E4 N-back (spatial, verbal, dual). Responses: A = position match, L = letter match. */
export function NBack({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  // G6 is the COGITO-style spatial 3-back on a 4×4 grid, adapting the presentation rate instead of n.
  const cogito = ctx.exerciseId === 'G6';
  // Near-transfer assessment: numerical 3-back (digits instead of positions), fixed conditions, no audio.
  const numeric = ctx.fixed?.numeric === true;
  const mode: NBackMode = cogito ? 'spatial' : numeric ? 'verbal' : ((ctx.variant as NBackMode) ?? 'spatial');
  const n = cogito || numeric ? 3 : ctx.params.n;
  const grid = cogito ? 4 : 3;
  const spec = useMemo(
    () => (numeric ? genNBack(ctx.seed, n, mode, NUMERIC_NBACK.trials, grid, NUMERIC_DIGITS) : genNBack(ctx.seed, n, mode, 20 + n, grid)),
    [ctx.seed],
  );
  const stim = numeric ? NUMERIC_NBACK.stimMs : cogito ? Math.min(500, Math.round(ctx.params.soa * 0.4)) : ctx.settings.nbackStimMs;
  const isi = numeric ? NUMERIC_NBACK.isiMs : cogito ? ctx.params.soa - stim : ctx.settings.nbackIsiMs;
  const [started, setStarted] = useState(!numeric);
  const [phase, setPhase] = useState<'fix' | 'run'>('fix');
  const [i, setI] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [flash, setFlash] = useState<{ pos?: boolean; let?: boolean }>({});
  const posResp = useRef<boolean[]>([]);
  const letResp = useRef<boolean[]>([]);
  const cur = useRef(-1);
  const useVisual = mode !== 'spatial';
  const useSpatial = mode !== 'verbal';

  useKey(
    ['a', 'l'],
    (e) => {
      if (cur.current < 0) return;
      if (e.key.toLowerCase() === 'a' && useSpatial) {
        posResp.current[cur.current] = true;
        setFlash((f) => ({ ...f, pos: true }));
      }
      if (e.key.toLowerCase() === 'l' && useVisual) {
        letResp.current[cur.current] = true;
        setFlash((f) => ({ ...f, let: true }));
      }
    },
    phase === 'run',
  );

  const onStall = useStallHandler();
  useEffect(() => {
    if (phase !== 'run') return;
    const durations = spec.positions.flatMap(() => [stim, isi]);
    const s = runSequence(
      durations,
      (k) => {
        if (k % 2 === 0) {
          const idx = k / 2;
          cur.current = idx;
          setI(idx);
          setFlash({});
          setVisible(true);
          if (useVisual && !numeric && ctx.settings.audio) speak(spec.letters[idx], ctx.lang);
        } else setVisible(false);
      },
      () => {
        const p = scoreNBack(spec.posTargets, posResp.current, n);
        const l = scoreNBack(spec.letterTargets, letResp.current, n);
        const accs = [useSpatial ? p.accuracy : null, useVisual ? l.accuracy : null].filter((x): x is number => x !== null);
        onDone({
          accuracy: mean(accs),
          metrics: {
            ...(useSpatial ? { posAccuracy: round(p.accuracy), hits: p.hits, misses: p.misses, falseAlarms: p.falseAlarms } : {}),
            ...(useVisual && !numeric ? { letterAccuracy: round(l.accuracy) } : {}),
            ...(useVisual && !useSpatial ? { hits: l.hits, misses: l.misses, falseAlarms: l.falseAlarms } : {}),
            dPrimeCorrected: round(useSpatial ? p.dPrimeCorrected : l.dPrimeCorrected),
            ...(p.warmupPresses + l.warmupPresses ? { warmupPresses: p.warmupPresses + l.warmupPresses } : {}),
          },
          conditionKey: `${cogito ? 'G6' : numeric ? 'near-3back-num' : `E4-${mode}`}|n=${n}|grid=${grid}|stim=${stim}|isi=${isi}`,
          params: { mode, stimMs: stim, isiMs: isi },
        });
      },
      realClock,
      onStall,
    );
    return () => s.cancel();
  }, [phase]);

  if (!started)
    return (
      <Gate title={t('near.numeric3back')} onGo={() => setStarted(true)} label={t('common.start')}>
        <p className="text-center text-white">{t('near.numeric3backInstr')}</p>
      </Gate>
    );
  if (phase === 'fix') return <Fixation onDone={() => setPhase('run')} ms={1200} />;
  const pos = spec.positions[i];
  return (
    <Stage title={`${n}-back · ${numeric ? t('near.digits') : t(`nback.${mode}`)} · ${Math.max(0, i + 1)} / ${spec.positions.length}`}>
      <div className={cx('mx-auto grid w-64 gap-2', grid === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
        {Array.from({ length: grid * grid }, (_, c) => {
          const lit = visible && ((useSpatial && c === pos) || (!useSpatial && c === 4));
          return (
            <div key={c} className={cx('flex aspect-square items-center justify-center rounded-lg border text-3xl font-semibold', lit ? 'border-violet bg-violet/40 text-white shadow-neon' : 'border-line bg-panel2/60')}>
              {lit && useVisual ? spec.letters[i] : grid === 3 && c === 4 && !lit ? <span className="text-xs text-line">+</span> : ''}
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex justify-center gap-4">
        {useSpatial && (
          <button type="button" onPointerDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))} onClick={(e) => e.detail === 0 && window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))} className={cx('rounded-lg border px-4 py-2 text-sm', flash.pos ? 'border-volt bg-volt/20 text-white' : 'border-line text-dim')}>
            {t('nback.position')}
          </button>
        )}
        {useVisual && (
          <button type="button" onPointerDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }))} onClick={(e) => e.detail === 0 && window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }))} className={cx('rounded-lg border px-4 py-2 text-sm', flash.let ? 'border-volt bg-volt/20 text-white' : 'border-line text-dim')}>
            {numeric ? t('near.numberMatch') : t('nback.letter')}
          </button>
        )}
      </div>
    </Stage>
  );
}
