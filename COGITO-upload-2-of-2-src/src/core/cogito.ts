import { createRng, type Rng } from './rng';
import { poolIds, wordText } from '../content';
import { OBJECTS } from '../content/visual';
import { objectRecent, sampleFresh } from './generate';
import type { Lang } from './types';

// Seeded generators for the COGITO-inspired tasks (Schmiedek, Lövdén & Lindenberger, 2010).
// These follow the published task descriptions but are not the original materials or parameters.

// ---------- episodic ----------

export function genNumberNoun(seed: string, n: number, recent: string[] = []) {
  const rng = createRng(seed);
  const nouns = sampleFresh(rng, poolIds('misc'), n, recent);
  const numbers = rng.sample(Array.from({ length: 90 }, (_, i) => i + 10), n);
  const pairs = nouns.map((noun, i) => ({ noun, number: numbers[i] }));
  return { pairs, testOrder: rng.shuffle(pairs) };
}

export const OBJECT_GRID = 6;

/** Objects shown one after another at distinct cells of a 6×6 grid. */
export function genObjectPositions(seed: string, n: number, recent: string[] = []) {
  const rng = createRng(seed);
  const objs = sampleFresh(rng, OBJECTS.map((o) => o.id), n, objectRecent(recent));
  const cells = rng.sample(Array.from({ length: OBJECT_GRID * OBJECT_GRID }, (_, i) => i), n);
  const sequence = objs.map((id, i) => ({ id, cell: cells[i] }));
  return { sequence, palette: rng.shuffle(objs) };
}

// ---------- working memory ----------

export const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXZ'.split('');

export type AlphaVariant = 'letters' | 'words';

export function genAlphaSpan(seed: string, length: number, variant: AlphaVariant, trials = 4) {
  const rng = createRng(seed);
  return Array.from({ length: trials }, () => (variant === 'letters' ? rng.sample(CONSONANTS, length) : rng.sample(poolIds('misc'), length)));
}

/** Alphabetical order of a list in the stimulus language (locale-aware, accents ignored). */
export function alphaOrder(items: string[], variant: AlphaVariant, lang: Lang): string[] {
  const label = (x: string) => (variant === 'letters' ? x : wordText(x, lang));
  const collator = new Intl.Collator(lang === 'pt' ? 'pt-PT' : 'en-GB', { sensitivity: 'base' });
  return items.slice().sort((a, b) => collator.compare(label(a), label(b)));
}

// ---------- perceptual speed ----------

export type SpeedTask = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
export type Side = 'left' | 'right';

export type Segment = [number, number, number, number];
export type Cube = [number, number, number];

export type SpeedTrial =
  | { task: 'P1'; digit: number; answer: Side }
  | { task: 'P2'; letter: string; answer: Side }
  | { task: 'P3'; segments: Segment[]; answer: Side }
  | { task: 'P4' | 'P5'; a: string; b: string; answer: Side }
  | { task: 'P6'; a: Cube[]; b: Cube[]; answer: Side };

const VOWELS = ['A', 'E', 'I', 'O', 'U'];

// --- symmetry figures: segments on a 0..6 lattice, symmetry about x = 3 ---

const LATTICE = 6;
const segKey = ([x1, y1, x2, y2]: Segment) => (x1 < x2 || (x1 === x2 && y1 <= y2) ? `${x1},${y1},${x2},${y2}` : `${x2},${y2},${x1},${y1}`);
const mirrorSeg = ([x1, y1, x2, y2]: Segment): Segment => [LATTICE - x1, y1, LATTICE - x2, y2];

export function isSymmetric(segments: Segment[]): boolean {
  const keys = new Set(segments.map(segKey));
  return segments.every((s) => keys.has(segKey(mirrorSeg(s))));
}

function genSymmetricFigure(rng: Rng): Segment[] {
  const half: Segment[] = [];
  let p: [number, number] = [rng.int(0, 2), rng.int(0, LATTICE)];
  while (half.length < 4) {
    const q: [number, number] = [Math.min(3, Math.max(0, p[0] + rng.int(-1, 1) * rng.int(1, 2))), Math.min(LATTICE, Math.max(0, p[1] + rng.int(-2, 2)))];
    if (q[0] === p[0] && q[1] === p[1]) continue;
    const s: Segment = [p[0], p[1], q[0], q[1]];
    if (!half.some((h) => segKey(h) === segKey(s))) half.push(s);
    p = q;
  }
  const all = [...half, ...half.map(mirrorSeg)];
  const seen = new Set<string>();
  return all.filter((s) => (seen.has(segKey(s)) ? false : (seen.add(segKey(s)), true)));
}

export function genSymmetryFigure(rng: Rng, symmetric: boolean): Segment[] {
  for (;;) {
    const fig = genSymmetricFigure(rng);
    if (symmetric) return fig;
    // Break symmetry by moving one endpoint of one right-hand segment by one lattice step.
    const i = rng.int(0, fig.length - 1);
    const s = fig[i].slice() as Segment;
    const k = rng.pick([0, 1, 2, 3]);
    s[k] = Math.min(LATTICE, Math.max(0, s[k] + rng.pick([-1, 1])));
    if (s[0] === s[2] && s[1] === s[3]) continue;
    const out = fig.map((f, j) => (j === i ? s : f));
    if (!isSymmetric(out)) return out;
  }
}

// --- 3D figures: polycubes compared under rotation about the vertical axis ---

export function normalizeCubes(cubes: Cube[]): string {
  const mx = Math.min(...cubes.map((c) => c[0]));
  const my = Math.min(...cubes.map((c) => c[1]));
  const mz = Math.min(...cubes.map((c) => c[2]));
  return cubes
    .map(([x, y, z]) => `${x - mx},${y - my},${z - mz}`)
    .sort()
    .join('|');
}

export function rotateYaw(cubes: Cube[], k: number): Cube[] {
  let out = cubes;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) out = out.map(([x, y, z]) => [-y, x, z] as Cube);
  return out;
}

export function mirrorCubes(cubes: Cube[]): Cube[] {
  return cubes.map(([x, y, z]) => [-x, y, z] as Cube);
}

/** True if `b` equals `a` under some rotation about the vertical axis (plus translation). */
export function sameUnderYaw(a: Cube[], b: Cube[]): boolean {
  const target = normalizeCubes(b);
  return [0, 1, 2, 3].some((k) => normalizeCubes(rotateYaw(a, k)) === target);
}

export function genPolycube(rng: Rng, n = 6): Cube[] {
  const cubes: Cube[] = [[0, 0, 0]];
  const has = (c: Cube) => cubes.some((d) => d[0] === c[0] && d[1] === c[1] && d[2] === c[2]);
  const dirs: Cube[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  while (cubes.length < n) {
    const base = rng.pick(cubes);
    const d = rng.pick(dirs);
    const c: Cube = [base[0] + d[0], base[1] + d[1], base[2] + d[2]];
    if (c[2] < 0 || c[2] > 2 || Math.abs(c[0]) > 2 || Math.abs(c[1]) > 2 || has(c)) continue;
    cubes.push(c);
  }
  return cubes;
}

/** A figure whose mirror image cannot be obtained by rotation — so "mirrored" is always a true mismatch. */
export function genChiralPolycube(rng: Rng): Cube[] {
  for (;;) {
    const c = genPolycube(rng);
    if (!sameUnderYaw(c, mirrorCubes(c))) return c;
  }
}

function digitString(rng: Rng, n: number) {
  return Array.from({ length: n }, () => String(rng.int(0, 9))).join('');
}

function changeOne(rng: Rng, s: string, alphabet: string[]): string {
  const i = rng.int(0, s.length - 1);
  const c = rng.pick(alphabet.filter((x) => x !== s[i]));
  return s.slice(0, i) + c + s.slice(i + 1);
}

/** A balanced block of speed trials (half "left", half "right"), shuffled. */
export function genSpeedTrials(task: SpeedTask, seed: string, n = 24): SpeedTrial[] {
  const rng = createRng(seed);
  const answers = rng.shuffle(Array.from({ length: n }, (_, i): Side => (i % 2 ? 'right' : 'left')));
  return answers.map((answer): SpeedTrial => {
    const left = answer === 'left';
    switch (task) {
      case 'P1': // left = odd
        return { task, digit: left ? rng.pick([1, 3, 5, 7, 9]) : rng.pick([2, 4, 6, 8]), answer };
      case 'P2': // left = vowel
        return { task, letter: left ? rng.pick(VOWELS) : rng.pick(CONSONANTS), answer };
      case 'P3': // left = symmetric
        return { task, segments: genSymmetryFigure(rng, left), answer };
      case 'P4':
      case 'P5': {
        // left = same
        const alphabet = task === 'P4' ? '0123456789'.split('') : CONSONANTS;
        const a = task === 'P4' ? digitString(rng, 5) : rng.sample(CONSONANTS, 5).join('');
        return { task, a, b: left ? a : changeOne(rng, a, alphabet), answer };
      }
      case 'P6': {
        // left = same figure (rotated), right = mirror image (rotated)
        const a = genChiralPolycube(rng);
        const k = rng.int(1, 3);
        return { task, a, b: rotateYaw(left ? a : mirrorCubes(a), k), answer };
      }
    }
  });
}

/** The correct answer for any speed trial, recomputed from its content (used by tests). */
export function checkSpeedTrial(t: SpeedTrial): Side {
  switch (t.task) {
    case 'P1':
      return t.digit % 2 ? 'left' : 'right';
    case 'P2':
      return VOWELS.includes(t.letter) ? 'left' : 'right';
    case 'P3':
      return isSymmetric(t.segments) ? 'left' : 'right';
    case 'P4':
    case 'P5':
      return t.a === t.b ? 'left' : 'right';
    case 'P6':
      return sameUnderYaw(t.a, t.b) ? 'left' : 'right';
  }
}
