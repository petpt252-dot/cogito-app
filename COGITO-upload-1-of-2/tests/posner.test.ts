import { describe, expect, it } from 'vitest';
import { ALL_RULES, POSNER_LEVELS, checkPosnerTrial, correctIsSame, crossSum, genPosnerBlock, genPosnerTrial, isPrime, levelStep, posnerWindowMs } from '../src/core/posner';
import { posnerAfterAnswer } from '../src/exercises/posner';
import { buildPlan, COGITO_TASKS, HYBRID_POOLS, SLOT_POOLS } from '../src/core/protocol';
import { createRng } from '../src/core/rng';

describe('X1 Posner mixed rules', () => {
  it('every generated trial is correct under its rule, in both languages', () => {
    for (const lang of ['en', 'pt'] as const)
      for (const rule of ALL_RULES) {
        const rng = createRng(`${lang}:${rule}`);
        for (let k = 0; k < 200; k++) {
          const t = genPosnerTrial(rng, rule, lang, false);
          expect(checkPosnerTrial(t, lang), `${lang} ${rule} ${t.left} | ${t.right} same=${t.same}`).toBe(t.same);
          expect(t.left).not.toBe('');
          expect(t.right).not.toBe('');
        }
      }
  });

  it('physical identity is not name identity (A a: same letter, different form)', () => {
    const rng = createRng('ph');
    const trials = Array.from({ length: 300 }, () => genPosnerTrial(rng, 'physical', 'en', false));
    expect(trials.some((t) => !t.same && t.left.toUpperCase() === t.right.toUpperCase())).toBe(true);
    expect(trials.filter((t) => t.same).every((t) => t.left === t.right)).toBe(true);
  });

  it('about half the trials are "same", and different pairs are not fixed', () => {
    const b = genPosnerBlock('s', ['partWhole'], 'en', false, 400);
    const same = b.filter((t) => t.same).length;
    expect(same).toBeGreaterThan(160);
    expect(same).toBeLessThan(240);
    const diffRights = new Set(b.filter((t) => !t.same && t.left === 'WHEEL').map((t) => t.right));
    expect(diffRights.size).toBeGreaterThan(2); // the original always paired WHEEL with the same wrong whole
  });

  it('inversion flips the correct answer on about 22% of trials', () => {
    const b = genPosnerBlock('inv', ALL_RULES, 'en', true, 1000);
    const inv = b.filter((t) => t.inverted).length;
    expect(inv).toBeGreaterThan(170);
    expect(inv).toBeLessThan(270);
    for (const t of b) expect(correctIsSame(t)).toBe(t.inverted ? !t.same : t.same);
    expect(genPosnerBlock('x', ALL_RULES, 'en', false).some((t) => t.inverted)).toBe(false);
  });

  it('levels and answer window follow the original site', () => {
    expect(posnerWindowMs(1)).toBe(1220);
    expect(posnerWindowMs(10)).toBe(500);
    expect(posnerWindowMs(20)).toBe(120);
    expect(levelStep(7, 'up')).toBe(7.5);
    expect(levelStep(1, 'down')).toBe(1);
    expect(levelStep(20, 'up')).toBe(21);
    expect(POSNER_LEVELS).toHaveLength(26);
  });

  it('streak progression: N right in a row → up, M wrong in a row → down', () => {
    const o = { progression: 'streak' as const, up: 5, down: 3 };
    let s = { level: 3, streak: { right: 0, wrong: 0 } };
    for (let k = 0; k < 5; k++) s = posnerAfterAnswer(s.level, true, s.streak, o);
    expect(s.level).toBe(4);
    for (let k = 0; k < 3; k++) s = posnerAfterAnswer(s.level, false, s.streak, o);
    expect(s.level).toBe(3);
    // normal mode only drops within a block
    expect(posnerAfterAnswer(3, true, { right: 9, wrong: 0 }, { progression: 'normal', up: 5, down: 3 }).level).toBe(3);
    expect(posnerAfterAnswer(3, false, { right: 0, wrong: 2 }, { progression: 'normal', up: 5, down: 3 }).level).toBe(2);
  });

  it('is never part of a session protocol', () => {
    const pools = [...Object.values(HYBRID_POOLS).flat(), ...Object.values(SLOT_POOLS).flat(), ...COGITO_TASKS.map((t) => t.id)];
    expect(pools).not.toContain('X1');
    for (const protocol of ['hybrid', 'memorylab', 'cogito', 'faithful', 'adaptive'] as const)
      for (let k = 0; k < 10; k++) expect(buildPlan({ minutes: 60, includeWorking: true, recent: [], seed: `${k}`, delayed: true, protocol }).map((p) => p.exerciseId)).not.toContain('X1');
  });

  it('helpers', () => {
    expect(crossSum(34)).toBe(7);
    expect([2, 3, 5, 7, 11, 97].every(isPrime)).toBe(true);
    expect([1, 4, 9, 91].some(isPrime)).toBe(false);
  });
});
