import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PIRATES } from '../sim/config.js';
import { glowTexture } from './textures.js';

const MAX = 12;

// Bake a few primitives into one vertex-colored geometry so each pirate kind is a single InstancedMesh.
function part(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.toNonIndexed();
  g.scale(sx, sy, sz);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

function raiderGeometry() {
  return mergeGeometries([
    part(new THREE.ConeGeometry(0.9, 2.6, 4), 0x2a0f14, { rx: Math.PI / 2, ry: Math.PI / 4, sy: 0.5 }),
    part(new THREE.BoxGeometry(3.2, 0.15, 0.7), 0xd8202e, { z: -0.5 }),
    part(new THREE.ConeGeometry(0.25, 1.2, 4), 0xff3b3b, { x: 1.6, z: -0.2, rx: Math.PI / 2 }),
    part(new THREE.ConeGeometry(0.25, 1.2, 4), 0xff3b3b, { x: -1.6, z: -0.2, rx: Math.PI / 2 }),
    part(new THREE.OctahedronGeometry(0.35), 0xffd000, { y: 0.35, z: 0.2 }),
  ]);
}

function gunnerGeometry() {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(1.4, 1.6, 0.8, 6), 0x24121a),
    part(new THREE.CylinderGeometry(0.9, 1.2, 0.5, 6), 0xb0182a, { y: 0.6 }),
    part(new THREE.BoxGeometry(0.3, 0.3, 2.2), 0x444455, { x: 0.6, y: 0.5, z: 1.1 }),
    part(new THREE.BoxGeometry(0.3, 0.3, 2.2), 0x444455, { x: -0.6, y: 0.5, z: 1.1 }),
    part(new THREE.OctahedronGeometry(0.4), 0xff5a00, { y: 1.0 }),
  ]);
}

export class PirateView {
  constructor(scene) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.5, flatShading: true, emissive: 0x300008 });
    this.meshes = {
      raider: new THREE.InstancedMesh(raiderGeometry(), mat, MAX),
      gunner: new THREE.InstancedMesh(gunnerGeometry(), mat, MAX),
    };
    for (const m of Object.values(this.meshes)) { m.frustumCulled = false; m.count = 0; scene.add(m); }

    const ringGeo = new THREE.RingGeometry(1.0, 1.25, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), MAX);
    this.rings.frustumCulled = false;
    scene.add(this.rings);

    // Muzzle charge glow (telegraphs gunner shots).
    this.charge = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff6a00, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAX);
    this.charge.frustumCulled = false;
    scene.add(this.charge);

    // Bolts.
    this.bolts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb070 }), 64);
    this.bolts.frustumCulled = false;
    scene.add(this.bolts);
    this.boltGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff3a1a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 64);
    this.boltGlow.frustumCulled = false;
    scene.add(this.boltGlow);

    // Tether showing the magnet ripping loot off a fleeing raider.
    const tGeo = new THREE.CylinderGeometry(0.15, 0.15, 1, 6, 1, true);
    tGeo.translate(0, 0.5, 0);
    tGeo.rotateX(Math.PI / 2);
    this.tetherMat = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tether = new THREE.Mesh(tGeo, this.tetherMat);
    this.tether.visible = false;
    scene.add(this.tether);

    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  update(world, alpha, time, camera) {
    const { m, q, p, s, e } = this;
    const counts = { raider: 0, gunner: 0 };
    let rings = 0, charges = 0;
    let tetherTarget = null;
    for (const pr of world.pirates) {
      const x = pr.px + (pr.x - pr.px) * alpha, z = pr.pz + (pr.z - pr.pz) * alpha;
      const mesh = this.meshes[pr.kind];
      const i = counts[pr.kind]++;
      if (i >= MAX) continue;
      const bank = Math.sin(time * 3 + pr.id) * 0.15;
      e.set(0, pr.heading, bank, 'YXZ');
      q.setFromEuler(e);
      p.set(x, Math.sin(time * 2 + pr.id) * 0.2, z);
      s.setScalar(pr.kind === 'gunner' ? 1.1 : 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);

      if (pr.state === 'chase' || pr.state === 'flee') {
        q.identity();
        p.set(x, -0.5, z);
        s.setScalar(PIRATES[pr.kind].radius * (1.6 + Math.sin(time * 10) * 0.15));
        m.compose(p, q, s);
        this.rings.setMatrixAt(rings++, m);
      }
      if (pr.kind === 'gunner' && pr.charging) {
        q.copy(camera.quaternion);
        p.set(x, 1.2, z);
        s.setScalar(2 + Math.random() * 1.5);
        m.compose(p, q, s);
        this.charge.setMatrixAt(charges++, m);
      }
      if (pr.state === 'flee' && pr.reclaim > 0) tetherTarget = { x, z, k: pr.reclaim / PIRATES.raider.reclaimTime };
    }
    for (const k of Object.keys(this.meshes)) { this.meshes[k].count = Math.min(MAX, counts[k]); this.meshes[k].instanceMatrix.needsUpdate = true; }
    this.rings.count = rings; this.rings.instanceMatrix.needsUpdate = true;
    this.charge.count = charges; this.charge.instanceMatrix.needsUpdate = true;

    let b = 0;
    for (const bolt of world.bolts) {
      if (b >= 64) break;
      p.set(bolt.px + (bolt.x - bolt.px) * alpha, 0.5, bolt.pz + (bolt.z - bolt.pz) * alpha);
      q.identity(); s.setScalar(1);
      m.compose(p, q, s);
      this.bolts.setMatrixAt(b, m);
      q.copy(camera.quaternion); s.setScalar(3.2);
      m.compose(p, q, s);
      this.boltGlow.setMatrixAt(b, m);
      b++;
    }
    this.bolts.count = this.boltGlow.count = b;
    this.bolts.instanceMatrix.needsUpdate = true;
    this.boltGlow.instanceMatrix.needsUpdate = true;

    const sh = world.ship;
    if (tetherTarget) {
      const sx = sh.px + (sh.x - sh.px) * alpha, sz = sh.pz + (sh.z - sh.pz) * alpha;
      const dx = tetherTarget.x - sx, dz = tetherTarget.z - sz;
      const len = Math.hypot(dx, dz);
      this.tether.visible = true;
      this.tether.position.set(sx, 0.5, sz);
      this.tether.rotation.set(0, Math.atan2(dx, dz), 0);
      const wob = 1 + Math.sin(time * 40) * 0.3;
      this.tether.scale.set(wob * (1 + tetherTarget.k * 2), wob * (1 + tetherTarget.k * 2), len);
      this.tetherMat.opacity = 0.35 + tetherTarget.k * 0.6;
    } else {
      this.tether.visible = false;
    }
    return tetherTarget;
  }
}
