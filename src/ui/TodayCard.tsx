import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { buildPlan, COGITO_SESSION_MINUTES, isFixedDose, usesStudyDose, dailySeed, planMinutes, PROGRAM_LENGTH, programDay, RECOMMENDED, SESSION_LENGTHS, type PlanSlot } from '../core/protocol';
import type { I18n } from '../i18n';
import type { ExerciseId, SessionRecord, Settings, TrainingGoal, TrialResult } from '../core/types';
import { dayStreak } from '../core/streak';
import { Segmented, cx, useKey } from './kit';
import { ProtocolPicker } from './ProtocolPicker';

/** The plan a session will run, from settings, recent practice and a seed. Shared by the dashboard preview and the session page. */
export function planFor(settings: Settings, trials: TrialResult[], seed: string): PlanSlot[] {
  const minutes = settings.sessionMinutes === 0 ? settings.customMinutes : settings.sessionMinutes;
  const recent = trials.filter((x) => x.mode === 'training').map((x) => x.exerciseId as ExerciseId);
  return buildPlan({ minutes, includeWorking: settings.includeWorkingMemory, recent, seed, delayed: settings.delayedRecall, protocol: settings.protocol, goal: settings.goal, studyDose: settings.studyDose });
}

/** "Session 5 / 30" in the introductory cycle, "Cycle 2 · session 5 / 30" afterwards. */
export function sessionLabel(t: I18n['t'], sessionNumber: number): string {
  const p = programDay(sessionNumber);
  return `${p.cycle === 1 ? t('today.session', { d: p.dayInCycle }) : t('today.cycleSession', { c: p.cycle, d: p.dayInCycle })} / ${PROGRAM_LENGTH}`;
}

// "2010 retro-futurism" in the app's own palette: glossy Web 2.0 / Aero glass (nostalgic)
// over a neon perspective grid (futuristic). Colours: violet #9B6BFF, electric blue #3DA9FF.

/** Glossy arrow with a highlight band, pointing at the start button. */
function GlossArrow({ className }: { className?: string }) {
  const body = 'M6 30 H58 V12 L94 44 L58 76 V58 H6 Z';
  return (
    <svg viewBox="0 0 100 88" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="arrowFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B99BFF" />
          <stop offset="0.55" stopColor="#7C4DFF" />
          <stop offset="1" stopColor="#2A7BFF" />
        </linearGradient>
        <linearGradient id="arrowGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="arrowClip">
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill="url(#arrowFill)" stroke="#CFE6FF" strokeWidth="2" strokeLinejoin="round" />
      <rect x="0" y="0" width="100" height="44" fill="url(#arrowGloss)" clipPath="url(#arrowClip)" />
    </svg>
  );
}

/** Neon perspective grid floor with a glowing horizon. */
function GridFloor() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-x-0 top-0 h-px bg-volt shadow-[0_0_18px_3px_rgba(61,169,255,.8)]" />
      <div
        className="absolute -inset-x-1/2 top-0 h-[260%] origin-top"
        style={{
          transform: 'perspective(260px) rotateX(62deg)',
          backgroundImage: 'linear-gradient(rgba(61,169,255,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(155,107,255,.5) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,.9), transparent 70%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,.9), transparent 70%)',
        }}
      />
    </div>
  );
}

/** Glossy Web 2.0 pill: gradient body, white gloss on the top half, soft neon halo. */
function GlossPill({ children, className, tone = 'blue' }: { children: ReactNode; className?: string; tone?: 'blue' | 'green' }) {
  const body = tone === 'blue' ? 'from-[#8CC8FF] via-volt to-[#2A62FF] border-[#1E4FD8] shadow-[0_0_34px_-4px_rgba(61,169,255,.85)]' : 'from-[#8BF0C4] via-ok to-[#14A36B] border-[#0E7A50] shadow-[0_0_26px_-6px_rgba(61,220,151,.8)]';
  return (
    <span className={cx('relative inline-flex items-center overflow-hidden rounded-full border bg-gradient-to-b', body, className)}>
      <span className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-full bg-gradient-to-b from-white/70 to-white/5" />
      <span className="relative">{children}</span>
    </span>
  );
}

export function TodayCard({ trials, sessions, completed }: { trials: TrialResult[]; sessions: SessionRecord[]; completed: number }) {
  const sessionsStarted = sessions.length;
  const streak = dayStreak(sessions);
  const { settings, updateSettings, go } = useApp();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const seed = dailySeed(sessionsStarted + 1);
  const plan = useMemo(() => planFor(settings, trials, seed), [settings, trials, seed]);
  // Block-based plans (COGITO, faithful) are lists of blocks, so their length is the plan's estimate, not the setting.
  const blockBased = usesStudyDose(settings);
  const minutes = blockBased ? planMinutes(plan) : settings.sessionMinutes === 0 ? settings.customMinutes : settings.sessionMinutes;
  const fullDose = blockBased || minutes >= COGITO_SESSION_MINUTES;
  const day = completed + 1;
  // The adaptive protocol's length is set by its blocks, so only the protocol matters here.
  const isRecommended = settings.protocol === RECOMMENDED.protocol;
  const start = () => go({ name: 'session' });
  // Phones: the plan is folded so the start button stays in the first screen.
  const [showPlan, setShowPlan] = useState(false);
  // A session left in progress (the session page offers to resume it).
  const unfinished = sessions.find((s) => !s.completed && !s.endedAt && s.plan?.length && Date.now() - s.startedAt < 86_400_000 && (s.slot ?? 0) < s.plan.length);
  useKey(['Enter'], start, !editing);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-volt/50 bg-gradient-to-b from-panel2 via-panel to-void px-6 pb-36 pt-7 animate-neon sm:px-8">
      {/* Aero-style glass sheen across the top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.07] to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-10 h-56 w-80 rounded-full bg-volt/20 blur-3xl" />
      <GridFloor />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          {unfinished && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-volt/60 bg-volt/10 p-3">
              <span className="text-sm text-white">{t('today.unfinished', { when: new Date(unfinished.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>
              <button type="button" onClick={start} className="transition hover:brightness-110">
                <GlossPill className="px-4 py-1.5">
                  <span className="text-sm font-bold text-white">{t('session.resume')} →</span>
                </GlossPill>
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span translate="no" className="notranslate text-xs font-semibold uppercase tracking-[0.3em] text-volt">{sessionLabel(t, day)}</span>
            {streak.days > 0 && (
              <span className="rounded-full border border-warn/50 bg-warn/10 px-2.5 py-0.5 text-xs font-semibold text-white" title={t(streak.today ? 'streak.doneToday' : 'streak.keepItUp')}>
                🔥 {t(streak.days === 1 ? 'streak.day1' : 'streak.days', { n: streak.days })}
              </span>
            )}
          </div>
          <h1
            className="mt-2 bg-gradient-to-b from-white via-[#CFE2FF] to-violet bg-clip-text pb-1 font-display text-5xl font-semibold leading-tight tracking-tight text-transparent sm:text-6xl"
            style={{
              filter: 'drop-shadow(0 0 14px rgba(155,107,255,.65)) drop-shadow(0 0 2px rgba(61,169,255,.9))',
              WebkitBoxReflect: 'below -10px linear-gradient(transparent 62%, rgba(255,255,255,.22))',
            }}
          >
            {t('today.title')}
          </h1>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* Training time, anchored to the COGITO daily dose: glossy electric-blue pill. */}
            <GlossPill className="px-5 py-2">
              <span className="font-display text-3xl font-bold leading-none text-white" style={{ textShadow: '0 1px 2px rgba(10,30,90,.6)' }}>
                {blockBased ? '≈' : ''}
                {minutes}
              </span>
              <span className="ml-1 text-sm font-semibold text-white/90">min</span>
            </GlossPill>
            <span className="text-xs leading-snug">
              <span className={cx('block', fullDose ? 'font-semibold text-volt' : 'text-dim')}>{fullDose ? t('today.cogitoTime') : t('today.belowCogito')}</span>
              <span className="block text-ink">
                {t(`protocol.${settings.protocol}`)}
                {settings.protocol === 'hybrid' && <span className="text-dim"> · {t(`goal.${settings.goal}`)}</span>}
              </span>
            </span>
            {!unfinished && (
              <button type="button" onClick={start} className="transition hover:brightness-110 active:scale-[0.98] lg:hidden">
                <GlossPill className="px-5 py-2">
                  <span className="text-base font-bold text-white">{t('today.go')} →</span>
                </GlossPill>
              </button>
            )}
          </div>

          <button type="button" onClick={() => setShowPlan(!showPlan)} aria-expanded={showPlan} className="mt-4 text-xs text-volt underline decoration-dotted underline-offset-4 lg:hidden">
            {t(showPlan ? 'today.hidePlan' : 'today.showPlan', { n: plan.length })}
          </button>
          <ol className={cx('mt-4 flex-wrap gap-1.5', showPlan ? 'flex' : 'hidden lg:flex')}>
            {plan.map((p, i) => (
              <li key={i} className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur">
                {p.exerciseId ? t(`ex.${p.exerciseId}.name`) : t('session.slot.delayed')}
                <span className="ml-1.5 font-mono text-[10px] text-volt">{p.blocks ? `${p.blocks}×` : `${Number.isInteger(p.minutes * 2) ? p.minutes : p.minutes.toFixed(2)}′`}</span>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-xs text-dim">
            {t('dashboard.strategyTip')}: <span className="text-ink">{t(`strategies.${programDay(day).strategy}.name`)}</span>
          </p>

          <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing} className="mt-4 text-sm font-medium text-volt underline decoration-dotted underline-offset-4 hover:text-white">
            ✎ {editing ? t('today.close') : t('today.modify')}
          </button>

          {editing && (
            <div className="mt-3 space-y-3">
              <div className="relative overflow-hidden rounded-2xl border border-ok/60 bg-gradient-to-br from-ok/15 via-panel2/80 to-void p-4 shadow-[0_0_30px_-10px_rgba(61,220,151,.7)]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent" />
                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <GlossPill tone="green" className="px-2.5 py-0.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#06351F]">★ {t('today.recommended')}</span>
                    </GlossPill>
                    <p className="mt-2 text-sm text-white">{t('today.recommendedText')}</p>
                    <p className="mt-1 text-[11px] text-ok/80">{t('today.recommendedCaveat')}</p>
                  </div>
                  {isRecommended ? (
                    <span className="rounded-full border border-ok px-4 py-2 text-sm font-semibold text-ok">✓ {t('today.active')}</span>
                  ) : (
                    <button type="button" onClick={() => updateSettings({ ...RECOMMENDED })} className="transition hover:brightness-110 active:scale-[0.98]">
                      <GlossPill tone="green" className="px-5 py-2">
                        <span className="text-sm font-bold text-[#06351F]">{t('today.useRecommended')}</span>
                      </GlossPill>
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-3 rounded-2xl border border-line bg-void/70 p-4 backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-wider text-violet">{t('today.yours')}</div>
                {isFixedDose(settings.protocol) && (
                  <Row label={t('today.dose')}>
                    <Segmented<'study' | 'time'> value={settings.studyDose === false ? 'time' : 'study'} onChange={(v) => updateSettings({ studyDose: v === 'study' })} options={[{ value: 'study', label: t('settings.dose.study') }, { value: 'time', label: t('settings.dose.time') }]} />
                  </Row>
                )}
                <Row label={t('today.length')}>
                  {blockBased ? (
                    <span className="text-xs text-dim">{t('today.cogitoFixed')}</span>
                  ) : (
                    <Segmented<number> value={settings.sessionMinutes === 0 ? 15 : settings.sessionMinutes} onChange={(sessionMinutes) => updateSettings({ sessionMinutes })} options={SESSION_LENGTHS.map((m) => ({ value: m as number, label: `${m}′` }))} />
                  )}
                </Row>
                <Row label={t('today.protocol')}>
                  <ProtocolPicker value={settings.protocol} onChange={(protocol) => updateSettings({ protocol })} />
                </Row>
                {settings.protocol === 'hybrid' && (
                  <Row label={t('today.goal')}>
                    <Segmented<TrainingGoal> value={settings.goal} onChange={(goal) => updateSettings({ goal })} options={(['broad', 'episodic'] as TrainingGoal[]).map((g) => ({ value: g, label: t(`goal.${g}`) }))} />
                  </Row>
                )}
                <p className="text-[11px] text-dim">{t('today.note')}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row lg:shrink-0">
          <GlossArrow className="h-20 w-24 animate-nudgeY drop-shadow-[0_0_14px_rgba(155,107,255,.9)] sm:animate-nudge" />
          <button type="button" onClick={start} className="group transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0.5">
            <GlossPill className="px-10 py-5">
              <span className="font-display text-3xl font-semibold text-white" style={{ textShadow: '0 1px 2px rgba(10,30,90,.7), 0 0 14px rgba(255,255,255,.35)' }}>
                {t('today.go')} →
              </span>
            </GlossPill>
          </button>
        </div>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-24 shrink-0 text-xs uppercase tracking-wider text-dim">{label}</span>
      {children}
    </div>
  );
}
