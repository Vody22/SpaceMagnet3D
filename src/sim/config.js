// Gameplay tuning. Everything balance-related lives here so it can be tweaked in one place.

export const SIM_STEP = 1 / 60;

export const ARENA_RADIUS = 260;

export const STATION = {
  x: 0,
  z: 0,
  dockRadius: 16, // fly inside this circle to dock (sell + shop)
  coreHeight: 4,
};

// Distance bands from the station. Farther = richer debris but more hazards.
export const ZONES = [
  { name: 'Safe Belt', maxDist: 60, color: 0x3fd0ff },
  { name: 'Scrap Field', maxDist: 120, color: 0x7dff9a },
  { name: 'Crystal Drift', maxDist: 185, color: 0xffc94a },
  { name: 'Deep Wreck', maxDist: ARENA_RADIUS, color: 0xff4fd8 },
];

export const DEBRIS_TYPES = [
  { id: 'scrap', name: 'Scrap', value: 1, size: 0.85, color: 0x7f8ea3, emissive: 0x0d1622 },
  { id: 'crystal', name: 'Crystal', value: 3, size: 0.95, color: 0x47e6ff, emissive: 0x0a6a88 },
  { id: 'core', name: 'Power Core', value: 8, size: 1.0, color: 0xffc23d, emissive: 0x8a4a00 },
  { id: 'relic', name: 'Relic', value: 25, size: 1.15, color: 0xff52e0, emissive: 0x88106f },
];

// Spawn weights per zone, indexed like DEBRIS_TYPES.
export const ZONE_WEIGHTS = [
  [1, 0.12, 0, 0],
  [1, 0.6, 0.12, 0],
  [0.6, 0.8, 0.45, 0.05],
  [0.35, 0.7, 0.7, 0.25],
];

export const DEBRIS = {
  freeTarget: 380, // how many free pieces float in the arena
  respawnPerStep: 2,
  minRespawnDistFromShip: 50,
  clusterMin: 3,
  clusterMax: 7,
  attachDuration: 0.18,
  sellDurationMin: 0.45,
  sellDurationMax: 0.75,
  knockedCooldown: 1.4,
};

export const SHIP = {
  coreRadius: 1.4,
  slotSpacing: 1.0,
  accelFactor: 3.2,
  idleDamping: 2.2,
  fullSlowdown: 0.35, // max speed lost when cargo is full (risk vs reward)
  hitKnockback: 20,
  brakeBoost: 1.5, // extra acceleration when steering against current velocity
  dashMultiplier: 2.4, // dash speed = engine top speed * this
  dashDuration: 0.28,
  dashCooldown: 2.2,
  invulnTime: 1.2,
};

export const ROCKS = {
  count: 16,
  minDist: 70,
  minRadius: 2.5,
  maxRadius: 6.5,
  minSpeed: 2,
  maxSpeed: 7,
};

// Permanent upgrades. value(level) returns the stat at that level.
export const UPGRADES = [
  {
    id: 'power', name: 'Magnet Power', desc: 'Pull strength',
    baseCost: 12, growth: 1.55, maxLevel: 12,
    value: (l) => 22 + l * 9,
    format: (v) => `${v.toFixed(0)} N`,
  },
  {
    id: 'range', name: 'Magnet Range', desc: 'Pull radius',
    baseCost: 10, growth: 1.5, maxLevel: 12,
    value: (l) => 7 + l * 2.2,
    format: (v) => `${v.toFixed(1)} m`,
  },
  {
    id: 'capacity', name: 'Cargo Hold', desc: 'Max pieces carried',
    baseCost: 15, growth: 1.6, maxLevel: 15,
    value: (l) => Math.round(15 * Math.pow(1.35, l)),
    format: (v) => `${v}`,
  },
  {
    id: 'speed', name: 'Engines', desc: 'Top speed',
    baseCost: 14, growth: 1.55, maxLevel: 10,
    value: (l) => 16 + l * 2.4,
    format: (v) => `${v.toFixed(1)} m/s`,
  },
  {
    id: 'hull', name: 'Hull Armor', desc: 'Cargo lost per hit',
    baseCost: 20, growth: 1.6, maxLevel: 10,
    value: (l) => Math.max(0.08, 0.4 * Math.pow(0.82, l)),
    format: (v) => `${Math.round(v * 100)}%`,
  },
];

// ---------- Stage 2: enemies, hazards, progression ----------

export const PIRATES = {
  // Pirates only show up after the first sale so the opening stays calm.
  unlockAfterTrips: 1,
  spawnMinDistFromShip: 75,
  despawnDist: 160,
  raider: {
    max: [0, 2, 3, 3], // per zone the ship is in
    radius: 1.4,
    patrolSpeed: 6,
    chaseSpeed: 15.5,
    fleeSpeed: 10,
    dashSpeed: 18, // burst right after a steal, before the magnet can bite
    dashTime: 1.0,
    aggroRange: 48,
    giveUpRange: 90,
    stealBase: 3,
    stealFraction: 0.12,
    reclaimTime: 1.1, // seconds inside your magnet range to rip the loot back
    escapeTime: 16, // seconds of fleeing before the loot is gone for good
  },
  gunner: {
    max: [0, 0, 2, 3],
    radius: 1.7,
    patrolSpeed: 5,
    speed: 13,
    aggroRange: 55,
    giveUpRange: 95,
    preferredDist: 26,
    fireInterval: 2.4,
    telegraph: 0.5,
    boltSpeed: 34,
    boltLife: 2.4,
    boltRadius: 0.7,
    lossFactor: 0.6, // bolts knock off less than rocks
  },
};

export const WELLS = {
  count: 3,
  minDist: 140,
  maxDist: 230,
  influence: 34,
  coreRadius: 4,
  shipPull: 26,
  debrisPull: 14,
  orbitSpeed: 0.02,
  richSpawnChance: 0.2, // share of respawned clusters placed around a well
};

export const RANKS = {
  titles: ['Rookie', 'Scavenger', 'Salvager', 'Hauler', 'Magneteer', 'Void Trader', 'Star Baron', 'Debris Tycoon', 'Galactic Magnate'],
  sellBonusPerRank: 0.04,
  threshold: (n) => Math.round(50 * Math.pow(n, 2.3)), // total credits earned to reach rank n
};

export const OBJECTIVES = {
  active: 3,
};

export const SAVE_KEY = 'space-magnet-3d/save/v1';
