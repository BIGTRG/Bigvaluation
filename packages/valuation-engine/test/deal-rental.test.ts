import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealMathForTier } from '../src/dealMath.ts';
import { computeRental } from '../src/rental.ts';
import { rehabBudgets } from '../src/rehab.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';

test('projected profit = ARV - purchase - rehab - holding - closing', () => {
  const d = dealMathForTier(
    'medium',
    500_000,
    80_000,
    { purchasePrice: 300_000, holdingCosts: 15_000, closingCosts: 20_000, desiredProfit: 40_000 },
    DEFAULT_CONFIG,
  );
  assert.equal(d.projectedProfit, 500_000 - 300_000 - 80_000 - 15_000 - 20_000);
  assert.equal(d.maxAllowableOffer, 500_000 - 80_000 - 15_000 - 20_000 - 40_000);
  assert.equal(d.seventyRuleOffer, 0.7 * 500_000 - 80_000);
});

test('MAO computed even without a purchase price; profit then undefined', () => {
  const d = dealMathForTier('light', 400_000, 40_000, {}, DEFAULT_CONFIG);
  assert.equal(d.projectedProfit, undefined);
  // desiredProfit defaults from config (30k), holding/closing default 0.
  assert.equal(d.maxAllowableOffer, 400_000 - 40_000 - 0 - 0 - 30_000);
});

test('offering MAO yields exactly the desired profit', () => {
  const inputs = { holdingCosts: 10_000, closingCosts: 12_000, desiredProfit: 35_000 };
  const d = dealMathForTier('high', 600_000, 130_000, inputs, DEFAULT_CONFIG);
  const profitAtMao = 600_000 - d.maxAllowableOffer - 130_000 - 10_000 - 12_000;
  assert.ok(Math.abs(profitAtMao - 35_000) < 1e-6);
});

test('rehab line items override the per-sqft estimate', () => {
  const budgets = rehabBudgets(2000, DEFAULT_CONFIG, {
    medium: { lineItems: [{ label: 'kitchen', costUsd: 30_000 }, { label: 'baths', costUsd: 18_000 }] },
  });
  assert.equal(budgets.medium, 48_000);
  // Untouched tiers still use $/sqft.
  assert.equal(budgets.light, 2000 * DEFAULT_CONFIG.rehabPerSqft.light);
});

test('rental income value = NOI / capRate', () => {
  const r = computeRental({ monthlyRent: 2500, expenseRatio: 0.45, capRate: 0.07 }, DEFAULT_CONFIG);
  const noi = 2500 * 12 * (1 - 0.45);
  assert.ok(Math.abs(r.noi - noi) < 1e-6);
  assert.ok(Math.abs(r.incomeValue - noi / 0.07) < 1e-6);
  // GRM cross-check agrees with the income approach by construction.
  assert.ok(Math.abs(r.grmValue - r.incomeValue) < 1e-6);
});
