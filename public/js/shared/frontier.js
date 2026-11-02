// The country beyond the towns (it came with the bigger map). Up north, past the snow line: a
// ski resort with a snowy mountain, a long ski run, a ski lift up to the top, a cozy log lodge,
// an ice rink, pine trees and snowmen. Out west: the woods, with log cabins, a big lake (with a
// dock and boats) and a rocky mountain with a snowy top. And in town, the Pizza Palace, where
// you can get a job delivering pizzas. Roads lead out to all of it.
//
// Everything here only ever goes onto empty land that nobody has claimed, so in a saved world
// nothing anyone built is touched. (The mountains are solid, but the game doesn't draw blocks
// buried inside other blocks, so they cost about as much to draw as their surface.)
import { WORLD, DOOR_TOP, BED_FOOT, makeBlock, stack } from './blocks.js';
import { exitRoads, makeSite, siteFree } from './worldgen.js';

const B = {
  grass: 1, dirt: 2, stone: 3, cobble: 4, brick: 5, planks: 6, log: 7, leaves: 8, glass: 9, sand: 10,
  concrete: 13, red: 14, yellow: 16, black: 17, tiles: 20, door: 21, road: 22, line: 23, sidewalk: 24,
  floor: 25, roof: 26, flowers: 27, carpet: 35, water: 36, gold: 38, ceilingLight: 41, chandelier: 42,
  candle: 43, lantern: 45, tikiTorch: 48, partyLights: 49, neonPink: 50, lineX: 55, chair: 60, couch: 61,
  table: 62, bookshelf: 63, bed: 64, painting: 65, flowerPot: 67, teddy: 68, desk: 73,
  snow: 87, ice: 88, pine: 89, skiLift: 90, snowman: 91, oven: 92,
};

// Which way furniture faces (meta bits 0-1) to look along a world direction.
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
// The meta for a picture hanging on a wall that's in direction (wx, wz) from its cell.
const onWall = (wx, wz) => faceDir(-wx, -wz);

// The ski mountain: its peak, and the ski run down its south side.
export const SKI = { px: -10, pz: -196, peak: 27, radius: 30, runTop: -190, runLength: 50, runHalf: 8, runHeight: 24 };
const LODGE = { x0: -42, z0: -158, L: 17, D: 12 };
const RINK = { x0: -66, z0: -162, x1: -52, z1: -152 };
const LAKE = { cx: -183, cz: 75, W: 54, D: 40 };
const ROCKY = { cx: -186, cz: 170, radius: 24, peak: 18 };
const CABINS = [[-169, -98], [-169, -64], [-169, -30], [-169, 4]];
const WOODS_ROAD_X = -152;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gentle bumps, the same every time (so the mountains always come out the same shape).
const bumps = (x, z) => Math.sin(x * 0.21 + z * 0.13) * 0.6 + Math.sin(x * 0.07 - z * 0.17) * 0.8 + Math.cos(z * 0.31 + x * 0.05) * 0.4;

// How high the ski mountain is at (x, z).
export function skiHeight(x, z) {
  const d = Math.hypot(x - SKI.px, z - SKI.pz);
  const cone = SKI.peak * Math.max(0, 1 - d / SKI.radius) ** 1.1 + (d < SKI.radius ? bumps(x, z) : 0);
  const t = (z - SKI.runTop) / SKI.runLength; // 0 at the top of the run, 1 at the bottom
  let run = 0;
  if (t >= -0.15 && t <= 1) run = SKI.runHeight * (1 - Math.max(0, t)) - Math.max(0, Math.abs(x - SKI.px) - SKI.runHalf) * 1.3;
  return Math.max(0, Math.round(Math.max(cone, run)));
}

function rockyHeight(x, z) {
  const d = Math.hypot(x - ROCKY.cx, (z - ROCKY.cz) * 1.15);
  if (d >= ROCKY.radius) return 0;
  return Math.max(0, Math.round(ROCKY.peak * (1 - d / ROCKY.radius) ** 1.2 + bumps(x * 1.3, z * 1.3) * 1.2));
}

// get(x, y, z) reads the world, set(x, y, z, v) writes it, canUse(x, z) says whether a column
// of land may be built on, and canPave(x, z) whether a plain sidewalk there may become road (where
// a new road joins an old one). Returns the parked vehicles to add, the place the lodge's
// coach works, permanent claims and the areas used.
export function buildFrontier({ get, set, canUse, canPave = canUse }) {
  const rand = rng(8080);
  const inWorld = (x, z) => x >= WORLD.min + 1 && x <= WORLD.max - 1 && z >= WORLD.min + 1 && z <= WORLD.max - 1;
  let count = 0;
  // Only ever into an empty spot on land nobody has claimed.
  const put = (x, y, z, v) => {
    if (!v || !inWorld(x, z) || y < 0 || y > WORLD.maxY || !canUse(x, z) || get(x, y, z)) return false;
    set(x, y, z, v);
    count++;
    return true;
  };
  const fill = (x0, y0, z0, x1, y1, z1, v) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) put(x, y, z, v);
  };
  const clearAt = (x, z, h = 3) => {
    if (!inWorld(x, z) || !canUse(x, z)) return false;
    for (let y = 0; y < h; y++) if (get(x, y, z)) return false;
    return true;
  };
  const used = new Set();
  const areas = [], cars = [], claims = [];
  const mark = (x0, z0, x1, z1) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) used.add(`${x},${z}`);
  };
  const area = (x0, z0, x1, z1) => {
    areas.push([x0, z0, x1, z1]);
    mark(x0, z0, x1, z1);
  };
  const free = (x, z, r = 2) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (used.has(`${x + dx},${z + dz}`)) return false;
    return true;
  };

  // ---------- Roads ----------

  // A road 7 wide (sidewalks on the edges, a dashed line down the middle), with lanterns.
  // Where it meets another road's sidewalk, the sidewalk becomes road so cars drive straight on.
  const road = (axis, c, from, to) => {
    for (let a = from; a <= to; a++) {
      for (let o = -3; o <= 3; o++) {
        const [x, z] = axis === 'x' ? [a, c + o] : [c + o, a];
        const edge = Math.abs(o) === 3;
        if (!edge && inWorld(x, z) && canPave(x, z) && get(x, 0, z) === B.sidewalk) {
          set(x, 0, z, B.road);
          continue;
        }
        if (!inWorld(x, z) || !canUse(x, z)) continue;
        let v = edge ? B.sidewalk : B.road;
        if (o === 0 && ((a % 6) + 6) % 6 < 3) v = axis === 'x' ? B.lineX : B.line;
        if (edge && ((a % 16) + 16) % 16 === 0) v = stack(B.lantern, B.sidewalk);
        put(x, 0, z, v);
      }
    }
    const [x0, z0, x1, z1] = axis === 'x' ? [from, c - 3, to, c + 3] : [c - 3, from, c + 3, to];
    area(x0, z0, x1, z1);
  };
  // Of a few places a road could go, the one with the least in the way (only matters in a saved
  // world, where people might have built things; nothing is ever knocked down for a road).
  const corridor = (axis, from, to, choices) => {
    let best = choices[0], bestBad = Infinity;
    for (const c of choices) {
      let bad = 0;
      for (let a = from; a <= to; a++)
        for (let o = -3; o <= 3; o++) {
          const [x, z] = axis === 'x' ? [a, c + o] : [c + o, a];
          if (!canUse(x, z)) bad += 50;
          else for (let y = 0; y < 3; y++) if (get(x, y, z) && get(x, y, z) !== B.sidewalk) bad += y ? 1 : 10;
        }
      if (bad < bestBad) [best, bestBad] = [c, bad];
    }
    return best;
  };

  // North to the ski resort, from the ring road.
  const northX = corridor('z', -142, -88, [-32, -36, -28, -40, -24, -44]);
  road('z', northX, -142, -87);
  // West to the woods, carrying on from the road out of town, then along the edge of the woods
  // from the cabins down to the lake.
  const westZ = corridor('x', -152, -88, [-12, -16, -8, -20, -4]);
  road('x', westZ, -149, -87);
  road('z', WOODS_ROAD_X, -112, 46);

  // ---------- The ski resort ----------

  // The mountain: snow on top, rock inside.
  const { px, pz, radius } = SKI;
  for (let x = px - radius - 1; x <= px + radius + 1; x++)
    for (let z = pz - radius - 1; z <= SKI.runTop + SKI.runLength + 1; z++) {
      const h = skiHeight(x, z);
      for (let y = 0; y < h; y++) put(x, y, z, y === h - 1 ? B.snow : B.stone);
    }
  area(px - radius - 1, pz - radius - 1, px + radius + 1, SKI.runTop + SKI.runLength + 2);

  // The ski lift: a chair at the bottom and one at the top (right-click to ride between them),
  // with poles holding up the cable.
  const base = [px + 13, -141], top = [px + 12, -184];
  const topY = skiHeight(top[0], top[1]);
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const x = top[0] + dx, z = top[1] + dz;
      for (let y = skiHeight(x, z); y < topY; y++) put(x, y, z, B.snow); // a flat landing at the top
    }
  const up = faceDir(0, -1), down = faceDir(0, 1); // the chairs face the way they go
  put(base[0], 0, base[1], makeBlock(B.skiLift, up));
  put(top[0], topY, top[1], makeBlock(B.skiLift, down));
  put(base[0] + 2, 0, base[1] + 1, B.lantern);
  put(top[0] + 2, topY, top[1], B.lantern);
  for (const k of [0.28, 0.55, 0.8]) {
    const x = Math.round(base[0] + (top[0] - base[0]) * k), z = Math.round(base[1] + (top[1] - base[1]) * k);
    const g = skiHeight(x, z);
    fill(x, g, z, x, g + 3, z, B.black);
  }
  claims.push({ owner: 'Ski Resort', key: 'ski resort', x0: base[0] - 2, z0: base[1] - 2, x1: base[0] + 2, z1: base[1] + 2, createdAt: 0, permanent: true });
  claims.push({ owner: 'Ski Resort', key: 'ski resort', x0: top[0] - 2, z0: top[1] - 2, x1: top[0] + 2, z1: top[1] + 2, createdAt: 0, permanent: true });
  // A snowman waiting at the top.
  put(top[0] - 2, topY, top[1] + 1, makeBlock(B.snowman, down));

  // The lodge: log walls, big windows, a snowy roof, double doors onto a little plaza where the
  // road ends. Inside: a crackling fireplace with couches round it, a hot cocoa bar, tables.
  const lodge = buildLodge(put, fill, LODGE);
  area(LODGE.x0 - 1, LODGE.z0 - 1, LODGE.x0 + LODGE.L, LODGE.z0 + LODGE.D + 5);
  for (let x = Math.min(LODGE.x0, northX - 3); x <= Math.max(LODGE.x0 + LODGE.L - 1, northX + 3); x++)
    for (let z = LODGE.z0 + LODGE.D; z <= LODGE.z0 + LODGE.D + 4; z++) put(x, 0, z, B.sidewalk);
  claims.push({ owner: 'Ski Lodge', key: 'ski lodge', x0: LODGE.x0, z0: LODGE.z0, x1: LODGE.x0 + LODGE.L - 1, z1: LODGE.z0 + LODGE.D - 1, createdAt: 0, permanent: true });
  cars.push({ kind: 'monster', color: '#1e88e5', x: northX + 8.5, y: 0, z: LODGE.z0 + LODGE.D + 2.5, h: Math.PI / 2, landmark: true });

  // The ice rink, with lanterns at the corners.
  fill(RINK.x0, 0, RINK.z0, RINK.x1, 0, RINK.z1, B.ice);
  for (const [x, z] of [[RINK.x0, RINK.z0], [RINK.x1, RINK.z0], [RINK.x0, RINK.z1], [RINK.x1, RINK.z1]]) put(x, 1, z, B.lantern);
  area(RINK.x0 - 1, RINK.z0 - 1, RINK.x1 + 1, RINK.z1 + 1);

  // Snowmen, and pine trees all over the snowy country (some up on the mountain).
  for (const [x, z, f] of [[-22, -143, 0], [-47, -149, 1], [-58, -149, 0], [6, -146, 3], [-70, -170, 0], [24, -160, 3]]) {
    if (free(x, z, 0) && clearAt(x, z)) put(x, 0, z, makeBlock(B.snowman, f));
  }
  const runSide = (x, z) => Math.abs(x - px) <= SKI.runHalf + 4 && z >= SKI.runTop - 4;
  const liftSide = (x, z) => {
    const t = Math.max(0, Math.min(1, (z - base[1]) / (top[1] - base[1])));
    return Math.abs(x - (base[0] + (top[0] - base[0]) * t)) < 4 && z <= base[1] + 3 && z >= top[1] - 3;
  };
  let pines = 0, tries = 0;
  while (pines < 70 && tries++ < 3000) {
    const x = Math.floor(rand() * 440) - 220, z = WORLD.min + 3 + Math.floor(rand() * 80);
    const g = skiHeight(x, z);
    if (g > 14 || runSide(x, z) || liftSide(x, z)) continue;
    if (g === 0 && (!free(x, z, 3) || !clearAt(x, z, 8))) continue;
    if (g > 0 && get(x, g, z)) continue;
    pine(put, x, z, g, 5 + Math.floor(rand() * 3));
    mark(x - 1, z - 1, x + 1, z + 1);
    pines++;
  }

  // ---------- The woods ----------

  for (const [x0, z0] of CABINS) {
    if (!cabinFree(x0, z0, clearAt)) continue;
    buildCabin(put, fill, x0, z0, rand);
    area(x0 - 1, z0 - 1, WOODS_ROAD_X - 4, z0 + 8); // (anyone can move in: claim one with the Land Flag!)
  }

  // The big lake: sandy shores, flowers, a dock with lanterns, and boats.
  const { cx, cz, W, D } = LAKE;
  const inLake = (x, z, grow = 0) => ((x + 0.5 - cx) / (W / 2 - 0.5 + grow)) ** 2 + ((z + 0.5 - cz) / (D / 2 - 0.5 + grow)) ** 2 <= 1;
  for (let x = cx - W / 2 - 3; x <= cx + W / 2 + 3; x++)
    for (let z = cz - D / 2 - 3; z <= cz + D / 2 + 3; z++) {
      if (inLake(x, z)) put(x, 0, z, B.water);
      else if (inLake(x, z, 2.2)) put(x, 0, z, B.sand);
      else if (inLake(x, z, 3.5) && (x * 7 + z * 3) % 5 === 0) put(x, 0, z, B.flowers);
    }
  area(cx - W / 2 - 3, cz - D / 2 - 3, cx + W / 2 + 3, cz + D / 2 + 3);
  // The dock goes out from the east shore, toward where the woods road ends.
  const shore = cx + W / 2;
  for (let x = shore - 9; x <= shore + 2; x++)
    for (const z of [cz, cz + 1]) {
      if (get(x, 0, z) === B.water || get(x, 0, z) === B.sand) set(x, 0, z, B.planks);
      else put(x, 0, z, B.planks);
    }
  put(shore - 9, 1, cz, B.lantern);
  put(shore - 9, 1, cz + 1, B.lantern);
  [[shore - 5.5, cz - 1.6, '#f5f5f5'], [shore - 5.5, cz + 3.6, '#43a047'], [shore - 13, cz + 0.5, '#ff7043']].forEach(([x, z, color]) =>
    cars.push({ kind: 'boat', color, x, y: 0, z, h: Math.PI / 2, landmark: true }));
  // A wooden path from the end of the woods road down to the dock, with torches.
  for (let z = 47; z <= cz + 1; z++) for (const x of [WOODS_ROAD_X - 1, WOODS_ROAD_X, WOODS_ROAD_X + 1]) put(x, 0, z, B.floor);
  for (let x = shore + 3; x < WOODS_ROAD_X - 1; x++) for (const z of [cz, cz + 1]) put(x, 0, z, B.floor);
  for (let z = 52; z < cz; z += 8) put(WOODS_ROAD_X + 2, 0, z, B.tikiTorch);
  area(WOODS_ROAD_X - 1, 47, WOODS_ROAD_X + 2, cz + 1);

  // The rocky mountain: grass low down, bare rock higher up, and a snowy top.
  for (let x = ROCKY.cx - ROCKY.radius; x <= ROCKY.cx + ROCKY.radius; x++)
    for (let z = ROCKY.cz - ROCKY.radius; z <= ROCKY.cz + ROCKY.radius; z++) {
      const h = rockyHeight(x, z);
      for (let y = 0; y < h; y++) {
        const surface = y === h - 1;
        const v = surface ? (h > 14 ? B.snow : h > 7 ? (bumps(x * 3, z * 3) > 0.9 ? B.cobble : B.stone) : B.grass) : y > h - 3 && h <= 7 ? B.dirt : B.stone;
        put(x, y, z, v);
      }
    }
  area(ROCKY.cx - ROCKY.radius, ROCKY.cz - ROCKY.radius, ROCKY.cx + ROCKY.radius, ROCKY.cz + ROCKY.radius);

  // Trees everywhere in the woods.
  let trees = 0;
  tries = 0;
  while (trees < 75 && tries++ < 4000) {
    const x = WORLD.min + 3 + Math.floor(rand() * 64), z = -118 + Math.floor(rand() * 170);
    if (!free(x, z, 2) || !clearAt(x, z, 9)) continue;
    tree(put, x, z, 4 + Math.floor(rand() * 3), rand);
    mark(x - 1, z - 1, x + 1, z + 1);
    trees++;
  }
  // Some trees and flowers dotted about the open country to the east and south (lots of room
  // left there for building).
  trees = 0;
  tries = 0;
  while (trees < 55 && tries++ < 4000) {
    const east = rand() < 0.5;
    const x = east ? 134 + Math.floor(rand() * 86) : -130 + Math.floor(rand() * 260);
    const z = east ? -130 + Math.floor(rand() * 350) : 134 + Math.floor(rand() * 86);
    if (!free(x, z, 3) || !clearAt(x, z, 9)) continue;
    tree(put, x, z, 4 + Math.floor(rand() * 3), rand);
    mark(x - 1, z - 1, x + 1, z + 1);
    trees++;
  }
  for (let m = 0; m < 14; m++) {
    const east = rand() < 0.5;
    const cx0 = east ? 140 + Math.floor(rand() * 75) : -120 + Math.floor(rand() * 250);
    const cz0 = east ? -120 + Math.floor(rand() * 330) : 140 + Math.floor(rand() * 75);
    for (let i = 0; i < 14; i++) {
      const x = cx0 + Math.floor(rand() * 7) - 3, z = cz0 + Math.floor(rand() * 7) - 3;
      if (free(x, z, 1)) put(x, 0, z, B.flowers);
    }
  }

  // A campfire in the middle of the cabins, with log seats.
  const [fx, fz] = [-180, -45];
  if (free(fx, fz, 2) && clearAt(fx, fz)) {
    put(fx, 0, fz, B.log);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(fx + dx, 0, fz + dz, B.cobble);
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3]]) put(fx + dx, 0, fz + dz, B.log);
    mark(fx - 3, fz - 3, fx + 3, fz + 3);
  }

  return {
    cars, claims, areas, count,
    places: { lodge },
  };
}

// ---------- Buildings ----------

function buildLodge(put, fill, { x0, z0, L, D }) {
  const x1 = x0 + L - 1, z1 = z0 + D - 1, H = 4;
  const mid = x0 + Math.floor(L / 2);
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      const wall = x === x0 || x === x1 || z === z0 || z === z1;
      if (!wall) {
        put(x, 0, z, B.floor);
        continue;
      }
      for (let y = 0; y < H; y++) {
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        const along = z === z0 || z === z1 ? x - x0 : z - z0;
        const window = !corner && (y === 1 || y === 2) && along % 3 !== 0;
        if ((z === z1 && (x === mid || x === mid - 1)) && y < 2) continue; // the doorway
        put(x, y, z, window ? B.glass : B.log);
      }
    }
  // Double doors in the front (south) wall.
  for (const x of [mid - 1, mid]) {
    put(x, 0, z1, makeBlock(B.door, 0));
    put(x, 1, z1, makeBlock(B.door, DOOR_TOP));
  }
  // A roof with snow on it.
  fill(x0 - 1, H, z0 - 1, x1 + 1, H, z1 + 1, B.roof);
  fill(x0 - 1, H + 1, z0 - 1, x1 + 1, H + 1, z1 + 1, B.snow);
  // The fireplace (a campfire in a stone hearth) against the back wall, couches facing it.
  const fz = z0 + 2;
  put(mid, 0, fz, B.log);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(mid + dx, 0, fz + dz, B.cobble);
  for (let x = mid - 2; x <= mid + 2; x++) put(x, 0, fz + 4, stack(makeBlock(B.couch, faceDir(0, -1)), B.floor));
  put(mid - 4, 0, fz + 2, stack(makeBlock(B.couch, faceDir(1, 0)), B.floor));
  put(mid + 4, 0, fz + 2, stack(makeBlock(B.couch, faceDir(-1, 0)), B.floor));
  // The hot cocoa bar along the east wall, with candles.
  for (let z = z0 + 2; z <= z0 + 6; z++) put(x1 - 1, 0, z, stack(makeBlock(B.desk, faceDir(-1, 0)), B.floor));
  for (const z of [z0 + 3, z0 + 5]) put(x1 - 1, 1, z, B.candle);
  for (const z of [z0 + 2, z0 + 4, z0 + 6]) put(x1 - 3, 0, z, stack(makeBlock(B.chair, faceDir(1, 0)), B.floor));
  // Tables and chairs on the west side, a bookshelf, pictures and lights.
  for (const z of [z0 + 4, z0 + 7]) {
    put(x0 + 2, 0, z, stack(B.table, B.floor));
    put(x0 + 2, 0, z + 1, stack(makeBlock(B.chair, faceDir(0, -1)), B.floor));
    put(x0 + 3, 0, z, stack(makeBlock(B.chair, faceDir(-1, 0)), B.floor));
    put(x0 + 2, 1, z, B.candle);
  }
  put(x0 + 1, 0, z0 + 1, B.bookshelf);
  put(x0 + 1, 1, z0 + 1, B.bookshelf);
  put(mid - 3, 2, z0 + 1, makeBlock(B.painting, onWall(0, -1) | (1 << 2)));
  put(mid + 3, 2, z0 + 1, makeBlock(B.painting, onWall(0, -1) | (3 << 2)));
  put(mid, 3, z0 + 6, B.chandelier);
  for (const [x, z] of [[x0 + 3, z0 + 3], [x1 - 3, z0 + 3], [x0 + 3, z1 - 2], [x1 - 3, z1 - 2]]) put(x, 3, z, B.ceilingLight);
  put(x0 + 1, 0, z1 - 1, stack(B.flowerPot, B.floor));
  put(x1 - 1, 0, z1 - 1, stack(B.teddy, B.floor));
  // Lanterns either side of the doors.
  put(mid - 3, 0, z1 + 1, B.lantern);
  put(mid + 2, 0, z1 + 1, B.lantern);
  // Coach Frost works here, just inside the doors.
  return { x: mid + 1.5, y: 0, z: z1 - 2.5, area: [x0 + 1, z0 + 1, x1 - 1, z1 - 1], face: 0 };
}

function cabinFree(x0, z0, clearAt) {
  for (let x = x0 - 1; x <= WOODS_ROAD_X - 4; x++) for (let z = z0 - 1; z <= z0 + 8; z++) if (!clearAt(x, z, 6)) return false;
  return true;
}

// A little log cabin in the woods, its door facing east toward the road: a bed, a table, a rug,
// a lantern, a bookshelf, a chimney, a wooden path to the road, and a woodpile.
function buildCabin(put, fill, x0, z0, rand) {
  const W = 9, D = 8, x1 = x0 + W - 1, z1 = z0 + D - 1, door = z0 + 4;
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      const wall = x === x0 || x === x1 || z === z0 || z === z1;
      if (!wall) {
        put(x, 0, z, B.floor);
        continue;
      }
      for (let y = 0; y < 3; y++) {
        if (x === x1 && z === door && y < 2) continue;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        const window = !corner && y === 1 && ((z === z0 || z === z1) ? (x - x0) % 3 === 1 : z !== door && (z - z0) % 3 === 1);
        put(x, y, z, window ? B.glass : B.log);
      }
    }
  put(x1, 0, door, makeBlock(B.door, 1));
  put(x1, 1, door, makeBlock(B.door, 1 | DOOR_TOP));
  // A pitched roof: two layers, the top one narrower.
  fill(x0 - 1, 3, z0 - 1, x1 + 1, 3, z1 + 1, B.roof);
  fill(x0 + 1, 4, z0 + 1, x1 - 1, 4, z1 - 1, B.roof);
  fill(x0 + 3, 5, z0 + 3, x1 - 3, 5, z1 - 3, B.roof);
  fill(x0 + 1, 0, z0 + 1, x0 + 1, 6, z0 + 1, B.cobble); // the chimney (the stove's in the corner)
  // Inside.
  const sv = 1;
  put(x0 + 2, 0, z0 + 1, stack(makeBlock(B.bed, faceDir(0, sv)), B.floor));
  put(x0 + 2, 0, z0 + 2, stack(makeBlock(B.bed, faceDir(0, sv) | BED_FOOT), B.floor));
  put(x0 + 4, 0, z1 - 2, stack(B.table, B.floor));
  put(x0 + 4, 1, z1 - 2, B.candle);
  put(x0 + 3, 0, z1 - 2, stack(makeBlock(B.chair, faceDir(1, 0)), B.floor));
  put(x0 + 5, 0, z1 - 2, stack(makeBlock(B.chair, faceDir(-1, 0)), B.floor));
  put(x0 + 1, 0, z1 - 1, B.bookshelf);
  put(x0 + 4, 0, z0 + 3, B.carpet);
  put(x0 + 5, 0, z0 + 3, B.carpet);
  put(x0 + 4, 0, z0 + 4, B.carpet);
  put(x0 + 5, 0, z0 + 4, B.carpet);
  put(x0 + 6, 0, z0 + 1, stack(B.teddy, B.floor));
  put(x0 + 4, 2, z0 + 4, B.ceilingLight);
  put(x0 + 4, 1, z0 + 1, makeBlock(B.painting, onWall(0, -1) | (Math.floor(rand() * 4) << 2)));
  // Outside: a lantern by the door, a woodpile and a wooden path to the road.
  put(x1 + 1, 0, door + 1, B.lantern);
  fill(x0 - 1, 0, z1 - 1, x0 - 1, 1, z1 - 1, B.log);
  for (let x = x1 + 1; x <= WOODS_ROAD_X - 4; x++) put(x, 0, door, B.floor);
}

function tree(put, x, z, h, rand) {
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = h - 2; dy <= h + 1; dy++) {
        const r = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - h) * 2;
        if (r <= 3 && rand() > 0.08) put(x + dx, dy, z + dz, B.leaves);
      }
  for (let y = 0; y < h; y++) put(x, y, z, B.log);
}

// A pine tree (snowy needles in rings that get smaller toward the top), standing at height `base`.
function pine(put, x, z, base, h) {
  for (let y = 0; y < h; y++) put(x, base + y, z, B.log);
  for (let dy = 2; dy <= h + 1; dy++) {
    const r = Math.min(2.6, (h + 2 - dy) * 0.55);
    for (let dx = -3; dx <= 3; dx++)
      for (let dz = -3; dz <= 3; dz++) {
        if ((dx || dz) && dx * dx + dz * dz <= r * r + 0.3) put(x + dx, base + dy, z + dz, B.pine);
      }
  }
  put(x, base + h, z, B.pine);
  put(x, base + h + 1, z, B.pine);
}

// ---------- The Pizza Palace ----------

// A pizza restaurant beside one of the roads out of town: brick walls, a striped front, big
// windows, a glowing oven at the back (right-click it, or talk to the chef, for a delivery job),
// a counter, and tables with chairs.
export function buildPizzeria({ get, set, canUse }) {
  const roads = exitRoads();
  const L = 11, D = 10;
  for (const name of ['south', 'east', 'north', 'west', 'ringS', 'ringE', 'ringW', 'ringN']) {
    const road = roads[name];
    for (const side of [1, -1]) {
      for (let a = road.from + 2; a + L <= road.to - 1; a += 2) {
        const site = makeSite(road, side, a);
        if (!siteFree(site, L, D, 7, get, canUse)) continue;
        return pizzeriaAt(site, L, D, set);
      }
    }
  }
  return null;
}

function pizzeriaAt(site, L, D, set) {
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV; // from the road into the restaurant
  const inward = faceDir(fx, fz), outward = faceDir(-fx, -fz);
  for (let u = 0; u < L; u++) put(u, 0, 0, u === 2 || u === 8 ? stack(B.lantern, B.sidewalk) : B.sidewalk);
  for (let u = 0; u < L; u++)
    for (let v = 1; v < D; v++) {
      const edgeU = u === 0 || u === L - 1, edgeV = v === 1 || v === D - 1;
      if (!edgeU && !edgeV) {
        put(u, 0, v, (u + v) % 2 ? B.floor : B.carpet);
        put(u, 4, v, B.brick);
        continue;
      }
      for (let y = 0; y < 5; y++) {
        let b = B.brick;
        if (v === 1 && !edgeU) {
          if (y === 3) b = u % 2 ? B.red : B.concrete; // a striped awning over the windows
          else if (y < 3) b = u === 5 && y < 2 ? 0 : B.glass;
        }
        if (b) put(u, y, v, b);
      }
    }
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  put(5, 0, 1, makeBlock(B.door, doorFacing));
  put(5, 1, 1, makeBlock(B.door, doorFacing | DOOR_TOP));
  // The sign: a glowing pizza (yellow, with pepperoni) on the roof, and party lights.
  for (let u = 3; u <= 7; u++) put(u, 5, 1, u === 4 || u === 6 ? B.red : B.yellow);
  put(5, 6, 1, B.yellow);
  for (let u = 0; u < L; u++) put(u, 2, 0, B.partyLights);
  // The oven at the back, the counter in front of it, tables and chairs by the windows.
  put(5, 0, D - 2, makeBlock(B.oven, outward));
  put(4, 0, D - 2, B.brick);
  put(6, 0, D - 2, B.brick);
  for (const u of [3, 4, 6, 7]) put(u, 0, D - 4, stack(makeBlock(B.desk, outward), B.floor));
  for (const [u, v] of [[2, 3], [8, 3]]) {
    put(u, 0, v, stack(B.table, B.floor));
    put(u, 1, v, B.candle);
    put(u - 1, 0, v, stack(makeBlock(B.chair, faceDir(...site.dirU)), B.floor));
    put(u + 1, 0, v, stack(makeBlock(B.chair, faceDir(-site.dirU[0], -site.dirU[1])), B.floor));
  }
  put(1, 0, D - 2, stack(B.flowerPot, B.floor));
  put(L - 2, 0, D - 2, stack(B.flowerPot, B.floor));
  put(5, 3, 4, B.ceilingLight);
  put(5, 3, D - 3, B.ceilingLight);
  put(1, 2, 5, makeBlock(B.painting, onWall(-site.dirU[0], -site.dirU[1]) | (2 << 2)));
  const [px, pz] = site.pos(5.5, D - 2.5), [ax, az] = site.at(1, D - 3), [bx, bz] = site.at(L - 2, D - 2);
  const [cx0, cz0] = site.at(0, 0), [cx1, cz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(cx0, cx1), Math.min(cz0, cz1), Math.max(cx0, cx1), Math.max(cz0, cz1)];
  const [ox, oz] = site.at(5, D - 2);
  return {
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    place: { x: px, y: 0, z: pz, area: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)], face: Math.atan2(fx, fz), oven: [ox, 0, oz], inward },
    claim: { owner: 'Pizza Palace', key: 'pizza palace', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
  };
}
