/**
 * {{BRAND_NAME}} — Material Intelligence analyst engine (§4.3 add-on)
 *
 * Reads an investor's ACTUAL material choices (guided builder, upload, or
 * borrower link), maps each line to a finish score via the material-to-value
 * matrix, reasons to a true finish tier — with capping logic so commodity
 * roof/windows/systems keep an otherwise luxury scope honest — and
 * interpolates a true-scope ARV between the valuation's tier ARVs.
 *
 * Reasoning is produced by a swappable `Reasoner`. The default is
 * deterministic (auditable, offline). A Claude-backed reasoner drops into the
 * same slot when the Anthropic key is configured — the analysis numbers never
 * come from the LLM, only richer prose.
 */

import type { Tier } from '../../valuation-engine/src/types.ts';
import {
  MATERIAL_MATRIX,
  resolveMatrix,
  findCategory,
  type MatrixCategory,
  type MatrixOverrides,
  type FinishScore,
} from './matrix.ts';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface MaterialLine {
  /** Category id or label ('counters', 'Kitchen counters'). Optional — inferred when missing. */
  category?: string;
  /** The actual material/spec, e.g. 'Granite / quartz', 'LP SmartSide'. */
  material: string;
}

export interface AnalysisSubject {
  sqft?: number;
  finishedSqft?: number;
  address?: string;
}

/** Tier ARVs from an existing valuation — the anchor for the true-scope ARV. */
export interface TierValues {
  arv: Record<Tier, number>;
}

export interface AnalyzeOptions {
  matrix?: MatrixOverrides;
  reasoner?: Reasoner;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface LineReadout {
  category: string;
  categoryLabel: string;
  material: string;
  /** 1 light · 2 medium · 3 high. 0 = unmatched (excluded from the score). */
  score: FinishScore | 0;
  matched?: string;
  capping: boolean;
  weight: number;
}

export interface MaterialAnalysis {
  lines: LineReadout[];
  /** Weighted fractional finish score, 1.0–3.0. */
  finishScore: number;
  /** Raw (pre-cap) score, for the audit trail. */
  rawScore: number;
  /** True when capping categories bound the score. */
  capped: boolean;
  detectedTier: Tier;
  /** Human label, e.g. 'High-end / luxury-leaning (capped upper-medium)'. */
  detectedLabel: string;
  /** Interpolated between the valuation's tier ARVs. Absent without TierValues. */
  trueScopeArv?: number;
  /** trueScopeArv ÷ finished sqft, when both are known. */
  pricePerSqft?: number;
  /** vs. the generic tier the score rounds to. */
  vsGenericTier?: { tier: Tier; arv: number; deltaUsd: number };
  reasoning: string;
  matchedCount: number;
  unmatchedCount: number;
}

// ---------------------------------------------------------------------------
// Reasoner slot — deterministic default; Claude drops in later.
// ---------------------------------------------------------------------------

export interface ReasonerInput {
  lines: LineReadout[];
  finishScore: number;
  rawScore: number;
  capped: boolean;
  detectedTier: Tier;
  detectedLabel: string;
  trueScopeArv?: number;
  pricePerSqft?: number;
  subject: AnalysisSubject;
}

export interface Reasoner {
  explain(input: ReasonerInput): string;
}

const TIER_WORD: Record<Tier, string> = { light: 'light', medium: 'medium', high: 'luxury' };

export class DeterministicReasoner implements Reasoner {
  explain(r: ReasonerInput): string {
    const highs = r.lines.filter((l) => l.score === 3);
    const mediums = r.lines.filter((l) => l.score === 2);
    const lights = r.lines.filter((l) => l.score === 1);
    const caps = r.lines.filter((l) => l.capping && l.score > 0 && l.score < 3);
    const parts: string[] = [];

    if (highs.length) {
      parts.push(`${listMaterials(highs)} ${highs.length === 1 ? 'is a' : 'are'} high-end signal${highs.length === 1 ? '' : 's'}.`);
    }
    if (mediums.length) {
      parts.push(`${listMaterials(mediums)} read${mediums.length === 1 ? 's' : ''} as solid mid-grade work.`);
    }
    if (lights.length) {
      parts.push(`${listMaterials(lights)} stay${lights.length === 1 ? 's' : ''} at the cosmetic/light level.`);
    }
    if (r.capped && caps.length) {
      parts.push(
        `The scope is held below full luxury because ${listCats(caps)} ${caps.length === 1 ? 'is' : 'are'} standard-grade — buyers price the whole finish level, and commodity ${caps.length === 1 ? 'work in this category' : 'work in these categories'} caps what the market will pay.`,
      );
    }
    parts.push(`Net read: ${r.detectedLabel.toLowerCase()} (finish score ${r.finishScore.toFixed(2)} on a 1–3 scale).`);
    if (r.trueScopeArv !== undefined) {
      const pps = r.pricePerSqft !== undefined ? `, ≈$${Math.round(r.pricePerSqft)}/sqft` : '';
      parts.push(`True-scope ARV is set by interpolating the comp-derived tier values at that score: $${fmt(r.trueScopeArv)}${pps}. This is materials-driven — not a generic ${TIER_WORD[r.detectedTier]} preset.`);
    }
    const unmatched = r.lines.filter((l) => l.score === 0);
    if (unmatched.length) {
      parts.push(`${unmatched.length} line${unmatched.length === 1 ? '' : 's'} could not be matched to the matrix and ${unmatched.length === 1 ? 'was' : 'were'} excluded from the score (${listMaterials(unmatched)}).`);
    }
    return parts.join(' ');
  }
}

function listMaterials(lines: LineReadout[]): string {
  return lines.slice(0, 4).map((l) => `${l.material} (${l.categoryLabel.toLowerCase()})`).join(', ');
}
function listCats(lines: LineReadout[]): string {
  return lines.map((l) => l.categoryLabel.toLowerCase()).join(' and ');
}
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Score one material line against a category's signals (high checked first). */
export function scoreMaterial(cat: MatrixCategory, material: string): { score: FinishScore | 0; matched?: string } {
  const text = material.trim().toLowerCase();
  if (!text) return { score: 0 };
  for (const signal of cat.signals) {
    for (const kw of signal.keywords) {
      if (text.includes(kw)) return { score: signal.score, matched: kw };
    }
  }
  return { score: 0 };
}

/** Infer the category from the material text when none was given. */
function inferCategory(matrix: readonly MatrixCategory[], material: string): MatrixCategory | undefined {
  let best: { cat: MatrixCategory; score: FinishScore } | undefined;
  for (const cat of matrix) {
    const { score } = scoreMaterial(cat, material);
    if (score > (best?.score ?? 0)) best = { cat, score: score as FinishScore };
  }
  return best?.cat;
}

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

/** Cap ceiling when capping categories read medium-or-below: upper-medium+. */
const CAP_CEILING = 2.55;
const LIGHT_MAX = 1.6;
const MEDIUM_MAX = 2.45;

export function analyzeMaterials(
  materials: MaterialLine[],
  subject: AnalysisSubject = {},
  values?: TierValues,
  opts: AnalyzeOptions = {},
): MaterialAnalysis {
  const matrix = resolveMatrix(opts.matrix);
  if (!materials.length) throw new Error('materials[] must not be empty');

  const lines: LineReadout[] = materials.map((m) => {
    const cat = (m.category ? findCategory(matrix, m.category) : undefined) ?? inferCategory(matrix, m.material);
    if (!cat) {
      return { category: 'other', categoryLabel: m.category?.trim() || 'Other', material: m.material, score: 0, capping: false, weight: 0 };
    }
    const { score, matched } = scoreMaterial(cat, m.material);
    return { category: cat.id, categoryLabel: cat.label, material: m.material, score, matched, capping: cat.capping, weight: cat.weight };
  });

  const scored = lines.filter((l) => l.score > 0);
  if (!scored.length) throw new Error('no materials matched the matrix — provide recognizable material choices');

  // The finish read is driven by buyer-visible finish categories; capping
  // categories (roof/windows/systems) don't lift the score — they only gate
  // it. Fall back to all scored lines when only capping lines were given.
  const finishLines = scored.filter((l) => !l.capping);
  const scoreLines = finishLines.length ? finishLines : scored;
  const totalWeight = scoreLines.reduce((s, l) => s + l.weight, 0);
  const rawScore = scoreLines.reduce((s, l) => s + l.score * l.weight, 0) / totalWeight;

  // Capping: a luxury-leaning scope with medium-or-below capping categories
  // (roof / windows / systems) is held to upper-medium territory.
  const capLines = scored.filter((l) => l.capping);
  const weakCaps = capLines.filter((l) => l.score <= 2);
  let finishScore = rawScore;
  let capped = false;
  if (rawScore > CAP_CEILING && weakCaps.length > 0) {
    finishScore = CAP_CEILING;
    capped = true;
  }

  const detectedTier: Tier = finishScore <= LIGHT_MAX ? 'light' : finishScore <= MEDIUM_MAX ? 'medium' : 'high';
  const detectedLabel = capped
    ? 'High-end / luxury-leaning (capped upper-medium)'
    : detectedTier === 'high'
      ? 'High-end / luxury'
      : detectedTier === 'medium'
        ? finishScore > 2.2 ? 'Upper-medium' : 'Medium / full renovation'
        : 'Light / cosmetic';

  // True-scope ARV: linear interpolation between tier ARVs at the score.
  let trueScopeArv: number | undefined;
  let pricePerSqft: number | undefined;
  let vsGenericTier: MaterialAnalysis['vsGenericTier'];
  if (values) {
    trueScopeArv = interpolateArv(values.arv, finishScore);
    const sqft = subject.finishedSqft ?? subject.sqft;
    if (sqft && sqft > 0) pricePerSqft = trueScopeArv / sqft;
    const genericArv = values.arv[detectedTier];
    vsGenericTier = { tier: detectedTier, arv: genericArv, deltaUsd: trueScopeArv - genericArv };
  }

  const reasoner = opts.reasoner ?? new DeterministicReasoner();
  const base: Omit<MaterialAnalysis, 'reasoning'> = {
    lines,
    finishScore: round2(finishScore),
    rawScore: round2(rawScore),
    capped,
    detectedTier,
    detectedLabel,
    trueScopeArv: trueScopeArv === undefined ? undefined : Math.round(trueScopeArv),
    pricePerSqft: pricePerSqft === undefined ? undefined : round2(pricePerSqft),
    vsGenericTier: vsGenericTier
      ? { ...vsGenericTier, arv: Math.round(vsGenericTier.arv), deltaUsd: Math.round(vsGenericTier.deltaUsd) }
      : undefined,
    matchedCount: scored.length,
    unmatchedCount: lines.length - scored.length,
  };
  const reasoning = reasoner.explain({ ...base, subject });
  return { ...base, reasoning };
}

/** score 1 → light ARV, 2 → medium, 3 → high; linear between. */
export function interpolateArv(arv: Record<Tier, number>, score: number): number {
  const s = Math.min(3, Math.max(1, score));
  if (s <= 2) return arv.light + (arv.medium - arv.light) * (s - 1);
  return arv.medium + (arv.high - arv.medium) * (s - 2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export { MATERIAL_MATRIX };
