// Builds the starting world: a main town around spawn, villages in each corner,
// roads joining them, parks, playgrounds, trees, flowers and parked cars.
import { WORLD, DOOR_TOP, makeBlock } from './blocks.js';

const B = {
  grass: 1, dirt: 2, stone: 3, cobble: 4, brick: 5, planks: 6, log: 7, leaves: 8, glass: 9,
  sand: 10, metal: 11, marble: 12, concrete: 13, red: 14, blue: 15, yellow: 16, black: 17,
  lamp: 18, bounce: 19, tiles: 20, door: 21, road: 22, line: 23, sidewalk: 24, floor: 25,
  roof: 26, flowers: 27, rainbow: 28, pink: 29, mint: 30, sky: 31, orange: 32, purple: 33,
  green: 34, carpet: 35, water: 36,
};

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
    put(x, 3, z, B.lamp);
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
        if (crossings.get(k) === 1 && ((a % 4) + 4) % 4 < 2) ground.set(k, B.line);
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
    for (let u = 0; u < w; u++) if (u !== du && chance(0.7)) P(u, 0, -1, B.flowers);

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
    P(Math.floor(w / 2), H, Math.floor(d / 2), B.lamp);
    if (twoStory) P(1, H, 1, B.lamp);

    // A little furniture: a bed, a table with flowers and a rug.
    if (twoStory) {
      P(w - 2, 4, 1, B.red);
      P(w - 2, 4, 2, B.concrete);
    } else {
      P(w - 2, 0, d - 2, B.red);
      P(w - 2, 0, d - 3, B.concrete);
      P(1, 0, d - 2, B.planks);
      P(1, 1, d - 2, B.flowers);
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
    for (let u = 1; u < w - 1; u++) P(u, 5, 0, u % 2 ? stripe[0] : B.lamp);
    P(1, 3, 2, B.lamp); P(w - 2, 3, 2, B.lamp);
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
    // Playground
    const px = x0 + mid + 2, pz = z0 + mid + 2;
    fill(px, 0, pz, px + 5, 0, pz + 5, B.sand);
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
  const villages = [[-84, -84], [84, -84], [-84, 84], [84, 84]].map(([x, z], i) =>
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
  return { blocks, cars: placed };
}
