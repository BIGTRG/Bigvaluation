/**
 * {{BRAND_NAME}} — Orchestration
 * Public API. The async job pipeline (§7) that runs the five stages, retries,
 * and emits webhook events (§9), composing the engine, connectors, and report
 * builder.
 */

export * from './types.ts';
export { Orchestrator } from './orchestrator.ts';
export type { OrchestratorOptions } from './orchestrator.ts';
export {
  InMemoryJobStore,
  InMemoryJobQueue,
} from './store.ts';
export type { JobStore, JobQueue } from './store.ts';
export {
  EventBus,
  WebhookDispatcher,
  fetchHttpPost,
} from './events.ts';
export type {
  EventSubscriber,
  HttpPost,
  HttpPostResult,
  WebhookSubscription,
  WebhookDispatcherOptions,
} from './events.ts';
export { buildDefaultStages } from './pipeline.ts';
export type { PipelineDeps } from './pipeline.ts';
