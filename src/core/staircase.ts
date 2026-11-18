import type { ExerciseId } from './types';
import type { LevelParams } from './levels';

// "COGITO adaptive" protocol: the COGITO-faithful tasks and stimulus rules, with difficulty adjusted after every
// response (a staircase) instead of being fixed. There is no floor other than what the person can do: lists can
// shrink to a single item and times can slow down to the upper limit. The value reached carries over to the next
// block and session. This is a variation of the study, which kept difficulty fixed.
//
// What one "response" is, per task:
//   G1–G3  one list (one block): size grows or shrinks with the proportion recalled
//   G4     one list of letters: length ±1
//   G5     one updating problem: time per operation faster/slower
//   G6, P1–P6  one item: presentation interval, masking time or answer time
//
// P1–P3 masking times are kept in ms and shown as whole screen frames, so a level means the same time on a 60 Hz
// and a 144 Hz screen.
// Item-level rules use unequal steps (harder by a small step after a correct answer, easier by a larger step after
// an error), which settles at roughly 80% correct.

export const STAIRCASE_KEY = 'cogitoStaircase';
/** When each task's value last changed (ms), so values from two devices can be merged task by task. */
export const STAIRCASE_AT_KEY = 'cogitoStaircaseAt';
export type StairState = Partial<Record<ExerciseId, number>>;

export interface StairSpec {
  start: number;
  min: number;
  max: number;
  /** What the value means, for display. */
  unit: 'words' | 'pairs' | 'objects' | 'letters' | 'ms';
  /** true when a larger value is harder (set sizes); false for times. */
  largerIsHarder: boolean;
}

export const STAIRS: Partial<Record<ExerciseId, StairSpec>> = {
  G1: { start: 12, min: 1, max: 60, unit: 'words', largerIsHarder: true },
  G2: { start: 6, min: 1, max: 24, unit: 'pairs', largerIsHarder: true },
  G3: { start: 6, min: 1, max: 24, unit: 'objects', largerIsHarder: true },
  G4: { start: 5, min: 1, max: 16, unit: 'letters', largerIsHarder: true },
  G5: { start: 1500, min: 300, max: 4000, unit: 'ms', largerIsHarder: false },
  G6: { start: 1500, min: 200, max: 3000, unit: 'ms', largerIsHarder: false },
  P1: { start: 150, min: 14, max: 400, unit: 'ms', largerIsHarder: false },
  P2: { start: 150, min: 14, max: 400, unit: 'ms', largerIsHarder: false },
  P3: { start: 150, min: 14, max: 400, unit: 'ms', largerIsHarder: false },
  P4: { start: 3000, min: 300, max: 6000, unit: 'ms', largerIsHarder: false },
  P5: { start: 3000, min: 300, max: 6000, unit: 'ms', largerIsHarder: false },
  P6: { start: 6000, min: 800, max: 10000, unit: 'ms', largerIsHarder: false },
};

const clamp = (v: number, s: StairSpec) => Math.min(s.max, Math.max(s.min, v));

/** Values saved before masking times were kept in ms were frame counts (1–12): read them as 60 Hz frames. */
export function normalizeStair(id: ExerciseId, v: number): number {
  return /^P[123]$/.test(id) && v <= 12 ? Math.round((v * 1000) / 60) : v;
}

export function stairValue(id: ExerciseId, state: StairState): number {
  const s = STAIRS[id]!;
  const v = state[id];
  return clamp(v === undefined ? s.start : normalizeStair(id, v), s);
}

/** Whole screen frames for a masking time (at least one). */
export const msToFrames = (ms: number, frameMs: number) => Math.max(1, Math.round(ms / frameMs));

/** Set-size step after one list: ≥ 85% recalled → bigger, < 60% → smaller, by about 15% (at least 1 item). */
export function sizeStep(id: ExerciseId, size: number, accuracy: number): number {
  const s = STAIRS[id]!;
  const step = Math.max(1, Math.round(size * 0.15));
  return clamp(accuracy >= 0.85 ? size + step : accuracy < 0.6 ? size - step : size, s);
}

/** Alpha-span list step: ≥ 90% correct judgements → one letter more, < 70% → one fewer (chance is 50%). */
export function alphaStep(length: number, accuracy: number): number {
  return clamp(accuracy >= 0.9 ? length + 1 : accuracy < 0.7 ? length - 1 : length, STAIRS.G4!);
}

/** Updating step after one problem: all 4 right → 10% faster, 2 or fewer → 20% slower. */
export function updatingStep(opMs: number, correctOf4: number): number {
  const v = correctOf4 >= 4 ? opMs * 0.9 : correctOf4 <= 2 ? opMs * 1.2 : opMs;
  return Math.round(clamp(v, STAIRS.G5!));
}

/** Item-level time step (G6 interval, P4–P6 answer time): correct → 6% less time, error → 25% more. */
export function timeStep(id: ExerciseId, ms: number, ok: boolean): number {
  return Math.round(clamp(ok ? ms * 0.94 : ms * 1.25, STAIRS[id]!));
}

/** Masking frames (P1–P3): one frame shorter after 3 correct in a row, one frame longer after an error (within the task's ms limits). */
export function frameStep(id: ExerciseId, frames: number, ok: boolean, streak: number, frameMs: number): { frames: number; streak: number } {
  const s = STAIRS[id]!;
  const lim = (f: number) => Math.min(msToFrames(s.max, frameMs), Math.max(msToFrames(s.min, frameMs), f));
  if (!ok) return { frames: lim(frames + 1), streak: 0 };
  if (streak + 1 >= 3) return { frames: lim(frames - 1), streak: 0 };
  return { frames, streak: streak + 1 };
}

/** Parameters for one block at the current staircase value. Timings not being adapted keep the study's middle level. */
export function staircaseParams(id: ExerciseId, v: number): LevelParams {
  switch (id) {
    case 'G1':
      return { items: v, pt: 2000, isi: 1000 };
    case 'G2':
      return { pairs: v, pt: 2000, isi: 1000 };
    case 'G3':
      return { objects: v, pt: 2000, isi: 1000 };
    case 'G4':
      return { length: v, lists: 4, pt: 1500, isi: 500 };
    case 'G5':
      return { slots: 4, ops: 8, problems: 4, opMs: v, isi: 250 };
    case 'G6':
      return { dots: 39, stim: 500, isi: v };
    case 'P1':
    case 'P2':
    case 'P3':
      return { items: 40, maskMs: v };
    default:
      return { items: 40, deadline: v };
  }
}

/**
 * Proportion of the list remembered, which sets the next list size. Word lists use words recalled and object lists
 * positions found: order still counts in the block score, but an order slip should not stop a list from growing.
 */
export function sizeAccuracy(id: ExerciseId, outcome: { accuracy: number; metrics?: Record<string, unknown> }): number {
  const m = outcome.metrics ?? {};
  if (id === 'G1' && typeof m.correct === 'number' && typeof m.studied === 'number' && m.studied > 0) return m.correct / m.studied;
  if (id === 'G3' && typeof m.posAccuracy === 'number') return m.posAccuracy;
  return outcome.accuracy;
}

/** The value for the next block: components that adapt inside the block report it; G1–G3 adapt per list here. */
export function nextStairValue(id: ExerciseId, current: number, outcome: { accuracy: number; params?: Record<string, unknown>; metrics?: Record<string, unknown> }): number {
  const reported = outcome.params?.stairNext;
  if (typeof reported === 'number') return clamp(reported, STAIRS[id]!);
  return sizeStep(id, current, sizeAccuracy(id, outcome));
}

export const STAIRCASE_BEST_KEY = 'cogitoStaircaseBest';

/** The harder of two values for a task (larger set size, or shorter time). */
export function harderOf(id: ExerciseId, a: number | undefined, b: number): number {
  if (a === undefined) return b;
  a = normalizeStair(id, a);
  return STAIRS[id]!.largerIsHarder ? Math.max(a, b) : Math.min(a, b);
}
