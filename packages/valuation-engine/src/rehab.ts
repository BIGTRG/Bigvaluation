/**
 * {{BRAND_NAME}} — Valuation Engine
 * Rehab budgeting (§3 "Rehab cost & deal math").
 *
 * Line items (from the Scope-of-Work Studio, §4.3) win when present; otherwise
 * fall back to the market's regional $/sqft for the tier. Every tier always
 * returns a budget so the report can show Light / Medium / High side by side.
 */

import type { RehabScope, Tier } from './types.ts';
import { TIERS } from './types.ts';
import type { MarketConfig } from './config.ts';

export function rehabBudget(
  sqft: number,
  tier: Tier,
  cfg: MarketConfig,
  scope?: RehabScope,
): number {
  if (scope?.lineItems && scope.lineItems.length > 0) {
    return scope.lineItems.reduce((sum, li) => sum + Math.max(0, li.costUsd), 0);
  }
  return sqft * cfg.rehabPerSqft[tier];
}

/** Budgets for all three tiers. `scopes` may override any individual tier. */
export function rehabBudgets(
  sqft: number,
  cfg: MarketConfig,
  scopes?: Partial<Record<Tier, RehabScope>>,
): Record<Tier, number> {
  const out = {} as Record<Tier, number>;
  for (const tier of TIERS) {
    out[tier] = rehabBudget(sqft, tier, cfg, scopes?.[tier]);
  }
  return out;
}
