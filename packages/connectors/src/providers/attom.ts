/**
 * ValueProof — Connectors
 * ATTOM adapter (property data + comps). Build brief §6: "ATTOM (start)".
 *
 * ⚠️ FIELD PATHS ARE ILLUSTRATIVE. ATTOM's response schema must be verified
 * against the live API docs / a real sandbox response before production. The
 * mapping is intentionally defensive (optional chaining, fallbacks) and isolated
 * here so correcting a path never touches the hub or engine. Network is injected
 * via HttpGet, so this adapter is unit-tested with a canned payload.
 */

import type { Comp } from '../../../valuation-engine/src/index.ts';
import type {
  PropertyDataProvider,
  SubjectQuery,
  ProviderContext,
  SubjectFacts,
} from '../types.ts';
import type { HttpGet } from '../http.ts';
import { ConnectorError, fetchHttpGet } from '../http.ts';

export interface AttomConfig {
  apiKey: string;
  /** Override for testing / regional gateways. */
  baseUrl?: string;
  http?: HttpGet;
  /** Default comp search radius (miles) if the query doesn't set one. */
  defaultRadiusMiles?: number;
}

const DEFAULT_BASE = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';

export class AttomProvider implements PropertyDataProvider {
  readonly name = 'ATTOM';
  private readonly cfg: AttomConfig;
  private readonly http: HttpGet;
  private readonly base: string;

  constructor(cfg: AttomConfig) {
    if (!cfg.apiKey) throw new ConnectorError(this.name, 'apiKey is required');
    this.cfg = cfg;
    this.http = cfg.http ?? fetchHttpGet;
    this.base = cfg.baseUrl ?? DEFAULT_BASE;
  }

  private headers(): Record<string, string> {
    return { apikey: this.cfg.apiKey, Accept: 'application/json' };
  }

  async fetchSubject(q: SubjectQuery, _ctx: ProviderContext): Promise<SubjectFacts | null> {
    const res = await this.http(`${this.base}/property/detail`, {
      headers: this.headers(),
      query: { address1: q.address },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new ConnectorError(this.name, `property/detail HTTP ${res.status}`);
    const prop = firstProperty(res.body);
    if (!prop) return null;
    return mapSubject(prop, q);
  }

  async fetchComps(q: SubjectQuery, _ctx: ProviderContext): Promise<Comp[]> {
    const radius = q.radiusMiles ?? this.cfg.defaultRadiusMiles ?? 2;
    const res = await this.http(`${this.base}/sale/snapshot`, {
      headers: this.headers(),
      query: {
        address1: q.address,
        radius,
        latitude: q.latitude,
        longitude: q.longitude,
      },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new ConnectorError(this.name, `sale/snapshot HTTP ${res.status}`);
    return mapComps(res.body);
  }
}

// --- mapping helpers (the illustrative part) -------------------------------

interface AttomEnvelope {
  property?: unknown[];
}

function firstProperty(body: unknown): Record<string, any> | null {
  const env = body as AttomEnvelope;
  const arr = Array.isArray(env?.property) ? env.property : [];
  return (arr[0] as Record<string, any>) ?? null;
}

export function mapSubject(prop: Record<string, any>, q: SubjectQuery): SubjectFacts {
  const building = prop.building ?? {};
  const size = building.size ?? {};
  const rooms = building.rooms ?? {};
  const summary = prop.summary ?? {};
  const lot = prop.lot ?? {};
  const location = prop.location ?? {};
  const identifier = prop.identifier ?? {};
  return {
    address: q.address,
    apn: identifier.apn ?? q.apn,
    sqft: numOrUndef(size.universalsize ?? size.livingsize ?? size.bldgsize),
    beds: numOrUndef(rooms.beds),
    baths: numOrUndef(rooms.bathstotal),
    lotSqft: numOrUndef(lot.lotsize2 ?? lot.lotSize),
    yearBuilt: numOrUndef(summary.yearbuilt),
    propertyType: strOrUndef(summary.proptype ?? summary.propclass),
    latitude: numOrUndef(location.latitude),
    longitude: numOrUndef(location.longitude),
  };
}

export function mapComps(body: unknown): Comp[] {
  const env = body as AttomEnvelope;
  const arr = Array.isArray(env?.property) ? env.property : [];
  const out: Comp[] = [];
  for (const raw of arr) {
    const prop = raw as Record<string, any>;
    const sale = prop.sale ?? {};
    const amount = sale.amount ?? {};
    const building = prop.building ?? {};
    const size = building.size ?? {};
    const location = prop.location ?? {};
    const address = prop.address ?? {};
    const identifier = prop.identifier ?? {};

    const salePrice = numOrUndef(amount.saleamt);
    const sqft = numOrUndef(size.universalsize ?? size.livingsize);
    const saleDate = strOrUndef(amount.salerecdate ?? sale.salesearchdate);
    if (!salePrice || !sqft || !saleDate) continue; // need all three to be a usable comp

    out.push({
      id: strOrUndef(identifier.attomId ?? identifier.obPropId) ?? cryptoFreeId(address),
      address: strOrUndef(address.oneLine ?? address.line1) ?? 'Unknown',
      sqft,
      salePrice,
      saleDate,
      distanceMiles: numOrUndef(location.distance) ?? 0,
      // ATTOM public records don't flag renovation — leave false; the hub's
      // classifier (or an MLS provider) sets this. See classify.ts.
      renovated: false,
      sourceUrl: strOrUndef(prop.vintage?.url),
    });
  }
  return out;
}

function numOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function strOrUndef(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}
/** Deterministic id from address when the provider gives none (no RNG). */
function cryptoFreeId(address: Record<string, any>): string {
  const s = strOrUndef(address.oneLine ?? address.line1) ?? 'comp';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `attom-${(h >>> 0).toString(36)}`;
}
