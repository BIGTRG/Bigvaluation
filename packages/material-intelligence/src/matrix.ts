/**
 * ValueProof — Material Intelligence (§4.3 add-on)
 * The material-to-value matrix: the language of materials mapped to finish
 * level. Each category lists keyword signals per tier; the analyst engine
 * matches an investor's actual material choices against these signals to
 * decide whether a scope reads light, medium, or luxury.
 *
 * Tunable per market via `MatrixOverrides` — and designed to improve as
 * closed deals feed back into it (accuracy engine, later phase).
 */

import type { Tier } from '../../valuation-engine/src/types.ts';

/** Numeric finish score: 1 = light, 2 = medium, 3 = high/luxury. */
export type FinishScore = 1 | 2 | 3;

export interface MaterialSignal {
  /** Case-insensitive keywords/phrases that indicate this tier. */
  keywords: readonly string[];
  score: FinishScore;
}

export interface MatrixCategory {
  /** Canonical category id, e.g. 'counters'. */
  id: string;
  label: string;
  /**
   * Relative weight in the overall finish read. Buyer-visible finish
   * categories (kitchen, counters, flooring, bath) weigh more than
   * commodity systems.
   */
  weight: number;
  /**
   * Capping category: strong signals elsewhere can't carry the scope to full
   * luxury if this category reads medium or below (e.g. standard vinyl
   * windows on an otherwise luxury scope).
   */
  capping: boolean;
  signals: readonly MaterialSignal[];
  /** Example choices surfaced in the guided builder, one per tier. */
  examples: Record<Tier, string>;
}

const c = (
  id: string,
  label: string,
  weight: number,
  capping: boolean,
  light: readonly string[],
  medium: readonly string[],
  high: readonly string[],
  examples: Record<Tier, string>,
): MatrixCategory => ({
  id,
  label,
  weight,
  capping,
  signals: [
    { keywords: high, score: 3 },
    { keywords: medium, score: 2 },
    { keywords: light, score: 1 },
  ],
  examples,
});

/**
 * The default material-to-value matrix. High-signal keywords are checked
 * first so "premium quartz" reads luxury even though "quartz" alone reads
 * medium.
 */
export const MATERIAL_MATRIX: readonly MatrixCategory[] = [
  c('counters', 'Kitchen counters', 1.4, false,
    ['laminate', 'formica', 'tile counter', 'butcher block paint'],
    ['granite', 'quartz', 'solid surface', 'corian', 'butcher block'],
    ['premium quartz', 'natural stone', 'waterfall', 'marble', 'quartzite', 'soapstone', 'calacatta', 'taj mahal'],
    { light: 'Laminate', medium: 'Granite / standard quartz', high: 'Premium quartz, natural stone, waterfall edge' }),
  c('cabinets', 'Kitchen cabinets', 1.3, false,
    ['paint existing', 'reface', 'stock cabinet', 'rta', 'thermofoil'],
    ['shaker', 'semi-custom', 'soft close', 'new stock cabinets'],
    ['custom cabinet', 'inset', 'floor to ceiling', 'panel-ready', 'italian', 'walnut cabinet'],
    { light: 'Paint / reface existing', medium: 'New shaker, soft-close', high: 'Custom or inset, panel-ready' }),
  c('flooring', 'Flooring', 1.3, false,
    ['carpet', 'sheet vinyl', 'peel and stick', 'laminate floor', 'refinish existing'],
    ['lvp', 'luxury vinyl', 'engineered hardwood', 'ceramic tile', 'porcelain tile'],
    ['solid hardwood', 'white oak', 'herringbone', 'natural stone floor', 'wide plank', 'terrazzo'],
    { light: 'Carpet / laminate / refinish', medium: 'LVP / engineered hardwood', high: 'Solid hardwood, wide plank, herringbone' }),
  c('bath', 'Bathrooms', 1.2, false,
    ['tub surround', 'fiberglass', 'reglaze', 'plastic surround', 'stock vanity'],
    ['tiled shower', 'new vanity', 'double vanity', 'subway tile'],
    ['frameless glass', 'freestanding tub', 'rain shower', 'heated floor', 'marble bath', 'wet room', 'double vanity + tiled shower', 'tiled shower + double vanity'],
    { light: 'Reglaze / fiberglass surround', medium: 'Tiled shower + double vanity', high: 'Frameless glass, freestanding tub, heated floor' }),
  c('appliances', 'Appliances', 1.0, false,
    ['keep existing', 'used appliance', 'white appliance', 'basic appliance'],
    ['stainless', 'stainless steel package', 'new appliance package'],
    ['panel ready', 'built-in', 'pro range', 'thermador', 'sub-zero', 'wolf', 'monogram', 'bosch benchmark', '48"'],
    { light: 'Keep / basic package', medium: 'Stainless package', high: 'Built-in / pro-grade (Wolf, Sub-Zero)' }),
  c('siding', 'Siding / exterior', 1.1, false,
    ['paint siding', 'vinyl siding repair', 'patch siding'],
    ['vinyl siding', 'new vinyl', 'fiber cement repair'],
    ['lp smartside', 'hardie', 'fiber cement', 'board and batten', 'cedar', 'stucco', 'stone veneer', 'brick veneer'],
    { light: 'Paint / repair existing', medium: 'New vinyl siding', high: 'LP SmartSide / Hardie / stone accents' }),
  c('windows', 'Windows', 1.0, true,
    ['repair window', 'keep window', 'reglaze window'],
    ['vinyl window', 'vinyl, energy-rated', 'new vinyl windows', 'double pane'],
    ['fiberglass window', 'wood clad', 'andersen', 'pella reserve', 'marvin', 'black frame casement', 'steel window'],
    { light: 'Repair existing', medium: 'New vinyl, energy-rated', high: 'Fiberglass / wood-clad (Marvin, Andersen)' }),
  c('roof', 'Roof', 1.0, true,
    ['patch roof', 'roof repair', 'coat roof'],
    ['3-tab', 'architectural shingle', 'new shingle roof', 'asphalt shingle'],
    ['standing seam', 'metal roof', 'slate', 'tile roof', 'cedar shake', 'davinci'],
    { light: 'Repair / patch', medium: 'New architectural shingle', high: 'Standing-seam metal / slate / tile' }),
  c('systems', 'Systems (HVAC / electrical / plumbing)', 1.0, true,
    ['service hvac', 'keep hvac', 'repair panel', 'partial repipe'],
    ['new hvac', 'new water heater', 'panel upgrade', 'repipe', 'new furnace', 'heat pump'],
    ['multi-zone', 'mini split system', 'tankless', 'smart home', 'radiant heat', 'geothermal', 'dual fuel'],
    { light: 'Service / repair existing', medium: 'New HVAC + water heater', high: 'Multi-zone / tankless / radiant' }),
  c('fixtures', 'Fixtures & lighting', 0.8, false,
    ['builder grade', 'basic fixture', 'keep fixtures', 'dome light'],
    ['new fixture package', 'brushed nickel', 'matte black', 'led recessed'],
    ['designer lighting', 'brass fixture', 'restoration hardware', 'visual comfort', 'statement lighting', 'unlacquered brass'],
    { light: 'Keep / builder grade', medium: 'New matte black / nickel package', high: 'Designer / brass statement pieces' }),
  c('trim', 'Trim, doors & millwork', 0.8, false,
    ['paint trim', 'keep doors', 'hollow core'],
    ['new interior doors', 'craftsman trim', 'solid core', 'new baseboard'],
    ['custom millwork', 'wainscoting', 'coffered', 'built-ins', '8-foot doors', 'arched doorway'],
    { light: 'Paint existing', medium: 'Solid-core doors, new trim', high: 'Custom millwork, built-ins, coffered' }),
  c('landscape', 'Landscaping & curb appeal', 0.7, false,
    ['mow and clean', 'basic cleanup', 'mulch'],
    ['sod', 'new plantings', 'new walkway', 'pressure wash + paint door'],
    ['hardscape', 'paver patio', 'irrigation', 'landscape lighting', 'outdoor kitchen', 'fence + gate package'],
    { light: 'Cleanup + mulch', medium: 'Sod + plantings + walkway', high: 'Hardscape, irrigation, lighting' }),
] as const;

export interface MatrixOverrides {
  /** Replace or add categories by id. */
  categories?: readonly MatrixCategory[];
}

/** Resolve the working matrix: defaults with per-market overrides applied. */
export function resolveMatrix(overrides?: MatrixOverrides): readonly MatrixCategory[] {
  if (!overrides?.categories?.length) return MATERIAL_MATRIX;
  const byId = new Map(MATERIAL_MATRIX.map((cat) => [cat.id, cat]));
  for (const cat of overrides.categories) byId.set(cat.id, cat);
  return [...byId.values()];
}

/** Find a category by id or fuzzy label match ("Kitchen counters" → counters). */
export function findCategory(
  matrix: readonly MatrixCategory[],
  raw: string,
): MatrixCategory | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    matrix.find((cat) => cat.id === needle) ??
    matrix.find((cat) => cat.label.toLowerCase() === needle) ??
    matrix.find((cat) => cat.label.toLowerCase().includes(needle) || needle.includes(cat.id))
  );
}
