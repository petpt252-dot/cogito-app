import { harderOf, STAIRCASE_AT_KEY, STAIRCASE_BEST_KEY, STAIRCASE_KEY, type StairState } from './staircase';
import type { AdaptiveState, DelayedProbe, ExerciseId, Protocol, SessionRecord, TrialResult } from './types';

// Saving a finished block and resuming an interrupted session, kept apart from the UI so both can be tested.

/** The writes needed after a block (the app's database, or a fake in tests). */
export interface BlockStore {
  saveTrial(t: TrialResult): Promise<unknown>;
  saveAdaptive(s: AdaptiveState): Promise<unknown>;
  kv<T>(key: string): Promise<T | undefined>;
  setKv(key: string, value: unknown): Promise<unknown>;
  saveProbe(p: DelayedProbe): Promise<unknown>;
}

export interface FinishedBlock {
  trial: TrialResult;
  /** Legacy adaptive level after the block (not for faithful/staircase-only tasks). */
  adaptive?: AdaptiveState;
  /** COGITO adaptive: the task's staircase value after the block. */
  stair?: { id: ExerciseId; value: number };
  probe?: DelayedProbe;
  /** Session bookkeeping, after everything else is stored. */
  onSaved?: (t: TrialResult) => void | Promise<void>;
}

/**
 * Store everything a block produced. Every write is keyed (same ids, same values), so after a failure the same call
 * can simply be repeated: nothing is stored twice.
 */
export async function saveBlock(store: BlockStore, b: FinishedBlock): Promise<void> {
  await store.saveTrial(b.trial);
  if (b.adaptive) await store.saveAdaptive(b.adaptive);
  if (b.stair) {
    const { id, value } = b.stair;
    const st = (await store.kv<StairState>(STAIRCASE_KEY)) ?? {};
    await store.setKv(STAIRCASE_KEY, { ...st, [id]: value });
    const at = (await store.kv<StairState>(STAIRCASE_AT_KEY)) ?? {};
    await store.setKv(STAIRCASE_AT_KEY, { ...at, [id]: b.trial.endedAt });
    const best = (await store.kv<StairState>(STAIRCASE_BEST_KEY)) ?? {};
    await store.setKv(STAIRCASE_BEST_KEY, { ...best, [id]: harderOf(id, best[id], value) });
  }
  if (b.probe) await store.saveProbe(b.probe);
  await b.onSaved?.(b.trial);
}

/** Session fields after a block of slot `slot`; a block already counted (a repeated save) changes nothing. */
export function sessionAfterBlock(rec: SessionRecord, trial: TrialResult, slot: number): Partial<SessionRecord> {
  if (rec.trialIds.includes(trial.id)) return {};
  const blocks = (rec.slotBlocks ?? []).slice();
  blocks[slot] = (blocks[slot] ?? 0) + 1;
  const used = (rec.slotUsedMs ?? []).slice();
  used[slot] = (used[slot] ?? 0) + (trial.endedAt - trial.startedAt);
  return { trialIds: [...rec.trialIds, trial.id], slotBlocks: blocks, slotUsedMs: used };
}

/** Where an interrupted session continues: its slot, what was already done there, and the rules it was started with. */
export function resumePoint(rec: SessionRecord, currentProtocol: Protocol) {
  const slot = rec.slot ?? 0;
  return {
    slot,
    blocksDone: rec.slotBlocks?.[slot] ?? 0,
    usedMs: rec.slotUsedMs?.[slot] ?? 0,
    // Sessions saved before the protocol was recorded fall back to the current setting.
    protocol: rec.protocol ?? currentProtocol,
  };
}

/**
 * What a slot still asks for: the blocks left (block-based slots, at least one) or the time left (timed slots,
 * including the time carried over from earlier parts, see carryMs).
 */
export function slotRemaining(slot: { minutes: number; blocks?: number }, done: { blocksDone: number; usedMs: number }, carry = 0) {
  return slot.blocks
    ? { requiredBlocks: Math.max(1, slot.blocks - done.blocksDone), budgetMs: undefined }
    : { requiredBlocks: undefined, budgetMs: Math.max(0, slot.minutes * 60_000 + carry - done.usedMs) };
}

/**
 * Time carried into timed part `slot`: what earlier timed parts left unused (or minus what they ran over), so the
 * session as a whole keeps the chosen length however long each person's blocks take. Never makes a part negative.
 */
export function carryMs(plan: { minutes: number; blocks?: number; kind: string }[], slotUsedMs: number[], slot: number): number {
  let carry = 0;
  for (let j = 0; j < slot; j++) {
    const p = plan[j];
    if (p.blocks || p.kind === 'delayed') continue;
    carry += p.minutes * 60_000 - (slotUsedMs[j] ?? 0);
  }
  return Math.max(-plan[slot].minutes * 60_000, carry);
}
