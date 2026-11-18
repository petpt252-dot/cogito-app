import type { AssessmentRecord, TrialResult } from './types';

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  const cols: string[] = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => !cols.includes(k) && cols.push(k)));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

/** One row per block: identification, conditions, accuracy and every metric as its own column. */
export function trialsCsv(trials: TrialResult[]): string {
  return toCsv(
    trials.map((t) => ({
      date: new Date(t.startedAt).toISOString(),
      exercise: t.exerciseId,
      domain: t.domain,
      mode: t.mode,
      delayed: t.delayed ? 1 : 0,
      strategy: t.strategy ?? '',
      level: t.level,
      condition: t.conditionKey,
      language: t.lang,
      durationSec: Math.round((t.endedAt - t.startedAt) / 1000),
      encodingSec: t.encodingMs !== undefined ? Math.round(t.encodingMs / 100) / 10 : '',
      accuracy: Math.round(t.accuracy * 1000) / 1000,
      ...Object.fromEntries(Object.entries(t.metrics).map(([k, v]) => [`m_${k}`, v])),
      session: t.sessionId ?? '',
      seed: t.seed,
    })),
  );
}

export function assessmentsCsv(list: AssessmentRecord[]): string {
  const rows: Record<string, unknown>[] = [];
  for (const a of list)
    for (const [test, metrics] of Object.entries(a.results))
      rows.push({ date: new Date(a.startedAt).toISOString(), kind: a.kind, form: a.form + 1, afterSessions: a.sessionIndex, test, ...Object.fromEntries(Object.entries(metrics ?? {}).map(([k, v]) => [`m_${k}`, v])) });
  return toCsv(rows);
}

export function download(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' + content : content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
