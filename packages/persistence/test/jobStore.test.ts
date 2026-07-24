import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PgJobStore, rowToJob } from '../src/stores/pgJobStore.ts';
import { FakeSqlClient, JobsTableFake } from './fakes.ts';
import { Orchestrator, EventBus } from '../../orchestration/src/index.ts';
import type { Job } from '../../orchestration/src/index.ts';
import type { StageDefinition } from '../../orchestration/src/index.ts';

function sampleJob(): Job {
  return {
    id: 'job_1',
    status: 'completed',
    createdAt: 1000,
    updatedAt: 2000,
    input: { subject: { address: '123 Flip St' }, accountId: 'acct_9' },
    stages: {
      capture: { name: 'capture', status: 'succeeded', attempts: 1 },
    } as never,
    context: { valuation: { asIs: 379500 }, reportHtml: '<html></html>' },
    error: undefined,
  };
}

test('save upserts with the right SQL and params', async () => {
  const db = new FakeSqlClient();
  const store = new PgJobStore(db);
  await store.save(sampleJob());

  const call = db.last();
  assert.match(call.text, /INSERT INTO jobs/);
  assert.match(call.text, /ON CONFLICT \(id\) DO UPDATE/);
  assert.equal(call.params[0], 'job_1');
  assert.equal(call.params[1], 'acct_9'); // account_id extracted from input
  assert.equal(call.params[2], 'completed');
  assert.equal(call.params[3], JSON.stringify(sampleJob().input));
  assert.equal(call.params[6], null); // error
  assert.equal(call.params[7], 1000); // created_at
  assert.equal(call.params[8], 2000); // updated_at
});

test('save with no accountId writes null', async () => {
  const db = new FakeSqlClient();
  const store = new PgJobStore(db);
  const job = sampleJob();
  job.input = { subject: {} };
  await store.save(job);
  assert.equal(db.last().params[1], null);
});

test('get maps a row back to a Job (jsonb as object or string)', async () => {
  const db = new FakeSqlClient();
  db.responder = () => [
    {
      id: 'job_1',
      status: 'completed',
      created_at: '1000', // bigint often arrives as string
      updated_at: 2000,
      input: { subject: { address: 'x' }, accountId: 'a' }, // object (pg jsonb)
      stages: '{"capture":{"name":"capture","status":"succeeded","attempts":1}}', // string
      context: { valuation: { asIs: 1 } },
      error: null,
    },
  ];
  const store = new PgJobStore(db);
  const job = await store.get('job_1');
  assert.ok(job);
  assert.equal(job!.createdAt, 1000);
  assert.equal(job!.updatedAt, 2000);
  assert.equal((job!.input as { accountId: string }).accountId, 'a');
  assert.equal(job!.stages.capture.status, 'succeeded');
  assert.equal(job!.error, undefined);
  // Verify the query was parameterized, not string-interpolated.
  assert.deepEqual(db.calls[0].params, ['job_1']);
});

test('get returns null when no row', async () => {
  const db = new FakeSqlClient();
  db.responder = () => [];
  const store = new PgJobStore(db);
  assert.equal(await store.get('missing'), null);
});

test('rowToJob is a pure mapper', () => {
  const job = rowToJob({
    id: 'j',
    status: 'running',
    created_at: 5,
    updated_at: 6,
    input: '{"a":1}',
    stages: '{}',
    context: '{}',
    error: 'boom',
  });
  assert.equal(job.status, 'running');
  assert.equal(job.error, 'boom');
  assert.deepEqual(job.input, { a: 1 });
});

test('round-trips a real orchestrator job through PgJobStore', async () => {
  const db = new JobsTableFake();
  const store = new PgJobStore(db);
  const stages: StageDefinition[] = [
    { name: 'capture', dependsOn: [], handler: async () => ({}) },
    { name: 'value', dependsOn: ['capture'], handler: async () => ({ valuation: { asIs: 379500 } }) },
  ];
  let t = 0;
  let n = 0;
  const orch = new Orchestrator({
    store,
    events: new EventBus(),
    stages,
    clock: { now: () => t++ },
    idFactory: () => `job_${++n}`,
  });

  const job = await orch.submit({ subject: { address: 'x' }, accountId: 'acct_z' });
  assert.equal(job.status, 'completed');

  // Reload straight from the store — proves persistence + mapping end to end.
  const reloaded = await store.get(job.id);
  assert.ok(reloaded);
  assert.equal(reloaded!.status, 'completed');
  assert.equal((reloaded!.input as { accountId: string }).accountId, 'acct_z');
  assert.equal((reloaded!.context.valuation as { asIs: number }).asIs, 379500);
});
