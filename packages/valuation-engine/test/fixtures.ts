/**
 * Shared test fixtures. A synthetic but realistic neighborhood so the same comp
 * set exercises comp selection, bands, As-Is, ARV, confidence, and deal math.
 */

import type { Comp, Subject } from '../src/types.ts';

export const AS_OF = '2026-07-23';

export const subject: Subject = {
  address: '123 Flip St, Phoenix, AZ 85021',
  apn: '123-45-678',
  sqft: 1800,
  beds: 3,
  baths: 2,
  yearBuilt: 1978,
  conditionScore: 2, // distressed / needs work
};

/**
 * Renovated comps clustered around ~$260–$330/sqft, plus a couple of as-is
 * comps around ~$180/sqft, at a spread of distances and dates.
 */
export const comps: Comp[] = [
  // Renovated, close, recent — should carry the most weight.
  reno('r1', 1750, 260 * 1750, '2026-06-01', 0.4),
  reno('r2', 1850, 285 * 1850, '2026-05-10', 0.8),
  reno('r3', 1900, 300 * 1900, '2026-04-15', 1.2),
  reno('r4', 1700, 275 * 1700, '2026-03-20', 1.6),
  reno('r5', 2000, 330 * 2000, '2026-02-01', 1.9),
  // Renovated but farther out (needs 3mi ring).
  reno('r6', 1800, 315 * 1800, '2026-05-25', 2.6),
  // As-is comps for the area $/sqft leg.
  asis('a1', 1780, 180 * 1780, '2026-06-10', 0.6),
  asis('a2', 1820, 175 * 1820, '2026-04-05', 1.1),
  asis('a3', 1900, 190 * 1900, '2026-03-01', 1.7),
];

function reno(
  id: string,
  sqft: number,
  salePrice: number,
  saleDate: string,
  distanceMiles: number,
): Comp {
  return { id, address: `${id} Comp Ave`, sqft, salePrice, saleDate, distanceMiles, renovated: true };
}

function asis(
  id: string,
  sqft: number,
  salePrice: number,
  saleDate: string,
  distanceMiles: number,
): Comp {
  return { id, address: `${id} Comp Ave`, sqft, salePrice, saleDate, distanceMiles, renovated: false };
}
