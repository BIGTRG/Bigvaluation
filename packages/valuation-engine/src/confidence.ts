/**
 * {{BRAND_NAME}} — Valuation Engine
 * Confidence as a Forecast Standard Deviation % (§4.5):
 *   FSD = f(comp count, $/sqft dispersion, recency, radius)
 *
 * We build FSD additively from independent penalties, then clamp into
 * [floor, cap]. Lower FSD = tighter estimate. A 0..100 human score is the
 * inverse. This is intentionally transparent so a lender can audit why a number
 * carries the confidence it does.
 */

import type { Confidence, RadiusMiles, WeightedComp } from './types.ts';
import type { MarketConfig } from './config.ts';
import { clamp, coefficientOfVariation, daysBetween, mean } from './math.ts';

export function computeConfidence(
  renovatedComps: WeightedComp[],
  radiusMiles: RadiusMiles,
  asOf: string,
  cfg: MarketConfig,
): Confidence {
  const c = cfg.confidence;
  const values = renovatedComps.map((r) => r.pricePerSqft);
  const compCount = renovatedComps.length;
  const dispersion = coefficientOfVariation(values);

  // --- Dispersion with a prior. A single comp has observed CV 0, which would
  // wrongly read as certainty, so blend the observed CV toward a neighborhood
  // prior with strength `priorStrength`. Small n leans on the prior.
  const blendedCv =
    (dispersion * compCount + c.priorCv * c.priorStrength) / (compCount + c.priorStrength);

  // --- Standard error of the estimate: dispersion / √n. This is the dominant
  // term and is what makes "more comps" strictly better, all else equal.
  const standardError = blendedCv / Math.sqrt(Math.max(compCount, 0.5));
  const seTerm = c.seWeight * standardError;

  // --- Penalty from stale comps: mean age vs recencyDays.
  const ages = renovatedComps.map((r) => Math.max(0, daysBetween(asOf, r.saleDate)));
  const avgAge = ages.length ? mean(ages) : c.recencyDays;
  const recencyPenalty = (avgAge / c.recencyDays) * c.recencyWeight;

  // --- Penalty from having to widen the radius (2mi tightest → no penalty).
  const radiusPenalty = Math.max(0, radiusMiles - 2) * c.radiusPenaltyPerMile;

  const raw = c.floor + seTerm + recencyPenalty + radiusPenalty;
  const fsd = clamp(raw, c.floor, c.cap);

  // Map FSD → 0..100 score across the configured [floor, cap] range.
  const score = Math.round(clamp((1 - (fsd - c.floor) / (c.cap - c.floor)) * 100, 0, 100));

  return {
    fsd,
    score,
    compCount,
    dispersion,
    radiusMiles,
    note: buildNote(compCount, dispersion, radiusMiles, avgAge, fsd),
  };
}

function buildNote(
  compCount: number,
  dispersion: number,
  radius: RadiusMiles,
  avgAgeDays: number,
  fsd: number,
): string {
  const parts: string[] = [];
  parts.push(`${compCount} renovated comp${compCount === 1 ? '' : 's'} within ${radius} mi`);
  parts.push(`price spread ${(dispersion * 100).toFixed(0)}%`);
  parts.push(`avg sale age ${Math.round(avgAgeDays)} days`);
  const band =
    fsd <= 0.09 ? 'high confidence' : fsd <= 0.18 ? 'moderate confidence' : 'wide range — treat as indicative';
  return `${band} (FSD ${(fsd * 100).toFixed(0)}%): ${parts.join(', ')}.`;
}
