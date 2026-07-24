/**
 * {{BRAND_NAME}} — Connectors
 * The adapter contracts. The build brief's rule (§6): "Wrap every external
 * dependency behind a connector/adapter so any vendor can be swapped without
 * touching the app." These interfaces are that seam.
 *
 * The Property Data Hub (§7) normalizes provider output into the valuation
 * engine's `Subject` / `Comp` / `AvmEstimate` schema. Providers map THEIR
 * vendor shape into the normalized types below; the hub handles selection,
 * fallback, merge, and the source audit log.
 */

import type { Comp, AvmEstimate } from '../../valuation-engine/src/index.ts';

/** How a subject property is identified to a provider. */
export interface SubjectQuery {
  address: string;
  apn?: string;
  latitude?: number;
  longitude?: number;
  /** Comp search radius in miles (the hub still widens per its own rules). */
  radiusMiles?: number;
}

/** Cross-cutting call context. */
export interface ProviderContext {
  /** ISO "as of" date — drives comp recency and keeps runs reproducible. */
  asOf: string;
}

/**
 * Subject facts the DATA layer can know. Note: `conditionScore` is deliberately
 * absent — condition comes from the Vision engine (§4.1), a different stage.
 */
export interface SubjectFacts {
  address: string;
  apn?: string;
  sqft?: number;
  beds?: number;
  baths?: number;
  lotSqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  latitude?: number;
  longitude?: number;
}

/** Parcel / footprint info (§4.2 Smart Walkthrough; Regrid primary). */
export interface ParcelInfo {
  apn?: string;
  /** County-recorded gross living area, for the additions reconciliation. */
  recordedSqft?: number;
  lotSqft?: number;
  /** GeoJSON-ish footprint polygon, if available. */
  footprint?: unknown;
}

/** A permit record (§4.2; Shovels.ai). */
export interface Permit {
  type: string;
  status?: string;
  filedDate?: string;
  description?: string;
}

/** Property-data & comps provider (ATTOM, BatchData, CoreLogic, PropStream, MLS). */
export interface PropertyDataProvider {
  readonly name: string;
  fetchSubject(q: SubjectQuery, ctx: ProviderContext): Promise<SubjectFacts | null>;
  fetchComps(q: SubjectQuery, ctx: ProviderContext): Promise<Comp[]>;
}

/** AVM provider (HouseCanary primary, ATTOM AVM fallback). */
export interface AvmProvider {
  readonly name: string;
  fetchAvm(q: SubjectQuery, ctx: ProviderContext): Promise<AvmEstimate | null>;
}

/** Parcel / footprint provider (Regrid primary, ATTOM parcel). Optional. */
export interface ParcelProvider {
  readonly name: string;
  fetchParcel(q: SubjectQuery, ctx: ProviderContext): Promise<ParcelInfo | null>;
}

/** Permits provider (Shovels.ai, ATTOM/BatchData permits). Optional. */
export interface PermitsProvider {
  readonly name: string;
  fetchPermits(q: SubjectQuery, ctx: ProviderContext): Promise<Permit[]>;
}

/**
 * Classifies whether a comp sold in renovated condition. Public records rarely
 * state this; the signal comes from MLS remarks, permits, or the analyst AI.
 * The hub applies a classifier so bands are built from true renovated comps.
 */
export type CompClassifier = (comp: Comp, ctx: ClassifierContext) => boolean;

export interface ClassifierContext {
  /** Median $/sqft of the comp set, for relative-value heuristics. */
  medianPricePerSqft: number;
  asOf: string;
}

/** One line in the per-report data-source audit trail (§10 auditability). */
export interface SourceLogEntry {
  field: 'subject' | 'comps' | 'avm' | 'parcel' | 'permits';
  provider: string;
  status: 'ok' | 'empty' | 'error' | 'fallback';
  detail?: string;
}

/** Everything the data layer assembled for one subject. */
export interface AssembledData {
  subject: SubjectFacts;
  comps: Comp[];
  avm?: AvmEstimate;
  parcel?: ParcelInfo;
  permits?: Permit[];
  /** Provider provenance per field — feeds the report's data-sources note. */
  sources: SourceLogEntry[];
  /** Non-fatal issues: fallbacks used, thin comp sets, missing AVM, etc. */
  warnings: string[];
}
