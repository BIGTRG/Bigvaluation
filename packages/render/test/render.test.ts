import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenderService, toReportRenders } from '../src/service.ts';
import { HttpRenderProvider, MockRenderProvider } from '../src/providers.ts';

const photos = [
  { room: 'kitchen', url: 'https://cdn.example.com/k.jpg' },
  { room: 'living_room', url: 'https://cdn.example.com/l.jpg' },
];

test('renders both layers per room: renovate on the original, stage on the renovated', async () => {
  const provider = new MockRenderProvider();
  const svc = new RenderService({ provider });
  const out = await svc.renderAll({ photos, tier: 'medium' });
  assert.equal(out.length, 2);
  assert.equal(out[0].renovated, 'https://cdn.example.com/k--renovate-medium.png');
  assert.equal(out[0].staged, 'https://cdn.example.com/k--renovate-medium--stage-medium.png');
  // Staging input was the renovated image, not the original.
  const stageCall = provider.calls.find((c) => c.layer === 'stage' && c.room === 'kitchen');
  assert.equal(stageCall?.imageUrl, 'https://cdn.example.com/k--renovate-medium.png');
});

test('one failing room never blocks the others', async () => {
  const provider = new MockRenderProvider();
  provider.failRooms.add('kitchen');
  const svc = new RenderService({ provider, log: () => {} });
  const out = await svc.renderAll({ photos, tier: 'light' });
  assert.equal(out.length, 2);
  assert.equal(out[0].renovated, undefined); // kitchen failed, as-is only
  assert.ok(out[1].renovated); // living room fine
});

test('maxRooms caps provider spend', async () => {
  const provider = new MockRenderProvider();
  const svc = new RenderService({ provider });
  const out = await svc.renderAll({ photos, tier: 'high', maxRooms: 1 });
  assert.equal(out.length, 1);
});

test('toReportRenders picks the first successfully renovated room for the tier', async () => {
  const provider = new MockRenderProvider();
  provider.failRooms.add('kitchen');
  const svc = new RenderService({ provider, log: () => {} });
  const rooms = await svc.renderAll({ photos, tier: 'medium' });
  const r = toReportRenders(rooms, 'medium');
  assert.equal(r.medium?.asIs, 'https://cdn.example.com/l.jpg');
  assert.ok(r.medium?.renovated);
});

test('HttpRenderProvider maps request/response and auth header', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init! });
    return new Response(JSON.stringify({ output_url: 'https://out.example.com/x.png', id: 'r_1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const p = new HttpRenderProvider({ baseUrl: 'https://api.vendor.com', apiKey: 'k123', fetchImpl });
  const res = await p.render({ imageUrl: 'https://cdn.example.com/k.jpg', layer: 'renovate', room: 'kitchen', tier: 'high', materials: [{ label: 'quartz counters' }] });
  assert.equal(res.url, 'https://out.example.com/x.png');
  assert.equal(res.providerId, 'r_1');
  assert.equal(seen[0].url, 'https://api.vendor.com/v1/renders');
  const body = JSON.parse(String(seen[0].init.body));
  assert.equal(body.room_type, 'kitchen');
  assert.deepEqual(body.materials, ['quartz counters']);
  assert.match((seen[0].init.headers as Record<string, string>).authorization, /^Bearer k123$/);
});

test('HttpRenderProvider surfaces vendor errors', async () => {
  const fetchImpl = (async () => new Response('quota exceeded', { status: 429 })) as typeof fetch;
  const p = new HttpRenderProvider({ baseUrl: 'https://api.vendor.com', apiKey: 'k', fetchImpl });
  await assert.rejects(
    () => p.render({ imageUrl: 'https://x/y.jpg', layer: 'stage', tier: 'light' }),
    /429.*quota/s,
  );
});
