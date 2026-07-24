# @flip-master/persistence

The §8 data model — a Postgres schema plus store implementations that satisfy
the orchestration and API store interfaces. Stores depend on a small injectable
`SqlClient`, so they're unit-tested against a fake client (no database needed)
and the driver stays swappable. The real `pg` adapter is opt-in.

## What's here

- **`migrations/0001_init.sql`** — the full §8 schema: accounts, api_keys,
  properties, parcels, jobs, valuations, comps, scope_of_work, renders, reports,
  capture_sessions, watches, usage_events. Timestamps are BIGINT epoch-ms to
  match the app's numeric clock. No demographic/protected-class columns, by
  design (§4.7) — enforced by a test.
- **Postgres stores** — `PgJobStore` (orchestration `JobStore`), `PgApiKeyStore`,
  `PgMeterStore`, `PgWatchStore`, `PgCaptureSessionStore`, `PgScopeStore` (the
  API's stores). All behind `SqlClient`.
- **`createPgClient` (`./pg`)** — the only file importing `pg`. Kept out of the
  index so importing this package never pulls the driver.
- **`migrate` / `migrationFiles`** — apply the SQL.

## Wiring it into production

Swap the in-memory demo stores for Postgres — the `Api` and `Orchestrator` don't
change:

```ts
import { createPgClient } from '@flip-master/persistence/pg';
import { migrate, createPgStores } from '@flip-master/persistence';

const db = createPgClient({ connectionString: process.env.DATABASE_URL });
await migrate(db);
const stores = createPgStores(db);

// Orchestrator:  new Orchestrator({ store: stores.jobStore, events, stages })
// API AppDeps:   { orchestrator, jobStore: stores.jobStore, apiKeys: stores.apiKeys,
//                  meter: stores.meter, watches: stores.watches,
//                  captures: stores.captures, scopes: stores.scopes, webhooks }
```

```bash
npm install pg
DATABASE_URL=postgres://user:pass@host:5432/flipmaster node examples/migrate.ts
```

## Why an injectable SqlClient

- **Testable without a database.** The suite runs the real `PgJobStore` through
  the real `Orchestrator`, backed by a fake that emulates the `jobs` table —
  proving persistence end to end — plus per-store tests asserting exact SQL,
  parameter binding (never string interpolation → no SQL injection), and row
  mapping (incl. bigint-as-string and jsonb-as-object/string).
- **Swappable driver.** `pg` today; `postgres.js`, a pooled proxy, or a
  read-replica router later — all behind `SqlClient`.

## Develop

```bash
npm test          # 17 tests, no database, no pg driver required
```

> Production still needs the `pg` driver and a real database; a full
> `npm run typecheck` needs `pg` + `@types/pg` installed.
