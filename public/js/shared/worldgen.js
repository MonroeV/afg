// Builds the starting world: a main town around spawn, villages in each corner,
// roads joining them, parks, playgrounds, trees, flowers and parked cars.
import { WORLD, DOOR_TOP, BED_FOOT, makeBlock, blockId, turnLine, stack, itemOf, floorOf, shapeOf } from './blocks.js';

const B = {
  grass: 1, dirt: 2, stone: 3, cobble: 4, brick: 5, planks: 6, log: 7, leaves: 8, glass: 9,
  sand: 10, metal: 11, marble: 12, concrete: 13, red: 14, blue: 15, yellow: 16, black: 17,
  lamp: 18, bounce: 19, tiles: 20, door: 21, road: 22, line: 23, sidewalk: 24, floor: 25,
  roof: 26, flowers: 27, rainbow: 28, pink: 29, mint: 30, sky: 31, orange: 32, purple: 33,
  green: 34, carpet: 35, water: 36, mirror: 37, gold: 38,
  tableLamp: 39, floorLamp: 40, ceilingLight: 41, chandelier: 42, candle: 43, lavaLamp: 44,
  lantern: 45, streetLamp: 46, gardenLight: 47, tikiTorch: 48, partyLights: 49,
  neonPink: 50, neonBlue: 51, neonGreen: 52, ladder: 53, railing: 54, lineX: 55, parkingLine: 56, parkingLineX: 57,
  parkingSign: 58, tintedGlass: 59,
  chair: 60, couch: 61, table: 62, bookshelf: 63, bed: 64, painting: 65, poster: 66, flowerPot: 67, teddy: 68,
  desk: 73, officeChair: 74, computer: 75, filing: 76, cooler: 77, whiteboard: 78, piano: 79, fishTank: 80, statue: 81,
  diamond: 82, throne: 83, discoBall: 84, trophy: 85, register: 86,
};

// Which way furniture faces (meta bits 0-1) to look along a world direction.
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
// The meta for a picture hanging on a wall that's in direction (wx, wz) from its cell.
const onWall = (wx, wz) => faceDir(-wx, -wz);

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

const ROAD_HALF = 3; // a road is 7 cells wide: sidewalk, 5 lanes of road, sidewalk
const LOT = 8; // house lots are 8x8
const CITY_BLOCK = 2 * LOT; // city blocks hold 2x2 lots
const PITCH = CITY_BLOCK + 2 * ROAD_HALF + 1;

export const HELIPAD = { x: 47, z: 0, size: 11, heli: { kind: 'heli', color: '#e53935', x: 52.5, y: 0, z: 5.5, h: 0 } };

// The helipad: a road-colored square with a big "H" and lamps on the corners.
export function helipadBlocks() {
  const out = [];
  for (let x = 0; x < HELIPAD.size; x++)
    for (let z = 0; z < HELIPAD.size; z++) {
      const h = (x === 2 || x === 3 || x === 7 || x === 8) && z >= 2 && z <= 8 || (z === 5 && x >= 4 && x <= 6);
      const edge = x === 0 || z === 0 || x === 10 || z === 10;
      const corner = (x === 0 || x === 10) && (z === 0 || z === 10);
      out.push([HELIPAD.x + x, 0, HELIPAD.z + z, corner ? B.gardenLight : h || edge ? B.sidewalk : B.road]);
    }
  return out;
}

export function generateWorld(seed = 2024) {
  const rand = rng(seed);
  const pick = list => list[Math.floor(rand() * list.length)];
  const chance = p => rand() < p;

  const map = new Map();
  const used = new Set(); // "x,z" columns that are part of a town or road
  const cars = [];

  const inWorld = (x, z) => x >= WORLD.min && x <= WORLD.max && z >= WORLD.min && z <= WORLD.max;
  const put = (x, y, z, v) => {
    if (!inWorld(x, z) || y < 0 || y > WORLD.maxY) return;
    if (v) map.set(`${x},${y},${z}`, v);
    else map.delete(`${x},${y},${z}`);
  };
  const del = (x, y, z) => map.delete(`${x},${y},${z}`);
  const has = (x, y, z) => map.has(`${x},${y},${z}`);
  const fill = (x0, y0, z0, x1, y1, z1, v) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) put(x, y, z, v);
  };
  const markUsed = (x0, z0, x1, z1) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) used.add(`${x},${z}`);
  };
  const door = (x, y, z, facing) => {
    put(x, y, z, makeBlock(B.door, facing));
    put(x, y + 1, z, makeBlock(B.door, facing | DOOR_TOP));
  };
  const streetLamp = (x, z) => {
    fill(x, 0, z, x, 2, z, B.black);
    put(x, 3, z, B.streetLamp);
  };
  const tree = (x, z, h = 4 + Math.floor(rand() * 3), base = 0) => {
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = h - 2; dy <= h + 1; dy++) {
          const r = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - h) * 2;
          if (r <= 3 && rand() > 0.08) put(x + dx, base + dy, z + dz, B.leaves);
        }
    fill(x, base, z, x, base + h - 1, z, B.log);
  };

  // ---------- Roads ----------
  // Roads are laid out first as flat "paint" on the ground, then stripes are added
  // only where a road isn't crossing another one (so crossings look clean).
  const ground = new Map(); // "x,z" -> flat block
  const crossings = new Map(); // "x,z" -> how many roads cover it
  const roads = [];

  function road(axis, center, from, to) {
    roads.push({ axis, center, from, to });
    for (let a = from; a <= to; a++) {
      for (let o = -ROAD_HALF; o <= ROAD_HALF; o++) {
        const [x, z] = axis === 'x' ? [a, center + o] : [center + o, a];
        if (!inWorld(x, z)) continue;
        const k = `${x},${z}`;
        crossings.set(k, (crossings.get(k) || 0) + 1);
        const v = Math.abs(o) === ROAD_HALF ? B.sidewalk : B.road;
        if (ground.get(k) !== B.road) ground.set(k, v);
        used.add(k);
      }
    }
  }

  function paintRoads() {
    for (const { axis, center, from, to } of roads) {
      for (let a = from; a <= to; a++) {
        const [x, z] = axis === 'x' ? [a, center] : [center, a];
        const k = `${x},${z}`;
        if (crossings.get(k) === 1 && ((a % 4) + 4) % 4 < 2) ground.set(k, axis === 'x' ? B.lineX : B.line);
      }
    }
    for (const [k, v] of ground) {
      const [x, z] = k.split(',').map(Number);
      if (!has(x, 0, z)) put(x, 0, z, v);
    }
  }

  // Street lamps and parked cars along a road.
  function decorateRoad(axis, center, from, to, carChance) {
    for (let a = from + 2; a <= to - 2; a += 9) {
      const side = (a / 9) % 2 < 1 ? 1 : -1;
      const [x, z] = axis === 'x' ? [a, center + side * ROAD_HALF] : [center + side * ROAD_HALF, a];
      if (crossings.get(`${x},${z}`) === 1) streetLamp(x, z);
    }
    for (let a = from + 5; a <= to - 5; a += 6) {
      if (!chance(carChance)) continue;
      const side = chance(0.5) ? 1 : -1;
      // Park in the lane next to the sidewalk, facing the direction of traffic.
      const offset = 0.5 + side * 1.5; // middle of the lane next to the sidewalk
      const [x, z] = axis === 'x' ? [a + 0.5, center + offset] : [center + offset, a + 0.5];
      const ok = [-2, -1, 0, 1, 2].every(d => {
        const k = axis === 'x' ? `${a + d},${center}` : `${center},${a + d}`;
        return crossings.get(k) === 1;
      });
      if (!ok) continue;
      const h = axis === 'x' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
      cars.push({ kind: 'car', x, y: 0, z, h });
    }
  }

  // ---------- Buildings ----------

  const WALLS = [B.planks, B.brick, B.concrete, B.pink, B.mint, B.sky, B.yellow, B.orange, B.purple, B.cobble, B.marble, B.green];
  const ROOFS = [B.roof, B.roof, B.roof, B.black, B.blue, B.red, B.planks, B.green];
  const TRIM = [B.log, B.stone, B.marble, B.planks, B.concrete];

  // A lot is 8x8 starting at (lx, lz). The house front faces north (-z) or south (+z).
  function house(lx, lz, facesSouth, opts = {}) {
    const w = opts.w ?? 5 + Math.floor(rand() * 3);
    const d = opts.d ?? 5 + Math.floor(rand() * 2);
    const twoStory = opts.twoStory ?? (w >= 6 && chance(0.35));
    const H = twoStory ? 7 : 3;
    const wall = opts.wall ?? pick(WALLS);
    const roofMat = opts.roof ?? pick(ROOFS);
    const trim = pick(TRIM);
    const x0 = lx + Math.floor((LOT - w) / 2);
    const yard = LOT - d - 1;
    // Local coordinates: u runs along the front wall, v goes from the front wall (0) to the back.
    const frontZ = facesSouth ? lz + LOT - 1 - yard : lz + yard;
    const P = (u, y, v, val) => put(x0 + u, y, facesSouth ? frontZ - v : frontZ + v, val);
    const out = facesSouth ? 1 : -1; // world z direction pointing out of the front door

    for (let u = 0; u < w; u++)
      for (let v = 0; v < d; v++) {
        const edgeU = u === 0 || u === w - 1, edgeV = v === 0 || v === d - 1;
        if (!edgeU && !edgeV) {
          P(u, 0, v, B.floor);
          if (twoStory) P(u, 3, v, B.planks);
          continue;
        }
        for (let y = 0; y < H; y++) {
          const corner = edgeU && edgeV;
          const windowRow = y === 1 || y === 5;
          const windowCol = edgeV ? u % 2 === 1 && u < w - 1 : v % 2 === 1 && v < d - 1;
          let val = corner || y === 3 ? trim : wall;
          if (!corner && windowRow && windowCol) val = B.glass;
          P(u, y, v, val);
        }
      }

    // Front door, a path to the street and flowers.
    const du = Math.floor(w / 2);
    const dx = x0 + du, dz = frontZ;
    del(dx, 0, dz);
    del(dx, 1, dz);
    door(dx, 0, dz, 0);
    for (let v = 1; v <= yard + 1; v++) put(dx, 0, dz + out * v, B.sidewalk);
    // Flowers along the front, and lanterns on either side of the door.
    const lanterns = chance(0.6);
    for (let u = 0; u < w; u++) {
      if (lanterns && Math.abs(u - du) === 1) P(u, 0, -1, B.lantern);
      else if (u !== du && chance(0.7)) P(u, 0, -1, B.flowers);
    }

    // Stairs up to the second floor.
    if (twoStory) {
      for (let s = 1; s <= 4; s++) {
        for (let y = 0; y < s; y++) P(s, y, d - 2, B.planks);
        if (s < 4) P(s, 3, d - 2, 0); // hole in the upstairs floor above the steps
      }
    }

    // Roof: stepped gable along the front, with a lamp in the ceiling.
    for (let k = 0; ; k++) {
      const v0 = -1 + k, v1 = d - k;
      if (v0 > v1) break;
      for (let u = -1; u <= w; u++)
        for (let v = v0; v <= v1; v++) {
          const shell = k === 0 || v === v0 || v === v1 || v0 + 1 >= v1;
          if (shell) P(u, H + k, v, roofMat);
        }
      // Close the gable ends.
      if (k > 0) for (let v = v0 + 1; v < v1; v++) { P(0, H + k, v, wall); P(w - 1, H + k, v, wall); }
    }
    // A light hanging from each ceiling (a chandelier in fancy houses).
    const ceiling = chance(0.15) ? B.chandelier : B.ceilingLight;
    P(Math.floor(w / 2), twoStory ? 2 : H - 1, Math.floor(d / 2), ceiling);
    if (twoStory) P(Math.floor(w / 2), H - 1, Math.floor(d / 2), B.ceilingLight);

    // A little furniture: a bed, a table with flowers and a rug. (More gets added later: see
    // furnishHouses.) sv: which way along z the inside of the house goes from the front.
    const sv = facesSouth ? -1 : 1;
    if (twoStory) {
      P(w - 2, 4, 1, makeBlock(B.bed, faceDir(0, sv)));
      P(w - 2, 4, 2, makeBlock(B.bed, faceDir(0, sv) | BED_FOOT));
    } else {
      P(w - 2, 0, d - 2, stack(makeBlock(B.bed, faceDir(0, -sv)), B.floor));
      P(w - 2, 0, d - 3, stack(makeBlock(B.bed, faceDir(0, -sv) | BED_FOOT), B.floor));
      // A table with a lamp (or flowers, or a candle) and sometimes a floor lamp.
      P(1, 0, d - 2, B.planks);
      P(1, 1, d - 2, pick([B.tableLamp, B.tableLamp, B.flowers, B.candle, B.lavaLamp]));
      if (d >= 6 && w - 2 !== du && chance(0.5)) P(w - 2, 0, d - 4, B.floorLamp);
    }
    P(du, 0, 1, B.carpet);

    // A tree in the back yard sometimes.
    if (chance(0.4)) {
      const tx = lx + (chance(0.5) ? 0 : LOT - 1);
      const tz = facesSouth ? lz : lz + LOT - 1;
      put(tx, 0, tz, B.leaves);
      put(tx, 1, tz, B.leaves);
    }
  }

  function shop(lx, lz, facesSouth) {
    const w = 7, d = 6;
    const x0 = lx;
    const frontZ = facesSouth ? lz + LOT - 2 : lz + 1;
    const P = (u, y, v, val) => put(x0 + u, y, facesSouth ? frontZ - v : frontZ + v, val);
    const wall = pick([B.brick, B.concrete, B.sky, B.pink, B.yellow]);
    const stripe = pick([[B.red, B.concrete], [B.blue, B.concrete], [B.green, B.yellow], [B.purple, B.pink]]);
    for (let u = 0; u < w; u++)
      for (let v = 0; v < d; v++) {
        const edge = u === 0 || u === w - 1 || v === 0 || v === d - 1;
        if (!edge) { P(u, 0, v, B.tiles); continue; }
        for (let y = 0; y < 4; y++) P(u, y, v, v === 0 && y < 3 && u > 0 && u < w - 1 ? B.glass : wall);
      }
    // Big glass front with a door in the middle.
    const du = 3;
    P(du, 0, 0, 0); P(du, 1, 0, 0);
    door(x0 + du, 0, frontZ, 0);
    P(du, 2, 0, B.glass);
    // Striped awning and a flat roof with a sign.
    for (let u = 0; u < w; u++) P(u, 3, -1, stripe[u % 2]);
    fill(x0, 4, Math.min(frontZ, frontZ + (facesSouth ? -(d - 1) : d - 1)), x0 + w - 1, 4, Math.max(frontZ, frontZ + (facesSouth ? -(d - 1) : d - 1)), B.concrete);
    // A sign on the roof (some shops have neon), party lights under the awning,
    // and ceiling lights inside.
    const sign = chance(0.4) ? pick([B.neonPink, B.neonBlue, B.neonGreen]) : B.lamp;
    for (let u = 1; u < w - 1; u++) P(u, 5, 0, u % 2 ? stripe[0] : sign);
    if (chance(0.6)) for (let u = 0; u < w; u++) P(u, 2, -1, B.partyLights);
    P(1, 3, 2, B.ceilingLight); P(w - 2, 3, 2, B.ceilingLight);
    // Shelves.
    for (let v = 2; v < d - 1; v++) { P(1, 0, v, B.planks); P(w - 2, 0, v, B.planks); }
    P(1, 1, 2, B.red); P(w - 2, 1, 3, B.yellow); P(1, 1, 3, B.blue);
  }

  function garden(lx, lz) {
    fill(lx + 1, 0, lz + 1, lx + LOT - 2, 0, lz + LOT - 2, B.flowers);
    fill(lx + 3, 0, lz + 3, lx + 4, 0, lz + 4, B.water);
    tree(lx + 1, lz + 1, 4);
  }

  function park(x0, z0, size) {
    // Paths in a cross, trees, flowers, a pond and a playground with bounce pads.
    const mid = Math.floor(size / 2);
    for (let i = 0; i < size; i++) {
      put(x0 + mid, 0, z0 + i, B.sidewalk);
      put(x0 + i, 0, z0 + mid, B.sidewalk);
    }
    // Pond
    for (let x = 1; x < 6; x++) for (let z = 1; z < 6; z++) {
      const edge = x === 1 || x === 5 || z === 1 || z === 5;
      put(x0 + x, 0, z0 + z, edge ? B.stone : B.water);
    }
    // Garden lights along the paths
    for (let i = 2; i < size - 1; i += 4) {
      if (!has(x0 + mid + 1, 0, z0 + i)) put(x0 + mid + 1, 0, z0 + i, B.gardenLight);
      if (!has(x0 + i, 0, z0 + mid - 1)) put(x0 + i, 0, z0 + mid - 1, B.gardenLight);
    }
    // Playground, with tiki torches at the corners
    const px = x0 + mid + 2, pz = z0 + mid + 2;
    fill(px, 0, pz, px + 5, 0, pz + 5, B.sand);
    for (const [tx, tz] of [[px, pz], [px + 5, pz], [px, pz + 5], [px + 5, pz + 5]]) put(tx, 1, tz, B.tikiTorch);
    put(px + 1, 1, pz + 1, B.bounce); put(px + 4, 1, pz + 1, B.bounce);
    put(px + 1, 1, pz + 4, B.bounce); put(px + 4, 1, pz + 4, B.bounce);
    // Rainbow climbing tower
    for (let y = 1; y <= 5; y++) put(px + 2 + (y % 2), y, pz + 2 + (y > 2 ? 1 : 0), B.rainbow);
    put(px + 3, 6, pz + 3, B.bounce);
    // Trees and flowers
    tree(x0 + size - 3, z0 + 2, 5);
    tree(x0 + 2, z0 + size - 3, 5);
    for (let i = 0; i < 14; i++) {
      const x = x0 + 1 + Math.floor(rand() * (size - 2)), z = z0 + 1 + Math.floor(rand() * (size - 2));
      if (!has(x, 0, z)) put(x, 0, z, B.flowers);
    }
    streetLamp(x0 + mid - 1, z0 + mid - 1);
  }

  function plaza(x0, z0, size) {
    // The town square where everyone spawns: a fountain, benches, lamps and a bounce pad.
    fill(x0, 0, z0, x0 + size - 1, 0, z0 + size - 1, B.sidewalk);
    const c = x0 + size / 2; // the middle of the square sits between cells c-1 and c
    for (let x = c - 4; x < c + 4; x++) for (let z = c - 4; z < c + 4; z++) {
      const edge = x === c - 4 || x === c + 3 || z === c - 4 || z === c + 3;
      if (edge) put(x, 0, z, B.marble);
      else put(x, 0, z, B.water);
    }
    fill(c - 1, 0, c - 1, c, 2, c, B.marble);
    fill(c - 1, 3, c - 1, c, 3, c, B.lamp);
    // Corner lamps and planters
    for (const [x, z] of [[x0 + 1, z0 + 1], [x0 + size - 2, z0 + 1], [x0 + 1, z0 + size - 2], [x0 + size - 2, z0 + size - 2]]) {
      streetLamp(x, z);
    }
    for (const [x, z] of [[x0 + 2, c - 1], [x0 + size - 3, c - 1]]) {
      put(x, 0, z, B.leaves); put(x, 0, z + 1, B.flowers); put(x, 0, z - 1, B.flowers);
    }
    // Garden lights around the fountain
    for (const [x, z] of [[c - 5, c - 5], [c + 4, c - 5], [c - 5, c + 4], [c + 4, c + 4]]) put(x, 0, z, B.gardenLight);
    // Bounce pads for fun, away from the spawn point.
    put(c - 6, 1, c - 6, B.bounce);
    put(c + 5, 1, c - 6, B.bounce);
    put(c - 6, 0, c - 6, B.marble);
    put(c + 5, 0, c - 6, B.marble);
  }

  // ---------- Towns ----------

  // A town is a grid of city blocks (nx by nz) with roads between them.
  function town(cx, cz, nx, nz, { plazaAt = null, parkAt = null, carChance = 0.35 } = {}) {
    const W = nx * PITCH + 2 * ROAD_HALF + 1;
    const D = nz * PITCH + 2 * ROAD_HALF + 1;
    const x0 = cx - Math.floor(W / 2), z0 = cz - Math.floor(D / 2);
    const roadXs = [], roadZs = [];
    for (let i = 0; i <= nx; i++) roadXs.push(x0 + ROAD_HALF + i * PITCH);
    for (let j = 0; j <= nz; j++) roadZs.push(z0 + ROAD_HALF + j * PITCH);
    for (const x of roadXs) road('z', x, z0, z0 + D - 1);
    for (const z of roadZs) road('x', z, x0, x0 + W - 1);

    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const bx = x0 + 2 * ROAD_HALF + 1 + i * PITCH;
        const bz = z0 + 2 * ROAD_HALF + 1 + j * PITCH;
        markUsed(bx, bz, bx + CITY_BLOCK - 1, bz + CITY_BLOCK - 1);
        if (plazaAt && plazaAt[0] === i && plazaAt[1] === j) {
          plaza(bx, bz, CITY_BLOCK);
          continue;
        }
        if (parkAt && parkAt[0] === i && parkAt[1] === j) {
          park(bx, bz, CITY_BLOCK);
          continue;
        }
        for (let a = 0; a < 2; a++)
          for (let b = 0; b < 2; b++) {
            const lx = bx + a * LOT, lz = bz + b * LOT;
            const r = rand();
            if (r < 0.12) shop(lx, lz, b === 1);
            else if (r < 0.2) garden(lx, lz);
            else house(lx, lz, b === 1);
          }
      }
    return { x0, z0, W, D, roadXs, roadZs };
  }

  // The main town around spawn, with the plaza in the middle.
  const main = town(0, 0, 3, 3, { plazaAt: [1, 1], parkAt: [2, 0], carChance: 0.4 });
  // Villages in the corners.
  [[-84, -84], [84, -84], [-84, 84], [84, 84]].map(([x, z], i) =>
    town(x, z, 2, 2, { parkAt: i === 3 ? [0, 0] : null, carChance: 0.3 }));

  // A ring road through the villages, and roads from the main town out to it.
  const ring = 84;
  road('x', -ring, -ring, ring);
  road('x', ring, -ring, ring);
  road('z', -ring, -ring, ring);
  road('z', ring, -ring, ring);
  const mx = main.roadXs[2], mz = main.roadZs[1];
  road('x', mz, main.x0 + main.W, ring);
  road('x', mz, -ring, main.x0 - 1);
  road('z', mx, main.z0 + main.D, ring);
  road('z', mx, -ring, main.z0 - 1);

  paintRoads();
  for (const r of roads) decorateRoad(r.axis, r.center, r.from, r.to, 0.12);

  // Special cars: a police car by the plaza and a monster truck out in the country.
  cars.unshift({ kind: 'police', color: '#f5f5f5', x: 0.5, y: 0, z: main.roadZs[1] + 2, h: -Math.PI / 2 });
  for (const [x, z, h] of [[40.5, 50.5, 0.6], [-45.5, -48.5, 2.2]]) {
    cars.push({ kind: 'monster', x, y: 0, z, h });
    markUsed(Math.floor(x) - 4, Math.floor(z) - 4, Math.floor(x) + 4, Math.floor(z) + 4);
  }

  // A helipad east of the main town, with the helicopter waiting on it.
  for (const [x, y, z, v] of helipadBlocks()) put(x, y, z, v);
  markUsed(HELIPAD.x - 3, HELIPAD.z - 3, HELIPAD.x + 13, HELIPAD.z + 13);
  cars.push(HELIPAD.heli);

  // Parking lots and skyscrapers along the roads out of the main town.
  const landmarks = buildLandmarks({ get: (x, y, z) => map.get(`${x},${y},${z}`) || 0, set: put, canUse: (x, z) => !used.has(`${x},${z}`) });
  for (const a of landmarks.areas) markUsed(...a);
  cars.push(...landmarks.cars);
  // A lake with a dock and boats.
  const lake = buildLake({ get: (x, y, z) => map.get(`${x},${y},${z}`) || 0, set: put, canUse: (x, z) => !used.has(`${x},${z}`) });
  if (lake) {
    markUsed(...lake.area);
    cars.push(...lake.cars);
  }
  // The Luxe Store, and furniture in the houses and towers.
  const getB = (x, y, z) => map.get(`${x},${y},${z}`) || 0;
  const store = buildStore({ get: getB, set: put, canUse: (x, z) => !used.has(`${x},${z}`) });
  if (store) markUsed(...store.area);
  const each = fn => {
    for (const [k, v] of [...map]) {
      const [x, y, z] = k.split(',').map(Number);
      fn(x, y, z, v);
    }
  };
  furnishHouses({ each, get: getB, set: put, canUse: () => true });
  const towers = furnishTowers({ each, get: getB, set: put, canUse: () => true });
  const places = { plaza: { x: 0, z: 0 }, store: store?.place || null, tower: towers[0]?.lobby || null };

  // ---------- Countryside ----------

  const nearUsed = (x, z, r) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (used.has(`${x + dx},${z + dz}`)) return true;
    return false;
  };
  let trees = 0, tries = 0;
  while (trees < 140 && tries++ < 5000) {
    const x = Math.floor(rand() * 250) - 125, z = Math.floor(rand() * 250) - 125;
    if (nearUsed(x, z, 3)) continue;
    tree(x, z);
    trees++;
  }
  // Flower meadows
  for (let m = 0; m < 25; m++) {
    const cx = Math.floor(rand() * 240) - 120, cz = Math.floor(rand() * 240) - 120;
    for (let i = 0; i < 18; i++) {
      const x = cx + Math.floor(rand() * 7) - 3, z = cz + Math.floor(rand() * 7) - 3;
      if (!nearUsed(x, z, 1) && !has(x, 0, z)) put(x, 0, z, B.flowers);
    }
  }
  // A sandy beach with a parkour tower, and a grassy hill with a tree on top.
  for (let x = 30; x < 46; x++) for (let z = 102; z < 118; z++) if (!nearUsed(x, z, 0)) put(x, 0, z, B.sand);
  fill(37, 1, 109, 38, 12, 110, B.rainbow);
  const steps = [[36, 109], [36, 110], [37, 111], [38, 111], [39, 110], [39, 109], [38, 108], [37, 108]];
  for (let i = 0; i < 11; i++) {
    const [x, z] = steps[i % steps.length];
    put(x, i + 1, z, B.planks);
  }
  put(37, 13, 109, B.lamp);
  put(33, 1, 105, B.bounce);
  put(42, 1, 114, B.bounce);
  for (const [x, z] of [[31, 103], [44, 103], [31, 116], [44, 116]]) if (has(x, 0, z)) put(x, 1, z, B.tikiTorch);
  for (let r = 6; r >= 1; r--) {
    const y = 6 - r;
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      if (Math.abs(x) + Math.abs(z) <= r + 1) put(-50 + x, y, 30 + z, B.grass);
    }
  }
  tree(-50, 30, 4, 6);

  // Don't let parked cars overlap each other.
  const placed = [];
  for (const c of cars) {
    if (placed.every(o => Math.hypot(o.x - c.x, o.z - c.z) > 5)) placed.push(c);
  }

  const blocks = [];
  for (const [k, v] of map) {
    if (!v) continue;
    const [x, y, z] = k.split(',').map(Number);
    blocks.push([x, y, z, v]);
  }
  return { blocks, cars: placed, places, claims: store ? [store.claim] : [] };
}

// Saved worlds from before the new lamps: put proper lamp heads on the town's street lamps
// and helipad corners. Every other lamp is left exactly as it was built (lamps in ceilings
// light up the room by themselves). get(x, y, z) and set(x, y, z, v) read and write the world.
export function upgradeLamps(lampKeys, get, set) {
  const corners = new Set([[0, 0], [10, 0], [0, 10], [10, 10]].map(([x, z]) => `${HELIPAD.x + x},0,${HELIPAD.z + z}`));
  for (const key of lampKeys) {
    const [x, y, z] = key.split(',').map(Number);
    if (get(x, y, z) !== B.lamp) continue;
    if (corners.has(key)) {
      set(x, y, z, B.gardenLight);
    } else if (y === 3 && [0, 1, 2].every(py => get(x, py, z) === B.black)) {
      set(x, y, z, B.streetLamp);
    }
  }
}

// ---------- Landmarks: parking lots and skyscrapers ----------
// They go on empty land beside the four roads leading out of the main town. New worlds get
// them straight away; saved worlds get them added on upgrade, but only on land where nothing
// has been built and that nobody has claimed (canUse), so nothing players made is touched.

// The roads out of the main town and the ring road between the villages (the same ones
// generateWorld lays out).
function exitRoads() {
  const W = 3 * PITCH + 2 * ROAD_HALF + 1, x0 = -Math.floor(W / 2);
  const mx = x0 + ROAD_HALF + 2 * PITCH, mz = x0 + ROAD_HALF + PITCH, out = x0 + W + 2;
  return {
    east: { axis: 'x', c: mz, from: out, to: 80 },
    west: { axis: 'x', c: mz, from: -80, to: x0 - 3 },
    south: { axis: 'z', c: mx, from: out, to: 80 },
    north: { axis: 'z', c: mx, from: -80, to: x0 - 3 },
    ringN: { axis: 'x', c: -84, from: -56, to: 56 },
    ringS: { axis: 'x', c: 84, from: -56, to: 56 },
    ringW: { axis: 'z', c: -84, from: -56, to: 56 },
    ringE: { axis: 'z', c: 84, from: -56, to: 56 },
  };
}

// get(x, y, z) and set(x, y, z, v) read and write blocks; canUse(x, z) says whether a column
// of land may be built on. Returns the parked cars to add and the areas used.
export function buildLandmarks({ get, set, canUse }) {
  const roads = exitRoads();
  const cars = [], areas = [];
  const wishes = [
    { kind: 'tower', size: 11, height: 48, style: 0, roads: ['east', 'west', 'south', 'north', 'ringE', 'ringN'] },
    { kind: 'tower', size: 9, height: 36, style: 1, roads: ['west', 'north', 'east', 'south', 'ringW', 'ringS'] },
    { kind: 'lot', roads: ['south', 'north', 'east', 'west', 'ringS', 'ringE', 'ringN', 'ringW'] },
    { kind: 'lot', roads: ['north', 'east', 'west', 'south', 'ringN', 'ringW', 'ringS', 'ringE'] },
  ];
  for (const wish of wishes) {
    const L = wish.kind === 'lot' ? 19 : wish.size + 2, D = wish.kind === 'lot' ? 16 : wish.size + 2;
    const tall = wish.kind === 'lot' ? 5 : wish.height + 4;
    search: for (const name of wish.roads) {
      const road = roads[name];
      for (const side of [-1, 1]) {
        for (let a = road.from + 2; a + L <= road.to - 1; a += 2) {
          const site = makeSite(road, side, a);
          if (!siteFree(site, L, D, tall, get, canUse)) continue;
          if (wish.kind === 'lot') cars.push(...parkingLot(site, set));
          else skyscraper(site, wish, set);
          const [xa, za] = site.at(-1, -1), [xb, zb] = site.at(L, D);
          areas.push([Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)]);
          break search;
        }
      }
    }
  }
  return { cars, areas };
}

// A site beside a road: u runs along the road, v away from it (v = 0 touches the sidewalk).
function makeSite(road, side, a) {
  const near = road.c + side * (ROAD_HALF + 1); // first row past the sidewalk
  const at = (u, v) => (road.axis === 'x' ? [a + u, near + side * v] : [near + side * v, a + u]);
  // Exact positions inside the site (for parking cars), measured from its corner.
  const pos = (u, v) => {
    const edge = side > 0 ? near : near + 1;
    return road.axis === 'x' ? [a + u, edge + side * v] : [edge + side * v, a + u];
  };
  const dirU = road.axis === 'x' ? [1, 0] : [0, 1];
  const dirV = road.axis === 'x' ? [0, side] : [side, 0];
  // Railing edge bits for a local direction (1 = -z, 2 = +x, 4 = +z, 8 = -x).
  const edge = (du, dv) => {
    const x = du * dirU[0] + dv * dirV[0], z = du * dirU[1] + dv * dirV[1];
    return x > 0 ? 2 : x < 0 ? 8 : z > 0 ? 4 : 1;
  };
  return { road, side, at, pos, dirU, dirV, edge };
}

// ---------- Furnishing ----------
// Houses and towers built by the world generator get furniture: chairs, couches, pictures,
// bookshelves, teddy bears; desks, computers and plants in the office towers; a piano and a
// fish tank in the penthouses. In a saved world only rooms nobody has changed get any, and
// furniture only ever goes into empty spots (nothing anyone built is touched).

// What the generator ever put inside a house (in any version of the game).
const HOUSE_GROUND = new Set([B.floor, B.carpet, B.red, B.concrete, B.planks, B.floorLamp, B.bed]);
const HOUSE_ABOVE = new Set([B.planks, B.red, B.concrete, B.tableLamp, B.flowers, B.candle, B.lavaLamp, B.ceilingLight, B.chandelier, B.lamp, B.floorLamp, B.bed]);
const SIDES4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// A little random number generator for one spot, so the same house always gets the same things.
const spotRand = (x, z) => rng(((x + 1000) * 7919) ^ ((z + 1000) * 104729));

// The generated house rooms in a world: wood floors with walls around them, and nothing in
// them that the generator didn't put there.
function houseRooms({ each, get, canUse }) {
  const seen = new Set(), rooms = [];
  const ground = v => v && HOUSE_GROUND.has(blockId(itemOf(v))) && (!floorOf(v) || blockId(floorOf(v)) === B.floor);
  const starts = [];
  each((x, y, z, v) => {
    if (y === 0 && v === B.floor) starts.push([x, z]);
  });
  for (const [sx, sz] of starts) {
    if (seen.has(`${sx},${sz}`)) continue;
    const region = [], queue = [[sx, sz]];
    seen.add(`${sx},${sz}`);
    while (queue.length && region.length <= 80) {
      const [x, z] = queue.pop();
      region.push([x, z]);
      for (const [dx, dz] of SIDES4) {
        const k = `${x + dx},${z + dz}`;
        if (!seen.has(k) && ground(get(x + dx, 0, z + dz))) {
          seen.add(k);
          queue.push([x + dx, z + dz]);
        }
      }
    }
    if (region.length < 4 || region.length > 80) continue;
    const xs = region.map(c => c[0]), zs = region.map(c => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) !== region.length) continue; // houses are rectangles
    // Walls all round, with one door.
    let doors = [], ok = true;
    for (let x = x0 - 1; x <= x1 + 1 && ok; x++)
      for (let z = z0 - 1; z <= z1 + 1 && ok; z++) {
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) continue;
        const corner = (x === x0 - 1 || x === x1 + 1) && (z === z0 - 1 || z === z1 + 1);
        const v = get(x, 0, z);
        if (blockId(itemOf(v)) === B.door && !corner) doors.push([x, z]);
        else if (!v || shapeOf(v) !== 'cube') ok = false;
      }
    if (!ok || doors.length !== 1) continue;
    // One floor (roof right above) or two (an upstairs floor of planks with a hole for the stairs).
    let roofAt3 = true;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (shapeOf(get(x, 3, z)) !== 'cube' || !get(x, 3, z)) roofAt3 = false;
    const H = roofAt3 ? 3 : 7;
    for (let x = x0; x <= x1 && ok; x++)
      for (let z = z0; z <= z1 && ok; z++) {
        if (!canUse(x, z)) ok = false;
        for (let y = 1; y < H && ok; y++) {
          const v = get(x, y, z);
          if (v && !(HOUSE_ABOVE.has(blockId(itemOf(v))) && !floorOf(v))) ok = false;
        }
      }
    if (!ok) continue;
    const [dx, dz] = doors[0];
    const inward = dx < x0 ? [1, 0] : dx > x1 ? [-1, 0] : dz < z0 ? [0, 1] : [0, -1];
    rooms.push({ x0, z0, x1, z1, H, door: [dx, dz], inward });
  }
  return rooms;
}

export function furnishHouses({ each, get, set, canUse }) {
  let count = 0;
  for (const room of houseRooms({ each, get, canUse })) {
    furnishRoom(room, 0, get, set);
    if (room.H === 7) furnishRoom(room, 4, get, set);
    count++;
  }
  return count;
}

// Adds furniture to one floor of a room: things go along the walls (the middle stays clear,
// and so does the way in), and only into empty spots.
function furnishRoom({ x0, z0, x1, z1, door, inward, H }, y, get, set) {
  const rand = spotRand(x0 * 3 + y, z0);
  const w = x1 - x0 + 1, d = z1 - z0 + 1, small = w * d <= 9;
  const entry = [door[0] + inward[0], door[1] + inward[1]];
  const nearEntry = (x, z) => Math.abs(x - entry[0]) + Math.abs(z - entry[1]) <= 1;
  const upstairs = y > 0;
  // A spot is free if it's bare floor with nothing above it (upstairs: plank floor below).
  const inRoom = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const free = (x, z) => {
    if (!inRoom(x, z) || nearEntry(x, z)) return false;
    if (get(x, y + 1, z) || get(x, y + 2, z)) return false;
    // Keep the way up the stairs clear (downstairs) and round the hole at the top (upstairs).
    if (H === 7 && !upstairs && SIDES4.some(([dx, dz]) => get(x + dx, 0, z + dz) === B.planks)) return false;
    if (upstairs && SIDES4.some(([dx, dz]) => inRoom(x + dx, z + dz) && !get(x + dx, y - 1, z + dz))) return false;
    return upstairs ? !get(x, y, z) && blockId(get(x, y - 1, z)) === B.planks : get(x, y, z) === B.floor;
  };
  // Upstairs, the row next to the stairs stays clear so you can walk up.
  const wallsOf = (x, z) => SIDES4.filter(([dx, dz]) => x + dx < x0 || x + dx > x1 || z + dz < z0 || z + dz > z1);
  const place = (x, z, v) => set(x, y, z, upstairs || shapeOf(v) === 'cube' ? v : stack(v, B.floor));
  let items = 0;
  const max = small ? 2 : upstairs ? 3 : 4;

  // A couch (two seats) against a wall, facing into the room.
  if (!small && !upstairs) {
    search: for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        for (const [wx, wz] of wallsOf(x, z)) {
          const ax = wz ? 1 : 0, az = wx ? 1 : 0; // along the wall
          if (free(x, z) && free(x + ax, z + az) && wallsOf(x + ax, z + az).some(([a, b]) => a === wx && b === wz)) {
            const q = faceDir(-wx, -wz);
            place(x, z, makeBlock(B.couch, q));
            place(x + ax, z + az, makeBlock(B.couch, q));
            items += 2;
            break search;
          }
        }
      }
  }
  // A chair at the table, a teddy by the bed, a bookshelf in a corner, a flower pot.
  const spots = [];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (free(x, z) && wallsOf(x, z).length) spots.push([x, z]);
  const near = (x, z, test) => SIDES4.find(([dx, dz]) => test(get(x + dx, y, z + dz)));
  for (const [x, z] of spots) {
    if (items >= max) break;
    if (!free(x, z)) continue;
    const table = near(x, z, v => v === B.planks && !upstairs);
    const bed = near(x, z, v => [B.red, B.concrete, B.bed].includes(blockId(itemOf(v))));
    const corner = wallsOf(x, z).length >= 2;
    if (table && rand() < 0.8) {
      place(x, z, makeBlock(B.chair, faceDir(table[0], table[1])));
    } else if (bed && rand() < 0.6) {
      const [wx, wz] = wallsOf(x, z)[0];
      place(x, z, makeBlock(B.teddy, faceDir(-wx, -wz)));
    } else if (corner && rand() < 0.5) {
      place(x, z, B.bookshelf);
    } else if (rand() < 0.35) {
      place(x, z, B.flowerPot);
    } else continue;
    items++;
  }
  // Pictures on the walls (not over windows), at eye height.
  let pictures = 0;
  for (let x = x0; x <= x1 && pictures < 2; x++)
    for (let z = z0; z <= z1 && pictures < 2; z++) {
      for (const [wx, wz] of wallsOf(x, z)) {
        const wall = get(x + wx, y + 1, z + wz);
        if (pictures >= 2 || get(x, y + 1, z) || !wall || shapeOf(wall) !== 'cube' || blockId(wall) === B.glass || nearEntry(x, z)) continue;
        if (rand() > 0.35) continue;
        const art = rand() < 0.5 ? B.painting : B.poster;
        set(x, y + 1, z, makeBlock(art, onWall(wx, wz) | (Math.floor(rand() * 4) << 2)));
        pictures++;
      }
    }
}

// The office towers: found by their tinted glass. Each floor nobody has changed gets desks,
// computers, chairs, plants and a whiteboard; the top floor is a fancy penthouse, and the
// lobby gets a reception desk (and someone to work at it).
export function furnishTowers({ each, get, set, canUse }) {
  const cols = new Map();
  each((x, y, z, v) => {
    if (blockId(v) === B.tintedGlass) cols.set(`${x},${z}`, [x, z]);
  });
  const seen = new Set(), towers = [];
  for (const [k, [sx, sz]] of cols) {
    if (seen.has(k)) continue;
    const group = [], queue = [[sx, sz]];
    seen.add(k);
    while (queue.length) {
      const [x, z] = queue.pop();
      group.push([x, z]);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const nk = `${x + dx},${z + dz}`;
        if (cols.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          queue.push([x + dx, z + dz]);
        }
      }
    }
    const xs = group.map(c => c[0]), zs = group.map(c => c[1]);
    const t = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    if (t.x1 - t.x0 < 6 || t.x1 - t.x0 !== t.z1 - t.z0) continue;
    const tower = furnishTower(t, get, set, canUse);
    if (tower) towers.push(tower);
  }
  return towers.sort((a, b) => b.size - a.size);
}

function furnishTower({ x0, x1, z0, z1 }, get, set, canUse) {
  const n = x1 - x0 - 1, ix0 = x0 + 1, iz0 = z0 + 1, ix1 = x1 - 1, iz1 = z1 - 1, mid = Math.floor(n / 2);
  // The front is the side with the doors.
  let front = null;
  for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) if (blockId(get(x, 0, z)) === B.door) front = z === z0 ? 'z0' : 'z1';
  for (let z = z0; z <= z1; z++) for (const x of [x0, x1]) if (blockId(get(x, 0, z)) === B.door) front = x === x0 ? 'x0' : 'x1';
  if (!front) return null;
  // Local spots: a across the front, b deeper inside. f points inside from the doors.
  const frame = {
    z0: { at: (a, b) => [ix0 + a, iz0 + b], f: [0, 1], r: [1, 0] },
    z1: { at: (a, b) => [ix1 - a, iz1 - b], f: [0, -1], r: [-1, 0] },
    x0: { at: (a, b) => [ix0 + b, iz1 - a], f: [1, 0], r: [0, -1] },
    x1: { at: (a, b) => [ix1 - b, iz0 + a], f: [-1, 0], r: [0, 1] },
  }[front];
  const { at, f, r } = frame;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!canUse(x, z)) return null;
  // The ladder and the pillar it leans on: keep clear around them.
  const keep = [];
  for (let x = ix0; x <= ix1; x++) for (let z = iz0; z <= iz1; z++) {
    const v = get(x, 1, z);
    if (blockId(v) === B.ladder || blockId(v) === B.concrete) keep.push([x, z]);
  }
  const kept = (x, z) => keep.some(([kx, kz]) => Math.abs(kx - x) <= 1 && Math.abs(kz - z) <= 1);
  // Floors: the marble slabs inside (the top one is the roof).
  let roof = 0;
  for (let y = 1; y < 64; y++) if (blockId(get(ix0 + mid, y, iz0 + mid)) === B.marble) roof = y;
  const floors = [0];
  for (let y = 4; y < roof; y += 4) if (blockId(get(ix0 + mid, y, iz0 + mid)) === B.marble) floors.push(y);
  const LIGHTS = new Set([B.ceilingLight, B.chandelier, B.ladder, B.concrete]);
  const untouched = (y0, y1) => {
    for (let x = ix0; x <= ix1; x++) for (let z = iz0; z <= iz1; z++) for (let y = y0; y <= y1; y++) {
      const v = get(x, y, z);
      if (v && !LIGHTS.has(blockId(v))) return false;
    }
    return true;
  };
  const dir = (k, [dx, dz]) => [dx * k, dz * k];
  let lobby = null;
  floors.forEach((fy, i) => {
    const top = i === floors.length - 1, y = fy + 1, ceil = top ? roof - 1 : floors[i + 1] - 1;
    if (!untouched(y, ceil)) return;
    const on = v => (fy === 0 ? stack(v, B.sidewalk) : v); // the lobby floor is sidewalk
    const put = (a, b, v, dy = 0) => {
      const [x, z] = at(a, b);
      if (a < 0 || b < 0 || a >= n || b >= n || kept(x, z) || get(x, (fy === 0 ? 0 : y) + dy, z) && !(fy === 0 && dy === 0)) return false;
      if (fy === 0 && dy === 0 && get(x, 0, z) !== B.sidewalk) return false;
      set(x, (fy === 0 ? 0 : y) + dy, z, dy === 0 ? on(v) : v);
      return true;
    };
    const wallPic = (a, b, art, design, dy = 1) => {
      const [x, z] = at(a, b);
      if (kept(x, z)) return;
      const [wx, wz] = a === 0 ? dir(-1, r) : a === n - 1 ? r : b === n - 1 ? f : dir(-1, f);
      if (!get(x, (fy === 0 ? 0 : y) + dy, z)) set(x, (fy === 0 ? 0 : y) + dy, z, makeBlock(art, onWall(wx, wz) | (design << 2)));
    };
    if (fy === 0) {
      // The lobby: a reception desk facing the doors, couches, plants and a fish tank.
      const back = n - 3;
      for (const a of [mid - 1, mid, mid + 1]) put(a, back, makeBlock(B.desk, faceDir(...f)));
      put(mid, back, makeBlock(B.computer, faceDir(...f)), 1);
      for (const b of [1, 2]) {
        put(0, b, makeBlock(B.couch, faceDir(...r)));
        put(n - 1, b, makeBlock(B.couch, faceDir(...dir(-1, r))));
      }
      put(0, 0, B.flowerPot);
      put(n - 1, 0, B.flowerPot);
      put(0, back - 1, B.fishTank);
      wallPic(n - 1, back - 1, B.painting, 1);
      const [lx, lz] = at(mid, n - 2);
      lobby = { x: lx + 0.5, y: 0, z: lz + 0.5, area: [ix0, iz0, ix1, iz1], face: Math.atan2(f[0], f[1]) };
      return;
    }
    if (top) {
      // The penthouse: couches on a rug, a grand piano, a fish tank, gold statues, a chandelier.
      for (let a = mid - 1; a <= mid + 1; a++) for (let b = n - 4; b <= n - 2; b++) put(a, b, B.carpet);
      for (let a = mid - 1; a <= mid + 1; a++) {
        const [x, z] = at(a, n - 2);
        if (blockId(get(x, y, z)) === B.carpet) set(x, y, z, stack(makeBlock(B.couch, faceDir(...dir(-1, f))), B.carpet));
      }
      put(1, 1, makeBlock(B.piano, faceDir(...f)));
      put(n - 1, mid, B.fishTank);
      put(0, n - 1, makeBlock(B.statue, faceDir(...f)));
      put(n - 1, n - 1, makeBlock(B.statue, faceDir(...f)));
      put(n - 1, 0, B.flowerPot);
      const [cx, cz] = at(mid, mid);
      if (!get(cx, ceil, cz)) set(cx, ceil, cz, B.chandelier);
      wallPic(0, mid, B.painting, 3);
      return;
    }
    // An office: rows of desks with computers and chairs, filing cabinets, a water cooler,
    // plants and a whiteboard.
    for (const b of [1, 4, 7]) {
      if (b + 1 >= n) continue;
      for (const a of [1, 3, 5, 7]) {
        if (a >= n - 1) continue;
        const [x, z] = at(a, b), [cx2, cz2] = at(a, b + 1);
        if (kept(x, z) || kept(cx2, cz2)) continue;
        if (put(a, b, makeBlock(B.desk, faceDir(...f)))) {
          put(a, b, makeBlock(B.computer, faceDir(...f)), 1);
          put(a, b + 1, makeBlock(B.officeChair, faceDir(...dir(-1, f))));
        }
      }
    }
    put(n - 1, 0, B.filing);
    put(n - 1, 1, B.filing);
    put(0, mid, B.cooler);
    put(0, 0, B.flowerPot);
    put(n - 1, n - 1, B.flowerPot);
    wallPic(0, 3, B.whiteboard, i % 4);
  });
  return { size: n, lobby };
}

// The Luxe Store: a fancy shop by a road, with gold trim, a glass front, chandeliers, a red
// carpet up to the counter and the store's best things on display. It belongs to the store
// (a claim), so nobody can knock it down. Returns where it is, or null if there's no room.
export function buildStore({ get, set, canUse }) {
  const roads = exitRoads();
  const L = 12, D = 11;
  for (const name of ['east', 'south', 'west', 'north', 'ringS', 'ringE', 'ringN', 'ringW']) {
    const road = roads[name];
    for (const side of [1, -1]) {
      for (let a = road.from + 2; a + L <= road.to - 1; a += 2) {
        const site = makeSite(road, side, a);
        if (!siteFree(site, L, D, 7, get, canUse)) continue;
        return storeAt(site, L, D, set);
      }
    }
  }
  return null;
}

function storeAt(site, L, D, set) {
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [ox, oz] = site.at(0, 0);
  const [fx, fz] = site.dirV; // from the road into the store
  const inward = faceDir(fx, fz), outward = faceDir(-fx, -fz);
  // The path from the road, lamps and flowers out front.
  for (let u = 0; u < L; u++) put(u, 0, 0, B.sidewalk);
  for (const u of [3, 8]) put(u, 0, 0, stack(B.lantern, B.sidewalk));
  for (const u of [1, 2, 9, 10]) put(u, 0, 0, stack(B.flowerPot, B.sidewalk));
  // Walls (marble with gold corners and a gold band), a glass front with double doors, and a roof.
  for (let u = 0; u < L; u++)
    for (let v = 1; v < D; v++) {
      const edgeU = u === 0 || u === L - 1, edgeV = v === 1 || v === D - 1;
      if (!edgeU && !edgeV) {
        put(u, 0, v, u === 5 || u === 6 ? B.carpet : B.floor);
        put(u, 4, v, B.marble);
        continue;
      }
      for (let y = 0; y < 5; y++) {
        let b = (edgeU && edgeV) || y === 3 ? B.gold : B.marble;
        if (y === 4) b = B.marble;
        if (v === 1 && !edgeU && y < 3) b = y === 0 && (u === 5 || u === 6) ? 0 : y === 1 && (u === 5 || u === 6) ? 0 : B.glass;
        if (b) put(u, y, v, b);
      }
    }
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  for (const u of [5, 6]) {
    put(u, 0, 1, makeBlock(B.door, doorFacing));
    put(u, 1, 1, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  // A glowing sign along the top of the front, and party lights under it.
  for (let u = 1; u < L - 1; u++) put(u, 5, 1, u % 2 ? B.neonPink : B.gold);
  for (let u = 0; u < L; u++) put(u, 2, 0, B.partyLights);
  // Inside: chandeliers, display pedestals with the store's best things, a disco ball, a
  // golden throne, and a counter at the back with a cash register.
  put(3, 3, 4, B.chandelier);
  put(8, 3, 4, B.chandelier);
  put(5, 3, 6, B.discoBall);
  for (const [u, v, item] of [[2, 3, B.diamond], [9, 3, B.trophy], [2, 6, B.statue], [9, 6, B.fishTank]]) {
    put(u, 0, v, B.gold);
    put(u, 1, v, item === B.statue ? makeBlock(item, outward) : item);
  }
  put(1, 0, 8, makeBlock(B.throne, faceDir(...site.dirU)));
  put(10, 0, 8, stack(makeBlock(B.piano, faceDir(-site.dirU[0], -site.dirU[1])), B.floor));
  for (const u of [4, 5, 6, 7]) put(u, 0, 8, stack(makeBlock(B.desk, inward), B.floor));
  put(5, 1, 8, makeBlock(B.register, inward));
  put(6, 1, 8, B.flowerPot);
  for (const [u, v] of [[1, 2], [10, 2]]) put(u, 0, v, stack(B.flowerPot, B.floor));
  const [px, pz] = site.pos(6, 9.5), [ax, az] = site.at(1, 2), [bx, bz] = site.at(L - 2, D - 2);
  const [cx0, cz0] = site.at(0, 0), [cx1, cz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(cx0, cx1), Math.min(cz0, cz1), Math.max(cx0, cx1), Math.max(cz0, cz1)];
  return {
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    place: { x: px, y: 0, z: pz, area: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)], face: Math.atan2(fx, fz), door: [ox, oz] },
    claim: { owner: 'Luxe Store', key: 'luxe store', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
  };
}

function siteFree(site, L, D, tall, get, canUse) {
  for (let u = -1; u <= L; u++)
    for (let v = 0; v <= D; v++) {
      const [x, z] = site.at(u, v);
      if (x < WORLD.min + 2 || x > WORLD.max - 2 || z < WORLD.min + 2 || z > WORLD.max - 2 || !canUse(x, z)) return false;
      for (let y = 0; y < tall; y++) if (get(x, y, z)) return false;
    }
  return true;
}

// A parking lot: two rows of five spaces either side of a driving lane, a way in from the
// road, street lamps, a P sign and a few parked cars.
function parkingLot(site, set) {
  const W = 19, D = 16;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  for (let u = 0; u < W; u++)
    for (let v = 0; v < D; v++) {
      const border = u === 0 || u === W - 1 || v === D - 1 || (v === 0 && (u < 6 || u > 12));
      put(u, 0, v, border ? B.sidewalk : B.road);
    }
  // Lines between the spaces (each space is 3 wide and 5 deep).
  const line = site.road.axis === 'x' ? B.parkingLine : B.parkingLineX;
  for (const u of [1, 4, 7, 10, 13, 16])
    for (const v of [1, 2, 3, 4, 5, 10, 11, 12, 13, 14]) put(u, 0, v, line);
  for (const [u, v] of [[0, 3], [0, 12], [W - 1, 3], [W - 1, 12]]) {
    for (let y = 0; y < 3; y++) put(u, y, v, B.black);
    put(u, 3, v, B.streetLamp);
  }
  put(5, 0, 0, B.black);
  put(5, 1, 0, B.black);
  put(5, 2, 0, B.parkingSign);
  // Parked cars, nose in. The middle space in the front row is the way in.
  const cars = [];
  for (const [row, i] of [[0, 0], [0, 3], [1, 1], [1, 4]]) {
    const [x, z] = site.pos(1 + 3 * i + 1.5, row === 0 ? 3.5 : 12.5);
    const f = row === 0 ? [-site.dirV[0], -site.dirV[1]] : site.dirV;
    cars.push({ kind: 'car', x, y: 0, z, h: Math.atan2(-f[0], -f[1]), landmark: true });
  }
  return cars;
}

// A glass skyscraper: a lobby with double doors, a floor every 4 blocks with ceiling lights,
// a ladder up a shaft in the back corner to the roof, and railings around the roof (the
// big one has a helipad on top).
function skyscraper(site, { size: S, height: H, style }, set) {
  const trim = style ? B.concrete : B.metal, band = style ? B.marble : B.concrete;
  const put = (i, y, j, b) => {
    const [x, z] = site.at(i + 1, j + 1);
    set(x, y, z, b);
  };
  // The plaza around it (and the lobby floor).
  for (let u = 0; u < S + 2; u++) for (let v = 0; v < S + 2; v++) put(u - 1, 0, v - 1, B.sidewalk);
  const Q = [1, S - 2], P = [2, S - 2]; // the pillar the ladder leans on, and the ladder shaft
  const ladderFacing = (() => {
    const e = site.edge(P[0] - Q[0], P[1] - Q[1]); // from the pillar toward the ladder
    return e === 4 ? 0 : e === 2 ? 1 : e === 1 ? 2 : 3;
  })();
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  const mid = Math.floor(S / 2);
  for (let y = 0; y < H; y++) {
    const slab = y === H - 1 || (y > 0 && y % 4 === 0);
    for (let i = 0; i < S; i++)
      for (let j = 0; j < S; j++) {
        const edgeI = i === 0 || i === S - 1, edgeJ = j === 0 || j === S - 1;
        if (i === Q[0] && j === Q[1]) put(i, y, j, B.concrete);
        else if (i === P[0] && j === P[1]) put(i, y, j, makeBlock(B.ladder, ladderFacing));
        else if (edgeI && edgeJ) put(i, y, j, trim);
        else if (edgeI || edgeJ) {
          if (slab) put(i, y, j, band);
          else if (j === 0 && y < 2 && (i === mid - 1 || i === mid)) put(i, y, j, makeBlock(B.door, doorFacing | (y ? DOOR_TOP : 0)));
          else put(i, y, j, y < 4 ? B.glass : B.tintedGlass);
        } else if (slab) put(i, y, j, B.marble);
      }
    // Lights hanging under each floor (a chandelier in the lobby).
    if (slab && y < H - 1) {
      if (y === 4) put(mid, 3, mid, B.chandelier);
      else for (const [i, j] of [[mid - 2, mid], [mid + 2, mid]]) put(i, y - 1, j, B.ceilingLight);
    }
  }
  // Up on the roof: railings all round, around the top of the ladder shaft, and corner lights.
  const roof = H;
  for (let i = 0; i < S; i++)
    for (let j = 0; j < S; j++) {
      let mask = 0;
      if (i === 0) mask |= site.edge(-1, 0);
      if (i === S - 1) mask |= site.edge(1, 0);
      if (j === 0) mask |= site.edge(0, -1);
      if (j === S - 1) mask |= site.edge(0, 1);
      if (i === P[0] && j === P[1]) mask = site.edge(1, 0) | site.edge(0, -1) | site.edge(0, 1); // open toward the pillar
      if (mask) put(i, roof, j, makeBlock(B.railing, mask));
    }
  for (const [i, j] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1]]) put(i, roof - 1, j, style ? B.neonBlue : B.neonPink);
  if (S >= 11) {
    // A rooftop helipad: an "H" on the roof.
    for (let i = 2; i <= S - 3; i++)
      for (let j = 2; j <= S - 3; j++) {
        const li = i - 2, lj = j - 2;
        const h = (li === 1 || li === 5) && lj >= 1 && lj <= 5 || (lj === 3 && li >= 1 && li <= 5);
        if (!(i === P[0] && j === P[1])) put(i, roof, j, h ? B.sidewalk : B.road);
      }
  }
}

// Saved worlds from before road lines could turn: a line whose neighbors run east-west is
// turned to run east-west too. get/set read and write the world.
export function orientRoadLines(keys, get, set) {
  const isLine = v => blockId(v) === B.line || blockId(v) === B.lineX;
  for (const key of keys) {
    const [x, y, z] = key.split(',').map(Number);
    const v = get(x, y, z);
    if (blockId(v) !== B.line) continue;
    const alongX = [-2, -1, 1, 2].some(d => isLine(get(x + d, y, z)));
    const alongZ = [-2, -1, 1, 2].some(d => isLine(get(x, y, z + d)));
    if (alongX && !alongZ) set(x, y, z, turnLine(v));
  }
}

// ---------- The lake ----------
// An oval lake with a wooden dock (railings, lanterns at the end) and three boats tied up
// beside it. It goes on the first patch of empty land big enough, starting near the beach
// (smaller if there's no room for a big one). Returns the boats and the area used, or null
// if there's no room anywhere.
export function buildLake({ get, set, canUse }) {
  for (const [W, D] of [[30, 22], [26, 20], [22, 18]]) {
    const lake = tryLake(W, D, get, set, canUse);
    if (lake) return lake;
  }
  return null;
}

function tryLake(W, D, get, set, canUse) {
  const margin = 2;
  const inside = (cx, cz, x, z) => ((x + 0.5 - cx) / (W / 2 - 0.5)) ** 2 + ((z + 0.5 - cz) / (D / 2 - 0.5)) ** 2 <= 1;
  const free = (cx, cz) => {
    for (let x = cx - W / 2 - margin; x <= cx + W / 2 + margin; x++)
      for (let z = cz - D / 2 - margin; z <= cz + D / 2 + margin + 2; z++) {
        if (x < WORLD.min + 2 || x > WORLD.max - 2 || z < WORLD.min + 2 || z > WORLD.max - 2 || !canUse(x, z)) return false;
        for (let y = 0; y < 5; y++) if (get(x, y, z)) return false;
      }
    return true;
  };
  const spots = [];
  for (let cx = -104; cx <= 104; cx += 2) for (let cz = -104; cz <= 104; cz += 2) spots.push([cx, cz]);
  spots.sort((a, b) => Math.hypot(a[0] - 62, a[1] - 104) - Math.hypot(b[0] - 62, b[1] - 104));
  const spot = spots.find(([cx, cz]) => free(cx, cz));
  if (!spot) return null;
  const [cx, cz] = spot;
  for (let x = cx - W / 2; x <= cx + W / 2; x++)
    for (let z = cz - D / 2; z <= cz + D / 2; z++) {
      if (inside(cx, cz, x, z)) set(x, 0, z, B.water);
      else if (inside(cx, cz, x - Math.sign(x + 0.5 - cx) * 1.5, z - Math.sign(z + 0.5 - cz) * 1.5) && (x * 7 + z * 3) % 5 === 0) set(x, 0, z, B.flowers);
    }
  // The dock: two planks wide, from the south shore out into the water, with railings
  // along its sides and end, and lanterns on the end posts.
  const shore = cz + D / 2, end = shore - 9;
  for (let z = end; z <= shore + 1; z++)
    for (const x of [cx, cx + 1]) {
      set(x, 0, z, B.planks);
      let edges = x === cx ? 8 : 2;
      if (z === end) edges |= 1;
      if (z <= shore - 1) set(x, 1, z, z === end ? stack(B.lantern, makeBlock(B.railing, edges)) : makeBlock(B.railing, edges));
    }
  for (const x of [cx - 1, cx + 2]) set(x, 0, shore + 2, B.tikiTorch);
  // Boats: one each side of the dock and one off its end (far enough apart to all fit).
  const colors = ['#f5f5f5', '#e53935', '#fdd835'];
  const boats = [[cx - 1.45, end + 2.4], [cx + 3.6, end + 2.4], [cx + 1, end - 3.2]].map(([x, z], i) => ({ kind: 'boat', color: colors[i], x, y: 0, z, h: 0, landmark: true }));
  return { cars: boats, area: [cx - W / 2 - 1, cz - D / 2 - 1, cx + W / 2 + 1, shore + 3] };
}
