/**
 * {{BRAND_NAME}} — Licensing API (§9)
 * Minimal path router. Compiles patterns like `/valuations/:id` into matchers
 * that extract params. No dependencies; the whole API is framework-free.
 */

import type { Method } from './types.ts';

export interface RouteMatch<Ctx> {
  route: Route<Ctx>;
  params: Record<string, string>;
}

export interface Route<Ctx> {
  /** Stable id used for metering, e.g. 'valuations.create'. */
  id: string;
  method: Method;
  pattern: string;
  handler: (ctx: Ctx) => Promise<import('./types.ts').ApiResponse>;
  /** No auth required (e.g. health check). */
  public?: boolean;
  /** Required scope, checked after auth. */
  scope?: string;
  /** Counts as a billable unit when it returns 2xx. */
  billable?: boolean;
}

interface CompiledRoute<Ctx> {
  route: Route<Ctx>;
  regex: RegExp;
  keys: string[];
}

export class Router<Ctx> {
  private readonly compiled: CompiledRoute<Ctx>[] = [];

  add(route: Route<Ctx>): void {
    const keys: string[] = [];
    const source = route.pattern
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          keys.push(seg.slice(1));
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.compiled.push({ route, regex: new RegExp(`^${source}/?$`), keys });
  }

  match(method: Method, path: string): RouteMatch<Ctx> | null {
    const clean = path.split('?')[0];
    for (const c of this.compiled) {
      if (c.route.method !== method) continue;
      const m = clean.match(c.regex);
      if (!m) continue;
      const params: Record<string, string> = {};
      c.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]);
      });
      return { route: c.route, params };
    }
    return null;
  }

  /** True if the path matches some route but with a different method (→ 405). */
  pathExists(path: string): boolean {
    const clean = path.split('?')[0];
    return this.compiled.some((c) => c.regex.test(clean));
  }
}
