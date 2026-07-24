import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Authenticator, hashSecret, extractKey, hasScope } from '../src/auth.ts';
import { InMemoryApiKeyStore } from '../src/stores.ts';
import type { AuthContext } from '../src/types.ts';

function store() {
  const s = new InMemoryApiKeyStore();
  s.addKey({ keyId: 'k1', secret: 'sekret', accountId: 'acct1', plan: 'pro', scopes: ['valuations:write'], active: true });
  s.addKey({ keyId: 'k2', secret: 'sekret2', accountId: 'acct2', plan: 'payg', scopes: ['*'], active: false });
  return s;
}

test('extractKey reads Bearer and x-api-key', () => {
  assert.equal(extractKey({ authorization: 'Bearer abc.def' }), 'abc.def');
  assert.equal(extractKey({ 'x-api-key': 'abc.def' }), 'abc.def');
  assert.equal(extractKey({}), null);
});

test('authenticates a valid active key', async () => {
  const a = new Authenticator(store());
  const ctx = await a.authenticate({ authorization: 'Bearer fmk_k1.sekret' });
  assert.ok(ctx);
  assert.equal(ctx!.accountId, 'acct1');
  assert.deepEqual(ctx!.scopes, ['valuations:write']);
});

test('rejects wrong secret, inactive key, and malformed key', async () => {
  const a = new Authenticator(store());
  assert.equal(await a.authenticate({ authorization: 'Bearer fmk_k1.WRONG' }), null);
  assert.equal(await a.authenticate({ authorization: 'Bearer fmk_k2.sekret2' }), null); // inactive
  assert.equal(await a.authenticate({ authorization: 'Bearer nodothere' }), null);
  assert.equal(await a.authenticate({}), null);
});

test('secret is stored hashed, not in plaintext', async () => {
  const s = store();
  const rec = await s.findByKeyId('k1');
  assert.ok(rec);
  assert.notEqual(rec!.secretHash, 'sekret');
  assert.equal(rec!.secretHash, hashSecret('sekret'));
});

test('hasScope honors wildcard and exact match', () => {
  const wild: AuthContext = { keyId: 'x', accountId: 'a', plan: 'partner', scopes: ['*'] };
  const narrow: AuthContext = { keyId: 'y', accountId: 'a', plan: 'pro', scopes: ['reports:read'] };
  assert.equal(hasScope(wild, 'valuations:write'), true);
  assert.equal(hasScope(narrow, 'reports:read'), true);
  assert.equal(hasScope(narrow, 'valuations:write'), false);
});
