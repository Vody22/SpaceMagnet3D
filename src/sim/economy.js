import { UPGRADES } from './config.js';

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function createProgress() {
  const levels = {};
  for (const u of UPGRADES) levels[u.id] = 0;
  return {
    money: 0,
    levels,
    stats: { totalEarned: 0, trips: 0, bestHaul: 0, piecesSold: 0 },
  };
}

export function upgradeCost(id, level) {
  const u = UPGRADE_BY_ID[id];
  return Math.round(u.baseCost * Math.pow(u.growth, level));
}

export function upgradeValue(id, level) {
  return UPGRADE_BY_ID[id].value(level);
}

export function isMaxed(progress, id) {
  return progress.levels[id] >= UPGRADE_BY_ID[id].maxLevel;
}

export function canBuy(progress, id) {
  if (!UPGRADE_BY_ID[id] || isMaxed(progress, id)) return false;
  return progress.money >= upgradeCost(id, progress.levels[id]);
}

export function buyUpgrade(progress, id) {
  if (!canBuy(progress, id)) return false;
  progress.money -= upgradeCost(id, progress.levels[id]);
  progress.levels[id] += 1;
  return true;
}

export function currentStats(progress) {
  const l = progress.levels;
  return {
    power: upgradeValue('power', l.power),
    range: upgradeValue('range', l.range),
    capacity: upgradeValue('capacity', l.capacity),
    speed: upgradeValue('speed', l.speed),
    loss: upgradeValue('hull', l.hull),
  };
}

export function addSale(progress, value) {
  progress.money += value;
  progress.stats.totalEarned += value;
  progress.stats.piecesSold += 1;
}
