import { useMemo, useState, type ComponentType } from 'react';
import { TimingGuard } from '../exercises/guard';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { useData } from '../useData';
import { BATTERY, FIXED, NEAR_BATTERY, TRANSFER_BATTERY, chooseForm, isNear, isStandard, isTransfer } from '../core/assessmentPlan';
import { assessmentForm, efficiencyList } from '../content';
import { genPattern } from '../core/generate';
import { db, uid } from '../core/storage';
import { newSessionSeed } from '../core/rng';
import type { AssessmentRecord, AssessmentTestKey, Domain, ExerciseId, Lang, TrialResult } from '../core/types';
import type { ExCtx, ExOutcome, ExProps } from '../exercises/types';
import { WordListExercise, DelayedWordRecall } from '../exercises/verbal';
import { GlyphRecognition, PatternMemory } from '../exercises/visual';
import { PairedAssociates } from '../exercises/associative';
import { DigitSpan } from '../exercises/working';
import { CorsiSpan, SeriesCompletion, SymbolDigit } from '../exercises/transfer';
import { AnimalSpan, SpatialUpdating } from '../exercises/nearTransfer';
import { NBack } from '../exercises/working';
import { Feedback, LockedLangBadge, MetricGrid } from '../exercises/runner';
import { Badge, Button, Card, H1, H2 } from '../ui/kit';
import { Stage } from '../exercises/shared';
import { MINUTE } from '../core/scheduler';

interface StepDef {
  key: AssessmentTestKey;
  exerciseId: ExerciseId | 'T';
  domain: Domain;
  Component: ComponentType<ExProps>;
  variant?: string;
  fixed: (form: number, rec: AssessmentRecord) => Record<string, unknown>;
}

const STEPS: Record<AssessmentTestKey, StepDef> = {
  immediateVerbal: { key: 'immediateVerbal', exerciseId: 'A1', domain: 'verbal', Component: WordListExercise, fixed: (f) => ({ ids: assessmentForm(f).list, encodingMs: FIXED.verbalEncodingMs }) },
  visualRecognition: { key: 'visualRecognition', exerciseId: 'C3', domain: 'visual', Component: GlyphRecognition, fixed: () => ({ study: FIXED.recogStudy, ms: FIXED.recogStudyMs }) },
  visualReconstruction: {
    key: 'visualReconstruction',
    exerciseId: 'C1',
    domain: 'visual',
    Component: PatternMemory,
    fixed: (f) => ({ size: FIXED.patternSize, ms: FIXED.patternMs, patterns: Array.from({ length: FIXED.patternTrials }, (_, i) => genPattern(`asm:${f}:pat:${i}`, FIXED.patternSize, FIXED.patternCells).cells) }),
  },
  associative: { key: 'associative', exerciseId: 'B1', domain: 'associative', Component: PairedAssociates, fixed: (f) => ({ pairs: assessmentForm(f).pairs, pairMs: FIXED.pairMs }) },
  wmSpan: { key: 'wmSpan', exerciseId: 'E1', domain: 'working', Component: DigitSpan, variant: 'backward', fixed: () => ({ staircase: true, min: FIXED.spanMin, max: FIXED.spanMax, perLength: FIXED.spanTrialsPerLength }) },
  delayedVerbal: {
    key: 'delayedVerbal',
    exerciseId: 'A1',
    domain: 'verbal',
    Component: DelayedWordRecall,
    fixed: (f, rec) => ({ ids: assessmentForm(f).list, immediateCorrect: rec.results.immediateVerbal?.correct ?? 0 }),
  },
  // ---- untrained transfer battery ----
  symbolDigit: { key: 'symbolDigit', exerciseId: 'T', domain: 'speed', Component: SymbolDigit, fixed: (f) => ({ form: f }) },
  series: { key: 'series', exerciseId: 'T', domain: 'reasoning', Component: SeriesCompletion, fixed: (f) => ({ form: f }) },
  corsi: { key: 'corsi', exerciseId: 'T', domain: 'visual', Component: CorsiSpan, fixed: (f) => ({ form: f }) },
  // ---- COGITO-style near-transfer battery ----
  animalSpan: { key: 'animalSpan', exerciseId: 'T', domain: 'working', Component: AnimalSpan, fixed: (f) => ({ form: f }) },
  numeric3back: { key: 'numeric3back', exerciseId: 'T', domain: 'working', Component: NBack, fixed: () => ({ numeric: true }) },
  spatialUpdating: { key: 'spatialUpdating', exerciseId: 'T', domain: 'working', Component: SpatialUpdating, fixed: (f) => ({ form: f }) },
};

const batteryOf = (r: Pick<AssessmentRecord, 'kind'>) => (isTransfer(r) ? TRANSFER_BATTERY : isNear(r) ? NEAR_BATTERY : BATTERY);

async function saveAssessmentTrial(rec: AssessmentRecord, step: StepDef, ctx: ExCtx, startedAt: number, o: ExOutcome) {
  const trial: TrialResult = {
    id: uid('t_'),
    exerciseId: step.exerciseId,
    domain: step.domain,
    mode: 'assessment',
    assessmentId: rec.id,
    seed: ctx.seed,
    lang: ctx.lang,
    startedAt,
    endedAt: Date.now(),
    level: 0,
    params: { test: step.key, form: rec.form + 1, ...(step.variant ? { variant: step.variant } : {}) },
    accuracy: o.accuracy,
    metrics: o.metrics,
    conditionKey: `assessment:${step.key}|${o.conditionKey}`,
    encodingMs: o.encodingMs,
    delayed: step.key === 'delayedVerbal',
    itemIds: o.itemIds,
    detail: o.detail,
  };
  await db.saveTrial(trial);
}

export function AssessmentPage() {
  const { settings, bump } = useApp();
  const { t, lang } = useI18n();
  const data = useData();
  const [rec, setRec] = useState<AssessmentRecord | null>(null);
  const [between, setBetween] = useState(false);
  const [last, setLast] = useState<ExOutcome | null>(null);
  const [effRun, setEffRun] = useState<{ seed: string; variant: number; lang: Lang } | null>(null);
  const [effResult, setEffResult] = useState<ExOutcome | null>(null);
  const [stepStart, setStepStart] = useState(Date.now());

  // The standard battery and the transfer battery keep separate histories and form rotations.
  const standard = data.assessments.filter(isStandard);
  const transfers = data.assessments.filter(isTransfer);
  const done = standard.filter((a) => a.completed);
  const incomplete = standard.filter((a) => !a.completed).sort((a, b) => b.startedAt - a.startedAt)[0];
  const choice = useMemo(() => chooseForm(standard), [data.assessments]);
  const tDone = transfers.filter((a) => a.completed);
  const tIncomplete = transfers.filter((a) => !a.completed).sort((a, b) => b.startedAt - a.startedAt)[0];
  const tChoice = useMemo(() => chooseForm(transfers), [data.assessments]);
  const nears = data.assessments.filter(isNear);
  const nDone = nears.filter((a) => a.completed);
  const nIncomplete = nears.filter((a) => !a.completed).sort((a, b) => b.startedAt - a.startedAt)[0];
  const nChoice = useMemo(() => chooseForm(nears), [data.assessments]);
  const sessionsDone = data.sessions.filter((s) => s.completed).length;

  const persist = async (r: AssessmentRecord) => {
    setRec(r);
    await db.saveAssessment(r);
    bump();
  };

  const start = async (battery: 'standard' | 'transfer' | 'near' = 'standard') => {
    const r: AssessmentRecord = {
      id: uid('a_'),
      kind: battery === 'standard' ? (done.length ? 'reassessment' : 'baseline') : battery,
      form: battery === 'transfer' ? tChoice.form : battery === 'near' ? nChoice.form : choice.form,
      seed: newSessionSeed(),
      lang, // stimulus language fixed for the whole assessment
      startedAt: Date.now(),
      sessionIndex: sessionsDone,
      results: {},
      step: 0,
      completed: false,
    };
    setStepStart(Date.now());
    await persist(r);
  };

  // ---------- running ----------
  if (rec && !rec.completed) {
    const battery = batteryOf(rec);
    const stepKey = battery[rec.step];
    const step = STEPS[stepKey];
    if (between && last)
      return (
        <div>
          <Feedback outcome={last} onFinish={() => (setBetween(false), setStepStart(Date.now()))} />
        </div>
      );
    const ctx: ExCtx = {
      exerciseId: step.exerciseId === 'T' ? 'A1' : step.exerciseId,
      seed: `asm:${rec.form}:${step.key}`,
      level: 0,
      params: {},
      lang: rec.lang,
      settings,
      mode: 'assessment',
      recent: [],
      variant: step.variant,
      fixed: step.fixed(rec.form, rec),
    };
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone="violet">
            {rec.step + 1} / {battery.length}
          </Badge>
          <span className="text-sm text-white">{t(`assessment.tests.${stepKey}`)}</span>
          <Badge tone="dim">{t('assessment.form', { f: rec.form + 1 })}</Badge>
        </div>
        <LockedLangBadge lang={rec.lang} />
        <TimingGuard pausable>
        <step.Component
          key={stepKey}
          ctx={ctx}
          onDone={async (o) => {
            await saveAssessmentTrial(rec, step, ctx, stepStart, o);
            const now = Date.now();
            const encodedAt = rec.stepEndedAt?.immediateVerbal ?? rec.startedAt;
            const metrics = { ...o.metrics, accuracy: Math.round(o.accuracy * 1000) / 1000, ...(stepKey === 'delayedVerbal' ? { delayMinutes: Math.round((stepStart - encodedAt) / MINUTE), responseSeconds: Math.round((now - stepStart) / 1000) } : {}) };
            const next: AssessmentRecord = { ...rec, results: { ...rec.results, [stepKey]: metrics }, step: rec.step + 1, stepEndedAt: { ...rec.stepEndedAt, [stepKey]: now } };
            if (next.step >= battery.length) {
              next.completed = true;
              next.endedAt = Date.now();
            }
            await persist(next);
            setLast(o);
            setBetween(!next.completed);
          }}
        />
        </TimingGuard>
      </div>
    );
  }

  if (rec?.completed)
    return (
      <Stage title={t('assessment.done')} wide footer={<Button onClick={() => setRec(null)}>{t('common.continue')}</Button>}>
        <div className="space-y-4">
          {batteryOf(rec).map((k) => (
            <div key={k}>
              <div className="mb-1.5 text-sm text-white">{t(`assessment.tests.${k}`)}</div>
              <MetricGrid metrics={rec.results[k] ?? {}} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-dim">{t('assessment.not')}</p>
      </Stage>
    );

  // ---------- efficiency check ----------
  if (effRun) {
    if (effResult) return <Feedback outcome={effResult} onFinish={() => (setEffRun(null), setEffResult(null))} />;
    const ctx: ExCtx = {
      exerciseId: 'A1',
      seed: effRun.seed,
      level: 0,
      params: {},
      lang: effRun.lang,
      settings,
      mode: 'assessment',
      recent: [],
      fixed: { ids: efficiencyList(effRun.variant), encodingMs: FIXED.efficiencyEncodingMs },
    };
    const started = Date.now();
    return (
      <WordListExercise
        ctx={ctx}
        onDone={async (o) => {
          await db.saveTrial({
            id: uid('t_'),
            exerciseId: 'A1',
            domain: 'verbal',
            mode: 'assessment',
            seed: ctx.seed,
            lang: ctx.lang,
            startedAt: started,
            endedAt: Date.now(),
            level: 0,
            params: { test: 'efficiency', list: effRun.variant + 1 },
            accuracy: o.accuracy,
            metrics: o.metrics,
            conditionKey: `EE-fixed|n=${FIXED.efficiencyWords}|enc=${FIXED.efficiencyEncodingMs}`,
            encodingMs: o.encodingMs,
            itemIds: o.itemIds,
          });
          bump();
          setEffResult({ ...o, probe: undefined });
        }}
      />
    );
  }

  // ---------- overview ----------
  const effCount = data.trials.filter((x) => x.conditionKey.startsWith('EE-fixed')).length;
  return (
    <div>
      <H1 sub={t('assessment.intro')}>{t('assessment.title')}</H1>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card glow="violet" className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>{done.length ? t('assessment.reassessment') : t('assessment.baseline')}</Badge>
            <Badge tone="volt">{t('assessment.form', { f: (incomplete?.form ?? choice.form) + 1 })}</Badge>
          </div>
          <ol className="mb-4 space-y-1.5 text-sm text-ink">
            {BATTERY.map((k, i) => (
              <li key={k} className="flex gap-3">
                <span className="font-mono text-dim">{i + 1}</span>
                {t(`assessment.tests.${k}`)}
              </li>
            ))}
          </ol>
          <p className="text-xs text-dim">{t('assessment.duration')}</p>
          {choice.reuseWarning && !incomplete && <p className="mt-2 text-xs text-warn">{t('assessment.reuseWarning')}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            {incomplete ? (
              <Button
                onClick={() => {
                  setStepStart(Date.now());
                  setRec(incomplete);
                }}
              >
                {t('assessment.resume')} ({incomplete.step + 1}/{BATTERY.length})
              </Button>
            ) : (
              <Button onClick={() => start()}>{t('assessment.start')}</Button>
            )}
          </div>
          <p className="mt-4 text-xs text-dim">{t('assessment.not')}</p>
        </Card>
        <Card>
          <H2>{t('assessment.efficiencyTitle')}</H2>
          <p className="text-sm text-dim">{t('assessment.efficiencyIntro')}</p>
          <Button variant="ghost" className="mt-4" onClick={() => setEffRun({ seed: `eff:${newSessionSeed()}`, variant: effCount % 2, lang })}>
            {t('assessment.efficiencyStart')}
          </Button>
        </Card>
      </div>

      <Card className="mt-4">
        <H2>{t('transfer.title')}</H2>
        <p className="mb-3 text-sm text-dim">{t('transfer.intro')}</p>
        <ol className="mb-3 space-y-1 text-sm text-ink">
          {TRANSFER_BATTERY.map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="font-mono text-dim">{i + 1}</span>
              {t(`assessment.tests.${k}`)}
            </li>
          ))}
        </ol>
        {tChoice.reuseWarning && !tIncomplete && <p className="mb-2 text-xs text-warn">{t('assessment.reuseWarning')}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="volt">{t('assessment.form', { f: (tIncomplete?.form ?? tChoice.form) + 1 })}</Badge>
          {tIncomplete ? (
            <Button variant="ghost" onClick={() => (setStepStart(Date.now()), setRec(tIncomplete))}>
              {t('assessment.resume')} ({tIncomplete.step + 1}/{TRANSFER_BATTERY.length})
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => start('transfer')}>{t('transfer.start')}</Button>
          )}
        </div>
        {tDone.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-dim">
                <tr>
                  <th className="py-2 pr-4">{t('history.date')}</th>
                  <th className="pr-4">{t('assessment.form', { f: '' })}</th>
                  <th className="pr-4">{t('assessment.tests.symbolDigit')}</th>
                  <th className="pr-4">{t('assessment.tests.series')}</th>
                  <th>{t('assessment.tests.corsi')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-ink">
                {tDone.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-2 pr-4 font-sans">{new Date(a.startedAt).toLocaleDateString()}</td>
                    <td className="pr-4">{a.form + 1}</td>
                    <td className="pr-4">{a.results.symbolDigit?.correct ?? '—'}</td>
                    <td className="pr-4">{a.results.series?.correct ?? '—'}/12</td>
                    <td>{a.results.corsi?.span ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <H2>{t('near.title')}</H2>
        <p className="mb-3 text-sm text-dim">{t('near.intro')}</p>
        <ol className="mb-3 space-y-1 text-sm text-ink">
          {NEAR_BATTERY.map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="font-mono text-dim">{i + 1}</span>
              {t(`assessment.tests.${k}`)}
              <span className="text-dim">· {t(`near.trainedAs.${k}`)}</span>
            </li>
          ))}
        </ol>
        {nChoice.reuseWarning && !nIncomplete && <p className="mb-2 text-xs text-warn">{t('assessment.reuseWarning')}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="volt">{t('assessment.form', { f: (nIncomplete?.form ?? nChoice.form) + 1 })}</Badge>
          {nIncomplete ? (
            <Button variant="ghost" onClick={() => (setStepStart(Date.now()), setRec(nIncomplete))}>
              {t('assessment.resume')} ({nIncomplete.step + 1}/{NEAR_BATTERY.length})
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => start('near')}>{t('near.start')}</Button>
          )}
        </div>
        {nDone.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-dim">
                <tr>
                  <th className="py-2 pr-4">{t('history.date')}</th>
                  <th className="pr-4">{t('assessment.form', { f: '' })}</th>
                  <th className="pr-4">{t('assessment.tests.animalSpan')}</th>
                  <th className="pr-4">{t('assessment.tests.numeric3back')} (d′)</th>
                  <th>{t('assessment.tests.spatialUpdating')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-ink">
                {nDone.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-2 pr-4 font-sans">{new Date(a.startedAt).toLocaleDateString()}</td>
                    <td className="pr-4">{a.form + 1}</td>
                    <td className="pr-4">{a.results.animalSpan ? `${Math.round((a.results.animalSpan.accuracy ?? 0) * 100)}%` : '—'}</td>
                    <td className="pr-4">{a.results.numeric3back?.dPrimeCorrected ?? '—'}</td>
                    <td>{a.results.spatialUpdating ? `${Math.round((a.results.spatialUpdating.accuracy ?? 0) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-dim">{t('near.note')}</p>
      </Card>

      <div className="mt-6">
        <H2>{t('assessment.history')}</H2>
        {!done.length && <p className="text-sm text-dim">{t('analytics.noAssessments')}</p>}
        <div className="overflow-x-auto">
          {done.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-dim">
                <tr>
                  <th className="py-2 pr-4">{t('history.date')}</th>
                  <th className="pr-4">{t('assessment.form', { f: '' })}</th>
                  <th className="pr-4">{t('metric.immediate')}</th>
                  <th className="pr-4">{t('metric.delayed')}</th>
                  <th className="pr-4">{t('metric.dPrimeCorrected')}</th>
                  <th className="pr-4">{t('assessment.tests.visualReconstruction')}</th>
                  <th className="pr-4">{t('assessment.tests.associative')}</th>
                  <th>{t('metric.span')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-ink">
                {done.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-2 pr-4 font-sans">{new Date(a.startedAt).toLocaleDateString()}</td>
                    <td className="pr-4">{a.form + 1}</td>
                    <td className="pr-4">{a.results.immediateVerbal?.correct ?? '—'}/12</td>
                    <td className="pr-4">{a.results.delayedVerbal?.correct ?? '—'}/12</td>
                    <td className="pr-4">{a.results.visualRecognition?.dPrimeCorrected ?? '—'}</td>
                    <td className="pr-4">{a.results.visualReconstruction?.accuracy !== undefined ? `${Math.round((a.results.visualReconstruction.accuracy ?? 0) * 100)}%` : '—'}</td>
                    <td className="pr-4">{a.results.associative?.correct ?? '—'}/6</td>
                    <td>{a.results.wmSpan?.span ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
