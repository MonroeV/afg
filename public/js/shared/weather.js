// The weather station: a little white building by a road out of town, with a tall mast on the
// roof (its wind cups spin, and a light blinks at the top), screens and a desk inside, and
// Stormy the weather-person. Pay Stormy and it rains TACOS, all over town, for everyone (see
// tacoRain in game.js, and tacos.js for the falling tacos).
import { DOOR_TOP, makeBlock, stack } from './blocks.js';
import { exitRoads, makeSite, siteFree } from './worldgen.js';

const B = { floor: 25, glass: 9, door: 21, sidewalk: 24, flowerPot: 67, ceilingLight: 41, desk: 73, computer: 75, sign: 94, lantern: 45, marble: 12, sky: 31, metal: 11, lamp: 18, concrete: 13 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
const L = 8, D = 7, MAST = 6;

export const TACO_PRICE = 25; // coins for a taco shower
export const TACO_SECONDS = 100; // how long it lasts (as long as its song: sounds/taco-rain.mp3)

export function buildWeatherStation({ get, set, canUse }) {
  const roads = exitRoads();
  for (const name of ['ringE', 'ringN', 'ringW', 'ringS', 'east', 'north', 'west', 'south']) {
    const road = roads[name];
    if (!road) continue;
    for (const side of [1, -1])
      for (let a = road.from + 2; a + L <= road.to - 1; a += 2) {
        const site = makeSite(road, side, a);
        if (!siteFree(site, L, D, MAST + 6, get, canUse)) continue;
        return stationAt(site, set);
      }
  }
  return null;
}

function stationAt(site, set) {
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV; // from the road into the station
  const inward = faceDir(fx, fz);
  // The path in, with flowers.
  for (let u = 0; u < L; u++) put(u, 0, 0, u === 1 || u === L - 2 ? stack(B.flowerPot, B.sidewalk) : B.sidewalk);
  for (let u = 0; u < L; u++)
    for (let v = 1; v < D; v++) {
      const edgeU = u === 0 || u === L - 1, edgeV = v === 1 || v === D - 1;
      if (!edgeU && !edgeV) {
        put(u, 0, v, B.floor);
        put(u, 4, v, B.concrete);
        continue;
      }
      for (let y = 0; y < 4; y++) {
        let b = (edgeU && edgeV) || y === 3 ? B.sky : B.marble;
        // Big windows all round (for watching the weather), and a door in the middle of the front.
        if (!(edgeU && edgeV) && y > 0 && y < 3) b = B.glass;
        if (v === 1 && (u === 3 || u === 4) && y < 2) b = 0;
        if (b) put(u, y, v, b);
      }
      put(u, 4, v, B.concrete);
    }
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  for (const u of [3, 4]) {
    put(u, 0, 1, makeBlock(B.door, doorFacing));
    put(u, 1, 1, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  // Inside: lights, and a desk of computers at the back (the weather forecasts).
  put(2, 3, 3, B.ceilingLight);
  put(5, 3, 4, B.ceilingLight);
  for (const u of [2, 3, 4, 5]) put(u, 0, D - 2, stack(makeBlock(B.desk, inward), B.floor));
  for (const u of [2, 5]) put(u, 1, D - 2, makeBlock(B.computer, inward));
  // The mast on the roof, at the back corner: metal, with a blinking light on top.
  const [mu, mv] = [L - 2, D - 2];
  for (let y = 5; y < 5 + MAST; y++) put(mu, y, mv, B.metal);
  put(mu, 5 + MAST, mv, B.lamp);
  const [mx, mz] = site.at(mu, mv);
  // The sign over the door.
  const [sx, sz] = site.at(Math.floor(L / 2), 0);
  set(sx, 3, sz, makeBlock(B.sign, onWall(fx, fz)));
  const [px, pz] = site.pos(L / 2, D - 3);
  const [cx0, cz0] = site.at(0, 0), [cx1, cz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(cx0, cx1), Math.min(cz0, cz1), Math.max(cx0, cx1), Math.max(cz0, cz1)];
  const [ax, az] = site.at(1, 2), [bx, bz] = site.at(L - 2, D - 3);
  return {
    signs: [[sx, 3, sz, '⛅ WEATHER STATION 🌮']],
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    place: { x: px, y: 0, z: pz, area: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)], face: Math.atan2(-fx, -fz), mast: [mx, 5 + MAST, mz] },
    claim: { owner: 'Weather Station', key: 'store weather', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
  };
}
