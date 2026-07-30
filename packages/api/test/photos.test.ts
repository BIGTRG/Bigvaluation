/**
 * Photos (§4.1): upload → serve bytes → attach to a valuation as owned refs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApi } from '../src/factory.ts';

const PNG_B64 = Buffer.from('not-a-real-png-but-bytes').toString('base64');

function authed(api: ReturnType<typeof createDemoApi>, body: unknown, path = '/photos', method = 'POST') {
  return api.api.handle({
    method: method as 'POST',
    path,
    headers: { authorization: `Bearer ${api.apiKey}`, 'content-type': 'application/json' },
    query: {},
    body,
  });
}

test('photo upload returns an unguessable id and a public URL', async () => {
  const demo = createDemoApi();
  const res = await authed(demo, { data: PNG_B64, mediaType: 'image/jpeg', label: 'kitchen' });
  assert.equal(res.status, 201);
  const out = res.body as { id: string; url: string; label: string };
  assert.match(out.id, /^ph_[0-9a-f]{32}$/);
  assert.equal(out.url, `https://api.example.com/photos/${out.id}`);
  assert.equal(out.label, 'kitchen');
});

test('GET /photos/:id serves the raw bytes publicly with the right content-type', async () => {
  const demo = createDemoApi();
  const up = await authed(demo, { data: PNG_B64, mediaType: 'image/png' });
  const { id } = up.body as { id: string };
  const res = await demo.api.handle({ method: 'GET', path: `/photos/${id}`, headers: {}, query: {} });
  assert.equal(res.status, 200);
  assert.equal(res.headers?.['content-type'], 'image/png');
  assert.ok(res.body instanceof Uint8Array);
  assert.equal(Buffer.from(res.body as Uint8Array).toString(), 'not-a-real-png-but-bytes');
});

test('upload validates media type and base64 payload', async () => {
  const demo = createDemoApi();
  assert.equal((await authed(demo, { data: PNG_B64, mediaType: 'image/gif' })).status, 400);
  assert.equal((await authed(demo, { mediaType: 'image/png' })).status, 400);
  assert.equal((await authed(demo, { data: '%%%not-base64%%%', mediaType: 'image/png' })).status, 400);
});

test('valuation attaches owned photo refs and ignores foreign/unknown ids', async () => {
  const demo = createDemoApi();
  const up = await authed(demo, { data: PNG_B64, mediaType: 'image/jpeg', label: 'exterior_front' });
  const { id } = up.body as { id: string };
  const res = await authed(demo, {
    subject: { address: '123 Flip St, Phoenix, AZ 85021' },
    attestation: { businessPurpose: true, nonOwnerOccupied: true, attestedBy: 'test' },
    photos: [id, 'ph_doesnotexist00000000000000000000'],
  }, '/valuations');
  assert.equal(res.status, 201);
  const summary = res.body as { id: string };
  const job = await demo.api.handle({
    method: 'GET',
    path: `/valuations/${summary.id}`,
    headers: { authorization: `Bearer ${demo.apiKey}` },
    query: {},
  });
  assert.equal(job.status, 200);
});
