import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, hasRealProviders } from '../src/config.ts';
import { parseSeedKey } from '../src/seed.ts';
import { buildApp } from '../src/buildApp.ts';
import type { ApiRequest } from '../../api/src/index.ts';

function req(method: ApiRequest['method'], path: string, key?: string, body?: unknown): ApiRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers['authorization'] = `Bearer ${key}`;
  return { method, path, headers, query: {}, body };
}

test('loadConfig reads env with sensible defaults', () => {
  const cfg = loadConfig({ PORT: '9000', SEED_API_KEY: 'fmk_demo.secret123' } as never);
  assert.equal(cfg.port, 9000);
  assert.equal(cfg.databaseUrl, undefined);
  assert.equal(cfg.migrateOnBoot, false);
  assert.equal(hasRealProviders(cfg), false);
});

test('hasRealProviders is true only with an ATTOM key', () => {
  assert.equal(hasRealProviders(loadConfig({} as never)), false);
  assert.equal(hasRealProviders(loadConfig({ ATTOM_API_KEY: 'x' } as never)), true);
});

test('parseSeedKey splits fmk_<keyId>.<secret>', () => {
  assert.deepEqual(parseSeedKey('fmk_demo.secret123'), { keyId: 'demo', secret: 'secret123' });
  assert.deepEqual(parseSeedKey('demo.secret'), { keyId: 'demo', secret: 'secret' });
  assert.equal(parseSeedKey('nodot'), null);
});

test('buildApp (in-memory) boots and reports mode', async () => {
  const cfg = loadConfig({ SEED_API_KEY: 'fmk_demo.secret123' } as never);
  const app = await buildApp(cfg);
  assert.equal(app.mode.storage, 'memory');
  assert.equal(app.mode.data, 'mock');

  const health = await app.api.handle(req('GET', '/health'));
  assert.equal(health.status, 200);
  await app.dispose();
});

test('the composed server serves a real valuation with the seeded key', async () => {
  const cfg = loadConfig({ SEED_API_KEY: 'fmk_demo.secret123' } as never);
  const app = await buildApp(cfg);

  const res = await app.api.handle(
    req('POST', '/valuations', 'fmk_demo.secret123', {
      attestation: { businessPurpose: true, nonOwnerOccupied: true },
      subject: { address: '123 Flip St, Phoenix, AZ 85021', radiusMiles: 2 },
      conditionScore: 2,
      deal: { purchasePrice: 290_000 },
      rental: { monthlyRent: 2400 },
    }),
  );
  assert.equal(res.status, 201);
  const b = res.body as Record<string, any>;
  assert.equal(b.status, 'completed');
  assert.ok(b.asIs > 0);
  assert.ok(b.arv.light < b.arv.medium && b.arv.medium < b.arv.high);
  assert.match(b.reportId, /^FM-/);

  // The report is retrievable through the same composed app.
  const report = await app.api.handle(req('GET', `/reports/${b.reportId}`, 'fmk_demo.secret123'));
  assert.equal(report.status, 200);
  assert.match(report.body as string, /not a licensed appraisal/i);
  await app.dispose();
});

test('an unseeded server rejects all keys (401)', async () => {
  const cfg = loadConfig({} as never); // no SEED_API_KEY
  const app = await buildApp(cfg);
  const res = await app.api.handle(req('POST', '/valuations', 'fmk_demo.secret123', { subject: { address: 'x' }, attestation: { businessPurpose: true, nonOwnerOccupied: true } }));
  assert.equal(res.status, 401);
  await app.dispose();
});
