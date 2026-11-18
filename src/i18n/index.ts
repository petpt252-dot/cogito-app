import { createContext, useContext } from 'react';
import type { Lang } from '../core/types';
import { en, type Dict } from './en';
import { pt } from './pt';

export const DICTS: Record<Lang, Dict> = { en, pt };
export const LANG_NAMES: Record<Lang, string> = { en: 'English', pt: 'Português (PT)' };

function resolve(dict: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict);
}

export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const v = resolve(DICTS[lang], key) ?? resolve(en, key);
  if (typeof v !== 'string') return key;
  return vars ? v.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : v;
}

export function translateList(lang: Lang, key: string): string[] {
  const v = resolve(DICTS[lang], key) ?? resolve(en, key);
  return Array.isArray(v) ? (v as string[]) : [];
}

export interface I18n {
  lang: Lang;
  t: (key: string, vars?: Vars) => string;
  tl: (key: string) => string[];
}

export function makeI18n(lang: Lang): I18n {
  return { lang, t: (k, v) => translate(lang, k, v), tl: (k) => translateList(lang, k) };
}

export const I18nContext = createContext<I18n>(makeI18n('en'));

export function useI18n(): I18n {
  return useContext(I18nContext);
}
