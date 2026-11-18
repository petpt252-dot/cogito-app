import type { Lang } from './types';
import { createRng, type Rng } from './rng';
import { WORDS } from '../content';

// X1 Posner mixed-rule task (after the "Posner Mixed Task" of posner.pages.dev, itself built on Posner's letter-
// matching paradigm). Two stimuli appear side by side with a cue naming the rule for this trial; the answer is
// "same" or "different" under that rule, before a time limit set by the level. Rules switch from trial to trial,
// so the task trains rapid semantic lookup and rule switching. Training only: not part of any COGITO protocol.
//
// Changes from the original: real physical vs name identity (in Posner's paradigm "A a" is the same name but
// a different physical form), bilingual content, 10+ pairs per relational rule and "different" pairs drawn at
// random (the original always paired the same items, so they could be memorised).

export type PosnerRule =
  | 'meaning'
  | 'physical'
  | 'name'
  | 'category'
  | 'partWhole'
  | 'functional'
  | 'color'
  | 'antonyms'
  | 'actionObject'
  | 'crossSum'
  | 'modulo'
  | 'oddEven'
  | 'prime';

export const CLASSIC_RULES: PosnerRule[] = ['meaning', 'physical', 'name'];
export const ALL_RULES: PosnerRule[] = ['meaning', 'physical', 'name', 'category', 'partWhole', 'functional', 'color', 'antonyms', 'actionObject', 'crossSum', 'modulo', 'oddEven', 'prime'];

/** Levels as on the original site; the answer window is max(120, 1300 − 80 × level) ms. */
export const POSNER_LEVELS = [1, 2, 3, 4, 5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 17, 18, 19, 20];
export const posnerWindowMs = (level: number) => Math.max(120, Math.round(1300 - 80 * level));
export const POSNER_ITI_MS = 520;
export const POSNER_TRIALS = 32;
/** Share of trials shown in red with the rule inverted (when inversion is on), as on the original site. */
export const INVERSION_RATE = 0.22;

export function levelStep(level: number, dir: 'up' | 'down'): number {
  const i = POSNER_LEVELS.indexOf(level);
  const idx = i === -1 ? 0 : i;
  if (dir === 'up') return idx < POSNER_LEVELS.length - 1 ? POSNER_LEVELS[idx + 1] : level + 1;
  return idx > 0 ? POSNER_LEVELS[idx - 1] : level;
}

// ---------- content (EN, PT) ----------

type Pair = [string, string];
type Bi = { en: Pair; pt: Pair };
const bi = (en: Pair, pt: Pair): Bi => ({ en, pt });

const PART_WHOLE: Bi[] = [
  bi(['WHEEL', 'BICYCLE'], ['RODA', 'BICICLETA']),
  bi(['BRANCH', 'TREE'], ['RAMO', 'ÁRVORE']),
  bi(['PAGE', 'BOOK'], ['PÁGINA', 'LIVRO']),
  bi(['PETAL', 'FLOWER'], ['PÉTALA', 'FLOR']),
  bi(['KEY', 'KEYBOARD'], ['TECLA', 'TECLADO']),
  bi(['LENS', 'CAMERA'], ['OBJETIVA', 'CÂMARA']),
  bi(['FINGER', 'HAND'], ['DEDO', 'MÃO']),
  bi(['CHIMNEY', 'HOUSE'], ['CHAMINÉ', 'CASA']),
  bi(['MAST', 'SHIP'], ['MASTRO', 'NAVIO']),
  bi(['STRING', 'GUITAR'], ['CORDA', 'GUITARRA']),
  bi(['FEATHER', 'BIRD'], ['PENA', 'PÁSSARO']),
  bi(['HINGE', 'DOOR'], ['DOBRADIÇA', 'PORTA']),
  bi(['SCREEN', 'PHONE'], ['ECRÃ', 'TELEMÓVEL']),
  bi(['YOLK', 'EGG'], ['GEMA', 'OVO']),
  bi(['BLADE', 'KNIFE'], ['LÂMINA', 'FACA']),
  bi(['SLEEVE', 'SHIRT'], ['MANGA', 'CAMISA']),
];

const FUNCTIONAL: Bi[] = [
  bi(['KEY', 'LOCK'], ['CHAVE', 'FECHADURA']),
  bi(['PEN', 'PAPER'], ['CANETA', 'PAPEL']),
  bi(['NEEDLE', 'THREAD'], ['AGULHA', 'LINHA']),
  bi(['HAMMER', 'NAIL'], ['MARTELO', 'PREGO']),
  bi(['BOW', 'ARROW'], ['ARCO', 'FLECHA']),
  bi(['TOOTHBRUSH', 'TOOTHPASTE'], ['ESCOVA', 'PASTA DE DENTES']),
  bi(['CUP', 'SAUCER'], ['CHÁVENA', 'PIRES']),
  bi(['SCREW', 'SCREWDRIVER'], ['PARAFUSO', 'CHAVE DE FENDAS']),
  bi(['SHOE', 'SOCK'], ['SAPATO', 'MEIA']),
  bi(['BUCKET', 'SPADE'], ['BALDE', 'PÁ']),
  bi(['LIGHT BULB', 'LAMP'], ['LÂMPADA', 'CANDEEIRO']),
  bi(['PADLOCK', 'CHAIN'], ['CADEADO', 'CORRENTE']),
];

const ANTONYMS: Bi[] = [
  bi(['HOT', 'COLD'], ['QUENTE', 'FRIO']),
  bi(['FAST', 'SLOW'], ['RÁPIDO', 'LENTO']),
  bi(['RICH', 'POOR'], ['RICO', 'POBRE']),
  bi(['TALL', 'SHORT'], ['ALTO', 'BAIXO']),
  bi(['BIG', 'SMALL'], ['GRANDE', 'PEQUENO']),
  bi(['OPEN', 'CLOSED'], ['ABERTO', 'FECHADO']),
  bi(['FULL', 'EMPTY'], ['CHEIO', 'VAZIO']),
  bi(['HARD', 'SOFT'], ['DURO', 'MOLE']),
  bi(['WET', 'DRY'], ['MOLHADO', 'SECO']),
  bi(['EARLY', 'LATE'], ['CEDO', 'TARDE']),
  bi(['STRONG', 'WEAK'], ['FORTE', 'FRACO']),
  bi(['CLEAN', 'DIRTY'], ['LIMPO', 'SUJO']),
];

const ACTION_OBJECT: Bi[] = [
  bi(['DRINK', 'WATER'], ['BEBER', 'ÁGUA']),
  bi(['READ', 'BOOK'], ['LER', 'LIVRO']),
  bi(['DRIVE', 'CAR'], ['CONDUZIR', 'CARRO']),
  bi(['SWEEP', 'FLOOR'], ['VARRER', 'CHÃO']),
  bi(['PLAY', 'PIANO'], ['TOCAR', 'PIANO']),
  bi(['CLIMB', 'LADDER'], ['SUBIR', 'ESCADA']),
  bi(['KNIT', 'SCARF'], ['TRICOTAR', 'CACHECOL']),
  bi(['SHARPEN', 'PENCIL'], ['AFIAR', 'LÁPIS']),
  bi(['WATER', 'PLANT'], ['REGAR', 'PLANTA']),
  bi(['BLOW OUT', 'CANDLE'], ['APAGAR', 'VELA']),
  bi(['PEEL', 'ORANGE'], ['DESCASCAR', 'LARANJA']),
];

const COLORS: { en: string; pt: string; items: Pair[] }[] = [
  { en: 'RED', pt: 'VERMELHO', items: [['TOMATO', 'TOMATE'], ['STRAWBERRY', 'MORANGO'], ['BLOOD', 'SANGUE'], ['CHERRY', 'CEREJA']] },
  { en: 'YELLOW', pt: 'AMARELO', items: [['LEMON', 'LIMÃO'], ['BANANA', 'BANANA'], ['SUN', 'SOL'], ['CORN', 'MILHO']] },
  { en: 'GREEN', pt: 'VERDE', items: [['GRASS', 'RELVA'], ['FROG', 'RÃ'], ['LETTUCE', 'ALFACE'], ['CUCUMBER', 'PEPINO']] },
  { en: 'WHITE', pt: 'BRANCO', items: [['SNOW', 'NEVE'], ['MILK', 'LEITE'], ['CLOUD', 'NUVEM'], ['SWAN', 'CISNE']] },
  { en: 'ORANGE', pt: 'LARANJA', items: [['CARROT', 'CENOURA'], ['PUMPKIN', 'ABÓBORA'], ['TANGERINE', 'TANGERINA'], ['APRICOT', 'ALPERCE']] },
];

const NUMBER_WORDS: Record<Lang, string[]> = {
  en: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'],
  pt: ['UM', 'DOIS', 'TRÊS', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE'],
};
const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const REM_WORDS: Record<Lang, string[]> = { en: ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'], pt: ['ZERO', 'UM', 'DOIS', 'TRÊS', 'QUATRO', 'CINCO'] };
/** Letters whose upper and lower case look different, so physical and name identity can be told apart. */
const LETTERS = ['A', 'B', 'D', 'E', 'G', 'H', 'M', 'N', 'Q', 'R'];

export const crossSum = (n: number) => String(n).split('').reduce((a, d) => a + Number(d), 0);
export function isPrime(n: number) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

export interface PosnerTrial {
  rule: PosnerRule;
  left: string;
  right: string;
  /** True answer under the rule (before inversion). */
  same: boolean;
  /** Red stimulus: the correct response is the opposite. */
  inverted: boolean;
}

/** The correct response for a trial: "same" unless exactly one of (different, inverted) holds. */
export const correctIsSame = (t: Pick<PosnerTrial, 'same' | 'inverted'>) => (t.inverted ? !t.same : t.same);

function relational(rng: Rng, pairs: Bi[], lang: Lang, same: boolean): [string, string] {
  const i = rng.int(0, pairs.length - 1);
  if (same) return pairs[i][lang];
  const j = rng.pick(pairs.map((_, k) => k).filter((k) => k !== i && pairs[k][lang][1] !== pairs[i][lang][0]));
  return [pairs[i][lang][0], pairs[j][lang][1]];
}

function twoDigit(rng: Rng, ok: (n: number) => boolean) {
  for (;;) {
    const n = rng.int(11, 99);
    if (ok(n)) return n;
  }
}

export function genPosnerTrial(rng: Rng, rule: PosnerRule, lang: Lang, inversion: boolean): PosnerTrial {
  const same = rng.next() < 0.5;
  const inverted = inversion && rng.next() < INVERSION_RATE;
  let left = '';
  let right = '';
  switch (rule) {
    case 'meaning': {
      const a = rng.int(0, 8);
      const b = same ? a : rng.pick([0, 1, 2, 3, 4, 5, 6, 7, 8].filter((k) => k !== a));
      left = String(a + 1);
      right = rng.next() < 0.5 ? NUMBER_WORDS[lang][b] : ROMANS[b];
      break;
    }
    case 'physical': {
      // same = identical form; different = other case of the same letter, or another letter
      const l = rng.pick(LETTERS);
      const upper = rng.next() < 0.5;
      left = upper ? l : l.toLowerCase();
      if (same) right = left;
      else if (rng.next() < 0.5) right = upper ? l.toLowerCase() : l;
      else {
        const o = rng.pick(LETTERS.filter((x) => x !== l));
        right = rng.next() < 0.5 ? o : o.toLowerCase();
      }
      break;
    }
    case 'name': {
      const l = rng.pick(LETTERS);
      const r = same ? l : rng.pick(LETTERS.filter((x) => x !== l));
      left = rng.next() < 0.5 ? l : l.toLowerCase();
      right = rng.next() < 0.5 ? r : r.toLowerCase();
      break;
    }
    case 'category': {
      const cats = Object.keys(WORDS.en.categories);
      const c1 = rng.pick(cats);
      const c2 = same ? c1 : rng.pick(cats.filter((c) => c !== c1));
      const w = WORDS[lang].categories;
      const i = rng.int(0, w[c1].length - 1);
      let j = rng.int(0, w[c2].length - 1);
      if (same && j === i) j = (j + 1) % w[c2].length;
      left = w[c1][i].toUpperCase();
      right = w[c2][j].toUpperCase();
      break;
    }
    case 'partWhole':
      [left, right] = relational(rng, PART_WHOLE, lang, same);
      break;
    case 'functional':
      [left, right] = relational(rng, FUNCTIONAL, lang, same);
      break;
    case 'antonyms':
      [left, right] = relational(rng, ANTONYMS, lang, same);
      break;
    case 'actionObject':
      [left, right] = relational(rng, ACTION_OBJECT, lang, same);
      break;
    case 'color': {
      const c1 = rng.int(0, COLORS.length - 1);
      const c2 = same ? c1 : rng.pick(COLORS.map((_, k) => k).filter((k) => k !== c1));
      const ix = lang === 'pt' ? 1 : 0;
      const i = rng.int(0, 3);
      let j = rng.int(0, 3);
      if (same && j === i) j = (j + 1) % 4;
      left = COLORS[c1].items[i][ix];
      right = COLORS[c2].items[j][ix];
      break;
    }
    case 'crossSum': {
      // Two two-digit numbers: same digit sum? (Always two numbers, so a bare sum is never mistaken for one.)
      const n1 = same ? rng.int(11, 98) : rng.int(11, 99); // 99 is the only number with digit sum 18
      const cs = crossSum(n1);
      left = String(n1);
      right = String(twoDigit(rng, (n) => n !== n1 && (crossSum(n) === cs) === same));
      break;
    }
    case 'modulo': {
      const d = rng.int(3, 6);
      const rem = rng.int(0, d - 1);
      left = `${rng.int(2, 7) * d + rem} mod ${d}`;
      const r2 = same ? rem : (rem + rng.int(1, d - 1)) % d;
      if (rng.next() < 0.5) {
        // another expression with that remainder (its divisor must be larger than the remainder)
        const d2 = rng.int(Math.max(3, r2 + 1), 6);
        right = `${rng.int(2, 7) * d2 + r2} mod ${d2}`;
      } else right = r2 < REM_WORDS[lang].length && rng.next() < 0.5 ? REM_WORDS[lang][r2] : String(r2);
      break;
    }
    case 'oddEven': {
      const n1 = rng.int(11, 99);
      left = String(n1);
      right = String(twoDigit(rng, (n) => n !== n1 && (n % 2 === n1 % 2) === same));
      break;
    }
    case 'prime': {
      // same = both prime or both not prime
      const n1 = rng.int(11, 99);
      left = String(n1);
      right = String(twoDigit(rng, (n) => n !== n1 && (isPrime(n) === isPrime(n1)) === same));
      break;
    }
  }
  return { rule, left, right, same, inverted };
}

/** A block of trials with the rule drawn at random for each trial from the enabled set. */
export function genPosnerBlock(seed: string, rules: PosnerRule[], lang: Lang, inversion: boolean, n = POSNER_TRIALS): PosnerTrial[] {
  const rng = createRng(seed);
  const pool = rules.length ? rules : ['meaning' as PosnerRule];
  return Array.from({ length: n }, () => genPosnerTrial(rng, rng.pick(pool), lang, inversion));
}

/** Checks a trial against the rule from its content alone (used by tests). */
export function checkPosnerTrial(t: PosnerTrial, lang: Lang): boolean {
  const num = (s: string) => {
    const i = NUMBER_WORDS[lang].indexOf(s);
    if (i >= 0) return i + 1;
    const r = ROMANS.indexOf(s);
    if (r >= 0) return r + 1;
    const w = REM_WORDS[lang].indexOf(s);
    if (w >= 0) return w;
    const m = s.match(/^(\d+) mod (\d+)$/);
    if (m) return Number(m[1]) % Number(m[2]);
    return Number(s);
  };
  const inPairs = (pairs: Bi[]) => pairs.some((p) => p[lang][0] === t.left && p[lang][1] === t.right);
  switch (t.rule) {
    case 'meaning':
      return Number(t.left) === num(t.right);
    case 'physical':
      return t.left === t.right;
    case 'name':
      return t.left.toUpperCase() === t.right.toUpperCase();
    case 'category': {
      const w = WORDS[lang].categories;
      const cat = (x: string) => Object.keys(w).find((c) => w[c].some((y) => y.toUpperCase() === x));
      return cat(t.left) === cat(t.right);
    }
    case 'partWhole':
      return inPairs(PART_WHOLE);
    case 'functional':
      return inPairs(FUNCTIONAL);
    case 'antonyms':
      return inPairs(ANTONYMS);
    case 'actionObject':
      return inPairs(ACTION_OBJECT);
    case 'color': {
      const ix = lang === 'pt' ? 1 : 0;
      const col = (x: string) => COLORS.findIndex((c) => c.items.some((it) => it[ix] === x));
      return col(t.left) === col(t.right);
    }
    case 'crossSum':
      return crossSum(Number(t.left)) === crossSum(Number(t.right));
    case 'modulo':
      return num(t.left) === num(t.right);
    case 'oddEven':
      return Number(t.left) % 2 === Number(t.right) % 2;
    case 'prime':
      return isPrime(Number(t.left)) === isPrime(Number(t.right));
  }
}
