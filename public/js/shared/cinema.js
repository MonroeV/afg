// The Starlight Cinema, out by the Outer Loop (since v0.68): a movie theater with a glowing marquee
// out front (it says what's showing), a lobby with a snack counter (Usher Ollie: big popcorn,
// nachos, slushies), and a big dark theater with rows of seats stepping up toward the back, all
// facing a giant screen. The shows run all day on the game's clock (the same for everyone):
// previews, then the feature (a cartoon, The Space Show or Animal Friends). Right-click a seat to
// sit down and watch. (The screen and the marquee are drawn by everyone's game: see cinemaui.js.)
import { makeBlock, stack, SIGN, DOOR_TOP } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = {
  road: 22, sidewalk: 24, carpet: 35, red: 14, gold: 38, white: 12, black: 17, glass: 9, stone: 3, door: 21, chair: 60, couch: 61,
  counter: 135, register: 86, plant: 67, light: 41, chandelier: 42, neonPink: 50, neonBlue: 51, lamp: 18, streetLamp: 46, flowers: 27, metal: 11, poster: 66,
};
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const CINEMA = { L: 44, D: 50 };
const BLD = [3, 40, 6, 46], H = 15; // (the building; the walls go up to y 14)
const LOBBY = 17; // (the wall between the lobby and the theater, at v)
const ROWS = 9; // (rows of seats)
// The shows: what's on, second by second, round and round (game time).
export const SHOW = { cycle: 150, previews: 18, title: 4 };
export const FEATURES = [
  { channel: 'Cartoons', title: 'Blocky Bunny Adventures 🐰' },
  { channel: 'The Space Show 🚀', title: 'Journey to the Stars 🚀' },
  { channel: 'Animal Friends 🦁', title: 'Wild Animal Friends 🦁' },
];
// What's on at game time t: { part: 'previews' | 'title' | 'feature', feature, since }.
export function showAt(t) {
  const n = Math.floor(t / SHOW.cycle), s = t - n * SHOW.cycle, feature = FEATURES[((n % FEATURES.length) + FEATURES.length) % FEATURES.length];
  if (s < SHOW.previews) return { part: 'previews', feature, since: s };
  if (s < SHOW.previews + SHOW.title) return { part: 'title', feature, since: s - SHOW.previews };
  return { part: 'feature', feature, since: s - SHOW.previews - SHOW.title };
}

export function buildCinema({ get, set, canUse, near = [RING - 60, -380] }) {
  const site = findBigSite({ ...CINEMA, tall: 16, near, get, canUse });
  return site ? cinemaAt(site, set) : null;
}

function cinemaAt(site, set) {
  const { L, D } = CINEMA;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV;
  const outward = faceDir(-fx, -fz);
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };
  const [b0, b1, bv0, bv1] = BLD;
  const doorFacing = site.road.axis === 'x' ? 0 : 1;

  // ---------- Out front ----------
  // A red carpet up to the doors, gold posts with lamps, flowers, the street lamps.
  for (let u = 2; u <= 41; u++) for (let v = 0; v <= 5; v++) put(u, 0, v, B.sidewalk);
  for (let u = 18; u <= 25; u++) for (let v = 1; v <= 5; v++) put(u, 0, v, B.carpet);
  for (const u of [17, 26]) for (const v of [1, 3, 5]) {
    put(u, 0, v, B.gold);
    put(u, 1, v, B.lamp);
  }
  for (const [u, v] of [[2, 0], [41, 0]]) put(u, 0, v, B.streetLamp);
  for (let u = 3; u <= 40; u++) if (u < 16 || u > 27) put(u, 0, 5, B.flowers);

  // ---------- The building ----------
  for (let u = b0; u <= b1; u++)
    for (let v = bv0; v <= bv1; v++) {
      const edgeU = u === b0 || u === b1, edgeV = v === bv0 || v === bv1;
      put(u, H, v, B.black);
      if (!edgeU && !edgeV) {
        put(u, 0, v, B.carpet);
        continue;
      }
      for (let y = 0; y < H; y++) {
        if (v === bv0 && u >= 19 && u <= 24 && y < 2) continue; // (the doors)
        const window = v === bv0 && y >= 1 && y <= 3 && (u < 17 || u > 26) && u % 2 === 0; // (the lobby's windows)
        put(u, y, v, window ? B.glass : y >= H - 1 ? B.gold : B.red);
      }
    }
  for (let u = 19; u <= 24; u++) {
    put(u, 0, bv0, makeBlock(B.door, doorFacing));
    put(u, 1, bv0, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  // The marquee over the doors: a big frame with lights round it (the words are drawn by
  // everyone's game), and neon along the top of the building.
  for (let u = 13; u <= 30; u++) for (const y of [5, 11]) put(u, y, bv0 - 1, B.lamp);
  for (let y = 5; y <= 11; y++) for (const u of [13, 30]) put(u, y, bv0 - 1, B.lamp);
  for (let u = b0; u <= b1; u++) put(u, H + 1, bv0, u % 2 ? B.neonPink : B.neonBlue);
  sign(21, 3, bv0 - 1, outward, '🎬 STARLIGHT CINEMA · Movies all day! 🍿');
  // Movie posters either side of the doors.
  for (const u of [10, 33]) put(u, 2, bv0 - 1, makeBlock(B.poster, outward));

  // ---------- The lobby ----------
  // The snack counter, plants, couches, chandeliers.
  for (let u = 6; u <= 15; u++) put(u, 0, 12, stack(makeBlock(B.counter, outward), B.carpet));
  put(10, 0, 13, stack(makeBlock(B.register, outward), B.carpet));
  sign(10, 2, 12, outward, '🍿 SNACKS · Big popcorn, nachos, slushies!');
  for (const u of [30, 31, 32]) put(u, 0, 14, stack(makeBlock(B.couch, outward), B.carpet));
  for (const [u, v] of [[5, 8], [38, 8], [17, 15], [26, 15]]) put(u, 0, v, stack(B.plant, B.carpet));
  for (const u of [12, 21, 30]) put(u, 5, 11, B.chandelier);
  // The wall into the theater (two doorways).
  for (let u = b0 + 1; u < b1; u++) for (let y = 0; y < H; y++) if (!((u === 8 || u === 9 || u === 34 || u === 35) && y < 2)) put(u, y, LOBBY, B.red);
  sign(21, 3, LOBBY, outward, '🎬 THEATER 1 · Please be quiet! 🤫');

  // ---------- The theater ----------
  // Rows of seats stepping up toward the back, all facing the screen (at the front, by the
  // lobby wall). Aisles down both sides.
  const front = LOBBY + 6;
  for (let r = 0; r < ROWS; r++) {
    const v = front + r * 2, y = Math.floor(r / 2);
    for (let u = b0 + 1; u < b1; u++) {
      for (let k = 0; k < y; k++) for (const dv of [0, 1]) put(u, k, v + dv, B.stone);
      if (u >= 7 && u <= 36) put(u, y, v, makeBlock(B.chair, outward));
    }
  }
  // (steps up the aisles: dark carpet over stone)
  for (const u of [5, 38]) put(u, H - 1, 30, B.light);
  // The stage under the screen.
  for (let u = 6; u <= 37; u++) for (let v = LOBBY + 1; v <= LOBBY + 2; v++) put(u, 0, v, B.black);

  // Where things are, in the world.
  const at = (u, v) => site.pos(u, v);
  const [sx, sz] = at(21.5, LOBBY + 1.05), [mx, mz] = at(21.5, bv0 - 1.05);
  const [ax0, az0] = site.at(0, 0), [ax1, az1] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
  const [hx0, hz0] = site.at(b0 + 1, LOBBY + 1), [hx1, hz1] = site.at(b1 - 1, bv1 - 1);
  const [px, pz] = at(10.5, 14.5), [qa, qb] = [at(7, 13.5), at(14, 15.5)];
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Starlight Cinema', key: 'cinema', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      // screen: the big screen (facing the seats); marquee: the sign over the doors (facing the
      // street); hall: the theater's floor (inside it, you hear the show)
      cinema: {
        x: at(21.5, 9)[0], y: 0, z: at(21.5, 9)[1], rect,
        screen: { x: sx, y: 7.5, z: sz, face: Math.atan2(fx, fz), w: 28, h: 11 },
        marquee: { x: mx, y: 8, z: mz, face: Math.atan2(-fx, -fz), w: 15.6, h: 5.6 },
        hall: [Math.min(hx0, hx1), Math.min(hz0, hz1), Math.max(hx0, hx1) + 1, Math.max(hz0, hz1) + 1],
      },
      cinema_snacks: { x: px, y: 0, z: pz, face: Math.atan2(-fx, -fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}
