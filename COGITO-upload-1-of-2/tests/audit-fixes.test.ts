import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { bundleErrors, db, exportAll, importAll, ImportError, useIndexedDB } from '../src/core/storage';
import { scoreCuedRecall, scoreNBack, scoreRunning, scoreSequence } from '../src/core/scoring';
import { runSequence, type Clock } from '../src/core/timer';
import { buildPlan, DELAYED_MAX_MINUTES, planMinutes, sessionCompletion, slotGate, slotMinutes } from '../src/core/protocol';
import { chooseForm } from '../src/core/assessmentPlan';
import { genEvents, genStoryChoice } from '../src/core/generate';
import { genSymbolDigit, SYMBOL_DIGIT_MS } from '../src/core/transfer';
import { STORIES } from '../src/content';
import type { TrialResult } from '../src/core/types';

// Regression tests for the findings of the external COGITO audit (2026-10-25). Ids refer to that report.

const trial = (id: string): TrialResult => ({
  id,
  exerciseId: 'A1',
  domain: 'verbal',
  mode: 'training',
  seed: 's',
  lang: 'en',
  startedAt: 1,
  endedAt: 2,
  level: 1,
  params: {},
  accuracy: 0.5,
  metrics: {},
  conditionKey: 'A1',
});

const bundleWith = (trials: unknown[]) => ({ app: 'memory-lab', version: 1, exportedAt: '', data: { trials, sessions: [], assessments: [], adaptive: [], probes: [], kv: [] } });

describe('F01/F25 import is validated first and atomic', () => {
  beforeEach(() => useIndexedDB(new IDBFactory()));

  it('a replace import whose last record is invalid leaves every existing record intact', async () => {
    await db.saveTrial(trial('old-trial'));
    await db.saveSession({ id: 'old-session', seed: 's', startedAt: 1, plannedMinutes: 30, trialIds: [], completed: true });
    const bad = bundleWith([trial('new-1'), { ...trial('x'), id: undefined }]);
    await expect(importAll(bad, true)).rejects.toBeInstanceOf(ImportError);
    expect((await db.trials()).map((t) => t.id)).toEqual(['old-trial']);
    expect((await db.sessions()).map((s) => s.id)).toEqual(['old-session']);
  });

  it('reports each problem by path', () => {
    const errs = bundleErrors(bundleWith([trial('a'), { ...trial('b'), metrics: null }, { ...trial('c'), accuracy: 3 }, trial('a')]));
    expect(errs).toEqual(['trials[1].metrics', 'trials[2].accuracy', 'trials[3].id (duplicate)']);
    expect(bundleErrors({ app: 'memory-lab', version: 1, data: {} })).toEqual([]);
    expect(bundleErrors({ app: 'other', version: 1, data: {} })).toEqual(['app/version']);
    expect(bundleErrors(null)).toEqual(['root']);
  });

  it('a valid replace import swaps the data in one go', async () => {
    await db.saveTrial(trial('old'));
    const n = await importAll(bundleWith([trial('n1'), trial('n2')]), true);
    expect(n).toBe(2);
    expect((await db.trials()).map((t) => t.id).sort()).toEqual(['n1', 'n2']);
    // an export can always be imported back
    expect(bundleErrors(await exportAll())).toEqual([]);
  });
});

describe('F02 a session only counts when every component was completed', () => {
  const plan = [{ kind: 'verbal' }, { kind: 'visual' }, { kind: 'delayed' }] as const;
  it('zero blocks is not a completed session', () => {
    expect(sessionCompletion([...plan], [])).toEqual({ counted: false, done: 0, total: 2 });
  });
  it('skipping one component leaves it partial', () => {
    expect(sessionCompletion([...plan], [true, false, false]).counted).toBe(false);
  });
  it('every training component completed counts (the delayed slot is not required)', () => {
    expect(sessionCompletion([...plan], [true, true, false])).toEqual({ counted: true, done: 2, total: 2 });
  });
});

describe('F03 running span: extra digits are penalised, never truncated', () => {
  it('typing the whole stream does not score 100%', () => {
    const r = scoreRunning([1, 2, 3], [9, 8, 7, 1, 2, 3]);
    expect(r.exact).toBe(false);
    expect(r.extra).toBe(3);
    expect(r.proportion).toBe(0.5);
  });
  it('N, N−1 and N+1 digits', () => {
    expect(scoreRunning([1, 2, 3], [1, 2, 3])).toMatchObject({ exact: true, proportion: 1 });
    expect(scoreRunning([1, 2, 3], [2, 3])).toMatchObject({ exact: false, positions: 2 }); // missed the first, rest still aligned
    expect(scoreRunning([1, 2, 3], [5, 1, 2, 3]).proportion).toBe(0.75);
    expect(scoreRunning([1, 2, 3], []).proportion).toBe(0);
  });
  it('forward span also penalises extra digits', () => {
    expect(scoreSequence([1, 2, 3], [1, 2, 3, 4]).proportion).toBe(0.75);
  });
});

describe('F04 serial scoring never accepts a different real word as a typo', () => {
  const lexicon = new Set(['mountain', 'fountain', 'porta', 'porto']);
  it('mountain in place of fountain, porta in place of porto', () => {
    const targets = [{ id: 'w1', forms: ['fountain'] }, { id: 'w2', forms: ['porto'] }];
    expect(scoreCuedRecall(targets, ['mountain', 'porta'], true, lexicon).correct).toBe(0);
    expect(scoreCuedRecall(targets, ['fontain', 'porto'], true, lexicon).correct).toBe(2); // a real typo still counts
  });
});

function manualClock() {
  let now = 0;
  let pending: { at: number; fn: () => void } | null = null;
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => ((pending = { at: now + ms, fn }), 1),
    clearTimeout: () => (pending = null),
  };
  /** Fire the next timer `late` ms after its due time. */
  const fire = (late = 0) => {
    const p = pending!;
    pending = null;
    now = p.at + late;
    p.fn();
  };
  return { clock, fire };
}

describe('F05 a stalled presentation is invalidated, not compressed', () => {
  it('a 1 s delay stops the sequence and reports the stall', () => {
    const { clock, fire } = manualClock();
    const steps: number[] = [];
    let done = false;
    let stalled = 0;
    runSequence([100, 100, 100, 100], (i) => steps.push(i), () => (done = true), clock, (late) => (stalled = late));
    fire(0);
    fire(1000);
    expect(steps).toEqual([0, 1]); // steps 2, 3 are never flashed with no exposure time
    expect(done).toBe(false);
    expect(stalled).toBe(1000);
  });
  it('normal timer jitter does not trigger it', () => {
    const { clock, fire } = manualClock();
    let done = false;
    let stalled = false;
    runSequence([100, 100, 100], () => {}, () => (done = true), clock, () => (stalled = true));
    fire(20);
    fire(35);
    fire(10);
    expect(done).toBe(true);
    expect(stalled).toBe(false);
  });
});

describe('F08/F09 recent stories and events are avoided', () => {
  it('a story read recently (stored as story:<id>) is not chosen again while another exists', () => {
    const tier1 = STORIES.en.filter((s) => s.tier === 1).map((s) => s.id);
    for (let k = 0; k < 20; k++) {
      const first = genStoryChoice(`seed${k}`, 1).storyId;
      const next = genStoryChoice(`seed${k}`, 1, [`story:${first}`]).storyId;
      expect(next).not.toBe(first);
      expect(tier1).toContain(next);
    }
  });
  it('alternates by least-recent use across many reads', () => {
    const recent = ['story:s1', 'story:s2', 'story:s1'];
    const tierOf = STORIES.en.find((s) => s.id === 's1')!.tier;
    const ids = STORIES.en.filter((s) => s.tier === tierOf).map((s) => s.id);
    if (ids.length === 2 && ids.includes('s2')) expect(genStoryChoice('x', tierOf, recent).storyId).toBe('s2');
  });
  it('events stored as event:<id> are excluded', () => {
    const first = genEvents('ev', 4).order;
    const next = genEvents('ev', 4, first.map((x) => `event:${x}`)).order;
    expect(next.filter((x) => first.includes(x))).toEqual([]);
  });
});

describe('F10 a partly seen assessment form is reserved', () => {
  it('an abandoned form 0 is not offered again', () => {
    expect(chooseForm([{ form: 0, startedAt: 1, completed: false }])).toEqual({ form: 1, reuseWarning: false });
  });
});

describe('F12 n-back warm-up stimuli are not scored', () => {
  it('presses before the first possible target are reported apart, not as false alarms', () => {
    const targets = [false, false, true, false];
    const s = scoreNBack(targets, [true, false, true, false], 2);
    expect(s).toMatchObject({ hits: 1, falseAlarms: 0, correctRejections: 1, warmupPresses: 1 });
  });
});

describe('F35 symbol–digit has no ceiling within the time limit', () => {
  it('the stream cannot be finished in 90 s, and longer streams keep the same first items', () => {
    const { stream } = genSymbolDigit(0);
    expect(stream.length / (SYMBOL_DIGIT_MS / 1000)).toBeGreaterThan(4);
    expect(genSymbolDigit(0, 160).stream).toEqual(stream.slice(0, 160));
  });
});

describe('session dose: components are a minimum, and the delayed slot is short', () => {
  it('the delayed slot is capped at 4 min and its time goes to training', () => {
    for (const goal of ['broad', 'episodic'] as const) {
      const plan = buildPlan({ minutes: 60, includeWorking: false, recent: [], seed: 'd', delayed: true, protocol: 'hybrid', goal });
      expect(plan.find((p) => p.kind === 'delayed')!.minutes).toBe(DELAYED_MAX_MINUTES);
      expect(Math.abs(planMinutes(plan) - 60)).toBeLessThanOrEqual(1);
    }
    expect(slotMinutes(15, false).delayed).toBe(3); // the 15-minute spec (4/4/4/3) is unchanged
    expect(slotMinutes(60, false).delayed).toBe(DELAYED_MAX_MINUTES);
  });
  it('a timed component can only be left when another block would overshoot by more than half a block', () => {
    const block = 3 * 60_000;
    expect(slotGate({ blocksDone: 1, remainingMs: 7 * 60_000, lastBlockMs: block })).toEqual({ canNext: true, canFinish: false });
    expect(slotGate({ blocksDone: 3, remainingMs: 2 * 60_000, lastBlockMs: block })).toEqual({ canNext: true, canFinish: false });
    expect(slotGate({ blocksDone: 3, remainingMs: 80_000, lastBlockMs: block })).toEqual({ canNext: true, canFinish: true });
    expect(slotGate({ blocksDone: 4, remainingMs: -5000, lastBlockMs: block })).toEqual({ canNext: false, canFinish: true });
  });
  it('a block-based component (COGITO) needs exactly its blocks', () => {
    expect(slotGate({ blocksDone: 1, requiredBlocks: 2, lastBlockMs: 0 })).toEqual({ canNext: true, canFinish: false });
    expect(slotGate({ blocksDone: 2, requiredBlocks: 2, lastBlockMs: 0 })).toEqual({ canNext: false, canFinish: true });
  });
  it('free practice outside sessions is never gated', () => {
    expect(slotGate({ blocksDone: 1, lastBlockMs: 1000 })).toEqual({ canNext: true, canFinish: true });
  });
});
