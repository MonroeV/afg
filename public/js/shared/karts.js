// Thunder Raceway, the go-kart track out by the Outer Loop (since v0.60): a long twisty loop of
// asphalt with red-and-white curbs and tire walls (low black barriers) along both sides, a
// start/finish line under a gantry with five start lights, a grandstand of seats along the main
// straight, the pit garage in the middle with six go-karts waiting in the pit lane, and a big
// Best Laps board. Hop in a kart, drive out onto the track and go: the server times every lap
// (you have to go all the way round, past every checkpoint), keeps the ten best, and pays coins
// for a new best of your own.
import { makeBlock, stack, SIGN } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = { road: 22, sidewalk: 24, carpet: 35, tire: 17, red: 14, stone: 3, metal: 11, chair: 60, roof: 26, lantern: 45, streetLamp: 46, flowers: 27, cone: 101, planks: 6, glass: 9 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const RACEWAY = { L: 100, D: 64 };
export const HALF = 3.5; // (half the track's width)
export const KART_COINS = 3, RECORD_COINS = 10, BOARD_SIZE = 10;
// The track's middle line, round and round (u along the road, v in from it), clockwise from the
// start straight. It's smoothed into curves (see trackLine).
const LINE = [[16, 16], [48, 16], [78, 16], [92, 26], [90, 40], [78, 46], [66, 40], [58, 48], [54, 56], [38, 55], [26, 46], [14, 48], [9, 36], [10, 24]];
const START_U = 30; // (the start/finish line, on the start straight)
const PIT = { lane: [18, 52, 23, 27], garage: [20, 46, 28, 33], exit: [46, 54], entry: [12, 20] }; // (u0, u1, v0, v1; and the gaps in the barrier)
const STAND = [20, 44, 3, 8]; // (the grandstand: rows from v 8 (the front, lowest) back to v 3)
const BOARD = [50, 56, 3]; // (the Best Laps board, u0..u1, at v)
const KARTS = [19, 25, 31, 37, 43, 49]; // (more than 5 apart: see worldgen.js)

// The middle of the track: points every half block or so, all the way round (a Catmull-Rom curve
// through LINE).
export function trackLine(points = LINE, step = 0.5) {
  const out = [], n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

export function buildRaceway({ get, set, canUse, near = [-120, -RING - 40] }) {
  const site = findBigSite({ ...RACEWAY, tall: 8, near, get, canUse });
  return site ? racewayAt(site, set) : null;
}

function racewayAt(site, set) {
  const { L, D } = RACEWAY;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const inward = faceDir(fx, fz), outward = faceDir(-fx, -fz);
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };
  // Start the line at the start/finish line, so checkpoint 0 is the line.
  let line = trackLine();
  const s0 = line.reduce((best, p, i) => (Math.hypot(p[0] - START_U, p[1] - 16) < Math.hypot(line[best][0] - START_U, line[best][1] - 16) ? i : best), 0);
  line = [...line.slice(s0), ...line.slice(0, s0)];
  // How far each cell is from the middle of the track (and where along it).
  const dist = new Map(), along = new Map();
  for (let u = 0; u < L; u++)
    for (let v = 0; v < D; v++) {
      let best = Infinity, at = 0;
      for (let i = 0; i < line.length; i += 2) {
        const d = Math.hypot(u + 0.5 - line[i][0], v + 0.5 - line[i][1]);
        if (d < best) [best, at] = [d, i];
      }
      if (best < 8) {
        dist.set(`${u},${v}`, best);
        along.set(`${u},${v}`, at);
      }
    }
  const inPit = (u, v) => u >= PIT.lane[0] - 1 && u <= PIT.lane[1] + 1 && v >= PIT.lane[2] && v <= PIT.garage[3] + 1;
  const gap = (u, v) => v > 18 && v < 24 && ((u >= PIT.exit[0] && u <= PIT.exit[1]) || (u >= PIT.entry[0] && u <= PIT.entry[1])); // (the way in and out of the pits)

  // ---------- The track ----------
  for (const [k, d] of dist) {
    const [u, v] = k.split(',').map(Number);
    if (d <= HALF) put(u, 0, v, B.road);
    else if (d <= HALF + 1.1) put(u, 0, v, Math.floor(along.get(k) / 4) % 2 ? B.carpet : B.sidewalk); // (the curbs: red and white)
    else if (d <= HALF + 2.2) {
      // (a strip of grass, then the tire wall)
    } else if (d <= HALF + 3.2 && !inPit(u, v) && !gap(u, v) && v > 0) put(u, 0, v, B.tire);
  }
  // The start/finish line: a checkered stripe across the track.
  const [lu, lv] = line[0], [nu, nv] = line[4];
  const dirU = [nu - lu, nv - lv], dl = Math.hypot(...dirU);
  for (let v = Math.round(lv - HALF); v < Math.round(lv + HALF); v++) for (const du of [0, 1]) put(START_U + du, 0, v, (v + du) % 2 ? B.sidewalk : B.road);
  // The gantry over the line: two tall posts and a beam (the lights hang under it: see kartui.js).
  for (const v of [Math.round(lv - HALF - 3), Math.round(lv + HALF + 2)]) for (let y = 0; y < 6; y++) put(START_U, y, v, B.metal);
  for (let v = Math.round(lv - HALF - 3); v <= Math.round(lv + HALF + 2); v++) put(START_U, 6, v, B.metal);
  sign(START_U, 5, Math.round(lv - HALF - 3) + 1, faceDir(-ux, -uz), '🏁 START / FINISH');

  // ---------- The pits ----------
  const [p0, p1, pv0, pv1] = PIT.lane;
  for (let u = p0; u <= p1; u++) for (let v = pv0; v <= pv1; v++) put(u, 0, v, B.road);
  // (the way out onto the track, and in from it)
  for (const [a, b] of [PIT.exit, PIT.entry]) for (let u = a; u <= b; u++) for (let v = 20; v < pv0; v++) if ((dist.get(`${u},${v}`) ?? 9) > HALF) put(u, 0, v, B.road);
  const [g0, g1, gv0, gv1] = PIT.garage;
  for (let u = g0; u <= g1; u++)
    for (let v = gv0; v <= gv1; v++) {
      const back = v === gv1, side = u === g0 || u === g1;
      put(u, 0, v, back || side ? B.stone : B.sidewalk);
      if (back || side) for (let y = 1; y < 4; y++) put(u, y, v, y === 2 && back && u % 3 === 0 ? B.glass : B.stone);
      put(u, 4, v, B.metal);
    }
  for (let u = g0; u <= g1; u += 4) for (let y = 1; y < 4; y++) put(u, y, gv0, B.metal); // (pillars along the open front)
  for (const u of [g0 + 2, g1 - 2]) put(u, 3, gv0 + 2, 41); // (lights inside)
  sign(Math.floor((g0 + g1) / 2), 3, gv0, outward, '🏎️ PIT GARAGE · Hop in a kart!');
  for (const [u, v] of [[p0, pv0], [p1, pv0], [p0, pv1], [p1, pv1]]) put(u, 0, v, stack(B.cone, B.road));

  // ---------- The grandstand ----------
  // Rows of seats stepping up away from the track, a roof over them, and lamps.
  const [s0u, s1u, sv0, sv1] = STAND;
  for (let u = s0u; u <= s1u; u++)
    for (let v = sv0; v <= sv1; v++) {
      const row = sv1 - v; // (0: the front)
      for (let y = 0; y < row; y++) put(u, y, v, B.stone);
      if (u % 2 === 0 && u > s0u && u < s1u) put(u, row, v, makeBlock(B.chair, inward));
      put(u, 7, v, B.roof);
    }
  for (const u of [s0u, s1u]) for (let y = 0; y < 7; y++) put(u, y, sv0, B.metal);
  for (const u of [s0u, Math.floor((s0u + s1u) / 2), s1u]) for (let y = 0; y < 7; y++) put(u, y, sv1 + 0, y < 1 ? B.stone : B.metal);
  sign(Math.floor((s0u + s1u) / 2) + 1, 6, sv1, inward, '🏎️ THUNDER RACEWAY 🏁');
  // The way in from the road, and lamps along it.
  for (let u = s1u + 1; u <= s1u + 4; u++) for (let v = 0; v <= 9; v++) put(u, 0, v, B.sidewalk);
  for (const u of [s0u - 2, s1u + 5]) put(u, 0, 1, B.streetLamp);
  sign(s1u + 5, 1, 0, outward, '🏎️ THUNDER RACEWAY · Go-karts! Best laps win 🪙');
  put(s1u + 5, 0, 0, B.planks);

  // ---------- The Best Laps board ----------
  // Two posts and a frame (the board itself is drawn by everyone's game: see kartui.js).
  const [b0, b1, bv] = BOARD;
  for (const u of [b0, b1]) for (let y = 0; y < 9; y++) put(u, y, bv, B.metal);
  for (let u = b0; u <= b1; u++) put(u, 9, bv, B.metal);

  // ---------- The karts ----------
  // In a row in the pit lane, noses toward the way out.
  const h = Math.atan2(ux, uz) + Math.PI, cars = []; // (facing +u)
  KARTS.forEach((u, i) => {
    const [x, z] = site.pos(u + 0.5, 25);
    cars.push({ kind: 'kart', color: ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#8e24aa', '#ff7043'][i], x, y: 0, z, h });
  });

  // Where things are, in the world: the checkpoints round the track (every 12 blocks or so: the
  // first is the start/finish line), the start lights, the board.
  const world = (u, v) => site.pos(u, v);
  const cps = [];
  let since = Infinity, total = 0;
  for (let i = 0; i < line.length; i++) {
    if (i) {
      const d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      since += d;
      total += d;
    }
    if (since >= 12 && line.length - i > 8) {
      cps.push(world(line[i][0], line[i][1]));
      since = 0;
    }
  }
  const [lx, lz] = world(START_U + 0.5, lv), [ax, az] = world(START_U + 0.5 + dirU[0] / dl, lv + dirU[1] / dl);
  const [rx0, rz0] = site.at(0, 0), [rx1, rz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(rx0, rx1), Math.min(rz0, rz1), Math.max(rx0, rx1), Math.max(rz0, rz1)];
  const [px, pz] = world(32, 27.5), [qa, qb] = [world(24, 26.5), world(44, 29)];
  const [bx, bz] = world((b0 + b1 + 1) / 2, bv + 0.6);
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Thunder Raceway', key: 'raceway', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      raceway: {
        x: lx, y: 0, z: lz, rect, cps, length: Math.round(total), half: HALF,
        // (which way round: from the line toward checkpoint 1)
        dir: [ax - lx, az - lz],
        lights: { x: world(START_U + 0.5, lv)[0], y: 5.3, z: world(START_U + 0.5, lv)[1], face: Math.atan2(-ux, -uz) },
        board: { x: bx, y: 4.6, z: bz, face: Math.atan2(fx, fz), w: b1 - b0 - 0.6, h: 7.4 },
      },
      raceway_pit: { x: px, y: 0, z: pz, face: Math.atan2(-fx, -fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}

// The minimum believable time for a lap (a little quicker than flat out the whole way round,
// turbo and all), in ms.
export const minLap = (length, top = 15 * 1.2) => (length / top) * 1000 * 0.85;
