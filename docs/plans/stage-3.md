# Stage 3 plan: visuals, animation, sound, rewards, control feel

Visual style: neon arcade over a deep violet nebula. Clean low-poly shapes, everything that matters glows
(magnet, loot, threats), so bloom does the heavy lifting and the scene stays cheap.

| Area | Change | Where | Verification |
|---|---|---|---|
| Controls | Dash: short burst (Space, right mouse, gamepad A, touch button) with cooldown; the way to escape wells and catch raiders | `World.updateShip`, `config.SHIP.dash*`, `Input` | unit: dash speed, cooldown, no dash while docked; e2e: Space dashes |
| Controls | Snappier turning: extra braking when input opposes velocity | `World.updateShip` | unit: reversal is faster than before |
| Controls | Gamepad (left stick, A dash) | `Input` | manual only (no pad in CI) |
| Visuals | Bloom post-processing with adaptive quality (auto drops to low under ~40 fps) | `render/Post.js`, `Game` | e2e: no errors, quality switches, screenshots |
| Visuals | Ship evolves with upgrades: extra magnet rings (power), wings (speed), armor plates (hull), field halo (range), cargo shell glow | `ShipView` | e2e screenshot of a maxed ship |
| Visuals | Shockwave rings on sale / hit / upgrade / reclaim; speed lines; FOV kick on dash | `render/Fx.js`, `Game` | screenshots |
| Rewards | Coins fly from the station to the credits counter, counter bumps; combo meter by the ship; hit-stop on big hits | `ui/Hud.js`, `Game` | e2e: coin elements spawn on sale |
| Sound | Master compressor, procedural ambient music, engine hum by speed, magnet hum while pulling, pentatonic pickups | `audio/Sfx.js`, `audio/Music.js` | manual listen (headless has no audio out) |
| Settings | Gear menu: sound, music, quality (Auto / High / Low), saved per browser | `ui/Settings.js` | e2e: toggles work and persist |
| Camera | Better framing of big builds | `Game.render` | screenshot |
