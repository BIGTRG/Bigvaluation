# @flip-master/connectors

The connector layer — the **Property Data Hub** and swappable vendor adapters
that feed the valuation engine. Build brief §6/§7: every external dependency
sits behind an interface so any provider can be swapped without touching the app.

## Pipeline

```
providers ──▶ PropertyDataHub ──▶ toValuationRequest ──▶ computeValuation ──▶ renderReport
(ATTOM,        (normalize +          (+ conditionScore    (engine)             (report-builder)
 HouseCanary,   fallback +            from Vision engine)
 MLS, Regrid…)  merge + audit)
```

```ts
import { PropertyDataHub, toValuationRequest, AttomProvider, HouseCanaryProvider } from '@flip-master/connectors';
import { computeValuation } from '@flip-master/valuation-engine';

const attom = new AttomProvider({ apiKey: process.env.ATTOM_KEY! });
const hc = new HouseCanaryProvider({ apiKey: process.env.HC_KEY!, apiSecret: process.env.HC_SECRET! });

const hub = new PropertyDataHub({ propertyProviders: [attom], avmProviders: [hc] });
const data = await hub.assemble({ address: '123 Flip St' }, { asOf: '2026-07-23' });

const valuation = computeValuation(
  toValuationRequest(data, conditionScoreFromVisionEngine, { asOf: '2026-07-23' }),
);
```

Swap `attom`/`hc` for `new MockProvider()` and the same pipeline runs fully
offline — see `examples/pipeline.ts`.

## What the hub does

- **Fallback (§10):** tries property/AVM providers in priority order; on error or
  empty result it moves to the next and logs it — one vendor outage never halts a
  report.
- **Merge + dedupe:** combines comps across providers, deduped by id or
  address+sqft.
- **Renovated classification:** bands need renovated comps. Providers set
  `comp.renovated` when they have signal (MLS remarks, permits); otherwise a
  documented heuristic fills in. See `classify.ts` — **wire a real MLS/permits
  classifier before quoting lenders.**
- **Additions reconciliation (§4.2):** flags recorded-vs-observed sqft deltas.
- **Source audit log (§10):** every field records which provider supplied it and
  whether it was ok / empty / error / fallback.

## Adapters

| Adapter | Role | Auth |
|---|---|---|
| `MockProvider` | offline dev/test — implements every interface | none |
| `AttomProvider` | property facts + comps | `apikey` header |
| `HouseCanaryProvider` | AVM | HTTP Basic (key + secret) |

> ⚠️ **The ATTOM/HouseCanary field mappings are illustrative** and must be
> verified against each vendor's live API before production. They are isolated in
> the adapter's `map*` functions and covered by tests against canned payloads, so
> correcting a path is a one-file change. Network is injected via `HttpGet`, so
> adapters are unit-testable without hitting the wire.

## Develop

```bash
npm test                  # 14 tests, no deps
node examples/pipeline.ts # offline data → valuation → report
```

Keys belong in env vars, never in code — see the root `.gitignore`.
