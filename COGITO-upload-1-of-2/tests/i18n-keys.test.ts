import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../src/i18n';
import { EXERCISES } from '../src/exercises/registry';
import { SHAPES, COLOR_KEYS } from '../src/content/visual';
import type { ExerciseId } from '../src/core/types';

// Catches UI text keys that do not exist (they would render as raw "section.key" text).

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const SRC = files(join(__dirname, '..', 'src')).filter((f) => !/[\\/]i18n[\\/]/.test(f));
const exists = (key: string) => translate('en', key) !== key && translate('pt', key) !== key;

describe('translation keys used in the code', () => {
  it('every literal t("…") key exists in EN and PT-PT', () => {
    const missing: string[] = [];
    for (const f of SRC) {
      const src = readFileSync(f, 'utf-8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!exists(m[1])) missing.push(`${m[1]}  (${f.split(/[\\/]src[\\/]/)[1]})`);
      for (const m of src.matchAll(/labelKey: '([a-zA-Z0-9_.]+)'/g)) if (!exists(m[1])) missing.push(m[1]);
    }
    expect(missing).toEqual([]);
  });

  it('dynamic keys exist for every exercise, shape, colour, protocol, goal, domain and slot', () => {
    const keys = [
      ...(Object.keys(EXERCISES) as ExerciseId[]).flatMap((id) => [`ex.${id}.name`, `ex.${id}.short`, `ex.${id}.instructions`]),
      ...SHAPES.map((s) => `shape.${s}`),
      ...COLOR_KEYS.map((c) => `color.${c}`),
      ...['hybrid', 'memorylab', 'cogito'].flatMap((p) => [`protocol.${p}`, `protocol.${p}Hint`]),
      ...['episodic', 'broad'].flatMap((g) => [`goal.${g}`, `goal.${g}Hint`]),
      ...['verbal', 'visual', 'associative', 'narrative', 'working', 'speed', 'reasoning'].map((d) => `domain.${d}`),
      ...['verbal', 'visual', 'associative', 'working', 'speed', 'delayed'].map((s) => `session.slot.${s}`),
      ...['imagery', 'elaboration', 'clustering', 'loci', 'retrieval'].flatMap((s) => [`strategies.${s}.name`, `strategies.${s}.what`, `strategies.${s}.evidence`, `strategies.${s}.prompt`]),
      ...['training', 'assessment', 'strategy', 'free'].map((m) => `history.modes.${m}`),
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'P'].map((g) => `modules.groups.${g}`),
      ...['immediateVerbal', 'visualRecognition', 'visualReconstruction', 'associative', 'wmSpan', 'delayedVerbal', 'symbolDigit', 'series', 'corsi'].map((k) => `assessment.tests.${k}`),
      ...['up', 'down', 'hold'].map((d) => `feedback.${d}`),
      ...['forward', 'backward', 'sequencing'].map((m) => `span.${m}`),
      ...['spatial', 'verbal', 'dual'].map((m) => `nback.${m}`),
    ];
    expect(keys.filter((k) => !exists(k))).toEqual([]);
  });

  it('every metric name reported by an exercise has a label', () => {
    // Metric names are the keys of `metrics: { … }` objects in exercise/assessment code.
    const names = new Set<string>();
    for (const f of SRC.filter((x) => /exercises|pages/.test(x))) {
      const src = readFileSync(f, 'utf-8');
      for (const block of src.matchAll(/metrics(?:\s*=|:)\s*\{([^}]*)\}/g)) for (const m of block[1].matchAll(/(?:^|[,{\s])([a-zA-Z]+)\s*:/g)) names.add(m[1]);
      for (const block of src.matchAll(/metrics: \{ \.\.\.[^,]+,([^}]*)\}/g)) for (const m of block[1].matchAll(/([a-zA-Z]+)\s*:/g)) names.add(m[1]);
    }
    ['accuracy', 'delayMinutes'].forEach((n) => names.add(n));
    ['null', 'true', 'false', 'undefined'].forEach((n) => names.delete(n)); // ternary fragments, not metric names
    const missing = [...names].filter((n) => !exists(`metric.${n}`));
    expect(missing).toEqual([]);
  });
});
