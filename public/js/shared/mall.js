// BuildZone Mall, out by the Outer Loop (since v0.67): a big two-floor shopping mall with a glass
// front, a bright atrium in the middle (a fountain, plants, benches, and a glass roof), and
// moving escalators up to the second floor and back down (stand on them and they carry you).
// Downstairs: the Food Court (burgers, fries, noodles, sushi, bubble tea), the Sweet Spot candy
// shop, and Sporty Sam's (your very own skateboard or BMX bike!). Upstairs: Costume Corner (new
// hats to wear: a pirate hat, a chef's hat, bunny ears) and an arcade.
import { makeBlock, stack, SIGN } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = {
  road: 22, line: 56, lineX: 57, sidewalk: 24, white: 12, glass: 9, clear: 112, marble: 12, floor: 24, carpet: 35, wood: 25, railing: 54, stairs: 149,
  fountain: 120, plant: 67, bench: 102, table: 62, chair: 60, counter: 135, register: 86, shelf: 136, beachBall: 122, robot: 123, statue: 81, screens: 108,
  computer: 75, light: 41, chandelier: 42, neonPink: 50, neonBlue: 51, neonGreen: 52, streetLamp: 46, flowers: 27, metal: 11, couch: 61, trophy: 85,
};
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const MALL = { L: 64, D: 50 };
export const UPSTAIRS = 6; // (the second floor's floor: you stand at this height)
const BLD = [4, 59, 8, 45]; // (u0, u1, v0, v1)
const ATRIUM = [24, 39, 16, 37]; // (the hole in the middle, up through both floors)
const ESC = { up: [29, 30], down: [33, 34], v0: 32 }; // (the escalators: their columns, and where they start)

export function buildMall({ get, set, canUse, near = [-RING + 50, 150] }) {
  const site = findBigSite({ ...MALL, tall: 13, near, get, canUse });
  return site ? mallAt(site, set) : null;
}

function mallAt(site, set) {
  const { L, D } = MALL;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const outward = faceDir(-fx, -fz), inward = faceDir(fx, fz), toLow = faceDir(-ux, -uz), toHigh = faceDir(ux, uz);
  const up = (faceDir(fx, fz) + 2) % 4; // (a Stairs block going up toward +v)
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };
  const [b0, b1, bv0, bv1] = BLD, [a0, a1, av0, av1] = ATRIUM;
  const inAtrium = (u, v) => u >= a0 && u <= a1 && v >= av0 && v <= av1;
  const on = (u, y, v, b) => put(u, y, v, y === 0 ? stack(b, B.floor) : b);

  // ---------- The parking lot ----------
  for (let u = 2; u <= 61; u++) for (let v = 0; v <= 7; v++) put(u, 0, v, B.road);
  for (let u = 2; u <= 61; u += 4) for (let v = 1; v <= 5; v++) if (u < 27 || u > 36) put(u, 0, v, site.road.axis === 'x' ? B.line : B.lineX);
  for (let u = 27; u <= 36; u++) for (let v = 1; v <= 7; v++) put(u, 0, v, B.sidewalk); // (the walk in)
  for (const [u, v] of [[2, 0], [20, 0], [43, 0], [61, 0]]) put(u, 0, v, B.streetLamp);

  // ---------- The building: two floors ----------
  for (let u = b0; u <= b1; u++)
    for (let v = bv0; v <= bv1; v++) {
      const edgeU = u === b0 || u === b1, edgeV = v === bv0 || v === bv1, edge = edgeU || edgeV;
      // The roof (glass over the atrium), the second floor (open over the atrium), the floors.
      put(u, 12, v, inAtrium(u, v) ? B.clear : B.white);
      if (!edge) {
        put(u, 0, v, B.floor);
        if (!inAtrium(u, v)) put(u, UPSTAIRS - 1, v, B.marble);
        continue;
      }
      for (let y = 0; y < 12; y++) {
        if (v === bv0 && u >= 28 && u <= 35 && y < 3) continue; // (the big front doors: wide open)
        const front = v === bv0;
        const window = front ? ((y >= 1 && y <= 3) || (y >= 7 && y <= 10)) && (u - b0) % 6 !== 0 : (y >= 2 && y <= 3) || (y >= 8 && y <= 9); // (the front: big windows between pillars)
        put(u, y, v, window && (front || (u + v) % 4 === 0) ? B.glass : B.white);
      }
      put(u, 13, v, (u + v) % 3 === 0 ? B.neonPink : (u + v) % 3 === 1 ? B.neonBlue : B.neonGreen); // (neon all round the top)
    }
  sign(31, 3, bv0 - 1, outward, '🛍️ BUILDZONE MALL · Food, candy, costumes, sports!');
  sign(31, 9, bv0 - 1, outward, '🛍️ BUILDZONE MALL');
  // A railing round the hole on the second floor (open where the escalators come up).
  for (let u = a0 - 1; u <= a1 + 1; u++)
    for (const [v, dv] of [[av0 - 1, 1], [av1 + 1, -1]]) if (!(v === av1 + 1 && u >= ESC.up[0] && u <= ESC.down[1])) put(u, UPSTAIRS, v, makeBlock(B.railing, site.edge(0, dv)));
  for (let v = av0; v <= av1; v++) for (const [u, du] of [[a0 - 1, 1], [a1 + 1, -1]]) put(u, UPSTAIRS, v, makeBlock(B.railing, site.edge(du, 0)));

  // ---------- The atrium ----------
  // The fountain in the middle, plants, benches, a chandelier hanging down.
  put(31, 0, 23, B.fountain);
  for (const [u, v] of [[26, 18], [37, 18], [26, 28], [37, 28]]) on(u, 0, v, B.plant);
  for (const [u, v] of [[28, 20], [35, 20], [28, 27], [35, 27]]) put(u, 0, v, B.bench);
  put(31, 11, 26, B.chandelier);
  // The escalators: steps going up (and the other pair coming down), glass sides, and a sign.
  for (let k = 0; k < UPSTAIRS; k++) {
    const v = ESC.v0 + k;
    for (const u of [...ESC.up, ...ESC.down]) {
      put(u, k, v, makeBlock(B.stairs, up));
      for (let y = 0; y < k; y++) put(u, y, v, B.white);
    }
    for (const u of [ESC.up[0] - 1, ESC.up[1] + 1, ESC.down[0] - 1, ESC.down[1] + 1]) for (let y = 0; y <= k; y++) put(u, y, v, B.glass);
  }
  sign(ESC.up[0] - 1, 1, ESC.v0 - 1, outward, '⬆️ Escalator up · ⬇️ Escalator down');

  // ---------- Downstairs: the Food Court, the candy shop, Sporty Sam's ----------
  // The Food Court (front left): counters along the wall, tables and chairs.
  for (let u = 6; u <= 21; u++) on(u, 0, bv0 + 1, makeBlock(B.counter, inward));
  on(13, 0, bv0 + 2, makeBlock(B.register, inward));
  for (const [u, v] of [[8, 14], [13, 14], [18, 14], [8, 19], [13, 19], [18, 19]]) {
    on(u, 0, v, B.table);
    on(u - 1, 0, v, makeBlock(B.chair, toHigh));
    on(u + 1, 0, v, makeBlock(B.chair, toLow));
  }
  sign(13, 3, bv0 + 1, inward, '🍔 FOOD COURT 🍟🍜🍣🧋');
  // The Sweet Spot (front right): shelves of candy in neon light, a counter.
  for (let u = 43; u <= 57; u++) for (const v of [bv0 + 1]) on(u, 0, v, makeBlock(B.shelf, inward));
  for (let u = 44; u <= 56; u += 4) for (const v of [14, 18]) on(u, 0, v, makeBlock(B.counter, toLow));
  on(50, 0, 21, makeBlock(B.register, outward));
  for (let u = 42; u <= 58; u++) put(u, 4, bv0 + 1, (u % 2 ? B.neonPink : B.neonGreen));
  sign(50, 3, bv0 + 1, inward, '🍬 SWEET SPOT 🍫🍩🧁');
  // Sporty Sam's (back right): skateboards and bikes on show, balls, a trophy, the counter.
  for (let u = 43; u <= 57; u++) on(u, 0, bv1 - 1, makeBlock(B.shelf, outward));
  for (const u of [44, 47, 50]) on(u, 0, 40, B.beachBall);
  on(55, 0, 40, B.trophy);
  on(50, 0, 34, makeBlock(B.register, inward));
  for (let u = 46; u <= 54; u++) on(u, 0, 35, B.carpet);
  sign(50, 3, bv1 - 1, outward, '🛹 SPORTY SAM\'S · Your own skateboard or BMX!');

  // ---------- Upstairs: Costume Corner and the arcade ----------
  // Costume Corner (back left, upstairs): mannequins (statues) in a row, a mirror wall, the till.
  for (let u = 6; u <= 20; u += 3) put(u, UPSTAIRS, bv1 - 2, makeBlock(B.statue, outward));
  for (let u = 5; u <= 21; u++) for (let y = UPSTAIRS; y < UPSTAIRS + 3; y++) put(u, y, bv1 - 1, 37); // (mirrors)
  put(13, UPSTAIRS, 36, makeBlock(B.register, inward));
  sign(13, UPSTAIRS + 3, bv1 - 1, outward, '🎭 COSTUME CORNER · Hats! 🏴‍☠️👨‍🍳🐰');
  // The arcade (front right, upstairs): screens and computers in rows, neon, couches.
  for (let u = 43; u <= 57; u += 2) for (const v of [11, 15]) {
    put(u, UPSTAIRS, v, makeBlock(B.screens, inward));
    put(u, UPSTAIRS, v + 1, makeBlock(B.chair, outward));
  }
  for (let u = 44; u <= 56; u += 4) put(u, UPSTAIRS, 20, makeBlock(B.couch, outward));
  sign(50, UPSTAIRS + 3, bv0 + 1, inward, '🎮 ARCADE');
  // (lights upstairs and down)
  for (const [u, v] of [[10, 14], [50, 14], [10, 38], [50, 38]]) for (const y of [4, 11]) put(u, y, v, B.light);
  // Flowers along the front.
  for (let u = b0; u <= b1; u++) if (u < 27 || u > 36) put(u, 0, bv0 - 1, B.flowers);

  // Where things are, in the world.
  const at = (u, v) => site.pos(u, v);
  const box = (ua, ub, va, vb) => {
    const [x0, z0] = site.at(ua, va), [x1, z1] = site.at(ub, vb);
    return [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1) + 1, Math.max(z0, z1) + 1];
  };
  const npc = (u, v, y, face) => {
    const [x, z] = at(u, v), [qa, qb] = [at(u - 2, v - 1), at(u + 2, v + 1)];
    return { x, y, z, face, area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] };
  };
  const [ax0, az0] = site.at(0, 0), [ax1, az1] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
  const [px, pz] = at(31.5, 12);
  const rise = [fx, fz];
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Mall', key: 'mall', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      // (escalators: where each one is, and which way it carries you)
      mall: { x: px, y: 0, z: pz, rect, escalators: [{ rect: box(ESC.up[0], ESC.up[1], ESC.v0, ESC.v0 + UPSTAIRS - 1), dir: rise }, { rect: box(ESC.down[0], ESC.down[1], ESC.v0, ESC.v0 + UPSTAIRS - 1), dir: [-rise[0], -rise[1]] }] },
      mall_food: npc(13.5, bv0 + 3.5, 0, Math.atan2(-fx, -fz)),
      mall_candy: npc(50.5, 22.5, 0, Math.atan2(-fx, -fz)),
      mall_sports: npc(50.5, 33.5, 0, Math.atan2(-fx, -fz)),
      mall_costume: npc(13.5, 35, UPSTAIRS, Math.atan2(-fx, -fz)),
    },
  };
}
