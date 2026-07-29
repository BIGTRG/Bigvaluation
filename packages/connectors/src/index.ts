/**
 * ValueProof — Connectors
 * Public API. The Property Data Hub + provider adapters that feed the valuation
 * engine. Every external vendor lives behind these interfaces (§6).
 */

export * from './types.ts';
export { PropertyDataHub, toValuationRequest, dedupeComps } from './hub.ts';
export type { HubConfig } from './hub.ts';
export {
  defaultRenovatedClassifier,
  makeRenovatedClassifier,
  DEFAULT_HEURISTIC,
} from './classify.ts';

export { fetchHttpGet, ConnectorError } from './http.ts';
export type { HttpGet, HttpJson, HttpGetOptions } from './http.ts';

// Providers
export { MockProvider, FailingProvider, SAMPLE_DATASET } from './providers/mock.ts';
export type { MockDataset } from './providers/mock.ts';
export { AttomProvider, mapSubject, mapComps } from './providers/attom.ts';
export type { AttomConfig } from './providers/attom.ts';
export { HouseCanaryProvider, mapAvm } from './providers/housecanary.ts';
export type { HouseCanaryConfig } from './providers/housecanary.ts';
