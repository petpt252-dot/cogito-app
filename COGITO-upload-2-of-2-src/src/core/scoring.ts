import { fuzzyEqual, normalize } from './text';
import { arcScore, sdt, type SdtCounts } from './stats';

/**
 * A studied item. `forms` holds every acceptable spelling — the item in the stimulus language and in the
 * other supported language — so switching the UI language during a block never invalidates scoring.
 */
export interface StudyItem {
  id: string;
  forms: string[];
  category?: string;
}

export interface FreeRecallScore {
  studied: number;
  correct: number;
  omissions: number;
  repetitions: number;
  intrusions: number;
  /** ids of correctly recalled items, in output order (first occurrence only). */
  recalledIds: string[];
  intrusionList: string[];
  accuracy: number;
  /** ARC clustering score, only meaningful when items carry categories. */
  arc: number | null;
}

function matchItem(entry: string, items: StudyItem[], tolerance: boolean, lexicon?: Set<string>): StudyItem | undefined {
  // Exact matches first, so a typo-tolerant match never steals a word that was typed exactly.
  const exact = items.find((it) => it.forms.some((f) => normalize(f) === normalize(entry)));
  if (exact) return exact;
  // A correctly spelled *different* word (e.g. "pato" vs studied "prato") is an intrusion, not a typo.
  if (lexicon?.has(normalize(entry))) return undefined;
  return items.find((it) => it.forms.some((f) => fuzzyEqual(entry, f, tolerance)));
}

/**
 * People often type recalled words separated by spaces ("apple pear lemon"). Split such entries into
 * words, but keep multi-word items ("frying pan") together when the joined words match a known form.
 */
export function expandEntries(entries: string[], items: StudyItem[], lexicon?: Set<string>): string[] {
  const known = new Set(items.flatMap((it) => it.forms.map(normalize)));
  const isKnown = (s: string) => known.has(normalize(s)) || !!lexicon?.has(normalize(s));
  const out: string[] = [];
  for (const raw of entries) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (tokens.length <= 1 || isKnown(raw)) {
      if (raw.trim()) out.push(raw.trim());
      continue;
    }
    for (let i = 0; i < tokens.length; ) {
      const three = tokens.slice(i, i + 3).join(' ');
      const two = tokens.slice(i, i + 2).join(' ');
      if (i + 2 < tokens.length && isKnown(three)) (out.push(three), (i += 3));
      else if (i + 1 < tokens.length && isKnown(two)) (out.push(two), (i += 2));
      else (out.push(tokens[i]), (i += 1));
    }
  }
  return out;
}

export function scoreFreeRecall(items: StudyItem[], rawEntries: string[], tolerance = true, lexicon?: Set<string>): FreeRecallScore {
  const entries = expandEntries(rawEntries, items, lexicon);
  const recalled: string[] = [];
  const intrusionList: string[] = [];
  let repetitions = 0;
  const seenIntrusions = new Set<string>();
  for (const raw of entries) {
    if (!normalize(raw)) continue;
    const hit = matchItem(raw, items, tolerance, lexicon);
    if (hit) {
      if (recalled.includes(hit.id)) repetitions++;
      else recalled.push(hit.id);
    } else {
      const key = normalize(raw);
      if (seenIntrusions.has(key)) repetitions++;
      else {
        seenIntrusions.add(key);
        intrusionList.push(raw);
      }
    }
  }
  const correct = recalled.length;
  const byId = new Map(items.map((i) => [i.id, i]));
  const cats = recalled.map((id) => byId.get(id)?.category).filter((c): c is string => !!c);
  return {
    studied: items.length,
    correct,
    omissions: items.length - correct,
    repetitions,
    intrusions: intrusionList.length,
    recalledIds: recalled,
    intrusionList,
    accuracy: items.length ? correct / items.length : 0,
    arc: cats.length === recalled.length ? arcScore(cats) : null,
  };
}

/** Cued recall (paired associates): response i is compared only with target i. */
export function scoreCuedRecall(targets: StudyItem[], responses: string[], tolerance = true, lexicon?: Set<string>) {
  let correct = 0;
  let intrusions = 0;
  let omissions = 0;
  const perItem = targets.map((t, i) => {
    const r = (responses[i] ?? '').trim();
    if (!r) {
      omissions++;
      return false;
    }
    const exact = t.forms.some((f) => normalize(f) === normalize(r));
    const ok = exact || (!lexicon?.has(normalize(r)) && t.forms.some((f) => fuzzyEqual(r, f, tolerance)));
    if (ok) correct++;
    else intrusions++;
    return ok;
  });
  return { correct, intrusions, omissions, perItem, accuracy: targets.length ? correct / targets.length : 0 };
}

export interface RecognitionResponse {
  id: string;
  old: boolean;
  saidOld: boolean;
  rtMs?: number;
}

export function scoreRecognition(responses: RecognitionResponse[]) {
  const c: SdtCounts = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
  for (const r of responses) {
    if (r.old && r.saidOld) c.hits++;
    else if (r.old) c.misses++;
    else if (r.saidOld) c.falseAlarms++;
    else c.correctRejections++;
  }
  const s = sdt(c);
  const rts = responses.map((r) => r.rtMs).filter((x): x is number => typeof x === 'number');
  return {
    ...c,
    ...s,
    meanRtMs: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null,
    // Corrected recognition (Pr = H - FA) is the adaptive score: it penalises a liberal "old" bias.
    accuracy: Math.max(0, s.hitRate - s.falseAlarmRate),
  };
}

/** Pattern reconstruction: hits and false alarms over grid cells. */
export function scorePattern(target: number[], response: number[]) {
  const t = new Set(target);
  const r = new Set(response);
  let hits = 0;
  r.forEach((c) => {
    if (t.has(c)) hits++;
  });
  const falseAlarms = r.size - hits;
  const misses = t.size - hits;
  return {
    hits,
    falseAlarms,
    misses,
    perfect: hits === t.size && falseAlarms === 0,
    accuracy: t.size ? Math.max(0, (hits - falseAlarms) / t.size) : 0,
  };
}

/** Span tasks: exact serial match of digit strings. */
export function scoreSequence(target: (string | number)[], response: (string | number)[]) {
  const t = target.map(String);
  const r = response.map(String);
  let positions = 0;
  t.forEach((x, i) => {
    if (r[i] === x) positions++;
  });
  // Extra digits count against the score: typing more than was asked is never free.
  const denom = Math.max(t.length, r.length);
  return { exact: t.length === r.length && positions === t.length, positions, proportion: denom ? positions / denom : 0 };
}

/**
 * Running span: the answer should be exactly the last N items. Positions are aligned from the end (a
 * missed first item does not shift the rest), and any extra items are penalised, so typing the whole
 * stream cannot score 100%.
 */
export function scoreRunning(target: (string | number)[], response: (string | number)[]) {
  const t = target.map(String);
  const r = response.map(String);
  let positions = 0;
  for (let i = 1; i <= Math.min(t.length, r.length); i++) if (t[t.length - i] === r[r.length - i]) positions++;
  const denom = Math.max(t.length, r.length);
  return { exact: t.length === r.length && positions === t.length, positions, extra: Math.max(0, r.length - t.length), proportion: denom ? positions / denom : 0 };
}

export function backwardOf<T>(xs: T[]): T[] {
  return xs.slice().reverse();
}

export function sequencedOf(xs: number[]): number[] {
  return xs.slice().sort((a, b) => a - b);
}

/**
 * N-back scoring for one modality. Accuracy follows the Brain Workshop convention: H / (H + M + FA).
 * The first `warmup` (= N) stimuli cannot be targets, so they are excluded from all counts; presses
 * during them are reported separately as `warmupPresses`.
 */
export function scoreNBack(targets: boolean[], responses: boolean[], warmup = 0) {
  const c: SdtCounts = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
  let warmupPresses = 0;
  targets.forEach((t, i) => {
    const r = !!responses[i];
    if (i < warmup) {
      if (r) warmupPresses++;
      return;
    }
    if (t && r) c.hits++;
    else if (t) c.misses++;
    else if (r) c.falseAlarms++;
    else c.correctRejections++;
  });
  const denom = c.hits + c.misses + c.falseAlarms;
  return { ...c, ...sdt(c), warmupPresses, accuracy: denom ? c.hits / denom : 1 };
}

/** Encoding Efficiency = correctly recalled items / encoding time in minutes. Descriptive only. */
export function encodingEfficiency(correct: number, encodingMs: number): number | null {
  if (encodingMs <= 0) return null;
  return correct / (encodingMs / 60000);
}
