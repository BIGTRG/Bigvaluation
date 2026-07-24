import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectComps } from '../src/comps.ts';
import { buildBands, ceilingPricePerSqft } from '../src/bands.ts';
import { computeArv } from '../src/arv.ts';
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.ts';
import { comps, subject, AS_OF } from './fixtures.ts';
import type { WeightedComp } from '../src/types.ts';

function reno(sel: ReturnType<typeof selectComps>): WeightedComp[] {
  return sel.renovatedComps;
}

test('bands are ordered light <= medium <= high', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const bands = buildBands(reno(sel), DEFAULT_CONFIG);
  assert.ok(bands.light.pricePerSqft <= bands.medium.pricePerSqft);
  assert.ok(bands.medium.pricePerSqft <= bands.high.pricePerSqft);
  // Bands sit inside the observed renovated $/sqft range (260..330).
  assert.ok(bands.light.pricePerSqft >= 260 - 1);
  assert.ok(bands.high.pricePerSqft <= 330 + 1);
});

test('monotonic bands are enforced even on degenerate input', () => {
  // Inverted percentiles: light asks for a higher percentile than high.
  const cfg = resolveConfig({ bandPercentiles: { light: 0.9, medium: 0.5, high: 0.1 } });
  const sel = selectComps(subject.sqft, comps, cfg, { asOf: AS_OF });
  const bands = buildBands(reno(sel), cfg);
  assert.ok(bands.light.pricePerSqft <= bands.medium.pricePerSqft);
  assert.ok(bands.medium.pricePerSqft <= bands.high.pricePerSqft);
});

test('ARV = finishedSqft * band, and rises with tier', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const bands = buildBands(reno(sel), DEFAULT_CONFIG);
  const ceiling = ceilingPricePerSqft(reno(sel), DEFAULT_CONFIG);
  const { arv } = computeArv(subject.sqft, bands, ceiling);
  assert.equal(arv.medium, subject.sqft * Math.min(bands.medium.pricePerSqft, ceiling));
  assert.ok(arv.light < arv.medium);
  assert.ok(arv.medium < arv.high);
});

test('ceiling caps a runaway band', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const bands = buildBands(reno(sel), DEFAULT_CONFIG);
  // Force a very low ceiling and confirm every tier is capped to it.
  const { arv, capped } = computeArv(subject.sqft, bands, 100);
  assert.ok(capped.high);
  assert.equal(arv.high, subject.sqft * 100);
});

test('additions raise ARV via finishedSqft', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const bands = buildBands(reno(sel), DEFAULT_CONFIG);
  const ceiling = ceilingPricePerSqft(reno(sel), DEFAULT_CONFIG);
  const base = computeArv(1800, bands, ceiling).arv.medium;
  const added = computeArv(2100, bands, ceiling).arv.medium;
  assert.ok(added > base);
});
