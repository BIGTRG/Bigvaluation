import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttomProvider } from '../src/providers/attom.ts';
import { HouseCanaryProvider, mapAvm } from '../src/providers/housecanary.ts';
import type { HttpGet, HttpJson } from '../src/http.ts';
import { ConnectorError } from '../src/http.ts';

const ctx = { asOf: '2026-07-23' };
const q = { address: '123 Flip St, Phoenix, AZ 85021', radiusMiles: 2 as const };

/** Build a stub HttpGet that returns a canned JSON body per URL substring. */
function stub(routes: Record<string, HttpJson>): HttpGet {
  return async (url) => {
    for (const [frag, res] of Object.entries(routes)) {
      if (url.includes(frag)) return res;
    }
    return { status: 404, ok: false, body: null };
  };
}

const ATTOM_DETAIL: HttpJson = {
  status: 200,
  ok: true,
  body: {
    property: [
      {
        identifier: { apn: '123-45-678', attomId: 999 },
        summary: { yearbuilt: 1978, proptype: 'SFR' },
        building: { size: { universalsize: 1800 }, rooms: { beds: 3, bathstotal: 2 } },
        lot: { lotsize2: 7200 },
        location: { latitude: 33.55, longitude: -112.09 },
      },
    ],
  },
};

const ATTOM_SNAPSHOT: HttpJson = {
  status: 200,
  ok: true,
  body: {
    property: [
      {
        identifier: { attomId: 1001 },
        address: { oneLine: '88 Updated Ln, Phoenix, AZ' },
        building: { size: { universalsize: 1850 } },
        location: { distance: 0.8 },
        sale: { amount: { saleamt: 527250, salerecdate: '2026-05-10' } },
      },
      {
        // Missing sale amount — must be skipped, not crash.
        identifier: { attomId: 1002 },
        address: { oneLine: '5 Nodata Rd' },
        building: { size: { universalsize: 1600 } },
        location: { distance: 1.1 },
        sale: { amount: {} },
      },
    ],
  },
};

test('ATTOM: maps subject detail', async () => {
  const attom = new AttomProvider({ apiKey: 'k', http: stub({ '/property/detail': ATTOM_DETAIL }) });
  const s = await attom.fetchSubject(q, ctx);
  assert.ok(s);
  assert.equal(s!.sqft, 1800);
  assert.equal(s!.beds, 3);
  assert.equal(s!.yearBuilt, 1978);
  assert.equal(s!.apn, '123-45-678');
});

test('ATTOM: maps comps and skips rows missing price/sqft/date', async () => {
  const attom = new AttomProvider({ apiKey: 'k', http: stub({ '/sale/snapshot': ATTOM_SNAPSHOT }) });
  const comps = await attom.fetchComps(q, ctx);
  assert.equal(comps.length, 1); // the incomplete row dropped
  const c = comps[0];
  assert.equal(c.sqft, 1850);
  assert.equal(c.salePrice, 527250);
  assert.equal(c.distanceMiles, 0.8);
  assert.equal(c.renovated, false); // ATTOM public data leaves this to the classifier
});

test('ATTOM: 404 subject → null, non-ok → ConnectorError', async () => {
  const notFound = new AttomProvider({ apiKey: 'k', http: stub({}) });
  assert.equal(await notFound.fetchSubject(q, ctx), null);

  const boom = new AttomProvider({
    apiKey: 'k',
    http: stub({ '/property/detail': { status: 500, ok: false, body: null } }),
  });
  await assert.rejects(() => boom.fetchSubject(q, ctx), ConnectorError);
});

test('ATTOM: constructor requires an API key', () => {
  assert.throws(() => new AttomProvider({ apiKey: '' }), ConnectorError);
});

test('HouseCanary: maps AVM value and fsd', async () => {
  const body = { 'property/value': { result: { value: { price: 361000, fsd: 0.07 } } } };
  const hc = new HouseCanaryProvider({
    apiKey: 'k',
    apiSecret: 's',
    http: stub({ '/property/value': { status: 200, ok: true, body } }),
  });
  const avm = await hc.fetchAvm(q, ctx);
  assert.ok(avm);
  assert.equal(avm!.value, 361000);
  assert.equal(avm!.provider, 'HouseCanary');
  assert.equal(avm!.fsd, 0.07);
});

test('HouseCanary: sends Basic auth and requires key+secret', async () => {
  assert.throws(() => new HouseCanaryProvider({ apiKey: 'k', apiSecret: '' }), ConnectorError);

  let sawAuth = '';
  const hc = new HouseCanaryProvider({
    apiKey: 'key',
    apiSecret: 'secret',
    http: async (_url, opts) => {
      sawAuth = opts?.headers?.Authorization ?? '';
      return { status: 200, ok: true, body: { value: { price: 100000 } } };
    },
  });
  await hc.fetchAvm(q, ctx);
  const expected = 'Basic ' + Buffer.from('key:secret').toString('base64');
  assert.equal(sawAuth, expected);
});

test('mapAvm returns null on missing/zero price', () => {
  assert.equal(mapAvm({ value: {} }, 'X'), null);
  assert.equal(mapAvm({ value: { price: 0 } }, 'X'), null);
  assert.deepEqual(mapAvm({ value: { price: 250000 } }, 'X'), { value: 250000, provider: 'X', fsd: undefined });
});
