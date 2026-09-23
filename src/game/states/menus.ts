import type { App, GameState, Player } from '../core/app';
import type { ServerInfo } from '../../shared/protocol';
import { CHARACTERS, type WeightClass } from '../kart/characters';
import { characterPortraits } from '../ui/portraits';
import { TRACKS } from '../track/tracks';
import { Track } from '../track/track';
import { THEMES } from '../track/themes';
import type { Difficulty } from '../ai/aiDriver';
import { RaceState } from './raceState';
import { ordinal } from '../core/math';

export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const isBack = (a: string) => a === 'back' || a === 'pause';

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export class LobbyState implements GameState {
  private root!: HTMLElement;
  private sig = '';

  constructor(private app: App) {}

  enter() {
    this.app.joinAllowed = true;
    this.root = el(`
      <div class="screen">
        <div class="logo">KART<span>RACER</span></div>
        <div class="lobby">
          <div class="join-card">
            <h3>Scan to play</h3>
            <div class="qr" data-qr></div>
            <div class="url" data-url>Loading…</div>
            <ol class="steps">
              <li>Connect your phone to the same Wi-Fi as this PC.</li>
              <li>Scan the code. When the browser warns about the certificate, choose <b>Advanced → Proceed</b>.</li>
              <li>Press <b>Tap to start</b> on your phone, then hold it sideways.</li>
            </ol>
            <div class="url alt" data-alt style="display:none"></div>
          </div>
          <div>
            <div class="slots" data-slots></div>
            <div class="start-prompt" data-prompt></div>
          </div>
        </div>
        <div class="footer-hint">
          <span>Keyboard: <span class="key">Enter</span> join / start · <span class="key">WASD</span>/<span class="key">Arrows</span> drive · <span class="key">Space</span> drift · <span class="key">E</span> item · <span class="key">Esc</span> pause</span>
          <span>Gamepad: <span class="key">A</span> join · <span class="key">A</span>/<span class="key">RT</span> gas · <span class="key">RB</span> drift · <span class="key">LB</span> item</span>
        </div>
        <div class="sound-hint" data-sound>🔊 Click to enable sound</div>
      </div>`);
    this.app.ui.appendChild(this.root);
    this.root.querySelector('[data-sound]')!.addEventListener('click', () => this.app.sfx.unlock());
    this.root.querySelector('[data-prompt]')!.addEventListener('click', () => this.next());
    fetch('/api/info')
      .then((r) => r.json())
      .then((info: ServerInfo) => {
        this.root.querySelector('[data-qr]')!.innerHTML = info.qrSvg;
        this.root.querySelector('[data-url]')!.textContent = info.controllerUrl;
        if (info.alternateUrls.length) {
          const alt = this.root.querySelector<HTMLElement>('[data-alt]')!;
          alt.style.display = '';
          alt.textContent = `Other network? ${info.alternateUrls.join('  ·  ')}`;
        }
      })
      .catch(() => {
        this.root.querySelector('[data-url]')!.textContent = 'Could not reach the server – is `npm run dev` running?';
      });
    this.sig = '';
  }

  exit() {
    this.app.joinAllowed = false;
    this.root.remove();
  }

  phoneMode(p: Player) {
    return { mode: 'menu' as const, hint: p.index === 0 ? 'Press A when everyone has joined' : 'Waiting for P1 to start…' };
  }

  private next() {
    if (!this.app.session.players.length) {
      this.app.toast('Join with a phone, keyboard (Enter) or gamepad (A) first');
      return;
    }
    this.app.sfx.play('menuOk');
    this.app.setState(new SetupState(this.app));
  }

  update() {
    const app = this.app;
    for (const { player, sourceId, a } of app.menuActions()) {
      const src = app.input.get(sourceId);
      if (a === 'ok') {
        if (!player && src && src.kind !== 'phone') app.addPlayer(sourceId);
        else if (player && (player.index === 0 || sourceId === 'kb')) this.next();
      } else if (a === 'back' && player && src?.kind !== 'phone') {
        app.removePlayer(sourceId);
      }
    }
    this.render();
  }

  private render() {
    const players = this.app.session.players;
    const sig = players.map((p) => `${p.sourceId}:${this.app.input.get(p.sourceId)?.connected}`).join('|') + this.app.sfx.unlocked;
    if (sig === this.sig) return;
    this.sig = sig;
    const slots = this.root.querySelector('[data-slots]')!;
    slots.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const p = players[i];
      if (!p) {
        slots.appendChild(el(`<div class="slot"><div class="pnum">P${i + 1}</div><div class="src">Waiting for player…</div></div>`));
        continue;
      }
      const src = this.app.input.get(p.sourceId);
      const label = src?.kind === 'phone' ? 'Phone controller' : src?.kind === 'gamepad' ? 'Gamepad' : 'Keyboard';
      const online = src?.connected !== false;
      slots.appendChild(
        el(`<div class="slot filled ${online ? '' : 'offline'}" style="--pc:${p.color}">
              <div class="pnum">P${i + 1}</div>
              <div class="src"><span class="status-dot" style="${online ? '' : 'background:#888'}"></span>${label}</div>
            </div>`),
      );
    }
    const prompt = this.root.querySelector('[data-prompt]')!;
    prompt.textContent = players.length ? 'P1: press A / Enter to continue ▶' : 'Scan the QR code to join';
    this.root.querySelector<HTMLElement>('[data-sound]')!.style.display = this.app.sfx.unlocked ? 'none' : '';
  }
}

// ---------------------------------------------------------------------------
// Mode + difficulty
// ---------------------------------------------------------------------------

interface OptRow {
  label: string;
  values?: { id: string; label: string; desc: string }[];
  get?: () => string;
  set?: (id: string) => void;
  action?: () => void;
}

/** A vertical list of option rows navigated with up/down, changed with left/right. */
abstract class OptionScreen implements GameState {
  protected root!: HTMLElement;
  protected sel = 0;
  protected abstract rows(): OptRow[];
  protected abstract title: string;
  protected sub = '';
  protected abstract back(): void;
  protected overlay = false;

  constructor(protected app: App) {}

  enter() {
    this.root = el(`<div class="screen ${this.overlay ? 'over-3d' : ''}">
      <div class="screen-head"><div class="screen-title">${this.title}</div><div class="screen-sub">${this.sub}</div></div>
      <div class="options" data-opts></div>
      <div class="footer-hint"><span><span class="key">▲▼</span> choose · <span class="key">◀▶</span> change · <span class="key">A</span> confirm · <span class="key">B</span> back</span></div>
    </div>`);
    this.app.ui.appendChild(this.root);
    this.render();
  }

  exit() {
    this.root.remove();
  }

  phoneMode(p: Player) {
    return { mode: 'menu' as const, hint: p.index === 0 ? this.title : `P1 is choosing…` };
  }

  /** Who may drive this menu. */
  protected allowed(player: Player | undefined, sourceId: string) {
    return player?.index === 0 || sourceId === 'kb';
  }

  update() {
    const rows = this.rows();
    for (const { player, sourceId, a } of this.app.menuActions()) {
      if (!this.allowed(player, sourceId)) continue;
      const row = rows[this.sel];
      if (a === 'up' || a === 'down') {
        this.sel = (this.sel + (a === 'up' ? -1 : 1) + rows.length) % rows.length;
        this.app.sfx.play('menuMove');
      } else if ((a === 'left' || a === 'right') && row.values) {
        const i = row.values.findIndex((v) => v.id === row.get!());
        const n = row.values.length;
        row.set!(row.values[(i + (a === 'left' ? -1 : 1) + n) % n].id);
        this.app.sfx.play('menuMove');
      } else if (a === 'ok') {
        this.app.sfx.play('menuOk');
        if (row.action) {
          row.action();
          return;
        }
        this.sel = Math.min(rows.length - 1, this.sel + 1);
      } else if (isBack(a)) {
        this.app.sfx.play('menuBack');
        this.back();
        return;
      }
      this.render();
    }
  }

  protected render() {
    const box = this.root.querySelector('[data-opts]')!;
    box.innerHTML = '';
    this.rows().forEach((r, i) => {
      let node: HTMLElement;
      if (r.values) {
        const v = r.values.find((x) => x.id === r.get!()) ?? r.values[0];
        node = el(`<div class="opt ${i === this.sel ? 'sel' : ''}">
          <div>${esc(r.label)}<div class="desc">${esc(v.desc)}</div></div>
          <div class="val"><span class="arrow">◀</span>${esc(v.label)}<span class="arrow">▶</span></div></div>`);
        node.addEventListener('click', () => {
          this.sel = i;
          const k = r.values!.findIndex((x) => x.id === r.get!());
          r.set!(r.values![(k + 1) % r.values!.length].id);
          this.app.sfx.play('menuMove');
          this.render();
        });
      } else {
        node = el(`<div class="opt button ${i === this.sel ? 'sel' : ''}">${esc(r.label)}</div>`);
        node.addEventListener('click', () => r.action?.());
      }
      box.appendChild(node);
    });
  }
}

export class SetupState extends OptionScreen {
  protected title = 'Race setup';
  protected sub = 'P1 chooses';

  protected rows(): OptRow[] {
    const s = this.app.session;
    return [
      {
        label: 'Mode',
        values: [
          { id: 'gp', label: 'Grand Prix', desc: 'All 4 tracks, points decide the cup' },
          { id: 'vs', label: 'Versus', desc: 'Pick any track for a single race' },
        ],
        get: () => s.mode,
        set: (v) => (s.mode = v as 'gp' | 'vs'),
      },
      {
        label: 'Opponents',
        values: [
          { id: 'easy', label: 'Easy', desc: 'Relaxed rivals who rarely drift' },
          { id: 'normal', label: 'Normal', desc: 'A fair fight' },
          { id: 'hard', label: 'Hard', desc: 'Fast, sharp and item-happy' },
        ],
        get: () => s.difficulty,
        set: (v) => (s.difficulty = v as Difficulty),
      },
      { label: 'Choose racers ▶', action: () => this.app.setState(new CharSelectState(this.app)) },
    ];
  }

  protected back() {
    this.app.setState(new LobbyState(this.app));
  }
}

// ---------------------------------------------------------------------------
// Character select
// ---------------------------------------------------------------------------

/** Character groups, left to right. Each is a 3×3 block with one row per weight class. */
const SERIES = ['mario', 'guest'] as const;
const ROWS: WeightClass[] = ['Light', 'Medium', 'Heavy'];
const GROUP_COLS = 3;

/** Character index at each [row][column] of the select grid, with the groups side by side. */
const CHAR_LAYOUT: (number | undefined)[][] = ROWS.map((weightClass) => {
  const row: (number | undefined)[] = [];
  SERIES.forEach((series, g) => {
    CHARACTERS.flatMap((c, i) => (c.series === series && c.weightClass === weightClass ? [i] : []))
      .slice(0, GROUP_COLS)
      .forEach((i, k) => (row[g * GROUP_COLS + k] = i));
  });
  return row;
});

/** Move a character-select cursor one step, wrapping round and skipping empty cells. */
function moveCursor(index: number, dir: 'left' | 'right' | 'up' | 'down'): number {
  const rows = CHAR_LAYOUT.length;
  const cols = SERIES.length * GROUP_COLS;
  let row = CHAR_LAYOUT.findIndex((r) => r.includes(index));
  let col = CHAR_LAYOUT[row].indexOf(index);
  const [dr, dc] = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[dir];
  for (let step = 0; step < rows * cols; step++) {
    row = (row + dr + rows) % rows;
    col = (col + dc + cols) % cols;
    const next = CHAR_LAYOUT[row][col];
    if (next !== undefined) return next;
  }
  return index;
}

export class CharSelectState implements GameState {
  private root!: HTMLElement;
  private cursor = new Map<number, number>();
  private locked = new Set<number>();
  private doneTimer = -1;

  constructor(private app: App) {}

  enter() {
    const portraits = characterPortraits();
    const players = this.app.session.players;
    for (const p of players) this.cursor.set(p.index, Math.max(0, CHARACTERS.findIndex((c) => c.id === p.charId)));
    this.root = el(`<div class="screen">
      <div class="screen-head"><div class="screen-title">Choose your racer</div><div class="screen-sub">Everyone picks on their own controller</div></div>
      <div class="char-grid" data-grid></div>
      <div class="player-panels" data-panels style="--n:${players.length}"></div>
    </div>`);
    const grid = this.root.querySelector('[data-grid]')!;
    for (let g = 0; g < SERIES.length; g++) {
      const group = el(`<div class="char-group"></div>`);
      const cells = CHAR_LAYOUT.flatMap((row) => Array.from({ length: GROUP_COLS }, (_, k) => row[g * GROUP_COLS + k]));
      for (const i of cells) {
        if (i === undefined) {
          group.appendChild(el(`<div></div>`));
          continue;
        }
        const c = CHARACTERS[i];
        group.appendChild(
          el(`<div class="char-card" data-char="${c.id}">
            <div class="cursors"></div>
            <img src="${portraits.get(c.id)}" alt="">
            <div class="name">${c.name}</div><div class="cls">${c.weightClass}</div>
          </div>`),
        );
      }
      grid.appendChild(group);
    }
    this.app.ui.appendChild(this.root);
    this.render();
  }

  exit() {
    this.root.remove();
  }

  phoneMode(p: Player) {
    return { mode: 'menu' as const, hint: this.locked.has(p.index) ? 'Ready! (B to change)' : 'Pick your racer' };
  }

  update(dt: number) {
    const players = this.app.session.players;
    for (const { player, sourceId, a } of this.app.menuActions()) {
      const p = player ?? (sourceId === 'kb' ? players[0] : undefined);
      if (!p) continue;
      let c = this.cursor.get(p.index) ?? 0;
      const locked = this.locked.has(p.index);
      if (!locked && (a === 'left' || a === 'right' || a === 'up' || a === 'down')) {
        c = moveCursor(c, a);
        this.cursor.set(p.index, c);
        p.charId = CHARACTERS[c].id;
        this.app.sfx.play('menuMove');
      } else if (a === 'ok' && !locked) {
        this.locked.add(p.index);
        p.charId = CHARACTERS[c].id;
        this.app.sfx.play('menuOk');
        this.app.syncPhones();
      } else if (isBack(a)) {
        this.app.sfx.play('menuBack');
        if (locked) {
          this.locked.delete(p.index);
          this.doneTimer = -1;
          this.app.syncPhones();
        } else if (p.index === 0) {
          this.app.setState(new SetupState(this.app));
          return;
        }
      }
      this.render();
    }
    if (players.length && players.every((p) => this.locked.has(p.index))) {
      if (this.doneTimer < 0) this.doneTimer = 0.7;
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) {
        const s = this.app.session;
        s.buildRoster();
        if (s.mode === 'gp') this.app.setState(new RaceState(this.app, 0));
        else this.app.setState(new TrackSelectState(this.app));
      }
    }
  }

  private render() {
    const players = this.app.session.players;
    for (const card of this.root.querySelectorAll<HTMLElement>('[data-char]')) {
      const idx = CHARACTERS.findIndex((c) => c.id === card.dataset.char);
      const here = players.filter((p) => this.cursor.get(p.index) === idx);
      card.classList.toggle('hover', here.length > 0);
      card.classList.toggle('multi', here.length > 1);
      if (here.length) card.style.setProperty('--pc', here[0].color);
      card.querySelector('.cursors')!.innerHTML = here
        .map((p) => `<span class="cursor-tag" style="--pc:${p.color}">P${p.index + 1}${this.locked.has(p.index) ? ' ✓' : ''}</span>`)
        .join('');
    }
    const panels = this.root.querySelector('[data-panels]')!;
    panels.innerHTML = '';
    for (const p of players) {
      const c = CHARACTERS[this.cursor.get(p.index) ?? 0];
      const bar = (label: string, v: number) => `<span>${label}</span><div class="bar"><i style="width:${v * 20}%"></i></div>`;
      panels.appendChild(
        el(`<div class="ppanel ${this.locked.has(p.index) ? 'locked' : ''}" style="--pc:${p.color}">
          <div class="who"><span>P${p.index + 1} · ${c.name}</span></div>
          ${bar('Speed', c.speed)}${bar('Accel', c.accel)}${bar('Handling', c.handling)}${bar('Weight', c.weight)}
        </div>`),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Track select (Versus)
// ---------------------------------------------------------------------------

export function drawTrackPreview(canvas: HTMLCanvasElement, trackIndex: number) {
  const def = TRACKS[trackIndex];
  const track = new Track(def);
  const theme = THEMES[def.theme];
  const size = 320;
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, theme.skyTop);
  grad.addColorStop(1, theme.ground);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const b = track.bounds;
  const w = b.max.x - b.min.x;
  const h = b.max.z - b.min.z;
  const scale = (size - 40) / Math.max(w, h);
  const ox = (size - w * scale) / 2;
  const oz = (size - h * scale) / 2;
  const P = (x: number, z: number): [number, number] => [ox + (b.max.x - x) * scale, oz + (b.max.z - z) * scale];
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const path = () => {
    g.beginPath();
    track.samples.forEach((s, i) => {
      const [x, y] = P(s.pos.x, s.pos.z);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
  };
  path();
  g.strokeStyle = '#15122a';
  g.lineWidth = 18;
  g.stroke();
  path();
  g.strokeStyle = theme.road;
  g.lineWidth = 11;
  g.stroke();
  path();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 1.5;
  g.setLineDash([6, 8]);
  g.stroke();
  g.setLineDash([]);
  const [sx, sy] = P(track.samples[0].pos.x, track.samples[0].pos.z);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(sx, sy, 7, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#15122a';
  g.lineWidth = 3;
  g.stroke();
}

export class TrackSelectState implements GameState {
  private root!: HTMLElement;
  private sel = 0;
  constructor(private app: App) {
    this.sel = app.session.trackIndex;
  }

  enter() {
    this.root = el(`<div class="screen">
      <div class="screen-head"><div class="screen-title">Choose a track</div><div class="screen-sub">P1 picks · Versus race</div></div>
      <div class="track-grid" data-grid></div>
      <div class="footer-hint"><span><span class="key">◀▶</span> choose · <span class="key">A</span> race! · <span class="key">B</span> back</span></div>
    </div>`);
    const grid = this.root.querySelector('[data-grid]')!;
    TRACKS.forEach((t, i) => {
      const card = el(`<div class="track-card" data-i="${i}"><canvas></canvas><div class="name">${t.name}</div><div class="num">Track ${i + 1}</div></div>`);
      drawTrackPreview(card.querySelector('canvas')!, i);
      card.addEventListener('click', () => {
        this.sel = i;
        this.go();
      });
      grid.appendChild(card);
    });
    this.app.ui.appendChild(this.root);
    this.render();
  }

  exit() {
    this.root.remove();
  }

  phoneMode(p: Player) {
    return { mode: 'menu' as const, hint: p.index === 0 ? 'Choose a track' : 'P1 is choosing a track…' };
  }

  private go() {
    this.app.sfx.play('menuOk');
    this.app.session.trackIndex = this.sel;
    this.app.setState(new RaceState(this.app, this.sel));
  }

  update() {
    for (const { player, sourceId, a } of this.app.menuActions()) {
      if (!(player?.index === 0 || sourceId === 'kb')) continue;
      if (a === 'left' || a === 'up') this.sel = (this.sel + TRACKS.length - 1) % TRACKS.length;
      else if (a === 'right' || a === 'down') this.sel = (this.sel + 1) % TRACKS.length;
      else if (a === 'ok') return this.go();
      else if (isBack(a)) {
        this.app.sfx.play('menuBack');
        this.app.setState(new CharSelectState(this.app));
        return;
      } else continue;
      this.app.sfx.play('menuMove');
      this.render();
    }
  }

  private render() {
    this.root.querySelectorAll<HTMLElement>('.track-card').forEach((c, i) => c.classList.toggle('sel', i === this.sel));
  }
}

// ---------------------------------------------------------------------------
// Grand Prix podium
// ---------------------------------------------------------------------------

export class PodiumState implements GameState {
  private root!: HTMLElement;
  constructor(private app: App) {}

  enter() {
    const portraits = characterPortraits();
    const st = this.app.session.standings();
    const top = st.slice(0, 3);
    const order = [1, 0, 2].filter((i) => top[i]);
    const colors = ['var(--gold)', 'var(--silver)', 'var(--bronze)'];
    const heights = ['36vh', '26vh', '18vh'];
    const humans = st.map((s, i) => ({ ...s, place: i + 1 })).filter((s) => s.entry.playerIndex >= 0);
    const cup = (place: number) => (place === 1 ? 'Gold Cup!' : place === 2 ? 'Silver Cup!' : place === 3 ? 'Bronze Cup!' : `${ordinal(place)} place`);
    const msg = humans.map((h) => `<span style="color:${h.entry.color}">P${h.entry.playerIndex + 1}</span>: ${cup(h.place)}`).join(' &nbsp;·&nbsp; ');
    this.root = el(`<div class="screen">
      <div class="screen-head"><div class="screen-title">Grand Prix results</div><div class="screen-sub">${this.app.session.difficulty} opponents</div></div>
      <div class="podium">
        ${order
          .map(
            (i) => `<div class="step">
              <img src="${portraits.get(top[i].entry.char.id)}" alt="">
              <div class="display" style="font-size:clamp(18px,2vw,28px)">${top[i].entry.playerIndex >= 0 ? `P${top[i].entry.playerIndex + 1} · ` : ''}${top[i].entry.name}</div>
              <div class="display" style="color:var(--gold)">${top[i].points} pts</div>
              <div class="block" style="height:${heights[i]};background:${colors[i]}">${i + 1}</div>
            </div>`,
          )
          .join('')}
      </div>
      <div class="trophy-msg">${msg}</div>
      <div class="footer-hint"><span><span class="key">A</span> back to the lobby</span></div>
    </div>`);
    this.app.ui.appendChild(this.root);
    this.app.sfx.play('finish');
  }

  exit() {
    this.root.remove();
  }

  phoneMode() {
    return { mode: 'menu' as const, hint: 'Press A to continue' };
  }

  update() {
    for (const { a } of this.app.menuActions()) {
      if (a === 'ok') {
        this.app.sfx.play('menuOk');
        this.app.setState(new LobbyState(this.app));
        return;
      }
    }
  }
}
