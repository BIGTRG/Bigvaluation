/**
 * ValueProof — Server (composition root)
 * Parse a full API key (`fmk_<keyId>.<secret>`) into its parts for seeding.
 */

export interface ParsedKey {
  keyId: string;
  secret: string;
}

export function parseSeedKey(fullKey: string): ParsedKey | null {
  const raw = fullKey.trim();
  const withoutPrefix = raw.startsWith('fmk_') ? raw.slice(4) : raw;
  const dot = withoutPrefix.indexOf('.');
  if (dot <= 0) return null;
  const keyId = withoutPrefix.slice(0, dot);
  const secret = withoutPrefix.slice(dot + 1);
  if (!keyId || !secret) return null;
  return { keyId, secret };
}
