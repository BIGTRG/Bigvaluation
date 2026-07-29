/**
 * ValueProof — Web app: Material Intelligence pages (§4.3 add-on)
 * Guided scope-of-work builder, analyst read-out, send-a-link management,
 * and the public borrower form. Pure render functions.
 */

import { page, esc, money } from './ui.ts';
import type { PageOptions } from './ui.ts';

type Flash = PageOptions['flash'];

export interface MatrixCategoryView {
  id: string;
  label: string;
  capping?: boolean;
  examples: { light: string; medium: string; high: string };
}

export interface AnalysisSummaryRow {
  id: string;
  valuationId?: string;
  subject?: { address?: string };
  detectedTier?: string;
  detectedLabel?: string;
  trueScopeArv?: number;
  source?: string;
  createdAt?: number;
}

export interface LinkRow {
  id: string;
  url: string;
  status: string;
  analysisId?: string;
  subject?: { address?: string };
  createdAt?: number;
}

export interface ValuationOption {
  id: string;
  address?: string;
  arvMedium?: number;
}

const TIER_CLASS: Record<string, string> = { light: 'light', medium: 'medium', high: 'high' };

export function materialsPage(analyses: AnalysisSummaryRow[], links: LinkRow[], flash?: Flash): string {
  const analysisTable = analyses.length
    ? `<table class="list">
<thead><tr><th>Analysis</th><th>Property</th><th>Finish read</th><th>True-scope ARV</th><th>Source</th><th></th></tr></thead>
<tbody>
${analyses
  .map(
    (a) => `<tr>
  <td><code>${esc(a.id)}</code></td>
  <td>${esc(a.subject?.address ?? '—')}</td>
  <td><span class="tier ${TIER_CLASS[a.detectedTier ?? ''] ?? ''}">${esc(a.detectedLabel ?? a.detectedTier ?? '—')}</span></td>
  <td class="money">${money(a.trueScopeArv)}</td>
  <td>${esc(a.source ?? 'builder')}</td>
  <td><a class="btn small" href="/app/materials/${esc(a.id)}">Read-out</a></td>
</tr>`,
  )
  .join('\n')}
</tbody></table>`
    : `<div class="empty">No material analyses yet. Submit an actual scope of work — the analyst reads the materials and prices the true finish level.</div>`;

  const linkTable = links.length
    ? `<table class="list">
<thead><tr><th>Link</th><th>Property</th><th>Status</th><th></th></tr></thead>
<tbody>
${links
  .map(
    (l) => `<tr>
  <td><input type="text" readonly value="${esc(l.url)}" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--line);border-radius:6px" onclick="this.select()"></td>
  <td>${esc(l.subject?.address ?? '—')}</td>
  <td><span class="badge ${l.status === 'submitted' ? 'completed' : 'running'}">${esc(l.status)}</span></td>
  <td>${l.analysisId ? `<a class="btn small" href="/app/materials/${esc(l.analysisId)}">Read-out</a>` : ''}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table>`
    : `<div class="empty">No borrower links yet. Send one — the borrower fills the scope digitally, you get the analyst read-out.</div>`;

  return page({ title: 'Materials', authed: true, active: 'materials', flash }, `
<div class="page-head"><h1>Material Intelligence</h1><a class="btn gold" href="/app/materials/new">Submit a scope of work</a></div>
<div class="card"><h2>Analyst read-outs</h2>${analysisTable}</div>
<div class="card"><h2>Borrower links</h2>${linkTable}</div>`);
}

export function materialBuilderPage(
  categories: MatrixCategoryView[],
  valuations: ValuationOption[],
  flash?: Flash,
): string {
  const valuationOptions = valuations
    .map((v) => `<option value="${esc(v.id)}">${esc(v.address ?? v.id)}${v.arvMedium ? ` — medium ARV ${money(v.arvMedium)}` : ''}</option>`)
    .join('\n');

  return page({ title: 'Submit scope of work', authed: true, active: 'materials', flash }, `
<div class="page-head"><h1>Submit your actual scope of work</h1>
<span class="sub">The analyst reads the materials — not a slider guess — and prices the true finish level</span></div>
<div class="card">
<form class="stack" method="post" action="/app/materials/new">
  <label for="valuationId">Anchor valuation (recommended)</label>
  <select id="valuationId" name="valuationId">
    <option value="">None — finish read only, no ARV</option>
    ${valuationOptions}
  </select>
  <p class="hint">The true-scope ARV interpolates between this valuation's comp-derived tier values.</p>

  <h2 style="margin-top:20px">Pick your materials</h2>
  <p class="hint">Fill what you know — every line sharpens the read. Leave the rest blank.</p>
  ${materialFields(categories, 'mat_')}

  <label for="extra" style="margin-top:18px">Anything else — or paste an existing scope of work</label>
  <textarea id="extra" name="extra" rows="5" placeholder="Kitchen counters: Granite / quartz&#10;Flooring: Solid hardwood&#10;Roof: Architectural shingle" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:7px;font-size:14px;font-family:inherit"></textarea>
  <p class="hint">One material per line ("Category: material"). Uploaded PDFs/spreadsheets: paste the line items here.</p>

  <div class="attestation">
    <h3>Business-purpose attestation (required)</h3>
    <label><input type="checkbox" name="businessPurpose" value="true" required> Business-purpose decision, not consumer credit.</label>
    <label><input type="checkbox" name="nonOwnerOccupied" value="true" required> Not a borrower's principal dwelling.</label>
  </div>

  <div class="actions"><button class="btn gold" type="submit">Run the analyst</button></div>
</form>
</div>
<div class="card">
<h2>Or send the borrower a link</h2>
<p class="hint">They fill the scope digitally — no spreadsheets emailed back and forth. They never see your numbers.</p>
<form class="stack" method="post" action="/app/materials/link">
  <label for="lval">Anchor valuation</label>
  <select id="lval" name="valuationId"><option value="">None</option>${valuationOptions}</select>
  <label for="laddr">Property address (shown to the borrower)</label>
  <input type="text" id="laddr" name="address" placeholder="1420 Ashby St">
  <div class="attestation">
    <h3>Business-purpose attestation (required)</h3>
    <label><input type="checkbox" name="businessPurpose" value="true" required> Business-purpose decision, not consumer credit.</label>
    <label><input type="checkbox" name="nonOwnerOccupied" value="true" required> Not a borrower's principal dwelling.</label>
  </div>
  <div class="actions"><button class="btn" type="submit">Create borrower link</button></div>
</form>
</div>`);
}

/** Shared per-category inputs (builder + borrower form). */
function materialFields(categories: MatrixCategoryView[], prefix: string): string {
  return `<div class="field-row" style="grid-template-columns:1fr 1fr">
${categories
  .map(
    (c) => `<div>
  <label for="${prefix}${esc(c.id)}">${esc(c.label)}</label>
  <input type="text" id="${prefix}${esc(c.id)}" name="${prefix}${esc(c.id)}" list="dl_${esc(c.id)}"
    placeholder="e.g. ${esc(c.examples.medium)}">
  <datalist id="dl_${esc(c.id)}">
    <option value="${esc(c.examples.light)}">
    <option value="${esc(c.examples.medium)}">
    <option value="${esc(c.examples.high)}">
  </datalist>
</div>`,
  )
  .join('\n')}
</div>`;
}

export interface AnalysisView {
  id: string;
  valuationId?: string;
  subject?: { address?: string; sqft?: number };
  detectedTier?: string;
  detectedLabel?: string;
  finishScore?: number;
  capped?: boolean;
  trueScopeArv?: number;
  pricePerSqft?: number;
  vsGenericTier?: { tier: string; arv: number; deltaUsd: number };
  reasoning?: string;
  lines?: { categoryLabel: string; material: string; score: number; capping?: boolean }[];
  source?: string;
}

const SCORE_LABEL: Record<number, string> = { 0: 'unmatched', 1: 'light', 2: 'medium', 3: 'luxury' };
const SCORE_CLASS: Record<number, string> = { 1: 'light', 2: 'medium', 3: 'high' };

export function materialAnalysisPage(a: AnalysisView, flash?: Flash): string {
  const lines = (a.lines ?? [])
    .map(
      (l) => `<tr>
  <td>${esc(l.categoryLabel)}${l.capping ? ' <span class="hint" style="display:inline">(gate)</span>' : ''}</td>
  <td>${esc(l.material)}</td>
  <td><span class="tier ${SCORE_CLASS[l.score] ?? ''}">${esc(SCORE_LABEL[l.score] ?? l.score)}</span></td>
</tr>`,
    )
    .join('\n');

  const delta = a.vsGenericTier
    ? `<div class="card stat"><div class="stat-label">vs. generic ${esc(a.vsGenericTier.tier)} preset</div>
       <div class="stat-value">${a.vsGenericTier.deltaUsd >= 0 ? '+' : '−'}${money(Math.abs(a.vsGenericTier.deltaUsd))}</div></div>`
    : '';

  return page({ title: 'Analyst read-out', authed: true, active: 'materials', flash }, `
<div class="page-head"><h1>Analyst read-out — material intelligence</h1>
<span class="sub">${esc(a.subject?.address ?? '')}</span></div>
<div class="grid cols-3" style="margin-bottom:18px">
  <div class="card stat"><div class="stat-label">Detected finish level</div>
    <div class="stat-value" style="font-size:19px">${esc(a.detectedLabel ?? '—')}</div>
    <p class="hint">Finish score ${a.finishScore ?? '—'} / 3${a.capped ? ' · capped by standard-grade gates' : ''}</p></div>
  <div class="card stat"><div class="stat-label">True-scope ARV</div>
    <div class="stat-value">${money(a.trueScopeArv)}</div>
    <p class="hint">${a.pricePerSqft ? `≈$${Math.round(a.pricePerSqft)}/sqft · ` : ''}materials-driven</p></div>
  ${delta}
</div>
<div class="card"><h2>Why — the analyst's reasoning</h2><p>${esc(a.reasoning ?? '')}</p>
${a.valuationId ? `<p class="hint">Anchored to valuation <code>${esc(a.valuationId)}</code> — the true-scope ARV interpolates its comp-derived tier values.</p>` : ''}</div>
<div class="card"><h2>Material read-out, line by line</h2>
<table class="list"><thead><tr><th>Category</th><th>Material submitted</th><th>Reads as</th></tr></thead><tbody>${lines}</tbody></table>
</div>
<div class="actions"><a class="btn" href="/app/materials">Back to Material Intelligence</a></div>`);
}

// --- Borrower-facing (public, tokenized — no session, no values) -------------

export function borrowerSowPage(
  token: string,
  address: string | undefined,
  categories: MatrixCategoryView[],
  errorText?: string,
): string {
  const flash = errorText ? { kind: 'error' as const, text: errorText } : undefined;
  return page({ title: 'Scope of work', authed: false, active: 'none', flash }, `
<div class="page-head"><h1>Digital scope of work${address ? ` — ${esc(address)}` : ''}</h1>
<span class="sub">Pick the materials going into the renovation. Takes about two minutes.</span></div>
<div class="card">
<form class="stack" method="post" action="/app/sow/${esc(token)}">
  ${materialFields(categories, 'mat_')}
  <label for="extra" style="margin-top:18px">Anything else about the renovation</label>
  <textarea id="extra" name="extra" rows="4" placeholder="Windows: Vinyl, energy-rated&#10;New HVAC" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:7px;font-size:14px;font-family:inherit"></textarea>
  <div class="actions"><button class="btn gold" type="submit">Submit scope of work</button></div>
  <p class="hint">Your materials are sent to the requesting party for their analysis. Fill what you know; leave the rest blank.</p>
</form>
</div>`);
}

export function borrowerDonePage(): string {
  return page({ title: 'Scope received', authed: false, active: 'none' }, `
<div class="card" style="text-align:center;padding:48px 24px">
  <h1 style="color:var(--navy)">Scope of work received</h1>
  <p>Thank you — your material choices were submitted to the requesting party. You can close this page.</p>
</div>`);
}

export function borrowerClosedPage(status: string): string {
  return page({ title: 'Link unavailable', authed: false, active: 'none' }, `
<div class="card" style="text-align:center;padding:48px 24px">
  <h1 style="color:var(--navy)">This link is no longer active</h1>
  <p>${status === 'submitted' ? 'A scope of work was already submitted through this link.' : 'This link has expired.'} Contact the person who sent it if you need to make changes.</p>
</div>`);
}
