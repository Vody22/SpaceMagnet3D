// Stage 2 HUD pieces: objectives list, pilot rank and off-screen threat arrows.
import { objectiveText } from '../sim/objectives.js';
import { rankTitle, rankProgress, sellMultiplier } from '../sim/rank.js';

const $ = (sel) => document.querySelector(sel);

export class Panels {
  constructor() {
    this.objList = $('#objectives .list');
    this.rankTitle = $('#rank-title');
    this.rankFill = $('#rank-fill');
    this.rankBonus = $('#rank-bonus');
    this.threats = [];
    const layer = $('#threats');
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'threat';
      el.innerHTML = '<div class="tri"></div><span></span>';
      layer.appendChild(el);
      this.threats.push({ el, tri: el.querySelector('.tri'), label: el.querySelector('span') });
    }
    this.objKey = '';
    this.rankKey = '';
  }

  update(world, threatsOnScreen) {
    const o = world.objectives;
    const key = o.active.map((x) => `${x.type}${x.target}${Math.floor(x.progress)}`).join('|');
    if (key !== this.objKey) {
      this.objKey = key;
      this.objList.innerHTML = '';
      for (const x of o.active) {
        const li = document.createElement('li');
        const pct = Math.min(100, (x.progress / x.target) * 100);
        const showCount = x.type === 'collect' || x.type === 'fullHold' || x.type === 'reclaim';
        li.innerHTML = `<span class="t"></span><span class="r">+$${x.reward}</span><div class="bar"><i style="width:${pct}%"></i></div>`;
        li.querySelector('.t').textContent = objectiveText(x) + (showCount ? `  ${Math.floor(x.progress)}/${x.target}` : '');
        this.objList.appendChild(li);
      }
    }

    const earned = world.progress.stats.totalEarned;
    const rk = `${world.rank}|${Math.floor(rankProgress(earned) * 50)}`;
    if (rk !== this.rankKey) {
      this.rankKey = rk;
      this.rankTitle.textContent = rankTitle(world.rank);
      this.rankFill.style.width = `${Math.min(100, rankProgress(earned) * 100)}%`;
      const bonus = Math.round((sellMultiplier(world.rank) - 1) * 100);
      this.rankBonus.textContent = bonus ? `+${bonus}% sell` : '';
    }

    for (let i = 0; i < this.threats.length; i++) {
      const t = this.threats[i];
      const th = threatsOnScreen[i];
      if (!th) { t.el.style.display = 'none'; continue; }
      t.el.style.display = 'flex';
      t.el.style.left = `${th.x}px`;
      t.el.style.top = `${th.y}px`;
      t.el.className = `threat ${th.loot ? 'loot' : ''}`;
      t.tri.style.transform = `rotate(${th.angle}rad)`;
      t.label.textContent = th.loot ? `LOOT ${th.loot}` : `${Math.round(th.dist)}m`;
    }
  }
}
