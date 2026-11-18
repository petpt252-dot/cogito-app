import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { db, exportAll, importAll, useIndexedDB, wipeAll, validateBundle } from '../src/core/storage';
import { DEFAULT_SETTINGS, type TrialResult } from '../src/core/types';
import { trialsCsv, toCsv } from '../src/core/csv';

const trial = (id: string, startedAt: number): TrialResult => ({
  id,
  exerciseId: 'A1',
  domain: 'verbal',
  mode: 'training',
  seed: 's',
  lang: 'pt',
  startedAt,
  endedAt: startedAt + 60_000,
  level: 2,
  params: { items: 12 },
  accuracy: 0.75,
  metrics: { correct: 9, intrusions: 1, efficiency: 22.5 },
  conditionKey: 'A1|n=12|enc=24000',
  encodingMs: 24000,
});

beforeEach(() => useIndexedDB(new IDBFactory()));

describe('IndexedDB persistence', () => {
  it('stores and reads trials, sorted by start time', async () => {
    await db.saveTrial(trial('b', 200));
    await db.saveTrial(trial('a', 100));
    expect((await db.trials()).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('returns default settings and merges saved ones', async () => {
    expect(await db.settings()).toEqual(DEFAULT_SETTINGS);
    await db.saveSettings({ ...DEFAULT_SETTINGS, lang: 'pt', thresholds: { up: 0.9, down: 0.5, blocks: 3 } });
    const s = await db.settings();
    expect(s.lang).toBe('pt');
    expect(s.thresholds.up).toBe(0.9);
  });

  it('persists adaptive state per exercise key', async () => {
    await db.saveAdaptive({ exerciseId: 'E1:backward', level: 4, history: [0.9], updatedAt: 1 });
    expect((await db.adaptive('E1:backward'))?.level).toBe(4);
    expect(await db.adaptive('E1:forward')).toBeUndefined();
  });

  it('exports, wipes and re-imports a complete JSON bundle', async () => {
    await db.saveTrial(trial('a', 1));
    await db.saveSession({ id: 's1', seed: 'x', startedAt: 1, plannedMinutes: 15, trialIds: ['a'], completed: true });
    await db.saveSettings({ ...DEFAULT_SETTINGS, lang: 'pt' });
    const bundle = JSON.parse(JSON.stringify(await exportAll()));
    expect(validateBundle(bundle)).toBe(true);
    await wipeAll();
    expect(await db.trials()).toEqual([]);
    const n = await importAll(bundle);
    expect(n).toBe(3);
    expect((await db.trials())[0].id).toBe('a');
    expect((await db.sessions())[0].trialIds).toEqual(['a']);
    expect((await db.settings()).lang).toBe('pt');
  });

  it('merge import keeps existing data; replace import removes it', async () => {
    await db.saveTrial(trial('old', 1));
    const bundle = { app: 'memory-lab', version: 1, exportedAt: '', data: { trials: [trial('new', 2)], sessions: [], assessments: [], adaptive: [], probes: [], kv: [] } };
    await importAll(bundle, false);
    expect((await db.trials()).map((t) => t.id)).toEqual(['old', 'new']);
    await importAll(bundle, true);
    expect((await db.trials()).map((t) => t.id)).toEqual(['new']);
  });

  it('rejects invalid import files', async () => {
    await expect(importAll({ foo: 1 })).rejects.toThrow();
    expect(validateBundle(null)).toBe(false);
  });
});

describe('CSV report', () => {
  it('writes one row per block with metric columns', () => {
    const csv = trialsCsv([trial('a', Date.UTC(2026, 0, 1))]);
    const [head, row] = csv.split('\n');
    expect(head).toContain('accuracy');
    expect(head).toContain('m_correct');
    expect(row).toContain('2026-01-01');
    expect(row).toContain('A1|n=12|enc=24000');
  });
  it('quotes cells with separators', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"' }])).toBe('a,b\n"x,y","say ""hi"""');
  });
});
