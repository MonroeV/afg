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
export const AIRPORT = { L: 130, D: 55 };
const { L, D } = AIRPORT;
const TALL = 12; // (how high it has to be empty)
// Rows (v): the terminal 7-17, the hangars 6-18, the apron 19-27, a grass strip 28-29 (crossed by
// short links from each parking spot and hangar), the taxiway 30-34 (a yellow line down its
// middle, at 32), grass 35-41 (crossed by links to the runway at both ends and the middle), the
// runway 42-50 (its center line at 46), its edge lights at 41 and 51. (Before v0.56.3 the runway
// was at 32-40, right next to the apron, with no taxiway.)
const RUNWAY = [42, 50], APRON = [19, 27], TAXIWAY = [30, 34];
const RUNWAY_MID = 46, TAXI_MID = 32;
const OLD_RUNWAY = [32, 40];
const PARKED = [22, 36, 96, 108]; // (where the airplanes park along the apron, u: not in front of the hangars)
export const HANGARS = [[44, 64], [68, 88]]; // (u0, u1 of each hangar: their doors open onto the apron)
// (Before v0.56.1 two of them parked at 54 and 78, right in front of the hangar doors.)
const OLD_PARKED = [54, 78];
const PLANE_COLORS = ['#e53935', '#fdd835', '#1e88e5', '#f5f5f5'];
// (Since v0.56, a plane in each hangar, nose out: the Sky Cub, a slow one for sightseeing, and a
// fast jet.)
const HANGAR_PLANES = [{ kind: 'cub', u: 54.5, v: 12.5, color: '#ffb300' }, { kind: 'jet', u: 78.5, v: 12.5, color: '#546e7a' }];
// The links across the grass: from the apron to the taxiway (one from each parking spot, each
// hangar, and both ends), and from the taxiway to the runway (both ends and the middle).
const APRON_LINKS = [[4, 10], ...PARKED.map(u => [u - 2, u + 2]), [52, 57], [76, 81], [L - 11, L - 5]];
const RUNWAY_LINKS = [[4, 10], [61, 67], [L - 11, L - 5]];
const inLink = (links, u) => links.some(([a, b]) => u >= a && u <= b);

// The airfield: the apron, the links, the taxiway and the runway, with their lines and lights.
// put(u, y, v, block) in the airport's own space. (New airports, and old ones being redone.)
function airfield(put, lineAlong, lineAcross) {
  // The apron, with a lead-in line from each parking spot and each hangar.
  for (let u = 2; u < L - 2; u++) for (let v = APRON[0]; v <= APRON[1]; v++) put(u, 0, v, B.road);
  for (const u of [...PARKED, 54, 78]) for (let v = APRON[0] + 1; v <= APRON[1]; v++) put(u, 0, v, lineAcross);
  // The links to the taxiway (their lead-in lines carry on across them).
  for (const [a, b] of APRON_LINKS)
    for (let u = a; u <= b; u++)
      for (let v = APRON[1] + 1; v < TAXIWAY[0]; v++) put(u, 0, v, u === (a === 4 || a === L - 11 ? a + 3 : Math.round((a + b) / 2)) ? lineAcross : B.road);
  // The taxiway: all the way along, a yellow line down the middle.
  for (let u = 4; u <= L - 5; u++) for (let v = TAXIWAY[0]; v <= TAXIWAY[1]; v++) put(u, 0, v, v === TAXI_MID ? lineAlong : B.road);
  // The links to the runway.
  for (const [a, b] of RUNWAY_LINKS)
    for (let u = a; u <= b; u++)
      for (let v = TAXIWAY[1] + 1; v < RUNWAY[0]; v++) put(u, 0, v, u === a + 3 ? lineAcross : B.road);
  // The runway: a dashed line down the middle, stripes across both ends.
  for (let u = 2; u < L - 2; u++)
    for (let v = RUNWAY[0]; v <= RUNWAY[1]; v++) {
      const end = u < 8 || u > L - 9;
      let b = B.road;
      if (v === RUNWAY_MID && !end && u % 6 < 3) b = lineAlong;
      if (end && v !== RUNWAY_MID && v % 2 === 0) b = lineAlong; // (the stripes at the ends)
      put(u, 0, v, b);
    }
  // Lights along the runway's edges, and along the taxiway's (not where the links cross).
  for (let u = 2; u < L - 2; u += 7) {
    if (u < 12 || u > L - 13) continue;
    if (!inLink(RUNWAY_LINKS, u)) put(u, 0, RUNWAY[0] - 1, B.gardenLight);
    put(u, 0, RUNWAY[1] + 1, B.gardenLight);
  }
  for (let u = 13; u < L - 12; u += 10) {
    if (!inLink(APRON_LINKS, u)) put(u, 0, TAXIWAY[0] - 1, B.gardenLight);
    if (!inLink(RUNWAY_LINKS, u)) put(u, 0, TAXIWAY[1] + 1, B.gardenLight);
  }
}

// An airport that's already built: its own space (u along the road, v away from it), worked
// out from where its terminal and runway are. pos(u, v) is the world; uv(x, z) the other way.
export function airportFrame(place) {
  if (!place?.runway || !place.along) return null;
  const [ux, uz] = place.along, [r0x, r0z] = place.runway;
  // (Which way is away from the road: kept since v0.56.3; before that, worked out from the
  // terminal's spot, at (20, 11.5) in the airport's own space, and where the runway started then:
  // (4, 36.5).)
  const [vx, vz] = place.away || [(r0x - place.x + 16 * ux) / 25, (r0z - place.z + 16 * uz) / 25];
  return {
    pos: (u, v) => [place.x + (u - 20) * ux + (v - 11.5) * vx, place.z + (u - 20) * uz + (v - 11.5) * vz],
    uv: (x, z) => [20 + (x - place.x) * ux + (z - place.z) * uz, 11.5 + (x - place.x) * vx + (z - place.z) * vz],
    h: Math.atan2(-vx, -vz), // (nose toward the runway)
  };
}

// The hangar planes for an airport that's already built, for worlds from before they were added.
export function hangarPlanes(place) {
  const f = airportFrame(place);
  if (!f) return [];
  return HANGAR_PLANES.map(p => {
    const [x, z] = f.pos(p.u, p.v);
    return { kind: p.kind, x, y: 0, z, h: f.h, color: p.color };
  });
}

// Airplanes parked on the apron in front of a hangar's doors (in worlds from before v0.56.1):
// where they should park instead (out of the way). [{ home, x, z }]
export function planesOutOfTheWay(place, homes) {
  const f = airportFrame(place);
  if (!f) return [];
  const moves = [];
  const free = PARKED.filter(u => !homes.some(h => {
    const [hu, hv] = f.uv(h.x, h.z);
    return Math.abs(hu - (u + 0.5)) < 3 && hv > APRON[0] - 1 && hv < APRON[1] + 1;
  }));
  for (const home of homes) {
    if (!VEHICLE_PLANES.includes(home.kind)) continue;
    const [u, v] = f.uv(home.x, home.z);
    const blocking = v > APRON[0] - 1 && v < APRON[1] + 1 && HANGARS.some(([h0, h1]) => u > h0 - 4 && u < h1 + 4) && OLD_PARKED.some(o => Math.abs(u - (o + 0.5)) < 3);
    if (!blocking || !free.length) continue;
    const [x, z] = f.pos(free.shift() + 0.5, (APRON[0] + APRON[1]) / 2 + 0.5);
    moves.push({ home, x, z });
  }
  return moves;
}
const VEHICLE_PLANES = ['plane', 'cub', 'jet'];

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

  // The apron (where the planes park), the taxiway and the runway (see airfield).
  airfield(put, lineAlong, lineAcross);
  // (The edges are left as the ground they're on. Before v0.56.2 they were a strip of Grass
  // blocks: a curb a block high at both ends of the runway, that blew up planes running off it.)

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
  const [r0x, r0z] = site.pos(4, RUNWAY_MID + 0.5), [r1x, r1z] = site.pos(L - 4, RUNWAY_MID + 0.5);
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Airport', key: 'airport', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    // The place (Captain Sky in the terminal), and the runway's two ends (for the clubs).
    place: { x: gx, y: 0, z: gz, face: Math.atan2(fx, fz), area: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)], runway: [r0x, r0z, r1x, r1z], along: [ux, uz], away: [fx, fz] },
  };
}

// That curb, in worlds from before v0.56.2: the Grass blocks along the airport's edges (only
// those: anything else built there stays). [[x, z], ...]
export function airportCurb(place) {
  const f = airportFrame(place);
  if (!f) return [];
  const out = [];
  for (let u = 0; u < L; u++)
    for (let v = 0; v < D; v++) {
      if (!(u < 2 || u > L - 3 || v === D - 1)) continue;
      const [x, z] = f.pos(u + 0.5, v + 0.5);
      out.push([Math.floor(x), Math.floor(z)]);
    }
  return out;
}

// An airport from before v0.56.3 (the runway right next to the apron): moved out a way, with a
// proper taxiway between. Only if the land beyond is empty and nobody's: get, set, del (a block
// at x, y, z), canUse. Returns the new place and claim rectangle, or null if there's no room.
export function addTaxiway(place, { get, set, del, canUse }) {
  const f = airportFrame(place);
  if (!f || place.away) return null; // (already done)
  const cell = (u, v) => f.pos(u + 0.5, v + 0.5).map(Math.floor);
  for (let u = 0; u < L; u++)
    for (let v = 44; v < D; v++) {
      const [x, z] = cell(u, v);
      if (!canUse(x, z)) return null;
      for (let y = 0; y < 14; y++) if (get(x, y, z)) return null;
    }
  // Clear the old runway's lines and lights (just those: road, lines, lights) from where the
  // grass goes now; then lay the new airfield.
  const ours = new Set([22, 23, 55, 47]);
  for (let u = 0; u < L; u++)
    for (let v = OLD_RUNWAY[0] - 1; v <= OLD_RUNWAY[1] + 1; v++) {
      const [x, z] = cell(u, v);
      if (ours.has(get(x, 0, z) & 255)) del(x, 0, z);
    }
  const axisX = Math.abs(place.along[0]) > 0.5; // (the road the airport's beside runs along x?)
  const lineAlong = axisX ? B.lineX : B.line, lineAcross = axisX ? B.line : B.lineX;
  airfield((u, y, v, b) => {
    const [x, z] = cell(u, v);
    set(x, y, z, b);
  }, lineAlong, lineAcross);
  const vx = f.pos(0, 1)[0] - f.pos(0, 0)[0], vz = f.pos(0, 1)[1] - f.pos(0, 0)[1];
  const [r0x, r0z] = f.pos(4, RUNWAY_MID + 0.5), [r1x, r1z] = f.pos(L - 4, RUNWAY_MID + 0.5);
  const [ax, az] = cell(0, 0), [bx, bz] = cell(L - 1, D - 1);
  return {
    place: { ...place, runway: [r0x, r0z, r1x, r1z], away: [vx, vz] },
    rect: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)],
  };
}
