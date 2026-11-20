// BuildZone Hospital, out by the Outer Loop (since v0.65): a big white hospital with red crosses
// on the front, an ambulance bay under a canopy (two ambulances: G for the lights and siren), a
// lobby with a reception desk and a waiting room, a row of patient rooms with beds, Dr. Hart's
// office, and a helipad on the roof.
//
// Ouch! A big fall or a hard crash and you're hurt (🤕: you walk a bit slower). Come to the
// hospital and lie in one of its beds to feel better (a brave-patient sticker: +2 🪙), or get a
// friend to drive you here in an ambulance: ride in it and when it stops in the ambulance bay,
// you're all better (and the driver gets a thank-you).
import { makeBlock, stack, SIGN, BED_FOOT } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = {
  road: 22, line: 23, sidewalk: 24, white: 12, glass: 9, red: 14, yellow: 16, floor: 24, carpet: 35, door: 21,
  bed: 64, chair: 60, couch: 61, desk: 73, computer: 75, officeChair: 74, plant: 67, ceilingLight: 41, tv: 108, metal: 11, streetLamp: 46, flowers: 27, cabinet: 76, cooler: 77,
};
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const HOSPITAL = { L: 52, D: 40 };
export const HEAL_COINS = 2, RESCUE_COINS = 3;
const BLD = [4, 47, 9, 36], H = 6; // (the building: u0, u1, v0, v1; and how tall)
const BAY = [34, 45, 1, 7]; // (the ambulance bay, under the canopy)
const ROOMS = [6, 11, 16, 21, 26, 31, 36, 41]; // (the patient rooms along the back: each 5 wide)

export function buildHospital({ get, set, canUse, near = [-RING - 40, -330] }) {
  const site = findBigSite({ ...HOSPITAL, tall: 9, near, get, canUse });
  return site ? hospitalAt(site, set) : null;
}

function hospitalAt(site, set) {
  const { L, D } = HOSPITAL;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const outward = faceDir(-fx, -fz), inward = faceDir(fx, fz);
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };
  const [b0, b1, bv0, bv1] = BLD;

  // ---------- Out front ----------
  // A drive-up lane to the ambulance bay, a path to the front doors, flowers, lamps.
  for (let u = 30; u <= 46; u++) for (let v = 0; v <= 8; v++) put(u, 0, v, B.road);
  for (let u = 30; u <= 46; u++) put(u, 0, 0, u % 2 ? B.road : B.line);
  for (let u = 18; u <= 23; u++) for (let v = 0; v <= 8; v++) put(u, 0, v, B.sidewalk);
  for (let u = 2; u <= 28; u++) if (u < 18 || u > 23) put(u, 0, 7, B.flowers);
  for (const [u, v] of [[17, 1], [24, 1], [29, 1], [47, 1]]) put(u, 0, v, B.streetLamp);
  sign(25, 1, 0, outward, '🏥 BUILDZONE HOSPITAL · Feeling hurt? Come on in!');
  put(25, 0, 0, B.metal);
  // The canopy over the ambulance bay, on white posts, with a sign.
  const [c0, c1, cv0, cv1] = BAY;
  for (let u = c0; u <= c1; u++) for (let v = cv0 + 2; v <= cv1 + 1; v++) put(u, 4, v, B.white);
  for (const u of [c0, c1]) for (const v of [cv0 + 2, cv1]) for (let y = 0; y < 4; y++) put(u, y, v, B.white);
  sign(Math.floor((c0 + c1) / 2), 3, cv0 + 2, outward, '🚑 AMBULANCE BAY · Stop here to drop off patients!');

  // ---------- The building ----------
  for (let u = b0; u <= b1; u++)
    for (let v = bv0; v <= bv1; v++) {
      const edgeU = u === b0 || u === b1, edgeV = v === bv0 || v === bv1;
      put(u, H, v, B.white);
      if (!edgeU && !edgeV) {
        put(u, 0, v, v <= 22 ? B.floor : 25);
        continue;
      }
      for (let y = 0; y < H; y++) {
        if (v === bv0 && u >= 19 && u <= 22 && y < 3) continue; // (the big front doors)
        if (v === bv0 && u >= 37 && u <= 42 && y < 3) continue; // (the ER doors, from the ambulance bay)
        const window = y >= 2 && y <= 3 && ((edgeV && !edgeU && u % 4 === 2) || (edgeU && !edgeV && v % 4 === 1));
        put(u, y, v, window ? B.glass : B.white);
      }
    }
  // Red crosses on the front (and a red stripe along it).
  for (const cu of [10, 30]) {
    for (let y = 2; y <= 4; y++) put(cu, y, bv0, B.red);
    for (const du of [-1, 1]) put(cu + du, 3, bv0, B.red);
  }
  for (let u = b0; u <= b1; u++) if (!((u >= 19 && u <= 22) || (u >= 37 && u <= 42))) put(u, 1, bv0, B.red);
  sign(20, 4, bv0 - 1, outward, '🏥 HOSPITAL');
  // The roof: a helipad (a yellow H) with lights round it.
  for (let v = 16; v <= 26; v++) for (const u of [20, 26]) put(u, H, v, B.yellow);
  for (let u = 21; u <= 25; u++) put(u, H, 21, B.yellow);
  for (const [u, v] of [[17, 13], [29, 13], [17, 29], [29, 29]]) put(u, H + 1, v, 18);

  // ---------- Inside ----------
  // The lobby: reception desk, the waiting room (couches and chairs), plants, a TV.
  for (let u = 18; u <= 23; u++) put(u, 0, 15, stack(makeBlock(B.desk, outward), B.floor));
  put(19, 1, 15, makeBlock(B.computer, outward));
  for (const u of [19, 22]) put(u, 0, 16, stack(makeBlock(B.officeChair, outward), B.floor));
  for (const u of [6, 7, 8, 11, 12, 13]) put(u, 0, 13, stack(makeBlock(B.chair, inward), B.floor));
  for (const u of [6, 7, 8]) put(u, 0, 17, stack(makeBlock(B.couch, outward), B.floor));
  put(10, 1, 21, makeBlock(B.tv, outward));
  put(10, 0, 21, stack(makeBlock(B.desk, outward), B.floor));
  for (const [u, v] of [[5, 10], [16, 10], [25, 10], [5, 21], [27, 21]]) put(u, 0, v, stack(B.plant, B.floor));
  put(15, 0, 21, stack(B.cooler, B.floor));
  for (const [u, v] of [[10, 14], [20, 12], [30, 14], [40, 14], [10, 28], [20, 28], [30, 28], [40, 28]]) put(u, H - 1, v, B.ceilingLight);
  // The emergency room, by the ambulance bay: beds behind curtains (glass).
  for (const u of [33, 38, 43]) {
    put(u, 0, 18, stack(makeBlock(B.bed, inward), B.floor));
    put(u, 0, 19, stack(makeBlock(B.bed, inward | BED_FOOT), B.floor)); // (a bed is two blocks: head and foot)
    put(u - 1, 0, 19, stack(B.cabinet, B.floor));
  }
  for (const u of [35, 40]) for (let v = 16; v <= 20; v++) for (let y = 0; y < 2; y++) put(u, y, v, B.glass);
  // Dr. Hart's office (in the corner, a desk and a computer).
  for (let v = 10; v <= 13; v++) for (let y = 0; y < H; y++) if (!(v === 12 && y < 2)) put(28, y, v, B.white); // (a doorway)
  put(30, 0, 11, stack(makeBlock(B.desk, faceDir(-ux, -uz)), B.floor));
  put(30, 1, 11, makeBlock(B.computer, faceDir(-ux, -uz)));
  put(31, 0, 11, stack(makeBlock(B.officeChair, faceDir(-ux, -uz)), B.floor));
  // A corridor across, and the patient rooms along the back: a bed in each, a chair, flowers,
  // walls between them (and a doorway each).
  for (let u = b0 + 1; u < b1; u++) put(u, 0, 23, B.carpet);
  for (const u of ROOMS) {
    for (let v = 24; v < bv1; v++) for (let y = 0; y < 3; y++) if (!(v === 24 && y < 2)) put(u - 1, y, v, B.white); // (the wall on the left)
    put(u + 1, 0, 33, stack(makeBlock(B.bed, outward), 25));
    put(u + 1, 0, 32, stack(makeBlock(B.bed, outward | BED_FOOT), 25));
    put(u + 2, 0, 31, stack(makeBlock(B.chair, faceDir(-ux, -uz)), 25));
    put(u + 3, 0, 34, stack(B.plant, 25));
  }
  for (let v = 24; v < bv1; v++) for (let y = 0; y < 3; y++) if (!(v === 24 && y < 2)) put(46, y, v, B.white);

  // ---------- The ambulances ----------
  const h = Math.atan2(fx, fz), cars = []; // (noses to the road, ready to go)
  for (const u of [37, 43]) {
    const [x, z] = site.pos(u, 4);
    cars.push({ kind: 'ambulance', color: '#f5f5f5', x, y: 0, z, h });
  }

  // Where things are, in the world.
  const box = (a, b, c, d) => {
    const [x0, z0] = site.at(a, c), [x1, z1] = site.at(b, d);
    return [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)];
  };
  const [ax0, az0] = site.at(0, 0), [ax1, az1] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
  const [px, pz] = site.pos(20.5, 18.5), [dx, dz] = site.pos(20.5, 17), [qa, qb] = [site.pos(18, 16.5), site.pos(24, 19)];
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Hospital', key: 'hospital', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      // building: where the beds are (lie in one inside it to heal); bay: where an ambulance stops
      hospital: { x: px, y: 0, z: pz, rect, building: box(b0, b1, bv0, bv1), bay: box(c0, c1, cv0, cv1 + 1) },
      hospital_desk: { x: dx, y: 0, z: dz, face: Math.atan2(-fx, -fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}
