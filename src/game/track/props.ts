import * as THREE from 'three';
import type { Track } from './track';
import type { Theme } from './themes';
import type { ThemeId } from './types';
import { toon } from '../render/toon';
import { mulberry32 } from '../core/math';

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

/** A prop type made of several parts, rendered with one InstancedMesh per part. */
class PropBatch {
  readonly matrices: THREE.Matrix4[] = [];
  constructor(
    readonly parts: Part[],
    /** Extra distance to keep from the track edge (big props stay further back). */
    readonly clearance = 3,
  ) {}
  add(pos: THREE.Vector3, rotY: number, scale: number, scaleY = scale) {
    const m = new THREE.Matrix4().compose(
      pos,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, scaleY, scale),
    );
    this.matrices.push(m);
  }
  build(group: THREE.Group) {
    if (!this.matrices.length) return;
    for (const p of this.parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, this.matrices.length);
      this.matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    }
  }
}

const g = {
  cyl: (rt: number, rb: number, h: number, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0),
  cone: (r: number, h: number, seg = 7) => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0),
  ico: (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail),
  dodeca: (r: number) => new THREE.DodecahedronGeometry(r, 0),
};

function makeBatches(themeId: ThemeId) {
  const t = (c: string) => toon(c);
  const glow = (c: string) => new THREE.MeshBasicMaterial({ color: c });
  switch (themeId) {
    case 'coast':
      return {
        near: [
          new PropBatch([
            { geo: palmTrunk(), mat: t('#a0703f') },
            { geo: palmLeaves(), mat: t('#2fb24a') },
          ]),
          new PropBatch([{ geo: g.dodeca(1.6).translate(0, 0.8, 0), mat: t('#9a8f86') }]),
          new PropBatch([
            { geo: g.cyl(0.08, 0.08, 3.2, 5), mat: t('#ffffff') },
            { geo: g.cone(2, 0.9, 8).translate(0, 2.8, 0), mat: t('#ff5a6e') },
          ]),
        ],
        far: new PropBatch([{ geo: g.cone(1, 1, 7), mat: t('#58b85a') }]),
        farKind: 'island' as const,
      };
    case 'frost':
      return {
        near: [
          new PropBatch([
            { geo: g.cyl(0.3, 0.4, 1.6), mat: t('#6b4a33') },
            { geo: g.cone(2.2, 3.4).translate(0, 1.4, 0), mat: t('#2f7a55') },
            { geo: g.cone(1.6, 2.6).translate(0, 3.4, 0), mat: t('#2f7a55') },
            { geo: g.cone(1.0, 1.4).translate(0, 5.4, 0), mat: t('#ffffff') },
          ]),
          new PropBatch([{ geo: g.dodeca(1.8).translate(0, 0.6, 0), mat: t('#e8f2ff') }]),
          new PropBatch([
            { geo: g.ico(1.0, 1).translate(0, 0.9, 0), mat: t('#ffffff') },
            { geo: g.ico(0.7, 1).translate(0, 2.3, 0), mat: t('#ffffff') },
            { geo: g.cone(0.12, 0.5).rotateX(Math.PI / 2).translate(0, 2.3, 0.65), mat: t('#ff8a1f') },
          ]),
        ],
        far: new PropBatch([
          { geo: g.cone(1, 1, 6), mat: t('#8ea4c4') },
          { geo: g.cone(0.42, 0.42, 6).translate(0, 0.58, 0), mat: t('#ffffff') },
        ]),
        farKind: 'mountain' as const,
      };
    case 'magma':
      return {
        near: [
          new PropBatch(
            [
              { geo: g.cyl(2.2, 2.4, 12, 8), mat: t('#6f6a78') },
              { geo: g.cone(2.9, 4.5, 8).translate(0, 12, 0), mat: t('#7a1f2b') },
              { geo: g.cyl(0.5, 0.5, 1.4, 4).translate(0, 7, 2.1), mat: glow('#ffb347') },
            ],
            14,
          ),
          new PropBatch([{ geo: g.cone(1.2, 5, 5), mat: t('#2c2328') }]),
          new PropBatch([{ geo: g.cone(0.6, 2.4, 4), mat: glow('#ff6a1f') }]),
        ],
        far: new PropBatch([
          { geo: g.cone(1, 1, 7), mat: t('#2a1f24') },
          { geo: g.cone(0.25, 0.1, 7).translate(0, 0.9, 0), mat: glow('#ff5a1f') },
        ]),
        farKind: 'volcano' as const,
      };
    default:
      return {
        near: [
          new PropBatch([
            { geo: g.cyl(0.35, 0.45, 2.4), mat: t('#7a5234') },
            { geo: g.ico(2.2, 0).translate(0, 3.6, 0), mat: t('#3fae3f') },
            { geo: g.ico(1.5, 0).translate(0.9, 4.8, 0.4), mat: t('#56c450') },
          ]),
          new PropBatch([{ geo: g.ico(1.3, 0).translate(0, 0.6, 0), mat: t('#3d9e3a') }]),
          new PropBatch([
            { geo: g.cyl(0.08, 0.08, 1.2, 4), mat: t('#3d9e3a') },
            { geo: g.ico(0.35, 0).translate(0, 1.25, 0), mat: t('#ff6fa8') },
          ]),
        ],
        far: new PropBatch([{ geo: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat: t('#4fb542') }]),
        farKind: 'hill' as const,
      };
  }
}

function palmTrunk() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const seg = new THREE.CylinderGeometry(0.28 - k * 0.025, 0.32 - k * 0.025, 1.3, 6).translate(k * 0.22, 0.65 + k * 1.2, 0);
    parts.push(seg);
  }
  return mergeAll(parts);
}

function palmLeaves() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const leaf = new THREE.BoxGeometry(0.9, 0.1, 3.6).translate(0, 0, 1.8).rotateX(0.35).rotateY((k / 6) * Math.PI * 2).translate(1.2, 7.4, 0);
    parts.push(leaf);
  }
  return mergeAll(parts);
}

function mergeAll(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const p of parts) {
    const q = p.index ? p.toNonIndexed() : p;
    pos.push(...(q.attributes.position.array as Float32Array));
    nor.push(...(q.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

export function buildProps(track: Track, theme: Theme): THREE.Group {
  const group = new THREE.Group();
  const rnd = mulberry32(track.def.seed);
  const batches = makeBatches(track.def.theme);
  const S = track.samples;

  const clearOfTrack = (x: number, z: number, margin: number) => {
    for (let i = 0; i < S.length; i += 3) {
      const s = S[i];
      const lim = s.halfW + s.offroad + margin;
      if ((s.pos.x - x) ** 2 + (s.pos.z - z) ** 2 < lim * lim) return false;
    }
    return true;
  };

  const pos = new THREE.Vector3();
  const weights = [0.55, 0.3, 0.15];
  for (let k = 0; k < 520; k++) {
    const i = Math.floor(rnd() * S.length);
    const s = S[i];
    const side = rnd() < 0.5 ? -1 : 1;
    const edge = side < 0 ? s.leftEdge : s.rightEdge;
    let r = rnd();
    let kind = 0;
    while (kind < weights.length - 1 && r > weights[kind]) r -= weights[kind++];
    const clearance = batches.near[kind].clearance;
    const dist = s.halfW + s.offroad + clearance + 1 + Math.pow(rnd(), 1.6) * 90;
    pos.copy(s.pos).addScaledVector(s.rh, side * dist);
    if (!clearOfTrack(pos.x, pos.z, clearance)) continue;
    if ((edge === 'water' || edge === 'lava') && dist < s.halfW + s.offroad + 40) {
      if (theme.island || theme.liquid === 'lava') continue;
    }
    if (theme.island) {
      // stay on the sand: only the inner side of the loop (left) is land everywhere
      if (side > 0 && dist > s.halfW + s.offroad + 30) continue;
    }
    pos.y = theme.groundY;
    const sc = 0.8 + rnd() * 0.6;
    batches.near[kind].add(pos, rnd() * Math.PI * 2, sc);
  }

  // Far scenery ring
  const center = track.bounds.getCenter(new THREE.Vector3());
  const size = track.bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.5 + 140;
  const count = 26;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + rnd() * 0.2;
    const d = radius + rnd() * 220;
    pos.set(center.x + Math.cos(a) * d, theme.groundY - (theme.island ? 1 : 0), center.z + Math.sin(a) * d);
    let w: number;
    let h: number;
    switch (batches.farKind) {
      case 'mountain':
        w = 80 + rnd() * 90;
        h = 90 + rnd() * 120;
        break;
      case 'volcano':
        w = 70 + rnd() * 70;
        h = 60 + rnd() * 90;
        break;
      case 'island':
        w = 30 + rnd() * 40;
        h = 12 + rnd() * 25;
        break;
      default:
        w = 50 + rnd() * 70;
        h = 18 + rnd() * 30;
    }
    batches.far.add(pos, rnd() * Math.PI, w, h);
  }

  for (const b of batches.near) b.build(group);
  batches.far.build(group);

  // Clouds
  const cloudMat = new THREE.MeshLambertMaterial({ color: theme.liquid === 'lava' ? '#5a2a2a' : '#ffffff', emissive: theme.liquid === 'lava' ? '#401010' : '#aab4c8' });
  const cloud = new PropBatch([
    { geo: new THREE.IcosahedronGeometry(10, 1), mat: cloudMat },
    { geo: new THREE.IcosahedronGeometry(7, 1).translate(11, -2, 2), mat: cloudMat },
    { geo: new THREE.IcosahedronGeometry(7, 1).translate(-11, -3, -1), mat: cloudMat },
  ]);
  for (let k = 0; k < 16; k++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * radius * 1.3;
    pos.set(center.x + Math.cos(a) * d, 90 + rnd() * 50, center.z + Math.sin(a) * d);
    cloud.add(pos, rnd() * Math.PI, 0.8 + rnd() * 0.9, 0.5 + rnd() * 0.2);
  }
  cloud.build(group);

  return group;
}
