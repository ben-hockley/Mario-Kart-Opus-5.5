import * as THREE from 'three';
import { CHARACTERS, type CharacterDef, type WeightClass } from '../kart/characters';
import { KartModel } from '../kart/kartModel';
import { VEHICLES, type VehicleDef } from '../kart/vehicles';

/**
 * Debug page for fitting drivers to vehicles: a contact sheet of drivers in vehicles from several angles.
 *
 *   ?garage                      every vehicle, each with a Mario Kart driver of its own weight class
 *   ?garage=kart,bike,guest,<id>  groups and/or vehicle ids, comma-separated
 *   &char=<id>|all               a given driver, or every driver (best with one vehicle)
 *   &view=side,three,front,back,top   camera angles, one column each (default side,three)
 *   &marks=1                     seat (red) and grips (green) markers
 *   &driver=0 &grid=1 &zoom=2    vehicle only, with a measuring grid, closer up
 *   &wheels=1                    spinning wheels in magenta
 */
export function showGarage(params: URLSearchParams) {
  const vehicles = (params.get('garage') || 'all')
    .split(',')
    .flatMap((s) => VEHICLES.filter((v) => s === 'all' || v.group === s || v.id === s));
  const native: Record<WeightClass, string> = { Light: 'toad', Medium: 'mario', Heavy: 'bowser' };
  const charParam = params.get('char');
  const chars = (v: VehicleDef): CharacterDef[] =>
    charParam === 'all' ? CHARACTERS : [CHARACTERS.find((c) => c.id === (charParam ?? native[v.size]))!];
  const views = (params.get('view') ?? 'side,three').split(',');
  const marks = params.get('marks') === '1';
  const withDriver = params.get('driver') !== '0';
  const grid = params.get('grid') === '1';
  const showWheels = params.get('wheels') === '1';
  const size = Number(params.get('size') ?? 300);

  const ui = document.getElementById('ui')!;
  ui.innerHTML = '';
  const page = document.createElement('div');
  page.style.cssText = `position:absolute;inset:0;overflow:auto;background:#1b1a2e;color:#fff;font:13px system-ui;display:grid;grid-template-columns:repeat(auto-fill,${size * views.length + 8}px);gap:6px;padding:6px;pointer-events:auto`;
  ui.appendChild(page);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size * 0.75);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fb3d9');
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a6a8a', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(3, 5, 6);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#6d8f5a' }));
  floor.position.y = -0.005;
  scene.add(floor);
  const cam = new THREE.PerspectiveCamera(30 / Number(params.get("zoom") ?? 1), 4 / 3, 0.1, 50);
  const eye: Record<string, [number, number, number]> = {
    side: [8, 1.3, 0],
    three: [4.6, 3, 5.6],
    front: [0, 1.6, 8],
    back: [0, 2.2, -8],
    top: [0, 9, 0.01],
  };

  const dot = (color: string) => new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  for (const v of vehicles) {
    for (const c of chars(v)) {
      const m = new KartModel(c, v, { driver: withDriver });
      scene.add(m.root);
      if (grid) m.frame.add(measuringGrid());
      if (showWheels)
        for (const w of m.wheels)
          w.traverse((o) => {
            if (o instanceof THREE.Mesh) (o.material as THREE.MeshToonMaterial).emissive.set('#ff00ff');
          });
      if (marks) {
        const seat = dot('#ff3040');
        const gripL = dot('#30ff60');
        const gripR = dot('#30ff60');
        seat.position.copy(m.seat);
        gripL.position.copy(m.grip);
        gripR.position.copy(m.grip).setX(-m.grip.x);
        for (const d of [seat, gripL, gripR]) {
          d.scale.setScalar(1 / m.frame.scale.x);
          d.renderOrder = 10;
          m.frame.add(d);
        }
      }
      const fig = document.createElement('figure');
      fig.style.cssText = 'margin:0;background:#2a2946;padding:4px';
      for (const view of views) {
        cam.position.set(...(eye[view] ?? eye.side));
        cam.lookAt(0, 0.8, 0);
        renderer.render(scene, cam);
        const img = new Image(size, size * 0.75);
        img.src = grid ? labelGrid(renderer.domElement, cam, m.frame, view) : renderer.domElement.toDataURL('image/png');
        fig.appendChild(img);
      }
      const cap = document.createElement('figcaption');
      const box = new THREE.Box3().setFromObject(m.frame.children[0]);
      const fmt = (p: THREE.Vector3) => p.toArray().map((n) => n.toFixed(2)).join(',');
      cap.textContent = `${v.name} (${v.size}) · ${c.name} · wheels ${m.wheels.length} [${m.wheelRadius.map((r) => r.toFixed(2)).join(' ')}] · box ${fmt(box.min)} → ${fmt(box.max)}`;
      fig.appendChild(cap);
      page.appendChild(fig);
      scene.remove(m.root);
    }
  }
  renderer.dispose();
  (window as unknown as { __garageDone: boolean }).__garageDone = true;
}

/** The render with the bright grid lines numbered (in the vehicle frame's units). */
function labelGrid(canvas: HTMLCanvasElement, cam: THREE.Camera, frame: THREE.Object3D, view: string): string {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const g = out.getContext('2d')!;
  g.drawImage(canvas, 0, 0);
  g.font = `bold ${Math.round(canvas.width / 45)}px system-ui`;
  g.fillStyle = '#ffe14a';
  g.strokeStyle = '#000';
  g.lineWidth = 3;
  frame.updateMatrixWorld(true);
  const label = (text: string, p: THREE.Vector3) => {
    const s = frame.localToWorld(p).project(cam);
    const x = ((s.x + 1) / 2) * out.width;
    const y = ((1 - s.y) / 2) * out.height;
    g.strokeText(text, x, y);
    g.fillText(text, x, y);
  };
  const across = view === 'front' || view === 'back' ? 'x' : 'z';
  for (let v = 0; v <= 3; v += 0.5) label(`y${v}`, across === 'z' ? new THREE.Vector3(0, v, view === 'side' ? 2.6 : -2.6) : new THREE.Vector3(-1.9, v, 0));
  for (let v = -2.5; v <= 2.5; v += 0.5) label(`${across}${v}`, across === 'z' ? new THREE.Vector3(0, 0.02, v) : new THREE.Vector3(v, 0.02, 0));
  return out.toDataURL('image/png');
}

/** Lines every 0.1 (faint) and 0.5 (bright) units in the side (x = 0) and front (z = 0) planes, drawn on top. */
function measuringGrid(): THREE.Object3D {
  const group = new THREE.Group();
  const lines = (step: number, color: string, opacity: number) => {
    const pts: number[] = [];
    for (let y = 0; y <= 3.001; y += step) pts.push(0, y, -3, 0, y, 3, -2, y, 0, 2, y, 0);
    for (let z = -3; z <= 3.001; z += step) pts.push(0, 0, z, 0, 3, z);
    for (let x = -2; x <= 2.001; x += step) pts.push(x, 0, 0, x, 3, 0);
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
    l.renderOrder = 20;
    group.add(l);
  };
  lines(0.1, '#ffffff', 0.18);
  lines(0.5, '#ffffff', 0.6);
  const axes = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -3, 0, 0, 3, 0, 0, 0, 0, 3, 0], 3));
  const a = new THREE.LineSegments(axes, new THREE.LineBasicMaterial({ color: '#ff2020', depthTest: false }));
  a.renderOrder = 21;
  group.add(a);
  return group;
}
