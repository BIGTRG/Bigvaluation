/**
 * ValueProof — Valuation Engine
 * As-Is value (§4.5).
 *
 * As-Is = SqFt × (Area As-Is $/sqft × ConditionFactor), blended ~50/50 with a
 * provider AVM. The AVM leg is omitted (weight collapses to the comp leg) when
 * no AVM is supplied, so the engine still returns a value on public data alone.
 */

import type { AvmEstimate, WeightedComp } from './types.ts';
import type { MarketConfig } from './config.ts';
import { weightedMedian } from './math.ts';

/** Area As-Is $/sqft: weighted median $/sqft across ALL comps in the ring. */
export function areaAsIsPricePerSqft(allComps: WeightedComp[]): number {
  return weightedMedian(
    allComps.map((c) => c.pricePerSqft),
    allComps.map((c) => c.weight),
  );
}

export interface AsIsResult {
  value: number;
  compLeg: number;
  avmLeg?: number;
  areaAsIsPricePerSqft: number;
}

export function computeAsIs(
  subjectSqft: number,
  allComps: WeightedComp[],
  conditionFactorValue: number,
  cfg: MarketConfig,
  avm?: AvmEstimate,
): AsIsResult {
  const areaPps = areaAsIsPricePerSqft(allComps);
  const compLeg = subjectSqft * areaPps * conditionFactorValue;

  if (!avm || avm.value <= 0) {
    return { value: compLeg, compLeg, areaAsIsPricePerSqft: areaPps };
  }

  const w = Math.min(1, Math.max(0, cfg.asIsCompWeight));
  const value = compLeg * w + avm.value * (1 - w);
  return { value, compLeg, avmLeg: avm.value, areaAsIsPricePerSqft: areaPps };
}
