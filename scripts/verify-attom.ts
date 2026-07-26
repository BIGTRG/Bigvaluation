/**
 * Live ATTOM API verification script.
 * Tests real API calls and validates field mapping against actual response shapes.
 *
 * Usage: ATTOM_API_KEY=<key> node scripts/verify-attom.ts
 */

const API_KEY = process.env.ATTOM_API_KEY;
if (!API_KEY) {
  console.error('Set ATTOM_API_KEY env var');
  process.exit(1);
}

const BASE = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';
const HEADERS: Record<string, string> = { apikey: API_KEY, Accept: 'application/json' };

const TEST_ADDRESS = '123 Main St, Charlotte, NC 28202';

interface TestResult {
  endpoint: string;
  status: number;
  ok: boolean;
  bodyKeys: string[];
  sampleFields: Record<string, unknown>;
  raw?: unknown;
}

async function testEndpoint(path: string, query: Record<string, string | number>): Promise<TestResult> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.set(k, String(v));
  }
  const url = `${BASE}${path}?${params.toString()}`;
  console.log(`\n→ GET ${url}`);

  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 500) };
  }

  return {
    endpoint: path,
    status: res.status,
    ok: res.ok,
    bodyKeys: typeof body === 'object' && body !== null ? Object.keys(body) : [],
    sampleFields: {},
    raw: body,
  };
}

async function main() {
  console.log('=== ATTOM Live API Verification ===\n');

  // 1. Property Detail
  console.log('\n--- 1. Property Detail (subject facts) ---');
  const detail = await testEndpoint('/property/detail', { address1: TEST_ADDRESS });
  console.log(`Status: ${detail.status}`);
  console.log(`Top-level keys: ${detail.bodyKeys.join(', ')}`);

  if (detail.ok && detail.raw) {
    const raw = detail.raw as any;
    const status = raw?.status;
    console.log(`API status: ${JSON.stringify(status)}`);

    // Check property array path
    const propArr = raw?.property;
    if (Array.isArray(propArr) && propArr.length > 0) {
      const prop = propArr[0];
      console.log('\nProperty object keys:', Object.keys(prop).join(', '));

      // Check each expected field path from attom.ts mapping
      const checks = [
        { path: 'building.size.universalsize', val: prop?.building?.size?.universalsize },
        { path: 'building.size.livingsize', val: prop?.building?.size?.livingsize },
        { path: 'building.size.bldgsize', val: prop?.building?.size?.bldgsize },
        { path: 'building.rooms.beds', val: prop?.building?.rooms?.beds },
        { path: 'building.rooms.bathstotal', val: prop?.building?.rooms?.bathstotal },
        { path: 'summary.yearbuilt', val: prop?.summary?.yearbuilt },
        { path: 'summary.proptype', val: prop?.summary?.proptype },
        { path: 'summary.propclass', val: prop?.summary?.propclass },
        { path: 'lot.lotsize2', val: prop?.lot?.lotsize2 },
        { path: 'lot.lotSize', val: prop?.lot?.lotSize },
        { path: 'location.latitude', val: prop?.location?.latitude },
        { path: 'location.longitude', val: prop?.location?.longitude },
        { path: 'identifier.apn', val: prop?.identifier?.apn },
        { path: 'identifier.attomId', val: prop?.identifier?.attomId },
      ];

      console.log('\nField mapping verification:');
      for (const c of checks) {
        const status = c.val !== undefined && c.val !== null ? '✅' : '❌ MISSING';
        console.log(`  ${status} ${c.path} = ${JSON.stringify(c.val)}`);
      }

      // Dump the actual structure for analysis
      console.log('\nFull property keys tree (depth 2):');
      for (const [k, v] of Object.entries(prop)) {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          console.log(`  ${k}: { ${Object.keys(v as any).join(', ')} }`);
        } else {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
    } else {
      console.log('⚠️ No property array in response');
      console.log('Response sample:', JSON.stringify(detail.raw).slice(0, 1000));
    }
  } else {
    console.log('Response:', JSON.stringify(detail.raw).slice(0, 1000));
  }

  // 2. Sales Snapshot (comps)
  console.log('\n\n--- 2. Sale Snapshot (comps) ---');
  const comps = await testEndpoint('/sale/snapshot', { address1: TEST_ADDRESS, radius: 2 });
  console.log(`Status: ${comps.status}`);
  console.log(`Top-level keys: ${comps.bodyKeys.join(', ')}`);

  if (comps.ok && comps.raw) {
    const raw = comps.raw as any;
    const propArr = raw?.property;
    if (Array.isArray(propArr) && propArr.length > 0) {
      console.log(`Comp count: ${propArr.length}`);
      const first = propArr[0];
      console.log('\nFirst comp keys:', Object.keys(first).join(', '));

      const checks = [
        { path: 'sale.amount.saleamt', val: first?.sale?.amount?.saleamt },
        { path: 'sale.amount.salerecdate', val: first?.sale?.amount?.salerecdate },
        { path: 'sale.salesearchdate', val: first?.sale?.salesearchdate },
        { path: 'building.size.universalsize', val: first?.building?.size?.universalsize },
        { path: 'building.size.livingsize', val: first?.building?.size?.livingsize },
        { path: 'address.oneLine', val: first?.address?.oneLine },
        { path: 'address.line1', val: first?.address?.line1 },
        { path: 'location.distance', val: first?.location?.distance },
        { path: 'identifier.attomId', val: first?.identifier?.attomId },
        { path: 'identifier.obPropId', val: first?.identifier?.obPropId },
      ];

      console.log('\nComp field mapping verification:');
      for (const c of checks) {
        const status = c.val !== undefined && c.val !== null ? '✅' : '❌ MISSING';
        console.log(`  ${status} ${c.path} = ${JSON.stringify(c.val)}`);
      }

      // Full first comp structure
      console.log('\nFirst comp keys tree (depth 2):');
      for (const [k, v] of Object.entries(first)) {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          console.log(`  ${k}: { ${Object.keys(v as any).join(', ')} }`);
        } else {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
    } else {
      console.log('⚠️ No property array in comps response');
      console.log('Response sample:', JSON.stringify(comps.raw).slice(0, 1000));
    }
  } else {
    console.log('Response:', JSON.stringify(comps.raw).slice(0, 1000));
  }

  console.log('\n\n=== Verification Complete ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
