import { describe, expect, it } from 'vitest';
import { ANIMALS, ANIMAL_SPAN_LENGTHS, NUMERIC_DIGITS, NUMERIC_NBACK, SPATIAL, animalItem, genAnimalSpan, genSpatialUpdating, moveCell } from '../src/core/nearTransfer';
import { NEAR_BATTERY, chooseForm, isNear, isStandard, reassessmentDue } from '../src/core/assessmentPlan';
import { EXERCISES } from '../src/exercises/registry';
import { genNBack } from '../src/core/generate';
import { scoreCuedRecall } from '../src/core/scoring';
import { LEXICON } from '../src/content';

describe('COGITO-style near-transfer battery', () => {
  it('has the three COGITO near-transfer tasks and none is offered in training', () => {
    expect(NEAR_BATTERY).toEqual(['animalSpan', 'numeric3back', 'spatialUpdating']);
    const trainingIds = Object.keys(EXERCISES);
    for (const k of NEAR_BATTERY) expect(trainingIds).not.toContain(k);
  });

  it('animal span: 8 lists of 3–6 distinct animals, answer sorted by size; EN and PT answers both score', () => {
    const lists = genAnimalSpan(0);
    expect(lists.map((l) => l.shown.length)).toEqual(ANIMAL_SPAN_LENGTHS);
    const rank = (id: string) => ANIMALS.find((a) => a.id === id)!.rank;
    for (const l of lists) {
      expect(new Set(l.shown).size).toBe(l.shown.length);
      for (let i = 1; i < l.bySize.length; i++) expect(rank(l.bySize[i])).toBeGreaterThan(rank(l.bySize[i - 1]));
    }
    const truth = ['ant', 'fox', 'whale'].map(animalItem);
    expect(scoreCuedRecall(truth, ['ant', 'fox', 'whale'], true, LEXICON).correct).toBe(3);
    expect(scoreCuedRecall(truth, ['formiga', 'raposa', 'baleia'], true, LEXICON).correct).toBe(3);
    expect(scoreCuedRecall(truth, ['fox', 'ant', 'whale'], true, LEXICON).correct).toBe(1); // wrong order
    expect(genAnimalSpan(1)).not.toEqual(lists); // forms differ
  });

  it('numerical 3-back: digits only, enough true 3-back targets', () => {
    const s = genNBack('asm:0:numeric3back', NUMERIC_NBACK.n, 'verbal', NUMERIC_NBACK.trials, 3, NUMERIC_DIGITS);
    expect(s.letters.every((d) => NUMERIC_DIGITS.includes(d))).toBe(true);
    s.letters.forEach((d, i) => expect(s.letterTargets[i]).toBe(i >= 3 && s.letters[i - 3] === d));
    expect(s.letterTargets.filter(Boolean).length).toBeGreaterThanOrEqual(10);
  });

  it('spatial updating: every shift stays inside its grid and the final positions follow the shifts', () => {
    for (const form of [0, 1, 2, 3])
      for (const tr of genSpatialUpdating(form)) {
        expect(tr.initial).toHaveLength(SPATIAL.grids);
        expect(tr.operations).toHaveLength(SPATIAL.ops);
        const pos = tr.initial.slice();
        for (const o of tr.operations) {
          const next = moveCell(pos[o.grid], o.dir);
          expect(next).not.toBeNull();
          pos[o.grid] = next as number;
        }
        expect(pos).toEqual(tr.final);
      }
    expect(moveCell(0, 'up')).toBeNull();
    expect(moveCell(4, 'right')).toBe(5);
  });

  it('keeps its own form rotation and does not affect the main assessment schedule', () => {
    const near = { kind: 'near' as const, form: 0, startedAt: 1, completed: true, sessionIndex: 0 };
    expect(isNear(near)).toBe(true);
    expect(isStandard(near)).toBe(false);
    expect(chooseForm([near]).form).toBe(1);
    // a near-transfer run is not a baseline: the main assessment is still due
    expect(reassessmentDue(0, [near])).toBe(true);
  });
});
