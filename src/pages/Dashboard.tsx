import { useApp } from '../state';
import { useI18n } from '../i18n';
import { useData } from '../useData';
import { Button, Card, H2, Meter, Stat, pct } from '../ui/kit';
import { DOMAINS } from '../exercises/registry';
import { DOMAIN_COLOR } from '../ui/charts';
import { mean } from '../core/stats';
import { COGITO_REFERENCE_HOURS, cycleProgress, daysTrainedLastWeek, PROGRAM_LENGTH } from '../core/protocol';
import { reassessmentDue } from '../core/assessmentPlan';
import { isDue } from '../core/scheduler';
import { CommunityCard } from '../ui/community';
import { TodayCard } from '../ui/TodayCard';
import { TransferCard } from '../ui/TransferCard';

export function Dashboard() {
  const { go, settings } = useApp();
  const { t } = useI18n();
  const d = useData();
  const training = d.trials.filter((x) => x.mode !== 'assessment');
  const completed = d.sessions.filter((s) => s.completed).length;
  const due = d.probes.filter((p) => isDue(p) && !p.sessionId);
  const needsAssessment = reassessmentDue(completed, d.assessments);
  const hasBaseline = d.assessments.some((a) => a.completed);
  const hours = training.reduce((a, x) => a + (x.endedAt - x.startedAt), 0) / 3_600_000;
  const trained = daysTrainedLastWeek(d.sessions.filter((s) => s.completed).map((s) => s.startedAt));

  return (
    <div className="space-y-6">
      <TodayCard trials={d.trials} sessions={d.sessions} completed={completed} />

      <CommunityCard />

      <TransferCard hasData={d.trials.length > 0} />

      {(needsAssessment || due.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {needsAssessment && (
            <Card className="flex items-center justify-between gap-4 border-warn/40">
              <span className="text-sm text-warn">{hasBaseline ? t('dashboard.reassessDue') : t('dashboard.baselineNeeded')}</span>
              <Button variant="ghost" onClick={() => go({ name: 'assessment' })}>{t('dashboard.runAssessment')}</Button>
            </Card>
          )}
          {due.length > 0 && (
            <Card className="flex items-center justify-between gap-4 border-volt/40">
              <span className="text-sm text-volt">
                {t('dashboard.delayedDue')}: {due.length}
              </span>
              <Button variant="ghost" onClick={() => go({ name: 'probes' })}>{t('dashboard.doNow')}</Button>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('dashboard.sessions')} value={completed} sub={(() => { const c = cycleProgress(completed); return c.cycle === 1 ? `${c.done} / ${PROGRAM_LENGTH}` : `${t('sidebar.cycle', { c: c.cycle })} · ${c.done} / ${PROGRAM_LENGTH}`; })()} />
        <Stat label={t('dashboard.totalBlocks')} value={training.length} />
        <Stat label={t('dashboard.streak')} value={`${trained} / 7`} sub={t('dashboard.target', { n: settings.daysPerWeek })} />
        <Stat label={t('dashboard.exposure')} value={`${hours.toFixed(1)} h`} sub={t('dashboard.exposureRef', { h: COGITO_REFERENCE_HOURS })} />
      </div>

      <div>
        <H2>{t('dashboard.domains')}</H2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {DOMAINS.map((dom) => {
            const xs = training.filter((x) => x.domain === dom && !x.delayed).slice(-5);
            const m = xs.length ? mean(xs.map((x) => x.accuracy)) : null;
            return (
              <Card key={dom} className="p-4">
                <div className="flex items-center gap-2 text-xs text-dim">
                  <span className="h-2 w-2 rounded-full" style={{ background: DOMAIN_COLOR[dom] }} />
                  {t(`domain.${dom}`)}
                </div>
                <div className="mt-2 font-mono text-2xl text-white">{m === null ? '—' : pct(m)}</div>
                <div className="mt-2">
                  <Meter value={m ?? 0} tone={dom === 'working' ? 'volt' : 'violet'} />
                </div>
                <div className="mt-1.5 text-[11px] text-dim">{xs.length ? t('dashboard.lastBlocks') : t('dashboard.noData')}</div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            ['modules', 'nav.modules'],
            ['strategies', 'nav.strategies'],
            ['analytics', 'nav.analytics'],
          ] as const
        ).map(([v, k]) => (
          <button key={v} onClick={() => go({ name: v })} className="rounded-2xl border border-line bg-panel/60 p-5 text-left transition hover:border-violet hover:shadow-neon">
            <div className="text-sm font-medium text-white">{t(k)}</div>
            <div className="mt-1 text-xs text-dim">→</div>
          </button>
        ))}
      </div>

      <p className="text-xs text-dim">{t('dashboard.disclaimer')}</p>
    </div>
  );
}
