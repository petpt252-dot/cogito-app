import { useMemo, useRef, useState } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { ANIMALS, ANIMAL_MS, SPATIAL, animalItem, genAnimalSpan, genSpatialUpdating, type Dir } from '../core/nearTransfer';
import { expandEntries, scoreCuedRecall } from '../core/scoring';
import { splitEntries } from '../core/text';
import { LEXICON } from '../content';
import { mean, round } from '../core/stats';
import { Fixation, Gate, Stage, Ticker } from './shared';
import { SequentialWords } from './verbal';
import { Button, Kbd, cx } from '../ui/kit';

// Near-transfer assessment tasks (see core/nearTransfer.ts). Fixed conditions; never used in training.

/** Animal span: animals shown one at a time, then typed back from smallest to largest. */
export function AnimalSpan({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const form = (ctx.fixed?.form as number) ?? 0;
  const lists = useMemo(() => genAnimalSpan(form), [form]);
  const [started, setStarted] = useState(false);
  const [trial, setTrial] = useState(0);
  const [phase, setPhase] = useState<'fix' | 'show' | 'answer'>('fix');
  const [value, setValue] = useState('');
  const results = useRef<number[]>([]);
  const name = (id: string) => {
    const a = ANIMALS.find((x) => x.id === id)!;
    return ctx.lang === 'pt' ? a.pt : a.en;
  };

  if (!started)
    return (
      <Gate title={t('near.animalSpan')} onGo={() => setStarted(true)} label={t('common.start')}>
        <p className="text-center text-white">{t('near.animalSpanInstr')}</p>
      </Gate>
    );
  if (phase === 'fix') return <Fixation onDone={() => setPhase('show')} />;
  if (phase === 'show')
    return (
      <SequentialWords
        key={trial}
        words={lists[trial].shown.map(name)}
        ms={ANIMAL_MS}
        onDone={() => {
          setValue('');
          setPhase('answer');
        }}
      />
    );
  const submit = () => {
    const truth = lists[trial].bySize;
    const entries = expandEntries(splitEntries(value), truth.map(animalItem), LEXICON);
    const ok = scoreCuedRecall(truth.map(animalItem), entries, ctx.settings.typoTolerance, LEXICON).correct;
    results.current.push(ok / Math.max(truth.length, entries.length));
    if (trial + 1 < lists.length) {
      setTrial(trial + 1);
      setPhase('fix');
      return;
    }
    const acc = mean(results.current);
    onDone({
      accuracy: acc,
      metrics: { exact: round(acc), correct: results.current.filter((x) => x === 1).length, trials: lists.length },
      conditionKey: `near-animal|form=${form}|rate=${ANIMAL_MS}`,
    });
  };
  return (
    <Stage title={t('near.animalPrompt')} footer={<Button onClick={submit}>{t('common.submit')} <Kbd>Enter</Kbd></Button>}>
      <p className="mb-3 text-center text-xs text-dim">{t('near.animalHint')}</p>
      <input autoCapitalize="off" autoCorrect="off" spellCheck={false}
        autoFocus
        value={value}
       
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="mx-auto block w-full max-w-lg rounded-xl border border-line bg-void/60 px-4 py-3 text-center text-2xl text-white focus:border-violet focus:outline-none"
      />
    </Stage>
  );
}

const ARROW: Record<Dir, string> = { up: '↑', down: '↓', left: '←', right: '→' };

/** Spatial memory updating: track one dot per grid through arrow shifts, then click each final position. */
export function SpatialUpdating({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const form = (ctx.fixed?.form as number) ?? 0;
  const trials = useMemo(() => genSpatialUpdating(form), [form]);
  const [started, setStarted] = useState(false);
  const [trial, setTrial] = useState(0);
  const [phase, setPhase] = useState<'fix' | 'initial' | 'ops' | 'answer'>('fix');
  const [op, setOp] = useState(0);
  const [blank, setBlank] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const results = useRef<number[]>([]);
  const tr = trials[trial];

  const grids = (cell: (g: number, c: number) => { on?: boolean; pick?: boolean }, onCell?: (g: number, c: number) => void, below?: (g: number) => React.ReactNode) => (
    <div className="flex flex-wrap justify-center gap-5">
      {Array.from({ length: SPATIAL.grids }, (_, g) => (
        <div key={g} className="flex flex-col items-center gap-2">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel2/60 p-1.5">
            {Array.from({ length: SPATIAL.size * SPATIAL.size }, (_, c) => {
              const s = cell(g, c);
              const Tag = onCell ? 'button' : 'div';
              return (
                <Tag
                  key={c}
                  {...(onCell ? { type: 'button' as const, onClick: () => onCell(g, c), 'aria-label': t('near.cellLabel', { g: g + 1, r: Math.floor(c / SPATIAL.size) + 1, c: (c % SPATIAL.size) + 1 }) } : {})}
                  className={cx('flex h-12 w-12 items-center justify-center rounded-md border', s.pick ? 'border-volt bg-volt/30' : 'border-line/70 bg-void/50', onCell && 'hover:border-violet')}
                >
                  {s.on && <span className="h-5 w-5 rounded-full bg-violet shadow-neon" />}
                </Tag>
              );
            })}
          </div>
          <div className="h-8 text-2xl font-semibold text-volt">{below?.(g)}</div>
        </div>
      ))}
    </div>
  );

  if (!started)
    return (
      <Gate title={t('near.spatialUpdating')} onGo={() => setStarted(true)} label={t('common.start')}>
        <p className="text-center text-white">{t('near.spatialInstr')}</p>
      </Gate>
    );
  if (phase === 'fix') return <Fixation onDone={() => setPhase('initial')} />;
  if (phase === 'initial')
    return (
      <Stage title={`${t('common.memorize')} · ${t('common.trial')} ${trial + 1} / ${trials.length}`}>
        {grids((g, c) => ({ on: tr.initial[g] === c }))}
        <Ticker ms={SPATIAL.initialMs} onDone={() => setPhase('ops')} />
      </Stage>
    );
  if (phase === 'ops') {
    const o = tr.operations[op];
    return (
      <Stage title={`${op + 1} / ${tr.operations.length}`}>
        {grids(() => ({}), undefined, (g) => (!blank && g === o.grid ? ARROW[o.dir] : ''))}
        <Ticker
          key={`${op}-${blank}`}
          ms={blank ? 300 : SPATIAL.opMs}
          onDone={() => {
            if (!blank) setBlank(true);
            else if (op + 1 < tr.operations.length) {
              setBlank(false);
              setOp(op + 1);
            } else {
              setAnswers(tr.initial.map(() => null));
              setPhase('answer');
            }
          }}
        />
      </Stage>
    );
  }
  const submit = () => {
    const ok = tr.final.filter((cell, g) => answers[g] === cell).length;
    results.current.push(ok / tr.final.length);
    if (trial + 1 < trials.length) {
      setTrial(trial + 1);
      setOp(0);
      setBlank(false);
      setPhase('fix');
      return;
    }
    const acc = mean(results.current);
    onDone({
      accuracy: acc,
      metrics: { exact: round(acc), trials: trials.length },
      conditionKey: `near-spatial|form=${form}|grids=${SPATIAL.grids}|ops=${SPATIAL.ops}|op=${SPATIAL.opMs}`,
    });
  };
  return (
    <Stage title={t('near.spatialPrompt')} footer={<Button onClick={submit} disabled={answers.some((a) => a === null)}>{t('common.submit')}</Button>}>
      {grids(
        (g, c) => ({ on: answers[g] === c, pick: answers[g] === c }),
        (g, c) => setAnswers((a) => a.map((x, k) => (k === g ? c : x))),
      )}
    </Stage>
  );
}
