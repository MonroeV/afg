// The far country: the land past the old edge of the world (it came with the 640 x 640 map).
// South: Sunny Shores, a sandy beach on the sea (a pier for fishing, boats, a lifeguard tower,
// beach umbrellas and palm trees), with a campground just up from it: camper vans parked at
// their camp sites, tents, campfires and a ranger station. East: Big Rock Quarry, a stepped stone
// pit with dump trucks and a chute to fill them with dirt (G dumps it somewhere else). West, past
// the woods: Happy Acres Farm, with a red barn, a silo, fields of flowers and pumpkins, hay bales
// and pickup trucks. North: more snowy pine forest. Roads lead out to all of it.
//
// It all goes past the old edge of the world, where nobody could build before. Only the roads
// out to it cross the old land, and those only go on empty land (like the frontier's roads).
import { WORLD, SIGN, SNOW_LINE, makeBlock, stack } from './blocks.js';
import { makeRoads, rng, bumps, faceDir, tree, pine, skiHeight, SKI, OLD_EDGE, FAR_ROADS } from './frontier.js';

const B = {
  grass: 1, dirt: 2, stone: 3, cobble: 4, planks: 6, log: 7, leaves: 8, glass: 9, sand: 10, metal: 11, concrete: 13,
  red: 14, door: 21, road: 22, line: 23, sidewalk: 24, floor: 25, roof: 26, flowers: 27, carpet: 35, water: 36,
  lantern: 45, railing: 54, lineX: 55, chair: 60, table: 62, desk: 73, officeChair: 74, snow: 87, snowman: 91,
  fishingStool: 95, tent: 97, umbrella: 98, hayBale: 99, pumpkin: 100, cone: 101, picnic: 102,
};
const DOOR_TOP = 8;

const SX = FAR_ROADS.south; // the road down to the campground (the town's south road, carried on)
const CAMP = { x: SX, z0: 246, z1: 278 };
export const QUARRY = { x: 272, z: FAR_ROADS.east, floor: 11, rim: 28 };
// Drive a dump truck in under the chute (and wait a moment) to fill it up.
export const CHUTE = { x: QUARRY.x + 4, y: 4.6, z: QUARRY.z };
const FARM = { x: -302, z: FAR_ROADS.west }; // the road runs along the front of the farm to here

// Where the sea's shore is along the south edge (it curves round into a bay).
const seaShore = x => 296 + Math.round(2 * Math.sin(x * 0.045) + 1.5 * Math.sin(x * 0.11 + 1) + Math.max(0, Math.abs(x - SX) - 95) * 0.9);

// get(x, y, z) reads the world, set(x, y, z, v) writes it, canUse(x, z) says whether a column of
// land may be built on, canPave(x, z) whether a sidewalk there may become road (where a new road
// joins an old one). finishMountain: saved worlds also get the bit of the ski mountain that was
// past the old edge. Returns the vehicles to park, permanent claims, the areas used, the places
// (for the town's people) and the signs' words.
export function buildFarCountry({ get, set, canUse, canPave = canUse, finishMountain = false }) {
  const rand = rng(4242);
  const inWorld = (x, z) => x >= WORLD.min && x <= WORLD.max && z >= WORLD.min && z <= WORLD.max;
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
  const used = new Set(), areas = [], cars = [], claims = [], signs = [], places = {};
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
  // A noticeboard: two posts (a log, planks, a lantern on top) side by side, with the signs on
  // their (sx, sz) side, facing whoever comes from there. y: the ground it stands on.
  const board = (x, z, sx, sz, title, how, y = 0) => {
    const [ax, az] = [Math.abs(sz), Math.abs(sx)];
    const facing = sz > 0 ? 0 : sx > 0 ? 1 : sz < 0 ? 2 : 3;
    [[x, z, title], [x + ax, z + az, how]].forEach(([cx, cz, text]) => {
      put(cx, y, cz, B.log);
      put(cx, y + 1, cz, B.planks);
      put(cx, y + 2, cz, B.lantern);
      sign(cx + sx, y + 1, cz + sz, facing, text);
    });
  };
  const { road, corridor } = makeRoads({ get, set, put, canUse, canPave, inWorld, area });
  // A road that heads out along `line` (across the old land, wherever there's the least in the
  // way), then over to `want` just past the old edge, and on along it to `end`.
  const roadOut = (axis, want, from, to, edge, end) => {
    const choices = [want, want - 4, want + 4, want - 8, want + 8, want - 12, want + 12];
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const line = corridor(axis, lo, hi, choices);
    road(axis, line, lo, hi);
    if (line !== want) road(axis === 'x' ? 'z' : 'x', edge, Math.min(line, want) - 3, Math.max(line, want) + 3);
    road(axis, want, Math.min(edge, end), Math.max(edge, end));
  };

  // ---------- Roads out ----------

  // South to the campground, east to the quarry, and west (through the woods) to the farm.
  roadOut('z', SX, 88, OLD_EDGE.max, OLD_EDGE.max + 3, CAMP.z0 - 1);
  roadOut('x', QUARRY.z, 88, OLD_EDGE.max, OLD_EDGE.max + 3, QUARRY.x - QUARRY.floor);
  roadOut('x', FARM.z, -153, OLD_EDGE.min, OLD_EDGE.min - 3, FARM.x);

  // ---------- Sunny Shores ----------

  // The pier (first, so it goes in where the sand and the sea will be): two planks wide, out into
  // the sea, railings along its sides with fishing stools among them, lanterns on the end.
  const pierX = SX - 12, pierShore = seaShore(pierX);
  const pierEnd = pierShore + 13;
  for (let z = pierShore - 2; z <= pierEnd; z++)
    for (const x of [pierX, pierX + 1]) {
      put(x, 0, z, B.planks);
      if (z < pierShore) continue;
      let edges = x === pierX ? 8 : 2;
      if (z === pierEnd) edges |= 4;
      put(x, 1, z, z === pierEnd ? stack(B.lantern, makeBlock(B.railing, edges)) : makeBlock(B.railing, edges));
    }
  for (const [i, z] of [pierShore + 4, pierShore + 7, pierShore + 10].entries()) {
    const x = i % 2 ? pierX + 1 : pierX, rail = get(x, 1, z);
    if (rail) set(x, 1, z, stack(makeBlock(B.fishingStool, i % 2 ? faceDir(1, 0) : faceDir(-1, 0)), rail));
  }
  cars.push({ kind: 'boat', color: '#26c6da', x: pierX - 2.2, y: 0, z: pierShore + 8.5, h: 0, landmark: true });
  cars.push({ kind: 'boat', color: '#ffca28', x: pierX + 4.2, y: 0, z: pierShore + 6.5, h: 0, landmark: true });
  area(pierX - 5, pierShore - 2, pierX + 7, pierEnd + 2);

  // The lifeguard tower (on stilts, with steps up the back and a chair looking out to sea).
  const towerX = SX + 16, towerZ = seaShore(towerX) - 6;
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) fill(towerX + dx, 1, towerZ + dz, towerX + dx, 2, towerZ + dz, B.log);
  fill(towerX - 1, 3, towerZ - 1, towerX + 1, 3, towerZ + 1, B.planks);
  for (const [dz, h] of [[-4, 1], [-3, 2], [-2, 3]]) fill(towerX, 1, towerZ + dz, towerX, h, towerZ + dz, B.planks);
  put(towerX, 4, towerZ + 1, makeBlock(B.chair, faceDir(0, 1)));
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) fill(towerX + dx, 4, towerZ + dz, towerX + dx, 5, towerZ + dz, B.log);
  fill(towerX - 1, 6, towerZ - 1, towerX + 1, 6, towerZ + 1, B.red);
  area(towerX - 2, towerZ - 5, towerX + 2, towerZ + 2);

  // The sea and the beach.
  for (let x = SX - 140; x <= SX + 140; x++) {
    const shore = seaShore(x);
    for (let z = shore - 11; z <= WORLD.max; z++) {
      if (z >= shore) put(x, 0, z, B.water);
      else if (z >= shore - 9 - ((x * 7 + 3) % 3 === 0 ? 1 : 0)) put(x, 0, z, B.sand);
    }
  }
  area(SX - 140, Math.min(...[SX - 140, SX, SX + 140].map(seaShore)) - 12, SX + 140, WORLD.max);
  // Beach umbrellas with towels, and palm trees at the back of the beach.
  for (let x = SX - 72; x <= SX + 72; x += 12) {
    if (Math.abs(x - pierX) < 5 || Math.abs(x - towerX) < 5) continue;
    const z = seaShore(x) - 4;
    put(x, 1, z, B.umbrella);
    put(x + 1, 1, z, B.carpet);
    put(x + 1, 1, z - 1, B.carpet);
  }
  for (let x = SX - 66; x <= SX + 66; x += 22) {
    if (Math.abs(x - pierX) < 5 || Math.abs(x - towerX) < 5 || Math.abs(x - SX) < 4) continue;
    const z = seaShore(x) - 10;
    if (get(x, 0, z) !== B.sand) continue;
    fill(x, 1, z, x, 5, z, B.log);
    put(x, 6, z, B.leaves);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      put(x + dx, 6, z + dz, B.leaves);
      put(x + dx * 2, 6, z + dz * 2, B.leaves);
      put(x + dx * 3, 5, z + dz * 3, B.leaves);
    }
  }

  // ---------- The campground ----------

  const { x: cx, z0, z1 } = CAMP;
  // The camp road: a loop round a grassy middle, joining the road from town at the top.
  for (let x = cx - 18; x <= cx + 18; x++)
    for (let z = z0; z <= z1; z++) {
      const loop = x <= cx - 16 || x >= cx + 16 || z <= z0 + 2 || z >= z1 - 2;
      if (loop) put(x, 0, z, B.road);
    }
  area(cx - 30, z0 - 1, cx + 30, z1 + 1);
  // Camp sites round the outside of the loop: a pad to park on (four of them have a camper van
  // on it), a tent, a campfire (a log in a ring of stones) and a picnic table.
  const campers = ['#ff8a65', '#4fc3f7', '#aed581', '#ffd54f'];
  let camper = 0;
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const sz = z0 + 2 + i * 10, out = cx + side * 19; // the pad's edge by the loop road
      for (let k = 0; k < 7; k++) for (let dz = 0; dz < 3; dz++) put(out + side * k, 0, sz + 2 + dz, B.sidewalk);
      if ((side < 0 ? i < 2 : i !== 1) && camper < campers.length) {
        cars.push({ kind: 'camper', color: campers[camper++], x: out + side * 3.5 + 0.5, y: 0, z: sz + 3.5, h: side < 0 ? -Math.PI / 2 : Math.PI / 2, landmark: true });
      }
      const back = cx + side * 27;
      put(back, 0, sz + 7, makeBlock(B.tent, faceDir(-side, 0)));
      put(back - side * 3, 0, sz + 7, B.log);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(back - side * 3 + dx, 0, sz + 7 + dz, B.cobble);
      put(cx + side * 22, 0, sz + 8, makeBlock(B.picnic, faceDir(0, -1)));
      put(cx + side * 19, 0, sz + 1, B.lantern);
    }
  // In the middle: the ranger station, and a big campfire with log seats round it.
  const rx0 = cx - 4, rz0 = z0 + 4, rx1 = cx + 3, rz1 = z0 + 9;
  for (let x = rx0; x <= rx1; x++)
    for (let z = rz0; z <= rz1; z++) {
      if (x !== rx0 && x !== rx1 && z !== rz0 && z !== rz1) {
        put(x, 0, z, B.floor);
        continue;
      }
      for (let y = 0; y < 3; y++) {
        if (z === rz0 && (x === cx - 1 || x === cx) && y < 2) continue; // the doorway
        const window = y === 1 && x !== rx0 && x !== rx1 && z !== rz0 && (x + z) % 2 === 0;
        put(x, y, z, window ? B.glass : B.log);
      }
    }
  put(cx - 1, 0, rz0, makeBlock(B.door, 2));
  put(cx - 1, 1, rz0, makeBlock(B.door, 2 | DOOR_TOP));
  put(cx, 0, rz0, makeBlock(B.door, 2));
  put(cx, 1, rz0, makeBlock(B.door, 2 | DOOR_TOP));
  fill(rx0 - 1, 3, rz0 - 1, rx1 + 1, 3, rz1 + 1, B.roof);
  put(rx0 + 1, 0, rz1 - 1, stack(makeBlock(B.desk, faceDir(0, -1)), B.floor));
  put(rx0 + 1, 0, rz1 - 2, stack(makeBlock(B.officeChair, faceDir(0, 1)), B.floor));
  put(rx1 - 1, 1, rz1 - 1, B.lantern);
  const fz = z0 + 19;
  put(cx, 0, fz, B.log);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(cx + dx, 0, fz + dz, B.cobble);
  for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) put(cx + dx, 0, fz + dz, B.log);
  for (const [dx, dz] of [[-9, -3], [9, -3], [-9, 4], [9, 4]]) put(cx + dx, 0, fz + dz, makeBlock(B.picnic, faceDir(0, -1)));
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) put(cx + dx, 0, fz + dz, B.lantern);
  places.camp = { x: cx + 2.5, y: 0, z: fz - 2.5 };
  // A wooden path down to the beach.
  for (let z = z1 + 1; z <= z1 + 16; z++) {
    if (get(cx, 0, z) === B.sand) break;
    for (const x of [cx - 1, cx, cx + 1]) put(x, 0, z, B.floor);
  }
  board(cx + 5, z0 - 4, 0, -1, '⛺ SUNNY SHORES CAMPGROUND', 'Pick a spot! In a camper van, G pops the roof up');
  board(cx + 3, z1 + 3, 0, -1, '🏖️ SUNNY SHORES BEACH', 'Fishing on the pier, and boats to ride!');

  // ---------- Big Rock Quarry ----------

  const { x: qx, z: qz, floor: fr, rim } = QUARRY;
  // The chute first (its legs stand on the quarry floor): steel legs, a hopper full of dirt on top.
  const { x: hx, z: hz } = CHUTE;
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) fill(hx + dx, 0, hz + dz, hx + dx, 4, hz + dz, B.metal);
  fill(hx - 2, 5, hz - 2, hx + 2, 5, hz + 2, B.metal);
  fill(hx - 1, 6, hz - 1, hx + 1, 6, hz + 1, B.dirt);
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) put(hx + dx, 6, hz + dz, B.lantern);
  sign(hx - 3, 2, hz - 2, 3, '⛏️ Drive a dump truck in under the chute and wait: it fills up with dirt!');
  sign(hx - 3, 2, hz + 2, 3, 'Then drive off and press G to dump it (on land you can build on)');
  // Heaps of sand and stone on the floor.
  for (const [px, pz, v] of [[qx + 2, qz - 7, B.sand], [qx + 2, qz + 7, B.cobble]]) {
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const h = 3 - Math.max(Math.abs(dx), Math.abs(dz)) - (Math.abs(dx) + Math.abs(dz) > 3 ? 1 : 0);
        if (h > 0) fill(px + dx, 0, pz + dz, px + dx, h - 1, pz + dz, v);
      }
  }
  // The pit: a flat floor, then terraces stepping up and out to the rim (grassy on the outside),
  // with a way in from the road on the west.
  for (let x = qx - rim; x <= qx + rim; x++)
    for (let z = qz - rim; z <= qz + rim; z++) {
      const d = Math.hypot(x - qx, z - qz);
      if (d >= rim) continue;
      if (d < fr) {
        put(x, 0, z, B.sidewalk);
        continue;
      }
      if (x < qx && Math.abs(z - qz) <= 4) continue; // (the way in)
      const inner = 1 + Math.floor((d - fr) / 2.4), outer = Math.floor((rim - d) / 1.2);
      const h = Math.max(0, Math.min(6, inner, outer));
      for (let y = 0; y < h; y++) {
        const top = y === h - 1;
        put(x, y, z, !top ? B.stone : outer < inner ? B.grass : bumps(x * 2, z * 2) > 0.7 ? B.cobble : B.stone);
      }
    }
  for (let x = qx - rim; x < qx - fr; x += 3) for (const dz of [-4, 4]) put(x, 0, qz + dz, B.cone);
  claims.push({ owner: 'Big Rock Quarry', key: 'big rock quarry', x0: qx - rim, z0: qz - rim, x1: qx + rim, z1: qz + rim, createdAt: 0, permanent: true });
  area(qx - rim - 1, qz - rim - 1, qx + rim + 1, qz + rim + 1);
  cars.push({ kind: 'dump', color: '#fdd835', x: qx - 4.5, y: 0, z: qz + 1.5, h: -Math.PI / 2, landmark: true });
  cars.push({ kind: 'dump', color: '#ff9800', x: qx - 4.5, y: 0, z: qz - 5.5, h: -Math.PI / 2, landmark: true });
  places.quarry = { x: qx - 6.5, y: 0, z: qz - 2.5 };
  // The site office, by the road in (concrete, with a window and a desk inside), a pickup truck
  // outside, and the sign.
  const ox0 = qx - rim - 9, oz0 = qz - 12, ox1 = ox0 + 5, oz1 = oz0 + 4;
  for (let x = ox0; x <= ox1; x++)
    for (let z = oz0; z <= oz1; z++) {
      if (x !== ox0 && x !== ox1 && z !== oz0 && z !== oz1) continue;
      for (let y = 0; y < 3; y++) {
        if (z === oz1 && x === ox0 + 2 && y < 2) continue;
        put(x, y, z, y === 1 && z === oz1 && x === ox0 + 4 ? B.glass : B.concrete);
      }
    }
  put(ox0 + 2, 0, oz1, makeBlock(B.door, 0));
  put(ox0 + 2, 1, oz1, makeBlock(B.door, DOOR_TOP));
  fill(ox0, 3, oz0, ox1, 3, oz1, B.concrete);
  put(ox0 + 2, 0, oz0 + 1, makeBlock(B.desk, faceDir(0, 1)));
  put(ox0 + 2, 0, oz0 + 2, makeBlock(B.officeChair, faceDir(0, -1)));
  area(ox0 - 1, oz0 - 1, ox1 + 1, oz1 + 1);
  cars.push({ kind: 'pickup', color: '#1565c0', x: ox1 + 3.5, y: 0, z: oz0 + 2, h: 0, landmark: true });
  board(qx - rim - 2, qz + 5, -1, 0, '⛏️ BIG ROCK QUARRY', 'Fill a dump truck under the chute, then G dumps it!');

  // ---------- Happy Acres Farm ----------

  const fz0 = FARM.z;
  // The big red barn (north of the road), its doors facing the road, hay inside.
  const bx0 = -298, bz0 = fz0 - 16, bx1 = bx0 + 10, bz1 = bz0 + 8;
  for (let x = bx0; x <= bx1; x++)
    for (let z = bz0; z <= bz1; z++) {
      if (x !== bx0 && x !== bx1 && z !== bz0 && z !== bz1) continue;
      const corner = (x === bx0 || x === bx1) && (z === bz0 || z === bz1);
      for (let y = 0; y < 5; y++) {
        if (x === bx1 && z >= bz0 + 3 && z <= bz0 + 5 && y < 3) continue; // the big doorway
        put(x, y, z, corner || y === 4 ? B.planks : B.red);
      }
    }
  fill(bx0 - 1, 5, bz0 - 1, bx1 + 1, 5, bz1 + 1, B.roof);
  fill(bx0 - 1, 6, bz0, bx1 + 1, 6, bz1, B.roof);
  fill(bx0 - 1, 7, bz0 + 2, bx1 + 1, 7, bz1 - 2, B.roof);
  fill(bx0 - 1, 8, bz0 + 4, bx1 + 1, 8, bz0 + 4, B.roof);
  for (let x = bx0 + 1; x <= bx0 + 3; x++) for (let z = bz0 + 1; z <= bz0 + 2; z++) for (let y = 0; y < 2; y++) put(x, y, z, makeBlock(B.hayBale, faceDir(1, 0)));
  cars.push({ kind: 'pickup', color: '#c62828', x: bx0 + 6.5, y: 0, z: bz0 + 4.5, h: -Math.PI / 2, landmark: true });
  // The silo.
  fill(bx0 - 4, 0, bz0 + 1, bx0 - 2, 9, bz0 + 3, B.metal);
  fill(bx0 - 4, 10, bz0 + 1, bx0 - 2, 10, bz0 + 3, B.roof);
  put(bx0 - 3, 11, bz0 + 2, B.roof);
  // Hay bales by the barn, and a pickup in the yard.
  for (const [dx, dz, y] of [[2, 0, 0], [2, 1, 0], [3, 0, 0], [2, 0, 1]]) put(bx1 + dx, y, bz0 + dz, makeBlock(B.hayBale, faceDir(0, 1)));
  cars.push({ kind: 'pickup', color: '#2e7d32', x: bx1 + 6.5, y: 0, z: bz0 + 2.5, h: 0, landmark: true });
  area(bx0 - 5, bz0 - 2, bx1 + 8, bz1 + 1);
  places.farm = { x: bx1 + 3.5, y: 0, z: bz1 + 2.5 };
  // Two fields south of the road, fenced in (with a gate each): rows of flowers, and a pumpkin patch.
  for (const [fx0, crop] of [[-300, B.flowers], [-285, B.pumpkin]]) {
    const fx1 = fx0 + 12, f0 = fz0 + 6, f1 = f0 + 10;
    for (let x = fx0; x <= fx1; x++)
      for (let z = f0; z <= f1; z++) {
        put(x, 0, z, B.dirt);
        if ((z - f0) % 2 === 0 && (crop === B.flowers || rand() < 0.35)) put(x, 1, z, crop);
      }
    for (let x = fx0; x <= fx1; x++) {
      if (Math.abs(x - (fx0 + 6)) > 1) put(x, 0, f0 - 1, makeBlock(B.railing, 4)); // (the gate's in the middle)
      put(x, 0, f1 + 1, makeBlock(B.railing, 1));
    }
    for (let z = f0; z <= f1; z++) {
      put(fx0 - 1, 0, z, makeBlock(B.railing, 2));
      put(fx1 + 1, 0, z, makeBlock(B.railing, 8));
    }
    area(fx0 - 1, f0 - 1, fx1 + 1, f1 + 1);
  }
  board(-268, fz0 - 6, 1, 0, '🚜 HAPPY ACRES FARM', 'Pumpkins, flowers, hay and pickups. Claim it and move in!');

  // ---------- Trees ----------

  // Snowy pines up north (past the old edge), and trees in the open country to the east and west.
  if (finishMountain) {
    // (Saved worlds: the ski mountain's far side was cut off by the old edge of the world.)
    for (let x = SKI.px - SKI.radius - 1; x <= SKI.px + SKI.radius + 1; x++)
      for (let z = SKI.pz - SKI.radius - 1; z < OLD_EDGE.min + 1; z++) {
        const h = skiHeight(x, z);
        for (let y = 0; y < h; y++) put(x, y, z, y === h - 1 ? B.snow : B.stone);
      }
  }
  mark(SKI.px - SKI.radius - 3, SKI.pz - SKI.radius - 3, SKI.px + SKI.radius + 3, SKI.pz + SKI.radius + 3);
  let pines = 0, tries = 0;
  while (pines < 60 && tries++ < 4000) {
    const x = WORLD.min + 4 + Math.floor(rand() * (WORLD.max - WORLD.min - 8)), z = WORLD.min + 4 + Math.floor(rand() * (OLD_EDGE.min - WORLD.min - 6));
    if (!free(x, z, 3) || !clearAt(x, z, 9, 1)) continue;
    pine(put, x, z, 0, 5 + Math.floor(rand() * 3));
    mark(x - 1, z - 1, x + 1, z + 1);
    pines++;
  }
  for (const [x, z] of [[-60, -250], [70, -262], [150, -240], [-180, -270]]) if (free(x, z, 1) && clearAt(x, z)) put(x, 0, z, makeBlock(B.snowman, faceDir(0, 1)));
  let trees = 0;
  tries = 0;
  while (trees < 80 && tries++ < 5000) {
    const east = rand() < 0.5;
    const x = east ? OLD_EDGE.max + 4 + Math.floor(rand() * (WORLD.max - OLD_EDGE.max - 8)) : WORLD.min + 4 + Math.floor(rand() * (OLD_EDGE.min - WORLD.min - 8));
    const z = OLD_EDGE.min + Math.floor(rand() * (Math.min(WORLD.max - 4, seaShore(x) - 14) - OLD_EDGE.min));
    if (!free(x, z, 3) || !clearAt(x, z, 9, 1)) continue;
    if (z < SNOW_LINE) pine(put, x, z, 0, 5 + Math.floor(rand() * 3)); // (up north, in the snow)
    else tree(put, x, z, 4 + Math.floor(rand() * 3), rand);
    mark(x - 1, z - 1, x + 1, z + 1);
    trees++;
  }
  // And some round the campground (but not on the beach).
  trees = 0;
  tries = 0;
  while (trees < 24 && tries++ < 2000) {
    const x = cx - 70 + Math.floor(rand() * 140), z = OLD_EDGE.max + 4 + Math.floor(rand() * 50);
    if (z > seaShore(x) - 14 || !free(x, z, 3) || !clearAt(x, z, 9, 1)) continue;
    tree(put, x, z, 4 + Math.floor(rand() * 3), rand);
    mark(x - 1, z - 1, x + 1, z + 1);
    trees++;
  }

  return { cars, claims, areas, count, places, signs };
}
