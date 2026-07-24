/**
 * {{BRAND_NAME}} — Persistence
 * Public API. Postgres-backed stores implementing the orchestration + API store
 * interfaces (§8 data model). The real `pg` adapter lives in ./pgClient.ts and
 * is intentionally NOT re-exported here, so importing this package never
 * requires the `pg` driver (tests + non-DB code stay dependency-free).
 */

import type { SqlClient } from './sql.ts';
import { PgJobStore } from './stores/pgJobStore.ts';
import {
  PgApiKeyStore,
  PgMeterStore,
  PgWatchStore,
  PgCaptureSessionStore,
  PgScopeStore,
} from './stores/pgApiStores.ts';

export type { SqlClient, TransactionalSqlClient } from './sql.ts';
export { toNumber, toNumberOrUndef, toJson } from './sql.ts';
export { PgJobStore, rowToJob } from './stores/pgJobStore.ts';
export {
  PgApiKeyStore,
  PgMeterStore,
  PgWatchStore,
  PgCaptureSessionStore,
  PgScopeStore,
} from './stores/pgApiStores.ts';
export { migrate, migrationFiles } from './migrate.ts';

/** Every store, wired to one SqlClient — drops into the API's AppDeps + the
 *  orchestrator's store slot. */
export interface PgStores {
  jobStore: PgJobStore;
  apiKeys: PgApiKeyStore;
  meter: PgMeterStore;
  watches: PgWatchStore;
  captures: PgCaptureSessionStore;
  scopes: PgScopeStore;
}

export function createPgStores(db: SqlClient): PgStores {
  return {
    jobStore: new PgJobStore(db),
    apiKeys: new PgApiKeyStore(db),
    meter: new PgMeterStore(db),
    watches: new PgWatchStore(db),
    captures: new PgCaptureSessionStore(db),
    scopes: new PgScopeStore(db),
  };
}
