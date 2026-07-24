/**
 * Generate a sample report from the engine fixture and write it to disk.
 * Run: `node examples/generate.ts` → writes examples/out/report.html
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeValuation } from '../../valuation-engine/src/index.ts';
import { comps, subject, AS_OF } from '../../valuation-engine/test/fixtures.ts';
import { renderReport } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));

const valuation = computeValuation({
  subject: { ...subject, finishedSqft: subject.sqft, lotSqft: 7200 },
  comps: comps.map((c, i) => ({ ...c, sourceUrl: `https://records.example.com/comp/${c.id}` })),
  asOf: AS_OF,
  avm: { value: 360_000, provider: 'HouseCanary', fsd: 0.08 },
  deal: { purchasePrice: 290_000, holdingCosts: 14_000, closingCosts: 18_000, desiredProfit: 40_000 },
  rental: { monthlyRent: 2400 },
});

const html = renderReport({
  valuation,
  comps: comps,
  meta: {
    reportId: 'FM-2026-0731',
    generatedAt: `${AS_OF}T15:00:00Z`,
    certification: 'ai',
    propertyType: 'Single-family',
  },
  options: { recommendedTier: 'medium' },
  // branding: {}  // supply { brandName, logoHtml, colors } when the brand is set
});

const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'report.html');
writeFileSync(outFile, html, 'utf8');
console.log(`Wrote ${outFile} (${(html.length / 1024).toFixed(1)} KB)`);
