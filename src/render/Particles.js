import * as THREE from 'three';
import { glowTexture } from './textures.js';

// Pooled additive particles in a single draw call.
export class Particles {
  constructor(scene, max = 3000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.base = new Float32Array(max * 3);
    this.drag = new Float32Array(max);
    this.cursor = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, scale: { value: 300 } },
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vColor; uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * t.a, t.a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
    this.color = new THREE.Color();
  }

  setScale(px) { this.points.material.uniforms.scale.value = px; }

  emit(x, y, z, vx, vy, vz, color, size, life, drag = 2) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.color.set(color);
    this.base[i * 3] = this.color.r; this.base[i * 3 + 1] = this.color.g; this.base[i * 3 + 2] = this.color.b;
    this.life[i] = this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.drag[i] = drag;
  }

  burst(x, y, z, color, count, speed, size = 1, life = 0.6) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - u * u) * speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s, u * speed * 0.6, Math.sin(a) * s, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6));
    }
  }

  update(dt) {
    const { pos, vel, life, maxLife, size, baseSize, col, base, drag } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { size[i] = 0; continue; }
      life[i] -= dt;
      const t = Math.max(0, life[i] / maxLife[i]);
      const k = Math.exp(-drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 1] *= k; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] = baseSize[i] * (0.3 + 0.7 * t);
      col[i * 3] = base[i * 3] * t; col[i * 3 + 1] = base[i * 3 + 1] * t; col[i * 3 + 2] = base[i * 3 + 2] * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}
