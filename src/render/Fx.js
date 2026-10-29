import * as THREE from 'three';

// Expanding shockwave rings and speed streaks: small pools, a handful of draw calls.
export class Fx {
  constructor(scene) {
    const geo = new THREE.RingGeometry(0.85, 1, 64);
    geo.rotateX(-Math.PI / 2);
    this.waves = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.waves.push({ m, t: 1, dur: 1, r: 1 });
    }
    this.wi = 0;

    const n = 70;
    this.streakPos = new Float32Array(n * 6);
    this.streaks = [];
    for (let i = 0; i < n; i++) this.streaks.push({ x: 0, y: 0, z: 0, life: 0 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.streakMat = new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.streakMat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.geo = g;
  }

  shockwave(x, z, color, radius, dur = 0.6, y = 0) {
    const w = this.waves[this.wi];
    this.wi = (this.wi + 1) % this.waves.length;
    w.m.position.set(x, y, z);
    w.m.material.color.set(color);
    w.t = 0; w.dur = dur; w.r = radius;
    w.m.visible = true;
  }

  update(dt, ship, intensity) {
    for (const w of this.waves) {
      if (!w.m.visible) continue;
      w.t += dt / w.dur;
      if (w.t >= 1) { w.m.visible = false; continue; }
      const e = 1 - (1 - w.t) ** 3;
      w.m.scale.setScalar(0.5 + w.r * e);
      w.m.material.opacity = (1 - w.t) * 0.9;
    }

    // Speed streaks fly past the ship opposite to its velocity.
    const vx = ship.vx, vz = ship.vz;
    const sp = Math.hypot(vx, vz) || 1;
    const len = Math.min(6, sp * 0.12) * intensity;
    this.streakMat.opacity += ((intensity > 0.05 ? 0.55 : 0) - this.streakMat.opacity) * Math.min(1, dt * 6);
    const p = this.streakPos;
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      s.life -= dt;
      if (s.life <= 0) {
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 30;
        s.x = ship.x + Math.cos(a) * r + (vx / sp) * 20;
        s.z = ship.z + Math.sin(a) * r + (vz / sp) * 20;
        s.y = -2 + Math.random() * 6;
        s.life = 0.3 + Math.random() * 0.4;
      }
      s.x -= vx * dt * 0.6; s.z -= vz * dt * 0.6;
      p[i * 6] = s.x; p[i * 6 + 1] = s.y; p[i * 6 + 2] = s.z;
      p[i * 6 + 3] = s.x - (vx / sp) * len; p[i * 6 + 4] = s.y; p[i * 6 + 5] = s.z - (vz / sp) * len;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
