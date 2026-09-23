import * as THREE from 'three';
import { clamp, lerp, wrapAngle } from '../core/math';
import type { EdgeKind, TrackDef } from './types';

export type Surface = 'road' | 'offroad' | 'boost' | 'hazard' | 'gap';

export interface TrackSample {
  pos: THREE.Vector3;
  /** Unit tangent (3D). */
  tan: THREE.Vector3;
  /** Horizontal unit right vector. */
  rh: THREE.Vector3;
  /** Banked right vector and surface normal. */
  right: THREE.Vector3;
  up: THREE.Vector3;
  heading: number;
  halfW: number;
  offroad: number;
  leftEdge: EdgeKind;
  rightEdge: EdgeKind;
  /** Height change per metre moving right. */
  bankSlope: number;
  ice: boolean;
  gap: boolean;
  /** Fractional control point index. */
  cp: number;
  /** Signed turn rate (rad/m); positive = right-hand bend. */
  turn: number;
  /** Racing line lateral offset. */
  line: number;
}

export interface RampRuntime {
  s0: number;
  length: number;
  height: number;
  lat: number;
  halfWidth: number;
  trick: boolean;
}

export interface PadRuntime {
  s0: number;
  length: number;
  lat: number;
  halfWidth: number;
}

/** Reusable result of a track-space query. */
export class TrackPos {
  idx = -1;
  s = 0;
  lat = 0;
  groundY = 0;
  hasGround = true;
  surface: Surface = 'road';
  hazard: EdgeKind = 'wall';
  ice = false;
  halfW = 8;
  /** Lateral wall limits (null = open hazard on that side). */
  wallL: number | null = null;
  wallR: number | null = null;
  ramp: RampRuntime | null = null;
  rampSlope = 0;
  normal = new THREE.Vector3(0, 1, 0);
  rh = new THREE.Vector3(1, 0, 0);
  tan = new THREE.Vector3(0, 0, 1);
  heading = 0;
  line = 0;
  turn = 0;
}

const SPACING = 1.0;

export class Track {
  readonly def: TrackDef;
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly n: number;
  readonly spacing: number;
  readonly ramps: RampRuntime[] = [];
  readonly pads: PadRuntime[] = [];
  readonly bounds = new THREE.Box3();
  readonly curve: THREE.CatmullRomCurve3;

  constructor(def: TrackDef) {
    this.def = def;
    const nPts = def.points.length;
    const curve = new THREE.CatmullRomCurve3(
      def.points.map((p) => new THREE.Vector3(p.x, p.y ?? 0, p.z)),
      true,
      'centripetal',
    );
    // Uniform (index-parameterised) curve for per-point attributes: width, bank.
    const attrs = new THREE.CatmullRomCurve3(
      def.points.map((p) => new THREE.Vector3(p.w ?? def.width, p.bank ?? 0, 0)),
      true,
      'catmullrom',
      0.5,
    );
    const approxLen = curve.getLength();
    curve.arcLengthDivisions = Math.ceil(approxLen * 3);
    curve.updateArcLengths();
    this.curve = curve;
    this.length = curve.getLength();
    this.n = Math.round(this.length / SPACING);
    this.spacing = this.length / this.n;

    const Y = new THREE.Vector3(0, 1, 0);
    const attr = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const t = curve.getUtoTmapping(i / this.n, 0);
      const pos = curve.getPoint(t);
      const tan = curve.getTangent(t).normalize();
      attrs.getPoint(t, attr);
      const bank = THREE.MathUtils.degToRad(attr.y);
      const rh = new THREE.Vector3(tan.x, 0, tan.z).normalize().cross(Y).normalize();
      const right = rh.clone().multiplyScalar(Math.cos(bank)).addScaledVector(Y, -Math.sin(bank)).normalize();
      const up = new THREE.Vector3().crossVectors(right, tan).normalize();
      const cp = t * nPts;
      this.samples.push({
        pos,
        tan,
        rh,
        right,
        up,
        heading: Math.atan2(tan.x, tan.z),
        halfW: attr.x / 2,
        offroad: def.offroad,
        leftEdge: def.edge,
        rightEdge: def.edge,
        bankSlope: -Math.tan(bank),
        ice: false,
        gap: false,
        cp,
        turn: 0,
        line: 0,
      });
      this.bounds.expandByPoint(pos);
    }

    // Sections, gaps
    for (const s of this.samples) {
      for (const sec of def.sections ?? []) {
        if (!inRange(s.cp, sec.from, sec.to)) continue;
        if (sec.left) s.leftEdge = sec.left;
        if (sec.right) s.rightEdge = sec.right;
        if (sec.offroad !== undefined) s.offroad = sec.offroad;
        if (sec.ice) s.ice = true;
      }
      for (const g of def.gaps ?? []) if (inRange(s.cp, g.from, g.to)) s.gap = true;
    }

    // Signed turn rate, smoothed.
    const raw = this.samples.map((s, i) => {
      const next = this.samples[(i + 1) % this.n];
      return -wrapAngle(next.heading - s.heading) / this.spacing;
    });
    const R = 6;
    for (let i = 0; i < this.n; i++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += raw[(i + k + this.n) % this.n];
      this.samples[i].turn = sum / (2 * R + 1);
    }

    for (const r of def.ramps ?? []) {
      const s0 = this.sAtCp(r.at);
      const halfW = this.samples[this.idxAt(s0)].halfW;
      this.ramps.push({
        s0,
        length: r.length,
        height: r.height,
        lat: (r.lat ?? 0) * halfW,
        halfWidth: r.width ? r.width / 2 : halfW + 0.5,
        trick: r.trick ?? true,
      });
    }
    for (const p of def.boostPads ?? []) {
      const s0 = this.sAtCp(p.at);
      const halfW = this.samples[this.idxAt(s0)].halfW;
      this.pads.push({ s0, length: p.length ?? 8, lat: (p.lat ?? 0) * halfW, halfWidth: (p.width ?? 5) / 2 });
    }

    this.bounds.expandByScalar(40);
    this.computeRacingLine();
  }

  /** Wrap s into [0, length). */
  wrapS(s: number) {
    return ((s % this.length) + this.length) % this.length;
  }

  /** Signed along-track distance from a to b, in [-L/2, L/2). */
  deltaS(a: number, b: number) {
    let d = b - a;
    const L = this.length;
    d = ((d % L) + L) % L;
    return d >= L / 2 ? d - L : d;
  }

  idxAt(s: number) {
    return Math.floor(this.wrapS(s) / this.spacing) % this.n;
  }

  /** Distance along the track of a fractional control point index. */
  sAtCp(cp: number): number {
    const nPts = this.def.points.length;
    const target = ((cp % nPts) + nPts) % nPts;
    let lo = 0;
    let hi = this.n - 1;
    if (target <= this.samples[0].cp) return 0;
    if (target >= this.samples[hi].cp) {
      const a = this.samples[hi];
      const frac = (target - a.cp) / (nPts - a.cp);
      return (hi + frac) * this.spacing;
    }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid].cp <= target) lo = mid;
      else hi = mid;
    }
    const a = this.samples[lo].cp;
    const b = this.samples[hi].cp;
    return (lo + (target - a) / (b - a)) * this.spacing;
  }

  private nearestGlobal(x: number, z: number): number {
    let best = Infinity;
    let bi = 0;
    for (let i = 0; i < this.n; i++) {
      const p = this.samples[i].pos;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    return bi;
  }

  /**
   * Projects a world position onto the track. `hint` is the previous sample index
   * (-1 for a global search); the search then hill-climbs locally.
   */
  query(x: number, z: number, hint: number, out: TrackPos, y?: number): TrackPos {
    const S = this.samples;
    const N = this.n;
    let i = hint < 0 ? this.nearestGlobal(x, z) : hint % N;
    const d2 = (k: number) => {
      const p = S[k].pos;
      const dy = y === undefined ? 0 : (p.y - y) * 0.5;
      return (p.x - x) ** 2 + (p.z - z) ** 2 + dy * dy;
    };
    let best = d2(i);
    for (let guard = 0; guard < N; guard++) {
      const j = (i + 1) % N;
      const dj = d2(j);
      if (dj < best) {
        best = dj;
        i = j;
      } else break;
    }
    for (let guard = 0; guard < N; guard++) {
      const j = (i - 1 + N) % N;
      const dj = d2(j);
      if (dj < best) {
        best = dj;
        i = j;
      } else break;
    }

    const a = S[i];
    // Horizontal forward is (rh.z, 0, -rh.x).
    const along = (x - a.pos.x) * a.rh.z - (z - a.pos.z) * a.rh.x;
    const j0 = along >= 0 ? i : (i - 1 + N) % N;
    const A = S[j0];
    const B = S[(j0 + 1) % N];
    const ex = B.pos.x - A.pos.x;
    const ez = B.pos.z - A.pos.z;
    const t = clamp(((x - A.pos.x) * ex + (z - A.pos.z) * ez) / (ex * ex + ez * ez), 0, 1);

    const cx = A.pos.x + ex * t;
    const cz = A.pos.z + ez * t;
    const cy = lerp(A.pos.y, B.pos.y, t);
    const rhx = lerp(A.rh.x, B.rh.x, t);
    const rhz = lerp(A.rh.z, B.rh.z, t);
    const rl = Math.hypot(rhx, rhz) || 1;
    out.rh.set(rhx / rl, 0, rhz / rl);
    out.tan.set(out.rh.z, 0, -out.rh.x); // horizontal forward
    out.heading = Math.atan2(out.tan.x, out.tan.z);
    const lat = (x - cx) * out.rh.x + (z - cz) * out.rh.z;
    const near = t < 0.5 ? A : B;

    out.idx = i;
    out.s = (j0 + t) * this.spacing;
    out.lat = lat;
    out.halfW = lerp(A.halfW, B.halfW, t);
    out.line = lerp(A.line, B.line, t);
    out.turn = near.turn;
    out.ice = near.ice && Math.abs(lat) <= out.halfW;
    const bank = lerp(A.bankSlope, B.bankSlope, t);
    out.groundY = cy + lat * bank;
    out.normal.copy(A.up).lerp(B.up, t).normalize();
    out.ramp = null;
    out.rampSlope = 0;

    const off = near.offroad;
    const edgeL = -(out.halfW + off);
    const edgeR = out.halfW + off;
    out.wallL = near.leftEdge === 'wall' ? edgeL : null;
    out.wallR = near.rightEdge === 'wall' ? edgeR : null;
    out.hasGround = true;

    if (near.gap && Math.abs(lat) < out.halfW + off + 4) {
      out.surface = 'gap';
      out.hasGround = false;
      out.hazard = near.leftEdge !== 'wall' ? near.leftEdge : near.rightEdge !== 'wall' ? near.rightEdge : 'drop';
      return out;
    }
    if (lat < edgeL || lat > edgeR) {
      const kind = lat < 0 ? near.leftEdge : near.rightEdge;
      if (kind !== 'wall') {
        out.surface = 'hazard';
        out.hazard = kind;
        out.hasGround = false;
        return out;
      }
    }
    out.surface = Math.abs(lat) <= out.halfW ? 'road' : 'offroad';

    if (out.surface === 'road') {
      for (const r of this.ramps) {
        const ds = this.deltaS(r.s0, out.s);
        if (ds >= 0 && ds <= r.length && Math.abs(lat - r.lat) <= r.halfWidth) {
          const u = ds / r.length;
          out.groundY += r.height * Math.pow(u, 1.4);
          out.rampSlope = (r.height * 1.4 * Math.pow(Math.max(u, 0.02), 0.4)) / r.length;
          out.ramp = r;
          out.normal.addScaledVector(out.tan, -out.rampSlope).normalize();
          break;
        }
      }
      for (const p of this.pads) {
        const ds = this.deltaS(p.s0, out.s);
        if (ds >= 0 && ds <= p.length && Math.abs(lat - p.lat) <= p.halfWidth) {
          out.surface = 'boost';
          break;
        }
      }
    }
    return out;
  }

  /** World position/heading of a point given in track space. */
  frameAt(s: number, lat: number, out: { pos: THREE.Vector3; heading: number; idx: number }) {
    const w = this.wrapS(s) / this.spacing;
    const i = Math.floor(w) % this.n;
    const t = w - Math.floor(w);
    const A = this.samples[i];
    const B = this.samples[(i + 1) % this.n];
    out.pos.copy(A.pos).lerp(B.pos, t);
    const rx = lerp(A.rh.x, B.rh.x, t);
    const rz = lerp(A.rh.z, B.rh.z, t);
    const rl = Math.hypot(rx, rz) || 1;
    out.pos.x += (rx / rl) * lat;
    out.pos.z += (rz / rl) * lat;
    out.pos.y += lat * lerp(A.bankSlope, B.bankSlope, t);
    // forward = (rh.z, 0, -rh.x) → heading = atan2(fx, fz)
    out.heading = Math.atan2(rz / rl, -rx / rl);
    out.idx = i;
    return out;
  }

  /** Sample index `ahead` metres along from s. */
  sampleAhead(s: number, ahead: number): TrackSample {
    return this.samples[this.idxAt(s + ahead)];
  }

  private computeRacingLine() {
    const S = this.samples;
    const N = this.n;
    const lat = new Float32Array(N);
    const limit = S.map((s) => Math.max(0, s.halfW - 2.6));
    const px = (k: number) => S[k].pos.x + S[k].rh.x * lat[k];
    const pz = (k: number) => S[k].pos.z + S[k].rh.z * lat[k];
    for (const [span, iters] of [
      [30, 80],
      [15, 80],
      [7, 60],
    ] as const) {
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < N; i++) {
          const a = (i - span + N) % N;
          const b = (i + span) % N;
          const mx = (px(a) + px(b)) / 2;
          const mz = (pz(a) + pz(b)) / 2;
          const target = (mx - S[i].pos.x) * S[i].rh.x + (mz - S[i].pos.z) * S[i].rh.z;
          lat[i] = lerp(lat[i], clamp(target, -limit[i], limit[i]), 0.6);
        }
      }
    }
    // Line up straight for ramps and gaps.
    for (const r of this.ramps) {
      for (let d = -30; d < r.length + 25; d++) {
        const k = this.idxAt(r.s0 + d);
        const w = d < -20 ? (d + 30) / 10 : 1;
        lat[k] = lerp(lat[k], r.lat, clamp(w, 0, 1));
      }
    }
    for (let i = 0; i < N; i++) S[i].line = lat[i];
  }
}

/** Is fractional index v within [from, to)? Wraps around when from > to. */
export function inRange(v: number, from: number, to: number): boolean {
  return from <= to ? v >= from && v < to : v >= from || v < to;
}

/** Forward vector for a heading. */
export function forwardOf(heading: number, out = new THREE.Vector3()) {
  return out.set(Math.sin(heading), 0, Math.cos(heading));
}
