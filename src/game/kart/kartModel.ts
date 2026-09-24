import * as THREE from 'three';
import { toon } from '../render/toon';
import type { CharacterDef, WeightClass } from './characters';
import { driverHeight, driverModel } from './characterModels';
import { vehicleModel } from './vehicleModels';
import { DEFAULT_VEHICLE, paintFor, type VehicleDef } from './vehicles';
import { shadowTexture } from '../render/textures';

/** Seated head height (above the hips) each weight class is scaled to. Vehicles are resized to match. */
export const DRIVER_HEIGHT: Record<WeightClass, number> = { Light: 1.05, Medium: 1.2, Heavy: 1.4 };

const geo = {
  torus: new THREE.TorusGeometry(1, 0.22, 6, 16),
  flame: new THREE.ConeGeometry(0.16, 1, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
};

/** Visual representation of a kart or bike and its driver. */
export class KartModel {
  readonly root = new THREE.Group();
  /** Receives hop / drift yaw / spin / trick transforms. */
  readonly body = new THREE.Group();
  /** The vehicle and driver, in the vehicle's own units (resized to the driver's weight class). */
  readonly frame = new THREE.Group();
  /** Where the driver's hips and left hand go, in `frame`. */
  readonly seat: THREE.Vector3;
  readonly grip: THREE.Vector3;
  readonly wheels: THREE.Object3D[] = [];
  /** Radius of each wheel in `wheels`, in game units. */
  readonly wheelRadius: number[] = [];
  readonly frontPivots: THREE.Object3D[] = [];
  readonly flames: THREE.Mesh[] = [];
  readonly shadow: THREE.Mesh;
  readonly materials: THREE.MeshToonMaterial[] = [];
  readonly flameMat: THREE.MeshBasicMaterial;
  /** Bikes lean into turns. */
  readonly bike: boolean;
  /** Local positions for particle emitters. */
  readonly rearWheelL: THREE.Vector3;
  readonly rearWheelR: THREE.Vector3;
  readonly exhaust: THREE.Vector3;

  constructor(
    readonly char: CharacterDef,
    readonly vehicle: VehicleDef = DEFAULT_VEHICLE,
    opts: { driver?: boolean } = {},
  ) {
    this.root.add(this.body);
    const v = vehicleModel(vehicle.id, paintFor(char, vehicle));
    this.bike = v.bike;
    this.seat = v.seat;
    this.grip = v.grip;
    this.materials.push(...v.materials);

    // The vehicle is built for its own weight class; resize it (and the seat and grips with it) to the driver's.
    const k = DRIVER_HEIGHT[char.weightClass] / DRIVER_HEIGHT[vehicle.size];
    const frame = this.frame;
    frame.scale.setScalar(k);
    frame.add(v.model);
    this.body.add(frame);
    for (const w of v.wheels) {
      this.wheels.push(w.spin);
      this.wheelRadius.push(Math.max(0.05, w.radius * k));
      if (w.front) this.frontPivots.push(w.holder);
    }

    this.flameMat = new THREE.MeshBasicMaterial({
      color: '#ffb347',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const p of v.exhaust) {
      const flame = new THREE.Mesh(geo.flame, this.flameMat);
      flame.position.copy(p).multiplyScalar(k);
      flame.visible = false;
      this.body.add(flame);
      this.flames.push(flame);
    }
    this.exhaust = v.exhaust.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(v.exhaust.length).multiplyScalar(k);
    this.rearWheelL = v.rearWheelL.multiplyScalar(k);
    this.rearWheelR = v.rearWheelR.multiplyScalar(k);

    // Driver: hips on the seat, leaning forward on bikes, hands reaching for the grips.
    if (opts.driver !== false) {
      const height = driverHeight(char.id);
      // Driver units -> vehicle units (inside `frame`).
      const s = DRIVER_HEIGHT[vehicle.size] / height;
      const hands = v.grip
        .clone()
        .sub(v.seat)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -v.lean)
        .divideScalar(s);
      const driver = driverModel(char.id, { bike: v.bike, hands });
      driver.model.scale.setScalar(s);
      driver.model.position.copy(v.seat);
      driver.model.rotation.x = v.lean;
      frame.add(driver.model);
      driver.model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.materials.push(m as THREE.MeshToonMaterial);
      });
      if (v.steeringWheel) {
        const wheel = new THREE.Mesh(geo.torus, this.mat('#2a2833'));
        wheel.scale.setScalar(Math.max(0.12, Math.abs(v.grip.x) * 0.9));
        wheel.position.set(0, v.grip.y, v.grip.z);
        wheel.rotation.x = -0.9;
        frame.add(wheel);
      }
    }

    // Blob shadow (kept flat on the ground, not part of the body)
    const size = v.box.getSize(new THREE.Vector3()).multiplyScalar(k);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(1.2, size.x * 1.25), Math.max(2, size.z * 1.1)).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }),
    );
    this.shadow.renderOrder = 1;
  }

  private mat(color: string) {
    const m = toon(color, { unique: true });
    this.materials.push(m);
    return m;
  }

  /** Star / invulnerability tint. */
  setEmissive(color: THREE.Color | null, intensity = 1) {
    for (const m of this.materials) {
      if (color) {
        m.emissive.copy(color);
        m.emissiveIntensity = intensity;
      } else m.emissive.setRGB(0, 0, 0);
    }
  }

  setVisible(v: boolean) {
    this.body.visible = v;
    this.shadow.visible = v;
  }
}
