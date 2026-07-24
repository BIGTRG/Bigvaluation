/**
 * {{BRAND_NAME}} — Report Builder
 * Presentation helpers. Money is rounded for display only; the underlying
 * Valuation keeps full precision for the audit trail.
 */

export function usd(n: number | undefined, opts?: { round?: number }): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  const rounded = opts?.round ? Math.round(n / opts.round) * opts.round : Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + '$' + Math.abs(rounded).toLocaleString('en-US');
}

/** $/sqft with no cents. */
export function ppsf(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function pct(fraction: number | undefined, dp = 0): string {
  if (fraction === undefined || Number.isNaN(fraction)) return '—';
  return (fraction * 100).toFixed(dp) + '%';
}

export function num(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

/** Human date from an ISO string, e.g. "Jul 23, 2026". Locale-stable. */
export function humanDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * Escape untrusted text before interpolating into HTML. Comp addresses and any
 * provider-sourced strings pass through here — never trust upstream data.
 */
export function esc(s: unknown): string {
  const str = s === undefined || s === null ? '' : String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape and validate a URL for use in href. Only http(s) survive; anything
 * else (javascript:, data:, etc.) is dropped to null so it can't render a link.
 */
export function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return esc(trimmed);
  return null;
}
