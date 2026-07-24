/**
 * {{BRAND_NAME}} — Licensing API (§9)
 * Node http adapter. Translates real requests into `ApiRequest`, calls
 * `Api.handle`, and serializes the `ApiResponse`. This is the ONLY file that
 * touches sockets — everything else is transport-agnostic and unit-testable.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { Api } from './app.ts';
import type { ApiRequest, Method } from './types.ts';

const MAX_BODY_BYTES = 1_000_000; // 1 MB cap — reject oversized payloads

export function createHttpServer(api: Api): Server {
  return createServer((req, res) => {
    handleNodeRequest(api, req, res).catch((err) => {
      writeJson(res, 500, { error: 'internal_error', detail: String(err) });
    });
  });
}

async function handleNodeRequest(api: Api, req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const raw = await readBody(req);
    if (raw === null) {
      writeJson(res, 413, { error: 'payload_too_large' });
      return;
    }
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        writeJson(res, 400, { error: 'invalid_json' });
        return;
      }
    }
  }

  const apiReq: ApiRequest = { method, path: url.pathname, headers, query, body };
  const response = await api.handle(apiReq);

  const ct = response.headers?.['content-type'] ?? 'application/json; charset=utf-8';
  const payload =
    typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? null);
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
