import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, WebhookDispatcher } from '../src/events.ts';
import type { JobEvent } from '../src/types.ts';

function evt(type: JobEvent['type'], jobId = 'j1'): JobEvent {
  return { type, jobId, at: 1 };
}

test('EventBus isolates a failing subscriber', async () => {
  const bus = new EventBus();
  const seen: string[] = [];
  bus.subscribe(() => {
    throw new Error('bad subscriber');
  });
  bus.subscribe((e) => {
    seen.push(e.type);
  });
  await bus.emit(evt('job.started'));
  assert.deepEqual(seen, ['job.started']); // good subscriber still ran
  assert.equal(bus.log.length, 1);
});

test('WebhookDispatcher filters by event type', async () => {
  const calls: string[] = [];
  const wh = new WebhookDispatcher({
    http: async (url) => {
      calls.push(url);
      return { status: 200, ok: true };
    },
  });
  wh.add({ url: 'https://a/hook', events: ['report.ready'] });

  await wh.handler(evt('valuation.completed')); // filtered out
  assert.equal(calls.length, 0);
  await wh.handler(evt('report.ready')); // delivered
  assert.equal(calls.length, 1);
});

test('WebhookDispatcher retries failed deliveries up to maxAttempts', async () => {
  let attempts = 0;
  const wh = new WebhookDispatcher({
    maxAttempts: 3,
    http: async () => {
      attempts++;
      return { status: 500, ok: false };
    },
  });
  wh.add({ url: 'https://a/hook' }); // no filter = all events
  await wh.handler(evt('report.ready'));
  assert.equal(attempts, 3);
  assert.equal(wh.deliveries[0].ok, false);
  assert.equal(wh.deliveries[0].attempts, 3);
});

test('WebhookDispatcher stops retrying once a delivery succeeds', async () => {
  let attempts = 0;
  const wh = new WebhookDispatcher({
    maxAttempts: 5,
    http: async () => {
      attempts++;
      return { status: attempts >= 2 ? 200 : 503, ok: attempts >= 2 };
    },
  });
  wh.add({ url: 'https://a/hook' });
  await wh.handler(evt('report.ready'));
  assert.equal(attempts, 2);
  assert.equal(wh.deliveries[0].ok, true);
});

test('an EventBus + WebhookDispatcher wire together end to end', async () => {
  const bus = new EventBus();
  const wh = new WebhookDispatcher({ http: async () => ({ status: 200, ok: true }) });
  wh.add({ url: 'https://a/hook', events: ['valuation.completed'] });
  bus.subscribe(wh.handler);

  await bus.emit(evt('valuation.completed'));
  await bus.emit(evt('stage.started'));
  assert.equal(wh.deliveries.length, 1);
  assert.equal(wh.deliveries[0].type, 'valuation.completed');
});
