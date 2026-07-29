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
import type { BillingService } from '../../billing/src/index.ts';
import { verifyStripeWebhook } from '../../billing/src/index.ts';
import { TERMS_HTML, PRIVACY_HTML } from './legal.ts';
import { Router } from './router.ts';
import { Authenticator, hasScope } from './auth.ts';
import type { Orchestrator, JobStore, WebhookDispatcher, Job } from '../../orchestration/src/index.ts';
import { buildScope, buildScopes, toRehabScopes, type ScopeSubject } from '../../scope-studio/src/index.ts';
import {
  analyzeMaterials,
  parseMaterialText,
  MATERIAL_MATRIX,
  type MaterialLine,
  type TierValues,
  type Reasoner,
} from '../../material-intelligence/src/index.ts';
import type { MaterialAnalysisStore, MaterialLinkStore, MaterialAnalysisRecord, MaterialLinkRecord } from './types.ts';

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
  /** Optional Stripe billing (§5). Absent = billing routes return 409. */
  billing?: { service: BillingService; webhookSecret: string };
  clock?: { now: () => number };
  idFactory?: () => string;
  /** Base URL for the tokenized mobile capture link (§4.1). */
  captureBaseUrl?: string;
  /** Material Intelligence (§4.3 add-on). Absent = routes return 409. */
  materials?: {
    analyses: MaterialAnalysisStore;
    links: MaterialLinkStore;
    /** Base URL for borrower send-a-link pages (webapp /app/sow/:token). */
    linkBaseUrl?: string;
    /** Optional LLM reasoner (Claude) — numbers stay deterministic. */
    reasoner?: Reasoner;
  };
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
    r.add({ id: 'valuations.list', method: 'GET', pattern: '/valuations', scope: 'valuations:read', handler: this.listValuations });
    r.add({ id: 'valuations.get', method: 'GET', pattern: '/valuations/:id', scope: 'valuations:read', handler: this.getValuation });
    r.add({ id: 'reports.get', method: 'GET', pattern: '/reports/:id', scope: 'reports:read', handler: this.getReport });
    r.add({ id: 'watches.create', method: 'POST', pattern: '/watches', scope: 'watches:write', handler: this.createWatch });
    r.add({ id: 'watches.list', method: 'GET', pattern: '/watches', scope: 'watches:read', handler: this.listWatches });
    r.add({ id: 'captureSessions.create', method: 'POST', pattern: '/capture-sessions', scope: 'capture:write', handler: this.createCaptureSession });
    r.add({ id: 'scopeOfWork.create', method: 'POST', pattern: '/scope-of-work', scope: 'scope:write', handler: this.createScope });
    // Material Intelligence (§4.3 add-on) — premium, billable analyst runs.
    r.add({ id: 'materials.matrix', method: 'GET', pattern: '/material-matrix', scope: 'scope:read', handler: this.getMaterialMatrix });
    r.add({ id: 'materials.analyze', method: 'POST', pattern: '/material-analyses', scope: 'scope:write', billable: true, handler: this.createMaterialAnalysis });
    r.add({ id: 'materials.list', method: 'GET', pattern: '/material-analyses', scope: 'scope:read', handler: this.listMaterialAnalyses });
    r.add({ id: 'materials.get', method: 'GET', pattern: '/material-analyses/:id', scope: 'scope:read', handler: this.getMaterialAnalysis });
    r.add({ id: 'materialLinks.create', method: 'POST', pattern: '/material-links', scope: 'scope:write', handler: this.createMaterialLink });
    r.add({ id: 'materialLinks.list', method: 'GET', pattern: '/material-links', scope: 'scope:read', handler: this.listMaterialLinks });
    // Borrower-facing send-a-link flow: the token is the only credential, and
    // the borrower never sees values — submission confirms only.
    r.add({ id: 'materialLinks.peek', method: 'GET', pattern: '/material-links/t/:token', public: true, handler: this.peekMaterialLink });
    r.add({ id: 'materialLinks.submit', method: 'POST', pattern: '/material-links/t/:token', public: true, handler: this.submitMaterialLink });
    r.add({ id: 'webhooks.create', method: 'POST', pattern: '/webhooks', scope: 'webhooks:write', handler: this.registerWebhook });
    r.add({ id: 'billing.checkout', method: 'POST', pattern: '/billing/checkout', scope: 'billing:write', handler: this.createCheckout });
    r.add({ id: 'billing.account', method: 'GET', pattern: '/billing/account', scope: 'billing:read', handler: this.getBillingAccount });
    r.add({ id: 'billing.webhook', method: 'POST', pattern: '/billing/webhook', public: true, handler: this.billingWebhook });
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

  private listValuations = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const limit = Math.min(200, Math.max(1, Math.trunc(Number(ctx.req.query.limit) || 50)));
    const jobs = await this.deps.jobStore.listByAccount(ctx.auth.accountId, limit);
    return json(200, { valuations: jobs.map(valuationSummary) });
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

  // --- Material Intelligence (§4.3 add-on) ----------------------------------

  private getMaterialMatrix = async (): Promise<ApiResponse> => {
    return json(200, {
      categories: MATERIAL_MATRIX.map((c) => ({
        id: c.id,
        label: c.label,
        capping: c.capping,
        examples: c.examples,
      })),
    });
  };

  private createMaterialAnalysis = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.materials) return json(409, { error: 'materials_unavailable' });
    const body = asObject(ctx.req.body);
    // A true-scope ARV is a valuation output — the investor-only lock applies.
    const attestation = requireAttestation(body, ctx.now);
    if (isAttestationError(attestation)) return json(422, attestation);

    const materials = extractMaterials(body);
    if (!materials.length) {
      return json(400, { error: 'invalid_request', detail: 'Provide materials[] ({category, material}) or text (one material per line)' });
    }

    const resolved = await this.resolveAnalysisAnchor(body, ctx);
    if ('error' in resolved) return json(resolved.status, { error: resolved.error, detail: resolved.detail });

    let analysis;
    try {
      analysis = analyzeMaterials(materials, resolved.subject, resolved.values, { reasoner: this.deps.materials.reasoner });
    } catch (err) {
      return json(400, { error: 'invalid_request', detail: err instanceof Error ? err.message : String(err) });
    }

    const record: MaterialAnalysisRecord = {
      id: ctx.newId('mia'),
      accountId: ctx.auth.accountId,
      valuationId: resolved.valuationId,
      subject: resolved.subject as Record<string, unknown>,
      materials,
      analysis: analysis as unknown as Record<string, unknown>,
      source: typeof body.source === 'string' ? body.source : 'builder',
      attestation: attestation as unknown as Record<string, unknown>,
      createdAt: ctx.now,
    };
    await this.deps.materials.analyses.save(record);
    return json(201, materialAnalysisSummary(record));
  };

  private listMaterialAnalyses = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.materials) return json(409, { error: 'materials_unavailable' });
    const records = await this.deps.materials.analyses.listByAccount(ctx.auth.accountId);
    return json(200, { analyses: records.map(materialAnalysisSummary) });
  };

  private getMaterialAnalysis = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.materials) return json(409, { error: 'materials_unavailable' });
    const record = await this.deps.materials.analyses.get(ctx.params.id);
    if (!record || record.accountId !== ctx.auth.accountId) return json(404, { error: 'not_found' });
    return json(200, materialAnalysisSummary(record));
  };

  private createMaterialLink = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.materials) return json(409, { error: 'materials_unavailable' });
    const body = asObject(ctx.req.body);
    // The link produces an analysis later, so the attestation is captured NOW
    // from the investor and reused at borrower submit time (audit trail).
    const attestation = requireAttestation(body, ctx.now);
    if (isAttestationError(attestation)) return json(422, attestation);

    const resolved = await this.resolveAnalysisAnchor(body, ctx);
    if ('error' in resolved) return json(resolved.status, { error: resolved.error, detail: resolved.detail });

    const id = ctx.newId('mlk');
    const token = `${ctx.newId('sowt')}${Math.random().toString(36).slice(2, 10)}`;
    const base = (this.deps.materials.linkBaseUrl ?? 'https://{{BRAND_DOMAIN}}').replace(/\/$/, '');
    const link: MaterialLinkRecord = {
      id,
      token,
      accountId: ctx.auth.accountId,
      valuationId: resolved.valuationId,
      subject: resolved.subject as Record<string, unknown>,
      url: `${base}/app/sow/${token}`,
      status: 'open',
      attestation: attestation as unknown as Record<string, unknown>,
      createdAt: ctx.now,
    };
    await this.deps.materials.links.save(link);
    return json(201, { id: link.id, url: link.url, status: link.status, valuationId: link.valuationId });
  };

  private listMaterialLinks = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.materials) return json(409, { error: 'materials_unavailable' });
    const links = await this.deps.materials.links.listByAccount(ctx.auth.accountId);
    return json(200, {
      links: links.map((l) => ({
        id: l.id, url: l.url, status: l.status, valuationId: l.valuationId,
        analysisId: l.analysisId, createdAt: l.createdAt, submittedAt: l.submittedAt,
        subject: l.subject ? { address: (l.subject as { address?: string }).address } : undefined,
      })),
    });
  };

  /** Borrower view: enough to render the form — never any values. */
  private peekMaterialLink = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.materials) return json(409, { error: 'materials_unavailable' });
    const link = await this.deps.materials.links.getByToken(ctx.params.token);
    if (!link) return json(404, { error: 'not_found' });
    return json(200, {
      status: link.status,
      address: (link.subject as { address?: string } | undefined)?.address,
      categories: MATERIAL_MATRIX.map((c) => ({ id: c.id, label: c.label, examples: c.examples })),
    });
  };

  /** Borrower submit: runs the analysis for the OWNER; confirms only. */
  private submitMaterialLink = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.materials) return json(409, { error: 'materials_unavailable' });
    const link = await this.deps.materials.links.getByToken(ctx.params.token);
    if (!link) return json(404, { error: 'not_found' });
    if (link.status !== 'open') return json(409, { error: 'link_closed', detail: `link status: ${link.status}` });

    const body = asObject(ctx.req.body);
    const materials = extractMaterials(body);
    if (!materials.length) {
      return json(400, { error: 'invalid_request', detail: 'Provide materials[] or text' });
    }

    const values = link.valuationId ? await this.tierValuesFromJob(link.valuationId) : undefined;
    let analysis;
    try {
      analysis = analyzeMaterials(materials, (link.subject ?? {}) as { sqft?: number }, values, { reasoner: this.deps.materials.reasoner });
    } catch (err) {
      return json(400, { error: 'invalid_request', detail: err instanceof Error ? err.message : String(err) });
    }

    const record: MaterialAnalysisRecord = {
      id: this.newId('mia'),
      accountId: link.accountId,
      valuationId: link.valuationId,
      subject: link.subject,
      materials,
      analysis: analysis as unknown as Record<string, unknown>,
      source: 'link',
      attestation: link.attestation,
      createdAt: ctx.now,
    };
    await this.deps.materials.analyses.save(record);
    await this.deps.materials.links.save({ ...link, status: 'submitted', analysisId: record.id, submittedAt: ctx.now });
    // The borrower gets a receipt, never the numbers.
    return json(201, { status: 'submitted' });
  };

  /** Resolve subject + tier ARVs from a valuationId (ownership-checked) or raw subject. */
  private async resolveAnalysisAnchor(
    body: Record<string, unknown>,
    ctx: HandlerCtx,
  ): Promise<
    | { valuationId?: string; subject: { sqft?: number; finishedSqft?: number; address?: string }; values?: TierValues }
    | { status: number; error: string; detail?: string }
  > {
    const valuationId = typeof body.valuationId === 'string' ? body.valuationId : undefined;
    let subject = (asObject(body.subject) ?? {}) as { sqft?: number; finishedSqft?: number; address?: string };
    let values: TierValues | undefined;
    if (valuationId) {
      const job = await this.deps.jobStore.get(valuationId);
      if (!job || !ownsJob(job, ctx.auth)) return { status: 404, error: 'not_found', detail: 'valuation not found' };
      values = await this.tierValuesFromJob(valuationId);
      if (!values) return { status: 409, error: 'not_ready', detail: 'valuation has no completed tier values' };
      const jobSubject = job.input.subject as { sqft?: number; finishedSqft?: number; address?: string } | undefined;
      subject = { ...jobSubject, ...subject };
    }
    return { valuationId, subject, values };
  }

  private async tierValuesFromJob(valuationId: string): Promise<TierValues | undefined> {
    const job = await this.deps.jobStore.get(valuationId);
    const v = job?.context.valuation as { arv?: Record<string, number> } | undefined;
    const arv = v?.arv;
    if (!arv || typeof arv.light !== 'number' || typeof arv.medium !== 'number' || typeof arv.high !== 'number') return undefined;
    return { arv: { light: arv.light, medium: arv.medium, high: arv.high } };
  }

  private listWatches = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    const watches = await this.deps.watches.listByAccount(ctx.auth.accountId);
    return json(200, { watches });
  };

  // --- Billing (§5) ---------------------------------------------------------

  private createCheckout = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.billing) return json(409, { error: 'billing_unavailable', detail: 'Stripe is not configured on this deployment.' });
    const body = asObject(ctx.req.body);
    const product = body?.product;
    try {
      if (product === 'report') {
        const quantity = Math.max(1, Math.trunc(Number(body?.quantity) || 1));
        const session = await this.deps.billing.service.createReportCheckout(ctx.auth.accountId, quantity);
        return json(201, { checkoutUrl: session.url, sessionId: session.id });
      }
      if (product === 'pro') {
        const session = await this.deps.billing.service.createProCheckout(ctx.auth.accountId);
        return json(201, { checkoutUrl: session.url, sessionId: session.id });
      }
    } catch (err) {
      return json(502, { error: 'billing_error', detail: err instanceof Error ? err.message : String(err) });
    }
    return json(400, { error: 'invalid_request', detail: "product must be 'report' or 'pro' (partner plans are provisioned by contract)" });
  };

  private getBillingAccount = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.billing) return json(409, { error: 'billing_unavailable' });
    const account = await this.deps.billing.service.getAccount(ctx.auth.accountId);
    const usage = await this.deps.meter.total(ctx.auth.accountId);
    return json(200, { ...account, usageUnits: usage });
  };

  private billingWebhook = async (ctx: HandlerCtx): Promise<ApiResponse> => {
    if (!this.deps.billing) return json(409, { error: 'billing_unavailable' });
    const signature = ctx.req.headers['stripe-signature'];
    if (!signature || !ctx.req.rawBody) return json(400, { error: 'invalid_request', detail: 'missing signature or payload' });
    let event: Record<string, unknown>;
    try {
      event = verifyStripeWebhook(ctx.req.rawBody, signature, this.deps.billing.webhookSecret, { now: () => ctx.now });
    } catch (err) {
      return json(400, { error: 'invalid_signature', detail: err instanceof Error ? err.message : String(err) });
    }
    const outcome = await this.deps.billing.service.handleEvent(event);
    return json(200, { received: true, ...outcome });
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

/** Materials from `materials[]` or free `text` (uploads paste as text). */
function extractMaterials(body: Record<string, unknown>): MaterialLine[] {
  if (Array.isArray(body.materials)) {
    return body.materials
      .map((m) => asObject(m))
      .filter((m): m is Record<string, unknown> => !!m && typeof m.material === 'string' && !!(m.material as string).trim())
      .map((m) => ({
        category: typeof m.category === 'string' && m.category.trim() ? m.category.trim() : undefined,
        material: (m.material as string).trim(),
      }));
  }
  if (typeof body.text === 'string' && body.text.trim()) return parseMaterialText(body.text);
  return [];
}

function materialAnalysisSummary(r: MaterialAnalysisRecord) {
  return {
    id: r.id,
    valuationId: r.valuationId,
    subject: r.subject,
    materials: r.materials,
    source: r.source,
    createdAt: r.createdAt,
    ...r.analysis,
    links: { self: `/material-analyses/${r.id}`, valuation: r.valuationId ? `/valuations/${r.valuationId}` : undefined },
  };
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
    address: (job.input.subject as { address?: string } | undefined)?.address,
    asIs: v?.asIs,
    arv: v?.arv,
    confidence: v?.confidence ? { score: v.confidence.score, fsd: v.confidence.fsd } : undefined,
    reportId: typeof job.context.reportHtml === 'string' ? `FM-${job.id}` : undefined,
    reportUrl: job.context.reportUrl,
    error: job.error,
    links: { self: `/valuations/${job.id}`, report: `/reports/FM-${job.id}` },
  };
}
