import { describe, expect, it } from 'vitest';
import { hardness, levelHistory, taskProgress, trialStairLevel } from '../src/core/stairProgress';
import type { ExerciseId, TrialResult } from '../src/core/types';

// COGITO adaptive progress: the level reached per session, its trend, and checks that the staircase follows the person.

let n = 0;
const block = (id: ExerciseId, session: number, stairLevel: number, accuracy = 0.8, extra: Partial<TrialResult> = {}): TrialResult => ({
  id: `t${n++}`,
  exerciseId: id,
  domain: 'verbal',
  mode: 'training',
  sessionId: `s${session}`,
  seed: 's',
  lang: 'en',
  startedAt: session * 86_400_000 + n,
  endedAt: session * 86_400_000 + n + 1,
  level: 0,
  params: { stairLevel },
  accuracy,
  metrics: {},
  conditionKey: `S-${id}`,
  ...extra,
});

describe('adaptive progress', () => {
  it('one point per session: the level at the end of it', () => {
    const trials = [block('G1', 1, 12), block('G1', 1, 14), block('G1', 2, 16), block('P1', 2, 100)];
    expect(levelHistory(trials, 'G1').map((p) => p.value)).toEqual([14, 16]);
  });

  it('older blocks: ms values reported by the task, frame counts read as 60 Hz frames, nothing for G1–G3', () => {
    const old = (id: ExerciseId, stairNext: number) => ({ ...block(id, 1, 0), params: { stairNext } });
    expect(trialStairLevel(old('G6', 900))).toBe(900);
    expect(trialStairLevel(old('P3', 6))).toBe(100);
    expect(trialStairLevel({ ...block('G1', 1, 0), params: { items: 12 } })).toBeUndefined();
  });

  it('harder = bigger sets or shorter times', () => {
    expect(hardness('G1', 24, 12)).toBeCloseTo(1);
    expect(hardness('G6', 750, 1500)).toBeCloseTo(1);
  });

  it('trend from the first sessions to the last ones', () => {
    const rising = [12, 13, 14, 16, 18, 20].map((v, i) => block('G1', i, v));
    expect(taskProgress(rising, 'G1')).toMatchObject({ trend: 'rising' });
    expect(taskProgress(rising, 'G1').change).toBeGreaterThan(0.3);
    const faster = [1500, 1400, 1300, 1100, 1000, 900].map((v, i) => block('G6', i, v));
    expect(taskProgress(faster, 'G6').trend).toBe('rising');
    const flat = [12, 12, 13, 12, 12, 13].map((v, i) => block('G1', i, v));
    expect(taskProgress(flat, 'G1').trend).toBe('stable');
    expect(taskProgress(rising.slice(0, 3), 'G1').trend).toBe('few');
  });

  it('warns when a task sits at a limit or accuracy is far from the ~80% the rules aim for', () => {
    const stuck = [1, 1, 1].map((v, i) => block('G2', i, v, 0.3));
    expect(taskProgress(stuck, 'G2').warnings).toEqual(['atEasiest', 'tooHard']);
    const top = [14, 14, 14].map((v, i) => block('P1', i, v, 0.98));
    expect(taskProgress(top, 'P1').warnings).toEqual(['atHardest', 'tooEasy']);
    expect(taskProgress([20, 21, 22].map((v, i) => block('G1', i, v)), 'G1').warnings).toEqual([]);
  });
});
