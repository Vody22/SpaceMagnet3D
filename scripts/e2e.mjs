// Browser smoke test: serves dist/, plays the game with real keyboard/mouse/touch input
// in Chromium, checks for errors and gameplay progress, and saves screenshots.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || 'shots';
fs.mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--strictPort'], { stdio: 'pipe' });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => d.toString().includes('4173') && res());
  server.stderr.on('data', (d) => console.error(d.toString()));
  server.on('exit', (code) => rej(new Error(`preview server exited (${code})`)));
});

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  // ---------- desktop ----------
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://localhost:4173/?fps');
  await page.waitForFunction(() => window.__game && window.__game.world.time > 0.5);
  await page.screenshot({ path: `${OUT}/01-start.png` });
  check('page loads and sim runs', true);

  // Headless Chromium renders with software GL at only a few fps, so the sim runs slower than
  // real time. Wait on simulated seconds rather than wall-clock time.
  const waitSim = async (pg, sec) => {
    const target = (await pg.evaluate(() => window.__game.world.time)) + sec;
    await pg.waitForFunction((t) => window.__game.world.time >= t, target, { timeout: 120000, polling: 50 });
  };
  const w = () => page.evaluate(() => {
    const g = window.__game, wo = g.world;
    return { x: wo.ship.x, z: wo.ship.z, cargo: wo.cargoCount, cap: wo.stats.capacity, money: wo.progress.money, docked: wo.docked, levels: { ...wo.progress.levels }, time: wo.time };
  });

  // Keyboard: fly "down" the screen (+z) through the onboarding trail.
  const s0 = await w();
  await page.keyboard.down('s');
  await waitSim(page, 2.5);
  await page.keyboard.up('s');
  const s1 = await w();
  check('keyboard moves ship', s1.z > s0.z + 10, `z ${s0.z.toFixed(1)} -> ${s1.z.toFixed(1)}`);
  check('magnet collects debris in the first seconds', s1.cargo >= 5, `cargo=${s1.cargo}`);
  await page.screenshot({ path: `${OUT}/02-collecting.png` });

  // Mouse: hold left button above the ship to fly "up" (-z).
  const s2 = await w();
  await page.mouse.move(640, 120);
  await page.mouse.down();
  await waitSim(page, 1.5);
  await page.mouse.up();
  const s3 = await w();
  const cdBefore = await page.evaluate(() => window.__game.world.ship.dashCooldown);
  await page.keyboard.press('Space');
  await waitSim(page, 0.05);
  const dashInfo = await page.evaluate(() => ({ cd: window.__game.world.ship.dashCooldown }));
  check('Space triggers a dash', cdBefore === 0 && dashInfo.cd > 0, `cooldown ${dashInfo.cd.toFixed(2)}`);
  check('mouse hold steers ship', s3.z < s2.z - 5, `z ${s2.z.toFixed(1)} -> ${s3.z.toFixed(1)}`);

  // Autopilot via synthetic arrow keys to fill the hold, then return and sell.
  const steerTo = async (tx, tz, until, maxMs) => {
    const t0 = Date.now();
    let held = new Set();
    while (Date.now() - t0 < maxMs) {
      const st = await w();
      if (await until(st)) break;
      const dx = tx === null ? 0 : tx - st.x, dz = tz === null ? 0 : tz - st.z;
      const want = new Set();
      if (dx > 2) want.add('ArrowRight'); if (dx < -2) want.add('ArrowLeft');
      if (dz > 2) want.add('ArrowDown'); if (dz < -2) want.add('ArrowUp');
      for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
      for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
      held = want;
      await page.waitForTimeout(80);
    }
    for (const k of held) await page.keyboard.up(k);
  };
  const nearestDebris = () => page.evaluate(() => {
    const wo = window.__game.world; let best = null, bd = 1e9;
    for (const d of wo.debris) { if (d.state !== 0) continue; const dd = Math.hypot(d.x - wo.ship.x, d.z - wo.ship.z); if (dd < bd) { bd = dd; best = d; } }
    return { x: best.x, z: best.z };
  });
  const tFill = Date.now();
  while (Date.now() - tFill < 90000) {
    const st = await w();
    if (st.cargo >= st.cap) break;
    const t = await nearestDebris();
    await steerTo(t.x, t.z, async (s) => s.cargo >= s.cap, 600);
  }
  const s4 = await w();
  check('hold fills up', s4.cargo >= s4.cap, `${s4.cargo}/${s4.cap}`);
  await page.screenshot({ path: `${OUT}/03-full.png` });

  await steerTo(0, 0, async (s) => s.docked, 60000);
  await waitSim(page, 2.5);
  const s5 = await w();
  check('coins fly to the credits counter on sale', (await page.locator('.coin').count()) > 0);
  check('docking sells cargo', s5.docked && s5.cargo === 0 && s5.money > 0, `money=$${s5.money} docked=${s5.docked}`);
  await page.screenshot({ path: `${OUT}/04-docked-shop.png` });

  // Buy via keyboard shortcut, then via clicking a shop card.
  const before = s5.levels;
  await page.keyboard.press('3');
  await page.waitForTimeout(300);
  const s6 = await w();
  check('key 3 buys Cargo Hold upgrade', s6.levels.capacity === before.capacity + 1, `money $${s5.money} -> $${s6.money}`);
  await page.evaluate(() => { window.__game.world.progress.money += 50; });
  await page.click('.card[data-id="range"]');
  await page.waitForTimeout(300);
  const s7 = await w();
  check('clicking shop card buys upgrade', s7.levels.range === before.range + 1);
  await page.screenshot({ path: `${OUT}/05-upgraded.png` });

  // Settings menu: toggle music off, set quality, check both persist across a reload.
  await page.click('#settings-btn');
  await page.click('#set-music');
  let q = '';
  for (let i = 0; i < 4 && q !== 'LOW'; i++) { await page.click('#set-quality'); q = await page.locator('#set-quality').innerText(); }
  await page.screenshot({ path: `${OUT}/05b-settings.png` });
  const postLevel = await page.evaluate(() => window.__game.post.current);
  check('quality setting switches renderer to low', postLevel === 'low', `post=${postLevel}`);
  await page.click('#settings-btn');
  await page.evaluate(() => window.__game.save());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.world.time > 0.3);
  const persisted = await page.evaluate(() => ({ music: window.__game.settings.s.music, quality: window.__game.settings.s.quality, post: window.__game.post.current, levels: window.__game.world.progress.levels }));
  check('settings persist across reload', persisted.music === false && persisted.quality === 'low' && persisted.post === 'low', JSON.stringify(persisted));
  // Back to the default quality for the screenshots below.
  await page.evaluate(() => { window.__game.settings.set('quality', 'high'); window.__game.settings.set('music', true); });
  await page.evaluate(() => { const wo = window.__game.world; wo.ship.x = wo.ship.px = 0; wo.ship.z = wo.ship.pz = 0; });
  await waitSim(page, 0.2);

  // Big ship for a visual check of the "growing structure".
  await page.evaluate(() => {
    const wo = window.__game.world;
    wo.progress.money += 1e6;
    for (let i = 0; i < 9; i++) { wo.buy('capacity'); wo.buy('range'); wo.buy('power'); wo.buy('speed'); wo.buy('hull'); }
  });
  // Leave the dock first, otherwise everything collected is sold right away.
  await steerTo(0, 45, async (st) => Math.hypot(st.x, st.z) > 35, 60000);
  // Real-time botting is too slow at headless fps, so fast-forward the simulation in-page
  // with an autopilot (same rules, just no rendering between steps) to check the big-ship visuals.
  await page.evaluate(() => {
    const g = window.__game, wo = g.world;
    // Deterministic setup for the scripted checks below: no random pirates.
    wo.pirates.length = 0; wo.bolts.length = 0; wo.pirateSpawnTimer = 1e9;
    // The naive autopilot flies straight into rocks and wells, which would make this
    // visual check random. Hazards are covered by their own checks below.
    const rocks = wo.rocks.slice(), wells = wo.wells.slice();
    wo.rocks.length = 0; wo.wells.length = 0;
    for (let i = 0; i < 60 * 90 && wo.cargoCount < 250; i++) {
      let best = null, bd = 1e9;
      for (const d of wo.debris) { if (d.state !== 0) continue; const dd = Math.hypot(d.x - wo.ship.x, d.z - wo.ship.z); if (dd < bd && Math.hypot(d.x, d.z) > 30) { bd = dd; best = d; } }
      const dx = best.x - wo.ship.x, dz = best.z - wo.ship.z, l = Math.hypot(dx, dz) || 1;
      wo.update(1 / 60, { x: dx / l, z: dz / l });
    }
    wo.drainEvents();
    wo.rocks.push(...rocks); wo.wells.push(...wells);
    for (const r of wo.rocks) if (Math.hypot(r.x - wo.ship.x, r.z - wo.ship.z) < 30) { r.x += 60; r.px = r.x; }
  });
  await waitSim(page, 0.5);
  const s8 = await w();
  check('large haul accumulates around ship', s8.cargo >= 100, `cargo=${s8.cargo}`);
  await page.screenshot({ path: `${OUT}/06-big-ship.png` });

  // Rock hit loses cargo.
  const lost = await page.evaluate(() => {
    const wo = window.__game.world; const n = wo.cargoCount; wo.ship.invuln = 0;
    wo.rocks[0].x = wo.ship.x + 0.5; wo.rocks[0].z = wo.ship.z; wo.rocks[0].px = wo.rocks[0].x; wo.rocks[0].pz = wo.rocks[0].z;
    return n;
  });
  await waitSim(page, 0.1);
  await page.screenshot({ path: `${OUT}/07-hit.png` });
  const s9 = await w();
  check('asteroid hit knocks cargo loose', s9.cargo < lost, `${lost} -> ${s9.cargo}`);

  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); };
    requestAnimationFrame(f);
  }));
  const calls = await page.evaluate(() => window.__game.renderer.info.render.calls);
  console.log(`INFO  headless software-GL fps: ${fps.toFixed(1)} (not representative of real GPUs), draw calls: ${calls}`);
  // ---------- stage 2: HUD, pirates, wells, save ----------
  const objCount = await page.locator('#objectives li').count();
  check('three objectives shown', objCount === 3, `${objCount} items: ${(await page.locator('#objectives .list').innerText()).replace(/\n/g, ' / ')}`);
  check('rank panel shows a title', /\w/.test(await page.locator('#rank-title').innerText()), await page.locator('#rank-title').innerText());

  // Raider: park in the scrap field with cargo and let one come to us.
  await page.evaluate(() => {
    const wo = window.__game.world;
    wo.rocks.length = 0;
    wo.ship.x = wo.ship.px = 0; wo.ship.z = wo.ship.pz = 95; wo.ship.vx = wo.ship.vz = 0; wo.ship.invuln = 0;
    wo.pirates.length = 0;
    const p = wo.spawnPirate('raider');
    p.x = 18; p.z = 100; p.px = p.x; p.pz = p.z;
    window.__raider = p;
  });
  const cargoBefore = (await w()).cargo;
  await page.waitForFunction(() => window.__raider.state === 'flee', null, { timeout: 120000, polling: 100 });
  await waitSim(page, 0.3);
  await page.screenshot({ path: `${OUT}/09-raider-steal.png` });
  const stolen = await page.evaluate(() => ({ loot: window.__raider.loot.length, inState: window.__game.world.debris.filter((d) => d.state === 4).length }));
  check('raider steals cargo', stolen.loot > 0 && stolen.loot === stolen.inState, `stolen=${stolen.loot} of ${cargoBefore}`);
  // Chase it with the arrow keys until the magnet rips the loot back.
  const tChase = Date.now();
  let held = new Set();
  while (Date.now() - tChase < 120000) {
    const st = await page.evaluate(() => { const r = window.__raider, s = window.__game.world.ship; return { dx: r.x - s.x, dz: r.z - s.z, state: r.state, reclaim: r.reclaim }; });
    if (st.state !== 'flee') break;
    const want = new Set();
    if (st.dx > 1) want.add('ArrowRight'); if (st.dx < -1) want.add('ArrowLeft');
    if (st.dz > 1) want.add('ArrowDown'); if (st.dz < -1) want.add('ArrowUp');
    for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
    for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
    held = want;
    if (st.reclaim > 0.4 && !(await page.evaluate(() => window.__shotTether))) {
      await page.screenshot({ path: `${OUT}/10-reclaim-tether.png` });
      await page.evaluate(() => { window.__shotTether = true; });
    }
    await page.waitForTimeout(60);
  }
  for (const k of held) await page.keyboard.up(k);
  const rState = await page.evaluate(() => window.__raider.state);
  check('chasing a raider with the magnet recovers the loot', rState === 'retreat', `raider state=${rState}`);

  // Gunship and bolts.
  await page.evaluate(() => {
    const wo = window.__game.world;
    wo.pirates.length = 0;
    wo.ship.x = wo.ship.px = 0; wo.ship.z = wo.ship.pz = 150; wo.ship.vx = wo.ship.vz = 0; wo.ship.invuln = 0;
    const g = wo.spawnPirate('gunner');
    g.x = g.px = 10; g.z = g.pz = 172;
  });
  await page.waitForFunction(() => window.__game.world.bolts.length > 0, null, { timeout: 120000, polling: 50 });
  await page.screenshot({ path: `${OUT}/11-gunship-bolt.png` });
  check('gunship fires bolts', true);

  // Gravity well.
  await page.evaluate(() => {
    const wo = window.__game.world;
    wo.pirates.length = 0; wo.bolts.length = 0;
    wo.pirateSpawnTimer = 1e9; // keep pirates out of this check
    wo.ship.invuln = 0;
    const well = wo.wells[0];
    well.dir = 0; // freeze the slow orbit so the distance check only measures the pull
    wo.ship.x = wo.ship.px = well.x + 22; wo.ship.z = wo.ship.pz = well.z; wo.ship.vx = wo.ship.vz = 0;
  });
  const dWell0 = await page.evaluate(() => { const wo = window.__game.world, wl = wo.wells[0]; return Math.hypot(wl.x - wo.ship.x, wl.z - wo.ship.z); });
  await waitSim(page, 1.0);
  const dWell1 = await page.evaluate(() => { const wo = window.__game.world, wl = wo.wells[0]; return Math.hypot(wl.x - wo.ship.x, wl.z - wo.ship.z); });
  await page.screenshot({ path: `${OUT}/12-gravity-well.png` });
  check('gravity well pulls the ship', dWell1 < dWell0 - 1, `${dWell0.toFixed(1)} -> ${dWell1.toFixed(1)}`);

  // Save: reload and compare.
  const beforeSave = await page.evaluate(() => { window.__game.save(); const p = window.__game.world.progress; return { money: Math.floor(p.money), levels: { ...p.levels }, trips: p.stats.trips }; });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.world.time > 0.3);
  const afterSave = await page.evaluate(() => { const p = window.__game.world.progress; return { money: Math.floor(p.money), levels: { ...p.levels }, trips: p.stats.trips }; });
  // The game keeps running until the page unloads (and saves again on pagehide), so money may
  // only have gone up; upgrades and trips must match exactly.
  const sameLevels = JSON.stringify(beforeSave.levels) === JSON.stringify(afterSave.levels) && beforeSave.trips === afterSave.trips;
  check('progress survives a page reload', sameLevels && afterSave.money >= beforeSave.money && afterSave.money > 0, `before ${JSON.stringify(beforeSave)} after ${JSON.stringify(afterSave)}`);
  await page.screenshot({ path: `${OUT}/13-welcome-back.png` });
  await page.goto('http://localhost:4173/?reset');
  await page.waitForFunction(() => window.__game && window.__game.world.time > 0.3);
  const reset = await page.evaluate(() => window.__game.world.progress.stats.trips);
  check('?reset wipes the save', reset === 0);

  check('no page/console errors (desktop)', errors.length === 0, errors.join(' | '));
  await page.close();

  // ---------- mobile (touch) ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const mp = await ctx.newPage();
  const merr = [];
  mp.on('pageerror', (e) => merr.push(e.message));
  await mp.goto('http://localhost:4173/');
  await mp.waitForFunction(() => window.__game && window.__game.world.time > 0.5);
  const m0 = await mp.evaluate(() => ({ x: window.__game.world.ship.x, z: window.__game.world.ship.z }));
  const cdp = await ctx.newCDPSession(mp);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', 195, 500);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', 195, 500 + i * 6); await mp.waitForTimeout(16); }
  await waitSim(mp, 1.5);
  await mp.screenshot({ path: `${OUT}/08-mobile-joystick.png` });
  await touch('touchEnd', 0, 0);
  const m1 = await mp.evaluate(() => ({ x: window.__game.world.ship.x, z: window.__game.world.ship.z, cargo: window.__game.world.cargoCount }));
  check('touch joystick moves ship', m1.z > m0.z + 8, `z ${m0.z.toFixed(1)} -> ${m1.z.toFixed(1)}, cargo=${m1.cargo}`);
  check('no page errors (mobile)', merr.length === 0, merr.join(' | '));
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
