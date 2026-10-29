# Space Magnet 3D

Browser game (Three.js + Vite) targeting CrazyGames. Fly a small magnet ship, sweep up space debris that
sticks to your hull, haul it back to the base to sell, and buy permanent upgrades. The more you carry,
the bigger (and slower, and easier to hit) your ship becomes.

## Run

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (simulation, economy, cargo layout, fixed timestep)
npm run build      # production build in dist/
npm run test:e2e   # builds must exist: plays the game in headless Chromium, saves screenshots to shots/
node scripts/inline.mjs   # dist-single/index.html: one self-contained file
```

Add `?fps` to the URL for an FPS / draw-call counter.

## Controls

- Keyboard: WASD or arrows, Space/Shift to dash. `1`-`5` buy upgrades while docked. `M` mutes.
- Mouse: hold the left button, the ship flies toward the cursor; right click dashes.
- Touch: drag anywhere (floating joystick), DASH button. Tap shop cards to buy.
- Gamepad: left stick, A to dash.

## Architecture

```
src/sim/       headless rules (no Three.js): World, config (all tuning), economy, cargo layout, rng
src/core/      fixed-timestep loop, unified input
src/render/    Three.js views that read the sim state (InstancedMesh per debris type, pooled particles)
src/audio/     procedural WebAudio sound effects (no audio files)
src/ui/        DOM HUD, shop, popups, CSS
tests/         Vitest unit tests for the sim
scripts/       browser e2e test (Playwright), single-file export
```

The simulation runs at a fixed 60 Hz and the renderer interpolates, so game speed does not depend on
the display refresh rate. All meshes are procedural: there are no asset downloads besides the JS bundle.

## Stage 1 content

- Arena with 4 zones (richer debris farther out), station with dock zone, beacon and home arrow.
- Magnetic pull with swirl, trails, capture pop, combo pitch sounds; cargo accretes in an organic blob.
- Selling animation (pieces fly into the station), sale banner, best haul.
- 5 permanent upgrades: Magnet Power, Magnet Range, Cargo Hold, Engines, Hull Armor.
- Drifting asteroids outside the safe belt: a hit knocks part of the cargo loose (Hull Armor reduces it).
- Full hold slows the ship: carry more or go home.

## Stage 2 content

- Raider pirates steal cargo and run; chase them and keep them in your magnet range to rip it back.
- Gunships keep their distance and fire telegraphed bolts.
- Gravity wells in the outer zones pull in your ship and debris; rich debris gathers around them.
- Pilot ranks (+4% sell price per rank), 3 rotating run objectives with rewards.
- Autosave in localStorage (`?reset` in the URL wipes it).
- Pirates only appear after your first sale.

See `docs/plans/` and `docs/workflow.md`.

## Stage 3 content

- Dash with cooldown, harder braking when steering against your momentum, gamepad support.
- Bloom with adaptive quality (Auto / High / Medium / Low in the gear menu), round soft stars.
- The ship evolves with upgrades (magnet rings, wings and boosters, armor, gold hull); fresnel field shell around the cargo.
- Shockwaves, speed streaks, FOV kick on dash, hit-stop on heavy hits, coins flying to the counter, combo meter.
- Procedural music, engine and magnet hums, pentatonic pickups, master compressor; sound/music toggles saved per browser.

Not yet (planned stages 4-5): boss, temporary power-ups, daily challenges, share, CrazyGames SDK.
