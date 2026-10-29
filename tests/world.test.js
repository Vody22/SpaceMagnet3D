import { describe, it, expect } from 'vitest';
import { World, FREE, ATTACHED, DEAD } from '../src/sim/World.js';
import { SIM_STEP, STATION, ROCKS } from '../src/sim/config.js';

// Simple autopilot: collect until full, then go home.
function botInput(w) {
  const s = w.ship;
  const full = w.cargoCount >= w.stats.capacity;
  let tx, tz;
  if (full) { tx = STATION.x; tz = STATION.z; }
  else {
    let best = null, bd = Infinity;
    for (const d of w.debris) {
      if (d.state !== FREE) continue;
      const dd = Math.hypot(d.x - s.x, d.z - s.z);
      if (dd < bd) { bd = dd; best = d; }
    }
    tx = best.x; tz = best.z;
  }
  const dx = tx - s.x, dz = tz - s.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
}

function run(w, seconds, inputFn) {
  const events = [];
  for (let i = 0; i < seconds / SIM_STEP; i++) {
    w.update(SIM_STEP, inputFn(w));
    events.push(...w.drainEvents());
  }
  return events;
}

function noRocks(w) { w.rocks.length = 0; }

describe('world simulation', () => {
  it('starts with debris near the player for instant reward', () => {
    const w = new World({ seed: 3 });
    noRocks(w);
    const ev = run(w, 3, () => ({ x: 0, z: 1 }));
    expect(ev.filter((e) => e.type === 'attach').length).toBeGreaterThanOrEqual(5);
  });

  it('full loop: collect, fill hold, return, sell, buy upgrade', () => {
    const w = new World({ seed: 7 });
    noRocks(w);
    const ev = run(w, 90, botInput);
    const sales = ev.filter((e) => e.type === 'saleComplete');
    expect(ev.some((e) => e.type === 'full')).toBe(true);
    expect(sales.length).toBeGreaterThan(0);
    expect(w.progress.stats.totalEarned).toBeGreaterThanOrEqual(w.stats.capacity);
    expect(w.progress.money).toBe(w.progress.stats.totalEarned);

    // Park inside the dock and buy.
    w.ship.x = 0; w.ship.z = 0; w.ship.vx = 0; w.ship.vz = 0;
    run(w, 0.1, () => ({ x: 0, z: 0 }));
    expect(w.docked).toBe(true);
    const before = w.stats.capacity;
    expect(w.buy('capacity')).toBe(true);
    expect(w.stats.capacity).toBeGreaterThan(before);
  });

  it('cannot buy upgrades away from the station', () => {
    const w = new World({ seed: 1 });
    w.progress.money = 1000;
    w.ship.x = 100; w.ship.z = 100;
    run(w, 0.1, () => ({ x: 0, z: 0 }));
    expect(w.docked).toBe(false);
    expect(w.buy('power')).toBe(false);
  });

  it('never carries more than capacity', () => {
    const w = new World({ seed: 11 });
    noRocks(w);
    let max = 0;
    for (let i = 0; i < 60 / SIM_STEP; i++) {
      // Never return home: just keep hoovering.
      const inp = botInput({ ...w, cargoCount: 0, stats: w.stats, ship: w.ship, debris: w.debris });
      w.update(SIM_STEP, inp);
      max = Math.max(max, w.cargoCount);
    }
    expect(max).toBe(w.stats.capacity);
  });

  it('rock hit knocks part of the cargo loose and keeps upgrades', () => {
    const w = new World({ seed: 5 });
    noRocks(w);
    run(w, 40, (ww) => (ww.cargoCount >= ww.stats.capacity ? { x: 0, z: 0 } : botInput(ww)));
    const count = w.cargoCount;
    expect(count).toBeGreaterThan(5);
    w.progress.levels.power = 3;
    w.rocks.push({ x: w.ship.x + 1, z: w.ship.z, px: 0, pz: 0, vx: 0, vz: 0, r: 6.5, rot: 0, spin: 0 });
    const ev = run(w, SIM_STEP, () => ({ x: 0, z: 0 }));
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit).toBeTruthy();
    expect(hit.lost).toBe(Math.max(1, Math.round(count * w.stats.loss)));
    expect(w.cargoCount).toBe(count - hit.lost);
    expect(w.progress.levels.power).toBe(3);
    // Knocked pieces can't be re-grabbed instantly.
    const loose = w.debris.filter((d) => d.state === FREE && d.cooldown > 0);
    expect(loose.length).toBe(hit.lost);
    // A single impact only counts once, even with a big ship and a big rock.
    const ev2 = run(w, 3, () => ({ x: 0, z: 0 }));
    expect(ev2.filter((e) => e.type === 'hit').length).toBe(0);
  });

  it('keeps the debris field topped up', () => {
    const w = new World({ seed: 9 });
    noRocks(w);
    run(w, 60, botInput);
    const free = w.debris.filter((d) => d.state === FREE).length;
    expect(free).toBe(w.freeCount);
    expect(free).toBeGreaterThan(300);
    // Pool reuse: storage should not grow without bound.
    expect(w.debris.length).toBeLessThan(1000);
    expect(w.debris.filter((d) => d.state === ATTACHED).length).toBe(w.cargoCount);
    expect(w.debris.some((d) => d.state === DEAD) || w.debris.length >= 380).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = new World({ seed: 42 });
    const b = new World({ seed: 42 });
    run(a, 20, botInput);
    run(b, 20, botInput);
    expect(a.ship.x).toBe(b.ship.x);
    expect(a.progress.money).toBe(b.progress.money);
  });

  it('rocks stay out of the safe belt', () => {
    const w = new World({ seed: 2 });
    w.ship.x = 9999; // keep the ship away
    let minD = Infinity;
    for (let i = 0; i < 120 / SIM_STEP; i++) {
      w.updateRocks(SIM_STEP);
      for (const r of w.rocks) minD = Math.min(minD, Math.hypot(r.x, r.z));
    }
    expect(minD).toBeGreaterThan(ROCKS.minDist - ROCKS.maxSpeed * SIM_STEP * 2);
  });
});

describe('docking', () => {
  it('magnet is off while docked', () => {
    const w = new World({ seed: 4 });
    w.rocks.length = 0;
    w.progress.levels.range = 12;
    w.stats.range = 40;
    w.ship.x = 0; w.ship.z = 0;
    const ev = run(w, 5, () => ({ x: 0, z: 0 }));
    expect(w.docked).toBe(true);
    expect(ev.filter((e) => e.type === 'attach').length).toBe(0);
  });
});
