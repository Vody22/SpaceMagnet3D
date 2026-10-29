import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Quality presets. "auto" starts from a device guess and steps down if the frame rate is low.
const PRESETS = {
  high: { bloom: true, bloomScale: 0.5, pixelRatio: 2 },
  medium: { bloom: true, bloomScale: 0.35, pixelRatio: 1.25 },
  low: { bloom: false, bloomScale: 0, pixelRatio: 1 },
};
const ORDER = ['high', 'medium', 'low'];

export class Post {
  constructor(renderer, scene, camera, { touch }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.mode = 'auto';
    this.level = touch ? 'medium' : 'high';
    this.samples = [];
    this.settled = false;
    this.onChange = null;
  }

  setMode(mode) {
    this.mode = mode;
    this.samples = [];
    this.settled = mode !== 'auto';
    this.apply(mode === 'auto' ? this.level : mode);
  }

  apply(level) {
    this.current = level;
    const p = PRESETS[level];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, p.pixelRatio));
    this.resize();
    if (this.onChange) this.onChange(level);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const p = PRESETS[this.current || 'high'];
    if (p.bloom) this.bloom.resolution.set(Math.max(64, w * p.bloomScale), Math.max(64, h * p.bloomScale));
  }

  // Adaptive quality: average the frame rate over ~2 s windows and step down while it is low.
  sample(dt) {
    if (this.mode !== 'auto' || this.settled) return;
    this.samples.push(dt);
    const total = this.samples.reduce((a, b) => a + b, 0);
    if (total < 2) return;
    const fps = this.samples.length / total;
    this.samples = [];
    if (fps < 40) {
      const i = ORDER.indexOf(this.current);
      if (i < ORDER.length - 1) { this.level = ORDER[i + 1]; this.apply(this.level); return; }
    }
    this.settled = fps >= 40 || this.current === 'low';
  }

  render() {
    if (PRESETS[this.current].bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
