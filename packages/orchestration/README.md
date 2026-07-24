# @flip-master/orchestration

The async job pipeline (§7). Runs a valuation report through five stages —
**Capture → Understand → Value → Visualize → Deliver** — as a dependency DAG,
with per-stage retries, parallel execution of independent stages, and webhook
events (§9). Composes the engine, connectors, and report builder without any of
them knowing about each other.

## Pipeline

```
capture ─▶ understand ─▶ value ─▶ visualize ─▶ deliver
(media)    (condition,   (data    (AI renders, (render
           §4.1 Vision)  hub +     optional)   report §3)
                         engine)
```

- **Retries:** each stage retries up to `maxAttempts` with backoff.
- **Required vs optional:** a required stage's failure fails the job; an optional
  one (e.g. `visualize`) is skipped so a render outage still delivers a report.
- **Events (§9):** `job.started/completed/failed`, `stage.*`,
  `valuation.completed`, `report.ready` — delivered to webhook subscribers.

## Usage

```ts
import {
  Orchestrator, EventBus, WebhookDispatcher, InMemoryJobStore, buildDefaultStages,
} from '@flip-master/orchestration';
import { PropertyDataHub, MockProvider } from '@flip-master/connectors';

const hub = new PropertyDataHub({ propertyProviders: [new MockProvider()], avmProviders: [new MockProvider()] });
const stages = buildDefaultStages({
  hub,
  vision:  async () => 2,                                   // Claude condition scoring
  render:  async (v) => ({ /* image refs */ }),            // render API
  publish: async (id, html) => `https://cdn/${id}.html`,   // MinIO upload
});

const events = new EventBus();
const webhooks = new WebhookDispatcher();
webhooks.add({ url: 'https://partner/hooks', events: ['valuation.completed', 'report.ready'] });
events.subscribe(webhooks.handler);

const orch = new Orchestrator({ store: new InMemoryJobStore(), events, stages });
const job = await orch.submit({ subject: { address: '123 Flip St' }, asOf: '2026-07-23' });
// job.context.valuation, job.context.reportHtml, job.context.reportUrl
```

See `examples/run-job.ts` for a full offline run.

## Swappable adapters (§6)

| Slot | Interface | Default | Production |
|---|---|---|---|
| Job store | `JobStore` | `InMemoryJobStore` | Postgres |
| Queue | `JobQueue` | `InMemoryJobQueue` | SQS / Redis / pg-boss |
| Webhook transport | `HttpPost` | `fetchHttpPost` | signed delivery |
| Clock / sleep / ids | injected | wall clock / UUID | — |

The orchestrator is generic: it runs whatever `StageDefinition[]` you give it.
`buildDefaultStages` is one composition; you can define others (a re-value job
for live monitoring, a scope-only job, etc.) without touching the runner.

## Develop

```bash
npm test                 # 15 tests, deterministic (injected clock/ids), no deps
node examples/run-job.ts # full pipeline, offline, writes examples/out/job-report.html
```
