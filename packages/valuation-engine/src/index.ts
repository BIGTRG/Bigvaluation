/**
 * ValueProof — Valuation Engine
 * Public API surface. Consumers (report builder, orchestration API, licensing
 * API §9) import from here only.
 */

export * from './types.ts';
export { DEFAULT_CONFIG, resolveConfig } from './config.ts';
export type { MarketConfig, DeepPartial } from './config.ts';
export { computeValuation, NOT_AN_APPRAISAL } from './engine.ts';
export type { ValuationRequest } from './engine.ts';

// Lower-level building blocks, exported for calibration tooling and the
// accuracy engine (§4.6) that backtests against closed loans.
export { selectComps } from './comps.ts';
export { conditionFactor } from './condition.ts';
export { buildBands, ceilingPricePerSqft } from './bands.ts';
export { computeAsIs } from './asIs.ts';
export { computeArv } from './arv.ts';
export { computeConfidence } from './confidence.ts';
export { rehabBudgets } from './rehab.ts';
export { dealMathAllTiers } from './dealMath.ts';
export { computeRental } from './rental.ts';
export * as stats from './math.ts';
