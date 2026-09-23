import * as THREE from 'three';
import { mulberry32 } from '../core/math';

const cache = new Map<string, THREE.Texture>();

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], size: [number, number], seed = 1) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    g.fillRect(r() * w, r() * h, s, s);
  }
}

export function shadowTexture() {
  return make(
    'shadow',
    64,
    64,
    (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.8)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.45)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    },
    false,
  );
}

export function roadTexture(base: string, line: string) {
  return make(`road${base}${line}`, 256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1400, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.07)'], [1, 3], 7);
    g.fillStyle = line;
    g.fillRect(w * 0.03, 0, w * 0.025, h);
    g.fillRect(w * 0.945, 0, w * 0.025, h);
    g.globalAlpha = 0.45;
    g.fillRect(w * 0.495, 0, w * 0.012, h * 0.45);
    g.globalAlpha = 1;
  });
}

export function stripeTexture(a: string, b: string, n = 2) {
  return make(`stripe${a}${b}${n}`, 32, 64, (g, w, h) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(0, (i * h) / n, w, h / n);
    }
  });
}

export function checkerTexture() {
  return make('checker', 128, 32, (g, w, h) => {
    const s = 16;
    for (let y = 0; y < h / s; y++)
      for (let x = 0; x < w / s; x++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        g.fillRect(x * s, y * s, s, s);
      }
  });
}

export function boostTexture() {
  return make('boost', 128, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#ff6a00');
    grad.addColorStop(0.5, '#ffd000');
    grad.addColorStop(1, '#ff6a00');
    g.fillStyle = '#3a1500';
    g.fillRect(0, 0, w, h);
    g.fillStyle = grad;
    for (const y0 of [0, h / 2]) {
      g.beginPath();
      g.moveTo(w * 0.12, y0 + h * 0.42);
      g.lineTo(w * 0.5, y0 + h * 0.1);
      g.lineTo(w * 0.88, y0 + h * 0.42);
      g.lineTo(w * 0.88, y0 + h * 0.3);
      g.lineTo(w * 0.5, y0 - h * 0.02);
      g.lineTo(w * 0.12, y0 + h * 0.3);
      g.closePath();
      g.fill();
    }
  });
}

export function rampTexture(a: string, b: string) {
  return make(`ramp${a}${b}`, 64, 64, (g, w, h) => {
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    g.fillStyle = b;
    for (let i = -2; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 24, h);
      g.lineTo(i * 24 + 12, h);
      g.lineTo(i * 24 + 12 + h, 0);
      g.lineTo(i * 24 + h, 0);
      g.fill();
    }
  });
}

export function itemBoxTexture() {
  return make(
    'itembox',
    128,
    128,
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, h);
      ['#ff4d6d', '#ffb020', '#ffe84d', '#3ee07a', '#3fa7ff', '#b35bff'].forEach((c, i, a) =>
        grad.addColorStop(i / (a.length - 1), c),
      );
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(6, 6, w - 12, h - 12);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 6;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.font = 'bold 92px "Lilita One", Arial Black, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeStyle = '#6a2cff';
      g.strokeText('?', w / 2, h / 2 + 6);
      g.fillStyle = '#fff';
      g.fillText('?', w / 2, h / 2 + 6);
    },
    false,
  );
}

export function liquidTexture(kind: 'water' | 'lava') {
  return make(`liquid${kind}`, 256, 256, (g, w, h) => {
    const [base, mid, hi] = kind === 'water' ? ['#1b8fd6', '#3fb4ec', '#bff0ff'] : ['#c21f00', '#ff5a00', '#ffd24a'];
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = mulberry32(kind === 'water' ? 3 : 9);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = r() < 0.7 ? mid : hi;
      g.globalAlpha = 0.5 + r() * 0.5;
      g.lineWidth = 2 + r() * 4;
      const x = r() * w;
      const y = r() * h;
      const len = 20 + r() * 50;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - 8 - r() * 8, x + len, y);
      g.stroke();
      // wrap copies so the pattern tiles
      g.beginPath();
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w + len / 2, y - 8, x - w + len, y);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

export function groundTexture(base: string, dots: string[], seed: number) {
  return make(`ground${base}${seed}`, 256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, dots, [2, 6], seed);
  });
}

export function glowSprite() {
  return make(
    'glow',
    64,
    64,
    (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    },
    false,
  );
}
