import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../core/math';
import type { Kart } from '../kart/kart';

const DIST = 6.4;
const HEIGHT = 2.7;

/** Third-person camera that trails a kart. */
export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.1, 2500);
  private yaw = 0;
  private y = 0;
  private fov = 68;
  private initialized = false;
  /** 0..1 blend from the intro flyover to the chase position. */
  intro = 1;
  private introFrom = new THREE.Vector3();
  private introLook = new THREE.Vector3();

  snap(kart: Kart) {
    this.yaw = kart.heading;
    this.y = kart.pos.y + HEIGHT;
    this.initialized = true;
  }

  /** Starts the pre-race flyover from a high, swinging vantage point. */
  startIntro(kart: Kart, side: number) {
    this.snap(kart);
    this.intro = 0;
    // Stored relative to the kart so the flyover stays framed on it.
    const f = kart.forward;
    this.introFrom.copy(f).multiplyScalar(26).add(new THREE.Vector3(-f.z * 18 * side, 14, f.x * 18 * side));
    this.introLook.set(0, 0, 0);
  }

  update(kart: Kart, dt: number) {
    const target = kart.model.root.position;
    if (!this.initialized) this.snap(kart);

    const falling = kart.respawnTimer > 0.6;
    if (!falling) {
      const lagK = kart.drifting ? 4.5 : 7;
      this.yaw = dampAngle(this.yaw, kart.heading + (kart.drifting ? kart.driftDir * 0.12 : 0), lagK, dt);
      this.y = damp(this.y, target.y + HEIGHT, kart.grounded ? 8 : 3, dt);
    }
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const cam = this.camera;
    const desired = new THREE.Vector3(target.x - fx * DIST, this.y, target.z - fz * DIST);
    const look = new THREE.Vector3(target.x + fx * 3, target.y + 1.3, target.z + fz * 3);
    if (falling) {
      look.copy(target);
      desired.copy(cam.position);
    }

    if (this.intro < 1) {
      this.intro = Math.min(1, this.intro + dt / 3.2);
      const t = this.intro * this.intro * (3 - 2 * this.intro);
      const from = this.introFrom.clone().add(target);
      const fromLook = this.introLook.clone().add(target);
      desired.lerpVectors(from, desired, t);
      look.lerpVectors(fromLook, look, t);
    }
    cam.position.copy(desired);
    cam.lookAt(look);

    const speedRatio = clamp(kart.speed / kart.stats.maxSpeed, 0, 1.5);
    const targetFov = 66 + speedRatio * 6 + (kart.boostTimer > 0 ? 8 : 0);
    this.fov = damp(this.fov, targetFov, 4, dt);
    cam.fov = lerp(55, this.fov, this.intro);
    cam.updateProjectionMatrix();
  }
}
