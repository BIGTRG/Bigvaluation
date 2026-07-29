/**
 * ValueProof — Persistence
 * Migration runner. Reads the SQL migrations (in order) and applies them. Each
 * file is idempotent (IF NOT EXISTS), so re-running is safe. Good enough for
 * MVP; graduate to a versioned migration tool when the schema starts changing.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { SqlClient } from './sql.ts';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** All migration SQL, in filename order. */
export function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }));
}

/** Apply every migration against the given client. */
export async function migrate(db: SqlClient): Promise<string[]> {
  const applied: string[] = [];
  for (const { name, sql } of migrationFiles()) {
    await db.query(sql);
    applied.push(name);
  }
  return applied;
}
