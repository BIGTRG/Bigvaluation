import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionFactor } from '../src/condition.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';

test('average condition (3) maps to ~1.0', () => {
  assert.equal(conditionFactor(3, DEFAULT_CONFIG), 1.0);
});

test('interpolates between anchors', () => {
  // between 2 (0.86) and 3 (1.0): 2.5 -> 0.93
  assert.ok(Math.abs(conditionFactor(2.5, DEFAULT_CONFIG) - 0.93) < 1e-9);
});

test('clamps outside the anchor range', () => {
  assert.equal(conditionFactor(0.5, DEFAULT_CONFIG), 0.72);
  assert.equal(conditionFactor(9, DEFAULT_CONFIG), 1.14);
});

test('monotonic non-decreasing in score', () => {
  let prev = -Infinity;
  for (let s = 1; s <= 5; s += 0.25) {
    const f = conditionFactor(s, DEFAULT_CONFIG);
    assert.ok(f >= prev, `factor should not decrease at score ${s}`);
    prev = f;
  }
});
