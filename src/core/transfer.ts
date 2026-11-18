import { createRng, type Rng } from './rng';

// Untrained transfer tests: task formats that never appear in training, so assessment gains are
// less likely to reflect practice with the exercises themselves. Each form uses different items.

export const TRANSFER_FORMS = 4;

// ---------- Symbol–Digit coding (processing speed) ----------

export const SYMBOL_COUNT = 9;
export const SYMBOL_DIGIT_MS = 90_000;

/** key[d-1] = symbol index for digit d; stream = symbols to code. */
// 400 items cannot be finished in 90 s (> 4 per second), so the stream never caps a fast performer.
export function genSymbolDigit(form: number, length = 400) {
  const rng = createRng(`sdmt:${form}`);
  const key = rng.shuffle(Array.from({ length: SYMBOL_COUNT }, (_, i) => i));
  const stream: number[] = [];
  while (stream.length < length) {
    const s = rng.int(0, SYMBOL_COUNT - 1);
    if (s !== stream[stream.length - 1]) stream.push(s);
  }
  return { key, stream };
}

export function digitForSymbol(key: number[], symbol: number): number {
  return key.indexOf(symbol) + 1;
}

// ---------- Series completion (inductive reasoning) ----------

export interface SeriesItem {
  terms: string[];
  answer: string;
  options: string[];
  rule: string;
}

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const L = (i: number) => A[((i % 26) + 26) % 26];

type Gen = (rng: Rng) => { terms: (number | string)[]; next: number | string; near: (number | string)[]; rule: string };

const RULES: Gen[] = [
  (r) => {
    const a = r.int(2, 20), d = r.int(3, 9);
    const t = Array.from({ length: 7 }, (_, i) => a + i * d);
    return { terms: t.slice(0, 6), next: t[6], near: [t[6] + 1, t[6] - d + 1, t[6] + d], rule: 'arithmetic' };
  },
  (r) => {
    const a = r.int(1, 10), p = r.int(2, 5), q = r.int(6, 11);
    const t = [a];
    for (let i = 1; i < 7; i++) t.push(t[i - 1] + (i % 2 ? p : q));
    return { terms: t.slice(0, 6), next: t[6], near: [t[5] + q, t[6] + 1, t[6] - 2], rule: 'alternating' };
  },
  (r) => {
    const a = r.int(1, 4), m = r.pick([2, 3]);
    const t = Array.from({ length: 7 }, (_, i) => a * m ** i);
    return { terms: t.slice(0, 6), next: t[6], near: [t[5] * m + m, t[5] + (t[5] - t[4]), t[6] - a], rule: 'geometric' };
  },
  (r) => {
    const a = r.int(1, 9), d1 = r.int(2, 4), b = r.int(20, 40), d2 = -r.int(1, 3);
    const t = Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? a + (i / 2) * d1 : b + ((i - 1) / 2) * d2));
    return { terms: t.slice(0, 6), next: t[6], near: [t[5] + d2, t[6] + 1, t[4] + d2], rule: 'interleaved' };
  },
  (r) => {
    const s = r.int(0, 6), k = r.int(2, 3);
    const t = Array.from({ length: 7 }, (_, i) => L(s + i * k));
    return { terms: t.slice(0, 6), next: t[6], near: [L(s + 6 * k + 1), L(s + 6 * k - 1), L(s + 5 * k + 1)], rule: 'letterSkip' };
  },
  (r) => {
    const s = r.int(0, 5);
    const t = Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? L(s + i / 2) : L(25 - s - (i - 1) / 2)));
    return { terms: t.slice(0, 6), next: t[6], near: [L(s + 4), L(25 - s - 3), L(s + 2)], rule: 'letterInterleaved' };
  },
  (r) => {
    const a = r.int(1, 4);
    const t = Array.from({ length: 7 }, (_, i) => (a + i) ** 2);
    return { terms: t.slice(0, 6), next: t[6], near: [t[6] + 1, t[5] + (t[5] - t[4]), t[6] - 2], rule: 'squares' };
  },
  (r) => {
    const s = r.int(0, 10), k = r.int(1, 2);
    // pairs that advance: AB, BC, CD …
    const t = Array.from({ length: 7 }, (_, i) => L(s + i * k) + L(s + i * k + 1));
    const n = s + 6 * k;
    return { terms: t.slice(0, 6), next: t[6], near: [L(n + 1) + L(n + 2), L(n) + L(n + 2), L(n - 1) + L(n)], rule: 'letterPairs' };
  },
];

export function genSeries(form: number, count = 12): SeriesItem[] {
  const rng = createRng(`series:${form}`);
  const order = rng.shuffle([...RULES, ...RULES].slice(0, Math.max(count, RULES.length))).slice(0, count);
  return order.map((g) => {
    const { terms, next, near, rule } = g(rng);
    const answer = String(next);
    const opts = new Set([answer]);
    for (const x of near) if (opts.size < 4) opts.add(String(x));
    // top up with plausible fillers if distractors collided with the answer
    let k = 2;
    while (opts.size < 4) {
      opts.add(typeof next === 'number' ? String(next + k * (k % 2 ? 1 : -1)) : L(A.indexOf(String(next)[0]) + k) + String(next).slice(1));
      k++;
    }
    return { terms: terms.map(String), answer, options: rng.shuffle([...opts]), rule };
  });
}

// ---------- Corsi block-tapping (visuospatial short-term memory) ----------

/** Irregular 9-block layout, coordinates in a 0..100 square (after Corsi's original board). */
export const CORSI_BLOCKS: [number, number][] = [
  [12, 70], [30, 85], [22, 35], [46, 58], [52, 18], [66, 76], [74, 42], [88, 62], [84, 12],
];

export const CORSI_ON_MS = 1000;
export const CORSI_GAP_MS = 400;

export function genCorsi(form: number, min = 3, max = 9, perLength = 2): number[][][] {
  const rng = createRng(`corsi:${form}`);
  const out: number[][][] = [];
  for (let len = min; len <= max; len++) out.push(Array.from({ length: perLength }, () => rng.sample(Array.from({ length: 9 }, (_, i) => i), len)));
  return out;
}

/** Corsi span: the longest length with at least one correct trial; testing stops after all trials at a length fail. */
export function corsiSpan(results: { len: number; ok: boolean }[]): number {
  return Math.max(0, ...results.filter((r) => r.ok).map((r) => r.len));
}
