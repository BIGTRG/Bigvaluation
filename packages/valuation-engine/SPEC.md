# {{BRAND_NAME}} — Valuation Engine Specification

> The IP core (build brief §4.5–4.6, §7 engine 2). Turns normalized property
> data into an **As-Is value** and a **three-tier After-Repair Value** with
> confidence, deal math, and a full audit trail.
>
> **Positioning rule (§10):** this is an *automated valuation*, never an
> "appraisal." No output field or copy uses the words "appraisal"/"appraised."

---

## 1. Where it sits

```
Capture → Understand (Vision + Analyst AI) → [ VALUE ] → Visualize → Deliver
                                                 ▲
                    Property Data Hub ───────────┘
   (ATTOM / HouseCanary / MLS / Regrid / Shovels normalized to one schema)
```

The engine is **pure and synchronous**. It never calls a vendor. Connectors
fetch and normalize; the engine computes. That makes every value reproducible
and unit-testable, and lets the accuracy engine (§4.6) replay closed deals
offline for calibration.

**Input:** `ValuationRequest` — subject, normalized comps, optional AVM, deal
inputs, rental inputs, per-tier rehab scopes, and a market config override.
**Output:** `Valuation` — the §8 data-model entity, ready for the report builder.

---

## 2. Inputs

| Field | Source | Notes |
|---|---|---|
| `subject.sqft` | parcel / MLS | recorded gross living area |
| `subject.finishedSqft` | additions detection (§4.2) | defaults to `sqft`; drives ARV, not As-Is |
| `subject.conditionScore` | Vision engine (§4.1) | 1 = gut … 5 = turnkey |
| `comps[]` | Property Data Hub | each: sqft, salePrice, saleDate, distanceMiles, `renovated` |
| `avm` | HouseCanary / ATTOM | optional; engine runs on public data without it |
| `deal` | user / lender | purchase, holding, closing, desired profit |
| `rental` | user / rent AVM | monthly rent (+ optional expense ratio, cap rate) |
| `rehabScopes` | Scope-of-Work Studio (§4.3) | per-tier line items override $/sqft |
| `config` | accuracy engine (§4.6) | market calibration; see §7 |
| `asOf` | caller | reference date for recency weighting — pass for reproducibility |

---

## 3. The math

### 3.1 Comp selection & weighting (`comps.ts`)

Radius widens **tightest-first**: try 2 mi, then 3, then 5. The first ring with
≥ `minRenovatedComps` renovated **and** ≥ `minAllComps` total is chosen; if none
qualify, the 5-mi ring is used as-is. Reports still show all three radii.

Each comp gets a **match weight** in `(0, 1]`, the product of three half-life
decays (distance, recency, size similarity):

```
w = 0.5^(distanceMi / distHalfLife)
  · 0.5^(ageDays   / recencyHalfLife)
  · 0.5^(|Δsqft|/sqft / sqftHalfLifeFraction)
```

So a comp at the distance half-life contributes half as much as an identical
comp next door. Weights feed every percentile below.

### 3.2 Condition factor (`condition.ts`)

Piecewise-linear interpolation over market anchors, clamped at the ends. Anchor
score 3 → factor 1.0. Default anchors: `1→0.72, 2→0.86, 3→1.00, 4→1.08, 5→1.14`.

### 3.3 As-Is value (`asIs.ts`)

```
areaAsIsPPSF = weightedMedian( pricePerSqft over ALL comps in ring )
compLeg      = subjectSqft · areaAsIsPPSF · conditionFactor
As-Is        = compLeg · w  +  AVM · (1 − w)          (w = asIsCompWeight, default 0.5)
```

With no AVM the value collapses to `compLeg` — the engine never blocks on a
missing vendor.

### 3.4 Renovated bands (`bands.ts`)

Built from **renovated comps only**, on **weighted** $/sqft percentiles:

| Tier | Default percentile |
|---|---|
| Light | 35th |
| Medium | 55th |
| High (Luxury) | 85th |

Bands are forced monotonic (`light ≤ medium ≤ high`) even on degenerate comp
sets. The **neighborhood ceiling** is the 95th-percentile renovated $/sqft × 1.05.

### 3.5 ARV per tier (`arv.ts`)

```
ARV(tier) = finishedSqft · min( band$/sqft(tier), ceiling$/sqft )
```

The ceiling cap prevents a hot band from producing a value above what the
neighborhood has ever paid. `finishedSqft > sqft` (an addition) lifts ARV but
not As-Is.

### 3.6 Confidence — FSD % (`confidence.ts`)

Confidence is the **standard error of the estimate**, not a vibe. Observed
dispersion is blended toward a prior so a thin comp set cannot look tight:

```
blendedCV = (obsCV · n + priorCV · priorStrength) / (n + priorStrength)
SE        = blendedCV / √n
FSD       = clamp( floor + seWeight·SE + recencyTerm + radiusTerm,  floor, cap )
score     = 100 · (1 − (FSD − floor)/(cap − floor))
```

- `recencyTerm = (avgCompAgeDays / recencyDays) · recencyWeight`
- `radiusTerm  = max(0, radiusMi − 2) · radiusPenaltyPerMile`

Key property (regression-tested): **more comps ⇒ lower FSD, higher score**, all
else equal — because SE falls as √n rises while the prior stops one comp from
faking certainty.

### 3.7 Deal math (`dealMath.ts`), rehab (`rehab.ts`), rental (`rental.ts`)

```
projectedProfit  = ARV − purchase − rehab − holding − closing
maxAllowableOffer= ARV − rehab − holding − closing − desiredProfit
seventyRuleOffer = 0.70·ARV − rehab                     (coarse cross-check)

rehab(tier) = Σ lineItems  OR  finishedSqft · rehab$/sqft(tier)

NOI         = monthlyRent · 12 · (1 − expenseRatio)
incomeValue = NOI / capRate                             (BRRRR / buy-and-hold)
```

---

## 4. Output (`Valuation`)

`asIs` · `arv{light,medium,high}` · `bands` · `ceilingPricePerSqft` ·
`confidence{fsd,score,note,…}` · `radiusMiles` · `areaPricePerSqft` ·
`compSelection{weighted comps}` · `rehab` · `deal` · `rental` · `audit`.

The `audit` block records the AVM provider/value, condition score & factor, comp
counts, and the disclaimer-prefixed note — satisfying §10 auditability ("every
value traces back to comps, AVM, condition score, radius").

---

## 5. Compliance hooks (§4.7, §10)

- `NOT_AN_APPRAISAL` disclaimer is prefixed to `audit.generatedNote`; the report
  builder must surface it on every page.
- No field or generated string uses "appraisal"/"appraised" — enforced by
  convention and reviewed in tests.
- **Bias/fairness check (§4.7):** not in this engine. Valuation inputs are
  property/market features only — never protected-class or demographic data. A
  separate fairness gate runs on outputs before certification. Do not add
  neighborhood-demographic features here.
- Human-review certified tier (§4.7) consumes this output unchanged and attaches
  a reviewer signature downstream.

---

## 6. Calibration & the accuracy engine (§4.6)

`MarketConfig` holds everything tunable per market: band percentiles, condition
anchors, As-Is blend weight, ceiling, radius minimums, rehab $/sqft, weighting
half-lives, confidence coefficients, rental & deal defaults.

**Backtest loop (to build in Phase 1, §11):**
1. Replay 20–50 closed loans through `computeValuation` with `asOf` = funding date.
2. Compare predicted ARV to realized resale; compute per-market error.
3. Grid/Bayesian-search the config (percentiles, condition anchors, blend weight)
   to minimize error; publish per-market error rate and confidence calibration.
4. As new deals close, refit — the "live feedback loop."

Because the engine is pure, the backtester is just a loop over historical
`ValuationRequest`s. No mocking, no network.

---

## 7. Known modeling notes (calibrate before launch)

- **Area As-Is $/sqft blends renovated + as-is comps.** The condition factor then
  discounts for condition. On markets with few as-is sales this is fine; where
  as-is sales are plentiful, consider deriving `areaAsIsPPSF` from `renovated=false`
  comps only and widening the condition-factor range. Left as a config/calibration
  decision, not hard-coded.
- **Ceiling uses weighted 95th percentile**, so a single ultra-luxury comp won't
  set the ceiling alone. Verify per market that the ceiling isn't clipping
  legitimate high-end ARVs.
- **Rehab $/sqft defaults are generic.** Replace with regional line-item rates or
  wire the Scope-of-Work Studio before quoting rehab to lenders.

---

## 8. Running it

```bash
cd packages/valuation-engine
npm test          # 36 tests, zero dependencies (Node ≥23 strips TS natively)
node examples/demo.ts   # prints a full report payload on the fixture
# npm run typecheck   # full tsc pass — requires `npm install` first
```
