import { describe, expect, it } from 'vitest';
import {
  BANDS,
  DIGIT_SEGS,
  FAITHFUL_SIZES,
  LETTER_SEGS,
  PT_LEVELS,
  SEG_CONSONANTS,
  SEG_VOWELS,
  alphaRank,
  chooseCrtLevels,
  chooseLevel,
  faithfulParams,
  genAlphaBlock,
  genCrtCalibration,
  genCrtTrials,
  genFribbleTrials,
  genStrictNBack,
  genStrictUpdating,
  isSegSymmetric,
  lagsOf,
  sameFribble,
  scoreFirstThree,
} from '../src/core/faithful';
import { calibrationFromResults } from '../src/pages/Calibration';
import { buildPlan, COGITO_TASKS, planMinutes } from '../src/core/protocol';
import { wordItem } from '../src/content';

// COGITO-faithful protocol: values and rules from Schmiedek, Lövdén & Lindenberger (2010).

describe('study parameters', () => {
  it('presentation-time levels are the paper values', () => {
    expect(PT_LEVELS.em).toEqual([1000, 2000, 4000]);
    expect(PT_LEVELS.alpha).toEqual([750, 1500, 3000]);
    expect(PT_LEVELS.updating).toEqual([500, 1250, 2750]);
    expect(PT_LEVELS.nbackIsi).toEqual([500, 1500, 2500]);
    expect(PT_LEVELS.maskMs).toEqual([24, 47, 94]);
  });

  it('full set sizes from day one, whatever the calibration', () => {
    const cal = calibrationFromResults({});
    expect(faithfulParams('G1', cal)).toMatchObject({ items: 36, isi: 1000 });
    expect(faithfulParams('G2', cal)).toMatchObject({ pairs: 12, isi: 1000 });
    expect(faithfulParams('G3', cal)).toMatchObject({ objects: 12, isi: 1000 });
    expect(faithfulParams('G4', cal)).toMatchObject({ length: 10, lists: 4, isi: 500 });
    expect(faithfulParams('G5', cal)).toMatchObject({ slots: 4, ops: 8, isi: 250 });
    expect(faithfulParams('G6', cal)).toMatchObject({ dots: 39, stim: 500 });
    expect(faithfulParams('P1', cal)).toMatchObject({ items: 40 });
  });

  it('the faithful protocol runs the 12 tasks with the study blocks', () => {
    const plan = buildPlan({ minutes: 15, includeWorking: false, recent: [], seed: 's', delayed: true, protocol: 'faithful' });
    expect(plan.map((p) => [p.exerciseId, p.blocks])).toEqual(COGITO_TASKS.map((t) => [t.id, t.blocks]));
  });
});

describe('calibration rule', () => {
  it('fastest level reaching the minimum; fastest if the second-fastest already exceeds the upper level', () => {
    expect(chooseLevel([0.3, 0.55, 0.8], BANDS.em)).toBe(1);
    expect(chooseLevel([0.6, 0.7, 0.9], BANDS.em)).toBe(0);
    expect(chooseLevel([0.2, 0.8, 0.9], BANDS.em)).toBe(0); // second-fastest > upper (0.75)
    expect(chooseLevel([0.1, 0.2, 0.3], BANDS.em)).toBe(2); // nothing reaches the minimum: slowest
  });
  it('CRTs get a fast and a strictly slower masking time', () => {
    for (const acc of [[0.5, 0.7, 0.9], [0.9, 0.95, 1], [0.4, 0.5, 0.6]]) {
      const { fast, slow } = chooseCrtLevels(acc);
      expect(slow).toBeGreaterThan(fast);
      expect(slow).toBeLessThanOrEqual(2);
    }
  });
  it('the chosen levels become fixed parameters', () => {
    const cal = calibrationFromResults({ G1: [0.2, 0.6, 0.9], G4: [0.1, 0.45, 0.8], P1: [0.66, 0.9, 0.97] });
    expect(faithfulParams('G1', cal).pt).toBe(2000);
    expect(faithfulParams('G4', cal).pt).toBe(1500);
    expect(faithfulParams('P1', cal)).toMatchObject({ fastMs: 24, slowMs: 47 });
  });
});

describe('original alpha span', () => {
  it('10 distinct consonants, 5 targets, non-targets off by exactly 1 and within range', () => {
    for (const list of genAlphaBlock('a', 20)) {
      expect(list).toHaveLength(10);
      expect(new Set(list.map((x) => x.letter)).size).toBe(10);
      expect(list.filter((x) => x.target)).toHaveLength(5);
      list.forEach((x, k) => {
        expect(x.correct).toBe(alphaRank(list.map((y) => y.letter), k));
        if (x.target) expect(x.shown).toBe(x.correct);
        else {
          expect(Math.abs(x.shown - x.correct)).toBe(1);
          expect(x.shown).toBeGreaterThanOrEqual(1);
          expect(x.shown).toBeLessThanOrEqual(k + 1);
        }
      });
    }
  });
  it('the paper example: after B, F, D the D is 2nd', () => {
    expect(alphaRank(['B', 'F', 'D'], 2)).toBe(2);
  });
});

describe('numerical updating (study rules)', () => {
  it('8 operations of -8..+8, never 0, never the same cell twice in a row, values always 0-9', () => {
    for (const tr of genStrictUpdating('u', 50)) {
      expect(tr.operations).toHaveLength(8);
      const v = tr.initial.slice();
      tr.operations.forEach((o, i) => {
        expect(o.delta).not.toBe(0);
        expect(Math.abs(o.delta)).toBeLessThanOrEqual(8);
        if (i) expect(o.slot).not.toBe(tr.operations[i - 1].slot);
        v[o.slot] += o.delta;
        expect(v[o.slot]).toBeGreaterThanOrEqual(0);
        expect(v[o.slot]).toBeLessThanOrEqual(9);
      });
      expect(v).toEqual(tr.final);
    }
  });
});

describe('spatial 3-back (study rules)', () => {
  it('39 dots, 12 targets, 3 lures each at lags 2/4/5/6, no consecutive repeats, no longer lags', () => {
    for (let k = 0; k < 100; k++) {
      const seq = genStrictNBack(`n${k}`);
      const lags = lagsOf(seq);
      const count = (l: number) => lags.filter((x) => x === l).length;
      expect(seq).toHaveLength(39);
      expect(count(3)).toBe(12);
      for (const l of [2, 4, 5, 6]) expect(count(l)).toBe(3);
      expect(count(1)).toBe(0);
      expect(lags.every((l) => l <= 6)).toBe(true);
      expect(seq.every((c) => c >= 0 && c < 16)).toBe(true);
    }
  });
});

describe('masked choice reaction tasks', () => {
  it('stimuli are calculator-8 figures with the right answer', () => {
    for (const t of genCrtTrials('P1', 'p1')) {
      const digit = Number(Object.keys(DIGIT_SEGS).find((k) => DIGIT_SEGS[Number(k)] === t.segs));
      expect(t.answer).toBe(digit % 2 ? 'left' : 'right');
    }
    for (const t of genCrtTrials('P2', 'p2')) {
      const letter = Object.keys(LETTER_SEGS).find((k) => LETTER_SEGS[k] === t.segs)!;
      expect([...SEG_VOWELS, ...SEG_CONSONANTS]).toContain(letter);
      expect(t.answer).toBe(SEG_VOWELS.includes(letter) ? 'left' : 'right');
    }
    for (const t of genCrtTrials('P3', 'p3')) expect(t.answer).toBe(isSegSymmetric(t.segs) ? 'left' : 'right');
  });
  it('40 items: 20 fast and 20 slow, each balanced over the two answers', () => {
    const ts = genCrtTrials('P3', 'bal');
    expect(ts).toHaveLength(FAITHFUL_SIZES.speedItems);
    for (const fast of [true, false]) {
      const half = ts.filter((t) => t.fast === fast);
      expect(half).toHaveLength(20);
      expect(half.filter((t) => t.answer === 'left')).toHaveLength(10);
    }
  });
  it('calibration mixes the three masking levels evenly', () => {
    const c = genCrtCalibration('P1', 'c');
    expect([0, 1, 2].map((l) => c.filter((t) => t.level === l).length)).toEqual([12, 12, 12]);
  });
});

describe('figural comparison (part-based objects)', () => {
  it('"different" pairs differ in exactly one part; "same" pairs are identical', () => {
    for (const t of genFribbleTrials('f', 60)) {
      if (t.answer === 'left') expect(sameFribble(t.a, t.b)).toBe(true);
      else {
        expect(t.a.body).toBe(t.b.body);
        expect(t.a.hue).toBe(t.b.hue);
        expect(t.a.parts.filter((p, i) => p !== t.b.parts[i])).toHaveLength(1);
      }
    }
  });
});

describe('word lists: first three letters, recalled x order', () => {
  const items = ['misc:0', 'misc:1', 'misc:2', 'misc:3'].map(wordItem); // anchor, balloon, barrel, basket
  it('perfect recall in order scores 1; reverse order scores 0', () => {
    expect(scoreFirstThree(items, ['anc', 'bal', 'bar', 'bas']).accuracy).toBe(1);
    expect(scoreFirstThree(items, ['bas', 'bar', 'bal', 'anc']).accuracy).toBe(0);
  });
  it('half recalled in order scores 0.5, and the other language is accepted', () => {
    expect(scoreFirstThree(items, ['anc', 'bar']).accuracy).toBe(0.5);
    expect(scoreFirstThree(items, items.map((it) => it.forms[1].slice(0, 3))).recalled).toBe(4);
  });
  it('unknown entries are intrusions', () => {
    expect(scoreFirstThree(items, ['zzz']).intrusions).toBe(1);
  });
});

describe('faithful protocol length', () => {
  it('“My time”: the same 12 tasks in timed parts adding up to the chosen length; the study dose keeps its blocks', () => {
    const timed = buildPlan({ minutes: 30, includeWorking: false, recent: [], seed: 's', delayed: true, protocol: 'faithful', studyDose: false });
    expect(timed.every((p) => p.blocks === undefined)).toBe(true);
    expect(planMinutes(timed)).toBe(30);
    expect(timed.map((p) => p.exerciseId).sort()).toEqual(COGITO_TASKS.map((t) => t.id).sort());
    const study = buildPlan({ minutes: 30, includeWorking: false, recent: [], seed: 's', delayed: true, protocol: 'faithful' });
    expect(study.every((p) => p.blocks)).toBe(true);
  });
});
