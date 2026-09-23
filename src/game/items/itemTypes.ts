export type ItemKind = 'mushroom' | 'triple' | 'banana' | 'green' | 'red' | 'star';

export const ITEM_NAMES: Record<ItemKind, string> = {
  mushroom: 'Turbo Mushroom',
  triple: 'Triple Turbo',
  banana: 'Banana',
  green: 'Green Shell',
  red: 'Red Shell',
  star: 'Super Star',
};

/** Roulette weights by race position bucket (0 = leading … 3 = back of the pack). */
const TABLE: Record<ItemKind, number>[] = [
  { banana: 45, green: 38, mushroom: 12, red: 5, triple: 0, star: 0 },
  { banana: 18, green: 24, mushroom: 22, red: 26, triple: 8, star: 2 },
  { banana: 6, green: 12, mushroom: 22, red: 30, triple: 20, star: 10 },
  { banana: 0, green: 4, mushroom: 14, red: 27, triple: 32, star: 23 },
];

export function rollItem(position: number, racers: number): ItemKind {
  const frac = racers <= 1 ? 0 : (position - 1) / (racers - 1);
  const bucket = Math.min(3, Math.floor(frac * 4));
  const w = TABLE[bucket];
  let total = 0;
  for (const k in w) total += w[k as ItemKind];
  let r = Math.random() * total;
  for (const k in w) {
    r -= w[k as ItemKind];
    if (r <= 0) return k as ItemKind;
  }
  return 'mushroom';
}

export const ROULETTE_TIME = 1.6;
