import type { ExerciseId, Protocol, StrategyId, TrainingGoal } from './types';
import { createRng } from './rng';

// Daily session protocol. Default 15 min: verbal 4 · visual 4 · associative/narrative 4 · delayed recall & review 3.
// Other lengths scale those proportions, except the delayed slot, which is capped (it only holds the
// session's 1–2 recalls). Working memory is a separate, optional slot.
// Timed slots are a minimum: a component can only be left once another block would no longer fit.
// Exercises rotate (least recently used per slot) to limit task-specific practice.

export type SlotKind = 'verbal' | 'visual' | 'associative' | 'working' | 'speed' | 'delayed';

export interface PlanSlot {
  kind: SlotKind;
  /** Planned time. For timed slots it is also the minimum; for block-based slots (`blocks`) it is an estimate. */
  minutes: number;
  /** COGITO mode: the fixed number of blocks to complete, as in the study's trials per task. */
  blocks?: number;
  /** null for the delayed slot, whose content is the session's due probes. */
  exerciseId: ExerciseId | null;
}

export const SLOT_POOLS: Record<Exclude<SlotKind, 'delayed' | 'speed'>, ExerciseId[]> = {
  verbal: ['A1', 'A2', 'A3'],
  visual: ['C1', 'C2', 'C3'],
  associative: ['B1', 'B2', 'B3', 'D1', 'D2'],
  working: ['E1', 'E2', 'E3', 'E4'],
};

/**
 * Hybrid (Memory Lab 2.0): Memory Lab's visual, associative, narrative and strategy-based episodic tasks,
 * plus COGITO-inspired sequential word learning, number–noun pairs, object positions, working-memory
 * tasks (alpha span, numerical updating, spatial 3-back) and perceptual speed.
 */
export const HYBRID_POOLS: Record<Exclude<SlotKind, 'delayed'>, ExerciseId[]> = {
  verbal: ['A1', 'A2', 'G1'],
  visual: ['C1', 'C2', 'C3', 'B3', 'G3'],
  associative: ['B1', 'B2', 'D1', 'D2', 'G2'],
  working: ['G4', 'G5', 'G6', 'E1', 'E2', 'E3', 'E4'],
  speed: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
};

/** Relative time per slot for a 15-minute hybrid session (scaled for other lengths). Engineering defaults. */
export const HYBRID_WEIGHTS: Record<TrainingGoal, Record<SlotKind, number>> = {
  episodic: { verbal: 3.5, visual: 3, associative: 3, working: 2, speed: 1, delayed: 2.5 },
  broad: { verbal: 2.5, visual: 2, associative: 2, working: 3, speed: 3, delayed: 2.5 },
};

/**
 * COGITO practised all 12 tasks in every session with a fixed number of trials per task (Schmiedek et al.,
 * 2010): 2 trials of each episodic task, 2 × 40 items of each speed task, 8 alpha-span lists, 8 updating
 * problems and 4 spatial 3-back runs. Here G4 and G5 blocks hold 4 lists/problems (2 blocks = 8), speed
 * blocks hold 40 items, and each G6 block is one 3-back run. `estMinutes` is per block, for display only.
 * This order groups episodic, working memory, then speed.
 */
export const COGITO_TASKS: { id: ExerciseId; kind: SlotKind; blocks: number; estMinutes: number }[] = [
  { id: 'G1', kind: 'verbal', blocks: 2, estMinutes: 4 },
  { id: 'G2', kind: 'associative', blocks: 2, estMinutes: 3 },
  { id: 'G3', kind: 'visual', blocks: 2, estMinutes: 3 },
  { id: 'G4', kind: 'working', blocks: 2, estMinutes: 2 },
  { id: 'G5', kind: 'working', blocks: 2, estMinutes: 2.5 },
  { id: 'G6', kind: 'working', blocks: 4, estMinutes: 1.25 },
  { id: 'P1', kind: 'speed', blocks: 2, estMinutes: 1 },
  { id: 'P2', kind: 'speed', blocks: 2, estMinutes: 1 },
  { id: 'P3', kind: 'speed', blocks: 2, estMinutes: 1.25 },
  { id: 'P4', kind: 'speed', blocks: 2, estMinutes: 1.25 },
  { id: 'P5', kind: 'speed', blocks: 2, estMinutes: 1.25 },
  { id: 'P6', kind: 'speed', blocks: 2, estMinutes: 2 },
];

/** Upper limit for the delayed-recall slot: it holds the session's 1–2 recalls, which take a few minutes. */
export const DELAYED_MAX_MINUTES = 4;

/** COGITO reference dose: about 100 daily sessions of about one hour (Schmiedek et al., 2010). */
export const COGITO_REFERENCE_HOURS = 100;

/** Exercises that leave material for the delayed-recall slot. */
export const PROBE_SOURCES: ExerciseId[] = ['A1', 'A2', 'B1', 'D1'];

export const SESSION_LENGTHS = [10, 15, 20, 30, 45, 60] as const;

/** COGITO's daily dose was about one hour (Schmiedek et al., 2010); used as the recommended session length. */
export const COGITO_SESSION_MINUTES = 60;

/** Recommended configuration: COGITO adaptive (the 12 COGITO tasks, about 1 h, adapting after every answer). */
export const RECOMMENDED = { protocol: 'adaptive', goal: 'broad', sessionMinutes: COGITO_SESSION_MINUTES } as const;

export function slotMinutes(total: number, includeWorking: boolean): Record<SlotKind, number> {
  const weights: Record<SlotKind, number> = includeWorking
    ? { verbal: 3, visual: 3, associative: 3, working: 3, speed: 0, delayed: 3 }
    : { verbal: 4, visual: 4, associative: 4, working: 0, speed: 0, delayed: 3 };
  return scale(weights, total);
}

function scale(weights: Record<SlotKind, number>, total: number): Record<SlotKind, number> {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const half = (x: number) => Math.round(x * 2) / 2;
  const out = {} as Record<SlotKind, number>;
  (Object.keys(weights) as SlotKind[]).forEach((k) => (out[k] = half((total * weights[k]) / sum)));
  // Cap the delayed slot and give the rest of the time to the training slots, in the same proportions.
  if (out.delayed > DELAYED_MAX_MINUTES) {
    const rest = sum - weights.delayed;
    out.delayed = DELAYED_MAX_MINUTES;
    (Object.keys(weights) as SlotKind[]).forEach((k) => k !== 'delayed' && (out[k] = half(((total - DELAYED_MAX_MINUTES) * weights[k]) / rest)));
  }
  return out;
}

/** Pick the least recently used exercise in a pool; ties broken reproducibly by seed. */
export function rotate(pool: ExerciseId[], recent: ExerciseId[], seed: string): ExerciseId {
  const rng = createRng(seed);
  const lastUse = (id: ExerciseId) => {
    const i = recent.lastIndexOf(id);
    return i === -1 ? -Infinity : i;
  };
  const shuffled = rng.shuffle(pool);
  return shuffled.reduce((best, id) => (lastUse(id) < lastUse(best) ? id : best), shuffled[0]);
}

export interface PlanOptions {
  minutes: number;
  includeWorking: boolean;
  recent: ExerciseId[];
  seed: string;
  delayed: boolean;
  protocol?: Protocol;
  goal?: TrainingGoal;
  /** COGITO and faithful: false = timed parts adding up to `minutes` instead of the study's fixed blocks. */
  studyDose?: boolean;
}

export function buildPlan(opts: PlanOptions): PlanSlot[] {
  // 'faithful' runs the same 12 tasks and blocks, with the study's sizes and calibrated, fixed timings.
  // 'adaptive' = faithful tasks with per-response staircases (core/staircase.ts).
  if (opts.protocol === 'adaptive') return buildAdaptivePlan(opts);
  if (opts.protocol === 'cogito' || opts.protocol === 'faithful') return opts.studyDose === false ? buildAdaptivePlan(opts) : buildCogitoPlan();
  if (opts.protocol === 'hybrid') return buildHybridPlan(opts);
  const m = slotMinutes(opts.minutes, opts.includeWorking);
  const verbal = rotate(SLOT_POOLS.verbal, opts.recent, opts.seed + ':v');
  const visual = rotate(SLOT_POOLS.visual, opts.recent, opts.seed + ':c');
  // Guarantee at least one probe source, so the delayed slot always has material to retrieve.
  const assocPool = opts.delayed && !PROBE_SOURCES.includes(verbal) ? SLOT_POOLS.associative.filter((e) => PROBE_SOURCES.includes(e)) : SLOT_POOLS.associative;
  const associative = rotate(assocPool, opts.recent, opts.seed + ':a');
  const slots: PlanSlot[] = [
    { kind: 'verbal', minutes: m.verbal, exerciseId: verbal },
    { kind: 'visual', minutes: m.visual, exerciseId: visual },
    { kind: 'associative', minutes: m.associative, exerciseId: associative },
  ];
  if (opts.includeWorking) slots.push({ kind: 'working', minutes: m.working, exerciseId: rotate(SLOT_POOLS.working, opts.recent, opts.seed + ':w') });
  if (opts.delayed) slots.push({ kind: 'delayed', minutes: m.delayed, exerciseId: null });
  else slots[slots.length - 1].minutes += m.delayed;
  return slots;
}

/** Hybrid: one block type per slot, rotated; the goal shifts time between episodic memory and WM/speed. */
export function buildHybridPlan(opts: PlanOptions): PlanSlot[] {
  const m = scale(HYBRID_WEIGHTS[opts.goal ?? 'broad'], opts.minutes);
  const pick = (kind: Exclude<SlotKind, 'delayed'>, pool = HYBRID_POOLS[kind], salt = kind) => rotate(pool, opts.recent, `${opts.seed}:${salt}`);
  const verbal = pick('verbal');
  const assocPool = opts.delayed && !PROBE_SOURCES.includes(verbal) ? HYBRID_POOLS.associative.filter((e) => PROBE_SOURCES.includes(e)) : HYBRID_POOLS.associative;
  const slots: PlanSlot[] = [
    { kind: 'verbal', minutes: m.verbal, exerciseId: verbal },
    { kind: 'visual', minutes: m.visual, exerciseId: pick('visual') },
    { kind: 'working', minutes: m.working, exerciseId: pick('working') },
  ];
  // Broad goal: two different speed tasks per session; episodic goal: one.
  const speedA = pick('speed');
  if ((opts.goal ?? 'broad') === 'broad') {
    const speedB = rotate(HYBRID_POOLS.speed.filter((e) => e !== speedA), [...opts.recent, speedA], `${opts.seed}:speed2`);
    // Split on half-minutes (e.g. 13.5 -> 7 + 6.5) so the total is kept without quarter-minute slots.
    const first = Math.ceil(m.speed) / 2;
    slots.push({ kind: 'speed', minutes: first, exerciseId: speedA }, { kind: 'speed', minutes: m.speed - first, exerciseId: speedB });
  } else slots.push({ kind: 'speed', minutes: m.speed, exerciseId: speedA });
  slots.push({ kind: 'associative', minutes: m.associative, exerciseId: pick('associative', assocPool) });
  if (opts.delayed) slots.push({ kind: 'delayed', minutes: m.delayed, exerciseId: null });
  else slots[slots.length - 1].minutes += m.delayed;
  return slots;
}

/** COGITO-inspired: all 12 tasks every session, each with the study's fixed number of blocks (the session length setting does not apply). */
export function buildCogitoPlan(): PlanSlot[] {
  return COGITO_TASKS.map((x) => ({ kind: x.kind, minutes: x.blocks * x.estMinutes, blocks: x.blocks, exerciseId: x.id }));
}

/** Protocols whose plan is a list of blocks per task (no timed slots). */
export const isBlockBased = (p: Protocol) => p === 'cogito' || p === 'faithful';
/** Protocols that can keep the study's fixed dose (their own blocks) instead of the length setting. */
export const isFixedDose = isBlockBased;
/** The session runs the study's fixed blocks: a COGITO/faithful protocol with the study dose chosen. */
export const usesStudyDose = (s: { protocol: Protocol; studyDose?: boolean }) => isFixedDose(s.protocol) && s.studyDose !== false;

/**
 * Session order for the adaptive protocol: memory/working-memory and speed tasks alternate, and each group starts
 * at a different task every session, so tiredness late in the session does not always fall on the same tasks.
 */
export function adaptiveOrder<T extends { kind: SlotKind }>(tasks: T[], seed: string): T[] {
  const rng = createRng(seed + ':order');
  const rotate = (xs: T[]) => {
    const k = xs.length ? rng.int(0, xs.length - 1) : 0;
    return [...xs.slice(k), ...xs.slice(0, k)];
  };
  const memory = rotate(tasks.filter((x) => x.kind !== 'speed'));
  const speed = rotate(tasks.filter((x) => x.kind === 'speed'));
  const out: T[] = [];
  for (let i = 0; i < Math.max(memory.length, speed.length); i++) {
    if (memory[i]) out.push(memory[i]);
    if (speed[i]) out.push(speed[i]);
  }
  return out;
}

/**
 * Adaptive: the COGITO tasks in timed slots that add up to the chosen length. Each task's share follows its share
 * of the study session; its blocks repeat until the slot's time is up (at least one block). Block length changes
 * with the staircase level, so a fixed number of blocks could not keep the chosen length. When there is not time
 * for one block of every task, the least recently practised tasks are chosen, so all 12 rotate over the days.
 */
export function buildAdaptivePlan(opts: Pick<PlanOptions, 'minutes' | 'recent' | 'seed'>): PlanSlot[] {
  const lastUse = (id: ExerciseId) => opts.recent.lastIndexOf(id);
  const order = createRng(opts.seed + ':adaptive')
    .shuffle(COGITO_TASKS)
    .sort((a, b) => lastUse(a.id) - lastUse(b.id));
  const chosen = new Set<ExerciseId>();
  let left = opts.minutes;
  for (const x of order) {
    if (x.estMinutes > left && chosen.size > 0) continue;
    chosen.add(x.id);
    left -= x.estMinutes;
  }
  const tasks = adaptiveOrder(COGITO_TASKS.filter((x) => chosen.has(x.id)), opts.seed);
  const weight = (x: (typeof tasks)[number]) => x.blocks * x.estMinutes;
  const sum = tasks.reduce((a, x) => a + weight(x), 0);
  const half = (x: number) => Math.max(1, Math.round(x * 2) / 2);
  const slots = tasks.map((x) => ({ kind: x.kind, minutes: half((opts.minutes * weight(x)) / sum), exerciseId: x.id }));
  // Rounding leftovers go to the longest slot, so the slots add up to the chosen length.
  const longest = slots.reduce((m, x) => (x.minutes > m.minutes ? x : m), slots[0]);
  longest.minutes = Math.max(1, longest.minutes + opts.minutes - slots.reduce((a, x) => a + x.minutes, 0));
  return slots;
}

/** Planned length of a session (minutes), the sum of its slots. */
export const planMinutes = (plan: Pick<PlanSlot, 'minutes'>[]) => Math.round(plan.reduce((a, p) => a + p.minutes, 0));

/**
 * When may a session component be left?
 * - block-based (COGITO mode): after the required number of blocks; no extra blocks are offered;
 * - timed: once the time left is under half a block (estimated from the last block), so parts end near their
 *   planned length; after the time is up only "continue" is offered.
 * Outside sessions (no limits given) both are always possible.
 */
export function slotGate(opts: { blocksDone: number; requiredBlocks?: number; remainingMs?: number; lastBlockMs: number }) {
  if (opts.requiredBlocks !== undefined) {
    const met = opts.blocksDone >= opts.requiredBlocks;
    return { canNext: !met, canFinish: met };
  }
  if (opts.remainingMs === undefined) return { canNext: true, canFinish: true };
  // Leave when another block would overshoot by more than it would fall short (time left under half a block), so
  // parts end on average at their planned length instead of up to one block early.
  return { canNext: opts.remainingMs > 0, canFinish: opts.remainingMs <= opts.lastBlockMs / 2 };
}

/**
 * Deterministic seed for the next session: date + session number. The dashboard preview and the
 * session itself use the same seed, so "today's training" shows exactly what will run.
 */
export function dailySeed(sessionNumber: number, date = new Date()): string {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `day:${d}:${sessionNumber}`;
}

// ---- 30-session introductory programme ----

export interface ProgramDay {
  day: number;
  /** 1 = introductory cycle, 2+ = continuation cycles. */
  cycle: number;
  dayInCycle: number;
  phase: 1 | 2 | 3;
  strategy: StrategyId;
  /** Reassessment is offered after this session. */
  reassessAfter: boolean;
  /** Last session of a cycle. */
  cycleEnd: boolean;
}

const STRATEGY_ORDER: StrategyId[] = ['imagery', 'elaboration', 'clustering', 'loci', 'retrieval'];

/** Sessions per cycle. The programme does not end: after cycle 1 (introductory), training continues in further cycles. */
export const PROGRAM_LENGTH = 30;

export function programDay(day: number): ProgramDay {
  const d = Math.max(1, Math.floor(day));
  const cycle = Math.floor((d - 1) / PROGRAM_LENGTH) + 1;
  const dayInCycle = ((d - 1) % PROGRAM_LENGTH) + 1;
  // Cycle 1, phase 1 introduces one strategy every 2 sessions; afterwards strategies rotate for practice.
  const phase = cycle > 1 ? 3 : dayInCycle <= 10 ? 1 : dayInCycle <= 20 ? 2 : 3;
  const strategy = phase === 1 ? STRATEGY_ORDER[Math.floor((dayInCycle - 1) / 2)] : STRATEGY_ORDER[(d - 1) % STRATEGY_ORDER.length];
  return { day: d, cycle, dayInCycle, phase, strategy, reassessAfter: d % 10 === 0, cycleEnd: dayInCycle === PROGRAM_LENGTH };
}

/** Where the user stands after `completed` sessions: the cycle the next session belongs to and how many of it are done. */
export function cycleProgress(completed: number) {
  return { cycle: Math.floor(completed / PROGRAM_LENGTH) + 1, done: completed % PROGRAM_LENGTH };
}

export const PROGRAM: ProgramDay[] = Array.from({ length: PROGRAM_LENGTH }, (_, i) => programDay(i + 1));

/** Sessions per week check (5–7 recommended). Returns training days in the 7 days before `now`. */
export function daysTrainedLastWeek(sessionStarts: number[], now = Date.now()): number {
  const days = new Set(sessionStarts.filter((t) => now - t < 7 * 86_400_000).map((t) => new Date(t).toDateString()));
  return days.size;
}

/**
 * A session counts towards the programme only if every training component was completed (its minimum
 * time or blocks, see slotGate). Skipping components ("Back" on an intro) or ending early leaves a partial
 * session, which is kept in the history but does not advance the programme, the weekly days or the
 * reassessment reminder.
 */
export function sessionCompletion(plan: Pick<PlanSlot, 'kind'>[], completedSlots: boolean[]) {
  const training = plan.map((p, i) => ({ p, i })).filter(({ p }) => p.kind !== 'delayed');
  const done = training.filter(({ i }) => completedSlots[i]).length;
  return { counted: training.length > 0 && done === training.length, done, total: training.length };
}
