import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WatchMonitor } from '../src/monitor.ts';
import type { WatchChangedEvent } from '../src/monitor.ts';
import { InMemoryWatchStore } from '../src/stores.ts';
import type { Watch } from '../src/types.ts';

const attestation = { businessPurpose: true, nonOwnerOccupied: true, attestedAt: 1 };

function makeWatch(overrides: Partial<Watch> = {}): Watch {
  return {
    id: 'wch_1',
    accountId: 'acct_1',
    subject: { address: '123 Flip St' },
    attestation,
    webhookUrl: 'https://hooks.example.com/w',
    createdAt: 1,
    ...overrides,
  };
}

function makeMonitor(opts: {
  values: { asIs: number; arv: number }[];
  threshold?: number;
  store?: InMemoryWatchStore;
}) {
  const store = opts.store ?? new InMemoryWatchStore();
  const notifications: { url: string; event: WatchChangedEvent }[] = [];
  let call = 0;
  const monitor = new WatchMonitor({
    watches: store,
    revalue: async () => {
      const v = opts.values[Math.min(call, opts.values.length - 1)];
      call++;
      return { valuationId: `job_${call}`, asIs: v.asIs, arv: v.arv };
    },
    notify: async (url, event) => {
      notifications.push({ url, event });
    },
    changeThreshold: opts.threshold,
    clock: { now: () => 1000 },
  });
  return { monitor, store, notifications };
}

test('first check sets the baseline without notifying', async () => {
  const { monitor, store, notifications } = makeMonitor({ values: [{ asIs: 300_000, arv: 420_000 }] });
  await store.save(makeWatch());
  const r = await monitor.tick();
  assert.deepEqual(r, { checked: 1, changed: 0, notified: 0, failed: 0 });
  assert.equal(notifications.length, 0);
  const w = await store.get('wch_1');
  assert.equal(w?.lastAsIs, 300_000);
  assert.equal(w?.lastArv, 420_000);
  assert.equal(w?.lastValuationId, 'job_1');
  assert.equal(w?.lastCheckedAt, 1000);
});

test('move beyond threshold fires watch.changed with previous and current values', async () => {
  const { monitor, store, notifications } = makeMonitor({
    values: [
      { asIs: 300_000, arv: 420_000 },
      { asIs: 300_000, arv: 441_000 }, // +5% ARV
    ],
  });
  await store.save(makeWatch());
  await monitor.tick(); // baseline
  const r = await monitor.tick();
  assert.deepEqual(r, { checked: 1, changed: 1, notified: 1, failed: 0 });
  assert.equal(notifications.length, 1);
  const e = notifications[0].event;
  assert.equal(e.type, 'watch.changed');
  assert.equal(e.previous.arv, 420_000);
  assert.equal(e.current.arv, 441_000);
  assert.equal(e.changeDelta, 0.05);
  const w = await store.get('wch_1');
  assert.equal(w?.notifiedAt, 1000);
});

test('small moves stay silent but still update the baseline', async () => {
  const { monitor, store, notifications } = makeMonitor({
    values: [
      { asIs: 300_000, arv: 420_000 },
      { asIs: 301_000, arv: 421_000 }, // ~0.3%
    ],
  });
  await store.save(makeWatch());
  await monitor.tick();
  const r = await monitor.tick();
  assert.deepEqual(r, { checked: 1, changed: 0, notified: 0, failed: 0 });
  assert.equal(notifications.length, 0);
  const w = await store.get('wch_1');
  assert.equal(w?.lastAsIs, 301_000);
});

test('watch without webhookUrl changes but never notifies', async () => {
  const { monitor, store, notifications } = makeMonitor({
    values: [
      { asIs: 300_000, arv: 420_000 },
      { asIs: 330_000, arv: 462_000 }, // +10%
    ],
  });
  await store.save(makeWatch({ webhookUrl: undefined }));
  await monitor.tick();
  const r = await monitor.tick();
  assert.deepEqual(r, { checked: 1, changed: 1, notified: 0, failed: 0 });
  assert.equal(notifications.length, 0);
});

test('a failing revaluation does not block other watches', async () => {
  const store = new InMemoryWatchStore();
  await store.save(makeWatch({ id: 'wch_bad', subject: { address: 'bad' } }));
  await store.save(makeWatch({ id: 'wch_good', subject: { address: 'good' } }));
  const monitor = new WatchMonitor({
    watches: store,
    revalue: async (w) => {
      if (w.subject.address === 'bad') throw new Error('provider down');
      return { valuationId: 'job_ok', asIs: 100, arv: 150 };
    },
    notify: async () => {},
    clock: { now: () => 2000 },
  });
  const r = await monitor.tick();
  assert.equal(r.failed, 1);
  assert.equal(r.checked, 1);
  const good = await store.get('wch_good');
  assert.equal(good?.lastAsIs, 100);
});

test('custom threshold is respected', async () => {
  const { monitor, store, notifications } = makeMonitor({
    values: [
      { asIs: 100_000, arv: 140_000 },
      { asIs: 101_000, arv: 141_400 }, // 1%
    ],
    threshold: 0.005,
  });
  await store.save(makeWatch());
  await monitor.tick();
  await monitor.tick();
  assert.equal(notifications.length, 1);
});
