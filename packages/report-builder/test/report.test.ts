import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeValuation } from '../../valuation-engine/src/index.ts';
import { comps, subject, AS_OF } from '../../valuation-engine/test/fixtures.ts';
import { renderReport } from '../src/index.ts';
import { esc, safeUrl } from '../src/format.ts';
import type { ReportMeta } from '../src/index.ts';

function build(metaOverrides?: Partial<ReportMeta>) {
  const valuation = computeValuation({
    subject,
    comps,
    asOf: AS_OF,
    avm: { value: 360_000, provider: 'HouseCanary' },
    deal: { purchasePrice: 290_000, holdingCosts: 14_000, closingCosts: 18_000, desiredProfit: 40_000 },
    rental: { monthlyRent: 2400 },
  });
  const meta: ReportMeta = {
    reportId: 'FM-TEST-1',
    generatedAt: `${AS_OF}T12:00:00Z`,
    certification: 'ai',
    propertyType: 'Single-family',
    ...metaOverrides,
  };
  return { valuation, html: renderReport({ valuation, comps, meta }) };
}

test('renders a complete self-contained HTML document', () => {
  const { html } = build();
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<style>/); // inline CSS, no external assets
  assert.doesNotMatch(html, /<script/i); // no scripts
  assert.doesNotMatch(html, /https?:\/\/[^"']*\.(css|js)/i); // no external css/js
});

test('includes every Section 3 block', () => {
  const { html } = build();
  for (const heading of [
    'Property facts',
    'Rehab condition levels',
    'Deal math',
    'Rental / BRRRR value',
    'Area price per square foot',
    'Supporting comparable sales',
    'AI renders',
    'Confidence &amp; method',
    'Certification',
  ]) {
    assert.ok(html.includes(heading), `missing block: ${heading}`);
  }
});

test('shows As-Is and all three ARV tiers', () => {
  const { valuation, html } = build();
  const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  assert.ok(html.includes(money(valuation.asIs)), 'As-Is value missing');
  for (const t of ['light', 'medium', 'high'] as const) {
    assert.ok(html.includes(money(valuation.arv[t])), `ARV ${t} missing`);
  }
});

test('carries the not-an-appraisal disclaimer and never the word appraised-value', () => {
  const { html } = build();
  assert.match(html, /not a licensed appraisal/i);
  assert.doesNotMatch(html, /appraised value/i);
});

test('certification reflects human review', () => {
  const { html } = build({ certification: 'ai_human', reviewerName: 'Jane Doe' });
  assert.match(html, /AI \+ Human Reviewed/);
  assert.match(html, /Jane Doe/);
});

test('escapes untrusted comp/subject strings (XSS guard)', () => {
  const evilComps = comps.map((c, i) =>
    i === 0 ? { ...c, address: '<img src=x onerror=alert(1)>', sourceUrl: 'javascript:alert(1)' } : c,
  );
  const valuation = computeValuation({ subject, comps: evilComps, asOf: AS_OF });
  const html = renderReport({
    valuation,
    comps: evilComps,
    meta: { reportId: 'X', generatedAt: `${AS_OF}T00:00:00Z`, certification: 'ai' },
  });
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.ok(html.includes('&lt;img src=x'));
  // javascript: URL must not become an href.
  assert.doesNotMatch(html, /href="javascript:/i);
});

test('format helpers: safeUrl and esc', () => {
  assert.equal(safeUrl('https://ok.com/x'), 'https://ok.com/x');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
  assert.equal(esc('a<b>&"\''), 'a&lt;b&gt;&amp;&quot;&#39;');
});
