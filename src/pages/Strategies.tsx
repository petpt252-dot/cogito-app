import { useEffect, useState } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { useData } from '../useData';
import { Badge, Button, Card, H1, pct } from '../ui/kit';
import type { StrategyId } from '../core/types';
import { ElaborationPractice, LociPractice, RetrievalPractice } from '../exercises/strategies';
import { ExercisePage } from './Modules';
import { recentItems } from '../exercises/runner';
import { mean } from '../core/stats';

export const STRATEGIES: { id: StrategyId; code: string; evidence: 'established' | 'mixed' }[] = [
  { id: 'imagery', code: 'F1', evidence: 'mixed' },
  { id: 'elaboration', code: 'F2', evidence: 'established' },
  { id: 'clustering', code: 'F3', evidence: 'established' },
  { id: 'loci', code: 'F4', evidence: 'mixed' },
  { id: 'retrieval', code: 'F5', evidence: 'established' },
];

export function StrategiesPage() {
  const { go } = useApp();
  const { t } = useI18n();
  const data = useData();
  return (
    <div>
      <H1 sub={t('strategies.intro')}>{t('strategies.title')}</H1>
      <div className="grid gap-4 md:grid-cols-2">
        {STRATEGIES.map((s) => {
          const xs = data.trials.filter((x) => x.strategy === s.id && !x.delayed);
          return (
            <Card key={s.id} className="flex flex-col">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-volt">{s.code}</span>
                <Badge tone={s.evidence === 'established' ? 'ok' : 'warn'}>{t(`strategies.${s.evidence}`)}</Badge>
              </div>
              <div className="mt-2 text-lg font-medium text-white">{t(`strategies.${s.id}.name`)}</div>
              <p className="mt-1 text-sm text-ink">{t(`strategies.${s.id}.what`)}</p>
              <p className="mt-3 flex-1 text-xs text-dim">
                <span className="uppercase tracking-wider">{t('strategies.evidence')}:</span> {t(`strategies.${s.id}.evidence`)}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-dim">{xs.length ? `${xs.length} × · ${pct(mean(xs.map((x) => x.accuracy)))}` : ''}</span>
                <Button variant="ghost" onClick={() => go({ name: 'strategy', id: s.id })}>{t('strategies.practise')}</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function StrategyPage({ id }: { id: StrategyId }) {
  const { go } = useApp();
  const { t } = useI18n();
  const back = () => go({ name: 'strategies' });
  // Words seen recently in any task are avoided here too.
  const [recent, setRecent] = useState<string[] | null>(null);
  useEffect(() => {
    recentItems().then(setRecent, () => setRecent([]));
  }, []);
  if (id === 'imagery') return <ExercisePage id="B1" strategy="imagery" />;
  if (id === 'clustering') return <ExercisePage id="A2" strategy="clustering" />;
  if (!recent) return <div className="text-dim">{t('common.loading')}</div>;
  if (id === 'elaboration') return <ElaborationPractice onExit={back} recent={recent} />;
  if (id === 'loci') return <LociPractice onExit={back} recent={recent} />;
  return <RetrievalPractice onExit={back} recent={recent} />;
}
