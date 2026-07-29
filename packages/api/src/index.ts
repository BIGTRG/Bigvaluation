/**
 * ValueProof — Licensing API (§9)
 * Public API surface. The HTTP service that makes the valuation platform
 * sellable and licensable: submit valuations, fetch reports, register webhooks.
 */

export * from './types.ts';
export { Api } from './app.ts';
export type { AppDeps } from './app.ts';
export { createHttpServer } from './server.ts';
export { createDemoApi } from './factory.ts';
export type { DemoApi } from './factory.ts';
export { Authenticator, hashSecret, extractKey, hasScope } from './auth.ts';
export { requireAttestation, isAttestationError, BUSINESS_PURPOSE_NOTICE } from './compliance.ts';
export type { Attestation, AttestationError } from './compliance.ts';
export { TERMS_HTML, PRIVACY_HTML } from './legal.ts';
export { WatchMonitor } from './monitor.ts';
export type { WatchMonitorOptions, WatchChangedEvent, Revaluation, TickResult } from './monitor.ts';
export { Router } from './router.ts';
export {
  InMemoryApiKeyStore,
  InMemoryMeterStore,
  InMemoryWatchStore,
  InMemoryCaptureSessionStore,
  InMemoryScopeStore,
  InMemoryMaterialAnalysisStore,
  InMemoryMaterialLinkStore,
} from './stores.ts';
