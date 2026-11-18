import { useApp, type View } from './state';
import { useI18n } from './i18n';
import { cx, useKey } from './ui/kit';
import { Dashboard } from './pages/Dashboard';
import { SessionPage } from './pages/Session';
import { ExercisePage, ModulesPage, ProbesPage } from './pages/Modules';
import { AssessmentPage } from './pages/Assessment';
import { AnalyticsPage } from './pages/Analytics';
import { HistoryPage } from './pages/History';
import { StrategiesPage, StrategyPage } from './pages/Strategies';
import { SettingsPage } from './pages/Settings';
import { AboutPage } from './pages/About';
import { CalibrationPage } from './pages/Calibration';
import { TransferPage } from './pages/Transfer';
import { ALL_NAV, LangSwitch, Sidebar } from './ui/Sidebar';


function Page({ view }: { view: View }) {
  switch (view.name) {
    case 'dashboard':
      return <Dashboard />;
    case 'session':
      return <SessionPage />;
    case 'modules':
      return <ModulesPage />;
    case 'exercise':
      return <ExercisePage key={view.id + (view.strategy ?? '')} id={view.id} variant={view.variant} strategy={view.strategy} />;
    case 'probes':
      return <ProbesPage />;
    case 'assessment':
      return <AssessmentPage />;
    case 'calibration':
      return <CalibrationPage />;
    case 'transfer':
      return <TransferPage />;
    case 'analytics':
      return <AnalyticsPage />;
    case 'history':
      return <HistoryPage />;
    case 'strategies':
      return <StrategiesPage />;
    case 'strategy':
      return <StrategyPage key={view.id} id={view.id} />;
    case 'settings':
      return <SettingsPage />;
    case 'about':
      return <AboutPage />;
  }
}

export default function App() {
  const { view, go, focus, setFocus, busy, ready, storageError, clearStorageError } = useApp();
  const { t } = useI18n();
  useKey(['Escape'], () => focus && setFocus(false), focus, true);

  const navigate = (v: View) => {
    if (busy && !window.confirm(`${t('common.cancel')}?`)) return;
    go(v);
  };

  if (!ready) return <div className="flex min-h-screen items-center justify-center text-dim">…</div>;

  return (
    <div className="min-h-screen bg-void text-ink">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(124,77,255,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(42,123,255,0.08),transparent_50%)]" />
      <div className="relative flex">
        {!focus && <Sidebar navigate={navigate} />}
        <main className="min-w-0 flex-1">
          <header className={cx('sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line/60 bg-void/80 px-4 py-3 backdrop-blur sm:gap-3 sm:px-5', focus && 'border-transparent bg-transparent')}>
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <select value={view.name === 'exercise' || view.name === 'probes' ? 'modules' : view.name === 'strategy' ? 'strategies' : view.name} onChange={(e) => navigate({ name: e.target.value } as View)} className="w-full min-w-0 max-w-[11rem] truncate rounded-lg border border-line bg-panel2 px-2 py-1.5 text-sm text-white" aria-label="Navigation">
                {ALL_NAV.map((n) => (
                  <option key={n.view} value={n.view}>
                    {t(n.key)}
                  </option>
                ))}
              </select>
            </div>
            <div className="hidden text-xs text-dim md:block">{focus ? '' : t('app.tagline')}</div>
            <div className="flex shrink-0 items-center gap-2">
              {focus ? null : <span className="md:hidden"><LangSwitch /></span>}
              <button
                onClick={() => setFocus(!focus)}
                aria-label={focus ? t('app.exitFocus') : t('app.focus')}
                title={focus ? t('app.exitFocus') : t('app.focus')}
                className="whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs text-dim transition hover:border-violet hover:text-white sm:px-3"
              >
                {/* icon only on phones, label from sm up */}
                <span aria-hidden="true" className="sm:hidden">{focus ? '✕' : '⛶'}</span>
                <span className="hidden sm:inline">{focus ? t('app.exitFocus') : t('app.focus')}</span>
              </button>
            </div>
          </header>
          {storageError && (
            <div role="alert" className="mx-auto mt-4 flex max-w-6xl items-start justify-between gap-3 rounded-xl border border-bad/50 bg-bad/10 px-4 py-3 text-sm text-white">
              <span>{t('app.storageError')}</span>
              <button onClick={clearStorageError} className="shrink-0 text-xs text-dim hover:text-white">{t('common.close')}</button>
            </div>
          )}
          <div className={cx('mx-auto px-5 py-6', focus ? 'max-w-5xl pt-10' : 'max-w-6xl')}>
            <Page view={view} />
          </div>
        </main>
      </div>
    </div>
  );
}
