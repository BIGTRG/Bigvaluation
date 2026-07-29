/**
 * ValueProof — Scope-of-Work Studio (§4.3)
 * Public API surface.
 */

export { buildScope, buildScopes, toRehabScopes } from './studio.ts';
export type { ScopeSubject, ScopeOptions, ScopeResult, ScopeLineItem } from './studio.ts';

export { formatScope, formatComparison } from './format.ts';

export {
  FINISH_CATALOG,
  SYSTEM_REPAIRS,
  DEFAULT_MARKET_CONFIG,
  prepMultiplier,
} from './catalog.ts';
export type { FinishItem, SystemRepair, MarketConfig } from './catalog.ts';
