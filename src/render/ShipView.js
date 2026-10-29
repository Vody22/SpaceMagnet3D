import * as THREE from 'three';
import { glowTexture } from './textures.js';

// Procedural low-poly ship plus the magnet range ring.
export class ShipView {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);

    const hull = new THREE.MeshStandardMaterial({ color: 0xb9c4d6, metalness: 0.5, roughness: 0.45, flatShading: true });
    const accent = new THREE.MeshStandardMaterial({ color: 0xff5a3c, metalness: 0.2, roughness: 0.5, flatShading: true });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0b6f8a, emissive: 0x0a8fb0, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.3 });

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 6), hull);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.6;
    this.body.add(nose);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 1.0, 6), hull);
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.9;
    this.body.add(back);
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    cockpit.position.set(0, 0.25, 0.1);
    cockpit.scale.set(1, 0.8, 1.6);
    this.body.add(cockpit);
    const wingGeo = new THREE.BoxGeometry(2.6, 0.12, 0.9);
    const wing = new THREE.Mesh(wingGeo, accent);
    wing.position.z = -0.5;
    this.body.add(wing);
    this.wing = wing;
    this.tips = [];
    const trim = new THREE.MeshStandardMaterial({ color: 0x1de9ff, emissive: 0x0aa8c8, emissiveIntensity: 0.9 });
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.08), trim);
      strip.position.set(sx * 0.85, 0.08, -0.12);
      this.body.add(strip);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0xff3355 : 0x33ff88 }));
      tip.position.set(sx * 1.32, 0.05, -0.5);
      tip.userData.side = sx;
      this.tips.push(tip);
      this.body.add(tip);
    }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 1.6), accent);
    spine.position.set(0, 0.42, -0.6);
    this.body.add(spine);
    this.hullMat = hull;
    this.accentMat = accent;
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.8), accent);
      fin.position.set(sx * 1.3, 0.25, -0.7);
      this.body.add(fin);
    }

    // Magnet emitter ring around the hull.
    this.magnetMat = new THREE.MeshStandardMaterial({ color: 0x66f0ff, emissive: 0x33d6ff, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
    this.magnet = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 24), this.magnetMat);
    this.magnet.rotation.x = Math.PI / 2;
    this.root.add(this.magnet);

    // Engine glow.
    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a3c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flame.position.z = -1.6;
    this.body.add(this.flame);

    // Magnet range indicator on the play plane.
    const ringGeo = new THREE.RingGeometry(0.975, 1, 128);
    ringGeo.rotateX(-Math.PI / 2);
    this.rangeMat = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    this.range = new THREE.Mesh(ringGeo, this.rangeMat);
    this.range.position.y = -0.6;
    scene.add(this.range);

    this.upgrades = new THREE.Group();
    this.body.add(this.upgrades);
    this.extraRings = new THREE.Group();
    this.root.add(this.extraRings);
  }

  // The ship visibly evolves with its permanent upgrades.
  evolve(levels) {
    for (const g of [this.upgrades, this.extraRings]) {
      while (g.children.length) {
        const c = g.children.pop();
        if (c.geometry && !c.isSprite) c.geometry.dispose();
      }
    }
    const ringCount = Math.min(4, Math.floor(levels.power / 3));
    for (let i = 0; i < ringCount; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.5 + i * 0.45, 0.07, 6, 32), this.magnetMat);
      r.userData.tilt = 0.5 + i * 0.35;
      r.userData.speed = (i % 2 ? -1 : 1) * (1.5 + i * 0.6);
      this.extraRings.add(r);
    }

    this.wing.scale.x = 1 + levels.speed * 0.09;
    for (const t of this.tips) t.position.x = t.userData.side * 1.32 * this.wing.scale.x;
    const boosters = Math.min(3, Math.floor(levels.speed / 3));
    for (let i = 0; i < boosters; i++) {
      for (const sx of [-1, 1]) {
        const x = sx * (0.6 + i * 0.45);
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 6), this.accentMat);
        pod.rotation.x = Math.PI / 2;
        pod.position.set(x, -0.05, -1.1);
        this.upgrades.add(pod);
        const glow = new THREE.Sprite(this.flame.material);
        glow.position.set(x, -0.05, -1.6);
        glow.scale.setScalar(0.7);
        glow.userData.flame = true;
        this.upgrades.add(glow);
      }
    }

    const armor = levels.hull;
    if (armor >= 2) {
      for (const sx of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 1.6), this.accentMat);
        plate.position.set(sx * 0.62, 0.05, -0.2);
        this.upgrades.add(plate);
      }
    }
    if (armor >= 5) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 6), this.accentMat);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = 1.6;
      this.upgrades.add(cap);
    }
    this.hullMat.color.setHex(armor >= 8 ? 0xd9a84a : armor >= 5 ? 0x9fc4d8 : 0xb9c4d6);
  }

  update(world, alpha, time, pulling) {
    const s = world.ship;
    const x = s.px + (s.x - s.px) * alpha;
    const z = s.pz + (s.z - s.pz) * alpha;
    this.root.position.set(x, 0, z);
    this.body.rotation.set(0, s.heading, 0);
    this.body.rotateZ(s.bank);
    this.body.position.y = Math.sin(time * 2.2) * 0.12;
    // Blink while invulnerable after a hit.
    this.body.visible = s.invuln <= 0 || Math.floor(time * 16) % 2 === 0;

    const speed = Math.hypot(s.vx, s.vz);
    const f = (0.8 + Math.min(1, speed / 20) * 1.6 + Math.random() * 0.25) * (s.dashTime > 0 ? 2.2 : 1);
    this.flame.scale.set(f, f, 1);
    for (const c of this.upgrades.children) if (c.userData.flame) c.scale.setScalar(f * 0.55);
    this.extraRings.children.forEach((r) => {
      r.rotation.set(Math.PI / 2 + Math.sin(time * 0.7 + r.userData.tilt) * r.userData.tilt, time * r.userData.speed, 0);
    });


    this.magnet.rotation.z = time * 3;
    this.magnetMat.emissiveIntensity = 0.5 + (pulling ? 0.4 + Math.sin(time * 20) * 0.15 : 0);

    const reach = world.stats.range + s.radius;
    this.range.position.x = x;
    this.range.position.z = z;
    this.range.scale.setScalar(reach);
    const full = world.cargoCount >= world.stats.capacity;
    this.rangeMat.color.setHex(full ? 0xff4466 : 0x4fe3ff);
    this.rangeMat.opacity = full ? 0.3 + Math.sin(time * 8) * 0.12 : 0.16 + (pulling ? 0.1 : 0);
  }
}
