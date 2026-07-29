/**
 * ValueProof — Valuation Engine
 * Rental / BRRRR value via the income approach (§3, §4.5).
 *
 *   NOI = annualRent × (1 − expenseRatio)
 *   incomeValue = NOI / capRate
 *   grmValue = monthlyRent × GRM,  GRM = 1 / (12 × capRate)  (cross-check)
 */

import type { RentalInputs, RentalValue } from './types.ts';
import type { MarketConfig } from './config.ts';

export function computeRental(inputs: RentalInputs, cfg: MarketConfig): RentalValue {
  const monthlyRent = Math.max(0, inputs.monthlyRent);
  const expenseRatio = clampFraction(inputs.expenseRatio ?? cfg.rental.expenseRatio);
  const capRate = inputs.capRate ?? cfg.rental.capRate;

  const annualRent = monthlyRent * 12;
  const noi = annualRent * (1 - expenseRatio);
  const incomeValue = capRate > 0 ? noi / capRate : 0;

  // Annual gross rent multiplier implied by the cap rate and expense load
  // (value / annual gross rent), for a second-opinion cross-check.
  const grm = capRate > 0 ? (1 - expenseRatio) / capRate : 0;
  const grmValue = annualRent * grm; // == incomeValue by construction; kept explicit for the report

  return { monthlyRent, noi, capRate, incomeValue, grmValue, grm };
}

function clampFraction(x: number): number {
  return Math.min(0.95, Math.max(0, x));
}
