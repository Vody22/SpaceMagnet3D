// Headless game simulation. No Three.js here: the renderer reads this state,
// which keeps the rules testable in Node.
import {
  ARENA_RADIUS, STATION, ZONES, ZONE_WEIGHTS, DEBRIS_TYPES, DEBRIS, SHIP, ROCKS,
} from './config.js';
import { mulberry32, range, pickWeighted } from './rng.js';
import { cargoRadius, cargoSlot } from './cargo.js';
import { createProgress, currentStats, buyUpgrade, addSale } from './economy.js';
import { updatePirates, spawnPirate } from './pirates.js';
import { createWells, updateWells, richSpawnPoint } from './wells.js';
import { createObjectiveState, fillObjectives, applyEvent } from './objectives.js';
import { rankFor, sellMultiplier } from './rank.js';
import { WELLS } from './config.js';

export const FREE = 0;
export const ATTACHED = 1;
export const SELLING = 2;
export const DEAD = 3;

const tmp = { x: 0, y: 0, z: 0 };

export function zoneIndex(dist) {
  for (let i = 0; i < ZONES.length; i++) if (dist < ZONES[i].maxDist) return i;
  return ZONES.length - 1;
}

export class World {
  constructor({ seed = 1, progress = createProgress(), objectives = createObjectiveState() } = {}) {
    this.rand = mulberry32(seed);
    this.progress = progress;
    this.objectives = objectives;
    this.pirates = [];
    this.bolts = [];
    this.nextPirateId = 0;
    this.pirateSpawnTimer = 1;
    this.hitThisTrip = false;
    this.shipZone = 0;
    this.rank = rankFor(progress.stats.totalEarned);
    this.wells = createWells(this.rand);
    fillObjectives(this.objectives, this.rand);
    this.time = 0;
    this.events = [];
    this.debris = [];
    this.attached = [];
    this.freeCount = 0;
    this.sellingCount = 0;
    this.rocks = [];
    this.docked = false;
    this.sellAcc = 0;
    this.sale = { total: 0, count: 0 };
    this.wasFull = false;
    this.stats = currentStats(progress);

    this.ship = {
      x: 0, z: 30, vx: 0, vz: 0, px: 0, pz: 30,
      heading: Math.PI, bank: 0, invuln: 0,
      spin: 0, pspin: 0,
      radius: SHIP.coreRadius,
      dashTime: 0, dashCooldown: 0,
    };

    this.spawnInitial();
    this.spawnRocks();
  }

  // ---------- spawning ----------

  allocDebris() {
    for (const d of this.debris) if (d.state === DEAD) return d;
    const d = {
      id: this.debris.length, type: 0, state: DEAD,
      x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vz: 0,
      driftX: 0, driftZ: 0, phase: 0, spinX: 0, spinY: 0,
      scale: 1, cooldown: 0, pulled: false,
      slot: 0, attachT: 1, fromX: 0, fromY: 0, fromZ: 0,
      sellT: 0, sellDur: 0.5,
    };
    this.debris.push(d);
    return d;
  }

  spawnDebris(x, z, type, { grow = true } = {}) {
    const d = this.allocDebris();
    d.type = type;
    d.state = FREE;
    d.x = d.px = x;
    d.z = d.pz = z;
    d.y = d.py = 0;
    const a = this.rand() * Math.PI * 2;
    const s = range(this.rand, 0.1, 0.6);
    d.driftX = Math.cos(a) * s;
    d.driftZ = Math.sin(a) * s;
    d.vx = d.driftX;
    d.vz = d.driftZ;
    d.phase = this.rand() * Math.PI * 2;
    d.spinX = range(this.rand, -1.5, 1.5);
    d.spinY = range(this.rand, -1.5, 1.5);
    d.scale = grow ? 0 : 1;
    d.cooldown = 0;
    d.pulled = false;
    this.freeCount++;
    return d;
  }

  randomSpawnPoint(avoidShip) {
    for (let tries = 0; tries < 20; tries++) {
      if (this.wells.length && this.rand() < WELLS.richSpawnChance) {
        // Rich debris gathers around gravity wells: high reward, high risk.
        const p = richSpawnPoint(this);
        const ok = !avoidShip || Math.hypot(p.x - this.ship.x, p.z - this.ship.z) > DEBRIS.minRespawnDistFromShip + this.stats.range;
        if (ok && Math.hypot(p.x, p.z) < ARENA_RADIUS - 8) return { x: p.x, z: p.z, dist: ARENA_RADIUS };
        continue;
      }
      let dist;
      if (this.rand() < 0.3) dist = range(this.rand, 24, ZONES[0].maxDist);
      else dist = Math.sqrt(range(this.rand, 24 * 24, (ARENA_RADIUS - 8) ** 2));
      const a = this.rand() * Math.PI * 2;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      if (!avoidShip) return { x, z, dist };
      const minD = DEBRIS.minRespawnDistFromShip + this.stats.range;
      if (Math.hypot(x - this.ship.x, z - this.ship.z) > minD) return { x, z, dist };
    }
    return null;
  }

  spawnCluster(avoidShip, maxCount = Infinity) {
    const p = this.randomSpawnPoint(avoidShip);
    if (!p) return 0;
    const weights = ZONE_WEIGHTS[zoneIndex(p.dist)];
    const n = Math.min(maxCount, Math.floor(range(this.rand, DEBRIS.clusterMin, DEBRIS.clusterMax + 1)));
    for (let i = 0; i < n; i++) {
      const type = pickWeighted(this.rand, weights);
      this.spawnDebris(p.x + range(this.rand, -4, 4), p.z + range(this.rand, -4, 4), type, { grow: avoidShip });
    }
    return n;
  }

  spawnInitial() {
    // Onboarding: a trail of scrap right in front of the ship so the first second is rewarding.
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      this.spawnDebris(Math.sin(t * 5) * 5, 38 + t * 30, 0, { grow: false });
    }
    for (let i = 0; i < 3; i++) this.spawnDebris(range(this.rand, -6, 6), 72 + i * 3, 1, { grow: false });
    while (this.freeCount < DEBRIS.freeTarget) this.spawnCluster(false, DEBRIS.freeTarget - this.freeCount);
  }

  spawnRocks() {
    for (let i = 0; i < ROCKS.count; i++) {
      const dist = Math.sqrt(range(this.rand, (ROCKS.minDist + 10) ** 2, (ARENA_RADIUS - 10) ** 2));
      const a = this.rand() * Math.PI * 2;
      const va = this.rand() * Math.PI * 2;
      const sp = range(this.rand, ROCKS.minSpeed, ROCKS.maxSpeed);
      this.rocks.push({
        x: Math.cos(a) * dist, z: Math.sin(a) * dist, px: 0, pz: 0,
        vx: Math.cos(va) * sp, vz: Math.sin(va) * sp,
        r: range(this.rand, ROCKS.minRadius, ROCKS.maxRadius),
        rot: this.rand() * 6, spin: range(this.rand, -0.6, 0.6),
      });
    }
    for (const r of this.rocks) { r.px = r.x; r.pz = r.z; }
  }

  // ---------- player actions ----------

  buy(id) {
    if (!this.docked) return false;
    const ok = buyUpgrade(this.progress, id);
    if (ok) {
      this.stats = currentStats(this.progress);
      this.wasFull = false;
      this.events.push({ type: 'upgrade', id, level: this.progress.levels[id] });
    }
    return ok;
  }

  get cargoCount() {
    return this.attached.length;
  }

  get cargoValue() {
    let v = 0;
    for (const d of this.attached) v += this.pieceValue(d);
    return v;
  }

  // Sale value of one piece, including the pilot rank bonus.
  pieceValue(d) {
    return DEBRIS_TYPES[d.type].value * sellMultiplier(this.rank);
  }

  spawnPirate(kind) {
    return spawnPirate(this, kind);
  }

  removeFree(d) {
    d.state = DEAD;
    d.pulled = false;
    this.freeCount--;
  }

  // World-space position of an attached piece (optionally interpolated).
  attachedWorldPos(d, out, alpha = 1) {
    const s = this.ship;
    const sx = s.px + (s.x - s.px) * alpha;
    const sz = s.pz + (s.z - s.pz) * alpha;
    const spin = s.pspin + (s.spin - s.pspin) * alpha;
    cargoSlot(d.slot, SHIP.slotSpacing, SHIP.coreRadius, tmp);
    const t = Math.min(1, d.attachT);
    const e = 1 - (1 - t) * (1 - t);
    const lx = d.fromX + (tmp.x - d.fromX) * e;
    const ly = d.fromY + (tmp.y - d.fromY) * e;
    const lz = d.fromZ + (tmp.z - d.fromZ) * e;
    const c = Math.cos(spin), sn = Math.sin(spin);
    out.x = sx + lx * c - lz * sn;
    out.y = ly;
    out.z = sz + lx * sn + lz * c;
    return out;
  }

  // ---------- simulation ----------

  update(dt, input) {
    const firstEvent = this.events.length;
    this.time += dt;
    this.updateShip(dt, input);
    updateWells(this, dt);
    this.updateDebris(dt);
    this.updateRocks(dt);
    updatePirates(this, dt);
    this.updateDocking(dt);
    this.respawn();
    this.trackZone();
    this.processObjectives(firstEvent);
  }

  trackZone() {
    const z = zoneIndex(Math.hypot(this.ship.x - STATION.x, this.ship.z - STATION.z));
    if (z !== this.shipZone) {
      this.shipZone = z;
      this.events.push({ type: 'zone', zone: z });
    }
  }

  processObjectives(from) {
    const end = this.events.length;
    for (let i = from; i < end; i++) {
      const done = applyEvent(this.objectives, this.events[i], { rand: this.rand });
      for (const o of done) {
        this.progress.money += o.reward;
        this.progress.stats.totalEarned += o.reward;
        this.events.push({ type: 'objective', objective: o, reward: o.reward });
      }
    }
    this.checkRank();
  }

  checkRank() {
    const r = rankFor(this.progress.stats.totalEarned);
    if (r > this.rank) {
      this.rank = r;
      this.events.push({ type: 'rankUp', rank: r });
    }
  }

  updateShip(dt, input) {
    const s = this.ship;
    const st = this.stats;
    s.px = s.x; s.pz = s.z; s.pspin = s.spin;

    const fill = this.attached.length / st.capacity;
    const maxSpeed = st.speed * (1 - SHIP.fullSlowdown * fill);
    let ix = input ? input.x : 0;
    let iz = input ? input.z : 0;
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }

    s.dashTime = Math.max(0, s.dashTime - dt);
    s.dashCooldown = Math.max(0, s.dashCooldown - dt);
    if (input && input.dash && s.dashCooldown <= 0 && !this.docked) {
      let dx = Math.sin(s.heading), dz = Math.cos(s.heading);
      if (len > 0.01) { const l = Math.hypot(ix, iz); dx = ix / l; dz = iz / l; }
      const dashSpeed = st.speed * SHIP.dashMultiplier;
      s.vx = dx * dashSpeed;
      s.vz = dz * dashSpeed;
      s.heading = Math.atan2(dx, dz);
      s.dashTime = SHIP.dashDuration;
      s.dashCooldown = SHIP.dashCooldown;
      this.events.push({ type: 'dash', x: s.x, z: s.z, dx, dz });
    }

    if (len > 0.01) {
      let accel = maxSpeed * SHIP.accelFactor;
      // Steering against the current velocity brakes harder, so turns feel snappy.
      if (ix * s.vx + iz * s.vz < 0) accel *= 1 + SHIP.brakeBoost;
      s.vx += ix * accel * dt;
      s.vz += iz * accel * dt;
    } else {
      const k = Math.exp(-SHIP.idleDamping * dt);
      s.vx *= k; s.vz *= k;
    }
    const sp = Math.hypot(s.vx, s.vz);
    const cap = len > 0.01 ? maxSpeed * len : maxSpeed;
    if (sp > cap && sp > 0 && s.dashTime <= 0) {
      // Soft clamp so knockbacks still read as a burst.
      const k = Math.max(cap / sp, Math.exp(-4 * dt));
      s.vx *= k; s.vz *= k;
    }
    s.x += s.vx * dt;
    s.z += s.vz * dt;

    // Arena boundary: soft push back toward the center.
    const d = Math.hypot(s.x, s.z);
    if (d > ARENA_RADIUS) {
      const nx = s.x / d, nz = s.z / d;
      s.x = nx * ARENA_RADIUS; s.z = nz * ARENA_RADIUS;
      const vn = s.vx * nx + s.vz * nz;
      if (vn > 0) { s.vx -= vn * nx * 1.5; s.vz -= vn * nz * 1.5; }
    }

    if (sp > 0.5) {
      const target = Math.atan2(s.vx, s.vz);
      let diff = target - s.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      s.heading += diff * Math.min(1, 10 * dt);
      s.bank += (Math.max(-0.6, Math.min(0.6, -diff * 1.5)) - s.bank) * Math.min(1, 8 * dt);
    } else {
      s.bank *= Math.exp(-6 * dt);
    }
    s.spin += dt * (0.25 / (1 + this.attached.length * 0.01));
    s.invuln = Math.max(0, s.invuln - dt);
    s.radius = cargoRadius(this.attached.length, SHIP.slotSpacing, SHIP.coreRadius);
  }

  updateDebris(dt) {
    const s = this.ship;
    const st = this.stats;
    const full = this.attached.length >= st.capacity;
    if (full && !this.wasFull) this.events.push({ type: 'full' });
    this.wasFull = full;
    const reach = st.range + s.radius;
    const grab = s.radius + 0.9;

    for (const d of this.debris) {
      if (d.state === DEAD) continue;
      d.px = d.x; d.py = d.y; d.pz = d.z;

      if (d.state === FREE) {
        d.scale = Math.min(1, d.scale + dt * 2);
        d.cooldown = Math.max(0, d.cooldown - dt);
        const dx = s.x - d.x, dz = s.z - d.z;
        const dist = Math.hypot(dx, dz);
        d.pulled = false;
        // The magnet is off while docked, so the base can't be used to farm debris without risk.
        if (!full && !this.docked && d.cooldown <= 0 && dist < reach) {
          d.pulled = true;
          const nx = dx / dist, nz = dz / dist;
          const falloff = 0.35 + 0.65 * (1 - dist / reach);
          const a = st.power * falloff;
          // Pull plus a slight swirl, which makes the capture spiral in nicely.
          d.vx += (nx * a - nz * a * 0.35) * dt;
          d.vz += (nz * a + nx * a * 0.35) * dt;
          // Keep some of the ship's velocity so pieces don't lag behind at speed.
          d.vx += (s.vx - d.vx) * Math.min(1, 1.5 * dt);
          d.vz += (s.vz - d.vz) * Math.min(1, 1.5 * dt);
          d.y += (0 - d.y) * Math.min(1, 4 * dt);
          if (dist < grab) {
            this.attach(d);
            continue;
          }
        } else {
          const k = Math.min(1, 1.2 * dt);
          d.vx += (d.driftX - d.vx) * k;
          d.vz += (d.driftZ - d.vz) * k;
        }
        d.x += d.vx * dt;
        d.z += d.vz * dt;
        const r = Math.hypot(d.x, d.z);
        if (r > ARENA_RADIUS - 2) {
          d.driftX = -d.driftX; d.driftZ = -d.driftZ;
          d.vx = -d.vx; d.vz = -d.vz;
          d.x *= (ARENA_RADIUS - 2) / r; d.z *= (ARENA_RADIUS - 2) / r;
        }
      } else if (d.state === ATTACHED) {
        d.attachT = Math.min(1, d.attachT + dt / DEBRIS.attachDuration);
        this.attachedWorldPos(d, d);
      } else if (d.state === SELLING) {
        d.sellT += dt / d.sellDur;
        const t = Math.min(1, d.sellT);
        const e = t * t * (3 - 2 * t);
        const tx = STATION.x, tz = STATION.z, ty = STATION.coreHeight;
        d.x = d.fromX + (tx - d.fromX) * e;
        d.z = d.fromZ + (tz - d.fromZ) * e;
        d.y = d.fromY + (ty - d.fromY) * e + Math.sin(t * Math.PI) * 6;
        d.scale = 1 - 0.6 * e;
        if (t >= 1) this.completeSale(d);
      }
    }
  }

  attach(d) {
    const s = this.ship;
    d.state = ATTACHED;
    d.slot = this.attached.length;
    d.attachT = 0;
    d.scale = 1;
    // Store the start offset in cargo-local space so the snap animates from where it was caught.
    const lx = d.x - s.x, lz = d.z - s.z;
    const c = Math.cos(-s.spin), sn = Math.sin(-s.spin);
    d.fromX = lx * c - lz * sn;
    d.fromZ = lx * sn + lz * c;
    d.fromY = d.y;
    this.attached.push(d);
    this.freeCount--;
    this.events.push({ type: 'attach', x: d.x, z: d.z, kind: d.type, count: this.attached.length });
  }

  detachToFree(d, speed) {
    const s = this.ship;
    d.state = FREE;
    d.pulled = false;
    d.cooldown = DEBRIS.knockedCooldown;
    const dx = d.x - s.x, dz = d.z - s.z;
    const len = Math.hypot(dx, dz) || 1;
    const jitter = range(this.rand, -0.6, 0.6);
    const c = Math.cos(jitter), sn = Math.sin(jitter);
    const nx = dx / len, nz = dz / len;
    d.vx = (nx * c - nz * sn) * speed;
    d.vz = (nx * sn + nz * c) * speed;
    d.y = 0;
    this.freeCount++;
  }

  updateRocks(dt) {
    const s = this.ship;
    for (const r of this.rocks) {
      r.px = r.x; r.pz = r.z;
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      r.rot += r.spin * dt;
      const d = Math.hypot(r.x, r.z);
      // Rocks stay out of the safe belt and inside the arena.
      if ((d < ROCKS.minDist && r.x * r.vx + r.z * r.vz < 0) || (d > ARENA_RADIUS - r.r && r.x * r.vx + r.z * r.vz > 0)) {
        const nx = r.x / d, nz = r.z / d;
        const vn = r.vx * nx + r.vz * nz;
        r.vx -= 2 * vn * nx; r.vz -= 2 * vn * nz;
      }

      const dx = s.x - r.x, dz = s.z - r.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const minDist = r.r + s.radius * 0.8;
      if (dist < minDist) {
        // Rocks are solid: push the ship out so one impact can't count twice.
        const nx = dx / dist, nz = dz / dist;
        s.x = r.x + nx * minDist; s.z = r.z + nz * minDist;
        if (s.invuln <= 0) this.hitShip(nx, nz, 1, 'rock');
      }
    }
  }

  hitShip(nx, nz, lossMul = 1, source = 'rock') {
    const s = this.ship;
    s.invuln = SHIP.invulnTime;
    s.vx = nx * SHIP.hitKnockback;
    s.vz = nz * SHIP.hitKnockback;
    const count = this.attached.length;
    const lost = count > 0 ? Math.max(1, Math.round(count * this.stats.loss * lossMul)) : 0;
    let value = 0;
    for (let i = 0; i < lost; i++) {
      const d = this.attached.pop();
      value += this.pieceValue(d);
      this.detachToFree(d, range(this.rand, 8, 18));
    }
    if (count > 0) this.hitThisTrip = true;
    this.events.push({ type: 'hit', x: s.x, z: s.z, lost, value, source });
  }

  updateDocking(dt) {
    const s = this.ship;
    const dist = Math.hypot(s.x - STATION.x, s.z - STATION.z);
    const docked = dist < STATION.dockRadius;
    if (docked !== this.docked) {
      this.docked = docked;
      this.events.push({ type: docked ? 'dock' : 'undock' });
    }
    if (docked && this.attached.length > 0) {
      if (this.sellingCount === 0 && this.sale.count === 0) this.sale.wasFull = this.attached.length >= this.stats.capacity;
      // Sell faster when carrying more so big hauls still unload in about a second.
      const rate = Math.max(14, this.attached.length / 1.1);
      this.sellAcc += rate * dt;
      while (this.sellAcc >= 1 && this.attached.length > 0) {
        this.sellAcc -= 1;
        const d = this.attached.pop();
        d.state = SELLING;
        d.sellT = 0;
        d.sellDur = range(this.rand, DEBRIS.sellDurationMin, DEBRIS.sellDurationMax);
        d.fromX = d.x; d.fromY = d.y; d.fromZ = d.z;
        this.sellingCount++;
      }
    } else {
      this.sellAcc = 0;
    }
  }

  completeSale(d) {
    const value = this.pieceValue(d);
    addSale(this.progress, value);
    this.sale.total += value;
    this.sale.count += 1;
    d.state = DEAD;
    this.sellingCount--;
    this.events.push({ type: 'coin', value, kind: d.type });
    if (this.sellingCount === 0 && this.attached.length === 0) {
      const st = this.progress.stats;
      st.trips += 1;
      const best = this.sale.total > st.bestHaul;
      if (best) st.bestHaul = this.sale.total;
      this.events.push({
        type: 'saleComplete', total: this.sale.total, count: this.sale.count, best,
        wasFull: !!this.sale.wasFull, hitThisTrip: this.hitThisTrip,
      });
      this.sale = { total: 0, count: 0 };
      this.hitThisTrip = false;
    }
  }

  respawn() {
    let budget = DEBRIS.respawnPerStep;
    while (budget > 0 && this.freeCount < DEBRIS.freeTarget) {
      const n = this.spawnCluster(true, Math.min(budget, DEBRIS.freeTarget - this.freeCount));
      if (n === 0) break;
      budget -= n;
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
