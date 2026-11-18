import { describe, expect, it } from 'vitest';
import * as en from '../src/content/words.en';
import * as pt from '../src/content/words.pt';
import { STORIES, EVENTS, CATEGORY_KEYS, categoryIds, poolIds, wordText, wordItem, assessmentForm, ASSESSMENT_FORMS, efficiencyList } from '../src/content';
import { normalize } from '../src/core/text';
import {
  genEvents,
  genFaceNames,
  genNBack,
  genObjectLocation,
  genPairs,
  genPattern,
  genRecognition,
  genScene,
  genSemanticList,
  genUpdating,
  genVisualSequence,
  genWordList,
} from '../src/core/generate';
import { scoreFreeRecall } from '../src/core/scoring';
import { DICTS, translate, translateList } from '../src/i18n';
import { createRng } from '../src/core/rng';

function keysOf(o: unknown, prefix = ''): string[] {
  if (Array.isArray(o)) return [prefix + '[]'];
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe('word banks', () => {
  it('EN and PT banks are position-aligned', () => {
    expect(Object.keys(pt.categories)).toEqual(Object.keys(en.categories));
    for (const k of Object.keys(en.categories)) expect(pt.categories[k].length, k).toBe(en.categories[k].length);
    expect(pt.misc.length).toBe(en.misc.length);
    expect(pt.assessment.length).toBe(en.assessment.length);
    expect(pt.efficiency.length).toBe(en.efficiency.length);
    expect(pt.occupations.length).toBe(en.occupations.length);
    expect(pt.names.length).toBe(en.names.length);
  });

  it('has no duplicate words within a language (after normalisation)', () => {
    for (const bank of [en, pt]) {
      const all = [...Object.values(bank.categories).flat(), ...bank.misc, ...bank.assessment, ...bank.efficiency].map(normalize);
      const dupes = all.filter((w, i) => all.indexOf(w) !== i);
      expect(dupes).toEqual([]);
    }
  });

  it('assessment items are reserved: never in any training pool', () => {
    const train = new Set([...poolIds('misc'), ...CATEGORY_KEYS.flatMap(categoryIds)].flatMap((id) => wordItem(id).forms.map(normalize)));
    for (let f = 0; f < ASSESSMENT_FORMS; f++) {
      const { list, pairs } = assessmentForm(f);
      for (const id of [...list, ...pairs.flatMap((p) => [p.cue, p.target])]) for (const form of wordItem(id).forms) expect(train.has(normalize(form)), form).toBe(false);
    }
  });

  it('alternate assessment forms do not share items', () => {
    const forms = Array.from({ length: ASSESSMENT_FORMS }, (_, f) => {
      const { list, pairs } = assessmentForm(f);
      return new Set([...list, ...pairs.flatMap((p) => [p.cue, p.target])]);
    });
    for (let a = 0; a < forms.length; a++) for (let b = a + 1; b < forms.length; b++) expect([...forms[a]].filter((x) => forms[b].has(x))).toEqual([]);
    expect(forms.every((f) => f.size === 24)).toBe(true);
    expect(new Set([...efficiencyList(0), ...efficiencyList(1)]).size).toBe(24);
  });

  it('stories and event pools are aligned across languages', () => {
    expect(STORIES.pt.map((s) => s.id)).toEqual(STORIES.en.map((s) => s.id));
    STORIES.en.forEach((s, i) => {
      const p = STORIES.pt[i];
      expect(p.units.map((u) => u.id)).toEqual(s.units.map((u) => u.id));
      expect(p.units.map((u) => u.main)).toEqual(s.units.map((u) => u.main));
      expect(p.events.length).toBe(s.events.length);
      expect(p.numbers).toEqual(s.numbers);
      expect(p.tier).toBe(s.tier);
      // every number written as digits must be listed, otherwise it would be flagged as a number intrusion
      for (const txt of [s.text, p.text]) for (const n of txt.match(/\d+/g) ?? []) expect(s.numbers, `${s.id} ${n}`).toContain(n);
    });
    expect(EVENTS.pt.length).toBe(EVENTS.en.length);
  });
});

describe('localisation', () => {
  it('PT-PT dictionary has every EN key', () => {
    expect(keysOf(DICTS.pt).sort()).toEqual(keysOf(DICTS.en).sort());
  });
  it('interpolates variables and falls back to the key', () => {
    expect(translate('en', 'feedback.up', { l: 3 })).toContain('level 3');
    expect(translate('pt', 'feedback.up', { l: 3 })).toContain('nível 3');
    expect(translate('pt', 'no.such.key')).toBe('no.such.key');
    expect(translateList('pt', 'about.estList').length).toBe(translateList('en', 'about.estList').length);
  });
  it('switching language mid-block does not invalidate scoring (ids + bilingual forms)', () => {
    const ids = genWordList('seed-x', 10).ids;
    const typedInEn = ids.map((id) => wordText(id, 'en'));
    const typedInPt = ids.map((id) => wordText(id, 'pt'));
    const items = ids.map(wordItem);
    expect(scoreFreeRecall(items, typedInEn).correct).toBe(10);
    expect(scoreFreeRecall(items, typedInPt).correct).toBe(10);
  });
  it('trial content is identical regardless of UI language (language-neutral ids)', () => {
    expect(genWordList('s', 12).ids).toEqual(genWordList('s', 12).ids);
    expect(genPairs('s', 5)).toEqual(genPairs('s', 5));
  });
});

describe('exercise generation', () => {
  it('is reproducible from the seed and differs across seeds', () => {
    expect(genWordList('a', 20)).toEqual(genWordList('a', 20));
    expect(genWordList('a', 20)).not.toEqual(genWordList('b', 20));
    expect(genScene('a', 6)).toEqual(genScene('a', 6));
    expect(genVisualSequence('a', 5)).toEqual(genVisualSequence('a', 5));
    expect(createRng('q').next()).toBe(createRng('q').next());
  });

  it('word lists have the requested size, no duplicates, and avoid recent items', () => {
    const recent = genWordList('r', 40).ids;
    const ids = genWordList('n', 40, recent).ids;
    expect(new Set(ids).size).toBe(40);
    // the training pool (1044 words) is large enough to avoid every recently seen word
    expect(ids.filter((x) => recent.includes(x))).toEqual([]);
  });

  it('semantic lists cover the requested categories and avoid adjacent same-category words', () => {
    const s = genSemanticList('x', 4, 5);
    expect(s.ids).toHaveLength(20);
    const cats = s.ids.map((id) => id.split(':')[1]);
    expect(new Set(cats).size).toBe(4);
    for (let i = 1; i < cats.length; i++) expect(cats[i]).not.toBe(cats[i - 1]);
  });

  it('recognition distractors: equal number, never studied, similarity controls category', () => {
    for (const items of [10, 20, 30]) {
      for (const similarity of [0, 1]) {
        const r = genRecognition(`r${items}${similarity}`, items, similarity);
        const old = r.test.filter((x) => x.old).map((x) => x.id);
        const lures = r.test.filter((x) => !x.old).map((x) => x.id);
        expect(old).toHaveLength(items);
        expect(lures).toHaveLength(items);
        expect(lures.filter((x) => r.studied.includes(x))).toEqual([]);
        const studiedCats = new Set(r.studied.map((id) => id.split(':')[1]));
        const lureCats = new Set(lures.map((id) => id.split(':')[1]));
        const shared = [...lureCats].filter((c) => studiedCats.has(c));
        if (similarity) expect(shared.length).toBe(lureCats.size);
        else expect(shared).toEqual([]);
      }
    }
  });

  it('pairs use distinct words', () => {
    const { pairs } = genPairs('p', 16);
    expect(new Set(pairs.flatMap((p) => [p.cue, p.target])).size).toBe(32);
  });

  it('face–name test options include the right name plus studied lures', () => {
    const s = genFaceNames('f', 6);
    for (const q of s.test) {
      const face = s.faces.find((f) => f.id === q.id)!;
      expect(q.options).toContain(face.name);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.options.every((o) => s.faces.some((f) => f.name === o))).toBe(true);
    }
  });

  it('object–location: distinct cells; recognition set has lures', () => {
    const s = genObjectLocation('o', 8);
    expect(new Set(s.placed.map((p) => p.cell)).size).toBe(8);
    expect(s.recognition).toHaveLength(16);
  });

  it('patterns have the requested size and distinct cells', () => {
    const p = genPattern('g', 6, 14);
    expect(new Set(p.cells).size).toBe(14);
    expect(Math.max(...p.cells)).toBeLessThan(36);
  });

  it('scene questions cover identity, position, colour, relation and change, with correct answers', () => {
    const s = genScene('sc', 5);
    expect(s.questions.map((q) => q.kind)).toEqual(['identity', 'position', 'color', 'relation', 'change']);
    const id = s.questions[0];
    if (id.kind === 'identity') expect(s.objects.map((o) => o.shape)).toContain(id.answer);
    const pos = s.questions[1];
    if (pos.kind === 'position') expect(s.objects.find((o) => o.shape === pos.shape)?.cell).toBe(pos.answer);
    const ch = s.questions[4];
    if (ch.kind === 'change') {
      const diffs = ch.changed.filter((o, i) => JSON.stringify(o) !== JSON.stringify(s.objects[i])).length;
      expect(diffs).toBe(ch.answer === 'none' ? 0 : 1);
    }
  });

  it('events are distinct', () => {
    const e = genEvents('e', 9);
    expect(new Set(e.order).size).toBe(9);
    expect([...e.shuffled].sort()).toEqual([...e.order].sort());
  });

  it('memory updating keeps values within 0–9 and the final state matches the operations', () => {
    for (const tr of genUpdating('u', 5, 12, 5)) {
      const v = tr.initial.slice();
      tr.operations.forEach((o) => (v[o.slot] += o.delta));
      expect(v).toEqual(tr.final);
      expect(v.every((x) => x >= 0 && x <= 9)).toBe(true);
    }
  });

  it('n-back streams contain enough true targets, flagged correctly', () => {
    for (const n of [1, 2, 3, 5]) {
      const s = genNBack(`nb${n}`, n, 'dual');
      expect(s.posTargets.filter(Boolean).length).toBeGreaterThanOrEqual(4);
      expect(s.letterTargets.filter(Boolean).length).toBeGreaterThanOrEqual(4);
      s.positions.forEach((p, i) => expect(s.posTargets[i]).toBe(i >= n && s.positions[i - n] === p));
      expect(s.positions.includes(4)).toBe(false); // centre reserved for verbal-only display
    }
    const sp = genNBack('x', 2, 'spatial');
    expect(sp.letterTargets.some(Boolean)).toBe(false);
  });
});
