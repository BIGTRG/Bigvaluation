/**
 * Smoke demo: run a full valuation on the test fixture and print the report
 * payload a PDF/web report would consume. Run: `node examples/demo.ts`.
 */
import { computeValuation } from '../src/index.ts';
import { comps, subject, AS_OF } from '../test/fixtures.ts';

const v = computeValuation({
  subject,
  comps,
  asOf: AS_OF,
  avm: { value: 360_000, provider: 'housecanary', fsd: 0.08 },
  deal: { purchasePrice: 290_000, holdingCosts: 14_000, closingCosts: 18_000, desiredProfit: 40_000 },
  rental: { monthlyRent: 2400 },
});

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

console.log(`\nSubject: ${v.subject.address}`);
console.log(`  ${v.subject.sqft} sqft · condition ${v.subject.conditionScore}/5 · factor ${v.audit.conditionFactor.toFixed(3)}`);
console.log(`  Comps: ${v.audit.compCountRenovated} renovated / ${v.audit.compCountAll} total within ${v.radiusMiles} mi`);
console.log(`\nAs-Is value: ${usd(v.asIs)}`);
console.log(`Area $/sqft — as-is median ${usd(v.areaPricePerSqft.asIsMedian)}, renovated median ${usd(v.areaPricePerSqft.renovatedMedian)}`);
console.log(`Ceiling $/sqft: ${usd(v.ceilingPricePerSqft)}\n`);

console.log('Tier      Band $/sqft   ARV          Rehab       Profit@ask   MAO');
for (const t of ['light', 'medium', 'high'] as const) {
  const d = v.deal[t];
  const row = [
    t.padEnd(9),
    usd(v.bands[t].pricePerSqft).padStart(11),
    usd(v.arv[t]).padStart(12),
    usd(v.rehab[t]).padStart(11),
    usd(d.projectedProfit ?? 0).padStart(12),
    usd(d.maxAllowableOffer).padStart(11),
  ].join(' ');
  console.log(row);
}

console.log(`\nConfidence: ${v.confidence.score}/100 (FSD ${(v.confidence.fsd * 100).toFixed(1)}%)`);
console.log(`  ${v.confidence.note}`);
console.log(`\nRental (BRRRR): rent ${usd(v.rental!.monthlyRent)}/mo → NOI ${usd(v.rental!.noi)} → value ${usd(v.rental!.incomeValue)} @ ${(v.rental!.capRate * 100).toFixed(1)}% cap`);
console.log(`\n${v.audit.generatedNote}\n`);
