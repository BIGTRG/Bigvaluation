/**
 * Test doubles for SqlClient. No database required: FakeSqlClient records every
 * query and returns whatever the responder yields; JobsTableFake emulates just
 * enough of the `jobs` table to round-trip a Job through PgJobStore.
 */

import type { SqlClient } from '../src/sql.ts';

export interface RecordedCall {
  text: string;
  params: unknown[];
}

export class FakeSqlClient implements SqlClient {
  readonly calls: RecordedCall[] = [];
  responder: (text: string, params: unknown[]) => Record<string, unknown>[] = () => [];

  async query<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    this.calls.push({ text, params: [...params] });
    return this.responder(text, [...params]) as T[];
  }

  last(): RecordedCall {
    return this.calls[this.calls.length - 1];
  }
}

/** Emulates the `jobs` table well enough to persist + reload a Job. */
export class JobsTableFake implements SqlClient {
  readonly rows = new Map<string, Record<string, unknown>>();

  async query<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    if (text.includes('INSERT INTO jobs')) {
      const [id, account_id, status, input, stages, context, error, created_at, updated_at] = params;
      this.rows.set(String(id), {
        id,
        account_id,
        status,
        input,
        stages,
        context,
        error,
        created_at,
        updated_at,
      });
      return [] as T[];
    }
    if (text.includes('SELECT * FROM jobs WHERE id')) {
      const r = this.rows.get(String(params[0]));
      return (r ? [r] : []) as T[];
    }
    if (text.includes('SELECT * FROM jobs ORDER BY')) {
      return [...this.rows.values()] as T[];
    }
    return [] as T[];
  }
}
