// Ramp City Skate Park, out by the Outer Loop (since v0.64): a big smooth concrete plaza with
// kicker ramps, a fun box (ramps up both ends of a block-high box), a half-pipe, quarter pipes
// along the back, rails, benches and lamps, and a rack of skateboards and BMX bikes to ride.
// The ramps are Stairs blocks: on foot you walk up the steps; on a board or a bike you ride up
// and fly off the top (see driveSkate in cars.js). In the air: A/D spin, Space flip!
import { makeBlock, stack, SIGN } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = { sidewalk: 24, stone: 3, stairs: 149, railing: 54, streetLamp: 46, bench: 102, neonPink: 50, neonBlue: 51, neonGreen: 52, cone: 101, flowers: 27, metal: 11 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const SKATEPARK = { L: 52, D: 42 };
export const TRICK_COINS = 1; // (for a big trick: a 360 or a flip)

export function buildSkatePark({ get, set, canUse, near = [RING - 50, 250] }) {
  const site = findBigSite({ ...SKATEPARK, tall: 6, near, get, canUse });
  return site ? skateAt(site, set) : null;
}

function skateAt(site, set) {
  const { L, D } = SKATEPARK;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const outward = faceDir(-fx, -fz), inward = faceDir(fx, fz);
  // A ramp that goes up toward (du, dv) in the site (a Stairs block faces the other way: down).
  const rampFacing = (du, dv) => (faceDir(du * ux + dv * fx, du * uz + dv * fz) + 2) % 4;
  const ramp = (u, y, v, du, dv) => put(u, y, v, makeBlock(B.stairs, rampFacing(du, dv)));
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };

  // ---------- The plaza ----------
  for (let u = 2; u < L - 2; u++) for (let v = 2; v < D - 2; v++) put(u, 0, v, B.sidewalk);
  // A fence all round (open at the front, the way in).
  for (let u = 1; u < L - 1; u++)
    for (const [v, dv] of [[1, 1], [D - 2, -1]]) if (!(v === 1 && u >= 22 && u <= 29)) put(u, 0, v, makeBlock(B.railing, site.edge(0, dv)));
  for (let v = 2; v < D - 2; v++) for (const [u, du] of [[1, 1], [L - 2, -1]]) put(u, 0, v, makeBlock(B.railing, site.edge(du, 0)));
  for (const [u, v] of [[2, 2], [L - 3, 2], [2, D - 3], [L - 3, D - 3], [21, 1], [30, 1]]) put(u, 0, v, B.streetLamp);
  sign(31, 1, 0, outward, '🛹 RAMP CITY SKATE PARK · Boards & BMX bikes!');
  put(31, 0, 0, B.metal);
  sign(25, 1, 3, inward, '🛹 Up a ramp fast! In the air: A/D spin · Space flip');
  put(25, 0, 3, B.metal);

  // ---------- Kickers ----------
  // Single ramps out in the open: ride up and fly.
  for (let v = 9; v <= 11; v++) ramp(10, 0, v, 1, 0);
  for (let v = 9; v <= 11; v++) ramp(40, 0, v, -1, 0);
  for (let u = 24; u <= 27; u++) ramp(u, 0, 13, 0, 1);

  // ---------- The fun box ----------
  // A box one block high with a ramp up each end (and a rail along the top).
  for (let u = 19; u <= 26; u++) for (let v = 19; v <= 22; v++) put(u, 0, v, B.stone);
  for (let v = 19; v <= 22; v++) {
    ramp(18, 0, v, 1, 0);
    ramp(27, 0, v, -1, 0);
  }
  for (let u = 20; u <= 25; u++) put(u, 1, 20, makeBlock(B.railing, site.edge(0, 1) | site.edge(0, -1)));

  // ---------- The half-pipe ----------
  // Two walls, two blocks high, with ramps up the inside of each, facing each other.
  for (let v = 17; v <= 24; v++) {
    for (const [u, du] of [[34, -1], [45, 1]]) {
      // (the ramp's foot, the ramp up onto the wall, and the wall behind)
      ramp(u, 0, v, du, 0);
      put(u + du, 0, v, B.stone);
      ramp(u + du, 1, v, du, 0);
      for (let y = 0; y < 2; y++) put(u + du * 2, y, v, B.stone);
    }
  }
  for (let v = 17; v <= 24; v++) for (const u of [32, 47]) put(u, 2, v, makeBlock(B.railing, site.edge(u < 40 ? 1 : -1, 0))); // (a rail along the top)

  // ---------- Quarter pipes along the back ----------
  for (let u = 6; u <= 30; u++) {
    ramp(u, 0, 34, 0, 1);
    put(u, 0, 35, B.stone);
    ramp(u, 1, 35, 0, 1);
    for (let y = 0; y < 2; y++) put(u, y, 36, B.stone);
    put(u, 2, 36, u % 3 === 0 ? B.neonPink : u % 3 === 1 ? B.neonBlue : B.neonGreen); // (neon along the top)
  }

  // ---------- Rails and benches ----------
  for (let u = 8; u <= 15; u++) put(u, 0, 27, makeBlock(B.railing, site.edge(0, 1) | site.edge(0, -1)));
  for (let v = 28; v <= 32; v++) put(44, 0, v, makeBlock(B.railing, site.edge(1, 0) | site.edge(-1, 0)));
  for (const [u, v] of [[6, 4], [16, 4], [36, 4], [46, 4]]) put(u, 0, v, B.bench);
  for (const [u, v] of [[14, 15], [36, 14], [30, 28]]) put(u, 0, v, stack(B.cone, B.sidewalk));

  // ---------- The boards and bikes ----------
  // In a row by the way in (more than 5 apart: see worldgen.js), facing into the park.
  const h = Math.atan2(-fx, -fz), cars = []; // (noses toward +v: into the park)
  [[4, 'skateboard', '#e53935'], [10, 'bmx', '#1e88e5'], [16, 'skateboard', '#fdd835'], [35, 'bmx', '#43a047'], [41, 'skateboard', '#8e24aa'], [47, 'bmx', '#ff7043']].forEach(([u, kind, color]) => {
    const [x, z] = site.pos(u + 0.5, 6.5);
    cars.push({ kind, color, x, y: 0, z, h });
  });

  const [ax0, az0] = site.at(0, 0), [ax1, az1] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
  const [px, pz] = site.pos(26, 5.5), [qa, qb] = [site.pos(20, 3), site.pos(31, 7)];
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Ramp City Skate Park', key: 'skatepark', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      skatepark: { x: px, y: 0, z: pz, rect },
      skatepark_host: { x: px, y: 0, z: pz, face: Math.atan2(fx, fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}
