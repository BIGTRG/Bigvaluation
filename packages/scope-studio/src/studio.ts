/**
 * {{BRAND_NAME}} — Scope-of-Work Studio (§4.3)
 *
 * `buildScope()` / `buildScopes()` turn property facts + a target tier into
 * itemized, priced line items. Finish work is tier-driven and scaled by a
 * condition **prep multiplier**; **system repairs** (roof/HVAC/electrical/
 * plumbing/windows/exterior) are **condition-triggered** and priced flat
 * across tiers; soft costs cover permits + contingency.
 *
 * `toRehabScopes()` reduces straight to the engine's
 * `ValuationRequest.rehabScopes` shape.
 */

import type { Tier, RehabScope, RehabLineItem, ConditionScore } from '../../valuation-engine/src/types.ts';
import { TIERS } from '../../valuation-engine/src/types.ts';
import {
  FINISH_CATALOG,
  SYSTEM_REPAIRS,
  DEFAULT_MARKET_CONFIG,
  prepMultiplier,
  type MarketConfig,
  type FinishItem,
  type SystemRepair,
} from './catalog.ts';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ScopeSubject {
  /** Finished sqft used to scale per-sqft items. Falls back to sqft. */
  finishedSqft?: number;
  sqft: number;
  conditionScore: ConditionScore;
}

export interface ScopeOptions {
  /** Override market config (permits, contingency, prep multipliers). */
  market?: Partial<MarketConfig>;
  /** Override finish catalog. */
  finishCatalog?: readonly FinishItem[];
  /** Override system repairs. */
  systemRepairs?: readonly SystemRepair[];
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ScopeLineItem extends RehabLineItem {
  label: string;
  category: string;
  costUsd: number;
  /** 'finish' | 'system' | 'soft' */
  kind: 'finish' | 'system' | 'soft';
}

export interface ScopeResult {
  tier: Tier;
  conditionScore: ConditionScore;
  sqft: number;
  prepMultiplier: number;
  lineItems: ScopeLineItem[];
  /** Sum of all line item costs. */
  totalUsd: number;
  breakdown: {
    finishUsd: number;
    systemUsd: number;
    softUsd: number;
  };
}

// ---------------------------------------------------------------------------
// Core: buildScope / buildScopes
// ---------------------------------------------------------------------------

/**
 * Build an itemized rehab scope for a single tier.
 */
export function buildScope(
  subject: ScopeSubject,
  tier: Tier,
  options?: ScopeOptions,
): ScopeResult {
  const config: MarketConfig = {
    ...DEFAULT_MARKET_CONFIG,
    ...options?.market,
  };
  const catalog = options?.finishCatalog ?? FINISH_CATALOG;
  const repairs = options?.systemRepairs ?? SYSTEM_REPAIRS;
  const sqft = subject.finishedSqft ?? subject.sqft;
  const pm = prepMultiplier(subject.conditionScore, config);

  const lineItems: ScopeLineItem[] = [];

  // 1. Finish items — tier-driven, scaled by sqft × prep multiplier
  let finishUsd = 0;
  for (const item of catalog) {
    const cost = Math.round(item.perSqft[tier] * sqft * pm);
    lineItems.push({
      label: item.label,
      category: item.category,
      costUsd: cost,
      kind: 'finish',
    });
    finishUsd += cost;
  }

  // 2. System repairs — condition-triggered, flat cost
  let systemUsd = 0;
  for (const repair of repairs) {
    if (subject.conditionScore <= repair.triggerAtOrBelow) {
      lineItems.push({
        label: repair.label,
        category: repair.category,
        costUsd: repair.costUsd,
        kind: 'system',
      });
      systemUsd += repair.costUsd;
    }
  }

  // 3. Soft costs — permits + contingency on hard costs
  const hardCosts = finishUsd + systemUsd;
  const permits = Math.round(hardCosts * config.permitRate);
  const contingency = Math.round(hardCosts * config.contingencyRate);
  const softUsd = permits + contingency;

  lineItems.push({
    label: 'Permits & inspections',
    category: 'permits',
    costUsd: permits,
    kind: 'soft',
  });
  lineItems.push({
    label: 'Contingency',
    category: 'contingency',
    costUsd: contingency,
    kind: 'soft',
  });

  const totalUsd = finishUsd + systemUsd + softUsd;

  return {
    tier,
    conditionScore: subject.conditionScore,
    sqft,
    prepMultiplier: pm,
    lineItems,
    totalUsd,
    breakdown: { finishUsd, systemUsd, softUsd },
  };
}

/**
 * Build scopes for all three tiers at once.
 */
export function buildScopes(
  subject: ScopeSubject,
  options?: ScopeOptions,
): Record<Tier, ScopeResult> {
  return {
    light: buildScope(subject, 'light', options),
    medium: buildScope(subject, 'medium', options),
    high: buildScope(subject, 'high', options),
  };
}

/**
 * Convert scope results to the engine's `RehabScope` shape for
 * `ValuationRequest.rehabScopes`.
 */
export function toRehabScopes(
  scopes: Record<Tier, ScopeResult>,
): Record<Tier, RehabScope> {
  const result = {} as Record<Tier, RehabScope>;
  for (const tier of TIERS) {
    result[tier] = {
      lineItems: scopes[tier].lineItems.map((li) => ({
        label: li.label,
        category: li.category,
        costUsd: li.costUsd,
      })),
    };
  }
  return result;
}
