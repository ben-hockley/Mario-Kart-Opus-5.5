import * as THREE from 'three';
import { CHARACTERS, type CharacterDef } from '../kart/characters';
import { KartModel } from '../kart/kartModel';
import { vehicleModel } from '../kart/vehicleModels';
import { VEHICLES, type VehicleDef } from '../kart/vehicles';

const SIZE = 256;

let studio: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;

/** An offscreen renderer and lit scene for menu pictures, kept for on-demand renders. */
function getStudio() {
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a6a8a', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(3, 5, 6);
  scene.add(sun);
  studio = { renderer, scene, cam: new THREE.PerspectiveCamera(32, 1, 0.1, 50) };
  return studio;
}

/** Render one object to a data URL. With `fit`, the camera frames it; otherwise the fixed portrait view. */
function snapshot(obj: THREE.Object3D, fit: boolean): string {
  const { renderer, scene, cam } = getStudio();
  obj.rotation.y = 0.5;
  scene.add(obj);
  const dir = new THREE.Vector3(3.6, 2.6, 5.2).normalize();
  if (fit) {
    obj.updateMatrixWorld(true);
    const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.copy(sphere.center).addScaledVector(dir, dist * 0.75);
    cam.lookAt(sphere.center);
  } else {
    cam.position.set(3.6, 2.6, 5.2);
    cam.lookAt(0, 1.0, 0);
  }
  renderer.render(scene, cam);
  scene.remove(obj);
  return renderer.domElement.toDataURL('image/png');
}

let cache: Map<string, string> | null = null;

/** Each character in the standard kart, for menus. */
export function characterPortraits(): Map<string, string> {
  if (cache) return cache;
  cache = new Map();
  for (const c of CHARACTERS) cache.set(c.id, snapshot(new KartModel(c).root, false));
  return cache;
}

let vehicleCache: Map<string, string> | null = null;

/** Each vehicle on its own, in its standard paint job. */
export function vehiclePortraits(): Map<string, string> {
  if (vehicleCache) return vehicleCache;
  vehicleCache = new Map();
  for (const v of VEHICLES) vehicleCache.set(v.id, snapshot(vehicleModel(v.id, null).model, true));
  return vehicleCache;
}

const riderCache = new Map<string, string>();

/** A character in a vehicle (rendered on first request). */
export function riderPortrait(c: CharacterDef, v: VehicleDef): string {
  const key = `${c.id}|${v.id}`;
  let url = riderCache.get(key);
  if (!url) riderCache.set(key, (url = snapshot(new KartModel(c, v).root, true)));
  return url;
}
