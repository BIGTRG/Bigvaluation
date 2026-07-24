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

  /** Base URLs used in generated links. */
  captureBaseUrl: string;
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

    captureBaseUrl: strEnv(env.CAPTURE_BASE_URL) ?? 'https://capture.example.com',
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
function boolEnv(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined) return dflt;
  return /^(1|true|yes|on)$/i.test(v.trim());
}
