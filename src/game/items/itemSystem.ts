import * as THREE from 'three';
import { Track, TrackPos } from '../track/track';
import type { Kart } from '../kart/kart';
import { toon } from '../render/toon';
import { itemBoxTexture } from '../render/textures';
import { ROULETTE_TIME, rollItem, type ItemKind } from './itemTypes';

export type ProjectileKind = 'banana' | 'green' | 'red';

export type ItemEvent =
  | { type: 'box'; kart: Kart }
  | { type: 'use'; kart: Kart; item: ItemKind }
  | { type: 'throw'; kart: Kart; kind: ProjectileKind }
  | { type: 'hit'; kart: Kart; by: Kart | null; kind: ProjectileKind | 'star' }
  | { type: 'break'; pos: THREE.Vector3; kind: ProjectileKind }
  | { type: 'bounce'; pos: THREE.Vector3 };

interface ItemBox {
  pos: THREE.Vector3;
  active: boolean;
  timer: number;
  mesh: THREE.Group;
  phase: number;
}

export class Projectile {
  readonly tp = new TrackPos();
  vel = new THREE.Vector3();
  vy = 0;
  life = 0;
  bounces = 0;
  grace = 0.35;
  held = true;
  grounded = false;
  alive = true;
  target: Kart | null = null;
  constructor(
    readonly kind: ProjectileKind,
    public owner: Kart | null,
    readonly mesh: THREE.Object3D,
    readonly pos = new THREE.Vector3(),
  ) {}
}

const SHELL_SPEED = { green: 44, red: 47 };
const MAX_BANANAS = 24;

// Shared meshes
const shellGeo = new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1);
const rimGeo = new THREE.TorusGeometry(0.55, 0.12, 6, 16).rotateX(Math.PI / 2);
const bananaGeo = new THREE.TorusGeometry(0.45, 0.17, 6, 12, Math.PI * 0.95).rotateZ(Math.PI * 0.03);

function makeProjectileMesh(kind: ProjectileKind): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'banana') {
    const b = new THREE.Mesh(bananaGeo, toon('#ffe14d'));
    b.rotation.set(0, 0, Math.PI);
    b.position.y = 0.6;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), toon('#5a3a1a'));
    tip.position.set(0.45, 0.6, 0);
    g.add(b, tip);
  } else {
    const shell = new THREE.Mesh(shellGeo, toon(kind === 'green' ? '#2fd14a' : '#ff3040'));
    shell.position.y = 0.25;
    const rim = new THREE.Mesh(rimGeo, toon('#ffffff'));
    rim.position.y = 0.25;
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.2, 14), toon('#fff4d0'));
    bottom.position.y = 0.12;
    g.add(shell, rim, bottom);
  }
  return g;
}

export class ItemSystem {
  readonly group = new THREE.Group();
  readonly boxes: ItemBox[] = [];
  readonly projectiles: Projectile[] = [];
  events: ItemEvent[] = [];
  private time = 0;

  constructor(private readonly track: Track) {
    const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const boxMat = new THREE.MeshToonMaterial({
      map: itemBoxTexture(),
      transparent: true,
      opacity: 0.92,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.25,
    });
    const frame = { pos: new THREE.Vector3(), heading: 0, idx: 0 };
    for (const cp of track.def.itemRows) {
      const s = track.sAtCp(cp);
      const halfW = track.samples[track.idxAt(s)].halfW;
      const count = halfW >= 9 ? 5 : 4;
      for (let k = 0; k < count; k++) {
        const lat = (k / (count - 1) - 0.5) * 2 * (halfW - 2.2);
        track.frameAt(s, lat, frame);
        const mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(boxGeo, boxMat));
        mesh.position.copy(frame.pos);
        this.group.add(mesh);
        this.boxes.push({ pos: frame.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), active: true, timer: 0, mesh, phase: k * 0.7 });
      }
    }
  }

  /** Handle item button presses/releases for a kart (call before physics). */
  handleInput(k: Kart, racing: boolean) {
    const pressed = k.input.item && !k.prevInput.item;
    const released = !k.input.item && k.prevInput.item;
    const ready = k.item !== null && k.rouletteTimer <= 0;

    if (k.holding) {
      const held = this.heldBy(k);
      if (!held) {
        k.holding = false;
      } else if ((released || !k.controllable) && racing) {
        if (!k.controllable) this.destroy(held);
        else this.deploy(held, k);
        k.holding = false;
      }
      return;
    }
    if (!pressed || !ready || !racing || !k.controllable) return;
    const item = k.item!;
    switch (item) {
      case 'mushroom':
        k.startBoost(1.2, 1.45);
        k.item = null;
        break;
      case 'triple':
        k.startBoost(1.2, 1.45);
        k.itemCount--;
        if (k.itemCount <= 0) k.item = null;
        break;
      case 'star':
        k.starTimer = 7.5;
        k.item = null;
        break;
      case 'banana':
      case 'green':
      case 'red': {
        const p = new Projectile(item, k, makeProjectileMesh(item));
        this.group.add(p.mesh);
        this.projectiles.push(p);
        k.holding = true;
        k.item = null;
        this.placeHeld(p, k);
        break;
      }
    }
    this.events.push({ type: 'use', kart: k, item });
  }

  private heldBy(k: Kart) {
    return this.projectiles.find((p) => p.alive && p.held && p.owner === k);
  }

  private placeHeld(p: Projectile, k: Kart) {
    const f = k.forward;
    p.pos.copy(k.pos).addScaledVector(f, -2.3);
    p.pos.y = k.pos.y;
    p.vel.copy(k.vel);
  }

  private deploy(p: Projectile, k: Kart) {
    p.held = false;
    p.grace = 0.35;
    const f = k.forward;
    // Bananas drop behind unless BRAKE is held (throw forward); shells fire forward unless BRAKE is held.
    const backward = p.kind === 'banana' ? !k.input.brake : k.input.brake;
    this.events.push({ type: 'throw', kart: k, kind: p.kind });
    if (p.kind === 'banana') {
      if (backward) {
        p.pos.copy(k.pos).addScaledVector(f, -2.4);
        p.vel.set(0, 0, 0);
        p.vy = 0;
      } else {
        p.pos.copy(k.pos).addScaledVector(f, 2.2);
        p.pos.y += 1;
        p.vel.copy(f).multiplyScalar(Math.max(0, k.speed) + 16);
        p.vy = 9;
      }
      p.grace = 0.6;
      this.trimBananas();
    } else {
      const dir = backward ? f.clone().negate() : f.clone();
      p.pos.copy(k.pos).addScaledVector(dir, 2.4);
      p.vel.copy(dir).multiplyScalar(SHELL_SPEED[p.kind] + (backward ? 0 : Math.max(0, k.speed) * 0.3));
      if (p.kind === 'red' && !backward) p.target = this.targetAhead?.(k) ?? null;
    }
    p.pos.y += 0.1;
    p.grounded = false;
  }

  /** Supplied by the race: who should a red shell fired by `k` chase? */
  targetAhead: ((k: Kart) => Kart | null) | null = null;

  private trimBananas() {
    const bananas = this.projectiles.filter((p) => p.alive && p.kind === 'banana' && !p.held);
    if (bananas.length > MAX_BANANAS) this.destroy(bananas[0], false);
  }

  private destroy(p: Projectile, fx = true) {
    if (!p.alive) return;
    p.alive = false;
    this.group.remove(p.mesh);
    if (fx) this.events.push({ type: 'break', pos: p.pos.clone(), kind: p.kind });
  }

  update(dt: number, karts: Kart[]) {
    this.time += dt;

    // Boxes
    for (const b of this.boxes) {
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) b.active = true;
        const grow = Math.min(1, Math.max(0, 1 - b.timer / 0.4));
        b.mesh.scale.setScalar(b.active ? 1 : grow * 0.001);
      } else {
        b.mesh.scale.setScalar(Math.min(1, b.mesh.scale.x + dt * 3));
      }
      b.mesh.visible = b.active || b.timer < 0.4;
      b.mesh.position.y = b.pos.y + Math.sin(this.time * 2 + b.phase) * 0.18;
      b.mesh.rotation.set(this.time * 0.9 + b.phase, this.time * 1.3 + b.phase, 0);
      if (!b.active) continue;
      for (const k of karts) {
        if (k.respawnTimer > 0) continue;
        const dx = k.pos.x - b.pos.x;
        const dz = k.pos.z - b.pos.z;
        const dy = k.pos.y + 0.8 - b.pos.y;
        if (dx * dx + dz * dz < 2.2 * 2.2 && Math.abs(dy) < 2.2) {
          b.active = false;
          b.timer = 1.8;
          b.mesh.scale.setScalar(0.001);
          if (k.item === null && k.rouletteTimer <= 0 && !k.holding) {
            k.item = rollItem(k.position, karts.length);
            k.itemCount = k.item === 'triple' ? 3 : 1;
            k.rouletteTimer = ROULETTE_TIME;
          }
          this.events.push({ type: 'box', kart: k });
          this.events.push({ type: 'break', pos: b.pos.clone(), kind: 'green' });
          break;
        }
      }
    }
    for (const k of karts) if (k.rouletteTimer > 0) k.rouletteTimer = Math.max(0, k.rouletteTimer - dt);

    // Projectiles
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life += dt;
      p.grace = Math.max(0, p.grace - dt);
      if (p.held) {
        const owner = p.owner!;
        if (!owner.holding || owner.respawnTimer > 0) {
          this.destroy(p);
          continue;
        }
        this.placeHeld(p, owner);
      } else if (p.kind === 'banana') {
        this.moveBanana(p, dt);
      } else {
        this.moveShell(p, dt);
      }
      if (!p.alive) continue;
      p.mesh.position.copy(p.pos);
      if (p.kind !== 'banana') p.mesh.rotation.y += dt * 14;
      else if (p.held && p.owner) p.mesh.rotation.y = p.owner.heading;
    }

    this.collide(karts);
    if (this.projectiles.length > 64) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
    }
  }

  private moveBanana(p: Projectile, dt: number) {
    if (p.grounded) return;
    p.vy -= 30 * dt;
    p.pos.addScaledVector(p.vel, dt);
    p.pos.y += p.vy * dt;
    this.track.query(p.pos.x, p.pos.z, p.tp.idx, p.tp, p.pos.y);
    this.clampWalls(p, false);
    if (p.tp.hasGround && p.pos.y <= p.tp.groundY) {
      p.pos.y = p.tp.groundY;
      p.grounded = true;
      p.vel.set(0, 0, 0);
    } else if (!p.tp.hasGround && p.pos.y < p.tp.groundY - 6) {
      this.destroy(p, false);
    }
  }

  private moveShell(p: Projectile, dt: number) {
    if (p.life > 11 || p.bounces > 6) {
      this.destroy(p);
      return;
    }
    const speed = SHELL_SPEED[p.kind as 'green' | 'red'];
    if (p.kind === 'red' && p.target) {
      const t = p.target;
      if (t.finished || t.respawnTimer > 0 || !t.tp) p.target = null;
      else {
        const toT = new THREE.Vector3(t.pos.x - p.pos.x, 0, t.pos.z - p.pos.z);
        const dist = toT.length();
        let desired: THREE.Vector3;
        if (dist < 28) desired = toT.normalize();
        else {
          // follow the track toward the target
          const ahead = this.track.sampleAhead(p.tp.s, 14);
          const aim = ahead.pos.clone().addScaledVector(ahead.rh, ahead.line * 0.5);
          desired = new THREE.Vector3(aim.x - p.pos.x, 0, aim.z - p.pos.z).normalize();
        }
        const cur = p.vel.clone().normalize();
        const turn = (dist < 28 ? 9 : 5) * dt;
        cur.lerp(desired, Math.min(1, turn)).normalize();
        p.vel.copy(cur).multiplyScalar(speed);
      }
    }
    p.pos.addScaledVector(p.vel, dt);
    this.track.query(p.pos.x, p.pos.z, p.tp.idx, p.tp, p.pos.y);
    if (p.tp.hasGround) {
      p.pos.y = p.tp.groundY;
      p.vy = 0;
    } else {
      p.vy -= 30 * dt;
      p.pos.y += p.vy * dt;
      if (p.pos.y < p.tp.groundY - 6) {
        this.destroy(p, false);
        return;
      }
    }
    this.clampWalls(p, true);
  }

  private clampWalls(p: Projectile, bounce: boolean) {
    const tp = p.tp;
    const r = 0.6;
    let pen = 0;
    if (tp.wallR !== null && tp.lat > tp.wallR - r) pen = tp.lat - (tp.wallR - r);
    else if (tp.wallL !== null && tp.lat < tp.wallL + r) pen = tp.lat - (tp.wallL + r);
    if (pen === 0) return;
    p.pos.addScaledVector(tp.rh, -pen);
    const out = p.vel.dot(tp.rh) * Math.sign(pen);
    if (out <= 0) return;
    if (bounce && !(p.kind === 'red' && p.target)) {
      p.vel.addScaledVector(tp.rh, -Math.sign(pen) * out * 2);
      p.bounces++;
      this.events.push({ type: 'bounce', pos: p.pos.clone() });
    } else {
      p.vel.addScaledVector(tp.rh, -Math.sign(pen) * out);
    }
  }

  private collide(karts: Kart[]) {
    const live = this.projectiles.filter((p) => p.alive);
    // projectile vs projectile
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        if (!b.alive) continue;
        if (a.kind === 'banana' && b.kind === 'banana') continue;
        if (a.held && b.held) continue;
        if (a.pos.distanceToSquared(b.pos) < 1.3 * 1.3) {
          this.destroy(a);
          this.destroy(b);
          if (a.owner) a.owner.holding = a.held ? false : a.owner.holding;
          if (b.owner) b.owner.holding = b.held ? false : b.owner.holding;
          break;
        }
      }
    }
    // projectile vs kart
    for (const p of live) {
      if (!p.alive) continue;
      for (const k of karts) {
        if (k.respawnTimer > 0) continue;
        if (p.owner === k && (p.held || p.grace > 0)) continue;
        const dx = k.pos.x - p.pos.x;
        const dz = k.pos.z - p.pos.z;
        const dy = k.pos.y - p.pos.y;
        const rad = p.kind === 'banana' ? 1.5 : 1.6;
        if (dx * dx + dz * dz > rad * rad || Math.abs(dy) > 1.8) continue;

        // A held item behind the kart shields it from things coming from behind.
        if (k.holding && !p.held) {
          const f = k.forward;
          const fromBehind = dx * f.x + dz * f.z > 0; // projectile is behind the kart
          if (fromBehind) {
            const shield = this.heldBy(k);
            if (shield) {
              this.destroy(shield);
              k.holding = false;
              this.destroy(p);
              break;
            }
          }
        }
        if (p.held && p.owner) p.owner.holding = false;
        this.destroy(p);
        if (k.starTimer > 0) break;
        if (k.hit(p.kind === 'banana' ? 'spin' : 'tumble')) {
          this.events.push({ type: 'hit', kart: k, by: p.owner, kind: p.kind });
        }
        break;
      }
    }
  }

  /** Nearby hazards for AI avoidance. */
  hazardsNear(pos: THREE.Vector3, radius: number): Projectile[] {
    const r2 = radius * radius;
    return this.projectiles.filter((p) => p.alive && !p.held && p.pos.distanceToSquared(pos) < r2);
  }

  dispose() {
    this.group.clear();
  }
}
