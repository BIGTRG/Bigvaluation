import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectComps } from '../src/comps.ts';
import { computeAsIs } from '../src/asIs.ts';
import { conditionFactor } from '../src/condition.ts';
import { computeConfidence } from '../src/confidence.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { comps, subject, AS_OF } from './fixtures.ts';

test('As-Is blends 50/50 with the AVM', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const cf = conditionFactor(subject.conditionScore, DEFAULT_CONFIG);
  const withAvm = computeAsIs(subject.sqft, sel.allComps, cf, DEFAULT_CONFIG, {
    value: 400_000,
    provider: 'housecanary',
  });
  const expected = withAvm.compLeg * 0.5 + 400_000 * 0.5;
  assert.ok(Math.abs(withAvm.value - expected) < 1e-6);
});

test('As-Is still returns a value with no AVM (public-data only)', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const cf = conditionFactor(subject.conditionScore, DEFAULT_CONFIG);
  const noAvm = computeAsIs(subject.sqft, sel.allComps, cf, DEFAULT_CONFIG);
  assert.equal(noAvm.value, noAvm.compLeg);
  assert.equal(noAvm.avmLeg, undefined);
  assert.ok(noAvm.value > 0);
});

test('worse condition lowers As-Is', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const distressed = computeAsIs(
    subject.sqft,
    sel.allComps,
    conditionFactor(1, DEFAULT_CONFIG),
    DEFAULT_CONFIG,
  ).value;
  const average = computeAsIs(
    subject.sqft,
    sel.allComps,
    conditionFactor(3, DEFAULT_CONFIG),
    DEFAULT_CONFIG,
  ).value;
  assert.ok(distressed < average);
});

test('confidence: more comps and tighter spread => higher score, lower FSD', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const full = computeConfidence(sel.renovatedComps, sel.radiusMiles, AS_OF, DEFAULT_CONFIG);

  const sparse = computeConfidence([sel.renovatedComps[0]], sel.radiusMiles, AS_OF, DEFAULT_CONFIG);

  assert.ok(full.score > sparse.score);
  assert.ok(full.fsd < sparse.fsd);
  assert.ok(full.fsd >= DEFAULT_CONFIG.confidence.floor);
  assert.ok(full.fsd <= DEFAULT_CONFIG.confidence.cap);
  assert.equal(full.compCount, sel.renovatedComps.length);
  assert.match(full.note, /confidence/);
});

test('confidence score is bounded 0..100', () => {
  const sel = selectComps(subject.sqft, comps, DEFAULT_CONFIG, { asOf: AS_OF });
  const c = computeConfidence(sel.renovatedComps, sel.radiusMiles, AS_OF, DEFAULT_CONFIG);
  assert.ok(c.score >= 0 && c.score <= 100);
});
