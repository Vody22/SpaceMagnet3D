// Procedural sound effects with WebAudio: nothing to download.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastPickup = 0;
    this.lastCoin = 0;
  }

  // Browsers only allow audio after a user gesture.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // master -> compressor -> out, so stacked effects never clip.
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 6;
    this.comp.connect(this.ctx.destination);
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 1;
    this.out.connect(this.comp);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.out);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.35;
    this.musicBus.connect(this.out);
    this.startHums();
    if (this.onUnlock) this.onUnlock(this.ctx, this.musicBus);
  }

  // Continuous engine and magnet hums, driven every frame by setLoops().
  startHums() {
    const c = this.ctx;
    const mk = (type, freq, cutoff) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master);
      o.start();
      return { o, f, g };
    };
    this.engine = mk('sawtooth', 48, 300);
    this.engine2 = mk('square', 72.5, 200);
    this.magnet = mk('sine', 110, 2000);
    const lfo = c.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain).connect(this.magnet.o.frequency);
    lfo.start();
  }

  setLoops(speed01, pulling, dashing) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const e = Math.min(1, speed01);
    this.engine.g.gain.setTargetAtTime(0.03 + e * 0.07, t, 0.1);
    this.engine.f.frequency.setTargetAtTime(220 + e * 900 + (dashing ? 1500 : 0), t, 0.08);
    this.engine.o.frequency.setTargetAtTime(44 + e * 30, t, 0.1);
    this.engine2.g.gain.setTargetAtTime(0.015 + e * 0.03, t, 0.1);
    this.engine2.o.frequency.setTargetAtTime(66 + e * 45, t, 0.1);
    this.magnet.g.gain.setTargetAtTime(pulling ? 0.05 : 0, t, 0.08);
  }

  setMuted(m) {
    this.muted = m;
    if (this.out) this.out.gain.value = m ? 0 : 1;
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.4, cutoff = 900) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  // Pitch climbs with the combo so long sweeps sound increasingly exciting.
  pickup(combo, kind) {
    const now = performance.now();
    if (now - this.lastPickup < 35) return;
    this.lastPickup = now;
    // Climb a pentatonic scale with the combo: always musical, never grating.
    const PENTA = [0, 2, 4, 7, 9];
    const step = Math.min(combo, 14);
    const semis = PENTA[step % 5] + 12 * Math.floor(step / 5);
    const f = 440 * Math.pow(2, semis / 12) * (kind >= 2 ? 2 : 1);
    this.tone(f, 0.11, { type: 'triangle', vol: 0.16 });
    this.tone(f * 2, 0.06, { type: 'sine', vol: 0.05 });
  }

  coin(kind) {
    const now = performance.now();
    if (now - this.lastCoin < 40) return;
    this.lastCoin = now;
    const f = kind >= 2 ? 1568 : 1175;
    this.tone(f, 0.08, { type: 'square', vol: 0.06 });
    this.tone(f * 1.5, 0.12, { type: 'square', vol: 0.05, delay: 0.05 });
  }

  saleComplete(best) {
    const notes = best ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.07 }));
  }

  upgrade() {
    [392, 523, 659, 784].forEach((n, i) => this.tone(n, 0.14, { type: 'sawtooth', vol: 0.08, delay: i * 0.05 }));
    this.tone(1568, 0.4, { type: 'sine', vol: 0.12, delay: 0.2 });
  }

  hit() {
    this.noise(0.4, 0.6, 700);
    this.tone(140, 0.35, { type: 'sawtooth', vol: 0.2, slide: 0.4 });
  }

  full() {
    this.tone(330, 0.12, { type: 'square', vol: 0.08 });
    this.tone(247, 0.2, { type: 'square', vol: 0.08, delay: 0.12 });
  }

  dock() { this.tone(660, 0.15, { type: 'sine', vol: 0.15, slide: 1.5 }); }
}

Object.assign(Sfx.prototype, {
  alert() {
    this.tone(880, 0.12, { type: 'square', vol: 0.07 });
    this.tone(660, 0.12, { type: 'square', vol: 0.07, delay: 0.14 });
    this.tone(880, 0.12, { type: 'square', vol: 0.07, delay: 0.28 });
  },
  steal() {
    this.tone(600, 0.35, { type: 'sawtooth', vol: 0.12, slide: 0.3 });
    this.noise(0.2, 0.25, 1500);
  },
  reclaim() {
    [440, 660, 880, 1320].forEach((n, i) => this.tone(n, 0.12, { type: 'triangle', vol: 0.15, delay: i * 0.05 }));
  },
  zap() {
    this.tone(1400, 0.15, { type: 'sawtooth', vol: 0.05, slide: 0.25 });
  },
  objective() {
    [784, 988, 1175, 1568].forEach((n, i) => this.tone(n, 0.16, { type: 'sine', vol: 0.18, delay: i * 0.08 }));
  },
  rankUp() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((n, i) => this.tone(n, 0.2, { type: 'triangle', vol: 0.18, delay: i * 0.09 }));
  },
});

Object.assign(Sfx.prototype, {
  dash() {
    this.noise(0.25, 0.3, 2400);
    this.tone(220, 0.25, { type: 'sawtooth', vol: 0.08, slide: 3 });
  },
});
