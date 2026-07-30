import { VMARK_SVG, FAVICON_LINK, wordmarkImg } from '../../report-builder/src/brandAssets.ts';

/**
 * ValueProof — Public marketing page (the retail front end).
 * Served at `/` for the world: retail investors buy reports, lenders join Pro,
 * enterprise platforms license the API. Same concept-deck look: deep navy,
 * gold, green, per-tier accents, serif display numbers.
 *
 * This page is static and unauthenticated — it never touches the API or any
 * customer data. All CTAs route to the app sign-in or the partnerships email.
 */

const NAVY = '#0D1B2A';
const NAVY_INK = '#13263A';
const GOLD = '#C8A15A';
const GREEN = '#1F6F54';
const T_LIGHT = '#3F9C6D';
const T_MED = '#2F7FB0';
const T_HIGH = '#8A5CC0';

const CSS = `
* { box-sizing: border-box; }
body { margin: 0; background: #F7F5F0; color: #1A2233;
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
h1, h2, h3, .serif { font-family: Georgia, "Times New Roman", serif; }
a { color: ${GREEN}; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }

.topbar { background: ${NAVY}; border-bottom: 3px solid ${GOLD}; }
.topbar .wrap { display: flex; align-items: center; height: 62px; gap: 24px; }
.wordmark { font-family: Georgia, serif; font-size: 20px; letter-spacing: .06em; color: #fff; text-decoration: none; display: inline-flex; align-items: center; gap: 9px; }
.wordmark b { color: ${GOLD}; }
.logo-chip { background: #fff; border-radius: 7px; padding: 3px 4px 1px; display: inline-flex; }
.logo-chip svg { height: 22px; width: 22px; display: block; }
.topnav { flex: 1; display: flex; gap: 20px; }
.topnav a { color: #C9CFD8; text-decoration: none; font-size: 14px; }
.topnav a:hover { color: #fff; }
.btn { display: inline-block; padding: 11px 22px; border-radius: 8px; text-decoration: none;
  font-weight: 600; font-size: 15px; }
.btn-gold { background: ${GOLD}; color: ${NAVY}; }
.btn-gold:hover { filter: brightness(1.06); }
.btn-line { border: 1px solid #C9CFD8; color: #EDE8DC; }
.btn-green { background: ${GREEN}; color: #fff; }

.hero { background: linear-gradient(160deg, ${NAVY} 0%, ${NAVY_INK} 70%); color: #EDE8DC; padding: 72px 0 84px; }
.hero .wrap { display: grid; grid-template-columns: 1.05fr .95fr; gap: 56px; align-items: center; }
.kicker { color: ${GOLD}; font-size: 13px; letter-spacing: .18em; text-transform: uppercase; font-weight: 700; }
.hero h1 { font-size: 44px; line-height: 1.12; margin: 14px 0 18px; color: #fff; }
.hero p.sub { font-size: 18px; color: #B9C2CE; margin: 0 0 28px; }
.hero .ctas { display: flex; gap: 14px; align-items: center; }
.hero .fine { margin-top: 22px; font-size: 13px; color: #8794A3; }

.report-card { background: #fff; color: #1A2233; border-radius: 14px; padding: 26px 28px;
  box-shadow: 0 24px 60px rgba(0,0,0,.35); }
.report-card .addr { font-size: 13px; color: #5C6675; margin-bottom: 14px; }
.vals { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
.val { border: 1px solid #E3DFD5; border-left: 4px solid ${GOLD}; border-radius: 10px; padding: 12px 16px; }
.val .lbl { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #5C6675; }
.val .num { font-family: Georgia, serif; font-size: 28px; color: ${NAVY}; }
.val .conf { font-size: 12px; color: ${GREEN}; }
.tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.tier { border-radius: 10px; padding: 10px 12px; color: #fff; }
.tier .t { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; opacity: .9; }
.tier .n { font-family: Georgia, serif; font-size: 20px; }
.tier.light { background: ${T_LIGHT}; } .tier.med { background: ${T_MED}; } .tier.high { background: ${T_HIGH}; }
.report-card .foot { margin-top: 14px; font-size: 12px; color: #8A93A1; }

section { padding: 66px 0; }
section.alt { background: #fff; border-top: 1px solid #E3DFD5; border-bottom: 1px solid #E3DFD5; }
.sec-kicker { color: ${GREEN}; font-size: 12px; letter-spacing: .18em; text-transform: uppercase; font-weight: 700; }
section h2 { font-size: 32px; color: ${NAVY}; margin: 10px 0 12px; }
section p.lead { color: #5C6675; max-width: 700px; margin: 0 0 34px; }

.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.feat { background: #fff; border: 1px solid #E3DFD5; border-radius: 12px; padding: 22px 24px; }
section.alt .feat { background: #F7F5F0; }
.feat .step { display: inline-block; width: 30px; height: 30px; border-radius: 50%; background: ${NAVY};
  color: ${GOLD}; text-align: center; line-height: 30px; font-weight: 700; margin-bottom: 12px; font-family: Georgia, serif; }
.feat h3 { margin: 0 0 8px; font-size: 19px; color: ${NAVY}; }
.feat p { margin: 0; font-size: 14.5px; color: #5C6675; }

.pricing { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
.plan { background: #fff; border: 1px solid #E3DFD5; border-radius: 14px; padding: 26px; display: flex; flex-direction: column; }
.plan.featured { border: 2px solid ${GOLD}; box-shadow: 0 14px 40px rgba(13,27,42,.10); }
.plan .name { font-family: Georgia, serif; font-size: 22px; color: ${NAVY}; }
.plan .for { color: #5C6675; font-size: 13.5px; margin: 4px 0 16px; }
.plan ul { padding-left: 18px; margin: 0 0 22px; color: #3A4453; font-size: 14.5px; flex: 1; }
.plan li { margin-bottom: 8px; }
.plan .model { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: ${GOLD}; font-weight: 700; margin-bottom: 14px; }
.badge { display: inline-block; background: ${GOLD}; color: ${NAVY}; font-size: 11px; font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase; border-radius: 20px; padding: 3px 12px; margin-bottom: 10px; }

.api-band { background: ${NAVY}; color: #EDE8DC; }
.api-band h2 { color: #fff; }
.api-band p.lead { color: #B9C2CE; }
.api-band code { background: ${NAVY_INK}; border: 1px solid #2A3B50; border-radius: 8px; display: block;
  padding: 16px 18px; font: 13px/1.7 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #D7E3F0;
  overflow-x: auto; margin-bottom: 26px; }
.api-band .g { color: #7FD1A8; }

footer { background: ${NAVY_INK}; color: #8794A3; padding: 34px 0; font-size: 13px; }
footer a { color: #B9C2CE; }
.disclaimer { border-top: 1px solid #2A3B50; margin-top: 18px; padding-top: 18px; }

@media (max-width: 860px) {
  .hero .wrap { grid-template-columns: 1fr; }
  .grid3, .pricing { grid-template-columns: 1fr; }
  .hero h1 { font-size: 34px; }
  .topnav { display: none; }
}
`;

interface MarketingPageDef {
  path: string;
  title: string;
  description: string;
  nav: string | null;
  content: string;
}

function navBar(active: string | null): string {
  const link = (href: string, label: string) =>
    `<a href="${href}"${active === href ? ' style="color:#fff;border-bottom:2px solid ' + GOLD + ';padding-bottom:2px"' : ''}>${label}</a>`;
  return `<div class="topbar"><div class="wrap">
  <a class="wordmark" href="/"><span class="logo-chip">${VMARK_SVG}</span>Value<b>Proof</b>.</a>
  <nav class="topnav">
    ${link('/how-it-works', 'How it works')}
    ${link('/material-intelligence', 'Material Intelligence')}
    ${link('/pricing', 'Pricing')}
    ${link('/api', 'API')}
  </nav>
  <a class="btn btn-line" href="/app/login">Sign in</a>
</div></div>`;
}

const FOOTER = `<footer><div class="wrap">
  <div>ValueProof · valueproof.net · <a href="/app/login">Sign in</a> · <a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a></div>
  <div class="disclaimer">Automated valuations are estimates, not licensed appraisals, and are provided
  for business-purpose, non-owner-occupied real-estate transactions only. Every value traces back to the
  comparable sales, data sources, and method used. ValueProof is a product of Flip Master Lending.</div>
</div></footer>`;

const HERO = `<div class="hero"><div class="wrap">
  <div>
    <div class="kicker">For investors &amp; private lenders</div>
    <h1>Know what it's worth now — and after the rehab.</h1>
    <p class="sub">ValueProof turns one address into an As-Is value plus three after-repair
    values — Light, Medium, and High rehab scopes — grounded in comparable sales,
    with confidence you can defend and a lender-ready PDF. Minutes, not days.</p>
    <div class="ctas">
      <a class="btn btn-gold" href="/app/login">Run your first report</a>
      <a class="btn btn-line" href="/api">License the API</a>
    </div>
    <p class="fine">Automated estimates, not licensed appraisals · Business-purpose, non-owner-occupied use only</p>
  </div>
  <div class="report-card">
    <div style="margin-bottom:10px">${wordmarkImg(30)}</div>
    <div class="addr">SAMPLE REPORT · 1420 Ashby St · 3bd/2ba · 1,800 sqft</div>
    <div class="vals">
      <div class="val"><div class="lbl">As-Is value</div><div class="num">$412,000</div><div class="conf">Confidence: High</div></div>
      <div class="val"><div class="lbl">ARV · medium scope</div><div class="num">$507,500</div><div class="conf">Renovated comp band</div></div>
    </div>
    <div class="tiers">
      <div class="tier light"><div class="t">Light</div><div class="n">$488,000</div></div>
      <div class="tier med"><div class="t">Medium</div><div class="n">$507,500</div></div>
      <div class="tier high"><div class="t">High</div><div class="n">$548,500</div></div>
    </div>
    <div class="foot">Every value traces to its comps, radius, and method — shown in the report.</div>
  </div>
</div></div>`;

const HOW = `<section id="how"><div class="wrap">
  <div class="sec-kicker">The 60-second story</div>
  <h2>One address in. A lender-ready report out.</h2>
  <p class="lead">Two decision-grade numbers — what the property is worth today, and what
  it will be worth renovated — priced across three real rehab scopes, so the same
  document supports a light flip or a high-end rebuild.</p>
  <div class="grid3">
    <div class="feat"><span class="step">1</span><h3>Request the valuation</h3>
      <p>Enter the address in the app or send one API call. The engine pulls comparable
      sales, area price-per-sqft, and market data, widening the comp radius only as needed.</p></div>
    <div class="feat"><span class="step">2</span><h3>The engine prices three scopes</h3>
      <p>Renovated comps are split into finish bands, so Light, Medium, and High are real
      market numbers — capped at what the neighborhood supports, never a guess.</p></div>
    <div class="feat"><span class="step">3</span><h3>Underwrite from the report</h3>
      <p>A branded PDF with As-Is, three ARVs, comps, deal math, rental value, and a
      plain-language method note — a number you can defend to a lender.</p></div>
  </div>
</div></section>`;

const MATERIAL = `<section class="alt" id="material"><div class="wrap">
  <div class="sec-kicker">Material Intelligence</div>
  <h2>The ARV for the exact materials you're buying.</h2>
  <p class="lead">Generic tiers are the starting point. Submit the real scope of work — build
  it line-by-line, paste an existing scope, or send the borrower a secure link — and the
  analyst reads the materials to a true finish level with written reasoning.</p>
  <div class="grid3">
    <div class="feat"><h3>Reads the materials</h3>
      <p>Counters, flooring, siding, windows, roof, baths, systems — each choice is scored
      against a market-tuned material-to-value matrix.</p></div>
    <div class="feat"><h3>Reasons like an analyst</h3>
      <p>Granite and hardwood alone don't make a luxury house. Standard-grade roof, windows,
      or systems cap the read — and the write-up explains exactly why.</p></div>
    <div class="feat"><h3>Borrower-safe links</h3>
      <p>Send the scope form to a borrower or contractor. They fill in materials;
      they never see your values.</p></div>
  </div>
</div></section>`;

const PRICING = `<section id="pricing"><div class="wrap">
  <div class="sec-kicker">Pricing</div>
  <h2>Pay per report, go Pro, or license the engine.</h2>
  <p class="lead">The same engine serves an occasional deal, an active desk, and an entire platform.</p>
  <div class="pricing">
    <div class="plan">
      <div class="name">Pay-as-you-go</div>
      <div class="for">For occasional deals</div>
      <ul>
        <li>Full report on any address</li>
        <li>As-Is + three ARV tiers</li>
        <li>Deal math &amp; rental value included</li>
        <li>Lender-ready PDF, delivered straight to your email</li>
      </ul>
      <div class="model">$349 per report</div>
      <a class="btn btn-green" href="/app/login">Run a report</a>
    </div>
    <div class="plan featured">
      <span class="badge">Most popular</span>
      <div class="name">Pro Member</div>
      <div class="for">For active investors &amp; lenders</div>
      <ul>
        <li>Three full reports included every month</li>
        <li>Live monitoring on saved properties — values re-check automatically and alert you on movement</li>
        <li>Material Intelligence scope analysis</li>
        <li>Priority turnaround</li>
      </ul>
      <div class="model">$595 / month · 3 reports included</div>
      <a class="btn btn-gold" href="/app/login">Get started</a>
    </div>
    <div class="plan">
      <div class="name">API Partner</div>
      <div class="for">For platforms &amp; lender systems</div>
      <ul>
        <li>Direct REST API / white-label — your brand, your price to your customers</li>
        <li>Valuations, scope analysis, watches, webhooks</li>
        <li>Rate limits you control</li>
        <li>Hosted white-label portal available — $150 / month</li>
      </ul>
      <div class="model">$149 wholesale per report · 5 / month minimum</div>
      <a class="btn btn-green" href="mailto:admin@trgtechlink.com?subject=ValueProof%20API%20licensing">Talk to us</a>
    </div>
  </div>
  <div class="sec-kicker" style="margin-top:38px">Add-ons</div>
  <h2 style="font-size:26px">Power features, priced a la carte.</h2>
  <div class="grid3">
    <div class="feat"><h3>Live monitoring — $19/mo per property</h3>
      <p>Park any address on watch: the value re-checks automatically and alerts you the moment it moves. Pro includes monitoring on saved properties; add more anytime.</p></div>
    <div class="feat"><h3>Rush lane — $99</h3>
      <p>Priority processing: your report jumps the queue with guaranteed turnaround under 15 minutes.</p></div>
    <div class="feat"><h3>Portfolio runs — from $99/address</h3>
      <p>Upload 20+ addresses at once and get the full report set back in one batch. Built for asset managers and REO desks.</p></div>
    <div class="feat"><h3>Material Intelligence — $79/analysis</h3>
      <p>True-scope ARV from the actual materials, a la carte for pay-as-you-go users. Included with Pro.</p></div>
    <div class="feat"><h3>Co-branded lender PDF — $250/mo</h3>
      <p>Your logo and disclaimers on every report your borrowers order. Your brand on the document they take to closing.</p></div>
    <div class="feat"><h3>90-day re-certification — $149</h3>
      <p>Re-run any past report with fresh comps and current market data — same property, updated number, full PDF.</p></div>
  </div>
</div></section>`;

const API_BAND = `<section class="api-band" id="api"><div class="wrap">
  <div class="kicker">Enterprise</div>
  <h2>The same engine, behind your product.</h2>
  <p class="lead">Everything in the app is a REST call: valuations, material analyses,
  borrower scope links, live watches, reports, and webhooks. API-key auth, metered usage,
  per-partner rate limits.</p>
  <code>POST /valuations            <span class="g"># As-Is + 3 ARV tiers + confidence</span>
POST /material-analyses     <span class="g"># true-scope ARV from a real scope of work</span>
POST /watches               <span class="g"># live re-valuation + change alerts</span>
GET  /reports/{id}          <span class="g"># branded PDF / web report</span>
webhooks: valuation.completed · watch.changed · report.ready</code>
  <a class="btn btn-gold" href="mailto:admin@trgtechlink.com?subject=ValueProof%20API%20licensing">Request API access</a>
</div></section>`;

/** Standalone page header for the section pages (non-home). */
function pageHero(kicker: string, title: string, sub: string): string {
  return `<div class="hero" style="padding:44px 0 30px"><div class="wrap" style="grid-template-columns:1fr">
  <div>
    <div class="kicker">${kicker}</div>
    <h1 style="font-size:38px">${title}</h1>
    <p class="sub">${sub}</p>
  </div>
</div></div>`;
}

function shell(def: { title: string; description: string; nav: string | null; content: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${def.title}</title>
${FAVICON_LINK}
<meta name="description" content="${def.description}">
<style>${CSS}</style>
</head>
<body>
${navBar(def.nav)}
${def.content}
${FOOTER}
</body>
</html>`;
}

/** Every public marketing page, keyed by path. Each section is its own page. */
export function marketingPages(): Record<string, string> {
  return {
    '/': shell({
      title: 'ValueProof — As-Is value + ARV in three rehab tiers, in minutes',
      description:
        'AI property valuations for real-estate investors and private lenders: As-Is value plus after-repair value across Light, Medium, and High rehab scopes, grounded in comps, with a lender-ready PDF. Business-purpose use only.',
      nav: null,
      content: HERO + HOW,
    }),
    '/how-it-works': shell({
      title: 'How it works — ValueProof',
      description:
        'How ValueProof turns one address into an As-Is value and three after-repair values grounded in comparable sales, in about a minute.',
      nav: '/how-it-works',
      content:
        pageHero(
          'How it works',
          'One address in. A lender-ready report out.',
          'What happens between typing an address and holding a defensible number.',
        ) + HOW + API_BAND,
    }),
    '/material-intelligence': shell({
      title: 'Material Intelligence — ValueProof',
      description:
        'Submit the real scope of work and get the ARV for the exact materials being installed, with analyst-grade written reasoning.',
      nav: '/material-intelligence',
      content:
        pageHero(
          'Material Intelligence',
          "The ARV for the exact materials you're buying.",
          'Beyond generic tiers: a true finish-level read from the actual scope of work.',
        ) + MATERIAL + PRICING,
    }),
    '/pricing': shell({
      title: 'Pricing — ValueProof',
      description:
        'Pay per report, go Pro for discounted usage and live monitoring, or license the engine as an API partner.',
      nav: '/pricing',
      content:
        pageHero(
          'Pricing',
          'Pay per report, go Pro, or license the engine.',
          'The same engine serves an occasional deal, an active desk, and an entire platform.',
        ) + PRICING + API_BAND,
    }),
    '/api': shell({
      title: 'API licensing — ValueProof',
      description:
        'License the ValueProof valuation engine: REST API for valuations, material analyses, watches, reports, and webhooks. White-label ready.',
      nav: '/api',
      content:
        pageHero(
          'Enterprise API',
          'The same engine, behind your product.',
          'Everything in the app is a REST call — put decision-grade valuations inside your platform.',
        ) + API_BAND + HOW,
    }),
  };
}

/** The home page (kept for compatibility with existing wiring). */
export function marketingPage(): string {
  return marketingPages()['/'];
}
