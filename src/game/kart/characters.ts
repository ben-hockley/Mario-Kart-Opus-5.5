export type WeightClass = 'Light' | 'Medium' | 'Heavy';
export type Accessory = 'beak' | 'catEars' | 'bunnyEars' | 'dinoSpikes' | 'helmet' | 'bearEars' | 'horns' | 'robot';

export interface CharacterDef {
  id: string;
  name: string;
  weightClass: WeightClass;
  /** 1–5 ratings shown in menus. */
  speed: number;
  accel: number;
  handling: number;
  weight: number;
  skin: string;
  outfit: string;
  kart: string;
  accent: string;
  accessory: Accessory;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'pip', name: 'Pip', weightClass: 'Light', speed: 2, accel: 5, handling: 5, weight: 1, skin: '#ffd93b', outfit: '#ff8a1f', kart: '#ffcf33', accent: '#ff7b1c', accessory: 'beak' },
  { id: 'mochi', name: 'Mochi', weightClass: 'Light', speed: 3, accel: 4, handling: 5, weight: 1, skin: '#fff4f0', outfit: '#ff7eb6', kart: '#ff8cc6', accent: '#ffffff', accessory: 'catEars' },
  { id: 'zip', name: 'Zip', weightClass: 'Light', speed: 3, accel: 5, handling: 3, weight: 2, skin: '#d8ecff', outfit: '#35c6ff', kart: '#34d3ff', accent: '#1a4fff', accessory: 'bunnyEars' },
  { id: 'rex', name: 'Rex', weightClass: 'Medium', speed: 3, accel: 3, handling: 4, weight: 3, skin: '#5fd35a', outfit: '#f0e35a', kart: '#3fbf4f', accent: '#f5e04a', accessory: 'dinoSpikes' },
  { id: 'nova', name: 'Nova', weightClass: 'Medium', speed: 4, accel: 3, handling: 3, weight: 3, skin: '#f2c7a5', outfit: '#9b5bff', kart: '#8a4dff', accent: '#e9e4ff', accessory: 'helmet' },
  { id: 'brutus', name: 'Brutus', weightClass: 'Heavy', speed: 4, accel: 2, handling: 3, weight: 5, skin: '#a86a3d', outfit: '#e8452c', kart: '#f05a28', accent: '#3a2a20', accessory: 'bearEars' },
  { id: 'grimm', name: 'Grimm', weightClass: 'Heavy', speed: 5, accel: 2, handling: 2, weight: 5, skin: '#8fa3b8', outfit: '#5b2a86', kart: '#b0203a', accent: '#f4e3c1', accessory: 'horns' },
  { id: 'bolt', name: 'Bolt', weightClass: 'Heavy', speed: 5, accel: 1, handling: 3, weight: 4, skin: '#c9d3de', outfit: '#3c4a5c', kart: '#4f7cff', accent: '#ff3b3b', accessory: 'robot' },
];

export interface KartStats {
  maxSpeed: number;
  accel: number;
  turn: number;
  weight: number;
}

export function statsFor(c: CharacterDef): KartStats {
  return {
    maxSpeed: 27.5 + c.speed * 0.9,
    accel: 9 + c.accel * 2.2,
    turn: 1.75 + c.handling * 0.13,
    weight: 0.6 + c.weight * 0.25,
  };
}
