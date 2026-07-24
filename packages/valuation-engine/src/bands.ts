/**
 * {{BRAND_NAME}} — Valuation Engine
 * Renovated $/sqft bands (§4.5).
 *
 * "Renovated $/sqft bands built from renovated comps ONLY, split by percentile:
 *  Light ≈35th, Medium ≈55th, Luxury ≈85th (tunable per market)."
 *
 * Bands are computed on weighted comp $/sqft so a close, recent, same-size comp
 * moves the band more than a distant, stale, mismatched one.
 */

import type { Band, Tier, WeightedComp } from './types.ts';
import { TIERS } from './types.ts';
import type { MarketConfig } from './config.ts';
import { weightedPercentile, percentile } from './math.ts';

/** Build the three renovated $/sqft bands from renovated comps. */
export function buildBands(
  renovatedComps: WeightedComp[],
  cfg: MarketConfig,
): Record<Tier, Band> {
  const values = renovatedComps.map((c) => c.pricePerSqft);
  const weights = renovatedComps.map((c) => c.weight);

  const out = {} as Record<Tier, Band>;
  for (const tier of TIERS) {
    const p = cfg.bandPercentiles[tier];
    const pps = weightedPercentile(values, weights, p);
    out[tier] = { tier, percentile: p, pricePerSqft: pps };
  }
  // Bands must be monotonic non-decreasing across tiers even if the weighted
  // percentiles cross on a thin/degenerate comp set.
  enforceMonotonic(out);
  return out;
}

/** The neighborhood ceiling $/sqft used to cap ARV (§4.5). */
export function ceilingPricePerSqft(
  renovatedComps: WeightedComp[],
  cfg: MarketConfig,
): number {
  const values = renovatedComps.map((c) => c.pricePerSqft);
  const weights = renovatedComps.map((c) => c.weight);
  const base = weightedPercentile(values, weights, cfg.ceilingPercentile);
  return base * cfg.ceilingOvershoot;
}

/** Unweighted median renovated $/sqft, for the report's "Area price/sqft". */
export function renovatedMedianPricePerSqft(renovatedComps: WeightedComp[]): number {
  return percentile(renovatedComps.map((c) => c.pricePerSqft), 0.5);
}

function enforceMonotonic(bands: Record<Tier, Band>): void {
  for (let i = 1; i < TIERS.length; i++) {
    const prev = bands[TIERS[i - 1]];
    const cur = bands[TIERS[i]];
    if (cur.pricePerSqft < prev.pricePerSqft) {
      cur.pricePerSqft = prev.pricePerSqft;
    }
  }
}
