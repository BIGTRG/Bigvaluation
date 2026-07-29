/**
 * {{BRAND_NAME}} — Licensing API (§9)
 * Transport-agnostic request/response types and the store interfaces the API
 * depends on. The HTTP layer (server.ts) adapts Node's http to `ApiRequest` /
 * `ApiResponse`; everything else works against these, so handlers are unit-
 * testable without a socket.
 */

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiRequest {
  method: Method;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  /** Parsed JSON body (or undefined). */
  body?: unknown;
  /** Raw request payload — required for webhook signature verification. */
  rawBody?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  /** Extra/override response headers (content-type defaults to JSON). */
  headers?: Record<string, string>;
}

// --- Auth (§9 "API-key auth") ----------------------------------------------

/** A plan tier gates features and rate/price (§5 membership tiers). */
export type Plan = 'payg' | 'pro' | 'partner';

export interface ApiKeyRecord {
  keyId: string;
  /** The secret is stored HASHED — never in plaintext. */
  secretHash: string;
  accountId: string;
  plan: Plan;
  /** Coarse capabilities, e.g. 'valuations:write', 'reports:read', or '*'. */
  scopes: string[];
  active: boolean;
}

export interface AuthContext {
  keyId: string;
  accountId: string;
  plan: Plan;
  scopes: string[];
}

export interface ApiKeyStore {
  /** Look up by the public key id (the part before the secret). */
  findByKeyId(keyId: string): Promise<ApiKeyRecord | null>;
}

// --- Metering (§9 "usage metered for billing") -----------------------------

export interface UsageEvent {
  accountId: string;
  /** Route id, e.g. 'valuations.create'. */
  endpoint: string;
  at: number;
  units: number;
}

export interface MeterStore {
  record(event: UsageEvent): Promise<void>;
  /** Total billable units for an account (optionally since a timestamp). */
  total(accountId: string, since?: number): Promise<number>;
}

// --- Domain stores ---------------------------------------------------------

export interface Watch {
  id: string;
  accountId: string;
  subject: Record<string, unknown>;
  lastValuationId?: string;
  /** Last observed values — the monitor's comparison baseline (§5.3). */
  lastAsIs?: number;
  lastArv?: number;
  lastCheckedAt?: number;
  /** Largest relative move seen at the last check (0.031 = 3.1%). */
  changeDelta?: number;
  /** Recorded business-purpose attestation (§4.7); reused by monitor re-checks. */
  attestation?: Record<string, unknown>;
  notifiedAt?: number;
  webhookUrl?: string;
  createdAt: number;
}

export interface WatchStore {
  save(watch: Watch): Promise<void>;
  get(id: string): Promise<Watch | null>;
  listByAccount(accountId: string): Promise<Watch[]>;
  /** Every watch, for the monitoring sweep (§5.3). */
  listAll(): Promise<Watch[]>;
}

// --- PDF rendering (§3 "branded PDF") ---------------------------------------

/** Renders self-contained report HTML into a PDF. Swappable connector (§6). */
export interface PdfRenderer {
  render(html: string, opts?: { filename?: string }): Promise<Uint8Array>;
}

export interface CaptureSession {
  id: string;
  accountId: string;
  subject: Record<string, unknown>;
  /** The tokenized mobile capture link the SMS/email delivers (§4.1). */
  url: string;
  status: 'created' | 'in_progress' | 'complete' | 'expired';
  createdAt: number;
}

export interface CaptureSessionStore {
  save(s: CaptureSession): Promise<void>;
  get(id: string): Promise<CaptureSession | null>;
}

export interface ScopeOfWork {
  id: string;
  accountId: string;
  subject?: Record<string, unknown>;
  lineItems: { label: string; category?: string; costUsd: number }[];
  /** Recorded business-purpose attestation (§4.7 audit trail). */
  attestation?: Record<string, unknown>;
  createdAt: number;
}

export interface ScopeStore {
  save(s: ScopeOfWork): Promise<void>;
  get(id: string): Promise<ScopeOfWork | null>;
}
