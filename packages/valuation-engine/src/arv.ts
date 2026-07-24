/**
 * {{BRAND_NAME}} — Valuation Engine
 * After-Repair Value per tier (§4.5).
 *
 * ARV(scope) = FinishedSqFt × Band $/sqft, capped at neighborhood ceiling × 1.05.
 * The cap is applied on $/sqft (ceilingPricePerSqft already folds in the ×1.05),
 * so a hot band can't push a value above what the neighborhood has ever paid.
 */

import type { Band, Tier } from './types.ts';
import { TIERS } from './types.ts';

export interface ArvResult {
  arv: Record<Tier, number>;
  /** True per tier when the ceiling cap bound the value. */
  capped: Record<Tier, boolean>;
}

export function computeArv(
  finishedSqft: number,
  bands: Record<Tier, Band>,
  ceilingPps: number,
): ArvResult {
  const arv = {} as Record<Tier, number>;
  const capped = {} as Record<Tier, boolean>;

  for (const tier of TIERS) {
    const bandPps = bands[tier].pricePerSqft;
    const effectivePps = ceilingPps > 0 ? Math.min(bandPps, ceilingPps) : bandPps;
    capped[tier] = ceilingPps > 0 && bandPps > ceilingPps;
    arv[tier] = finishedSqft * effectivePps;
  }
  return { arv, capped };
}
