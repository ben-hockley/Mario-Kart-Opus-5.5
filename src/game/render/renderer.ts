import * as THREE from 'three';

export interface ViewRect {
  /** CSS pixels from the top-left, for DOM overlays. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Owns the WebGL renderer and computes split-screen layouts. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  width = 1;
  height = 1;
  onResize: () => void = () => {};

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false;
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    this.onResize();
  }

  /** Layout of up to four viewports (index 3 is the overview when there are 3 players). */
  layout(n: number): ViewRect[] {
    const W = this.width;
    const H = this.height;
    if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
    if (n === 2)
      return [
        { x: 0, y: 0, w: W, h: H / 2 },
        { x: 0, y: H / 2, w: W, h: H / 2 },
      ];
    return [
      { x: 0, y: 0, w: W / 2, h: H / 2 },
      { x: W / 2, y: 0, w: W / 2, h: H / 2 },
      { x: 0, y: H / 2, w: W / 2, h: H / 2 },
      { x: W / 2, y: H / 2, w: W / 2, h: H / 2 },
    ];
  }

  /** Physical-pixel height of the drawing buffer for a rect. */
  pixelHeight(r: ViewRect) {
    return r.h * this.renderer.getPixelRatio();
  }

  clear() {
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.clear();
  }

  renderView(scene: THREE.Scene, camera: THREE.Camera, r: ViewRect) {
    const gl = this.renderer;
    const y = this.height - r.y - r.h; // WebGL origin is bottom-left
    gl.setViewport(r.x, y, r.w, r.h);
    gl.setScissor(r.x, y, r.w, r.h);
    gl.setScissorTest(true);
    gl.render(scene, camera);
  }
}
