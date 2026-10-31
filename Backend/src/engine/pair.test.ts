import { describe, expect, it } from 'vitest';
import { capRemaining, matchPairs } from './pair';

const R = { FULL_FULL: 400, DEFAULT: 200 };
const c = (lf: number, lb: number, rf: number, rb: number) => ({ lf, lb, rf, rb });

describe('matchPairs — scenarios from the development plan', () => {
  it('1. FULL earner, 1 FULL each side -> ₹400', () => expect(matchPairs('FULL', c(1, 0, 1, 0), 30, R).amount).toBe(400));
  it('2. FULL earner, 1 BASIC each side -> ₹200', () => expect(matchPairs('FULL', c(0, 1, 0, 1), 30, R).amount).toBe(200));
  it('3. BASIC earner, 1 FULL each side -> ₹200', () => expect(matchPairs('BASIC', c(1, 0, 1, 0), 30, R).amount).toBe(200));
  it('4. 3 FULL vs 1 FULL -> ₹400, carry 2 FULL left', () => {
    const r = matchPairs('FULL', c(3, 0, 1, 0), 30, R);
    expect(r.amount).toBe(400);
    expect(r.carryAfter).toEqual(c(2, 0, 0, 0));
  });
  it('5. 40 vs 40 with daily cap 30 -> 30 paid, 10 flushed', () => {
    const r = matchPairs('FULL', c(40, 0, 40, 0), 30, R);
    expect(r.amount).toBe(12000);
    expect(r.flushed).toBe(10);
    expect(r.carryAfter).toEqual(c(0, 0, 0, 0));
  });
  it('6. day counter already 25 -> 5 paid', () => {
    const rem = capRemaining({ day: 25, week: 25, month: 25 }, { day: 30, week: 210, month: 840 });
    expect(matchPairs('FULL', c(10, 0, 10, 0), rem, R).fullPairs).toBe(5);
  });
  it('7. week counter 205 -> 5 paid', () => {
    expect(capRemaining({ day: 0, week: 205, month: 205 }, { day: 30, week: 210, month: 840 })).toBe(5);
  });
  it('8. month counter 840 -> nothing paid', () => {
    const rem = capRemaining({ day: 0, week: 0, month: 840 }, { day: 30, week: 210, month: 840 });
    const r = matchPairs('FULL', c(5, 0, 5, 0), rem, R);
    expect(r.amount).toBe(0);
    expect(r.flushed).toBe(5);
  });
  it('9. L: 1 FULL + 1 BASIC, R: 2 BASIC -> 2 × ₹200', () => {
    const r = matchPairs('FULL', c(1, 1, 0, 2), 30, R);
    expect(r.fullPairs).toBe(0);
    expect(r.basicPairs).toBe(2);
    expect(r.amount).toBe(400);
  });
  it('one side empty -> nothing', () => expect(matchPairs('FULL', c(5, 5, 0, 0), 30, R).amount).toBe(0));
});
