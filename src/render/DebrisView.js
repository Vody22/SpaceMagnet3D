import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEBRIS_TYPES } from '../sim/config.js';
import { DEAD, FREE, ATTACHED } from '../sim/World.js';

const MAX_PER_TYPE = 2500;

// Small hand-assembled shapes: a few primitives merged per type, still one draw call each.
function piece(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.scale(sx, sy, sz);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function geometryFor(id) {
  switch (id) {
    case 'scrap': // twisted hull plate with a strut
      return mergeGeometries([
        piece(new THREE.BoxGeometry(0.8, 0.18, 0.62), { rz: 0.15 }),
        piece(new THREE.BoxGeometry(0.5, 0.4, 0.2), { x: 0.1, y: 0.2, z: -0.2, ry: 0.4 }),
        piece(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5), { rz: Math.PI / 2, y: -0.12, z: 0.2 }),
      ]);
    case 'crystal': // small crystal cluster
      return mergeGeometries([
        piece(new THREE.OctahedronGeometry(0.4), { sy: 1.7 }),
        piece(new THREE.OctahedronGeometry(0.26), { x: 0.3, y: -0.1, rz: -0.5, sy: 1.6 }),
        piece(new THREE.OctahedronGeometry(0.22), { x: -0.25, y: -0.15, z: 0.12, rz: 0.6, sy: 1.5 }),
      ]);
    case 'core': // power core with a collar
      return mergeGeometries([
        piece(new THREE.IcosahedronGeometry(0.45)),
        piece(new THREE.TorusGeometry(0.55, 0.07, 5, 16), { rx: Math.PI / 2 }),
      ]);
    default: // relic: alien knot
      return piece(new THREE.TorusKnotGeometry(0.34, 0.11, 48, 6));
  }
}

// One InstancedMesh per debris type: free, attached and selling pieces share a draw call.
export class DebrisView {
  constructor(scene) {
    this.meshes = DEBRIS_TYPES.map((t) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: t.emissive, emissiveIntensity: t.id === 'scrap' ? 0.6 : 1.1,
        metalness: t.id === 'core' ? 0.7 : t.id === 'scrap' ? 0.55 : 0.2, roughness: t.id === 'crystal' ? 0.15 : 0.4, flatShading: true,
      });
      const mesh = new THREE.InstancedMesh(geometryFor(t.id), mat, MAX_PER_TYPE);
      // Per-piece tint variation (keyed by debris id, so a piece keeps its tint) so piles don't look cloned.
      const base = new THREE.Color(t.color);
      mesh.userData.tints = [];
      for (let i = 0; i < 64; i++) {
        const k = 0.72 + (((i * 2654435761) >>> 0) % 1000) / 1000 * 0.56;
        mesh.userData.tints.push(base.clone().multiplyScalar(k));
      }
      mesh.setColorAt(0, base);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    });
    this.counts = new Array(DEBRIS_TYPES.length).fill(0);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.tmp = { x: 0, y: 0, z: 0 };
  }

  update(world, alpha, time) {
    this.counts.fill(0);
    const { m, q, e, p, s, tmp } = this;
    for (const d of world.debris) {
      if (d.state === DEAD) continue;
      const i = this.counts[d.type];
      if (i >= MAX_PER_TYPE) continue;
      let scale = d.scale * DEBRIS_TYPES[d.type].size;
      if (d.state === ATTACHED) {
        world.attachedWorldPos(d, tmp, alpha);
        // Freshly caught pieces "pop" before settling.
        const pop = d.attachT < 1 ? 1 + Math.sin(d.attachT * Math.PI) * 0.6 : 1;
        p.set(tmp.x, tmp.y + Math.sin(time * 2.2 + d.slot) * 0.08, tmp.z);
        scale *= pop;
        e.set(d.phase + d.slot * 0.7, d.phase * 2 + world.ship.spin, 0);
      } else {
        p.set(d.px + (d.x - d.px) * alpha, d.py + (d.y - d.py) * alpha, d.pz + (d.z - d.pz) * alpha);
        if (d.state === FREE && !d.pulled) p.y += Math.sin(time * 1.3 + d.phase) * 0.35;
        const spinBoost = d.pulled ? 4 : 1;
        e.set(d.phase + time * d.spinX * spinBoost, d.phase + time * d.spinY * spinBoost, 0);
      }
      q.setFromEuler(e);
      s.setScalar(scale);
      m.compose(p, q, s);
      const mesh = this.meshes[d.type];
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, mesh.userData.tints[d.id & 63]);
      this.counts[d.type] = i + 1;
    }
    for (let t = 0; t < this.meshes.length; t++) {
      this.meshes[t].count = this.counts[t];
      this.meshes[t].instanceMatrix.needsUpdate = true;
      this.meshes[t].instanceColor.needsUpdate = true;
    }
  }
}
