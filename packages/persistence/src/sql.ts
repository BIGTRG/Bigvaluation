/**
 * {{BRAND_NAME}} — Persistence
 * The database seam. Stores depend on this tiny interface, never on `pg`
 * directly, so they are unit-testable with a fake client and the driver stays
 * swappable (pg, postgres.js, a pooled proxy — all behind SqlClient).
 */

export interface SqlClient {
  /** Parameterized query ($1, $2, …). Returns the result rows. */
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

/** A client that can run a function inside a transaction. Optional capability. */
export interface TransactionalSqlClient extends SqlClient {
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

/** Coerce a BIGINT column (which drivers may return as string) to a number. */
export function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v);
}

export function toNumberOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse a JSONB column. pg returns already-parsed objects for jsonb; some paths
 * (or a fake client) may hand back a string. Handle both.
 */
export function toJson<T = unknown>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}
