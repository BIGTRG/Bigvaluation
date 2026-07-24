/**
 * Ops script: apply migrations to a real Postgres. Requires the `pg` driver
 * (`npm install pg`) and DATABASE_URL. Not run in CI/tests (which use a fake
 * SqlClient). Run: `DATABASE_URL=postgres://… node examples/migrate.ts`
 */
import { createPgClient } from '../src/pgClient.ts';
import { migrate } from '../src/index.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL, e.g. postgres://user:pass@host:5432/flipmaster');
  process.exit(1);
}

const db = createPgClient({ connectionString: url, ssl: process.env.PGSSL === '1' });
const applied = await migrate(db);
console.log(`Applied migrations: ${applied.join(', ')}`);
