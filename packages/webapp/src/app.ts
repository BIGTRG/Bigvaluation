/**
 * {{BRAND_NAME}} — Web app (customer dashboard)
 * A thin, server-rendered shell over the licensing API. Every data operation
 * goes through Api.handle() with the session's own API key, so auth, scopes,
 * attestation enforcement, and metering are identical to direct API use —
 * the web app can never bypass the compliance gate.
 */

import type { Api } from '../../api/src/index.ts';
import type { ApiRequest, ApiResponse } from '../../api/src/index.ts';
import { createSessionCodec } from './session.ts';
import type { SessionCodec } from './session.ts';
import { loginPage, dashboardPage, newValuationPage, watchesPage, billingPage, errorPage } from './pages.ts';
import type { ValuationRow, WatchRow } from './pages.ts';

export interface WebAppOptions {
  api: Api;
  sessionSecret: string;
  /** Set false behind plain http in dev so cookies still flow. */
  secureCookies?: boolean;
}

const FLASHES: Record<string, { kind: 'ok' | 'error'; text: string }> = {
  created: { kind: 'ok', text: 'Valuation completed — the report is ready below.' },
  watch_created: { kind: 'ok', text: 'Property is now being monitored.' },
  attestation: { kind: 'error', text: 'Both attestation boxes are required — this platform is business-purpose, non-owner-occupied only.' },
  failed: { kind: 'error', text: 'The valuation failed — check the address and try again.' },
  bad_key: { kind: 'error', text: 'That API key was rejected.' },
  signed_out: { kind: 'ok', text: 'Signed out.' },
};

export class WebApp {
  private readonly api: Api;
  private readonly sessions: SessionCodec;

  constructor(opts: WebAppOptions) {
    this.api = opts.api;
    this.sessions = createSessionCodec(opts.sessionSecret, { secure: opts.secureCookies ?? true });
  }

  /** True when this request belongs to the web app. */
  static owns(path: string): boolean {
    return path === '/app' || path.startsWith('/app/');
  }

  async handle(req: ApiRequest): Promise<ApiResponse> {
    const key = this.sessions.read(req.headers.cookie);
    const flash = FLASHES[req.query.m ?? ''];

    try {
      // --- unauthenticated routes ------------------------------------------
      if (req.path === '/app/login' && req.method === 'GET') return html(loginPage(flash));
      if (req.path === '/app/login' && req.method === 'POST') return this.login(req);
      if (req.path === '/app/logout' && req.method === 'POST') {
        return redirect('/app/login?m=signed_out', this.sessions.clear());
      }
      if (!key) return redirect('/app/login');

      // --- authenticated routes --------------------------------------------
      if (req.path === '/app' && req.method === 'GET') return this.dashboard(key, flash);
      if (req.path === '/app/valuations/new' && req.method === 'GET') return html(newValuationPage(flash));
      if (req.path === '/app/valuations/new' && req.method === 'POST') return this.createValuation(req, key);
      if (req.path === '/app/watches' && req.method === 'GET') return this.watches(key, flash);
      if (req.path === '/app/watches' && req.method === 'POST') return this.createWatch(req, key);
      if (req.path === '/app/billing' && req.method === 'GET') return this.billing(key, flash);
      if (req.path === '/app/billing/checkout' && req.method === 'POST') return this.checkout(req, key);
      const report = req.path.match(/^\/app\/reports\/([A-Za-z0-9_-]+)$/);
      if (report && req.method === 'GET') return this.report(report[1], key);

      return { status: 404, body: errorPage(404, 'Page not found.', true), headers: HTML };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 500, body: errorPage(500, msg, Boolean(key)), headers: HTML };
    }
  }

  // --- handlers --------------------------------------------------------------

  private async login(req: ApiRequest): Promise<ApiResponse> {
    const form = parseForm(req);
    const apiKey = form.get('apiKey')?.trim() ?? '';
    // Validate by making a real API call with the key.
    const probe = await this.callApi(apiKey, 'GET', '/valuations', undefined, { limit: '1' });
    if (probe.status !== 200) return redirect('/app/login?m=bad_key');
    return redirect('/app', this.sessions.issue(apiKey));
  }

  private async dashboard(key: string, flash?: (typeof FLASHES)[string]): Promise<ApiResponse> {
    const res = await this.callApi(key, 'GET', '/valuations');
    if (res.status === 401) return redirect('/app/login?m=bad_key', this.sessions.clear());
    const rows = ((res.body as { valuations?: ValuationRow[] }).valuations ?? []) as ValuationRow[];
    return html(dashboardPage(rows, flash));
  }

  private async createValuation(req: ApiRequest, key: string): Promise<ApiResponse> {
    const form = parseForm(req);
    if (form.get('businessPurpose') !== 'true' || form.get('nonOwnerOccupied') !== 'true') {
      return redirect('/app/valuations/new?m=attestation');
    }
    const body: Record<string, unknown> = {
      subject: {
        address: form.get('address') ?? '',
        radiusMiles: Number(form.get('radiusMiles')) || 2,
      },
      attestation: { businessPurpose: true, nonOwnerOccupied: true, attestedBy: 'webapp' },
    };
    const condition = Number(form.get('conditionScore'));
    if (condition >= 1 && condition <= 5) body.conditionScore = condition;
    const price = Number(form.get('purchasePrice'));
    if (price > 0) body.deal = { purchasePrice: price };
    const rent = Number(form.get('monthlyRent'));
    if (rent > 0) body.rental = { monthlyRent: rent };

    const res = await this.callApi(key, 'POST', '/valuations', body);
    if (res.status === 422) return redirect('/app/valuations/new?m=attestation');
    if (res.status >= 400) return redirect('/app/valuations/new?m=failed');
    return redirect('/app?m=created');
  }

  private async watches(key: string, flash?: (typeof FLASHES)[string]): Promise<ApiResponse> {
    const res = await this.callApi(key, 'GET', '/watches');
    if (res.status === 401) return redirect('/app/login?m=bad_key', this.sessions.clear());
    const rows = ((res.body as { watches?: WatchRow[] }).watches ?? []) as WatchRow[];
    return html(watchesPage(rows, flash));
  }

  private async createWatch(req: ApiRequest, key: string): Promise<ApiResponse> {
    const form = parseForm(req);
    if (form.get('businessPurpose') !== 'true' || form.get('nonOwnerOccupied') !== 'true') {
      return redirect('/app/watches?m=attestation');
    }
    const body: Record<string, unknown> = {
      subject: { address: form.get('address') ?? '' },
      attestation: { businessPurpose: true, nonOwnerOccupied: true, attestedBy: 'webapp' },
    };
    const webhookUrl = form.get('webhookUrl')?.trim();
    if (webhookUrl) body.webhookUrl = webhookUrl;
    const res = await this.callApi(key, 'POST', '/watches', body);
    if (res.status >= 400) return redirect('/app/watches?m=attestation');
    return redirect('/app/watches?m=watch_created');
  }

  private async billing(key: string, flash?: (typeof FLASHES)[string]): Promise<ApiResponse> {
    const res = await this.callApi(key, 'GET', '/billing/account');
    const enabled = res.status === 200;
    const body = res.body as { plan?: string; subscriptionStatus?: string; usageUnits?: number };
    return html(
      billingPage(
        {
          plan: enabled ? (body.plan ?? 'payg') : 'payg',
          subscriptionStatus: enabled ? body.subscriptionStatus : undefined,
          usageUnits: enabled ? (body.usageUnits ?? 0) : 0,
          billingEnabled: enabled,
        },
        flash,
      ),
    );
  }

  private async checkout(req: ApiRequest, key: string): Promise<ApiResponse> {
    const form = parseForm(req);
    const res = await this.callApi(key, 'POST', '/billing/checkout', { product: form.get('product') });
    const url = (res.body as { checkoutUrl?: string }).checkoutUrl;
    if (res.status === 201 && url) return redirect(url);
    return redirect('/app/billing');
  }

  private async report(reportId: string, key: string): Promise<ApiResponse> {
    const res = await this.callApi(key, 'GET', `/reports/${reportId}`);
    if (res.status !== 200) return { status: res.status, body: errorPage(res.status, 'Report not available.', true), headers: HTML };
    return { status: 200, body: res.body, headers: HTML };
  }

  /** All data access funnels through the licensing API with the user's key. */
  private callApi(
    key: string,
    method: ApiRequest['method'],
    path: string,
    body?: unknown,
    query: Record<string, string> = {},
  ): Promise<ApiResponse> {
    return this.api.handle({
      method,
      path,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      query,
      body,
    });
  }
}

// --- helpers -----------------------------------------------------------------

const HTML = { 'content-type': 'text/html; charset=utf-8' };

function html(body: string): ApiResponse {
  return { status: 200, body, headers: HTML };
}

function redirect(location: string, setCookie?: string): ApiResponse {
  const headers: Record<string, string> = { location };
  if (setCookie) headers['set-cookie'] = setCookie;
  return { status: 303, body: '', headers };
}

function parseForm(req: ApiRequest): URLSearchParams {
  const ct = req.headers['content-type'] ?? '';
  if (ct.includes('application/x-www-form-urlencoded') && typeof req.rawBody === 'string') {
    return new URLSearchParams(req.rawBody);
  }
  if (req.body && typeof req.body === 'object') {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) p.set(k, String(v));
    return p;
  }
  return new URLSearchParams();
}
