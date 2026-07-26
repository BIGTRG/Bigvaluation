/**
 * {{BRAND_NAME}} — Scope-of-Work Studio example.
 * Run: node packages/scope-studio/examples/estimate.ts
 *
 * Demonstrates building scopes for a distressed 1,400 sqft property and
 * converting them to the engine's RehabScope shape for deal-math.
 */

import { buildScopes, toRehabScopes, formatScope, formatComparison } from '../src/index.ts';

const subject = {
  sqft: 1400,
  conditionScore: 2,   // below average — triggers system repairs
};

console.log('Property: 1,400 sqft | Condition: 2/5 (below average)\n');

// Build all three tiers
const scopes = buildScopes(subject);

// Print detailed scope for medium tier
console.log(formatScope(scopes.medium));
console.log('\n');

// Print comparison table
console.log(formatComparison(scopes));
console.log('\n');

// Convert to engine RehabScope shape
const rehabScopes = toRehabScopes(scopes);
console.log('Engine RehabScope (medium tier line count):', rehabScopes.medium.lineItems?.length);
console.log('Engine RehabScope (medium tier total):', rehabScopes.medium.lineItems?.reduce((s, li) => s + li.costUsd, 0));
