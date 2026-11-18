import { useMemo, useRef, useState } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { genFaceNames, genObjectLocation, genPairs } from '../core/generate';
import { createRng } from '../core/rng';
import { LEXICON, WORDS, wordItem, wordText } from '../content';
import { OBJECTS } from '../content/visual';
import { scoreCuedRecall } from '../core/scoring';
import { retention } from '../core/scheduler';
import { round } from '../core/stats';
import { Fixation, Stage, Ticker } from './shared';
import { Button, Kbd, cx, useKey } from '../ui/kit';
import { Face } from '../ui/visuals';
import { realClock } from '../core/timer';

export type Pair = { cue: string; target: string };

/** Sequential presentation of word pairs. */
export function PairStudy({ pairs, ms, lang, hint, onDone }: { pairs: Pair[]; ms: number; lang: 'en' | 'pt'; hint?: string; onDone: () => void }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [blank, setBlank] = useState(false);
  const p = pairs[i];
  return (
    <Stage title={`${t('common.memorize')} · ${i + 1} / ${pairs.length}`}>
      <div className="flex min-h-[150px] items-center justify-center gap-6 text-3xl font-semibold text-white sm:text-4xl">
        {!blank && (
          <>
            <span>{wordText(p.cue, lang)}</span>
            <span className="text-violet">—</span>
            <span>{wordText(p.target, lang)}</span>
          </>
        )}
      </div>
      {hint && <p className="text-center text-sm text-volt">{hint}</p>}
      <Ticker
        key={`${i}-${blank}`}
        ms={blank ? 300 : ms}
        onDone={() => {
          if (!blank) setBlank(true);
          else if (i + 1 < pairs.length) {
            setBlank(false);
            setI(i + 1);
          } else onDone();
        }}
      />
    </Stage>
  );
}

/** Cued recall: show each cue, type the target. Enter moves on. */
export function CuedRecall({ pairs, lang, onDone, title, numeric = false }: { pairs: Pair[]; lang: 'en' | 'pt'; onDone: (responses: string[], rts: number[]) => void; title?: string; numeric?: boolean }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const responses = useRef<string[]>([]);
  const rts = useRef<number[]>([]);
  const shown = useRef(realClock.now());
  const next = () => {
    responses.current[i] = value;
    rts.current[i] = Math.round(realClock.now() - shown.current);
    if (i + 1 < pairs.length) {
      setI(i + 1);
      setValue('');
      shown.current = realClock.now();
    } else onDone(responses.current, rts.current);
  };
  return (
    <Stage title={`${title ?? t('pairs.prompt')} · ${i + 1} / ${pairs.length}`} footer={<Button onClick={next}>{t('common.next')} <Kbd>Enter</Kbd></Button>}>
      <div className="mb-5 text-center text-4xl font-semibold text-white">{wordText(pairs[i].cue, lang)}</div>
      <input
        inputMode={numeric ? 'numeric' : undefined}
        pattern={numeric ? '[0-9]*' : undefined} autoCapitalize="off" autoCorrect="off" spellCheck={false}
        key={i}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && next()}
        autoComplete="off"
        className="mx-auto block w-full max-w-sm rounded-xl border border-line bg-void/60 px-4 py-3 text-center text-xl text-white focus:border-violet focus:outline-none"
      />
      <p className="mt-2 text-center text-xs text-dim">{t('pairs.hint')}</p>
    </Stage>
  );
}

function scorePairs(pairs: Pair[], responses: string[], tolerance: boolean) {
  return scoreCuedRecall(pairs.map((p) => wordItem(p.target)), responses, tolerance, LEXICON);
}

/** B1 Paired associates (also used by the assessment and the imagery strategy). */
export function PairedAssociates({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const pairs = useMemo<Pair[]>(() => (ctx.fixed?.pairs as Pair[] | undefined) ?? genPairs(ctx.seed, ctx.params.pairs, ctx.recent).pairs, [ctx.seed]);
  const testOrder = useMemo(() => createRng(ctx.seed + ':test').shuffle(pairs), [pairs]);
  const ms = (ctx.fixed?.pairMs as number | undefined) ?? ctx.settings.secondsPerWord * 2000;
  const [phase, setPhase] = useState<'fix' | 'study' | 'test'>('fix');
  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study')
    return <PairStudy pairs={pairs} ms={ms} lang={ctx.lang} hint={ctx.strategy === 'imagery' ? t('strategies.imagery.prompt') : undefined} onDone={() => setPhase('test')} />;
  return (
    <CuedRecall
      pairs={testOrder}
      lang={ctx.lang}
      onDone={(responses, rts) => {
        const s = scorePairs(testOrder, responses, ctx.settings.typoTolerance);
        onDone({
          accuracy: s.accuracy,
          metrics: { studied: pairs.length, correct: s.correct, omissions: s.omissions, intrusions: s.intrusions, meanRtMs: Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) },
          conditionKey: `B1|n=${pairs.length}|enc=${ms}`,
          encodingMs: ms * pairs.length,
          itemIds: pairs.flatMap((p) => [p.cue, p.target]),
          detail: { responses, order: testOrder },
          review: [
            { label: t('feedback.recalled'), tone: 'ok', items: testOrder.filter((_, i) => s.perItem[i]).map((p) => `${wordText(p.cue, ctx.lang)} — ${wordText(p.target, ctx.lang)}`) },
            { label: t('feedback.missed'), tone: 'warn', items: testOrder.filter((_, i) => !s.perItem[i]).map((p) => `${wordText(p.cue, ctx.lang)} — ${wordText(p.target, ctx.lang)}`) },
          ],
          probe: { kind: 'wordList', payload: { pairs, immediateCorrect: s.correct } },
        });
      }}
    />
  );
}

export function DelayedPairs({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const payload = ctx.fixed as { pairs: Pair[]; immediateCorrect: number };
  const order = useMemo(() => createRng(ctx.seed).shuffle(payload.pairs), []);
  return (
    <CuedRecall
      pairs={order}
      lang={ctx.lang}
      title={`${t('phase.delayed')} · ${t('ex.B1.name')}`}
      onDone={(responses) => {
        const s = scorePairs(order, responses, ctx.settings.typoTolerance);
        const r = retention(payload.immediateCorrect, s.correct);
        onDone({
          accuracy: s.accuracy,
          metrics: { studied: order.length, correct: s.correct, immediate: payload.immediateCorrect, retention: r === null ? null : round(r), intrusions: s.intrusions },
          conditionKey: `B1-delayed|n=${order.length}`,
          itemIds: order.flatMap((p) => [p.cue, p.target]),
          review: [{ label: t('feedback.missed'), tone: 'warn', items: order.filter((_, i) => !s.perItem[i]).map((p) => `${wordText(p.cue, ctx.lang)} — ${wordText(p.target, ctx.lang)}`) }],
        });
      }}
    />
  );
}

/** B2 Face–name association with procedurally generated fictional faces. */
export function FaceName({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const spec = useMemo(() => genFaceNames(ctx.seed, ctx.params.faces), [ctx.seed]);
  const names = WORDS[ctx.lang].names;
  const ms = 4000;
  const [phase, setPhase] = useState<'fix' | 'study' | 'test'>('fix');
  const [i, setI] = useState(0);
  const [blank, setBlank] = useState(false);
  const answers = useRef<boolean[]>([]);
  const errors = useRef<string[]>([]);

  const answer = (choice: number) => {
    const q = spec.test[i];
    const face = spec.faces.find((f) => f.id === q.id)!;
    const ok = q.options[choice] === face.name;
    answers.current.push(ok);
    if (!ok) errors.current.push(`${names[q.options[choice]]} → ${names[face.name]}`);
    if (i + 1 < spec.test.length) setI(i + 1);
    else {
      const correct = answers.current.filter(Boolean).length;
      onDone({
        accuracy: correct / spec.faces.length,
        metrics: { studied: spec.faces.length, correct, intrusions: spec.faces.length - correct },
        conditionKey: `B2|n=${spec.faces.length}|enc=${ms}`,
        encodingMs: ms * spec.faces.length,
        review: [{ label: t('feedback.missed'), tone: 'warn', items: errors.current }],
      });
    }
  };
  useKey(['1', '2', '3', '4'], (e) => phase === 'test' && Number(e.key) <= spec.test[i].options.length && answer(Number(e.key) - 1), phase === 'test');

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study') {
    const f = spec.faces[i];
    return (
      <Stage title={`${t('common.memorize')} · ${i + 1} / ${spec.faces.length}`}>
        <div className="flex min-h-[230px] flex-col items-center justify-center gap-4">
          {!blank && (
            <>
              <Face p={f.face} size={180} />
              <div className="text-3xl font-semibold text-white">{names[f.name]}</div>
            </>
          )}
        </div>
        <Ticker
          key={`${i}-${blank}`}
          ms={blank ? 300 : ms}
          onDone={() => {
            if (!blank) setBlank(true);
            else if (i + 1 < spec.faces.length) {
              setBlank(false);
              setI(i + 1);
            } else {
              setI(0);
              setPhase('test');
            }
          }}
        />
      </Stage>
    );
  }
  const q = spec.test[i];
  const face = spec.faces.find((f) => f.id === q.id)!;
  return (
    <Stage title={`${t('faces.prompt')} · ${i + 1} / ${spec.test.length}`}>
      <div className="flex justify-center">
        <Face p={face.face} size={180} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {q.options.map((n, k) => (
          <Button key={k} variant="ghost" onClick={() => answer(k)} className="py-3 text-lg">
            <Kbd>{k + 1}</Kbd> {names[n]}
          </Button>
        ))}
      </div>
    </Stage>
  );
}

/** B3 Object–location binding: recognition is measured separately from location accuracy. */
export function ObjectLocation({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const spec = useMemo(() => genObjectLocation(ctx.seed, ctx.params.objects, 4, ctx.recent), [ctx.seed]);
  const studyMs = 1500 * spec.placed.length + 2000;
  const [phase, setPhase] = useState<'fix' | 'study' | 'delay' | 'recog' | 'place'>('fix');
  const [selected, setSelected] = useState<string[]>([]);
  const [placing, setPlacing] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Record<string, number>>({});
  const obj = (id: string) => OBJECTS.find((o) => o.id === id)!;
  const n = spec.gridSize;

  const grid = (content: (cell: number) => React.ReactNode, onCell?: (c: number) => void) => (
    <div className="mx-auto grid max-w-md gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {Array.from({ length: n * n }, (_, c) => (
        <button
          key={c}
          type="button"
          disabled={!onCell}
          onClick={() => onCell?.(c)}
          className="flex aspect-square items-center justify-center rounded-xl border border-line bg-panel2/60 text-4xl transition enabled:hover:border-violet"
        >
          {content(c)}
        </button>
      ))}
    </div>
  );

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study')
    return (
      <Stage title={`${t('common.memorize')} · ${spec.placed.length}`}>
        {grid((c) => {
          const p = spec.placed.find((x) => x.cell === c);
          return p ? <span aria-label={obj(p.id)[ctx.lang]}>{obj(p.id).emoji}</span> : null;
        })}
        <Ticker ms={studyMs} onDone={() => setPhase('delay')} />
      </Stage>
    );
  if (phase === 'delay')
    return (
      <Stage title="…">
        <div className="py-16 text-center text-dim">{t('common.ready')}</div>
        <Ticker ms={3000} onDone={() => setPhase('recog')} />
      </Stage>
    );
  if (phase === 'recog')
    return (
      <Stage title={t('objloc.phase1')} footer={<Button onClick={() => setPhase('place')}>{t('common.continue')}</Button>}>
        <p className="mb-4 text-center text-xs text-dim">{t('objloc.phase1Hint')}</p>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {spec.recognition.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={selected.includes(id)}
              onClick={() => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
              className={cx('flex aspect-square flex-col items-center justify-center rounded-xl border text-4xl transition', selected.includes(id) ? 'border-violet bg-violet/20 shadow-neon' : 'border-line bg-panel2/60')}
            >
              {obj(id).emoji}
              <span className="mt-1 text-[10px] text-dim">{obj(id)[ctx.lang]}</span>
            </button>
          ))}
        </div>
      </Stage>
    );

  const finish = () => {
    const studiedIds = spec.placed.map((p) => p.id);
    const hits = selected.filter((id) => studiedIds.includes(id));
    const falseAlarms = selected.length - hits.length;
    const correctPlaced = hits.filter((id) => placement[id] === spec.placed.find((p) => p.id === id)!.cell).length;
    const recognition = Math.max(0, (hits.length - falseAlarms) / studiedIds.length);
    const association = hits.length ? correctPlaced / hits.length : null;
    onDone({
      accuracy: correctPlaced / studiedIds.length,
      metrics: { studied: studiedIds.length, hits: hits.length, falseAlarms, recognition: round(recognition), association: association === null ? null : round(association), correct: correctPlaced },
      conditionKey: `B3|n=${studiedIds.length}|grid=${n}`,
      encodingMs: studyMs,
      itemIds: spec.recognition.map((id) => `obj:${id}`),
      detail: { selected, placement },
      review: [
        { label: t('feedback.missed'), tone: 'warn', items: studiedIds.filter((id) => !selected.includes(id)).map((id) => obj(id).emoji + ' ' + obj(id)[ctx.lang]) },
        { label: t('metric.falseAlarms'), tone: 'bad', items: selected.filter((id) => !studiedIds.includes(id)).map((id) => obj(id).emoji + ' ' + obj(id)[ctx.lang]) },
      ],
    });
  };

  const unplaced = selected.filter((id) => placement[id] === undefined);
  return (
    <Stage title={t('objloc.phase2')} footer={<Button onClick={finish}>{t('common.submit')}</Button>}>
      <p className="mb-4 text-center text-xs text-dim">{t('objloc.phase2Hint')}</p>
      <div className="mb-4 flex min-h-[56px] flex-wrap justify-center gap-2">
        {unplaced.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPlacing(id)}
            className={cx('rounded-xl border px-3 py-1 text-3xl', placing === id ? 'border-volt bg-volt/20 shadow-volt' : 'border-line bg-panel2')}
          >
            {obj(id).emoji}
          </button>
        ))}
      </div>
      {grid(
        (c) => {
          const id = Object.keys(placement).find((k) => placement[k] === c);
          return id ? obj(id).emoji : null;
        },
        (c) => {
          const existing = Object.keys(placement).find((k) => placement[k] === c);
          if (existing) {
            const { [existing]: _, ...rest } = placement;
            setPlacement(rest);
            return;
          }
          if (placing) {
            setPlacement({ ...placement, [placing]: c });
            setPlacing(null);
          }
        },
      )}
    </Stage>
  );
}
