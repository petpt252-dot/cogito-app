import type { ReactNode } from 'react';
import { useApp, type View } from '../state';
import { useI18n } from '../i18n';
import { useData } from '../useData';
import { cx } from './kit';
import { CommunityLink } from './community';
import { cycleProgress, daysTrainedLastWeek, PROGRAM_LENGTH } from '../core/protocol';
import type { Lang } from '../core/types';

// Sidebar in the app's 2010 retro-futurist style: glossy glass tiles, neon accents, violet/electric blue.

const ICONS: Record<string, ReactNode> = {
  dashboard: <path d="M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" />,
  session: <path d="M8 5.5v13l10.5-6.5z" />,
  modules: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  strategies: <path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.3 5.8L12 16l-5 3 1.3-5.8L4 9.3l5.6-.7z" />,
  assessment: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />,
  analytics: <path d="M4 19h16M6 16l4-5 3 3 5-7" />,
  history: <path d="M12 7v5l3 2M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 5v4h4" />,
  settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm8 3l-2 .8-.4 1.2 1 1.9-1.4 1.4-1.9-1-1.2.4L13.3 20h-2l-.8-2-1.2-.5-1.9 1-1.4-1.4 1-1.9-.5-1.2L4 12v-2l2-.8.5-1.2-1-1.9 1.4-1.4 1.9 1 1.2-.5.8-2h2l.8 2 1.2.5 1.9-1 1.4 1.4-1 1.9.5 1.2 2 .8z" />,
  about: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 7v6m0-9v.5" />,
  transfer: <path d="M7 4v12m0 0l-3-3m3 3l3-3M17 20V8m0 0l-3 3m3-3l3 3" />,
};

const NAV: { view: View['name']; key: string }[] = [
  { view: 'dashboard', key: 'nav.dashboard' },
  { view: 'modules', key: 'nav.modules' },
  { view: 'strategies', key: 'nav.strategies' },
  { view: 'assessment', key: 'nav.assessment' },
  { view: 'analytics', key: 'nav.analytics' },
  { view: 'history', key: 'nav.history' },
  { view: 'transfer', key: 'nav.transfer' },
  { view: 'settings', key: 'nav.settings' },
  { view: 'about', key: 'nav.about' },
];

export const ALL_NAV: { view: View['name']; key: string }[] = [{ view: 'dashboard', key: 'nav.dashboard' }, { view: 'session', key: 'nav.start' }, ...NAV.slice(1)];

function Icon({ name, className }: { name: string; className?: string }) {
  const filled = name === 'session' || name === 'strategies';
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function LangSwitch() {
  const { settings, updateSettings } = useApp();
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-0.5 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,.08)]" role="group" aria-label="Language">
      {(['en', 'pt'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={settings.lang === l}
          onClick={() => updateSettings({ lang: l })}
          className={cx('whitespace-nowrap rounded-full px-3 py-1 font-medium transition', settings.lang === l ? 'bg-gradient-to-b from-violet to-violet-soft text-white shadow-[0_0_12px_-2px_rgba(155,107,255,.8)]' : 'text-dim hover:text-ink')}
        >
          {l === 'en' ? 'EN' : 'PT-PT'}
        </button>
      ))}
    </div>
  );
}

function ProgressWidget() {
  const { settings } = useApp();
  const { t } = useI18n();
  const data = useData();
  const completed = data.sessions.filter((s) => s.completed).length;
  const days = daysTrainedLastWeek(data.sessions.filter((s) => s.completed).map((s) => s.startedAt));
  const { cycle, done } = cycleProgress(completed);
  const pct = done / PROGRAM_LENGTH;
  return (
    <div className="mx-1 mb-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-wider text-dim">
        <span>{cycle === 1 ? t('sidebar.programme') : t('sidebar.cycle', { c: cycle })}</span>
        <span translate="no" className="notranslate font-mono text-volt">
          {done}/{PROGRAM_LENGTH}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-void/80 shadow-[inset_0_1px_2px_rgba(0,0,0,.6)]">
        <div className="relative h-full rounded-full bg-gradient-to-r from-violet to-volt shadow-[0_0_10px_rgba(61,169,255,.8)]" style={{ width: `${Math.max(4, pct * 100)}%` }}>
          <div className="absolute inset-x-0 top-0 h-1/2 rounded-full bg-white/40" />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-dim">
        <span>{t('sidebar.week')}</span>
        <span className="flex gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={cx('h-2 w-2 rounded-full', i < days ? 'bg-volt shadow-[0_0_6px_rgba(61,169,255,.9)]' : 'bg-line')} />
          ))}
        </span>
      </div>
      <div className="mt-1 text-right text-[10px] text-dim">{t('sidebar.target', { d: days, n: settings.daysPerWeek })}</div>
    </div>
  );
}

export function Sidebar({ navigate }: { navigate: (v: View) => void }) {
  const { view } = useApp();
  const { t } = useI18n();
  const isActive = (name: View['name']) =>
    view.name === name || (name === 'modules' && (view.name === 'exercise' || view.name === 'probes')) || (name === 'strategies' && view.name === 'strategy');

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-panel2/90 via-panel/80 to-void px-3 py-5 backdrop-blur md:flex">
      {/* glass sheen + faint neon grid at the bottom, echoing the dashboard card */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.05] to-transparent" />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48 opacity-40"
        style={{
          backgroundImage: 'linear-gradient(rgba(61,169,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(155,107,255,.3) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,.9), transparent)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,.9), transparent)',
        }}
      />

      <button onClick={() => navigate({ name: 'dashboard' })} className="relative mb-5 flex items-center gap-3 px-2 text-left">
        <img src="./icon.svg" alt="" className="h-11 w-11 drop-shadow-[0_0_12px_rgba(155,107,255,.7)]" />
        <span>
          <span className="block bg-gradient-to-b from-white via-[#CFE2FF] to-violet bg-clip-text font-display text-xl font-semibold tracking-[0.18em] text-transparent">{t('app.name')}</span>
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_6px_rgba(61,220,151,.9)]" />
            {t('app.offline')}
          </span>
        </span>
      </button>

      {/* primary action: glossy pill */}
      <button
        onClick={() => navigate({ name: 'session' })}
        aria-current={view.name === 'session' ? 'page' : undefined}
        className="relative mx-1 mb-4 flex items-center justify-center gap-2 overflow-hidden rounded-full border border-[#1E4FD8] bg-gradient-to-b from-[#8CC8FF] via-volt to-[#2A62FF] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_-4px_rgba(61,169,255,.85)] transition hover:brightness-110"
        style={{ textShadow: '0 1px 2px rgba(10,30,90,.6)' }}
      >
        <span className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-full bg-gradient-to-b from-white/60 to-white/0" />
        <Icon name="session" className="relative h-4 w-4" />
        <span className="relative">{t('nav.start')}</span>
      </button>

      <nav className="relative flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV.map((n) => {
          const active = isActive(n.view);
          return (
            <button
              key={n.view}
              onClick={() => navigate({ name: n.view } as View)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'group relative flex items-center gap-3 overflow-hidden rounded-xl px-2.5 py-2 text-left text-sm transition',
                active ? 'border border-violet/50 bg-gradient-to-r from-violet/30 to-volt/10 text-white shadow-[0_0_18px_-6px_rgba(155,107,255,.9)]' : 'border border-transparent text-dim hover:border-white/10 hover:bg-white/[0.04] hover:text-ink',
              )}
            >
              {active && <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.10] to-transparent" />}
              <span
                className={cx(
                  'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition',
                  active ? 'border-volt/60 bg-gradient-to-b from-volt/40 to-violet/30 text-white shadow-[0_0_10px_rgba(61,169,255,.7)]' : 'border-white/10 bg-white/[0.04] text-dim group-hover:text-volt',
                )}
              >
                <Icon name={n.view} className="h-4 w-4" />
              </span>
              <span className="relative">{t(n.key)}</span>
            </button>
          );
        })}
      </nav>

      <div className="relative">
        <ProgressWidget />
        <CommunityLink />
        <div className="px-2 pt-1">
          <LangSwitch />
        </div>
      </div>
    </aside>
  );
}
