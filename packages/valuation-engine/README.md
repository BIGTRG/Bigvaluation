# @flip-master/valuation-engine

The **IP core** of {{BRAND_NAME}} — a pure, dependency-free TypeScript engine
that turns normalized property data into an **As-Is value** and a **three-tier
After-Repair Value (Light / Medium / High)** with confidence, deal math, rental
value, and a full audit trail.

> Automated valuation — **not** an appraisal. See [SPEC.md](./SPEC.md) §5.

## Quick start

```ts
import { computeValuation } from '@flip-master/valuation-engine';

const v = computeValuation({
  subject: { address: '123 Flip St', sqft: 1800, conditionScore: 2 },
  comps: [ /* normalized Comp[] from the Property Data Hub */ ],
  asOf: '2026-07-23',
  avm: { value: 360_000, provider: 'housecanary' },   // optional
  deal: { purchasePrice: 290_000, holdingCosts: 14_000, closingCosts: 18_000 },
  rental: { monthlyRent: 2400 },                       // optional
});

v.asIs;            // As-Is value
v.arv.high;        // luxury-tier ARV
v.deal.medium;     // profit, MAO, 70%-rule for the medium scope
v.confidence.score // 0..100, plus v.confidence.fsd and a plain-language note
v.audit;           // traceability: comps, AVM, condition, radius
```

## Layout

```
src/
  types.ts        domain vocabulary (Comp, Subject, Valuation, …)
  config.ts       MarketConfig — everything tunable per market
  math.ts         percentile / weighted stats / decay (dependency-free)
  comps.ts        radius widening + match weighting
  condition.ts    condition score → As-Is factor
  bands.ts        renovated $/sqft percentile bands + ceiling
  asIs.ts         As-Is value (comp leg blended with AVM)
  arv.ts          ARV per tier, capped at the neighborhood ceiling
  confidence.ts   FSD % = standard error with a dispersion prior
  rehab.ts        per-tier rehab budgets ($/sqft or line items)
  dealMath.ts     profit, max allowable offer, 70%-rule
  rental.ts       income-approach / BRRRR value
  engine.ts       computeValuation() — orchestrates the above
  index.ts        public API
test/             36 tests, run via node --test (no deps)
examples/demo.ts  prints a full report payload on the fixture
```

## Develop

```bash
npm test                # Node ≥23 strips TS natively — no build, no install
node examples/demo.ts   # see it produce a real deal sheet
npm run typecheck       # full tsc (requires `npm install` for typescript)
```

Every external vendor stays behind the connector layer (a sibling package). This
engine imports **nothing** — swap ATTOM for CoreLogic, HouseCanary for another
AVM, and this code never changes.
