import { useMemo, useRef, useState } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { genWordList } from '../core/generate';
import { alphaOrder, genAlphaSpan, genNumberNoun, genObjectPositions, OBJECT_GRID, type AlphaVariant } from '../core/cogito';
import { LEXICON, wordItem, wordText } from '../content';
import { OBJECTS } from '../content/visual';
import { scoreFirstThree } from '../core/faithful';
import { expandEntries, scoreCuedRecall, scoreFreeRecall } from '../core/scoring';
import { splitEntries } from '../core/text';
import { mean, round, serialPositionScore } from '../core/stats';
import { Fixation, Stage, Ticker } from './shared';
import { SequentialWords } from './verbal';
import { CuedRecall } from './associative';
import { Button, Kbd, cx } from '../ui/kit';

// COGITO-inspired tasks (after Schmiedek, Lövdén & Lindenberger, 2010). Inspired by the published
// task descriptions; materials, timings and adaptivity are Memory Lab's own.

/** G1 Sequential word learning: words one at a time, recalled in their original order. */
export function SequentialWordLearning({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const ids = useMemo(() => genWordList(ctx.seed, ctx.params.items, ctx.recent).ids, [ctx.seed]);
  // Faithful protocol: 36 words at the calibrated time (1, 2 or 4 s) with a 1 s gap, recalled by first three letters.
  const faithful = !!ctx.faithful;
  const perWord = faithful ? ctx.params.pt : ctx.settings.secondsPerWord * 1000;
  const [phase, setPhase] = useState<'fix' | 'study' | 'recall'>('fix');
  const [answers, setAnswers] = useState<string[]>(() => ids.map(() => ''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study') return <SequentialWords words={ids.map((id) => wordText(id, ctx.lang))} ms={perWord} gapMs={faithful ? ctx.params.isi : 250} onDone={() => setPhase('recall')} />;

  const submit = () => {
    const items = ids.map(wordItem);
    if (faithful) {
      const s = scoreFirstThree(items, answers);
      onDone({
        accuracy: s.accuracy,
        metrics: { studied: ids.length, correct: s.recalled, orderAccuracy: round(s.order), intrusions: s.intrusions },
        conditionKey: `F-G1|n=${ids.length}|pt=${perWord}|isi=${ctx.params.isi}`,
        encodingMs: (perWord + ctx.params.isi) * ids.length,
        itemIds: ids,
        detail: { answers },
        review: [{ label: t('feedback.missed'), tone: 'warn', items: ids.filter((id) => !s.recalledIds.includes(id)).map((id) => wordText(id, ctx.lang)) }],
      });
      return;
    }
    const item = scoreFreeRecall(items, answers, ctx.settings.typoTolerance, LEXICON);
    // Same identity rules as item scoring: a correctly spelled different word (porta for porto) is never a typo.
    const serialOk = scoreCuedRecall(items, answers, ctx.settings.typoTolerance, LEXICON).correct;
    const itemProp = item.correct / ids.length;
    const serialProp = serialOk / ids.length;
    onDone({
      accuracy: (itemProp + serialProp) / 2,
      metrics: { studied: ids.length, correct: item.correct, serialCorrect: serialOk, exact: round(serialProp), omissions: item.omissions, intrusions: item.intrusions },
      conditionKey: `G1|n=${ids.length}|rate=${perWord}`,
      encodingMs: perWord * ids.length,
      itemIds: ids,
      detail: { answers },
      review: [
        { label: t('feedback.missed'), tone: 'warn', items: ids.filter((id) => !item.recalledIds.includes(id)).map((id) => wordText(id, ctx.lang)) },
        { label: t('feedback.intruded'), tone: 'bad', items: item.intrusionList },
      ],
    });
  };
  return (
    <Stage title={faithful ? t('faithful.first3Title') : t('cogito.serialPrompt')} wide footer={<Button onClick={submit}>{t('common.submit')}</Button>}>
      <p className="mb-4 text-center text-xs text-dim">{faithful ? t('faithful.first3Hint') : t('cogito.serialHint')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {answers.map((a, i) => (
          <label key={i} className="flex items-center gap-2">
            <span className="w-6 text-right font-mono text-xs text-dim">{i + 1}</span>
            <input autoCapitalize="off" autoCorrect="off" spellCheck={false}
              ref={(el) => (inputs.current[i] = el)}
              autoFocus={i === 0}
              value={a}
              autoComplete="off"
              maxLength={faithful ? 3 : undefined}
              onChange={(e) => {
                const v = e.target.value;
                setAnswers(answers.map((x, j) => (j === i ? v : x)));
                // first-three-letters entry: jump to the next box after three letters
                if (faithful && v.length === 3 && i + 1 < answers.length) inputs.current[i + 1]?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (i + 1 < answers.length) inputs.current[i + 1]?.focus();
                  else submit();
                }
              }}
              className="w-full rounded-lg border border-line bg-void/60 px-3 py-1.5 text-white focus:border-violet focus:outline-none"
            />
          </label>
        ))}
      </div>
    </Stage>
  );
}

/** G2 Number–noun pairs: learn "22 — anchor", then recall the number for each noun. */
export function NumberNounPairs({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const spec = useMemo(() => genNumberNoun(ctx.seed, ctx.params.pairs, ctx.recent), [ctx.seed]);
  const ms = ctx.faithful ? ctx.params.pt : ctx.settings.secondsPerWord * 2000;
  const gap = ctx.faithful ? ctx.params.isi : 300;
  const [phase, setPhase] = useState<'fix' | 'study' | 'test'>('fix');
  const [i, setI] = useState(0);
  const [blank, setBlank] = useState(false);
  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study') {
    const p = spec.pairs[i];
    return (
      <Stage title={`${t('common.memorize')} · ${i + 1} / ${spec.pairs.length}`}>
        <div className="flex min-h-[150px] items-center justify-center gap-6 text-white">
          {!blank && (
            <>
              <span className="font-mono text-5xl text-volt">{p.number}</span>
              <span className="text-4xl font-semibold">{wordText(p.noun, ctx.lang)}</span>
            </>
          )}
        </div>
        <Ticker
          key={`${i}-${blank}`}
          ms={blank ? gap : ms}
          onDone={() => {
            if (!blank) setBlank(true);
            else if (i + 1 < spec.pairs.length) {
              setBlank(false);
              setI(i + 1);
            } else setPhase('test');
          }}
        />
      </Stage>
    );
  }
  const order = spec.testOrder;
  return (
    <CuedRecall
      pairs={order.map((p) => ({ cue: p.noun, target: p.noun }))}
      lang={ctx.lang}
      title={t('cogito.numberPrompt')}
      numeric
      onDone={(responses, rts) => {
        const s = scoreCuedRecall(order.map((p) => ({ id: p.noun, forms: [String(p.number)] })), responses.map((r) => r.replace(/\D/g, '')), false);
        onDone({
          accuracy: s.accuracy,
          metrics: { studied: order.length, correct: s.correct, omissions: s.omissions, intrusions: s.intrusions, meanRtMs: Math.round(mean(rts)) },
          conditionKey: `${ctx.faithful ? 'F-G2' : 'G2'}|n=${order.length}|enc=${ms}`,
          encodingMs: ms * order.length,
          itemIds: order.map((p) => p.noun),
          review: [{ label: t('feedback.missed'), tone: 'warn', items: order.filter((_, k) => !s.perItem[k]).map((p) => `${p.number} ${wordText(p.noun, ctx.lang)}`) }],
        });
      }}
    />
  );
}

export const OBJECT_POS_MS = 1500;

/** G3 Object position memory: objects appear one by one on a 6×6 grid; rebuild positions and order. */
export function ObjectPositionMemory({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const spec = useMemo(() => genObjectPositions(ctx.seed, ctx.params.objects, ctx.recent), [ctx.seed]);
  const [phase, setPhase] = useState<'fix' | 'study' | 'test'>('fix');
  const [i, setI] = useState(0);
  const [blank, setBlank] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ id: string; cell: number }[]>([]);
  const obj = (id: string) => OBJECTS.find((o) => o.id === id)!;

  const grid = (content: (c: number) => React.ReactNode, onCell?: (c: number) => void) => (
    <div className="mx-auto grid max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${OBJECT_GRID}, minmax(0, 1fr))` }}>
      {Array.from({ length: OBJECT_GRID * OBJECT_GRID }, (_, c) => (
        <button key={c} type="button" disabled={!onCell} onClick={() => onCell?.(c)} className="relative flex aspect-square items-center justify-center rounded-md border border-line bg-panel2/60 text-2xl enabled:hover:border-violet">
          {content(c)}
        </button>
      ))}
    </div>
  );

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study') {
    const cur = spec.sequence[i];
    return (
      <Stage title={`${t('common.memorize')} · ${i + 1} / ${spec.sequence.length}`}>
        {grid((c) => (!blank && c === cur.cell ? obj(cur.id).emoji : null))}
        <Ticker
          key={`${i}-${blank}`}
          ms={blank ? (ctx.faithful ? ctx.params.isi : 300) : ctx.faithful ? ctx.params.pt : OBJECT_POS_MS}
          onDone={() => {
            if (!blank) setBlank(true);
            else if (i + 1 < spec.sequence.length) {
              setBlank(false);
              setI(i + 1);
            } else setPhase('test');
          }}
        />
      </Stage>
    );
  }
  const submit = () => {
    const truthIds = spec.sequence.map((s) => s.id);
    const posOk = spec.sequence.filter((s) => placed.find((p) => p.id === s.id)?.cell === s.cell).length;
    const order = serialPositionScore(truthIds, placed.map((p) => p.id));
    const pos = posOk / truthIds.length;
    onDone({
      accuracy: (pos + order) / 2,
      metrics: { studied: truthIds.length, correct: posOk, posAccuracy: round(pos), orderAccuracy: round(order) },
      conditionKey: ctx.faithful ? `F-G3|n=${truthIds.length}|pt=${ctx.params.pt}|isi=${ctx.params.isi}` : `G3|n=${truthIds.length}|grid=${OBJECT_GRID}|enc=${OBJECT_POS_MS}`,
      encodingMs: (ctx.faithful ? ctx.params.pt + ctx.params.isi : OBJECT_POS_MS) * truthIds.length,
      itemIds: truthIds.map((id) => `obj:${id}`),
      detail: { placed },
    });
  };
  const remaining = spec.palette.filter((id) => !placed.some((p) => p.id === id));
  return (
    <Stage title={t('cogito.objPrompt')} footer={<Button onClick={submit} disabled={remaining.length > 0}>{t('common.submit')}</Button>}>
      <p className="mb-3 text-center text-xs text-dim">{t('cogito.objHint')}</p>
      <div className="mb-3 flex min-h-[48px] flex-wrap justify-center gap-2">
        {remaining.map((id) => (
          <button key={id} type="button" onClick={() => setSelected(id)} className={cx('rounded-lg border px-2 py-1 text-2xl', selected === id ? 'border-volt bg-volt/20 shadow-volt' : 'border-line bg-panel2')}>
            {obj(id).emoji}
          </button>
        ))}
      </div>
      {grid(
        (c) => {
          const k = placed.findIndex((p) => p.cell === c);
          return k >= 0 ? (
            <>
              <span>{obj(placed[k].id).emoji}</span>
              <span className="absolute right-0.5 top-0 font-mono text-[9px] text-volt">{k + 1}</span>
            </>
          ) : null;
        },
        (c) => {
          const k = placed.findIndex((p) => p.cell === c);
          if (k >= 0) return setPlaced(placed.filter((_, j) => j !== k));
          if (selected) {
            setPlaced([...placed, { id: selected, cell: c }]);
            setSelected(null);
          }
        },
      )}
    </Stage>
  );
}

/** G4 Alpha span: remember items, report them in alphabetical order (letters or words). */
export function AlphaSpan({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const variant: AlphaVariant = ctx.variant === 'words' ? 'words' : 'letters';
  const trials = useMemo(() => genAlphaSpan(ctx.seed, ctx.params.length, variant), [ctx.seed]);
  const itemMs = variant === 'letters' ? 1000 : 1500;
  const [trial, setTrial] = useState(0);
  const [phase, setPhase] = useState<'fix' | 'show' | 'answer'>('fix');
  const [value, setValue] = useState('');
  const results = useRef<number[]>([]);
  const label = (x: string) => (variant === 'letters' ? x : wordText(x, ctx.lang));

  if (phase === 'fix') return <Fixation onDone={() => setPhase('show')} />;
  if (phase === 'show')
    return (
      <SequentialWords
        key={trial}
        words={trials[trial].map(label)}
        ms={itemMs}
        onDone={() => {
          setValue('');
          setPhase('answer');
        }}
      />
    );
  const submit = () => {
    const truth = alphaOrder(trials[trial], variant, ctx.lang);
    const entries = variant === 'letters' ? value.toUpperCase().replace(/[^A-Z]/g, '').split('') : expandEntries(splitEntries(value), trials[trial].map(wordItem), LEXICON);
    const ok =
      variant === 'letters'
        ? truth.filter((x, i) => entries[i] === x).length
        : scoreCuedRecall(truth.map(wordItem), entries, ctx.settings.typoTolerance, LEXICON).correct;
    // Extra entries count against the score, as in the span tasks.
    results.current.push(ok / Math.max(truth.length, entries.length));
    if (trial + 1 < trials.length) {
      setTrial(trial + 1);
      setPhase('fix');
      return;
    }
    const acc = mean(results.current);
    onDone({
      accuracy: acc,
      metrics: { exact: round(acc), correct: results.current.filter((x) => x === 1).length, trials: trials.length },
      conditionKey: `G4-${variant}|len=${ctx.params.length}|rate=${itemMs}`,
      params: { variant },
      itemIds: variant === 'words' ? trials.flat() : undefined,
    });
  };
  return (
    <Stage title={t('cogito.alphaPrompt')} footer={<Button onClick={submit}>{t('common.submit')} <Kbd>Enter</Kbd></Button>}>
      <p className="mb-3 text-center text-xs text-dim">{variant === 'letters' ? t('cogito.alphaHintLetters') : t('cogito.alphaHintWords')}</p>
      <input autoCapitalize="off" autoCorrect="off" spellCheck={false}
        autoFocus
        value={value}
       
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="mx-auto block w-full max-w-lg rounded-xl border border-line bg-void/60 px-4 py-3 text-center font-mono text-2xl tracking-widest text-white focus:border-violet focus:outline-none"
      />
    </Stage>
  );
}
