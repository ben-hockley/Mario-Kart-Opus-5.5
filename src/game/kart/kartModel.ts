import * as THREE from 'three';
import { toon } from '../render/toon';
import type { CharacterDef, WeightClass } from './characters';
import { driverModel } from './characterModels';
import { shadowTexture } from '../render/textures';

/** Seated head height (above the hips) each weight class is scaled to, so every driver fits the one kart. */
const DRIVER_HEIGHT: Record<WeightClass, number> = { Light: 1.05, Medium: 1.2, Heavy: 1.4 };

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2),
  torus: new THREE.TorusGeometry(0.18, 0.04, 6, 14),
  flame: new THREE.ConeGeometry(0.16, 1, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
};

/** Visual representation of a kart (built from primitives) and its Mario Kart Wii driver. */
export class KartModel {
  readonly root = new THREE.Group();
  /** Receives hop / drift yaw / spin / trick transforms. */
  readonly body = new THREE.Group();
  readonly wheels: THREE.Mesh[] = [];
  readonly frontPivots: THREE.Group[] = [];
  readonly flames: THREE.Mesh[] = [];
  readonly shadow: THREE.Mesh;
  readonly materials: THREE.MeshToonMaterial[] = [];
  readonly flameMat: THREE.MeshBasicMaterial;
  /** Local positions for particle emitters. */
  readonly rearWheelL = new THREE.Vector3(0.85, 0.05, -0.8);
  readonly rearWheelR = new THREE.Vector3(-0.85, 0.05, -0.8);
  readonly exhaust = new THREE.Vector3(0, 0.75, -1.6);

  constructor(readonly char: CharacterDef) {
    const kartMat = this.mat(char.kart);
    const accentMat = this.mat(char.accent);
    const darkMat = this.mat('#2a2833');
    const metalMat = this.mat('#9aa3b5');
    const tyreMat = this.mat('#1c1b22');

    this.root.add(this.body);
    const b = this.body;

    // Chassis
    this.part(b, geo.box, kartMat, [0, 0.42, 0.05], [1.5, 0.32, 2.3]);
    this.part(b, geo.box, kartMat, [0, 0.46, 1.2], [1.1, 0.26, 0.7], [0.18, 0, 0]);
    this.part(b, geo.box, accentMat, [0, 0.3, 1.5], [1.65, 0.18, 0.28]);
    this.part(b, geo.box, accentMat, [0.82, 0.48, -0.05], [0.26, 0.3, 1.3]);
    this.part(b, geo.box, accentMat, [-0.82, 0.48, -0.05], [0.26, 0.3, 1.3]);
    this.part(b, geo.box, darkMat, [0, 0.72, -1.0], [1.0, 0.45, 0.6]);
    this.part(b, geo.box, accentMat, [0, 1.12, -1.25], [1.4, 0.08, 0.35]); // spoiler
    this.part(b, geo.box, darkMat, [0.5, 0.95, -1.25], [0.08, 0.35, 0.2]);
    this.part(b, geo.box, darkMat, [-0.5, 0.95, -1.25], [0.08, 0.35, 0.2]);
    for (const x of [0.3, -0.3]) {
      this.part(b, geo.cyl, metalMat, [x, 0.72, -1.4], [0.1, 0.45, 0.1], [Math.PI / 2, 0, 0]);
      const flame = new THREE.Mesh(geo.flame, null as unknown as THREE.Material);
      flame.position.set(x, 0.72, -1.6);
      flame.visible = false;
      b.add(flame);
      this.flames.push(flame);
    }
    this.flameMat = new THREE.MeshBasicMaterial({
      color: '#ffb347',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const f of this.flames) f.material = this.flameMat;

    this.part(b, geo.box, darkMat, [0, 0.85, -0.75], [0.8, 0.7, 0.2]); // seat back
    const wheel = new THREE.Mesh(geo.torus, darkMat);
    wheel.rotation.x = -0.9;
    b.add(wheel);

    // Wheels
    const wheelDefs: [number, number, number, number, number][] = [
      [0.86, 0.34, 0.85, 0.34, 0.32],
      [-0.86, 0.34, 0.85, 0.34, 0.32],
      [0.86, 0.42, -0.78, 0.42, 0.42],
      [-0.86, 0.42, -0.78, 0.42, 0.42],
    ];
    wheelDefs.forEach(([x, y, z, r, w], i) => {
      const holder = new THREE.Group();
      holder.position.set(x, y, z);
      b.add(holder);
      const tyre = new THREE.Mesh(geo.wheel, tyreMat);
      tyre.scale.set(w, r, r);
      const hub = new THREE.Mesh(geo.wheel, accentMat);
      hub.scale.set(w + 0.02, r * 0.45, r * 0.45);
      const spin = new THREE.Group();
      spin.add(tyre, hub);
      holder.add(spin);
      this.wheels.push(spin as unknown as THREE.Mesh);
      if (i < 2) this.frontPivots.push(holder);
    });

    // Driver: scaled so heavier characters sit taller, with the steering wheel between their hands.
    const driver = driverModel(char.id);
    const scale = DRIVER_HEIGHT[char.weightClass] / driver.height;
    driver.model.scale.setScalar(scale);
    driver.model.position.set(0, 0.72, -0.3);
    b.add(driver.model);
    driver.model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.materials.push(m as THREE.MeshToonMaterial);
    });
    wheel.position.copy(driver.hands).multiplyScalar(scale).add(driver.model.position);

    // Blob shadow (kept flat on the ground, not part of the body)
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }),
    );
    this.shadow.renderOrder = 1;
  }

  private mat(color: string) {
    const m = toon(color, { unique: true });
    this.materials.push(m);
    return m;
  }

  private part(
    parent: THREE.Object3D,
    g: THREE.BufferGeometry,
    m: THREE.Material,
    p: [number, number, number],
    s: [number, number, number],
    r?: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...p);
    mesh.scale.set(...s);
    if (r) mesh.rotation.set(...r);
    parent.add(mesh);
    return mesh;
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
