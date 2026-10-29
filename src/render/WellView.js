import * as THREE from 'three';
import { WELLS } from '../sim/config.js';
import { glowTexture } from './textures.js';

function spiralTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  for (let arm = 0; arm < 4; arm++) {
    for (let i = 0; i < 220; i++) {
      const t = i / 220;
      const a = arm * (Math.PI / 2) + t * Math.PI * 3;
      const r = (1 - t) * size * 0.48;
      g.fillStyle = `rgba(255,255,255,${0.04 + t * 0.12})`;
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 2 + (1 - t) * 10, 0, Math.PI * 2);
      g.fill();
    }
  }
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.12, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = grad;
  g.fillRect(-size / 2, -size / 2, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class WellView {
  constructor(scene, count) {
    const tex = spiralTexture();
    this.items = [];
    for (let i = 0; i < count; i++) {
      const root = new THREE.Group();
      const discGeo = new THREE.PlaneGeometry(WELLS.influence * 2.2, WELLS.influence * 2.2);
      discGeo.rotateX(-Math.PI / 2);
      const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: tex, color: 0xb05cff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.position.y = -1.5;
      root.add(disc);
      const disc2 = disc.clone();
      disc2.material = disc.material.clone();
      disc2.material.color.setHex(0x3a6bff);
      disc2.scale.setScalar(0.6);
      disc2.position.y = -1.2;
      root.add(disc2);
      const core = new THREE.Mesh(new THREE.SphereGeometry(WELLS.coreRadius * 0.8, 20, 14), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      root.add(core);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xd070ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(WELLS.coreRadius * 4, WELLS.coreRadius * 4, 1);
      root.add(halo);
      const ringGeo = new THREE.RingGeometry(WELLS.influence - 0.4, WELLS.influence, 64);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xc070ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.y = -1;
      root.add(ring);
      scene.add(root);
      this.items.push({ root, disc, disc2 });
    }
  }

  update(world, alpha, time, particles) {
    world.wells.forEach((w, i) => {
      const it = this.items[i];
      if (!it) return;
      const x = w.px + (w.x - w.px) * alpha, z = w.pz + (w.z - w.pz) * alpha;
      it.root.position.set(x, 0, z);
      it.disc.rotation.y = -time * 0.6 * (w.dir || 1);
      it.disc2.rotation.y = -time * 1.1 * (w.dir || 1);
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2, r = WELLS.influence * (0.6 + Math.random() * 0.4);
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        // Inward spiral velocity.
        const vx = -Math.cos(a) * 10 - Math.sin(a) * 8, vz = -Math.sin(a) * 10 + Math.cos(a) * 8;
        particles.emit(px, -0.5, pz, vx, 0, vz, 0xb070ff, 1.2, 2.0, 0.2);
      }
    });
    for (let i = world.wells.length; i < this.items.length; i++) this.items[i].root.visible = false;
  }
}
