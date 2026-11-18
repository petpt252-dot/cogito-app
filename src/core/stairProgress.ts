import { normalizeStair, STAIRS } from './staircase';
import { mean } from './stats';
import type { ExerciseId, TrialResult } from './types';

// COGITO adaptive: progress is the staircase level, not accuracy (the staircase keeps accuracy near 80%).
// One point per session: the level the task reached at the end of that session.

export interface LevelPoint {
  at: number;
  /** Staircase value at the end of the session (set size, or ms). */
  value: number;
  /** Mean accuracy of that session's blocks of the task. */
  accuracy: number;
}

export type Trend = 'few' | 'rising' | 'stable' | 'falling';
export type LevelWarning = 'atEasiest' | 'atHardest' | 'tooEasy' | 'tooHard';

export interface TaskProgress {
  id: ExerciseId;
  points: LevelPoint[];
  /** Relative change from the first sessions to the last ones, positive = harder (bigger sets or shorter times). */
  change: number;
  trend: Trend;
  /** Mean accuracy over the last sessions. */
  recentAccuracy: number;
  warnings: LevelWarning[];
}

/** Staircase value a block ended at: saved with the block since this view existed; older blocks report it for G4–P6. */
export function trialStairLevel(tr: TrialResult): number | undefined {
  const id = tr.exerciseId as ExerciseId;
  if (!STAIRS[id]) return undefined;
  if (typeof tr.params.stairLevel === 'number') return tr.params.stairLevel;
  if (tr.conditionKey.startsWith('S-') && typeof tr.params.stairNext === 'number') return normalizeStair(id, tr.params.stairNext);
  return undefined;
}

/** Level per session for one task, oldest first. Blocks outside sessions are grouped by day. */
export function levelHistory(trials: TrialResult[], id: ExerciseId): LevelPoint[] {
  const groups = new Map<string, { at: number; value: number; acc: number[] }>();
  for (const tr of [...trials].sort((a, b) => a.startedAt - b.startedAt)) {
    if (tr.exerciseId !== id || tr.mode !== 'training') continue;
    const v = trialStairLevel(tr);
    if (v === undefined) continue;
    const key = tr.sessionId ?? new Date(tr.startedAt).toDateString();
    const g = groups.get(key) ?? { at: tr.startedAt, value: v, acc: [] };
    g.value = v;
    g.acc.push(tr.accuracy);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ at: g.at, value: g.value, accuracy: mean(g.acc) }));
}

/** How much harder a value is than a reference: +0.2 = 20% bigger set, or a time 20% faster (reference / value − 1). */
export function hardness(id: ExerciseId, value: number, reference: number): number {
  return STAIRS[id]!.largerIsHarder ? value / reference - 1 : reference / value - 1;
}

const WINDOW = 3;

export function taskProgress(trials: TrialResult[], id: ExerciseId): TaskProgress {
  const s = STAIRS[id]!;
  const points = levelHistory(trials, id);
  const n = points.length;
  const k = Math.min(WINDOW, Math.floor(n / 2));
  const change = k ? hardness(id, mean(points.slice(-k).map((p) => p.value)), mean(points.slice(0, k).map((p) => p.value))) : 0;
  const trend: Trend = n < 2 * WINDOW ? 'few' : change > 0.05 ? 'rising' : change < -0.05 ? 'falling' : 'stable';
  const recent = points.slice(-WINDOW);
  const recentAccuracy = recent.length ? mean(recent.map((p) => p.accuracy)) : 0;
  const warnings: LevelWarning[] = [];
  if (recent.length >= WINDOW) {
    const easiest = s.largerIsHarder ? s.min : s.max;
    const hardest = s.largerIsHarder ? s.max : s.min;
    if (recent.every((p) => p.value === easiest)) warnings.push('atEasiest');
    if (recent.every((p) => p.value === hardest)) warnings.push('atHardest');
    // The rules settle near 80% correct; a long way off means the level is not following the person.
    if (recentAccuracy > 0.95) warnings.push('tooEasy');
    if (recentAccuracy < 0.5) warnings.push('tooHard');
  }
  return { id, points, change, trend, recentAccuracy, warnings };
}
