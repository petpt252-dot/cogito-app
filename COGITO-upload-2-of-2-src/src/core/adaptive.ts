import type { AdaptiveState, ExerciseId, Thresholds } from './types';
import { LEVELS } from './levels';

// Adaptive difficulty. Engineering defaults (not clinically validated):
//  - mean accuracy of the last `blocks` blocks at the current level >= `up`   -> level + 1
//  - mean accuracy of the last `blocks` blocks at the current level <  `down` -> level - 1
//  - otherwise hold.
// The mean is used (not "every block"), because with small sets (e.g. 4 pairs) requiring every block
// to reach 85% meant a perfect score twice in a row just to leave level 1.
// Each exercise adapts independently, and the level tables in levels.ts change exactly one
// difficulty parameter between adjacent levels, so a level change never moves two variables at once.

export type AdaptDecision = 'up' | 'down' | 'hold';

export function initialState(exerciseId: string): AdaptiveState {
  return { exerciseId, level: 1, history: [], updatedAt: 0 };
}

export function adapt(
  state: AdaptiveState,
  accuracy: number,
  t: Thresholds,
  maxLevel = LEVELS[state.exerciseId.split(':')[0] as ExerciseId].length,
  now = Date.now(),
): { state: AdaptiveState; decision: AdaptDecision } {
  const history = [...state.history, accuracy].slice(-Math.max(1, t.blocks));
  let level = state.level;
  let decision: AdaptDecision = 'hold';
  if (history.length >= t.blocks) {
    const mean = history.reduce((s, a) => s + a, 0) / history.length;
    const EPS = 1e-9; // so e.g. 0.85 + 0.85 averages to exactly the threshold
    if (mean >= t.up - EPS && level < maxLevel) {
      level += 1;
      decision = 'up';
    } else if (mean < t.down - EPS && level > 1) {
      level -= 1;
      decision = 'down';
    }
  }
  return {
    state: { ...state, level, history: decision === 'hold' ? history : [], updatedAt: now },
    decision,
  };
}

export function paramsFor(exerciseId: ExerciseId, level: number) {
  const table = LEVELS[exerciseId];
  return table[Math.min(Math.max(level, 1), table.length) - 1];
}
