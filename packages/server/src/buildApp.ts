/**
 * {{BRAND_NAME}} — Server (composition root)
 * Wires every package into one running Api, driven by config:
 *   - stores: Postgres when DATABASE_URL is set, else in-memory (dev)
 *   - data:   ATTOM/HouseCanary when keys are present, else the mock provider
 *   - vision/render/publish: stubs today (§4.1/§4.4) — real impls plug in here
 *
 * This is the ONLY place the packages are assembled. Everything below it stays
 * decoupled and independently testable.
 */

import {
  Orchestrator,
  EventBus,
  WebhookDispatcher,
  InMemoryJobStore,
  buildDefaultStages,
  fetchHttpPost,
} from '../../orchestration/src/index.ts';
import type { JobStore } from '../../orchestration/src/index.ts';
import {
  PropertyDataHub,
  MockProvider,
  AttomProvider,
  HouseCanaryProvider,
} from '../../connectors/src/index.ts';
import { Api } from '../../api/src/index.ts';
import type { AppDeps } from '../../api/src/index.ts';
import {
  InMemoryApiKeyStore,
  InMemoryMeterStore,
  InMemoryWatchStore,
  InMemoryCaptureSessionStore,
  InMemoryScopeStore,
  hashSecret,
} from '../../api/src/index.ts';
import type {
  ApiKeyStore,
  MeterStore,
  WatchStore,
  CaptureSessionStore,
  ScopeStore,
} from '../../api/src/index.ts';
import type { ServerConfig } from './config.ts';
import { hasRealProviders } from './config.ts';
import { parseSeedKey } from './seed.ts';
import { ConditionScorer } from '../../vision/src/index.ts';

export interface StoresBundle {
  jobStore: JobStore;
  apiKeys: ApiKeyStore;
  meter: MeterStore;
  watches: WatchStore;
  captures: CaptureSessionStore;
  scopes: ScopeStore;
}

export interface BuiltApp {
  api: Api;
  orchestrator: Orchestrator;
  events: EventBus;
  webhooks: WebhookDispatcher;
  stores: StoresBundle;
  mode: { storage: 'postgres' | 'memory'; data: 'live' | 'mock' };
  dispose: () => Promise<void>;
}

export async function buildApp(cfg: ServerConfig): Promise<BuiltApp> {
  const { stores, storage, dispose } = await buildStores(cfg);
  const hub = buildHub(cfg);
  const data = hasRealProviders(cfg) ? 'live' : 'mock';

  const events = new EventBus();
  const webhooks = new WebhookDispatcher({ http: fetchHttpPost, maxAttempts: cfg.webhookMaxAttempts });
  events.subscribe(webhooks.handler);

  const stages = buildDefaultStages({
    hub,
    // §4.1 Vision: condition scoring from captured media via Claude.
    // When ANTHROPIC_API_KEY is set, uses Claude Sonnet vision to score photos.
    // Otherwise, callers pass conditionScore in the request (else default 3).
    vision: cfg.anthropicApiKey
      ? new ConditionScorer({
          apiKey: cfg.anthropicApiKey,
          model: cfg.visionModel,
        }).visionHandler()
      : undefined,
    // §4.4 Renders: real impl calls a render/staging API.
    render: undefined,
    // §4.x Publish: persist the report and return its URL. HTML is already
    // stored in the job (context.reportHtml); this yields a canonical link.
    publish: async (jobId) => `${cfg.reportsBaseUrl}/${jobId}.html`,
  });

  const orchestrator = new Orchestrator({ store: stores.jobStore, events, stages });

  const deps: AppDeps = {
    orchestrator,
    jobStore: stores.jobStore,
    apiKeys: stores.apiKeys,
    meter: stores.meter,
    watches: stores.watches,
    captures: stores.captures,
    scopes: stores.scopes,
    webhooks,
    captureBaseUrl: cfg.captureBaseUrl,
  };

  return {
    api: new Api(deps),
    orchestrator,
    events,
    webhooks,
    stores,
    mode: { storage, data },
    dispose,
  };
}

function buildHub(cfg: ServerConfig): PropertyDataHub {
  if (hasRealProviders(cfg)) {
    const propertyProviders = [new AttomProvider({ apiKey: cfg.attomApiKey! })];
    const avmProviders =
      cfg.houseCanaryApiKey && cfg.houseCanarySecret
        ? [new HouseCanaryProvider({ apiKey: cfg.houseCanaryApiKey, apiSecret: cfg.houseCanarySecret })]
        : [];
    // ATTOM parcel/permits could be added here as ParcelProvider/PermitsProvider.
    return new PropertyDataHub({ propertyProviders, avmProviders });
  }
  // Dev / no-keys: everything from the deterministic mock.
  const mock = new MockProvider();
  return new PropertyDataHub({
    propertyProviders: [mock],
    avmProviders: [mock],
    parcelProvider: mock,
    permitsProvider: mock,
  });
}

async function buildStores(
  cfg: ServerConfig,
): Promise<{ stores: StoresBundle; storage: 'postgres' | 'memory'; dispose: () => Promise<void> }> {
  if (cfg.databaseUrl) {
    // Dynamic import keeps the `pg` driver out of the load path unless a DB is
    // actually configured (in-memory/dev + tests never touch pg).
    const { createPgClient } = await import('../../persistence/src/pgClient.ts');
    const { createPgStores, migrate } = await import('../../persistence/src/index.ts');
    const db = createPgClient({ connectionString: cfg.databaseUrl, ssl: cfg.databaseSsl });
    if (cfg.migrateOnBoot) await migrate(db);
    const stores = createPgStores(db) as unknown as StoresBundle;
    if (cfg.seedApiKey) await seedPgKey(db, cfg.seedApiKey);
    return { stores, storage: 'postgres', dispose: async () => {} };
  }

  // In-memory (dev only).
  const apiKeys = new InMemoryApiKeyStore();
  if (cfg.seedApiKey) {
    const parsed = parseSeedKey(cfg.seedApiKey);
    if (parsed) {
      apiKeys.addKey({
        keyId: parsed.keyId,
        secret: parsed.secret,
        accountId: 'acct_seed',
        plan: 'partner',
        scopes: ['*'],
        active: true,
      });
    }
  }
  const stores: StoresBundle = {
    jobStore: new InMemoryJobStore(),
    apiKeys,
    meter: new InMemoryMeterStore(),
    watches: new InMemoryWatchStore(),
    captures: new InMemoryCaptureSessionStore(),
    scopes: new InMemoryScopeStore(),
  };
  return { stores, storage: 'memory', dispose: async () => {} };
}

/** Insert a seed account + hashed API key into Postgres (idempotent). */
async function seedPgKey(db: { query: (t: string, p?: readonly unknown[]) => Promise<unknown> }, fullKey: string): Promise<void> {
  const parsed = parseSeedKey(fullKey);
  if (!parsed) return;
  const now = Date.now();
  await db.query(
    `INSERT INTO accounts (id, plan, created_at) VALUES ($1, 'partner', $2) ON CONFLICT (id) DO NOTHING`,
    ['acct_seed', now],
  );
  await db.query(
    `INSERT INTO api_keys (key_id, secret_hash, account_id, plan, scopes, active, created_at)
     VALUES ($1, $2, 'acct_seed', 'partner', ARRAY['*'], TRUE, $3)
     ON CONFLICT (key_id) DO NOTHING`,
    [parsed.keyId, hashSecret(parsed.secret), now],
  );
}
