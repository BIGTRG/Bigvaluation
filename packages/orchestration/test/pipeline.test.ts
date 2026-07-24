import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../src/orchestrator.ts';
import { EventBus } from '../src/events.ts';
import { InMemoryJobStore } from '../src/store.ts';
import { buildDefaultStages } from '../src/pipeline.ts';
import { PropertyDataHub, MockProvider } from '../../connectors/src/index.ts';

function makePipeline(overrides?: { render?: boolean }) {
  const mock = new MockProvider();
  const hub = new PropertyDataHub({
    propertyProviders: [mock],
    avmProviders: [mock],
    parcelProvider: mock,
    permitsProvider: mock,
  });
  const stages = buildDefaultStages({
    hub,
    vision: async () => 2,
    render: overrides?.render === false ? undefined : async () => ({ medium: {} }),
    publish: async (jobId) => `https://reports.example.com/${jobId}.html`,
  });
  const events = new EventBus();
  let t = 0;
  let n = 0;
  const orch = new Orchestrator({
    store: new InMemoryJobStore(),
    events,
    stages,
    clock: { now: () => t++ },
    idFactory: () => `job_${++n}`,
  });
  return { orch, events };
}

const input = {
  subject: { address: '123 Flip St, Phoenix, AZ 85021', radiusMiles: 2 },
  asOf: '2026-07-23',
  deal: { purchasePrice: 290_000, holdingCosts: 14_000, closingCosts: 18_000, desiredProfit: 40_000 },
  rental: { monthlyRent: 2400 },
  report: { certification: 'ai' as const, propertyType: 'Single-family' },
};

test('the default pipeline runs data → valuation → report end to end', async () => {
  const { orch, events } = makePipeline();
  const job = await orch.submit(input);

  assert.equal(job.status, 'completed');
  for (const name of ['capture', 'understand', 'value', 'visualize', 'deliver'] as const) {
    assert.equal(job.stages[name].status, 'succeeded', `${name} should succeed`);
  }

  const v = job.context.valuation as { asIs: number; arv: Record<string, number> };
  assert.ok(v.asIs > 0);
  assert.ok(v.arv.light < v.arv.medium && v.arv.medium < v.arv.high);

  assert.equal(typeof job.context.reportHtml, 'string');
  assert.match(job.context.reportHtml as string, /not a licensed appraisal/i);
  assert.equal(job.context.reportUrl, `https://reports.example.com/${job.id}.html`);

  const types = events.log.map((e) => e.type);
  assert.ok(types.includes('valuation.completed'));
  assert.ok(types.includes('report.ready'));
  assert.ok(types.includes('job.completed'));
});

test('condition score from the vision hook flows into the valuation', async () => {
  const { orch } = makePipeline();
  const job = await orch.submit(input);
  assert.equal(job.context.conditionScore, 2);
  const v = job.context.valuation as { audit: { conditionScore: number } };
  assert.equal(v.audit.conditionScore, 2);
});

test('report still delivered when rendering is unavailable (optional stage)', async () => {
  const { orch } = makePipeline({ render: false });
  const job = await orch.submit(input);
  assert.equal(job.status, 'completed');
  assert.equal(typeof job.context.reportHtml, 'string');
});
