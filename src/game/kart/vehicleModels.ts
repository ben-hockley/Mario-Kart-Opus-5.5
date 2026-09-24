import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { toon } from '../render/toon';
import { bakePose, normaliseCollada } from './characterModels';
import { CHARACTERS } from './characters';
import { VEHICLES, paintFor, repaint, type VehicleDef } from './vehicles';

/**
 * Vehicle models (fetched by `npm run fetch-vehicles` into public/vehicles/<id>/).
 *
 * Each is loaded once and normalised to game units: facing +z, wheels on y=0, centred on the origin, at the
 * size of its own weight class. The wheels are split out so they can spin and steer, and roofed guest cars
 * are cut down to convertibles. Where the driver sits and holds on is set per vehicle in SPECS below; check
 * a change with the `?garage` debug page.
 */

type V3 = [number, number, number];

interface VehicleSpec {
  file?: string;
  /** Euler angles applied first, so the model stands y-up facing +z. */
  rotate?: V3;
  /** Model units to game units. */
  scale: number;
  /** Extra per-axis scale after `scale` (real-world cars are shortened to kart proportions). */
  stretch?: V3;
  /** Driver's hips [y, z]. */
  seat: [number, number];
  /** Left hand [x, y, z] on the steering wheel or handlebar; the right hand mirrors it. */
  grip: V3;
  /** Forward lean of the driver in radians (bikes). */
  lean?: number;
  /** Convertible: everything above this height is cut away. */
  cut?: number;
  /** Materials or objects to leave out. */
  drop?: RegExp;
  /** Materials or objects that make up the wheels (default: anything named tire, tyre or wheel). */
  wheels?: RegExp | null;
  /** Add a steering wheel between the hands (the car's own is missing or off to one side). */
  steeringWheel?: boolean;
  /** Exhaust flame positions; each one with x != 0 is mirrored. */
  exhaust?: V3[];
}

/** Mario Kart Wii units to game units. The BrawlCrate exports (MKB) are already in metres. */
const MK = 0.0135;
const MKB = MK * 100;
/** Blender exports of the menu models lie on their backs with the front along +y. */
const MK_UP: V3 = [Math.PI / 2, 0, 0];

const SPECS: Record<string, VehicleSpec> = {
  standard_kart: { rotate: MK_UP, scale: MK, seat: [0.55, -0.35], grip: [0.22, 0.95, 0.35] },
  booster_seat: { rotate: MK_UP, scale: MK, seat: [1.05, 0.4], grip: [0.2, 1.3, 0.95] },
  mini_beast: { rotate: MK_UP, scale: MK, seat: [0.5, -0.4], grip: [0.22, 0.9, 0.3] },
  cheep_charger: { rotate: MK_UP, scale: MK, seat: [0.5, -0.2], grip: [0.22, 0.9, 0.35] },
  tiny_titan: { rotate: MK_UP, scale: MK, seat: [1.05, -0.2], grip: [0.2, 1.3, 0.35] },
  blue_falcon: { rotate: MK_UP, scale: MK, seat: [0.45, -0.3], grip: [0.22, 0.85, 0.35] },
  classic_dragster: { rotate: MK_UP, scale: MK, seat: [0.55, -0.55], grip: [0.2, 1.1, 0.1] },
  wild_wing: { rotate: MK_UP, scale: MK, seat: [0.5, -0.4], grip: [0.22, 0.9, 0.45] },
  super_blooper: { rotate: MK_UP, scale: MK, seat: [0.5, -0.3], grip: [0.22, 0.9, 0.35] },
  daytripper: { rotate: MK_UP, scale: MK, seat: [0.6, -0.3], grip: [0.2, 1.15, 0.4] },
  sprinter: { rotate: MK_UP, scale: MK, seat: [0.5, -0.4], grip: [0.22, 0.9, 0.5] },
  offroader: { rotate: MK_UP, scale: MK * 0.85, seat: [0.85, -0.25], grip: [0.21, 1.15, 0.65] },
  flame_flyer: { rotate: MK_UP, scale: MK, seat: [0.6, -0.5], grip: [0.25, 1.1, 0.45] },
  piranha_prowler: { rotate: MK_UP, scale: MK, seat: [0.75, -0.4], grip: [0.25, 1.2, 0.55] },
  jetsetter: { rotate: MK_UP, scale: MK, seat: [0.55, -0.1], grip: [0.25, 1.05, 0.8] },
  honeycoupe: { rotate: MK_UP, scale: MK, seat: [0.55, 0.1], grip: [0.25, 1.1, 0.85] },

  standard_bike: { rotate: MK_UP, scale: MK, seat: [0.75, -0.3], grip: [0.35, 1.1, 0.45], lean: 0.25 },
  bullet_bike: { rotate: MK_UP, scale: MK, seat: [0.7, -0.3], grip: [0.3, 1.0, 0.45], lean: 0.3 },
  bit_bike: { scale: MKB, seat: [0.65, -0.3], grip: [0.3, 0.95, 0.45], lean: 0.25 },
  quacker: { rotate: MK_UP, scale: MK, seat: [0.7, -0.2], grip: [0.3, 1.0, 0.45], lean: 0.25 },
  magikruiser: { rotate: MK_UP, scale: MK, seat: [0.7, -0.3], grip: [0.3, 1.0, 0.45], lean: 0.25 },
  jet_bubble: { rotate: MK_UP, scale: MK, seat: [0.7, -0.3], grip: [0.3, 1.0, 0.45], lean: 0.25 },
  mach_bike: { rotate: MK_UP, scale: MK, seat: [0.75, -0.3], grip: [0.3, 1.1, 0.45], lean: 0.3 },
  sugarscoot: { rotate: MK_UP, scale: MK, seat: [0.75, -0.3], grip: [0.35, 1.1, 0.45], lean: 0.2 },
  zip_zip: { rotate: MK_UP, scale: MK, seat: [0.75, -0.3], grip: [0.35, 1.1, 0.45], lean: 0.25 },
  sneakster: { rotate: MK_UP, scale: MK, seat: [0.75, -0.3], grip: [0.3, 1.1, 0.45], lean: 0.3 },
  dolphin_dasher: { rotate: MK_UP, scale: MK, seat: [0.75, -0.3], grip: [0.3, 1.1, 0.45], lean: 0.25 },
  flame_runner: { rotate: MK_UP, scale: MK, seat: [0.85, -0.35], grip: [0.4, 1.25, 0.5], lean: 0.25 },
  wario_bike: { scale: MKB, seat: [0.85, -0.35], grip: [0.4, 1.25, 0.5], lean: 0.2 },
  shooting_star: { rotate: MK_UP, scale: MK, seat: [0.85, -0.35], grip: [0.35, 1.25, 0.5], lean: 0.3 },
  spear: { scale: MKB, seat: [0.85, -0.35], grip: [0.35, 1.25, 0.5], lean: 0.3 },
  phantom: { scale: MKB, seat: [0.85, -0.35], grip: [0.4, 1.25, 0.5], lean: 0.2 },

  family_sedan: { file: 'model.obj', scale: 0.8, stretch: [1, 1, 0.72], seat: [0.5, -0.3], grip: [0.2, 0.95, 0.3], steeringWheel: true },
  malibu_stacy: { file: 'model.obj', scale: 0.85, stretch: [1, 1, 0.72], seat: [0.45, -0.3], grip: [0.2, 0.9, 0.3], steeringWheel: true },
  sports_car_70s: { file: 'model.obj', scale: 0.85, stretch: [1, 1, 0.72], seat: [0.45, -0.3], grip: [0.2, 0.9, 0.3], steeringWheel: true },
  stutz_bearcat: { file: 'model.obj', scale: 0.95, stretch: [1, 1, 0.8], seat: [0.55, -0.3], grip: [0.2, 1.0, 0.3], steeringWheel: true },
  canyonero: { file: 'model.obj', scale: 0.72, stretch: [1, 1, 0.72], seat: [0.6, -0.3], grip: [0.2, 1.05, 0.3], cut: 1.2, steeringWheel: true },
  clown_car: { file: 'model.obj', scale: 0.85, stretch: [1, 1, 0.85], seat: [0.5, -0.3], grip: [0.2, 0.95, 0.3], cut: 1.1, steeringWheel: true },
  the_homer: { file: 'model.obj', scale: 0.75, stretch: [1, 1, 0.7], seat: [0.5, -0.3], grip: [0.2, 0.95, 0.3], cut: 1.1, wheels: /carhom_vInt/, steeringWheel: true },
  carro_loco: { file: 'model.obj', scale: 0.8, stretch: [1, 1, 0.68], seat: [0.5, -0.3], grip: [0.2, 0.95, 0.3], cut: 1.0, steeringWheel: true },
  anti_pesto_van: { file: 'model.obj', scale: 1.1, stretch: [1, 1, 0.85], seat: [0.6, -0.1], grip: [0.2, 1.05, 0.4], cut: 1.2, steeringWheel: true },
  roller_skate: { file: 'model.obj', rotate: [0, Math.PI / 2, 0], scale: 0.8, seat: [1.1, -0.1], grip: [0.2, 1.5, 0.4], steeringWheel: true },
  rc_buggy: { file: 'model.obj', scale: 1.6, seat: [0.5, -0.2], grip: [0.2, 0.95, 0.35], wheels: /wShape/, steeringWheel: true },
  hover_bike: { file: 'model.obj', scale: 1.0, seat: [0.8, -0.2], grip: [0.35, 1.15, 0.5], lean: 0.25, wheels: null },
};

interface MaterialInfo {
  name: string;
  color: string;
  /** Texture file name in the vehicle's folder. */
  map: string | null;
  mirror: boolean;
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: MaterialInfo;
}

interface WheelTemplate {
  /** Axle centre; the parts are relative to it. */
  centre: THREE.Vector3;
  radius: number;
  front: boolean;
  parts: Part[];
}

interface VehicleTemplate {
  def: VehicleDef;
  spec: VehicleSpec;
  dir: string;
  body: Part[];
  wheels: WheelTemplate[];
  /** Bounding box of the normalised model. */
  box: THREE.Box3;
}

/** One vehicle instance, in game units at the size of its own weight class. */
export interface Vehicle {
  model: THREE.Group;
  wheels: { holder: THREE.Group; spin: THREE.Group; radius: number; front: boolean }[];
  materials: THREE.MeshToonMaterial[];
  bike: boolean;
  seat: THREE.Vector3;
  /** Left hand; the right hand mirrors it. */
  grip: THREE.Vector3;
  lean: number;
  steeringWheel: boolean;
  exhaust: THREE.Vector3[];
  /** Where the rear tyres touch the ground (drift sparks, dust). */
  rearWheelL: THREE.Vector3;
  rearWheelR: THREE.Vector3;
  box: THREE.Box3;
}

const templates = new Map<string, VehicleTemplate>();
const textures = new Map<string, THREE.Texture>();

/** Load every vehicle model. Must finish before any KartModel is built. */
export async function loadVehicleModels(): Promise<void> {
  await Promise.all(VEHICLES.map(async (v) => templates.set(v.id, await loadVehicle(v))));
}

function setup(t: THREE.Texture, mirror: boolean) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  return t;
}

function texture(url: string, mirror: boolean): THREE.Texture {
  let t = textures.get(url);
  if (!t) textures.set(url, (t = setup(new THREE.TextureLoader().load(url), mirror)));
  return t;
}

/** A new instance of a vehicle in a driver's paint job (null: the model's own textures). */
export function vehicleModel(id: string, paint: string | null): Vehicle {
  const t = templates.get(id);
  if (!t) throw new Error(`Vehicle model "${id}" is not loaded`);
  const { spec, def } = t;
  const materials: THREE.MeshToonMaterial[] = [];
  const mesh = (p: Part) => {
    const file = p.material.map && paint ? (repaint(p.material.map, def, paint) ?? p.material.map) : p.material.map;
    const map = file ? texture(t.dir + encodeURIComponent(file), p.material.mirror) : undefined;
    const m = toon(map ? '#ffffff' : p.material.color, { map, unique: true, side: THREE.DoubleSide });
    m.alphaTest = 0.5;
    materials.push(m);
    return new THREE.Mesh(p.geometry, m);
  };
  const model = new THREE.Group();
  for (const p of t.body) model.add(mesh(p));
  const wheels = t.wheels.map((w) => {
    const holder = new THREE.Group();
    holder.position.copy(w.centre);
    const spin = new THREE.Group();
    for (const p of w.parts) spin.add(mesh(p));
    holder.add(spin);
    model.add(holder);
    return { holder, spin, radius: w.radius, front: w.front };
  });

  const bike = def.kind === 'bike';
  const rear = t.wheels.filter((w) => !w.front);
  const rearZ = rear.length ? rear[0].centre.z : t.box.min.z + 0.4;
  const rearX = bike ? 0.12 : Math.max(0.3, ...rear.map((w) => Math.abs(w.centre.x)));
  const exhaust = (spec.exhaust ?? (bike ? [[0.15, 0.45, t.box.min.z + 0.1]] : [[0.3, 0.45, t.box.min.z + 0.1]])).flatMap(([x, y, z]) =>
    x ? [new THREE.Vector3(x, y, z), new THREE.Vector3(-x, y, z)] : [new THREE.Vector3(x, y, z)],
  );
  return {
    model,
    wheels,
    materials,
    bike,
    seat: new THREE.Vector3(0, ...spec.seat),
    grip: new THREE.Vector3(...spec.grip),
    lean: spec.lean ?? 0,
    steeringWheel: !!spec.steeringWheel,
    exhaust,
    rearWheelL: new THREE.Vector3(rearX, 0.05, rearZ),
    rearWheelR: new THREE.Vector3(-rearX, 0.05, rearZ),
    box: t.box.clone(),
  };
}

async function loadVehicle(def: VehicleDef): Promise<VehicleTemplate> {
  const spec = SPECS[def.id];
  if (!spec) throw new Error(`Vehicle "${def.id}" has no model spec`);
  const dir = `${import.meta.env.BASE_URL}vehicles/${def.id}/`;
  const file = spec.file ?? 'model.dae';
  const manager = new THREE.LoadingManager();
  const loaded = new Promise<void>((resolve) => {
    manager.onLoad = resolve;
    manager.onError = (url) => console.warn(`Vehicle file failed to load: ${url}`);
  });
  manager.itemStart(dir); // hold onLoad until every file below has been requested

  let scene: THREE.Object3D;
  let mirrored = new Set<string>();
  if (file.endsWith('.obj')) {
    const materials = await new MTLLoader(manager).setPath(dir).loadAsync(file.replace(/\.obj$/, '.mtl'));
    materials.preload();
    scene = await new OBJLoader(manager).setMaterials(materials).setPath(dir).loadAsync(file);
  } else {
    const res = await fetch(dir + file);
    if (!res.ok) throw new Error(`${dir}${file}: HTTP ${res.status} (run "npm run fetch-vehicles")`);
    const collada = normaliseCollada(await res.text());
    mirrored = collada.mirrored;
    const parsed = new ColladaLoader(manager).parse(collada.text, dir);
    if (!parsed) throw new Error(`${dir}${file} could not be parsed`);
    scene = parsed.scene;
  }
  manager.itemEnd(dir);
  await loaded;

  // Load every texture up front, including each driver's paint job, so a kart is fully textured the moment
  // it's built (menu portraits are rendered only once).
  const paints = new Set(CHARACTERS.map((c) => paintFor(c, def)).filter((p): p is string => !!p));
  const pending: Promise<unknown>[] = [];
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as THREE.MeshPhongMaterial[]) {
      const src = (m.map?.image as HTMLImageElement | undefined)?.src;
      if (!m.map || !src) continue;
      const name = decodeURIComponent(src.split('/').pop()!);
      const mirror = mirrored.has(name);
      if (!textures.has(dir + encodeURIComponent(name))) textures.set(dir + encodeURIComponent(name), setup(m.map, mirror));
      for (const p of paints) {
        const variant = repaint(name, def, p);
        const url = dir + encodeURIComponent(variant ?? '');
        if (!variant || textures.has(url)) continue;
        const t = setup(new THREE.Texture(), mirror);
        textures.set(url, t);
        pending.push(
          new THREE.TextureLoader()
            .loadAsync(url)
            .then((img) => ((t.image = img.image), (t.needsUpdate = true)))
            .catch(() => console.warn(`Vehicle file failed to load: ${url}`)),
        );
      }
    }
  });
  await Promise.all(pending);

  const root = new THREE.Group().add(scene);
  if (spec.rotate) root.rotation.set(...spec.rotate);
  root.updateMatrixWorld(true);
  const [sx, sy, sz] = spec.stretch ?? [1, 1, 1];
  const toGame = new THREE.Matrix4().makeScale(spec.scale * sx, spec.scale * sy, spec.scale * sz);

  // Split every mesh into one part per material, in game units.
  const wheelTest = spec.wheels === undefined ? /tire|tyre|wheel/i : spec.wheels;
  const body: Part[] = [];
  const wheelParts: Part[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geom = bakePose(o).applyMatrix4(toGame);
    const flat = geom.index ? geom.toNonIndexed() : geom;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.MeshPhongMaterial[];
    const groups = flat.groups.length ? flat.groups : [{ start: 0, count: flat.getAttribute('position').count, materialIndex: 0 }];
    for (const g of groups) {
      const m = mats[g.materialIndex ?? 0] ?? mats[0];
      const src = (m.map?.image as HTMLImageElement | undefined)?.src;
      const map = src ? decodeURIComponent(src.split('/').pop()!) : null;
      const material: MaterialInfo = { name: m.name, color: `#${m.color.getHexString()}`, map, mirror: !!map && mirrored.has(map) };
      const label = `${o.name} ${m.name} ${map ?? ''}`;
      if (spec.drop?.test(label)) continue;
      (wheelTest?.test(label) ? wheelParts : body).push({ geometry: slice(flat, g.start, g.count), material });
    }
  });

  // Wheels on the ground, centred on the origin.
  const all = new THREE.Box3();
  for (const p of [...body, ...wheelParts]) all.union(p.geometry.computeBoundingBox() ?? p.geometry.boundingBox!);
  const wheelBox = new THREE.Box3();
  for (const p of wheelParts) wheelBox.union(p.geometry.boundingBox!);
  const ground = wheelParts.length ? wheelBox.min.y : all.min.y;
  const shift = new THREE.Vector3(-(all.min.x + all.max.x) / 2, -ground, -(all.min.z + all.max.z) / 2);
  for (const p of [...body, ...wheelParts]) p.geometry.translate(shift.x, shift.y, shift.z);
  all.translate(shift);

  const { wheels, rest } = splitWheels(wheelParts);
  body.push(...rest);
  if (spec.cut !== undefined) {
    const cut = spec.cut;
    for (const p of body) p.geometry = clipAbove(p.geometry, cut);
    all.max.y = Math.min(all.max.y, cut);
  }
  return { def, spec, dir, body: body.filter((p) => p.geometry.getAttribute('position').count), wheels, box: all };
}

/** Vertices [start, start + count) of a non-indexed geometry. */
function slice(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes) as [string, THREE.BufferAttribute][]) {
    const n = attr.itemSize;
    out.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(start * n, (start + count) * n), n));
  }
  return out;
}

/** Cut a non-indexed geometry with the plane y = `cut`, keeping what's below. */
function clipAbove(g: THREE.BufferGeometry, cut: number): THREE.BufferGeometry {
  const attrs = Object.entries(g.attributes) as [string, THREE.BufferAttribute][];
  const pos = g.getAttribute('position');
  const out = attrs.map(() => [] as number[]);
  /** A vertex as one array per attribute. */
  const vertex = (i: number) => attrs.map(([, a]) => Array.from({ length: a.itemSize }, (_, c) => a.getComponent(i, c)));
  const mix = (a: number[][], b: number[][], t: number) => a.map((arr, k) => arr.map((v, c) => v + (b[k][c] - v) * t));
  const emit = (v: number[][]) => v.forEach((arr, k) => out[k].push(...arr));
  for (let i = 0; i < pos.count; i += 3) {
    const tri = [vertex(i), vertex(i + 1), vertex(i + 2)];
    const y = tri.map((v) => v[attrs.findIndex(([n]) => n === 'position')][1]);
    if (y.every((h) => h <= cut)) {
      tri.forEach(emit);
      continue;
    }
    const poly: number[][][] = [];
    for (let k = 0; k < 3; k++) {
      const [a, b] = [k, (k + 1) % 3];
      if (y[a] <= cut) poly.push(tri[a]);
      if (y[a] <= cut !== y[b] <= cut) poly.push(mix(tri[a], tri[b], (cut - y[a]) / (y[b] - y[a])));
    }
    for (let k = 1; k + 1 < poly.length; k++) [poly[0], poly[k], poly[k + 1]].forEach(emit);
  }
  const res = new THREE.BufferGeometry();
  attrs.forEach(([name, a], k) => res.setAttribute(name, new THREE.Float32BufferAttribute(out[k], a.itemSize)));
  return res;
}

/**
 * Split the wheel-material triangles into wheels that can spin. Each connected piece that touches the ground
 * is a tyre; pieces inside a tyre (rims, hubs) join it. Anything else with a wheel texture (a spare wheel, the
 * undercarriage) stays part of the body and is returned in `rest`.
 */
function splitWheels(parts: Part[]): { wheels: WheelTemplate[]; rest: Part[] } {
  // Connected pieces: triangles that share a vertex position (union-find over all wheel parts).
  const tris: { part: Part; i: number }[] = [];
  for (const part of parts) for (let i = 0; i < part.geometry.getAttribute('position').count; i += 3) tris.push({ part, i });
  const parent = tris.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const seen = new Map<string, number>();
  tris.forEach(({ part, i }, k) => {
    const pos = part.geometry.getAttribute('position');
    for (let v = i; v < i + 3; v++) {
      const key = `${pos.getX(v).toFixed(4)},${pos.getY(v).toFixed(4)},${pos.getZ(v).toFixed(4)}`;
      const other = seen.get(key);
      if (other === undefined) seen.set(key, k);
      else parent[find(k)] = find(other);
    }
  });
  const pieces = new Map<number, { tris: typeof tris; box: THREE.Box3 }>();
  const v = new THREE.Vector3();
  tris.forEach((t, k) => {
    const root = find(k);
    let piece = pieces.get(root);
    if (!piece) pieces.set(root, (piece = { tris: [], box: new THREE.Box3() }));
    piece.tris.push(t);
    const pos = t.part.geometry.getAttribute('position');
    for (let n = t.i; n < t.i + 3; n++) piece.box.expandByPoint(v.fromBufferAttribute(pos, n));
  });

  // Tyres touch the ground, biggest first. Other pieces on the same axle, seen from the side, and close by
  // sideways (hubs, rims, the other half of a tyre) join them.
  const wheels: { box: THREE.Box3; radius: number; tris: typeof tris }[] = [];
  const others: typeof tris = [];
  const all = [...pieces.values()].sort((a, b) => b.box.max.y - b.box.min.y - (a.box.max.y - a.box.min.y));
  for (const p of all) {
    const c = p.box.getCenter(new THREE.Vector3());
    const host = wheels.find((w) => {
      const wc = w.box.getCenter(v);
      return Math.hypot(c.y - wc.y, c.z - wc.z) < w.radius * 0.6 && Math.abs(c.x - wc.x) < w.radius * 1.5;
    });
    if (host) {
      host.box.union(p.box);
      host.tris.push(...p.tris);
    } else if (p.box.min.y < 0.1 && p.box.max.y - p.box.min.y > 0.16) {
      wheels.push({ box: p.box.clone(), radius: (p.box.max.y - p.box.min.y) / 2, tris: [...p.tris] });
    } else others.push(...p.tris);
  }

  /** Copy the given triangles into one geometry per part. */
  const pick = (list: typeof tris): Part[] => {
    const byPart = new Map<Part, number[]>();
    for (const { part, i } of list) {
      let starts = byPart.get(part);
      if (!starts) byPart.set(part, (starts = []));
      starts.push(i);
    }
    return [...byPart].map(([part, starts]) => {
      const out = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(part.geometry.attributes) as [string, THREE.BufferAttribute][]) {
        const n = attr.itemSize;
        const arr = new Float32Array(starts.length * 3 * n);
        starts.forEach((i, k) => arr.set(attr.array.slice(i * n, (i + 3) * n), k * 3 * n));
        out.setAttribute(name, new THREE.BufferAttribute(arr, n));
      }
      return { geometry: out, material: part.material };
    });
  };
  const midZ = wheels.reduce((sum, w) => sum + w.box.getCenter(v).z, 0) / (wheels.length || 1);
  return {
    wheels: wheels.map((w) => {
      const centre = w.box.getCenter(new THREE.Vector3());
      const wheelParts = pick(w.tris);
      for (const p of wheelParts) p.geometry.translate(-centre.x, -centre.y, -centre.z);
      return { centre, radius: w.radius, front: centre.z > midZ, parts: wheelParts };
    }),
    rest: pick(others),
  };
}
