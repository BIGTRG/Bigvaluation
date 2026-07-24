# ATTOM Field Mapping Verification

**Date:** 2026-07-24
**Source:** Real ATTOM API documentation + published response samples
**Fixtures:** `fixtures/attom-property-detail-real.json`, `fixtures/attom-sale-snapshot-real.json`

## property/detail → mapSubject()

| SubjectFacts field | Adapter path | Real ATTOM path | ✅/⚠️ | Notes |
|---|---|---|---|---|
| `sqft` | `building.size.universalsize ?? .livingsize ?? .bldgsize` | `building.size.universalsize` | ✅ | All three exist in real response |
| `beds` | `building.rooms.beds` | `building.rooms.beds` | ✅ | Exact match |
| `baths` | `building.rooms.bathstotal` | `building.rooms.bathstotal` | ✅ | Exact match |
| `lotSqft` | `lot.lotsize2 ?? lot.lotSize` | `lot.lotsize2` | ✅ | `lotsize2` is sqft (4690), `lotsize1` is acres (0.107) |
| `yearBuilt` | `summary.yearbuilt` | `summary.yearbuilt` | ✅ | Exact match |
| `propertyType` | `summary.proptype ?? summary.propclass` | `summary.proptype` = "SFR" | ✅ | Both exist |
| `latitude` | `location.latitude` | `location.latitude` = "39.778926" (STRING!) | ⚠️ | ATTOM returns lat/lon as **strings**, not numbers. `numOrUndef` handles via `Number(v)` — **OK, works** |
| `longitude` | `location.longitude` | `location.longitude` = "-105.047775" (STRING!) | ⚠️ | Same as above — works via Number() cast |
| `apn` | `identifier.apn` | `identifier.apn` | ✅ | Exact match |

### property/detail Verdict: ✅ ALL FIELDS MAP CORRECTLY
- String lat/lon handled by `numOrUndef` conversion
- Fallback chains are valid (universalsize → livingsize → bldgsize all exist)

---

## sale/snapshot → mapComps()

| Comp field | Adapter path | Real ATTOM path | ✅/⚠️ | Notes |
|---|---|---|---|---|
| `salePrice` | `sale.amount.saleamt` | `sale.amount.saleamt` | ✅ | Exact match |
| `saleDate` | `sale.amount.salerecdate ?? sale.salesearchdate` | `sale.amount.salerecdate` | ✅ | Both exist; `salerecdate` is recording date, `SaleTransactionDate` is actual sale date |
| `sqft` | `building.size.universalsize ?? .livingsize` | `building.size.universalsize` | ✅ | Exact match |
| `id` | `identifier.attomId ?? identifier.obPropId` | `identifier.attomId` | ✅ | Both exist |
| `address` | `address.oneLine ?? address.line1` | `address.oneLine` | ✅ | Exact match |
| `distanceMiles` | `location.distance` | `location.distance` | ✅ | Numeric, in miles |
| `sourceUrl` | `vintage.url` | ❌ NOT IN RESPONSE | ⚠️ | `vintage` has `lastModified` and `pubDate` only — `vintage.url` doesn't exist. Will be `undefined` → OK (optional field) |

### sale/snapshot Verdict: ✅ ALL CRITICAL FIELDS MAP CORRECTLY
- `vintage.url` doesn't exist in real responses but field is optional — no impact
- `sale.SaleTransactionDate` exists but adapter uses `salerecdate` (recording date) — fine for comp analysis

---

## ⚠️ ONE DISCOVERY: sale response nesting

The adapter reads `sale.amount.saleamt` and `sale.amount.salerecdate`. In the real ATTOM response:
- `sale.amount.saleamt` ✅ exists under `sale.amount` object
- `sale.amount.salerecdate` ✅ exists under `sale.amount` object

The web search result showed a FLAT `sale.saleAmt` (capitalized, no `.amount` nesting). This appears to be a **different endpoint** (`/sale/detail` vs `/sale/snapshot`). The adapter's snapshot mapping with `sale.amount.saleamt` is consistent with ATTOM's actual `/sale/snapshot` response format.

## CONCLUSION

**The field mappings are correct.** The adapter was written with accurate ATTOM paths. The only non-existent field (`vintage.url`) is optional and gracefully returns `undefined`. The string-to-number handling for lat/lon works via `numOrUndef`.

No code changes required for field mapping correctness.
