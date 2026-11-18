import type { AssessmentRecord, AssessmentTestKey } from './types';
import { ASSESSMENT_FORMS } from '../content';

// Assessment mode: fixed parameters (never adaptive), alternate forms, exposure control.

export const BATTERY: AssessmentTestKey[] = [
  'immediateVerbal',
  'visualRecognition',
  'visualReconstruction',
  'associative',
  'wmSpan',
  'delayedVerbal', // after the intervening tests above
];

/** Untrained transfer battery: formats that never appear in training. */
export const TRANSFER_BATTERY: AssessmentTestKey[] = ['symbolDigit', 'series', 'corsi'];

/**
 * COGITO-style near-transfer battery (Schmiedek et al., 2010): the practised working-memory tasks with new
 * content — animal span (vs alpha span), numerical 3-back (vs spatial 3-back), spatial updating (vs numerical
 * updating). Assessment only; never offered in training.
 */
export const NEAR_BATTERY: AssessmentTestKey[] = ['animalSpan', 'numeric3back', 'spatialUpdating'];

export function isTransfer(a: Pick<AssessmentRecord, 'kind'>) {
  return a.kind === 'transfer';
}

export function isNear(a: Pick<AssessmentRecord, 'kind'>) {
  return a.kind === 'near';
}

/** The main memory battery (baseline / reassessment), as opposed to the separate transfer batteries. */
export function isStandard(a: Pick<AssessmentRecord, 'kind'>) {
  return !isTransfer(a) && !isNear(a);
}

/** Fixed task conditions. Changing these breaks comparability with earlier assessments. */
export const FIXED = {
  verbalWords: 12,
  verbalEncodingMs: 24_000, // 2 s per word, shown together
  recogStudy: 10,
  recogStudyMs: 2_000,
  recogTest: 20,
  patternTrials: 3,
  patternSize: 5,
  patternCells: 7,
  patternMs: 3_000,
  pairs: 6,
  pairMs: 4_000,
  spanMin: 2,
  spanMax: 8,
  spanTrialsPerLength: 2,
  efficiencyWords: 12,
  efficiencyEncodingMs: 24_000,
} as const;

export const REASSESS_EVERY = 10;
/** Minimum days between assessments that would reuse a form already seen. */
export const MIN_DAYS_BEFORE_FORM_REUSE = 30;

export interface FormChoice {
  form: number;
  /** True if every form has been used and the least recently used one is reused within the minimum interval. */
  reuseWarning: boolean;
}

/**
 * Choose an alternate form: never one used in the previous (forms − 1) assessments; when all forms
 * have been used, the least recently used one, with a warning if it was used too recently.
 * A form counts as used as soon as its assessment starts (the first list is studied at once), so an
 * abandoned assessment still reserves its form: restarting cannot re-study the same material.
 */
export function chooseForm(previous: Pick<AssessmentRecord, 'form' | 'startedAt' | 'completed'>[], now = Date.now()): FormChoice {
  const done = previous.slice().sort((a, b) => a.startedAt - b.startedAt);
  const lastUse = new Map<number, number>();
  done.forEach((p) => lastUse.set(p.form % ASSESSMENT_FORMS, p.startedAt));
  for (let f = 0; f < ASSESSMENT_FORMS; f++) if (!lastUse.has(f)) return { form: f, reuseWarning: false };
  let best = 0;
  for (let f = 1; f < ASSESSMENT_FORMS; f++) if ((lastUse.get(f) as number) < (lastUse.get(best) as number)) best = f;
  const ageDays = (now - (lastUse.get(best) as number)) / 86_400_000;
  return { form: best, reuseWarning: ageDays < MIN_DAYS_BEFORE_FORM_REUSE };
}

export function reassessmentDue(completedSessions: number, assessments: Pick<AssessmentRecord, 'sessionIndex' | 'completed' | 'kind'>[]): boolean {
  const done = assessments.filter((a) => a.completed && isStandard(a));
  if (!done.length) return true; // baseline first
  const last = Math.max(...done.map((a) => a.sessionIndex));
  return completedSessions - last >= REASSESS_EVERY;
}
