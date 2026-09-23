import { BTN, MAX_PHONES, type MenuAction, type ServerToHost } from '../../shared/protocol';
import { emptyInput, type KartInput } from '../kart/kart';
import { approach, clamp } from '../core/math';

export type SourceKind = 'phone' | 'keyboard' | 'gamepad';

export interface ControlSource {
  id: string;
  kind: SourceKind;
  label: string;
  connected: boolean;
  input: KartInput;
  menu: MenuAction[];
  /** Phone slot for phone sources. */
  slot?: number;
}

const DIRS: MenuAction[] = ['up', 'down', 'left', 'right'];

/** Menu auto-repeat helper for held directions. */
class Repeater {
  private held = new Map<MenuAction, number>();
  update(active: Set<MenuAction>, dt: number, out: MenuAction[]) {
    for (const a of DIRS) {
      if (!active.has(a)) {
        this.held.delete(a);
        continue;
      }
      const t = this.held.get(a);
      if (t === undefined) {
        out.push(a);
        this.held.set(a, 0.4);
      } else if (t - dt <= 0) {
        out.push(a);
        this.held.set(a, 0.13);
      } else this.held.set(a, t - dt);
    }
  }
}

export class InputManager {
  readonly sources = new Map<string, ControlSource>();
  onPhoneJoin: (src: ControlSource) => void = () => {};
  onPhoneLeave: (src: ControlSource) => void = () => {};
  /** Fired for any key/button press (used to unlock audio and let keyboard/gamepad join). */
  onActivity: () => void = () => {};

  private keys = new Set<string>();
  private kbSteer = 0;
  private padPrev = new Map<number, boolean[]>();
  private padRepeat = new Map<number, Repeater>();

  constructor() {
    for (let i = 0; i < MAX_PHONES; i++) {
      this.sources.set(`phone${i}`, {
        id: `phone${i}`,
        kind: 'phone',
        label: 'Phone',
        connected: false,
        input: emptyInput(),
        menu: [],
        slot: i,
      });
    }
    this.sources.set('kb', { id: 'kb', kind: 'keyboard', label: 'Keyboard', connected: true, input: emptyInput(), menu: [] });

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
      const kb = this.sources.get('kb')!;
      this.keys.add(e.code);
      this.onActivity();
      const a = keyToMenu(e.code);
      if (a && (!e.repeat || DIRS.includes(a))) kb.menu.push(a);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  handleNet(msg: ServerToHost) {
    switch (msg.t) {
      case 'phoneJoin': {
        const src = this.sources.get(`phone${msg.slot}`)!;
        src.connected = true;
        src.input = emptyInput();
        this.onPhoneJoin(src);
        break;
      }
      case 'phoneLeave': {
        const src = this.sources.get(`phone${msg.slot}`)!;
        src.connected = false;
        src.input = emptyInput();
        this.onPhoneLeave(src);
        break;
      }
      case 'in': {
        const src = this.sources.get(`phone${msg.slot}`);
        if (!src) return;
        src.input.steer = clamp(msg.s, -1, 1);
        src.input.accel = !!(msg.b & BTN.ACCEL);
        src.input.brake = !!(msg.b & BTN.BRAKE);
        src.input.drift = !!(msg.b & BTN.DRIFT);
        src.input.item = !!(msg.b & BTN.ITEM);
        src.input.trick = !!(msg.b & BTN.TRICK);
        break;
      }
      case 'menu': {
        const src = this.sources.get(`phone${msg.slot}`);
        src?.menu.push(msg.a);
        break;
      }
    }
  }

  /** Poll keyboard + gamepads. Call once per frame. */
  update(dt: number) {
    // Keyboard
    const kb = this.sources.get('kb')!;
    const k = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    const target = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    this.kbSteer = target === 0 ? approach(this.kbSteer, 0, dt * 8) : approach(this.kbSteer, target, dt * (Math.sign(target) !== Math.sign(this.kbSteer) ? 10 : 5));
    kb.input.steer = this.kbSteer;
    kb.input.accel = k('KeyW', 'ArrowUp');
    kb.input.brake = k('KeyS', 'ArrowDown');
    kb.input.drift = k('Space', 'ShiftLeft', 'ShiftRight');
    kb.input.item = k('KeyE', 'ControlLeft', 'ControlRight', 'KeyX');
    kb.input.trick = false;

    // Gamepads
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const seen = new Set<string>();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const id = `pad${pad.index}`;
      seen.add(id);
      let src = this.sources.get(id);
      if (!src) {
        src = { id, kind: 'gamepad', label: 'Gamepad', connected: true, input: emptyInput(), menu: [] };
        this.sources.set(id, src);
      }
      src.connected = true;
      const b = (i: number) => (pad.buttons[i]?.value ?? 0) > 0.35 || !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      let steer = Math.abs(ax) > 0.15 ? (ax - Math.sign(ax) * 0.15) / 0.85 : 0;
      if (b(14)) steer = -1;
      if (b(15)) steer = 1;
      src.input.steer = clamp(steer, -1, 1);
      src.input.accel = b(0) || b(7);
      src.input.brake = b(1) || b(6);
      src.input.drift = b(5) || b(2);
      src.input.item = b(4) || b(3);
      src.input.trick = false;

      const prev = this.padPrev.get(pad.index) ?? [];
      const now = pad.buttons.map((_, i) => b(i));
      const edge = (i: number) => now[i] && !prev[i];
      if (edge(0)) src.menu.push('ok');
      if (edge(1)) src.menu.push('back');
      if (edge(9)) src.menu.push('pause');
      if (now.some((v, i) => v && !prev[i])) this.onActivity();
      this.padPrev.set(pad.index, now);

      const active = new Set<MenuAction>();
      if (b(12) || ay < -0.6) active.add('up');
      if (b(13) || ay > 0.6) active.add('down');
      if (b(14) || ax < -0.6) active.add('left');
      if (b(15) || ax > 0.6) active.add('right');
      let rep = this.padRepeat.get(pad.index);
      if (!rep) this.padRepeat.set(pad.index, (rep = new Repeater()));
      rep.update(active, dt, src.menu);
    }
    for (const [id, src] of this.sources) if (src.kind === 'gamepad' && !seen.has(id)) src.connected = false;
  }

  get(id: string) {
    return this.sources.get(id);
  }

  /** Takes (and clears) queued menu actions for a source. */
  takeMenu(id: string): MenuAction[] {
    const src = this.sources.get(id);
    if (!src || !src.menu.length) return [];
    const out = src.menu;
    src.menu = [];
    return out;
  }

  /** Drop queued menu actions everywhere (on state changes). */
  flushMenus() {
    for (const s of this.sources.values()) s.menu = [];
  }
}

function keyToMenu(code: string): MenuAction | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'Enter':
    case 'Space':
    case 'NumpadEnter':
      return 'ok';
    case 'Backspace':
      return 'back';
    case 'Escape':
    case 'KeyP':
      return 'pause';
    default:
      return null;
  }
}
