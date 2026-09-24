import type { CharacterDef, WeightClass } from './characters';

export interface VehicleDef {
  /** Also the folder name under public/vehicles/. */
  id: string;
  name: string;
  /** Column group in vehicle select. */
  group: 'kart' | 'bike' | 'guest';
  /** Bikes get a straddling pose and lean into turns. */
  kind: 'kart' | 'bike';
  /** Weight class the model was built for. Drivers of other classes get it scaled to their size. */
  size: WeightClass;
  /** Game the model comes from. */
  from: string;
  /** Added to the driver's 1–5 ratings. */
  speed: number;
  accel: number;
  handling: number;
  weight: number;
}

type Mods = [speed: number, accel: number, handling: number, weight: number];
const MKWII = 'Mario Kart Wii';
const SHR = 'The Simpsons: Hit & Run';

function v(id: string, name: string, group: VehicleDef['group'], size: WeightClass, [speed, accel, handling, weight]: Mods, from = MKWII): VehicleDef {
  return { id, name, group, kind: group === 'bike' || id === 'hover_bike' ? 'bike' : 'kart', size, from, speed, accel, handling, weight };
}

/** In vehicle-select order: each group fills a 4-wide block, row by row. */
export const VEHICLES: VehicleDef[] = [
  v('standard_kart', 'Standard Kart', 'kart', 'Medium', [0, 0, 0, 0]),
  v('booster_seat', 'Booster Seat', 'kart', 'Light', [-1, 1, 1, -1]),
  v('mini_beast', 'Mini Beast', 'kart', 'Light', [1, -1, 0, 0]),
  v('cheep_charger', 'Cheep Charger', 'kart', 'Light', [0, 1, 0, -1]),
  v('tiny_titan', 'Tiny Titan', 'kart', 'Light', [0, 0, -1, 1]),
  v('blue_falcon', 'Blue Falcon', 'kart', 'Light', [1, 0, 0, -1]),
  v('classic_dragster', 'Classic Dragster', 'kart', 'Medium', [1, -1, -1, 1]),
  v('wild_wing', 'Wild Wing', 'kart', 'Medium', [1, 0, -1, 0]),
  v('super_blooper', 'Super Blooper', 'kart', 'Medium', [0, 0, 1, -1]),
  v('daytripper', 'Daytripper', 'kart', 'Medium', [-1, 1, 0, 0]),
  v('sprinter', 'Sprinter', 'kart', 'Medium', [1, -1, 1, -1]),
  v('offroader', 'Offroader', 'kart', 'Heavy', [0, -1, 0, 1]),
  v('flame_flyer', 'Flame Flyer', 'kart', 'Heavy', [1, -1, 0, 0]),
  v('piranha_prowler', 'Piranha Prowler', 'kart', 'Heavy', [0, -1, -1, 2]),
  v('jetsetter', 'Jetsetter', 'kart', 'Heavy', [1, 0, -1, 0]),
  v('honeycoupe', 'Honeycoupe', 'kart', 'Heavy', [0, 1, -1, 0]),

  v('standard_bike', 'Standard Bike', 'bike', 'Medium', [0, 0, 1, -1]),
  v('bullet_bike', 'Bullet Bike', 'bike', 'Light', [1, 0, 0, -1]),
  v('bit_bike', 'Bit Bike', 'bike', 'Light', [-1, 1, 1, -1]),
  v('quacker', 'Quacker', 'bike', 'Light', [0, 1, 0, -1]),
  v('magikruiser', 'Magikruiser', 'bike', 'Light', [-1, 0, 1, 0]),
  v('jet_bubble', 'Jet Bubble', 'bike', 'Light', [1, -1, 0, 0]),
  v('mach_bike', 'Mach Bike', 'bike', 'Medium', [1, 0, 0, -1]),
  v('sugarscoot', 'Sugarscoot', 'bike', 'Medium', [-1, 1, 1, -1]),
  v('zip_zip', 'Zip Zip', 'bike', 'Medium', [0, 1, 0, -1]),
  v('sneakster', 'Sneakster', 'bike', 'Medium', [1, 0, -1, 0]),
  v('dolphin_dasher', 'Dolphin Dasher', 'bike', 'Medium', [0, 0, 1, -1]),
  v('flame_runner', 'Flame Runner', 'bike', 'Heavy', [1, -1, 0, 0]),
  v('wario_bike', 'Wario Bike', 'bike', 'Heavy', [0, -1, 0, 1]),
  v('shooting_star', 'Shooting Star', 'bike', 'Heavy', [0, 1, 0, -1]),
  v('spear', 'Spear', 'bike', 'Heavy', [1, 0, -1, 0]),
  v('phantom', 'Phantom', 'bike', 'Heavy', [-1, 0, 1, 0]),

  v('family_sedan', 'Family Sedan', 'guest', 'Medium', [0, -1, 0, 1], SHR),
  v('malibu_stacy', 'Malibu Stacy Car', 'guest', 'Medium', [1, 0, 0, -1], SHR),
  v('sports_car_70s', "70's Sports Car", 'guest', 'Medium', [1, -1, 0, 0], SHR),
  v('stutz_bearcat', '1936 Stutz Bearcat', 'guest', 'Medium', [-1, 1, 1, -1], SHR),
  v('canyonero', 'Canyonero', 'guest', 'Medium', [-1, -1, 0, 2], SHR),
  v('clown_car', 'Clown Car', 'guest', 'Medium', [-1, 1, 0, 0], SHR),
  v('the_homer', 'The Homer', 'guest', 'Medium', [1, -1, -1, 1], SHR),
  v('carro_loco', 'El Carro Loco', 'guest', 'Medium', [1, 0, -1, 0], SHR),
  v('anti_pesto_van', 'Anti-Pesto Van', 'guest', 'Medium', [-1, 0, 0, 1], 'Wallace & Gromit: The Curse of the Were-Rabbit'),
  v('roller_skate', 'Roller Skate', 'guest', 'Medium', [0, 1, 1, -2], 'LittleBigPlanet Karting'),
  v('rc_buggy', 'R/C Buggy', 'guest', 'Medium', [-1, 1, 1, -1], SHR),
  v('hover_bike', 'Hover Bike', 'guest', 'Medium', [1, 0, 1, -2], SHR),
];

export const DEFAULT_VEHICLE = VEHICLES[0];

export function vehicleById(id: string | undefined): VehicleDef {
  return VEHICLES.find((x) => x.id === id) ?? DEFAULT_VEHICLE;
}

/**
 * Mario Kart Wii paints each vehicle per driver: `body_mr.png` is Mario's, `body_bmr.png` Baby Mario's, and so on.
 * Every vehicle has the paint jobs for its own weight class's drivers plus the Mii ones; only the standard
 * kart and bike also have the plain red and blue team colours.
 */
const MK_PAINT: Record<WeightClass, string[]> = {
  Light: ['bmr', 'bpc', 'blg', 'bds', 'ko', 'kk', 'nk', 'ka'],
  Medium: ['mr', 'pc', 'lg', 'ds', 'ys', 'ca', 'dd', 'jr'],
  Heavy: ['wr', 'wl', 'dk', 'kp', 'kt', 'rs', 'fk', 'bk'],
};

/** Paint the exported menu model uses. */
export const DEFAULT_PAINT: Record<WeightClass, string> = { Light: 'bmr', Medium: 'mr', Heavy: 'wr' };

/** Each driver's paint jobs in order of preference; the first one the vehicle has is used. */
const DRIVER_PAINT: Record<string, string[]> = {
  toad: ['ko', 'kk', 'blue', 'mii_m'],
  drybones: ['ka', 'bk', 'blue', 'mii_m'],
  shyguy: ['red', 'mii_f'],
  mario: ['mr', 'bmr', 'red', 'mii_f'],
  peach: ['pc', 'bpc', 'kk', 'red', 'mii_f'],
  yoshi: ['ys', 'nk', 'blue', 'mii_m'],
  dk: ['dk', 'red', 'mii_f'],
  bowser: ['kp', 'jr', 'red', 'mii_f'],
  kingboo: ['kt', 'blue', 'mii_m'],
};
const GUEST_PAINT: Record<string, 'red' | 'blue'> = {
  lemming: 'blue',
  sackboy: 'red',
  cartman: 'blue',
  bart: 'red',
  gromit: 'red',
  brian: 'blue',
  wallace: 'red',
  peter: 'blue',
  homer: 'blue',
};

/** Paint jobs a Mario Kart Wii vehicle comes with (none for guest vehicles, which have one look). */
export function paintsOf(v: VehicleDef): string[] {
  if (v.group === 'guest') return [];
  const team = v.id === 'standard_kart' || v.id === 'standard_bike' ? ['red', 'blue'] : [];
  return [...MK_PAINT[v.size], ...team, 'mii_f', 'mii_m'];
}

/**
 * A texture's file name in another paint job (`body_mr.png` -> `body_pc.png`, also `tire_bmr (menu).png` and
 * `body_mr_fix.png`), or null if the texture is the same for every driver.
 */
export function repaint(file: string, v: VehicleDef, paint: string): string | null {
  const token = new RegExp(`_${DEFAULT_PAINT[v.size]}(?=\\.png| \\(|_fix\\.png)`);
  return token.test(file) ? file.replace(token, `_${paint}`) : null;
}

/** The paint job `c` gets on `v`, or null for the model's own textures. */
export function paintFor(c: CharacterDef, v: VehicleDef): string | null {
  const have = paintsOf(v);
  if (!have.length) return null;
  const team = GUEST_PAINT[c.id] ?? 'red';
  const prefs = DRIVER_PAINT[c.id] ?? [team, team === 'red' ? 'mii_f' : 'mii_m'];
  return prefs.find((p) => have.includes(p)) ?? DEFAULT_PAINT[v.size];
}
