import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { CORSI_BLOCKS, CORSI_GAP_MS, CORSI_ON_MS, SYMBOL_DIGIT_MS, corsiSpan, digitForSymbol, genCorsi, genSeries, genSymbolDigit } from '../core/transfer';
import { mean, round } from '../core/stats';
import { realClock, runSequence } from '../core/timer';
import { useStallHandler } from './stall';
import { Gate, Stage } from './shared';
import { Button, Kbd, TimerBar, cx, useKey } from '../ui/kit';

// Untrained transfer tests, used only in the transfer battery (never in training sessions).

const SYMBOLS = [
  'M20 80 L50 20 L80 80',
  'M20 50 L80 50 M50 20 L50 80',
  'M25 25 L75 75 M75 25 L25 75',
  'M20 30 Q50 90 80 30',
  'M30 20 L30 80 L75 80',
  'M20 70 L40 30 L60 70 L80 30',
  'M50 20 L80 50 L50 80 L20 50 Z',
  'M25 25 L75 25 L75 75 M25 50 L60 50',
  'M50 20 A30 30 0 1 1 49.9 20 M50 40 L50 60',
];

function Sym({ i, size = 44 }: { i: number; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label={`symbol ${i + 1}`}>
      <path d={SYMBOLS[i]} fill="none" stroke="#E6E8F5" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Symbol–digit coding: type the digit that the key pairs with each symbol, for 90 seconds. */
export function SymbolDigit({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const form = (ctx.fixed?.form as number) ?? 0;
  const spec = useMemo(() => genSymbolDigit(form), [form]);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const correct = useRef(0);
  const errors = useRef(0);
  const finished = useRef(false);
  const t0 = useRef(0);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    // Rate over the time actually used (normally the full 90 s).
    const elapsedS = Math.min(SYMBOL_DIGIT_MS, Math.max(1, performance.now() - t0.current)) / 1000;
    const per = correct.current / elapsedS;
    onDone({
      accuracy: correct.current / Math.max(1, correct.current + errors.current),
      metrics: { correct: correct.current, errors: errors.current, throughput: round(per * 60, 1) },
      conditionKey: `transfer:sdmt|form=${form}|ms=${SYMBOL_DIGIT_MS}`,
    });
  };
  const respond = (digit: number) => {
    if (!started || finished.current) return;
    if (digit === digitForSymbol(spec.key, spec.stream[i])) correct.current++;
    else errors.current++;
    if (i + 1 >= spec.stream.length) finish();
    else setI(i + 1);
  };
  useKey(
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    (e) => respond(Number(e.key)),
    started,
  );
  const keyRow = (
    <div className="mx-auto mb-6 grid max-w-xl grid-cols-9 gap-1 rounded-xl border border-line bg-panel2/50 p-2">
      {Array.from({ length: 9 }, (_, d) =>
        // While the test runs each key cell is also a button, so touch screens can answer by tapping it.
        started ? (
          <button
            key={d}
            type="button"
            onPointerDown={() => respond(d + 1)}
            onClick={(e) => e.detail === 0 && respond(d + 1)}
            aria-label={String(d + 1)}
            className="flex flex-col items-center rounded-lg border border-transparent py-1 active:border-violet active:bg-violet/20"
          >
            <Sym i={spec.key[d]} size={34} />
            <span className="font-mono text-sm text-volt">{d + 1}</span>
          </button>
        ) : (
          <div key={d} className="flex flex-col items-center">
            <Sym i={spec.key[d]} size={34} />
            <span className="font-mono text-sm text-volt">{d + 1}</span>
          </div>
        ),
      )}
    </div>
  );
  if (!started)
    return (
      <Gate title={t('transfer.sdmt')} onGo={() => ((t0.current = performance.now()), setStarted(true))} label={t('common.start')}>
        <p className="mb-4 text-center text-white">{t('transfer.sdmtInstr')}</p>
        {keyRow}
      </Gate>
    );
  return (
    <Stage title={t('transfer.sdmt')}>
      {keyRow}
      <div className="flex justify-center">
        <div className="rounded-2xl border border-violet/60 p-4 shadow-neon">
          <Sym i={spec.stream[i]} size={96} />
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-dim">{t('transfer.sdmtKeys')}</div>
      <div className="mx-auto mt-5 max-w-md">
        <TimerBar ms={SYMBOL_DIGIT_MS} onDone={finish} />
      </div>
    </Stage>
  );
}

export const SERIES_LIMIT_MS = 6 * 60_000;

/** Series completion (letter and number series): choose the next term. */
export function SeriesCompletion({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const form = (ctx.fixed?.form as number) ?? 0;
  const items = useMemo(() => genSeries(form), [form]);
  const [i, setI] = useState(0);
  const answers = useRef<boolean[]>([]);
  const rts = useRef<number[]>([]);
  const shown = useRef(realClock.now());
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    const correct = answers.current.filter(Boolean).length;
    onDone({
      accuracy: correct / items.length,
      metrics: { correct, attempted: answers.current.length, meanRtMs: rts.current.length ? Math.round(mean(rts.current)) : null },
      conditionKey: `transfer:series|form=${form}|n=${items.length}`,
    });
  };
  const choose = (k: number) => {
    answers.current.push(items[i].options[k] === items[i].answer);
    rts.current.push(Math.round(realClock.now() - shown.current));
    shown.current = realClock.now();
    if (i + 1 >= items.length) finish();
    else setI(i + 1);
  };
  useKey(['1', '2', '3', '4'], (e) => choose(Number(e.key) - 1));
  const it = items[i];
  return (
    <Stage title={`${t('transfer.series')} · ${i + 1} / ${items.length}`}>
      <p className="mb-4 text-center text-xs text-dim">{t('transfer.seriesInstr')}</p>
      <div className="mb-6 flex flex-wrap justify-center gap-2 font-mono text-2xl text-white">
        {it.terms.map((x, k) => (
          <span key={k} className="rounded-lg border border-line bg-panel2/60 px-3 py-2">
            {x}
          </span>
        ))}
        <span className="rounded-lg border border-dashed border-violet px-3 py-2 text-violet">?</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {it.options.map((o, k) => (
          <Button key={k} variant="ghost" onClick={() => choose(k)} className="py-3 font-mono text-xl">
            <Kbd>{k + 1}</Kbd> {o}
          </Button>
        ))}
      </div>
      <div className="mx-auto mt-5 max-w-md">
        <TimerBar ms={SERIES_LIMIT_MS} onDone={finish} />
      </div>
    </Stage>
  );
}

/** Corsi block-tapping span (forward). */
export function CorsiSpan({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const form = (ctx.fixed?.form as number) ?? 0;
  const seqs = useMemo(() => genCorsi(form), [form]);
  const [li, setLi] = useState(0);
  const [ti, setTi] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'show' | 'answer'>('ready');
  const [lit, setLit] = useState<number | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const results = useRef<{ len: number; ok: boolean }[]>([]);
  const seq = seqs[li][ti];
  const onStall = useStallHandler();

  useEffect(() => {
    if (phase !== 'show') return;
    const durations = seq.flatMap(() => [CORSI_ON_MS, CORSI_GAP_MS]);
    const s = runSequence(
      durations,
      (k) => setLit(k % 2 === 0 ? seq[k / 2] : null),
      () => {
        setLit(null);
        setTaps([]);
        setPhase('answer');
      },
      realClock,
      onStall,
    );
    return () => s.cancel();
  }, [phase, li, ti]);

  const submit = (final: number[]) => {
    const ok = final.length === seq.length && final.every((b, k) => b === seq[k]);
    results.current.push({ len: seq.length, ok });
    const atLen = results.current.filter((r) => r.len === seq.length);
    const lastLen = li === seqs.length - 1;
    if (atLen.length >= seqs[li].length) {
      if (atLen.every((r) => !r.ok) || lastLen) {
        const span = corsiSpan(results.current);
        onDone({
          accuracy: results.current.filter((r) => r.ok).length / results.current.length,
          metrics: { span, correct: results.current.filter((r) => r.ok).length, trials: results.current.length },
          conditionKey: `transfer:corsi|form=${form}`,
        });
        return;
      }
      setLi(li + 1);
      setTi(0);
    } else setTi(ti + 1);
    setPhase('ready');
  };

  if (phase === 'ready')
    return (
      <Gate title={`${t('transfer.corsi')} · ${seq.length}`} onGo={() => setPhase('show')} label={t('common.start')}>
        <p className="text-center text-white">{t('transfer.corsiInstr')}</p>
      </Gate>
    );
  return (
    <Stage title={phase === 'show' ? t('common.memorize') : `${t('transfer.corsiTap')} · ${taps.length} / ${seq.length}`}>
      <div className="relative mx-auto aspect-square w-full max-w-md rounded-2xl border border-line bg-panel2/40">
        {CORSI_BLOCKS.map(([x, y], b) => (
          <button
            key={b}
            type="button"
            aria-label={`block ${b + 1}`}
            disabled={phase !== 'answer'}
            onClick={() => {
              const next = [...taps, b];
              setTaps(next);
              if (next.length === seq.length) submit(next);
            }}
            className={cx(
              'absolute h-[13%] w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-lg border transition',
              lit === b ? 'border-volt bg-volt shadow-volt' : taps.includes(b) ? 'border-violet bg-violet/40' : 'border-line bg-violet-soft/30 enabled:hover:border-violet',
            )}
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        ))}
      </div>
    </Stage>
  );
}
