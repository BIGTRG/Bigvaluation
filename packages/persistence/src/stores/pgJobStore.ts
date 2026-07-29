/**
 * ValueProof — Persistence
 * Postgres-backed JobStore (implements the orchestration JobStore interface).
 * The whole Job is persisted with JSONB columns for input/stages/context, plus
 * an extracted account_id for API ownership scoping.
 */

import type { Job } from '../../../orchestration/src/index.ts';
import type { JobStore } from '../../../orchestration/src/index.ts';
import type { SqlClient } from '../sql.ts';
import { toNumber, toJson } from '../sql.ts';

const UPSERT = `
INSERT INTO jobs (id, account_id, status, input, stages, context, error, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  status     = EXCLUDED.status,
  input      = EXCLUDED.input,
  stages     = EXCLUDED.stages,
  context    = EXCLUDED.context,
  error      = EXCLUDED.error,
  updated_at = EXCLUDED.updated_at`;

export class PgJobStore implements JobStore {
  private readonly db: SqlClient;
  constructor(db: SqlClient) {
    this.db = db;
  }

  async save(job: Job): Promise<void> {
    const accountId = (job.input as { accountId?: unknown }).accountId;
    await this.db.query(UPSERT, [
      job.id,
      typeof accountId === 'string' ? accountId : null,
      job.status,
      JSON.stringify(job.input),
      JSON.stringify(job.stages),
      JSON.stringify(job.context),
      job.error ?? null,
      job.createdAt,
      job.updatedAt,
    ]);
  }

  async get(id: string): Promise<Job | null> {
    const rows = await this.db.query('SELECT * FROM jobs WHERE id = $1', [id]);
    return rows.length ? rowToJob(rows[0]) : null;
  }

  async list(): Promise<Job[]> {
    const rows = await this.db.query('SELECT * FROM jobs ORDER BY created_at ASC');
    return rows.map(rowToJob);
  }

  async listByAccount(accountId: string, limit = 50): Promise<Job[]> {
    const rows = await this.db.query(
      'SELECT * FROM jobs WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2',
      [accountId, limit],
    );
    return rows.map(rowToJob);
  }
}

export function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id),
    status: row.status as Job['status'],
    createdAt: toNumber(row.created_at),
    updatedAt: toNumber(row.updated_at),
    input: toJson(row.input, {}) as Job['input'],
    stages: toJson(row.stages, {}) as Job['stages'],
    context: toJson(row.context, {}) as Job['context'],
    error: row.error == null ? undefined : String(row.error),
  };
}
