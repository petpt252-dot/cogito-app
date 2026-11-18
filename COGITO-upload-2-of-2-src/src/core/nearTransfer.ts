import { createRng } from './rng';
import type { StudyItem } from './scoring';

// Near-transfer battery after COGITO (Schmiedek, Lövdén & Lindenberger, 2010): untrained variants of the
// three practised working-memory tasks with different content — animal span (alpha span → order by size),
// numerical 3-back (spatial 3-back → digits) and spatial memory updating (numerical updating → positions).
// Assessment only: never offered in training. Conditions are fixed; forms change only the content.

// ---------- animal span ----------

/** Animals with a clear, uncontroversial size order (rank 1 = smallest). */
export const ANIMALS: { id: string; en: string; pt: string; rank: number }[] = [
  { id: 'ant', en: 'ant', pt: 'formiga', rank: 1 },
  { id: 'bee', en: 'bee', pt: 'abelha', rank: 2 },
  { id: 'mouse', en: 'mouse', pt: 'rato', rank: 3 },
  { id: 'rabbit', en: 'rabbit', pt: 'coelho', rank: 4 },
  { id: 'fox', en: 'fox', pt: 'raposa', rank: 5 },
  { id: 'sheep', en: 'sheep', pt: 'ovelha', rank: 6 },
  { id: 'horse', en: 'horse', pt: 'cavalo', rank: 7 },
  { id: 'giraffe', en: 'giraffe', pt: 'girafa', rank: 8 },
  { id: 'elephant', en: 'elephant', pt: 'elefante', rank: 9 },
  { id: 'whale', en: 'whale', pt: 'baleia', rank: 10 },
];

/** 8 lists (2 each of 3–6 animals), as COGITO's 8 alpha-span lists per session. */
export const ANIMAL_SPAN_LENGTHS = [3, 3, 4, 4, 5, 5, 6, 6];
export const ANIMAL_MS = 1500;

export const animalItem = (id: string): StudyItem => {
  const a = ANIMALS.find((x) => x.id === id)!;
  return { id, forms: [a.en, a.pt] };
};

/** Lists for one form; `bySize` is each list in size order (the correct answer). */
export function genAnimalSpan(form: number) {
  const rng = createRng(`near:animal:${form}`);
  return ANIMAL_SPAN_LENGTHS.map((len) => {
    const shown = rng.sample(ANIMALS.map((a) => a.id), len);
    const rank = (id: string) => ANIMALS.find((a) => a.id === id)!.rank;
    return { shown, bySize: shown.slice().sort((a, b) => rank(a) - rank(b)) };
  });
}

// ---------- numerical 3-back ----------

export const NUMERIC_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const NUMERIC_NBACK = { n: 3, trials: 43, stimMs: 500, isiMs: 2000 } as const;

// ---------- spatial memory updating ----------

export const SPATIAL = { grids: 3, size: 3, ops: 6, trials: 6, initialMs: 3000, opMs: 2000 } as const;

export type Dir = 'up' | 'down' | 'left' | 'right';
const STEP: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/** Cell index (row-major) after moving one step; null if the move would leave the grid. */
export function moveCell(cell: number, dir: Dir, size: number = SPATIAL.size): number | null {
  const r = Math.floor(cell / size) + STEP[dir][0];
  const c = (cell % size) + STEP[dir][1];
  return r < 0 || c < 0 || r >= size || c >= size ? null : r * size + c;
}

/**
 * Each trial: one dot per grid; a sequence of shifts (grid, direction) that always stays inside the grid;
 * the answer is each dot's final cell.
 */
export function genSpatialUpdating(form: number) {
  const rng = createRng(`near:spatial:${form}`);
  const cells = SPATIAL.size * SPATIAL.size;
  return Array.from({ length: SPATIAL.trials }, () => {
    const initial = Array.from({ length: SPATIAL.grids }, () => rng.int(0, cells - 1));
    const pos = initial.slice();
    const operations: { grid: number; dir: Dir }[] = [];
    for (let k = 0; k < SPATIAL.ops; k++) {
      const grid = rng.int(0, SPATIAL.grids - 1);
      const options = (Object.keys(STEP) as Dir[]).filter((d) => moveCell(pos[grid], d) !== null);
      const dir = rng.pick(options);
      pos[grid] = moveCell(pos[grid], dir) as number;
      operations.push({ grid, dir });
    }
    return { initial, operations, final: pos };
  });
}
