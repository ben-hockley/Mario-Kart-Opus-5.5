/**
 * Downloads the karts, bikes and guest cars from The Models Resource (https://models.spriters-resource.com/)
 * into public/vehicles/<id>/.
 *
 * Each vehicle folder gets `model.dae` or `model.obj` (+ `model.mtl`) plus the textures it uses. Mario Kart Wii
 * vehicles also get the paint jobs (per-driver texture variants) that the game's characters use.
 * Run with: npm run fetch-vehicles
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { unzipSync } from 'fflate';
import { download, finish } from './modelsResource';
import { CHARACTERS } from '../src/game/kart/characters';
import { DEFAULT_PAINT, VEHICLES, paintFor, repaint } from '../src/game/kart/vehicles';

const OUT = join(import.meta.dirname, '..', 'public', 'vehicles');
const MKWII = '/wii/mkwii/asset';
const SHR = '/pc_computer/simpsonshitrun/asset';

/** Vehicle id (matches vehicles.ts) -> asset page and the model file inside its zip. */
const SOURCES: Record<string, { page: string; model: string }> = {
  // Mario Kart Wii's menu models have the body and wheels in one file. Some zips include a "fix" export
  // with corrected faces; those are used where present.
  standard_kart: { page: `${MKWII}/310115/`, model: 'Standard Kart/Medium/menu.dae' },
  booster_seat: { page: `${MKWII}/342323/`, model: 'Booster Seat/menu.dae' },
  mini_beast: { page: `${MKWII}/342318/`, model: 'Mini Beast/menu.dae' },
  cheep_charger: { page: `${MKWII}/342322/`, model: 'Cheep Charger/menu.dae' },
  tiny_titan: { page: `${MKWII}/342333/`, model: 'Tiny Titan/menu.dae' },
  blue_falcon: { page: `${MKWII}/342067/`, model: 'Blue Falcon/menu.dae' },
  classic_dragster: { page: `${MKWII}/342339/`, model: 'Classic Dragster/menu.dae' },
  wild_wing: { page: `${MKWII}/342334/`, model: 'Wild Wing/menu (fix).dae' },
  super_blooper: { page: `${MKWII}/342330/`, model: 'Super Blooper/menu.dae' },
  daytripper: { page: `${MKWII}/340168/`, model: 'Daytripper/menu_fix.dae' },
  sprinter: { page: `${MKWII}/342327/`, model: 'Sprinter/menu.dae' },
  offroader: { page: `${MKWII}/342325/`, model: 'Offroader/menu (fix).dae' },
  flame_flyer: { page: `${MKWII}/339887/`, model: 'Flame Flyer/menu.dae' },
  piranha_prowler: { page: `${MKWII}/342336/`, model: 'Piranha Prowler/menu.dae' },
  jetsetter: { page: `${MKWII}/342319/`, model: 'Jetsetter/menu.dae' },
  honeycoupe: { page: `${MKWII}/340194/`, model: 'Honeycoupe/menu.dae' },
  standard_bike: { page: `${MKWII}/340184/`, model: 'Standard Bike/Medium/menu.dae' },
  bullet_bike: { page: `${MKWII}/342328/`, model: 'Bullet Bike/menu.dae' },
  bit_bike: { page: `${MKWII}/342331/`, model: 'Bit Bike/menu.dae' },
  quacker: { page: `${MKWII}/324710/`, model: 'Quacker/menu.dae' },
  magikruiser: { page: `${MKWII}/342332/`, model: 'Magikruiser/menu.dae' },
  jet_bubble: { page: `${MKWII}/342066/`, model: 'Jet Bubble/menu.dae' },
  mach_bike: { page: `${MKWII}/342324/`, model: 'Mach Bike/menu.dae' },
  sugarscoot: { page: `${MKWII}/340147/`, model: 'Sugarscoot/menu.dae' },
  zip_zip: { page: `${MKWII}/342338/`, model: 'Zip Zip/menu.dae' },
  sneakster: { page: `${MKWII}/342337/`, model: 'Sneakster/menu.dae' },
  dolphin_dasher: { page: `${MKWII}/342326/`, model: 'Dolphin Dasher/menu.dae' },
  flame_runner: { page: `${MKWII}/340927/`, model: 'Flame Runner/menu_fix.dae' },
  wario_bike: { page: `${MKWII}/342329/`, model: 'Wario Bike/menu.dae' },
  shooting_star: { page: `${MKWII}/342320/`, model: 'Shooting Star/menu.dae' },
  spear: { page: `${MKWII}/342321/`, model: 'Spear/menu.dae' },
  phantom: { page: `${MKWII}/342335/`, model: 'Phantom/menu.dae' },
  // Guests
  family_sedan: { page: `${SHR}/299806/`, model: 'Family Sedan/famil_vShape.obj' },
  malibu_stacy: { page: `${SHR}/304846/`, model: 'Malibu Stacy Car/MalibuStacyCar.obj' },
  sports_car_70s: { page: `${SHR}/321516/`, model: 'homer_v/homer_v.obj' },
  stutz_bearcat: { page: `${SHR}/326869/`, model: '1936 Stutz Bearcat/burns.obj' },
  canyonero: { page: `${SHR}/304840/`, model: 'Canyonero/Canyonero.obj' },
  clown_car: { page: `${SHR}/304842/`, model: 'Clown Car/ClownCar.obj' },
  the_homer: { page: `${SHR}/304853/`, model: 'The Homer/TheHomer.obj' },
  carro_loco: { page: `${SHR}/304843/`, model: 'El Carro Loco/ElCarroLoco.obj' },
  anti_pesto_van: { page: '/xbox/wallacegromitthecurseofthewererabbit/asset/329705/', model: 'Anti-Pesto Van/AntiPestoVan.obj' },
  roller_skate: { page: '/playstation_3/littlebigplanetkarting/asset/292328/', model: 'Roller Skate/rollerskate.obj' },
  rc_buggy: { page: `${SHR}/320517/`, model: 'RC Buggy/RC Buggy.obj' },
  hover_bike: { page: `${SHR}/299805/`, model: 'Hover Bike/hbike_vShape.obj' },
};

const only = process.argv.slice(2);
for (const vehicle of VEHICLES) {
  if (only.length && !only.includes(vehicle.id)) continue;
  const src = SOURCES[vehicle.id];
  if (!src) throw new Error(`${vehicle.id}: no source listed`);
  const files = unzipSync(await download(src.page));
  let model = files[src.model];
  if (!model) throw new Error(`${vehicle.id}: ${src.model} is missing from the zip`);
  const dir = join(OUT, vehicle.id);
  await mkdir(dir, { recursive: true });
  const folder = posix.dirname(src.model);
  const ext = posix.extname(src.model);
  if (ext === '.obj') {
    // Drop stray line elements (`l a b`): three's OBJLoader turns an object containing any into lines only.
    model = new TextEncoder().encode(new TextDecoder().decode(model).replace(/^l .*$/gm, ''));
  }
  await writeFile(join(dir, `model${ext}`), model);

  let refs: string[];
  if (ext === '.obj') {
    const mtl = files[src.model.replace(/\.obj$/, '.mtl')];
    if (!mtl) throw new Error(`${vehicle.id}: material file missing from the zip`);
    await writeFile(join(dir, 'model.mtl'), mtl);
    refs = [...new TextDecoder().decode(mtl).matchAll(/^\s*map_(?:Kd|d)\s+(.+\.png)\s*$/gm)].map((m) => m[1]);
  } else {
    refs = [...new TextDecoder().decode(model).matchAll(/<init_from>\s*(?:<ref>)?\s*([^<\s][^<]*?\.png)\s*</g)].map((m) => decodeURIComponent(m[1]));
  }

  // Paint jobs: every texture named after the default paint (`body_mr.png`) has variants for the other
  // drivers of the vehicle's class.
  const paints = new Set(CHARACTERS.map((c) => paintFor(c, vehicle)).filter((p): p is string => !!p && p !== DEFAULT_PAINT[vehicle.size]));
  /** Texture file -> the default-paint texture it replaces. */
  const images = new Map<string, string>();
  for (const img of refs) {
    images.set(img, img);
    for (const p of paints) {
      const variant = repaint(img, vehicle, p);
      if (variant) images.set(variant, img);
    }
  }
  let missing = 0;
  for (const [img, original] of images) {
    // A paint job that lacks this texture keeps the default one.
    let data = files[posix.join(folder, img)];
    if (!data && (data = files[posix.join(folder, original)])) missing++;
    if (!data) {
      console.warn(`  ${vehicle.id}: ${img} not found in zip`);
      continue;
    }
    await mkdir(dirname(join(dir, img)), { recursive: true });
    await writeFile(join(dir, img), data);
  }
  console.log(`${vehicle.id}: model${ext} + ${images.size} textures${missing ? ` (${missing} paint textures copied from the default)` : ''}`);
}
await finish();
