// The town's residents: people who live in some of the houses (just inside the front door). Talk
// to them and they ask for a little help: take a package to a neighbor, bring them something, or
// go and see somewhere for them. See quests.js.
import { blockId, itemOf, blockMeta, shapeOf, isSolidBlock, DOOR_TOP } from './blocks.js';

export const RESIDENTS = [
  { id: -40, name: 'Grandma Rose', emoji: '👵', look: { face: 'smile', hair: 'buns', hat: 'none', shirt: 'dress', pants: 'skirt', skin: '#f5c9a0', hairColor: '#e8e8e8', shirtColor: '#ad1457', shirtColor2: '#f8bbd0', pantsColor: '#6a1b9a', shoesColor: '#3b2314' } },
  { id: -41, name: 'Grandpa Joe', emoji: '👴', look: { face: 'wink', hair: 'short', hat: 'cap', shirt: 'striped', pants: 'jeans', skin: '#e8b088', hairColor: '#e8e8e8', hatColor: '#3949ab', shirtColor: '#5d4037', shirtColor2: '#d7a86e', pantsColor: '#424242', shoesColor: '#111111' } },
  { id: -42, name: 'Lily', emoji: '👧', look: { face: 'grin', hair: 'ponytail', hat: 'none', shirt: 'tshirt', pants: 'shorts', skin: '#8d5a34', hairColor: '#1b1209', shirtColor: '#fdd835', shirtColor2: '#ffffff', pantsColor: '#1e88e5', shoesColor: '#ec407a' } },
  { id: -43, name: 'Sam the Baker', emoji: '🧑‍🍳', look: { face: 'smile', hair: 'short', hat: 'tophat', shirt: 'jacket', pants: 'jeans', skin: '#d39a6a', hairColor: '#3b2314', hatColor: '#ffffff', shirtColor: '#ffffff', shirtColor2: '#8d6e63', pantsColor: '#5d4037', shoesColor: '#111111' } },
  { id: -44, name: 'Dr. Maya', emoji: '👩‍⚕️', look: { face: 'cool', hair: 'long', hat: 'none', shirt: 'jacket', pants: 'jeans', skin: '#b07548', hairColor: '#1b1209', shirtColor: '#ffffff', shirtColor2: '#26c6da', pantsColor: '#3949ab', shoesColor: '#111111' } },
  { id: -45, name: 'Captain Leo', emoji: '🧑‍✈️', look: { face: 'surprised', hair: 'spiky', hat: 'cap', shirt: 'hoodie', pants: 'sweatpants', skin: '#ffe0c4', hairColor: '#d9a441', hatColor: '#1d1f24', shirtColor: '#1e88e5', shirtColor2: '#fdd835', pantsColor: '#424242', shoesColor: '#ffffff' } },
];

// Houses for them: front doors in town (not on anybody's land) with a room behind them. Returns
// up to `count` places, a good way apart, nearest the middle of town first.
export function findHomes({ each, get, canUse, count = RESIDENTS.length }) {
  const solid = (x, y, z) => isSolidBlock(get(x, y, z));
  const roofed = (x, z) => {
    for (let y = 2; y <= 4; y++) if (solid(x, y, z)) return true;
    return false;
  };
  const found = [];
  each((x, y, z, v) => {
    if (y !== 0 || blockId(itemOf(v)) !== 21 || blockMeta(itemOf(v)) & DOOR_TOP || Math.abs(x) > 75 || Math.abs(z) > 75) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // Inside: two steps in, room to stand, and a roof (not too high: a house, not a tower).
      const ix = x + dx * 2, iz = z + dz * 2;
      if (solid(x + dx, 0, z + dz) || solid(x + dx, 1, z + dz) || solid(ix, 0, iz) || solid(ix, 1, iz)) continue;
      if (!roofed(x + dx, z + dz) || !roofed(ix, iz) || roofed(x - dx, z - dz)) continue;
      if (shapeOf(get(ix, 0, iz)) === 'door' || !canUse(ix, iz) || !canUse(x, z)) continue;
      found.push({ x: ix + 0.5, y: 0, z: iz + 0.5, face: Math.atan2(dx, dz), door: [x, z] });
      break;
    }
  });
  found.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const homes = [];
  for (const h of found) {
    if (Math.hypot(h.x, h.z) < 14) continue; // (not right on the town square)
    if (homes.some(o => Math.hypot(o.x - h.x, o.z - h.z) < 16)) continue;
    homes.push({ ...h, area: [Math.floor(h.x) - 1, Math.floor(h.z) - 1, Math.floor(h.x) + 1, Math.floor(h.z) + 1] });
    if (homes.length >= count) break;
  }
  return homes;
}
