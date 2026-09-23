/**
 * Downloads the driver models from The Models Resource (https://models.spriters-resource.com/)
 * into public/characters/<id>/.
 *
 * Each character folder gets `model.dae` or `model.obj` (+ `model.mtl`) plus the diffuse textures it uses.
 * Run with: npm run fetch-characters
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { unzipSync } from 'fflate';

const SITE = 'https://models.spriters-resource.com';
const OUT = join(import.meta.dirname, '..', 'public', 'characters');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MKWII = '/wii/mkwii/asset';

/** Character id (matches characters.ts) -> asset page and the model file inside its zip. */
const SOURCES: { id: string; page: string; model: string }[] = [
  { id: 'toad', page: `${MKWII}/285395/`, model: 'Toad/model.dae' },
  { id: 'drybones', page: `${MKWII}/285318/`, model: 'Dry Bones/model.dae' },
  { id: 'mario', page: `${MKWII}/302593/`, model: 'Mario/model.dae' },
  { id: 'peach', page: `${MKWII}/302597/`, model: 'Peach/model (kart).dae' },
  { id: 'yoshi', page: `${MKWII}/285316/`, model: 'Yoshi/model.dae' },
  { id: 'dk', page: `${MKWII}/302596/`, model: 'Donkey Kong/model.dae' },
  // kp_fix.dae uses pre-mirrored eye textures (the plain kp.dae shows a single eye).
  { id: 'bowser', page: `${MKWII}/341987/`, model: 'Bowser/kp_fix.dae' },
  { id: 'kingboo', page: `${MKWII}/285315/`, model: 'King Boo/model.dae' },
  // Shy Guy isn't a Mario Kart Wii racer; Super Mario Party has the most detailed model. The "(Raw)" file
  // in the same zip only adds a duplicate outline shell.
  { id: 'shyguy', page: '/nintendo_switch/supermarioparty/asset/311143/', model: 'Shy Guy/Shy Guy.dae' },
  // Guests: the most detailed version of each character on the site.
  { id: 'bart', page: '/playstation_3/thesimpsonsgame/asset/322057/', model: 'Bart Simpson/bart.obj' },
  { id: 'lemming', page: '/playstation_vita/lemmingstouch/asset/575930/', model: 'Lemming/lemming_Body_mesh.obj' },
  { id: 'sackboy', page: '/playstation_3/littlebigplanet/asset/289909/', model: 'sack_boy.dae' },
  { id: 'gromit', page: '/mobile/wallacegromitthebigfixup/asset/463893/', model: 'Gromit/Gromit.dae' },
  { id: 'wallace', page: '/mobile/wallacegromitthebigfixup/asset/325042/', model: 'Wallace/Wallace.dae' },
  { id: 'cartman', page: '/pc_computer/southparksnowday/asset/357376/', model: 'Cartman.dae' },
  { id: 'brian', page: '/pc_computer/familyguybacktothemultiverse/asset/332187/', model: 'Brian Griffin (BTTM)/brian.obj' },
  { id: 'peter', page: '/mobile/warpedkartracers/asset/333850/', model: 'Peter Griffin/P_DRIVER_FG_Peter.dae' },
  { id: 'homer', page: '/playstation_3/thesimpsonsgame/asset/322060/', model: 'Homer Simpson/homer.obj' },
];

/** Textures the toon-shaded game doesn't use: Wii lightmaps, normal/bump, specular, mask and AO maps. */
const UNUSED = /^lm_\d\.png$|bump|normal|_norm|_nml|_rgh|spec|mask|dirt/i;

async function download(path: string): Promise<Uint8Array> {
  const page = SITE + path;
  const res = await fetch(page, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
  const html = await res.text();
  const file = /data-file="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
  if (!file) throw new Error(`${page}: no download link found`);
  // The media server only serves the zip to a browser session that has visited the asset page.
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const zip = await fetch(SITE + file, { headers: { 'User-Agent': UA, Referer: page, Cookie: cookie } });
  const data = new Uint8Array(await zip.arrayBuffer());
  if (!zip.ok || data[0] !== 0x50 || data[1] !== 0x4b) throw new Error(`${page}: download was not a zip file`);
  return data;
}

for (const src of SOURCES) {
  const files = unzipSync(await download(src.page));
  let model = files[src.model];
  if (!model) throw new Error(`${src.id}: ${src.model} is missing from the zip`);
  const dir = join(OUT, src.id);
  await mkdir(dir, { recursive: true });
  const folder = posix.dirname(src.model);
  const ext = posix.extname(src.model);
  if (ext === '.obj') {
    // Drop stray line elements (`l a b`): three's OBJLoader turns an object containing any into lines only.
    model = new TextEncoder().encode(new TextDecoder().decode(model).replace(/^l .*$/gm, ''));
  } else if (ext === '.dae') {
    // Drop facial morph targets (blend shapes): the game only uses the base mesh, and they're most of the file for Sackboy and Peter.
    const text = new TextDecoder()
      .decode(model)
      .replace(/<controller [^>]*>\s*<morph [\s\S]*?<\/controller>/g, '')
      .replace(/<geometry id="[^"]*_morph_[^"]*"[\s\S]*?<\/geometry>/g, '');
    model = new TextEncoder().encode(text);
  }
  await writeFile(join(dir, `model${ext}`), model);

  // Collect the images the model references: COLLADA `<init_from>x.png` (or 1.5's `<init_from><ref>x.png`),
  // or an OBJ's material file `map_Kd x.png`.
  let refs: string[];
  if (ext === '.obj') {
    const mtl = files[src.model.replace(/\.obj$/, '.mtl')];
    if (!mtl) throw new Error(`${src.id}: material file missing from the zip`);
    await writeFile(join(dir, 'model.mtl'), mtl);
    refs = [...new TextDecoder().decode(mtl).matchAll(/^\s*map_Kd\s+(.+\.png)\s*$/gm)].map((m) => m[1]);
  } else {
    refs = [...new TextDecoder().decode(model).matchAll(/<init_from>\s*(?:<ref>)?\s*([^<\s]+\.png)/g)].map((m) => m[1]);
  }
  const images = new Set(refs.filter((f) => !UNUSED.test(f)));
  for (const img of images) {
    const data = files[posix.join(folder, img)];
    if (data) {
      await mkdir(dirname(join(dir, img)), { recursive: true }); // some textures live in a subfolder
      await writeFile(join(dir, img), data);
    } else console.warn(`  ${src.id}: ${img} not found in zip`);
  }
  console.log(`${src.id}: model${ext} + ${images.size} textures`);
}
