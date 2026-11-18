import type { DelayedProbe, ExerciseId, Lang } from './types';

// Delayed-recall scheduling. A probe is created when material is encoded and becomes due after
// `delayMs`. Within a session, the delayed-recall slot comes after intervening exercises; spaced
// retrieval probes (strategy F5) use expanding intervals across days.

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** Expanding spaced-retrieval intervals (1, 3 and 7 days). Engineering defaults. */
export const SPACED_INTERVALS = [1 * DAY, 3 * DAY, 7 * DAY];

export function createProbe(args: {
  id: string;
  exerciseId: ExerciseId;
  kind: DelayedProbe['kind'];
  sourceTrialId: string;
  payload: unknown;
  lang: Lang;
  delayMs: number;
  sessionId?: string;
  now?: number;
}): DelayedProbe {
  const now = args.now ?? Date.now();
  return {
    id: args.id,
    exerciseId: args.exerciseId,
    kind: args.kind,
    sourceTrialId: args.sourceTrialId,
    payload: args.payload,
    lang: args.lang,
    sessionId: args.sessionId,
    createdAt: now,
    dueAt: now + Math.max(0, args.delayMs),
    done: false,
  };
}

export function isDue(p: DelayedProbe, now = Date.now()): boolean {
  return !p.done && p.dueAt <= now;
}

/** Due probes, oldest first. If `sessionId` is given, only that session's probes. */
export function dueProbes(probes: DelayedProbe[], now = Date.now(), sessionId?: string): DelayedProbe[] {
  return probes
    .filter((p) => isDue(p, now) && (sessionId === undefined || p.sessionId === sessionId))
    .sort((a, b) => a.dueAt - b.dueAt);
}

export function msUntilDue(p: DelayedProbe, now = Date.now()): number {
  return Math.max(0, p.dueAt - now);
}

/** Probes for spaced retrieval of one item set, at each expanding interval after `from`. */
export function spacedSchedule(from: number, intervals = SPACED_INTERVALS): number[] {
  return intervals.map((d) => from + d);
}

/**
 * When an optional overnight recall becomes available: the next morning (05:00 local time),
 * and never sooner than 8 hours after the session, so the delay always includes a night's sleep.
 */
export function overnightDueAt(now = Date.now()): number {
  const d = new Date(now);
  const morning = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 5, 0, 0, 0).getTime();
  return Math.max(morning, now + 8 * 60 * MINUTE);
}

/** Copies of a session's delayed-recall material for an optional next-day recall. */
export function overnightCopies(sessionProbes: DelayedProbe[], makeId: () => string, now = Date.now()): DelayedProbe[] {
  const dueAt = overnightDueAt(now);
  return sessionProbes
    .filter((p) => p.kind !== 'spaced')
    .map((p) => ({ ...p, id: makeId(), sessionId: undefined, createdAt: now, dueAt, done: false, overnight: true }));
}

/** Retention ratio, delayed / immediate. Null if the immediate score was zero. */
export function retention(immediate: number, delayed: number): number | null {
  return immediate > 0 ? delayed / immediate : null;
}
