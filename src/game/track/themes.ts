import type { ThemeId } from './types';

export interface Theme {
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  sun: string;
  sunIntensity: number;
  sunDir: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ground: string;
  groundDots: string[];
  road: string;
  roadLine: string;
  offroad: string;
  offroadDots: string[];
  wall: [string, string];
  curb: [string, string];
  skirt: string;
  ramp: [string, string];
  /** Liquid used for hazards. */
  liquid: 'water' | 'lava';
  /** Track sits on an island in an endless sea (Coral Coast). */
  island: boolean;
  groundY: number;
}

export const THEMES: Record<ThemeId, Theme> = {
  sunny: {
    skyTop: '#2f8fff',
    skyHorizon: '#bfe8ff',
    skyBottom: '#e8f7ff',
    fog: '#cdeeff',
    fogNear: 180,
    fogFar: 700,
    sun: '#fff4dc',
    sunIntensity: 2.2,
    sunDir: [0.4, 1, 0.3],
    hemiSky: '#bfe3ff',
    hemiGround: '#4f8a3a',
    hemiIntensity: 1.3,
    ground: '#62c24a',
    groundDots: ['#58b442', '#71cf55', '#4fa83c'],
    road: '#5a5f6e',
    roadLine: '#ffffff',
    offroad: '#4fae3d',
    offroadDots: ['#5fc04a', '#3f9a33', '#7bd35c'],
    wall: ['#ff3b4f', '#ffffff'],
    curb: ['#ff3b4f', '#ffffff'],
    skirt: '#8b6a4a',
    ramp: ['#ffcf33', '#2a2833'],
    liquid: 'water',
    island: false,
    groundY: -0.6,
  },
  coast: {
    skyTop: '#1f8fff',
    skyHorizon: '#ffe7c2',
    skyBottom: '#ffe7c2',
    fog: '#ffe9cc',
    fogNear: 200,
    fogFar: 800,
    sun: '#fff0d0',
    sunIntensity: 2.4,
    sunDir: [-0.5, 1, 0.4],
    hemiSky: '#bfe3ff',
    hemiGround: '#d8b27a',
    hemiIntensity: 1.3,
    ground: '#f3d59c',
    groundDots: ['#ecc98a', '#f8e2b4', '#e2bb7c'],
    road: '#6b6772',
    roadLine: '#fff6d6',
    offroad: '#efcf92',
    offroadDots: ['#e6c080', '#f9e3b8', '#d9b170'],
    wall: ['#c98a4f', '#9a6234'],
    curb: ['#1fb5ff', '#ffffff'],
    skirt: '#b98d58',
    ramp: ['#1fb5ff', '#ffffff'],
    liquid: 'water',
    island: true,
    groundY: -0.5,
  },
  frost: {
    skyTop: '#5f9fe0',
    skyHorizon: '#e6f2ff',
    skyBottom: '#f4f9ff',
    fog: '#e9f3ff',
    fogNear: 120,
    fogFar: 600,
    sun: '#ffffff',
    sunIntensity: 2.0,
    sunDir: [0.3, 0.8, -0.5],
    hemiSky: '#dbeaff',
    hemiGround: '#9fb4cc',
    hemiIntensity: 1.5,
    ground: '#eef5ff',
    groundDots: ['#dfeaf7', '#ffffff', '#d3e2f2'],
    road: '#5c6675',
    roadLine: '#ffe36b',
    offroad: '#dae8f6',
    offroadDots: ['#c9dbee', '#ffffff', '#bfd2e8'],
    wall: ['#ffffff', '#bcd6f2'],
    curb: ['#3a7bd5', '#ffffff'],
    skirt: '#8fa0b4',
    ramp: ['#3a7bd5', '#ffffff'],
    liquid: 'water',
    island: false,
    groundY: -0.6,
  },
  magma: {
    skyTop: '#1a0710',
    skyHorizon: '#b8321a',
    skyBottom: '#ff6a2a',
    fog: '#5a1a14',
    fogNear: 90,
    fogFar: 520,
    sun: '#ffb38a',
    sunIntensity: 1.6,
    sunDir: [0.2, 1, 0.6],
    hemiSky: '#ff8a5c',
    hemiGround: '#401818',
    hemiIntensity: 1.4,
    ground: '#3a2f36',
    groundDots: ['#2e252b', '#473a42', '#55343a'],
    road: '#4a4450',
    roadLine: '#ff9a3c',
    offroad: '#5a3d36',
    offroadDots: ['#4a302b', '#6b463c', '#3c2824'],
    wall: ['#77727f', '#5b5664'],
    curb: ['#ff5a1f', '#2a2226'],
    skirt: '#3a3036',
    ramp: ['#ff5a1f', '#2a2226'],
    liquid: 'lava',
    island: false,
    groundY: -0.8,
  },
};
