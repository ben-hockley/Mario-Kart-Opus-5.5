import { clamp, damp, rand, wrapAngle } from '../core/math';
import type { Kart } from '../kart/kart';
import type { Track } from '../track/track';
import type { ItemSystem } from '../items/itemSystem';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface DiffParams {
  speed: number;
  noise: number;
  drift: number;
  itemDelay: [number, number];
  aim: number;
  catchUp: number;
  slowDown: number;
}

export const DIFFICULTY: Record<Difficulty, DiffParams> = {
  easy: { speed: 0.83, noise: 2.2, drift: 0.25, itemDelay: [2, 5], aim: 0.06, catchUp: 1.04, slowDown: 0.86 },
  normal: { speed: 0.92, noise: 1.2, drift: 0.7, itemDelay: [1, 3], aim: 0.1, catchUp: 1.07, slowDown: 0.92 },
  hard: { speed: 0.985, noise: 0.5, drift: 1, itemDelay: [0.4, 1.6], aim: 0.14, catchUp: 1.1, slowDown: 0.97 },
};

export interface AIContext {
  track: Track;
  karts: Kart[];
  items: ItemSystem;
  /** Race progress of the best human that is still racing (null if none). */
  leadHumanProgress: () => number | null;
}

export class AIDriver {
  private bias = rand(-0.5, 0.5);
  private biasTimer = rand(2, 6);
  private itemWait = 0;
  private itemPhase: 'idle' | 'tap' | 'hold' = 'idle';
  private holdTime = 0;
  private tripleCooldown = 0;
  private stuckTimer = 0;
  private reverseTimer = 0;
  private wantDrift = false;
  private readonly p: DiffParams;
  /** Autopilot for players who finished: no items, modest speed. */
  autopilot = false;

  constructor(
    readonly kart: Kart,
    private readonly ctx: AIContext,
    difficulty: Difficulty,
  ) {
    this.p = DIFFICULTY[difficulty];
  }

  update(dt: number, racing: boolean) {
    const k = this.kart;
    const { track } = this.ctx;
    const inp = k.input;
    inp.item = false;
    inp.trick = false;
    inp.brake = false;
    if (!racing) {
      inp.steer = 0;
      inp.drift = false;
      return;
    }

    // Lane personality drifts slowly over time
    this.biasTimer -= dt;
    if (this.biasTimer <= 0) {
      this.biasTimer = rand(3, 7);
      this.bias = rand(-0.55, 0.55) * (this.p.noise / 1.2);
    }

    const tp = k.tp;
    const speed = Math.max(0, k.speed);
    const look = 7 + speed * 0.42;
    const ahead = track.sampleAhead(tp.s, look);
    const room = Math.max(0, ahead.halfW - 2.2);
    let lat = clamp(ahead.line + this.bias * room * 0.5, -room, room);

    // Avoid bananas / shells on the road ahead
    for (const h of this.ctx.items.hazardsNear(k.pos, 34)) {
      if (h.owner === k && h.grace > 0) continue;
      const ds = track.deltaS(tp.s, h.tp.s);
      if (ds < 2 || ds > 32) continue;
      if (Math.abs(h.tp.lat - lat) < 2.6) lat = h.tp.lat + (h.tp.lat > 0 ? -3.4 : 3.4);
    }
    // Go around slower karts directly ahead
    for (const o of this.ctx.karts) {
      if (o === k) continue;
      const ds = track.deltaS(tp.s, o.tp.s);
      if (ds > 0 && ds < 9 && Math.abs(o.tp.lat - lat) < 2 && o.speed < speed - 1) {
        lat = o.tp.lat + (o.tp.lat > lat ? -2.6 : 2.6);
      }
    }
    lat = clamp(lat, -room, room);

    const tx = ahead.pos.x + ahead.rh.x * lat;
    const tz = ahead.pos.z + ahead.rh.z * lat;
    const angle = wrapAngle(Math.atan2(tx - k.pos.x, tz - k.pos.z) - k.heading);
    let steer = clamp(-angle * 2.4, -1, 1);

    // Upcoming curvature (positive = right bend)
    let turnSum = 0;
    for (let d = 4; d <= 30; d += 4) turnSum += track.sampleAhead(tp.s, d).turn;
    const curve = turnSum / 7;

    // Drifting
    if (k.drifting) {
      const releaseAt = this.p.drift >= 1 ? 2 : 1;
      const easing = Math.abs(curve) < 0.012 || Math.sign(curve) !== k.driftDir;
      const wantsOtherWay = Math.sign(-angle) === -k.driftDir && Math.abs(angle) > 0.5;
      if ((k.driftLevel >= releaseAt && Math.abs(curve) < 0.02) || easing || wantsOtherWay) {
        this.wantDrift = false;
      }
      // hold steering into the drift, modulating to track the line
      steer = clamp(k.driftDir * 0.6 + steer * 0.5, -1, 1);
    } else if (!this.wantDrift && Math.abs(curve) > 0.024 && speed > 16 && Math.random() < this.p.drift * dt * 6) {
      this.wantDrift = true;
      steer = Math.sign(curve);
    }
    inp.drift = this.wantDrift;
    if (this.wantDrift && !k.drifting && Math.abs(steer) < 0.35) steer = Math.sign(curve) || 1;

    // Throttle, braking for very sharp misalignment, un-sticking
    inp.accel = true;
    if (Math.abs(angle) > 1.1 && speed > 14 && !k.drifting) inp.brake = true;
    if (speed < 2 && k.controllable) this.stuckTimer += dt;
    else this.stuckTimer = 0;
    if (this.stuckTimer > 1.5) {
      this.reverseTimer = 1.0;
      this.stuckTimer = 0;
    }
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      inp.accel = false;
      inp.brake = true;
      steer = -steer;
    }
    inp.steer = steer;

    // Speed: difficulty + gentle rubber-banding against the humans
    let scale = this.autopilot ? 0.88 : this.p.speed;
    const lead = this.ctx.leadHumanProgress();
    if (lead !== null && !this.autopilot) {
      const diff = k.progress - lead;
      if (diff > 40) scale *= Math.max(this.p.slowDown, 1 - (diff - 40) / 1600);
      else if (diff < -60) scale *= Math.min(this.p.catchUp, 1 + (-diff - 60) / 1200);
    }
    k.speedScale = damp(k.speedScale, scale, 1.5, dt);

    // Trick off ramps
    if (!k.grounded && k.rampLaunch && !k.trickDone && k.airTime > 0.08 && Math.random() < this.p.drift) inp.trick = true;

    if (!this.autopilot) this.useItems(dt, curve);
  }

  private useItems(dt: number, curve: number) {
    const k = this.kart;
    const inp = k.input;
    this.tripleCooldown -= dt;

    if (this.itemPhase === 'tap') {
      inp.item = false;
      this.itemPhase = 'idle';
      return;
    }
    if (this.itemPhase === 'hold') {
      this.holdTime += dt;
      if (!k.holding) {
        this.itemPhase = 'idle';
        return;
      }
      inp.item = true;
      const behind = this.nearestBehind(14);
      const front = this.targetInFront(38);
      const held = this.ctx.items.projectiles.find((p) => p.held && p.owner === k);
      if (held?.kind === 'green' && front) {
        inp.item = false; // release forward
        this.itemPhase = 'idle';
      } else if (behind && this.holdTime > 1) {
        inp.item = false;
        inp.brake = held?.kind !== 'banana'; // shells backwards, bananas dropped
        this.itemPhase = 'idle';
      } else if (this.holdTime > rand(10, 16)) {
        inp.item = false;
        this.itemPhase = 'idle';
      }
      return;
    }

    if (k.item === null || k.rouletteTimer > 0) {
      this.itemWait = rand(...this.p.itemDelay);
      return;
    }
    this.itemWait -= dt;
    if (this.itemWait > 0) return;

    switch (k.item) {
      case 'mushroom':
      case 'triple':
        if ((Math.abs(curve) < 0.012 || k.offroad) && this.tripleCooldown <= 0) {
          this.tap();
          this.tripleCooldown = 1.0;
        }
        break;
      case 'star':
        this.tap();
        break;
      case 'red':
        if (k.position > 1) this.tap();
        else this.hold();
        break;
      case 'green':
        if (this.targetInFront(38)) this.tap();
        else this.hold();
        break;
      case 'banana':
        this.hold();
        break;
    }
  }

  private tap() {
    this.kart.input.item = true;
    this.itemPhase = 'tap';
  }

  private hold() {
    this.kart.input.item = true;
    this.itemPhase = 'hold';
    this.holdTime = 0;
  }

  private nearestBehind(range: number): Kart | null {
    const k = this.kart;
    for (const o of this.ctx.karts) {
      if (o === k) continue;
      const ds = this.ctx.track.deltaS(o.tp.s, k.tp.s);
      if (ds > 1 && ds < range) return o;
    }
    return null;
  }

  private targetInFront(range: number): Kart | null {
    const k = this.kart;
    const f = k.forward;
    for (const o of this.ctx.karts) {
      if (o === k) continue;
      const dx = o.pos.x - k.pos.x;
      const dz = o.pos.z - k.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 2) continue;
      const cos = (dx * f.x + dz * f.z) / dist;
      if (cos > 1 - this.p.aim * 0.2) return o;
    }
    return null;
  }
}
