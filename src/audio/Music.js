// Procedural ambient music: slow pad chords, a soft arpeggio and a pulse bass,
// scheduled ahead with WebAudio (no audio files to download).
const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [48, 52, 55, 59], // Cmaj7
  [55, 59, 62, 65], // G7
];
const BPM = 96;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Music {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  attach(ctx, bus) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.enabled ? 1 : 0;
    this.bus.connect(bus);
    // A gentle feedback delay gives the arpeggio space.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / BPM) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.bus);
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.bus) this.bus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.3);
  }

  voice(freq, t, dur, { type = 'sine', vol = 0.1, attack = 0.01, cutoff = 4000, toDelay = false }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.bus);
    if (toDelay) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  schedule() {
    if (!this.ctx || !this.enabled) { if (this.ctx) this.nextTime = this.ctx.currentTime + 0.1; return; }
    const eighth = 60 / BPM / 2;
    while (this.nextTime < this.ctx.currentTime + 0.4) {
      const t = this.nextTime;
      const bar = Math.floor(this.step / 16);
      const chord = CHORDS[bar % CHORDS.length];
      const inBar = this.step % 16;
      if (inBar === 0) {
        for (const n of chord) {
          this.voice(midi(n), t, eighth * 16, { type: 'sawtooth', vol: 0.018, attack: 1.2, cutoff: 900 });
          this.voice(midi(n) * 1.004, t, eighth * 16, { type: 'sawtooth', vol: 0.014, attack: 1.4, cutoff: 700 });
        }
      }
      if (inBar % 4 === 0) this.voice(midi(chord[0] - 24), t, eighth * 3, { type: 'triangle', vol: 0.09, attack: 0.02, cutoff: 400 });
      // Arpeggio: up and down the chord, sparser on odd bars.
      if (bar % 2 === 0 || inBar % 2 === 0) {
        const pattern = [0, 1, 2, 3, 2, 1, 3, 2];
        const n = chord[pattern[inBar % 8]] + 12;
        this.voice(midi(n), t, eighth * 1.6, { type: 'triangle', vol: 0.035, attack: 0.005, cutoff: 2500, toDelay: true });
      }
      this.step++;
      this.nextTime += eighth;
    }
  }
}
