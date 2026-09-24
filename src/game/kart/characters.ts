export type WeightClass = 'Light' | 'Medium' | 'Heavy';

export interface CharacterDef {
  /** Also the folder name under public/characters/. */
  id: string;
  name: string;
  /** Mario Kart regulars, or guests from other games (shown as a separate group in character select). */
  series: 'mario' | 'guest';
  weightClass: WeightClass;
  /** 1–5 ratings shown in menus. */
  speed: number;
  accel: number;
  handling: number;
  weight: number;
  kart: string;
  accent: string;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'toad', name: 'Toad', series: 'mario', weightClass: 'Light', speed: 2, accel: 5, handling: 5, weight: 1, kart: '#2f6fe0', accent: '#ffffff' },
  { id: 'drybones', name: 'Dry Bones', series: 'mario', weightClass: 'Light', speed: 3, accel: 4, handling: 5, weight: 1, kart: '#8e9aae', accent: '#3f4d78' },
  { id: 'shyguy', name: 'Shy Guy', series: 'mario', weightClass: 'Light', speed: 3, accel: 5, handling: 4, weight: 1, kart: '#1f2937', accent: '#e11d48' },
  { id: 'mario', name: 'Mario', series: 'mario', weightClass: 'Medium', speed: 3, accel: 3, handling: 4, weight: 3, kart: '#e52521', accent: '#2a5bd7' },
  { id: 'peach', name: 'Peach', series: 'mario', weightClass: 'Medium', speed: 3, accel: 4, handling: 4, weight: 2, kart: '#ff8cc6', accent: '#ffd23f' },
  { id: 'yoshi', name: 'Yoshi', series: 'mario', weightClass: 'Medium', speed: 4, accel: 3, handling: 3, weight: 3, kart: '#3fbf4f', accent: '#ffffff' },
  { id: 'dk', name: 'Donkey Kong', series: 'mario', weightClass: 'Heavy', speed: 4, accel: 3, handling: 2, weight: 5, kart: '#a0612e', accent: '#e8452c' },
  { id: 'bowser', name: 'Bowser', series: 'mario', weightClass: 'Heavy', speed: 5, accel: 1, handling: 2, weight: 5, kart: '#2f8a3a', accent: '#f5a623' },
  { id: 'kingboo', name: 'King Boo', series: 'mario', weightClass: 'Heavy', speed: 5, accel: 2, handling: 3, weight: 4, kart: '#6b3fb8', accent: '#ffd23f' },
  { id: 'lemming', name: 'Lemming', series: 'guest', weightClass: 'Light', speed: 2, accel: 5, handling: 5, weight: 1, kart: '#2b3fbf', accent: '#3cb043' },
  { id: 'sackboy', name: 'Sackboy', series: 'guest', weightClass: 'Light', speed: 3, accel: 4, handling: 5, weight: 1, kart: '#c9a36b', accent: '#e84a8a' },
  { id: 'cartman', name: 'Cartman', series: 'guest', weightClass: 'Light', speed: 3, accel: 4, handling: 4, weight: 2, kart: '#2bb3b1', accent: '#ffd23f' },
  { id: 'bart', name: 'Bart', series: 'guest', weightClass: 'Medium', speed: 3, accel: 4, handling: 4, weight: 2, kart: '#f26522', accent: '#2b7bd8' },
  { id: 'gromit', name: 'Gromit', series: 'guest', weightClass: 'Medium', speed: 3, accel: 3, handling: 4, weight: 3, kart: '#d9c9a3', accent: '#6b3f1e' },
  { id: 'brian', name: 'Brian', series: 'guest', weightClass: 'Medium', speed: 4, accel: 3, handling: 3, weight: 3, kart: '#c8102e', accent: '#ffffff' },
  { id: 'wallace', name: 'Wallace', series: 'guest', weightClass: 'Heavy', speed: 4, accel: 2, handling: 3, weight: 4, kart: '#3f6b3a', accent: '#b5402a' },
  { id: 'peter', name: 'Peter', series: 'guest', weightClass: 'Heavy', speed: 5, accel: 1, handling: 2, weight: 5, kart: '#f8f8f8', accent: '#2d6a4f' },
  { id: 'homer', name: 'Homer', series: 'guest', weightClass: 'Heavy', speed: 5, accel: 2, handling: 2, weight: 5, kart: '#ffd90f', accent: '#4a6fb5' },
];

export interface KartStats {
  maxSpeed: number;
  accel: number;
  turn: number;
  weight: number;
}

/** Vehicle modifiers for the ratings (see VehicleDef). */
type Mods = Pick<CharacterDef, 'speed' | 'accel' | 'handling' | 'weight'>;

/** A driver's 1–5 ratings adjusted by their vehicle, kept close to the range the physics is tuned for. */
export function ratingsFor(c: CharacterDef, v?: Mods): Mods {
  const r = (k: keyof Mods) => Math.min(5.5, Math.max(0.5, c[k] + (v?.[k] ?? 0)));
  return { speed: r('speed'), accel: r('accel'), handling: r('handling'), weight: r('weight') };
}

export function statsFor(c: CharacterDef, v?: Mods): KartStats {
  const r = ratingsFor(c, v);
  return {
    maxSpeed: 27.5 + r.speed * 0.9,
    accel: 9 + r.accel * 2.2,
    turn: 1.75 + r.handling * 0.13,
    weight: 0.6 + r.weight * 0.25,
  };
}
