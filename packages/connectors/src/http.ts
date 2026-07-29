/**
 * ValueProof — Connectors
 * A tiny injectable HTTP client. Real adapters depend on this interface, never
 * on global fetch directly, so they are unit-testable with a canned response
 * and the transport is itself swappable.
 */

export interface HttpJson {
  status: number;
  ok: boolean;
  body: unknown;
}

export interface HttpGetOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  /** Abort after this many ms. */
  timeoutMs?: number;
}

export type HttpGet = (url: string, opts?: HttpGetOptions) => Promise<HttpJson>;

export class ConnectorError extends Error {
  readonly provider: string;
  readonly connectorCause?: unknown;
  constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = 'ConnectorError';
    this.provider = provider;
    this.connectorCause = cause;
  }
}

function buildUrl(base: string, query?: HttpGetOptions['query']): string {
  if (!query) return base;
  const params: string[] = [];
  for (const [k, val] of Object.entries(query)) {
    if (val === undefined) continue;
    params.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`);
  }
  if (params.length === 0) return base;
  return base + (base.includes('?') ? '&' : '?') + params.join('&');
}

/** Default HttpGet backed by global fetch (Node ≥ 18). */
export const fetchHttpGet: HttpGet = async (url, opts) => {
  const controller = new AbortController();
  const timeout = opts?.timeoutMs ?? 15_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(buildUrl(url, opts?.query), {
      method: 'GET',
      headers: opts?.headers,
      signal: controller.signal,
    });
    let body: unknown = null;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
};
