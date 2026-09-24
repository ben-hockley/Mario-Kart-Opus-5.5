import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { toon } from '../render/toon';
import { CHARACTERS } from './characters';

/**
 * Driver models (fetched by `npm run fetch-characters` into public/characters/<id>/).
 * Each is loaded once and kept rigged. Every pose it's needed in (on a kart or a bike, with the hands on that
 * vehicle's grips) is baked into static meshes once and shared by the drivers in it.
 *
 * The Mario Kart Wii models share one skeleton layout that `seat()` poses directly. Models from other games
 * have no skeleton (OBJ) or an unusable one, so they get a simple generated rig built from the landmarks in
 * their `rig` spec, and are then posed the same way.
 */

/** Joint positions for a generated rig, for the character's left side (+x), with the model scaled to 1 unit tall. */
interface Rig {
  /** Hip joint [x, y]; the knee and ankle sit straight below it. */
  hip: [number, number];
  knee: number;
  ankle: number;
  shoulder: [number, number];
  elbow: [number, number];
  wrist: [number, number];
  /** How far from the arm's centre line vertices still follow the arm. */
  armRadius: number;
  /** The same past the elbow, where hands are wider than arms (defaults to armRadius). */
  handRadius?: number;
}

interface MaterialSpec {
  /** Replace the diffuse texture. */
  map?: string;
  repeat?: number;
  /** UV set the map uses. */
  channel?: number;
  color?: string;
  alphaTest?: number;
}

interface ModelSpec {
  file: string;
  /** Euler angles applied first, so the model stands y-up facing +z. */
  rotate?: [number, number, number];
  rig?: Rig;
  /** Overrides by material name, for textures the exporter didn't assign properly. */
  materials?: Record<string, MaterialSpec>;
  alphaTest?: number;
  /** Drivers are sized by head height; this enlarges one whose height is mostly hat. */
  scale?: number;
}

const MKWII: ModelSpec = { file: 'model.dae', alphaTest: 0.5 };

const MODELS: Record<string, ModelSpec> = {
  bart: {
    file: 'model.obj',
    rig: { hip: [0.07, 0.25], knee: 0.14, ankle: 0.05, shoulder: [0.17, 0.5], elbow: [0.26, 0.41], wrist: [0.33, 0.32], armRadius: 0.05, handRadius: 0.08 },
  },
  lemming: {
    file: 'model.obj',
    rig: { hip: [0.08, 0.15], knee: 0.09, ankle: 0.03, shoulder: [0.12, 0.52], elbow: [0.3, 0.52], wrist: [0.46, 0.52], armRadius: 0.05, handRadius: 0.2 },
  },
  sackboy: {
    file: 'model.dae',
    rig: { hip: [0.1, 0.27], knee: 0.15, ankle: 0.05, shoulder: [0.13, 0.45], elbow: [0.2, 0.33], wrist: [0.25, 0.22], armRadius: 0.045 },
    materials: {
      sack_boy_weave_base: { map: 'knit_2_diffuse.png', repeat: 3 },
      sack_boy_stitching_decal: { map: 'sackboy_stitch_diffuse.png', channel: 1, alphaTest: 0.5 },
      sack_boy_zip_decal: { map: 'zip_1_diffuse.png', channel: 1, alphaTest: 0.5 },
      sack_boy_tongue: { map: 'pink_stars.png' },
      eye: { color: '#111111' },
      zip_pull_steel: { map: 'alluminum_1_diffuse.png' },
    },
  },
  gromit: {
    file: 'model.dae',
    rig: { hip: [0.08, 0.3], knee: 0.15, ankle: 0.05, shoulder: [0.16, 0.61], elbow: [0.32, 0.55], wrist: [0.46, 0.5], armRadius: 0.06, handRadius: 0.2 },
  },
  wallace: {
    file: 'model.dae',
    rig: { hip: [0.07, 0.42], knee: 0.24, ankle: 0.07, shoulder: [0.17, 0.66], elbow: [0.35, 0.57], wrist: [0.5, 0.49], armRadius: 0.06, handRadius: 0.2 },
  },
  shyguy: {
    file: 'model.dae',
    rig: { hip: [0.13, 0.12], knee: 0.07, ankle: 0.03, shoulder: [0.24, 0.48], elbow: [0.38, 0.47], wrist: [0.5, 0.46], armRadius: 0.05, handRadius: 0.15 },
  },
  cartman: {
    file: 'model.dae',
    scale: 1.5,
    alphaTest: 0.5, // eyes, brows and mouth are cut-outs layered over the face
    rig: { hip: [0.12, 0.06], knee: 0.035, ankle: 0.01, shoulder: [0.32, 0.27], elbow: [0.41, 0.265], wrist: [0.48, 0.26], armRadius: 0.05, handRadius: 0.09 },
  },
  brian: {
    file: 'model.obj',
    rig: { hip: [0.08, 0.3], knee: 0.16, ankle: 0.05, shoulder: [0.18, 0.5], elbow: [0.34, 0.49], wrist: [0.46, 0.48], armRadius: 0.05, handRadius: 0.15 },
  },
  peter: {
    file: 'model.dae',
    rig: { hip: [0.1, 0.3], knee: 0.16, ankle: 0.05, shoulder: [0.2, 0.6], elbow: [0.38, 0.54], wrist: [0.54, 0.47], armRadius: 0.06, handRadius: 0.15 },
  },
  homer: {
    file: 'model.obj',
    rig: { hip: [0.07, 0.3], knee: 0.16, ankle: 0.05, shoulder: [0.17, 0.59], elbow: [0.3, 0.58], wrist: [0.41, 0.58], armRadius: 0.05, handRadius: 0.2 },
  },
};

export interface Driver {
  /** Seated driver, facing +z with the hips at the origin, in the model's own units (see `height`). */
  model: THREE.Group;
  /** Height of the top of the head above the hips, in the default kart pose. */
  height: number;
}

/** How a driver sits. The default is the kart pose with the arms reaching forward. */
export interface DriverPose {
  /** Astride a bike, knees bent, instead of legs out along a kart floor. */
  bike?: boolean;
  /** Where the left wrist goes, relative to the hips, in the model's own units. The right wrist mirrors it. */
  hands?: THREE.Vector3;
}

/** A loaded character, kept rigged so it can be baked into any pose. */
interface Template {
  /** Holds the skeleton and meshes; restoring `rest` returns it to the loaded pose. */
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  materials: THREE.Material[][];
  bone: (name: string) => THREE.Object3D | undefined;
  rest: [THREE.Object3D, THREE.Vector3, THREE.Quaternion][];
  /** Generated rig (long-legged guests), whose legs stretch out on karts. */
  generated: boolean;
  /** Hips of the default pose (legless characters sit on the bottom of their bounding box). */
  hips: THREE.Vector3 | null;
  height: number;
  poses: Map<string, Posed>;
}

interface Posed {
  /** One per mesh, with the hips at the origin. */
  geoms: THREE.BufferGeometry[];
  /** Hips in the unposed model. */
  hips: THREE.Vector3;
  /** Top of the head above the hips. */
  top: number;
}

const templates = new Map<string, Template>();

/** Load every character's model. Must finish before any KartModel or portrait is built. */
export async function loadCharacterModels(): Promise<void> {
  await Promise.all(
    CHARACTERS.map(async (c) => templates.set(c.id, await loadDriver(`${import.meta.env.BASE_URL}characters/${c.id}/`, MODELS[c.id] ?? MKWII))),
  );
}

/** Height of a driver's head above their hips in the default pose, in the model's own units. */
export function driverHeight(id: string): number {
  const t = templates.get(id);
  if (!t) throw new Error(`Character model "${id}" is not loaded`);
  return t.height;
}

/** A new instance of a character's driver, with its own materials (so it can be tinted independently). */
export function driverModel(id: string, pose: DriverPose = {}): Driver {
  const t = templates.get(id);
  if (!t) throw new Error(`Character model "${id}" is not loaded`);
  const posed = posedGeometry(t, pose);
  const model = new THREE.Group();
  posed.geoms.forEach((g, i) => {
    const mats = t.materials[i].map((m) => m.clone());
    model.add(new THREE.Mesh(g, mats.length === 1 ? mats[0] : mats));
  });
  return { model, height: t.height };
}

/** Bake the character into a pose (cached), with the hips at the origin. */
function posedGeometry(t: Template, pose: DriverPose): Posed {
  const key = `${pose.bike ? 'bike' : 'kart'}|${pose.hands?.toArray().map((v) => v.toFixed(3)).join(',') ?? ''}`;
  let posed = t.poses.get(key);
  if (posed) return posed;
  for (const [o, p, q] of t.rest) {
    o.position.copy(p);
    o.quaternion.copy(q);
  }
  t.root.updateMatrixWorld(true);
  // Characters without legs have no hip joints; they keep the hips of their default pose.
  let hips = seat(t.bone, t.generated, !!pose.bike) ?? t.hips?.clone() ?? null;
  if (pose.hands && hips) {
    reach(t.bone, 'l', hips.clone().add(pose.hands));
    reach(t.bone, 'r', hips.clone().add(pose.hands.clone().setX(-pose.hands.x)));
  }
  const geoms = t.meshes.map((o) => bakePose(o));
  const box = new THREE.Box3();
  for (const g of geoms) box.union(g.computeBoundingBox() ?? g.boundingBox!);
  hips ??= box.getCenter(new THREE.Vector3()).setY(box.min.y);
  for (const g of geoms) g.translate(-hips.x, -hips.y, -hips.z);
  posed = { geoms, hips, top: box.max.y - hips.y };
  t.poses.set(key, posed);
  return posed;
}

export interface Collada {
  text: string;
  /** Texture files whose samplers use MIRROR wrapping. */
  mirrored: Set<string>;
  /** Joint name -> the sid the loader names the bone by. */
  jointNames: Map<string, string>;
}

/**
 * Works around the parts of these exports that three's ColladaLoader reads wrongly. `replaced` names materials
 * whose texture the spec replaces; their original texture isn't loaded (nor are normal/specular maps, which the
 * toon shading doesn't use and the fetch script doesn't download).
 */
export function normaliseCollada(text: string, replaced: string[] = []): Collada {
  // COLLADA 1.5 wraps image references as <init_from><ref>x</ref></init_from>; three's loader expects 1.4's plain text.
  text = text.replace(/<init_from>\s*<ref>([^<]*)<\/ref>\s*<\/init_from>/g, '<init_from>$1</init_from>');
  for (const name of replaced) {
    const effect = new RegExp(`<material [^>]*name="${name}"[^>]*>\\s*<instance_effect url="#([^"]+)"`).exec(text)?.[1];
    if (effect) {
      text = text.replace(new RegExp(`<effect id="${effect}"[\\s\\S]*?</effect>`), (e) =>
        e.replace(/<diffuse>\s*<texture [^>]*\/>\s*<\/diffuse>/, '<diffuse><color>1 1 1 1</color></diffuse>'),
      );
    }
  }
  text = text.replace(/<(ambient|specular|emission|reflective|transparent|bump)>\s*<texture [^>]*\/>\s*<\/\1>/g, '');
  // The loader keys inputs by semantic, so a second or third UV set overwrites the first.
  // Rename set 1 to the TEXCOORD1 semantic it does understand, and drop any others.
  text = text.replace(/<input semantic="TEXCOORD"([^>]*)\/>/g, (tag, attrs: string) => {
    const set = Number(/\bset="(\d+)"/.exec(attrs)?.[1] ?? 0);
    return set === 0 ? tag : set === 1 ? `<input semantic="TEXCOORD1"${attrs}/>` : '';
  });
  // The loader ignores sampler wrap modes, but the eyes (and some bodies) are half-textures that rely on MIRROR.
  const imageFiles = new Map([...text.matchAll(/<image id="([^"]+)"[^>]*>\s*<init_from>([^<]+)<\/init_from>/g)].map((m) => [m[1], m[2].trim()]));
  const mirrored = new Set<string>();
  for (const m of text.matchAll(/<instance_image url="#([^"]+)"\s*\/>\s*<wrap_s>(\w+)<\/wrap_s>/g)) {
    const file = imageFiles.get(m[1]);
    if (file && m[2] === 'MIRROR') mirrored.add(file);
  }
  // Some exporters (Bowser's) give joints generic sids that the loader uses as bone names; map real names to them.
  const jointNames = new Map<string, string>();
  for (const [tag] of text.matchAll(/<node [^>]*type="JOINT"[^>]*>/g)) {
    const name = /\bname="([^"]+)"/.exec(tag)?.[1];
    const sid = /\bsid="([^"]+)"/.exec(tag)?.[1];
    if (name && sid) jointNames.set(name, sid);
  }
  return { text, mirrored, jointNames };
}

async function loadDriver(dir: string, spec: ModelSpec): Promise<Template> {
  const manager = new THREE.LoadingManager();
  const loaded = new Promise<void>((resolve) => {
    manager.onLoad = resolve;
    manager.onError = (url) => console.warn(`Character file failed to load: ${url}`);
  });
  manager.itemStart(dir); // hold onLoad until every file below has been requested

  let scene: THREE.Object3D;
  let collada: Collada | null = null;
  if (spec.file.endsWith('.obj')) {
    const materials = await new MTLLoader(manager).setPath(dir).loadAsync(spec.file.replace(/\.obj$/, '.mtl'));
    materials.preload();
    scene = await new OBJLoader(manager).setMaterials(materials).setPath(dir).loadAsync(spec.file);
  } else {
    const res = await fetch(dir + spec.file);
    if (!res.ok) throw new Error(`${dir}${spec.file}: HTTP ${res.status} (run "npm run fetch-characters")`);
    const replaced = Object.entries(spec.materials ?? {}).filter(([, m]) => m.map || m.color);
    collada = normaliseCollada(await res.text(), replaced.map(([name]) => name));
    const parsed = new ColladaLoader(manager).parse(collada.text, dir);
    if (!parsed) throw new Error(`${dir}${spec.file} could not be parsed`);
    scene = parsed.scene;
  }
  const textures = new Map<string, THREE.Texture>();
  for (const m of Object.values(spec.materials ?? {})) {
    if (m.map && !textures.has(m.map)) textures.set(m.map, new THREE.TextureLoader(manager).load(dir + m.map));
  }
  manager.itemEnd(dir);
  await loaded;

  const root = new THREE.Group().add(scene);
  if (spec.rotate) root.rotation.set(...spec.rotate);
  root.updateMatrixWorld(true);
  const sources: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) sources.push(o);
  });

  let meshes: THREE.Mesh[];
  let bone: (name: string) => THREE.Object3D | undefined;
  let rigRoot: THREE.Object3D = root;
  if (spec.rig) {
    const rig = autoRig(sources, spec.rig);
    meshes = rig.meshes;
    rigRoot = rig.container;
    bone = (name) => rig.bones.get(name);
  } else {
    meshes = sources;
    bone = (name) => scene.getObjectByName(name) ?? scene.getObjectByName(collada?.jointNames.get(name) ?? '');
  }

  const materials = meshes.map((o) =>
    ((Array.isArray(o.material) ? o.material : [o.material]) as THREE.MeshPhongMaterial[]).map((m, i) => {
      const override = spec.materials?.[m.name];
      const map = override?.map ? textures.get(override.map)! : override?.color ? null : m.map;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        const file = decodeURIComponent((map.image as HTMLImageElement).src.split('/').pop() ?? '');
        const mirror = collada?.mirrored.has(file) ?? false;
        map.wrapS = map.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
        map.anisotropy = 4;
        if (override?.repeat) map.repeat.setScalar(override.repeat);
        if (override?.channel) map.channel = override.channel;
        // Eye textures hold one eye; on the Wii a texture matrix doubles U so MIRROR draws the other one.
        // The export drops that matrix, leaving a single eye stretched across the face. If the eye mesh's
        // UVs never reach the mirrored half, restore the doubling. (Peach's UVs already include it.)
        if (mirror && /_eye\b|eye\.\d/.test(file) && maxU(o.geometry, o.geometry.groups, i) < 1.5) map.repeat.x = 2;
      }
      const color = override?.color ?? (map ? '#ffffff' : `#${m.color.getHexString()}`);
      const t = toon(color, { map: map ?? undefined, unique: true });
      t.alphaTest = override?.alphaTest ?? spec.alphaTest ?? 0;
      return t;
    }),
  );

  rigRoot.updateMatrixWorld(true);
  const rest: Template['rest'] = [];
  rigRoot.traverse((o) => rest.push([o, o.position.clone(), o.quaternion.clone()]));
  const t: Template = { root: rigRoot, meshes, materials, bone, rest, generated: !!spec.rig, hips: null, height: 1, poses: new Map() };
  // The default kart pose sets the hips and the height every driver is sized by.
  const first = posedGeometry(t, {});
  t.hips = first.hips;
  t.height = first.top / (spec.scale ?? 1);
  return t;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Gives a static, standing model a simple skeleton (hips, knees, shoulders, elbows) placed from `rig`, with
 * each vertex weighted to the limb it belongs to. The meshes are first baked in their rest pose and scaled
 * to stand 1 unit tall on y=0, so `rig` can use fractions of the height.
 */
function autoRig(sources: THREE.Mesh[], rig: Rig): { meshes: THREE.SkinnedMesh[]; bones: Map<string, THREE.Bone>; container: THREE.Group } {
  const parts = sources.map((m) => ({ geom: bakePose(m), material: m.material as THREE.Material | THREE.Material[] }));
  const box = new THREE.Box3();
  for (const p of parts) box.union(p.geom.computeBoundingBox() ?? p.geom.boundingBox!);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  for (const p of parts) p.geom.translate(-centre.x, -box.min.y, -centre.z).scale(1 / size.y, 1 / size.y, 1 / size.y);

  // Joint depth: the average z of the vertices around the joint in the front view, so limbs pivot about their middle.
  const depthAt = (x: number, y: number, r = 0.04) => {
    let sum = 0;
    let n = 0;
    for (const { geom } of parts) {
      const pos = geom.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        if (Math.hypot(pos.getX(i) - x, pos.getY(i) - y) < r) {
          sum += pos.getZ(i);
          n++;
        }
      }
    }
    return n ? sum / n : 0;
  };

  const bones = new Map<string, THREE.Bone>();
  const world = new Map<string, THREE.Vector3>();
  const joint = (name: string, pos: THREE.Vector3, parent?: string) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(parent ? pos.clone().sub(world.get(parent)!) : pos);
    if (parent) bones.get(parent)!.add(b);
    bones.set(name, b);
    world.set(name, pos);
  };
  const [hx, hy] = rig.hip;
  const handRadius = rig.handRadius ?? rig.armRadius;
  joint('skl_root', new THREE.Vector3(0, hy, depthAt(0, hy)));
  const arms: { s: number; S: THREE.Vector3; E: THREE.Vector3; W: THREE.Vector3; H: THREE.Vector3 }[] = [];
  for (const [side, s] of [['l', 1], ['r', -1]] as const) {
    const z = depthAt(s * hx, hy);
    joint(`leg_${side}1`, new THREE.Vector3(s * hx, hy, z), 'skl_root');
    joint(`leg_${side}2`, new THREE.Vector3(s * hx, rig.knee, depthAt(s * hx, rig.knee)), `leg_${side}1`);
    joint(`ankle_${side}1`, new THREE.Vector3(s * hx, rig.ankle, depthAt(s * hx, rig.ankle)), `leg_${side}2`);
    const at = ([x, y]: [number, number]) => new THREE.Vector3(s * x, y, depthAt(s * x, y));
    const S = at(rig.shoulder);
    const E = at(rig.elbow);
    const W = at(rig.wrist);
    joint(`arm_${side}1`, S, 'skl_root');
    joint(`arm_${side}2`, E, `arm_${side}1`);
    joint(`wrist_${side}1`, W, `arm_${side}2`);
    // The hand carries on past the wrist.
    arms.push({ s, S, E, W, H: W.clone().add(W.clone().sub(E).setLength(handRadius * 2.5)) });
  }
  const order = [...bones.keys()];
  const index = (name: string) => order.indexOf(name);

  const p = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const line = new THREE.Line3();
  const meshes = parts.map(({ geom, material }) => {
    const pos = geom.getAttribute('position');
    const skinIndex = new Uint16Array(pos.count * 4);
    const skinWeight = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const w: [number, number][] = [];
      // Arm: close to the shoulder→elbow→wrist→hand line, and past the shoulder.
      let armW = 0;
      const arm = arms.find((a) => Math.sign(p.x || 1) === a.s)!;
      const side = arm.s > 0 ? 'l' : 'r';
      let best = Infinity;
      let along = 0;
      let run = 0;
      for (const [a, b] of [[arm.S, arm.E], [arm.E, arm.W], [arm.W, arm.H]]) {
        line.set(a, b);
        const t = line.closestPointToPointParameter(p, true);
        const d = line.at(t, closest).distanceTo(p);
        if (d < best) {
          best = d;
          along = run + t * line.distance();
        }
        run += line.distance();
      }
      const past = p.clone().sub(arm.S).dot(arm.E.clone().sub(arm.S).normalize());
      const upper = arm.S.distanceTo(arm.E);
      const radius = THREE.MathUtils.lerp(rig.armRadius, handRadius, smoothstep(upper * 0.6, upper, along));
      armW = smoothstep(-0.02, 0.03, past) * smoothstep(radius * 1.3, radius, best);
      if (armW > 0) {
        const lower = smoothstep(arm.S.distanceTo(arm.E) - 0.03, arm.S.distanceTo(arm.E) + 0.03, along);
        w.push([index(`arm_${side}1`), armW * (1 - lower)], [index(`arm_${side}2`), armW * lower]);
      }
      // Legs: everything below the hips, split left/right with a soft seam down the middle.
      const legW = smoothstep(hy + 0.02, hy - 0.04, p.y) * (1 - armW);
      if (legW > 0) {
        const left = smoothstep(-0.02, 0.02, p.x);
        const lower = smoothstep(rig.knee + 0.03, rig.knee - 0.03, p.y);
        w.push(
          [index('leg_l1'), legW * left * (1 - lower)],
          [index('leg_l2'), legW * left * lower],
          [index('leg_r1'), legW * (1 - left) * (1 - lower)],
          [index('leg_r2'), legW * (1 - left) * lower],
        );
      }
      w.push([index('skl_root'), Math.max(0, 1 - armW - legW)]);
      const top = w.sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = top.reduce((sum, [, v]) => sum + v, 0) || 1;
      top.forEach(([bi, v], k) => {
        skinIndex[i * 4 + k] = bi;
        skinWeight[i * 4 + k] = v / total;
      });
    }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    return new THREE.SkinnedMesh(geom, material);
  });

  const container = new THREE.Group().add(bones.get('skl_root')!, ...meshes);
  container.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(order.map((n) => bones.get(n)!));
  for (const m of meshes) m.bind(skeleton, new THREE.Matrix4());
  return { meshes, bones, container };
}

/** Largest U coordinate used by material `index` (the whole mesh when it has no material groups). */
function maxU(geom: THREE.BufferGeometry, groups: THREE.GeometryGroup[], index: number): number {
  const uv = geom.getAttribute('uv');
  if (!uv) return 0;
  const ranges = groups.length ? groups.filter((g) => (g.materialIndex ?? 0) === index) : [{ start: 0, count: Infinity }];
  let max = -Infinity;
  for (const { start, count } of ranges) {
    const end = Math.min(start + count, geom.index ? geom.index.count : uv.count);
    for (let i = start; i < end; i++) max = Math.max(max, uv.getX(geom.index ? geom.index.getX(i) : i));
  }
  return max;
}

/** World-space directions (character faces +z, its left is +x) for each limb segment in the driving pose. */
const POSE: [bone: string, child: string, dir: [number, number, number]][] = [
  ['leg_l1', 'leg_l2', [0.25, 0.05, 1]],
  ['leg_r1', 'leg_r2', [-0.25, 0.05, 1]],
  ['leg_l2', 'ankle_l1', [0.05, -0.7, 0.7]],
  ['leg_r2', 'ankle_r1', [-0.05, -0.7, 0.7]],
  ['arm_l1', 'arm_l2', [0.3, -0.5, 0.8]],
  ['arm_r1', 'arm_r2', [-0.3, -0.5, 0.8]],
  ['arm_l2', 'wrist_l1', [-0.35, 0.05, 1]],
  ['arm_r2', 'wrist_r1', [0.35, 0.05, 1]],
];

/** Generated rigs are mostly long-legged people: stretch their legs out along the kart floor instead. */
const STRETCHED_LEGS: typeof POSE = [
  ['leg_l1', 'leg_l2', [0.15, 0.1, 1]],
  ['leg_r1', 'leg_r2', [-0.15, 0.1, 1]],
  ['leg_l2', 'ankle_l1', [0.03, -0.3, 1]],
  ['leg_r2', 'ankle_r1', [-0.03, -0.3, 1]],
];

/** Astride a bike: thighs forward and apart, shins down to the footrests. */
const BIKE_LEGS: typeof POSE = [
  ['leg_l1', 'leg_l2', [0.35, -0.3, 1]],
  ['leg_r1', 'leg_r2', [-0.35, -0.3, 1]],
  ['leg_l2', 'ankle_l1', [0.08, -1, -0.15]],
  ['leg_r2', 'ankle_r1', [-0.08, -1, -0.15]],
];

const worldPos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
const segment = (from: THREE.Object3D, to: THREE.Object3D) => worldPos(to).sub(worldPos(from));

const turnQ = new THREE.Quaternion();
const parentQ = new THREE.Quaternion();
const worldQ = new THREE.Quaternion();
/** Rotate a joint (in world space) so that direction `from` becomes `to`. */
function turn(joint: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  turnQ.setFromUnitVectors(from.normalize(), to.normalize());
  joint.parent!.getWorldQuaternion(parentQ);
  joint.getWorldQuaternion(worldQ);
  joint.quaternion.copy(parentQ.invert().multiply(turnQ.multiply(worldQ)));
  joint.updateMatrixWorld(true);
}

/**
 * Two-bone IK: bend one arm (shoulder -> elbow -> wrist) so the wrist lands on `target`, with the elbow out
 * to the side and down. A target out of reach leaves the arm straight, pointing at it.
 */
function reach(bone: (name: string) => THREE.Object3D | undefined, side: 'l' | 'r', target: THREE.Vector3) {
  const shoulder = bone(`arm_${side}1`);
  const elbow = bone(`arm_${side}2`);
  const wrist = bone(`wrist_${side}1`);
  if (!shoulder || !elbow || !wrist) return;
  const S = worldPos(shoulder);
  const upper = S.distanceTo(worldPos(elbow));
  const lower = worldPos(elbow).distanceTo(worldPos(wrist));
  const toTarget = target.clone().sub(S);
  const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(upper - lower) + 1e-4, (upper + lower) * 0.999);
  const dir = toTarget.normalize();
  const bend = new THREE.Vector3(side === 'l' ? 1 : -1, -1, -0.2);
  bend.addScaledVector(dir, -bend.dot(dir)).normalize();
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const E = S.clone().addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  turn(shoulder, segment(shoulder, elbow), E.clone().sub(S));
  turn(elbow, segment(elbow, wrist), S.clone().addScaledVector(dir, d).sub(worldPos(elbow)));
}

/**
 * Bends the T-posed skeleton into a seated, hands-on-the-wheel pose by rotating each segment (in world space)
 * so it points along POSE. Returns the midpoint of the hips, or null for legless characters.
 */
function seat(bone: (name: string) => THREE.Object3D | undefined, stretchLegs = false, bike = false): THREE.Vector3 | null {
  const arms = POSE.filter(([name]) => name.startsWith('arm'));
  const pose = bike ? [...BIKE_LEGS, ...arms] : stretchLegs ? [...STRETCHED_LEGS, ...arms] : POSE;
  for (const [name, childName, d] of pose) {
    const joint = bone(name);
    const child = bone(childName);
    if (joint && child) turn(joint, segment(joint, child), new THREE.Vector3(...d));
  }

  const l = bone('leg_l1');
  const r = bone('leg_r1');
  if (!l || !r) return null;
  const hips = worldPos(l).add(worldPos(r)).multiplyScalar(0.5);

  // Bowser's tail hangs down through the seat; lay it out behind him.
  const tail = bone('tail_1');
  const tailEnd = bone('tail_2');
  if (tail && tailEnd) turn(tail, segment(tail, tailEnd), new THREE.Vector3(0, -0.2, -1));

  // Peach's skirt joint sits at the hem (on the floor): bring the hem forward to drape over her shins.
  const skirt = bone('skirt_1');
  const knee = bone('leg_l2');
  const ankle = bone('ankle_l1');
  if (skirt && knee && ankle) {
    turn(skirt, new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0.5));
    const hem = worldPos(knee).lerp(worldPos(ankle), 0.5).setX(hips.x);
    skirt.position.copy(skirt.parent!.worldToLocal(hem));
    skirt.updateMatrixWorld(true);
  }
  return hips;
}

/** Static world-space copy of a (possibly skinned) mesh in its current pose. Vertex colours are dropped. */
export function bakePose(mesh: THREE.Mesh): THREE.BufferGeometry {
  const src = mesh.geometry;
  const pos = src.getAttribute('position');
  const nrm = src.getAttribute('normal');
  const skinIndex = src.getAttribute('skinIndex');
  const skinWeight = src.getAttribute('skinWeight');
  const skin = mesh instanceof THREE.SkinnedMesh && skinIndex && skinWeight ? mesh : null;
  const bones = skin?.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skin.skeleton.boneInverses[i]));

  const outPos = new Float32Array(pos.count * 3);
  const outNrm = new Float32Array(pos.count * 3);
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (skin && bones) {
      // Same as three's skinning shader: world = meshWorld · bindMatrixInverse · Σ wᵢ(boneWorldᵢ · boneInverseᵢ) · bindMatrix
      const e = m.elements.fill(0);
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w === 0) continue;
        const be = bones[skinIndex.getComponent(i, k)].elements;
        for (let j = 0; j < 16; j++) e[j] += w * be[j];
      }
      m.premultiply(skin.bindMatrixInverse).premultiply(skin.matrixWorld).multiply(skin.bindMatrix);
    } else m.copy(mesh.matrixWorld);
    v.fromBufferAttribute(pos, i).applyMatrix4(m).toArray(outPos, i * 3);
    if (nrm) v.fromBufferAttribute(nrm, i).applyMatrix3(nm.getNormalMatrix(m)).normalize().toArray(outNrm, i * 3);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  if (nrm) geom.setAttribute('normal', new THREE.BufferAttribute(outNrm, 3));
  for (const name of ['uv', 'uv1']) {
    const uv = src.getAttribute(name);
    if (uv) geom.setAttribute(name, uv);
  }
  if (src.index) geom.setIndex(src.index);
  for (const g of src.groups) geom.addGroup(g.start, g.count, g.materialIndex);
  if (!nrm) geom.computeVertexNormals();
  return geom;
}
