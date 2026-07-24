/**
 * {{BRAND_NAME}} — Valuation Engine
 * Market-tunable configuration.
 *
 * Everything the build brief calls "tunable per market" lives here so the IP
 * (the math) stays fixed while calibration moves per ZIP/metro. The accuracy
 * engine (§4.6) backtests against closed loans and writes new configs here.
 */

import type { Tier, RadiusMiles } from './types.ts';

export interface MarketConfig {
  /** Human label, e.g. "Phoenix-Metro-AZ" or a ZIP. */
  market: string;

  /** Percentile (0..1) used to build each renovated $/sqft band (§4.5). */
  bandPercentiles: Record<Tier, number>;

  /**
   * As-Is ConditionFactor anchors, mapping condition score → multiplier applied
   * to area As-Is $/sqft (§4.5). Interpolated linearly between anchors and
   * clamped to the endpoints. 3.0 (average) must map to ~1.0.
   */
  conditionAnchors: { score: number; factor: number }[];

  /** Weight on the comp-derived As-Is vs. the provider AVM. 0.5 = 50/50 (§4.5). */
  asIsCompWeight: number;

  /**
   * Neighborhood ceiling: ARV(scope) is capped at this percentile of renovated
   * comp $/sqft, times `ceilingOvershoot` (§4.5 "ceiling × 1.05").
   */
  ceilingPercentile: number;
  ceilingOvershoot: number;

  /** Minimum renovated comps required before a radius ring is "enough" (§4.5). */
  minRenovatedComps: number;
  /** Minimum total comps required to trust the As-Is area $/sqft. */
  minAllComps: number;

  /** Regional rehab $/sqft by tier, used when a scope has no line items (§3). */
  rehabPerSqft: Record<Tier, number>;

  /** Comp match-weighting half-lives for the exponential weighting. */
  weighting: {
    /** Distance (miles) at which a comp's distance-weight halves. */
    distanceHalfLifeMiles: number;
    /** Age (days) at which a comp's recency-weight halves. */
    recencyHalfLifeDays: number;
    /** Fractional sqft difference at which the size-weight halves. */
    sqftHalfLifeFraction: number;
  };

  /**
   * Confidence (FSD) model coefficients (§4.5). FSD is built as the standard
   * error of the ARV estimate — dispersion/√n — with a prior on dispersion so a
   * thin comp set can never masquerade as tight. Plus recency and radius terms.
   */
  confidence: {
    /** Baseline FSD floor (best achievable), fraction. */
    floor: number;
    /** Baseline FSD ceiling (worst), fraction. */
    cap: number;
    /** Assumed neighborhood $/sqft spread (CV) when comps can't establish it. */
    priorCv: number;
    /** Pseudo-count for the dispersion prior; higher = trust the prior longer. */
    priorStrength: number;
    /** Weight on the standard-error term (dispersion/√n). */
    seWeight: number;
    /** Days of average comp age that add `recencyWeight` of FSD. */
    recencyDays: number;
    /** FSD added when average comp age equals `recencyDays`. */
    recencyWeight: number;
    /** Extra FSD added per mile of radius beyond the tightest ring. */
    radiusPenaltyPerMile: number;
  };

  /** Rental / BRRRR defaults (§4.5). */
  rental: {
    expenseRatio: number;
    capRate: number;
  };

  /** Deal-math defaults. */
  deal: {
    /** Default desired profit for MAO solve if the caller gives none, USD. */
    defaultDesiredProfit: number;
    /** Fraction of ARV used by the 70%-rule cross-check. */
    seventyRuleFraction: number;
  };
}

/**
 * Reference defaults. Calibrate per market before launch (§11 "lock Phase-1
 * valuation logic in 2–3 home markets"). These are deliberately generic.
 */
export const DEFAULT_CONFIG: MarketConfig = {
  market: 'DEFAULT',
  bandPercentiles: { light: 0.35, medium: 0.55, high: 0.85 },
  conditionAnchors: [
    { score: 1, factor: 0.72 },
    { score: 2, factor: 0.86 },
    { score: 3, factor: 1.0 },
    { score: 4, factor: 1.08 },
    { score: 5, factor: 1.14 },
  ],
  asIsCompWeight: 0.5,
  ceilingPercentile: 0.95,
  ceilingOvershoot: 1.05,
  minRenovatedComps: 4,
  minAllComps: 5,
  rehabPerSqft: { light: 25, medium: 55, high: 110 },
  weighting: {
    distanceHalfLifeMiles: 1.5,
    recencyHalfLifeDays: 180,
    sqftHalfLifeFraction: 0.2,
  },
  confidence: {
    floor: 0.05,
    cap: 0.35,
    priorCv: 0.15,
    priorStrength: 3,
    seWeight: 1.0,
    recencyDays: 365,
    recencyWeight: 0.05,
    radiusPenaltyPerMile: 0.012,
  },
  rental: {
    expenseRatio: 0.45,
    capRate: 0.07,
  },
  deal: {
    defaultDesiredProfit: 30000,
    seventyRuleFraction: 0.7,
  },
};

/** Merge a partial override onto DEFAULT_CONFIG (shallow-per-section). */
export function resolveConfig(overrides?: DeepPartial<MarketConfig>): MarketConfig {
  if (!overrides) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    bandPercentiles: { ...DEFAULT_CONFIG.bandPercentiles, ...overrides.bandPercentiles },
    conditionAnchors: overrides.conditionAnchors ?? DEFAULT_CONFIG.conditionAnchors,
    rehabPerSqft: { ...DEFAULT_CONFIG.rehabPerSqft, ...overrides.rehabPerSqft },
    weighting: { ...DEFAULT_CONFIG.weighting, ...overrides.weighting },
    confidence: { ...DEFAULT_CONFIG.confidence, ...overrides.confidence },
    rental: { ...DEFAULT_CONFIG.rental, ...overrides.rental },
    deal: { ...DEFAULT_CONFIG.deal, ...overrides.deal },
  } as MarketConfig;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const RADIUS_ORDER: readonly RadiusMiles[] = [2, 3, 5];
