import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { db, useIndexedDB } from '../src/core/storage';
import { STAIRCASE_BEST_KEY, STAIRCASE_KEY } from '../src/core/staircase';
import { carryMs, resumePoint, saveBlock, sessionAfterBlock, slotRemaining, type BlockStore } from '../src/core/sessionProgress';
import type { SessionRecord, TrialResult } from '../src/core/types';

// Saving a block (with a failure and a retry) and resuming an interrupted session, on a real (in-memory) database.

const trial = (id: string, startedAt = 1000, ms = 60_000): TrialResult => ({
  id, exerciseId: 'G1', domain: 'verbal', mode: 'training', sessionId: 's1', seed: 's', lang: 'en',
  startedAt, endedAt: startedAt + ms, level: 0, params: {}, accuracy: 0.8, metrics: {}, conditionKey: 'S-G1',
});
const session = (patch: Partial<SessionRecord> = {}): SessionRecord => ({ id: 's1', seed: 's', startedAt: 0, plannedMinutes: 30, trialIds: [], completed: false, ...patch });

/** The app database, with writes that fail while `fail` is true. */
function flaky() {
  const state = { fail: false };
  const store: BlockStore = {
    saveTrial: (t) => db.saveTrial(t),
    saveAdaptive: (s) => db.saveAdaptive(s),
    kv: (k) => db.kv(k),
    setKv: (k, v) => (state.fail ? Promise.reject(new Error('QuotaExceededError')) : db.setKv(k, v)),
    saveProbe: (p) => db.saveProbe(p),
  };
  return { store, state };
}

describe('saving a block', () => {
  beforeEach(() => useIndexedDB(new IDBFactory()));

  it('a failed save can be repeated: everything ends up stored once, and the session counts the block once', async () => {
    const { store, state } = flaky();
    let rec = session();
    const block = { trial: trial('t1'), stair: { id: 'G1' as const, value: 14 }, onSaved: (t: TrialResult) => void (rec = { ...rec, ...sessionAfterBlock(rec, t, 0) }) };
    state.fail = true;
    await expect(saveBlock(store, block)).rejects.toThrow();
    // the trial was written before the failure, the level was not, and the session has not counted it
    expect((await db.trials()).map((t) => t.id)).toEqual(['t1']);
    expect(await db.kv(STAIRCASE_KEY)).toBeUndefined();
    expect(rec.trialIds).toEqual([]);
    state.fail = false;
    await saveBlock(store, block);
    await saveBlock(store, block); // a second retry changes nothing
    expect((await db.trials()).map((t) => t.id)).toEqual(['t1']);
    expect(await db.kv(STAIRCASE_KEY)).toEqual({ G1: 14 });
    expect(await db.kv(STAIRCASE_BEST_KEY)).toEqual({ G1: 14 });
    expect(rec.trialIds).toEqual(['t1']);
    expect(rec.slotUsedMs).toEqual([60_000]);
  });
});

describe('resuming a session', () => {
  it('a timed part continues with the time it had left; a block part with the blocks left', () => {
    let rec = session({ protocol: 'adaptive', slot: 1 });
    rec = { ...rec, ...sessionAfterBlock(rec, trial('a', 0, 120_000), 1) };
    rec = { ...rec, ...sessionAfterBlock(rec, trial('b', 200_000, 90_000), 1) };
    const r = resumePoint(rec, 'faithful');
    expect(r).toEqual({ slot: 1, blocksDone: 2, usedMs: 210_000, protocol: 'adaptive' });
    expect(slotRemaining({ minutes: 6 }, r)).toEqual({ requiredBlocks: undefined, budgetMs: 150_000 });
    expect(slotRemaining({ minutes: 2 }, r).budgetMs).toBe(0);
    expect(slotRemaining({ minutes: 8, blocks: 2 }, r)).toEqual({ requiredBlocks: 1, budgetMs: undefined });
    expect(slotRemaining({ minutes: 8, blocks: 4 }, r).requiredBlocks).toBe(2);
  });

  it('keeps the protocol it was started with; older sessions (no protocol saved) use the current one', () => {
    expect(resumePoint(session({ protocol: 'adaptive' }), 'faithful').protocol).toBe('adaptive');
    expect(resumePoint(session(), 'faithful').protocol).toBe('faithful');
    expect(resumePoint(session(), 'faithful')).toMatchObject({ usedMs: 0, blocksDone: 0 });
  });

  it('survives a reload: the progress written to the database is what resume reads back', async () => {
    useIndexedDB(new IDBFactory());
    let rec = session({ protocol: 'adaptive', slot: 0, plan: [{ kind: 'verbal', minutes: 6, exerciseId: 'G1' }] });
    rec = { ...rec, ...sessionAfterBlock(rec, trial('a', 0, 100_000), 0) };
    await db.saveSession(rec);
    const back = (await db.sessions()).find((s) => s.id === 's1')!;
    expect(slotRemaining(back.plan![0], resumePoint(back, 'memorylab'))).toEqual({ requiredBlocks: undefined, budgetMs: 260_000 });
  });
});

describe('session time carried between parts', () => {
  const plan = [
    { kind: 'verbal', minutes: 6 },
    { kind: 'speed', minutes: 2 },
    { kind: 'working', minutes: 4 },
  ];
  it('time an earlier part left unused goes to the next one, and an overrun is taken from it', () => {
    expect(carryMs(plan, [], 0)).toBe(0);
    expect(carryMs(plan, [5 * 60_000], 1)).toBe(60_000); // 1 min unused in part 1
    expect(slotRemaining(plan[1], { blocksDone: 0, usedMs: 0 }, carryMs(plan, [5 * 60_000], 1)).budgetMs).toBe(3 * 60_000);
    expect(carryMs(plan, [5 * 60_000, 3 * 60_000], 2)).toBe(0); // part 2 used the minute it was given
    expect(carryMs(plan, [7 * 60_000, 3 * 60_000], 2)).toBe(-2 * 60_000); // both ran over
    // a part is never asked for less than nothing
    expect(slotRemaining(plan[1], { blocksDone: 0, usedMs: 0 }, carryMs(plan, [20 * 60_000], 1)).budgetMs).toBe(0);
  });
  it('block-based parts and the delayed-recall part do not move time', () => {
    expect(carryMs([{ kind: 'verbal', minutes: 6, blocks: 2 }, { kind: 'delayed', minutes: 3 }, { kind: 'speed', minutes: 2 }], [60_000, 0], 2)).toBe(0);
  });
});
