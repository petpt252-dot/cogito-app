import { describe, expect, it } from 'vitest';
import * as en from '../src/content/words.en';
import * as pt from '../src/content/words.pt';
import { STORIES, poolIds, wordItem } from '../src/content';
import { OBJECTS } from '../src/content/visual';
import { normalize } from '../src/core/text';
import { autoCreditUnits } from '../src/core/story';
import { genNumberNoun, genObjectPositions } from '../src/core/cogito';
import { genStoryChoice, genWordList, sampleFresh } from '../src/core/generate';
import { createRng } from '../src/core/rng';
import { EXPOSURE_WINDOW, recentExposure } from '../src/core/exposure';
import type { TrialResult } from '../src/core/types';

// Item banks sized for ~100 COGITO-style sessions, and exposure tracked across all tasks.

describe('item banks are large enough for long training', () => {
  it('about 1000 aligned training nouns per language', () => {
    expect(en.misc.length).toBeGreaterThanOrEqual(1000);
    expect(pt.misc.length).toBe(en.misc.length);
  });

  it('no word of one item equals a word of another item, in either language', () => {
    const items = [...poolIds('misc'), ...Object.keys(en.categories).flatMap((c) => en.categories[c].map((_, i) => `cat:${c}:${i}`))].map(wordItem);
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const it of items)
      for (const f of new Set(it.forms.map(normalize))) {
        const o = owner.get(f);
        if (o && o !== it.id) clashes.push(`${f}: ${o} / ${it.id}`);
        owner.set(f, it.id);
      }
    expect(clashes).toEqual([]);
  });

  it('10 stories per level, and each story’s own text matches every rubric unit', () => {
    for (const tier of [1, 2, 3]) expect(STORIES.en.filter((s) => s.tier === tier)).toHaveLength(10);
    for (const lang of ['en', 'pt'] as const)
      for (const s of STORIES[lang]) {
        const credited = autoCreditUnits(s, s.text);
        expect(s.units.filter((u) => !credited[u.id]).map((u) => `${lang} ${s.id} ${u.id}`)).toEqual([]);
      }
  });

  it('60 distinct objects', () => {
    expect(OBJECTS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(OBJECTS.map((o) => o.id)).size).toBe(OBJECTS.length);
    expect(new Set(OBJECTS.map((o) => o.emoji)).size).toBe(OBJECTS.length);
  });
});

const block = (exerciseId: string, startedAt: number, itemIds: string[]) => ({ exerciseId, startedAt, itemIds }) as TrialResult;

describe('exposure is tracked across all tasks', () => {
  it('words shown in G1 are avoided by G2 in the same session', () => {
    const g1 = genWordList('g1', 36).ids;
    const recent = recentExposure([block('G1', 1, g1)], 'G2');
    const nouns = genNumberNoun('g2', 12, recent).pairs.map((p) => p.noun);
    expect(nouns.filter((n) => g1.includes(n))).toEqual([]);
  });

  it('7 COGITO-mode sessions (G1 36×2 + G2 12×2 words each) never repeat a word', () => {
    const trials: TrialResult[] = [];
    const seen: string[] = [];
    let t = 0;
    for (let s = 0; s < 7; s++) {
      for (const b of [0, 1]) {
        const ids = genWordList(`s${s}g1${b}`, 36, recentExposure(trials, 'G1')).ids;
        trials.push(block('G1', ++t, ids));
        seen.push(...ids);
      }
      for (const b of [0, 1]) {
        const ids = genNumberNoun(`s${s}g2${b}`, 12, recentExposure(trials, 'G2')).pairs.map((p) => p.noun);
        trials.push(block('G2', ++t, ids));
        seen.push(...ids);
      }
    }
    expect(seen.length).toBe(7 * 96);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('the window holds about EXPOSURE_WINDOW ids, plus every story ever read', () => {
    const trials = [block('D1', 1, ['story:s1']), ...Array.from({ length: 40 }, (_, i) => block('A1', i + 2, Array.from({ length: 30 }, (_, k) => `misc:${i * 30 + k}`)))];
    const recent = recentExposure(trials);
    expect(recent.length).toBeGreaterThanOrEqual(EXPOSURE_WINDOW);
    expect(recent.length).toBeLessThan(EXPOSURE_WINDOW + 31 + 1);
    expect(recent[0]).toBe('story:s1'); // oldest first, and old stories are never forgotten
  });

  it('when everything was seen, the least recently seen items come first', () => {
    const pool = ['a', 'b', 'c', 'd'];
    expect(sampleFresh(createRng('x'), pool, 2, ['c', 'a', 'd', 'b'])).toEqual(['c', 'a']);
  });

  it('stories rotate through all 10 of a level before any repeats', () => {
    const read: string[] = [];
    for (let k = 0; k < 10; k++) read.push(genStoryChoice(`k${k}`, 2, read.map((id) => `story:${id}`)).storyId);
    expect(new Set(read).size).toBe(10);
  });

  it('objects seen recently are avoided (old bare ids and new obj: ids)', () => {
    const first = genObjectPositions('o1', 12).sequence.map((x) => x.id);
    const next = genObjectPositions('o2', 12, [...first.slice(0, 6), ...first.slice(6).map((id) => `obj:${id}`)]).sequence.map((x) => x.id);
    expect(next.filter((id) => first.includes(id))).toEqual([]);
  });
});
