import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropertyDataHub, toValuationRequest, dedupeComps } from '../src/hub.ts';
import { MockProvider, FailingProvider, SAMPLE_DATASET } from '../src/providers/mock.ts';
import { computeValuation } from '../../valuation-engine/src/index.ts';
import type { Comp } from '../../valuation-engine/src/index.ts';

const q = { address: '123 Flip St, Phoenix, AZ 85021', radiusMiles: 2 as const };
const ctx = { asOf: '2026-07-23' };

test('assembles subject, comps, and AVM from a provider', async () => {
  const mock = new MockProvider();
  const hub = new PropertyDataHub({ propertyProviders: [mock], avmProviders: [mock] });
  const data = await hub.assemble(q, ctx);
  assert.equal(data.subject.address, q.address);
  assert.equal(data.comps.length, SAMPLE_DATASET.comps.length);
  assert.ok(data.avm && data.avm.value === 360_000);
  assert.ok(data.sources.some((s) => s.field === 'subject' && s.status === 'ok'));
});

test('falls back to the next provider when the primary errors', async () => {
  const mock = new MockProvider();
  const hub = new PropertyDataHub({ propertyProviders: [new FailingProvider(), mock] });
  const data = await hub.assemble(q, ctx);
  assert.equal(data.subject.address, q.address); // recovered via fallback
  assert.ok(data.sources.some((s) => s.provider === 'FailingProvider' && s.status === 'error'));
  assert.ok(data.sources.some((s) => s.field === 'subject' && s.status === 'fallback'));
  assert.ok(data.warnings.some((w) => /failed/i.test(w)));
});

test('never throws when all providers fail — degrades to query address', async () => {
  const hub = new PropertyDataHub({ propertyProviders: [new FailingProvider('A'), new FailingProvider('B')] });
  const data = await hub.assemble(q, ctx);
  assert.equal(data.subject.address, q.address);
  assert.equal(data.comps.length, 0);
  assert.ok(data.warnings.length > 0);
});

test('classifier marks premium as-is comps renovated only when appropriate', async () => {
  const mock = new MockProvider();
  const hub = new PropertyDataHub({ propertyProviders: [mock] });
  const data = await hub.assemble(q, ctx);
  const renovated = data.comps.filter((c) => c.renovated);
  // The 6 explicitly-renovated comps stay renovated; the 3 as-is (175-190 $/sqft,
  // well below median) stay as-is.
  assert.ok(renovated.length >= 6);
  const asis = data.comps.find((c) => c.id === 'a2');
  assert.equal(asis?.renovated, false);
});

test('dedupeComps removes repeats by id and by address+sqft', () => {
  const base: Comp = {
    id: 'x1', address: '1 A St', sqft: 1500, salePrice: 300_000, saleDate: '2026-01-01',
    distanceMiles: 1, renovated: true,
  };
  const noId = { ...base, id: '' };
  const deduped = dedupeComps([base, { ...base }, { ...noId }, { ...noId }]);
  assert.equal(deduped.length, 2); // one by id, one by address+sqft
});

test('toValuationRequest bridges assembled data into a runnable request', async () => {
  const mock = new MockProvider();
  const hub = new PropertyDataHub({ propertyProviders: [mock], avmProviders: [mock] });
  const data = await hub.assemble(q, ctx);
  const request = toValuationRequest(data, 2, {
    asOf: ctx.asOf,
    deal: { purchasePrice: 290_000 },
    rental: { monthlyRent: 2400 },
  });
  const v = computeValuation(request);
  assert.ok(v.asIs > 0);
  assert.ok(v.arv.light < v.arv.medium && v.arv.medium < v.arv.high);
  assert.equal(v.audit.avmProvider, 'MockAVM');
});

test('flags a recorded-vs-observed sqft delta as a possible addition', async () => {
  const mock = new MockProvider({
    ...SAMPLE_DATASET,
    subject: { ...SAMPLE_DATASET.subject, sqft: 2100 }, // observed > recorded 1800
  });
  const hub = new PropertyDataHub({ propertyProviders: [mock], parcelProvider: mock });
  const data = await hub.assemble(q, ctx);
  assert.ok(data.warnings.some((w) => /addition/i.test(w)));
});
