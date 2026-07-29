/**
 * ValueProof — Connectors
 * Renovated-comp classification.
 *
 * Public records rarely state whether a sale was renovated. The AUTHORITATIVE
 * signal is MLS remarks, pulled permits (§4.2), or the analyst AI (§4.3) — those
 * providers should set `comp.renovated` directly. This default is only a
 * fallback heuristic for public-records-only data: a sale priced clearly above
 * the local median $/sqft is more likely to have been updated.
 *
 * Deliberately conservative and documented as a heuristic — do not mistake it
 * for ground truth. Wire a real MLS/permits classifier before quoting lenders.
 */

import type { Comp } from '../../valuation-engine/src/index.ts';
import type { CompClassifier } from './types.ts';

export interface HeuristicOptions {
  /** A comp above `medianPps × threshold` is treated as renovated. */
  premiumThreshold: number;
}

export const DEFAULT_HEURISTIC: HeuristicOptions = {
  premiumThreshold: 1.15,
};

export function makeRenovatedClassifier(opts: HeuristicOptions = DEFAULT_HEURISTIC): CompClassifier {
  return (comp: Comp, ctx) => {
    if (comp.sqft <= 0 || ctx.medianPricePerSqft <= 0) return false;
    const pps = comp.salePrice / comp.sqft;
    return pps >= ctx.medianPricePerSqft * opts.premiumThreshold;
  };
}

export const defaultRenovatedClassifier: CompClassifier = makeRenovatedClassifier();
