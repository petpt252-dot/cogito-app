import { describe, expect, it } from 'vitest';
import {
  encodingEfficiency,
  scoreCuedRecall,
  scoreFreeRecall,
  expandEntries,
  scoreNBack,
  scorePattern,
  scoreRecognition,
  scoreSequence,
  backwardOf,
  sequencedOf,
} from '../src/core/scoring';
import { arcScore, pairwiseOrderScore, probit, sdt, serialPositionScore } from '../src/core/stats';
import { autoCreditUnits, numberIntrusions, summarizeStory } from '../src/core/story';
import { LEXICON, story, wordItem } from '../src/content';

const items = [
  { id: 'a', forms: ['anchor', 'âncora'] },
  { id: 'b', forms: ['balloon', 'balão'] },
  { id: 'c', forms: ['candle', 'vela'] },
  { id: 'd', forms: ['mirror', 'espelho'] },
];

describe('free recall scoring', () => {
  it('counts correct, omissions, repetitions and intrusions', () => {
    const s = scoreFreeRecall(items, ['anchor', 'Candle', 'anchor', 'tiger', 'tiger', ''], true);
    expect(s.correct).toBe(2);
    expect(s.omissions).toBe(2);
    expect(s.repetitions).toBe(2); // repeated "anchor" and repeated intrusion "tiger"
    expect(s.intrusions).toBe(1);
    expect(s.recalledIds).toEqual(['a', 'c']);
    expect(s.accuracy).toBe(0.5);
  });

  it('splits words typed with spaces, and accepts capitalised words', () => {
    const s = scoreFreeRecall(items, ['Anchor Balloon   CANDLE', 'Espelho'], true, LEXICON);
    expect(s.recalledIds).toEqual(['a', 'b', 'c', 'd']);
    expect(s.intrusions).toBe(0);
  });

  it('keeps multi-word items together when splitting on spaces', () => {
    const pan = [wordItem('cat:kitchen:7'), wordItem('cat:kitchen:0')]; // "frying pan", "spoon"
    expect(pan[0].forms[0]).toBe('frying pan');
    const s = scoreFreeRecall(pan, ['spoon Frying Pan'], true, LEXICON);
    expect(s.correct).toBe(2);
    expect(expandEntries(['spoon frying pan'], pan, LEXICON)).toEqual(['spoon', 'frying pan']);
  });

  it('accepts any order and diacritic-free PT input', () => {
    const s = scoreFreeRecall(items, ['espelho', 'ancora', 'balao'], true);
    expect(s.recalledIds).toEqual(['d', 'a', 'b']);
  });

  it('tolerates one typo only for words of 5+ letters, and only when enabled', () => {
    expect(scoreFreeRecall(items, ['ballon'], true).correct).toBe(1);
    expect(scoreFreeRecall(items, ['ballon'], false).correct).toBe(0);
    expect(scoreFreeRecall([{ id: 'x', forms: ['vela'] }], ['vel'], true).correct).toBe(0);
  });

  it('never turns a different real word into a typo match (lexicon guard)', () => {
    const prato = [wordItem('cat:kitchen:3')]; // prato / plate
    expect(scoreFreeRecall(prato, ['pato'], true, LEXICON).correct).toBe(0);
    expect(scoreFreeRecall(prato, ['pratto'], true, LEXICON).correct).toBe(1);
  });

  it('computes ARC clustering when items have categories', () => {
    const cat = [
      { id: '1', forms: ['apple'], category: 'f' },
      { id: '2', forms: ['pear'], category: 'f' },
      { id: '3', forms: ['horse'], category: 'a' },
      { id: '4', forms: ['tiger'], category: 'a' },
    ];
    expect(scoreFreeRecall(cat, ['apple', 'pear', 'horse', 'tiger']).arc).toBe(1);
  });
});

describe('cued recall', () => {
  it('scores each response against its own target', () => {
    const s = scoreCuedRecall(items, ['anchor', '', 'wrong', 'espelho']);
    expect(s).toMatchObject({ correct: 2, omissions: 1, intrusions: 1, accuracy: 0.5 });
    expect(s.perItem).toEqual([true, false, false, true]);
  });
});

describe('recognition and signal detection', () => {
  it('counts hits, misses, false alarms and correct rejections', () => {
    const r = scoreRecognition([
      { id: '1', old: true, saidOld: true, rtMs: 500 },
      { id: '2', old: true, saidOld: false, rtMs: 700 },
      { id: '3', old: false, saidOld: true },
      { id: '4', old: false, saidOld: false },
    ]);
    expect(r).toMatchObject({ hits: 1, misses: 1, falseAlarms: 1, correctRejections: 1, hitRate: 0.5, falseAlarmRate: 0.5, meanRtMs: 600 });
    expect(r.dPrime).toBeCloseTo(0, 6);
    expect(r.accuracy).toBe(0);
  });

  it('reports raw d′ as undefined (null) at ceiling but always gives the corrected value', () => {
    const s = sdt({ hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 });
    expect(s.dPrime).toBeNull();
    expect(s.dPrimeCorrected).toBeGreaterThan(2.5);
  });

  it('matches the textbook d′ for H=.84, FA=.16 (≈ 1.99)', () => {
    const s = sdt({ hits: 84, misses: 16, falseAlarms: 16, correctRejections: 84 });
    expect(s.dPrime!).toBeCloseTo(1.989, 2);
  });

  it('probit is accurate', () => {
    expect(probit(0.5)).toBeCloseTo(0, 9);
    expect(probit(0.975)).toBeCloseTo(1.959964, 5);
    expect(probit(0.01)).toBeCloseTo(-2.326348, 5);
  });
});

describe('visual, sequence and n-back scoring', () => {
  it('pattern: hits minus false alarms over targets', () => {
    expect(scorePattern([1, 2, 3, 4], [1, 2, 3, 4])).toMatchObject({ perfect: true, accuracy: 1 });
    expect(scorePattern([1, 2, 3, 4], [1, 2, 9])).toMatchObject({ hits: 2, falseAlarms: 1, misses: 2, accuracy: 0.25, perfect: false });
  });

  it('digit span conditions', () => {
    expect(backwardOf([1, 2, 3])).toEqual([3, 2, 1]);
    expect(sequencedOf([5, 1, 3])).toEqual([1, 3, 5]);
    expect(scoreSequence([3, 2, 1], [3, 2, 1]).exact).toBe(true);
    expect(scoreSequence([3, 2, 1], [3, 1, 2])).toMatchObject({ exact: false, positions: 1 });
  });

  it('order scores', () => {
    expect(serialPositionScore(['a', 'b', 'c'], ['a', 'c', 'b'])).toBeCloseTo(1 / 3);
    expect(pairwiseOrderScore(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(pairwiseOrderScore(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(0);
  });

  it('ARC is null when undefined and 0 at chance-like alternation', () => {
    expect(arcScore(['x'])).toBeNull();
    expect(arcScore(['a', 'b'])).toBeNull();
    expect(arcScore(['a', 'b', 'a', 'b'])).toBeLessThan(0);
  });

  it('n-back accuracy = H / (H + M + FA)', () => {
    const s = scoreNBack([false, true, true, false], [false, true, false, true]);
    expect(s).toMatchObject({ hits: 1, misses: 1, falseAlarms: 1, correctRejections: 1 });
    expect(s.accuracy).toBeCloseTo(1 / 3);
  });

  it('encoding efficiency = correct / minutes', () => {
    expect(encodingEfficiency(6, 30_000)).toBe(12);
    expect(encodingEfficiency(6, 0)).toBeNull();
  });
});

describe('story rubric scoring', () => {
  const s = story('s1', 'en');
  it('auto-credits idea units only when every key group matches', () => {
    const c = autoCreditUnits(s, 'Anna caught a train to Lisbon on Tuesday and forgot her red umbrella. The conductor ran along the platform.');
    expect(c.u1 && c.u2 && c.u4 && c.u5 && c.u6 && c.u8 && c.u10).toBe(true);
    expect(c.u12).toBe(false); // oranges not mentioned
    expect(c.u3).toBe(false);
  });
  it('flags numbers that never occur in the story', () => {
    expect(numberIntrusions(s, 'the 8 o clock train, 9 apples, 2 oranges')).toEqual(['9']);
  });
  it('summarises main ideas, details, omissions', () => {
    const credits = Object.fromEntries(s.units.map((u) => [u.id, u.main]));
    const r = summarizeStory(s, credits, 1);
    expect(r.mainIdeas).toBe(r.mainTotal);
    expect(r.details).toBe(0);
    expect(r.omissions).toBe(r.detailTotal);
    expect(r.intrusions).toBe(1);
  });
  it('PT rubric works with PT-PT text', () => {
    const c = autoCreditUnits(story('s1', 'pt'), 'A Ana apanhou o comboio para Lisboa e esqueceu-se do guarda-chuva vermelho.');
    expect(c.u1 && c.u4 && c.u5 && c.u6).toBe(true);
  });
});
