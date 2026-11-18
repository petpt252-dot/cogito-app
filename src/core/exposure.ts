import type { TrialResult } from './types';

// Exposure tracking across all tasks. Every block stores the ids it showed (words "misc:12", stories
// "story:s3", events "event:7", objects "obj:key"); generators then prefer items not seen recently.
// Words are shared by many tasks (A1, B1, G1, G2, strategies…), so recency is counted over all of them.

/** About how many recently shown ids count as "recent" (≈ 2/3 of the 1044-word training pool). */
export const EXPOSURE_WINDOW = 700;

/**
 * Recently shown item ids, oldest first (so `lastIndexOf` gives recency):
 * - the most recent blocks of any task, until about EXPOSURE_WINDOW ids are collected;
 * - the last 4 blocks of this exercise, even if older;
 * - every story ever read, so stories rotate least-recently-read first.
 * `trials` must be sorted by start time, oldest first.
 */
export function recentExposure(trials: TrialResult[], exerciseId?: string): string[] {
  const picked = new Set<TrialResult>();
  let n = 0;
  for (let i = trials.length - 1; i >= 0 && n < EXPOSURE_WINDOW; i--) {
    const ids = trials[i].itemIds;
    if (!ids?.length) continue;
    picked.add(trials[i]);
    n += ids.length;
  }
  if (exerciseId) trials.filter((t) => t.exerciseId === exerciseId).slice(-4).forEach((t) => picked.add(t));
  trials.filter((t) => t.itemIds?.some((x) => x.startsWith('story:'))).forEach((t) => picked.add(t));
  return [...picked].sort((a, b) => a.startedAt - b.startedAt).flatMap((t) => t.itemIds ?? []);
}
