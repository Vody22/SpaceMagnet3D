import { UPGRADES, ZONES } from '../sim/config.js';
import { upgradeCost, isMaxed } from '../sim/economy.js';
import { zoneIndex } from '../sim/World.js';

const $ = (sel) => document.querySelector(sel);

function fmt(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.floor(n)}`;
}

export class Hud {
  constructor(onBuy, onMute) {
    this.money = $('#money');
    this.cargoFill = $('#cargo-fill');
    this.cargoText = $('#cargo-text');
    this.cargoValue = $('#cargo-value');
    this.best = $('#best');
    this.zone = $('#zone');
    this.banner = $('#banner');
    this.hint = $('#hint');
    this.arrow = $('#home-arrow');
    this.arrowDist = $('#home-dist');
    this.shop = $('#shop');
    this.popups = $('#popups');
    this.muteBtn = $('#mute');
    this.lastShopKey = '';
    this.bannerTimer = 0;
    this.displayMoney = 0;

    this.cards = UPGRADES.map((u, i) => {
      const el = document.createElement('button');
      el.className = 'card';
      el.dataset.id = u.id;
      el.innerHTML = `<span class="key">${i + 1}</span><span class="name">${u.name}</span><span class="lvl"></span><span class="val"></span><span class="cost"></span>`;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onBuy(u.id); });
      this.shop.querySelector('.cards').appendChild(el);
      return { u, el, lvl: el.querySelector('.lvl'), val: el.querySelector('.val'), cost: el.querySelector('.cost') };
    });
    this.muteBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); onMute(); });

    this.popupPool = [];
    for (let i = 0; i < 40; i++) {
      const d = document.createElement('div');
      d.className = 'popup';
      this.popups.appendChild(d);
      this.popupPool.push(d);
    }
    this.popupCursor = 0;
  }

  // A coin flies from the station to the credits counter, which bumps on arrival.
  flyCoin(fromX, fromY) {
    if (!this.coinPool) {
      this.coinPool = [];
      const layer = document.querySelector('#coins');
      for (let i = 0; i < 24; i++) {
        const c = document.createElement('div');
        c.className = 'coin';
        c.style.display = 'none';
        layer.appendChild(c);
        this.coinPool.push(c);
      }
      this.coinCursor = 0;
      this.moneyPanel = document.querySelector('#money-panel');
    }
    const c = this.coinPool[this.coinCursor];
    this.coinCursor = (this.coinCursor + 1) % this.coinPool.length;
    const r = this.money.getBoundingClientRect();
    const tx = r.left + 14, ty = r.top + r.height / 2;
    const mx = (fromX + tx) / 2 + (Math.random() - 0.5) * 160, my = Math.min(fromY, ty) - 60 - Math.random() * 80;
    c.style.display = 'block';
    const anim = c.animate([
      { transform: `translate(${fromX}px, ${fromY}px) scale(0.4)` },
      { transform: `translate(${mx}px, ${my}px) scale(1.2)`, offset: 0.45 },
      { transform: `translate(${tx}px, ${ty}px) scale(0.6)` },
    ], { duration: 650 + Math.random() * 200, easing: 'cubic-bezier(0.5, 0, 0.6, 1)' });
    anim.onfinish = () => {
      c.style.display = 'none';
      this.moneyPanel.classList.remove('bump');
      void this.moneyPanel.offsetWidth;
      this.moneyPanel.classList.add('bump');
    };
  }

  setCombo(n, sx, sy) {
    if (!this.comboEl) this.comboEl = document.querySelector('#combo');
    const show = n >= 3;
    this.comboEl.classList.toggle('show', show);
    if (!show) return;
    if (this.lastCombo !== n) {
      this.lastCombo = n;
      this.comboEl.innerHTML = `x${n}<small>COMBO</small>`;
      this.comboEl.animate([{ scale: 1.35 }, { scale: 1 }], { duration: 160, easing: 'ease-out' });
    }
    this.comboEl.style.left = `${sx}px`;
    this.comboEl.style.top = `${sy}px`;
  }

  setMuted(m) { this.muteBtn.textContent = m ? '🔇' : '🔊'; }

  popup(text, sx, sy, cls = '') {
    const d = this.popupPool[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % this.popupPool.length;
    d.className = 'popup';
    void d.offsetWidth; // restart the CSS animation
    d.className = `popup show ${cls}`;
    d.textContent = text;
    d.style.left = `${sx}px`;
    d.style.top = `${sy}px`;
  }

  showBanner(html, seconds = 2, cls = '') {
    this.banner.innerHTML = html;
    this.banner.className = `show ${cls}`;
    this.bannerTimer = seconds;
  }

  hideHint() { this.hint.classList.add('hidden'); }

  update(world, dt, homeScreen) {
    const p = world.progress;
    // Count the money display up smoothly for a satisfying tick.
    this.displayMoney += (p.money - this.displayMoney) * Math.min(1, dt * 10);
    if (Math.abs(p.money - this.displayMoney) < 0.5) this.displayMoney = p.money;
    this.money.textContent = `$${fmt(Math.round(this.displayMoney))}`;

    const cap = world.stats.capacity;
    const n = world.cargoCount;
    this.cargoFill.style.width = `${Math.min(100, (n / cap) * 100)}%`;
    this.cargoFill.classList.toggle('full', n >= cap);
    this.cargoText.textContent = `${n} / ${cap}`;
    this.cargoValue.textContent = n ? `+$${fmt(world.cargoValue)}` : '';
    this.best.textContent = `$${fmt(p.stats.bestHaul)}`;

    const z = zoneIndex(Math.hypot(world.ship.x, world.ship.z));
    this.zone.textContent = ZONES[z].name;
    this.zone.style.color = `#${ZONES[z].color.toString(16).padStart(6, '0')}`;

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.className = '';
    }

    // Arrow pointing home when the station is far.
    if (homeScreen.visible) {
      this.arrow.style.display = 'none';
    } else {
      this.arrow.style.display = 'flex';
      this.arrow.style.left = `${homeScreen.x}px`;
      this.arrow.style.top = `${homeScreen.y}px`;
      this.arrow.querySelector('.tri').style.transform = `rotate(${homeScreen.angle}rad)`;
      this.arrowDist.textContent = `${Math.round(homeScreen.dist)}m`;
      this.arrow.classList.toggle('urgent', n >= cap);
    }

    this.shop.classList.toggle('open', world.docked);
    if (world.docked) {
      const key = `${p.money}|${Object.values(p.levels).join(',')}`;
      if (key !== this.lastShopKey) {
        this.lastShopKey = key;
        for (const c of this.cards) {
          const lvl = p.levels[c.u.id];
          const maxed = isMaxed(p, c.u.id);
          const cost = upgradeCost(c.u.id, lvl);
          c.lvl.textContent = maxed ? 'MAX' : `Lv ${lvl + 1}`;
          c.val.textContent = maxed ? c.u.format(c.u.value(lvl)) : `${c.u.format(c.u.value(lvl))} → ${c.u.format(c.u.value(lvl + 1))}`;
          c.cost.textContent = maxed ? '—' : `$${fmt(cost)}`;
          c.el.classList.toggle('afford', !maxed && p.money >= cost);
          c.el.classList.toggle('maxed', maxed);
        }
      }
    }
  }

  flashCard(id) {
    const c = this.cards.find((x) => x.u.id === id);
    if (!c) return;
    c.el.classList.remove('bought');
    void c.el.offsetWidth;
    c.el.classList.add('bought');
  }
}
