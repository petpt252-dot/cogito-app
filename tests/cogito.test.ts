import { describe, expect, it } from 'vitest';
import {
  alphaOrder,
  checkSpeedTrial,
  genAlphaSpan,
  genChiralPolycube,
  genNumberNoun,
  genObjectPositions,
  genSpeedTrials,
  isSymmetric,
  mirrorCubes,
  rotateYaw,
  sameUnderYaw,
  CONSONANTS,
  type SpeedTask,
} from '../src/core/cogito';
import { createRng } from '../src/core/rng';
import { genNBack } from '../src/core/generate';
import { buildPlan, COGITO_TASKS, HYBRID_POOLS, planMinutes, PROBE_SOURCES } from '../src/core/protocol';
import { CORSI_BLOCKS, corsiSpan, digitForSymbol, genCorsi, genSeries, genSymbolDigit, TRANSFER_FORMS } from '../src/core/transfer';
import { chooseForm } from '../src/core/assessmentPlan';
import { LEVELS } from '../src/core/levels';
import { EXERCISES } from '../src/exercises/registry';
import { wordText } from '../src/content';
import type { ExerciseId } from '../src/core/types';

describe('COGITO-inspired episodic tasks', () => {
  it('number–noun pairs: distinct two-digit numbers and nouns', () => {
    const { pairs, testOrder } = genNumberNoun('nn', 12);
    expect(new Set(pairs.map((p) => p.number)).size).toBe(12);
    expect(new Set(pairs.map((p) => p.noun)).size).toBe(12);
    expect(pairs.every((p) => p.number >= 10 && p.number <= 99)).toBe(true);
    expect([...testOrder].sort((a, b) => a.number - b.number)).toEqual([...pairs].sort((a, b) => a.number - b.number));
  });

  it('object positions: 12 objects at distinct cells of a 6×6 grid', () => {
    const { sequence, palette } = genObjectPositions('op', 12);
    expect(new Set(sequence.map((s) => s.cell)).size).toBe(12);
    expect(sequence.every((s) => s.cell >= 0 && s.cell < 36)).toBe(true);
    expect([...palette].sort()).toEqual(sequence.map((s) => s.id).sort());
  });

  it('level tables follow COGITO set sizes (36 words, 12 pairs, 12 objects)', () => {
    expect(LEVELS.G1[LEVELS.G1.length - 1].items).toBe(36);
    expect(LEVELS.G2[LEVELS.G2.length - 1].pairs).toBe(12);
    expect(LEVELS.G3[LEVELS.G3.length - 1].objects).toBe(12);
  });
});

describe('COGITO-inspired working memory', () => {
  it('alpha span uses distinct consonants and sorts alphabetically', () => {
    for (const trial of genAlphaSpan('as', 7, 'letters')) {
      expect(new Set(trial).size).toBe(7);
      expect(trial.every((c) => CONSONANTS.includes(c))).toBe(true);
      expect(alphaOrder(trial, 'letters', 'en')).toEqual([...trial].sort());
    }
  });

  it('alpha span with words sorts in the stimulus language, ignoring accents', () => {
    const ids = genAlphaSpan('aw', 6, 'words')[0];
    const en = alphaOrder(ids, 'words', 'en').map((id) => wordText(id, 'en'));
    expect(en).toEqual([...en].sort((a, b) => a.localeCompare(b, 'en')));
    const pt = alphaOrder(ids, 'words', 'pt').map((id) => wordText(id, 'pt'));
    expect(pt).toEqual([...pt].sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' })));
  });

  it('spatial 3-back on a 4×4 grid uses all 16 positions and flags targets correctly', () => {
    const s = genNBack('g6', 3, 'spatial', 23, 4);
    expect(Math.max(...s.positions)).toBeLessThan(16);
    s.positions.forEach((p, i) => expect(s.posTargets[i]).toBe(i >= 3 && s.positions[i - 3] === p));
    expect(s.posTargets.filter(Boolean).length).toBeGreaterThanOrEqual(4);
  });

  it('G5 adapts only presentation time; G6 only stimulus onset asynchrony', () => {
    expect(LEVELS.G5.every((l) => Object.keys(l).join() === 'opMs')).toBe(true);
    expect(LEVELS.G6.every((l) => Object.keys(l).join() === 'soa')).toBe(true);
    for (const t of [LEVELS.G5, LEVELS.G6]) for (let i = 1; i < t.length; i++) expect(Object.values(t[i])[0]).toBeLessThan(Object.values(t[i - 1])[0]);
  });
});

describe('perceptual speed', () => {
  const tasks: SpeedTask[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

  it('blocks are balanced and every stored answer is correct', () => {
    for (const task of tasks) {
      const trials = genSpeedTrials(task, `sp:${task}`, 24);
      expect(trials.filter((t) => t.answer === 'left')).toHaveLength(12);
      for (const t of trials) expect(checkSpeedTrial(t), task).toBe(t.answer);
    }
  });

  it('symmetric figures are symmetric and asymmetric ones are not', () => {
    const trials = genSpeedTrials('P3', 'sym', 60);
    for (const t of trials) if (t.task === 'P3') expect(isSymmetric(t.segments)).toBe(t.answer === 'left');
  });

  it('3D figures: "same" is a rotation, "mirror" can never be rotated into the original', () => {
    const rng = createRng('cubes');
    for (let i = 0; i < 25; i++) {
      const c = genChiralPolycube(rng);
      expect(sameUnderYaw(c, rotateYaw(c, 1 + (i % 3)))).toBe(true);
      expect(sameUnderYaw(c, rotateYaw(mirrorCubes(c), i % 4))).toBe(false);
    }
  });

  it('comparison strings differ in exactly one character when "different"', () => {
    for (const task of ['P4', 'P5'] as const)
      for (const t of genSpeedTrials(task, `cmp:${task}`, 30))
        if (t.task === 'P4' || t.task === 'P5') {
          const diff = [...t.a].filter((ch, k) => ch !== t.b[k]).length;
          expect(diff).toBe(t.answer === 'left' ? 0 : 1);
        }
  });

  it('deadlines get shorter with level and one parameter changes per step', () => {
    for (const task of tasks) {
      const tab = LEVELS[task];
      expect(tab).toHaveLength(10);
      for (let i = 1; i < tab.length; i++) expect(tab[i].deadline).toBeLessThan(tab[i - 1].deadline);
    }
  });
});

describe('session protocols', () => {
  it('COGITO-inspired session practises all 12 tasks with the study’s fixed blocks, whatever the length setting', () => {
    const plan = buildPlan({ minutes: 15, includeWorking: false, recent: [], seed: 's', delayed: true, protocol: 'cogito' });
    expect(plan.map((p) => p.exerciseId)).toEqual(COGITO_TASKS.map((t) => t.id));
    expect(buildPlan({ minutes: 60, includeWorking: false, recent: [], seed: 's', delayed: true, protocol: 'cogito' })).toEqual(plan);
    expect(plan.filter((p) => p.kind === 'speed')).toHaveLength(6);
    const blocks = Object.fromEntries(plan.map((p) => [p.exerciseId, p.blocks]));
    // Schmiedek et al. (2010): 2 trials per episodic and speed task, 8 alpha-span lists and 8 updating
    // problems (4 per block here), 4 spatial 3-back runs.
    expect(blocks).toEqual({ G1: 2, G2: 2, G3: 2, G4: 2, G5: 2, G6: 4, P1: 2, P2: 2, P3: 2, P4: 2, P5: 2, P6: 2 });
    // speed is a minority of the time, not half of it
    const speed = plan.filter((p) => p.kind === 'speed').reduce((a, p) => a + p.minutes, 0);
    expect(speed / planMinutes(plan)).toBeLessThan(0.35);
  });

  it('hybrid plans draw only from the hybrid pools and include speed + delayed recall', () => {
    for (const goal of ['episodic', 'broad'] as const) {
      const plan = buildPlan({ minutes: 15, includeWorking: false, recent: [], seed: `h${goal}`, delayed: true, protocol: 'hybrid', goal });
      for (const p of plan) if (p.exerciseId && p.kind !== 'delayed') expect(HYBRID_POOLS[p.kind as keyof typeof HYBRID_POOLS]).toContain(p.exerciseId);
      expect(plan[plan.length - 1].kind).toBe('delayed');
      expect(plan.some((p) => p.exerciseId && PROBE_SOURCES.includes(p.exerciseId))).toBe(true);
      expect(Math.abs(plan.reduce((a, p) => a + p.minutes, 0) - 15)).toBeLessThanOrEqual(1);
    }
  });

  it('goal shifts time: episodic gives more to episodic memory, broad to WM and speed', () => {
    const mins = (goal: 'episodic' | 'broad', kind: string) =>
      buildPlan({ minutes: 15, includeWorking: false, recent: [], seed: 'g', delayed: true, protocol: 'hybrid', goal })
        .filter((p) => p.kind === kind)
        .reduce((a, p) => a + p.minutes, 0);
    expect(mins('episodic', 'verbal')).toBeGreaterThan(mins('broad', 'verbal'));
    expect(mins('broad', 'speed')).toBeGreaterThan(mins('episodic', 'speed'));
    expect(mins('broad', 'working')).toBeGreaterThan(mins('episodic', 'working'));
    const broad = buildPlan({ minutes: 15, includeWorking: false, recent: [], seed: 'g', delayed: true, protocol: 'hybrid', goal: 'broad' }).filter((p) => p.kind === 'speed');
    expect(broad).toHaveLength(2);
    expect(broad[0].exerciseId).not.toBe(broad[1].exerciseId);
  });

  it('hybrid rotation prefers COGITO tasks that have not been practised recently', () => {
    const recent: ExerciseId[] = ['A1', 'A2'];
    const plan = buildPlan({ minutes: 15, includeWorking: false, recent, seed: 'r', delayed: false, protocol: 'hybrid' });
    expect(plan[0].exerciseId).toBe('G1');
  });

  it('every exercise in every pool is registered and has a level table', () => {
    for (const id of [...Object.values(HYBRID_POOLS).flat(), ...COGITO_TASKS.map((t) => t.id)]) {
      expect(EXERCISES[id]).toBeDefined();
      expect(LEVELS[id].length).toBeGreaterThan(1);
    }
  });
});

describe('untrained transfer battery', () => {
  it('symbol–digit: key is a permutation and coding is consistent', () => {
    const { key, stream } = genSymbolDigit(0);
    expect([...key].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const s of stream.slice(0, 20)) expect(key[digitForSymbol(key, s) - 1]).toBe(s);
    expect(genSymbolDigit(1).key).not.toEqual(key);
  });

  it('series items: 4 unique options containing the answer, and alternate forms differ', () => {
    for (let f = 0; f < TRANSFER_FORMS; f++) {
      const items = genSeries(f);
      expect(items).toHaveLength(12);
      for (const it of items) {
        expect(new Set(it.options).size).toBe(4);
        expect(it.options).toContain(it.answer);
        expect(it.terms).toHaveLength(6);
      }
    }
    expect(genSeries(0).map((i) => i.terms.join())).not.toEqual(genSeries(1).map((i) => i.terms.join()));
  });

  it('series answers follow their rule (arithmetic and letter-skip checks)', () => {
    for (let f = 0; f < TRANSFER_FORMS; f++)
      for (const it of genSeries(f)) {
        if (it.rule === 'arithmetic') {
          const n = it.terms.map(Number);
          expect(Number(it.answer)).toBe(n[5] + (n[1] - n[0]));
        }
        if (it.rule === 'letterSkip') {
          const k = it.terms[1].charCodeAt(0) - it.terms[0].charCodeAt(0);
          expect(it.answer.charCodeAt(0)).toBe(((it.terms[5].charCodeAt(0) - 65 + k) % 26) + 65);
        }
      }
  });

  it('Corsi sequences use distinct blocks and span scoring follows the discontinue rule', () => {
    const seqs = genCorsi(0);
    expect(seqs[0][0]).toHaveLength(3);
    for (const len of seqs) for (const s of len) expect(new Set(s).size).toBe(s.length);
    expect(Math.max(...seqs.flat(2))).toBeLessThan(CORSI_BLOCKS.length);
    expect(corsiSpan([{ len: 3, ok: true }, { len: 3, ok: false }, { len: 4, ok: true }, { len: 5, ok: false }, { len: 5, ok: false }])).toBe(4);
  });

  it('transfer forms rotate independently of the main assessment forms', () => {
    const transfers = [{ form: 0, startedAt: 1, completed: true }];
    expect(chooseForm(transfers).form).toBe(1);
  });
});
