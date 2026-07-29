/**
 * {{BRAND_NAME}} — Legal pages (§4.7, §10)
 * Terms of Service and Privacy Policy served as public routes so every
 * deployment ships them from day one. Plain, self-contained HTML — no build
 * step, no framework. Brand tokens resolve at find-and-replace time.
 *
 * NOTE: these are working drafts prepared for counsel review before public
 * launch (deon_compliance_precheck / launch checklist).
 */

const STYLE = `
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a2233; max-width: 760px; margin: 0 auto; padding: 40px 24px; line-height: 1.6; background: #fff; }
  h1 { font-size: 26px; color: #0D1B2A; border-bottom: 2px solid #C8A15A; padding-bottom: 10px; }
  h2 { font-size: 18px; color: #0D1B2A; margin-top: 28px; }
  p, li { font-size: 15px; }
  .updated { color: #667; font-size: 13px; }
  .critical { background: #f7f2e8; border-left: 4px solid #C8A15A; padding: 12px 16px; }
  footer { margin-top: 40px; color: #667; font-size: 12px; border-top: 1px solid #ddd; padding-top: 12px; }
`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — {{BRAND_NAME}}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
<footer>{{BRAND_NAME}} · {{BRAND_DOMAIN}} · Automated valuations are estimates, not licensed appraisals.</footer>
</body>
</html>`;
}

export const TERMS_HTML: string = page(
  'Terms of Service',
  `<h1>Terms of Service</h1>
<p class="updated">Working draft — subject to counsel review before public launch.</p>

<h2>1. The Service</h2>
<p>{{BRAND_NAME}} provides automated, data-driven property analytics: estimated as-is prices, estimated after-repair values (ARV) across rehab scopes, rehab cost estimates, deal math, rental analysis, and related reports and APIs (the "Service").</p>

<div class="critical">
<h2>2. Business-Purpose, Investor-Only Use</h2>
<p>The Service is offered exclusively for <strong>business-purpose real estate investment and lending decisions on non-owner-occupied property</strong>. You represent, for every request you submit, that (a) the subject property is not and will not be a borrower's principal dwelling, and (b) any lending decision informed by the output is business-purpose. You may not use the Service, and may not permit any downstream party to use the Service, in connection with consumer-purpose credit or any valuation of a consumer's principal dwelling. Each API request requires an explicit attestation to this effect, which we record.</p>
</div>

<h2>3. Not an Appraisal</h2>
<p>All outputs are automated, model-based estimates. <strong>Nothing produced by the Service is an appraisal, an appraisal report, a certified valuation, a broker price opinion, or a comparative market analysis</strong>, and no output is prepared by a licensed or certified real estate appraiser unless expressly delivered through a separately identified human-reviewed tier. Outputs are not a guarantee of value, price, or condition, and are not a commitment to lend.</p>

<h2>4. Accounts, Keys, and Fees</h2>
<p>API keys are issued per account and must be kept secret. Usage is metered and billed per the plan you select (pay-as-you-go, membership, or partner agreement). You are responsible for activity under your keys.</p>

<h2>5. Data and Licensing</h2>
<p>Reports and data are licensed to you for your internal business use and for sharing with parties to the specific transaction the report was ordered for. You may not resell, redistribute, scrape, or build derivative datasets from the Service outside a written partner agreement.</p>

<h2>6. API Partners</h2>
<p>Partners embedding the Service must pass through Sections 2 and 3 to their own users, must not use or permit use of outputs in consumer-purpose credit decisions, and must present the required disclaimers wherever values are displayed.</p>

<h2>7. Disclaimers and Limitation of Liability</h2>
<p>The Service is provided "as is" without warranties of any kind. Estimates depend on third-party data that may be incomplete or delayed. To the maximum extent permitted by law, our aggregate liability for any claim is limited to the fees you paid for the report or API calls giving rise to the claim.</p>

<h2>8. Changes</h2>
<p>We may update these terms; material changes will be notified to account holders. Continued use after notice is acceptance.</p>`
);

export const PRIVACY_HTML: string = page(
  'Privacy Policy',
  `<h1>Privacy Policy</h1>
<p class="updated">Working draft — subject to counsel review before public launch.</p>

<h2>1. What we collect</h2>
<ul>
<li><strong>Account data</strong>: name, email, company, billing details, API usage records.</li>
<li><strong>Property data</strong>: addresses, parcel identifiers, and characteristics of properties you submit, plus licensed third-party records (comparable sales, parcel, permit, and valuation data).</li>
<li><strong>Capture media</strong>: photos and video submitted through capture links, including GPS coordinates and timestamps embedded for fraud prevention.</li>
</ul>

<h2>2. Capture sessions</h2>
<p>Capture links may be sent to a person at the property who is not the account holder. The capture page states who requested the capture and what is collected. Media is used solely to assess property condition for the requested report, is encrypted in transit and at rest, and is not sold or used for advertising.</p>

<h2>3. How we use data</h2>
<p>To produce valuations and reports, operate and secure the Service, meter and bill usage, meet legal obligations, and improve model accuracy (in de-identified or aggregate form).</p>

<h2>4. Sharing</h2>
<p>We share data with service providers (hosting, payment processing, messaging) under contract, with data licensors as required by their terms, and when required by law. We do not sell personal information.</p>

<h2>5. Retention and audit trail</h2>
<p>Report inputs, data-source logs, and attestations are retained as part of the audit trail required by our compliance framework. Capture media is retained for the period stated in your plan, then deleted.</p>

<h2>6. Your choices</h2>
<p>Account holders may request access, correction, or deletion of personal data at privacy@{{BRAND_DOMAIN}}, subject to legal retention duties. Depending on your state of residence you may have additional rights.</p>

<h2>7. Not a consumer reporting agency</h2>
<p>{{BRAND_NAME}} provides property analytics, not consumer reports. The Service may not be used to determine any individual's eligibility for credit, employment, insurance, or housing.</p>`
);
