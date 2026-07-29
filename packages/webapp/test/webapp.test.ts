import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApi } from '../../api/src/factory.ts';
import type { ApiRequest } from '../../api/src/index.ts';
import { WebApp } from '../src/app.ts';
import { createSessionCodec } from '../src/session.ts';

const SECRET = 'test-secret-at-least-16-chars';
const KEY = 'fmk_demo.secret123';

function makeApp() {
  let t = 1;
  let n = 0;
  const demo = createDemoApi({ clock: { now: () => t++ }, idFactory: () => `id_${++n}` });
  const app = new WebApp({ api: demo.api, sessionSecret: SECRET, secureCookies: false });
  return { app, demo };
}

function req(
  method: ApiRequest['method'],
  path: string,
  opts: { cookie?: string; form?: Record<string, string>; query?: Record<string, string> } = {},
): ApiRequest {
  const headers: Record<string, string> = {};
  let rawBody: string | undefined;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    rawBody = new URLSearchParams(opts.form).toString();
  }
  return { method, path, headers, query: opts.query ?? {}, rawBody };
}

function sessionCookie(): string {
  const codec = createSessionCodec(SECRET, { secure: false });
  const setCookie = codec.issue(KEY);
  return setCookie.split(';')[0];
}

const attestForm = { businessPurpose: 'true', nonOwnerOccupied: 'true' };

test('unauthenticated users are redirected to login', async () => {
  const { app } = makeApp();
  const res = await app.handle(req('GET', '/app'));
  assert.equal(res.status, 303);
  assert.equal(res.headers?.location, '/app/login');
});

test('login with a valid key sets a signed session cookie', async () => {
  const { app } = makeApp();
  const res = await app.handle(req('POST', '/app/login', { form: { apiKey: KEY } }));
  assert.equal(res.status, 303);
  assert.equal(res.headers?.location, '/app');
  assert.match(res.headers?.['set-cookie'] ?? '', /^fm_session=.+HttpOnly/s);
});

test('login with a bad key bounces back with an error', async () => {
  const { app } = makeApp();
  const res = await app.handle(req('POST', '/app/login', { form: { apiKey: 'fmk_demo.wrong' } }));
  assert.equal(res.headers?.location, '/app/login?m=bad_key');
});

test('tampered session cookies are rejected', async () => {
  const { app } = makeApp();
  const cookie = sessionCookie().replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
  const res = await app.handle(req('GET', '/app', { cookie }));
  assert.equal(res.status, 303);
  assert.equal(res.headers?.location, '/app/login');
});

test('dashboard renders valuations from the API', async () => {
  const { app, demo } = makeApp();
  const cookie = sessionCookie();
  await app.handle(req('POST', '/app/valuations/new', { cookie, form: { address: '123 Flip St, Phoenix, AZ', ...attestForm } }));
  const res = await app.handle(req('GET', '/app', { cookie }));
  assert.equal(res.status, 200);
  assert.match(res.body as string, /Valuations/);
  assert.match(res.body as string, /completed/);
  assert.match(res.body as string, /Report/);
  void demo;
});

test('order form without both attestation boxes never reaches the API', async () => {
  const { app } = makeApp();
  const cookie = sessionCookie();
  const res = await app.handle(
    req('POST', '/app/valuations/new', { cookie, form: { address: '123 Flip St', businessPurpose: 'true' } }),
  );
  assert.equal(res.headers?.location, '/app/valuations/new?m=attestation');
  const dash = await app.handle(req('GET', '/app', { cookie }));
  assert.doesNotMatch(dash.body as string, /badge completed/);
});

test('successful order redirects to the dashboard and the report is viewable', async () => {
  const { app } = makeApp();
  const cookie = sessionCookie();
  const create = await app.handle(
    req('POST', '/app/valuations/new', {
      cookie,
      form: { address: '123 Flip St, Phoenix, AZ', purchasePrice: '290000', monthlyRent: '2400', ...attestForm },
    }),
  );
  assert.equal(create.headers?.location, '/app?m=created');
  const dash = await app.handle(req('GET', '/app', { cookie }));
  const m = (dash.body as string).match(/\/app\/reports\/(FM-[A-Za-z0-9_-]+)/);
  assert.ok(m, 'dashboard links to the report');
  const report = await app.handle(req('GET', `/app/reports/${m![1]}`, { cookie }));
  assert.equal(report.status, 200);
  assert.match(report.body as string, /not a licensed appraisal/i);
  assert.match(report.body as string, /business-purpose/i);
});

test('watch creation flows through the attestation gate too', async () => {
  const { app } = makeApp();
  const cookie = sessionCookie();
  const blocked = await app.handle(req('POST', '/app/watches', { cookie, form: { address: '9 Elm St' } }));
  assert.equal(blocked.headers?.location, '/app/watches?m=attestation');
  const ok = await app.handle(req('POST', '/app/watches', { cookie, form: { address: '9 Elm St', ...attestForm } }));
  assert.equal(ok.headers?.location, '/app/watches?m=watch_created');
  const list = await app.handle(req('GET', '/app/watches', { cookie }));
  assert.match(list.body as string, /9 Elm St/);
});

test('billing page renders even when Stripe is not configured', async () => {
  const { app } = makeApp();
  const cookie = sessionCookie();
  const res = await app.handle(req('GET', '/app/billing', { cookie }));
  assert.equal(res.status, 200);
  assert.match(res.body as string, /not enabled on this deployment/);
});

test('logout clears the session', async () => {
  const { app } = makeApp();
  const res = await app.handle(req('POST', '/app/logout', { cookie: sessionCookie() }));
  assert.equal(res.status, 303);
  assert.match(res.headers?.['set-cookie'] ?? '', /Max-Age=0/);
});

test('every page carries the compliance footer', async () => {
  const { app } = makeApp();
  const cookie = sessionCookie();
  for (const path of ['/app', '/app/valuations/new', '/app/watches', '/app/billing']) {
    const res = await app.handle(req('GET', path, { cookie }));
    assert.match(res.body as string, /not licensed appraisals/i, path);
    assert.match(res.body as string, /Business-purpose, non-owner-occupied use only/, path);
  }
});

test('marketing page: retail front end sells reports, Pro, and the API with compliance language', async () => {
  const { marketingPage } = await import('../src/marketing.ts');
  const html = marketingPage();
  assert.match(html, /ValueProof/);
  assert.match(html, /Run your first report/);
  assert.match(html, /Pay-as-you-go/);
  assert.match(html, /Pro Member/);
  assert.match(html, /API Partner/);
  assert.match(html, /POST \/valuations/);
  assert.match(html, /not licensed appraisals/i);
  assert.match(html, /Business-purpose, non-owner-occupied use only/);
  assert.match(html, /href="\/app\/login"/);
});
