/**
 * {{BRAND_NAME}} — Server (composition root)
 * Environment configuration. One place that reads process.env and produces a
 * typed config; nothing else in the server touches env directly.
 */

export interface ServerConfig {
  port: number;
  /** When set, use Postgres; otherwise in-memory stores (dev only). */
  databaseUrl?: string;
  databaseSsl: boolean;
  migrateOnBoot: boolean;

  /** Real data providers — when absent, the server runs on the mock provider. */
  attomApiKey?: string;
  houseCanaryApiKey?: string;
  houseCanarySecret?: string;

  /** Anthropic API key for Vision condition scoring (§4.1). */
  anthropicApiKey?: string;
  /** Claude model for vision scoring. Default: claude-sonnet-4-20250514. */
  visionModel?: string;

  /** Web app session signing secret. Unset = web app disabled. */
  sessionSecret?: string;
  /**
   * Mark session cookies Secure (HTTPS-only). Default false: browsers drop
   * Secure cookies on plain-HTTP origins, which breaks login until TLS is in
   * front. Set SECURE_COOKIES=1 once the app is served over HTTPS.
   */
  secureCookies: boolean;

  /** Stripe billing (§5). All four set = billing routes enabled. */
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePriceReport?: string;
  stripePriceProMonthly?: string;
  /** Where Checkout returns the buyer (web app base URL). */
  billingReturnUrl: string;

  /** Render/staging vendor (§4.4). Both set = renders enabled. */
  renderApiUrl?: string;
  renderApiKey?: string;

  /** Gotenberg base URL for PDF reports (§3). Unset = PDF disabled. */
  gotenbergUrl?: string;

  /** Watch monitoring sweep interval, ms (§5.3). 0 = disabled. */
  watchIntervalMs: number;
  /** Relative value move that fires watch.changed. Default 0.02 (2%). */
  watchChangeThreshold: number;

  /** Base URLs used in generated links. */
  captureBaseUrl: string;
  /** Public base URL of the web app — used for borrower send-a-link SOW URLs. */
  appBaseUrl: string;
  reportsBaseUrl: string;

  /**
   * A full API key (`fmk_<keyId>.<secret>`) to seed on boot for dev/first-run.
   * In production, provision keys out of band; leave this unset.
   */
  seedApiKey?: string;

  webhookMaxAttempts: number;
  /** 'production' hardens behavior (no mock fallback, seed warnings). */
  nodeEnv: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: intEnv(env.PORT, 8787),
    databaseUrl: strEnv(env.DATABASE_URL),
    databaseSsl: boolEnv(env.PGSSL, false),
    migrateOnBoot: boolEnv(env.MIGRATE_ON_BOOT, false),

    attomApiKey: strEnv(env.ATTOM_API_KEY),
    houseCanaryApiKey: strEnv(env.HOUSECANARY_API_KEY),
    houseCanarySecret: strEnv(env.HOUSECANARY_API_SECRET),

    anthropicApiKey: strEnv(env.ANTHROPIC_API_KEY),
    visionModel: strEnv(env.VISION_MODEL),

    sessionSecret: strEnv(env.SESSION_SECRET),
    secureCookies: boolEnv(env.SECURE_COOKIES, false),

    stripeSecretKey: strEnv(env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: strEnv(env.STRIPE_WEBHOOK_SECRET),
    stripePriceReport: strEnv(env.STRIPE_PRICE_REPORT),
    stripePriceProMonthly: strEnv(env.STRIPE_PRICE_PRO_MONTHLY),
    billingReturnUrl: strEnv(env.BILLING_RETURN_URL) ?? 'https://{{BRAND_DOMAIN}}/billing',

    renderApiUrl: strEnv(env.RENDER_API_URL),
    renderApiKey: strEnv(env.RENDER_API_KEY),

    gotenbergUrl: strEnv(env.GOTENBERG_URL),

    watchIntervalMs: intEnv(env.WATCH_INTERVAL_MS, 0),
    watchChangeThreshold: floatEnv(env.WATCH_CHANGE_THRESHOLD, 0.02),

    captureBaseUrl: strEnv(env.CAPTURE_BASE_URL) ?? 'https://capture.example.com',
    appBaseUrl: strEnv(env.APP_BASE_URL) ?? 'https://{{BRAND_DOMAIN}}',
    reportsBaseUrl: strEnv(env.REPORTS_BASE_URL) ?? 'https://reports.example.com',

    seedApiKey: strEnv(env.SEED_API_KEY),
    webhookMaxAttempts: intEnv(env.WEBHOOK_MAX_ATTEMPTS, 3),
    nodeEnv: strEnv(env.NODE_ENV) ?? 'development',
  };
}

/** True when real property data is configured (else the server uses the mock). */
export function hasRealProviders(cfg: ServerConfig): boolean {
  return Boolean(cfg.attomApiKey);
}

function strEnv(v: string | undefined): string | undefined {
  const s = v?.trim();
  return s && s.length > 0 ? s : undefined;
}
function intEnv(v: string | undefined, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? Math.trunc(n) : dflt;
}
function floatEnv(v: string | undefined, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : dflt;
}
function boolEnv(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined) return dflt;
  return /^(1|true|yes|on)$/i.test(v.trim());
}
