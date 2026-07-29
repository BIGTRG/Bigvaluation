/**
 * {{BRAND_NAME}} — Web app pages
 * Pure render functions: data in, HTML out. All state comes from the API.
 */

import { page, esc, money } from './ui.ts';
import type { PageOptions } from './ui.ts';

type Flash = PageOptions['flash'];

export function loginPage(flash?: Flash): string {
  return page({ title: 'Sign in', authed: false, active: 'none', flash }, `
<div class="login-hero"><div class="card login-card">
  <div class="mark wordmark" style="color: var(--navy)">{{BRAND_NAME}}<b style="color: var(--gold)">.</b></div>
  <div class="tag">As-Is and after-repair values for investors and private lenders.</div>
  <form class="stack" method="post" action="/app/login">
    <label for="apiKey">API key</label>
    <input type="password" id="apiKey" name="apiKey" placeholder="fmk_..." autocomplete="off" required>
    <p class="hint">Issued with your account. Partners: use any key with read scopes.</p>
    <div class="actions"><button class="btn gold" type="submit">Sign in</button></div>
  </form>
</div></div>`);
}

export interface ValuationRow {
  id: string;
  status: string;
  asIs?: number;
  arv?: Record<string, number>;
  reportId?: string;
  error?: string;
}

export function dashboardPage(rows: ValuationRow[], flash?: Flash): string {
  const completed = rows.filter((r) => r.status === 'completed');
  const totalArv = completed.reduce((s, r) => s + (r.arv?.medium ?? 0), 0);

  const table = rows.length
    ? `<table class="list">
<thead><tr><th>Valuation</th><th>Status</th><th>As-Is</th><th>ARV L / M / H</th><th></th></tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr>
  <td><code>${esc(r.id)}</code></td>
  <td><span class="badge ${esc(r.status)}">${esc(r.status)}</span></td>
  <td class="money">${money(r.asIs)}</td>
  <td>
    <span class="tier light">${money(r.arv?.light)}</span> ·
    <span class="tier medium">${money(r.arv?.medium)}</span> ·
    <span class="tier high">${money(r.arv?.high)}</span>
  </td>
  <td>${r.reportId ? `<a class="btn small" href="/app/reports/${esc(r.reportId)}">Report</a>` : esc(r.error ?? '')}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table>`
    : `<div class="empty">No valuations yet — order your first one.</div>`;

  return page({ title: 'Valuations', authed: true, active: 'dashboard', flash }, `
<div class="page-head"><h1>Valuations</h1><a class="btn gold" href="/app/valuations/new">New valuation</a></div>
<div class="grid cols-3" style="margin-bottom:18px">
  <div class="card stat"><div class="stat-label">Reports run</div><div class="stat-value">${rows.length}</div></div>
  <div class="card stat"><div class="stat-label">Completed</div><div class="stat-value">${completed.length}</div></div>
  <div class="card stat"><div class="stat-label">Medium-scope ARV analyzed</div><div class="stat-value">${money(totalArv)}</div></div>
</div>
<div class="card">${table}</div>`);
}

export function newValuationPage(flash?: Flash): string {
  return page({ title: 'New valuation', authed: true, active: 'new', flash }, `
<div class="page-head"><h1>New valuation</h1><span class="sub">As-Is + Light / Medium / High ARV in one report</span></div>
<div class="card">
<form class="stack" method="post" action="/app/valuations/new">
  <label for="address">Property address</label>
  <input type="text" id="address" name="address" placeholder="123 Main St, Raleigh, NC 27601" required>

  <div class="field-row">
    <div>
      <label for="purchasePrice">Purchase price (optional)</label>
      <input type="number" id="purchasePrice" name="purchasePrice" min="0" step="1000" placeholder="290000">
      <p class="hint">Enables deal math: projected profit + max allowable offer.</p>
    </div>
    <div>
      <label for="monthlyRent">Expected monthly rent (optional)</label>
      <input type="number" id="monthlyRent" name="monthlyRent" min="0" step="50" placeholder="2400">
      <p class="hint">Enables the rental / BRRRR value section.</p>
    </div>
  </div>

  <div class="field-row">
    <div>
      <label for="conditionScore">Current condition (if known)</label>
      <select id="conditionScore" name="conditionScore">
        <option value="">Let the AI assess / unknown</option>
        <option value="1">1 — Gut / distressed</option>
        <option value="2">2 — Dated, heavy wear</option>
        <option value="3">3 — Average</option>
        <option value="4">4 — Updated</option>
        <option value="5">5 — Fully renovated</option>
      </select>
    </div>
    <div>
      <label for="radiusMiles">Comp radius start</label>
      <select id="radiusMiles" name="radiusMiles">
        <option value="2">2 miles (widens automatically)</option>
        <option value="3">3 miles</option>
        <option value="5">5 miles</option>
      </select>
    </div>
  </div>

  <div class="attestation">
    <h3>Business-purpose attestation (required)</h3>
    <label><input type="checkbox" name="businessPurpose" value="true" required>
      I attest this valuation supports a <b>business-purpose</b> real estate investment or lending decision — not consumer-purpose credit.</label>
    <label><input type="checkbox" name="nonOwnerOccupied" value="true" required>
      I attest the subject property <b>is not and will not be a borrower's principal dwelling</b>.</label>
  </div>

  <div class="actions">
    <button class="btn gold" type="submit">Run valuation</button>
    <span class="hint">Typically completes in under a minute.</span>
  </div>
</form>
</div>`);
}

export interface WatchRow {
  id: string;
  subject: Record<string, unknown>;
  lastAsIs?: number;
  lastArv?: number;
  lastCheckedAt?: number;
  changeDelta?: number;
  webhookUrl?: string;
}

export function watchesPage(rows: WatchRow[], flash?: Flash): string {
  const table = rows.length
    ? `<table class="list">
<thead><tr><th>Property</th><th>Last As-Is</th><th>Last ARV</th><th>Last move</th><th>Checked</th></tr></thead>
<tbody>
${rows
  .map(
    (w) => `<tr>
  <td>${esc((w.subject as { address?: string }).address ?? w.id)}</td>
  <td class="money">${money(w.lastAsIs)}</td>
  <td class="money">${money(w.lastArv)}</td>
  <td>${w.changeDelta !== undefined ? `${(w.changeDelta * 100).toFixed(1)}%` : '—'}</td>
  <td>${w.lastCheckedAt ? esc(new Date(w.lastCheckedAt).toISOString().slice(0, 10)) : 'pending first sweep'}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table>`
    : `<div class="empty">No watched properties. Add one — it re-values automatically as the market moves.</div>`;

  return page({ title: 'Watches', authed: true, active: 'watches', flash }, `
<div class="page-head"><h1>Live monitoring</h1><span class="sub">Watched properties re-value automatically; webhooks fire on moves ≥ threshold</span></div>
<div class="card">${table}</div>
<div class="card">
<h2>Watch a property</h2>
<form class="stack" method="post" action="/app/watches">
  <label for="waddress">Property address</label>
  <input type="text" id="waddress" name="address" placeholder="123 Main St, Raleigh, NC 27601" required>
  <label for="webhookUrl">Webhook URL (optional)</label>
  <input type="url" id="webhookUrl" name="webhookUrl" placeholder="https://your-system.example.com/hooks/value-change">
  <div class="attestation">
    <h3>Business-purpose attestation (required)</h3>
    <label><input type="checkbox" name="businessPurpose" value="true" required> Business-purpose decision, not consumer credit.</label>
    <label><input type="checkbox" name="nonOwnerOccupied" value="true" required> Not a borrower's principal dwelling.</label>
  </div>
  <div class="actions"><button class="btn" type="submit">Start watching</button></div>
</form>
</div>`);
}

export interface BillingView {
  plan: string;
  subscriptionStatus?: string;
  usageUnits: number;
  billingEnabled: boolean;
}

export function billingPage(v: BillingView, flash?: Flash): string {
  const planLabel = { payg: 'Pay-as-you-go', pro: 'Pro member', partner: 'API partner' }[v.plan] ?? v.plan;
  const checkout = v.billingEnabled
    ? `<div class="grid cols-3">
  <div class="card">
    <h2>Single report</h2>
    <p class="hint">One address, full report: As-Is, 3-tier ARV, deal math, rental value.</p>
    <form method="post" action="/app/billing/checkout"><input type="hidden" name="product" value="report">
    <div class="actions"><button class="btn" type="submit">Buy a report</button></div></form>
  </div>
  <div class="card">
    <h2>Pro membership</h2>
    <p class="hint">Monthly. Discounted reports + saved properties stay live-monitored.</p>
    <form method="post" action="/app/billing/checkout"><input type="hidden" name="product" value="pro">
    <div class="actions"><button class="btn gold" type="submit">Go Pro</button></div></form>
  </div>
  <div class="card">
    <h2>API partner</h2>
    <p class="hint">Volume / rev-share licensing for platforms. Provisioned by contract.</p>
    <div class="actions"><a class="btn small" href="mailto:partners@{{BRAND_DOMAIN}}">Contact us</a></div>
  </div>
</div>`
    : `<div class="card"><div class="empty">Online billing is not enabled on this deployment. Contact your administrator.</div></div>`;

  return page({ title: 'Billing', authed: true, active: 'billing', flash }, `
<div class="page-head"><h1>Billing</h1></div>
<div class="grid cols-3" style="margin-bottom:18px">
  <div class="card stat"><div class="stat-label">Plan</div><div class="stat-value">${esc(planLabel)}</div></div>
  <div class="card stat"><div class="stat-label">Subscription</div><div class="stat-value">${esc(v.subscriptionStatus ?? '—')}</div></div>
  <div class="card stat"><div class="stat-label">Metered usage (units)</div><div class="stat-value">${v.usageUnits}</div></div>
</div>
${checkout}`);
}

export function errorPage(status: number, message: string, authed: boolean): string {
  return page({ title: `Error ${status}`, authed, active: 'none' }, `
<div class="card"><h2>Something went wrong (${status})</h2><p>${esc(message)}</p>
<div class="actions"><a class="btn" href="/app">Back to dashboard</a></div></div>`);
}
