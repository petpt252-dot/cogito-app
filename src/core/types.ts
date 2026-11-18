export type Lang = 'en' | 'pt';

/** 'reasoning' is used only by the untrained transfer battery, never by training exercises. */
export type Domain = 'verbal' | 'visual' | 'associative' | 'narrative' | 'working' | 'speed' | 'reasoning';

export type ExerciseId =
  | 'A1' | 'A2' | 'A3'
  | 'B1' | 'B2' | 'B3'
  | 'C1' | 'C2' | 'C3'
  | 'D1' | 'D2' | 'D3'
  | 'E1' | 'E2' | 'E3' | 'E4'
  // COGITO-inspired memory and working-memory tasks
  | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6'
  // COGITO-inspired perceptual-speed tasks
  | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6'
  // extra training tasks, outside every protocol (Training Modules only)
  | 'X1';

/** Session protocol: original Memory Lab, the Memory Lab + COGITO hybrid, or a COGITO-inspired all-12-task session. */
export type Protocol = 'memorylab' | 'hybrid' | 'cogito' | 'faithful' | 'adaptive';

/** How hybrid sessions distribute time: episodic-memory focus, or broad (more working memory and speed). */
export type TrainingGoal = 'episodic' | 'broad';

export type StrategyId = 'imagery' | 'elaboration' | 'clustering' | 'loci' | 'retrieval';

export type Mode = 'training' | 'assessment' | 'strategy' | 'free';

export type Metrics = Record<string, number | null>;

export type Params = Record<string, number | string | boolean>;

/** One completed block of one exercise. This is the unit of storage, adaptation and analytics. */
export interface TrialResult {
  id: string;
  /** 'F' = strategy practice, 'T' = untrained transfer test. */
  exerciseId: ExerciseId | 'F' | 'T';
  domain: Domain;
  mode: Mode;
  sessionId?: string;
  assessmentId?: string;
  seed: string;
  /** Language of the stimuli (frozen when the block starts; UI language may change independently). */
  lang: Lang;
  startedAt: number;
  endedAt: number;
  level: number;
  params: Params;
  /** Normalised 0..1 score used by the adaptive algorithm. */
  accuracy: number;
  metrics: Metrics;
  /** Identifies equivalent task conditions; only results with equal keys are compared (e.g. Encoding Efficiency). */
  conditionKey: string;
  encodingMs?: number;
  delayed?: boolean;
  strategy?: StrategyId;
  itemIds?: string[];
  detail?: unknown;
}

export interface SessionRecord {
  id: string;
  seed: string;
  startedAt: number;
  endedAt?: number;
  plannedMinutes: number;
  programDay?: number;
  trialIds: string[];
  completed: boolean;
  /** Ended without a block in every training component: kept, but not counted towards the programme. */
  partial?: boolean;
  /** Saved as the session goes, so an interrupted session can be resumed: its plan and how far it got. */
  plan?: import('./protocol').PlanSlot[];
  slot?: number;
  slotDone?: boolean[];
  slotBlocks?: number[];
  /** Block time played per timed slot (ms), so a resumed slot continues with the time it had left. */
  slotUsedMs?: number[];
  /** Protocol the session was planned with; a resumed session keeps its rules even if the setting changed. */
  protocol?: Protocol;
  /** COGITO adaptive: each task's level when the session began, for the end-of-session summary. */
  stairStart?: Partial<Record<ExerciseId, number>>;
}

export type AssessmentKind = 'baseline' | 'reassessment' | 'fixed' | 'transfer' | 'near';

export type AssessmentTestKey =
  | 'immediateVerbal'
  | 'visualRecognition'
  | 'visualReconstruction'
  | 'associative'
  | 'wmSpan'
  | 'delayedVerbal'
  // untrained transfer tests (formats never practised in training)
  | 'symbolDigit'
  | 'series'
  | 'corsi'
  // COGITO-style near transfer (untrained variants of the practised working-memory tasks)
  | 'animalSpan'
  | 'numeric3back'
  | 'spatialUpdating';

export interface AssessmentRecord {
  id: string;
  kind: AssessmentKind;
  form: number;
  seed: string;
  lang: Lang;
  startedAt: number;
  endedAt?: number;
  /** Training sessions completed when this assessment started. */
  sessionIndex: number;
  results: Partial<Record<AssessmentTestKey, Metrics>>;
  /** Step reached, so an interrupted assessment can be resumed. */
  step: number;
  /** When each test ended (ms epoch), so the delayed-recall interval is measured from the end of the immediate test. */
  stepEndedAt?: Partial<Record<AssessmentTestKey, number>>;
  completed: boolean;
}

export interface AdaptiveState {
  /** Exercise id, optionally with a condition suffix (e.g. "E1:backward"), so each condition adapts independently. */
  exerciseId: string;
  level: number;
  /** Accuracies of the blocks completed at the current level (most recent last). */
  history: number[];
  updatedAt: number;
}

export interface DelayedProbe {
  id: string;
  exerciseId: ExerciseId;
  kind: 'wordList' | 'story' | 'spaced';
  sessionId?: string;
  createdAt: number;
  dueAt: number;
  lang: Lang;
  payload: unknown;
  sourceTrialId: string;
  done: boolean;
  /** Optional next-day recall of a session's material, scheduled only when the user asks for it. */
  overnight?: boolean;
}

export interface Thresholds {
  up: number;
  down: number;
  blocks: number;
}

export interface Settings {
  lang: Lang;
  sessionMinutes: number;
  customMinutes: number;
  daysPerWeek: number;
  thresholds: Thresholds;
  secondsPerWord: number;
  typoTolerance: boolean;
  nbackStimMs: number;
  nbackIsiMs: number;
  audio: boolean;
  delayedRecall: boolean;
  includeWorkingMemory: boolean;
  reducedMotion: boolean;
  minDelayMinutes: number;
  protocol: Protocol;
  goal: TrainingGoal;
  /** Keys for the two answers in two-choice tasks (speed, alpha span, 3-back). */
  answerKeys: { left: string; right: string };
  /** Short sound after an error in the speed tasks. */
  errorSound: boolean;
  /** COGITO and faithful protocols: the study's fixed blocks (true) or timed parts adding up to the chosen length. */
  studyDose: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  sessionMinutes: 60, // COGITO's daily dose (~1 h); shorter lengths available
  customMinutes: 25,
  daysPerWeek: 5,
  thresholds: { up: 0.85, down: 0.6, blocks: 2 },
  secondsPerWord: 2,
  typoTolerance: true,
  nbackStimMs: 500,
  nbackIsiMs: 2500,
  audio: true,
  delayedRecall: true,
  includeWorkingMemory: false,
  reducedMotion: false,
  minDelayMinutes: 5,
  protocol: 'adaptive', // recommended: COGITO tasks, difficulty adapting after every answer
  goal: 'broad',
  answerKeys: { left: 'f', right: 'j' },
  errorSound: false,
  studyDose: true,
};
