/**
 * End-to-end orchestrated job (offline):
 *   Orchestrator.submit → capture → understand → value → visualize → deliver,
 * with a webhook subscriber logging every event and the final report written to
 * disk. Swap MockProvider for ATTOM/HouseCanary and add real vision/render/
 * publish deps — the orchestrator doesn't change. Run: `node examples/run-job.ts`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  Orchestrator,
  EventBus,
  WebhookDispatcher,
  InMemoryJobStore,
  buildDefaultStages,
} from '../src/index.ts';
import { PropertyDataHub, MockProvider } from '../../connectors/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));

// Wire the data hub (mock provider) and build the default stages.
const mock = new MockProvider();
const hub = new PropertyDataHub({
  propertyProviders: [mock],
  avmProviders: [mock],
  parcelProvider: mock,
  permitsProvider: mock,
});

const stages = buildDefaultStages({
  hub,
  // A stand-in "Vision" scorer; real impl calls Claude on the captured media.
  vision: async () => 2,
  // A stand-in render step (returns image refs); real impl calls a render API.
  render: async () => ({ medium: { asIs: null, renovated: null, staged: null } }),
  // A stand-in publish step; real impl uploads to MinIO and returns a CDN URL.
  publish: async (jobId) => `https://reports.example.com/${jobId}.html`,
});

const events = new EventBus();
const webhooks = new WebhookDispatcher({ http: async () => ({ status: 200, ok: true }) });
webhooks.add({ url: 'https://partner.example.com/hooks', events: ['valuation.completed', 'report.ready'] });
events.subscribe(webhooks.handler);
events.subscribe((e) => console.log(`event: ${e.type}${e.stage ? ` [${e.stage}]` : ''}`));

const orchestrator = new Orchestrator({ store: new InMemoryJobStore(), events, stages });

const job = await orchestrator.submit({
  subject: { address: '123 Flip St, Phoenix, AZ 85021', radiusMiles: 2 },
  asOf: '2026-07-23',
  deal: { purchasePrice: 290_000, holdingCosts: 14_000, closingCosts: 18_000, desiredProfit: 40_000 },
  rental: { monthlyRent: 2400 },
  report: { certification: 'ai', propertyType: 'Single-family' },
});

console.log(`\nJob ${job.id} → ${job.status}`);
for (const name of ['capture', 'understand', 'value', 'visualize', 'deliver'] as const) {
  const s = job.stages[name];
  console.log(`  ${name.padEnd(11)} ${s.status.padEnd(10)} attempts=${s.attempts}`);
}
const v = job.context.valuation as { asIs: number; arv: Record<string, number> } | undefined;
if (v) {
  console.log(`\nAs-Is $${v.asIs.toLocaleString()} · ARV M $${v.arv.medium.toLocaleString()}`);
}
console.log(`Report URL: ${job.context.reportUrl}`);
console.log(`Webhook deliveries: ${webhooks.deliveries.map((d) => `${d.type}=${d.ok ? 'ok' : 'fail'}(${d.attempts})`).join(', ')}`);

if (typeof job.context.reportHtml === 'string') {
  const outDir = join(here, 'out');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'job-report.html');
  writeFileSync(outFile, job.context.reportHtml, 'utf8');
  console.log(`\nWrote ${outFile}`);
}
