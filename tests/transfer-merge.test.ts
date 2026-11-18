import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { db, exportAll, mergeAll, planMerge, STORES, useIndexedDB, type StoreName } from '../src/core/storage';
import { backupFileName, daysSince } from '../src/core/transfer-file';
import type { TrialResult } from '../src/core/types';

// Moving training between devices without an account: a backup from one device is merged into the other.

type Row = Record<string, unknown>;
const empty = () => Object.fromEntries(STORES.map((s) => [s, [] as Row[]])) as Record<StoreName, Row[]>;
const trial = (id: string, startedAt = 1): TrialResult => ({ id, exerciseId: 'A1', domain: 'verbal', mode: 'training', seed: 's', lang: 'en', startedAt, endedAt: startedAt + 1, level: 1, params: {}, accuracy: 0.5, metrics: {}, conditionKey: 'A1' });
const session = (id: string, patch: Row = {}) => ({ id, seed: 's', startedAt: 1, plannedMinutes: 50, trialIds: [] as string[], completed: false, ...patch });

describe('planMerge', () => {
  it('adds new blocks and keeps the ones already here', () => {
    const local = empty();
    local.trials = [trial('a') as unknown as Row];
    const incoming = empty();
    incoming.trials = [trial('a') as unknown as Row, trial('b') as unknown as Row];
    const p = planMerge(local, incoming);
    expect(p.writes.trials.map((r) => r.id)).toEqual(['b']);
    expect(p.added).toBe(1);
  });

  it('a finished session beats the same session still in progress (either direction)', () => {
    const inProgress = session('s1', { trialIds: ['a'] });
    const finished = session('s1', { trialIds: ['a', 'b'], completed: true, endedAt: 9 });
    const a = empty();
    a.sessions = [inProgress];
    const b = empty();
    b.sessions = [finished];
    expect(planMerge(a, b).writes.sessions).toEqual([finished]);
    expect(planMerge(b, a).writes.sessions).toEqual([]);
  });

  it('a done delayed recall beats a pending one; levels keep the most recently updated', () => {
    const a = empty();
    a.probes = [{ id: 'p', done: false }];
    a.adaptive = [{ exerciseId: 'A1', level: 3, history: [], updatedAt: 10 }];
    const b = empty();
    b.probes = [{ id: 'p', done: true }];
    b.adaptive = [{ exerciseId: 'A1', level: 5, history: [], updatedAt: 20 }];
    const p = planMerge(a, b);
    expect(p.writes.probes).toEqual([{ id: 'p', done: true }]);
    expect(p.writes.adaptive[0].level).toBe(5);
    expect(planMerge(b, a).writes.adaptive).toEqual([]);
  });

  it('COGITO adaptive levels merge task by task (each device keeps what it trained most recently)', () => {
    const pc = empty();
    pc.kv = [
      { key: 'cogitoStaircase', value: { G1: 20, G6: 1500 }, updatedAt: 100 },
      { key: 'cogitoStaircaseAt', value: { G1: 100, G6: 10 }, updatedAt: 100 },
    ];
    const phone = empty();
    phone.kv = [
      { key: 'cogitoStaircase', value: { G1: 12, G6: 900 }, updatedAt: 50 },
      { key: 'cogitoStaircaseAt', value: { G1: 5, G6: 50 }, updatedAt: 50 },
    ];
    const p = planMerge(pc, phone);
    const st = p.writes.kv.find((r) => r.key === 'cogitoStaircase')!;
    expect(st.value).toEqual({ G1: 20, G6: 900 });
  });

  it('best values keep the harder one; this device settings and calibration are never replaced', () => {
    const a = empty();
    a.kv = [
      { key: 'cogitoStaircaseBest', value: { G1: 20, G6: 900 } },
      { key: 'settings', value: { lang: 'pt' } },
      { key: 'cogitoCalibration', value: { createdAt: 1 } },
    ];
    const b = empty();
    b.kv = [
      { key: 'cogitoStaircaseBest', value: { G1: 24, G6: 1200 } },
      { key: 'settings', value: { lang: 'en' }, updatedAt: 999 },
      { key: 'cogitoCalibration', value: { createdAt: 2 }, updatedAt: 999 },
    ];
    const w = planMerge(a, b).writes.kv;
    expect(w.find((r) => r.key === 'cogitoStaircaseBest')!.value).toEqual({ G1: 24, G6: 900 });
    expect(w.find((r) => r.key === 'settings')).toBeUndefined();
    expect(w.find((r) => r.key === 'cogitoCalibration')).toBeUndefined();
  });

  it('an empty device takes everything, including the settings', () => {
    const b = empty();
    b.kv = [{ key: 'settings', value: { lang: 'en' } }];
    b.trials = [trial('x') as unknown as Row];
    const p = planMerge(empty(), b);
    expect(p.writes.kv.map((r) => r.key)).toEqual(['settings']);
    expect(p.added).toBe(2);
  });
});

describe('mergeAll on a real database', () => {
  beforeEach(() => useIndexedDB(new IDBFactory()));
  it('round trip: export from one device, merge into another, nothing lost on either side', async () => {
    await db.saveTrial(trial('pc-1', 1));
    await db.setKv('cogitoStaircase', { G1: 18 });
    const fromPc = await exportAll();

    useIndexedDB(new IDBFactory()); // "the phone"
    await db.saveTrial(trial('phone-1', 2));
    const r = await mergeAll(fromPc);
    expect(r.added).toBeGreaterThanOrEqual(2);
    expect((await db.trials()).map((t) => t.id)).toEqual(['pc-1', 'phone-1']);
    expect(await db.kv('cogitoStaircase')).toEqual({ G1: 18 });
    expect(typeof (await db.kv('lastImportAt'))).toBe('number');
  });
  it('rejects an invalid file without writing anything', async () => {
    await db.saveTrial(trial('keep'));
    await expect(mergeAll({ app: 'memory-lab', version: 1, data: { trials: [{ id: 1 }] } })).rejects.toThrow();
    expect((await db.trials()).map((t) => t.id)).toEqual(['keep']);
  });
});

describe('helpers', () => {
  it('backup file names carry date and time', () => {
    expect(backupFileName(new Date(2026, 9, 29, 7, 5))).toBe('cogito-backup-2026-10-29-0705.json');
  });
  it('days since the last backup', () => {
    expect(daysSince(undefined)).toBeNull();
    expect(daysSince(Date.now() - 3 * 86_400_000 - 1000)).toBe(3);
  });
});
