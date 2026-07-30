import { VMARK_SVG, FAVICON_LINK } from '../../report-builder/src/brandAssets.ts';

/**
 * ValueProof — Web app shell + design system
 * Custom, self-contained design on the §12 concept palette: deep navy, gold,
 * green, with per-tier accents. Serif display / sans body, top navigation
 * (no sidebar), editorial report-desk feel — a number a lender can underwrite
 * against. No frameworks, no CDNs: one inline stylesheet.
 */

export const PALETTE = {
  navy: '#0D1B2A',
  navyInk: '#13263A',
  gold: '#C8A15A',
  green: '#1F6F54',
  light: '#3F9C6D',
  medium: '#2F7FB0',
  high: '#8A5CC0',
  paper: '#F7F5F0',
  card: '#FFFFFF',
  ink: '#1A2233',
  muted: '#5C6675',
  line: '#E3DFD5',
} as const;

const STYLES = `
:root {
  --navy: ${PALETTE.navy}; --navy-ink: ${PALETTE.navyInk}; --gold: ${PALETTE.gold};
  --green: ${PALETTE.green}; --tier-light: ${PALETTE.light}; --tier-medium: ${PALETTE.medium};
  --tier-high: ${PALETTE.high}; --paper: ${PALETTE.paper}; --card: ${PALETTE.card};
  --ink: ${PALETTE.ink}; --muted: ${PALETTE.muted}; --line: ${PALETTE.line};
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
h1, h2, h3, .wordmark, .stat-value { font-family: Georgia, "Times New Roman", serif; }

/* Top bar — navigation first, never a sidebar. */
.topbar {
  background: var(--navy); color: #EDE8DC; display: flex; align-items: center;
  gap: 28px; padding: 0 28px; height: 60px; border-bottom: 3px solid var(--gold);
}
.wordmark { font-size: 19px; letter-spacing: 0.06em; color: #fff; text-decoration: none; white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; }
.wordmark b { color: var(--gold); font-weight: 700; }
.logo-chip { background: #fff; border-radius: 7px; padding: 3px 4px 1px; display: inline-flex; }
.logo-chip svg { height: 20px; width: 20px; display: block; }
.nav { display: flex; gap: 4px; flex: 1; }
.nav a {
  color: #C9CFD8; text-decoration: none; padding: 7px 14px; border-radius: 6px; font-size: 14px;
}
.nav a:hover { color: #fff; background: var(--navy-ink); }
.nav a.active { color: var(--navy); background: var(--gold); font-weight: 600; }
.topbar form { margin: 0; }
.linklike { background: none; border: 0; color: #C9CFD8; cursor: pointer; font-size: 13px; padding: 6px 10px; }
.linklike:hover { color: #fff; }

.wrap { max-width: 1060px; margin: 0 auto; padding: 30px 24px 60px; }
.page-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; }
.page-head h1 { margin: 0; font-size: 26px; color: var(--navy); }
.page-head .sub { color: var(--muted); font-size: 13px; }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 22px 24px; margin-bottom: 18px; }
.card h2 { margin: 0 0 12px; font-size: 17px; color: var(--navy); }

.grid { display: grid; gap: 16px; }
.grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
@media (max-width: 760px) { .grid.cols-3 { grid-template-columns: 1fr; } .topbar { padding: 0 14px; gap: 12px; } .nav a { padding: 7px 8px; } }

.stat { border-left: 3px solid var(--gold); padding-left: 14px; }
.stat .stat-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.stat .stat-value { font-size: 26px; color: var(--navy); }

table.list { width: 100%; border-collapse: collapse; }
table.list th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); padding: 8px 10px; border-bottom: 2px solid var(--line); }
table.list td { padding: 11px 10px; border-bottom: 1px solid var(--line); font-size: 14px; }
table.list tr:hover td { background: #FBFAF6; }
.money { font-variant-numeric: tabular-nums; font-weight: 600; }

.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge.completed { background: #E7F3ED; color: var(--green); }
.badge.failed { background: #F9E9E7; color: #A3352B; }
.badge.running, .badge.queued { background: #EDF2F8; color: var(--tier-medium); }
.tier { font-weight: 700; }
.tier.light { color: var(--tier-light); } .tier.medium { color: var(--tier-medium); } .tier.high { color: var(--tier-high); }

form.stack label { display: block; font-size: 13px; font-weight: 600; color: var(--navy); margin: 14px 0 4px; }
form.stack input[type="text"], form.stack input[type="number"], form.stack input[type="password"], form.stack input[type="url"], form.stack select {
  width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 7px; font-size: 14px; background: #fff;
}
form.stack input:focus { outline: 2px solid var(--gold); border-color: var(--gold); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.hint { font-size: 12px; color: var(--muted); margin-top: 3px; }
.hint.err { color: #b3392f; }
.photo-list { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }

.attestation {
  background: #FAF6ED; border: 1px solid var(--gold); border-radius: 8px; padding: 16px 18px; margin-top: 20px;
}
.attestation h3 { margin: 0 0 8px; font-size: 14px; color: var(--navy); }
.attestation label { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; font-weight: 400; margin: 8px 0 0; color: var(--ink); }
.attestation input { margin-top: 3px; }

.btn {
  display: inline-block; background: var(--navy); color: #fff; border: 0; border-radius: 7px;
  padding: 11px 22px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none;
}
.btn:hover { background: var(--navy-ink); }
.btn.gold { background: var(--gold); color: var(--navy); }
.btn.gold:hover { filter: brightness(1.05); }
.btn.small { padding: 6px 14px; font-size: 13px; }
.actions { margin-top: 22px; display: flex; gap: 12px; align-items: center; }

.flash { border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 14px; }
.flash.error { background: #F9E9E7; color: #7E2A22; border: 1px solid #E5B9B3; }
.flash.ok { background: #E7F3ED; color: #17513E; border: 1px solid #BCDCCB; }

.empty { color: var(--muted); text-align: center; padding: 34px 0; font-size: 14px; }
.footer-note { color: var(--muted); font-size: 12px; margin-top: 26px; border-top: 1px solid var(--line); padding-top: 14px; }
.footer-note a { color: var(--muted); }

/* Login */
.login-hero { min-height: calc(100vh - 60px); display: grid; place-items: center; }
.login-card { width: 420px; max-width: 92vw; }
.login-card .mark { font-size: 30px; margin-bottom: 4px; }
.login-card .tag { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
`;

export interface PageOptions {
  title: string;
  active?: 'dashboard' | 'new' | 'watches' | 'materials' | 'billing' | 'none';
  authed?: boolean;
  flash?: { kind: 'ok' | 'error'; text: string };
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function page(opts: PageOptions, body: string): string {
  const nav = opts.authed
    ? `<nav class="nav">
        <a href="/app" class="${opts.active === 'dashboard' ? 'active' : ''}">Valuations</a>
        <a href="/app/valuations/new" class="${opts.active === 'new' ? 'active' : ''}">New valuation</a>
        <a href="/app/watches" class="${opts.active === 'watches' ? 'active' : ''}">Watches</a>
        <a href="/app/materials" class="${opts.active === 'materials' ? 'active' : ''}">Materials</a>
        <a href="/app/billing" class="${opts.active === 'billing' ? 'active' : ''}">Billing</a>
      </nav>
      <form method="post" action="/app/logout"><button class="linklike" type="submit">Sign out</button></form>`
    : '<nav class="nav"></nav>';

  const flash = opts.flash ? `<div class="flash ${opts.flash.kind}">${esc(opts.flash.text)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)} — ValueProof</title>
${FAVICON_LINK}
<style>${STYLES}</style>
</head>
<body>
<header class="topbar">
  <a class="wordmark" href="/app"><span class="logo-chip">${VMARK_SVG}</span>ValueProof<b>.</b></a>
  ${nav}
</header>
<main class="wrap">
${flash}
${body}
<p class="footer-note">Automated valuations are estimates, not licensed appraisals. Business-purpose, non-owner-occupied use only ·
<a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a></p>
</main>
</body>
</html>`;
}

export function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
