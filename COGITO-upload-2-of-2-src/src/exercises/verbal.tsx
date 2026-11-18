import { useMemo, useRef, useState } from 'react';
import type { ExProps, ExOutcome } from './types';
import { useI18n } from '../i18n';
import { genRecognition, genSemanticList, genWordList } from '../core/generate';
import { LEXICON, wordItem, wordText } from '../content';
import { encodingEfficiency, scoreFreeRecall, scoreRecognition, type RecognitionResponse } from '../core/scoring';
import { retention } from '../core/scheduler';
import { Fixation, FreeRecall, Stage, Ticker, WordGrid } from './shared';
import { Button, Kbd, useKey } from '../ui/kit';
import { realClock } from '../core/timer';
import { round } from '../core/stats';

function recallReview(t: (k: string) => string, ids: string[], recalled: string[], intrusions: string[], lang: 'en' | 'pt') {
  return [
    { label: t('feedback.recalled'), tone: 'ok' as const, items: recalled.map((id) => wordText(id, lang)) },
    { label: t('feedback.missed'), tone: 'warn' as const, items: ids.filter((id) => !recalled.includes(id)).map((id) => wordText(id, lang)) },
    { label: t('feedback.intruded'), tone: 'bad' as const, items: intrusions },
  ];
}

/** A1 Word List Learning and A2 Semantic Organisation share the same study → free-recall flow. */
export function WordListExercise({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const semantic = ctx.exerciseId === 'A2';
  const spec = useMemo(() => {
    if (ctx.fixed?.ids) return { ids: ctx.fixed.ids as string[], categories: [] as string[] };
    if (semantic) return genSemanticList(ctx.seed, ctx.params.categories, ctx.params.perCategory);
    return { ...genWordList(ctx.seed, ctx.params.items, ctx.recent), categories: [] as string[] };
  }, [ctx.seed]);
  const encodingMs = (ctx.fixed?.encodingMs as number | undefined) ?? Math.round(spec.ids.length * ctx.settings.secondsPerWord * 1000);
  const [phase, setPhase] = useState<'fix' | 'study' | 'recall'>('fix');
  const words = spec.ids.map((id) => wordText(id, ctx.lang));

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study') return <WordGrid words={words} ms={encodingMs} onDone={() => setPhase('recall')} label={`${t('common.memorize')} · ${words.length}`} />;
  return (
    <FreeRecall
      onSubmit={(entries) => {
        const items = spec.ids.map(wordItem);
        const s = scoreFreeRecall(items, entries, ctx.settings.typoTolerance, LEXICON);
        const eff = encodingEfficiency(s.correct, encodingMs);
        const out: ExOutcome = {
          accuracy: s.accuracy,
          metrics: {
            studied: s.studied,
            correct: s.correct,
            omissions: s.omissions,
            repetitions: s.repetitions,
            intrusions: s.intrusions,
            efficiency: eff === null ? null : round(eff),
            ...(semantic ? { arc: s.arc === null ? null : round(s.arc) } : {}),
          },
          conditionKey: semantic
            ? `A2|c=${ctx.params.categories}|p=${ctx.params.perCategory}|enc=${encodingMs}`
            : `A1|n=${spec.ids.length}|enc=${encodingMs}`,
          encodingMs,
          itemIds: spec.ids,
          detail: { entries, recalledIds: s.recalledIds },
          review: recallReview(t, spec.ids, s.recalledIds, s.intrusionList, ctx.lang),
          probe: { kind: 'wordList', payload: { ids: spec.ids, immediateCorrect: s.correct } },
        };
        onDone(out);
      }}
    />
  );
}

/** Delayed free recall of a previously studied list (probe payload). */
export function DelayedWordRecall({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const payload = ctx.fixed as { ids: string[]; immediateCorrect: number };
  return (
    <FreeRecall
      prompt={`${t('phase.delayed')} · ${t(`ex.${ctx.exerciseId}.name`)} — ${t('phase.recallPrompt')}`}
      onSubmit={(entries) => {
        const s = scoreFreeRecall(payload.ids.map(wordItem), entries, ctx.settings.typoTolerance, LEXICON);
        const r = retention(payload.immediateCorrect, s.correct);
        onDone({
          accuracy: s.accuracy,
          metrics: { studied: s.studied, correct: s.correct, immediate: payload.immediateCorrect, retention: r === null ? null : round(r), intrusions: s.intrusions, repetitions: s.repetitions },
          conditionKey: `${ctx.exerciseId}-delayed|n=${payload.ids.length}`,
          itemIds: payload.ids,
          detail: { entries },
          review: recallReview(t, payload.ids, s.recalledIds, s.intrusionList, ctx.lang),
        });
      }}
    />
  );
}

/** A3 Recognition memory: sequential study, then old/new judgements with RTs. */
export function RecognitionExercise({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const spec = useMemo(() => genRecognition(ctx.seed, ctx.params.items, ctx.params.similarity), [ctx.seed]);
  const perItem = ctx.settings.secondsPerWord * 1000;
  const [phase, setPhase] = useState<'fix' | 'study' | 'test'>('fix');
  const [i, setI] = useState(0);
  const responses = useRef<RecognitionResponse[]>([]);
  const shownAt = useRef(0);

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study')
    return (
      <SequentialWords
        words={spec.studied.map((id) => wordText(id, ctx.lang))}
        ms={perItem}
        onDone={() => {
          setPhase('test');
          shownAt.current = realClock.now();
        }}
      />
    );

  const item = spec.test[i];
  const answer = (saidOld: boolean) => {
    responses.current.push({ id: item.id, old: item.old, saidOld, rtMs: Math.round(realClock.now() - shownAt.current) });
    if (i + 1 < spec.test.length) {
      setI(i + 1);
      shownAt.current = realClock.now();
      return;
    }
    const s = scoreRecognition(responses.current);
    const fa = responses.current.filter((r) => !r.old && r.saidOld).map((r) => wordText(r.id, ctx.lang));
    const missed = responses.current.filter((r) => r.old && !r.saidOld).map((r) => wordText(r.id, ctx.lang));
    onDone({
      accuracy: s.accuracy,
      metrics: {
        hits: s.hits,
        misses: s.misses,
        falseAlarms: s.falseAlarms,
        correctRejections: s.correctRejections,
        hitRate: round(s.hitRate),
        falseAlarmRate: round(s.falseAlarmRate),
        dPrime: s.dPrime === null ? null : round(s.dPrime),
        dPrimeCorrected: round(s.dPrimeCorrected),
        meanRtMs: s.meanRtMs === null ? null : Math.round(s.meanRtMs),
      },
      conditionKey: `A3|n=${ctx.params.items}|sim=${ctx.params.similarity}|enc=${perItem}`,
      encodingMs: perItem * spec.studied.length,
      itemIds: spec.test.map((x) => x.id),
      detail: { responses: responses.current },
      review: [
        { label: t('metric.misses'), tone: 'warn', items: missed },
        { label: t('metric.falseAlarms'), tone: 'bad', items: fa },
      ],
    });
  };
  return <OldNew key={i} label={wordText(item.id, ctx.lang)} progress={`${i + 1} / ${spec.test.length}`} onAnswer={answer} prompt={t('recog.prompt')} />;
}

export function OldNew({ label, onAnswer, progress, prompt, children }: { label?: string; onAnswer: (old: boolean) => void; progress: string; prompt: string; children?: React.ReactNode }) {
  const { t } = useI18n();
  useKey(['s', 'n'], (e) => onAnswer(e.key.toLowerCase() === 's'));
  return (
    <Stage title={`${prompt} · ${progress}`}>
      <div className="flex min-h-[140px] items-center justify-center">{children ?? <div className="text-4xl font-semibold text-white">{label}</div>}</div>
      <div className="mt-6 flex justify-center gap-4">
        <Button onClick={() => onAnswer(true)} className="min-w-[140px]">
          {t('common.old')} <Kbd>S</Kbd>
        </Button>
        <Button variant="ghost" onClick={() => onAnswer(false)} className="min-w-[140px]">
          {t('common.new')} <Kbd>N</Kbd>
        </Button>
      </div>
    </Stage>
  );
}

/** Presents words one at a time with a short blank between them. */
export function SequentialWords({ words, ms, onDone, gapMs = 250 }: { words: string[]; ms: number; onDone: () => void; gapMs?: number }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [blank, setBlank] = useState(false);
  return (
    <Stage title={`${t('common.memorize')} · ${Math.min(i + 1, words.length)} / ${words.length}`}>
      <div className="flex min-h-[160px] items-center justify-center text-4xl font-semibold text-white">{blank ? '' : words[i]}</div>
      <Ticker
        key={`${i}-${blank}`}
        ms={blank ? gapMs : ms}
        onDone={() => {
          if (!blank) setBlank(true);
          else if (i + 1 < words.length) {
            setBlank(false);
            setI(i + 1);
          } else onDone();
        }}
      />
    </Stage>
  );
}
