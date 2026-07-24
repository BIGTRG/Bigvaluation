/**
 * {{BRAND_NAME}} — Persistence
 * Real Postgres adapter. This is the ONLY file that imports `pg`, so it is kept
 * out of the package index and the test path — install the driver only where
 * you actually connect:  `npm install pg`.
 *
 * Usage:
 *   import { createPgClient } from '@flip-master/persistence/pg';
 *   const db = createPgClient({ connectionString: process.env.DATABASE_URL });
 *   await migrate(db);
 */

// @ts-expect-error — `pg` is an optional peer; installed only in deployments.
import pg from 'pg';
import type { SqlClient, TransactionalSqlClient } from './sql.ts';

export interface PgClientOptions {
  connectionString?: string;
  max?: number;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

/** Wrap a pg Pool as a TransactionalSqlClient. */
export function createPgClient(opts: PgClientOptions): TransactionalSqlClient {
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max ?? 10,
    ssl: opts.ssl,
  });

  const query = async <T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T[]> => {
    const res = await pool.query(text, params as unknown[] | undefined);
    return res.rows as T[];
  };

  const transaction = async <T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    const txClient: SqlClient = {
      query: async <R = Record<string, unknown>>(text: string, params?: readonly unknown[]) => {
        const res = await client.query(text, params as unknown[] | undefined);
        return res.rows as R[];
      },
    };
    try {
      await client.query('BEGIN');
      const out = await fn(txClient);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };

  return { query, transaction };
}
