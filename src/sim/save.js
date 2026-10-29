// Versioned save data with defensive loading: a corrupt or partial save never crashes the game.
import { SAVE_KEY, UPGRADES } from './config.js';
import { createProgress } from './economy.js';
import { createObjectiveState, OBJECTIVE_TYPES } from './objectives.js';
import { DEBRIS_TYPES, ZONES } from './config.js';

const VERSION = 1;

export function serialize(progress, objectives) {
  return JSON.stringify({ v: VERSION, t: Date.now(), progress, objectives });
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);

export function deserialize(json) {
  const progress = createProgress();
  const objectives = createObjectiveState();
  let data;
  try { data = JSON.parse(json); } catch { return { progress, objectives, ok: false }; }
  if (!data || data.v !== VERSION || typeof data.progress !== 'object' || !data.progress) return { progress, objectives, ok: false };

  const p = data.progress;
  progress.money = num(p.money);
  for (const u of UPGRADES) progress.levels[u.id] = Math.min(u.maxLevel, Math.floor(num(p.levels && p.levels[u.id])));
  for (const k of Object.keys(progress.stats)) progress.stats[k] = num(p.stats && p.stats[k]);

  const o = data.objectives;
  if (o && typeof o === 'object') {
    objectives.tier = Math.floor(num(o.tier));
    objectives.completed = Math.floor(num(o.completed));
    if (Array.isArray(o.zonesVisited)) objectives.zonesVisited = o.zonesVisited.filter((z) => Number.isInteger(z));
    if (Array.isArray(o.active)) {
      objectives.active = o.active
        .filter((x) => x && OBJECTIVE_TYPES.includes(x.type) && num(x.target) > 0)
        .filter((x) => x.type !== 'collect' || (Number.isInteger(x.kind) && x.kind >= 0 && x.kind < DEBRIS_TYPES.length))
        .filter((x) => x.type !== 'zone' || (Number.isInteger(x.zone) && x.zone >= 0 && x.zone < ZONES.length))
        .map((x) => ({ ...x, progress: num(x.progress), reward: num(x.reward) }));
    }
  }
  return { progress, objectives, ok: true };
}

// localStorage can throw (private mode, blocked storage): treat it as "no save".
export const storage = {
  load() {
    try { return globalThis.localStorage ? globalThis.localStorage.getItem(SAVE_KEY) : null; } catch { return null; }
  },
  save(json) {
    try { globalThis.localStorage && globalThis.localStorage.setItem(SAVE_KEY, json); return true; } catch { return false; }
  },
  clear() {
    try { globalThis.localStorage && globalThis.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  },
};
