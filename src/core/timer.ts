// Drift-free timing. Every step is scheduled against an absolute target time measured with a
// monotonic clock (performance.now), so setTimeout lateness never accumulates across a sequence.

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface Sequence {
  cancel(): void;
  /** Actual onset times (clock units) of each step, for auditing presentation accuracy. */
  onsets: number[];
}

/** A step that starts this late (ms) means the presentation was compressed (blocked thread, sleep, hidden window). */
export const STALL_MS = 300;

/**
 * Run `onStep(i)` at cumulative offsets defined by `durations` (step i starts after the sum of
 * durations[0..i-1]), then `onDone` after the final duration.
 *
 * If `onStall` is given, a step that fires more than `stallMs` after its target (or while the page is
 * hidden) stops the sequence and calls `onStall` instead: catching up would show the remaining stimuli
 * with no real exposure time, so the block must be invalidated rather than scored.
 */
export function runSequence(
  durations: number[],
  onStep: (i: number) => void,
  onDone: () => void,
  clock: Clock = realClock,
  onStall?: (lateMs: number) => void,
  stallMs = STALL_MS,
): Sequence {
  const start = clock.now();
  const onsets: number[] = [];
  let handle: unknown = null;
  let cancelled = false;
  const targets: number[] = [];
  let acc = 0;
  for (const d of durations) {
    targets.push(acc);
    acc += d;
  }
  const total = acc;
  const tick = (i: number) => {
    if (cancelled) return;
    if (onStall) {
      const late = clock.now() - start - (i < durations.length ? targets[i] : total);
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (late > stallMs || hidden) {
        cancelled = true;
        onStall(late);
        return;
      }
    }
    if (i >= durations.length) {
      onDone();
      return;
    }
    onsets.push(clock.now() - start);
    onStep(i);
    const nextTarget = i + 1 < durations.length ? targets[i + 1] : total;
    handle = clock.setTimeout(() => tick(i + 1), Math.max(0, start + nextTarget - clock.now()));
  };
  tick(0);
  return {
    onsets,
    cancel() {
      cancelled = true;
      if (handle !== null) clock.clearTimeout(handle);
    },
  };
}

/**
 * Like runSequence, but each step's duration is asked for when the step starts (`durationOf(i)`), so it can
 * depend on responses so far (staircases). Still drift-free and stall-checked against the cumulative schedule.
 */
export function runDynamicSequence(
  count: number,
  durationOf: (i: number) => number,
  onStep: (i: number) => void,
  onDone: () => void,
  clock: Clock = realClock,
  onStall?: (lateMs: number) => void,
  stallMs = STALL_MS,
): Sequence {
  const start = clock.now();
  const onsets: number[] = [];
  let handle: unknown = null;
  let cancelled = false;
  let target = 0; // planned start of the current step, relative to `start`
  const tick = (i: number) => {
    if (cancelled) return;
    if (onStall) {
      const late = clock.now() - start - target;
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (late > stallMs || hidden) {
        cancelled = true;
        onStall(late);
        return;
      }
    }
    if (i >= count) {
      onDone();
      return;
    }
    onsets.push(clock.now() - start);
    onStep(i);
    target += durationOf(i);
    handle = clock.setTimeout(() => tick(i + 1), Math.max(0, start + target - clock.now()));
  };
  tick(0);
  return {
    onsets,
    cancel() {
      cancelled = true;
      if (handle !== null) clock.clearTimeout(handle);
    },
  };
}

/** A countdown that reports remaining ms; accurate to the clock, not to timer callbacks. */
export function countdown(durationMs: number, onTick: (remaining: number) => void, onDone: () => void, clock: Clock = realClock, tickMs = 100) {
  const end = clock.now() + durationMs;
  let handle: unknown = null;
  let cancelled = false;
  const loop = () => {
    if (cancelled) return;
    const remaining = Math.max(0, end - clock.now());
    onTick(remaining);
    if (remaining <= 0) {
      onDone();
      return;
    }
    handle = clock.setTimeout(loop, Math.min(tickMs, remaining));
  };
  loop();
  return {
    cancel() {
      cancelled = true;
      if (handle !== null) clock.clearTimeout(handle);
    },
    elapsed: () => durationMs - Math.max(0, end - clock.now()),
  };
}
