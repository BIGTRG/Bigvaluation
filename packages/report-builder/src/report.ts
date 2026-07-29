/**
 * ValueProof — Report Builder
 * Renders a `Valuation` into a self-contained HTML document that serves as BOTH
 * the shareable web report and the PDF source (print CSS + @page). Covers the
 * full Section 3 report contents. No external assets, no scripts.
 */

import type { Valuation, Comp, Tier } from '../../valuation-engine/src/index.ts';
import { TIERS, NOT_AN_APPRAISAL } from '../../valuation-engine/src/index.ts';
import type { Branding } from './branding.ts';
import { resolveBranding, tierColor } from './branding.ts';
import { reportCss } from './styles.ts';
import { usd, ppsf, pct, num, humanDate, esc, safeUrl } from './format.ts';

export type Certification = 'ai' | 'ai_human';

export interface ReportMeta {
  reportId: string;
  /** ISO timestamp the report was generated. */
  generatedAt: string;
  certification: Certification;
  reviewerName?: string;
  propertyType?: string;
  subjectPhotoUrl?: string;
  /** AI renders per tier: as-is / renovated / staged image URLs (§4.4). */
  renders?: Partial<Record<Tier, { asIs?: string; renovated?: string; staged?: string }>>;
}

export interface ReportOptions {
  /** Which tier is headlined as the "recommended ARV" (§3). Default medium. */
  recommendedTier?: Tier;
}

export interface RenderReportInput {
  valuation: Valuation;
  meta: ReportMeta;
  /** Raw comps enable the 2/3/5-mile median breakdown (§3 "Area price/sqft"). */
  comps?: Comp[];
  branding?: Partial<Branding>;
  options?: ReportOptions;
}

const TIER_LABEL: Record<Tier, string> = { light: 'Light', medium: 'Medium', high: 'High' };

export function renderReport(input: RenderReportInput): string {
  const b = resolveBranding(input.branding);
  const v = input.valuation;
  const meta = input.meta;
  const recommendedTier = input.options?.recommendedTier ?? 'medium';
  const finishedSqft = v.subject.finishedSqft ?? v.subject.sqft;

  const head = renderHead(b, meta, v);
  const body = [
    section(headerBar(b, meta, v)),
    section(subjectFacts(b, v, meta)),
    section(headlineValues(b, v, recommendedTier)),
    section(tierMatrix(b, v)),
    section(dealMath(b, v)),
    v.rental ? section(rental(b, v)) : '',
    section(areaPricePerSqft(b, v, finishedSqft, input.comps)),
    section(compsTable(b, v)),
    section(renders(b, v, meta)),
    section(confidenceMethod(b, v)),
    section(certificationBlock(b, meta)),
    footer(b, meta),
  ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>${head}</head>
<body>
<main class="report">
${body}
</main>
</body>
</html>`;
}

function renderHead(b: Branding, meta: ReportMeta, v: Valuation): string {
  const title = `${esc(v.subject.address)} — ${esc(b.brandName)} Valuation ${esc(meta.reportId)}`;
  return `
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <meta name="robots" content="noindex"/>
  <style>${reportCss(b)}</style>`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function headerBar(b: Branding, meta: ReportMeta, v: Valuation): string {
  const wordmark = b.logoHtml ?? `<span class="wordmark">${esc(b.brandName)}</span>`;
  const cert =
    meta.certification === 'ai_human'
      ? `<span class="badge badge--human">AI + Human Reviewed</span>`
      : `<span class="badge badge--ai">AI Valuation</span>`;
  return `
  <div class="topbar">
    <div class="brand"><span class="logo-slot">${wordmark}</span></div>
    <div class="report-meta">
      ${cert}
      <div class="report-id">Report ${esc(meta.reportId)}</div>
      <div class="report-date">${esc(humanDate(meta.generatedAt))}</div>
    </div>
  </div>
  <h1 class="subject-address">${esc(v.subject.address)}</h1>`;
}

function subjectFacts(b: Branding, v: Valuation, meta: ReportMeta): string {
  const s = v.subject;
  const facts: [string, string][] = [
    ['Beds', num(s.beds)],
    ['Baths', num(s.baths)],
    ['Living area', s.sqft ? `${num(s.sqft)} sqft` : '—'],
    ['Lot', s.lotSqft ? `${num(s.lotSqft)} sqft` : '—'],
    ['Year built', num(s.yearBuilt)],
    ['Type', esc(meta.propertyType ?? '—')],
    ['APN', esc(s.apn ?? '—')],
    ['Condition', `${num(s.conditionScore)} / 5`],
  ];
  const photo = meta.subjectPhotoUrl
    ? `<div class="subject-photo"><img alt="Subject property" src="${esc(meta.subjectPhotoUrl)}"/></div>`
    : `<div class="subject-photo subject-photo--empty">Subject photo</div>`;
  return `
  <h2>Property facts</h2>
  <div class="facts-row">
    ${photo}
    <dl class="facts">
      ${facts.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${val}</dd></div>`).join('')}
    </dl>
  </div>`;
}

function headlineValues(b: Branding, v: Valuation, recommended: Tier): string {
  const arv = v.arv[recommended];
  return `
  <div class="headline">
    <div class="headline-card">
      <div class="headline-label">As-Is Value</div>
      <div class="headline-value">${usd(v.asIs)}</div>
      <div class="headline-sub">Current condition ${num(v.subject.conditionScore)}/5 · comps + AVM blend</div>
    </div>
    <div class="headline-card headline-card--primary" style="--accent:${tierColor(b, recommended)}">
      <div class="headline-label">Recommended ARV · ${TIER_LABEL[recommended]} scope</div>
      <div class="headline-value">${usd(arv)}</div>
      <div class="headline-sub">FSD ${pct(v.confidence.fsd)} · confidence ${num(v.confidence.score)}/100</div>
    </div>
  </div>`;
}

function tierMatrix(b: Branding, v: Valuation): string {
  const rows = TIERS.map((t) => {
    const d = v.deal[t];
    return `
    <tr>
      <th scope="row"><span class="tier-dot" style="background:${tierColor(b, t)}"></span>${TIER_LABEL[t]}</th>
      <td>${ppsf(v.bands[t].pricePerSqft)}</td>
      <td class="num-strong">${usd(v.arv[t])}</td>
      <td>${usd(v.rehab[t])}</td>
      <td>${d.projectedProfit !== undefined ? usd(d.projectedProfit) : '—'}</td>
      <td>${usd(d.maxAllowableOffer)}</td>
    </tr>`;
  }).join('');
  return `
  <h2>Rehab condition levels</h2>
  <p class="section-note">All three levels are shown together. ARV is capped at the neighborhood ceiling of ${ppsf(v.ceilingPricePerSqft)}/sqft.</p>
  <table class="matrix">
    <thead>
      <tr><th scope="col">Level</th><th scope="col">Target $/sqft</th><th scope="col">ARV</th><th scope="col">Rehab budget</th><th scope="col">Profit @ ask</th><th scope="col">Max offer</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function dealMath(b: Branding, v: Valuation): string {
  const t: Tier = 'medium';
  const d = v.deal[t];
  const lines: [string, string][] = [
    ['After-Repair Value (Medium)', usd(d.arv)],
    ['Purchase price', d.purchasePrice !== undefined ? '− ' + usd(d.purchasePrice) : '—'],
    ['Rehab budget', '− ' + usd(d.rehabBudget)],
    ['Holding costs', '− ' + usd(d.holdingCosts)],
    ['Closing / selling', '− ' + usd(d.closingCosts)],
  ];
  return `
  <h2>Deal math</h2>
  <div class="dealgrid">
    <div class="waterfall">
      ${lines.map(([k, val]) => `<div class="wf-row"><span>${esc(k)}</span><span>${val}</span></div>`).join('')}
      <div class="wf-row wf-total"><span>Projected profit</span><span>${d.projectedProfit !== undefined ? usd(d.projectedProfit) : '—'}</span></div>
    </div>
    <div class="offer-cards">
      <div class="offer-card"><div class="offer-label">Max allowable offer</div><div class="offer-value">${usd(d.maxAllowableOffer)}</div><div class="offer-sub">to hit target profit</div></div>
      <div class="offer-card"><div class="offer-label">70%-rule cross-check</div><div class="offer-value">${usd(d.seventyRuleOffer)}</div><div class="offer-sub">0.70 × ARV − rehab</div></div>
    </div>
  </div>`;
}

function rental(b: Branding, v: Valuation): string {
  const r = v.rental!;
  return `
  <h2>Rental / BRRRR value</h2>
  <div class="rental-row">
    <div class="rental-stat"><div class="rs-label">Market rent</div><div class="rs-value">${usd(r.monthlyRent)}<span>/mo</span></div></div>
    <div class="rental-stat"><div class="rs-label">Net operating income</div><div class="rs-value">${usd(r.noi)}<span>/yr</span></div></div>
    <div class="rental-stat"><div class="rs-label">Cap rate</div><div class="rs-value">${pct(r.capRate, 1)}</div></div>
    <div class="rental-stat rental-stat--primary"><div class="rs-label">Income-approach value</div><div class="rs-value">${usd(r.incomeValue)}</div></div>
  </div>`;
}

function areaPricePerSqft(b: Branding, v: Valuation, finishedSqft: number, comps?: Comp[]): string {
  const rings = comps ? medianRings(comps, finishedSqft) : null;
  const body = rings
    ? `<table class="matrix">
        <thead><tr><th scope="col">Radius</th><th scope="col">As-Is median $/sqft</th><th scope="col">Renovated median $/sqft</th><th scope="col">Implied ARV</th><th scope="col">Comps</th></tr></thead>
        <tbody>${rings
          .map(
            (r) => `<tr><th scope="row">${r.radius} mi</th><td>${ppsf(r.asIsMedian)}</td><td>${ppsf(r.renovatedMedian)}</td><td class="num-strong">${usd(r.impliedArv)}</td><td>${num(r.count)}</td></tr>`,
          )
          .join('')}</tbody>
      </table>`
    : `<div class="area-simple">
        <div class="area-stat"><div class="rs-label">As-Is median</div><div class="rs-value">${ppsf(v.areaPricePerSqft.asIsMedian)}<span>/sqft</span></div></div>
        <div class="area-stat"><div class="rs-label">Renovated median</div><div class="rs-value">${ppsf(v.areaPricePerSqft.renovatedMedian)}<span>/sqft</span></div></div>
        <div class="area-stat"><div class="rs-label">Radius used</div><div class="rs-value">${v.radiusMiles} mi</div></div>
      </div>`;
  return `
  <h2>Area price per square foot</h2>
  <p class="section-note">Median $/sqft by search radius, and the ARV implied by the renovated median at ${num(finishedSqft)} finished sqft.</p>
  ${body}`;
}

function compsTable(b: Branding, v: Valuation): string {
  const comps = [...v.compSelection.renovatedComps]
    .sort((a, c) => c.weight - a.weight)
    .slice(0, 12);
  const rows = comps
    .map((c) => {
      const url = safeUrl(c.sourceUrl);
      const addr = url ? `<a href="${url}" rel="noopener noreferrer">${esc(c.address)}</a>` : esc(c.address);
      return `
      <tr>
        <td>${addr}</td>
        <td>${num(c.sqft)}</td>
        <td>${ppsf(c.pricePerSqft)}</td>
        <td>${usd(c.salePrice)}</td>
        <td>${esc(humanDate(c.saleDate))}</td>
        <td>${c.distanceMiles.toFixed(1)} mi</td>
        <td>${weightBar(c.weight)}</td>
      </tr>`;
    })
    .join('');
  return `
  <h2>Supporting comparable sales</h2>
  <p class="section-note">Renovated comps within ${v.radiusMiles} mi, ranked by match weight. Each links to its source where available.</p>
  <table class="matrix comps">
    <thead><tr><th scope="col">Address</th><th scope="col">SqFt</th><th scope="col">$/sqft</th><th scope="col">Sale price</th><th scope="col">Sale date</th><th scope="col">Dist.</th><th scope="col">Match</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renders(b: Branding, v: Valuation, meta: ReportMeta): string {
  const tier: Tier = 'medium';
  const r = meta.renders?.[tier];
  const cell = (label: string, url?: string) =>
    url
      ? `<figure class="render"><img alt="${esc(label)}" src="${esc(url)}"/><figcaption>${esc(label)}</figcaption></figure>`
      : `<figure class="render render--empty"><div class="render-ph">${esc(label)}</div><figcaption>${esc(label)}</figcaption></figure>`;
  return `
  <h2>AI renders — ${TIER_LABEL[tier]} scope</h2>
  <p class="section-note">As-Is → Renovated → Renovated + Staged for the selected scope.</p>
  <div class="renders">
    ${cell('As-Is', r?.asIs)}
    ${cell('Renovated', r?.renovated)}
    ${cell('Renovated + Staged', r?.staged)}
  </div>`;
}

function confidenceMethod(b: Branding, v: Valuation): string {
  const c = v.confidence;
  const gauge = Math.max(0, Math.min(100, c.score));
  return `
  <h2>Confidence &amp; method</h2>
  <div class="conf">
    <div class="conf-gauge">
      <div class="gauge-track"><div class="gauge-fill" style="width:${gauge}%"></div></div>
      <div class="gauge-nums"><strong>${num(c.score)}/100</strong><span>FSD ${pct(c.fsd)}</span></div>
    </div>
    <p class="conf-note">${esc(c.note)}</p>
    <ul class="method">
      <li>${num(c.compCount)} renovated comps · dispersion ${pct(c.dispersion)} · radius ${c.radiusMiles} mi</li>
      <li>As-Is condition factor ${v.audit.conditionFactor.toFixed(3)} from condition ${num(v.audit.conditionScore)}/5</li>
      <li>${v.audit.avmProvider ? `Blended with ${esc(v.audit.avmProvider)} AVM (${usd(v.audit.avmValue)})` : 'Public-record comps only (no AVM)'}</li>
    </ul>
  </div>`;
}

function certificationBlock(b: Branding, meta: ReportMeta): string {
  const label =
    meta.certification === 'ai_human'
      ? `AI + human reviewed${meta.reviewerName ? ` by ${esc(meta.reviewerName)}` : ''}`
      : 'AI-generated automated valuation';
  return `
  <div class="cert">
    <div class="cert-title">Certification</div>
    <div class="cert-body">${label}. Report ${esc(meta.reportId)}, generated ${esc(humanDate(meta.generatedAt))}.</div>
  </div>`;
}

function footer(b: Branding, meta: ReportMeta): string {
  return `
  <footer class="disclaimer">
    <p><strong>${esc(NOT_AN_APPRAISAL)}</strong> Values are model-based estimates produced by ${esc(b.brandName)} from comparable sales, an automated valuation model, and an AI condition assessment. They are not a certified appraisal, a guarantee of value, or a loan commitment.</p>
    <p><strong>Business-purpose use only.</strong> Prepared for business-purpose real estate investment and lending use; not for consumer mortgage lending or any credit decision on a consumer&rsquo;s principal dwelling.</p>
    <p>${esc(b.brandName)} · ${esc(b.brandDomain)} · Report ${esc(meta.reportId)}</p>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function section(html: string): string {
  if (!html) return '';
  return `<section class="block">${html}</section>`;
}

function weightBar(weight: number): string {
  const w = Math.max(0, Math.min(1, weight));
  return `<span class="wbar" title="${(w * 100).toFixed(0)}% match"><span class="wbar-fill" style="width:${(w * 100).toFixed(0)}%"></span></span>`;
}

interface Ring {
  radius: number;
  asIsMedian: number;
  renovatedMedian: number;
  impliedArv: number;
  count: number;
}

/** 2/3/5-mile median $/sqft breakdown from raw comps (§3 "Area price/sqft"). */
function medianRings(comps: Comp[], finishedSqft: number): Ring[] {
  const radii = [2, 3, 5];
  return radii.map((radius) => {
    const within = comps.filter((c) => c.distanceMiles <= radius && c.sqft > 0);
    const reno = within.filter((c) => c.renovated).map((c) => c.salePrice / c.sqft);
    const asis = within.filter((c) => !c.renovated).map((c) => c.salePrice / c.sqft);
    const asIsMedian = median(asis);
    const renovatedMedian = median(reno);
    return {
      radius,
      asIsMedian,
      renovatedMedian,
      impliedArv: renovatedMedian * finishedSqft,
      count: within.length,
    };
  });
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
