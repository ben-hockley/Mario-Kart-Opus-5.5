import * as THREE from 'three';
import type { Track } from './track';
import type { Theme } from './themes';
import { toon } from '../render/toon';
import {
  boostTexture,
  checkerTexture,
  groundTexture,
  liquidTexture,
  rampTexture,
  roadTexture,
  stripeTexture,
} from '../render/textures';
import { buildProps } from './props';

type PointFn = (i: number, out: THREE.Vector3) => void;

/** Builds a quad strip along the track; segment i→i+1 is included when pred(i). */
function strip(track: Track, pred: (i: number) => boolean, a: PointFn, b: PointFn, vScale: number, uA = 0, uB = 1) {
  const pos: number[] = [];
  const uv: number[] = [];
  const pa0 = new THREE.Vector3();
  const pb0 = new THREE.Vector3();
  const pa1 = new THREE.Vector3();
  const pb1 = new THREE.Vector3();
  for (let i = 0; i < track.n; i++) {
    if (!pred(i)) continue;
    a(i, pa0);
    b(i, pb0);
    a(i + 1, pa1);
    b(i + 1, pb1);
    const v0 = (i * track.spacing) / vScale;
    const v1 = ((i + 1) * track.spacing) / vScale;
    pos.push(...pa0.toArray(), ...pb0.toArray(), ...pa1.toArray(), ...pb0.toArray(), ...pb1.toArray(), ...pa1.toArray());
    uv.push(uA, v0, uB, v0, uA, v1, uB, v0, uB, v1, uA, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export interface TrackScene {
  group: THREE.Group;
  update(dt: number): void;
}

export function buildTrackScene(track: Track, theme: Theme): TrackScene {
  const group = new THREE.Group();
  const S = track.samples;
  const N = track.n;
  const smp = (i: number) => S[((i % N) + N) % N];

  /** Point on the (banked) road surface at a lateral offset. */
  const surf = (lat: (i: number) => number, yOff = 0): PointFn => (i, out) => {
    const s = smp(i);
    const l = lat(i);
    out.copy(s.pos).addScaledVector(s.rh, l);
    out.y += l * s.bankSlope + yOff;
  };
  /** Point at a lateral offset with an absolute height. */
  const flat = (lat: (i: number) => number, y: (i: number) => number): PointFn => (i, out) => {
    const s = smp(i);
    out.copy(s.pos).addScaledVector(s.rh, lat(i));
    out.y = y(i);
  };
  const edgeL = (i: number) => -(smp(i).halfW + smp(i).offroad);
  const edgeR = (i: number) => smp(i).halfW + smp(i).offroad;
  const notGap = (i: number) => !S[i].gap && !smp(i + 1).gap;

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const me = new THREE.Mesh(g, m);
    group.add(me);
    return me;
  };

  // Road
  const roadMat = toon('#ffffff', { map: roadTexture(theme.road, theme.roadLine) });
  mesh(strip(track, notGap, surf((i) => -smp(i).halfW), surf((i) => smp(i).halfW), 10), roadMat);

  // Off-road shoulders
  const offTex = groundTexture(theme.offroad, theme.offroadDots, 5).clone();
  offTex.needsUpdate = true;
  offTex.repeat.set(1, 1);
  const offMat = toon('#ffffff', { map: offTex });
  mesh(strip(track, notGap, surf(edgeL, -0.02), surf((i) => -smp(i).halfW, -0.02), 6), offMat);
  mesh(strip(track, notGap, surf((i) => smp(i).halfW, -0.02), surf(edgeR, -0.02), 6), offMat);

  // Curbs on the inside of bends (and both sides of tight ones)
  const curbMat = toon('#ffffff', { map: stripeTexture(theme.curb[0], theme.curb[1]) });
  const curbL = (i: number) => notGap(i) && smp(i).turn < -0.012;
  const curbR = (i: number) => notGap(i) && smp(i).turn > 0.012;
  mesh(strip(track, curbL, surf((i) => -smp(i).halfW - 0.3, 0.03), surf((i) => -smp(i).halfW + 1.1, 0.03), 3), curbMat);
  mesh(strip(track, curbR, surf((i) => smp(i).halfW - 1.1, 0.03), surf((i) => smp(i).halfW + 0.3, 0.03), 3), curbMat);

  // Embankment skirts from the track edge down to the ground
  const skirtMat = toon(theme.skirt, { side: THREE.DoubleSide });
  const bottom = () => theme.groundY - 2;
  mesh(strip(track, notGap, surf(edgeL, -0.02), flat(edgeL, bottom), 4), skirtMat);
  mesh(strip(track, notGap, surf(edgeR, -0.02), flat(edgeR, bottom), 4), skirtMat);

  // Walls
  const wallMat = toon('#ffffff', { map: stripeTexture(theme.wall[0], theme.wall[1]), side: THREE.DoubleSide });
  const wallTopMat = toon(theme.wall[1], { side: THREE.DoubleSide });
  const H = 1.2;
  const T = 0.8;
  for (const side of [-1, 1] as const) {
    const has = (i: number) => notGap(i) && (side < 0 ? S[i].leftEdge : S[i].rightEdge) === 'wall';
    const inner = side < 0 ? edgeL : edgeR;
    const outer = (i: number) => inner(i) + side * T;
    mesh(strip(track, has, surf(inner, -0.1), surf(inner, H), 4), wallMat);
    mesh(strip(track, has, surf(inner, H), surf(outer, H), 4), wallTopMat);
    mesh(strip(track, has, surf(outer, H), flat(outer, bottom), 4), wallMat);
  }

  // Liquids
  const liquidTex = liquidTexture(theme.liquid);
  const liquidMat = new THREE.MeshBasicMaterial({ map: liquidTex, color: theme.liquid === 'lava' ? '#ffffff' : '#e8f8ff' });
  const liqY = theme.groundY + (theme.island ? -0.8 : 0.12);
  const isLiquid = (e: string) => e === 'water' || e === 'lava';
  if (!theme.island) {
    for (const side of [-1, 1] as const) {
      const has = (i: number) => isLiquid(side < 0 ? S[i].leftEdge : S[i].rightEdge);
      const inner = side < 0 ? edgeL : edgeR;
      const outer = (i: number) => inner(i) + side * 40;
      mesh(strip(track, has, flat(inner, () => liqY), flat(outer, () => liqY), 12, 0, 3), liquidMat);
    }
    mesh(strip(track, (i) => S[i].gap || smp(i + 1).gap, flat(edgeL, () => liqY), flat(edgeR, () => liqY), 12, 0, 2), liquidMat);
  }

  // Ground
  const extent = track.bounds.getSize(new THREE.Vector3());
  const center = track.bounds.getCenter(new THREE.Vector3());
  const groundSize = Math.max(extent.x, extent.z) + 1400;
  if (theme.island) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(groundSize * 2, groundSize * 2).rotateX(-Math.PI / 2), liquidMat);
    sea.position.set(center.x, liqY, center.z);
    liquidTex.repeat.set(1, 1);
    const seaTex = liquidTex.clone();
    seaTex.repeat.set(groundSize / 30, groundSize / 30);
    seaTex.needsUpdate = true;
    sea.material = new THREE.MeshBasicMaterial({ map: seaTex, color: '#e8f8ff' });
    group.add(sea);
    // Sandy island following the outside edge of the loop (pulled in where the road meets the sea).
    const shape = new THREE.Shape();
    for (let i = 0; i < N; i += 3) {
      const s = S[i];
      const beach = isLiquid(s.rightEdge) ? 0 : 38;
      const d = s.halfW + s.offroad + beach;
      const x = s.pos.x + s.rh.x * d;
      const z = s.pos.z + s.rh.z * d;
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    const island = new THREE.Mesh(
      new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
      toon('#ffffff', { map: groundTexture(theme.ground, theme.groundDots, 3) }),
    );
    const islandUv = island.geometry.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < islandUv.count; k++) islandUv.setXY(k, islandUv.getX(k) / 25, islandUv.getY(k) / 25);
    island.position.y = theme.groundY;
    group.add(island);
    group.userData.animated = [seaTex];
  } else {
    const gTex = groundTexture(theme.ground, theme.groundDots, 3).clone();
    gTex.repeat.set(groundSize / 25, groundSize / 25);
    gTex.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize).rotateX(-Math.PI / 2), toon('#ffffff', { map: gTex }));
    ground.position.set(center.x, theme.groundY, center.z);
    group.add(ground);
  }

  // Ice patches
  const iceMat = new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.55, depthWrite: false });
  mesh(strip(track, (i) => S[i].ice && notGap(i), surf((i) => -smp(i).halfW, 0.025), surf((i) => smp(i).halfW, 0.025), 6), iceMat);

  // Start line + gantry
  const frame = { pos: new THREE.Vector3(), heading: 0, idx: 0 };
  const halfW0 = S[0].halfW;
  const quadAlong = (s0: number, s1: number, lat0: number, lat1: number, y: number, step = 0.5) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const steps = Math.max(1, Math.ceil((s1 - s0) / step));
    for (let k = 0; k < steps; k++) {
      const sa = s0 + ((s1 - s0) * k) / steps;
      const sb = s0 + ((s1 - s0) * (k + 1)) / steps;
      track.frameAt(sa, lat0, frame);
      p[0].copy(frame.pos);
      track.frameAt(sa, lat1, frame);
      p[1].copy(frame.pos);
      track.frameAt(sb, lat0, frame);
      p[2].copy(frame.pos);
      track.frameAt(sb, lat1, frame);
      p[3].copy(frame.pos);
      for (const q of p) q.y += y;
      const va = k / steps;
      const vb = (k + 1) / steps;
      pos.push(...p[0].toArray(), ...p[1].toArray(), ...p[2].toArray(), ...p[1].toArray(), ...p[3].toArray(), ...p[2].toArray());
      uv.push(0, va, 1, va, 0, vb, 1, va, 1, vb, 0, vb);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const checker = checkerTexture().clone();
  checker.repeat.set(1, 1);
  checker.needsUpdate = true;
  const lineMat = new THREE.MeshBasicMaterial({ map: checker, side: THREE.DoubleSide });
  mesh(quadAlong(-1.5, 1.5, -halfW0, halfW0, 0.035, 3), lineMat);
  const gantryMat = toon('#2a2833');
  for (const side of [-1, 1]) {
    track.frameAt(-2, side * (halfW0 + S[0].offroad + 1.5), frame);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), gantryMat);
    pillar.position.copy(frame.pos).add(new THREE.Vector3(0, 4.5, 0));
    group.add(pillar);
  }
  track.frameAt(-2, 0, frame);
  const bannerW = (halfW0 + S[0].offroad + 1.5) * 2 + 1;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(bannerW, 2.2, 0.5), [
    gantryMat,
    gantryMat,
    gantryMat,
    gantryMat,
    new THREE.MeshBasicMaterial({ map: bannerTexture() }),
    new THREE.MeshBasicMaterial({ map: bannerTexture() }),
  ]);
  banner.position.copy(frame.pos).add(new THREE.Vector3(0, 8.4, 0));
  banner.rotation.y = frame.heading;
  group.add(banner);

  // Boost pads
  const bTex = boostTexture().clone();
  bTex.needsUpdate = true;
  const padMat = new THREE.MeshBasicMaterial({ map: bTex, transparent: true, opacity: 0.95, depthWrite: false });
  for (const p of track.pads) {
    bTex.repeat.set(1, p.length / 4);
    mesh(quadAlong(p.s0, p.s0 + p.length, p.lat - p.halfWidth, p.lat + p.halfWidth, 0.045, 1), padMat);
  }

  // Ramps
  const rampMat = toon('#ffffff', { map: rampTexture(theme.ramp[0], theme.ramp[1]), side: THREE.DoubleSide });
  const rampGlow = new THREE.MeshBasicMaterial({ color: '#7ff3ff', transparent: true, opacity: 0.8 });
  for (const r of track.ramps) {
    const pos: number[] = [];
    const uv: number[] = [];
    const steps = Math.ceil(r.length / 0.5);
    const top = (k: number, lat: number) => {
      const u = k / steps;
      track.frameAt(r.s0 + u * r.length, lat, frame);
      const v = frame.pos.clone();
      v.y += r.height * Math.pow(u, 1.4) + 0.02;
      return v;
    };
    const base = (k: number, lat: number) => {
      track.frameAt(r.s0 + (k / steps) * r.length, lat, frame);
      return frame.pos.clone();
    };
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, v0: number, v1: number) => {
      pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...b.toArray(), ...d.toArray(), ...c.toArray());
      uv.push(0, v0, 1, v0, 0, v1, 1, v0, 1, v1, 0, v1);
    };
    const l0 = r.lat - r.halfWidth;
    const l1 = r.lat + r.halfWidth;
    for (let k = 0; k < steps; k++) {
      const v0 = (k / steps) * (r.length / 3);
      const v1 = ((k + 1) / steps) * (r.length / 3);
      quad(top(k, l0), top(k, l1), top(k + 1, l0), top(k + 1, l1), v0, v1);
      quad(base(k, l0), top(k, l0), base(k + 1, l0), top(k + 1, l0), v0, v1);
      quad(base(k, l1), top(k, l1), base(k + 1, l1), top(k + 1, l1), v0, v1);
    }
    quad(base(steps, l0), base(steps, l1), top(steps, l0), top(steps, l1), 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    mesh(g, rampMat);
    // glowing lip strip
    const lipA = top(steps, l0);
    const lipB = top(steps, l1);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(lipA.distanceTo(lipB), 0.12, 0.3), rampGlow);
    lip.position.copy(lipA).add(lipB).multiplyScalar(0.5);
    lip.position.y += 0.05;
    track.frameAt(r.s0 + r.length, r.lat, frame);
    lip.rotation.y = frame.heading;
    group.add(lip);
  }

  group.add(buildProps(track, theme));

  const animated: THREE.Texture[] = [liquidTex, bTex, ...((group.userData.animated as THREE.Texture[]) ?? [])];
  let t = 0;
  return {
    group,
    update(dt: number) {
      t += dt;
      for (const tex of animated) {
        if (tex === bTex) tex.offset.y = (tex.offset.y - dt * 1.6) % 1;
        else {
          tex.offset.x = Math.sin(t * 0.3) * 0.05;
          tex.offset.y = (t * (theme.liquid === 'lava' ? 0.02 : 0.03)) % 1;
        }
      }
    },
  };
}

function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 512; x += 16)
    for (let y = 0; y < 64; y += 16) {
      g.fillStyle = (x / 16 + y / 16) % 2 ? '#111' : '#fff';
      g.fillRect(x, y, 16, 16);
    }
  g.fillStyle = 'rgba(20,18,31,0.85)';
  g.fillRect(96, 8, 320, 48);
  g.font = 'bold 36px "Lilita One", Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffcf33';
  g.fillText('KART RACER', 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
