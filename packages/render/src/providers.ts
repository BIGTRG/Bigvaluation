/**
 * {{BRAND_NAME}} — Render provider adapters (§4.4, §6 swappable connectors)
 *
 * HttpRenderProvider: a generic JSON-over-HTTP adapter that fits the common
 * shape of render/staging vendors (REimagineHome, SofaBrain, Roomstage): POST
 * an image URL + style/room hints, receive a rendered image URL. Vendor
 * specifics (endpoint paths, field names, auth header) are configuration, so
 * switching vendors is an env change, not a code change. If a vendor's API is
 * meaningfully different, add a sibling adapter here — the RenderProvider
 * interface is the only contract.
 *
 * MockRenderProvider: deterministic, offline — used in dev and tests.
 */

import type { RenderProvider, RenderRequest, RenderResult } from './types.ts';

const TIER_STYLE: Record<string, string> = {
  light: 'clean modern rental-grade finishes',
  medium: 'contemporary mid-range finishes',
  high: 'luxury designer finishes',
};

export interface HttpRenderProviderOptions {
  /** Vendor base URL, e.g. https://api.vendor.com */
  baseUrl: string;
  apiKey: string;
  /** Auth header name. Default 'authorization' (sent as `Bearer <key>`). */
  authHeader?: string;
  /** Path for renovation renders. Default '/v1/renders'. */
  renovatePath?: string;
  /** Path for staging renders. Default '/v1/stagings'. */
  stagePath?: string;
  /** Response JSON field holding the output image URL. Default 'output_url'. */
  outputField?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class HttpRenderProvider implements RenderProvider {
  readonly name: string;
  private readonly o: Required<Omit<HttpRenderProviderOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(opts: HttpRenderProviderOptions) {
    this.o = {
      baseUrl: opts.baseUrl.replace(/\/+$/, ''),
      apiKey: opts.apiKey,
      authHeader: opts.authHeader ?? 'authorization',
      renovatePath: opts.renovatePath ?? '/v1/renders',
      stagePath: opts.stagePath ?? '/v1/stagings',
      outputField: opts.outputField ?? 'output_url',
      timeoutMs: opts.timeoutMs ?? 60_000,
      fetchImpl: opts.fetchImpl ?? fetch,
    };
    this.name = new URL(this.o.baseUrl).hostname;
  }

  async render(req: RenderRequest): Promise<RenderResult> {
    const path = req.layer === 'renovate' ? this.o.renovatePath : this.o.stagePath;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    headers[this.o.authHeader] =
      this.o.authHeader.toLowerCase() === 'authorization' ? `Bearer ${this.o.apiKey}` : this.o.apiKey;

    const body: Record<string, unknown> = {
      image_url: req.imageUrl,
      room_type: req.room,
      style: TIER_STYLE[req.tier] ?? TIER_STYLE.medium,
    };
    if (req.layer === 'renovate' && req.materials?.length) {
      body.materials = req.materials.map((m) => m.label);
    }

    const res = await this.o.fetchImpl(`${this.o.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.o.timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${this.name} ${req.layer} failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const url = json[this.o.outputField];
    if (typeof url !== 'string' || !url) {
      throw new Error(`${this.name} ${req.layer}: response missing ${this.o.outputField}`);
    }
    return { url, providerId: typeof json.id === 'string' ? json.id : undefined };
  }
}

/** Deterministic offline provider for dev/tests. */
export class MockRenderProvider implements RenderProvider {
  readonly name = 'mock';
  calls: RenderRequest[] = [];
  /** Rooms that should fail, for error-path tests. */
  failRooms = new Set<string>();

  async render(req: RenderRequest): Promise<RenderResult> {
    this.calls.push(req);
    if (req.room && this.failRooms.has(req.room)) throw new Error('mock render failure');
    const stem = req.imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    return { url: `${stem}--${req.layer}-${req.tier}.png`, providerId: `mock_${this.calls.length}` };
  }
}
