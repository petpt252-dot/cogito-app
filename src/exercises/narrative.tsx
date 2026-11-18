import { useMemo, useRef, useState } from 'react';
import type { ExProps, ExOutcome } from './types';
import type { Lang } from '../core/types';
import { useI18n } from '../i18n';
import { EVENTS, story as getStory } from '../content';
import { genEvents, genStoryChoice } from '../core/generate';
import { createRng } from '../core/rng';
import { autoCreditUnits, numberIntrusions, summarizeStory, type Story } from '../core/story';
import { pairwiseOrderScore, round, serialPositionScore } from '../core/stats';
import { retention } from '../core/scheduler';
import { Distractor, Fixation, Stage, Ticker, useStopwatch } from './shared';
import { Badge, Button, NumberInput, cx } from '../ui/kit';
import { PatternMemory } from './visual';

/** Click-to-order list. Returns ids in the chosen order. */
export function OrderPicker({ items, title, onSubmit }: { items: { id: string; label: string }[]; title: string; onSubmit: (ids: string[]) => void }) {
  const { t } = useI18n();
  const [order, setOrder] = useState<string[]>([]);
  return (
    <Stage
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOrder([])}>{t('common.clear')}</Button>
          <Button onClick={() => onSubmit(order)} disabled={order.length !== items.length}>{t('common.submit')}</Button>
        </>
      }
    >
      <p className="mb-4 text-center text-xs text-dim">{t('events.hint')}</p>
      <div className="flex flex-col gap-2">
        {items.map((it) => {
          const idx = order.indexOf(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setOrder((o) => (o.includes(it.id) ? o.filter((x) => x !== it.id) : [...o, it.id]))}
              className={cx('flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition', idx >= 0 ? 'border-violet bg-violet/15' : 'border-line bg-panel2/60 hover:border-violet/60')}
            >
              <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-sm', idx >= 0 ? 'bg-volt text-void' : 'border border-line text-dim')}>
                {idx >= 0 ? idx + 1 : '·'}
              </span>
              <span className="text-white">{it.label}</span>
            </button>
          );
        })}
      </div>
    </Stage>
  );
}

type StoryScore = ReturnType<typeof summarizeStory> & { numberIntrusions: number; text: string; keywordHints?: number };

/** Write → rubric review. Shared by D1, D3 and the delayed story probe. */
function StoryRecallSteps({ story, onScored, title }: { story: Story; onScored: (s: StoryScore) => void; title?: string }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<'write' | 'review'>('write');
  const [text, setText] = useState('');
  const [credits, setCredits] = useState<Record<string, boolean>>({});
  // Keyword matches are only hints (they cannot read negation or who did what), so nothing starts ticked.
  const [hints, setHints] = useState<Record<string, boolean>>({});
  const [intrusions, setIntrusions] = useState(0);
  const numIntr = useMemo(() => numberIntrusions(story, text), [text]);

  if (phase === 'write')
    return (
      <Stage
        title={title ?? t('story.write')}
        footer={
          <Button
            onClick={() => {
              setHints(autoCreditUnits(story, text));
              setCredits({});
              setIntrusions(numberIntrusions(story, text).length);
              setPhase('review');
            }}
          >
            {t('common.submit')}
          </Button>
        }
      >
        <p className="mb-3 text-center text-xs text-dim">{t('story.writeHint')}</p>
        <textarea autoCapitalize="off" autoCorrect="off" spellCheck={false}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-72 w-full resize-none rounded-xl border border-line bg-void/60 p-4 text-white focus:border-violet focus:outline-none"
        />
      </Stage>
    );

  return (
    <Stage
      title={t('story.reviewTitle')}
      wide
      footer={<Button onClick={() => onScored({ ...summarizeStory(story, credits, intrusions), numberIntrusions: numIntr.length, text, keywordHints: Object.values(hints).filter(Boolean).length })}>{t('common.confirm')}</Button>}
    >
      <p className="mb-4 text-center text-xs text-dim">{t('story.reviewHint')}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-void/50 p-4 text-sm text-ink">{text || '—'}</div>
        <div className="flex max-h-[420px] flex-col gap-1.5 overflow-auto pr-1">
          {story.units.map((u) => (
            <label key={u.id} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm', credits[u.id] ? 'border-ok/50 bg-ok/10' : 'border-line bg-panel2/50')}>
              <input type="checkbox" className="mt-1 accent-violet" checked={!!credits[u.id]} onChange={(e) => setCredits({ ...credits, [u.id]: e.target.checked })} />
              <span className="flex-1 text-white">{u.text}</span>
              {hints[u.id] && !credits[u.id] && <Badge tone="dim">{t('story.keywordHint')}</Badge>}
              <Badge tone={u.main ? 'violet' : 'dim'}>{u.main ? t('story.main') : t('story.detail')}</Badge>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-ink">
        {t('story.intrusionsLabel')}
        <NumberInput value={intrusions} onChange={setIntrusions} min={0} max={50} />
        {numIntr.length > 0 && <Badge tone="warn">{t('metric.numberIntrusions')}: {numIntr.join(', ')}</Badge>}
      </div>
    </Stage>
  );
}

function storyMetrics(s: StoryScore) {
  return {
    unitsRecalled: s.unitsRecalled,
    mainIdeas: s.mainIdeas,
    details: s.details,
    omissions: s.omissions,
    intrusions: s.intrusions,
    numberIntrusions: s.numberIntrusions,
  };
}

function StoryRead({ story, onDone }: { story: Story; onDone: (ms: number) => void }) {
  const { t } = useI18n();
  const sw = useStopwatch();
  return (
    <Stage title={`${t('story.read')} · ${story.title}`} footer={<Button onClick={() => onDone(sw.elapsed())}>{t('common.continue')}</Button>}>
      <p className="mb-4 text-center text-xs text-dim">{t('story.readHint')}</p>
      <p className="text-lg leading-relaxed text-white">{story.text}</p>
    </Stage>
  );
}

function storyOrderItems(story: Story, seed: string) {
  return createRng(seed + ':ord').shuffle(story.events.map((label, i) => ({ id: String(i), label })));
}

/** D1 Story recall: read (self-paced) → free recall → rubric review → temporal order. */
export function StoryRecall({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const storyId = useMemo(() => (ctx.fixed?.storyId as string | undefined) ?? genStoryChoice(ctx.seed, ctx.params.tier, ctx.recent).storyId, [ctx.seed]);
  const story = getStory(storyId, ctx.lang);
  const [phase, setPhase] = useState<'read' | 'recall' | 'order'>('read');
  const readMs = useRef(0);
  const score = useRef<StoryScore | null>(null);

  if (phase === 'read') return <StoryRead story={story} onDone={(ms) => ((readMs.current = ms), setPhase('recall'))} />;
  if (phase === 'recall') return <StoryRecallSteps story={story} onScored={(s) => ((score.current = s), setPhase('order'))} />;
  return (
    <OrderPicker
      title={t('story.orderTitle')}
      items={storyOrderItems(story, ctx.seed)}
      onSubmit={(ids) => {
        const s = score.current!;
        const truth = story.events.map((_, i) => String(i));
        const order = pairwiseOrderScore(truth, ids);
        const out: ExOutcome = {
          accuracy: s.accuracy,
          metrics: { ...storyMetrics(s), temporalOrder: round(order), exact: round(serialPositionScore(truth, ids)) },
          conditionKey: `D1|story=${story.id}`,
          encodingMs: readMs.current,
          itemIds: [`story:${story.id}`],
          detail: { text: s.text, order: ids },
          probe: { kind: 'story', payload: { storyId: story.id, immediateUnits: s.unitsRecalled }, exerciseId: 'D3' },
        };
        onDone(out);
      }}
    />
  );
}

/** Delayed story probe (from a D1 block earlier in the session or earlier today). */
export function DelayedStory({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const payload = ctx.fixed as { storyId: string; immediateUnits: number };
  const story = getStory(payload.storyId, ctx.lang);
  return (
    <StoryRecallSteps
      story={story}
      title={`${t('phase.delayed')} · ${story.title}`}
      onScored={(s) => {
        const r = retention(payload.immediateUnits, s.unitsRecalled);
        onDone({
          accuracy: s.accuracy,
          metrics: { ...storyMetrics(s), immediate: payload.immediateUnits, delayed: s.unitsRecalled, retention: r === null ? null : round(r) },
          conditionKey: `D3|story=${story.id}`,
          itemIds: [`story:${story.id}`],
          detail: { text: s.text },
        });
      }}
    />
  );
}

/** D3 standalone: immediate recall → intervening pattern task → delayed recall → comparison. */
export function DelayedNarrative({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const storyId = useMemo(() => genStoryChoice(ctx.seed, ctx.params.tier, ctx.recent).storyId, [ctx.seed]);
  const story = getStory(storyId, ctx.lang);
  const [phase, setPhase] = useState<'read' | 'immediate' | 'intervening' | 'delayed'>('read');
  const readMs = useRef(0);
  const imm = useRef<StoryScore | null>(null);
  const interveningAcc = useRef<number | null>(null);

  if (phase === 'read') return <StoryRead story={story} onDone={(ms) => ((readMs.current = ms), setPhase('immediate'))} />;
  if (phase === 'immediate')
    return <StoryRecallSteps story={story} title={`${t('metric.immediate')} · ${t('story.write')}`} onScored={(s) => ((imm.current = s), setPhase('intervening'))} />;
  if (phase === 'intervening')
    return (
      <div>
        <p className="mb-3 text-center text-sm text-dim">{t('phase.distractor')}</p>
        <PatternMemory
          ctx={{ ...ctx, exerciseId: 'C1', params: { size: 4, cells: 5 }, seed: ctx.seed + ':int' }}
          onDone={(o) => {
            interveningAcc.current = o.accuracy;
            setPhase('delayed');
          }}
        />
      </div>
    );
  return (
    <StoryRecallSteps
      story={story}
      title={`${t('metric.delayed')} · ${t('story.write')}`}
      onScored={(s) => {
        const i = imm.current!;
        const r = retention(i.unitsRecalled, s.unitsRecalled);
        onDone({
          accuracy: s.accuracy,
          metrics: { immediate: i.unitsRecalled, delayed: s.unitsRecalled, retention: r === null ? null : round(r), mainIdeas: s.mainIdeas, details: s.details, intrusions: s.intrusions },
          conditionKey: `D3|story=${story.id}|intervening=C1-4x5`,
          encodingMs: readMs.current,
          itemIds: [`story:${story.id}`],
          detail: { immediateText: i.text, delayedText: s.text, interveningAccuracy: interveningAcc.current },
        });
      }}
    />
  );
}

export const EVENT_MS = 2500;
export const EVENT_DELAY_MS = 8000;

/** D2 Event sequence reconstruction. Events are arbitrary, so order cannot be inferred from scripts. */
export function EventSequence({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const spec = useMemo(() => genEvents(ctx.seed, ctx.params.events, ctx.recent), [ctx.seed]);
  const label = (i: number, lang: Lang) => EVENTS[lang][i];
  const [phase, setPhase] = useState<'fix' | 'study' | 'delay' | 'order'>('fix');
  const [i, setI] = useState(0);
  const [blank, setBlank] = useState(false);

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study')
    return (
      <Stage title={`${t('common.memorize')} · ${i + 1} / ${spec.order.length}`}>
        <div className="flex min-h-[140px] items-center justify-center text-center text-2xl font-medium text-white">{!blank && label(spec.order[i], ctx.lang)}</div>
        <Ticker
          key={`${i}-${blank}`}
          ms={blank ? 300 : EVENT_MS}
          onDone={() => {
            if (!blank) setBlank(true);
            else if (i + 1 < spec.order.length) {
              setBlank(false);
              setI(i + 1);
            } else setPhase('delay');
          }}
        />
      </Stage>
    );
  if (phase === 'delay') return <Distractor ms={EVENT_DELAY_MS} seedNumber={createRng(ctx.seed).int(60, 99)} onDone={() => setPhase('order')} />;
  return (
    <OrderPicker
      title={t('events.prompt')}
      items={spec.shuffled.map((id) => ({ id: String(id), label: label(id, ctx.lang) }))}
      onSubmit={(ids) => {
        const truth = spec.order.map(String);
        const exact = serialPositionScore(truth, ids);
        onDone({
          accuracy: exact,
          metrics: { exact: round(exact), pairwise: round(pairwiseOrderScore(truth, ids)) },
          conditionKey: `D2|n=${truth.length}|enc=${EVENT_MS}|delay=${EVENT_DELAY_MS}`,
          encodingMs: EVENT_MS * truth.length,
          itemIds: truth.map((x) => `event:${x}`),
          detail: { order: ids },
        });
      }}
    />
  );
}
