/**
 * ValueProof — Scope-of-Work Studio
 * Rehab work catalog + market config.
 *
 * Every finish item belongs to a category (counters, flooring, paint, etc.)
 * and has a per-sqft cost at each tier. System repair items (roof, HVAC, etc.)
 * are condition-triggered and priced flat across tiers.
 */

import type { Tier } from '../../valuation-engine/src/types.ts';

// ---------------------------------------------------------------------------
// Finish-work catalog — tier-driven, scaled by sqft × prep multiplier
// ---------------------------------------------------------------------------

export interface FinishItem {
  label: string;
  category: string;
  /** Cost per finished sqft at each tier. */
  perSqft: Record<Tier, number>;
}

/**
 * Standard finish-work items. Each is priced per finished square foot.
 * Light = cosmetic refresh, Medium = full renovation, High = premium gut reno.
 */
export const FINISH_CATALOG: readonly FinishItem[] = [
  { label: 'Interior paint',         category: 'paint',       perSqft: { light: 1.50, medium: 2.50, high: 4.00 } },
  { label: 'Exterior paint/siding',  category: 'exterior',    perSqft: { light: 0.80, medium: 1.80, high: 3.50 } },
  { label: 'Flooring',               category: 'flooring',    perSqft: { light: 2.00, medium: 4.50, high: 8.00 } },
  { label: 'Kitchen cabinets',       category: 'kitchen',     perSqft: { light: 1.00, medium: 3.00, high: 7.00 } },
  { label: 'Kitchen countertops',    category: 'counters',    perSqft: { light: 0.60, medium: 2.00, high: 5.00 } },
  { label: 'Kitchen appliances',     category: 'appliances',  perSqft: { light: 0.50, medium: 1.20, high: 2.50 } },
  { label: 'Bathroom(s)',            category: 'bath',        perSqft: { light: 1.00, medium: 3.00, high: 6.00 } },
  { label: 'Fixtures & hardware',    category: 'fixtures',    perSqft: { light: 0.30, medium: 0.80, high: 1.50 } },
  { label: 'Trim & doors',           category: 'trim',        perSqft: { light: 0.30, medium: 1.00, high: 2.00 } },
  { label: 'Landscaping & curb',     category: 'landscape',   perSqft: { light: 0.20, medium: 0.50, high: 1.20 } },
  { label: 'Cleaning & dumpster',    category: 'cleanup',     perSqft: { light: 0.30, medium: 0.50, high: 0.80 } },
] as const;

// ---------------------------------------------------------------------------
// System repairs — condition-triggered, flat cost (same across tiers)
// ---------------------------------------------------------------------------

export interface SystemRepair {
  label: string;
  category: string;
  /** Condition score AT OR BELOW which this repair is triggered. */
  triggerAtOrBelow: number;
  /** Flat cost when triggered, USD. */
  costUsd: number;
}

/**
 * System repairs triggered by low condition scores.
 * These are major mechanicals — the cost doesn't change by finish tier,
 * only by whether the system needs replacement.
 */
export const SYSTEM_REPAIRS: readonly SystemRepair[] = [
  { label: 'Roof replacement',          category: 'roof',        triggerAtOrBelow: 2, costUsd: 8500  },
  { label: 'HVAC replacement',          category: 'hvac',        triggerAtOrBelow: 2, costUsd: 6500  },
  { label: 'Electrical panel + update', category: 'electrical',  triggerAtOrBelow: 2, costUsd: 4500  },
  { label: 'Plumbing overhaul',         category: 'plumbing',    triggerAtOrBelow: 2, costUsd: 5000  },
  { label: 'Window replacement',        category: 'windows',     triggerAtOrBelow: 2, costUsd: 5500  },
  { label: 'Foundation/structural',     category: 'structural',  triggerAtOrBelow: 1, costUsd: 12000 },
  { label: 'Exterior siding repair',    category: 'siding',      triggerAtOrBelow: 2, costUsd: 4000  },
] as const;

// ---------------------------------------------------------------------------
// Market config — soft costs, prep multipliers
// ---------------------------------------------------------------------------

export interface MarketConfig {
  /** Permit cost as a fraction of total hard costs. */
  permitRate: number;
  /** Contingency as a fraction of total hard costs. */
  contingencyRate: number;
  /**
   * Condition prep multipliers — scale finish costs based on how much
   * demo/prep work the current condition demands.
   * Key: condition score (1-5). Value: multiplier on finish line items.
   * Score 5 (turnkey) = 0.5× (minimal touch-up), Score 1 (gut) = 1.5× (full demo+prep).
   */
  conditionPrepMultiplier: Record<number, number>;
}

export const DEFAULT_MARKET_CONFIG: MarketConfig = {
  permitRate: 0.04,
  contingencyRate: 0.10,
  conditionPrepMultiplier: {
    1: 1.50,   // gut / distressed — heavy demo + prep
    2: 1.25,   // below average — significant prep
    3: 1.00,   // average — standard prep
    4: 0.75,   // good — light prep
    5: 0.50,   // turnkey — minimal touch-up
  },
};

/**
 * Interpolate a condition prep multiplier for fractional scores (e.g. 2.5).
 * Clamps to [1, 5].
 */
export function prepMultiplier(score: number, config: MarketConfig = DEFAULT_MARKET_CONFIG): number {
  const clamped = Math.max(1, Math.min(5, score));
  const lo = Math.floor(clamped);
  const hi = Math.ceil(clamped);
  if (lo === hi) return config.conditionPrepMultiplier[lo] ?? 1;
  const frac = clamped - lo;
  const loMul = config.conditionPrepMultiplier[lo] ?? 1;
  const hiMul = config.conditionPrepMultiplier[hi] ?? 1;
  return loMul + frac * (hiMul - loMul);
}
