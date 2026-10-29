import { describe, it, expect } from 'vitest';
import { World, FREE, ATTACHED, DEAD } from '../src/sim/World.js';
import { STOLEN, spawnPirate } from '../src/sim/pirates.js';
import { SIM_STEP, PIRATES, WELLS, ZONES, RANKS } from '../src/sim/config.js';
import { serialize, deserialize } from '../src/sim/save.js';
import { createProgress } from '../src/sim/economy.js';
import { createObjectiveState, fillObjectives, applyEvent, objectiveText } from '../src/sim/objectives.js';
import { rankFor, sellMultiplier, rankTitle } from '../src/sim/rank.js';
import { mulberry32 } from '../src/sim/rng.js';

function steps(w, seconds, input = () => ({ x: 0, z: 0 })) {
  const ev = [];
  for (let i = 0; i < Math.round(seconds / SIM_STEP); i++) { w.update(SIM_STEP, input(w)); ev.push(...w.drainEvents()); }
  return ev;
}

// A world with the ship parked in the scrap field carrying `n` pieces, and no random hazards.
function loadedWorld(n = 30, { seed = 1, trips = 1 } = {}) {
  const w = new World({ seed });
  w.rocks.length = 0;
  w.wells.length = 0;
  w.progress.stats.trips = trips;
  w.progress.levels.capacity = 6;
  w.stats.capacity = 200;
  w.ship.x = w.ship.px = 0; w.ship.z = w.ship.pz = 95;
  let k = 0;
  for (const d of w.debris) {
    if (d.state !== FREE || k >= n) continue;
    d.x = w.ship.x; d.z = w.ship.z;
    w.attach(d);
    k++;
  }
  // Keep other debris out of the magnet so cargo counts stay exact.
  for (const d of w.debris) if (d.state === FREE) { d.x = -200; d.z = -100; d.driftX = d.driftZ = 0; d.vx = d.vz = 0; }
  w.drainEvents();
  return w;
}

describe('raider pirates', () => {
  it('do not appear before the first sale', () => {
    const w = loadedWorld(30, { trips: 0 });
    steps(w, 5);
    expect(w.pirates.length).toBe(0);
  });

  it('steal cargo on contact, then the magnet can rip it back', () => {
    const w = loadedWorld(30);
    w.stats.range = 12;
    const p = spawnPirate(w, 'raider');
    p.x = w.ship.x + 20; p.z = w.ship.z + 5;
    let ev = steps(w, 4, () => ({ x: 0, z: 0 }));
    // Idle pilots don't get their loot back.
    expect(ev.some((e) => e.type === 'reclaim')).toBe(false);
    const steal = ev.find((e) => e.type === 'steal');
    expect(steal).toBeTruthy();
    const expected = PIRATES.raider.stealBase + Math.round(30 * PIRATES.raider.stealFraction);
    expect(steal.count).toBe(expected);
    expect(w.cargoCount).toBe(30 - expected);
    expect(w.debris.filter((d) => d.state === STOLEN).length).toBe(expected);
    expect(p.state).toBe('flee');

    // Chase it: fly at it until the loot comes loose.
    ev = steps(w, 8, (ww) => {
      const dx = p.x - ww.ship.x, dz = p.z - ww.ship.z, l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l };
    });
    expect(ev.some((e) => e.type === 'reclaim')).toBe(true);
    expect(w.debris.filter((d) => d.state === STOLEN).length).toBe(0);
    expect(w.cargoCount).toBeGreaterThan(30 - expected);
  });

  it('get away with the loot if you do not chase', () => {
    const w = loadedWorld(20);
    const p = spawnPirate(w, 'raider');
    p.x = w.ship.x + 10; p.z = w.ship.z;
    // Sit still until robbed, then fly the other way.
    const ev = steps(w, PIRATES.raider.escapeTime + 6, (ww) => (ww.time < 2 ? { x: 0, z: 0 } : { x: -1, z: 0 }));
    const steal = ev.find((e) => e.type === 'steal' && e.id === p.id);
    const escaped = ev.find((e) => e.type === 'escaped' && e.id === p.id);
    expect(steal).toBeTruthy();
    expect(escaped && escaped.count).toBe(steal.count);
    expect(w.pirates.includes(p)).toBe(false);
  });

  it('never chase an empty ship or enter the safe belt', () => {
    const w = loadedWorld(0);
    const p = spawnPirate(w, 'raider');
    p.x = w.ship.x + 15; p.z = w.ship.z;
    let minD = Infinity;
    steps(w, 10, (ww) => { for (const q of ww.pirates) minD = Math.min(minD, Math.hypot(q.x, q.z)); return { x: 0, z: 0 }; });
    expect(p.state).not.toBe('chase');
    expect(minD).toBeGreaterThanOrEqual(ZONES[0].maxDist);
  });
});

describe('gunner pirates', () => {
  it('telegraph, fire and knock cargo loose with bolts', () => {
    const w = loadedWorld(40);
    w.ship.x = 0; w.ship.z = 140; w.ship.px = 0; w.ship.pz = 140;
    const g = spawnPirate(w, 'gunner');
    g.x = 0; g.z = 165;
    const ev = steps(w, 8);
    expect(ev.some((e) => e.type === 'pirateAlert')).toBe(true);
    expect(ev.some((e) => e.type === 'fire')).toBe(true);
    const hit = ev.find((e) => e.type === 'hit' && e.source === 'bolt');
    expect(hit).toBeTruthy();
    expect(hit.lost).toBe(Math.max(1, Math.round(40 * w.stats.loss * PIRATES.gunner.lossFactor)));
  });
});

describe('gravity wells', () => {
  it('pull the ship in and the core costs cargo', () => {
    const w = loadedWorld(20);
    w.wells.push({ a: 0, r: 0, x: 0, z: 0, px: 0, pz: 0, dir: 0 });
    const well = w.wells[0];
    well.r = Math.hypot(w.ship.x, w.ship.z); well.a = Math.atan2(w.ship.z, w.ship.x);
    // Put the ship just inside the influence radius.
    w.ship.x = well.r * Math.cos(well.a) + WELLS.influence * 0.6; w.ship.z = well.r * Math.sin(well.a);
    const ev = steps(w, 6);
    expect(ev.some((e) => e.type === 'hit' && e.source === 'well')).toBe(true);
    expect(w.cargoCount).toBeLessThan(20);
  });

  it('swallow free debris that falls into the core', () => {
    const w = new World({ seed: 3 });
    const well = w.wells[0];
    const d = w.debris.find((x) => x.state === FREE);
    d.x = well.x + 0.5; d.z = well.z;
    const before = w.freeCount;
    w.update(SIM_STEP, { x: 0, z: 0 });
    expect(d.state === DEAD || d.state === FREE).toBe(true);
    expect(w.freeCount).toBeGreaterThanOrEqual(before - 1);
    expect(w.debris.filter((x) => x.state === FREE).length).toBe(w.freeCount);
  });
});

describe('objectives', () => {
  it('fills three distinct objectives with readable text', () => {
    const st = createObjectiveState();
    fillObjectives(st, mulberry32(1));
    expect(st.active.length).toBe(3);
    expect(new Set(st.active.map((o) => o.type)).size).toBe(3);
    for (const o of st.active) expect(objectiveText(o)).toMatch(/\w/);
  });

  it('completing one pays out and refills', () => {
    const w = loadedWorld(0);
    const obj = { type: 'haul', target: 10, reward: 7, progress: 0 };
    w.objectives.active[0] = obj;
    const money = w.progress.money;
    w.events.push({ type: 'saleComplete', total: 12, count: 5 });
    w.processObjectives(0);
    const ev = w.drainEvents();
    expect(ev.some((e) => e.type === 'objective' && e.objective === obj)).toBe(true);
    expect(w.progress.money).toBe(money + 7);
    expect(w.objectives.active.length).toBe(3);
    expect(w.objectives.active.includes(obj)).toBe(false);
  });

  it('collect objective counts matching pickups only', () => {
    const st = createObjectiveState();
    st.active = [{ type: 'collect', kind: 1, target: 2, reward: 5, progress: 0 }];
    const rand = mulberry32(2);
    applyEvent(st, { type: 'attach', kind: 0 }, { rand });
    expect(st.active[0].progress).toBe(0);
    applyEvent(st, { type: 'attach', kind: 1 }, { rand });
    const done = applyEvent(st, { type: 'attach', kind: 1 }, { rand });
    expect(done.length).toBe(1);
  });

  it('clean trip objective fails if you got hit on the way', () => {
    const st = createObjectiveState();
    st.active = [{ type: 'cleanTrip', target: 10, reward: 5, progress: 0 }];
    const rand = mulberry32(2);
    expect(applyEvent(st, { type: 'saleComplete', total: 50, hitThisTrip: true }, { rand }).length).toBe(0);
    expect(applyEvent(st, { type: 'saleComplete', total: 50, hitThisTrip: false }, { rand }).length).toBe(1);
  });
});

describe('ranks', () => {
  it('rank rises with total earnings and boosts sale value', () => {
    expect(rankFor(0)).toBe(0);
    expect(rankFor(RANKS.threshold(1))).toBe(1);
    expect(rankFor(RANKS.threshold(5) - 1)).toBe(4);
    expect(sellMultiplier(3)).toBeCloseTo(1 + 3 * RANKS.sellBonusPerRank);
    expect(rankTitle(0)).toBe('Rookie');
    expect(rankTitle(20)).toMatch(/Magnate/);
  });

  it('world emits rankUp and prices pieces with the bonus', () => {
    const w = loadedWorld(0);
    w.progress.stats.totalEarned = RANKS.threshold(2);
    w.processObjectives(w.events.length);
    expect(w.drainEvents().some((e) => e.type === 'rankUp' && e.rank === 2)).toBe(true);
    const d = w.debris.find((x) => x.state === FREE);
    expect(w.pieceValue(d)).toBeCloseTo([1, 3, 8, 25][d.type] * sellMultiplier(2));
  });
});

describe('save', () => {
  it('round-trips progress and objectives', () => {
    const p = createProgress();
    p.money = 123.5; p.levels.range = 4; p.stats.bestHaul = 99; p.stats.trips = 7;
    const o = createObjectiveState();
    fillObjectives(o, mulberry32(5));
    o.completed = 4; o.tier = 2;
    const back = deserialize(serialize(p, o));
    expect(back.ok).toBe(true);
    expect(back.progress).toEqual(p);
    expect(back.objectives.active).toEqual(o.active);
    expect(back.objectives.tier).toBe(2);
  });

  it('survives corrupt or hostile data', () => {
    for (const bad of ['', 'nope', '{}', 'null', '{"v":1,"progress":{"money":-5,"levels":{"range":999,"power":"x"}},"objectives":{"active":[{"type":"hack","target":1},{"type":"collect","kind":99,"target":3}]}}']) {
      const r = deserialize(bad);
      expect(r.progress.money).toBeGreaterThanOrEqual(0);
      expect(r.progress.levels.range).toBeLessThanOrEqual(12);
      expect(Number.isFinite(r.progress.levels.power)).toBe(true);
      expect(r.objectives.active.length).toBe(0);
    }
  });

  it('a loaded save keeps upgrades in a new world', () => {
    const p = createProgress();
    p.levels.capacity = 3;
    const { progress, objectives } = deserialize(serialize(p, createObjectiveState()));
    const w = new World({ seed: 1, progress, objectives });
    expect(w.stats.capacity).toBe(Math.round(15 * 1.35 ** 3));
    expect(w.objectives.active.length).toBe(3);
  });
});
