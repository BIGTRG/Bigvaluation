import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentile,
  median,
  weightedPercentile,
  coefficientOfVariation,
  halfLifeWeight,
  clamp,
  roundMoney,
  daysBetween,
} from '../src/math.ts';

test('percentile interpolates (type-7)', () => {
  const xs = [10, 20, 30, 40];
  assert.equal(percentile(xs, 0), 10);
  assert.equal(percentile(xs, 1), 40);
  assert.equal(median(xs), 25);
  // 0.35 * (4-1) = 1.05 -> between index 1 (20) and 2 (30): 20 + 0.05*10 = 20.5
  assert.equal(percentile(xs, 0.35), 20.5);
});

test('percentile handles empty and singleton', () => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([42], 0.9), 42);
});

test('weightedPercentile collapses to value when one weight dominates', () => {
  const v = [100, 200, 300];
  const w = [0, 1, 0];
  assert.equal(weightedPercentile(v, w, 0.5), 200);
});

test('weightedPercentile falls back to unweighted when weights are zero', () => {
  const v = [10, 20, 30, 40];
  assert.equal(weightedPercentile(v, [0, 0, 0, 0], 0.5), median(v));
});

test('coefficientOfVariation is zero for identical values', () => {
  assert.equal(coefficientOfVariation([5, 5, 5]), 0);
  assert.ok(coefficientOfVariation([10, 20, 30]) > 0);
});

test('halfLifeWeight halves at the half-life', () => {
  assert.equal(halfLifeWeight(0, 180), 1);
  assert.ok(Math.abs(halfLifeWeight(180, 180) - 0.5) < 1e-12);
  assert.ok(Math.abs(halfLifeWeight(360, 180) - 0.25) < 1e-12);
});

test('clamp and roundMoney', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(roundMoney(462_300), 462_500);
  assert.equal(roundMoney(462_100), 462_000);
});

test('daysBetween is signed and date-safe', () => {
  assert.equal(daysBetween('2026-07-23', '2026-07-13'), 10);
  assert.equal(daysBetween('bad', '2026-07-13'), 0);
});
