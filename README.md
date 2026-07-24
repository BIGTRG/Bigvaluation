# {{BRAND_NAME}} — Valuation Suite

> Working title: **Flip Master Valuation Suite**. Name and logo pending — the
> codebase uses `{{BRAND_NAME}}` / `{{LOGO}}` / `{{BRAND_DOMAIN}}` tokens so the
> brand drops in with a single find-and-replace.

An AI-driven property valuation platform that produces a sellable report giving
an **As-Is value** and an **After-Repair Value (ARV)** across three rehab
condition levels (Light / Medium / High), backed by comparable-sales data, deal
math, and rental/BRRRR analysis. Sold to real-estate investors and lenders; also
licensable as an API.

**Automated valuations are estimates, not licensed appraisals.**

## Monorepo layout

```
packages/
  valuation-engine/   The IP core — As-Is + 3-tier ARV, comps, confidence (FSD),
                      deal math, rental value. Pure, dependency-free TypeScript.
  report-builder/     Renders a Valuation into a branded, self-contained HTML
                      report (web + PDF source). Consumes the engine's output.
```

Planned (see the build brief): `connectors/` (ATTOM, HouseCanary, MLS, Regrid,
Shovels behind swappable adapters), `orchestration/` (the 5-stage async
pipeline), `api/` (licensing surface, §9), and the capture / render / scope
modules.

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
# Valuation engine
cd packages/valuation-engine
npm test                  # 36 tests, zero dependencies
node examples/demo.ts     # prints a full deal sheet

# Report builder
cd ../report-builder
npm test                  # 7 tests
node examples/generate.ts # writes examples/out/report.html (web + PDF source)
```

Each package has its own `README.md` and (for the engine) a `SPEC.md`
formalizing the valuation math and the accuracy/backtest loop.

## Tech stack (locked)

Claude (primary AI) · ATTOM / HouseCanary / MLS (data & AVM) · Regrid + Shovels
(parcel/permits) · Postgres · MinIO (S3-compatible) on Hetzner · Stripe (billing)
· Twilio (SMS) · GSI (email). Every dependency is wrapped behind a connector.

## Status

| Module | State |
|---|---|
| Valuation engine (§4.5–4.6) | ✅ Built + tested |
| Report builder (§3) | ✅ Built + tested |
| Connectors (ATTOM / HouseCanary / MLS) | ⏳ Next |
| Orchestration pipeline (§7) | ⏳ Planned |
| Licensing API (§9) | ⏳ Planned |
| Capture app · Scope Studio · Rendering (§4.1–4.4) | ⏳ Planned |

---

*Prepared for Flip Master Lending. This is a build in progress, not legal or
financial advice; confirm vendor terms and state licensing rules with counsel.*
