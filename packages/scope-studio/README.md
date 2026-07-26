# @flip-master/scope-studio

> Scope-of-Work Studio (§4.3) — generates itemized rehab scopes per tier from
> property facts + condition score.

## What it does

Given a property's square footage and condition score (1–5), the Studio
produces a fully itemized rehab budget at each tier (Light / Medium / High):

- **Finish work** — tier-driven, per-sqft pricing scaled by a condition prep
  multiplier (worse condition = more demo/prep cost).
- **System repairs** — condition-triggered flat costs (roof, HVAC, electrical,
  plumbing, windows, structural). These fire when the condition score is at or
  below the trigger threshold, and cost the same regardless of finish tier.
- **Soft costs** — permits + contingency as a percentage of hard costs.

The output maps directly to the valuation engine's `RehabScope` type via
`toRehabScopes()`, so it plugs straight into deal-math.

## Quick start

```ts
import { buildScopes, toRehabScopes, formatComparison } from '@flip-master/scope-studio';

const subject = { sqft: 1400, conditionScore: 2 };
const scopes = buildScopes(subject);

// Human-readable comparison
console.log(formatComparison(scopes));

// Feed into the valuation engine
const rehabScopes = toRehabScopes(scopes);
```

## API

### `buildScope(subject, tier, options?)`

Build a scope for a single tier. Returns a `ScopeResult` with itemized line
items, totals, and a breakdown by kind (finish/system/soft).

### `buildScopes(subject, options?)`

Build scopes for all three tiers at once. Returns `Record<Tier, ScopeResult>`.

### `toRehabScopes(scopes)`

Convert `buildScopes` output to the engine's `Record<Tier, RehabScope>` shape
for direct use in `ValuationRequest.rehabScopes`.

### `formatScope(scope)` / `formatComparison(scopes)`

Text formatters for reports and CLI output.

### `prepMultiplier(conditionScore, config?)`

Get the prep multiplier for a (possibly fractional) condition score. Interpolates
between integer anchor points and clamps to [1, 5].

## Condition prep multipliers

| Score | Label | Multiplier |
|-------|-------|-----------|
| 1 | Gut / distressed | 1.50× |
| 2 | Below average | 1.25× |
| 3 | Average | 1.00× |
| 4 | Good | 0.75× |
| 5 | Turnkey | 0.50× |

Fractional scores interpolate (e.g. 2.5 → 1.125×).

## System repair triggers

| Repair | Triggers at ≤ | Cost |
|--------|--------------|------|
| Roof replacement | 2 | $8,500 |
| HVAC replacement | 2 | $6,500 |
| Electrical panel + update | 2 | $4,500 |
| Plumbing overhaul | 2 | $5,000 |
| Window replacement | 2 | $5,500 |
| Foundation/structural | 1 | $12,000 |
| Exterior siding repair | 2 | $4,000 |

## Testing

```bash
node --test packages/scope-studio/test/studio.test.ts
```
