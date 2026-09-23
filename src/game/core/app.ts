import { MAX_PLAYERS, PLAYER_COLORS, type HostToPhone, type MenuAction, type PhoneMode } from '../../shared/protocol';
import { HostConnection } from '../net/hostConnection';
import { InputManager, type ControlSource } from '../input/inputManager';
import { GameRenderer } from '../render/renderer';
import { Sfx } from '../audio/sfx';
import type { Difficulty } from '../ai/aiDriver';
import { CHARACTERS, type CharacterDef } from '../kart/characters';
import type { RacerSetup } from '../race/race';
import { shuffle } from './math';

export interface GameState {
  enter(): void;
  exit(): void;
  update(dt: number): void;
  /** Phone UI mode + hint to show while this state is active. */
  phoneMode?(player: Player): { mode: PhoneMode; hint?: string };
}

export interface Player {
  index: number;
  sourceId: string;
  color: string;
  charId: string;
}

export interface RosterEntry extends RacerSetup {
  key: string;
  name: string;
}

export const GP_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];
export const RACERS = 12;
export const LAPS = 3;

/** Settings and progress that persist across screens. */
export class Session {
  players: Player[] = [];
  mode: 'gp' | 'vs' = 'gp';
  difficulty: Difficulty = 'normal';
  trackIndex = 0;
  gpRace = 0;
  points = new Map<string, number>();
  roster: RosterEntry[] = [];

  /** Humans plus AI racers (spare characters first, then recoloured duplicates). */
  buildRoster() {
    const humans: RosterEntry[] = this.players.map((p) => {
      const char = CHARACTERS.find((c) => c.id === p.charId) ?? CHARACTERS[0];
      return { key: `P${p.index + 1}`, name: char.name, char, playerIndex: p.index, color: p.color };
    });
    const taken = new Set(this.players.map((p) => p.charId));
    const spare = shuffle(CHARACTERS.filter((c) => !taken.has(c.id)));
    const pool: CharacterDef[] = [...spare];
    const variants = shuffle([...CHARACTERS]).map((c) => recolour(c));
    while (pool.length < RACERS - humans.length) pool.push(variants.shift() ?? recolour(CHARACTERS[0]));
    const ai: RosterEntry[] = pool.slice(0, RACERS - humans.length).map((char, i) => ({
      key: `ai${i}`,
      name: char.name,
      char,
      playerIndex: -1,
      color: char.kart,
    }));
    this.roster = [...ai, ...humans];
    this.points = new Map(this.roster.map((r) => [r.key, 0]));
    this.gpRace = 0;
  }

  /** Grid for the next race: first race humans start at the back; later races by reverse standings. */
  grid(): RosterEntry[] {
    if (this.mode === 'vs' || this.gpRace === 0) return this.roster;
    return [...this.roster].sort((a, b) => (this.points.get(a.key) ?? 0) - (this.points.get(b.key) ?? 0));
  }

  standings(): { entry: RosterEntry; points: number }[] {
    return this.roster
      .map((entry) => ({ entry, points: this.points.get(entry.key) ?? 0 }))
      .sort((a, b) => b.points - a.points);
  }
}

function recolour(c: CharacterDef): CharacterDef {
  const hsl = { h: 0, s: 0, l: 0 };
  const col = hexToRgb(c.kart);
  rgbToHsl(col[0], col[1], col[2], hsl);
  const h = (hsl.h + 0.45) % 1;
  return { ...c, name: `${c.name} Jr.`, kart: hslToHex(h, Math.min(1, hsl.s + 0.1), Math.min(0.6, Math.max(0.35, hsl.l))) };
}
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbToHsl(r: number, g: number, b: number, out: { h: number; s: number; l: number }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  out.l = (max + min) / 2;
  if (max === min) {
    out.h = out.s = 0;
    return;
  }
  const d = max - min;
  out.s = out.l > 0.5 ? d / (2 - max - min) : d / (max + min);
  out.h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  out.h /= 6;
}
function hslToHex(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export class App {
  readonly renderer: GameRenderer;
  readonly net = new HostConnection();
  readonly input = new InputManager();
  readonly sfx = new Sfx();
  readonly session = new Session();
  readonly ui = document.getElementById('ui')!;
  readonly hud = document.getElementById('hud')!;
  state: GameState | null = null;
  private last = performance.now();

  constructor() {
    this.renderer = new GameRenderer(document.getElementById('stage')!);
    this.net.onMessage = (m) => this.input.handleNet(m);
    this.input.onPhoneJoin = (src) => this.phoneJoined(src);
    this.input.onPhoneLeave = (src) => this.phoneLeft(src);
    const unlock = () => this.sfx.unlock();
    this.input.onActivity = unlock;
    window.addEventListener('pointerdown', unlock);
    this.net.connect();
  }

  start(state: GameState) {
    this.setState(state);
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.input.update(dt);
      this.state?.update(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setState(s: GameState) {
    this.state?.exit();
    this.input.flushMenus();
    this.state = s;
    s.enter();
    this.syncPhones();
  }

  // ---------------------------------------------------------------------------
  // Players and phones
  // ---------------------------------------------------------------------------

  player(sourceId: string) {
    return this.session.players.find((p) => p.sourceId === sourceId);
  }

  addPlayer(sourceId: string): Player | null {
    const players = this.session.players;
    if (players.length >= MAX_PLAYERS || this.player(sourceId)) return null;
    const used = new Set(players.map((p) => p.color));
    const p: Player = {
      index: players.length,
      sourceId,
      color: PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[players.length],
      charId: CHARACTERS[(players.length * 3) % CHARACTERS.length].id,
    };
    players.push(p);
    this.sfx.play('join');
    this.syncPhones();
    return p;
  }

  removePlayer(sourceId: string) {
    const players = this.session.players;
    const i = players.findIndex((p) => p.sourceId === sourceId);
    if (i < 0) return;
    players.splice(i, 1);
    players.forEach((p, k) => (p.index = k));
    this.sfx.play('menuBack');
    this.syncPhones();
  }

  /** Lobby-only joining; otherwise phones are told to wait. */
  joinAllowed = false;

  private phoneJoined(src: ControlSource) {
    const existing = this.player(src.id);
    if (!existing) {
      if (this.joinAllowed) {
        if (!this.addPlayer(src.id)) this.sendTo(src.slot!, { t: 'rejected', reason: 'The game is full (4 players).' });
      } else {
        this.sendTo(src.slot!, { t: 'mode', mode: 'wait' });
        this.sendTo(src.slot!, { t: 'rejected', reason: 'A race is in progress – you can join from the lobby.' });
        return;
      }
    } else {
      this.toast(`P${existing.index + 1} reconnected`);
    }
    this.syncPhones();
  }

  private phoneLeft(src: ControlSource) {
    const p = this.player(src.id);
    if (!p) return;
    if (this.joinAllowed) this.removePlayer(src.id);
    else this.toast(`P${p.index + 1}'s phone disconnected – reopen the controller page to reconnect`);
  }

  sendTo(slot: number, msg: HostToPhone) {
    this.net.send(slot, msg);
  }

  /** Tell every joined phone its player number, colour and current UI mode. */
  syncPhones() {
    for (const p of this.session.players) {
      const src = this.input.get(p.sourceId);
      if (src?.kind !== 'phone' || src.slot === undefined) continue;
      const char = CHARACTERS.find((c) => c.id === p.charId);
      this.sendTo(src.slot, { t: 'you', player: p.index, color: p.color, name: char?.name });
      const m = this.state?.phoneMode?.(p) ?? { mode: 'menu' as PhoneMode };
      this.sendTo(src.slot, { t: 'mode', mode: m.mode, hint: m.hint });
    }
  }

  /**
   * Menu actions this frame, tagged with the player that sent them.
   * Keyboard input is always included (player may be undefined) so the PC can drive menus.
   */
  menuActions(): { player: Player | undefined; sourceId: string; a: MenuAction }[] {
    const out: { player: Player | undefined; sourceId: string; a: MenuAction }[] = [];
    for (const src of this.input.sources.values()) {
      for (const a of this.input.takeMenu(src.id)) out.push({ player: this.player(src.id), sourceId: src.id, a });
    }
    return out;
  }

  toast(text: string, ms = 3500) {
    const host = document.getElementById('toast')!;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }
}
