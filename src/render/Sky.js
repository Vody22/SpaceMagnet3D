import * as THREE from 'three';
import { mulberry32 } from '../sim/rng.js';

// Procedural nebula sky (equirectangular canvas, generated once at load) and distant planets.

function makeNoise(seed) {
  const rand = mulberry32(seed);
  const N = 256;
  const perm = new Uint8Array(N * 2);
  const grad = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; grad[i] = rand(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[N + i] = perm[i];
  const fade = (t) => t * t * (3 - 2 * t);
  // Tileable value noise (period `p` along x) so the sky has no seam.
  return (x, y, period) => {
    const p = Math.max(1, Math.round(period));
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const h = (a, b) => grad[perm[(perm[((a % p) + p) % p & 255] + (b & 255)) & 511]];
    const u = fade(xf), v = fade(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export function nebulaTexture(seed = 7, W = 768, H = 384) {
  const noise = makeNoise(seed);
  const fbm = (x, y, p) => {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 5; o++) { s += amp * noise(x * f, y * f, p * f); f *= 2; amp *= 0.5; }
    return s;
  };
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const P = 8; // noise period across the full width
  const deep = [6, 7, 22], violet = [70, 24, 120], magenta = [150, 30, 110], teal = [12, 80, 110], glow = [255, 170, 210];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * P, v = (y / H) * P * 0.5;
      // Domain warp gives the clouds a wispy, flowing shape.
      const wx = fbm(u + 3.1, v + 1.7, P) * 2.2, wy = fbm(u + 8.3, v + 2.8, P) * 2.2;
      const n = fbm(u + wx, v + wy, P);
      const m = fbm(u * 1.75 + 11, v * 1.75 + 5, P * 1.75);
      const dens = Math.max(0, n - 0.38) * 2.4;
      const mix = (a, b, t) => a + (b - a) * t;
      let r = deep[0], gg = deep[1], b = deep[2];
      const t1 = Math.min(1, dens);
      const col = m > 0.5 ? magenta : violet;
      r = mix(r, col[0], t1); gg = mix(gg, col[1], t1); b = mix(b, col[2], t1);
      const t2 = Math.max(0, Math.min(1, (m - 0.55) * 3)) * t1;
      r = mix(r, teal[0], t2 * 0.6); gg = mix(gg, teal[1], t2 * 0.8); b = mix(b, teal[2], t2);
      const hot = Math.max(0, dens - 0.75) * 1.5;
      r = mix(r, glow[0], Math.min(1, hot) * 0.5); gg = mix(gg, glow[1], Math.min(1, hot) * 0.35); b = mix(b, glow[2], Math.min(1, hot) * 0.45);
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

function planetTexture(seed, palette) {
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  // Banded gas giant: horizontal stripes with wobble.
  for (let y = 0; y < 256; y++) {
    const band = Math.sin(y * 0.09 + Math.sin(y * 0.031) * 3) * 0.5 + 0.5;
    const col = palette[Math.floor(band * (palette.length - 1) + rand() * 0.6) % palette.length];
    g.fillStyle = col;
    g.fillRect(0, y, 512, 1);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${rand() * 0.06})`;
    const y = rand() * 256, h = 2 + rand() * 10;
    g.fillRect(0, y, 512, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function atmosphere(radius, color) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); gl_FragColor = vec4(color * f * 1.4, f); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.04, 48, 32), mat);
}

export function createSky(scene, { touch = false } = {}) {
  scene.background = touch ? nebulaTexture(7, 512, 256) : nebulaTexture();
  scene.backgroundIntensity = 0.9;

  const group = new THREE.Group();
  const planets = [
    { pos: [-1000, -1200, -1500], r: 260, seed: 3, pal: ['#3b1d5e', '#5a2f86', '#8a4fb0', '#c38bd8', '#5a2f86'], atm: 0xb07cff, ring: true },
    { pos: [1100, -1000, 300], r: 150, seed: 9, pal: ['#0f3d52', '#16607a', '#2a8fa8', '#7fd1e0'], atm: 0x5fd8ff, ring: false },
  ];
  for (const p of planets) {
    const mat = new THREE.MeshStandardMaterial({ map: planetTexture(p.seed, p.pal), color: 0x8a8a9a, roughness: 1, metalness: 0, fog: false, envMapIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.r, 64, 40), mat);
    mesh.rotation.z = 0.35;
    mesh.position.set(...p.pos);
    group.add(mesh);
    const atm = atmosphere(p.r, p.atm);
    atm.position.copy(mesh.position);
    group.add(atm);
    if (p.ring) {
      const rg = new THREE.RingGeometry(p.r * 1.35, p.r * 2.1, 128, 1);
      const pos = rg.attributes.position;
      const uv = rg.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const d = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (d - p.r * 1.35) / (p.r * 0.75), 0.5);
      }
      const rc = document.createElement('canvas');
      rc.width = 256; rc.height = 1;
      const rcg = rc.getContext('2d');
      const rand = mulberry32(p.seed + 1);
      for (let x = 0; x < 256; x++) {
        const a = (0.15 + rand() * 0.5) * Math.sin((x / 256) * Math.PI);
        rcg.fillStyle = `rgba(190,160,230,${a * 0.4})`;
        rcg.fillRect(x, 0, 1, 1);
      }
      const rtex = new THREE.CanvasTexture(rc);
      rtex.colorSpace = THREE.SRGBColorSpace;
      const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rtex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      ring.position.copy(mesh.position);
      ring.rotation.set(-Math.PI / 2 + 0.45, 0.2, 0);
      group.add(ring);
    }
  }
  // Key light for the planets only would need layers; the scene sun lights them well enough.
  scene.add(group);
  return group;
}
