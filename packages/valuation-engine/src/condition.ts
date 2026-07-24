/**
 * {{BRAND_NAME}} — Valuation Engine
 * ConditionFactor: maps a Vision condition score to an As-Is multiplier (§4.5).
 * Piecewise-linear interpolation over the market's condition anchors, clamped
 * to the endpoint factors outside the anchor range.
 */

import type { ConditionScore } from './types.ts';
import type { MarketConfig } from './config.ts';

export function conditionFactor(score: ConditionScore, cfg: MarketConfig): number {
  const anchors = [...cfg.conditionAnchors].sort((a, b) => a.score - b.score);
  if (anchors.length === 0) return 1;
  if (score <= anchors[0].score) return anchors[0].factor;
  const last = anchors[anchors.length - 1];
  if (score >= last.score) return last.factor;

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (score >= a.score && score <= b.score) {
      const frac = (score - a.score) / (b.score - a.score);
      return a.factor + (b.factor - a.factor) * frac;
    }
  }
  return 1;
}
