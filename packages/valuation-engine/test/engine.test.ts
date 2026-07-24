import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeValuation, NOT_AN_APPRAISAL } from '../src/engine.ts';
import type { ValuationRequest } from '../src/engine.ts';
import { comps, subject, AS_OF } from './fixtures.ts';

function baseRequest(): ValuationRequest {
  return {
    subject,
    comps,
    asOf: AS_OF,
    avm: { value: 360_000, provider: 'housecanary', fsd: 0.08 },
    deal: { purchasePrice: 290_000, holdingCosts: 14_000, closingCosts: 18_000, desiredProfit: 40_000 },
    rental: { monthlyRent: 2400 },
  };
}

test('end-to-end valuation produces coherent, ordered outputs', () => {
  const v = computeValuation(baseRequest());

  // As-Is below every ARV tier (distressed subject).
  assert.ok(v.asIs > 0);
  assert.ok(v.asIs < v.arv.light);

  // Three tiers, strictly increasing.
  assert.ok(v.arv.light < v.arv.medium);
  assert.ok(v.arv.medium < v.arv.high);

  // Confidence populated and bounded.
  assert.ok(v.confidence.score >= 0 && v.confidence.score <= 100);
  assert.equal(v.confidence.radiusMiles, v.radiusMiles);

  // Deal math present for every tier; profit shrinks as rehab grows across tiers
  // only if ARV lift doesn't outpace rehab — just assert fields exist and are finite.
  for (const tier of ['light', 'medium', 'high'] as const) {
    assert.equal(typeof v.deal[tier].maxAllowableOffer, 'number');
    assert.ok(Number.isFinite(v.deal[tier].maxAllowableOffer));
    assert.equal(v.deal[tier].projectedProfit !== undefined, true);
  }

  // Rental value present.
  assert.ok(v.rental && v.rental.incomeValue > 0);

  // Compliance: disclaimer rides along, never the word "appraisal" as a value.
  assert.ok(v.audit.generatedNote.startsWith(NOT_AN_APPRAISAL));

  // Audit trail is complete.
  assert.equal(v.audit.avmProvider, 'housecanary');
  assert.equal(v.audit.avmValue, 360_000);
  assert.equal(v.audit.conditionScore, subject.conditionScore);
  assert.ok(v.audit.compCountRenovated >= 4);
});

test('additions (finishedSqft > sqft) lift ARV but not As-Is', () => {
  const withAddition = computeValuation({
    ...baseRequest(),
    subject: { ...subject, finishedSqft: subject.sqft + 300 },
  });
  const noAddition = computeValuation(baseRequest());
  assert.ok(withAddition.arv.medium > noAddition.arv.medium);
  assert.equal(withAddition.asIs, noAddition.asIs); // As-Is uses recorded sqft
});

test('deterministic: same inputs => identical output', () => {
  const a = computeValuation(baseRequest());
  const b = computeValuation(baseRequest());
  assert.deepEqual(a.arv, b.arv);
  assert.equal(a.asIs, b.asIs);
  assert.equal(a.confidence.fsd, b.confidence.fsd);
});

test('runs on public data alone (no AVM, no deal, no rental)', () => {
  const v = computeValuation({ subject, comps, asOf: AS_OF });
  assert.ok(v.asIs > 0);
  assert.ok(v.arv.high > v.arv.light);
  assert.equal(v.rental, undefined);
  assert.equal(v.audit.avmProvider, undefined);
});

test('market config overrides shift the bands', () => {
  const hot = computeValuation({
    ...baseRequest(),
    config: { bandPercentiles: { light: 0.5, medium: 0.7, high: 0.95 }, market: 'HOT' },
  });
  const base = computeValuation(baseRequest());
  assert.ok(hot.arv.light >= base.arv.light);
});
