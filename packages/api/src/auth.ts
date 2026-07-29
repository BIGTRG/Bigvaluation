/**
 * ValueProof — Licensing API (§9)
 * API-key authentication. Keys look like `fmk_<keyId>.<secret>`; we store only
 * a hash of the secret, so a leaked database never exposes usable keys. The
 * client sends the full key in `Authorization: Bearer …` or `x-api-key`.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { ApiKeyStore, AuthContext } from './types.ts';

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Constant-time hex compare to avoid timing side-channels on the secret. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Extract the raw key string from request headers. */
export function extractKey(headers: Record<string, string>): string | null {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const auth = lower['authorization'];
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  const xkey = lower['x-api-key'];
  if (xkey) return xkey.trim();
  return null;
}

export class Authenticator {
  private readonly keys: ApiKeyStore;
  constructor(keys: ApiKeyStore) {
    this.keys = keys;
  }

  /** Returns an AuthContext for a valid active key, else null. */
  async authenticate(headers: Record<string, string>): Promise<AuthContext | null> {
    const raw = extractKey(headers);
    if (!raw) return null;
    // Format: fmk_<keyId>.<secret>  (prefix optional)
    const withoutPrefix = raw.startsWith('fmk_') ? raw.slice(4) : raw;
    const dot = withoutPrefix.indexOf('.');
    if (dot <= 0) return null;
    const keyId = withoutPrefix.slice(0, dot);
    const secret = withoutPrefix.slice(dot + 1);
    if (!keyId || !secret) return null;

    const record = await this.keys.findByKeyId(keyId);
    if (!record || !record.active) return null;
    if (!safeEqualHex(hashSecret(secret), record.secretHash)) return null;

    return {
      keyId: record.keyId,
      accountId: record.accountId,
      plan: record.plan,
      scopes: record.scopes,
    };
  }
}

/** True if the auth context satisfies the required scope (`*` grants all). */
export function hasScope(auth: AuthContext, scope: string): boolean {
  return auth.scopes.includes('*') || auth.scopes.includes(scope);
}
