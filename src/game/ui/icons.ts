import type { ItemKind } from '../items/itemTypes';

const mushroom = (x = 50, y = 50, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-14" y="2" width="28" height="26" rx="10" fill="#fff1d6" stroke="#2a1a12" stroke-width="4"/>
    <circle cx="-6" cy="14" r="3" fill="#2a1a12"/><circle cx="6" cy="14" r="3" fill="#2a1a12"/>
    <path d="M-34 6 C-34 -30 34 -30 34 6 Z" fill="#ff3b3b" stroke="#2a1a12" stroke-width="4"/>
    <circle cx="0" cy="-16" r="8" fill="#fff"/><circle cx="-20" cy="-4" r="6" fill="#fff"/><circle cx="20" cy="-4" r="6" fill="#fff"/>
  </g>`;

const shell = (color: string) => `
  <ellipse cx="50" cy="66" rx="36" ry="12" fill="#fff4d0" stroke="#2a1a12" stroke-width="4"/>
  <path d="M14 62 C14 18 86 18 86 62 Z" fill="${color}" stroke="#2a1a12" stroke-width="4"/>
  <path d="M50 30 L64 40 L60 56 L40 56 L36 40 Z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
  <rect x="12" y="58" width="76" height="8" rx="4" fill="#fff" stroke="#2a1a12" stroke-width="3"/>`;

export const ITEM_ICONS: Record<ItemKind, string> = {
  mushroom: mushroom(50, 56, 1.1),
  triple: mushroom(30, 64, 0.62) + mushroom(70, 64, 0.62) + mushroom(50, 38, 0.62),
  banana: `<path d="M22 22 C18 58 44 82 80 72 C84 70 84 64 78 64 C52 66 34 50 34 22 Z" fill="#ffe14d" stroke="#2a1a12" stroke-width="4" stroke-linejoin="round"/>
           <path d="M26 22 L30 12" stroke="#5a3a1a" stroke-width="6" stroke-linecap="round"/>`,
  green: shell('#2fd14a'),
  red: shell('#ff3040'),
  star: `<path d="M50 8 L61 36 L91 38 L68 57 L76 87 L50 70 L24 87 L32 57 L9 38 L39 36 Z" fill="#ffd21f" stroke="#2a1a12" stroke-width="4" stroke-linejoin="round"/>
         <rect x="40" y="40" width="6" height="14" rx="3" fill="#2a1a12"/><rect x="54" y="40" width="6" height="14" rx="3" fill="#2a1a12"/>`,
};

export function itemSvg(kind: ItemKind): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${ITEM_ICONS[kind]}</svg>`;
}
