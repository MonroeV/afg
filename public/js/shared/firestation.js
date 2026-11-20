// The BuildZone Fire Station, out by the Outer Loop (since v0.54): red brick, with two big open
// bays (a fire truck waiting in each), and the firefighters' room next door (bunk beds, a table,
// a couch). Fire Chief Flint stands out front. Now and then a fire breaks out somewhere in
// town (see fires.js): the alarm rings, and whoever's quickest in a fire truck puts it out.
import { makeBlock, stack, SIGN, DOOR_TOP, BED_FOOT } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = { road: 22, sidewalk: 24, floor: 25, brick: 5, red: 14, white: 12, concrete: 13, glass: 9, door: 21, ceilingLight: 41, lantern: 45, bed: 64, table: 62, chair: 60, couch: 61, bookshelf: 63, flowers: 27 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
export const FIRE_STATION = { L: 34, D: 24 };
const H = 6; // (how tall the walls are)
const BAYS = [[3, 9], [12, 18]]; // (u0, u1 of each open bay, on the front wall)
const FRONT = 5, BACK = 20, LEFT = 2, RIGHT = 31, SPLIT = 20; // (walls; the firefighters' room is right of SPLIT)

export function buildFireStation({ get, set, canUse, near = [-160, RING + 30] }) {
  const site = findBigSite({ ...FIRE_STATION, tall: H + 2, near, get, canUse });
  return site ? stationAt(site, set) : null;
}

function stationAt(site, set) {
  const { L, D } = FIRE_STATION;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [rx, rz] = site.dirU;
  const outward = faceDir(-fx, -fz), inward = faceDir(fx, fz);
  const signs = [];
  // A driveway out to the road from each bay, and a path to the door.
  for (const [u0, u1] of BAYS) for (let u = u0; u <= u1; u++) for (let v = 0; v < FRONT; v++) put(u, 0, v, u === u0 || u === u1 ? B.sidewalk : B.road);
  for (let u = 25; u <= 27; u++) for (let v = 0; v < FRONT; v++) put(u, 0, v, B.sidewalk);
  // The building: brick walls with a red stripe along the top, and a flat white roof.
  const inBay = u => BAYS.some(([u0, u1]) => u > u0 && u < u1);
  for (let u = LEFT; u <= RIGHT; u++)
    for (let v = FRONT; v <= BACK; v++) {
      const wall = u === LEFT || u === RIGHT || v === FRONT || v === BACK || (u === SPLIT && v !== 12 && v !== 13);
      put(u, H, v, B.white);
      if (!wall) {
        put(u, 0, v, u > SPLIT ? B.floor : B.road);
        continue;
      }
      for (let y = 0; y < H; y++) {
        if (v === FRONT && inBay(u) && y < 4) continue; // (the open bays: room for a fire truck)
        const window = (y === 1 || y === 2) && u > SPLIT && (v === FRONT || v === BACK) && u % 3 === 0;
        put(u, y, v, y === H - 1 ? B.red : window ? B.glass : B.brick);
      }
    }
  // A red-and-white striped header over each bay, and a light inside.
  for (const [u0, u1] of BAYS) {
    for (let u = u0 + 1; u < u1; u++) put(u, 4, FRONT, u % 2 ? B.red : B.white);
    put(Math.floor((u0 + u1) / 2), H - 1, 12, B.ceilingLight);
    for (const u of [u0, u1]) put(u, 0, FRONT - 1, B.lantern);
  }
  // The door into the firefighters' room.
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  put(26, 0, FRONT, makeBlock(B.door, doorFacing));
  put(26, 1, FRONT, makeBlock(B.door, doorFacing | DOOR_TOP));
  // Inside: bunks along the back, a table with chairs, a couch, a bookshelf, lights.
  for (const u of [22, 24, 29]) {
    put(u, 0, BACK - 2, stack(makeBlock(B.bed, inward), B.floor));
    put(u, 0, BACK - 1, stack(makeBlock(B.bed, inward | BED_FOOT), B.floor));
  }
  put(26, 0, 11, stack(B.table, B.floor));
  put(26, 0, 10, stack(makeBlock(B.chair, inward), B.floor));
  put(26, 0, 12, stack(makeBlock(B.chair, outward), B.floor));
  for (let v = 8; v <= 10; v++) put(RIGHT - 1, 0, v, stack(makeBlock(B.couch, faceDir(-rx, -rz)), B.floor));
  for (let y = 0; y < 2; y++) put(SPLIT + 1, y, BACK - 1, B.bookshelf);
  for (const [u, v] of [[23, 9], [28, 14]]) put(u, H - 1, v, B.ceilingLight);
  // Flowers by the door, and the big sign over the bays.
  for (const u of [24, 28]) put(u, 0, FRONT - 1, B.flowers);
  const [sx, sz] = site.at(10, FRONT);
  set(sx - fx, 5, sz - fz, makeBlock(SIGN, onWall(fx, fz)));
  signs.push([sx - fx, 5, sz - fz, '🚒 FIRE STATION 🔥 Firefighters to the rescue!']);
  const [tx, tz] = site.at(26, FRONT);
  set(tx - fx, 3, tz - fz, makeBlock(SIGN, onWall(fx, fz)));
  signs.push([tx - fx, 3, tz - fz, '🧑‍🚒 Chief Flint: hop in a truck! 🚨 G: lights and hose']);

  // The fire trucks: one in each bay, facing out toward the road.
  const h = Math.atan2(fx, fz);
  const cars = BAYS.map(([u0, u1]) => {
    const [x, z] = site.pos((u0 + u1) / 2 + 0.5, 12.5);
    return { kind: 'firetruck', x, y: 0, z, h, color: '#d32f2f' };
  });
  const [ax, az] = site.at(0, 0), [bx, bz] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  const [px, pz] = site.pos(17, 2.5), [cx, cz] = site.pos(22.5, 2.5);
  const [qa, qb] = [site.pos(20, 1), site.pos(24, 4)];
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Fire Station', key: 'firestation', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      firestation: { x: px, y: 0, z: pz, rect, bays: cars.map(c => [c.x, c.z]) },
      firechief: { x: cx, y: 0, z: cz, face: Math.atan2(fx, fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}

// ---------- Fires in town ----------
// While somebody's driving a fire truck (and only then: there's no point otherwise!), a call
// comes in: a fire on a road somewhere in town. Nothing burns down (it's just flames and smoke),
// but it needs putting out! Spray it with the truck's hose (G, twice: lights, then water) till
// it's out. The alarm and the 🔥 arrow are just for whoever's in a fire truck. Nobody in a fire
// truck for a while? Then any fire still burning goes out by itself.
export const FIRE_CALL = 12; // seconds after you get in a fire truck till the first call
export const FIRE_GAP = 60; // seconds after a fire's out till the next call
export const FIRE_OUT = 60; // seconds with nobody in a fire truck before a fire goes out by itself
export const FIRE_LIFE = 600; // (and nobody comes at all: it burns out after this long anyway)
export const DOUSE = 6; // how much each squirt of the hose puts out (of 100)
export const FIRE_REWARD = 3; // coins for putting one out
export const HOSE_RANGE = 15; // how far the hose reaches (with the Firefighters' badge: more)
