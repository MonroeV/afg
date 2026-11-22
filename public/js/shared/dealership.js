// BuildZone Motors, the car dealership out by the Outer Loop (since v0.57): a big outdoor lot full
// of cars for sale (price tags floating over them), flags and bunting on tall poles, and a glass
// showroom with marble pillars, neon along the roof, a canopy over the wide drive-out entrance,
// the fanciest cars on display under chandeliers, a red carpet up to the sales desk and a comfy
// waiting area. Dealer Dana is at the desk. Right-click a car to buy it: it's yours (only you can
// drive it), and a new one rolls onto the lot a little later.
import { makeBlock, stack, SIGN } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = {
  road: 22, sidewalk: 24, parkingLine: 56, parkingLineX: 57, marble: 12, glass: 59, carpet: 35, neonBlue: 51, neonPink: 50,
  red: 14, blue: 15, yellow: 16, gold: 38, chandelier: 42, ceilingLight: 41, streetLamp: 46, partyLights: 49, flowerPot: 67,
  desk: 73, officeChair: 74, register: 86, couch: 61, plant: 67, flowers: 27, trophy: 85, statue: 81,
};
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
export const DEALERSHIP = { L: 56, D: 36 };
// What's for sale, and what it costs (coins).
export const CAR_PRICES = { car: 30, pickup: 45, camper: 60, sports: 90, monster: 120, rv: 200 };
// The kinds each spot sells: the lot has everyday ones, the showroom the fancy ones.
// The sign on the lot (since v0.70 it tells you how to sell a car back): [before, now].
export const SELL_SIGN = ['🔑 Buy it, drive it home! Only you can drive it', '💰 Selling yours? Park it here, click it with the 🚩'];
export const LOT_KINDS = ['car', 'car', 'pickup', 'sports', 'camper'];
export const SHOW_KINDS = ['sports', 'monster', 'rv', 'camper'];
export const CAR_COLORS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#f5f5f5', '#212121', '#8e24aa', '#ff7043', '#00acc1', '#c0c0c0'];
const LOT = [5, 11, 17, 38, 44, 50]; // (along the lot, u: two rows of six, the driveway in the middle)
const LOT_ROWS = [5.5, 12.5];
const SHOW = [[13, 23.5, 'sports'], [21, 25.5, 'monster'], [35, 25.5, 'rv'], [43, 23.5, 'camper']];
const S0 = 8, S1 = 47, SV0 = 17, SV1 = 34, SH = 7; // (the showroom: u, v and how tall)
const BAY = [25, 30]; // (the drive-out entrance, in the front wall)

export function buildDealership({ get, set, canUse, near = [RING + 30, -170] }) {
  const site = findBigSite({ ...DEALERSHIP, tall: SH + 3, near, get, canUse });
  return site ? dealershipAt(site, set) : null;
}

// A new car for a spot (when the last one's sold): what kind, what color, and the price.
export function newCarFor(kinds, rand = Math.random) {
  const kind = kinds[Math.floor(rand() * kinds.length)];
  return { kind, color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)], price: CAR_PRICES[kind] };
}

function dealershipAt(site, set) {
  const { L, D } = DEALERSHIP;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const outward = faceDir(-fx, -fz);
  const axisX = site.road.axis === 'x';
  const lineAcross = axisX ? B.parkingLine : B.parkingLineX; // (a white line across the lot, between spaces)
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };

  // ---------- The lot ----------
  // Asphalt all over, a sidewalk along the front (and the driveway through it), white lines
  // between the spaces.
  for (let u = 1; u < L - 1; u++) for (let v = 0; v <= 15; v++) put(u, 0, v, v <= 1 && (u < 24 || u > 31) ? B.sidewalk : B.road);
  for (const row of LOT_ROWS)
    for (const u of LOT) for (const du of [-3, 3]) for (let v = Math.floor(row) - 2; v <= Math.floor(row) + 2; v++) put(u + du, 0, v, lineAcross);
  // Flag poles (marble, a flag on top) down both sides and along the front, with party lights.
  const flags = [B.red, B.blue, B.yellow];
  let fi = 0;
  for (const [u, v] of [[1, 2], [1, 8], [1, 14], [L - 2, 2], [L - 2, 8], [L - 2, 14], [9, 1], [22, 1], [33, 1], [46, 1]]) {
    for (let y = 0; y < 5; y++) put(u, y, v, B.marble);
    put(u, 5, v, B.partyLights);
    put(u, 6, v, flags[fi++ % 3]);
  }
  // Street lamps to light the lot up at night.
  for (const u of [14, 41]) put(u, 0, 15, B.streetLamp);

  // ---------- The showroom ----------
  for (let u = S0; u <= S1; u++)
    for (let v = SV0; v <= SV1; v++) {
      const edge = u === S0 || u === S1 || v === SV0 || v === SV1;
      put(u, 0, v, B.sidewalk); // (a pale, shiny floor)
      put(u, SH, v, B.marble); // (the roof)
      if (!edge) continue;
      const pillar = (u - S0) % 6 === 0 || u === S1 || v === SV1 || (v - SV0) % 6 === 0 && (u === S0 || u === S1);
      for (let y = 0; y < SH; y++) {
        if (v === SV0 && u >= BAY[0] && u <= BAY[1] && y < 4) continue; // (the drive-out entrance)
        put(u, y, v, pillar ? B.marble : B.glass);
      }
      // Neon all round the top edge: blue, with pink at the corners.
      put(u, SH + 1, v, (u === S0 || u === S1) && (v === SV0 || v === SV1) ? B.neonPink : B.neonBlue);
    }
  // A canopy over the entrance, held up on two marble posts, with lights under it.
  for (let u = BAY[0] - 2; u <= BAY[1] + 2; u++) for (let v = SV0 - 3; v < SV0; v++) put(u, SH - 2, v, B.marble);
  for (const u of [BAY[0] - 2, BAY[1] + 2]) for (let y = 0; y < SH - 2; y++) put(u, y, SV0 - 3, B.marble);
  for (const u of [BAY[0], BAY[1]]) put(u, SH - 3, SV0 - 2, B.ceilingLight);
  // The big sign over the entrance, and one on each side of the lot.
  const [ex, ez] = site.at((BAY[0] + BAY[1]) / 2, SV0);
  // (on the front of the canopy)
  set(Math.floor(ex - fx * 4), SH - 2, Math.floor(ez - fz * 4), makeBlock(SIGN, onWall(fx, fz)));
  signs.push([Math.floor(ex - fx * 4), SH - 2, Math.floor(ez - fz * 4), '🚗 BUILDZONE MOTORS ✨ New cars! Great prices!']);
  sign(9, 2, 2, outward, '💰 Cars for sale! Right-click one to buy it 🚗');
  sign(46, 2, 2, outward, SELL_SIGN[1]);
  // Inside: a red carpet from the entrance to the sales desk, the display cars under chandeliers,
  // the desk (Dana's), a waiting area, plants and a trophy or two.
  for (let v = SV0 + 1; v <= 29; v++) for (const u of [27, 28]) put(u, 0, v, B.carpet);
  for (const [u, v] of SHOW) put(Math.floor(u), SH - 1, Math.floor(v), B.chandelier);
  for (const [u, v] of [[16, 30], [40, 30], [27, 23], [28, 23]]) put(u, SH - 1, v, B.ceilingLight);
  for (let u = 25; u <= 30; u++) put(u, 0, 31, stack(makeBlock(B.desk, outward), B.sidewalk));
  put(27, 1, 31, makeBlock(B.register, outward));
  for (const u of [26, 29]) put(u, 0, 32, stack(makeBlock(B.officeChair, outward), B.sidewalk));
  for (const u of [11, 12, 13]) put(u, 0, 32, stack(makeBlock(B.couch, outward), B.sidewalk)); // (the waiting area)
  for (const u of [42, 43, 44]) put(u, 0, 32, stack(makeBlock(B.couch, outward), B.sidewalk));
  for (const [u, v] of [[S0 + 1, SV0 + 1], [S1 - 1, SV0 + 1], [S0 + 1, SV1 - 1], [S1 - 1, SV1 - 1], [24, 31], [31, 31]]) put(u, 0, v, stack(B.flowerPot, B.sidewalk));
  put(25, 1, 31, B.trophy);
  for (const u of [10, 45]) put(u, 0, 30, stack(makeBlock(B.statue, outward), B.sidewalk));
  // Flowers along the front of the showroom.
  for (let u = S0; u <= S1; u++) if (u < BAY[0] - 2 || u > BAY[1] + 2) put(u, 0, SV0 - 1, B.flowers);

  // ---------- The cars for sale ----------
  // On the lot, noses toward the road (ready to drive off); in the showroom, facing the windows.
  const h = Math.atan2(fx, fz), cars = [];
  let n = 0;
  const pick = kinds => newCarFor(kinds, () => ((n++ * 0.6180339887) % 1)); // (a mix, the same every time)
  for (const row of LOT_ROWS)
    for (const u of LOT) {
      const [x, z] = site.pos(u + 0.5, row);
      cars.push({ ...pick(LOT_KINDS), x, y: 0, z, h, dealer: 'lot' });
    }
  for (const [u, v, kind] of SHOW) {
    const [x, z] = site.pos(u + 0.5, v);
    cars.push({ kind, color: CAR_COLORS[n++ % CAR_COLORS.length], price: CAR_PRICES[kind], x, y: 0, z, h, dealer: 'show' });
  }

  const [ax, az] = site.at(0, 0), [bx, bz] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  const [px, pz] = site.pos(27.5, 8), [dx, dz] = site.pos(27.5, 32.5);
  const [qa, qb] = [site.pos(26.5, 32.2), site.pos(29.5, 33)];
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Motors', key: 'dealer', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      dealer: { x: px, y: 0, z: pz, rect, along: [ux, uz] },
      dealer_desk: { x: dx, y: 0, z: dz, face: Math.atan2(fx, fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}

// The town's ordinary cars: just a few now (the dealership has the rest, for sale). Which of a
// list of cars to keep: the `keep` nearest the middle of town.
export const TOWN_CARS = 4;
export function townCarsToKeep(list, keep = TOWN_CARS) {
  return [...list].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, keep);
}
