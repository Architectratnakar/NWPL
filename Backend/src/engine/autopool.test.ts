import { describe, expect, it } from 'vitest';
import { childrenOf, depthOf, filledAt, levelRange, parentOf, progressFor, requiredBv } from './autopool';
import { DEFAULT_AUTOPOOL } from '../lib/settings';

describe('autopool matrix maths (4 × 4)', () => {
  it('children and parent are inverse', () => {
    expect(childrenOf(1)).toEqual([2, 3, 4, 5]);
    expect(childrenOf(2)).toEqual([6, 7, 8, 9]);
    for (let p = 1; p < 500; p++) for (const c of childrenOf(p)) expect(parentOf(c)).toBe(p);
    expect(parentOf(1)).toBeNull();
  });

  it('level ranges match walking the tree', () => {
    for (const p of [1, 2, 5, 17, 123]) {
      let frontier = [p];
      for (let k = 1; k <= 5; k++) {
        frontier = frontier.flatMap(childrenOf);
        const r = levelRange(p, k);
        expect(r.size).toBe(4 ** k);
        expect([r.start, r.end]).toEqual([frontier[0], frontier[frontier.length - 1]]);
      }
    }
  });

  it('team sizes are 4, 16, 64 … 262144 as on the plan sheet', () => {
    expect(Array.from({ length: 9 }, (_, i) => levelRange(1, i + 1).size)).toEqual([4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144]);
  });

  it('counts filled slots', () => {
    expect(filledAt(1, 1, 3)).toBe(2); // positions 2,3
    expect(filledAt(1, 1, 5)).toBe(4);
    expect(filledAt(1, 2, 21)).toBe(16);
    expect(filledAt(2, 1, 7)).toBe(2); // 6,7
    expect(filledAt(2, 1, 4)).toBe(0);
  });

  it('depth of a position', () => {
    expect([1, 2, 5, 6, 21, 22].map(depthOf)).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it('repurchase condition: CUMULATIVE adds levels, THRESHOLD uses the level figure', () => {
    expect(requiredBv(DEFAULT_AUTOPOOL.levels, 1, 'CUMULATIVE')).toBe(20);
    expect(requiredBv(DEFAULT_AUTOPOOL.levels, 3, 'CUMULATIVE')).toBe(140);
    expect(requiredBv(DEFAULT_AUTOPOOL.levels, 3, 'THRESHOLD')).toBe(80);
  });

  it('plan sheet income adds up to ₹3,49,52,400 (sheet prints ₹3,49,51,200)', () => {
    expect(DEFAULT_AUTOPOOL.levels.reduce((a, l) => a + l.income, 0)).toBe(34_952_400);
    for (const l of DEFAULT_AUTOPOOL.levels) expect(l.income).toBe(100 * 4 ** l.level);
  });

  it('level state: filling → waiting repurchase → ready → paid', () => {
    const cfg = DEFAULT_AUTOPOOL;
    expect(progressFor(1, 4, 100, new Set(), cfg)[0].state).toBe('FILLING');
    expect(progressFor(1, 5, 0, new Set(), cfg)[0].state).toBe('WAITING_REPURCHASE');
    expect(progressFor(1, 5, 20, new Set(), cfg)[0].state).toBe('READY');
    expect(progressFor(1, 5, 20, new Set([1]), cfg)[0].state).toBe('PAID');
    expect(progressFor(1, 5, 20, new Set(), cfg, false)[0].state).toBe('INACTIVE');
    const p = progressFor(1, 21, 60, new Set(), cfg);
    expect(p.slice(0, 3).map((l) => l.state)).toEqual(['READY', 'READY', 'FILLING']);
  });
});
