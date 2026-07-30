/**
 * ValueProof — Licensing API (§9)
 * Node http adapter. Translates real requests into `ApiRequest`, calls
 * `Api.handle`, and serializes the `ApiResponse`. This is the ONLY file that
 * touches sockets — everything else is transport-agnostic and unit-testable.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { Api } from './app.ts';
import type { ApiRequest, ApiResponse, Method } from './types.ts';

const MAX_BODY_BYTES = 16_000_000; // 16 MB cap — allows base64 photo uploads (§4.1)

/** Anything that turns an ApiRequest into an ApiResponse (e.g. the web app). */
export interface RequestHandler {
  handle(req: ApiRequest): Promise<ApiResponse>;
}

export interface HttpServerOptions {
  /** Optional sub-handlers by path prefix, checked before the API. */
  mounts?: { prefix: string; handler: RequestHandler }[];
  /** Where a browser landing on `/` is sent (e.g. the web app sign-in). */
  rootRedirect?: string;
  /** Static HTML served at the exact root path `/` (takes precedence over rootRedirect). */
  rootHtml?: string;
  /** Static public pages by exact path (marketing site). Checked before mounts/API. */
  publicPages?: Record<string, string>;
}

export function createHttpServer(api: Api, opts: HttpServerOptions = {}): Server {
  return createServer((req, res) => {
    handleNodeRequest(api, req, res, opts).catch((err) => {
      writeJson(res, 500, { error: 'internal_error', detail: String(err) });
    });
  });
}

async function handleNodeRequest(api: Api, req: IncomingMessage, res: ServerResponse, opts: HttpServerOptions = {}): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase() as Method;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v.join(', ');
  }

  let body: unknown;
  let rawBody: string | undefined;
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const raw = await readBody(req);
    if (raw === null) {
      writeJson(res, 413, { error: 'payload_too_large' });
      return;
    }
    if (raw.length > 0) {
      rawBody = raw;
      const ct = headers['content-type'] ?? '';
      if (ct.includes('application/json')) {
        try {
          body = JSON.parse(raw);
        } catch {
          writeJson(res, 400, { error: 'invalid_json' });
          return;
        }
      }
      // Non-JSON payloads (forms, webhooks) are handled from rawBody.
    }
  }

  const apiReq: ApiRequest = { method, path: url.pathname, headers, query, body, rawBody };
  const staticPage = method === 'GET' ? opts.publicPages?.[url.pathname] : undefined;
  if (staticPage) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(staticPage);
    return;
  }
  if (url.pathname === '/' && opts.rootHtml && method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(opts.rootHtml);
    return;
  }
  if (url.pathname === '/' && opts.rootRedirect) {
    res.writeHead(302, { location: opts.rootRedirect });
    res.end();
    return;
  }

  const mount = opts.mounts?.find(
    (m) => url.pathname === m.prefix || url.pathname.startsWith(`${m.prefix}/`),
  );
  const response = mount ? await mount.handler.handle(apiReq) : await api.handle(apiReq);

  const ct = response.headers?.['content-type'] ?? 'application/json; charset=utf-8';
  const payload =
    response.body instanceof Uint8Array
      ? response.body
      : typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body ?? null);
  res.writeHead(response.status, { ...response.headers, 'content-type': ct });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
