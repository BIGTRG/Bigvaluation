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
import { WatchMonitor } from '../../api/src/index.ts';
import type { Watch, PdfRenderer } from '../../api/src/index.ts';
import { GotenbergPdfRenderer } from './pdf.ts';
import { RenderService, HttpRenderProvider, toReportRenders } from '../../render/src/index.ts';
import { StripeClient, BillingService, InMemoryBillingStore } from '../../billing/src/index.ts';
import { WebApp } from '../../webapp/src/index.ts';
import type { BillingStore } from '../../billing/src/index.ts';
import type { RenderTier } from '../../render/src/index.ts';

export interface StoresBundle {
  jobStore: JobStore;
  apiKeys: ApiKeyStore;
  meter: MeterStore;
  watches: WatchStore;
  captures: CaptureSessionStore;
  scopes: ScopeStore;
  /** Billing plan state (§5); present with Postgres, in-memory otherwise. */
  billing?: BillingStore;
}

export interface BuiltApp {
  api: Api;
  orchestrator: Orchestrator;
  events: EventBus;
  webhooks: WebhookDispatcher;
  stores: StoresBundle;
  /** Live valuation monitoring (§5.3); main.ts runs it on WATCH_INTERVAL_MS. */
  monitor: WatchMonitor;
  /** Customer dashboard; mounted at /app when SESSION_SECRET is set. */
  webapp?: WebApp;
  mode: { storage: 'postgres' | 'memory'; data: 'live' | 'mock'; pdf: 'gotenberg' | 'off'; render: 'http' | 'off'; billing: 'stripe' | 'off'; webapp: 'on' | 'off' };
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
    // §4.4 Renders: dual-layer (renovate + stage) via the swappable connector.
    // Enabled when RENDER_API_URL + RENDER_API_KEY are set and the job carries
    // captured photos; desk valuations skip it (visualize is best-effort).
    render: cfg.renderApiUrl && cfg.renderApiKey
      ? (() => {
          const service = new RenderService({
            provider: new HttpRenderProvider({ baseUrl: cfg.renderApiUrl, apiKey: cfg.renderApiKey }),
            log: (msg) => console.warn(`[render] ${msg}`),
          });
          return async (_valuation: unknown, _asOf: string, input?: Record<string, unknown>) => {
            const photos = Array.isArray(input?.photos)
              ? (input.photos as { room: string; url: string }[]).filter((p) => p?.room && p?.url)
              : [];
            if (photos.length === 0) return {};
            const tier = (typeof input?.renderTier === 'string' ? input.renderTier : 'medium') as RenderTier;
            const materials = Array.isArray(input?.materials)
              ? (input.materials as { label: string }[])
              : undefined;
            const rooms = await service.renderAll({ photos, tier, materials });
            return toReportRenders(rooms, tier);
          };
        })()
      : undefined,
    // §4.x Publish: persist the report and return its URL. HTML is already
    // stored in the job (context.reportHtml); this yields a canonical link.
    publish: async (jobId) => `${cfg.reportsBaseUrl}/${jobId}.html`,
  });

  const orchestrator = new Orchestrator({ store: stores.jobStore, events, stages });

  // §5 Stripe billing — optional; routes 409 until keys + prices are set.
  const billingConfigured =
    cfg.stripeSecretKey && cfg.stripeWebhookSecret && cfg.stripePriceReport && cfg.stripePriceProMonthly;
  const billing = billingConfigured
    ? {
        service: new BillingService({
          stripe: new StripeClient({ secretKey: cfg.stripeSecretKey! }),
          store: stores.billing ?? new InMemoryBillingStore(),
          prices: { report: cfg.stripePriceReport!, proMonthly: cfg.stripePriceProMonthly! },
          successUrl: `${cfg.billingReturnUrl}/success`,
          cancelUrl: `${cfg.billingReturnUrl}/cancel`,
          log: (msg) => console.log(`[billing] ${msg}`),
        }),
        webhookSecret: cfg.stripeWebhookSecret!,
      }
    : undefined;

  // §3 branded PDF — optional Gotenberg connector.
  const pdf: PdfRenderer | undefined = cfg.gotenbergUrl
    ? new GotenbergPdfRenderer({ url: cfg.gotenbergUrl })
    : undefined;

  const deps: AppDeps = {
    orchestrator,
    jobStore: stores.jobStore,
    apiKeys: stores.apiKeys,
    meter: stores.meter,
    watches: stores.watches,
    captures: stores.captures,
    scopes: stores.scopes,
    webhooks,
    pdf,
    billing,
    captureBaseUrl: cfg.captureBaseUrl,
  };

  // §5.3 live monitoring — re-values watches and fires watch.changed.
  const monitor = new WatchMonitor({
    watches: stores.watches,
    revalue: async (watch: Watch) => {
      const job = await orchestrator.execute({
        subject: watch.subject,
        attestation: watch.attestation,
        accountId: watch.accountId,
      });
      if (job.status === 'failed') throw new Error(job.error ?? 'revaluation failed');
      const v = job.context.valuation as { asIs: number; arv: Record<string, number> };
      return { valuationId: job.id, asIs: v.asIs, arv: v.arv.medium };
    },
    notify: async (url, event) => {
      await fetchHttpPost(url, event as unknown as Record<string, unknown>);
    },
    changeThreshold: cfg.watchChangeThreshold,
    log: (msg) => console.warn(`[watch-monitor] ${msg}`),
  });

  const api = new Api(deps);

  // Customer web app — thin shell over the API (same auth path, same gates).
  const webapp = cfg.sessionSecret
    ? new WebApp({ api, sessionSecret: cfg.sessionSecret, secureCookies: cfg.nodeEnv === 'production' })
    : undefined;

  return {
    api,
    orchestrator,
    events,
    webhooks,
    stores,
    monitor,
    webapp,
    mode: { storage, data, pdf: pdf ? 'gotenberg' : 'off', render: cfg.renderApiUrl && cfg.renderApiKey ? 'http' : 'off', billing: billing ? 'stripe' : 'off', webapp: webapp ? 'on' : 'off' },
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
    billing: new InMemoryBillingStore(),
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
