/**
 * {{BRAND_NAME}} — Stripe client (§5, §6 "Billing: Stripe")
 * Minimal, dependency-free Stripe REST client: form-encoded requests with an
 * injectable fetch, plus webhook signature verification (Stripe-Signature
 * scheme: HMAC-SHA256 over `${t}.${payload}`). Only the endpoints the platform
 * uses — behind the connector boundary so the vendor could be swapped (§6).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StripeClientOptions {
  secretKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface CheckoutSessionParams {
  mode: 'payment' | 'subscription';
  priceId: string;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
  /** Our account id — round-trips through Stripe so webhooks can map back. */
  accountId: string;
  customerId?: string;
  customerEmail?: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export class StripeClient {
  private readonly key: string;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: StripeClientOptions) {
    this.key = opts.secretKey;
    this.base = (opts.baseUrl ?? 'https://api.stripe.com').replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async createCheckoutSession(p: CheckoutSessionParams): Promise<CheckoutSession> {
    const form: Record<string, string> = {
      mode: p.mode,
      'line_items[0][price]': p.priceId,
      'line_items[0][quantity]': String(p.quantity ?? 1),
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      'metadata[account_id]': p.accountId,
      client_reference_id: p.accountId,
    };
    if (p.mode === 'subscription') form['subscription_data[metadata][account_id]'] = p.accountId;
    if (p.customerId) form.customer = p.customerId;
    else if (p.customerEmail) form.customer_email = p.customerEmail;

    const json = await this.post('/v1/checkout/sessions', form);
    return { id: String(json.id), url: String(json.url) };
  }

  private async post(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.key}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
      throw new Error(`Stripe ${path} failed: ${err}`);
    }
    return json;
  }
}

/**
 * Verify a Stripe-Signature header against the raw request payload.
 * Returns the parsed event on success; throws on any mismatch.
 */
export function verifyStripeWebhook(
  rawPayload: string,
  signatureHeader: string,
  webhookSecret: string,
  opts: { toleranceSeconds?: number; now?: () => number } = {},
): Record<string, unknown> {
  const tolerance = opts.toleranceSeconds ?? 300;
  const nowSec = Math.floor((opts.now?.() ?? Date.now()) / 1000);

  const parts = new Map<string, string[]>();
  for (const kv of signatureHeader.split(',')) {
    const [k, v] = kv.split('=', 2);
    if (!k || v === undefined) continue;
    const list = parts.get(k.trim()) ?? [];
    list.push(v.trim());
    parts.set(k.trim(), list);
  }
  const t = parts.get('t')?.[0];
  const sigs = parts.get('v1') ?? [];
  if (!t || sigs.length === 0) throw new Error('webhook: malformed Stripe-Signature header');
  if (Math.abs(nowSec - Number(t)) > tolerance) throw new Error('webhook: timestamp outside tolerance');

  const expected = createHmac('sha256', webhookSecret).update(`${t}.${rawPayload}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const ok = sigs.some((s) => {
    const buf = Buffer.from(s, 'utf8');
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });
  if (!ok) throw new Error('webhook: signature mismatch');

  return JSON.parse(rawPayload) as Record<string, unknown>;
}

/** Build a valid Stripe-Signature header — used by tests and local tooling. */
export function signStripePayload(rawPayload: string, webhookSecret: string, atMs: number): string {
  const t = Math.floor(atMs / 1000);
  const v1 = createHmac('sha256', webhookSecret).update(`${t}.${rawPayload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}
