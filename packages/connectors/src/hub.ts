/**
 * ValueProof — Connectors
 * Property Data Hub (§7). Orchestrates providers into one normalized bundle:
 *   - tries providers in priority order, falling back on empty/error (§10)
 *   - merges + dedupes comps across providers
 *   - classifies renovated comps so the engine can build bands
 *   - logs provenance per field (audit trail, §10)
 *
 * Pure orchestration — the only I/O is delegated to the injected providers.
 */

import type {
  Comp,
  AvmEstimate,
  Subject,
  DealInputs,
  RentalInputs,
} from '../../valuation-engine/src/index.ts';
import type { ValuationRequest } from '../../valuation-engine/src/index.ts';
import type {
  PropertyDataProvider,
  AvmProvider,
  ParcelProvider,
  PermitsProvider,
  CompClassifier,
  SubjectQuery,
  ProviderContext,
  AssembledData,
  SubjectFacts,
  SourceLogEntry,
} from './types.ts';
import { defaultRenovatedClassifier } from './classify.ts';

export interface HubConfig {
  /** Property/comps providers in priority order. First non-empty wins for subject. */
  propertyProviders: PropertyDataProvider[];
  /** AVM providers in priority order. First non-null wins. */
  avmProviders?: AvmProvider[];
  parcelProvider?: ParcelProvider;
  permitsProvider?: PermitsProvider;
  /** Overrides the default renovated-comp heuristic. */
  compClassifier?: CompClassifier;
  /** Merge comps from ALL property providers (default) vs. only the first that answers. */
  mergeAllCompSources?: boolean;
}

export class PropertyDataHub {
  private readonly cfg: HubConfig;
  constructor(cfg: HubConfig) {
    if (!cfg.propertyProviders || cfg.propertyProviders.length === 0) {
      throw new Error('PropertyDataHub requires at least one property provider');
    }
    this.cfg = cfg;
  }

  async assemble(q: SubjectQuery, ctx: ProviderContext): Promise<AssembledData> {
    const sources: SourceLogEntry[] = [];
    const warnings: string[] = [];

    const subject = await this.resolveSubject(q, ctx, sources, warnings);
    const comps = await this.resolveComps(q, ctx, sources, warnings);
    const avm = await this.resolveAvm(q, ctx, sources, warnings);
    const parcel = await this.resolveParcel(q, ctx, sources, warnings);
    const permits = await this.resolvePermits(q, ctx, sources, warnings);

    // Reconcile recorded vs. observed sqft — additions signal (§4.2).
    if (parcel?.recordedSqft && subject.sqft && parcel.recordedSqft !== subject.sqft) {
      warnings.push(
        `Recorded sqft (${parcel.recordedSqft}) differs from subject sqft (${subject.sqft}) — possible addition; verify finished sqft.`,
      );
    }

    return { subject, comps, avm, parcel, permits, sources, warnings };
  }

  private async resolveSubject(
    q: SubjectQuery,
    ctx: ProviderContext,
    sources: SourceLogEntry[],
    warnings: string[],
  ): Promise<SubjectFacts> {
    for (let i = 0; i < this.cfg.propertyProviders.length; i++) {
      const p = this.cfg.propertyProviders[i];
      try {
        const facts = await p.fetchSubject(q, ctx);
        if (facts) {
          sources.push({ field: 'subject', provider: p.name, status: i === 0 ? 'ok' : 'fallback' });
          return facts;
        }
        sources.push({ field: 'subject', provider: p.name, status: 'empty' });
      } catch (err) {
        sources.push({ field: 'subject', provider: p.name, status: 'error', detail: errText(err) });
        warnings.push(`Subject provider ${p.name} failed; trying next.`);
      }
    }
    // Nothing resolved — fall back to the query address alone.
    warnings.push('No provider returned subject facts; using query address only.');
    return { address: q.address, apn: q.apn, latitude: q.latitude, longitude: q.longitude };
  }

  private async resolveComps(
    q: SubjectQuery,
    ctx: ProviderContext,
    sources: SourceLogEntry[],
    warnings: string[],
  ): Promise<Comp[]> {
    const merge = this.cfg.mergeAllCompSources ?? true;
    const collected: Comp[] = [];

    for (let i = 0; i < this.cfg.propertyProviders.length; i++) {
      const p = this.cfg.propertyProviders[i];
      try {
        const comps = await p.fetchComps(q, ctx);
        if (comps.length > 0) {
          sources.push({
            field: 'comps',
            provider: p.name,
            status: collected.length === 0 ? 'ok' : 'fallback',
            detail: `${comps.length} comps`,
          });
          collected.push(...comps);
          if (!merge) break;
        } else {
          sources.push({ field: 'comps', provider: p.name, status: 'empty' });
        }
      } catch (err) {
        sources.push({ field: 'comps', provider: p.name, status: 'error', detail: errText(err) });
        warnings.push(`Comp provider ${p.name} failed; trying next.`);
      }
    }

    const deduped = dedupeComps(collected);
    const classified = this.classify(deduped, ctx);
    if (classified.filter((c) => c.renovated).length === 0) {
      warnings.push('No comps classified as renovated — ARV bands will be thin. Check MLS/permit signal.');
    }
    return classified;
  }

  private classify(comps: Comp[], ctx: ProviderContext): Comp[] {
    const classifier = this.cfg.compClassifier ?? defaultRenovatedClassifier;
    const ppsf = comps.map((c) => (c.sqft > 0 ? c.salePrice / c.sqft : 0)).filter((x) => x > 0).sort((a, b) => a - b);
    const medianPps = ppsf.length ? ppsf[Math.floor(ppsf.length / 2)] : 0;
    return comps.map((c) => {
      // Respect an explicit provider flag; otherwise let the classifier decide.
      if (c.renovated) return c;
      const renovated = classifier(c, { medianPricePerSqft: medianPps, asOf: ctx.asOf });
      return renovated === c.renovated ? c : { ...c, renovated };
    });
  }

  private async resolveAvm(
    q: SubjectQuery,
    ctx: ProviderContext,
    sources: SourceLogEntry[],
    warnings: string[],
  ): Promise<AvmEstimate | undefined> {
    const providers = this.cfg.avmProviders ?? [];
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i];
      try {
        const avm = await p.fetchAvm(q, ctx);
        if (avm && avm.value > 0) {
          sources.push({ field: 'avm', provider: p.name, status: i === 0 ? 'ok' : 'fallback' });
          return avm;
        }
        sources.push({ field: 'avm', provider: p.name, status: 'empty' });
      } catch (err) {
        sources.push({ field: 'avm', provider: p.name, status: 'error', detail: errText(err) });
        warnings.push(`AVM provider ${p.name} failed; trying next.`);
      }
    }
    if (providers.length > 0) warnings.push('No AVM available — As-Is uses comps only.');
    return undefined;
  }

  private async resolveParcel(
    q: SubjectQuery,
    ctx: ProviderContext,
    sources: SourceLogEntry[],
    warnings: string[],
  ) {
    if (!this.cfg.parcelProvider) return undefined;
    const p = this.cfg.parcelProvider;
    try {
      const parcel = await p.fetchParcel(q, ctx);
      sources.push({ field: 'parcel', provider: p.name, status: parcel ? 'ok' : 'empty' });
      return parcel ?? undefined;
    } catch (err) {
      sources.push({ field: 'parcel', provider: p.name, status: 'error', detail: errText(err) });
      warnings.push(`Parcel provider ${p.name} failed.`);
      return undefined;
    }
  }

  private async resolvePermits(
    q: SubjectQuery,
    ctx: ProviderContext,
    sources: SourceLogEntry[],
    warnings: string[],
  ) {
    if (!this.cfg.permitsProvider) return undefined;
    const p = this.cfg.permitsProvider;
    try {
      const permits = await p.fetchPermits(q, ctx);
      sources.push({ field: 'permits', provider: p.name, status: permits.length ? 'ok' : 'empty' });
      return permits;
    } catch (err) {
      sources.push({ field: 'permits', provider: p.name, status: 'error', detail: errText(err) });
      warnings.push(`Permits provider ${p.name} failed.`);
      return undefined;
    }
  }
}

/**
 * Bridge assembled data into a valuation-engine request. `conditionScore` comes
 * from the Vision engine (§4.1); the data layer never supplies it.
 */
export function toValuationRequest(
  data: AssembledData,
  conditionScore: number,
  extras?: {
    finishedSqft?: number;
    deal?: DealInputs;
    rental?: RentalInputs;
    asOf: string;
  },
): ValuationRequest {
  const subject: Subject = {
    address: data.subject.address,
    apn: data.subject.apn,
    sqft: data.subject.sqft ?? 0,
    finishedSqft: extras?.finishedSqft ?? data.parcel?.recordedSqft ?? data.subject.sqft,
    beds: data.subject.beds,
    baths: data.subject.baths,
    lotSqft: data.subject.lotSqft,
    yearBuilt: data.subject.yearBuilt,
    conditionScore,
  };
  return {
    subject,
    comps: data.comps,
    asOf: extras?.asOf ?? new Date().toISOString().slice(0, 10),
    avm: data.avm,
    deal: extras?.deal,
    rental: extras?.rental,
  };
}

// ---------------------------------------------------------------------------

/** Dedupe comps by a stable key (id, else normalized address + sqft). */
export function dedupeComps(comps: Comp[]): Comp[] {
  const seen = new Map<string, Comp>();
  for (const c of comps) {
    const key = c.id
      ? `id:${c.id}`
      : `ad:${c.address.trim().toLowerCase().replace(/\s+/g, ' ')}|${c.sqft}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
