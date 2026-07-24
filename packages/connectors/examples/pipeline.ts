/**
 * End-to-end pipeline (offline, mock-backed):
 *   Property Data Hub → valuation engine → report builder → HTML on disk.
 *
 * This is the "Value" path of the 5-stage architecture (§7) wired together.
 * Swap MockProvider for AttomProvider + HouseCanayProvider (with API keys) and
 * nothing else changes. Run: `node examples/pipeline.ts`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PropertyDataHub, toValuationRequest, MockProvider } from '../src/index.ts';
import { computeValuation } from '../../valuation-engine/src/index.ts';
import { renderReport } from '../../report-builder/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const AS_OF = '2026-07-23';

// 1. Assemble normalized data from providers (mock here; ATTOM/HouseCanary in prod).
const mock = new MockProvider();
const hub = new PropertyDataHub({
  propertyProviders: [mock],
  avmProviders: [mock],
  parcelProvider: mock,
  permitsProvider: mock,
});

const data = await hub.assemble(
  { address: '123 Flip St, Phoenix, AZ 85021', radiusMiles: 2 },
  { asOf: AS_OF },
);

console.log(`Assembled: ${data.comps.length} comps (` +
  `${data.comps.filter((c) => c.renovated).length} renovated), ` +
  `AVM ${data.avm ? '$' + data.avm.value.toLocaleString() : 'none'}`);
console.log('Sources:', data.sources.map((s) => `${s.field}:${s.provider}=${s.status}`).join(', '));
if (data.warnings.length) console.log('Warnings:', data.warnings);

// 2. Add the condition score (from the Vision engine, §4.1) and deal/rental inputs.
const request = toValuationRequest(data, /* conditionScore */ 2, {
  asOf: AS_OF,
  deal: { purchasePrice: 290_000, holdingCosts: 14_000, closingCosts: 18_000, desiredProfit: 40_000 },
  rental: { monthlyRent: 2400 },
});

// 3. Value.
const valuation = computeValuation(request);
console.log(`\nAs-Is $${valuation.asIs.toLocaleString()} · ` +
  `ARV L/M/H $${valuation.arv.light.toLocaleString()} / ` +
  `$${valuation.arv.medium.toLocaleString()} / $${valuation.arv.high.toLocaleString()} · ` +
  `confidence ${valuation.confidence.score}/100`);

// 4. Deliver — render the report.
const html = renderReport({
  valuation,
  comps: data.comps,
  meta: {
    reportId: 'FM-2026-0731',
    generatedAt: `${AS_OF}T15:00:00Z`,
    certification: 'ai',
    propertyType: data.subject.propertyType,
  },
});

const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'pipeline-report.html');
writeFileSync(outFile, html, 'utf8');
console.log(`\nWrote ${outFile} (${(html.length / 1024).toFixed(1)} KB)`);
