/**
 * {{BRAND_NAME}} — Web app sessions
 * The web app is a thin shell over the licensing API: the user signs in with
 * their API key, and every action the app takes goes through the same API
 * auth/scope/metering path. The key is carried in an HMAC-signed, HttpOnly
 * cookie so it never appears in page HTML or query strings.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'fm_session';

export interface SessionCodec {
  /** Build the Set-Cookie value that stores the API key. */
  issue(apiKey: string): string;
  /** Extract and verify the API key from a Cookie header. Null = no session. */
  read(cookieHeader: string | undefined): string | null;
  /** Set-Cookie value that clears the session. */
  clear(): string;
}

export function createSessionCodec(secret: string, opts: { secure?: boolean; maxAgeSeconds?: number } = {}): SessionCodec {
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET must be at least 16 characters');
  const maxAge = opts.maxAgeSeconds ?? 12 * 60 * 60;
  const secure = opts.secure ?? true;

  const sign = (value: string): string => createHmac('sha256', secret).update(value).digest('base64url');

  return {
    issue(apiKey: string): string {
      const payload = Buffer.from(apiKey, 'utf8').toString('base64url');
      const token = `${payload}.${sign(payload)}`;
      return `${COOKIE_NAME}=${token}; Path=/app; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
    },

    read(cookieHeader: string | undefined): string | null {
      if (!cookieHeader) return null;
      const match = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${COOKIE_NAME}=`));
      if (!match) return null;
      const token = match.slice(COOKIE_NAME.length + 1);
      const dot = token.lastIndexOf('.');
      if (dot <= 0) return null;
      const payload = token.slice(0, dot);
      const sig = token.slice(dot + 1);
      const expected = sign(payload);
      const a = Buffer.from(sig, 'utf8');
      const b = Buffer.from(expected, 'utf8');
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      try {
        return Buffer.from(payload, 'base64url').toString('utf8');
      } catch {
        return null;
      }
    },

    clear(): string {
      return `${COOKIE_NAME}=; Path=/app; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
    },
  };
}
