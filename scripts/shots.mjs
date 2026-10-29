// Quick visual capture (no assertions): a few representative frames at a chosen quality.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || 'shots';
const QUALITY = process.env.QUALITY || 'high';
fs.mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4174', '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => server.stdout.on('data', (d) => d.toString().includes('4174') && res()));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((q) => localStorage.setItem('space-magnet-3d/settings', JSON.stringify({ sound: true, music: true, quality: q })), QUALITY);
  await page.goto('http://localhost:4174/');
  await page.waitForFunction(() => window.__game && window.__game.world.time > 0.5, null, { timeout: 60000 });
  const sim = async (sec) => {
    const t = (await page.evaluate(() => window.__game.world.time)) + sec;
    await page.waitForFunction((x) => window.__game.world.time >= x, t, { timeout: 120000 });
  };
  await page.keyboard.down('s'); await sim(1.5); await page.keyboard.up('s');
  await page.screenshot({ path: `${OUT}/a-collect-${QUALITY}.png` });
  await page.evaluate(() => { const w = window.__game.world; w.ship.x = w.ship.px = 6; w.ship.z = w.ship.pz = 26; });
  await sim(0.5);
  await page.screenshot({ path: `${OUT}/b-station-${QUALITY}.png` });
  await page.evaluate(() => { const w = window.__game.world; const r = w.rocks[0]; w.ship.x = w.ship.px = r.x + 14; w.ship.z = w.ship.pz = r.z; });
  await sim(0.5);
  await page.screenshot({ path: `${OUT}/c-field-${QUALITY}.png` });
  console.log('errors:', errors.length ? errors : 'none', 'quality:', await page.evaluate(() => window.__game.post.current));
} finally {
  await browser.close();
  server.kill();
}
