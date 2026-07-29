/**
 * ValueProof — Valuation Engine
 * Orchestrator: assembles a full Valuation from normalized inputs (§7 "Value"
 * stage). Pure and synchronous — the connector layer (ATTOM/HouseCanary/MLS)
 * fetches and normalizes data; this module turns that data into the IP output.
 */

import type {
  Comp,
  Subject,
  AvmEstimate,
  DealInputs,
  RentalInputs,
  RehabScope,
  Tier,
  Valuation,
} from './types.ts';
import { TIERS } from './types.ts';
import type { MarketConfig, DeepPartial } from './config.ts';
import { resolveConfig } from './config.ts';
import { selectComps } from './comps.ts';
import { conditionFactor } from './condition.ts';
import { buildBands, ceilingPricePerSqft, renovatedMedianPricePerSqft } from './bands.ts';
import { computeAsIs, areaAsIsPricePerSqft } from './asIs.ts';
import { computeArv } from './arv.ts';
import { computeConfidence } from './confidence.ts';
import { rehabBudgets } from './rehab.ts';
import { dealMathAllTiers } from './dealMath.ts';
import { computeRental } from './rental.ts';
import { roundMoney } from './math.ts';

export interface ValuationRequest {
  subject: Subject;
  comps: Comp[];
  /** ISO "as of" date; drives recency weighting. Pass to keep runs reproducible. */
  asOf: string;
  avm?: AvmEstimate;
  deal?: DealInputs;
  rental?: RentalInputs;
  /** Optional per-tier scope overrides for rehab budgeting (§4.3). */
  rehabScopes?: Partial<Record<Tier, RehabScope>>;
  config?: DeepPartial<MarketConfig>;
}

/**
 * The one disclaimer that must ride along with every automated value (§10).
 * Uses "appraisal" only to disclaim (required by §10); never labels the output
 * an "appraised value" (§4.7).
 */
export const NOT_AN_APPRAISAL =
  'This is an automated valuation estimate, not a licensed appraisal.';

export function computeValuation(req: ValuationRequest): Valuation {
  const cfg = resolveConfig(req.config);
  const { subject } = req;
  const finishedSqft = subject.finishedSqft ?? subject.sqft;

  const selection = selectComps(subject.sqft, req.comps, cfg, { asOf: req.asOf });

  const cf = conditionFactor(subject.conditionScore, cfg);
  const asIsResult = computeAsIs(subject.sqft, selection.allComps, cf, cfg, req.avm);

  const bands = buildBands(selection.renovatedComps, cfg);
  const ceilingPps = ceilingPricePerSqft(selection.renovatedComps, cfg);
  const arvResult = computeArv(finishedSqft, bands, ceilingPps);

  const confidence = computeConfidence(
    selection.renovatedComps,
    selection.radiusMiles,
    req.asOf,
    cfg,
  );

  const rehab = rehabBudgets(finishedSqft, cfg, req.rehabScopes);
  const deal = dealMathAllTiers(arvResult.arv, rehab, req.deal ?? {}, cfg);
  const rental = req.rental ? computeRental(req.rental, cfg) : undefined;

  const asIsRounded = roundMoney(asIsResult.value);
  const arvRounded = {} as Record<Tier, number>;
  for (const tier of TIERS) arvRounded[tier] = roundMoney(arvResult.arv[tier]);

  return {
    subject,
    asIs: asIsRounded,
    arv: arvRounded,
    ceilingPricePerSqft: ceilingPps,
    bands,
    confidence,
    radiusMiles: selection.radiusMiles,
    areaPricePerSqft: {
      asIsMedian: areaAsIsPricePerSqft(selection.allComps),
      renovatedMedian: renovatedMedianPricePerSqft(selection.renovatedComps),
    },
    compSelection: selection,
    rehab,
    deal,
    rental,
    audit: {
      avmProvider: req.avm?.provider,
      avmValue: req.avm?.value,
      conditionScore: subject.conditionScore,
      conditionFactor: cf,
      compCountRenovated: selection.renovatedComps.length,
      compCountAll: selection.allComps.length,
      generatedNote: `${NOT_AN_APPRAISAL} ${confidence.note}`,
    },
  };
}
