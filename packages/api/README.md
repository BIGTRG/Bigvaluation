# @flip-master/api

The licensing API (§9) — the HTTP surface that makes the valuation platform
sellable and licensable. Framework-free (Node's built-in `http`), with a
transport-agnostic core so every endpoint is unit-testable without a socket.

## Endpoints

| Method & path | Scope | Notes |
|---|---|---|
| `GET /health` | — | public |
| `POST /valuations` | `valuations:write` | runs the pipeline; **billable**; returns summary + report links |
| `GET /valuations/:id` | `valuations:read` | owner-scoped; 404 for others |
| `GET /reports/:id` | `reports:read` | HTML by default, `?format=json` for an envelope |
| `POST /watches` | `watches:write` | live-monitoring subscription (§5) |
| `POST /capture-sessions` | `capture:write` | returns the tokenized mobile capture link (§4.1) |
| `POST /scope-of-work` | `scope:write` | line items → stored scope (§4.3) |
| `POST /webhooks` | `webhooks:write` | register a URL + event filter |

**Webhook events (§9):** `valuation.completed`, `valuation.updated`,
`report.ready`, `watch.changed` — delivered with retries by the orchestration
layer's `WebhookDispatcher`.

## Auth (§9)

`Authorization: Bearer fmk_<keyId>.<secret>` (or `x-api-key`). Only a **hash** of
the secret is stored, compared in constant time — a leaked database exposes no
usable keys. Scopes are checked per route (`*` grants all). Each successful
billable call is recorded to the `MeterStore` for usage billing.

## Run it

```bash
node examples/serve.ts     # boots on :8787 with a demo key (mock-backed)

curl -s localhost:8787/health
curl -s -X POST localhost:8787/valuations \
  -H 'authorization: Bearer fmk_demo.secret123' -H 'content-type: application/json' \
  -d '{"subject":{"address":"123 Flip St, Phoenix, AZ 85021","radiusMiles":2},
       "deal":{"purchasePrice":290000},"rental":{"monthlyRent":2400}}'
```

Returns:
```json
{ "id": "job_…", "status": "completed", "asIs": 379500,
  "arv": { "light": 488000, "medium": 507500, "high": 548500 },
  "confidence": { "score": 79, "fsd": 0.11 },
  "reportId": "FM-job_…", "reportUrl": "https://…",
  "links": { "self": "/valuations/…", "report": "/reports/FM-…" } }
```

## Swap for production (§6, §8)

`createDemoApi()` wires in-memory stores + a mock data hub. In production, replace
each `InMemory*Store` with a Postgres-backed store (the §8 data model) and the
`MockProvider` with real ATTOM/HouseCanary providers — the `Api` class is
unchanged. `createHttpServer(api)` is the only file that touches sockets.

## Develop

```bash
npm test          # 17 tests, no deps: auth, scopes, metering, endpoints, webhooks
node examples/serve.ts
```
