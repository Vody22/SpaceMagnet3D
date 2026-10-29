import * as THREE from 'three';
import { ARENA_RADIUS, ZONES } from '../sim/config.js';
import { glowTexture } from './textures.js';
import { mulberry32 } from '../sim/rng.js';

// Stars, nebulae, parallax dust and the arena rings. A handful of draw calls total.
export function createBackdrop(scene) {
  const rand = mulberry32(1234);
  const group = new THREE.Group();
  scene.add(group);

  // Far stars on a big dome below/around the play plane.
  {
    const n = 2500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = 2600;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * r;
      pos[i * 3 + 1] = -Math.abs(u) * r * 0.8 - 300;
      pos[i * 3 + 2] = Math.sin(a) * s * r;
      c.setHSL(0.55 + rand() * 0.2, 0.6, 0.6 + rand() * 0.4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Round, soft star sprites: square points turn into blocky squares under bloom.
    const m = new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, map: glowTexture(), vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    group.add(new THREE.Points(g, m));
  }

  // Near dust gives a strong sense of speed through parallax.
  {
    const n = 3000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (ARENA_RADIUS + 60);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -4 - rand() * 30;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.5, map: glowTexture(), color: 0x8fb8ff, transparent: true, opacity: 0.55, depthWrite: false });
    group.add(new THREE.Points(g, m));
  }

  // Zone rings show where the richer (and more dangerous) debris lives.
  for (let i = 0; i < ZONES.length; i++) {
    const r = ZONES[i].maxDist;
    const last = i === ZONES.length - 1;
    const geo = new THREE.RingGeometry(r - (last ? 1.2 : 0.4), r + (last ? 1.2 : 0.4), 160);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: last ? 0xff3355 : ZONES[i + 1].color, transparent: true, opacity: last ? 0.5 : 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(geo, m);
    ring.position.y = -2;
    group.add(ring);
  }
  return group;
}
