/**
 * ValueProof — Valuation Engine
 * Domain types. This is the shared vocabulary for the whole engine.
 *
 * Positioning rule (see build brief §10): this produces an AUTOMATED VALUATION,
 * never an "appraisal." Types and fields must never use "appraisal"/"appraised".
 */

/** The three rehab / finish tiers, always shown together in a report (§3). */
export type Tier = 'light' | 'medium' | 'high';

export const TIERS: readonly Tier[] = ['light', 'medium', 'high'];

/** Comparable-sale radius bands, widened tightest-first (§4.5). */
export type RadiusMiles = 2 | 3 | 5;

export const RADII: readonly RadiusMiles[] = [2, 3, 5];

/**
 * Condition score from the Vision/condition engine (§4.1, §7 engine 1).
 * 1 = distressed / gut, 3 = average livable, 5 = fully renovated / turnkey.
 * Fractional values allowed (e.g. 2.5). Drives the As-Is ConditionFactor.
 */
export type ConditionScore = number;

/** A single comparable sale, normalized by the Property Data Hub (§7). */
export interface Comp {
  id: string;
  address: string;
  /** Gross living area, square feet. */
  sqft: number;
  /** Recorded closed sale price, USD. */
  salePrice: number;
  /** ISO date of close, e.g. "2026-05-14". */
  saleDate: string;
  /** Straight-line distance from subject, miles. */
  distanceMiles: number;
  /**
   * Whether this comp sold in renovated/updated condition. Renovated bands are
   * built from renovated comps ONLY (§4.5). If unknown, treat as false.
   */
  renovated: boolean;
  /** Provenance link for the report's "each links to source" requirement (§3). */
  sourceUrl?: string;
  /** Optional pre-computed condition score for the comp, if the provider supplies one. */
  conditionScore?: ConditionScore;
}

/** Facts about the subject property (§3 "Property facts"). */
export interface Subject {
  address: string;
  apn?: string;
  /** Current gross living area, square feet (recorded). */
  sqft: number;
  /**
   * Finished square feet AFTER the planned scope (additions detection, §4.2).
   * Defaults to `sqft` when no additions are planned/observed.
   */
  finishedSqft?: number;
  beds?: number;
  baths?: number;
  lotSqft?: number;
  yearBuilt?: number;
  /** Observed current condition (1..5) from the Vision engine. */
  conditionScore: ConditionScore;
}

/** A provider AVM point estimate, blended into As-Is (§4.5, §6 HouseCanary). */
export interface AvmEstimate {
  /** Point value, USD. */
  value: number;
  /** Provider identifier, logged for auditability (e.g. "housecanary"). */
  provider: string;
  /** Provider's forecast standard deviation as a fraction (0.08 = 8%), if given. */
  fsd?: number;
}

/** Inputs to the deal-math / max-allowable-offer calc (§3, §4.5). */
export interface DealInputs {
  /** Contract / asking purchase price, USD. If omitted, MAO is still computed. */
  purchasePrice?: number;
  /** Holding costs for the project (taxes, insurance, utilities, loan interest), USD. */
  holdingCosts?: number;
  /** Closing + selling costs (both sides), USD. */
  closingCosts?: number;
  /** Investor's desired profit for the MAO solve, USD. */
  desiredProfit?: number;
}

/** Inputs to the rental / BRRRR income-approach value (§3, §4.5). */
export interface RentalInputs {
  /** Estimated market monthly rent, USD. */
  monthlyRent: number;
  /**
   * Annual operating expenses as a fraction of gross rent (taxes, insurance,
   * management, maintenance, vacancy). Typical 0.35–0.50. Default from config.
   */
  expenseRatio?: number;
  /** Market capitalization rate as a fraction (0.07 = 7%). Default from config. */
  capRate?: number;
}

/** Rehab scope for a tier: either a $/sqft assumption or explicit line items (§4.3). */
export interface RehabScope {
  /** Line items override the per-sqft estimate when present. */
  lineItems?: RehabLineItem[];
}

export interface RehabLineItem {
  label: string;
  /** Material/category mapped by the analyst AI, e.g. "counters", "flooring". */
  category?: string;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** A renovated $/sqft band derived from renovated comps at a percentile (§4.5). */
export interface Band {
  tier: Tier;
  /** Percentile used, 0..1 (e.g. 0.35 for Light). */
  percentile: number;
  /** Band value, USD per finished square foot. */
  pricePerSqft: number;
}

/** Confidence descriptor, expressed as a Forecast Standard Deviation % (§4.5). */
export interface Confidence {
  /** FSD as a fraction (0.12 = 12%). Lower is better. */
  fsd: number;
  /** 0..100 human-facing score (100 = tightest). Monotonic inverse of fsd. */
  score: number;
  /** Number of comps that fed the estimate. */
  compCount: number;
  /** Coefficient of variation of the comp $/sqft used. */
  dispersion: number;
  /** Radius the comps were drawn from. */
  radiusMiles: RadiusMiles;
  /** Plain-language note for the report (§3 "plain-language note"). */
  note: string;
}

/** Deal math for one tier (§3 "Rehab cost & deal math"). */
export interface DealMath {
  tier: Tier;
  arv: number;
  rehabBudget: number;
  holdingCosts: number;
  closingCosts: number;
  purchasePrice?: number;
  /** ARV − purchase − rehab − holding − closing. Undefined if no purchase price. */
  projectedProfit?: number;
  /** Max allowable offer to hit desiredProfit, given rehab/holding/closing. */
  maxAllowableOffer: number;
  /** Classic 70%-rule MAO for cross-check: 0.70·ARV − rehab. */
  seventyRuleOffer: number;
}

/** Rental / BRRRR income value (§3). */
export interface RentalValue {
  monthlyRent: number;
  /** Annual net operating income, USD. */
  noi: number;
  capRate: number;
  /** Income-approach value = NOI / capRate. */
  incomeValue: number;
  /** Gross rent multiplier cross-check value. */
  grmValue: number;
  grm: number;
}

/** Result of comp selection at the chosen radius (§4.5 radius widening). */
export interface CompSelection {
  radiusMiles: RadiusMiles;
  /** Renovated comps used to build ARV bands. */
  renovatedComps: WeightedComp[];
  /** All comps within the radius, used for As-Is area $/sqft. */
  allComps: WeightedComp[];
  /** True if we had to widen past 2mi because tighter rings were too sparse. */
  widened: boolean;
}

export interface WeightedComp extends Comp {
  /** Match weight 0..1 for the report's "match weighting" column (§3). */
  weight: number;
  /** Derived $/sqft = salePrice / sqft. */
  pricePerSqft: number;
}

/** The full valuation record (§8 `Valuation` entity). */
export interface Valuation {
  subject: Subject;
  /** As-Is value, USD. */
  asIs: number;
  /** ARV per tier, USD. */
  arv: Record<Tier, number>;
  /** Neighborhood ceiling $/sqft that caps ARV (§4.5). */
  ceilingPricePerSqft: number;
  bands: Record<Tier, Band>;
  confidence: Confidence;
  radiusMiles: RadiusMiles;
  /** Area $/sqft medians for the report (§3 "Area price/sqft"). */
  areaPricePerSqft: {
    asIsMedian: number;
    renovatedMedian: number;
  };
  compSelection: CompSelection;
  rehab: Record<Tier, number>;
  deal: Record<Tier, DealMath>;
  rental?: RentalValue;
  /** Audit trail: which inputs produced this value (§10 auditability). */
  audit: {
    avmProvider?: string;
    avmValue?: number;
    conditionScore: ConditionScore;
    conditionFactor: number;
    compCountRenovated: number;
    compCountAll: number;
    generatedNote: string;
  };
}
