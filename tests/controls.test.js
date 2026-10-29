import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/World.js';
import { SIM_STEP, SHIP } from '../src/sim/config.js';

function openSpace(seed = 1) {
  const w = new World({ seed });
  w.rocks.length = 0; w.wells.length = 0; w.pirates.length = 0; w.pirateSpawnTimer = 1e9;
  w.ship.x = w.ship.px = 0; w.ship.z = w.ship.pz = 90;
  for (const d of w.debris) { d.x = -200; d.z = -150; d.driftX = d.driftZ = d.vx = d.vz = 0; }
  return w;
}

describe('dash', () => {
  it('bursts well past normal top speed in the input direction', () => {
    const w = openSpace();
    w.update(SIM_STEP, { x: 1, z: 0, dash: true });
    const ev = w.drainEvents();
    expect(ev.some((e) => e.type === 'dash')).toBe(true);
    expect(w.ship.vx).toBeGreaterThan(w.stats.speed * 1.8);
    expect(Math.abs(w.ship.vz)).toBeLessThan(1);
  });

  it('uses the facing direction when there is no input', () => {
    const w = openSpace();
    w.ship.heading = Math.PI; // facing -z
    w.update(SIM_STEP, { x: 0, z: 0, dash: true });
    expect(w.ship.vz).toBeLessThan(-w.stats.speed * 1.8);
  });

  it('has a cooldown', () => {
    const w = openSpace();
    w.update(SIM_STEP, { x: 1, z: 0, dash: true });
    w.drainEvents();
    let dashes = 0;
    for (let i = 0; i < Math.round((SHIP.dashCooldown - 0.1) / SIM_STEP); i++) {
      w.update(SIM_STEP, { x: 1, z: 0, dash: true });
      dashes += w.drainEvents().filter((e) => e.type === 'dash').length;
    }
    expect(dashes).toBe(0);
    for (let i = 0; i < Math.round(0.3 / SIM_STEP); i++) {
      w.update(SIM_STEP, { x: 1, z: 0, dash: true });
      dashes += w.drainEvents().filter((e) => e.type === 'dash').length;
    }
    expect(dashes).toBe(1);
  });

  it('settles back to normal top speed after the burst', () => {
    const w = openSpace();
    w.update(SIM_STEP, { x: 1, z: 0, dash: true });
    for (let i = 0; i < 90; i++) w.update(SIM_STEP, { x: 1, z: 0 });
    expect(Math.hypot(w.ship.vx, w.ship.vz)).toBeLessThanOrEqual(w.stats.speed + 0.01);
  });

  it('is disabled while docked', () => {
    const w = openSpace();
    w.ship.x = 0; w.ship.z = 0;
    w.update(SIM_STEP, { x: 0, z: 0 });
    w.update(SIM_STEP, { x: 1, z: 0, dash: true });
    expect(w.drainEvents().some((e) => e.type === 'dash')).toBe(false);
  });
});

describe('turning feel', () => {
  it('reverses direction quickly (active braking)', () => {
    const w = openSpace();
    w.ship.vx = w.stats.speed;
    let t = 0;
    while (w.ship.vx > 0 && t < 2) { w.update(SIM_STEP, { x: -1, z: 0 }); t += SIM_STEP; }
    expect(t).toBeLessThan(0.2);
  });
});
