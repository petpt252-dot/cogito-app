import { createRng, type Rng } from './rng';
import type { ExerciseId } from './types';
import type { LevelParams } from './levels';
import { normalize } from './text';
import { pairwiseOrderScore } from './stats';

// "COGITO faithful" protocol: the practised tasks with the set sizes, timings and stimulus rules reported by
// Schmiedek, Lövdén & Lindenberger (2010, Frontiers in Aging Neuroscience 2:27), and difficulty fixed for the
// whole programme by a calibration pre-test (no adaptation). Where the paper gives no value, the choice made
// here is marked ASSUMPTION.

// ---------- presentation-time levels (fastest → slowest), from the paper ----------

export const PT_LEVELS = {
  /** Episodic memory (word lists, number–noun pairs, object positions): 1, 2 or 4 s; ISI 1 s. */
  em: [1000, 2000, 4000],
  /** Alpha span: 0.75, 1.5 or 3 s; ISI 0.5 s. */
  alpha: [750, 1500, 3000],
  /** Numerical updating, per operation: 0.5, 1.25 or 2.75 s; ISI 0.25 s. */
  updating: [500, 1250, 2750],
  /** Spatial 3-back: dot 0.5 s, ISI 0.5, 1.5 or 2.5 s. */
  nbackIsi: [500, 1500, 2500],
  /** Choice reaction tasks: masking after 2, 4 or 8 screen cycles (24, 47 or 94 ms in the study). */
  maskMs: [24, 47, 94],
} as const;

export const EM_ISI_MS = 1000;
export const ALPHA_ISI_MS = 500;
export const UPDATING_ISI_MS = 250;
export const UPDATING_INITIAL_MS = 4000;
export const UPDATING_GAP_MS = 500;
export const NBACK_STIM_MS = 500;

/**
 * Target accuracy band used to pick a level from the calibration: the fastest level whose accuracy reaches
 * `min`, except that the fastest is used if the second-fastest already exceeds `upper` (the paper's rule).
 * CRT, alpha-span and updating bands are the paper's; EM and 3-back bands are not reported (ASSUMPTION).
 */
export const BANDS = {
  em: { min: 0.5, upper: 0.75 }, // ASSUMPTION
  alpha: { min: 0.4, upper: 0.6 },
  updating: { min: 0.325, upper: 0.55 },
  nback: { min: 0.75, upper: 0.875 }, // ASSUMPTION (two-choice task, chance = 0.5)
  crtFast: { min: 0.625, upper: 0.75 },
  crtSlow: { min: 0.875, upper: 0.95 },
} as const;

/** Index (0 = fastest) chosen from accuracies measured at each level, fastest first. */
export function chooseLevel(acc: number[], band: { min: number; upper: number }): number {
  if (acc.length > 1 && acc[1] > band.upper) return 0;
  const i = acc.findIndex((a) => a >= band.min);
  return i === -1 ? acc.length - 1 : i;
}

/** CRTs get two masking times: a fast and a strictly slower one (the paper's fast/slow conditions). */
export function chooseCrtLevels(acc: number[]): { fast: number; slow: number } {
  let fast = chooseLevel(acc, BANDS.crtFast);
  let slow = Math.max(chooseLevel(acc, BANDS.crtSlow), fast + 1);
  if (slow > acc.length - 1) {
    slow = acc.length - 1;
    fast = Math.min(fast, slow - 1);
  }
  return { fast, slow };
}

// ---------- calibration record ----------

export type CalibTask = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'P1' | 'P2' | 'P3';

export interface Calibration {
  createdAt: number;
  /** Chosen level index (0 = fastest) per timed task; CRTs have fast and slow masking levels. */
  levels: Partial<Record<Exclude<CalibTask, 'P1' | 'P2' | 'P3'>, number>> & Partial<Record<'P1' | 'P2' | 'P3', { fast: number; slow: number }>>;
  /** Measured accuracy at each level (fastest first), kept for the record. */
  accuracy: Partial<Record<CalibTask, number[]>>;
  /** Measured screen refresh (ms per frame) used for the masking times. */
  frameMs?: number;
}

export const CALIBRATION_KEY = 'cogitoCalibration';

/** Study set sizes. */
export const FAITHFUL_SIZES = { words: 36, pairs: 12, objects: 12, alphaLength: 10, alphaLists: 4, updatingProblems: 4, nbackDots: 39, speedItems: 40 } as const;

/** Fixed parameters for one task in the faithful protocol, from the calibration. */
export function faithfulParams(id: ExerciseId, cal: Calibration): LevelParams {
  const lv = cal.levels;
  switch (id) {
    case 'G1':
      return { items: FAITHFUL_SIZES.words, pt: PT_LEVELS.em[lv.G1 ?? 1], isi: EM_ISI_MS };
    case 'G2':
      return { pairs: FAITHFUL_SIZES.pairs, pt: PT_LEVELS.em[lv.G2 ?? 1], isi: EM_ISI_MS };
    case 'G3':
      return { objects: FAITHFUL_SIZES.objects, pt: PT_LEVELS.em[lv.G3 ?? 1], isi: EM_ISI_MS };
    case 'G4':
      return { length: FAITHFUL_SIZES.alphaLength, lists: FAITHFUL_SIZES.alphaLists, pt: PT_LEVELS.alpha[lv.G4 ?? 1], isi: ALPHA_ISI_MS };
    case 'G5':
      return { slots: 4, ops: 8, problems: FAITHFUL_SIZES.updatingProblems, opMs: PT_LEVELS.updating[lv.G5 ?? 1], isi: UPDATING_ISI_MS };
    case 'G6':
      return { dots: FAITHFUL_SIZES.nbackDots, stim: NBACK_STIM_MS, isi: PT_LEVELS.nbackIsi[lv.G6 ?? 1] };
    case 'P1':
    case 'P2':
    case 'P3': {
      const c = lv[id] ?? { fast: 0, slow: 2 };
      return { items: FAITHFUL_SIZES.speedItems, fastMs: PT_LEVELS.maskMs[c.fast], slowMs: PT_LEVELS.maskMs[c.slow] };
    }
    // Comparison tasks: the paper reports no presentation-time levels. ASSUMPTION: an item stays until the
    // answer, with a generous fixed limit, and accuracy is scored.
    case 'P4':
    case 'P5':
      return { items: FAITHFUL_SIZES.speedItems, deadline: 4000 };
    case 'P6':
      return { items: FAITHFUL_SIZES.speedItems, deadline: 6000 };
    default:
      return {};
  }
}

// ---------- alpha span (original procedure) ----------

export const ALPHA_CONSONANTS = 'BCDFGHJKLMNPQRSTVWXZ'.split('');

export interface AlphaItem {
  letter: string;
  /** Number shown under the letter. */
  shown: number;
  /** Alphabetical position of the letter among the letters shown so far (1-based). */
  correct: number;
  target: boolean;
}

/** Position of letters[k] in alphabetical order among letters[0..k], 1-based. */
export function alphaRank(letters: string[], k: number): number {
  return letters.slice(0, k + 1).filter((l) => l < letters[k]).length + 1;
}

/** Ten distinct consonants; 5 targets (number = true position), non-targets off by ±1 (within 1..k). */
export function genAlphaList(rng: Rng, length = 10, targets = 5): AlphaItem[] {
  const letters = rng.sample(ALPHA_CONSONANTS, length);
  const correct = letters.map((_, k) => alphaRank(letters, k));
  // Item 1 can only be a target (its position is always 1 and 0 / 2 are impossible).
  const others = rng.sample(Array.from({ length: length - 1 }, (_, i) => i + 1), targets - 1);
  const isTarget = new Set([0, ...others]);
  return letters.map((letter, k) => {
    if (isTarget.has(k)) return { letter, shown: correct[k], correct: correct[k], target: true };
    const options = [correct[k] - 1, correct[k] + 1].filter((x) => x >= 1 && x <= k + 1);
    return { letter, shown: rng.pick(options), correct: correct[k], target: false };
  });
}

export function genAlphaBlock(seed: string, lists = 4, length = 10): AlphaItem[][] {
  const rng = createRng(seed);
  return Array.from({ length: lists }, () => genAlphaList(rng, length));
}

// ---------- numerical updating (study rules) ----------

/**
 * 4 digits (0–9), 8 operations of −8…+8 (never 0), never the same cell twice in a row, and every intermediate
 * and final value within 0–9.
 */
export function genStrictUpdating(seed: string, problems = 4, slots = 4, ops = 8) {
  const rng = createRng(seed);
  return Array.from({ length: problems }, () => {
    const initial = Array.from({ length: slots }, () => rng.int(0, 9));
    const values = initial.slice();
    const operations: { slot: number; delta: number }[] = [];
    let last = -1;
    for (let i = 0; i < ops; i++) {
      const slot = rng.pick(Array.from({ length: slots }, (_, s) => s).filter((s) => s !== last));
      const options = Array.from({ length: 17 }, (_, k) => k - 8).filter((d) => d !== 0 && values[slot] + d >= 0 && values[slot] + d <= 9);
      const delta = rng.pick(options);
      values[slot] += delta;
      operations.push({ slot, delta });
      last = slot;
    }
    return { initial, operations, final: values };
  });
}

// ---------- spatial 3-back (study rules) ----------

export const NBACK_LURE_LAGS = [2, 4, 5, 6] as const;

/**
 * 39 dots on a 4×4 grid: 12 targets (same cell as 3 back), exactly 3 lures at each of lags 2, 4, 5 and 6,
 * no repeat in consecutive steps and no longer lags — every other dot is in a cell not used before.
 * A repeat's lag is the distance to the most recent dot in the same cell.
 */
export function genStrictNBack(seed: string, length = 39, cells = 16, targets = 12, luresPerLag = 3): number[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const rng = createRng(`${seed}:${attempt}`);
    const seq = buildNBack(rng, length, cells, targets, luresPerLag);
    if (seq) return seq;
  }
  throw new Error('Could not build a 3-back sequence');
}

function buildNBack(rng: Rng, length: number, cells: number, targets: number, luresPerLag: number): number[] | null {
  const need: Record<number, number> = { 3: targets };
  for (const l of NBACK_LURE_LAGS) need[l] = luresPerLag;
  let novel = length - targets - luresPerLag * NBACK_LURE_LAGS.length;
  const seq: number[] = [];
  const used = new Set<number>();
  for (let i = 0; i < length; i++) {
    const choices: (number | 'new')[] = [];
    // a lag L repeat at i is valid if the cell at i-L has not appeared since (so L is its most recent lag)
    for (const lag of Object.keys(need).map(Number)) {
      if (need[lag] > 0 && i - lag >= 0 && !seq.slice(i - lag + 1).includes(seq[i - lag])) choices.push(lag);
    }
    if (novel > 0 && used.size < cells) choices.push('new');
    if (!choices.length) return null;
    // keep enough room: weight choices by how many of each are still needed
    const weights = choices.map((c) => (c === 'new' ? novel : need[c as number]));
    let r = rng.next() * weights.reduce((a, b) => a + b, 0);
    let pick = choices[0];
    for (let k = 0; k < choices.length; k++) {
      r -= weights[k];
      if (r < 0) {
        pick = choices[k];
        break;
      }
    }
    if (pick === 'new') {
      const free = Array.from({ length: cells }, (_, c) => c).filter((c) => !used.has(c));
      const cell = rng.pick(free);
      seq.push(cell);
      used.add(cell);
      novel--;
    } else {
      seq.push(seq[i - (pick as number)]);
      need[pick as number]--;
    }
  }
  return Object.values(need).every((n) => n === 0) && novel === 0 ? seq : null;
}

/** Most recent lag of each dot (0 = first time in that cell). */
export function lagsOf(seq: number[]): number[] {
  return seq.map((c, i) => {
    for (let j = i - 1; j >= 0; j--) if (seq[j] === c) return i - j;
    return 0;
  });
}

// ---------- seven-segment stimuli for the choice reaction tasks ----------

/** Segments of a calculator "8": a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle. */
export type Seg = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';
export const SEGS: Seg[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

export const DIGIT_SEGS: Record<number, Seg[]> = {
  0: ['a', 'b', 'c', 'd', 'e', 'f'],
  1: ['b', 'c'],
  2: ['a', 'b', 'g', 'e', 'd'],
  3: ['a', 'b', 'g', 'c', 'd'],
  4: ['f', 'g', 'b', 'c'],
  5: ['a', 'f', 'g', 'c', 'd'],
  6: ['a', 'f', 'g', 'e', 'c', 'd'],
  7: ['a', 'b', 'c'],
  8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  9: ['a', 'b', 'c', 'd', 'f', 'g'],
};

/** Letters a calculator display can show unambiguously (no letter looks like a digit or another letter). */
export const LETTER_SEGS: Record<string, Seg[]> = {
  A: ['a', 'b', 'c', 'e', 'f', 'g'],
  E: ['a', 'd', 'e', 'f', 'g'],
  U: ['b', 'c', 'd', 'e', 'f'],
  C: ['a', 'd', 'e', 'f'],
  F: ['a', 'e', 'f', 'g'],
  H: ['b', 'c', 'e', 'f', 'g'],
  L: ['d', 'e', 'f'],
  P: ['a', 'b', 'e', 'f', 'g'],
};
export const SEG_VOWELS = ['A', 'E', 'U'];
export const SEG_CONSONANTS = ['C', 'F', 'H', 'L', 'P'];

/** Left–right mirror of a segment (a, d, g lie on the axis). */
const MIRROR: Record<Seg, Seg> = { a: 'a', d: 'd', g: 'g', b: 'f', f: 'b', c: 'e', e: 'c' };

export function isSegSymmetric(segs: Seg[]): boolean {
  const s = new Set(segs);
  return segs.every((x) => s.has(MIRROR[x]));
}

/** 3–5 lit segments, symmetric about the vertical axis or not. */
export function genSegFigure(rng: Rng, symmetric: boolean): Seg[] {
  for (;;) {
    const n = rng.int(3, 5);
    const segs = rng.sample(SEGS, n);
    if (isSegSymmetric(segs) === symmetric) return segs;
  }
}

export type CrtTask = 'P1' | 'P2' | 'P3';

export interface CrtTrial {
  segs: Seg[];
  /** 'left' = odd / vowel / symmetric. */
  answer: 'left' | 'right';
  /** true = fast masking time, false = slow. */
  fast: boolean;
}

/** 40 items: 20 fast + 20 slow, each half balanced over the two answers, in random order. */
export function genCrtTrials(task: CrtTask, seed: string, n = 40): CrtTrial[] {
  const rng = createRng(seed);
  const items: CrtTrial[] = [];
  for (let i = 0; i < n; i++) {
    const fast = i < n / 2;
    const left = i % 2 === 0;
    let segs: Seg[];
    if (task === 'P1') segs = DIGIT_SEGS[left ? rng.pick([1, 3, 5, 7, 9]) : rng.pick([0, 2, 4, 6, 8])];
    else if (task === 'P2') segs = LETTER_SEGS[left ? rng.pick(SEG_VOWELS) : rng.pick(SEG_CONSONANTS)];
    else segs = genSegFigure(rng, left);
    items.push({ segs, answer: left ? 'left' : 'right', fast });
  }
  return rng.shuffle(items);
}

/** Calibration block: equal numbers at each of the three masking levels. */
export function genCrtCalibration(task: CrtTask, seed: string, perLevel = 12) {
  const rng = createRng(`${seed}:levels`);
  const base = genCrtTrials(task, seed, perLevel * 3);
  const levels = rng.shuffle(Array.from({ length: perLevel * 3 }, (_, i) => Math.floor(i / perLevel)));
  return base.map((t, i) => ({ ...t, level: levels[i] }));
}

// ---------- fribble-like objects for figural comparison ----------

/** An object made of a body and four parts; each slot holds one of several part shapes. */
export interface Fribble {
  body: number;
  hue: number;
  parts: number[]; // 4 slots, shape index 0..PART_SHAPES-1
}
export const PART_SHAPES = 5;
export const BODY_SHAPES = 3;

export function genFribble(rng: Rng): Fribble {
  return { body: rng.int(0, BODY_SHAPES - 1), hue: rng.int(0, 5), parts: Array.from({ length: 4 }, () => rng.int(0, PART_SHAPES - 1)) };
}

/** Same pair, or a copy differing in exactly one part (as in the study's fribble comparison). */
export function genFribbleTrials(seed: string, n = 40) {
  const rng = createRng(seed);
  const answers = rng.shuffle(Array.from({ length: n }, (_, i) => (i % 2 ? 'right' : 'left') as 'left' | 'right'));
  return answers.map((answer) => {
    const a = genFribble(rng);
    if (answer === 'left') return { a, b: { ...a, parts: a.parts.slice() }, answer };
    const slot = rng.int(0, 3);
    const parts = a.parts.slice();
    parts[slot] = rng.pick(Array.from({ length: PART_SHAPES }, (_, k) => k).filter((k) => k !== a.parts[slot]));
    return { a, b: { ...a, parts }, answer };
  });
}

export const sameFribble = (x: Fribble, y: Fribble) => x.body === y.body && x.hue === y.hue && x.parts.every((p, i) => p === y.parts[i]);

// ---------- word-list scoring (study) ----------

const first3 = (w: string) => normalize(w).replace(/[\s-]/g, '').slice(0, 3);

/**
 * Responses are the first three letters of each word, in order. Score = words recalled × order accuracy
 * (0 = reverse order, 1 = perfect order; pairwise concordance), as in the study. Each entry is matched to the
 * earliest unmatched studied word with those first letters, in either language.
 */
export function scoreFirstThree(items: { id: string; forms: string[] }[], entries: string[]) {
  const used = new Set<number>();
  const recalled: string[] = [];
  let intrusions = 0;
  for (const raw of entries) {
    const e = first3(raw);
    if (!e) continue;
    const k = items.findIndex((it, i) => !used.has(i) && it.forms.some((form) => first3(form) === e));
    if (k === -1) intrusions++;
    else {
      used.add(k);
      recalled.push(items[k].id);
    }
  }
  const truth = items.map((it) => it.id);
  const order = recalled.length >= 2 ? pairwiseOrderScore(truth, recalled) : recalled.length;
  return { recalled: recalled.length, order, intrusions, recalledIds: recalled, accuracy: (recalled.length / items.length) * order };
}
