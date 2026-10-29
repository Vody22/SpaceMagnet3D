// Pirate AI. Raiders steal cargo on contact and run; keep them inside your magnet
// range long enough and the loot rips free. Gunners keep their distance and shoot.
import { ARENA_RADIUS, ZONES, PIRATES, STATION } from './config.js';
import { range } from './rng.js';
import { cargoSlot } from './cargo.js';

export const STOLEN = 4;
const SAFE = ZONES[0].maxDist;
const tmp = { x: 0, y: 0, z: 0 };

function steer(p, tx, tz, speed, dt, agility = 3) {
  const dx = tx - p.x, dz = tz - p.z;
  const l = Math.hypot(dx, dz) || 1;
  const k = Math.min(1, agility * dt);
  p.vx += ((dx / l) * speed - p.vx) * k;
  p.vz += ((dz / l) * speed - p.vz) * k;
}

function keepOutOfSafeBelt(p) {
  const d = Math.hypot(p.x - STATION.x, p.z - STATION.z);
  if (d < SAFE + 4) {
    const nx = p.x / d, nz = p.z / d;
    p.x = nx * (SAFE + 4); p.z = nz * (SAFE + 4);
    const vn = p.vx * nx + p.vz * nz;
    if (vn < 0) { p.vx -= vn * nx; p.vz -= vn * nz; }
  }
  if (d > ARENA_RADIUS - 3) {
    const nx = p.x / d, nz = p.z / d;
    p.x = nx * (ARENA_RADIUS - 3); p.z = nz * (ARENA_RADIUS - 3);
    const vn = p.vx * nx + p.vz * nz;
    if (vn > 0) { p.vx -= vn * nx; p.vz -= vn * nz; }
  }
}

function newWaypoint(w, p) {
  const zi = Math.max(1, p.zone);
  const lo = Math.max(SAFE + 10, ZONES[zi - 1].maxDist), hi = ZONES[zi].maxDist;
  const a = Math.atan2(p.z, p.x) + range(w.rand, -0.6, 0.6);
  const r = range(w.rand, lo, hi);
  p.wx = Math.cos(a) * r; p.wz = Math.sin(a) * r;
}

export function spawnPirate(w, kind) {
  const s = w.ship;
  for (let tries = 0; tries < 20; tries++) {
    const a = w.rand() * Math.PI * 2;
    const r = PIRATES.spawnMinDistFromShip + w.rand() * 30;
    const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
    const d = Math.hypot(x, z);
    if (d < SAFE + 15 || d > ARENA_RADIUS - 10) continue;
    let zone = 0;
    while (zone < ZONES.length - 1 && d >= ZONES[zone].maxDist) zone++;
    const p = {
      kind, x, z, px: x, pz: z, vx: 0, vz: 0, heading: 0,
      state: 'patrol', zone, wx: 0, wz: 0, loot: [], reclaim: 0, timer: 0,
      fireTimer: PIRATES.gunner.fireInterval, charging: false, stealCooldown: 0, strafe: w.rand() < 0.5 ? 1 : -1,
      alerted: false, id: w.nextPirateId++,
    };
    newWaypoint(w, p);
    w.pirates.push(p);
    return p;
  }
  return null;
}

function shipIsTarget(w) {
  const s = w.ship;
  return !w.docked && w.attached.length > 0 && Math.hypot(s.x - STATION.x, s.z - STATION.z) > SAFE;
}

export function updatePirates(w, dt) {
  const s = w.ship;
  const st = w.stats;
  w.pirateSpawnTimer -= dt;
  if (w.pirateSpawnTimer <= 0) {
    w.pirateSpawnTimer = 1;
    managePopulation(w);
  }

  for (const p of w.pirates) {
    p.px = p.x; p.pz = p.z;
    const cfg = PIRATES[p.kind];
    const dx = s.x - p.x, dz = s.z - p.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const target = shipIsTarget(w);
    p.stealCooldown = Math.max(0, p.stealCooldown - dt);

    if (p.state === 'patrol') {
      steer(p, p.wx, p.wz, cfg.patrolSpeed, dt, 1);
      if (Math.hypot(p.wx - p.x, p.wz - p.z) < 6) newWaypoint(w, p);
      if (target && dist < cfg.aggroRange && p.stealCooldown <= 0) {
        p.state = 'chase';
        w.events.push({ type: 'pirateAlert', kind: p.kind, x: p.x, z: p.z });
      }
    } else if (p.state === 'chase') {
      if (!target || dist > cfg.giveUpRange) {
        p.state = 'patrol';
        newWaypoint(w, p);
      } else if (p.kind === 'raider') {
        // Lead the target a little.
        steer(p, s.x + s.vx * 0.4, s.z + s.vz * 0.4, cfg.chaseSpeed, dt, 3);
        if (dist < cfg.radius + s.radius * 0.85 && s.invuln <= 0) steal(w, p, dx / dist, dz / dist);
      } else {
        // Gunner: hold a ring around the ship and strafe.
        const nx = dx / dist, nz = dz / dist;
        const radial = (dist - cfg.preferredDist - s.radius) * 0.8;
        const tvx = nx * radial - nz * p.strafe * 6;
        const tvz = nz * radial + nx * p.strafe * 6;
        const l = Math.hypot(tvx, tvz) || 1;
        const sp = Math.min(cfg.speed, l);
        const k = Math.min(1, 2.5 * dt);
        p.vx += ((tvx / l) * sp - p.vx) * k;
        p.vz += ((tvz / l) * sp - p.vz) * k;
        p.fireTimer -= dt;
        p.charging = p.fireTimer < cfg.telegraph;
        if (p.fireTimer <= 0) {
          fire(w, p);
          p.fireTimer = cfg.fireInterval * range(w.rand, 0.85, 1.15);
          p.charging = false;
        }
      }
    } else if (p.state === 'flee') {
      p.timer += dt;
      const away = dist > 0.01 ? { x: -dx / dist, z: -dz / dist } : { x: 1, z: 0 };
      const dashing = p.timer < cfg.dashTime;
      steer(p, p.x + away.x * 10, p.z + away.z * 10, dashing ? cfg.dashSpeed : cfg.fleeSpeed, dt, dashing ? 6 : 2.5);
      const reach = st.range + s.radius;
      if (!dashing && dist < reach && !w.docked) p.reclaim += dt;
      else p.reclaim = Math.max(0, p.reclaim - dt * 0.5);
      if (p.reclaim >= cfg.reclaimTime) dropLoot(w, p);
      else if (p.timer > cfg.escapeTime) loseLoot(w, p);
    } else if (p.state === 'retreat') {
      p.timer += dt;
      steer(p, p.x - dx, p.z - dz, cfg.patrolSpeed * 1.5, dt, 2);
      if (p.timer > 4) { p.state = 'patrol'; newWaypoint(w, p); }
    }

    p.x += p.vx * dt;
    p.z += p.vz * dt;
    keepOutOfSafeBelt(p);
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.5) p.heading = Math.atan2(p.vx, p.vz);

    // Loot rides along in a little blob around the raider.
    const c = Math.cos(w.time * 2), sn = Math.sin(w.time * 2);
    for (let i = 0; i < p.loot.length; i++) {
      const d = p.loot[i];
      d.px = d.x; d.py = d.y; d.pz = d.z;
      cargoSlot(i, 0.8, cfg.radius, tmp);
      d.x = p.x + tmp.x * c - tmp.z * sn;
      d.z = p.z + tmp.x * sn + tmp.z * c;
      d.y = tmp.y;
    }
  }
  w.pirates = w.pirates.filter((p) => !p.removed);
  updateBolts(w, dt);
}

function managePopulation(w) {
  const s = w.ship;
  // Far-away idle pirates despawn so the danger stays near the player.
  for (const p of w.pirates) {
    if (p.state === 'patrol' && p.loot.length === 0 && Math.hypot(p.x - s.x, p.z - s.z) > PIRATES.despawnDist) p.removed = true;
  }
  w.pirates = w.pirates.filter((p) => !p.removed);
  if (w.progress.stats.trips < PIRATES.unlockAfterTrips) return;
  const zi = w.shipZone;
  for (const kind of ['raider', 'gunner']) {
    const n = w.pirates.filter((p) => p.kind === kind).length;
    if (n < PIRATES[kind].max[zi]) spawnPirate(w, kind);
  }
}

function steal(w, p, nx, nz) {
  const cfg = PIRATES.raider;
  const n = Math.min(w.attached.length, cfg.stealBase + Math.round(w.attached.length * cfg.stealFraction));
  let value = 0;
  for (let i = 0; i < n; i++) {
    const d = w.attached.pop();
    d.state = STOLEN;
    d.pulled = false;
    value += w.pieceValue(d);
    p.loot.push(d);
  }
  w.ship.invuln = 0.8;
  w.ship.vx += nx * 8; w.ship.vz += nz * 8;
  w.hitThisTrip = true;
  p.state = 'flee';
  p.timer = 0;
  p.reclaim = 0;
  w.events.push({ type: 'steal', x: p.x, z: p.z, count: n, value, id: p.id });
}

function dropLoot(w, p) {
  const s = w.ship;
  for (const d of p.loot) {
    d.state = 0; // FREE
    d.cooldown = 0.25;
    d.pulled = false;
    const dx = s.x - d.x, dz = s.z - d.z, l = Math.hypot(dx, dz) || 1;
    d.vx = (dx / l) * 10; d.vz = (dz / l) * 10;
    d.driftX = d.vx * 0.05; d.driftZ = d.vz * 0.05;
    w.freeCount++;
  }
  w.events.push({ type: 'reclaim', x: p.x, z: p.z, count: p.loot.length, id: p.id });
  p.loot = [];
  p.state = 'retreat';
  p.timer = 0;
  p.stealCooldown = 10;
}

function loseLoot(w, p) {
  for (const d of p.loot) d.state = 3; // DEAD
  w.events.push({ type: 'escaped', x: p.x, z: p.z, count: p.loot.length, id: p.id });
  p.loot = [];
  p.removed = true;
}

function fire(w, p) {
  const cfg = PIRATES.gunner;
  const s = w.ship;
  const dist = Math.hypot(s.x - p.x, s.z - p.z);
  const t = dist / cfg.boltSpeed;
  const tx = s.x + s.vx * t * 0.8, tz = s.z + s.vz * t * 0.8;
  const dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz) || 1;
  w.bolts.push({ x: p.x, z: p.z, px: p.x, pz: p.z, vx: (dx / l) * cfg.boltSpeed, vz: (dz / l) * cfg.boltSpeed, life: cfg.boltLife });
  w.events.push({ type: 'fire', x: p.x, z: p.z });
}

function updateBolts(w, dt) {
  const s = w.ship;
  const cfg = PIRATES.gunner;
  for (const b of w.bolts) {
    b.px = b.x; b.pz = b.z;
    b.x += b.vx * dt; b.z += b.vz * dt;
    b.life -= dt;
    if (Math.hypot(b.x - STATION.x, b.z - STATION.z) < SAFE) b.life = 0;
    const dx = s.x - b.x, dz = s.z - b.z, d = Math.hypot(dx, dz);
    if (b.life > 0 && s.invuln <= 0 && d < s.radius * 0.85 + cfg.boltRadius) {
      b.life = 0;
      const l = Math.hypot(b.vx, b.vz) || 1;
      w.hitShip(b.vx / l, b.vz / l, cfg.lossFactor, 'bolt');
    }
  }
  w.bolts = w.bolts.filter((b) => b.life > 0);
}
