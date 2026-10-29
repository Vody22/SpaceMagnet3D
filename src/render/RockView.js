import * as THREE from 'three';
import { mulberry32 } from '../sim/rng.js';

export class RockView {
  constructor(scene, count) {
    const rand = mulberry32(77);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    // Lumpy asteroid: push vertices in/out (keeping shared positions consistent).
    const cache = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!cache.has(key)) cache.set(key, 0.78 + rand() * 0.4);
      const k = cache.get(key);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a4438, emissive: 0x2a0904, emissiveIntensity: 0.5, roughness: 0.95, metalness: 0.05, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Warning halos so hazards read at a glance.
    const ringGeo = new THREE.RingGeometry(1.05, 1.2, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.halo = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), count);
    this.halo.frustumCulled = false;
    scene.add(this.halo);

    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  update(world, alpha, time) {
    const { m, q, e, p, s } = this;
    const rocks = world.rocks;
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      p.set(r.px + (r.x - r.px) * alpha, 0, r.pz + (r.z - r.pz) * alpha);
      e.set(r.rot * 0.7, r.rot, r.rot * 0.3);
      q.setFromEuler(e);
      s.setScalar(r.r);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(i, m);
      q.identity();
      p.y = -0.8;
      s.setScalar(r.r * (1.05 + Math.sin(time * 4 + i) * 0.04));
      m.compose(p, q, s);
      this.halo.setMatrixAt(i, m);
    }
    this.mesh.count = this.halo.count = rocks.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.halo.instanceMatrix.needsUpdate = true;
  }
}
