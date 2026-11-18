import { useApp } from '../state';
import { DEFAULT_SETTINGS } from '../core/types';

/** The two answer keys (lower case) chosen in Settings; F and J by default. */
export function useAnswerKeys(): { left: string; right: string } {
  const k = useApp().settings.answerKeys ?? DEFAULT_SETTINGS.answerKeys;
  const left = (k.left || 'f').toLowerCase();
  const right = (k.right || 'j').toLowerCase();
  return left === right ? DEFAULT_SETTINGS.answerKeys : { left, right };
}

/** A key is usable as an answer key if it is a single letter or digit, not P (pause) and not Enter/Space. */
export const isAnswerKey = (k: string) => /^[a-z0-9]$/i.test(k) && k.toLowerCase() !== 'p';
