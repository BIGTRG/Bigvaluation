/**
 * ValueProof — Licensing API (§9)
 * In-memory store implementations for local dev and tests. Swap each for a
 * Postgres-backed store in production (§8 data model) — the API only sees the
 * interfaces in types.ts.
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
  MaterialAnalysisStore,
  MaterialAnalysisRecord,
  MaterialLinkStore,
  MaterialLinkRecord,
} from './types.ts';
import { hashSecret } from './auth.ts';

export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly byId = new Map<string, ApiKeyRecord>();
  constructor(records: ApiKeyRecord[] = []) {
    for (const r of records) this.byId.set(r.keyId, r);
  }
  async findByKeyId(keyId: string): Promise<ApiKeyRecord | null> {
    return this.byId.get(keyId) ?? null;
  }
  /** Test/seed helper: register a key from its plaintext secret. */
  addKey(rec: Omit<ApiKeyRecord, 'secretHash'> & { secret: string }): void {
    const { secret, ...rest } = rec;
    this.byId.set(rec.keyId, { ...rest, secretHash: hashSecret(secret) });
  }
}

export class InMemoryMeterStore implements MeterStore {
  readonly events: UsageEvent[] = [];
  async record(event: UsageEvent): Promise<void> {
    this.events.push(event);
  }
  async total(accountId: string, since = 0): Promise<number> {
    return this.events
      .filter((e) => e.accountId === accountId && e.at >= since)
      .reduce((sum, e) => sum + e.units, 0);
  }
}

export class InMemoryWatchStore implements WatchStore {
  private readonly byId = new Map<string, Watch>();
  async save(w: Watch): Promise<void> {
    this.byId.set(w.id, structuredClone(w));
  }
  async get(id: string): Promise<Watch | null> {
    const w = this.byId.get(id);
    return w ? structuredClone(w) : null;
  }
  async listByAccount(accountId: string): Promise<Watch[]> {
    return [...this.byId.values()].filter((w) => w.accountId === accountId).map((w) => structuredClone(w));
  }
  async listAll(): Promise<Watch[]> {
    return [...this.byId.values()].map((w) => structuredClone(w));
  }
}

export class InMemoryCaptureSessionStore implements CaptureSessionStore {
  private readonly byId = new Map<string, CaptureSession>();
  async save(s: CaptureSession): Promise<void> {
    this.byId.set(s.id, structuredClone(s));
  }
  async get(id: string): Promise<CaptureSession | null> {
    const s = this.byId.get(id);
    return s ? structuredClone(s) : null;
  }
}

export class InMemoryMaterialAnalysisStore implements MaterialAnalysisStore {
  private readonly byId = new Map<string, MaterialAnalysisRecord>();
  async save(a: MaterialAnalysisRecord): Promise<void> {
    this.byId.set(a.id, structuredClone(a));
  }
  async get(id: string): Promise<MaterialAnalysisRecord | null> {
    const a = this.byId.get(id);
    return a ? structuredClone(a) : null;
  }
  async listByAccount(accountId: string): Promise<MaterialAnalysisRecord[]> {
    return [...this.byId.values()]
      .filter((a) => a.accountId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => structuredClone(a));
  }
}

export class InMemoryMaterialLinkStore implements MaterialLinkStore {
  private readonly byId = new Map<string, MaterialLinkRecord>();
  async save(l: MaterialLinkRecord): Promise<void> {
    this.byId.set(l.id, structuredClone(l));
  }
  async get(id: string): Promise<MaterialLinkRecord | null> {
    const l = this.byId.get(id);
    return l ? structuredClone(l) : null;
  }
  async getByToken(token: string): Promise<MaterialLinkRecord | null> {
    for (const l of this.byId.values()) if (l.token === token) return structuredClone(l);
    return null;
  }
  async listByAccount(accountId: string): Promise<MaterialLinkRecord[]> {
    return [...this.byId.values()]
      .filter((l) => l.accountId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((l) => structuredClone(l));
  }
}

export class InMemoryScopeStore implements ScopeStore {
  private readonly byId = new Map<string, ScopeOfWork>();
  async save(s: ScopeOfWork): Promise<void> {
    this.byId.set(s.id, structuredClone(s));
  }
  async get(id: string): Promise<ScopeOfWork | null> {
    const s = this.byId.get(id);
    return s ? structuredClone(s) : null;
  }
}
