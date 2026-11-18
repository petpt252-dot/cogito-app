import type { Lang } from '../core/types';
import type { StudyItem } from '../core/scoring';
import type { Story } from '../core/story';
import { normalize } from '../core/text';
import * as wEn from './words.en';
import * as wPt from './words.pt';
import * as sEn from './stories.en';
import * as sPt from './stories.pt';

// Language-specific banks live in separate files; this module gives every item a language-neutral id
// ("misc:12", "cat:fruit:3", "asm:40", …) so results, exposure tracking and scoring survive a language switch.

export const WORDS = { en: wEn, pt: wPt } as const;
export const STORIES = { en: sEn.stories, pt: sPt.stories } as const;
export const EVENTS = { en: sEn.events, pt: sPt.events } as const;

export const CATEGORY_KEYS = Object.keys(wEn.categories);

export type Pool = 'misc' | 'asm' | 'eff' | 'cat';

function lookup(id: string, lang: Lang): string {
  const parts = id.split(':');
  const w = WORDS[lang];
  if (parts[0] === 'cat') return w.categories[parts[1]][Number(parts[2])];
  const i = Number(parts[1]);
  if (parts[0] === 'misc') return w.misc[i];
  if (parts[0] === 'asm') return w.assessment[i];
  if (parts[0] === 'eff') return w.efficiency[i];
  throw new Error(`Unknown word id ${id}`);
}

export function wordText(id: string, lang: Lang): string {
  return lookup(id, lang);
}

export function wordItem(id: string): StudyItem {
  const parts = id.split(':');
  return { id, forms: [lookup(id, 'en'), lookup(id, 'pt')], category: parts[0] === 'cat' ? parts[1] : undefined };
}

export function poolIds(pool: Exclude<Pool, 'cat'>): string[] {
  const src = pool === 'misc' ? wEn.misc : pool === 'asm' ? wEn.assessment : wEn.efficiency;
  return src.map((_, i) => `${pool}:${i}`);
}

export function categoryIds(cat: string): string[] {
  return wEn.categories[cat].map((_, i) => `cat:${cat}:${i}`);
}

/** Every word in both languages, normalised. Used to stop typo tolerance turning one real word into another. */
export const LEXICON: Set<string> = new Set(
  (['en', 'pt'] as const).flatMap((l) => {
    const w = WORDS[l];
    return [...Object.values(w.categories).flat(), ...w.misc, ...w.assessment, ...w.efficiency].map(normalize);
  }),
);

export function story(id: string, lang: Lang): Story {
  const s = STORIES[lang].find((x) => x.id === id);
  if (!s) throw new Error(`Unknown story ${id}`);
  return s;
}

/** Assessment form layout: 24 reserved words per form → 12 list words + 6 cue–target pairs. */
export const ASSESSMENT_FORMS = 4;

export function assessmentForm(form: number) {
  const base = (form % ASSESSMENT_FORMS) * 24;
  const ids = Array.from({ length: 24 }, (_, i) => `asm:${base + i}`);
  const list = ids.slice(0, 12);
  const pairIds = ids.slice(12);
  const pairs = Array.from({ length: 6 }, (_, i) => ({ cue: pairIds[i * 2], target: pairIds[i * 2 + 1] }));
  return { list, pairs };
}

export function efficiencyList(variant: number): string[] {
  const base = (variant % 2) * 12;
  return Array.from({ length: 12 }, (_, i) => `eff:${base + i}`);
}
