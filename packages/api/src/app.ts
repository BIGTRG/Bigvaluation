/**
 * {{BRAND_NAME}} — Licensing API (§9)
 * The transport-agnostic application: routes → auth → scope → metering →
 * handler. `handle(ApiRequest)` returns an `ApiResponse` with no sockets
 * involved, so every endpoint is unit-testable directly.
 */

import type { ApiRequest, ApiResponse, AuthContext } from './types.ts';
import type {
  MeterStore,
  ApiKeyStore,
  WatchStore,
  CaptureSessionStore,
  ScopeStore,
  PdfRenderer,
} from './types.ts';
import { requireAttestation, isAttestationError } from './compliance.ts';
import { TERMS_HTML, PRIVACY_HTML } from './legal.ts';
import { Router } from './router.ts';
import { Authenticator, hasScope } from './auth.ts';
import type { Orchestrator, JobStore, WebhookDispatcher, Job } from '../../orchestration/src/index.ts';
import { buildScope, buildScopes, toRehabScopes, type ScopeSubject } from '../../scope-studio/src/index.ts';

export interface AppDeps {
  orchestrator: Orchestrator;
  jobStore: JobStore;
  apiKeys: ApiKeyStore;
  meter: MeterStore;
  watches: WatchStore;
  captures: CaptureSessionStore;
  scopes: ScopeStore;
  webhooks?: WebhookDispatcher;
  /** Optional PDF connector (§3 "branded PDF"); GET /reports/:id?format=pdf. */
  pdf?: PdfRenderer;
  clock?: { now: () => number };
  idFactory?: () => string;
  /** Base URL for the tokenized mobile capture link (§4.1). */
  captureBaseUrl?: string;
}

interface HandlerCtx {
  req: ApiRequest;
  params: Record<string, string>;
  auth: AuthContext;
  now: number;
  newId: (prefix: string) => string;
}

export class Api {
  private readonly router = new Router<HandlerCtx>();
  private readonly authn: Authenticator;
  private readonly now: () => number;
  private readonly deps: AppDeps;
  private counter = 0;

  constructor(deps: AppDeps) {
    this.deps = deps;
    this.authn = new Authenticator(deps.apiKeys);
    this.now = deps.clock?.now ?? (() => Date.now());
    this.registerRoutes();
  }

  private newId(prefix: string): string {
    if (this.deps.idFactory) return this.deps.idFactory();
    return `${prefix}_${(++this.counter).toString(36)}${this.now().toString(36)}`;
  }

  private registerRoutes(): void {
    const r = this.router;
    r.add({ id: 'health', method: 'GET', pattern: '/health', public: true, handler: this.health });
    r.add({ id: 'legal.terms', method: 'GET', pattern: '/legal/terms', public: true, handler: async () => html(TERMS_HTML) });
    r.add({ id: 'legal.privacy', method: 'GET', pattern: '/legal/privacy', public: true, handler: async () => html(PRIVACY_HTML) });
    r.add({ id: 'valuations.create', method: 'POST', pattern: '/valuations', scope: 'valuations:write', billable: true, handler: this.createValuation });
    r.add({ id: 'valuations.get', method: 'GET', pattern: '/valuations/:id', scope: 'valuations:read', handler: this.getValuation });
    r.add({ id: 'reports.get', method: 'GET', pattern: '/reports/:id', scope: 'reports:read', handler: this.getReport });
    r.add({ id: 'watches.create', method: 'POST', pattern: '/watches', scope: 'watches:write', handler: this.createWatch });
    r.add({ id: 'captureSessions.create', method: 'POST', pattern: '/capture-sessions', scope: 'capture:write', handler: this.createCaptureSession });
    r.add({ id: 'scopeOfWork.create', method: 'POST', pattern: '/scope-of-work', scope: 'scope:write', handler: this.createScope });
    r.add({ id: 'webhooks.create', method: 'POST', pattern: '/webhooks', scope: 'webhooks:write', handler: this.registerWebhook });
  }

  async handle(req: ApiRequest): Promise<ApiResponse> {
    const match = this.router.match(req.method, req.path);
    if (!match) {
      return this.router.pathExists(req.path)
        ? json(405, { error: 'method_not_allowed' })
        : json(404, { error: 'not_found' });
    }
    const { route, params } = match;

    let auth: AuthContext | null = null;
    if (!route.public) {
      auth = await this.authn.authenticate(req.headers);
      if (!auth) return json(401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      if (route.scope && !hasScope(auth, route.scope)) {
        return json(403, { error: 'forbidden', detail: `requires scope ${route.scope}` });
      }
    }

    const now = this.now();
    let res: ApiResponse;
    try {
      res = await route.handler({ req, params, auth: auth as AuthContext, now, newId: (p) => this.newId(p) });
    } catch (err) {
      return json(500, { error: 'internal_error', detail: err instanceof Error ? err.message : String(err) });
    }

    if (route.billable && auth && res.status >= 200 && res.status < 300) {
      await this.deps.meter.record({ accountId: auth.accountId, endpoint: route.id, at: now, units: 1 });
    }
    return res;
  }

  // --- handlers ------------------------------------------------------------

  private health = async (): Promise<ApiResponse> => json(200, { status: 'ok', service: '{{BRAND_NAME}} API' });

  private createValuation = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const body = asObject(ctx.req.body);
    const subject = asObject(body.subject);
    if (!subject || typeof subject.address !== 'string' || !subject.address.trim()) {
      return json(400, { error: 'invalid_request', detail: 'subject.address is required' });
    }
    // Investor-only scope lock (§4.7): business-purpose, non-owner-occupied,
    // attested per request and recorded on the job for the audit trail.
    const attestation = requireAttestation(body, ctx.now);
    if (isAttestationError(attestation)) return json(422, attestation);
    const job = await this.deps.orchestrator.createJob({
      attestation,
      subject,
      conditionScore: numberOrUndef(body.conditionScore),
      deal: asObject(body.deal),
      rental: asObject(body.rental),
      asOf: typeof body.asOf === 'string' ? body.asOf : undefined,
      report: asObject(body.report),
      // Ownership tag — checked on read. Not a stage input.
      accountId: ctx.auth.accountId,
    });
    const final = await this.deps.orchestrator.runJob(job.id);
    const status = final.status === 'failed' ? 422 : 201;
    return json(status, valuationSummary(final));
  };

  private getValuation = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const job = await this.deps.jobStore.get(ctx.params.id);
    if (!job || !ownsJob(job, ctx.auth)) return json(404, { error: 'not_found' });
    return json(200, valuationSummary(job));
  };

  private getReport = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const jobId = ctx.params.id.replace(/^FM-/, '');
    const job = await this.deps.jobStore.get(jobId);
    if (!job || !ownsJob(job, ctx.auth)) return json(404, { error: 'not_found' });
    const html = job.context.reportHtml;
    if (typeof html !== 'string') {
      return json(409, { error: 'not_ready', detail: `report status: ${job.status}` });
    }
    // Content negotiation: default HTML; JSON envelope or PDF when asked.
    if (ctx.req.query.format === 'json') {
      return json(200, { reportId: `FM-${jobId}`, reportUrl: job.context.reportUrl, html });
    }
    if (ctx.req.query.format === 'pdf') {
      if (!this.deps.pdf) {
        return json(409, { error: 'pdf_unavailable', detail: 'No PDF renderer is configured on this deployment.' });
      }
      const pdf = await this.deps.pdf.render(html, { filename: `FM-${jobId}.pdf` });
      return {
        status: 200,
        body: pdf,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `inline; filename="FM-${jobId}.pdf"`,
        },
      };
    }
    return { status: 200, body: html, headers: { 'content-type': 'text/html; charset=utf-8' } };
  };

  private createWatch = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const body = asObject(ctx.req.body);
    const subject = asObject(body.subject);
    if (!subject || typeof subject.address !== 'string') {
      return json(400, { error: 'invalid_request', detail: 'subject.address is required' });
    }
    // Watches trigger automatic re-valuations, so the investor-only lock
    // applies here too; the attestation is stored and reused on every re-check.
    const attestation = requireAttestation(body, ctx.now);
    if (isAttestationError(attestation)) return json(422, attestation);
    const watch = {
      id: ctx.newId('wch'),
      accountId: ctx.auth.accountId,
      subject,
      attestation: attestation as unknown as Record<string, unknown>,
      webhookUrl: typeof body.webhookUrl === 'string' ? body.webhookUrl : undefined,
      createdAt: ctx.now,
    };
    await this.deps.watches.save(watch);
    return json(201, watch);
  };

  private createCaptureSession = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const body = asObject(ctx.req.body);
    const subject = asObject(body.subject) ?? {};
    const id = ctx.newId('cap');
    const token = ctx.newId('tok');
    const base = this.deps.captureBaseUrl ?? 'https://capture.example.com';
    const session = {
      id,
      accountId: ctx.auth.accountId,
      subject,
      url: `${base}/s/${id}?t=${token}`,
      status: 'created' as const,
      createdAt: ctx.now,
    };
    await this.deps.captures.save(session);
    return json(201, { id: session.id, url: session.url, status: session.status });
  };

  private createScope = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const body = asObject(ctx.req.body);
    // A scope returns a true-scope ARV, so the same investor-only lock applies.
    const attestation = requireAttestation(body, ctx.now);
    if (isAttestationError(attestation)) return json(422, attestation);
    const rawItems = Array.isArray(body.lineItems) ? body.lineItems : null;

    // If no lineItems provided, generate a scope from subject + tier via the Studio
    if (!rawItems || rawItems.length === 0) {
      const subjectRaw = asObject(body.subject);
      if (!subjectRaw || (typeof subjectRaw.sqft !== 'number' && typeof subjectRaw.address !== 'string')) {
        return json(400, { error: 'invalid_request', detail: 'Provide lineItems[] or subject with sqft + conditionScore to auto-generate' });
      }
      const sqft = Number(subjectRaw.sqft) || 0;
      const conditionScore = Number(subjectRaw.conditionScore) || 3;
      const finishedSqft = typeof subjectRaw.finishedSqft === 'number' ? subjectRaw.finishedSqft : undefined;
      if (sqft <= 0) {
        return json(400, { error: 'invalid_request', detail: 'subject.sqft must be a positive number' });
      }
      const scopeSubject: ScopeSubject = { sqft, conditionScore, finishedSqft };
      const tier = typeof body.tier === 'string' && ['light', 'medium', 'high'].includes(body.tier)
        ? (body.tier as 'light' | 'medium' | 'high')
        : undefined;

      if (tier) {
        // Single tier
        const result = buildScope(scopeSubject, tier);
        const scope = {
          id: ctx.newId('sow'),
          accountId: ctx.auth.accountId,
          subject: subjectRaw,
          lineItems: result.lineItems,
          attestation: attestation as unknown as Record<string, unknown>,
          createdAt: ctx.now,
        };
        await this.deps.scopes.save(scope);
        return json(201, { id: scope.id, tier: result.tier, lineItems: result.lineItems, totalUsd: result.totalUsd, breakdown: result.breakdown });
      } else {
        // All three tiers
        const results = buildScopes(scopeSubject);
        const scope = {
          id: ctx.newId('sow'),
          accountId: ctx.auth.accountId,
          subject: subjectRaw,
          lineItems: results.medium.lineItems,
          attestation: attestation as unknown as Record<string, unknown>,
          createdAt: ctx.now,
        };
        await this.deps.scopes.save(scope);
        const tiers = Object.fromEntries(
          Object.entries(results).map(([t, r]) => [t, { lineItems: r.lineItems, totalUsd: r.totalUsd, breakdown: r.breakdown }]),
        );
        return json(201, { id: scope.id, tiers, rehabScopes: toRehabScopes(results) });
      }
    }

    // Original path: explicit lineItems provided
    const lineItems = rawItems
      .map((it) => asObject(it))
      .filter((it): it is Record<string, unknown> => !!it)
      .map((it) => ({
        label: String(it.label ?? 'item'),
        category: typeof it.category === 'string' ? it.category : undefined,
        costUsd: Number(it.costUsd) || 0,
      }));
    const scope = {
      id: ctx.newId('sow'),
      accountId: ctx.auth.accountId,
      subject: asObject(body.subject),
      lineItems,
      attestation: attestation as unknown as Record<string, unknown>,
      createdAt: ctx.now,
    };
    await this.deps.scopes.save(scope);
    const total = lineItems.reduce((s, li) => s + li.costUsd, 0);
    return json(201, { id: scope.id, lineItems, totalUsd: total });
  };

  private registerWebhook = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const body = asObject(ctx.req.body);
    const url = typeof body.url === 'string' ? body.url : '';
    if (!/^https?:\/\//i.test(url)) {
      return json(400, { error: 'invalid_request', detail: 'url must be http(s)' });
    }
    const events = Array.isArray(body.events) ? body.events.map(String) : undefined;
    const id = ctx.newId('whk');
    this.deps.webhooks?.add({ url, events: events as never, headers: { 'x-fm-account': ctx.auth.accountId } });
    return json(201, { id, url, events: events ?? 'all' });
  };
}

// --- helpers ---------------------------------------------------------------

function json(status: number, body: unknown, headers?: Record<string, string>): ApiResponse {
  return { status, body, headers };
}

function html(body: string): ApiResponse {
  return { status: 200, body, headers: { 'content-type': 'text/html; charset=utf-8' } };
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function numberOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function ownsJob(job: Job, auth: AuthContext): boolean {
  return job.input.accountId === auth.accountId;
}

function valuationSummary(job: Job) {
  const v = job.context.valuation as
    | { asIs: number; arv: unknown; confidence?: { score: number; fsd: number } }
    | undefined;
  return {
    id: job.id,
    status: job.status,
    asIs: v?.asIs,
    arv: v?.arv,
    confidence: v?.confidence ? { score: v.confidence.score, fsd: v.confidence.fsd } : undefined,
    reportId: typeof job.context.reportHtml === 'string' ? `FM-${job.id}` : undefined,
    reportUrl: job.context.reportUrl,
    error: job.error,
    links: { self: `/valuations/${job.id}`, report: `/reports/FM-${job.id}` },
  };
}
