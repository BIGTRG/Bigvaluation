/**
 * {{BRAND_NAME}} — Valuation Engine
 * Dependency-free statistical primitives. Every value in a report ultimately
 * traces back through these, so they are kept small and individually tested.
 */

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population standard deviation. */
export function stddev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

/** Coefficient of variation = stddev / mean. 0 when mean is 0. */
export function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return 0;
  return stddev(xs) / m;
}

/**
 * Percentile with linear interpolation between closest ranks (type-7, the
 * NumPy/Excel default). `p` is a fraction in [0,1]. Empty input returns 0.
 */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  if (xs.length === 1) return xs[0];
  const sorted = [...xs].sort((a, b) => a - b);
  const pp = clamp(p, 0, 1);
  const rank = pp * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

export function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

/**
 * Weighted median via linear interpolation on the cumulative weight at 0.5.
 * Preferred over the plain median when comps carry match weights.
 */
export function weightedMedian(values: number[], weights: number[]): number {
  return weightedPercentile(values, weights, 0.5);
}

/**
 * Weighted percentile. Sorts by value, walks the normalized cumulative weight,
 * and interpolates at the target fraction. Falls back to the unweighted
 * percentile when all weights are zero.
 */
export function weightedPercentile(values: number[], weights: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (totalW <= 0) return percentile(values, p);

  // Drop zero-weight points so we never interpolate toward a value carrying no
  // mass, then sort by value.
  const pairs = values
    .map((v, i) => ({ v, w: weights[i] }))
    .filter((pr) => pr.w > 0)
    .sort((a, b) => a.v - b.v);
  if (pairs.length === 0) return percentile(values, p);
  if (pairs.length === 1) return pairs[0].v;

  // Cumulative-midpoint plotting positions (the wquantiles convention): each
  // point sits at the middle of its weight slab. Interpolate value vs position.
  let cum = 0;
  const pos = pairs.map((pr) => {
    const mid = cum + pr.w / 2;
    cum += pr.w;
    return mid / totalW;
  });

  const target = clamp(p, 0, 1);
  if (target <= pos[0]) return pairs[0].v;
  if (target >= pos[pos.length - 1]) return pairs[pairs.length - 1].v;
  for (let i = 1; i < pos.length; i++) {
    if (target <= pos[i]) {
      const frac = (target - pos[i - 1]) / (pos[i] - pos[i - 1]);
      return pairs[i - 1].v + (pairs[i].v - pairs[i - 1].v) * frac;
    }
  }
  return pairs[pairs.length - 1].v;
}

/** Whole days between two ISO dates (a - b), non-negative-safe for ordering. */
export function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return (a - b) / 86_400_000;
}

/** Exponential decay weight in (0,1]: 1 at delta 0, 0.5 at `halfLife`. */
export function halfLifeWeight(delta: number, halfLife: number): number {
  if (halfLife <= 0) return delta <= 0 ? 1 : 0;
  const d = Math.abs(delta);
  return Math.pow(0.5, d / halfLife);
}

export function round(x: number, dp = 0): number {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}

/** Round to the nearest $500 — how headline values are presented in reports. */
export function roundMoney(x: number, nearest = 500): number {
  if (nearest <= 0) return Math.round(x);
  return Math.round(x / nearest) * nearest;
}
