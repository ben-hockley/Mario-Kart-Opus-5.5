import * as THREE from 'three';
import { toon } from '../render/toon';
import type { CharacterDef } from './characters';
import { shadowTexture } from '../render/textures';

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 16, 12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 10),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2),
  torus: new THREE.TorusGeometry(0.18, 0.04, 6, 14),
  flame: new THREE.ConeGeometry(0.16, 1, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
};

/** Visual representation of a kart + driver built from primitives. */
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
  readonly headAnchor = new THREE.Group();

  constructor(readonly char: CharacterDef) {
    const kartMat = this.mat(char.kart);
    const accentMat = this.mat(char.accent);
    const outfitMat = this.mat(char.outfit);
    const skinMat = this.mat(char.skin);
    const darkMat = this.mat('#2a2833');
    const metalMat = this.mat('#9aa3b5');
    const tyreMat = this.mat('#1c1b22');
    const whiteMat = this.mat('#ffffff');
    const blackMat = this.mat('#111018');

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

    this.part(b, geo.box, outfitMat, [0, 0.85, -0.55], [0.8, 0.7, 0.2]); // seat back
    const wheel = new THREE.Mesh(geo.torus, darkMat);
    wheel.position.set(0, 1.0, 0.35);
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

    // Driver
    const d = new THREE.Group();
    d.position.set(0, 0, -0.2);
    b.add(d);
    this.part(d, geo.cyl, outfitMat, [0, 1.05, 0], [0.36, 0.6, 0.3]);
    this.part(d, geo.sphere, outfitMat, [0, 1.35, 0], [0.36, 0.2, 0.3]);
    // arms reaching for the wheel
    for (const x of [0.32, -0.32]) {
      this.part(d, geo.cyl, outfitMat, [x, 1.15, 0.3], [0.09, 0.5, 0.09], [1.1, 0, x > 0 ? -0.2 : 0.2]);
      this.part(d, geo.sphere, skinMat, [x * 0.75, 1.02, 0.52], [0.1, 0.1, 0.1]);
    }
    this.headAnchor.position.set(0, 1.7, 0);
    d.add(this.headAnchor);
    this.buildHead(char, skinMat, outfitMat, accentMat, whiteMat, blackMat);

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

  private buildHead(
    c: CharacterDef,
    skin: THREE.Material,
    outfit: THREE.Material,
    accent: THREE.Material,
    white: THREE.Material,
    black: THREE.Material,
  ) {
    const h = this.headAnchor;
    const eyes = (y = 0.05, z = 0.34, spread = 0.15, size = 0.1) => {
      for (const x of [spread, -spread]) {
        this.part(h, geo.sphere, white, [x, y, z], [size, size * 1.2, size * 0.6]);
        this.part(h, geo.sphere, black, [x, y, z + size * 0.45], [size * 0.5, size * 0.65, size * 0.3]);
      }
    };
    switch (c.accessory) {
      case 'robot': {
        this.part(h, geo.box, skin, [0, 0, 0], [0.72, 0.62, 0.62]);
        const glow = new THREE.MeshBasicMaterial({ color: '#4ff3ff' });
        this.part(h, geo.box, glow, [0.15, 0.06, 0.315], [0.14, 0.1, 0.02]);
        this.part(h, geo.box, glow, [-0.15, 0.06, 0.315], [0.14, 0.1, 0.02]);
        this.part(h, geo.box, outfit, [0, -0.16, 0.315], [0.36, 0.06, 0.02]);
        this.part(h, geo.cyl, outfit, [0, 0.45, 0], [0.03, 0.3, 0.03]);
        this.part(h, geo.sphere, accent, [0, 0.62, 0], [0.09, 0.09, 0.09]);
        for (const x of [0.38, -0.38]) this.part(h, geo.cyl, outfit, [x, 0, 0], [0.12, 0.08, 0.12], [0, 0, Math.PI / 2]);
        return;
      }
      case 'helmet': {
        this.part(h, geo.sphere, skin, [0, 0, 0.02], [0.36, 0.38, 0.36]);
        eyes(0.04, 0.3, 0.12, 0.08);
        const glass = new THREE.MeshToonMaterial({ color: '#b9a2ff', transparent: true, opacity: 0.35 });
        this.part(h, geo.sphere, glass, [0, 0.02, 0], [0.5, 0.5, 0.5]);
        this.part(h, geo.cyl, accent, [0, -0.38, 0], [0.4, 0.14, 0.4]);
        this.part(h, geo.cyl, outfit, [0, 0.52, 0], [0.03, 0.18, 0.03]);
        this.part(h, geo.sphere, accent, [0, 0.64, 0], [0.07, 0.07, 0.07]);
        return;
      }
    }
    this.part(h, geo.sphere, skin, [0, 0, 0], [0.42, 0.42, 0.42]);
    eyes();
    switch (c.accessory) {
      case 'beak':
        this.part(h, geo.cone, accent, [0, -0.06, 0.48], [0.13, 0.32, 0.13], [Math.PI / 2, 0, 0]);
        for (const [x, rz] of [
          [0, 0],
          [0.1, -0.35],
          [-0.1, 0.35],
        ])
          this.part(h, geo.cone, outfit, [x, 0.5, -0.05], [0.07, 0.3, 0.07], [0, 0, rz]);
        break;
      case 'catEars':
        for (const x of [0.25, -0.25]) {
          this.part(h, geo.cone, skin, [x, 0.4, 0], [0.14, 0.3, 0.1], [0, 0, x > 0 ? -0.3 : 0.3]);
          this.part(h, geo.cone, outfit, [x, 0.39, 0.03], [0.08, 0.2, 0.05], [0, 0, x > 0 ? -0.3 : 0.3]);
        }
        this.part(h, geo.sphere, outfit, [0, -0.06, 0.41], [0.05, 0.04, 0.03]);
        break;
      case 'bunnyEars':
        for (const x of [0.14, -0.14]) {
          this.part(h, geo.sphere, skin, [x, 0.62, -0.05], [0.09, 0.36, 0.06], [0, 0, x > 0 ? -0.15 : 0.15]);
          this.part(h, geo.sphere, outfit, [x, 0.62, -0.01], [0.05, 0.26, 0.04], [0, 0, x > 0 ? -0.15 : 0.15]);
        }
        break;
      case 'dinoSpikes':
        this.part(h, geo.sphere, skin, [0, -0.1, 0.32], [0.3, 0.22, 0.26]);
        for (let i = 0; i < 4; i++) {
          this.part(h, geo.cone, outfit, [0, 0.38 - i * 0.14, -0.1 - i * 0.14], [0.08, 0.2, 0.08], [-0.6 - i * 0.3, 0, 0]);
        }
        break;
      case 'bearEars':
        for (const x of [0.3, -0.3]) {
          this.part(h, geo.sphere, skin, [x, 0.34, -0.02], [0.14, 0.14, 0.08]);
          this.part(h, geo.sphere, accent, [x, 0.34, 0.02], [0.08, 0.08, 0.06]);
        }
        this.part(h, geo.sphere, this.mat('#e8c9a4'), [0, -0.12, 0.34], [0.2, 0.15, 0.14]);
        this.part(h, geo.sphere, black, [0, -0.06, 0.47], [0.06, 0.04, 0.04]);
        break;
      case 'horns':
        for (const x of [0.3, -0.3]) {
          this.part(h, geo.cone, accent, [x * 1.25, 0.34, 0], [0.09, 0.4, 0.09], [0, 0, x > 0 ? -0.8 : 0.8]);
        }
        this.part(h, geo.box, outfit, [0, 0.36, 0], [0.62, 0.1, 0.6]);
        for (const x of [0.1, -0.1]) this.part(h, geo.cone, this.mat('#ffffff'), [x, -0.24, 0.36], [0.04, 0.1, 0.04], [Math.PI, 0, 0]);
        break;
    }
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
