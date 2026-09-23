import * as THREE from 'three';
import { approach, clamp, damp, dampAngle, lerp } from '../core/math';
import { Track, TrackPos } from '../track/track';
import type { CharacterDef, KartStats } from './characters';
import { statsFor } from './characters';
import { KartModel } from './kartModel';
import type { ItemKind } from '../items/itemTypes';

export interface KartInput {
  steer: number;
  accel: boolean;
  brake: boolean;
  drift: boolean;
  item: boolean;
  trick: boolean;
}

export const emptyInput = (): KartInput => ({ steer: 0, accel: false, brake: false, drift: false, item: false, trick: false });

export type KartEvent =
  | 'hop'
  | 'driftStart'
  | 'spark1'
  | 'spark2'
  | 'miniTurbo'
  | 'boost'
  | 'trick'
  | 'land'
  | 'wall'
  | 'hit'
  | 'fall'
  | 'respawn'
  | 'bump';

export type HitKind = 'spin' | 'tumble';

const GRAVITY = 30;
const RADIUS = 1.05;
const Y = new THREE.Vector3(0, 1, 0);

export class Kart {
  readonly stats: KartStats;
  readonly model: KartModel;
  readonly tp = new TrackPos();

  pos = new THREE.Vector3();
  prevPos = new THREE.Vector3();
  vel = new THREE.Vector3(); // horizontal velocity (y unused)
  vy = 0;
  heading = 0;
  prevHeading = 0;
  grounded = true;
  airTime = 0;
  private lastGroundY = 0;
  private hopTimer = 0;
  /** Current forward speed (for HUD/audio/AI). */
  speed = 0;

  input: KartInput = emptyInput();
  prevInput: KartInput = emptyInput();

  // Drift / boosts
  drifting = false;
  driftDir = 0;
  driftCharge = 0;
  driftLevel = 0;
  private driftGrace = 0;
  boostTimer = 0;
  boostPower = 1;
  starTimer = 0;
  /** Multiplier from AI difficulty / rubber-banding. */
  speedScale = 1;

  // Tricks
  rampLaunch = false;
  trickDone = false;
  trickAnim = 0;

  // Damage
  hitTimer = 0;
  hitKind: HitKind = 'spin';
  invuln = 0;
  respawnTimer = 0;
  private lastSafeS = 0;
  offroad = false;
  onIce = false;

  // Race
  lap = 0;
  checkpoint = 0;
  progress = 0;
  finished = false;
  finishTime = 0;
  position = 1;
  lapStart = 0;
  bestLap = Infinity;
  startBoostHeld = -1;

  // Items
  item: ItemKind | null = null;
  itemCount = 0;
  rouletteTimer = 0;
  /** Held banana/shell being dragged behind the kart. */
  holding = false;

  events: KartEvent[] = [];

  // Visual state
  private visYawOffset = 0;
  private visSpin = 0;
  private visNormal = new THREE.Vector3(0, 1, 0);
  private wheelSpin = 0;
  private squash = 0;

  constructor(
    readonly id: number,
    readonly char: CharacterDef,
    readonly playerIndex: number, // -1 for AI
    readonly color: string,
  ) {
    this.stats = statsFor(char);
    this.model = new KartModel(char);
  }

  get isHuman() {
    return this.playerIndex >= 0;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  get invulnerable() {
    return this.invuln > 0 || this.starTimer > 0 || this.respawnTimer > 0;
  }

  get controllable() {
    return this.hitTimer <= 0 && this.respawnTimer <= 0;
  }

  place(track: Track, s: number, lat: number) {
    const f = { pos: new THREE.Vector3(), heading: 0, idx: 0 };
    track.frameAt(s, lat, f);
    this.pos.copy(f.pos);
    this.prevPos.copy(f.pos);
    this.heading = this.prevHeading = f.heading;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    track.query(this.pos.x, this.pos.z, f.idx, this.tp, this.pos.y);
    this.pos.y = this.tp.groundY;
    this.lastGroundY = this.pos.y;
    this.lastSafeS = this.tp.s;
  }

  startBoost(duration: number, power: number) {
    this.boostPower = this.boostTimer > 0 ? Math.max(this.boostPower, power) : power;
    this.boostTimer = Math.max(this.boostTimer, duration);
    this.events.push('boost');
  }

  hit(kind: HitKind) {
    if (this.invulnerable) return false;
    this.hitKind = kind;
    this.hitTimer = kind === 'spin' ? 0.95 : 1.25;
    this.drifting = false;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.boostTimer = 0;
    this.vel.multiplyScalar(kind === 'spin' ? 0.4 : 0.15);
    if (kind === 'tumble') {
      this.vy = 8;
      this.grounded = false;
      this.hopTimer = 0.3;
    }
    this.events.push('hit');
    return true;
  }

  private pressed(k: keyof KartInput) {
    return !!this.input[k] && !this.prevInput[k];
  }

  /** Fixed-step simulation. */
  step(dt: number, track: Track, racing: boolean) {
    this.prevPos.copy(this.pos);
    this.prevHeading = this.heading;
    const inp = this.input;

    // Timers
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.starTimer = Math.max(0, this.starTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hopTimer = Math.max(0, this.hopTimer - dt);
    this.trickAnim = Math.max(0, this.trickAnim - dt);
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.invuln = 1.2;
    }
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0.6 && this.awaitingRespawn) this.doRespawn(track);
      this.prevInput = { ...inp };
      return;
    }

    const tp = this.tp;
    const canDrive = racing && this.controllable;
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let vf = this.vel.dot(fwd);
    let vl = this.vel.dot(right);

    // Surface
    this.offroad = this.grounded && tp.surface === 'offroad';
    this.onIce = this.grounded && tp.ice;
    const boosting = this.boostTimer > 0;
    const star = this.starTimer > 0;
    let maxSpeed = this.stats.maxSpeed * this.speedScale;
    let accel = this.stats.accel;
    if (this.offroad && !boosting && !star) {
      maxSpeed *= 0.5;
      accel *= 0.6;
    }
    if (star) maxSpeed *= 1.15;
    if (boosting) {
      maxSpeed *= this.boostPower;
      accel = 45;
    }
    const onPad = this.grounded && tp.surface === 'boost';
    if (onPad && !this.wasOnPad && racing) this.startBoost(1.1, 1.35);
    else if (onPad && racing) this.boostTimer = Math.max(this.boostTimer, 1.0);
    this.wasOnPad = onPad;

    // Throttle / brake
    const steer = canDrive ? clamp(inp.steer, -1, 1) : 0;
    if (this.grounded) {
      if (boosting && canDrive) {
        vf = approach(vf, maxSpeed, accel * dt);
      } else if (canDrive && inp.accel && !inp.brake) {
        if (vf < maxSpeed) vf = Math.min(maxSpeed, vf + accel * (1 - 0.6 * clamp(vf / maxSpeed, 0, 1)) * dt + (vf < 0 ? 20 * dt : 0));
      } else if (canDrive && inp.brake) {
        vf = vf > 0.5 ? vf - 28 * dt : Math.max(-9, vf - 12 * dt);
      } else {
        vf = approach(vf, 0, (this.hitTimer > 0 ? 18 : 5) * dt);
      }
      if (vf > maxSpeed) vf = approach(vf, maxSpeed, (this.offroad ? 40 : 9) * dt);
    } else {
      vf = approach(vf, 0, 0.8 * dt);
    }

    // Drift start: hop, then slide in the steered direction
    const driftPressed = this.pressed('drift');
    this.trickBuffer = Math.max(0, this.trickBuffer - dt);
    const onRamp = this.grounded && tp.ramp !== null;
    if (canDrive && onRamp && (driftPressed || this.pressed('trick'))) {
      // Pressed on the ramp itself: remember it and trick at the lip instead of hopping.
      this.trickBuffer = 0.35;
    } else if (canDrive && driftPressed && this.grounded && !this.drifting) {
      this.vy = 4.2;
      this.grounded = false;
      this.hopTimer = 0.18;
      this.driftGrace = 0.3;
      this.events.push('hop');
    }
    if (this.driftGrace > 0) this.driftGrace -= dt;
    if (canDrive && !this.drifting && inp.drift && (this.driftGrace > 0 || this.grounded)) {
      if (Math.abs(steer) > 0.3 && vf > 11) {
        this.drifting = true;
        this.driftDir = Math.sign(steer);
        this.driftCharge = 0;
        this.driftLevel = 0;
        this.driftGrace = 0;
        this.events.push('driftStart');
      }
    }
    if (this.drifting) {
      const endDrift = !inp.drift || vf < 9 || !canDrive;
      if (endDrift) {
        if (canDrive && this.driftLevel > 0) {
          this.startBoost(this.driftLevel === 2 ? 1.35 : 0.7, this.driftLevel === 2 ? 1.32 : 1.25);
          this.events.push('miniTurbo');
        }
        this.drifting = false;
        this.driftCharge = 0;
        this.driftLevel = 0;
      } else if (this.grounded) {
        const into = steer * this.driftDir;
        this.driftCharge += dt * (0.65 + 0.7 * Math.max(0, into)) * (this.offroad ? 0.4 : 1);
        const lvl = this.driftCharge > 2.3 ? 2 : this.driftCharge > 1.05 ? 1 : 0;
        if (lvl > this.driftLevel) {
          this.driftLevel = lvl;
          this.events.push(lvl === 1 ? 'spark1' : 'spark2');
        }
      }
    }

    // Steering
    let yawRate: number;
    const speedFactor = clamp(Math.abs(vf) / 7, 0, 1) * (1 - 0.18 * clamp(vf / (this.stats.maxSpeed * 1.2), 0, 1));
    if (this.drifting) {
      const into = steer * this.driftDir;
      const amount = lerp(0.3, 1.1, (into + 1) / 2);
      yawRate = -this.driftDir * amount * this.stats.turn * 0.95;
    } else {
      yawRate = -steer * this.stats.turn * speedFactor;
      if (vf < -0.5) yawRate = -yawRate * 0.7;
    }
    if (!this.grounded) yawRate *= 0.35;
    if (this.hitTimer > 0) yawRate = 0;
    this.heading += yawRate * dt;

    // Lateral grip
    let grip = this.drifting ? 5.5 : 11;
    if (this.onIce) grip = this.drifting ? 1.2 : 1.8;
    if (!this.grounded) grip = 0.6;
    const nf = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const nr = new THREE.Vector3(-nf.z, 0, nf.x);
    // Keep momentum direction when the heading rotates: re-project old velocity
    const oldVel = fwd.multiplyScalar(vf).addScaledVector(right, vl);
    vf = oldVel.dot(nf);
    vl = oldVel.dot(nr);
    vl *= Math.exp(-grip * dt);
    this.vel.copy(nf).multiplyScalar(vf).addScaledVector(nr, vl);
    this.speed = vf;

    // Integrate
    this.vy -= GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vy * dt;

    track.query(this.pos.x, this.pos.z, tp.idx, tp, this.pos.y);
    const wasGrounded = this.grounded;
    const onRampNow = tp.ramp;
    if (tp.hasGround) {
      const g = tp.groundY;
      const snap = 0.3 + Math.abs(vf) * 0.012;
      if (this.pos.y <= g || (wasGrounded && this.hopTimer <= 0 && this.pos.y - g < snap)) {
        if (!wasGrounded) this.land();
        this.vy = wasGrounded ? clamp((g - this.lastGroundY) / dt, -20, 20) : 0;
        this.pos.y = g;
        this.grounded = true;
        this.lastGroundY = g;
        if (tp.surface === 'road' || tp.surface === 'boost') this.lastSafeS = tp.s;
      } else {
        this.grounded = false;
      }
    } else {
      this.grounded = false;
    }
    if (wasGrounded && !this.grounded && this.hopTimer <= 0) {
      this.rampLaunch = !!this.prevRamp;
      this.trickDone = false;
      this.airTime = 0;
      if (this.rampLaunch && this.trickBuffer > 0 && canDrive) {
        this.trickDone = true;
        this.trickAnim = 0.5;
        this.trickBuffer = 0;
        this.events.push('trick');
      }
    }
    this.prevRamp = onRampNow;
    if (!this.grounded) {
      this.airTime += dt;
      if (this.rampLaunch && !this.trickDone && this.airTime < 0.7 && canDrive && (this.pressed('trick') || driftPressed)) {
        this.trickDone = true;
        this.trickAnim = 0.5;
        this.events.push('trick');
      }
    }

    // Walls
    if (tp.wallR !== null && tp.lat > tp.wallR - RADIUS) this.hitWall(tp.lat - (tp.wallR - RADIUS), tp.rh);
    else if (tp.wallL !== null && tp.lat < tp.wallL + RADIUS) this.hitWall(tp.lat - (tp.wallL + RADIUS), tp.rh);

    // Falling off the track
    if (!tp.hasGround && this.pos.y < tp.groundY - 4) {
      this.respawnTimer = 1.6;
      this.awaitingRespawn = true;
      this.model.setVisible(false);
      this.drifting = false;
      this.events.push('fall');
    }

    this.prevInput = { ...inp };
  }

  private prevRamp: TrackPos['ramp'] = null;
  private wasOnPad = false;
  private trickBuffer = 0;
  private awaitingRespawn = false;

  private land() {
    this.events.push('land');
    this.squash = 0.25;
    if (this.trickDone) {
      this.startBoost(0.8, 1.3);
      this.trickDone = false;
    }
    this.rampLaunch = false;
  }

  private hitWall(pen: number, rh: THREE.Vector3) {
    this.pos.addScaledVector(rh, -pen);
    const out = this.vel.dot(rh) * Math.sign(pen);
    if (out > 0) {
      this.vel.addScaledVector(rh, -Math.sign(pen) * out * 1.4);
      if (out > 6) {
        this.vel.multiplyScalar(0.82);
        this.events.push('wall');
        if (this.drifting && out > 10) {
          this.drifting = false;
          this.driftLevel = 0;
          this.driftCharge = 0;
        }
      }
    }
  }

  private doRespawn(track: Track) {
    let s = this.lastSafeS;
    for (let k = 0; k < 200 && track.samples[track.idxAt(s)].gap; k++) s += 1;
    if (track.samples[track.idxAt(s - 6)].gap || track.samples[track.idxAt(s)].gap) s += 6;
    const line = track.samples[track.idxAt(s)].line;
    this.awaitingRespawn = false;
    this.place(track, s, line * 0.5);
    this.pos.y += 3;
    this.grounded = false;
    this.model.setVisible(true);
    this.invuln = 2;
    this.events.push('respawn');
  }

  // -------------------------------------------------------------------------
  // Visuals
  // -------------------------------------------------------------------------

  updateVisual(alpha: number, dt: number, time: number) {
    const m = this.model;
    const p = m.root.position.copy(this.prevPos).lerp(this.pos, alpha);
    const heading = this.prevHeading + (this.heading - this.prevHeading) * alpha;

    // Ground alignment
    const targetN = this.grounded ? this.tp.normal : Y;
    this.visNormal.lerp(targetN, 1 - Math.exp(-(this.grounded ? 14 : 3) * dt)).normalize();
    this.visYawOffset = damp(this.visYawOffset, this.drifting ? this.driftDir * -0.42 : 0, 8, dt);

    if (this.hitTimer > 0) this.visSpin += dt * (this.hitKind === 'spin' ? 16 : 10);
    else this.visSpin = dampAngle(this.visSpin, 0, 10, dt);

    const qAlign = new THREE.Quaternion().setFromUnitVectors(Y, this.visNormal);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(Y, heading);
    m.root.quaternion.copy(qAlign).multiply(qYaw);

    // Body: drift yaw, spin, trick flip, tumble, hop
    const body = m.body;
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    if (this.hitKind === 'tumble' && this.hitTimer > 0) {
      body.rotation.x = this.visSpin;
    } else {
      body.rotation.y = this.visYawOffset + (this.hitTimer > 0 ? this.visSpin : 0);
    }
    if (this.trickAnim > 0) {
      const t = 1 - this.trickAnim / 0.5;
      body.rotation.z = t * Math.PI * 2 * (this.id % 2 ? 1 : -1);
      body.position.y = Math.sin(t * Math.PI) * 0.6;
    }
    if (this.drifting) body.rotation.z += this.driftDir * 0.08;
    this.squash = Math.max(0, this.squash - dt);
    const sq = Math.sin((this.squash / 0.25) * Math.PI) * 0.12;
    body.scale.set(1 + sq, 1 - sq, 1 + sq);

    // Wheels
    this.wheelSpin += (this.speed * dt) / 0.4;
    for (const w of m.wheels) w.rotation.x = this.wheelSpin;
    const steerVis = this.drifting ? -this.driftDir * 0.15 : -this.input.steer * 0.45;
    for (const f of m.frontPivots) f.rotation.y = damp(f.rotation.y, this.controllable ? steerVis : 0, 12, dt);

    // Exhaust flames
    const boosting = this.boostTimer > 0;
    for (const f of m.flames) {
      f.visible = boosting || (this.speed > 2 && this.input.accel);
      const s = boosting ? 0.8 + Math.random() * 0.5 : 0.25 + Math.random() * 0.15;
      f.scale.set(boosting ? 1.1 : 0.7, boosting ? 1.1 : 0.7, s);
    }
    m.flameMat.color.set(boosting ? (this.boostPower > 1.3 ? '#ff9a2e' : '#6fc8ff') : '#ffb347');

    // Star rainbow / invulnerability blink
    if (this.starTimer > 0) {
      m.setEmissive(new THREE.Color().setHSL((time * 2.5) % 1, 1, 0.5), 0.9);
    } else {
      m.setEmissive(null);
    }
    let visible = true;
    if (this.respawnTimer > 0.6) visible = false;
    else if (this.invuln > 0 && this.hitTimer <= 0 && this.starTimer <= 0 && Math.floor(time * 16) % 2 === 0) visible = false;
    m.body.visible = visible;

    // Shadow sits on the ground under the kart
    m.shadow.position.set(p.x, (this.grounded ? p.y : this.tp.hasGround ? this.tp.groundY : -999) + 0.06, p.z);
    m.shadow.rotation.y = heading;
    const h = Math.max(0, p.y - this.tp.groundY);
    (m.shadow.material as THREE.MeshBasicMaterial).opacity = 0.5 * clamp(1 - h / 8, 0.2, 1);
    m.shadow.visible = this.respawnTimer <= 0.6 && this.tp.hasGround;
  }
}
