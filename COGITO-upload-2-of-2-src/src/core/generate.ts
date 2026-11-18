import { createRng, type Rng } from './rng';
import { CATEGORY_KEYS, categoryIds, poolIds, STORIES, EVENTS, WORDS } from '../content';
import { COLOR_KEYS, OBJECTS, SHAPES, type ColorKey, type Shape } from '../content/visual';

// Pure, seeded trial generators. Same seed + params → identical trial, in any language.

/**
 * Sample n ids, preferring ones not in `avoid` (recent exposure, oldest first); when the pool runs out of
 * unseen items, the least recently seen ones are used first.
 */
export function sampleFresh(rng: Rng, pool: string[], n: number, avoid: Iterable<string> = []): string[] {
  const order = [...avoid];
  const last = new Map<string, number>();
  order.forEach((x, i) => last.set(x, i));
  const fresh = rng.shuffle(pool.filter((x) => !last.has(x)));
  const stale = rng.shuffle(pool.filter((x) => last.has(x))).sort((x, y) => (last.get(x) as number) - (last.get(y) as number));
  return [...fresh, ...stale].slice(0, n);
}

/** Object exposure is stored as "obj:<id>" (older blocks stored bare ids); compare bare ids. */
export const objectRecent = (recent: string[]) => recent.map((x) => (x.startsWith('obj:') ? x.slice(4) : x));

// ---------- verbal ----------

export function genWordList(seed: string, n: number, recent: string[] = []) {
  return { ids: sampleFresh(createRng(seed), poolIds('misc'), n, recent) };
}

/** Categorised list, presented in an order where no two adjacent words share a category when possible. */
export function genSemanticList(seed: string, nCategories: number, perCategory: number) {
  const rng = createRng(seed);
  const cats = rng.sample(CATEGORY_KEYS, nCategories);
  const buckets = cats.map((c) => rng.sample(categoryIds(c), perCategory));
  const order: string[] = [];
  let last = -1;
  while (buckets.some((b) => b.length)) {
    const options = buckets.map((b, i) => (b.length && i !== last ? i : -1)).filter((i) => i >= 0);
    const pickFrom = options.length ? options : buckets.map((b, i) => (b.length ? i : -1)).filter((i) => i >= 0);
    // Prefer the fullest bucket so the constraint stays satisfiable to the end.
    const max = Math.max(...pickFrom.map((i) => buckets[i].length));
    const i = rng.pick(pickFrom.filter((j) => buckets[j].length === max));
    order.push(buckets[i].pop() as string);
    last = i;
  }
  return { categories: cats, ids: order };
}

/**
 * Recognition list. Studied words come from 5 categories; distractors come from the same categories
 * (similarity 1: semantically similar lures) or from 5 other categories (similarity 0).
 */
export function genRecognition(seed: string, items: number, similarity: number) {
  const rng = createRng(seed);
  const cats = rng.shuffle(CATEGORY_KEYS);
  const studyCats = cats.slice(0, 5);
  const lureCats = similarity ? studyCats : cats.slice(5, 10);
  const per = Math.ceil(items / 5);
  const studied: string[] = [];
  const lures: string[] = [];
  studyCats.forEach((c, i) => {
    const ids = rng.shuffle(categoryIds(c));
    studied.push(...ids.slice(0, per));
    if (similarity) lures.push(...ids.slice(per, per * 2));
    else lures.push(...rng.sample(categoryIds(lureCats[i]), per));
  });
  const old = rng.shuffle(studied).slice(0, items);
  const neu = rng.shuffle(lures).slice(0, items);
  const test = rng.shuffle([...old.map((id) => ({ id, old: true })), ...neu.map((id) => ({ id, old: false }))]);
  return { studied: old, test };
}

export function genPairs(seed: string, n: number, recent: string[] = []) {
  const ids = sampleFresh(createRng(seed), poolIds('misc'), n * 2, recent);
  return { pairs: Array.from({ length: n }, (_, i) => ({ cue: ids[i * 2], target: ids[i * 2 + 1] })) };
}

// ---------- associative ----------

export interface FaceParams {
  skin: number;
  shape: number;
  hair: number;
  hairColor: number;
  eyes: number;
  brows: number;
  nose: number;
  mouth: number;
  glasses: boolean;
  beard: boolean;
  bg: number;
}

export function genFace(rng: Rng): FaceParams {
  return {
    skin: rng.int(0, 5),
    shape: rng.int(0, 2),
    hair: rng.int(0, 5),
    hairColor: rng.int(0, 5),
    eyes: rng.int(0, 3),
    brows: rng.int(0, 2),
    nose: rng.int(0, 2),
    mouth: rng.int(0, 2),
    glasses: rng.next() < 0.3,
    beard: rng.next() < 0.25,
    bg: rng.int(0, 4),
  };
}

export function genFaceNames(seed: string, n: number) {
  const rng = createRng(seed);
  const nameIdx = rng.sample(WORDS.en.names.map((_, i) => i), n);
  const occIdx = rng.sample(WORDS.en.occupations.map((_, i) => i), Math.min(n, WORDS.en.occupations.length));
  const faces = nameIdx.map((name, i) => ({ id: `f${i}`, face: genFace(rng), name, occupation: occIdx[i % occIdx.length] }));
  // Test: each face with 4 name options — the correct name plus lures drawn from the *studied* names,
  // so the test probes the face–name binding rather than name familiarity.
  const test = rng.shuffle(faces).map((f) => {
    const others = faces.filter((g) => g.id !== f.id).map((g) => g.name);
    const lures = rng.sample(others, Math.min(3, others.length));
    return { id: f.id, options: rng.shuffle([f.name, ...lures]) };
  });
  return { faces, test };
}

export function genObjectLocation(seed: string, n: number, gridSize = 4, recent: string[] = []) {
  const rng = createRng(seed);
  const objs = sampleFresh(rng, OBJECTS.map((o) => o.id), n * 2, objectRecent(recent));
  const cells = rng.sample(Array.from({ length: gridSize * gridSize }, (_, i) => i), n);
  const placed = objs.slice(0, n).map((id, i) => ({ id, cell: cells[i] }));
  const recognition = rng.shuffle(objs);
  return { gridSize, placed, recognition };
}

// ---------- visual ----------

export function genPattern(seed: string, size: number, cells: number) {
  const rng = createRng(seed);
  return { size, cells: rng.sample(Array.from({ length: size * size }, (_, i) => i), cells).sort((a, b) => a - b) };
}

export interface SceneObject {
  shape: Shape;
  color: ColorKey;
  cell: number; // 4 columns x 3 rows
}

export type SceneQuestion =
  | { kind: 'identity'; options: Shape[]; answer: Shape }
  | { kind: 'position'; shape: Shape; answer: number }
  | { kind: 'color'; shape: Shape; options: ColorKey[]; answer: ColorKey }
  | { kind: 'relation'; a: Shape; b: Shape; relation: 'left' | 'above'; answer: boolean }
  | { kind: 'change'; changed: SceneObject[]; answer: 'color' | 'position' | 'shape' | 'none' };

export const SCENE_COLS = 4;
export const SCENE_ROWS = 3;

export function genScene(seed: string, n: number) {
  const rng = createRng(seed);
  const shapes = rng.sample(SHAPES, n);
  const cells = rng.sample(Array.from({ length: SCENE_COLS * SCENE_ROWS }, (_, i) => i), n);
  const objects: SceneObject[] = shapes.map((shape, i) => ({ shape, color: rng.pick(COLOR_KEYS), cell: cells[i] }));
  const absent = SHAPES.filter((s) => !shapes.includes(s));
  const q: SceneQuestion[] = [];
  // identity: which shape was present (1 present + 3 absent)
  const present = rng.pick(objects).shape;
  q.push({ kind: 'identity', options: rng.shuffle([present, ...rng.sample(absent, 3)]), answer: present });
  // position
  const pObj = rng.pick(objects);
  q.push({ kind: 'position', shape: pObj.shape, answer: pObj.cell });
  // colour
  const cObj = rng.pick(objects);
  q.push({ kind: 'color', shape: cObj.shape, options: rng.shuffle([cObj.color, ...rng.sample(COLOR_KEYS.filter((c) => c !== cObj.color), 3)]), answer: cObj.color });
  // relationship: choose a pair that differs on the tested axis
  const col = (c: number) => c % SCENE_COLS;
  const row = (c: number) => Math.floor(c / SCENE_COLS);
  const pairs: { a: SceneObject; b: SceneObject; relation: 'left' | 'above' }[] = [];
  for (const a of objects)
    for (const b of objects) {
      if (a === b) continue;
      if (col(a.cell) !== col(b.cell)) pairs.push({ a, b, relation: 'left' });
      if (row(a.cell) !== row(b.cell)) pairs.push({ a, b, relation: 'above' });
    }
  const rel = rng.pick(pairs);
  q.push({
    kind: 'relation',
    a: rel.a.shape,
    b: rel.b.shape,
    relation: rel.relation,
    answer: rel.relation === 'left' ? col(rel.a.cell) < col(rel.b.cell) : row(rel.a.cell) < row(rel.b.cell),
  });
  // change detection
  const kinds = ['color', 'position', 'shape', 'none'] as const;
  const answer = rng.pick(kinds);
  const changed = objects.map((o) => ({ ...o }));
  const target = rng.int(0, changed.length - 1);
  if (answer === 'color') changed[target].color = rng.pick(COLOR_KEYS.filter((c) => c !== changed[target].color));
  if (answer === 'position') changed[target].cell = rng.pick(Array.from({ length: 12 }, (_, i) => i).filter((c) => !cells.includes(c)));
  if (answer === 'shape') changed[target].shape = rng.pick(absent);
  q.push({ kind: 'change', changed, answer });
  return { objects, questions: q };
}

/** Abstract glyph: a polyline through 4–5 lattice points (5×5) plus an optional dot. */
export interface Glyph {
  id: string;
  points: [number, number][];
  dot: [number, number] | null;
  hue: number;
}

export function genGlyph(rng: Rng, id: string): Glyph {
  const k = rng.int(4, 5);
  const points: [number, number][] = [];
  while (points.length < k) {
    const p: [number, number] = [rng.int(0, 4), rng.int(0, 4)];
    if (!points.some((q) => q[0] === p[0] && q[1] === p[1])) points.push(p);
  }
  return { id, points, dot: rng.next() < 0.5 ? [rng.int(0, 4), rng.int(0, 4)] : null, hue: rng.pick([265, 210, 190, 300]) };
}

export function genGlyphSet(seed: string, n: number, prefix = 'g'): Glyph[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, i) => genGlyph(rng, `${prefix}${i}`));
}

/** Visual sequence: `length` studied glyphs and an equal number of new lures for the item condition. */
export function genVisualSequence(seed: string, length: number) {
  const studied = genGlyphSet(seed + ':s', length, 's');
  const lures = genGlyphSet(seed + ':l', length, 'l');
  const rng = createRng(seed + ':t');
  return { studied, itemTest: rng.shuffle([...studied, ...lures]), orderTest: rng.shuffle(studied) };
}

// ---------- narrative ----------

/** Stored exposure ids carry a prefix ("story:s1", "event:7"); generators compare bare ids. */
const stripPrefix = (prefix: string, xs: (string | number)[]) => xs.map(String).map((x) => (x.startsWith(prefix) ? x.slice(prefix.length) : x));

/**
 * Pick the least recently read story of this tier (never-read first; ties broken by seed). `recent` is in
 * exposure order, oldest first, and may hold "story:<id>" entries from any narrative exercise.
 */
export function genStoryChoice(seed: string, tier: number, recent: string[] = []) {
  const ids = STORIES.en.filter((s) => s.tier === tier).map((s) => s.id);
  const seen = stripPrefix('story:', recent);
  const last = (id: string) => seen.lastIndexOf(id);
  const oldest = Math.min(...ids.map(last));
  return { storyId: createRng(seed).pick(ids.filter((id) => last(id) === oldest)) };
}

export function genEvents(seed: string, n: number, recent: (string | number)[] = []) {
  const rng = createRng(seed);
  const pool = EVENTS.en.map((_, i) => String(i));
  const ids = sampleFresh(rng, pool, n, stripPrefix('event:', recent)).map(Number);
  return { order: ids, shuffled: rng.shuffle(ids) };
}

// ---------- working memory ----------

export function genDigits(rng: Rng, length: number): number[] {
  const out: number[] = [];
  while (out.length < length) {
    const d = rng.int(1, 9);
    if (d !== out[out.length - 1]) out.push(d);
  }
  return out;
}

export function genSpanBlock(seed: string, length: number, trials = 5) {
  const rng = createRng(seed);
  return Array.from({ length: trials }, () => genDigits(rng, length));
}

export function genRunning(seed: string, window: number, trials = 4) {
  const rng = createRng(seed);
  return Array.from({ length: trials }, () => {
    const len = window + rng.int(0, 6); // unpredictable stream length
    return genDigits(rng, len);
  });
}

export interface UpdateOp {
  slot: number;
  delta: number;
}

export function genUpdating(seed: string, slots: number, ops: number, trials = 3) {
  const rng = createRng(seed);
  return Array.from({ length: trials }, () => {
    const initial = Array.from({ length: slots }, () => rng.int(1, 9));
    const values = initial.slice();
    const operations: UpdateOp[] = [];
    for (let i = 0; i < ops; i++) {
      const slot = rng.int(0, slots - 1);
      // Keep every value within 0..9 so answers stay single digits.
      const options = [-3, -2, -1, 1, 2, 3].filter((d) => values[slot] + d >= 0 && values[slot] + d <= 9);
      const delta = rng.pick(options);
      values[slot] += delta;
      operations.push({ slot, delta });
    }
    return { initial, operations, final: values };
  });
}

export const NBACK_LETTERS = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'];

export type NBackMode = 'spatial' | 'verbal' | 'dual';

/** N-back stream with ~30% targets per active modality, never fewer than 4. */
export function genNBack(seed: string, n: number, mode: NBackMode, trials = 20 + n, grid = 3, symbols: readonly string[] = NBACK_LETTERS) {
  const rng = createRng(seed);
  const pos: number[] = [];
  const let_: string[] = [];
  const wantTargets = Math.max(4, Math.round((trials - n) * 0.3));
  const make = <T,>(values: readonly T[], out: T[]) => {
    const targetIdx = new Set(rng.sample(Array.from({ length: trials - n }, (_, i) => i + n), wantTargets));
    for (let i = 0; i < trials; i++) {
      if (i >= n && targetIdx.has(i)) out.push(out[i - n]);
      else {
        // Avoid accidental targets (and lures at n±1 are allowed — they occur naturally).
        const options = i >= n ? values.filter((v) => v !== out[i - n]) : values;
        out.push(rng.pick(options));
      }
    }
  };
  // 3×3: all cells except the centre (reserved for verbal-only display); 4×4 (COGITO-style): all 16 cells
  make(grid === 3 ? Array.from({ length: 8 }, (_, i) => (i >= 4 ? i + 1 : i)) : Array.from({ length: grid * grid }, (_, i) => i), pos);
  make(symbols, let_);
  const isTarget = <T,>(xs: T[]) => xs.map((x, i) => i >= n && xs[i - n] === x);
  return {
    n,
    mode,
    positions: pos,
    letters: let_,
    posTargets: mode === 'verbal' ? pos.map(() => false) : isTarget(pos),
    letterTargets: mode === 'spatial' ? let_.map(() => false) : isTarget(let_),
  };
}
