import { describe, it, expect } from 'vitest';
import { createProgress, upgradeCost, buyUpgrade, canBuy, currentStats } from '../src/sim/economy.js';
import { UPGRADES } from '../src/sim/config.js';

describe('economy', () => {
  it('upgrade costs grow every level', () => {
    for (const u of UPGRADES) {
      for (let l = 0; l < u.maxLevel; l++) expect(upgradeCost(u.id, l + 1)).toBeGreaterThan(upgradeCost(u.id, l));
    }
  });

  it('every upgrade improves its stat', () => {
    for (const u of UPGRADES) {
      const better = u.id === 'hull' ? (a, b) => a <= b : (a, b) => a > b;
      for (let l = 0; l < u.maxLevel; l++) expect(better(u.value(l + 1), u.value(l))).toBe(true);
    }
  });

  it('buying deducts money and raises the level', () => {
    const p = createProgress();
    expect(buyUpgrade(p, 'range')).toBe(false);
    p.money = 100;
    const cost = upgradeCost('range', 0);
    expect(buyUpgrade(p, 'range')).toBe(true);
    expect(p.money).toBe(100 - cost);
    expect(p.levels.range).toBe(1);
    expect(currentStats(p).range).toBeGreaterThan(currentStats(createProgress()).range);
  });

  it('cannot buy past max level', () => {
    const p = createProgress();
    p.money = 1e12;
    const u = UPGRADES.find((x) => x.id === 'speed');
    for (let i = 0; i < u.maxLevel; i++) expect(buyUpgrade(p, 'speed')).toBe(true);
    expect(canBuy(p, 'speed')).toBe(false);
    expect(buyUpgrade(p, 'speed')).toBe(false);
  });

  it('first upgrade is affordable after roughly one starting haul', () => {
    const start = currentStats(createProgress());
    const cheapest = Math.min(...UPGRADES.map((u) => upgradeCost(u.id, 0)));
    // A full starting hold of the cheapest scrap ($1 each) must buy something.
    expect(start.capacity).toBeGreaterThanOrEqual(cheapest);
  });
});
