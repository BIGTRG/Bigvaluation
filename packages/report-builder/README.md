# @flip-master/report-builder

Renders a `Valuation` (from `@flip-master/valuation-engine`) into a **branded,
self-contained HTML report** that serves as both the shareable web report and
the PDF source (print CSS + `@page`). No external assets, no scripts, no network.

> Automated valuation — **not** an appraisal. The disclaimer rides on every report.

## Quick start

```ts
import { computeValuation } from '@flip-master/valuation-engine';
import { renderReport } from '@flip-master/report-builder';

const valuation = computeValuation({ /* subject, comps, avm, deal, rental */ });

const html = renderReport({
  valuation,
  comps,                        // optional: enables the 2/3/5-mile median table
  meta: {
    reportId: 'FM-2026-0731',
    generatedAt: new Date().toISOString(),
    certification: 'ai',        // or 'ai_human' for the reviewed tier
    propertyType: 'Single-family',
    subjectPhotoUrl: '…',       // optional
    renders: { medium: { asIs, renovated, staged } }, // optional (§4.4)
  },
  options: { recommendedTier: 'medium' },
  branding: { /* brandName, brandDomain, logoHtml, colors */ }, // optional
});
```

`html` is a complete `<!doctype html>` document. Serve it as the web report, or
print-to-PDF (Chromium headless / Playwright / Puppeteer) for the PDF.

## What it renders (build brief §3)

Header + certification badge · property facts + subject photo · **As-Is** and
**recommended ARV** headline (with FSD) · all **three tiers** together
($/sqft, ARV, rehab, profit, max offer) · deal-math waterfall + MAO + 70%-rule ·
rental/BRRRR value · area $/sqft by **2/3/5-mile** radius with implied ARV ·
supporting comps (weighted, source-linked) · AI render slots · confidence &
method · certification · disclaimer footer.

## Branding

All name/logo/color tokens live in `src/branding.ts` (§12 palette). Swap
`{{BRAND_NAME}}` → real name, drop the logo into `logoHtml`, and every report
re-skins. Tier accents: Light `#3F9C6D` / Medium `#2F7FB0` / Luxury `#8A5CC0`.

## Security

Every upstream string (comp addresses, subject fields, source URLs) is
HTML-escaped; `href`s are validated to `http(s)` only, so a `javascript:` or
`data:` URL in provider data can never render a live link. Covered by tests.

## Develop

```bash
npm test                 # 7 tests, node --test, no deps
node examples/generate.ts  # writes examples/out/report.html
```

The report imports **only** the engine's public types and constants — it never
computes a value itself.
