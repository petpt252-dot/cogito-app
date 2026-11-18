// Signal-detection and summary statistics.

/** Inverse standard normal CDF (rational approximation by P. J. Acklam, |error| < 1.15e-9). */
export function probit(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError('probit requires 0 < p < 1');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export type SdtCounts = { hits: number; misses: number; falseAlarms: number; correctRejections: number };

export type SdtResult = {
  hitRate: number;
  falseAlarmRate: number;
  /** Raw d' — null when a hit or false-alarm rate is 0 or 1 (mathematically undefined). */
  dPrime: number | null;
  /** Log-linear corrected d' (Hautus, 1995): always defined, reported separately and labelled as corrected. */
  dPrimeCorrected: number;
  criterion: number | null;
};

export function sdt(c: SdtCounts): SdtResult {
  const nSignal = c.hits + c.misses;
  const nNoise = c.falseAlarms + c.correctRejections;
  const hitRate = nSignal ? c.hits / nSignal : 0;
  const falseAlarmRate = nNoise ? c.falseAlarms / nNoise : 0;
  const defined = nSignal > 0 && nNoise > 0 && hitRate > 0 && hitRate < 1 && falseAlarmRate > 0 && falseAlarmRate < 1;
  const dPrime = defined ? probit(hitRate) - probit(falseAlarmRate) : null;
  const criterion = defined ? -0.5 * (probit(hitRate) + probit(falseAlarmRate)) : null;
  const hc = (c.hits + 0.5) / (nSignal + 1);
  const fc = (c.falseAlarms + 0.5) / (nNoise + 1);
  return { hitRate, falseAlarmRate, dPrime, dPrimeCorrected: probit(hc) - probit(fc), criterion };
}

/**
 * Adjusted Ratio of Clustering (Roenker, Thompson & Brown, 1971).
 * `output` is the sequence of category labels of correctly recalled items, in output order.
 * Returns null when undefined. 1 = perfect clustering, 0 = chance-level clustering.
 */
export function arcScore(output: string[]): number | null {
  const n = output.length;
  if (n < 2) return null;
  const counts = new Map<string, number>();
  output.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  const k = counts.size;
  let r = 0;
  for (let i = 1; i < n; i++) if (output[i] === output[i - 1]) r++;
  const expected = [...counts.values()].reduce((s, m) => s + m * m, 0) / n - 1;
  const max = n - k;
  if (max - expected === 0) return null;
  return (r - expected) / (max - expected);
}

/** Proportion of item pairs placed in the correct relative order (0..1). Items missing from the response are ignored. */
export function pairwiseOrderScore(truth: string[], response: string[]): number {
  const pos = new Map(response.map((id, i) => [id, i]));
  const items = truth.filter((id) => pos.has(id));
  let pairs = 0;
  let concordant = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      pairs++;
      if ((pos.get(items[i]) as number) < (pos.get(items[j]) as number)) concordant++;
    }
  return pairs ? concordant / pairs : 0;
}

/** Proportion of serial positions exactly correct. */
export function serialPositionScore(truth: string[], response: string[]): number {
  if (!truth.length) return 0;
  let ok = 0;
  truth.forEach((t, i) => {
    if (response[i] === t) ok++;
  });
  return ok / truth.length;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
