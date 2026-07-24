/**
 * {{BRAND_NAME}} — Valuation Engine
 * Comp selection: radius widening + match weighting (§4.5).
 *
 * "Pull comps tightest (2 mi) first; widen to 3 / 5 mi if sparse; show all
 * three." We select the smallest ring that clears the minimum renovated-comp
 * bar, then weight each comp by distance, recency, and size similarity.
 */

import type { Comp, WeightedComp, CompSelection, RadiusMiles } from './types.ts';
import type { MarketConfig } from './config.ts';
import { RADIUS_ORDER } from './config.ts';
import { halfLifeWeight, daysBetween } from './math.ts';

export interface SelectOptions {
  /** ISO reference date for recency weighting (the valuation "as of" date). */
  asOf: string;
}

function toWeighted(
  comp: Comp,
  subjectSqft: number,
  cfg: MarketConfig,
  asOf: string,
): WeightedComp {
  const w = cfg.weighting;
  const distW = halfLifeWeight(comp.distanceMiles, w.distanceHalfLifeMiles);
  const ageDays = Math.max(0, daysBetween(asOf, comp.saleDate));
  const recencyW = halfLifeWeight(ageDays, w.recencyHalfLifeDays);
  const sqftFracDiff = subjectSqft > 0 ? Math.abs(comp.sqft - subjectSqft) / subjectSqft : 0;
  const sizeW = halfLifeWeight(sqftFracDiff, w.sqftHalfLifeFraction);
  const weight = distW * recencyW * sizeW;
  return {
    ...comp,
    weight,
    pricePerSqft: comp.sqft > 0 ? comp.salePrice / comp.sqft : 0,
  };
}

/**
 * Select comps for a subject. Widens the radius tightest-first until enough
 * renovated comps exist to build bands (or until the 5-mi ring is exhausted).
 */
export function selectComps(
  subjectSqft: number,
  comps: Comp[],
  cfg: MarketConfig,
  opts: SelectOptions,
): CompSelection {
  let chosen: RadiusMiles = RADIUS_ORDER[RADIUS_ORDER.length - 1];
  let widened = false;

  for (let i = 0; i < RADIUS_ORDER.length; i++) {
    const r = RADIUS_ORDER[i];
    const within = comps.filter((c) => c.distanceMiles <= r);
    const renovatedCount = within.filter((c) => c.renovated).length;
    if (renovatedCount >= cfg.minRenovatedComps && within.length >= cfg.minAllComps) {
      chosen = r;
      widened = i > 0;
      break;
    }
    // Last ring: accept whatever we have rather than fail.
    if (i === RADIUS_ORDER.length - 1) {
      chosen = r;
      widened = i > 0;
    }
  }

  const within = comps.filter((c) => c.distanceMiles <= chosen);
  const allComps = within.map((c) => toWeighted(c, subjectSqft, cfg, opts.asOf));
  const renovatedComps = allComps.filter((c) => c.renovated);

  return { radiusMiles: chosen, renovatedComps, allComps, widened };
}
