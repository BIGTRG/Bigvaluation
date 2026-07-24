import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../src/orchestrator.ts';
import { EventBus } from '../src/events.ts';
import { InMemoryJobStore } from '../src/store.ts';
import type { StageDefinition, StageName, JobEventType } from '../src/types.ts';

/** Deterministic orchestrator: monotonic clock, counter ids, zero backoff. */
function makeOrchestrator(stages: StageDefinition[], events = new EventBus()) {
  let t = 1000;
  let n = 0;
  return {
    events,
    orch: new Orchestrator({
      store: new InMemoryJobStore(),
      events,
      stages,
      backoffMs: () => 0,
      clock: { now: () => t++ },
      idFactory: () => `job_${++n}`,
    }),
  };
}

const noop = async () => ({});

test('runs stages respecting dependencies (diamond DAG)', async () => {
  const order: StageName[] = [];
  const rec = (name: StageName): StageDefinition['handler'] => async () => {
    order.push(name);
    return {};
  };
  const stages: StageDefinition[] = [
    { name: 'capture', dependsOn: [], handler: rec('capture') },
    { name: 'understand', dependsOn: ['capture'], handler: rec('understand') },
    { name: 'value', dependsOn: ['capture'], handler: rec('value') },
    { name: 'visualize', dependsOn: ['understand', 'value'], handler: rec('visualize') },
    { name: 'deliver', dependsOn: ['visualize'], handler: rec('deliver') },
  ];
  const { orch } = makeOrchestrator(stages);
  const job = await orch.submit({ subject: {} });

  assert.equal(job.status, 'completed');
  // capture first; the two middle branches before visualize; visualize before deliver.
  assert.equal(order[0], 'capture');
  assert.ok(order.indexOf('understand') < order.indexOf('visualize'));
  assert.ok(order.indexOf('value') < order.indexOf('visualize'));
  assert.ok(order.indexOf('visualize') < order.indexOf('deliver'));
});

test('retries a failing stage up to maxAttempts, then succeeds', async () => {
  let calls = 0;
  const stages: StageDefinition[] = [
    { name: 'capture', dependsOn: [], handler: noop },
    {
      name: 'value',
      dependsOn: ['capture'],
      maxAttempts: 3,
      handler: async () => {
        calls++;
        if (calls < 3) throw new Error(`boom ${calls}`);
        return { valuation: { asIs: 1, arv: {} } };
      },
    },
  ];
  const { orch, events } = makeOrchestrator(stages);
  const job = await orch.submit({ subject: {} });

  assert.equal(job.status, 'completed');
  assert.equal(job.stages.value.status, 'succeeded');
  assert.equal(job.stages.value.attempts, 3);
  const retrying = events.log.filter((e) => e.type === 'stage.retrying' && e.stage === 'value');
  assert.equal(retrying.length, 2);
});

test('a required stage failure fails the job and blocks downstream', async () => {
  const stages: StageDefinition[] = [
    { name: 'capture', dependsOn: [], handler: noop },
    {
      name: 'value',
      dependsOn: ['capture'],
      maxAttempts: 2,
      handler: async () => {
        throw new Error('valuation unavailable');
      },
    },
    { name: 'deliver', dependsOn: ['value'], handler: noop },
  ];
  const { orch, events } = makeOrchestrator(stages);
  const job = await orch.submit({ subject: {} });

  assert.equal(job.status, 'failed');
  assert.match(job.error ?? '', /valuation unavailable/);
  assert.equal(job.stages.value.status, 'failed');
  assert.equal(job.stages.value.attempts, 2);
  assert.equal(job.stages.deliver.status, 'pending'); // never ran
  assert.ok(events.log.some((e) => e.type === 'job.failed'));
});

test('an optional stage failure is skipped; the job still completes', async () => {
  const stages: StageDefinition[] = [
    { name: 'capture', dependsOn: [], handler: noop },
    { name: 'value', dependsOn: ['capture'], handler: async () => ({ valuation: { asIs: 1, arv: {} } }) },
    {
      name: 'visualize',
      dependsOn: ['value'],
      required: false,
      maxAttempts: 1,
      handler: async () => {
        throw new Error('render API down');
      },
    },
    { name: 'deliver', dependsOn: ['value', 'visualize'], handler: noop },
  ];
  const { orch } = makeOrchestrator(stages);
  const job = await orch.submit({ subject: {} });

  assert.equal(job.status, 'completed');
  assert.equal(job.stages.visualize.status, 'skipped');
  assert.equal(job.stages.deliver.status, 'succeeded'); // ran despite skipped dep
});

test('emits valuation.completed and report.ready milestones', async () => {
  const stages: StageDefinition[] = [
    { name: 'capture', dependsOn: [], handler: noop },
    {
      name: 'value',
      dependsOn: ['capture'],
      handler: async () => ({ valuation: { asIs: 379500, arv: { medium: 507500 } } }),
    },
    { name: 'deliver', dependsOn: ['value'], handler: async () => ({ reportUrl: 'https://x/y.html' }) },
  ];
  const { orch, events } = makeOrchestrator(stages);
  await orch.submit({ subject: {} });

  const types = events.log.map((e) => e.type);
  assert.ok(types.includes('valuation.completed'));
  assert.ok(types.includes('report.ready'));
  const vc = events.log.find((e) => e.type === 'valuation.completed');
  assert.equal(vc?.data?.asIs, 379500);
  const rr = events.log.find((e) => e.type === 'report.ready');
  assert.equal(rr?.data?.reportUrl, 'https://x/y.html');
});

test('rejects a DAG with an unknown dependency or a cycle', () => {
  assert.throws(
    () =>
      new Orchestrator({
        store: new InMemoryJobStore(),
        events: new EventBus(),
        stages: [{ name: 'value', dependsOn: ['understand'], handler: noop }],
      }),
    /unknown stage/,
  );
  assert.throws(
    () =>
      new Orchestrator({
        store: new InMemoryJobStore(),
        events: new EventBus(),
        stages: [
          { name: 'value', dependsOn: ['deliver'], handler: noop },
          { name: 'deliver', dependsOn: ['value'], handler: noop },
        ],
      }),
    /cycle/,
  );
});

test('createJob persists a queued job with all stages pending', async () => {
  const stages: StageDefinition[] = [{ name: 'capture', dependsOn: [], handler: noop }];
  const { orch } = makeOrchestrator(stages);
  const job = await orch.createJob({ subject: {} });
  assert.equal(job.status, 'queued');
  assert.equal(job.stages.capture.status, 'pending');
  assert.equal(job.id, 'job_1');
});
