import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type ExerciseId, type Settings, type StrategyId } from './core/types';
import { db } from './core/storage';
import { I18nContext, makeI18n } from './i18n';

export type View =
  | { name: 'dashboard' }
  | { name: 'session' }
  | { name: 'modules' }
  | { name: 'exercise'; id: ExerciseId; variant?: string; strategy?: StrategyId }
  | { name: 'probes' }
  | { name: 'assessment' }
  | { name: 'calibration' }
  | { name: 'transfer' }
  | { name: 'analytics' }
  | { name: 'history' }
  | { name: 'strategies' }
  | { name: 'strategy'; id: StrategyId }
  | { name: 'settings' }
  | { name: 'about' };

interface AppState {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  view: View;
  go: (v: View) => void;
  /** Incremented whenever stored data changes, so pages can reload. */
  version: number;
  bump: () => void;
  focus: boolean;
  setFocus: (f: boolean) => void;
  /** True while an exercise block is running (navigation away asks for confirmation). */
  busy: boolean;
  setBusy: (b: boolean) => void;
  ready: boolean;
  /** Set when reading or writing local storage failed, so the user is told instead of losing data silently. */
  storageError: boolean;
  reportStorageError: () => void;
  clearStorageError: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [version, setVersion] = useState(0);
  const [focus, setFocusState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    db.settings()
      .then(async (s) => {
        // 2026-10: the recommended protocol changed from Hybrid to COGITO adaptive. Users still on the old
        // default are moved once; anyone who picks another protocol afterwards keeps it.
        if (!(await db.kv<boolean>('protocolDefaultV2'))) {
          await db.setKv('protocolDefaultV2', true);
          if (s.protocol === 'hybrid') {
            s = { ...s, protocol: 'adaptive' };
            await db.saveSettings(s);
          }
        }
        // First run on a Portuguese browser: start in Portuguese (the page translator is switched off for it).
        if (!(await db.kv('settings')) && /^pt(-|$)/i.test(navigator.language)) s = { ...s, lang: 'pt' };
        setSettings(s);
      })
      .catch(() => setStorageError(true))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.lang === 'pt' ? 'pt-PT' : 'en';
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
  }, [settings.lang, settings.reducedMotion]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch, thresholds: { ...s.thresholds, ...(patch.thresholds ?? {}) } };
      db.saveSettings(next).catch(() => setStorageError(true));
      return next;
    });
  }, []);

  const setFocus = useCallback((f: boolean) => {
    setFocusState(f);
    try {
      if (f && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
      if (!f && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    } catch {
      /* fullscreen is optional */
    }
  }, []);

  useEffect(() => {
    const fn = () => !document.fullscreenElement && setFocusState(false);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<AppState>(
    () => ({ settings, updateSettings, view, go, version, bump: () => setVersion((x) => x + 1), focus, setFocus, busy, setBusy, ready, storageError, reportStorageError: () => setStorageError(true), clearStorageError: () => setStorageError(false) }),
    [settings, view, version, focus, busy, ready, storageError],
  );
  const i18n = useMemo(() => makeI18n(settings.lang), [settings.lang]);

  return (
    <Ctx.Provider value={value}>
      <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}
