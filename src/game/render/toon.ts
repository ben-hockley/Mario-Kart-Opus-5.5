import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Three-band ramp used by every toon material. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Shared toon material for a colour (use `unique` for materials that get tinted at runtime). */
export function toon(color: THREE.ColorRepresentation, opts: { unique?: boolean; emissive?: THREE.ColorRepresentation; map?: THREE.Texture; side?: THREE.Side } = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ?? ''}|${opts.map?.uuid ?? ''}|${opts.side ?? ''}`;
  if (!opts.unique) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    map: opts.map ?? null,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
  if (!opts.unique) cache.set(key, m);
  return m;
}
