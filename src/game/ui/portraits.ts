import * as THREE from 'three';
import { CHARACTERS } from '../kart/characters';
import { KartModel } from '../kart/kartModel';

let cache: Map<string, string> | null = null;

/** Renders each character + kart once to a data URL for menus. */
export function characterPortraits(): Map<string, string> {
  if (cache) return cache;
  cache = new Map();
  const size = 256;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a6a8a', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(3, 5, 6);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  cam.position.set(3.6, 2.6, 5.2);
  cam.lookAt(0, 1.0, 0);
  for (const c of CHARACTERS) {
    const m = new KartModel(c);
    m.root.rotation.y = 0.5;
    scene.add(m.root);
    renderer.render(scene, cam);
    cache.set(c.id, renderer.domElement.toDataURL('image/png'));
    scene.remove(m.root);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return cache;
}
