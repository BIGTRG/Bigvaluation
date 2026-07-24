import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PgApiKeyStore,
  PgMeterStore,
  PgWatchStore,
  PgCaptureSessionStore,
  PgScopeStore,
} from '../src/stores/pgApiStores.ts';
import { FakeSqlClient } from './fakes.ts';

test('ApiKeyStore maps a row, scopes as array', async () => {
  const db = new FakeSqlClient();
  db.responder = () => [
    { key_id: 'k1', secret_hash: 'abc', account_id: 'a1', plan: 'pro', scopes: ['valuations:write'], active: true },
  ];
  const rec = await new PgApiKeyStore(db).findByKeyId('k1');
  assert.ok(rec);
  assert.equal(rec!.accountId, 'a1');
  assert.deepEqual(rec!.scopes, ['valuations:write']);
  assert.equal(rec!.active, true);
  assert.deepEqual(db.calls[0].params, ['k1']);
});

test('ApiKeyStore parses text[] scopes returned as a literal string', async () => {
  const db = new FakeSqlClient();
  db.responder = () => [
    { key_id: 'k1', secret_hash: 'abc', account_id: 'a1', plan: 'payg', scopes: '{reports:read,watches:write}', active: 't' },
  ];
  const rec = await new PgApiKeyStore(db).findByKeyId('k1');
  assert.deepEqual(rec!.scopes, ['reports:read', 'watches:write']);
  assert.equal(rec!.active, true);
});

test('ApiKeyStore returns null when not found', async () => {
  const db = new FakeSqlClient();
  db.responder = () => [];
  assert.equal(await new PgApiKeyStore(db).findByKeyId('nope'), null);
});

test('MeterStore records and totals (bigint sum as string)', async () => {
  const db = new FakeSqlClient();
  const meter = new PgMeterStore(db);
  await meter.record({ accountId: 'a1', endpoint: 'valuations.create', units: 1, at: 123 });
  assert.match(db.last().text, /INSERT INTO usage_events/);
  assert.deepEqual(db.last().params, ['a1', 'valuations.create', 1, 123]);

  db.responder = () => [{ total: '5' }]; // pg SUM returns bigint as string
  const total = await meter.total('a1', 100);
  assert.equal(total, 5);
  assert.match(db.last().text, /SUM\(units\)/);
  assert.deepEqual(db.last().params, ['a1', 100]);
});

test('WatchStore save/get/listByAccount', async () => {
  const db = new FakeSqlClient();
  const store = new PgWatchStore(db);
  await store.save({ id: 'w1', accountId: 'a1', subject: { address: 'x' }, webhookUrl: 'https://h', createdAt: 9 });
  assert.match(db.last().text, /INSERT INTO watches/);
  assert.equal(db.last().params[0], 'w1');
  assert.equal(db.last().params[2], JSON.stringify({ address: 'x' }));

  db.responder = () => [
    { id: 'w1', account_id: 'a1', subject: { address: 'x' }, last_valuation_id: null, webhook_url: 'https://h', created_at: 9 },
  ];
  const w = await store.get('w1');
  assert.equal(w!.accountId, 'a1');
  assert.equal(w!.webhookUrl, 'https://h');

  const list = await store.listByAccount('a1');
  assert.equal(list.length, 1);
  assert.match(db.last().text, /WHERE account_id = \$1/);
});

test('CaptureSessionStore save/get', async () => {
  const db = new FakeSqlClient();
  const store = new PgCaptureSessionStore(db);
  await store.save({ id: 'c1', accountId: 'a1', subject: {}, url: 'https://cap/s/c1', status: 'created', createdAt: 3 });
  assert.match(db.last().text, /INSERT INTO capture_sessions/);

  db.responder = () => [
    { id: 'c1', account_id: 'a1', subject: {}, url: 'https://cap/s/c1', status: 'created', created_at: 3 },
  ];
  const s = await store.get('c1');
  assert.equal(s!.url, 'https://cap/s/c1');
  assert.equal(s!.status, 'created');
});

test('ScopeStore save/get with line items', async () => {
  const db = new FakeSqlClient();
  const store = new PgScopeStore(db);
  const items = [{ label: 'kitchen', costUsd: 30000 }];
  await store.save({ id: 's1', accountId: 'a1', lineItems: items, createdAt: 1 });
  assert.match(db.last().text, /INSERT INTO scope_of_work/);
  assert.equal(db.last().params[3], JSON.stringify(items));

  db.responder = () => [{ id: 's1', account_id: 'a1', subject: null, line_items: items, created_at: 1 }];
  const s = await store.get('s1');
  assert.deepEqual(s!.lineItems, items);
  assert.equal(s!.subject, undefined);
});
