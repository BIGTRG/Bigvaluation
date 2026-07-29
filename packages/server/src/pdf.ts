/**
 * {{BRAND_NAME}} — PDF connector (§3 "branded PDF", §6 swappable connectors)
 * Gotenberg adapter: converts the self-contained report HTML into a PDF via a
 * self-hosted Gotenberg container (Chromium). Ships in docker-compose; set
 * GOTENBERG_URL to enable `GET /reports/:id?format=pdf`.
 *
 * Behind the PdfRenderer interface so the vendor can be swapped (§6) —
 * e.g. a wkhtmltopdf or Playwright adapter — without touching the API.
 */

import type { PdfRenderer } from '../../api/src/index.ts';

export interface GotenbergOptions {
  /** Base URL of the Gotenberg service, e.g. http://gotenberg:3000 */
  url: string;
  /** Request timeout in ms. Default 30s. */
  timeoutMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export class GotenbergPdfRenderer implements PdfRenderer {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GotenbergOptions) {
    this.base = opts.url.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async render(html: string): Promise<Uint8Array> {
    const form = new FormData();
    // Gotenberg's Chromium route requires the entry file to be index.html.
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    // US Letter, sensible report margins; the report CSS handles the rest.
    form.append('paperWidth', '8.5');
    form.append('paperHeight', '11');
    form.append('marginTop', '0.4');
    form.append('marginBottom', '0.4');
    form.append('marginLeft', '0.4');
    form.append('marginRight', '0.4');
    form.append('printBackground', 'true');

    const res = await this.fetchImpl(`${this.base}/forms/chromium/convert/html`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gotenberg render failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}
