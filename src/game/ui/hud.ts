import type { Race } from '../race/race';
import type { Kart } from '../kart/kart';
import type { ViewRect } from '../render/renderer';
import { itemSvg } from './icons';
import type { ItemKind } from '../items/itemTypes';
import { formatTime } from '../core/math';

const ITEMS: ItemKind[] = ['mushroom', 'banana', 'green', 'red', 'star', 'triple'];
const suffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

class ViewHud {
  readonly el: HTMLDivElement;
  private item: HTMLDivElement;
  private hint: HTMLDivElement;
  private lap: HTMLDivElement;
  private pos: HTMLDivElement;
  private banner: HTMLDivElement;
  private bannerTimer = 0;
  private lastPos = 0;
  private lastItemKey = '';
  private rouletteIdx = 0;
  private rouletteT = 0;
  private wrongWay = 0;

  constructor(
    parent: HTMLElement,
    readonly kart: Kart,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'view';
    this.el.style.setProperty('--pc', kart.color);
    this.el.innerHTML = `
      <div class="hud-item"></div>
      <div class="hud-hint"></div>
      <div class="hud-lap"></div>
      <div class="hud-pos"></div>
      <div class="hud-tag">P${kart.playerIndex + 1}</div>
      <div class="hud-banner"></div>`;
    this.item = this.el.querySelector('.hud-item')!;
    this.hint = this.el.querySelector('.hud-hint')!;
    this.lap = this.el.querySelector('.hud-lap')!;
    this.pos = this.el.querySelector('.hud-pos')!;
    this.banner = this.el.querySelector('.hud-banner')!;
    parent.appendChild(this.el);
  }

  layout(r: ViewRect, soloTag: boolean) {
    Object.assign(this.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    const u = Math.min(r.w * 0.6, r.h) / 100;
    this.el.style.setProperty('--u', `${u}px`);
    (this.el.querySelector('.hud-tag') as HTMLElement).style.display = soloTag ? 'none' : '';
  }

  showBanner(text: string, cls = '', seconds = 2) {
    this.banner.textContent = text;
    this.banner.className = `hud-banner show ${cls}`;
    this.bannerTimer = seconds;
  }

  update(dt: number, race: Race, heldKind: ItemKind | null) {
    const k = this.kart;

    // Item slot
    let key: string;
    if (k.rouletteTimer > 0) {
      this.rouletteT -= dt;
      if (this.rouletteT <= 0) {
        this.rouletteT = 0.07;
        this.rouletteIdx = (this.rouletteIdx + 1) % ITEMS.length;
      }
      key = `r${this.rouletteIdx}`;
    } else if (k.item) key = `i${k.item}${k.itemCount}`;
    else if (heldKind) key = `h${heldKind}`;
    else key = '';
    if (key !== this.lastItemKey) {
      this.lastItemKey = key;
      const kind = k.rouletteTimer > 0 ? ITEMS[this.rouletteIdx] : k.item ?? heldKind;
      this.item.innerHTML = kind ? itemSvg(kind) + (k.item === 'triple' && k.itemCount > 1 ? `<div class="count">×${k.itemCount}</div>` : '') : '';
      this.item.classList.toggle('spinning', k.rouletteTimer > 0);
      this.item.classList.toggle('held', !!heldKind && !k.item);
      this.hint.textContent = heldKind
        ? heldKind === 'banana'
          ? 'Release: drop · hold Brake: throw ahead'
          : 'Release: fire · hold Brake: fire behind'
        : '';
    }

    // Lap + time
    const lap = Math.min(race.laps, Math.max(1, k.lap));
    const t = k.finished ? k.finishTime : race.racing ? race.clock : 0;
    this.lap.innerHTML = `<small>LAP</small> ${lap}<small>/${race.laps}</small><span class="hud-time">${formatTime(t)}</span>`;

    // Position
    if (k.position !== this.lastPos) {
      this.pos.innerHTML = `${k.position}<sup>${suffix(k.position)}</sup>`;
      this.pos.className = `hud-pos p${Math.min(4, k.position)} bump`;
      setTimeout(() => this.pos.classList.remove('bump'), 150);
      this.lastPos = k.position;
    }

    // Wrong way
    if (race.racing && !k.finished && k.respawnTimer <= 0) {
      const f = k.forward;
      const dot = f.x * k.tp.tan.x + f.z * k.tp.tan.z;
      this.wrongWay = dot < -0.4 && Math.abs(k.speed) > 3 ? this.wrongWay + dt : 0;
      if (this.wrongWay > 1.2 && this.bannerTimer <= 0) this.showBanner('WRONG WAY!', 'warn', 0.6);
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
  }
}

/** Top-down track map with racer dots. */
class Minimap {
  readonly canvas = document.createElement('canvas');
  private base = document.createElement('canvas');
  private size = 200;
  private scale = 1;
  private ox = 0;
  private oz = 0;

  constructor(
    parent: HTMLElement,
    private race: Race,
  ) {
    this.canvas.className = 'minimap';
    parent.appendChild(this.canvas);
  }

  layout(x: number, y: number, size: number) {
    const dpr = Math.min(2, window.devicePixelRatio);
    this.size = size;
    Object.assign(this.canvas.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
    this.canvas.width = this.canvas.height = size * dpr;
    this.base.width = this.base.height = size * dpr;
    const b = this.race.track.bounds;
    const w = b.max.x - b.min.x;
    const h = b.max.z - b.min.z;
    this.scale = ((size - 20) * dpr) / Math.max(w, h);
    this.ox = (size * dpr - w * this.scale) / 2;
    this.oz = (size * dpr - h * this.scale) / 2;
    const g = this.base.getContext('2d')!;
    g.clearRect(0, 0, this.base.width, this.base.height);
    g.lineJoin = g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      this.race.track.samples.forEach((s, i) => {
        const [px, py] = this.P(s.pos.x, s.pos.z);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.closePath();
    };
    path();
    g.strokeStyle = 'rgba(21,18,42,0.75)';
    g.lineWidth = 11 * dpr;
    g.stroke();
    path();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 5 * dpr;
    g.stroke();
    const [sx, sy] = this.P(this.race.track.samples[0].pos.x, this.race.track.samples[0].pos.z);
    g.fillStyle = '#15122a';
    g.fillRect(sx - 5 * dpr, sy - 2 * dpr, 10 * dpr, 4 * dpr);
  }

  private P(x: number, z: number): [number, number] {
    const b = this.race.track.bounds;
    return [this.ox + (b.max.x - x) * this.scale, this.oz + (b.max.z - z) * this.scale];
  }

  draw() {
    const g = this.canvas.getContext('2d')!;
    const dpr = this.canvas.width / this.size;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.base, 0, 0);
    const karts = [...this.race.karts].sort((a, b) => (a.isHuman ? 1 : 0) - (b.isHuman ? 1 : 0) || b.position - a.position);
    for (const k of karts) {
      const [x, y] = this.P(k.pos.x, k.pos.z);
      const r = (k.isHuman ? 6 : 3.6) * dpr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = k.isHuman ? k.color : k.char.kart;
      g.fill();
      g.lineWidth = (k.isHuman ? 2.5 : 1.5) * dpr;
      g.strokeStyle = k.isHuman ? '#fff' : '#15122a';
      g.stroke();
      if (k.isHuman) {
        g.font = `bold ${11 * dpr}px Nunito, sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.strokeStyle = '#15122a';
        g.lineWidth = 3 * dpr;
        g.strokeText(`${k.playerIndex + 1}`, x, y - r - 3 * dpr);
        g.fillText(`${k.playerIndex + 1}`, x, y - r - 3 * dpr);
      }
    }
    for (const p of this.race.items.projectiles) {
      if (!p.alive || p.held) continue;
      const [x, y] = this.P(p.pos.x, p.pos.z);
      g.fillStyle = p.kind === 'banana' ? '#ffe14d' : p.kind === 'green' ? '#2fd14a' : '#ff3040';
      g.fillRect(x - 2 * dpr, y - 2 * dpr, 4 * dpr, 4 * dpr);
    }
  }
}

export class Hud {
  readonly root = document.createElement('div');
  readonly views: ViewHud[] = [];
  private minimap: Minimap;
  private countdown = document.createElement('div');
  private lastCount = '';

  constructor(
    parent: HTMLElement,
    private race: Race,
    title: { t1: string; t2: string },
  ) {
    parent.appendChild(this.root);
    for (const k of race.humans) this.views.push(new ViewHud(this.root, k));
    this.minimap = new Minimap(this.root, race);
    this.countdown.className = 'countdown';
    this.root.appendChild(this.countdown);
    const tt = document.createElement('div');
    tt.className = 'race-title';
    tt.innerHTML = `<div class="t1">${title.t1}</div><div class="t2">${title.t2}</div>`;
    this.root.appendChild(tt);
    setTimeout(() => tt.remove(), 3300);
  }

  layout(rects: ViewRect[], W: number, H: number) {
    const n = this.views.length;
    this.views.forEach((v, i) => v.layout(rects[i], n === 1));
    if (n <= 1) this.minimap.layout(16, H - Math.min(230, H * 0.34) - 16, Math.min(230, H * 0.34));
    else if (n === 2) {
      const s = Math.min(170, H * 0.26);
      this.minimap.layout(W - s - Math.max(150, W * 0.14), H / 2 - s / 2, s);
    } else if (n === 3) {
      const r = rects[3];
      const s = Math.min(r.w, r.h) * 0.92;
      this.minimap.layout(r.x + (r.w - s) / 2, r.y + (r.h - s) / 2, s);
    }
    // Four players: no room for a map without covering someone's HUD.
    this.minimap.canvas.style.display = n >= 4 ? 'none' : '';
  }

  banner(k: Kart, text: string, cls = '', seconds = 2) {
    this.views.find((v) => v.kart === k)?.showBanner(text, cls, seconds);
  }

  update(dt: number) {
    const race = this.race;
    for (const v of this.views) {
      const held = race.items.projectiles.find((p) => p.alive && p.held && p.owner === v.kart);
      v.update(dt, race, held?.kind ?? null);
    }
    this.minimap.draw();

    let count = '';
    if (race.phase === 'countdown') count = String(Math.max(1, Math.ceil(race.countdown)));
    else if (race.phase === 'racing' && race.clock < 1.2) count = 'GO!';
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.countdown.innerHTML = count ? `<span class="${count === 'GO!' ? 'go' : ''}">${count}</span>` : '';
    }
  }

  destroy() {
    this.root.remove();
  }
}
