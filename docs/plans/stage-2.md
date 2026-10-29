# Stage 2 plan: enemies, risks, progression, save, objectives

Goal: give every trip a real "keep collecting or go home" decision, and give returning players a reason to come back.

| Feature | Sim module | Render / UI | Tests |
|---|---|---|---|
| Raider pirates: steal cargo on contact, flee; keep them in magnet range ~1 s to rip the loot back | `src/sim/pirates.js` | `PirateView` (instanced), tether beam, threat arrows | steal, reclaim, escape, no chase when empty, stay out of Safe Belt |
| Gunship pirates: keep distance, telegraph, fire bolts | `src/sim/pirates.js` | charge glow, bolts + trail | fires, bolt hit knocks cargo |
| Gravity wells: pull ship + debris, core costs cargo, rich debris spawns around them | `src/sim/wells.js` | `WellView` spiral disc, inward particles | pull, core hit, debris swallowed |
| Pilot rank: earned credits -> title, +4% sell price per rank | `src/sim/rank.js` | rank panel + bar | thresholds, bonus pricing, rankUp event |
| Run objectives: 3 active, rewards, harder tiers | `src/sim/objectives.js` | objectives panel, banner | fill, payout + refill, event filtering |
| Save: versioned JSON in localStorage, defensive load | `src/sim/save.js` | autosave on sale/upgrade/objective, every 15 s, on pagehide; `?reset` | round trip, corrupt/hostile data, new world keeps upgrades |

Pirates appear only after the first sale, so the first trip stays calm.
Not in this stage: boss, temporary power-ups, daily challenges, sharing (stages 3-4).
