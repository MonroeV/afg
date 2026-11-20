// Fun Land, the amusement park out by the Outer Loop (since v0.52): a roller coaster, a Ferris
// wheel, bumper cars (in a fenced arena), a merry-go-round (the Build Book's: it turns by itself)
// and Pete's snack stand. The coaster and the wheel are drawn and run by each player's game (see
// funrides.js): their shapes are here, in the park's own space (u along the road, v away from
// it, y up), so the server and every game agree. Right-click a ride's gate 🎟️ to ride.
import { makeBlock, stack, SIGN } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

export const GATE_BLOCK = 148;
const B = { sidewalk: 24, road: 22, planks: 6, log: 7, leaves: 8, lantern: 45, partyLights: 49, flowers: 27, railing: 54, rainbow: 28, yellow: 16, red: 14, white: 12, desk: 73, register: 86, picnic: 102, gate: GATE_BLOCK };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
export const FUNLAND = { L: 60, D: 45 };

// ---------- The rides' shapes (in the park's own space) ----------

// The roller coaster: points it passes through ([u, y, v]), round in a loop. It leaves the
// station (along +u), clanks up the lift hill, drops, swoops round and comes back.
export const COASTER = [
  [25, 1.3, 10], [30, 1.3, 10], [36, 1.3, 10],
  [40, 3, 10], [44, 7.5, 10], [48, 12.5, 10], [51, 15.5, 10.5], [53.5, 16, 12.5],
  [55, 9, 16], [55, 2, 20], [54, 2.6, 25],
  [52, 8.5, 30], [48, 10, 33.5], [43, 9, 35],
  [38, 3, 35], [33, 6.5, 34], [29, 4.5, 30],
  [26, 3, 24], [22.5, 2, 18], [22.5, 1.4, 13], [23.5, 1.2, 10.5],
];
export const COASTER_STATION = 1; // (the ride starts and ends at this point)
export const COASTER_CREST = 7; // (the top of the lift hill)
// The Ferris wheel: its middle, size, gondolas, and how long one turn takes (seconds). It turns
// in the v-y plane.
export const WHEEL = { u: 14, y: 12.5, v: 17, r: 10, gondolas: 8, turn: 48 };
// The bumper car arena (u0, v0, u1, v1: its floor, inside the fence).
const ARENA = [3, 29, 19, 41];
// Signs by the two gates (u, v, what they say).
const RIDE_SIGNS = [[32, 8, '🎢 ROLLER COASTER! Right-click the red gate 🎟️'], [15, WHEEL.v - 4, '🎡 FERRIS WHEEL! Right-click the red gate 🎟️']];

// The signs, for a Fun Land built before they were added: where they go (if the spot's free).
export function rideSigns(place) {
  const f = place?.frame;
  if (!f) return [];
  const cell = (u, v) => [Math.floor(f.o[0] + (u + 0.5) * f.U[0] + (v + 0.5) * f.V[0]), Math.floor(f.o[1] + (u + 0.5) * f.U[1] + (v + 0.5) * f.V[1])];
  const outward = faceDir(-f.V[0], -f.V[1]);
  return RIDE_SIGNS.map(([u, v, text]) => [...cell(u, v), outward, text]);
}

// A smooth path through the coaster's points (Catmull-Rom, closed): sample points about every
// half block, with how far along each is. Each: [u, y, v, s].
export function coasterPath() {
  const P = COASTER, n = P.length, out = [];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  let s = 0, last = null;
  const marks = [];
  for (let i = 0; i < n; i++) {
    marks[i] = s;
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const steps = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) * 2);
    for (let k = 0; k < steps; k++) {
      const t = k / steps, q = [0, 1, 2].map(j => cr(p0[j], p1[j], p2[j], p3[j], t));
      if (last) s += Math.hypot(q[0] - last[0], q[1] - last[1], q[2] - last[2]);
      out.push([...q, s]);
      last = q;
    }
  }
  const first = out[0];
  s += Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2]);
  return { pts: out, length: s, marks };
}

// ---------- Building it ----------

export function buildFunLand({ get, set, canUse, near = [-RING - 30, 260] }) {
  const site = findBigSite({ ...FUNLAND, tall: 24, near, get, canUse });
  return site ? funLandAt(site, set) : null;
}

function funLandAt(site, set) {
  const { L, D } = FUNLAND;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV;
  const outward = faceDir(-fx, -fz);
  const signs = [];
  // A hedge round it all, with the way in (and an arch) in the middle at the front.
  for (let u = 0; u < L; u++)
    for (let v = 0; v < D; v++) {
      const edge = u === 0 || u === L - 1 || v === D - 1 || v === 1;
      if (edge && !(v === 1 && u >= 28 && u <= 31)) put(u, 0, v, B.leaves);
    }
  // Paths: in from the road, along the front, and out to each ride.
  for (let u = 28; u <= 31; u++) for (let v = 0; v <= 6; v++) put(u, 0, v, B.sidewalk);
  for (let u = 2; u < L - 2; u++) for (const v of [5, 6]) put(u, 0, v, B.sidewalk);
  for (let v = 7; v <= 13; v++) put(14, 0, v, B.sidewalk);
  for (let v = 7; v <= 27; v++) put(10, 0, v, B.sidewalk);
  for (let v = 7; v <= 8; v++) put(30, 0, v, B.sidewalk);
  for (const u of [4, 16, 22, 34, 52, 56]) put(u, 0, 4, B.lantern);
  // The arch over the way in, with party lights and the sign.
  for (const u of [27, 32]) for (let y = 0; y < 5; y++) put(u, y, 1, y === 4 ? B.partyLights : B.log);
  for (let u = 27; u <= 32; u++) put(u, 5, 1, u % 2 ? B.red : B.yellow);
  const [sx, sz] = site.at(29, 1);
  set(sx - fx, 4, sz - fz, makeBlock(SIGN, onWall(fx, fz)));
  signs.push([sx - fx, 4, sz - fz, '🎢 FUN LAND 🎡 Rides for everyone!']);

  // The merry-go-round (Rainbow in the middle of eight Yellow: see the Build Book).
  for (let u = 47; u <= 49; u++) for (let v = 2; v <= 4; v++) put(u, 0, v, u === 48 && v === 3 ? B.rainbow : B.yellow);
  // Pete's snack stand: a counter facing the path (Pete behind it), with a striped awning.
  for (let u = 39; u <= 41; u++) put(u, 0, 4, stack(makeBlock(B.desk, outward), B.sidewalk));
  for (let u = 38; u <= 42; u++) for (const v of [3, 4]) put(u, 3, v, (u + v) % 2 ? B.red : B.white);
  for (const u of [38, 42]) for (let y = 0; y < 3; y++) put(u, y, 4, B.log);
  put(40, 1, 4, makeBlock(B.register, outward));
  for (const u of [35, 45]) put(u, 0, 8, B.picnic);

  // The Ferris wheel's boarding platform (the wheel itself is drawn by the game) and its gate.
  for (let u = WHEEL.u - 2; u <= WHEEL.u + 2; u++) for (let v = WHEEL.v - 2; v <= WHEEL.v + 2; v++) put(u, 0, v, B.planks);
  put(WHEEL.u, 0, WHEEL.v - 4, makeBlock(B.gate, outward));
  // The coaster's station platform (under the track), and its gate at the end of the path.
  for (let u = 25; u <= 36; u++) for (let v = 9; v <= 11; v++) put(u, 0, v, B.planks);
  put(31, 0, 8, makeBlock(B.gate, outward));
  // (Signs by the gates, so everyone knows how: since v0.57.1.)
  for (const [u, v, text] of RIDE_SIGNS) {
    const [x, z] = site.at(u, v);
    set(x, 0, z, makeBlock(SIGN, outward));
    signs.push([x, 0, z, text]);
  }

  // The bumper car arena: a smooth floor with a railing all round (a gap to walk in).
  const [a0, b0, a1, b1] = ARENA;
  for (let u = a0 - 1; u <= a1 + 1; u++)
    for (let v = b0 - 1; v <= b1 + 1; v++) {
      const wall = u === a0 - 1 || u === a1 + 1 || v === b0 - 1 || v === b1 + 1;
      if (!wall) {
        put(u, 0, v, B.road);
        continue;
      }
      if (u === 10 && v === b0 - 1) {
        put(u, 0, v, B.sidewalk); // (the way in: too narrow for a bumper car)
        continue;
      }
      let mask = 0;
      if (u === a0 - 1) mask |= site.edge(1, 0);
      if (u === a1 + 1) mask |= site.edge(-1, 0);
      if (v === b0 - 1) mask |= site.edge(0, 1);
      if (v === b1 + 1) mask |= site.edge(0, -1);
      put(u, 0, v, stack(makeBlock(B.railing, mask), B.road));
    }
  for (const [u, v] of [[a0 - 1, b0 - 1], [a1 + 1, b0 - 1], [a0 - 1, b1 + 1], [a1 + 1, b1 + 1]]) put(u, 1, v, B.partyLights);
  // Six bumper cars, waiting in the arena.
  const colors = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#ab47bc', '#ff7043'];
  const cars = colors.map((color, i) => {
    const [x, z] = site.pos(a0 + 3 + (i % 3) * 5.5, b0 + 4 + Math.floor(i / 3) * 6);
    return { kind: 'bumper', x, y: 0, z, h: Math.atan2(-fx, -fz), color };
  });
  // Flower beds, and benches by the paths.
  for (const [u0, v0] of [[22, 38], [44, 40], [36, 22]]) for (let u = u0; u < u0 + 4; u++) for (let v = v0; v < v0 + 2; v++) put(u, 0, v, B.flowers);

  // Where things are: the park's frame (to turn its own space into the world's), the gates,
  // and the snack stand (for Pete).
  const [ox, oz] = site.pos(0, 0), frame = { o: [ox, oz], U: site.dirU, V: site.dirV };
  const w = (u, v) => [ox + u * site.dirU[0] + v * site.dirV[0], oz + u * site.dirU[1] + v * site.dirV[1]];
  const [rx0, rz0] = site.at(0, 0), [rx1, rz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(rx0, rx1), Math.min(rz0, rz1), Math.max(rx0, rx1), Math.max(rz0, rz1)];
  const [px, pz] = w(29.5, 7.5), [kx, kz] = w(40.5, 3.5);
  return {
    signs, cars, frame,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Fun Land', key: 'funland', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      funland: { x: px, y: 0, z: pz, frame, gates: { coaster: w(31.5, 8.5), wheel: w(WHEEL.u + 0.5, WHEEL.v - 3.5) }, rect },
      funland_snacks: { x: kx, y: 0, z: kz, face: Math.atan2(-fx, -fz), area: [Math.min(w(39, 2)[0], w(42, 4)[0]), Math.min(w(39, 2)[1], w(42, 4)[1]), Math.max(w(39, 2)[0], w(42, 4)[0]), Math.max(w(39, 2)[1], w(42, 4)[1])] },
    },
  };
}
