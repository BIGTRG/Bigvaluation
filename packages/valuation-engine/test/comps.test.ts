import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectComps } from '../src/comps.ts';
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.ts';
import { comps, subject, AS_OF } from './fixtures.ts';

test('selects the 2mi ring when it has enough renovated comps', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  assert.equal(sel.radiusMiles, 2);
  assert.equal(sel.widened, false);
  // 5 renovated comps inside 2mi (r1..r5); r6 is at 2.6mi.
  assert.equal(sel.renovatedComps.length, 5);
});

test('widens to 3mi when the 2mi ring is too sparse', () => {
  const cfg = resolveConfig({ minRenovatedComps: 6 });
  const sel = selectComps(subject.sqft, comps, cfg, { asOf: AS_OF });
  assert.equal(sel.radiusMiles, 3);
  assert.equal(sel.widened, true);
  assert.equal(sel.renovatedComps.length, 6); // now includes r6
});

test('closer/newer/same-size comps carry more weight', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const r1 = sel.renovatedComps.find((c) => c.id === 'r1')!; // 0.4mi, recent
  const r5 = sel.renovatedComps.find((c) => c.id === 'r5')!; // 1.9mi, older
  assert.ok(r1.weight > r5.weight);
  assert.ok(r1.weight > 0 && r1.weight <= 1);
});

test('derives pricePerSqft on each weighted comp', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const r1 = sel.renovatedComps.find((c) => c.id === 'r1')!;
  assert.equal(r1.pricePerSqft, 260);
});
