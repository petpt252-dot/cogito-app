// Text normalisation used by recall scoring. Diacritics are stripped so "maçã" == "maca",
// which keeps scoring robust for PT-PT keyboard input without accepting different words.

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Typo tolerance: one edit allowed for words of 5+ characters, none for shorter words. */
export function fuzzyEqual(input: string, target: string, tolerance = true): boolean {
  const a = normalize(input);
  const b = normalize(target);
  if (a === b) return true;
  if (!tolerance || b.length < 5) return false;
  return levenshtein(a, b) <= 1;
}

/** Split a free-recall response box into individual entries (newlines, commas, semicolons). */
export function splitEntries(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
