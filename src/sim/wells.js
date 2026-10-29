// Gravity wells: drifting anomalies in the outer zones. They drag in the ship and
// debris (so rich debris piles up around them) and their core wrecks your cargo.
import { WELLS } from './config.js';
import { range } from './rng.js';

export function createWells(rand) {
  const wells = [];
  const offset = rand() * Math.PI * 2;
  for (let i = 0; i < WELLS.count; i++) {
    const a = offset + (i / WELLS.count) * Math.PI * 2;
    const r = range(rand, WELLS.minDist, WELLS.maxDist);
    wells.push({ a, r, x: Math.cos(a) * r, z: Math.sin(a) * r, px: 0, pz: 0, dir: rand() < 0.5 ? 1 : -1 });
  }
  for (const w of wells) { w.px = w.x; w.pz = w.z; }
  return wells;
}

export function updateWells(world, dt) {
  const s = world.ship;
  for (const w of world.wells) {
    w.px = w.x; w.pz = w.z;
    w.a += WELLS.orbitSpeed * w.dir * dt;
    w.x = Math.cos(w.a) * w.r;
    w.z = Math.sin(w.a) * w.r;

    const dx = w.x - s.x, dz = w.z - s.z;
    const d = Math.hypot(dx, dz) || 0.001;
    if (d < WELLS.influence) {
      const f = WELLS.shipPull * (1 - d / WELLS.influence);
      // Pull plus swirl: escaping takes a deliberate burn.
      s.vx += ((dx / d) * f - (dz / d) * f * 0.4) * dt;
      s.vz += ((dz / d) * f + (dx / d) * f * 0.4) * dt;
      if (d < WELLS.coreRadius + s.radius * 0.5 && s.invuln <= 0) {
        world.hitShip(-dx / d, -dz / d, 1, 'well');
        s.vx *= 1.4; s.vz *= 1.4;
      }
    }
    for (const db of world.debris) {
      if (db.state !== 0) continue;
      const ex = w.x - db.x, ez = w.z - db.z;
      const e = Math.hypot(ex, ez);
      if (e > WELLS.influence) continue;
      if (e < WELLS.coreRadius * 0.7) { world.removeFree(db); continue; }
      const f = WELLS.debrisPull * (1 - e / WELLS.influence);
      db.vx += ((ex / e) * f - (ez / e) * f * 0.8) * dt;
      db.vz += ((ez / e) * f + (ex / e) * f * 0.8) * dt;
    }
  }
}

export function richSpawnPoint(world) {
  const w = world.wells[Math.floor(world.rand() * world.wells.length)];
  const a = world.rand() * Math.PI * 2;
  const r = range(world.rand, WELLS.coreRadius + 8, WELLS.influence + 6);
  return { x: w.x + Math.cos(a) * r, z: w.z + Math.sin(a) * r };
}

