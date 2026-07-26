import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScope,
  buildScopes,
  toRehabScopes,
  prepMultiplier,
  FINISH_CATALOG,
  SYSTEM_REPAIRS,
  DEFAULT_MARKET_CONFIG,
  formatScope,
  formatComparison,
} from '../src/index.ts';

const subject = { sqft: 1500, conditionScore: 3 as const };

describe('prepMultiplier', () => {
  it('returns exact value for integer scores', () => {
    assert.equal(prepMultiplier(1), 1.50);
    assert.equal(prepMultiplier(3), 1.00);
    assert.equal(prepMultiplier(5), 0.50);
  });

  it('interpolates fractional scores', () => {
    const m = prepMultiplier(2.5);
    // Midpoint between 1.25 (score 2) and 1.00 (score 3)
    assert.ok(Math.abs(m - 1.125) < 0.001);
  });

  it('clamps below 1', () => {
    assert.equal(prepMultiplier(0), 1.50);
    assert.equal(prepMultiplier(-1), 1.50);
  });

  it('clamps above 5', () => {
    assert.equal(prepMultiplier(6), 0.50);
    assert.equal(prepMultiplier(10), 0.50);
  });
});

describe('buildScope', () => {
  it('returns correct tier', () => {
    const result = buildScope(subject, 'medium');
    assert.equal(result.tier, 'medium');
  });

  it('includes all finish items', () => {
    const result = buildScope(subject, 'light');
    const finishItems = result.lineItems.filter((li) => li.kind === 'finish');
    assert.equal(finishItems.length, FINISH_CATALOG.length);
  });

  it('does NOT trigger system repairs at condition 3', () => {
    const result = buildScope(subject, 'medium');
    const systemItems = result.lineItems.filter((li) => li.kind === 'system');
    assert.equal(systemItems.length, 0);
    assert.equal(result.breakdown.systemUsd, 0);
  });

  it('triggers system repairs at condition 2', () => {
    const distressed = { sqft: 1500, conditionScore: 2 };
    const result = buildScope(distressed, 'medium');
    const systemItems = result.lineItems.filter((li) => li.kind === 'system');
    // All repairs with triggerAtOrBelow >= 2 should fire
    const expected = SYSTEM_REPAIRS.filter((r) => 2 <= r.triggerAtOrBelow);
    assert.equal(systemItems.length, expected.length);
    assert.ok(result.breakdown.systemUsd > 0);
  });

  it('triggers foundation at condition 1 only', () => {
    const gut = { sqft: 1500, conditionScore: 1 };
    const result = buildScope(gut, 'light');
    const structural = result.lineItems.find((li) => li.category === 'structural');
    assert.ok(structural, 'structural repair should be present at condition 1');

    const fair = { sqft: 1500, conditionScore: 2 };
    const result2 = buildScope(fair, 'light');
    const structural2 = result2.lineItems.find((li) => li.category === 'structural');
    assert.equal(structural2, undefined, 'structural should NOT trigger at condition 2');
  });

  it('includes soft costs (permits + contingency)', () => {
    const result = buildScope(subject, 'medium');
    const softItems = result.lineItems.filter((li) => li.kind === 'soft');
    assert.equal(softItems.length, 2);
    assert.ok(softItems.some((li) => li.category === 'permits'));
    assert.ok(softItems.some((li) => li.category === 'contingency'));
    assert.ok(result.breakdown.softUsd > 0);
  });

  it('totalUsd equals sum of breakdowns', () => {
    const result = buildScope(subject, 'high');
    const expected = result.breakdown.finishUsd + result.breakdown.systemUsd + result.breakdown.softUsd;
    assert.equal(result.totalUsd, expected);
  });

  it('scales finish costs by prep multiplier', () => {
    const good = buildScope({ sqft: 1000, conditionScore: 4 }, 'light');
    const avg = buildScope({ sqft: 1000, conditionScore: 3 }, 'light');
    // Condition 4 has 0.75× multiplier, condition 3 has 1.00×
    assert.ok(good.breakdown.finishUsd < avg.breakdown.finishUsd);
  });

  it('uses finishedSqft when provided', () => {
    const withAddition = buildScope({ sqft: 1200, finishedSqft: 1600, conditionScore: 3 }, 'light');
    const without = buildScope({ sqft: 1200, conditionScore: 3 }, 'light');
    assert.ok(withAddition.breakdown.finishUsd > without.breakdown.finishUsd);
    assert.equal(withAddition.sqft, 1600);
  });

  it('high tier costs more than light', () => {
    const light = buildScope(subject, 'light');
    const high = buildScope(subject, 'high');
    assert.ok(high.totalUsd > light.totalUsd);
  });
});

describe('buildScopes', () => {
  it('returns all three tiers', () => {
    const scopes = buildScopes(subject);
    assert.ok(scopes.light);
    assert.ok(scopes.medium);
    assert.ok(scopes.high);
    assert.equal(scopes.light.tier, 'light');
    assert.equal(scopes.medium.tier, 'medium');
    assert.equal(scopes.high.tier, 'high');
  });

  it('tiers are monotonically increasing in cost', () => {
    const scopes = buildScopes(subject);
    assert.ok(scopes.light.totalUsd < scopes.medium.totalUsd);
    assert.ok(scopes.medium.totalUsd < scopes.high.totalUsd);
  });
});

describe('toRehabScopes', () => {
  it('converts to engine RehabScope shape', () => {
    const scopes = buildScopes(subject);
    const rehab = toRehabScopes(scopes);
    for (const tier of ['light', 'medium', 'high'] as const) {
      assert.ok(Array.isArray(rehab[tier].lineItems));
      assert.ok(rehab[tier].lineItems!.length > 0);
      for (const li of rehab[tier].lineItems!) {
        assert.ok(typeof li.label === 'string');
        assert.ok(typeof li.costUsd === 'number');
      }
    }
  });
});

describe('formatScope', () => {
  it('produces readable text', () => {
    const result = buildScope(subject, 'medium');
    const text = formatScope(result);
    assert.ok(text.includes('Medium Rehab Scope'));
    assert.ok(text.includes('FINISH WORK'));
    assert.ok(text.includes('SOFT COSTS'));
    assert.ok(text.includes('TOTAL'));
  });
});

describe('formatComparison', () => {
  it('produces a comparison table', () => {
    const scopes = buildScopes(subject);
    const text = formatComparison(scopes);
    assert.ok(text.includes('Light'));
    assert.ok(text.includes('Medium'));
    assert.ok(text.includes('High'));
    assert.ok(text.includes('TOTAL'));
  });
});
