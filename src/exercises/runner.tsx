import { useEffect, useRef, useState, type ComponentType } from 'react';
import { nextStairValue, staircaseParams, stairValue, STAIRCASE_KEY, STAIRS, type StairState } from '../core/staircase';
import { FAITHFUL_COMPONENTS } from './faithfulRegistry';
import type { LevelParams } from '../core/levels';
import { recentExposure } from '../core/exposure';
import { slotGate } from '../core/protocol';
import { TimingGuard } from './guard';
import type { ExCtx, ExOutcome, ExProps } from './types';
import type { AdaptiveState, DelayedProbe, ExerciseId, Lang, Mode, StrategyId, TrialResult } from '../core/types';
import { EXERCISES, adaptiveKey } from './registry';
import { adapt, initialState, paramsFor, type AdaptDecision } from '../core/adaptive';
import { db, uid } from '../core/storage';
import { createProbe, MINUTE } from '../core/scheduler';
import { useApp } from '../state';
import { useI18n, LANG_NAMES } from '../i18n';
import { Badge, Button, Kbd, Stat, num, pct, useKey, Segmented } from '../ui/kit';
import { Stage } from './shared';
import { BlockClockContext, createBlockClock } from './stall';
import { saveBlock } from '../core/sessionProgress';
import { DelayedWordRecall } from './verbal';
import { DelayedPairs } from './associative';
import { DelayedStory } from './narrative';

const PERCENT_METRICS = new Set(['accuracy', 'hitRate', 'falseAlarmRate', 'recognition', 'association', 'exact', 'pairwise', 'temporalOrder', 'retention', 'itemAccuracy', 'orderAccuracy', 'posAccuracy', 'letterAccuracy']);

export function MetricGrid({ metrics }: { metrics: Record<string, number | null> }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {Object.entries(metrics).map(([k, v]) => (
        <Stat key={k} label={t(`metric.${k}`)} value={PERCENT_METRICS.has(k) ? pct(v) : num(v)} />
      ))}
    </div>
  );
}

export function Feedback({ outcome, decision, level, onNext, onFinish, nextLabel, note }: { outcome: ExOutcome; decision?: AdaptDecision; level?: number; onNext?: () => void; onFinish?: () => void; nextLabel?: string; note?: string }) {
  const { t } = useI18n();
  useKey(['Enter'], () => (onNext ?? onFinish)?.());
  const m = outcome.metrics;
  return (
    <Stage
      title={t('feedback.title')}
      wide
      footer={
        <>
          {onNext && (
            <Button onClick={onNext} autoFocus>
              {nextLabel ?? t('common.nextBlock')} <Kbd>Enter</Kbd>
            </Button>
          )}
          {onFinish && (
            <Button variant={onNext ? 'ghost' : 'primary'} onClick={onFinish} autoFocus={!onNext}>
              {onNext ? t('common.endPractice') : t('common.continue')}
            </Button>
          )}
        </>
      }
    >
      {note && <p className="mb-4 rounded-xl border border-volt/30 bg-volt/5 p-3 text-center text-sm text-volt">{note}</p>}
      <div className="mb-5 text-center">
        <div className="font-mono text-5xl text-white">{pct(outcome.accuracy)}</div>
        <div className="mt-1 text-xs uppercase tracking-widest text-dim">{t('common.accuracy')}</div>
        {decision && level !== undefined && (
          <div className="mt-3">
            <Badge tone={decision === 'up' ? 'ok' : decision === 'down' ? 'warn' : 'dim'}>{t(`feedback.${decision}`, { l: level })}</Badge>
          </div>
        )}
      </div>
      <MetricGrid metrics={m} />
      {'dPrime' in m && m.dPrime === null && <p className="mt-3 text-xs text-dim">{t('feedback.defined')}</p>}
      {'efficiency' in m && <p className="mt-3 text-xs text-dim">{t('feedback.efficiencyNote')}</p>}
      {outcome.review && (
        <div className="mt-5 space-y-3">
          {outcome.review
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 text-xs uppercase tracking-wider text-dim">{g.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((x, i) => (
                    <Badge key={i} tone={g.tone}>
                      {x}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </Stage>
  );
}

/** Recently seen items across all tasks, oldest first (see recentExposure). */
export async function recentItems(exerciseId?: ExerciseId): Promise<string[]> {
  return recentExposure(await db.trials(), exerciseId);
}

export interface RunnerProps {
  exerciseId: ExerciseId;
  mode: Mode;
  seedBase: string;
  sessionId?: string;
  variant?: string;
  strategy?: StrategyId;
  /**
   * Session slot length (ms) counted in blocks actually played: instructions, feedback and paused blocks do not use
   * it. The slot is a minimum: it can be left once another block would not fit.
   */
  budgetMs?: number;
  /** Session slot with a fixed number of blocks (COGITO mode); takes precedence over `budgetMs`. */
  requiredBlocks?: number;
  /** COGITO-faithful protocol: fixed parameters from the calibration; no adaptation. */
  faithfulParams?: LevelParams;
  /** COGITO adaptive protocol: faithful tasks, difficulty adapted after every response and kept across sessions. */
  staircase?: boolean;
  onTrial?: (t: TrialResult) => void | Promise<void>;
  /** `completed` is true when the slot's minimum was met, false when it was skipped from the intro. */
  onExit: (completed: boolean) => void;
  exitLabel?: string;
  /** Skip the intro screen (used inside sessions after the first block). */
  autoStart?: boolean;
}

/** Runs blocks of one exercise with adaptive difficulty, persistence, delayed-recall scheduling and feedback. */
export function ExerciseRunner(props: RunnerProps) {
  const { settings, setBusy, bump } = useApp();
  const { t, lang } = useI18n();
  const def = EXERCISES[props.exerciseId];
  const [variant, setVariant] = useState<string | undefined>(props.variant ?? def.variants?.[0].id);
  const key = adaptiveKey(props.exerciseId, variant);
  const [adaptive, setAdaptive] = useState<AdaptiveState | null>(null);
  const [phase, setPhase] = useState<'intro' | 'run' | 'feedback'>('intro');
  const [block, setBlock] = useState(0);
  const [ctx, setCtx] = useState<ExCtx | null>(null);
  const [result, setResult] = useState<{ outcome: ExOutcome; decision?: AdaptDecision; level: number } | null>(null);
  const staircase = !!props.staircase;
  const faithful = props.faithfulParams !== undefined || staircase;
  const stairNow = useRef<number | null>(null);
  const startedAt = useRef(0);
  const lastBlockMs = useRef(0);
  const usedMs = useRef(0);
  /** Set when the last block could not be saved: retries the save. */
  const [saveFailed, setSaveFailed] = useState<null | { retry: () => Promise<void>; drop: () => void }>(null);
  // Active time of the current block (see BlockClock): the first start screen moves the start, a restart resets it.
  const clock = useRef(createBlockClock((t) => (startedAt.current = t))).current;

  useEffect(() => {
    db.adaptive(key).then((s) => setAdaptive(s ?? initialState(key)));
  }, [key]);

  useEffect(() => () => setBusy(false), []);

  const start = async (blockIdx = block) => {
    if (!adaptive) return;
    const recent = await recentItems(props.exerciseId);
    // Staircase: read the value reached so far (it carries over between blocks and sessions).
    const stairParams = staircase
      ? await db.kv<StairState>(STAIRCASE_KEY).then((st) => {
          stairNow.current = stairValue(props.exerciseId, st ?? {});
          return staircaseParams(props.exerciseId, stairNow.current);
        })
      : undefined;
    clock.reset();
    setCtx({
      exerciseId: props.exerciseId,
      seed: `${props.seedBase}:${key}:${blockIdx}`,
      level: faithful ? 0 : adaptive.level,
      params: stairParams ?? props.faithfulParams ?? paramsFor(props.exerciseId, adaptive.level),
      faithful,
      staircase,
      lang, // frozen for this block
      settings,
      mode: props.mode,
      strategy: props.strategy,
      recent,
      variant,
    });
    setBusy(true);
    setPhase('run');
  };

  useEffect(() => {
    if (props.autoStart && adaptive && phase === 'intro' && block === 0) start();
  }, [adaptive]);

  const onDone = async (o: ExOutcome) => {
    if (!ctx || !adaptive) return;
    setBusy(false);
    // Staircase value after this block, saved with the block so progress over days can be charted.
    const stairNext = staircase && stairNow.current !== null ? nextStairValue(props.exerciseId, stairNow.current, o) : undefined;
    const trial: TrialResult = {
      id: uid('t_'),
      exerciseId: props.exerciseId,
      domain: def.domain,
      mode: props.mode,
      sessionId: props.sessionId,
      seed: ctx.seed,
      lang: ctx.lang,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      level: ctx.level,
      params: { ...ctx.params, ...(variant ? { variant } : {}), ...(o.params ?? {}), ...(stairNext !== undefined ? { stairLevel: stairNext } : {}) },
      accuracy: o.accuracy,
      metrics: o.metrics,
      conditionKey: o.conditionKey,
      encodingMs: o.encodingMs,
      strategy: props.strategy,
      itemIds: o.itemIds,
      detail: o.detail,
    };
    lastBlockMs.current = trial.endedAt - trial.startedAt;
    // Faithful protocol: difficulty stays at the calibrated level (as in the study), so nothing adapts.
    const { state, decision } = faithful ? { state: adaptive, decision: undefined } : adapt(adaptive, o.accuracy, settings.thresholds);
    // Only the first block of an exercise is kept for delayed recall. Probing every block meant recalling
    // several similar lists in a row at the end of a long session, where interference makes recall unfair.
    const probe =
      o.probe && settings.delayedRecall && ctx.seed.endsWith(':0')
        ? createProbe({
            id: uid('p_'),
            exerciseId: o.probe.exerciseId ?? props.exerciseId,
            kind: o.probe.kind,
            sourceTrialId: trial.id,
            payload: o.probe.payload,
            lang: ctx.lang,
            delayMs: props.sessionId ? 0 : settings.minDelayMinutes * MINUTE,
            sessionId: props.sessionId,
          })
        : undefined;
    const finished = {
      trial,
      adaptive: faithful ? undefined : state,
      stair: stairNext !== undefined ? { id: props.exerciseId, value: stairNext } : undefined,
      probe,
      onSaved: props.onTrial,
    };
    // The new levels apply only once the block is stored, so the next block never starts from a level that was lost.
    const trySave = async () => {
      try {
        await saveBlock(db, finished);
        usedMs.current += lastBlockMs.current;
        if (!faithful) setAdaptive(state);
        if (stairNext !== undefined) stairNow.current = stairNext;
        setSaveFailed(null);
        bump();
      } catch {
        // Until it is saved, or explicitly dropped, the block cannot be left (see the result screen).
        setSaveFailed({ retry: trySave, drop: () => setSaveFailed(null) });
      }
    };
    // Saved before the next block can start (it reads the stored level); the result is shown whether or not it worked.
    await trySave();
    setResult({ outcome: o, decision: def.ownLevels ? undefined : decision, level: state.level });
    setPhase('feedback');
  };

  if (!adaptive) return <div className="text-center text-dim">{t('common.loading')}</div>;

  if (phase === 'intro') {
    const p = paramsFor(props.exerciseId, adaptive.level);
    const words = p.items ?? (p.categories ? p.categories * p.perCategory : 0);
    const instr = faithful
      ? `${staircase && ['G1', 'G2', 'G3', 'G4'].includes(props.exerciseId) ? t(`adaptive.instr.${props.exerciseId}`) : t(`faithful.instr.${props.exerciseId}`)}${staircase ? ` ${t('adaptive.introNote')}` : ''}`
      : t(`ex.${props.exerciseId}.instructions`, { s: Math.round(words * settings.secondsPerWord), n: p.window ?? p.n ?? '' });
    return (
      <IntroScreen
        title={t(`ex.${props.exerciseId}.name`)}
        instructions={instr}
        level={faithful || def.ownLevels ? undefined : adaptive.level}
        strategyNote={props.strategy ? t(`strategies.${props.strategy}.prompt`) : undefined}
        variants={def.variants && !props.variant && !faithful ? def.variants.map((v) => ({ value: v.id, label: t(v.labelKey) })) : undefined}
        variant={variant}
        onVariant={setVariant}
        onStart={() => start()}
        onExit={() => props.onExit(false)}
        extra={props.exerciseId === 'E4' ? t('nback.audioNote') : undefined}
      />
    );
  }

  if (phase === 'run' && ctx) {
    const C = (faithful && FAITHFUL_COMPONENTS[props.exerciseId]) || def.Component;
    // Not machine-translated while running: stimuli would change under the timer, and answers are scored against the
    // original words. Instructions and results stay translatable.
    return (
      <div translate="no" className="notranslate">
        <LockedLangBadge lang={ctx.lang} />
        <BlockClockContext.Provider value={clock}>
          <TimingGuard pausable>
            <C key={ctx.seed} ctx={ctx} onDone={onDone} />
          </TimingGuard>
        </BlockClockContext.Provider>
      </div>
    );
  }

  if (result) {
    const blocksDone = block + 1;
    const remainingMs = props.budgetMs !== undefined ? props.budgetMs - usedMs.current : undefined;
    const gate = slotGate({ blocksDone, requiredBlocks: props.requiredBlocks, remainingMs, lastBlockMs: lastBlockMs.current });
    const spec = STAIRS[props.exerciseId];
    const stairNote = staircase && spec && stairNow.current !== null ? t('adaptive.next', { v: stairNow.current, unit: t(`adaptive.unit.${spec.unit}`) }) : '';
    const note0 =
      props.requiredBlocks !== undefined
        ? t('session.blockOf', { n: blocksDone, total: props.requiredBlocks })
        : remainingMs !== undefined && !gate.canFinish
          ? t('session.keepGoing', { m: Math.max(1, Math.ceil(remainingMs / 60_000)) })
          : undefined;
    const note = [stairNote, note0].filter(Boolean).join(' · ') || undefined;
    return (
      <>
      {saveFailed && (
        <div className="mx-auto mb-3 flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/60 bg-warn/10 p-3 text-sm text-white">
          <span>{t('common.saveFailed')}</span>
          <span className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => saveFailed.retry()}>{t('common.retrySave')}</Button>
            <Button variant="subtle" onClick={() => window.confirm(t('common.dropBlockConfirm')) && saveFailed.drop()}>{t('common.dropBlock')}</Button>
          </span>
        </div>
      )}
      <Feedback
        outcome={result.outcome}
        decision={result.decision}
        level={result.level}
        note={note}
        onNext={
          gate.canNext && !saveFailed
            ? () => {
                setBlock(blocksDone);
                setResult(null);
                start(blocksDone);
              }
            : undefined
        }
        onFinish={gate.canFinish && !saveFailed ? () => props.onExit(true) : undefined}
      />
      </>
    );
  }
  return null;
}

export function IntroScreen(p: {
  title: string;
  instructions: string;
  level?: number;
  strategyNote?: string;
  variants?: { value: string; label: string }[];
  variant?: string;
  onVariant?: (v: string) => void;
  onStart: () => void;
  onExit?: () => void;
  extra?: string;
}) {
  const { t } = useI18n();
  useKey(['Enter'], p.onStart);
  return (
    <Stage title={p.title} footer={<>
      {p.onExit && <Button variant="ghost" onClick={p.onExit}>{t('app.back')}</Button>}
      <Button onClick={p.onStart} autoFocus>{t('common.start')} <Kbd>Enter</Kbd></Button>
    </>}>
      <p className="text-center text-lg leading-relaxed text-white">{p.instructions}</p>
      {p.strategyNote && <p className="mt-4 rounded-xl border border-volt/40 bg-volt/10 p-3 text-center text-sm text-volt">{p.strategyNote}</p>}
      {p.extra && <p className="mt-3 text-center text-xs text-dim">{p.extra}</p>}
      {p.variants && p.onVariant && (
        <div className="mt-5 flex justify-center">
          <Segmented value={p.variant ?? p.variants[0].value} options={p.variants} onChange={p.onVariant} />
        </div>
      )}
      {p.level !== undefined && (
        <div className="mt-4 text-center">
          <Badge tone="volt">
            {t('common.level')} {p.level}
          </Badge>
        </div>
      )}
    </Stage>
  );
}

export function LockedLangBadge({ lang }: { lang: Lang }) {
  const { t, lang: ui } = useI18n();
  if (lang === ui) return null;
  return (
    <div className="mb-3 text-center">
      <Badge tone="warn">{t('app.lockedLang', { lang: LANG_NAMES[lang] })}</Badge>
    </div>
  );
}

const PROBE_COMPONENTS: Record<DelayedProbe['kind'], ComponentType<ExProps>> = {
  wordList: DelayedWordRecall,
  story: DelayedStory,
  spaced: DelayedPairs,
};

/** Runs one delayed-recall probe and stores the result as a delayed trial. */
export function ProbeRunner({ probe, onDone }: { probe: DelayedProbe; onDone: (t: TrialResult) => void }) {
  const { settings, bump } = useApp();
  const [result, setResult] = useState<{ o: ExOutcome; trial: TrialResult } | null>(null);
  const startedAt = useRef(Date.now());
  const payload = probe.payload as Record<string, unknown>;
  const Comp = probe.kind === 'wordList' && payload.pairs ? DelayedPairs : PROBE_COMPONENTS[probe.kind];
  const def = EXERCISES[probe.exerciseId];
  const ctx: ExCtx = {
    exerciseId: probe.exerciseId,
    seed: probe.id,
    level: 0,
    params: {},
    lang: probe.lang, // the language the material was studied in
    settings,
    mode: probe.kind === 'spaced' ? 'strategy' : probe.sessionId ? 'training' : 'free',
    recent: [],
    fixed: payload,
    strategy: probe.kind === 'spaced' ? 'retrieval' : undefined,
  };
  if (result) return <Feedback outcome={result.o} onFinish={() => onDone(result.trial)} />;
  return (
    <div>
      <LockedLangBadge lang={probe.lang} />
      <Comp
        ctx={ctx}
        onDone={async (o) => {
          const trial: TrialResult = {
            id: uid('t_'),
            exerciseId: probe.exerciseId,
            domain: def.domain,
            mode: ctx.mode,
            sessionId: probe.sessionId,
            seed: probe.id,
            lang: probe.lang,
            startedAt: startedAt.current,
            endedAt: Date.now(),
            level: 0,
            // Retention interval = end of the original block -> start of this recall (not including answer time).
            params: { delayMs: startedAt.current - probe.createdAt, probeKind: probe.kind, ...(probe.overnight ? { overnight: true } : {}) },
            accuracy: o.accuracy,
            metrics: { ...o.metrics, delayMinutes: Math.round((startedAt.current - probe.createdAt) / MINUTE), responseSeconds: Math.round((Date.now() - startedAt.current) / 1000) },
            // Overnight recalls are kept apart from same-session delays in analytics.
            conditionKey: probe.overnight ? `${o.conditionKey}|overnight` : o.conditionKey,
            delayed: true,
            strategy: ctx.strategy,
            itemIds: o.itemIds,
            detail: { ...((o.detail as object) ?? {}), sourceTrialId: probe.sourceTrialId },
          };
          await db.saveTrial(trial);
          await db.saveProbe({ ...probe, done: true });
          bump();
          setResult({ o, trial });
        }}
      />
    </div>
  );
}
