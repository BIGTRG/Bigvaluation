# ValueProof — Valuation Suite

> Working title: **Flip Master Valuation Suite**. Name and logo pending — the
> codebase uses `ValueProof` / `{{LOGO}}` / `valueproof.net` tokens so the
> brand drops in with a single find-and-replace.

An AI-driven property valuation platform that produces a sellable report giving
an **As-Is value** and an **After-Repair Value (ARV)** across three rehab
condition levels (Light / Medium / High), backed by comparable-sales data, deal
math, and rental/BRRRR analysis. Sold to real-estate investors and lenders; also
licensable as an API.

**Automated valuations are estimates, not licensed appraisals.**

**Investor-only.** The platform serves business-purpose, non-owner-occupied real
estate decisions exclusively. Every valuation, scope, and watch request must
carry an explicit `attestation: { businessPurpose: true, nonOwnerOccupied: true }`,
which is recorded for the audit trail. Public `GET /legal/terms` and
`GET /legal/privacy` ship with every deployment.

## Monorepo layout

```
packages/
  valuation-engine/   The IP core — As-Is + 3-tier ARV, comps, confidence (FSD),
                      deal math, rental value. Pure, dependency-free TypeScript.
  report-builder/     Renders a Valuation into a branded, self-contained HTML
                      report (web + PDF source). Consumes the engine's output.
  connectors/         Property Data Hub + swappable ATTOM/HouseCanary/MLS
                      adapters. Normalizes, falls back, audits — feeds the engine.
  orchestration/      Async 5-stage job pipeline (Capture→Understand→Value→
                      Visualize→Deliver) with retries + webhook events. Composes
                      connectors + engine + report builder.
  api/                Licensing/HTTP API (§9) — valuations, reports, watches,
                      capture sessions, scope-of-work, webhooks. Key auth +
                      metering. Framework-free on Node http.
  persistence/        §8 data model — Postgres schema + stores behind an
                      injectable SqlClient. Swap the in-memory stores for these.
  server/             Composition root — wires every package into one deployable
                      service from env config. Docker + docker-compose at root.
```

Planned (see the build brief): the capture app (§4.1), rendering (§4.4), and the
Scope-of-Work Studio (§4.3) — clean injection points already exist in the server.

## Architecture principle

Five async stages — **Capture → Understand → Value → Visualize → Deliver**. Every
external vendor sits behind a connector/adapter so any provider can be swapped
without touching application code. The valuation engine imports nothing external,
so values are reproducible and every number traces back to comps, AVM, condition
score, and radius (auditability).

## Getting started

Requires **Node ≥ 23** (native TypeScript type-stripping — no build step needed
to run or test).

```bash
# Run the whole service (in-memory, mock data, seeded key — zero setup):
SEED_API_KEY=fmk_demo.secret123 node packages/server/src/main.ts
curl localhost:8787/health

# Run every test suite (112 tests across 7 packages):
npm test

# Or explore a single package:
cd packages/valuation-engine && node examples/demo.ts   # prints a full deal sheet
cd packages/report-builder   && node examples/generate.ts
```

Each package has its own `README.md` and (for the engine) a `SPEC.md`
formalizing the valuation math and the accuracy/backtest loop.

## Deploy (§6: Hetzner + MinIO + Postgres)

```bash
cp .env.example .env          # then edit secrets
docker compose up --build     # Postgres + MinIO + the API service
curl localhost:8787/health
```

The `Dockerfile` runs the server on Node's native TypeScript support (the only
npm dependency is the `pg` driver). See `docker-compose.yml` for the single-box
stack. Set `ATTOM_API_KEY` (+ HouseCanary keys) to switch from mock to live data.

## Tech stack (locked)

Claude (primary AI) · ATTOM / HouseCanary / MLS (data & AVM) · Regrid + Shovels
(parcel/permits) · Postgres · MinIO (S3-compatible) on Hetzner · Stripe (billing)
· Twilio (SMS) · GSI (email). Every dependency is wrapped behind a connector.

## Status

| Module | State |
|---|---|
| Valuation engine (§4.5–4.6) | ✅ Built + tested |
| Report builder (§3) | ✅ Built + tested |
| Connectors + Property Data Hub (§6–7) | ✅ Built + tested (mock live; ATTOM/HouseCanary adapters need live-API field verification) |
| Orchestration pipeline (§7) | ✅ Built + tested (5-stage DAG, retries, webhook events) |
| Licensing API (§9) | ✅ Built + tested (auth, scopes, metering, webhooks; framework-free) |
| Postgres persistence (§8) | ✅ Built + tested (schema + stores behind SqlClient; pg adapter opt-in) |
| Composition root + Docker deploy (§6) | ✅ Built + tested (server wires all packages; Dockerfile + compose) |
| Capture app · Vision scoring · Scope Studio (§4.1, §4.3) | ✅ Built + tested |
| Compliance layer (§4.7): investor-only attestation gate, legal pages, report disclaimers | ✅ Built + tested |
| Live valuation monitoring (§5.3): watch sweeps + `watch.changed` webhooks | ✅ Built + tested |
| PDF reports (§3): Gotenberg connector, `GET /reports/:id?format=pdf` | ✅ Built + tested (compose ships Gotenberg) |
| Rendering + staging connector (§4.4) | ⏳ Planned (injection point ready) |
| Stripe billing + membership tiers (§5) | ⏳ Planned (metering already records usage) |
| Customer web app (order flow, dashboard) | ⏳ Planned |
| Smart Walkthrough 2.0 (§4.2: Regrid + Shovels) | ⏳ Planned |
| Live data wiring (verify ATTOM/HouseCanary fields) | ⏳ Needs API keys / contracts |

---

*Prepared for Flip Master Lending. This is a build in progress, not legal or
financial advice; confirm vendor terms and state licensing rules with counsel.*
