import { describe, expect, it } from 'vitest';
import { STAIRS, harderOf, alphaStep, frameStep, msToFrames, sizeAccuracy, nextStairValue, sizeStep, staircaseParams, stairValue, timeStep, updatingStep } from '../src/core/staircase';
import { buildPlan, COGITO_TASKS, planMinutes } from '../src/core/protocol';
import type { ExerciseId } from '../src/core/types';
import { dayStreak } from '../src/core/streak';
import { genAlphaList } from '../src/core/faithful';
import { createRng } from '../src/core/rng';
import { runDynamicSequence, type Clock } from '../src/core/timer';
import { isAnswerKey } from '../src/ui/answerKeys';

// COGITO adaptive protocol: per-response staircases with no floor other than one item.

describe('set sizes follow every list', () => {
  it('grows after a good list, shrinks after a poor one, holds in between', () => {
    expect(sizeStep('G1', 12, 0.9)).toBe(14);
    expect(sizeStep('G1', 12, 0.4)).toBe(10);
    expect(sizeStep('G1', 12, 0.7)).toBe(12);
  });
  it('can go all the way down to a single item, and up to the cap', () => {
    let size = 12;
    for (let k = 0; k < 30; k++) size = sizeStep('G1', size, 0);
    expect(size).toBe(1);
    for (let k = 0; k < 60; k++) size = sizeStep('G1', size, 1);
    expect(size).toBe(STAIRS.G1!.max);
    expect(sizeStep('G2', 1, 0)).toBe(1);
  });
  it('alpha span: one letter more or fewer per list, down to 1', () => {
    expect(alphaStep(5, 0.95)).toBe(6);
    expect(alphaStep(5, 0.5)).toBe(4);
    expect(alphaStep(1, 0)).toBe(1);
    // a 1-letter list is valid (its only item is a target)
    expect(genAlphaList(createRng('x'), 1, 1)).toHaveLength(1);
    expect(genAlphaList(createRng('x'), 3, 2).filter((x) => x.target)).toHaveLength(2);
  });
});

describe('times follow every answer', () => {
  it('updating: all 4 right → faster, 2 or fewer → slower', () => {
    expect(updatingStep(1500, 4)).toBe(1350);
    expect(updatingStep(1500, 2)).toBe(1800);
    expect(updatingStep(1500, 3)).toBe(1500);
  });
  it('item rules settle near 80% correct (4 correct steps undo 1 error)', () => {
    let ms = 1500;
    ms = timeStep('G6', ms, false);
    for (let k = 0; k < 4; k++) ms = timeStep('G6', ms, true);
    expect(Math.abs(ms - 1500)).toBeLessThan(40);
  });
  it('masking frames: 3 correct in a row → 1 frame less; an error → 1 more; never below 1', () => {
    let st = { frames: 2, streak: 0 };
    for (let k = 0; k < 3; k++) st = frameStep('P1', st.frames, true, st.streak, 16.7);
    expect(st.frames).toBe(1);
    for (let k = 0; k < 9; k++) st = frameStep('P1', st.frames, true, st.streak, 16.7);
    expect(st.frames).toBe(1);
    expect(frameStep('P1', 1, false, 2, 16.7)).toEqual({ frames: 2, streak: 0 });
  });
  it('masking times are kept in ms, so a level is the same time on any screen', () => {
    expect(msToFrames(100, 1000 / 60)).toBe(6);
    expect(msToFrames(100, 1000 / 144)).toBe(14);
    expect(stairValue('P3', {})).toBe(150);
    // the 14 ms floor is 1 frame at 60 Hz and 2 at 144 Hz
    expect(frameStep('P3', 2, true, 2, 1000 / 144)).toEqual({ frames: 2, streak: 0 });
    // values saved as frames (before ms) are read as 60 Hz frames
    expect(stairValue('P3', { P3: 6 })).toBe(100);
    expect(harderOf('P3', 3, 100)).toBe(50);
  });
  it('limits are respected', () => {
    expect(timeStep('P4', STAIRS.P4!.max, false)).toBe(STAIRS.P4!.max);
    expect(timeStep('P4', STAIRS.P4!.min, true)).toBe(STAIRS.P4!.min);
  });
});

describe('carrying the value between blocks', () => {
  it('starts at the start value, then uses what was reached', () => {
    expect(stairValue('G1', {})).toBe(12);
    expect(stairValue('G1', { G1: 20 })).toBe(20);
  });
  it('components that adapt inside the block report the next value; G1–G3 step from the list score', () => {
    expect(nextStairValue('G6', 1500, { accuracy: 0.8, params: { stairNext: 1210 } })).toBe(1210);
    expect(nextStairValue('G1', 12, { accuracy: 1 })).toBe(14);
  });
  it('block parameters use the study tasks', () => {
    expect(staircaseParams('G1', 20)).toMatchObject({ items: 20, pt: 2000, isi: 1000 });
    expect(staircaseParams('G6', 900)).toMatchObject({ dots: 39, stim: 500, isi: 900 });
    expect(staircaseParams('P2', 80)).toMatchObject({ items: 40, maskMs: 80 });
  });
  it('the adaptive protocol runs the 12 study tasks', () => {
    const plan = buildPlan({ minutes: 60, includeWorking: false, recent: [], seed: 's', delayed: true, protocol: 'adaptive' });
    expect(plan.map((p) => p.exerciseId).sort()).toEqual(COGITO_TASKS.map((t) => t.id).sort());
  });
});

describe('dynamic sequence (durations decided step by step)', () => {
  function manualClock() {
    let now = 0;
    let pending: { at: number; fn: () => void } | null = null;
    const clock: Clock = {
      now: () => now,
      setTimeout: (fn, ms) => ((pending = { at: now + ms, fn }), 1),
      clearTimeout: () => (pending = null),
    };
    const fire = (late = 0) => {
      const p = pending!;
      pending = null;
      now = p.at + late;
      p.fn();
    };
    return { clock, fire };
  }
  it('asks each duration when its step starts and keeps the cumulative schedule', () => {
    const { clock, fire } = manualClock();
    const durations = [100, 300, 50];
    const onsets: number[] = [];
    let done = false;
    runDynamicSequence(3, (i) => durations[i], () => onsets.push(clock.now()), () => (done = true), clock);
    fire(10);
    fire(0);
    fire(0);
    expect(onsets).toEqual([0, 110, 400]);
    expect(done).toBe(true);
  });
  it('reports a stall instead of compressing', () => {
    const { clock, fire } = manualClock();
    let stalled = false;
    const steps: number[] = [];
    runDynamicSequence(3, () => 100, (i) => steps.push(i), () => undefined, clock, () => (stalled = true));
    fire(1000);
    expect(stalled).toBe(true);
    expect(steps).toEqual([0]);
  });
});

describe('levels panel and answer keys', () => {
  it('best value = the harder one: larger sizes, shorter times', () => {
    expect(harderOf('G1', 20, 24)).toBe(24);
    expect(harderOf('G1', 30, 24)).toBe(30);
    expect(harderOf('G6', 900, 1200)).toBe(900);
    expect(harderOf('P1', undefined, 5)).toBe(5);
  });
  it('answer keys: one letter or digit, never P (pause)', () => {
    expect(isAnswerKey('a')).toBe(true);
    expect(isAnswerKey('7')).toBe(true);
    expect(isAnswerKey('p')).toBe(false);
    expect(isAnswerKey('Enter')).toBe(false);
  });
});

describe('adaptive session length', () => {
  const plan = (minutes: number, recent: ExerciseId[] = []) => buildPlan({ minutes, includeWorking: false, recent, seed: 's', delayed: true, protocol: 'adaptive' });
  it('timed slots that add up to the chosen length, in the study proportions', () => {
    for (const m of [10, 15, 20, 30, 45, 60]) {
      expect(planMinutes(plan(m))).toBe(m);
      expect(plan(m).every((p) => p.blocks === undefined && p.minutes >= 1)).toBe(true);
    }
    expect(plan(30).map((p) => p.exerciseId).sort()).toEqual(COGITO_TASKS.map((t) => t.id).sort());
    const sixty = Object.fromEntries(plan(60).map((p) => [p.exerciseId, p.minutes]));
    expect(sixty.G1).toBeGreaterThan(sixty.P1 * 3);
  });
  it('short sessions rotate to the least recently practised tasks', () => {
    const first = plan(10).map((p) => p.exerciseId as ExerciseId);
    const next = plan(10, first).map((p) => p.exerciseId);
    expect(next.some((id) => first.includes(id as ExerciseId))).toBe(false);
  });
});

describe('adaptive mode refinements', () => {
  it('word lists grow from words recalled, even with order slips', () => {
    // 12 of 12 recalled, order partly wrong: block accuracy 0.7, but the list still grows
    expect(nextStairValue('G1', 12, { accuracy: 0.7, metrics: { correct: 12, studied: 12 } })).toBe(14);
    expect(sizeAccuracy('G3', { accuracy: 0.5, metrics: { posAccuracy: 0.9 } })).toBe(0.9);
    expect(sizeAccuracy('G2', { accuracy: 0.6 })).toBe(0.6);
  });
  it('task order alternates memory and speed and rotates between sessions', () => {
    const order = (seed: string) => buildPlan({ minutes: 60, includeWorking: false, recent: [], seed, delayed: true, protocol: 'adaptive' }).map((p) => p.kind === 'speed');
    expect(order('a')).toEqual([false, true, false, true, false, true, false, true, false, true, false, true]);
    const firsts = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => buildPlan({ minutes: 60, includeWorking: false, recent: [], seed: s, delayed: true, protocol: 'adaptive' })[0].exerciseId));
    expect(firsts.size).toBeGreaterThan(1);
  });
});

describe('day streak', () => {
  const day = (d: number) => new Date(2026, 9, d, 18).getTime();
  const s = (d: number, completed = true) => ({ startedAt: day(d), completed });
  it('counts consecutive days, alive until today is over', () => {
    expect(dayStreak([s(27), s(28), s(29)], day(29))).toEqual({ days: 3, today: true });
    expect(dayStreak([s(27), s(28)], day(29))).toEqual({ days: 2, today: false });
    expect(dayStreak([s(26), s(28)], day(30))).toEqual({ days: 0, today: false });
    expect(dayStreak([s(28), s(29, false)], day(29))).toEqual({ days: 1, today: false });
  });
});
