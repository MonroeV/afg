// The outer lands (since v0.44, when the world grew from 640 x 640 to 1280 x 1280): all the new
// land round the outside of the old world. A big ring road, the Outer Loop, goes all the way
// round, with roads out to it from the town's roads (east past the quarry, west past the farm,
// north through the snowy woods). The bay at Sunny Shores carries on south to a far beach.
// Trees and meadows, but plenty of open land along the Outer Loop for the new places that go
// there (each finds its own spot along it: see ringRoads).
//
// Saved worlds get all this too (upgradeTo17): it only ever goes onto empty land nobody owns,
// and the old world's things are never touched.
import { WORLD, OLD_WORLD, SIGN, SNOW_LINE, makeBlock } from './blocks.js';
import { makeRoads, rng, tree, pine, FAR_ROADS } from './frontier.js';
import { seaShore, QUARRY } from './farcountry.js';

const B = { grass: 1, planks: 6, log: 7, sand: 10, flowers: 27, water: 36, lantern: 45, road: 22, sidewalk: 24 };
export const RING = 440; // the Outer Loop runs round at this distance from the middle (each way)
export const SEA_END = 400; // the far shore of the bay (south)
const SX = FAR_ROADS.south; // the bay's middle (the road south to the campground)
const BAY = [SX - 140, SX + 140];
// The roads out to the Outer Loop: [axis, the line it runs along, from, to].
const SPOKE_NORTH_X = -100, SPOKE_EAST_Z = -60, SPOKE_EAST_FROM = 230;

// The Outer Loop's four sides, as roads for finding building spots along (see makeSite in
// worldgen.js): { axis, c, from, to }.
export function ringRoads() {
  const end = RING - 8;
  return {
    loopN: { axis: 'x', c: -RING, from: -end, to: end },
    loopS: { axis: 'x', c: RING, from: -end, to: end },
    loopW: { axis: 'z', c: -RING, from: -end, to: end },
    loopE: { axis: 'z', c: RING, from: -end, to: end },
  };
}

// Is (x, z) out in the outer lands (past the old edge of the world)?
export const isOuter = (x, z) => x < OLD_WORLD.min || x > OLD_WORLD.max || z < OLD_WORLD.min || z > OLD_WORLD.max;

// get(x, y, z) reads the world, set(x, y, z, v) writes it, canUse(x, z) says whether a column of
// land may be built on, canPave(x, z) whether a sidewalk may become road (where roads meet).
// Returns the signs' words and the areas used.
export function buildOuterLands({ get, set, canUse, canPave = canUse }) {
  const rand = rng(4404);
  const inWorld = (x, z) => x >= WORLD.min && x <= WORLD.max && z >= WORLD.min && z <= WORLD.max;
  let count = 0;
  const put = (x, y, z, v) => {
    if (!v || !inWorld(x, z) || y < 0 || y > WORLD.maxY || !canUse(x, z) || get(x, y, z)) return false;
    set(x, y, z, v);
    count++;
    return true;
  };
  const used = new Set(), areas = [], signs = [];
  const mark = (x0, z0, x1, z1) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) used.add(`${x},${z}`);
  };
  const area = (x0, z0, x1, z1) => {
    areas.push([x0, z0, x1, z1]);
    mark(x0, z0, x1, z1);
  };
  const free = (x, z, r) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (used.has(`${x + dx},${z + dz}`)) return false;
    return true;
  };
  const clearAt = (x, z, h = 3, r = 0) => {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (!inWorld(x + dx, z + dz) || !canUse(x + dx, z + dz)) return false;
        for (let y = 0; y < h; y++) if (get(x + dx, y, z + dz)) return false;
      }
    return true;
  };
  const sign = (x, y, z, facing, text) => {
    if (put(x, y, z, makeBlock(SIGN, facing))) signs.push([x, y, z, text]);
  };
  // A noticeboard post (log, planks, a lantern on top), with a sign on its (sx, sz) side.
  const board = (x, z, sx, sz, text) => {
    put(x, 0, z, B.log);
    put(x, 1, z, B.planks);
    put(x, 2, z, B.lantern);
    sign(x + sx, 1, z + sz, sz > 0 ? 0 : sx > 0 ? 1 : sz < 0 ? 2 : 3, text);
  };
  const { road, corridor } = makeRoads({ get, set, put, canUse, canPave, inWorld, area });

  // ---------- The bay, on south to a far shore ----------

  for (let x = BAY[0]; x <= BAY[1]; x++) {
    for (let z = Math.max(seaShore(x), OLD_WORLD.max + 1); z <= SEA_END; z++) put(x, 0, z, B.water);
    for (let z = SEA_END + 1; z <= SEA_END + 7 + ((x * 7) % 3 === 0 ? 1 : 0); z++) put(x, 0, z, B.sand);
  }
  area(BAY[0], OLD_WORLD.max + 1, BAY[1], SEA_END + 8);
  // Palm trees along the far shore.
  for (let x = BAY[0] + 8; x <= BAY[1] - 8; x += 19) {
    const z = SEA_END + 5;
    if (!clearAt(x, z, 6)) continue;
    for (let y = 0; y < 5; y++) put(x, y + 1, z, B.log);
    put(x, 6, z, 8);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      put(x + dx, 6, z + dz, 8);
      put(x + dx * 2, 5, z + dz * 2, 8);
    }
  }

  // ---------- The Outer Loop, and the roads out to it ----------

  road('x', -RING, -RING - 3, RING + 3);
  road('x', RING, -RING - 3, RING + 3);
  road('z', -RING, -RING + 4, RING - 4);
  road('z', RING, -RING + 4, RING - 4);
  // West: on from the farm, along the same line.
  road('x', FAR_ROADS.west, -RING + 4, OLD_WORLD.min + 18);
  // East: off the quarry road before the quarry, round the north of it, and on out.
  const eastZ = corridor('x', SPOKE_EAST_FROM, RING - 4, [SPOKE_EAST_Z, SPOKE_EAST_Z - 4, SPOKE_EAST_Z + 4, SPOKE_EAST_Z - 8]);
  road('z', SPOKE_EAST_FROM, Math.min(eastZ, QUARRY.z) - 3, Math.max(eastZ, QUARRY.z) + 3);
  road('x', eastZ, SPOKE_EAST_FROM - 3, RING - 4);
  // North: off the road west to the woods, up through the snowy pine forest.
  const northX = corridor('z', -RING + 4, FAR_ROADS.west - 4, [SPOKE_NORTH_X, SPOKE_NORTH_X - 4, SPOKE_NORTH_X + 4, SPOKE_NORTH_X - 8, SPOKE_NORTH_X + 8]);
  road('z', northX, -RING + 4, FAR_ROADS.west - 4);
  // Signs where the roads meet the Outer Loop.
  for (const [x, z, sx, sz] of [[-RING + 5, FAR_ROADS.west + 5, 1, 0], [RING - 5, eastZ + 5, -1, 0], [northX + 5, -RING + 5, 0, 1]]) board(x, z, sx, sz, '🗺️ THE OUTER LOOP: all the way round!');

  // ---------- Countryside ----------

  // Keep clear of the Outer Loop (the new places go along it) and of the roads.
  const nearLoop = (x, z) => Math.abs(Math.abs(x) - RING) < 30 && Math.abs(z) < RING + 30 || Math.abs(Math.abs(z) - RING) < 30 && Math.abs(x) < RING + 30;
  let trees = 0, tries = 0;
  while (trees < 420 && tries++ < 20000) {
    const x = WORLD.min + 6 + Math.floor(rand() * (WORLD.max - WORLD.min - 12)), z = WORLD.min + 6 + Math.floor(rand() * (WORLD.max - WORLD.min - 12));
    if (!isOuter(x, z) || nearLoop(x, z) || !free(x, z, 3) || !clearAt(x, z, 9, 1)) continue;
    if (x >= BAY[0] - 4 && x <= BAY[1] + 4 && z <= SEA_END + 10) continue; // (not in the bay)
    if (z < SNOW_LINE) pine(put, x, z, 0, 5 + Math.floor(rand() * 4));
    else tree(put, x, z, 4 + Math.floor(rand() * 3), rand);
    mark(x - 1, z - 1, x + 1, z + 1);
    trees++;
  }
  // Wildflower meadows (not up in the snow).
  for (let i = 0; i < 26; i++) {
    const cx = WORLD.min + 20 + Math.floor(rand() * (WORLD.max - WORLD.min - 40)), cz = SNOW_LINE + 20 + Math.floor(rand() * (WORLD.max - SNOW_LINE - 40));
    if (!isOuter(cx, cz) || nearLoop(cx, cz)) continue;
    for (let n = 0; n < 40; n++) {
      const x = cx + Math.floor((rand() - 0.5) * 16), z = cz + Math.floor((rand() - 0.5) * 16);
      if (isOuter(x, z) && free(x, z, 0) && !(x >= BAY[0] && x <= BAY[1] && z <= SEA_END + 8)) put(x, 0, z, B.flowers);
    }
  }
  return { signs, areas, count, loop: { northX, eastZ } };
}

