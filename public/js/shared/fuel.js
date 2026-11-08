// Fuel, dirt, gas stations and car washes.
//
// Every vehicle (except boats) has a tank of gas that empties as you drive. Pumps at the gas
// stations fill it up for coins, and they also sell gas cans (a quarter of a tank) to walk back to
// a car that's run dry. Vehicles also get dirty as they drive (much faster off the road, and
// faster still in the rain), and the car wash next to the pumps cleans them: drive through slowly.
import { WORLD, makeBlock, stack, blockId, itemOf, floorOf } from './blocks.js';
import { exitRoads, makeSite } from './worldgen.js';

export const GAS_PUMP = 113;
export const CAR_WASH = 114;
export const WASH_BRUSH = 115;

// How far each kind can go on a full tank (blocks driven; a helicopter counts climbing too).
// Boats don't need gas (there's nowhere to fill them up out on the lake).
export const TANK_RANGE = { car: 4000, police: 4000, sports: 3500, monster: 3000, pickup: 3600, camper: 3400, dump: 2800, rv: 2800, heli: 4500 };
export const usesFuel = kind => !!TANK_RANGE[kind];
export const getsDirty = kind => usesFuel(kind) && kind !== 'heli';
export const FULL_TANK_PRICE = 8; // coins for a whole tank (less if it isn't empty)
export const GAS_CAN = 0.25; // a gas can holds a quarter of a tank
export const GAS_CAN_PRICE = 3;
export const PUMP_REACH = 8; // a vehicle this close to a pump can be filled from it
export const fillPrice = fuel => Math.max(1, Math.ceil((1 - fuel) * FULL_TANK_PRICE));
// Driving this far on the road makes a clean car completely dirty (three times sooner off the
// road, and twice as fast again off the road in the rain).
export const DIRT_RANGE = 5000;
export const WASH_TIME = 2.2; // seconds in the car wash to come out sparkling

// Is this a paved surface (no mud)?
const PAVED = new Set([20, 22, 23, 24, 25, 55, 56, 57, 70, 71, 72, CAR_WASH]);
export const paved = v => PAVED.has(blockId(itemOf(v))) || PAVED.has(blockId(floorOf(v)));
export const isWash = v => blockId(itemOf(v)) === CAR_WASH || blockId(floorOf(v)) === CAR_WASH;

const B = { road: 22, sidewalk: 24, concrete: 13, red: 14, yellow: 16, black: 17, metal: 11, glass: 9, white: 12,
  ceilingLight: 41, streetLamp: 46, neonBlue: 51, flowerPot: 67, sign: 94 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);

// The size of a gas station (along the road, and away from it).
export const STATION = { L: 26, D: 12 };

// Gas stations: two of them, by different roads a good way apart, each with two pumps under a
// canopy and a car wash beside it. They belong to the town (permanent claims), so nobody can knock
// them down. Built only on empty land that canUse(x, z) allows. Returns what was built.
export function buildGasStations({ get, set, canUse }) {
  const roads = exitRoads();
  const out = { claims: [], signs: [], places: {}, areas: [], count: 0 };
  const plans = [['east', 'south', 'west', 'north', 'ringE', 'ringS'], ['ringN', 'ringW', 'ringS', 'ringE', 'west', 'north']];
  const built = [];
  plans.forEach((names, n) => {
    for (const name of names) {
      const road = roads[name];
      if (!road) continue;
      for (const side of [1, -1]) {
        for (let a = road.from + 2; a + STATION.L <= road.to - 1; a += 2) {
          const site = makeSite(road, side, a);
          const [cx, cz] = site.at(STATION.L / 2, STATION.D / 2);
          if (built.some(([x, z]) => Math.hypot(x - cx, z - cz) < 90)) continue;
          if (!stationFree(site, get, canUse)) continue;
          const s = stationAt(site, set, n + 1);
          out.claims.push(s.claim);
          out.signs.push(...s.signs);
          out.places[`gas${n + 1}`] = s.place;
          out.areas.push(s.area);
          out.count += s.count;
          built.push([cx, cz]);
          return;
        }
      }
    }
  });
  return out;
}

function stationFree(site, get, canUse) {
  for (let u = -1; u <= STATION.L; u++)
    for (let v = 0; v <= STATION.D; v++) {
      const [x, z] = site.at(u, v);
      if (x < WORLD.min + 2 || x > WORLD.max - 2 || z < WORLD.min + 2 || z > WORLD.max - 2 || !canUse(x, z)) return false;
      for (let y = 0; y < 7; y++) if (get(x, y, z)) return false;
    }
  return true;
}

function stationAt(site, set, n) {
  const { L, D } = STATION;
  let count = 0;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
    count++;
  };
  const [fx, fz] = site.dirV; // from the road into the station
  const [ax, az] = site.dirU; // along the road
  // The forecourt: smooth asphalt everywhere you can drive, a sidewalk along the back with
  // flowers, and street lamps in the back corners.
  for (let u = 0; u < L; u++)
    for (let v = 0; v < D; v++) put(u, 0, v, v === D - 1 ? B.sidewalk : B.road);
  for (const u of [3, 7, 18, 22]) put(u, 0, D - 1, stack(B.flowerPot, B.sidewalk));
  for (const u of [0, L - 1]) {
    for (let y = 0; y < 3; y++) put(u, y, D - 1, B.black);
    put(u, 3, D - 1, B.streetLamp);
  }

  // The pumps: two islands under a canopy (a white roof with a red band, held up by pillars on
  // the islands, with lights underneath). Pull up beside a pump, get out and right-click it.
  const islandV = 5;
  for (const pu of [3, 9]) {
    put(pu - 1, 0, islandV, B.sidewalk);
    put(pu + 1, 0, islandV, B.sidewalk);
    put(pu, 0, islandV, stack(makeBlock(GAS_PUMP, faceDir(-fx, -fz)), B.sidewalk));
    for (let y = 0; y < 4; y++) put(pu + 1, y, islandV, B.metal);
  }
  for (let u = 0; u <= 12; u++)
    for (let v = 2; v <= 8; v++) {
      const edge = u === 0 || u === 12 || v === 2 || v === 8;
      put(u, 4, v, edge ? B.red : B.white);
    }
  for (const [u, v] of [[3, 3], [9, 3], [3, 7], [9, 7]]) put(u, 3, v, B.ceilingLight);
  // A tall sign out front: GAS, with the prices.
  for (let y = 0; y < 3; y++) put(13, y, 0, B.black);
  put(13, 3, 0, B.yellow);
  const signs = [];
  const sign = (u, y, v, wall, text) => {
    put(u, y, v, makeBlock(B.sign, onWall(...wall)));
    const [x, z] = site.at(u, v);
    signs.push([x, y, z, text]);
  };
  sign(13, 2, -1, [fx, fz], `⛽ GAS · Full tank: ${FULL_TANK_PRICE} coins · Gas can: ${GAS_CAN_PRICE} coins`);
  sign(13, 1, -1, [fx, fz], '⛽ Park by a pump, get out and right-click it');

  // The car wash: a tunnel along the road with soapy pads on the floor, big spinning brushes
  // hanging from the roof, blue lights and glass sides. Drive in one end, slowly, and out the other.
  const w0 = 15, w1 = L - 2, v0 = 3, v1 = 9;
  for (let u = w0; u <= w1; u++) {
    for (const v of [v0, v1]) {
      for (let y = 0; y < 4; y++) put(u, y, v, y === 1 || y === 2 ? (u === w0 || u === w1 ? B.concrete : B.glass) : B.concrete);
    }
    for (let v = v0; v <= v1; v++) put(u, 4, v, v === v0 || v === v1 ? B.concrete : B.white);
    for (let v = v0 + 1; v < v1; v++) {
      if (u > w0 && u < w1) put(u, 0, v, CAR_WASH);
      if (u === w0 + 3 || u === w1 - 3) put(u, 3, v, makeBlock(WASH_BRUSH, faceDir(ax, az)));
    }
  }
  for (let u = w0; u <= w1; u++) put(u, 5, v0, u % 2 ? B.neonBlue : B.white);
  sign(Math.round((w0 + w1) / 2), 2, v0 - 1, [fx, fz], '🧽 CAR WASH · Free! Drive through slowly');

  const [cx0, cz0] = site.at(0, 0), [cx1, cz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(cx0, cx1), Math.min(cz0, cz1), Math.max(cx0, cx1), Math.max(cz0, cz1)];
  const [px, pz] = site.at(6, 5);
  return {
    count,
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    place: { x: px + 0.5, z: pz + 0.5 },
    claim: { owner: 'Gas Station', key: `gas station ${n}`, x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
  };
}
