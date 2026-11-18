import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { hardness, taskProgress } from '../core/stairProgress';
import { STAIRS } from '../core/staircase';
import type { ExerciseId, TrialResult } from '../core/types';
import { LineChart, SERIES } from './charts';
import { Card, H2, Segmented, cx, pct } from './kit';

const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`;

/**
 * COGITO adaptive: the level each task reached, session by session. Accuracy stays near 80% by design, so the level
 * is what shows progress; warnings flag tasks whose level is not following the person.
 */
export function AdaptiveProgress({ trials, view }: { trials: TrialResult[]; view: 'chart' | 'table' }) {
  const { t } = useI18n();
  const tasks = useMemo(
    () => (Object.keys(STAIRS) as ExerciseId[]).map((id) => taskProgress(trials, id)).filter((p) => p.points.length),
    [trials],
  );
  const [sel, setSel] = useState<ExerciseId | null>(null);
  if (!tasks.length) return null;
  const cur = tasks.find((p) => p.id === sel) ?? tasks[0];
  const unit = (id: ExerciseId) => t(`adaptive.unit.${STAIRS[id]!.unit}`);
  const first = cur.points[0].value;
  const ys = cur.points.map((p) => 1 + hardness(cur.id, p.value, first));

  return (
    <Card>
      <H2>{t('adaptiveProgress.title')}</H2>
      <p className="mb-3 text-xs text-dim">{t('adaptiveProgress.note')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-dim">
            <tr>
              <th className="py-2 pr-3">{t('adaptive.task')}</th>
              <th className="pr-3">{t('adaptiveProgress.now')}</th>
              <th className="pr-3">{t('adaptiveProgress.change')}</th>
              <th className="pr-3">{t('adaptiveProgress.trend')}</th>
              <th className="pr-3">{t('adaptiveProgress.accuracy')}</th>
              <th>{t('adaptiveProgress.check')}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((p) => (
              <tr key={p.id} className={cx('cursor-pointer border-t border-line', p.id === cur.id && 'bg-white/[0.04]')} onClick={() => setSel(p.id)}>
                <td className="py-1.5 pr-3 text-white">{t(`ex.${p.id}.name`)}</td>
                <td className="pr-3 font-mono text-ink">
                  {p.points[p.points.length - 1].value} <span className="text-xs text-dim">{unit(p.id)}</span>
                </td>
                <td className={cx('pr-3 font-mono', p.trend === 'few' ? 'text-dim' : p.change > 0 ? 'text-ok' : p.change < 0 ? 'text-warn' : 'text-ink')}>
                  {p.points.length > 1 ? signed(p.change) : '—'}
                </td>
                <td className="pr-3 text-xs text-ink">{t(`adaptiveProgress.trend_${p.trend}`, { n: p.points.length })}</td>
                <td className="pr-3 font-mono text-ink">{pct(p.recentAccuracy)}</td>
                <td className="text-xs">
                  {p.warnings.length ? (
                    <span className="text-warn">⚠ {p.warnings.map((w) => t(`adaptiveProgress.warn_${w}`)).join(' · ')}</span>
                  ) : p.trend === 'few' ? (
                    <span className="text-dim">—</span>
                  ) : (
                    <span className="text-ok">✓ {t('adaptiveProgress.ok')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-white">{t(`ex.${cur.id}.name`)}</div>
        <Segmented value={cur.id} onChange={setSel} options={tasks.map((p) => ({ value: p.id, label: p.id }))} />
      </div>
      {view === 'chart' ? (
        <LineChart
          series={[
            {
              key: cur.id,
              label: t('adaptiveProgress.vsStart'),
              color: SERIES[0],
              points: cur.points.map((p, i) => ({ x: i + 1, y: ys[i], tip: `${p.value} ${unit(cur.id)} · ${pct(p.accuracy)} · ${new Date(p.at).toLocaleDateString()}` })),
            },
          ]}
          yMax={Math.max(1.2, ...ys) * 1.1}
          yFormat={(v) => signed(v - 1)}
          xLabel={t('adaptiveProgress.session')}
        />
      ) : (
        <p className="font-mono text-sm text-ink">{cur.points.map((p) => `${p.value} (${pct(p.accuracy)})`).join(' · ')}</p>
      )}
      <p className="mt-2 text-xs text-dim">{t(STAIRS[cur.id]!.largerIsHarder ? 'adaptiveProgress.upSize' : 'adaptiveProgress.upTime')}</p>
    </Card>
  );
}
