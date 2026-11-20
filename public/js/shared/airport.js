// BuildZone Airport, out on the Outer Loop: a long runway (with a dashed center line, stripes at
// the ends and edge lights), a taxiway to the apron where the airplanes park, a glass-fronted
// terminal (check-in desk, rows of seats, big windows onto the runway), a control tower (climb its
// ladder to the glass cab at the top) and two hangars. Captain Sky in the terminal tells you how
// to fly. The airplanes themselves are vehicles (kind 'plane': see flyPlane in cars.js).
//
// It needs a big empty patch beside the Outer Loop, so it looks all the way round for one (the
// outer lands have trees about): fast, with a map of which columns are free.
import { DOOR_TOP, makeBlock, stack, SIGN, WORLD } from './blocks.js';
import { makeSite } from './worldgen.js';
import { ringRoads, RING } from './outerlands.js';

const B = { road: 22, line: 23, lineX: 55, sidewalk: 24, concrete: 13, white: 12, metal: 11, glass: 9, floor: 25, door: 21, chair: 60, desk: 73, register: 86, flowerPot: 67, ceilingLight: 41, gardenLight: 47, lantern: 45, ladder: 53, grass: 1 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
// The site: u along the Outer Loop (0 to L-1), v away from it (0 to D-1).
export const AIRPORT = { L: 130, D: 44 };
const { L, D } = AIRPORT;
const TALL = 12; // (how high it has to be empty)
// Rows (v): the terminal 7-17, the hangars 6-18, the apron 19-27, the taxiways 28-31, the runway
// 32-40 (its center line at 36), the edge lights at 31 and 41.
const RUNWAY = [32, 40], APRON = [19, 27];
const PARKED = [22, 36, 54, 78]; // (where the airplanes park along the apron, u)
const PLANE_COLORS = ['#e53935', '#fdd835', '#1e88e5', '#f5f5f5'];
// (Since v0.56, a plane in each hangar, nose out: the Sky Cub, a slow one for sightseeing, and a
// fast jet.)
const HANGAR_PLANES = [{ kind: 'cub', u: 54.5, v: 12.5, color: '#ffb300' }, { kind: 'jet', u: 78.5, v: 12.5, color: '#546e7a' }];

// The hangar planes for an airport that's already built (worked out from where its terminal
// and runway are), for worlds from before they were added.
export function hangarPlanes(place) {
  if (!place?.runway || !place.along) return [];
  const [ux, uz] = place.along, [r0x, r0z] = place.runway;
  // (The terminal's spot is at (20, 11.5) in the airport's own space; the runway starts at (4, 36.5).)
  const vx = (r0x - place.x + 16 * ux) / 25, vz = (r0z - place.z + 16 * uz) / 25;
  const pos = (u, v) => [place.x + (u - 20) * ux + (v - 11.5) * vx, place.z + (u - 20) * uz + (v - 11.5) * vz];
  const h = Math.atan2(-vx, -vz);
  return HANGAR_PLANES.map(p => {
    const [x, z] = pos(p.u, p.v);
    return { kind: p.kind, x, y: 0, z, h, color: p.color };
  });
}

// Finds a spot and builds it (or null if there's nowhere big enough). near: where we'd like it.
export function buildAirport({ get, set, canUse, near = [RING + 30, 330] }) {
  const site = findBigSite({ L, D, tall: TALL, near, get, canUse });
  return site ? airportAt(site, set) : null;
}

// The free spot beside the Outer Loop (L along it, D away from it, empty up to `tall`) nearest
// `near`, or null. Quick even for big ones: a map of which columns are free, beside each side.
export function findBigSite({ L, D, tall, near, get, canUse }) {
  const roads = ringRoads();
  let best = null, bestD = Infinity;
  for (const name of ['loopE', 'loopS', 'loopW', 'loopN']) {
    const road = roads[name];
    for (const side of [1, -1]) {
      const first = road.from + 20, last = road.to - 20; // (u = 0 at a = first)
      const n = last - first + 1, edge = makeSite(road, side, first);
      const busyCols = new Int32Array(n + 1);
      for (let i = 0; i < n; i++) {
        let any = 0;
        for (let v = 0; v <= D && !any; v++) {
          const [x, z] = edge.at(i, v);
          if (x < WORLD.min + 2 || x > WORLD.max - 2 || z < WORLD.min + 2 || z > WORLD.max - 2 || !canUse(x, z)) any = 1;
          for (let y = 0; y < Math.min(tall, 6) && !any; y++) if (get(x, y, z)) any = 1; // (anything built reaches down near the ground)
        }
        busyCols[i + 1] = busyCols[i] + any;
      }
      for (let a = first + 1; a + L < last; a += 2) {
        const i = a - first;
        if (busyCols[i + L + 1] - busyCols[i - 1] > 0) continue;
        const site = makeSite(road, side, a), [cx, cz] = site.at(L / 2, D / 2);
        const d = Math.hypot(cx - near[0], cz - near[1]);
        if (d < bestD) [best, bestD] = [site, d];
      }
    }
  }
  return best;
}

function airportAt(site, set) {
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const inward = faceDir(fx, fz), outward = faceDir(-fx, -fz);
  const lineAlong = site.road.axis === 'x' ? B.lineX : B.line; // (a line along u)
  const lineAcross = site.road.axis === 'x' ? B.line : B.lineX;
  const signs = [];
  const sign = (u, y, v, wall, text) => {
    put(u, y, v, makeBlock(SIGN, wall));
    const [x, z] = site.at(u, v);
    signs.push([x, y, z, text]);
  };
  const box = (u0, v0, u1, v1, h, wall, roof, floor, glass = () => false) => {
    for (let u = u0; u <= u1; u++)
      for (let v = v0; v <= v1; v++) {
        const edge = u === u0 || u === u1 || v === v0 || v === v1;
        put(u, h, v, roof);
        if (!edge) {
          if (floor) put(u, 0, v, floor);
          continue;
        }
        for (let y = 0; y < h; y++) put(u, y, v, glass(u, y, v) ? B.glass : wall);
      }
  };

  // The way in from the Outer Loop, and the parking by the terminal.
  for (let v = 0; v <= 6; v++) for (let u = 14; u <= 21; u++) put(u, 0, v, v === 6 || u === 14 || u === 21 ? B.sidewalk : B.road);
  for (const u of [13, 22]) put(u, 0, 1, stack(B.lantern, B.sidewalk));

  // The terminal: glass along the front and the back (onto the apron), doors both ways.
  box(4, 7, 32, 17, 6, B.white, B.concrete, B.sidewalk, (u, y, v) => (v === 7 || v === 17) && y >= 1 && y <= 4 && u > 4 && u < 32 && u % 4 !== 0);
  for (const v of [7, 17])
    for (const u of [17, 18]) {
      put(u, 0, v, makeBlock(B.door, site.road.axis === 'x' ? 0 : 1));
      put(u, 1, v, makeBlock(B.door, (site.road.axis === 'x' ? 0 : 1) | DOOR_TOP));
      put(u, 2, v, B.glass);
    }
  // Inside: the check-in desk, rows of seats looking out at the planes, plants and lights.
  for (const u of [7, 8, 9, 10, 11]) put(u, 0, 9, stack(makeBlock(B.desk, outward), B.sidewalk));
  put(9, 1, 9, makeBlock(B.register, outward));
  for (const v of [12, 14]) for (const u of [6, 7, 8, 9, 10, 11, 24, 25, 26, 27, 28, 29]) put(u, 0, v, stack(makeBlock(B.chair, inward), B.sidewalk));
  for (const u of [5, 31]) put(u, 0, 8, stack(B.flowerPot, B.sidewalk));
  for (const u of [8, 16, 24]) for (const v of [10, 14]) put(u, 5, v, B.ceilingLight);
  sign(18, 4, 6, onWall(fx, fz), '✈️ BUILDZONE AIRPORT ✈️');

  // The control tower: a tall concrete shaft with a ladder up inside, and a glass cab on top.
  const T0 = 36, T1 = 39, TV0 = 9, TV1 = 12, TOP = 17;
  for (let y = 0; y < TOP; y++)
    for (let u = T0; u <= T1; u++)
      for (let v = TV0; v <= TV1; v++) {
        const edge = u === T0 || u === T1 || v === TV0 || v === TV1;
        if (!edge) continue;
        if (v === TV0 && u === 37 && y < 2) continue; // (the doorway)
        put(u, y, v, y % 5 === 4 ? B.white : B.concrete);
      }
  put(37, 0, TV0, makeBlock(B.door, site.road.axis === 'x' ? 0 : 1));
  put(37, 1, TV0, makeBlock(B.door, (site.road.axis === 'x' ? 0 : 1) | DOOR_TOP));
  // (The ladder runs up the back wall inside, facing the doorway.)
  for (let y = 0; y < TOP; y++) put(37, y, TV1 - 1, makeBlock(B.ladder, outward));
  for (let u = T0 - 1; u <= T1 + 1; u++)
    for (let v = TV0 - 1; v <= TV1 + 1; v++) {
      const edge = u === T0 - 1 || u === T1 + 1 || v === TV0 - 1 || v === TV1 + 1;
      if (!(u === 37 && v === TV1 - 1)) put(u, TOP, v, B.concrete); // (the cab's floor: a hole for the ladder)
      if (edge) for (let y = TOP + 1; y <= TOP + 3; y++) put(u, y, v, y === TOP + 1 ? B.white : B.glass);
      put(u, TOP + 4, v, B.white);
    }
  put(37, TOP, TV1 - 1, makeBlock(B.ladder, outward));
  put(38, TOP + 1, TV0, makeBlock(B.chair, outward)); // (the controller's seat, by the window)
  // A light on top of the tower.
  put(37, TOP + 5, 10, B.lantern);

  // Two hangars, open toward the apron.
  for (const [h0, h1] of [[44, 64], [68, 88]]) {
    for (let u = h0; u <= h1; u++)
      for (let v = 6; v <= 18; v++) {
        const side = u === h0 || u === h1, back = v === 6;
        put(u, 8, v, B.metal);
        if (side || back) for (let y = 0; y < 8; y++) put(u, y, v, y === 7 ? B.white : B.metal);
        else put(u, 0, v, B.road);
      }
    put(Math.floor((h0 + h1) / 2), 6, 7, B.ceilingLight);
  }

  // The apron (where the planes park) and the taxiways out to the runway.
  for (let u = 2; u < L - 2; u++) for (let v = APRON[0]; v <= APRON[1]; v++) put(u, 0, v, B.road);
  for (const [t0, t1] of [[4, 10], [L - 11, L - 5]]) for (let u = t0; u <= t1; u++) for (let v = APRON[1] + 1; v < RUNWAY[0]; v++) put(u, 0, v, u === t0 + 3 ? lineAcross : B.road);
  // Yellow-ish parking spots: a line across the apron at each plane's place.
  for (const u of PARKED) for (let v = APRON[0] + 1; v <= APRON[1] - 1; v++) put(u, 0, v, lineAcross);

  // The runway: a dashed line down the middle, stripes across both ends, lights along the edges.
  for (let u = 2; u < L - 2; u++)
    for (let v = RUNWAY[0]; v <= RUNWAY[1]; v++) {
      const end = u < 8 || u > L - 9;
      let b = B.road;
      if (v === 36 && !end && u % 6 < 3) b = lineAlong;
      if (end && v !== 36 && v % 2 === 0) b = lineAlong; // (the stripes at the ends)
      put(u, 0, v, b);
    }
  for (let u = 2; u < L - 2; u += 7) {
    if (u > 1 && u < 12) continue; // (not on the taxiways)
    if (u > L - 13) continue;
    put(u, 0, RUNWAY[1] + 1, B.gardenLight);
    put(u, 0, RUNWAY[0] - 1, B.gardenLight);
  }
  // Grass in the corners that are left, so it's tidy.
  for (let u = 0; u < L; u++) for (let v = 0; v < D; v++) if (u < 2 || u > L - 3 || v === D - 1) put(u, 0, v, B.grass);

  // The airplanes, parked on the apron, noses toward the runway.
  const h = Math.atan2(-fx, -fz);
  const cars = PARKED.map((u, i) => {
    const [x, z] = site.pos(u + 0.5, (APRON[0] + APRON[1]) / 2 + 0.5);
    return { kind: 'plane', x, y: 0, z, h, color: PLANE_COLORS[i] };
  });
  // And in the hangars: the slow Sky Cub and the fast jet.
  for (const p of HANGAR_PLANES) {
    const [x, z] = site.pos(p.u, p.v);
    cars.push({ kind: p.kind, x, y: 0, z, h, color: p.color });
  }

  const [rx0, rz0] = site.at(0, 0), [rx1, rz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(rx0, rx1), Math.min(rz0, rz1), Math.max(rx0, rx1), Math.max(rz0, rz1)];
  const [gx, gz] = site.pos(20, 11.5);
  const [ax, az] = site.at(5, 8), [bx, bz] = site.at(31, 16);
  const [r0x, r0z] = site.pos(4, 36.5), [r1x, r1z] = site.pos(L - 4, 36.5);
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Airport', key: 'airport', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    // The place (Captain Sky in the terminal), and the runway's two ends (for the clubs).
    place: { x: gx, y: 0, z: gz, face: Math.atan2(fx, fz), area: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)], runway: [r0x, r0z, r1x, r1z], along: [ux, uz] },
  };
}
