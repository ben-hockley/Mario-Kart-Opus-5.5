import * as THREE from 'three';
import { Track } from '../track/track';
import { THEMES, type Theme } from '../track/themes';
import type { TrackDef } from '../track/types';
import { buildTrackScene, type TrackScene } from '../track/trackMesh';
import { Kart, type KartEvent } from '../kart/kart';
import type { CharacterDef } from '../kart/characters';
import type { VehicleDef } from '../kart/vehicles';
import { ItemSystem } from '../items/itemSystem';
import { AIDriver, type Difficulty } from '../ai/aiDriver';
import { Particles } from '../render/particles';
import { createSky } from '../render/sky';
import { rand } from '../core/math';

export interface RacerSetup {
  char: CharacterDef;
  vehicle: VehicleDef;
  /** Local player index, or -1 for AI. */
  playerIndex: number;
  color: string;
}

export interface RaceOptions {
  trackDef: TrackDef;
  /** Grid order, pole position first. */
  racers: RacerSetup[];
  difficulty: Difficulty;
  laps: number;
}

export type RacePhase = 'intro' | 'countdown' | 'racing' | 'done';

export type RaceEvent =
  | { type: 'kart'; kart: Kart; ev: KartEvent }
  | { type: 'countdown'; n: number }
  | { type: 'go' }
  | { type: 'lap'; kart: Kart; lap: number }
  | { type: 'finish'; kart: Kart };

export interface RaceResult {
  kart: Kart;
  time: number;
  estimated: boolean;
}

const CHECKPOINTS = 16;
const INTRO_TIME = 3.2;

export class Race {
  readonly track: Track;
  readonly theme: Theme;
  readonly scene = new THREE.Scene();
  readonly trackScene: TrackScene;
  readonly karts: Kart[] = [];
  readonly humans: Kart[] = [];
  readonly items: ItemSystem;
  readonly sparks = new Particles(2500, true);
  readonly dust = new Particles(1200, false);
  readonly sky: THREE.Mesh;
  readonly laps: number;
  readonly drivers = new Map<Kart, AIDriver>();

  phase: RacePhase = 'intro';
  phaseTime = 0;
  countdown = 3;
  clock = 0;
  doneTimer = 0;
  events: RaceEvent[] = [];
  private startPress = new Map<Kart, number>();
  private readonly difficulty: Difficulty;
  private tmp = new THREE.Vector3();

  constructor(opts: RaceOptions) {
    this.laps = opts.laps;
    this.difficulty = opts.difficulty;
    this.track = new Track(opts.trackDef);
    this.theme = THEMES[opts.trackDef.theme];
    const theme = this.theme;

    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    this.scene.background = new THREE.Color(theme.skyHorizon);
    this.sky = createSky(theme);
    this.scene.add(this.sky);
    this.scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity));
    const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
    sun.position.set(...theme.sunDir).multiplyScalar(100);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.25));

    this.trackScene = buildTrackScene(this.track, theme);
    this.scene.add(this.trackScene.group);

    this.items = new ItemSystem(this.track);
    this.items.targetAhead = (k) => this.karts.find((o) => o.position === k.position - 1 && !o.finished) ?? null;
    this.scene.add(this.items.group);
    this.scene.add(this.sparks.points, this.dust.points);

    // Grid: two staggered columns behind the line.
    const L = this.track.length;
    opts.racers.forEach((r, i) => {
      const kart = new Kart(i, r.char, r.playerIndex, r.color, r.vehicle);
      const row = Math.floor(i / 2);
      const col = i % 2;
      const halfW = this.track.samples[0].halfW;
      const s = L - 7 - row * 6 - col * 3;
      kart.place(this.track, s, (col ? 1 : -1) * halfW * 0.42);
      kart.lap = 0;
      kart.checkpoint = CHECKPOINTS - 1;
      this.karts.push(kart);
      this.scene.add(kart.model.root, kart.model.shadow);
      if (r.playerIndex >= 0) this.humans[r.playerIndex] = kart;
    });

    const ctx = {
      track: this.track,
      karts: this.karts,
      items: this.items,
      leadHumanProgress: () => {
        let best: number | null = null;
        for (const h of this.humans) if (h && !h.finished) best = best === null ? h.progress : Math.max(best, h.progress);
        return best;
      },
    };
    for (const k of this.karts) {
      if (!k.isHuman) this.drivers.set(k, new AIDriver(k, ctx, opts.difficulty));
    }
    this.aiCtx = ctx;
    this.updatePositions();
  }

  private aiCtx: ConstructorParameters<typeof AIDriver>[1];

  /** Debug/testing: let the AI drive a human kart. */
  autopilot(k: Kart) {
    this.drivers.set(k, new AIDriver(k, this.aiCtx, this.difficulty));
  }

  get racing() {
    return this.phase === 'racing' || this.phase === 'done';
  }

  get isOver() {
    return this.phase === 'done' && this.doneTimer <= 0;
  }

  step(dt: number) {
    this.phaseTime += dt;
    if (this.phase === 'intro' && this.phaseTime >= INTRO_TIME) {
      this.phase = 'countdown';
      this.phaseTime = 0;
      this.countdown = 3;
      this.events.push({ type: 'countdown', n: 3 });
    } else if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after > 0) this.events.push({ type: 'countdown', n: after });
      this.trackStartPresses();
      if (this.countdown <= 0) this.go();
    }
    if (this.racing) this.clock += dt;

    const racing = this.racing;
    for (const [, d] of this.drivers) d.update(dt, racing);
    for (const k of this.karts) this.items.handleInput(k, racing);
    for (const k of this.karts) k.step(dt, this.track, racing);
    this.collideKarts();
    this.items.update(dt, this.karts);
    for (const k of this.karts) this.updateLaps(k);
    this.updatePositions();

    for (const k of this.karts) {
      for (const ev of k.events) this.events.push({ type: 'kart', kart: k, ev });
      k.events.length = 0;
    }

    if (this.phase === 'racing') {
      const humansDone = this.humans.every((h) => !h || h.finished);
      const timeUp = this.clock > 360;
      if (humansDone || timeUp) {
        this.phase = 'done';
        this.doneTimer = this.humans.length ? 4 : 0.1;
      }
    } else if (this.phase === 'done') {
      this.doneTimer -= dt;
    }
  }

  private trackStartPresses() {
    for (const k of this.karts) {
      if (k.input.accel && !this.startPress.has(k)) this.startPress.set(k, this.countdown);
      if (!k.input.accel) this.startPress.delete(k);
    }
  }

  private go() {
    this.phase = 'racing';
    this.phaseTime = 0;
    this.clock = 0;
    this.events.push({ type: 'go' });
    const aiChance = { easy: 0.2, normal: 0.45, hard: 0.75 }[this.difficulty];
    for (const k of this.karts) {
      k.lapStart = 0;
      if (!k.isHuman) {
        if (Math.random() < aiChance) k.startBoost(1.0, 1.35);
        continue;
      }
      const t = this.startPress.get(k);
      if (t === undefined || !k.input.accel) continue;
      if (t <= 1.05 && t >= 0.15) k.startBoost(1.1, 1.38);
      else if (t > 1.9) k.hit('spin'); // held from "3": burnout
    }
  }

  private updateLaps(k: Kart) {
    const L = this.track.length;
    const segLen = L / CHECKPOINTS;
    const seg = Math.min(CHECKPOINTS - 1, Math.floor(k.tp.s / segLen));
    if (!k.finished && k.respawnTimer <= 0 && seg === (k.checkpoint + 1) % CHECKPOINTS) {
      k.checkpoint = seg;
      if (seg === 0 && this.racing) {
        k.lap++;
        if (k.lap > 1) {
          const lapTime = this.clock - k.lapStart;
          k.bestLap = Math.min(k.bestLap, lapTime);
        }
        k.lapStart = this.clock;
        if (k.lap > this.laps) {
          k.finished = true;
          k.finishTime = this.clock;
          this.events.push({ type: 'finish', kart: k });
          if (k.isHuman) {
            const d = new AIDriver(k, this.aiCtx, 'normal');
            d.autopilot = true;
            this.drivers.set(k, d);
          }
        } else if (k.lap > 1) {
          this.events.push({ type: 'lap', kart: k, lap: k.lap });
        }
      }
    }
    const cpS = k.checkpoint * segLen;
    k.progress = (k.lap - 1) * L + cpS + this.track.deltaS(cpS, k.tp.s);
  }

  private updatePositions() {
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTime - b.finishTime;
      return b.progress - a.progress;
    });
    sorted.forEach((k, i) => (k.position = i + 1));
  }

  private collideKarts() {
    const K = this.karts;
    for (let i = 0; i < K.length; i++) {
      const a = K[i];
      if (a.respawnTimer > 0) continue;
      for (let j = i + 1; j < K.length; j++) {
        const b = K[j];
        if (b.respawnTimer > 0) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const R = 2.1;
        if (d2 >= R * R || Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d;
        const nz = dz / d;
        const wa = a.stats.weight * (a.starTimer > 0 ? 4 : 1);
        const wb = b.stats.weight * (b.starTimer > 0 ? 4 : 1);
        const overlap = R - d;
        a.pos.x -= nx * overlap * (wb / (wa + wb));
        a.pos.z -= nz * overlap * (wb / (wa + wb));
        b.pos.x += nx * overlap * (wa / (wa + wb));
        b.pos.z += nz * overlap * (wa / (wa + wb));
        const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          const j2 = (-(1.5) * rv) / (1 / wa + 1 / wb) + 2.5;
          a.vel.x -= (nx * j2) / wa;
          a.vel.z -= (nz * j2) / wa;
          b.vel.x += (nx * j2) / wb;
          b.vel.z += (nz * j2) / wb;
          a.events.push('bump');
        }
        if (a.starTimer > 0 && b.starTimer <= 0) b.hit('tumble');
        if (b.starTimer > 0 && a.starTimer <= 0) a.hit('tumble');
      }
    }
  }

  /** Final standings; racers still on track get an estimated time. */
  results(): RaceResult[] {
    const L = this.track.length;
    return [...this.karts]
      .map((k) => {
        if (k.finished) return { kart: k, time: k.finishTime, estimated: false };
        const remaining = Math.max(0, this.laps * L - k.progress);
        const pace = Math.max(12, k.stats.maxSpeed * 0.82);
        return { kart: k, time: this.clock + remaining / pace + rand(0, 0.5), estimated: true };
      })
      .sort((a, b) => {
        if (a.estimated !== b.estimated) return a.estimated ? 1 : -1;
        return a.time - b.time;
      });
  }

  // ---------------------------------------------------------------------------
  // Visuals
  // ---------------------------------------------------------------------------

  private col = {
    white: new THREE.Color('#ffffff'),
    blue: new THREE.Color('#4fb8ff'),
    orange: new THREE.Color('#ff8a1f'),
    flame: new THREE.Color('#ffb040'),
    blueFlame: new THREE.Color('#6fd0ff'),
    yellow: new THREE.Color('#ffe14d'),
    dust: new THREE.Color('#e0cfa6'),
    snow: new THREE.Color('#ffffff'),
    splash: new THREE.Color('#bfeaff'),
    lava: new THREE.Color('#ff6a1f'),
  };

  updateVisuals(alpha: number, dt: number, time: number) {
    this.trackScene.update(dt);
    const v = this.tmp;
    const vel = new THREE.Vector3();
    const c = this.col;
    const dustColor = this.theme.liquid === 'lava' ? new THREE.Color('#8a6a60') : this.track.def.theme === 'frost' ? c.snow : c.dust;

    for (const k of this.karts) {
      k.updateVisual(alpha, dt, time);
      const m = k.model;
      m.root.updateMatrixWorld();
      if (!m.body.visible && k.respawnTimer > 0) continue;

      if (k.drifting && k.grounded) {
        const color = k.driftLevel === 2 ? c.orange : k.driftLevel === 1 ? c.blue : c.white;
        const size = k.driftLevel === 0 ? 0.18 : 0.32;
        for (const local of [m.rearWheelL, m.rearWheelR]) {
          if (Math.random() > (k.driftLevel ? 0.9 : 0.4)) continue;
          v.copy(local).applyMatrix4(m.root.matrixWorld);
          vel.set(rand(-2, 2), rand(1.5, 4), rand(-2, 2));
          this.sparks.emit(v, vel, color, size, rand(0.18, 0.35), { gravity: 12 });
        }
      }
      if (k.boostTimer > 0 && Math.random() < 0.6) {
        v.copy(m.exhaust).applyMatrix4(m.root.matrixWorld);
        vel.copy(k.vel).multiplyScalar(0.85).add(new THREE.Vector3(rand(-1, 1), rand(0, 1.2), rand(-1, 1)));
        this.sparks.emit(v, vel, k.boostPower > 1.3 ? c.flame : c.blueFlame, 0.28, rand(0.08, 0.14), { drag: 2 });
      }
      if (k.offroad && Math.abs(k.speed) > 6 && Math.random() < 0.5) {
        v.copy(Math.random() < 0.5 ? m.rearWheelL : m.rearWheelR).applyMatrix4(m.root.matrixWorld);
        vel.set(rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5));
        this.dust.emit(v, vel, dustColor, 0.55, rand(0.35, 0.6), { gravity: 2, drag: 2, grow: 1.2 });
      }
      if (k.starTimer > 0 && Math.random() < 0.7) {
        v.copy(m.root.position).add(new THREE.Vector3(rand(-1.2, 1.2), rand(0.3, 2), rand(-1.2, 1.2)));
        this.sparks.emit(v, null, new THREE.Color().setHSL(Math.random(), 1, 0.6), 0.35, 0.4);
      }
    }

    for (const e of this.events) {
      if (e.type !== 'kart') continue;
      const k = e.kart;
      const p = k.model.root.position;
      switch (e.ev) {
        case 'hit':
          for (let i = 0; i < 18; i++) {
            vel.set(rand(-6, 6), rand(3, 9), rand(-6, 6));
            this.sparks.emit(v.copy(p).setY(p.y + 1), vel, c.yellow, 0.4, rand(0.3, 0.6), { gravity: 18 });
          }
          break;
        case 'miniTurbo':
        case 'trick':
          for (let i = 0; i < 12; i++) {
            vel.set(rand(-4, 4), rand(1, 5), rand(-4, 4));
            this.sparks.emit(v.copy(p).setY(p.y + 0.6), vel, k.driftLevel === 2 ? c.orange : c.blue, 0.35, rand(0.2, 0.4), { gravity: 8 });
          }
          break;
        case 'land':
          for (let i = 0; i < 8; i++) {
            vel.set(rand(-3, 3), rand(0.5, 2), rand(-3, 3));
            this.dust.emit(v.copy(p), vel, dustColor, 1, 0.5, { drag: 3, grow: 1.5 });
          }
          break;
        case 'fall': {
          const splash = this.theme.liquid === 'lava' ? c.lava : c.splash;
          for (let i = 0; i < 24; i++) {
            vel.set(rand(-4, 4), rand(4, 10), rand(-4, 4));
            this.sparks.emit(v.copy(p), vel, splash, 0.6, rand(0.4, 0.8), { gravity: 20 });
          }
          break;
        }
      }
    }
    for (const e of this.items.events) {
      if (e.type === 'break') {
        const colors = [new THREE.Color('#ff4d6d'), new THREE.Color('#ffe84d'), new THREE.Color('#3fa7ff'), new THREE.Color('#3ee07a')];
        for (let i = 0; i < 14; i++) {
          vel.set(rand(-6, 6), rand(2, 8), rand(-6, 6));
          this.sparks.emit(e.pos, vel, colors[i % 4], 0.35, rand(0.3, 0.6), { gravity: 16 });
        }
      }
    }

    this.sparks.update(dt);
    this.dust.update(dt);
  }

  dispose() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry && !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh) mesh.geometry.dispose?.();
    });
    this.scene.clear();
  }
}
