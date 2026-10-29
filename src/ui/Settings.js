// Small settings menu (sound, music, graphics quality), remembered per browser.
const KEY = 'space-magnet-3d/settings';
const QUALITIES = ['auto', 'high', 'medium', 'low'];

export function loadSettings() {
  const def = { sound: true, music: true, quality: 'auto' };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      sound: typeof s.sound === 'boolean' ? s.sound : def.sound,
      music: typeof s.music === 'boolean' ? s.music : def.music,
      quality: QUALITIES.includes(s.quality) ? s.quality : def.quality,
    };
  } catch {
    return def;
  }
}

function persist(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: keep in memory */ }
}

export class Settings {
  constructor(settings, onChange) {
    this.s = settings;
    this.onChange = onChange;
    this.panel = document.querySelector('#settings');
    this.btn = document.querySelector('#settings-btn');
    this.sound = document.querySelector('#set-sound');
    this.music = document.querySelector('#set-music');
    this.quality = document.querySelector('#set-quality');
    const stop = (fn) => (e) => { e.stopPropagation(); e.preventDefault(); fn(); };
    this.btn.addEventListener('pointerdown', stop(() => { this.panel.hidden = !this.panel.hidden; }));
    this.sound.addEventListener('pointerdown', stop(() => this.set('sound', !this.s.sound)));
    this.music.addEventListener('pointerdown', stop(() => this.set('music', !this.s.music)));
    this.quality.addEventListener('pointerdown', stop(() => this.set('quality', QUALITIES[(QUALITIES.indexOf(this.s.quality) + 1) % QUALITIES.length])));
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.render();
  }

  set(key, value) {
    this.s[key] = value;
    persist(this.s);
    this.render();
    this.onChange(this.s, key);
  }

  render(currentLevel) {
    this.sound.textContent = this.s.sound ? 'ON' : 'OFF';
    this.music.textContent = this.s.music ? 'ON' : 'OFF';
    if (currentLevel) this.level = currentLevel;
    const q = this.s.quality.toUpperCase();
    this.quality.textContent = this.s.quality === 'auto' && this.level ? `AUTO (${this.level.toUpperCase()})` : q;
    for (const [el, on] of [[this.sound, this.s.sound], [this.music, this.s.music]]) el.classList.toggle('off', !on);
  }
}
