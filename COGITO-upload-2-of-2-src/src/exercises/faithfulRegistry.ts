import type { ComponentType } from 'react';
import type { ExerciseId } from '../core/types';
import type { ExProps } from './types';
import { withHiddenGuard } from './guard';
import { AlphaSpanOriginal, FribbleCompare, MaskedCrt, NBackFaithful, StringCompareFaithful } from './faithful';

// Components that replace the adaptive ones in the COGITO-faithful protocol. G1, G2, G3 and G5 keep their
// component and switch to the study's sizes, timings and rules through ctx.faithful.
// Timed tasks stop (unsaved) if the window is hidden, as the adaptive versions do.
export const FAITHFUL_COMPONENTS: Partial<Record<ExerciseId, ComponentType<ExProps>>> = {
  G4: withHiddenGuard(AlphaSpanOriginal),
  G6: withHiddenGuard(NBackFaithful),
  P1: withHiddenGuard(MaskedCrt),
  P2: withHiddenGuard(MaskedCrt),
  P3: withHiddenGuard(MaskedCrt),
  P4: withHiddenGuard(StringCompareFaithful),
  P5: withHiddenGuard(StringCompareFaithful),
  P6: withHiddenGuard(FribbleCompare),
};
