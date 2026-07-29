/**
 * ValueProof — Report Builder
 * Inline stylesheet. Screen + print in one sheet: @page sizing, page-break
 * control, and color-adjust so tier accents survive PDF export. All colors come
 * from the Branding tokens so the report re-skins with the brand.
 */

import type { Branding } from './branding.ts';

export function reportCss(b: Branding): string {
  const c = b.colors;
  return `
:root {
  --navy: ${c.navy};
  --gold: ${c.gold};
  --green: ${c.green};
  --tier-light: ${c.tierLight};
  --tier-medium: ${c.tierMedium};
  --tier-high: ${c.tierHigh};
  --ink: ${c.ink};
  --surface: ${c.surface};
  --surface-alt: ${c.surfaceAlt};
  --line: ${c.line};
  --muted: ${c.mutedText};
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--ink);
  background: var(--surface-alt);
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.report {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}
.block {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 22px 24px;
  margin: 0 0 16px;
}
h1, h2 { margin: 0 0 12px; font-weight: 650; }
h2 { font-size: 15px; letter-spacing: .01em; color: var(--navy); text-transform: uppercase; }
.section-note { margin: -4px 0 14px; color: var(--muted); font-size: 12.5px; }

/* Header */
.topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.logo-slot { display: inline-flex; align-items: center; min-height: 30px; }
.wordmark { font-size: 20px; font-weight: 750; color: var(--navy); letter-spacing: -.01em; }
.report-meta { text-align: right; font-size: 12px; color: var(--muted); }
.badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 650; color: #fff; margin-bottom: 6px; }
.badge--ai { background: var(--navy); }
.badge--human { background: var(--green); }
.report-id { font-variant-numeric: tabular-nums; }
.subject-address { font-size: 24px; color: var(--navy); margin-top: 14px; }

/* Facts */
.facts-row { display: flex; gap: 18px; align-items: stretch; }
.subject-photo { flex: 0 0 190px; border-radius: 8px; overflow: hidden; background: var(--surface-alt); border: 1px solid var(--line); min-height: 130px; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; }
.subject-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.facts { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 16px; margin: 0; }
.facts dt { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.facts dd { margin: 2px 0 0; font-size: 15px; font-weight: 600; }

/* Headline */
.headline { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.headline-card { border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; background: var(--surface); }
.headline-card--primary { border: 0; color: #fff; background: linear-gradient(135deg, var(--navy), color-mix(in srgb, var(--navy) 70%, var(--accent))); }
.headline-card--primary .headline-label, .headline-card--primary .headline-sub { color: rgba(255,255,255,.82); }
.headline-label { font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
.headline-value { font-size: 34px; font-weight: 750; margin: 6px 0 4px; font-variant-numeric: tabular-nums; }
.headline-sub { font-size: 12px; color: var(--muted); }

/* Tables */
table.matrix { width: 100%; border-collapse: collapse; font-size: 13px; }
table.matrix th, table.matrix td { text-align: right; padding: 9px 10px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
table.matrix thead th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .02em; font-weight: 650; border-bottom: 2px solid var(--line); }
table.matrix th[scope=row], table.matrix td:first-child { text-align: left; }
table.matrix tbody tr:last-child td, table.matrix tbody tr:last-child th { border-bottom: 0; }
.num-strong { font-weight: 700; }
.tier-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; vertical-align: middle; }
table.comps a { color: var(--green); text-decoration: none; }
table.comps a:hover { text-decoration: underline; }
.wbar { display: inline-block; width: 60px; height: 7px; background: var(--surface-alt); border-radius: 4px; overflow: hidden; vertical-align: middle; }
.wbar-fill { display: block; height: 100%; background: var(--gold); }

/* Deal math */
.dealgrid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; }
.waterfall { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.wf-row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 13px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.wf-row:last-child { border-bottom: 0; }
.wf-total { background: var(--surface-alt); font-weight: 750; color: var(--navy); }
.offer-cards { display: grid; gap: 12px; }
.offer-card { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.offer-label { font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: .02em; }
.offer-value { font-size: 22px; font-weight: 750; color: var(--navy); font-variant-numeric: tabular-nums; }
.offer-sub { font-size: 11px; color: var(--muted); }

/* Rental + area */
.rental-row, .area-simple { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.rental-stat, .area-stat { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.rental-stat--primary { background: var(--surface-alt); border-color: var(--green); }
.rs-label { font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: .02em; }
.rs-value { font-size: 20px; font-weight: 700; color: var(--navy); font-variant-numeric: tabular-nums; }
.rs-value span { font-size: 12px; font-weight: 500; color: var(--muted); }

/* Renders */
.renders { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.render { margin: 0; }
.render img { width: 100%; border-radius: 8px; display: block; }
.render--empty .render-ph { aspect-ratio: 4 / 3; border: 1px dashed var(--line); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; background: var(--surface-alt); }
.render figcaption { font-size: 11px; color: var(--muted); margin-top: 5px; text-align: center; }

/* Confidence */
.conf-gauge { display: flex; align-items: center; gap: 14px; }
.gauge-track { flex: 1; height: 12px; background: var(--surface-alt); border-radius: 6px; overflow: hidden; }
.gauge-fill { height: 100%; background: linear-gradient(90deg, var(--gold), var(--green)); }
.gauge-nums { display: flex; flex-direction: column; align-items: flex-end; }
.gauge-nums strong { font-size: 18px; color: var(--navy); }
.gauge-nums span { font-size: 11px; color: var(--muted); }
.conf-note { font-size: 13px; margin: 12px 0; }
.method { margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--muted); }
.method li { margin: 3px 0; }

/* Cert + disclaimer */
.cert { background: var(--surface-alt); border-left: 3px solid var(--gold); padding: 12px 16px; border-radius: 6px; }
.cert-title { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
.cert-body { font-size: 13px; font-weight: 600; }
.disclaimer { color: var(--muted); font-size: 11px; padding: 8px 4px 0; }
.disclaimer strong { color: var(--ink); }
.disclaimer p { margin: 8px 0; }

@media (max-width: 640px) {
  .facts-row { flex-direction: column; }
  .facts { grid-template-columns: repeat(2, 1fr); }
  .headline, .dealgrid, .rental-row, .area-simple, .renders { grid-template-columns: 1fr; }
}

@page { size: Letter; margin: 14mm; }
@media print {
  body { background: #fff; }
  .report { max-width: none; padding: 0; }
  .block { border-color: #d8dee4; break-inside: avoid; box-shadow: none; }
  h2 { break-after: avoid; }
  table, tr, figure { break-inside: avoid; }
}
`;
}
