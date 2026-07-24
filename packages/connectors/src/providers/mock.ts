/**
 * {{BRAND_NAME}} — Connectors
 * Mock provider. Deterministic, offline, no network — powers local dev, the
 * end-to-end example, and tests. Implements every provider interface so the
 * full data → valuation → report pipeline runs with nothing external.
 */

import type { Comp, AvmEstimate } from '../../../valuation-engine/src/index.ts';
import type {
  PropertyDataProvider,
  AvmProvider,
  ParcelProvider,
  PermitsProvider,
  SubjectQuery,
  ProviderContext,
  SubjectFacts,
  ParcelInfo,
  Permit,
} from '../types.ts';

export interface MockDataset {
  subject: SubjectFacts;
  comps: Comp[];
  avm?: AvmEstimate;
  parcel?: ParcelInfo;
  permits?: Permit[];
}

/** A representative Phoenix single-family scenario with renovated + as-is comps. */
export const SAMPLE_DATASET: MockDataset = {
  subject: {
    address: '123 Flip St, Phoenix, AZ 85021',
    apn: '123-45-678',
    sqft: 1800,
    beds: 3,
    baths: 2,
    lotSqft: 7200,
    yearBuilt: 1978,
    propertyType: 'Single-family',
    latitude: 33.55,
    longitude: -112.09,
  },
  comps: [
    comp('r1', '1420 Rehab Ave', 1750, 260, '2026-06-01', 0.4, true),
    comp('r2', '88 Updated Ln', 1850, 285, '2026-05-10', 0.8, true),
    comp('r3', '990 Renovated Rd', 1900, 300, '2026-04-15', 1.2, true),
    comp('r4', '77 Modern Ct', 1700, 275, '2026-03-20', 1.6, true),
    comp('r5', '215 Luxe Way', 2000, 330, '2026-02-01', 1.9, true),
    comp('r6', '640 Fixed Blvd', 1800, 315, '2026-05-25', 2.6, true),
    // As-is comps arrive with renovated=false; the hub classifier leaves them.
    comp('a1', '12 Dated Dr', 1780, 180, '2026-06-10', 0.6, false),
    comp('a2', '34 Original St', 1820, 175, '2026-04-05', 1.1, false),
    comp('a3', '56 Asis Pl', 1900, 190, '2026-03-01', 1.7, false),
  ],
  avm: { value: 360_000, provider: 'MockAVM', fsd: 0.08 },
  parcel: { apn: '123-45-678', recordedSqft: 1800, lotSqft: 7200 },
  permits: [{ type: 'Kitchen remodel', status: 'final', filedDate: '2019-04-10' }],
};

function comp(
  id: string,
  address: string,
  sqft: number,
  pricePerSqft: number,
  saleDate: string,
  distanceMiles: number,
  renovated: boolean,
): Comp {
  return {
    id,
    address,
    sqft,
    salePrice: Math.round(pricePerSqft * sqft),
    saleDate,
    distanceMiles,
    renovated,
    sourceUrl: `https://records.example.com/comp/${id}`,
  };
}

/** A provider backed by a fixed dataset. */
export class MockProvider
  implements PropertyDataProvider, AvmProvider, ParcelProvider, PermitsProvider
{
  readonly name = 'MockProvider';
  private readonly data: MockDataset;
  constructor(data: MockDataset = SAMPLE_DATASET) {
    this.data = data;
  }

  async fetchSubject(_q: SubjectQuery, _ctx: ProviderContext): Promise<SubjectFacts | null> {
    return this.data.subject;
  }
  async fetchComps(_q: SubjectQuery, _ctx: ProviderContext): Promise<Comp[]> {
    return this.data.comps.map((c) => ({ ...c }));
  }
  async fetchAvm(_q: SubjectQuery, _ctx: ProviderContext): Promise<AvmEstimate | null> {
    return this.data.avm ?? null;
  }
  async fetchParcel(_q: SubjectQuery, _ctx: ProviderContext): Promise<ParcelInfo | null> {
    return this.data.parcel ?? null;
  }
  async fetchPermits(_q: SubjectQuery, _ctx: ProviderContext): Promise<Permit[]> {
    return this.data.permits ?? [];
  }
}

/** A provider that always fails — for exercising the hub's fallback path. */
export class FailingProvider implements PropertyDataProvider {
  readonly name: string;
  constructor(name = 'FailingProvider') {
    this.name = name;
  }
  async fetchSubject(): Promise<SubjectFacts | null> {
    throw new Error('simulated outage');
  }
  async fetchComps(): Promise<Comp[]> {
    throw new Error('simulated outage');
  }
}
