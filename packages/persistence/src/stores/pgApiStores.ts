/**
 * ValueProof — Persistence
 * Postgres-backed implementations of the API layer's stores (§8): API keys,
 * usage metering, watches, capture sessions, scope of work. Each implements the
 * interface the API defines and depends only on SqlClient.
 */

import type {
  ApiKeyStore,
  ApiKeyRecord,
  MeterStore,
  UsageEvent,
  WatchStore,
  Watch,
  CaptureSessionStore,
  CaptureSession,
  ScopeStore,
  ScopeOfWork,
  PhotoStore,
  PhotoRecord,
} from '../../../api/src/index.ts';
import type { SqlClient } from '../sql.ts';
import { toNumber, toNumberOrUndef, toJson } from '../sql.ts';

// --- API keys --------------------------------------------------------------

export class PgApiKeyStore implements ApiKeyStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async findByKeyId(keyId: string): Promise<ApiKeyRecord | null> {
    const rows = await this.db.query('SELECT * FROM api_keys WHERE key_id = $1', [keyId]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      keyId: String(r.key_id),
      secretHash: String(r.secret_hash),
      accountId: String(r.account_id),
      plan: r.plan as ApiKeyRecord['plan'],
      scopes: toScopes(r.scopes),
      active: r.active === true || r.active === 't',
    };
  }
}

function toScopes(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  // Some drivers return text[] as a string literal like '{a,b}'.
  if (typeof v === 'string') {
    return v.replace(/^\{|\}$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// --- Metering --------------------------------------------------------------

export class PgMeterStore implements MeterStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async record(event: UsageEvent): Promise<void> {
    await this.db.query(
      'INSERT INTO usage_events (account_id, endpoint, units, at) VALUES ($1, $2, $3, $4)',
      [event.accountId, event.endpoint, event.units, event.at],
    );
  }
  async total(accountId: string, since = 0): Promise<number> {
    const rows = await this.db.query<{ total: unknown }>(
      'SELECT COALESCE(SUM(units), 0) AS total FROM usage_events WHERE account_id = $1 AND at >= $2',
      [accountId, since],
    );
    return rows.length ? toNumber(rows[0].total) : 0;
  }
}

// --- Watches ---------------------------------------------------------------

const WATCH_UPSERT = `
INSERT INTO watches (id, account_id, subject, last_valuation_id, change_delta, webhook_url, notified_at, created_at, last_as_is, last_arv, last_checked_at, attestation)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  last_valuation_id = EXCLUDED.last_valuation_id,
  change_delta = EXCLUDED.change_delta,
  webhook_url = EXCLUDED.webhook_url,
  notified_at = EXCLUDED.notified_at,
  last_as_is = EXCLUDED.last_as_is,
  last_arv = EXCLUDED.last_arv,
  last_checked_at = EXCLUDED.last_checked_at,
  attestation = EXCLUDED.attestation`;

export class PgWatchStore implements WatchStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async save(w: Watch): Promise<void> {
    await this.db.query(WATCH_UPSERT, [
      w.id,
      w.accountId,
      JSON.stringify(w.subject),
      w.lastValuationId ?? null,
      w.changeDelta ?? null,
      w.webhookUrl ?? null,
      w.notifiedAt ?? null,
      w.createdAt,
      w.lastAsIs ?? null,
      w.lastArv ?? null,
      w.lastCheckedAt ?? null,
      w.attestation ? JSON.stringify(w.attestation) : null,
    ]);
  }
  async get(id: string): Promise<Watch | null> {
    const rows = await this.db.query('SELECT * FROM watches WHERE id = $1', [id]);
    return rows.length ? rowToWatch(rows[0]) : null;
  }
  async listByAccount(accountId: string): Promise<Watch[]> {
    const rows = await this.db.query('SELECT * FROM watches WHERE account_id = $1 ORDER BY created_at ASC', [
      accountId,
    ]);
    return rows.map(rowToWatch);
  }
  async listAll(): Promise<Watch[]> {
    const rows = await this.db.query('SELECT * FROM watches ORDER BY created_at ASC', []);
    return rows.map(rowToWatch);
  }
}

function rowToWatch(r: Record<string, unknown>): Watch {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    subject: toJson(r.subject, {}) as Record<string, unknown>,
    lastValuationId: r.last_valuation_id == null ? undefined : String(r.last_valuation_id),
    attestation: r.attestation == null ? undefined : (toJson(r.attestation, {}) as Record<string, unknown>),
    lastAsIs: toNumberOrUndef(r.last_as_is),
    lastArv: toNumberOrUndef(r.last_arv),
    lastCheckedAt: toNumberOrUndef(r.last_checked_at),
    changeDelta: toNumberOrUndef(r.change_delta),
    notifiedAt: toNumberOrUndef(r.notified_at),
    webhookUrl: r.webhook_url == null ? undefined : String(r.webhook_url),
    createdAt: toNumber(r.created_at),
  };
}

// --- Capture sessions ------------------------------------------------------

const CAPTURE_UPSERT = `
INSERT INTO capture_sessions (id, account_id, subject, url, status, created_at)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, subject = EXCLUDED.subject, url = EXCLUDED.url`;

export class PgCaptureSessionStore implements CaptureSessionStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async save(s: CaptureSession): Promise<void> {
    await this.db.query(CAPTURE_UPSERT, [
      s.id,
      s.accountId,
      JSON.stringify(s.subject),
      s.url,
      s.status,
      s.createdAt,
    ]);
  }
  async get(id: string): Promise<CaptureSession | null> {
    const rows = await this.db.query('SELECT * FROM capture_sessions WHERE id = $1', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      accountId: String(r.account_id),
      subject: toJson(r.subject, {}) as Record<string, unknown>,
      url: String(r.url),
      status: r.status as CaptureSession['status'],
      createdAt: toNumber(r.created_at),
    };
  }
}

// --- Scope of work ---------------------------------------------------------

const SOW_UPSERT = `
INSERT INTO scope_of_work (id, account_id, subject, line_items, detected_tier, true_scope_arv, reasoning, created_at, attestation)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject, line_items = EXCLUDED.line_items, attestation = EXCLUDED.attestation`;

export class PgScopeStore implements ScopeStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async save(s: ScopeOfWork): Promise<void> {
    await this.db.query(SOW_UPSERT, [
      s.id,
      s.accountId,
      s.subject ? JSON.stringify(s.subject) : null,
      JSON.stringify(s.lineItems),
      null,
      null,
      null,
      s.createdAt,
      s.attestation ? JSON.stringify(s.attestation) : null,
    ]);
  }
  async get(id: string): Promise<ScopeOfWork | null> {
    const rows = await this.db.query('SELECT * FROM scope_of_work WHERE id = $1', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      accountId: String(r.account_id),
      subject: r.subject == null ? undefined : (toJson(r.subject, {}) as Record<string, unknown>),
      lineItems: toJson(r.line_items, []) as ScopeOfWork['lineItems'],
      attestation: r.attestation == null ? undefined : (toJson(r.attestation, {}) as Record<string, unknown>),
      createdAt: toNumber(r.created_at),
    };
  }
}

// --- Billing (§5) ------------------------------------------------------------

import type { BillingStore, BillingAccount, BillingPlan } from '../../../billing/src/index.ts';

const BILLING_UPSERT = `
INSERT INTO billing_accounts (account_id, plan, stripe_customer_id, subscription_id, subscription_status, updated_at)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (account_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  subscription_id = EXCLUDED.subscription_id,
  subscription_status = EXCLUDED.subscription_status,
  updated_at = EXCLUDED.updated_at`;

export class PgBillingStore implements BillingStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async get(accountId: string): Promise<BillingAccount | null> {
    const rows = await this.db.query('SELECT * FROM billing_accounts WHERE account_id = $1', [accountId]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      accountId: String(r.account_id),
      plan: String(r.plan) as BillingPlan,
      stripeCustomerId: r.stripe_customer_id == null ? undefined : String(r.stripe_customer_id),
      subscriptionId: r.subscription_id == null ? undefined : String(r.subscription_id),
      subscriptionStatus: r.subscription_status == null ? undefined : String(r.subscription_status),
      updatedAt: toNumber(r.updated_at),
    };
  }
  async save(a: BillingAccount): Promise<void> {
    await this.db.query(BILLING_UPSERT, [
      a.accountId,
      a.plan,
      a.stripeCustomerId ?? null,
      a.subscriptionId ?? null,
      a.subscriptionStatus ?? null,
      a.updatedAt,
    ]);
  }
}

export { toNumberOrUndef };

// --- Material Intelligence (§4.3 add-on) -------------------------------------

import type {
  MaterialAnalysisStore,
  MaterialAnalysisRecord,
  MaterialLinkStore,
  MaterialLinkRecord,
} from '../../../api/src/types.ts';

const MIA_UPSERT = `
INSERT INTO material_analyses (id, account_id, valuation_id, subject, materials, analysis, source, attestation, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject, materials = EXCLUDED.materials, analysis = EXCLUDED.analysis`;

export class PgMaterialAnalysisStore implements MaterialAnalysisStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async save(a: MaterialAnalysisRecord): Promise<void> {
    await this.db.query(MIA_UPSERT, [
      a.id,
      a.accountId,
      a.valuationId ?? null,
      a.subject ? JSON.stringify(a.subject) : null,
      JSON.stringify(a.materials),
      JSON.stringify(a.analysis),
      a.source,
      a.attestation ? JSON.stringify(a.attestation) : null,
      a.createdAt,
    ]);
  }
  async get(id: string): Promise<MaterialAnalysisRecord | null> {
    const rows = await this.db.query('SELECT * FROM material_analyses WHERE id = $1', [id]);
    return rows.length ? rowToAnalysis(rows[0]) : null;
  }
  async listByAccount(accountId: string): Promise<MaterialAnalysisRecord[]> {
    const rows = await this.db.query(
      'SELECT * FROM material_analyses WHERE account_id = $1 ORDER BY created_at DESC LIMIT 200',
      [accountId],
    );
    return rows.map(rowToAnalysis);
  }
}

function rowToAnalysis(r: Record<string, unknown>): MaterialAnalysisRecord {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    valuationId: r.valuation_id == null ? undefined : String(r.valuation_id),
    subject: r.subject == null ? undefined : (toJson(r.subject, {}) as Record<string, unknown>),
    materials: toJson(r.materials, []) as MaterialAnalysisRecord['materials'],
    analysis: toJson(r.analysis, {}) as Record<string, unknown>,
    source: String(r.source),
    attestation: r.attestation == null ? undefined : (toJson(r.attestation, {}) as Record<string, unknown>),
    createdAt: toNumber(r.created_at),
  };
}

const MLK_UPSERT = `
INSERT INTO material_links (id, token, account_id, valuation_id, subject, url, status, attestation, analysis_id, created_at, submitted_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, analysis_id = EXCLUDED.analysis_id, submitted_at = EXCLUDED.submitted_at`;

export class PgMaterialLinkStore implements MaterialLinkStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async save(l: MaterialLinkRecord): Promise<void> {
    await this.db.query(MLK_UPSERT, [
      l.id,
      l.token,
      l.accountId,
      l.valuationId ?? null,
      l.subject ? JSON.stringify(l.subject) : null,
      l.url,
      l.status,
      l.attestation ? JSON.stringify(l.attestation) : null,
      l.analysisId ?? null,
      l.createdAt,
      l.submittedAt ?? null,
    ]);
  }
  async get(id: string): Promise<MaterialLinkRecord | null> {
    const rows = await this.db.query('SELECT * FROM material_links WHERE id = $1', [id]);
    return rows.length ? rowToLink(rows[0]) : null;
  }
  async getByToken(token: string): Promise<MaterialLinkRecord | null> {
    const rows = await this.db.query('SELECT * FROM material_links WHERE token = $1', [token]);
    return rows.length ? rowToLink(rows[0]) : null;
  }
  async listByAccount(accountId: string): Promise<MaterialLinkRecord[]> {
    const rows = await this.db.query(
      'SELECT * FROM material_links WHERE account_id = $1 ORDER BY created_at DESC LIMIT 200',
      [accountId],
    );
    return rows.map(rowToLink);
  }
}

function rowToLink(r: Record<string, unknown>): MaterialLinkRecord {
  return {
    id: String(r.id),
    token: String(r.token),
    accountId: String(r.account_id),
    valuationId: r.valuation_id == null ? undefined : String(r.valuation_id),
    subject: r.subject == null ? undefined : (toJson(r.subject, {}) as Record<string, unknown>),
    url: String(r.url),
    status: r.status as MaterialLinkRecord['status'],
    attestation: r.attestation == null ? undefined : (toJson(r.attestation, {}) as Record<string, unknown>),
    analysisId: r.analysis_id == null ? undefined : String(r.analysis_id),
    createdAt: toNumber(r.created_at),
    submittedAt: r.submitted_at == null ? undefined : toNumber(r.submitted_at),
  };
}

// --- Property photos (§4.1) --------------------------------------------------

export class PgPhotoStore implements PhotoStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }
  async insert(p: PhotoRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO property_photos (id, account_id, label, media_type, data_base64, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [p.id, p.accountId, p.label ?? null, p.mediaType, p.dataBase64, p.createdAt],
    );
  }
  async findById(id: string): Promise<PhotoRecord | null> {
    const rows = await this.db.query('SELECT * FROM property_photos WHERE id = $1', [id]);
    return rows.length ? rowToPhoto(rows[0]) : null;
  }
  async listByAccount(accountId: string, limit = 100): Promise<PhotoRecord[]> {
    const rows = await this.db.query(
      'SELECT * FROM property_photos WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2',
      [accountId, limit],
    );
    return rows.map(rowToPhoto);
  }
}

function rowToPhoto(r: Record<string, unknown>): PhotoRecord {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    label: r.label == null ? undefined : String(r.label),
    mediaType: String(r.media_type) as PhotoRecord['mediaType'],
    dataBase64: String(r.data_base64),
    createdAt: toNumber(r.created_at),
  };
}
