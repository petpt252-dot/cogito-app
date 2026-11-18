import { useState } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { useData } from '../useData';
import { EXERCISES, GROUPS } from '../exercises/registry';
import { DOMAIN_COLOR } from '../ui/charts';
import { Badge, Button, Card, H1, H2 } from '../ui/kit';
import { ExerciseRunner, ProbeRunner } from '../exercises/runner';
import { newSessionSeed } from '../core/rng';
import { db } from '../core/storage';
import { isDue, msUntilDue } from '../core/scheduler';
import type { ExerciseId, StrategyId } from '../core/types';
import { Stage } from '../exercises/shared';

export function ModulesPage() {
  const { go } = useApp();
  const { t } = useI18n();
  const data = useData();
  const levelOf = (id: ExerciseId) => {
    const states = data.adaptive.filter((a) => a.exerciseId === id || a.exerciseId.startsWith(id + ':'));
    return states.length ? Math.max(...states.map((s) => s.level)) : 1;
  };
  return (
    <div>
      <H1 sub={t('modules.intro')}>{t('modules.title')}</H1>
      <div className="space-y-7">
        {GROUPS.map((g) => (
          <section key={g.key}>
            <H2>{t(`modules.groups.${g.key}`)}</H2>
            {(g.key === 'G' || g.key === 'P') && <p className="-mt-1 mb-3 text-xs text-dim">{t('modules.cogitoNote')}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {g.ids.map((id) => (
                <Card key={id} className="flex flex-col p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs" style={{ color: DOMAIN_COLOR[EXERCISES[id].domain] }}>
                      {id}
                    </span>
                    <span className="flex gap-1">
                      {EXERCISES[id].cogito && <Badge tone="volt">COGITO</Badge>}
                      {!EXERCISES[id].ownLevels && <Badge tone="dim">{t('modules.currentLevel', { l: levelOf(id) })}</Badge>}
                    </span>
                  </div>
                  <div className="mt-2 font-medium text-white">{t(`ex.${id}.name`)}</div>
                  <div className="mt-1 flex-1 text-xs text-dim">{t(`ex.${id}.short`)}</div>
                  <Button variant="ghost" className="mt-4" onClick={() => go({ name: 'exercise', id })}>
                    {t('modules.open')}
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        ))}
        <section>
          <H2>{t('modules.groups.F')}</H2>
          <Card className="flex items-center justify-between gap-4">
            <span className="text-sm text-dim">{t('strategies.intro')}</span>
            <Button variant="ghost" onClick={() => go({ name: 'strategies' })}>{t('nav.strategies')}</Button>
          </Card>
        </section>
      </div>
    </div>
  );
}

export function ExercisePage({ id, variant, strategy }: { id: ExerciseId; variant?: string; strategy?: StrategyId }) {
  const { go } = useApp();
  const [seed] = useState(() => `free:${newSessionSeed()}`);
  return <ExerciseRunner exerciseId={id} mode={strategy ? 'strategy' : 'free'} seedBase={seed} variant={variant} strategy={strategy} onExit={() => go(strategy ? { name: 'strategies' } : { name: 'modules' })} />;
}

/** Delayed-recall probes from free practice and spaced retrieval that are now due. */
export function ProbesPage() {
  const { go, bump } = useApp();
  const { t } = useI18n();
  const data = useData();
  const [active, setActive] = useState<string | null>(null);
  const pending = data.probes.filter((p) => !p.done && !p.sessionId).sort((a, b) => a.dueAt - b.dueAt);
  const probe = pending.find((p) => p.id === active);
  if (probe) return <ProbeRunner key={probe.id} probe={probe} onDone={() => setActive(null)} />;
  return (
    <div>
      <H1>{t('dashboard.delayedDue')}</H1>
      {!pending.length && (
        <Stage footer={<Button onClick={() => go({ name: 'dashboard' })}>{t('app.back')}</Button>}>
          <p className="text-center text-dim">{t('common.none')}</p>
        </Stage>
      )}
      <div className="space-y-2">
        {pending.map((p) => {
          const ready = isDue(p);
          return (
            <Card key={p.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="text-sm text-white">{t(`ex.${p.exerciseId}.name`)}</div>
                <div className="text-xs text-dim">
                  {new Date(p.createdAt).toLocaleString()} {p.kind === 'spaced' && `· ${t('strategies.retrieval.name')}`}
                  {p.overnight && ` · ${t('overnight.badge')}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {ready ? (
                  <Button onClick={() => setActive(p.id)}>{t('dashboard.doNow')}</Button>
                ) : (
                  <Badge tone="dim">{Math.ceil(msUntilDue(p) / 60000)} {t('common.minutes')}</Badge>
                )}
                {/* Optional material: dismissing it records nothing and only removes it from the list. */}
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await db.saveProbe({ ...p, done: true });
                    bump();
                  }}
                >
                  {t('common.skip')}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
