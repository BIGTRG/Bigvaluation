/**
 * {{BRAND_NAME}} — Licensing API (§9)
 * Demo wiring: builds a fully-working API backed by in-memory stores and a
 * mock data hub, with one seeded API key. Used by the example server and tests.
 * In production, replace the in-memory stores and the MockProvider with Postgres
 * and real ATTOM/HouseCanary providers — the Api class doesn't change.
 */

import {
  Orchestrator,
  EventBus,
  WebhookDispatcher,
  InMemoryJobStore,
  buildDefaultStages,
} from '../../orchestration/src/index.ts';
import { PropertyDataHub, MockProvider } from '../../connectors/src/index.ts';
import { Api } from './app.ts';
import type { AppDeps } from './app.ts';
import {
  InMemoryApiKeyStore,
  InMemoryMeterStore,
  InMemoryWatchStore,
  InMemoryCaptureSessionStore,
  InMemoryScopeStore,
  InMemoryMaterialAnalysisStore,
  InMemoryMaterialLinkStore,
} from './stores.ts';

export interface DemoApi {
  api: Api;
  meter: InMemoryMeterStore;
  webhooks: WebhookDispatcher;
  events: EventBus;
  /** The full plaintext key to send as `Authorization: Bearer <key>`. */
  apiKey: string;
}

export interface DemoApiOptions {
  /** Deterministic clock/ids for tests. */
  clock?: { now: () => number };
  idFactory?: () => string;
  /** Stub webhook transport so nothing hits the network. */
  webhookHttp?: WebhookDispatcher['deliveries'] extends unknown ? undefined : never;
}

export function createDemoApi(opts: { clock?: { now: () => number }; idFactory?: () => string } = {}): DemoApi {
  const now = opts.clock?.now ?? (() => Date.now());

  // Data + orchestration (mock-backed, offline).
  const mock = new MockProvider();
  const hub = new PropertyDataHub({
    propertyProviders: [mock],
    avmProviders: [mock],
    parcelProvider: mock,
    permitsProvider: mock,
  });
  const stages = buildDefaultStages({
    hub,
    vision: async () => 2,
    render: async () => ({ medium: {} }),
    publish: async (jobId) => `https://reports.example.com/${jobId}.html`,
  });
  const jobStore = new InMemoryJobStore();
  const events = new EventBus();
  const webhooks = new WebhookDispatcher({ http: async () => ({ status: 200, ok: true }) });
  events.subscribe(webhooks.handler);
  const orchestrator = new Orchestrator({
    store: jobStore,
    events,
    stages,
    clock: opts.clock,
    idFactory: opts.idFactory,
  });

  // API stores + a seeded key with broad scopes.
  const apiKeys = new InMemoryApiKeyStore();
  apiKeys.addKey({
    keyId: 'demo',
    secret: 'secret123',
    accountId: 'acct_demo',
    plan: 'partner',
    scopes: ['*'],
    active: true,
  });
  const meter = new InMemoryMeterStore();

  const deps: AppDeps = {
    orchestrator,
    jobStore,
    apiKeys,
    meter,
    watches: new InMemoryWatchStore(),
    captures: new InMemoryCaptureSessionStore(),
    scopes: new InMemoryScopeStore(),
    webhooks,
    clock: opts.clock,
    idFactory: opts.idFactory,
    captureBaseUrl: 'https://capture.example.com',
    materials: {
      analyses: new InMemoryMaterialAnalysisStore(),
      links: new InMemoryMaterialLinkStore(),
      linkBaseUrl: 'https://app.example.com',
    },
  };

  return {
    api: new Api(deps),
    meter,
    webhooks,
    events,
    apiKey: 'fmk_demo.secret123',
  };
}
