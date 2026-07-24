/**
 * {{BRAND_NAME}} — Connectors
 * HouseCanary adapter (AVM). Build brief §6: "HouseCanary (best fit)".
 *
 * ⚠️ FIELD PATHS ARE ILLUSTRATIVE — verify against HouseCanary's live API before
 * production. HouseCanary uses HTTP Basic auth (API key + secret). Network is
 * injected via HttpGet, so this is unit-tested with a canned payload.
 */

import type { AvmEstimate } from '../../../valuation-engine/src/index.ts';
import type { AvmProvider, SubjectQuery, ProviderContext } from '../types.ts';
import type { HttpGet } from '../http.ts';
import { ConnectorError, fetchHttpGet } from '../http.ts';

export interface HouseCanaryConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  http?: HttpGet;
}

const DEFAULT_BASE = 'https://api.housecanary.com/v2';

export class HouseCanaryProvider implements AvmProvider {
  readonly name = 'HouseCanary';
  private readonly cfg: HouseCanaryConfig;
  private readonly http: HttpGet;
  private readonly base: string;

  constructor(cfg: HouseCanaryConfig) {
    if (!cfg.apiKey || !cfg.apiSecret) {
      throw new ConnectorError(this.name, 'apiKey and apiSecret are required');
    }
    this.cfg = cfg;
    this.http = cfg.http ?? fetchHttpGet;
    this.base = cfg.baseUrl ?? DEFAULT_BASE;
  }

  private authHeader(): string {
    // HTTP Basic: base64("key:secret"). Buffer is available in Node.
    const token = Buffer.from(`${this.cfg.apiKey}:${this.cfg.apiSecret}`).toString('base64');
    return `Basic ${token}`;
  }

  async fetchAvm(q: SubjectQuery, _ctx: ProviderContext): Promise<AvmEstimate | null> {
    const res = await this.http(`${this.base}/property/value`, {
      headers: { Authorization: this.authHeader(), Accept: 'application/json' },
      query: { address: q.address },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new ConnectorError(this.name, `property/value HTTP ${res.status}`);
    return mapAvm(res.body, this.name);
  }
}

export function mapAvm(body: unknown, provider: string): AvmEstimate | null {
  // Illustrative shape: { property/value: { result: { value: { price, fsd } } } }
  const b = body as Record<string, any>;
  const node = b?.['property/value'] ?? b?.property_value ?? b;
  const value = node?.result?.value ?? node?.value ?? node;
  const price = num(value?.price ?? value?.value_estimate ?? value?.priceMean);
  if (price === undefined || price <= 0) return null;
  const fsd = num(value?.fsd ?? value?.fsd_percentage);
  return { value: price, provider, fsd };
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
