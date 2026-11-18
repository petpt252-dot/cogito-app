import type { AdaptiveState, AssessmentRecord, DelayedProbe, ExerciseId, SessionRecord, Settings, TrialResult } from './types';
import { DEFAULT_SETTINGS } from './types';
import { normalizeStair } from './staircase';

// Local-only persistence in IndexedDB. No account, no network.

const DB_NAME = 'memory-lab';
const DB_VERSION = 1;

export const STORES = ['trials', 'sessions', 'assessments', 'adaptive', 'probes', 'kv'] as const;
export type StoreName = (typeof STORES)[number];

const KEYS: Record<StoreName, string> = {
  trials: 'id',
  sessions: 'id',
  assessments: 'id',
  adaptive: 'exerciseId',
  probes: 'id',
  kv: 'key',
};

let dbPromise: Promise<IDBDatabase> | null = null;
let factory: IDBFactory | null = null;

/** Tests inject fake-indexeddb here. */
export function useIndexedDB(f: IDBFactory) {
  factory = f;
  dbPromise = null;
}

function idb(): IDBFactory {
  return factory ?? indexedDB;
}

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = idb().open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            const store = db.createObjectStore(s, { keyPath: KEYS[s] });
            if (s === 'trials') {
              store.createIndex('exerciseId', 'exerciseId');
              store.createIndex('sessionId', 'sessionId');
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('COGITO database is blocked by another open tab'));
    });
    // A failed open must not be cached forever: the next call tries again.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store: StoreName, mode: IDBTransactionMode) {
  const db = await openDb();
  return db.transaction(store, mode).objectStore(store);
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  await wrap((await tx(store, 'readwrite')).put(value));
}

export async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  return wrap((await tx(store, 'readonly')).get(key)) as Promise<T | undefined>;
}

export async function all<T>(store: StoreName): Promise<T[]> {
  return wrap((await tx(store, 'readonly')).getAll()) as Promise<T[]>;
}

export async function del(store: StoreName, key: string): Promise<void> {
  await wrap((await tx(store, 'readwrite')).delete(key));
}

export async function clear(store: StoreName): Promise<void> {
  await wrap((await tx(store, 'readwrite')).clear());
}

// ---- typed helpers ----

export const db = {
  saveTrial: (t: TrialResult) => put('trials', t),
  trials: () => all<TrialResult>('trials').then((xs) => xs.sort((a, b) => a.startedAt - b.startedAt)),
  saveSession: (s: SessionRecord) => put('sessions', s),
  sessions: () => all<SessionRecord>('sessions').then((xs) => xs.sort((a, b) => a.startedAt - b.startedAt)),
  saveAssessment: (a: AssessmentRecord) => put('assessments', a),
  assessments: () => all<AssessmentRecord>('assessments').then((xs) => xs.sort((a, b) => a.startedAt - b.startedAt)),
  adaptive: (id: string) => get<AdaptiveState>('adaptive', id),
  allAdaptive: () => all<AdaptiveState>('adaptive'),
  saveAdaptive: (s: AdaptiveState) => put('adaptive', s),
  probes: () => all<DelayedProbe>('probes'),
  saveProbe: (p: DelayedProbe) => put('probes', p),
  async settings(): Promise<Settings> {
    const row = await get<{ key: string; value: Settings }>('kv', 'settings');
    return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}), thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(row?.value?.thresholds ?? {}) } };
  },
  saveSettings: (s: Settings) => put('kv', { key: 'settings', value: s }),
  async kv<T>(key: string): Promise<T | undefined> {
    return (await get<{ key: string; value: T }>('kv', key))?.value;
  },
  // updatedAt lets a merge between devices keep the most recent value of each setting/state (see mergeAll)
  setKv: <T,>(key: string, value: T) => put('kv', { key, value, updatedAt: Date.now() }),
};

// ---- export / import ----

export interface ExportBundle {
  app: 'memory-lab';
  version: 1;
  exportedAt: string;
  data: Record<StoreName, unknown[]>;
}

export async function exportAll(): Promise<ExportBundle> {
  const data = {} as Record<StoreName, unknown[]>;
  for (const s of STORES) data[s] = await all(s);
  return { app: 'memory-lab', version: 1, exportedAt: new Date().toISOString(), data };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x: unknown) => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const optNum = (x: unknown) => x === undefined || isNum(x);

/** Per-store row checks: required keys and types, so a damaged backup cannot enter the database. */
const ROW_CHECKS: Record<StoreName, (r: Record<string, unknown>) => string | null> = {
  trials: (r) =>
    !isStr(r.id) ? 'id' : !isStr(r.exerciseId) ? 'exerciseId' : !isNum(r.startedAt) ? 'startedAt' : !isNum(r.endedAt) ? 'endedAt' : !isNum(r.accuracy) || (r.accuracy as number) < 0 || (r.accuracy as number) > 1 ? 'accuracy' : !isNum(r.level) ? 'level' : !isObj(r.metrics) ? 'metrics' : !isObj(r.params) ? 'params' : typeof r.conditionKey !== 'string' ? 'conditionKey' : null,
  sessions: (r) => (!isStr(r.id) ? 'id' : !isNum(r.startedAt) ? 'startedAt' : !optNum(r.endedAt) ? 'endedAt' : !Array.isArray(r.trialIds) || !r.trialIds.every(isStr) ? 'trialIds' : typeof r.completed !== 'boolean' ? 'completed' : null),
  assessments: (r) => (!isStr(r.id) ? 'id' : !isStr(r.kind) ? 'kind' : !isNum(r.form) ? 'form' : !isNum(r.startedAt) ? 'startedAt' : !isObj(r.results) ? 'results' : !isNum(r.step) ? 'step' : typeof r.completed !== 'boolean' ? 'completed' : null),
  adaptive: (r) => (!isStr(r.exerciseId) ? 'exerciseId' : !isNum(r.level) || (r.level as number) < 1 ? 'level' : !Array.isArray(r.history) || !r.history.every(isNum) ? 'history' : null),
  probes: (r) => (!isStr(r.id) ? 'id' : !isStr(r.exerciseId) ? 'exerciseId' : !isStr(r.kind) ? 'kind' : !isNum(r.createdAt) ? 'createdAt' : !isNum(r.dueAt) ? 'dueAt' : typeof r.done !== 'boolean' ? 'done' : null),
  kv: (r) => (!isStr(r.key) ? 'key' : null),
};

/** Full validation. Returns a list of problems ("trials[3].accuracy"); empty means the bundle is safe to import. */
export function bundleErrors(x: unknown): string[] {
  if (!isObj(x)) return ['root'];
  if (x.app !== 'memory-lab' || x.version !== 1) return ['app/version'];
  if (!isObj(x.data)) return ['data'];
  const data = x.data;
  const errors: string[] = [];
  for (const s of STORES) {
    const rows = data[s] ?? [];
    if (!Array.isArray(rows)) {
      errors.push(s);
      continue;
    }
    const seen = new Set<unknown>();
    rows.forEach((row, i) => {
      if (!isObj(row)) return errors.push(`${s}[${i}]`);
      const bad = ROW_CHECKS[s](row);
      if (bad) return errors.push(`${s}[${i}].${bad}`);
      const key = row[KEYS[s]];
      if (seen.has(key)) errors.push(`${s}[${i}].${KEYS[s]} (duplicate)`);
      seen.add(key);
    });
  }
  return errors;
}

export function validateBundle(x: unknown): x is ExportBundle {
  return bundleErrors(x).length === 0;
}

export class ImportError extends Error {
  constructor(public problems: string[]) {
    super(`Invalid COGITO export file: ${problems.slice(0, 5).join(', ')}`);
  }
}

/**
 * Import a bundle. The whole file is validated before anything is written, and all stores are written in
 * one transaction: if any write fails, the transaction aborts and the existing data is left untouched.
 * `replace` wipes existing data first (inside the same transaction); otherwise records are merged by key.
 */
export async function importAll(bundle: unknown, replace = false): Promise<number> {
  const problems = bundleErrors(bundle);
  if (problems.length) throw new ImportError(problems);
  const b = bundle as ExportBundle;
  const database = await openDb();
  return new Promise<number>((resolve, reject) => {
    const t = database.transaction([...STORES], 'readwrite');
    let n = 0;
    t.oncomplete = () => resolve(n);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Import aborted'));
    try {
      for (const s of STORES) {
        const store = t.objectStore(s);
        if (replace) store.clear();
        for (const row of b.data[s] ?? []) {
          store.put(row);
          n++;
        }
      }
    } catch (e) {
      t.abort();
      reject(e);
    }
  });
}

// ---- merging data from another device ----

type Row = Record<string, unknown>;
const num = (x: unknown) => (typeof x === 'number' ? x : 0);

/** kv entries that belong to this device and are never taken from another one. */
const LOCAL_ONLY_KV = new Set(['settings', 'protocolDefaultV2', 'lastExportAt', 'lastImportAt']);

/** How far a session got: completed > ended (partial) > in progress; then more blocks; then later end. */
const sessionRank = (s: Row) => [s.completed ? 2 : s.endedAt ? 1 : 0, Array.isArray(s.trialIds) ? s.trialIds.length : 0, num(s.endedAt)];
const better = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

/** Per-task "best" values: the harder one wins (larger sizes, shorter times). */
function mergeBest(local: Row, incoming: Row): Row {
  const out: Row = { ...local };
  for (const [id, v] of Object.entries(incoming)) {
    if (typeof v !== 'number') continue;
    const cur = out[id];
    if (typeof cur !== 'number') out[id] = v;
    else out[id] = /^(G1|G2|G3|G4)$/.test(id) ? Math.max(cur, v) : Math.min(normalizeStair(id as ExerciseId, cur), normalizeStair(id as ExerciseId, v));
  }
  return out;
}

/**
 * Decide, record by record, what a merge should write. Nothing already on this device is lost:
 * - blocks (trials): added if new (ids are unique per block);
 * - sessions, assessments, delayed recalls: the more advanced copy wins (e.g. a finished session over the
 *   same session still in progress; a done recall over a pending one);
 * - per-exercise levels and kv state (COGITO adaptive levels, Posner level…): the most recently updated wins;
 *   best values take the harder of the two; this device's settings stay as they are.
 * Exported as a pure function for tests.
 */
export function planMerge(local: Record<StoreName, Row[]>, incoming: Record<StoreName, Row[]>): { writes: Record<StoreName, Row[]>; added: number; updated: number } {
  const writes = Object.fromEntries(STORES.map((s) => [s, [] as Row[]])) as Record<StoreName, Row[]>;
  let added = 0;
  let updated = 0;
  for (const s of STORES) {
    const key = KEYS[s];
    const mine = new Map(local[s].map((r) => [r[key], r]));
    for (const r of incoming[s] ?? []) {
      const cur = mine.get(r[key]);
      if (!cur) {
        if (s === 'kv' && LOCAL_ONLY_KV.has(String(r.key)) && String(r.key) !== 'settings') continue;
        writes[s].push(r);
        added++;
        continue;
      }
      let take = false;
      let row: Row = r;
      if (s === 'sessions') take = better(sessionRank(r), sessionRank(cur));
      else if (s === 'assessments') take = better([r.completed ? 1 : 0, num(r.step)], [cur.completed ? 1 : 0, num(cur.step)]);
      else if (s === 'probes') take = !cur.done && !!r.done;
      else if (s === 'adaptive') take = num(r.updatedAt) > num(cur.updatedAt);
      else if (s === 'kv') {
        const k = String(r.key);
        if (LOCAL_ONLY_KV.has(k)) take = false;
        else if (k === 'cogitoStaircaseBest' && isObj(cur.value) && isObj(r.value)) {
          row = { ...cur, value: mergeBest(cur.value, r.value), updatedAt: Math.max(num(cur.updatedAt), num(r.updatedAt)) };
          take = JSON.stringify(row.value) !== JSON.stringify(cur.value);
        } else if (k === 'posnerState' && isObj(cur.value) && isObj(r.value)) {
          const newer = num(r.updatedAt) > num(cur.updatedAt) ? r.value : cur.value;
          row = { ...cur, value: { ...newer, best: Math.max(num(cur.value.best), num(r.value.best)) }, updatedAt: Math.max(num(cur.updatedAt), num(r.updatedAt)) };
          take = JSON.stringify(row.value) !== JSON.stringify(cur.value);
        } else if (k === 'cogitoStaircase' && isObj(cur.value) && isObj(r.value)) {
          // task by task: the value changed most recently wins (timestamps in 'cogitoStaircaseAt')
          const atOf = (rows: Row[]) => ((rows.find((x) => x.key === 'cogitoStaircaseAt')?.value as Row) ?? {}) as Row;
          const atMine = atOf(local.kv);
          const atTheirs = atOf(incoming.kv ?? []);
          const merged: Row = { ...cur.value };
          for (const [id, v] of Object.entries(r.value)) if (num(atTheirs[id]) > num(atMine[id]) || (merged[id] === undefined && atMine[id] === undefined)) merged[id] = v;
          row = { ...cur, value: merged, updatedAt: Math.max(num(cur.updatedAt), num(r.updatedAt)) };
          take = JSON.stringify(merged) !== JSON.stringify(cur.value);
        } else if (k === 'cogitoStaircaseAt' && isObj(cur.value) && isObj(r.value)) {
          const merged: Row = { ...cur.value };
          for (const [id, v] of Object.entries(r.value)) merged[id] = Math.max(num(merged[id]), num(v));
          row = { ...cur, value: merged };
          take = JSON.stringify(merged) !== JSON.stringify(cur.value);
        } else if (k === 'cogitoCalibration') take = false; // a calibration is personal to the setup it was done on
        else take = num(r.updatedAt) > num(cur.updatedAt);
      }
      if (take) {
        writes[s].push(row);
        updated++;
      }
    }
  }
  return { writes, added, updated };
}

/** Merge a backup from another device into this one (validated first, written in one transaction). */
export async function mergeAll(bundle: unknown): Promise<{ added: number; updated: number }> {
  const problems = bundleErrors(bundle);
  if (problems.length) throw new ImportError(problems);
  const b = bundle as ExportBundle;
  const local = {} as Record<StoreName, Row[]>;
  for (const s of STORES) local[s] = await all<Row>(s);
  const plan = planMerge(local, b.data as Record<StoreName, Row[]>);
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = database.transaction([...STORES], 'readwrite');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Import aborted'));
    try {
      for (const s of STORES) for (const row of plan.writes[s]) t.objectStore(s).put(row);
      t.objectStore('kv').put({ key: 'lastImportAt', value: Date.now(), updatedAt: Date.now() });
    } catch (e) {
      t.abort();
      reject(e);
    }
  });
  return { added: plan.added, updated: plan.updated };
}

export async function wipeAll(): Promise<void> {
  for (const s of STORES) await clear(s);
}

export function uid(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + r;
}
