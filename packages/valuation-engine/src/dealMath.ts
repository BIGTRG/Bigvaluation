/**
 * ValueProof — Valuation Engine
 * Deal math (§3, §4.5).
 *
 *   projectedProfit = ARV − purchase − rehab − holding − closing
 *   maxAllowableOffer = ARV − rehab − holding − closing − desiredProfit
 *   seventyRuleOffer  = 0.70·ARV − rehab   (classic investor cross-check)
 *
 * MAO is the offer that still clears the investor's desired profit given the
 * costs; the 70% rule is a coarser sanity check shown alongside it.
 */

import type { DealInputs, DealMath, Tier } from './types.ts';
import { TIERS } from './types.ts';
import type { MarketConfig } from './config.ts';

export function dealMathForTier(
  tier: Tier,
  arv: number,
  rehab: number,
  inputs: DealInputs,
  cfg: MarketConfig,
): DealMath {
  const holding = Math.max(0, inputs.holdingCosts ?? 0);
  const closing = Math.max(0, inputs.closingCosts ?? 0);
  const desiredProfit = inputs.desiredProfit ?? cfg.deal.defaultDesiredProfit;

  const maxAllowableOffer = arv - rehab - holding - closing - desiredProfit;
  const seventyRuleOffer = cfg.deal.seventyRuleFraction * arv - rehab;

  let projectedProfit: number | undefined;
  if (inputs.purchasePrice !== undefined) {
    projectedProfit = arv - inputs.purchasePrice - rehab - holding - closing;
  }

  return {
    tier,
    arv,
    rehabBudget: rehab,
    holdingCosts: holding,
    closingCosts: closing,
    purchasePrice: inputs.purchasePrice,
    projectedProfit,
    maxAllowableOffer,
    seventyRuleOffer,
  };
}

export function dealMathAllTiers(
  arv: Record<Tier, number>,
  rehab: Record<Tier, number>,
  inputs: DealInputs,
  cfg: MarketConfig,
): Record<Tier, DealMath> {
  const out = {} as Record<Tier, DealMath>;
  for (const tier of TIERS) {
    out[tier] = dealMathForTier(tier, arv[tier], rehab[tier], inputs, cfg);
  }
  return out;
}
