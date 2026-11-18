import { Fragment, useState } from 'react';
import { useI18n } from '../i18n';
import { useData } from '../useData';
import { Badge, Card, H1, H2, pct } from '../ui/kit';
import type { ExerciseId } from '../core/types';
import { MetricGrid } from '../exercises/runner';

export function HistoryPage() {
  const { t } = useI18n();
  const data = useData();
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);
  const trials = data.trials.filter((x) => filter === 'all' || x.exerciseId === filter).slice().reverse();
  const ids = [...new Set(data.trials.map((x) => x.exerciseId))].sort();
  const name = (id: string) => (id === 'F' ? t('nav.strategies') : id === 'T' ? t('transfer.title') : t(`ex.${id as ExerciseId}.name`));

  return (
    <div className="space-y-6">
      <H1>{t('history.title')}</H1>
      <Card>
        <H2>{t('history.sessions')}</H2>
        {data.sessions.length === 0 ? (
          <p className="text-sm text-dim">{t('common.none')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.sessions
              .slice()
              .reverse()
              .map((s) => (
                <div key={s.id} className="rounded-xl border border-line bg-panel2/50 px-3 py-2 text-xs">
                  <div className="text-white">{new Date(s.startedAt).toLocaleString()}</div>
                  <div className="text-dim">
                    {s.trialIds.length} {t('history.blocks').toLowerCase()} · {s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : '—'} {t('common.minutes')}
                    {s.programDay && ` · #${s.programDay}`} {!s.completed && <Badge tone="warn">×</Badge>}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>

      <Card>
        <H2
          right={
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('history.filter')} className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm text-white">
              <option value="all">{t('history.all')}</option>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id} · {name(id)}
                </option>
              ))}
            </select>
          }
        >
          {t('history.blocks')} ({trials.length})
        </H2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-dim">
              <tr>
                <th className="py-2">{t('history.date')}</th>
                <th>{t('history.exercise')}</th>
                <th>{t('history.mode')}</th>
                <th>{t('common.level')}</th>
                <th>{t('common.accuracy')}</th>
                <th>{t('history.duration')}</th>
              </tr>
            </thead>
            <tbody>
              {trials.map((x) => (
                <Fragment key={x.id}>
                  <tr className="cursor-pointer border-t border-line hover:bg-panel2/40" onClick={() => setOpen(open === x.id ? null : x.id)}>
                    <td className="py-2 text-dim">{new Date(x.startedAt).toLocaleString()}</td>
                    <td className="text-white">
                      <span className="font-mono text-xs text-dim">{x.exerciseId}</span> {name(x.exerciseId)}
                      {x.delayed && <span className="ml-2"><Badge tone="volt">{t('history.delayedTag')}</Badge></span>}
                      {x.strategy && <span className="ml-2"><Badge tone="dim">{t(`strategies.${x.strategy}.name`)}</Badge></span>}
                    </td>
                    <td className="text-dim">{t(`history.modes.${x.mode}`)}</td>
                    <td className="font-mono text-ink">{x.level || '—'}</td>
                    <td className="font-mono text-white">{pct(x.accuracy)}</td>
                    <td className="font-mono text-dim">{Math.round((x.endedAt - x.startedAt) / 1000)}s</td>
                  </tr>
                  {open === x.id && (
                    <tr>
                      <td colSpan={6} className="pb-4">
                        <MetricGrid metrics={x.metrics} />
                        <div className="mt-2 font-mono text-[11px] text-dim">
                          {x.conditionKey} · {t('history.seed')}: {x.seed} · {x.lang.toUpperCase()}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
