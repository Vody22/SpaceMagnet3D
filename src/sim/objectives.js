// Short run objectives. Three are active at a time; finishing one pays out and
// replaces it with a slightly harder one. Progress is driven by world events.
import { DEBRIS_TYPES, ZONES, OBJECTIVES } from './config.js';

const TEMPLATES = [
  {
    type: 'collect', weight: 3, minTier: 0,
    make: (tier, rand) => {
      const kind = Math.min(DEBRIS_TYPES.length - 1, Math.floor(rand() * Math.min(DEBRIS_TYPES.length, 1 + tier / 2)));
      const target = Math.max(5, Math.round((25 + tier * 15) / DEBRIS_TYPES[kind].value ** 0.7));
      return { kind, target, reward: Math.round(target * DEBRIS_TYPES[kind].value * 0.8 + 5) };
    },
    text: (o) => `Collect ${o.target} ${DEBRIS_TYPES[o.kind].name}${o.target > 1 ? 's' : ''}`,
  },
  {
    type: 'haul', weight: 2, minTier: 0,
    make: (tier) => { const target = Math.round(15 * Math.pow(1.6, tier)); return { target, reward: Math.round(target * 0.5) }; },
    text: (o) => `Sell a single haul worth $${o.target}`,
  },
  {
    type: 'fullHold', weight: 1, minTier: 0,
    make: (tier) => ({ target: 1 + Math.floor(tier / 3), reward: 20 + tier * 15 }),
    text: (o) => (o.target > 1 ? `Sell a full hold ${o.target} times` : 'Sell a completely full hold'),
  },
  {
    type: 'zone', weight: 1, minTier: 1,
    make: (tier) => { const zone = Math.min(ZONES.length - 1, 1 + Math.floor(tier / 2)); return { zone, target: 1, reward: 25 * zone * zone }; },
    text: (o) => `Reach the ${ZONES[o.zone].name}`,
    skip: (o, done) => done.zones && done.zones.includes(o.zone),
  },
  {
    type: 'cleanTrip', weight: 1, minTier: 2,
    make: (tier) => { const target = Math.round(20 * Math.pow(1.5, tier - 2)); return { target, reward: Math.round(target * 0.8) }; },
    text: (o) => `Sell $${o.target}+ without getting hit`,
  },
  {
    type: 'reclaim', weight: 1, minTier: 2,
    make: (tier) => ({ target: 1 + Math.floor(tier / 4), reward: 40 + tier * 10 }),
    text: (o) => `Rip stolen cargo back from a raider${o.target > 1 ? ` (${o.target}x)` : ''}`,
  },
];

export const OBJECTIVE_TYPES = TEMPLATES.map((t) => t.type);

export function objectiveText(o) {
  return TEMPLATES.find((t) => t.type === o.type).text(o);
}

export function createObjectiveState() {
  return { tier: 0, completed: 0, active: [], zonesVisited: [0] };
}

function pickTemplate(state, rand) {
  const activeTypes = new Set(state.active.map((o) => o.type));
  const options = TEMPLATES.filter((t) => t.minTier <= state.tier && !activeTypes.has(t.type));
  let total = 0;
  for (const t of options) total += t.weight;
  let r = rand() * total;
  for (const t of options) { r -= t.weight; if (r < 0) return t; }
  return options[options.length - 1];
}

export function newObjective(state, rand) {
  for (let tries = 0; tries < 10; tries++) {
    const t = pickTemplate(state, rand);
    const o = { type: t.type, progress: 0, ...t.make(state.tier, rand) };
    if (t.skip && t.skip(o, { zones: state.zonesVisited })) continue;
    return o;
  }
  const t = TEMPLATES[0];
  return { type: t.type, progress: 0, ...t.make(state.tier, rand) };
}

export function fillObjectives(state, rand) {
  while (state.active.length < OBJECTIVES.active) state.active.push(newObjective(state, rand));
}

// Feed one world event; returns the objectives completed by it.
export function applyEvent(state, e, ctx) {
  const done = [];
  for (const o of state.active) {
    switch (o.type) {
      case 'collect': if (e.type === 'attach' && e.kind === o.kind && !e.reattach) o.progress++; break;
      case 'haul': if (e.type === 'saleComplete') o.progress = Math.max(o.progress, e.total); break;
      case 'fullHold': if (e.type === 'saleComplete' && e.wasFull) o.progress++; break;
      case 'zone': if (e.type === 'zone' && e.zone >= o.zone) o.progress = 1; break;
      case 'cleanTrip': if (e.type === 'saleComplete' && !e.hitThisTrip) o.progress = Math.max(o.progress, e.total); break;
      case 'reclaim': if (e.type === 'reclaim') o.progress++; break;
      default:
    }
    if (o.progress >= o.target) done.push(o);
  }
  if (e.type === 'zone' && !state.zonesVisited.includes(e.zone)) state.zonesVisited.push(e.zone);
  if (done.length) {
    state.active = state.active.filter((o) => !done.includes(o));
    state.completed += done.length;
    state.tier = Math.floor(state.completed / 2);
    fillObjectives(state, ctx.rand);
  }
  return done;
}
