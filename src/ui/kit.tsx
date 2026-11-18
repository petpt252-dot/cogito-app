import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { realClock, countdown } from '../core/timer';

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';

export function Button({ variant = 'primary', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  // 2010-style glossy buttons: gradient body + white gloss on the top half (drawn behind the content via `isolate`).
  const styles: Record<Variant, string> = {
    primary:
      'border border-[#1E4FD8] bg-gradient-to-b from-[#8CC8FF] via-volt to-[#2A62FF] font-semibold text-white shadow-[0_0_22px_-6px_rgba(61,169,255,.9)] [text-shadow:0_1px_2px_rgba(10,30,90,.55)] hover:brightness-110 hover:shadow-[0_0_28px_-4px_rgba(61,169,255,.95)] disabled:opacity-40 disabled:hover:brightness-100',
    ghost: 'border border-white/15 bg-gradient-to-b from-white/[0.09] to-white/[0.02] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.1)] hover:border-violet/70 hover:text-white hover:shadow-[0_0_16px_-6px_rgba(155,107,255,.9)] disabled:opacity-40',
    subtle: 'border border-white/10 bg-panel2 text-ink hover:bg-line disabled:opacity-40',
    danger: 'border border-bad/60 bg-gradient-to-b from-bad/15 to-transparent text-bad hover:bg-bad/10 disabled:opacity-40',
  };
  const gloss = variant === 'primary' ? 'from-white/55 to-white/0' : variant === 'ghost' ? 'from-white/[0.12] to-white/0' : null;
  return (
    <button {...rest} className={cx('relative isolate overflow-hidden rounded-xl px-4 py-2 text-sm font-medium transition active:translate-y-px disabled:cursor-not-allowed', styles[variant], className)}>
      {gloss && <span aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0.5 top-0.5 -z-10 h-1/2 rounded-t-[10px] bg-gradient-to-b', gloss)} />}
      {children}
    </button>
  );
}

export function Card({ children, className, glow }: { children: ReactNode; className?: string; glow?: 'violet' | 'volt' }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-panel/80 p-5 backdrop-blur', glow === 'violet' && 'shadow-neon', glow === 'volt' && 'shadow-volt', className)}>
      {children}
    </div>
  );
}

export function H1({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-white">{children}</h1>
      {sub && <p className="mt-1 max-w-3xl text-sm text-dim">{sub}</p>}
    </div>
  );
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-dim">{children}</h2>
      {right}
    </div>
  );
}

export function Badge({ children, tone = 'violet' }: { children: ReactNode; tone?: 'violet' | 'volt' | 'ok' | 'warn' | 'bad' | 'dim' }) {
  const tones = {
    violet: 'border-violet/40 text-violet',
    volt: 'border-volt/40 text-volt',
    ok: 'border-ok/40 text-ok',
    warn: 'border-warn/40 text-warn',
    bad: 'border-bad/40 text-bad',
    dim: 'border-line text-dim',
  };
  return <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs', tones[tone])}>{children}</span>;
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/60 p-3">
      <div className="text-xs text-dim">{label}</div>
      <div className="mt-1 font-mono text-xl text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-dim">{sub}</div>}
    </div>
  );
}

export function Meter({ value, tone = 'violet' }: { value: number; tone?: 'violet' | 'volt' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', tone === 'violet' ? 'bg-violet' : 'bg-volt')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="text-sm text-ink">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-dim">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 rounded-full border transition', checked ? 'border-violet bg-violet/40' : 'border-line bg-panel2')}
    >
      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-6' : 'left-1')} />
    </button>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  // Free typing while focused; the value is clamped and saved when the field loses focus or Enter is pressed
  // (clamping each keystroke made it impossible to type e.g. "90" into a field with minimum 50).
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    if (draft.trim() !== '' && !Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
    setDraft(null);
  };
  return (
    <input
      type="number"
      value={draft ?? value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className="w-24 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-right font-mono text-sm text-white focus:border-violet focus:outline-none"
    />
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-panel2 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={cx('rounded-md px-3 py-1 text-sm transition', o.value === value ? 'bg-violet/30 text-white shadow-neon' : 'text-dim hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Keyboard shortcut hook. Ignores key presses while typing in inputs unless `inInputs`. */
export function useKey(keys: string[], handler: (e: KeyboardEvent) => void, enabled = true, inInputs = false) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!inInputs && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
      // Enter/Space on a focused button or link already activates that control; don't fire the shortcut too
      // (otherwise e.g. "Continue" ran twice, or Enter on the Discord link also started a session).
      if ((e.key === 'Enter' || e.key === ' ') && (tag === 'BUTTON' || tag === 'A')) return;
      if (e.repeat) return;
      if (keys.includes(e.key) || keys.includes(e.key.toLowerCase())) ref.current(e);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [keys.join('|'), enabled, inInputs]);
}

/** Countdown driven by the monotonic clock; calls onDone exactly once. */
export function useCountdown(ms: number, onDone: () => void, running = true) {
  const [remaining, setRemaining] = useState(ms);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!running) return;
    const c = countdown(ms, setRemaining, () => done.current(), realClock, 100);
    return () => c.cancel();
  }, [ms, running]);
  return remaining;
}

export function TimerBar({ ms, onDone, label }: { ms: number; onDone: () => void; label?: string }) {
  const remaining = useCountdown(ms, onDone);
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs text-dim">
        <span>{label}</span>
        <span className="font-mono">{Math.ceil(remaining / 1000)}s</span>
      </div>
      <Meter value={remaining / ms} tone="volt" />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-panel2 px-1.5 py-0.5 font-mono text-xs text-ink">{children}</kbd>;
}

export function pct(x: number | null | undefined, dp = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(dp)}%`;
}

export function num(x: number | null | undefined, dp = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return Number.isInteger(x) ? String(x) : x.toFixed(dp);
}
