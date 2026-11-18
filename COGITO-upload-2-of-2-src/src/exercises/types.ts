import type { ExerciseId, Lang, Metrics, Mode, Params, Settings, StrategyId, DelayedProbe } from '../core/types';
import type { LevelParams } from '../core/levels';

export interface ExCtx {
  exerciseId: ExerciseId;
  seed: string;
  level: number;
  params: LevelParams;
  /** Stimulus language, frozen when the block starts. */
  lang: Lang;
  settings: Settings;
  mode: Mode;
  strategy?: StrategyId;
  /** Item ids seen recently, avoided where the pool allows. */
  recent: string[];
  /** Condition for multi-condition exercises (C3, E1, E4). */
  variant?: string;
  /** Explicit content for assessment use (bypasses seeded generation). */
  fixed?: Record<string, unknown>;
  /** COGITO-faithful protocol: study sizes, timings and rules; params come from the calibration (no adaptation). */
  faithful?: boolean;
  /** COGITO adaptive protocol: faithful tasks whose difficulty adapts after every response (core/staircase.ts). */
  staircase?: boolean;
}

export interface ReviewGroup {
  label: string;
  tone: 'ok' | 'bad' | 'warn' | 'dim';
  items: string[];
}

export interface ExOutcome {
  accuracy: number;
  metrics: Metrics;
  conditionKey: string;
  encodingMs?: number;
  itemIds?: string[];
  detail?: unknown;
  review?: ReviewGroup[];
  params?: Params;
  /** Material to schedule for delayed recall. */
  probe?: { kind: DelayedProbe['kind']; payload: unknown; exerciseId?: ExerciseId };
}

export interface ExProps {
  ctx: ExCtx;
  onDone: (o: ExOutcome) => void;
}
