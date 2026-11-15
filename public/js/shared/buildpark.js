// The Build Park: an open spot near town with one of each of the newer things you can build
// (a rocket, a volcano, a fish tank, a merry-go-round, a wishing well and a rainbow), all
// working, each with a noticeboard saying what it's made of. Try them, then build your own
// (there's room, and the whole list is in the Build Book: E, then the Build Book tab).
import { WORLD, SIGN, makeBlock } from './blocks.js';

const B = { stone: 3, cobble: 4, log: 7, planks: 6, glass: 9, metal: 11, red: 14, yellow: 16, rainbow: 28, sky: 31, orange: 32, water: 36, lantern: 45, sidewalk: 24, flowers: 27 };

// Each one: what to put where (around the middle of a 3 by 3: [du, dy, dz, block]), and its sign.
export const PARK_BUILDS = [
  { title: '🚀 ROCKET', how: 'Metal Plate, Red Paint on all 4 sides', cells: [[0, 0, 0, B.metal], [1, 0, 0, B.red], [-1, 0, 0, B.red], [0, 0, 1, B.red], [0, 0, -1, B.red]] },
  { title: '🌋 VOLCANO', how: 'Orange Paint in the middle of 8 Stone', cells: [[0, 0, 0, B.orange], ...ring(B.stone)] },
  { title: '🐠 FISH TANK', how: 'Water with Glass on all 4 sides', cells: [[0, 0, 0, B.water], [1, 0, 0, B.glass], [-1, 0, 0, B.glass], [0, 0, 1, B.glass], [0, 0, -1, B.glass]] },
  { title: '🎠 MERRY-GO-ROUND', how: 'Rainbow in the middle of 8 Yellow Paint', cells: [[0, 0, 0, B.rainbow], ...ring(B.yellow)] },
  { title: '⭐ WISHING WELL', how: 'Water with Cobblestone on all 4 sides', cells: [[0, 0, 0, B.water], [1, 0, 0, B.cobble], [-1, 0, 0, B.cobble], [0, 0, 1, B.cobble], [0, 0, -1, B.cobble]] },
  { title: '🌈 RAINBOW', how: 'A Rainbow block on top of Sky Paint', cells: [[0, 0, 0, B.sky], [0, 1, 0, B.rainbow]] },
];

function ring(v) {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) out.push([dx, 0, dz, v]);
  return out;
}

const COLS = 3, CELL_W = 7, CELL_D = 8;
const W = COLS * CELL_W + 2, D = 2 * CELL_D + 6; // (room at the front for the big sign)

export function buildBuildPark({ get, set, canUse }) {
  const inWorld = (x, z) => x > WORLD.min + 2 && x < WORLD.max - 2 && z > WORLD.min + 2 && z < WORLD.max - 2;
  const open = (x0, z0) => {
    for (let x = x0; x < x0 + W; x++)
      for (let z = z0; z < z0 + D; z++) {
        if (!inWorld(x, z) || !canUse(x, z)) return false;
        for (let y = 0; y < 8; y++) if (get(x, y, z)) return false;
      }
    return true;
  };
  // The nearest open spot to town: round and round, farther and farther out.
  let spot = null;
  for (let r = 50; r <= 190 && !spot; r += 4) {
    const steps = Math.ceil((2 * Math.PI * r) / 6);
    for (let i = 0; i < steps && !spot; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x0 = Math.round(Math.cos(a) * r) - Math.floor(W / 2), z0 = Math.round(Math.sin(a) * r) - Math.floor(D / 2);
      if (open(x0, z0)) spot = [x0, z0];
    }
  }
  if (!spot) return null;
  const [x0, z0] = spot, signs = [];
  const put = (x, y, z, v) => {
    if (get(x, y, z)) return false;
    set(x, y, z, v);
    return true;
  };
  // A noticeboard: two posts (along x) with their signs on the +z side.
  const board = (x, z, title, how) => {
    for (const [dx, text] of [[0, title], [1, how]]) {
      put(x + dx, 0, z, B.log);
      put(x + dx, 1, z, B.planks);
      put(x + dx, 2, z, B.lantern);
      if (put(x + dx, 1, z + 1, makeBlock(SIGN, 0))) signs.push([x + dx, 1, z + 1, text]);
    }
  };
  // A path all the way round, and flowers at the corners.
  for (let x = x0; x < x0 + W; x++)
    for (let z = z0; z < z0 + D; z++) {
      const edge = x === x0 || x === x0 + W - 1 || z === z0 || z === z0 + D - 1;
      if (edge) put(x, 0, z, (x === x0 || x === x0 + W - 1) && (z === z0 || z === z0 + D - 1) ? B.flowers : B.sidewalk);
    }
  PARK_BUILDS.forEach((b, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const sx = x0 + 1 + col * CELL_W, sz = z0 + 1 + row * (CELL_D + 1);
    board(sx + 2, sz, b.title, b.how);
    const cx = sx + 3, cz = sz + 4;
    for (const [dx, dy, dz, v] of b.cells) put(cx + dx, dy, cz + dz, v);
  });
  // The big sign at the front (the +z side), facing whoever walks up.
  const fx = x0 + Math.floor(W / 2) - 1, fz = z0 + D - 3;
  board(fx, fz, '🧱 BUILD PARK', 'Try them! Then build your own. (Build Book: E)');
  return { signs, area: [x0, z0, x0 + W - 1, z0 + D - 1], place: { x: x0 + W / 2, y: 0, z: z0 + D / 2, area: [x0 + 1, z0 + 1, x0 + W - 2, z0 + D - 2], face: 0 } };
}
