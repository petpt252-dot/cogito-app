import type { ComponentType } from 'react';
import type { Domain, ExerciseId } from '../core/types';
import type { ExProps } from './types';
import { RecognitionExercise, WordListExercise } from './verbal';
import { FaceName, ObjectLocation, PairedAssociates } from './associative';
import { PatternMemory, SceneMemory, VisualSequence } from './visual';
import { DelayedNarrative, EventSequence, StoryRecall } from './narrative';
import { DigitSpan, MemoryUpdating, NBack, RunningMemory } from './working';
import { AlphaSpan, NumberNounPairs, ObjectPositionMemory, SequentialWordLearning } from './cogito';
import { SpeedExercise } from './speed';
import { PosnerMixed } from './posner';
import { withHiddenGuard } from './guard';

// Timed tasks: hiding the window stops the block instead of recording throttled timings.
const GuardedNBack = withHiddenGuard(NBack);
const GuardedSpeed = withHiddenGuard(SpeedExercise);
const GuardedPosner = withHiddenGuard(PosnerMixed);

export interface ExerciseDef {
  id: ExerciseId;
  domain: Domain;
  Component: ComponentType<ExProps>;
  /** Conditions the user can pick; each adapts independently (adaptive key `${id}:${variant}`). */
  variants?: { id: string; labelKey: string }[];
  /** Inspired by the COGITO training study (task format, not original materials). */
  cogito?: boolean;
  /** Keeps its own level inside the task (no generic block-by-block level). */
  ownLevels?: boolean;
}

export const EXERCISES: Record<ExerciseId, ExerciseDef> = {
  A1: { id: 'A1', domain: 'verbal', Component: WordListExercise },
  A2: { id: 'A2', domain: 'verbal', Component: WordListExercise },
  A3: { id: 'A3', domain: 'verbal', Component: RecognitionExercise },
  B1: { id: 'B1', domain: 'associative', Component: PairedAssociates },
  B2: { id: 'B2', domain: 'associative', Component: FaceName },
  B3: { id: 'B3', domain: 'associative', Component: ObjectLocation },
  C1: { id: 'C1', domain: 'visual', Component: PatternMemory },
  C2: { id: 'C2', domain: 'visual', Component: SceneMemory },
  C3: {
    id: 'C3',
    domain: 'visual',
    Component: VisualSequence,
    variants: [
      { id: 'item', labelKey: 'seq.conditionItem' },
      { id: 'order', labelKey: 'seq.conditionOrder' },
    ],
  },
  D1: { id: 'D1', domain: 'narrative', Component: StoryRecall },
  D2: { id: 'D2', domain: 'narrative', Component: EventSequence },
  D3: { id: 'D3', domain: 'narrative', Component: DelayedNarrative },
  E1: {
    id: 'E1',
    domain: 'working',
    Component: DigitSpan,
    variants: [
      { id: 'forward', labelKey: 'span.forward' },
      { id: 'backward', labelKey: 'span.backward' },
      { id: 'sequencing', labelKey: 'span.sequencing' },
    ],
  },
  E2: { id: 'E2', domain: 'working', Component: RunningMemory },
  E3: { id: 'E3', domain: 'working', Component: MemoryUpdating },
  E4: {
    id: 'E4',
    domain: 'working',
    Component: GuardedNBack,
    variants: [
      { id: 'spatial', labelKey: 'nback.spatial' },
      { id: 'verbal', labelKey: 'nback.verbal' },
      { id: 'dual', labelKey: 'nback.dual' },
    ],
  },
  // ---- COGITO-inspired ----
  G1: { id: 'G1', domain: 'verbal', Component: SequentialWordLearning, cogito: true },
  G2: { id: 'G2', domain: 'associative', Component: NumberNounPairs, cogito: true },
  G3: { id: 'G3', domain: 'visual', Component: ObjectPositionMemory, cogito: true },
  G4: {
    id: 'G4',
    domain: 'working',
    Component: AlphaSpan,
    cogito: true,
    variants: [
      { id: 'letters', labelKey: 'cogito.letters' },
      { id: 'words', labelKey: 'cogito.words' },
    ],
  },
  G5: { id: 'G5', domain: 'working', Component: MemoryUpdating, cogito: true },
  G6: { id: 'G6', domain: 'working', Component: GuardedNBack, cogito: true },
  P1: { id: 'P1', domain: 'speed', Component: GuardedSpeed, cogito: true },
  P2: { id: 'P2', domain: 'speed', Component: GuardedSpeed, cogito: true },
  P3: { id: 'P3', domain: 'speed', Component: GuardedSpeed, cogito: true },
  P4: { id: 'P4', domain: 'speed', Component: GuardedSpeed, cogito: true },
  P5: { id: 'P5', domain: 'speed', Component: GuardedSpeed, cogito: true },
  P6: { id: 'P6', domain: 'speed', Component: GuardedSpeed, cogito: true },
  X1: { id: 'X1', domain: 'speed', Component: GuardedPosner, ownLevels: true },
};

export const GROUPS: { key: 'A' | 'B' | 'C' | 'D' | 'E' | 'G' | 'P' | 'X'; ids: ExerciseId[] }[] = [
  { key: 'A', ids: ['A1', 'A2', 'A3'] },
  { key: 'B', ids: ['B1', 'B2', 'B3'] },
  { key: 'C', ids: ['C1', 'C2', 'C3'] },
  { key: 'D', ids: ['D1', 'D2', 'D3'] },
  { key: 'E', ids: ['E1', 'E2', 'E3', 'E4'] },
  { key: 'G', ids: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] },
  { key: 'P', ids: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] },
  { key: 'X', ids: ['X1'] },
];

export function adaptiveKey(id: ExerciseId, variant?: string) {
  return variant ? `${id}:${variant}` : id;
}

export const DOMAINS: Domain[] = ['verbal', 'visual', 'associative', 'narrative', 'working', 'speed'];
