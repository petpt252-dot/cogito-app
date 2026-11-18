import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Button, Card, TimerBar, useKey } from '../ui/kit';
import { splitEntries } from '../core/text';
import { realClock, runSequence } from '../core/timer';
import { useBlockClock, useStallHandler } from './stall';

export function Stage({ title, children, footer, wide }: { title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto w-full animate-fadein ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <Card className="p-6 sm:p-8">
        {title && <div className="mb-5 text-center text-sm uppercase tracking-[0.18em] text-dim">{title}</div>}
        {children}
        {footer && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{footer}</div>}
      </Card>
    </div>
  );
}

/** Measures elapsed time from mount using the monotonic clock. */
export function useStopwatch() {
  const start = useRef(realClock.now());
  return {
    reset: () => (start.current = realClock.now()),
    elapsed: () => Math.round(realClock.now() - start.current),
  };
}

/** Displays a set of words for a fixed time. */
export function WordGrid({ words, ms, onDone, label }: { words: string[]; ms: number; onDone: () => void; label: string }) {
  const cols = words.length > 24 ? 'grid-cols-4' : words.length > 12 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <Stage title={label}>
      <div className={`grid ${cols} gap-x-6 gap-y-3 text-center`}>
        {words.map((w, i) => (
          <div key={i} className="rounded-lg border border-line/60 bg-panel2/50 px-2 py-2 font-medium text-white sm:text-lg">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-6">
        <TimerBar ms={ms} onDone={onDone} />
      </div>
    </Stage>
  );
}

/** Free-recall response box. Ctrl+Enter submits. */
export function FreeRecall({ onSubmit, prompt }: { onSubmit: (entries: string[]) => void; prompt?: string }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const submit = () => onSubmit(splitEntries(text));
  return (
    <Stage title={prompt ?? t('phase.recallPrompt')} footer={<Button onClick={submit}>{t('common.submit')}</Button>}>
      <textarea autoCapitalize="off" autoCorrect="off" spellCheck={false}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
        autoComplete="off"
        className="h-64 w-full resize-none rounded-xl border border-line bg-void/60 p-4 font-mono text-white focus:border-violet focus:outline-none"
      />
      <p className="mt-2 text-center text-xs text-dim">{t('phase.recallHint')}</p>
    </Stage>
  );
}

/** Short intervening task (counting backwards). */
export function Distractor({ ms, onDone, seedNumber }: { ms: number; onDone: () => void; seedNumber: number }) {
  const { t } = useI18n();
  return (
    <Stage title={t('phase.distractor')}>
      <p className="text-center text-lg text-white">{t('phase.distractorHint', { n: seedNumber })}</p>
      <div className="mx-auto mt-6 max-w-md">
        <TimerBar ms={ms} onDone={onDone} />
      </div>
    </Stage>
  );
}

/** Generic "press to continue" gate with keyboard support. */
export function Gate({ title, children, onGo: go, label }: { title?: ReactNode; children?: ReactNode; onGo: () => void; label?: string }) {
  const { t } = useI18n();
  const clock = useBlockClock();
  const onGo = () => {
    clock?.mark();
    go();
  };
  useKey(['Enter', ' '], (e) => {
    e.preventDefault();
    onGo();
  });
  return (
    <Stage title={title} footer={<Button onClick={onGo} autoFocus>{label ?? t('common.continue')}</Button>}>
      {children}
    </Stage>
  );
}

/** Brief fixation before a stimulus sequence. */
export function Fixation({ onDone, ms = 800 }: { onDone: () => void; ms?: number }) {
  const { t } = useI18n();
  return (
    <Stage title={t('common.ready')}>
      <div className="py-10 text-center font-mono text-4xl text-violet">+</div>
      <Ticker ms={ms} onDone={onDone} />
    </Stage>
  );
}

/** Invisible one-shot timer (monotonic clock, cancelled on unmount). Remount with a new key to restart. */
export function Ticker({ ms, onDone }: { ms: number; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  const onStall = useStallHandler();
  useEffect(() => {
    const s = runSequence([ms], () => {}, () => done.current(), realClock, onStall);
    return () => s.cancel();
  }, []);
  return null;
}
