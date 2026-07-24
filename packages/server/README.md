# @flip-master/server

The composition root — the one place all packages are wired into a single
runnable service, driven entirely by environment config.

```
loadConfig(env) → buildApp(cfg) → createHttpServer(api) → listen
                     │
      ┌──────────────┼───────────────────────────────┐
   stores          data hub                       pipeline
  Postgres?      ATTOM/HouseCanary?           orchestrator + webhooks
  else memory    else MockProvider            (engine + report builder)
```

## Config (env)

| Var | Effect |
|---|---|
| `PORT` | listen port (default 8787) |
| `DATABASE_URL` | set → Postgres stores; unset → in-memory (dev) |
| `MIGRATE_ON_BOOT` | apply migrations on start |
| `ATTOM_API_KEY` | set → live data; unset → mock provider |
| `HOUSECANARY_API_KEY` / `_SECRET` | enable the AVM leg |
| `SEED_API_KEY` | seed one partner key on boot (dev/first-run) — blank in prod |
| `REPORTS_BASE_URL` / `CAPTURE_BASE_URL` | link bases |
| `WEBHOOK_MAX_ATTEMPTS` | webhook retry budget |

Full list in the repo-root `.env.example`.

## Run

```bash
# In-memory, mock data, seeded key — zero setup:
SEED_API_KEY=fmk_demo.secret123 node src/main.ts

# Against Postgres:
DATABASE_URL=postgres://flip:flip@localhost:5432/flipmaster MIGRATE_ON_BOOT=1 \
  SEED_API_KEY=fmk_demo.secret123 node src/main.ts

curl localhost:8787/health
```

Or the whole stack (Postgres + MinIO + API) via the repo-root
`docker compose up --build`.

## What's still stubbed

`buildApp` leaves three injection points empty until their modules exist:
- **`vision`** (§4.1) — Claude condition scoring from captured media. Until then,
  callers pass `conditionScore` in the request (default 3).
- **`render`** (§4.4) — render/staging API. Reports ship without images meanwhile.
- **`publish`** — currently returns a canonical URL (the HTML is already stored on
  the job); wire MinIO upload here.

Each is a one-line change in `buildApp.ts` — nothing downstream moves.

## Develop

```bash
npm test   # 6 tests: config parsing, seed-key parsing, and a full
           # in-memory boot serving a real valuation + report
```
