import type { ExerciseId } from './types';

// Difficulty tables, one per exercise. Adjacent levels differ in exactly ONE parameter
// (verified by tests/levels.test.ts), so adaptation never confounds two difficulty variables.

export type LevelParams = Record<string, number>;

function range(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  for (let x = from; x <= to; x += step) out.push(x);
  return out;
}

/** Builds a staircase that alternates between two parameters, changing one per step. */
function alternate(a: string, aVals: number[], b: string, bVals: number[]): LevelParams[] {
  const out: LevelParams[] = [{ [a]: aVals[0], [b]: bVals[0] }];
  let i = 0;
  let j = 0;
  while (i < aVals.length - 1 || j < bVals.length - 1) {
    const last = out[out.length - 1];
    if ((out.length % 2 === 1 && i < aVals.length - 1) || j >= bVals.length - 1) out.push({ ...last, [a]: aVals[++i] });
    else out.push({ ...last, [b]: bVals[++j] });
  }
  return out;
}

const patternLevels: LevelParams[] = [
  [3, 3], [3, 4], [3, 5],
  [4, 5], [4, 6], [4, 7],
  [5, 7], [5, 8], [5, 9], [5, 10],
  [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
].map(([size, cells]) => ({ size, cells }));

const updatingLevels: LevelParams[] = [
  [2, 4], [3, 4], [3, 6], [4, 6], [4, 8], [5, 8], [5, 10], [5, 12],
].map(([slots, ops]) => ({ slots, ops }));

export const LEVELS: Record<ExerciseId, LevelParams[]> = {
  // A1: list length 10..40 (encoding time per word is a separate user setting, held constant)
  A1: range(10, 40, 2).map((items) => ({ items })),
  // A2: categories x words per category
  A2: alternate('categories', [3, 4, 5], 'perCategory', [4, 5, 6]),
  // A3: studied items, distractor similarity (0 = other categories, 1 = same categories)
  A3: alternate('items', [10, 15, 20, 25, 30], 'similarity', [0, 1]),
  B1: range(4, 16).map((pairs) => ({ pairs })),
  B2: range(3, 12).map((faces) => ({ faces })),
  B3: range(3, 10).map((objects) => ({ objects })),
  C1: patternLevels,
  C2: range(3, 8).map((objects) => ({ objects })),
  C3: range(3, 9).map((length) => ({ length })),
  // D1/D3: story length tier (1 short .. 3 long)
  D1: [1, 2, 3].map((tier) => ({ tier })),
  D2: range(4, 9).map((events) => ({ events })),
  D3: [1, 2, 3].map((tier) => ({ tier })),
  E1: range(3, 9).map((length) => ({ length })),
  E2: range(3, 8).map((window) => ({ window })),
  E3: updatingLevels,
  E4: range(1, 8).map((n) => ({ n })),
  // ---- COGITO-inspired ----
  // G1: sequential word list length (COGITO used 36 words)
  G1: range(8, 36, 2).map((items) => ({ items })),
  // G2: number–noun pairs (COGITO used 12)
  G2: range(4, 12).map((pairs) => ({ pairs })),
  // G3: objects placed sequentially on a 6×6 grid (COGITO used 12)
  G3: range(4, 12).map((objects) => ({ objects })),
  // G4: alpha span list length
  G4: range(3, 9).map((length) => ({ length })),
  // G5: four values, 8 operations; difficulty = operation presentation time (ms)
  G5: [2600, 2200, 1900, 1600, 1400, 1200, 1050, 900, 800].map((opMs) => ({ opMs })),
  // G6: spatial 3-back on a 4×4 grid; difficulty = stimulus onset asynchrony (ms)
  G6: [3000, 2600, 2300, 2000, 1800, 1600, 1400, 1250].map((soa) => ({ soa })),
  // P1–P6 perceptual speed: difficulty = response deadline (ms); deadlines scale with task complexity
  P1: deadlines(1500, 400),
  P2: deadlines(1500, 400),
  P3: deadlines(3500, 900),
  P4: deadlines(3000, 800),
  P5: deadlines(3000, 800),
  P6: deadlines(7000, 2000),
  // X1 Posner mixed: keeps its own level (core/posner.ts), so the generic table has a single entry
  X1: [{}],
};

/** 10 geometrically spaced deadlines from `slow` to `fast`, rounded to 50 ms. */
function deadlines(slow: number, fast: number): LevelParams[] {
  return Array.from({ length: 10 }, (_, i) => ({ deadline: Math.round((slow * (fast / slow) ** (i / 9)) / 50) * 50 }));
}

/** Number of parameters that differ between two parameter sets. */
export function paramDiff(a: LevelParams, b: LevelParams): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let n = 0;
  keys.forEach((k) => {
    if (a[k] !== b[k]) n++;
  });
  return n;
}
