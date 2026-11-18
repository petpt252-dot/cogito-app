import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { db } from '../core/storage';
import { BANDS, CALIBRATION_KEY, PT_LEVELS, chooseCrtLevels, chooseLevel, faithfulParams, type CalibTask, type Calibration } from '../core/faithful';
import type { ExerciseId } from '../core/types';
import type { LevelParams } from '../core/levels';
import type { ExCtx, ExProps } from '../exercises/types';
import { EXERCISES } from '../exercises/registry';
import { FAITHFUL_COMPONENTS } from '../exercises/faithfulRegistry';
import { TimingGuard } from '../exercises/guard';
import { Badge, Button, Card, H1 } from '../ui/kit';
import { Stage } from '../exercises/shared';

// Calibration pre-test for the COGITO-faithful protocol. As in the study, each timed task is measured at its
// three presentation times and one time is chosen per person; it then stays fixed for the whole programme.
// The study fitted time–accuracy functions to a long pre-test; here accuracy is measured directly at each level
// on shorter blocks (about 20 minutes in total), and the paper's selection rule is applied (core/faithful.ts).

interface Step {
  task: CalibTask;
  /** Level index (0 = fastest); -1 for the mixed-level CRT block. */
  level: number;
  params: LevelParams;
}

const SLOWEST_FIRST = [2, 1, 0];

function buildSteps(): Step[] {
  const steps: Step[] = [];
  for (const level of SLOWEST_FIRST) steps.push({ task: 'G1', level, params: { items: 12, pt: PT_LEVELS.em[level], isi: 1000 } });
  for (const level of SLOWEST_FIRST) steps.push({ task: 'G2', level, params: { pairs: 6, pt: PT_LEVELS.em[level], isi: 1000 } });
  for (const level of SLOWEST_FIRST) steps.push({ task: 'G3', level, params: { objects: 6, pt: PT_LEVELS.em[level], isi: 1000 } });
  for (const level of SLOWEST_FIRST) steps.push({ task: 'G4', level, params: { length: 10, lists: 2, pt: PT_LEVELS.alpha[level], isi: 500 } });
  for (const level of SLOWEST_FIRST) steps.push({ task: 'G5', level, params: { slots: 4, ops: 8, problems: 2, opMs: PT_LEVELS.updating[level], isi: 250 } });
  for (const level of SLOWEST_FIRST) steps.push({ task: 'G6', level, params: { dots: 39, stim: 500, isi: PT_LEVELS.nbackIsi[level] } });
  for (const task of ['P1', 'P2', 'P3'] as const) steps.push({ task, level: -1, params: { items: 36 } });
  return steps;
}

/** Turn the measured accuracies into fixed levels with the paper's rule. */
export function calibrationFromResults(acc: Partial<Record<CalibTask, number[]>>, frameMs?: number, now = Date.now()): Calibration {
  const pick = (task: 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6', band: { min: number; upper: number }) => (acc[task] ? chooseLevel(acc[task]!, band) : 1);
  return {
    createdAt: now,
    frameMs,
    accuracy: acc,
    levels: {
      G1: pick('G1', BANDS.em),
      G2: pick('G2', BANDS.em),
      G3: pick('G3', BANDS.em),
      G4: pick('G4', BANDS.alpha),
      G5: pick('G5', BANDS.updating),
      G6: pick('G6', BANDS.nback),
      ...Object.fromEntries((['P1', 'P2', 'P3'] as const).map((p) => [p, acc[p] ? chooseCrtLevels(acc[p]!) : { fast: 0, slow: 2 }])),
    },
  };
}

export function useCalibration() {
  const { version } = useApp();
  const [cal, setCal] = useState<Calibration | null | undefined>(undefined);
  useEffect(() => {
    db.kv<Calibration>(CALIBRATION_KEY).then((c) => setCal(c ?? null), () => setCal(null));
  }, [version]);
  return cal;
}

export function CalibrationPage() {
  const { settings, go, bump } = useApp();
  const { t, lang } = useI18n();
  const existing = useCalibration();
  const steps = useMemo(buildSteps, []);
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [acc, setAcc] = useState<Partial<Record<CalibTask, number[]>>>({});
  const [frameMs, setFrameMs] = useState<number | undefined>(undefined);
  const [stamp] = useState(() => Date.now());
  const [result, setResult] = useState<Calibration | null>(null);

  const finish = async (a: Partial<Record<CalibTask, number[]>>, f?: number) => {
    const c = calibrationFromResults(a, f);
    await db.setKv(CALIBRATION_KEY, c);
    bump();
    setResult(c);
    setRunning(false);
  };

  if (existing === undefined) return <div className="text-dim">{t('common.loading')}</div>;

  if (result || (!running && existing)) {
    const c = (result ?? existing)!;
    const rows: [string, string][] = (['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as ExerciseId[]).map((id) => {
      const p = faithfulParams(id, c);
      const v = p.pt ?? p.opMs ?? (p.isi && id === 'G6' ? p.isi : undefined);
      const txt = p.fastMs !== undefined ? `${p.fastMs} / ${p.slowMs} ms` : v !== undefined ? `${v} ms` : t('faithful.notCalibrated');
      return [t(`ex.${id}.name`), txt];
    });
    return (
      <div className="space-y-4">
        <H1 sub={t('faithful.calibDoneSub')}>{t('faithful.calibTitle')}</H1>
        <Card>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="volt">{new Date(c.createdAt).toLocaleDateString()}</Badge>
            {c.frameMs && <Badge tone="dim">{t('faithful.refresh', { hz: Math.round(1000 / c.frameMs) })}</Badge>}
          </div>
          <table className="w-full text-left text-sm">
            <tbody>
              {rows.map(([name, v]) => (
                <tr key={name} className="border-t border-line">
                  <td className="py-1.5 pr-4 text-white">{name}</td>
                  <td className="font-mono text-ink">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-dim">{t('faithful.calibNote')}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => go({ name: 'dashboard' })}>{t('common.continue')}</Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!window.confirm(t('faithful.recalibConfirm'))) return;
                setResult(null);
                setAcc({});
                setStepIdx(0);
                setRunning(true);
              }}
            >
              {t('faithful.recalibrate')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!running)
    return (
      <div className="space-y-4">
        <H1 sub={t('faithful.calibSub')}>{t('faithful.calibTitle')}</H1>
        <Card className="max-w-2xl">
          <p className="text-sm text-ink">{t('faithful.calibIntro')}</p>
          <div className="mt-5">
            <Button onClick={() => setRunning(true)} autoFocus>
              {t('faithful.calibStart')}
            </Button>
          </div>
        </Card>
      </div>
    );

  const step = steps[stepIdx];
  const id = step.task as ExerciseId;
  const Comp: ComponentType<ExProps> = FAITHFUL_COMPONENTS[id] ?? EXERCISES[id].Component;
  const ctx: ExCtx = {
    exerciseId: id,
    seed: `cal:${stamp}:${step.task}:${step.level}`,
    level: 0,
    params: step.params,
    lang,
    settings,
    mode: 'assessment',
    recent: [],
    faithful: true,
    fixed: step.level === -1 ? { calibration: true } : undefined,
  };
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="violet">
          {stepIdx + 1} / {steps.length}
        </Badge>
        <span className="text-sm text-white">{t(`ex.${id}.name`)}</span>
        <Badge tone="dim">{t('faithful.calibStep')}</Badge>
      </div>
      <TimingGuard pausable>
        <Comp
          key={stepIdx}
          ctx={ctx}
          onDone={(o) => {
            const next = { ...acc };
            const d = o.detail as { levelAccuracy?: number[] } | undefined;
            if (step.level === -1 && d?.levelAccuracy) next[step.task] = d.levelAccuracy;
            else {
              const arr = (next[step.task] ?? [0, 0, 0]).slice();
              arr[step.level] = o.accuracy;
              next[step.task] = arr;
            }
            const f = typeof o.metrics.frameMs === 'number' ? o.metrics.frameMs : frameMs;
            setAcc(next);
            setFrameMs(f);
            if (stepIdx + 1 < steps.length) setStepIdx(stepIdx + 1);
            else finish(next, f);
          }}
        />
      </TimingGuard>
    </div>
  );
}

export function CalibrationNeeded() {
  const { go } = useApp();
  const { t } = useI18n();
  return (
    <Stage title={t('faithful.calibNeededTitle')} footer={<Button onClick={() => go({ name: 'calibration' })} autoFocus>{t('faithful.calibStart')}</Button>}>
      <p className="text-center text-white">{t('faithful.calibNeeded')}</p>
    </Stage>
  );
}
