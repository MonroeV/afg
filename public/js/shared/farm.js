// Sunny Acres Farm, out by the Outer Loop (since v0.59): a big red barn (stalls, hay bales, a
// hayloft up a ladder), a white farmhouse with a porch, a tall silo, a windmill (its sails turn:
// see farmanimals.js), four fields of crops anyone may pick (carrots, strawberries, sunflowers and
// pumpkins: they go in your lunchbox, and grow back on their own), scarecrows, fenced pastures for
// the cows, the horses, the sheep, the pigs and the chickens, Grandma June's farm stand, and two
// tractors to drive. Farmer Wren runs the Farmhands club. Right-click an animal to pet it (or feed it, from your lunchbox): the cows
// give you milk and the hens eggs (into your lunchbox).
import { makeBlock, stack, SIGN, DOOR_TOP, CROP_RIPE } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = {
  sidewalk: 24, planks: 6, log: 7, leaves: 8, glass: 9, red: 14, white: 12, roof: 26, railing: 54, ladder: 53, door: 21,
  hay: 99, pumpkin: 100, lantern: 45, flowers: 27, flowerPot: 67, chair: 60, metal: 11, cobble: 4, water: 36, floor: 25,
  fruitStand: 135, register: 86, table: 62, picnic: 102, carrot: 131, strawberry: 132, sunflower: 133, pumpkins: 134, sunflowerBig: 116,
};
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
export const FARM = { L: 64, D: 52 };
// The animals: what's in each pasture, how many, what they like to eat, and what they give you.
export const FARM_ANIMALS = {
  cow: { icon: '🐄', name: 'Cows', count: 3, likes: 'apple', gives: 'milk' },
  horse: { icon: '🐴', name: 'Horses', count: 2, likes: 'carrot' },
  sheep: { icon: '🐑', name: 'Sheep', count: 4, likes: 'bread' },
  pig: { icon: '🐖', name: 'Pigs', count: 3, likes: 'pumpkin' },
  chicken: { icon: '🐔', name: 'Chickens', count: 6, likes: 'sunseeds', gives: 'egg' },
};
export const FARM_KINDS = Object.keys(FARM_ANIMALS);
export const GIVE_EVERY = 90; // (seconds: how often a cow or a hen gives you something)
// The pastures, inside their fences ([u0, v0, u1, v1]).
const PENS = { cow: [3, 40, 18, 49], horse: [21, 40, 31, 49], sheep: [34, 40, 44, 49], pig: [47, 40, 53, 49], chicken: [56, 40, 61, 49] };
// The fields: [u0, u1, crop block] (rows at FIELD_ROWS).
const FIELDS = [[3, 13, B.carrot], [16, 26, B.strawberry], [37, 47, B.sunflower], [50, 60, B.pumpkins]];
const FIELD_ROWS = [6, 9, 12, 15];
const LANE = [29, 34]; // (the farm lane, in from the road, u)
const BARN = [37, 52, 22, 36], BARN_H = 6; // [u0, u1, v0, v1]
const HOUSE = [4, 15, 22, 31];
const SILO = [55, 59, 25, 29];
const MILL = [24, 26, 24, 26]; // (the windmill's tower)

export function buildFarm({ get, set, canUse, near = [-RING - 40, -120] }) {
  const site = findBigSite({ ...FARM, tall: 14, near, get, canUse });
  return site ? farmAt(site, set) : null;
}

function farmAt(site, set) {
  const { L, D } = FARM;
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
  // A fence round [u0..u1] x [v0..v1] (just outside it), with gaps where `gap(u, v)` says.
  const fence = (u0, v0, u1, v1, gap = () => false) => {
    for (let u = u0 - 1; u <= u1 + 1; u++)
      for (let v = v0 - 1; v <= v1 + 1; v++) {
        if (u >= u0 && u <= u1 && v >= v0 && v <= v1) continue;
        if (gap(u, v)) continue;
        let mask = 0;
        if (u === u0 - 1) mask |= site.edge(1, 0);
        if (u === u1 + 1) mask |= site.edge(-1, 0);
        if (v === v0 - 1) mask |= site.edge(0, 1);
        if (v === v1 + 1) mask |= site.edge(0, -1);
        put(u, 0, v, makeBlock(B.railing, mask));
      }
  };

  // ---------- The way in ----------
  // The farm lane (a gravel-pale path) from the road up to the yard, and a log gateway with the
  // farm's sign on it.
  for (let u = LANE[0]; u <= LANE[1]; u++) for (let v = 0; v <= 21; v++) put(u, 0, v, B.sidewalk);
  for (let u = 3; u <= 60; u++) for (let v = 19; v <= 21; v++) put(u, 0, v, B.sidewalk); // (the yard path, across)
  for (const u of [LANE[0] - 1, LANE[1] + 1]) for (let y = 0; y < 5; y++) put(u, y, 1, B.log);
  for (let u = LANE[0] - 1; u <= LANE[1] + 1; u++) put(u, 5, 1, B.planks);
  const [gx, gz] = site.at((LANE[0] + LANE[1]) / 2, 1);
  set(Math.floor(gx - fx), 4, Math.floor(gz - fz), makeBlock(SIGN, onWall(fx, fz)));
  signs.push([Math.floor(gx - fx), 4, Math.floor(gz - fz), '🐄 SUNNY ACRES FARM 🌻 Come and say hello!']);
  // A fence all round the front (gaps for the lane), with lanterns on the gateposts.
  for (let u = 1; u < L - 1; u++) if (u < LANE[0] - 1 || u > LANE[1] + 1) put(u, 0, 1, makeBlock(B.railing, site.edge(0, 1)));
  for (const u of [LANE[0] - 1, LANE[1] + 1]) put(u, 5, 2, B.lantern);

  // ---------- The fields ----------
  // Rows of crops (picked: they grow back by themselves), a scarecrow in each, and a sign.
  const fields = [];
  FIELDS.forEach(([u0, u1, crop], i) => {
    for (const v of FIELD_ROWS) for (let u = u0; u <= u1; u++) put(u, 0, v, makeBlock(crop, CROP_RIPE));
    fence(u0, 4, u1, 17, (u, v) => v === 18 && (u === u0 + 4 || u === u0 + 5 || u === u0 + 6)); // (the way in, from the yard path)
    const su = u0 + 5;
    put(su, 0, 10, B.log);
    put(su, 1, 10, B.hay);
    put(su, 2, 10, B.pumpkin);
    sign(u0 + 3, 1, 18, outward, ['🥕 Carrots', '🍓 Strawberries', '🌻 Sunflowers', '🎃 Pumpkins'][i] + ' · Pick me!');
    put(u0 + 3, 0, 18, B.log);
    const [ax, az] = site.at(u0, 4), [bx, bz] = site.at(u1, 17);
    fields.push([Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]);
  });
  // Sunflowers along the lane.
  for (const v of [4, 8, 12, 16]) for (const u of [LANE[0] - 1, LANE[1] + 1]) put(u, 0, v, B.sunflowerBig);

  // ---------- The barn ----------
  // Big and red with white trim, wide doors at the front, a peaked roof; inside: stalls, hay, and
  // a hayloft (up the ladder) across the back.
  const [b0, b1, bv0, bv1] = BARN;
  const doorU = [43, 46];
  for (let u = b0; u <= b1; u++)
    for (let v = bv0; v <= bv1; v++) {
      const edgeU = u === b0 || u === b1, edgeV = v === bv0 || v === bv1;
      if (!edgeU && !edgeV) {
        put(u, 0, v, B.floor);
        continue;
      }
      for (let y = 0; y < BARN_H; y++) {
        if (v === bv0 && u >= doorU[0] && u <= doorU[1] && y < 4) continue; // (the big doorway)
        const trim = (edgeU && edgeV) || y === BARN_H - 1 || (v === bv0 && y === 4 && u >= doorU[0] - 1 && u <= doorU[1] + 1);
        const window = edgeU && !edgeV && (v - bv0) % 4 === 2 && y >= 2 && y <= 3;
        put(u, y, v, window ? B.glass : trim ? B.white : B.red);
      }
    }
  // The roof: in steps up to a ridge down the middle (along v), red-brown tiles, with the gable
  // ends filled in red (a white loft door up high at the front).
  const mid = (b0 + b1) / 2;
  for (let k = 0; b0 - 1 + k <= b1 + 1 - k; k++) {
    const y = BARN_H + k, ua = b0 - 1 + k, ub = b1 + 1 - k;
    for (let v = bv0 - 1; v <= bv1 + 1; v++) for (const u of [ua, ub]) put(u, y, v, B.roof);
    for (const v of [bv0, bv1]) for (let u = ua + 1; u < ub; u++) put(u, y, v, v === bv0 && k >= 1 && k <= 2 && Math.abs(u - mid) <= 1 ? B.white : B.red);
  }
  put(Math.floor(mid), 5, bv0 - 1, B.lantern);
  // Stalls down each side (railings), with hay in them.
  for (const v of [24, 27, 30]) for (let u = b0 + 1; u <= b0 + 4; u++) put(u, 0, v, makeBlock(B.railing, site.edge(0, 1) | site.edge(0, -1)));
  for (const v of [24, 27, 30]) for (let u = b1 - 4; u <= b1 - 1; u++) put(u, 0, v, makeBlock(B.railing, site.edge(0, 1) | site.edge(0, -1)));
  for (const [u, v] of [[b0 + 1, 25], [b0 + 2, 28], [b1 - 1, 25], [b1 - 2, 28], [b0 + 1, 31], [b1 - 1, 32]]) put(u, 0, v, B.hay);
  // The hayloft: a floor across the back at y 3, hay bales stacked up there, and a ladder up.
  for (let u = b0 + 1; u <= b1 - 1; u++) for (let v = 32; v <= bv1 - 1; v++) put(u, 3, v, B.planks);
  for (const [u, v, h] of [[b0 + 2, 34, 2], [b0 + 3, 34, 1], [b1 - 2, 34, 2], [b1 - 3, 33, 1], [b0 + 6, 34, 1]]) for (let y = 0; y < h; y++) put(u, 4 + y, v, B.hay);
  for (let y = 0; y < 4; y++) put(Math.floor(mid), y, 31, makeBlock(B.ladder, inward));
  sign(Math.floor(mid) + 2, 1, bv0 + 1, outward, '🌾 The hayloft is up the ladder! 🪜');

  // ---------- The silo ----------
  const [s0, s1, sv0, sv1] = SILO;
  for (let u = s0; u <= s1; u++)
    for (let v = sv0; v <= sv1; v++) {
      const corner = (u === s0 || u === s1) && (v === sv0 || v === sv1);
      const inside = u > s0 && u < s1 && v > sv0 && v < sv1;
      if (corner || inside) continue;
      for (let y = 0; y < 12; y++) put(u, y, v, y % 4 === 3 ? B.white : B.metal);
    }
  for (let u = s0 + 1; u <= s1 - 1; u++) for (let v = sv0 + 1; v <= sv1 - 1; v++) put(u, 12, v, B.roof);
  put(s0 + 2, 13, sv0 + 2, B.roof);

  // ---------- The windmill ----------
  // A stone tower with a little roof; its sails are drawn by each player's game (they turn).
  const [m0, m1, mv0, mv1] = MILL, MILL_H = 9;
  for (let u = m0; u <= m1; u++) for (let v = mv0; v <= mv1; v++) for (let y = 0; y < MILL_H; y++) if (u === m0 || u === m1 || v === mv0 || v === mv1) put(u, y, v, y === 0 || y === MILL_H - 1 ? B.planks : B.cobble);
  for (let u = m0; u <= m1; u++) for (let v = mv0; v <= mv1; v++) put(u, MILL_H, v, B.roof);
  put(m0 + 1, MILL_H + 1, mv0 + 1, B.roof);

  // ---------- The farmhouse ----------
  const [h0, h1, hv0, hv1] = HOUSE, HH = 4;
  for (let u = h0; u <= h1; u++)
    for (let v = hv0; v <= hv1; v++) {
      const edgeU = u === h0 || u === h1, edgeV = v === hv0 || v === hv1;
      if (!edgeU && !edgeV) {
        put(u, 0, v, B.floor);
        continue;
      }
      for (let y = 0; y < HH; y++) {
        if (v === hv0 && (u === 9 || u === 10) && y < 2) continue; // (the front door goes here)
        const window = (y === 1 || y === 2) && ((edgeV && !edgeU && (u - h0) % 3 === 1 && u !== 9 && u !== 10) || (edgeU && !edgeV && (v - hv0) % 3 === 2));
        put(u, y, v, window ? B.glass : B.white);
      }
    }
  // A peaked roof (ridge along u).
  const hmid = (hv0 + hv1) / 2;
  for (let k = 0; k <= Math.ceil((hv1 - hv0) / 2) + 1; k++) {
    const va = hv0 - 1 + k, vb = hv1 + 1 - k;
    if (va > vb) break;
    for (let u = h0 - 1; u <= h1 + 1; u++) for (const v of [va, vb]) put(u, HH + k, v, B.roof);
    if (va < hmid) for (const u of [h0, h1]) for (let v = va + 1; v < vb; v++) put(u, HH + k, v, B.white);
  }
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  for (const u of [9, 10]) {
    put(u, 0, hv0, makeBlock(B.door, doorFacing));
    put(u, 1, hv0, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  // The porch: a wooden deck, rocking chairs, flower pots; inside, a table and chairs.
  for (let u = h0; u <= h1; u++) put(u, 0, hv0 - 1, B.floor);
  for (const u of [6, 13]) put(u, 0, hv0 - 1, stack(makeBlock(B.chair, outward), B.floor));
  for (const u of [h0, h1]) put(u, 0, hv0 - 1, stack(B.flowerPot, B.floor));
  put(9, 0, 27, stack(B.table, B.floor));
  for (const u of [8, 11]) put(u, 0, 27, stack(makeBlock(B.chair, faceDir(u === 8 ? ux : -ux, u === 8 ? uz : -uz)), B.floor));

  // ---------- The pastures ----------
  const pens = [];
  for (const [kind, [u0, v0, u1, v1]] of Object.entries(PENS)) {
    const a = FARM_ANIMALS[kind], gateU = Math.floor((u0 + u1) / 2);
    fence(u0, v0, u1, v1);
    // A water trough by the fence, and hay; the hens get a little coop.
    if (kind === 'chicken') {
      for (let u = u1 - 1; u <= u1; u++) for (let v = v1 - 1; v <= v1; v++) put(u, 0, v, B.planks);
      put(u1 - 1, 1, v1 - 1, B.roof);
      put(u1, 1, v1 - 1, B.roof);
      put(u1 - 1, 1, v1, B.roof);
      put(u1, 1, v1, B.roof);
    } else {
      put(u0, 0, v1, B.hay);
      put(u0 + 1, 0, v1, B.hay);
    }
    put(u1, 0, v0, B.water);
    sign(gateU, 1, v0 - 2, outward, `${a.icon} ${a.name.toUpperCase()} · right-click to pet`);
    put(gateU, 0, v0 - 2, B.log);
    const [ax, az] = site.pos(u0 + 0.5, v0 + 0.5), [bx, bz] = site.pos(u1 + 0.5, v1 + 0.5);
    pens.push({ kind, rect: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)] });
  }
  // A path along the front of the pastures (from the yard), with lanterns and a picnic table.
  for (let u = 2; u <= 61; u++) put(u, 0, 38, B.sidewalk);
  for (let v = 22; v <= 37; v++) for (const u of [32, 33]) put(u, 0, v, B.sidewalk);
  for (const u of [2, 20, 33, 46, 61]) put(u, 0, 38, stack(B.lantern, B.sidewalk));
  put(20, 0, 30, B.picnic);
  for (const [u, v] of [[18, 22], [21, 33], [28, 33], [35, 22]]) put(u, 0, v, B.flowers);

  // ---------- Grandma June's farm stand ----------
  // By the yard path: a fruit stand piled with what's fresh today, a till, and a sign.
  for (const u of [20, 21, 22]) put(u, 0, 22, makeBlock(B.fruitStand, outward));
  put(23, 0, 22, makeBlock(B.register, outward));
  for (const u of [19, 24]) put(u, 0, 22, B.pumpkin);
  put(21, 1, 22, B.planks);
  sign(21, 2, 22, outward, '🥚 FARM STAND 🍯 Fresh eggs, honey and pie!');
  put(19, 0, 23, B.hay);

  // The two tractors, parked on the yard path by the barn (noses toward the lane: drive along
  // the path and down the lane to the road).
  const h = Math.atan2(ux, uz), cars = [];
  for (const u of [53.5, 59.5]) { // (more than 5 apart: see worldgen.js)
    const [x, z] = site.pos(u, 20);
    cars.push({ kind: 'tractor', color: u < 57 ? '#2e7d32' : '#c62828', x, y: 0, z, h });
  }

  const [rx0, rz0] = site.at(0, 0), [rx1, rz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(rx0, rx1), Math.min(rz0, rz1), Math.max(rx0, rx1), Math.max(rz0, rz1)];
  const [px, pz] = site.pos(31.5, 20.5), [sx, sz] = site.pos(21.5, 20.5);
  const [qa, qb] = [site.pos(19, 19.5), site.pos(25, 21.5)];
  const [wx, wz] = site.pos(m0 + 1.5, mv0 - 0.4); // (the windmill's hub: on its front face)
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Sunny Acres Farm', key: 'farm', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      farm: { x: px, y: 0, z: pz, rect, pens, fields, mill: { x: wx, y: MILL_H - 1.5, z: wz, face: Math.atan2(-fx, -fz) } },
      farm_stand: { x: sx, y: 0, z: sz, face: Math.atan2(-fx, -fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}

// Is this spot in one of the farm's fields? (Crops there are anyone's to pick, and grow back on
// their own.)
export function inFarmField(farm, x, z) {
  return !!farm?.fields?.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
}
