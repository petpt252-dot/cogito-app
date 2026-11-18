import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { Button, Kbd, useKey } from '../ui/kit';
import { Stage } from './shared';
import { StallContext, useBlockClock } from './stall';

/**
 * Stops the block (nothing is saved) and offers a restart when timing integrity is lost: a timed
 * presentation was compressed by a delay, or — with `watchHidden` — the window was hidden at any moment.
 * Browsers throttle timers in hidden windows, which corrupts reaction times and presentation rates.
 */
export function TimingGuard({ children, watchHidden = false, pausable = false }: { children: ReactNode; watchHidden?: boolean; pausable?: boolean }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  // A pause (P or the button) stops the block like a stall: resuming restarts it, because the stimuli shown so far
  // would otherwise have had a gap in the middle. Nothing from the paused block is saved.
  const [paused, setPaused] = useState(false);
  const clock = useBlockClock();
  useKey(['p'], () => setPaused(true), pausable && !interrupted && !paused);
  useEffect(() => {
    if (interrupted || !watchHidden) return;
    const onHide = () => document.hidden && setInterrupted(true);
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [interrupted, watchHidden]);
  if (interrupted || paused)
    return (
      <Stage
        title={paused ? t('common.userPausedTitle') : t('common.pausedTitle')}
        footer={
          <Button
            autoFocus
            onClick={() => {
              setInterrupted(false);
              setPaused(false);
              setAttempt((a) => a + 1);
              clock?.restart();
            }}
          >
            {paused ? t('common.resumeRestart') : t('common.restartBlock')}
          </Button>
        }
      >
        <p className="text-center text-white">{paused ? t('common.userPausedText') : t('common.pausedText')}</p>
      </Stage>
    );
  // A new key on restart remounts the exercise with fresh timers; the trial content (seed) is the same.
  return (
    <StallContext.Provider value={() => setInterrupted(true)}>
      {pausable && (
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={() => setPaused(true)} className="rounded-lg border border-line px-3 py-1 text-xs text-dim hover:border-violet hover:text-white">
            ❚❚ {t('common.pause')} <Kbd>P</Kbd>
          </button>
        </div>
      )}
      <Wrapper key={attempt}>{children}</Wrapper>
    </StallContext.Provider>
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Reaction-time and N-back tasks: any hiding of the window invalidates the block. */
export function withHiddenGuard(Inner: ComponentType<ExProps>): ComponentType<ExProps> {
  function Guarded(props: ExProps) {
    return (
      <TimingGuard watchHidden>
        <Inner {...props} />
      </TimingGuard>
    );
  }
  Guarded.displayName = `Guarded(${Inner.displayName ?? Inner.name})`;
  return Guarded;
}
