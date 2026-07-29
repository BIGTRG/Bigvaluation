import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, migrationFiles } from '../src/migrate.ts';
import { createPgStores } from '../src/index.ts';
import { FakeSqlClient } from './fakes.ts';

test('migrationFiles returns ordered SQL with the schema', () => {
  const files = migrationFiles();
  assert.ok(files.length >= 1);
  assert.equal(files[0].name, '0001_init.sql');
  assert.match(files[0].sql, /CREATE TABLE IF NOT EXISTS jobs/);
  assert.match(files[0].sql, /CREATE TABLE IF NOT EXISTS valuations/);
  assert.match(files[0].sql, /usage_events/);
});

test('migrate applies each file against the client', async () => {
  const db = new FakeSqlClient();
  const applied = await migrate(db);
  assert.deepEqual(applied, ['0001_init.sql', '0002_compliance_monitoring.sql', '0003_billing.sql']);
  assert.equal(db.calls.length, 3);
  assert.match(db.calls[0].text, /CREATE TABLE IF NOT EXISTS accounts/);
  assert.match(db.calls[1].text, /attestation/);
});

test('createPgStores wires every store to one client', () => {
  const db = new FakeSqlClient();
  const stores = createPgStores(db);
  for (const key of ['jobStore', 'apiKeys', 'meter', 'watches', 'captures', 'scopes'] as const) {
    assert.ok(stores[key], `missing ${key}`);
  }
});

test('the schema never introduces demographic / protected-class columns (§4.7)', () => {
  for (const file of migrationFiles()) {
    const sql = file.sql.toLowerCase();
    for (const banned of ['race', 'ethnic', 'religion', 'gender', 'national_origin', 'disability']) {
      assert.ok(!sql.includes(banned), `${file.name} must not reference ${banned}`);
    }
  }
});
