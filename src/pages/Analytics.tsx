import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useData } from '../useData';
import { DOMAINS } from '../exercises/registry';
import { DOMAIN_COLOR, GroupedBars, LineChart, SERIES, type Series } from '../ui/charts';
import { Button, Card, H1, H2, Segmented, num, pct } from '../ui/kit';
import { assessmentsCsv, download, trialsCsv } from '../core/csv';
import { mean } from '../core/stats';
import { LEVELS } from '../core/levels';
import { AdaptiveProgress } from '../ui/AdaptiveProgress';
import type { AssessmentTestKey, ExerciseId } from '../core/types';

const ASSESS_ROWS: { key: AssessmentTestKey; metric: string; fmt: (v: number) => string }[] = [
  { key: 'immediateVerbal', metric: 'correct', fmt: (v) => `${v}/12` },
  { key: 'delayedVerbal', metric: 'correct', fmt: (v) => `${v}/12` },
  { key: 'visualRecognition', metric: 'dPrimeCorrected', fmt: (v) => v.toFixed(2) },
  { key: 'visualReconstruction', metric: 'accuracy', fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'associative', metric: 'correct', fmt: (v) => `${v}/6` },
  { key: 'wmSpan', metric: 'span', fmt: (v) => String(v) },
];

const TRANSFER_ROWS: { key: AssessmentTestKey; metric: string }[] = [
  { key: 'symbolDigit', metric: 'correct' },
  { key: 'series', metric: 'correct' },
  { key: 'corsi', metric: 'span' },
];

export function AnalyticsPage() {
  const { t } = useI18n();
  const data = useData();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const training = data.trials.filter((x) => x.mode !== 'assessment' && !x.delayed && x.exerciseId !== 'F');

  const domainSeries: Series[] = DOMAINS.map((d) => ({
    key: d,
    label: t(`domain.${d}`),
    color: DOMAIN_COLOR[d],
    points: training.filter((x) => x.domain === d).map((x, i) => ({ x: i + 1, y: x.accuracy, tip: `${x.exerciseId} L${x.level}` })),
  })).filter((s) => s.points.length);

  // COGITO faithful/adaptive blocks have no levels (fixed or staircase difficulty), so they are left out of the level chart.
  const levelled = training.filter((x) => !/^[SF]-/.test(x.conditionKey) && x.params.stairLevel === undefined);
  const hasStaircase = training.some((x) => x.conditionKey.startsWith('S-') || x.params.stairLevel !== undefined);
  const exerciseKeys = useMemo(() => [...new Set(levelled.map((x) => x.exerciseId as ExerciseId))].sort(), [data.trials]);
  const [levelEx, setLevelEx] = useState<ExerciseId | null>(null);
  const ex = levelEx ?? exerciseKeys[0] ?? null;
  const levelTrials = levelled.filter((x) => x.exerciseId === ex);

  const effGroups = useMemo(() => {
    const m = new Map<string, { y: number; at: number }[]>();
    data.trials.forEach((x) => {
      const v = x.metrics.efficiency;
      if (typeof v === 'number') m.set(x.conditionKey, [...(m.get(x.conditionKey) ?? []), { y: v, at: x.startedAt }]);
    });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [data.trials]);
  const [effKey, setEffKey] = useState<string | null>(null);
  const effSel = effGroups.find(([k]) => k === (effKey ?? effGroups[0]?.[0]));

  const delayed = data.trials.filter((x) => x.delayed && typeof x.metrics.retention === 'number');
  const assessments = data.assessments.filter((a) => a.completed && a.kind !== 'transfer' && a.kind !== 'near');
  const transfers = data.assessments.filter((a) => a.completed && a.kind === 'transfer');
  const tShown = transfers.length > 4 ? [transfers[0], ...transfers.slice(-3)] : transfers;
  const shown = assessments.length > 4 ? [assessments[0], ...assessments.slice(-3)] : assessments;

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`cogito-training-${stamp}.csv`, trialsCsv(data.trials));
    if (assessments.length || transfers.length) download(`cogito-assessments-${stamp}.csv`, assessmentsCsv([...assessments, ...transfers]));
  };

  return (
    <div className="space-y-6">
      <H1>{t('analytics.title')}</H1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: 'chart', label: '📈' }, { value: 'table', label: '▦' }]} />
        <Button variant="ghost" onClick={exportCsv} disabled={!data.trials.length}>{t('analytics.exportCsv')}</Button>
      </div>

      {!training.length && <Card><p className="text-sm text-dim">{t('analytics.empty')}</p></Card>}

      <AdaptiveProgress trials={training} view={view} />

      {training.length > 0 && (
        <Card>
          <H2>{t('analytics.byDomain')}</H2>
          {hasStaircase && <p className="mb-3 text-xs text-dim">{t('analytics.byDomainAdaptive')}</p>}
          {view === 'chart' ? (
            <LineChart series={domainSeries} xLabel={t('common.block')} />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {DOMAINS.map((d) => {
                  const xs = training.filter((x) => x.domain === d);
                  return (
                    <tr key={d} className="border-t border-line">
                      <td className="py-2 text-ink">{t(`domain.${d}`)}</td>
                      <td className="font-mono text-dim">{xs.length}</td>
                      <td className="font-mono text-white">{xs.length ? pct(mean(xs.map((x) => x.accuracy))) : '—'}</td>
                      <td className="font-mono text-dim">{xs.length ? pct(mean(xs.slice(-5).map((x) => x.accuracy))) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {ex && (
        <Card>
          <H2 right={<Segmented value={ex} onChange={(v) => setLevelEx(v)} options={exerciseKeys.map((k) => ({ value: k, label: k }))} />}>{t('analytics.levels')}</H2>
          <div className="mb-2 text-sm text-white">{t(`ex.${ex}.name`)}</div>
          {view === 'chart' ? (
            <LineChart
              series={[{ key: ex, label: ex, color: SERIES[4], points: levelTrials.map((x, i) => ({ x: i + 1, y: x.level, tip: pct(x.accuracy) })) }]}
              yMax={LEVELS[ex].length}
              yFormat={(v) => String(Math.round(v))}
              xLabel={t('common.block')}
            />
          ) : (
            <p className="font-mono text-sm text-ink">{levelTrials.map((x) => `L${x.level} (${pct(x.accuracy)})`).join(' · ')}</p>
          )}
        </Card>
      )}

      <Card>
        <H2>{t('analytics.efficiency')}</H2>
        <p className="mb-3 text-xs text-dim">{t('analytics.efficiencyNote')}</p>
        {effGroups.length === 0 ? (
          <p className="text-sm text-dim">{t('common.none')}</p>
        ) : (
          <>
            <select
              value={effSel?.[0]}
              onChange={(e) => setEffKey(e.target.value)}
              className="mb-3 w-full max-w-lg rounded-lg border border-line bg-panel2 px-3 py-2 font-mono text-xs text-white"
              aria-label={t('analytics.condition')}
            >
              {effGroups.map(([k, v]) => (
                <option key={k} value={k}>
                  {k} ({v.length})
                </option>
              ))}
            </select>
            {effSel && view === 'chart' && (
              <LineChart
                series={[{ key: 'eff', label: t('metric.efficiency'), color: SERIES[0], points: effSel[1].map((p, i) => ({ x: i + 1, y: p.y, tip: new Date(p.at).toLocaleDateString() })) }]}
                yMax={Math.max(1, ...effSel[1].map((p) => p.y)) * 1.15}
                yFormat={(v) => v.toFixed(1)}
                xLabel={t('common.block')}
              />
            )}
            {effSel && view === 'table' && <p className="font-mono text-sm text-ink">{effSel[1].map((p) => num(p.y)).join(' · ')}</p>}
          </>
        )}
      </Card>

      <Card>
        <H2>{t('analytics.retention')}</H2>
        {delayed.length === 0 ? (
          <p className="text-sm text-dim">{t('common.none')}</p>
        ) : view === 'chart' ? (
          <LineChart
            series={[{ key: 'ret', label: t('metric.retention'), color: SERIES[2], points: delayed.map((x, i) => ({ x: i + 1, y: x.metrics.retention as number, tip: `${x.exerciseId} · ${x.metrics.delayMinutes ?? '?'} min` })) }]}
            yMax={Math.max(1, ...delayed.map((x) => x.metrics.retention as number))}
            xLabel={t('common.block')}
          />
        ) : (
          <p className="font-mono text-sm text-ink">{delayed.map((x) => `${x.exerciseId}: ${pct(x.metrics.retention)}`).join(' · ')}</p>
        )}
      </Card>

      <Card>
        <H2>{t('analytics.assessments')}</H2>
        {shown.length === 0 ? (
          <p className="text-sm text-dim">{t('analytics.noAssessments')}</p>
        ) : (
          <GroupedBars
            groups={shown.map((a, i) => ({ label: `${new Date(a.startedAt).toLocaleDateString()} · ${a.kind === 'baseline' ? t('assessment.baseline') : t('assessment.form', { f: a.form + 1 })}`, color: SERIES[i % SERIES.length] }))}
            rows={ASSESS_ROWS.map((r) => ({ label: t(`assessment.tests.${r.key}`), values: shown.map((a) => (a.results[r.key]?.[r.metric] ?? null) as number | null) }))}
            format={(v) => num(v)}
          />
        )}
      </Card>

      <Card>
        <H2>{t('transfer.title')}</H2>
        <p className="mb-3 text-xs text-dim">{t('transfer.analyticsNote')}</p>
        {tShown.length === 0 ? (
          <p className="text-sm text-dim">{t('analytics.noAssessments')}</p>
        ) : (
          <GroupedBars
            groups={tShown.map((a, i) => ({ label: `${new Date(a.startedAt).toLocaleDateString()} · ${t('assessment.form', { f: a.form + 1 })}`, color: SERIES[i % SERIES.length] }))}
            rows={TRANSFER_ROWS.map((r) => ({ label: t(`assessment.tests.${r.key}`), values: tShown.map((a) => (a.results[r.key]?.[r.metric] ?? null) as number | null) }))}
            format={(v) => num(v)}
          />
        )}
      </Card>
    </div>
  );
}
