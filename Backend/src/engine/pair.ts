/**
 * Pair-matching rules (pure functions — no database access, easy to unit-test).
 *
 * From the plan slides:
 *   your tier FULL (100 BV) + FULL unit left + FULL unit right  -> ₹400 per pair
 *   every other combination                                    -> ₹200 per pair
 * A "unit" = one activated joining in that leg, counted by its tier.
 */
export interface Carry {
  lf: number; // left  FULL units
  lb: number; // left  BASIC units
  rf: number; // right FULL units
  rb: number; // right BASIC units
}

export interface PairResult {
  fullPairs: number; // paid at FULL_FULL rate
  basicPairs: number; // paid at DEFAULT rate
  flushed: number; // matched but above the cap (not paid)
  amount: number; // rupees
  consumed: Carry; // units used from the carry (paid + flushed)
  carryAfter: Carry;
}

export interface Rates {
  FULL_FULL: number;
  DEFAULT: number;
}

/** take n units from one leg, BASIC units first; returns [full, basic] remaining */
function consume(full: number, basic: number, n: number): [number, number] {
  const fromBasic = Math.min(basic, n);
  return [full - (n - fromBasic), basic - fromBasic];
}

export function matchPairs(tier: 'BASIC' | 'FULL', c: Carry, capRemaining: number, rates: Rates, flush = true): PairResult {
  let { lf, lb, rf, rb } = c;
  let fullPairs = 0;

  if (tier === 'FULL') {
    fullPairs = Math.min(lf, rf);
    lf -= fullPairs;
    rf -= fullPairs;
  }
  const basicPairs = Math.min(lf + lb, rf + rb);
  [lf, lb] = consume(lf, lb, basicPairs);
  [rf, rb] = consume(rf, rb, basicPairs);

  const cap = Math.max(0, capRemaining);
  const paidFull = Math.min(fullPairs, cap);
  const paidBasic = Math.min(basicPairs, cap - paidFull);
  const overflowFull = fullPairs - paidFull;
  const overflowBasic = basicPairs - paidBasic;

  if (!flush) {
    // CARRY mode: unpaid pairs go back into the carry for the next closing
    lf += overflowFull; rf += overflowFull;
    lb += overflowBasic; rb += overflowBasic; // simplification: re-added as BASIC units
  }

  const carryAfter = { lf, lb, rf, rb };
  return {
    fullPairs: paidFull,
    basicPairs: paidBasic,
    flushed: flush ? overflowFull + overflowBasic : 0,
    amount: paidFull * rates.FULL_FULL + paidBasic * rates.DEFAULT,
    consumed: { lf: c.lf - lf, lb: c.lb - lb, rf: c.rf - rf, rb: c.rb - rb },
    carryAfter,
  };
}

/** How many more pairs may be paid, given the counters and caps */
export function capRemaining(counters: { day: number; week: number; month: number }, caps: { day: number; week: number; month: number }) {
  return Math.max(0, Math.min(caps.day - counters.day, caps.week - counters.week, caps.month - counters.month));
}
