import * as THREE from 'three';
import { World } from './sim/World.js';
import { SIM_STEP, STATION, DEBRIS_TYPES, UPGRADES } from './sim/config.js';
import { FixedStep, startLoop } from './core/Loop.js';
import { Input } from './core/Input.js';
import { createBackdrop } from './render/Backdrop.js';
import { ShipView } from './render/ShipView.js';
import { DebrisView } from './render/DebrisView.js';
import { RockView } from './render/RockView.js';
import { StationView } from './render/StationView.js';
import { Particles } from './render/Particles.js';
import { Sfx } from './audio/Sfx.js';
import { Hud } from './ui/Hud.js';
import { ATTACHED, FREE } from './sim/World.js';
import { PirateView } from './render/PirateView.js';
import { WellView } from './render/WellView.js';
import { Panels } from './ui/Panels.js';
import { storage, serialize, deserialize } from './sim/save.js';
import { rankTitle, sellMultiplier } from './sim/rank.js';
import { objectiveText } from './sim/objectives.js';
import { Post } from './render/Post.js';
import { Fx } from './render/Fx.js';
import { Music } from './audio/Music.js';
import { Settings, loadSettings } from './ui/Settings.js';
import { SHIP } from './sim/config.js';
import { createSky } from './render/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const isTouch = matchMedia('(pointer: coarse)').matches;

// Clamp an off-screen point to the screen border (below the top HUD bar), for edge arrows.
function edgePoint(p, W, H) {
  const top = 116, side = 36, bottom = 36;
  const cx = W / 2, cy = (top + H - bottom) / 2;
  let dx = p.x - cx, dy = p.y - cy;
  if (p.z >= 1) { dx = -dx; dy = -dy; }
  const k = Math.min((W / 2 - side) / Math.abs(dx || 1e-6), (dy < 0 ? cy - top : H - bottom - cy) / Math.abs(dy || 1e-6));
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

export class Game {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    createSky(this.scene, { touch: isTouch });
    // Soft studio reflections make metal and glass read as real materials.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog(0x05060f, 90, 260);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 4000);

    this.scene.add(new THREE.HemisphereLight(0x9ec8ff, 0x2a1840, 0.9));
    const rim = new THREE.DirectionalLight(0xc07cff, 1.2);
    rim.position.set(-60, 30, -80);
    this.scene.add(rim);
    const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
    sun.position.set(40, 80, 30);
    this.scene.add(sun);

    const params = new URLSearchParams(location.search);
    if (params.has('reset')) storage.clear();
    const saved = deserialize(storage.load() || '');
    this.loadedSave = saved.ok;
    this.world = new World({ seed: (Math.random() * 1e9) | 0, progress: saved.progress, objectives: saved.objectives });
    createBackdrop(this.scene);
    this.station = new StationView(this.scene);
    this.debrisView = new DebrisView(this.scene);
    this.rockView = new RockView(this.scene, this.world.rocks.length);
    this.shipView = new ShipView(this.scene);
    this.pirateView = new PirateView(this.scene);
    this.wellView = new WellView(this.scene, this.world.wells.length);
    this.particles = new Particles(this.scene);
    this.fx = new Fx(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera, { touch: isTouch });
    this.shipView.evolve(this.world.progress.levels);

    this.sfx = new Sfx();
    this.music = new Music();
    this.sfx.onUnlock = (ctx, bus) => this.music.attach(ctx, bus);
    this.input = new Input(this.renderer.domElement, document.querySelector('#joystick'));
    this.hud = new Hud((id) => this.buy(id), () => this.toggleMute());
    this.settings = new Settings(loadSettings(), (st, key) => this.applySettings(st, key));
    this.panels = new Panels();
    this.saveTimer = 15;
    const flush = () => this.save();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => document.hidden && flush());
    if (this.loadedSave && this.world.progress.stats.trips > 0) {
      setTimeout(() => this.hud.showBanner(`WELCOME BACK<b>$${Math.floor(this.world.progress.money)}</b><small>${rankTitle(this.world.rank)}</small>`, 2.2, 'gold'), 300);
    }
    this.input.onAny((e) => {
      this.sfx.unlock();
      if (e.type === 'keydown') {
        const n = Number(e.key);
        if (n >= 1 && n <= UPGRADES.length) this.buy(UPGRADES[n - 1].id);
        if (e.code === 'KeyM') this.toggleMute();
      }
    });

    this.camPos = new THREE.Vector3(0, 40, 50);
    this.camTarget = new THREE.Vector3();
    this.shake = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.time = 0;
    this.moved = false;
    this.v = new THREE.Vector3();
    this.tmp = { x: 0, y: 0, z: 0 };
    this.input_ = { x: 0, z: 0 };

    this.fpsEl = new URLSearchParams(location.search).has('fps') ? document.querySelector('#fps') : null;
    if (this.fpsEl) this.fpsEl.style.display = 'block';
    this.fpsAcc = 0; this.fpsFrames = 0;

    const dashBtn = document.querySelector('#dash-btn');
    dashBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.sfx.unlock(); this.input.queueDash(); });
    this.dashBtn = dashBtn;
    this.fovKick = 0;
    this.hitStop = 0;
    this.lastCoinFx = 0;

    window.addEventListener('resize', () => this.resize());
    this.post.onChange = (level) => { this.updateParticleScale(); this.settings.render(level); };
    this.applySettings(this.settings.s);
    this.resize();

    this.stepper = new FixedStep(SIM_STEP);
    this.stop = startLoop(this.stepper, (dt) => this.update(dt), (alpha, dt) => this.render(alpha, dt));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.post.resize();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateParticleScale();
  }

  updateParticleScale() {
    const px = window.innerHeight * this.renderer.getPixelRatio();
    this.particles.setScale(px / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
  }

  applySettings(st, key) {
    this.sfx.setMuted(!st.sound);
    this.hud.setMuted(!st.sound);
    this.music.setEnabled(st.music);
    if (!key || key === 'quality') this.post.setMode(st.quality);
  }

  save() {
    storage.save(serialize(this.world.progress, this.world.objectives));
  }

  toggleMute() {
    this.settings.set('sound', !this.settings.s.sound);
  }

  buy(id) {
    if (!this.world.buy(id)) {
      if (this.world.docked) this.hud.showBanner('Not enough credits', 1, 'warn');
    }
  }

  shipNdc() {
    const s = this.world.ship;
    this.v.set(s.x, 0, s.z).project(this.camera);
    return { x: this.v.x, y: this.v.y };
  }

  toScreen(x, y, z) {
    this.v.set(x, y, z).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * window.innerWidth, y: (-this.v.y * 0.5 + 0.5) * window.innerHeight, z: this.v.z };
  }

  update(dt) {
    // Hit-stop: freeze the simulation for a few frames on heavy impacts.
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    const inp = this.input.read(this.shipNdc(), this.camera.aspect);
    this.input_ = inp;
    if (!this.moved && Math.hypot(inp.x, inp.z) > 0.1) {
      this.moved = true;
      setTimeout(() => this.hud.hideHint(), 2500);
    }
    this.world.update(dt, inp);
    this.handleEvents(this.world.drainEvents());
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 15; this.save(); }
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
  }

  handleEvents(events) {
    const w = this.world;
    for (const e of events) {
      switch (e.type) {
        case 'attach': {
          this.combo++;
          this.comboTimer = 0.8;
          const t = DEBRIS_TYPES[e.kind];
          this.particles.burst(e.x, 0, e.z, t.color, 6, 6, 1.1, 0.4);
          this.sfx.pickup(this.combo, e.kind);
          if (t.value >= 8) {
            const p = this.toScreen(e.x, 1, e.z);
            this.hud.popup(`+$${t.value}`, p.x, p.y, e.kind === 3 ? 'relic' : 'gold');
          }
          if (this.combo > 0 && this.combo % 10 === 0) {
            const p = this.toScreen(w.ship.x, 3, w.ship.z);
            this.hud.popup(`x${this.combo} COMBO`, p.x, p.y - 40, 'combo');
          }
          break;
        }
        case 'full':
          this.hud.showBanner('CARGO FULL<small>Return to base to sell</small>', 2.5, 'warn');
          this.sfx.full();
          break;
        case 'coin': {
          this.station.bump();
          if (this.time - this.lastCoinFx > 0.05) {
            this.lastCoinFx = this.time;
            const p = this.toScreen(STATION.x, STATION.coreHeight, STATION.z);
            this.hud.flyCoin(p.x, p.y);
          }
          this.particles.burst(STATION.x, STATION.coreHeight, STATION.z, DEBRIS_TYPES[e.kind].color, 3, 10, 1.4, 0.5);
          this.sfx.coin(e.kind);
          break;
        }
        case 'saleComplete': {
          const best = e.best && w.progress.stats.trips > 1;
          this.hud.showBanner(`SOLD ${e.count} PIECES<b>+$${Math.round(e.total)}</b>${best ? '<small>NEW BEST HAUL!</small>' : ''}`, 2.4, 'gold');
          this.sfx.saleComplete(best);
          this.particles.burst(STATION.x, STATION.coreHeight, STATION.z, 0xffd34d, 60, 22, 2, 1.0);
          this.fx.shockwave(STATION.x, STATION.z, 0xffd34d, 26 + Math.min(40, e.count * 0.3), 0.9, -1);
          if (w.progress.stats.trips === 1) {
            setTimeout(() => this.hud.showBanner('PIRATES INCOMING<small>They hunt ships carrying cargo outside the Safe Belt</small>', 3, 'danger'), 2600);
          }
          this.save();
          break;
        }
        case 'upgrade': {
          const u = UPGRADES.find((x) => x.id === e.id);
          this.hud.flashCard(e.id);
          this.hud.showBanner(`${u.name.toUpperCase()}<b>LEVEL ${e.level + 1}</b>`, 1.3, 'blue');
          this.sfx.upgrade();
          this.particles.burst(w.ship.x, 1, w.ship.z, 0x4fe3ff, 40, 16, 1.6, 0.8);
          this.shipView.evolve(w.progress.levels);
          this.fx.shockwave(w.ship.x, w.ship.z, 0x4fe3ff, 14, 0.6);
          this.save();
          break;
        }
        case 'pirateAlert':
          if (this.time - (this.lastAlert || -99) > 6) {
            this.lastAlert = this.time;
            this.hud.showBanner(e.kind === 'raider' ? 'RAIDER!<small>It wants your cargo</small>' : 'GUNSHIP!<small>Dodge the red bolts</small>', 1.6, 'danger');
            this.sfx.alert();
          }
          break;
        case 'steal': {
          this.shake = 0.6;
          this.sfx.steal();
          this.particles.burst(e.x, 0, e.z, 0xff3355, 30, 14, 1.4, 0.6);
          this.hud.showBanner(`STOLEN!<b>-${e.count} PIECES</b><small>Chase the raider: keep it in your magnet range</small>`, 2.6, 'danger');
          break;
        }
        case 'reclaim':
          this.sfx.reclaim();
          this.fx.shockwave(e.x, e.z, 0x4fe3ff, 16, 0.6);
          this.particles.burst(e.x, 0, e.z, 0x4fe3ff, 50, 18, 1.6, 0.8);
          this.hud.showBanner(`RECOVERED<b>${e.count} PIECES</b>`, 1.8, 'blue');
          break;
        case 'escaped':
          this.hud.showBanner(`RAIDER ESCAPED<small>${e.count} pieces lost</small>`, 2, 'warn');
          break;
        case 'dash':
          this.sfx.dash();
          this.fovKick = 1;
          this.fx.shockwave(e.x, e.z, 0x9fd8ff, 6 + w.ship.radius, 0.35);
          for (let i = 0; i < 16; i++) {
            this.particles.emit(e.x, 0, e.z, -e.dx * (10 + Math.random() * 20) + (Math.random() - 0.5) * 8, 0, -e.dz * (10 + Math.random() * 20) + (Math.random() - 0.5) * 8, 0x9fd8ff, 1.4, 0.5, 3);
          }
          break;
        case 'fire':
          this.sfx.zap();
          break;
        case 'objective': {
          this.sfx.objective();
          const p = this.toScreen(w.ship.x, 2, w.ship.z);
          this.hud.popup(`+$${e.reward}`, p.x, p.y - 50, 'gold');
          this.hud.showBanner(`OBJECTIVE COMPLETE<b>+$${e.reward}</b><small>${objectiveText(e.objective)}</small>`, 2.2, 'green');
          this.save();
          break;
        }
        case 'rankUp': {
          this.sfx.rankUp();
          const bonus = Math.round((sellMultiplier(e.rank) - 1) * 100);
          setTimeout(() => this.hud.showBanner(`RANK UP<b>${rankTitle(e.rank).toUpperCase()}</b><small>Sell prices +${bonus}%</small>`, 2.6, 'purple'), 1200);
          this.particles.burst(w.ship.x, 1, w.ship.z, 0xa98bff, 80, 22, 2, 1.2);
          this.fx.shockwave(w.ship.x, w.ship.z, 0xa98bff, 40, 1.2);
          this.save();
          break;
        }
        case 'zone':
          if (e.zone === 3 && !this.seenDeep) { this.seenDeep = true; this.hud.showBanner('DEEP WRECK<small>Relics and gravity wells ahead</small>', 2, 'purple'); }
          break;
        case 'hit': {
          this.shake = 1;
          this.sfx.hit();
          if (e.lost > 0) this.hitStop = 0.07;
          this.fx.shockwave(e.x, e.z, 0xff3355, 10 + w.ship.radius * 2, 0.5);
          this.particles.burst(e.x, 0, e.z, 0xff5533, 40, 18, 1.6, 0.7);
          const p = this.toScreen(e.x, 2, e.z);
          if (e.lost) this.hud.popup(`-${e.lost} cargo  (-$${Math.round(e.value)})`, p.x, p.y - 30, 'bad');
          if (e.source === 'well') this.hud.showBanner('GRAVITY WELL<small>Stay away from the core</small>', 1.6, 'purple');
          break;
        }
        case 'dock':
          this.sfx.dock();
          if (w.cargoCount === 0 && w.progress.stats.trips === 0) this.hud.showBanner('BASE<small>Collect debris and bring it here</small>', 2);
          break;
        default:
      }
    }
  }

  render(alpha, dt) {
    this.time += dt;
    const w = this.world;
    const s = w.ship;
    const t = this.time;

    // Camera: higher as the magnet reach / ship grows, so the build stays in frame.
    const sx = s.px + (s.x - s.px) * alpha;
    const sz = s.pz + (s.z - s.pz) * alpha;
    const reach = w.stats.range + s.radius;
    const portrait = Math.max(1, Math.sqrt(1.1 / this.camera.aspect));
    // Frame the cargo blob first and the magnet reach second, so a big build fills the screen.
    const h = (16 + s.radius * 3.2 + w.stats.range * 0.55 + Math.min(30, Math.hypot(s.vx, s.vz)) * 0.3) * portrait;
    const k = 1 - Math.exp(-dt * 4);
    this.camTarget.x += (sx + s.vx * 0.3 - this.camTarget.x) * k;
    this.camTarget.z += (sz + s.vz * 0.3 - this.camTarget.z) * k;
    this.camPos.x = this.camTarget.x;
    this.camPos.y += (h - this.camPos.y) * (1 - Math.exp(-dt * 2));
    this.camPos.z = this.camTarget.z + this.camPos.y * 0.62;
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const a = this.shake * this.shake * 1.2;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z);
    // FOV kick on dash sells the burst of speed.
    this.fovKick = Math.max(0, this.fovKick - dt * 2.5);
    const fov = 50 + this.fovKick * 9;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

    // Trails: engine exhaust and glowing streaks behind pulled debris.
    const speed = Math.hypot(s.vx, s.vz);
    if (speed > 2) {
      const bx = sx - Math.sin(s.heading) * 1.8, bz = sz - Math.cos(s.heading) * 1.8;
      this.particles.emit(bx, 0, bz, -s.vx * 0.2 + (Math.random() - 0.5), 0, -s.vz * 0.2 + (Math.random() - 0.5), 0xff8a3c, 1.4, 0.35, 3);
    }
    let pulling = false;
    for (const d of w.debris) {
      if (d.state === FREE && d.pulled) {
        pulling = true;
        if (Math.random() < 0.35) this.particles.emit(d.x, d.y, d.z, 0, 0, 0, DEBRIS_TYPES[d.type].color, 0.9, 0.35, 0);
      } else if (d.state === ATTACHED && d.attachT < 1 && Math.random() < 0.25) {
        this.particles.emit(d.x, d.y, d.z, 0, 1, 0, 0x3fb8d8, 0.5, 0.2, 1);
      }
    }

    this.shipView.update(w, alpha, t, pulling);
    this.debrisView.update(w, alpha, t);
    this.rockView.update(w, alpha, t);
    this.wellView.update(w, alpha, t, this.particles);
    this.pirateView.update(w, alpha, t, this.camera);
    for (const b of w.bolts) if (Math.random() < 0.6) this.particles.emit(b.x, 0.5, b.z, 0, 0, 0, 0xff5a2a, 1.2, 0.25, 0);
    this.station.update(w, t, dt);
    this.particles.update(dt);
    const speed01 = Math.hypot(s.vx, s.vz) / w.stats.speed;
    this.fx.update(dt, s, s.dashTime > 0 ? 1 : Math.max(0, Math.min(1, speed01 - 0.85) * 2));
    this.sfx.setLoops(speed01, pulling, s.dashTime > 0);
    this.post.sample(dt);
    this.post.render();

    const sp = this.toScreen(sx, 2 + s.radius, sz);
    this.hud.setCombo(this.combo, sp.x, sp.y - 30 - s.radius * 4);
    this.dashBtn.style.setProperty('--ready', String(1 - s.dashCooldown / SHIP.dashCooldown));

    this.hud.update(w, dt, this.homeIndicator());
    this.panels.update(w, this.threatIndicators());

    if (this.fpsEl) {
      this.fpsAcc += dt; this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        const info = this.renderer.info.render;
        this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} fps · ${info.calls} calls · ${w.debris.length} debris · ${this.post.current}`;
        this.fpsAcc = 0; this.fpsFrames = 0;
      }
    }
  }

  // Edge arrows for pirates that are hunting you or running off with your cargo.
  threatIndicators() {
    const out = [];
    const W = window.innerWidth, H = window.innerHeight;
    for (const p of this.world.pirates) {
      if (p.state !== 'chase' && p.state !== 'flee') continue;
      const s = this.toScreen(p.x, 0, p.z);
      if (s.z < 1 && s.x > 0 && s.x < W && s.y > 0 && s.y < H) continue;
      out.push({ ...edgePoint(s, W, H), dist: Math.hypot(p.x - this.world.ship.x, p.z - this.world.ship.z), loot: p.loot.length });
      if (out.length >= 4) break;
    }
    return out;
  }

  homeIndicator() {
    const W = window.innerWidth, H = window.innerHeight;
    const p = this.toScreen(STATION.x, 0, STATION.z);
    const dist = Math.hypot(this.world.ship.x - STATION.x, this.world.ship.z - STATION.z);
    if (p.z < 1 && p.x > 40 && p.x < W - 40 && p.y > 40 && p.y < H - 40) return { visible: true };
    return { visible: false, ...edgePoint(p, W, H), dist };
  }
}
