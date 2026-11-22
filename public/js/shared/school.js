// BuildZone Elementary, out by the Outer Loop (since v0.66): a red brick school with a flag out
// front and a bus loop (a yellow school bus waits there: lots of seats for friends!). Inside, down
// the hall: three classrooms (rows of desks facing a whiteboard with a fun fact on it), the
// library (bookshelves, reading tables, comfy couches), the cafeteria (long tables and the lunch
// counter), and the gym (bleachers, a painted court). Out back: the playground (slides, a
// sandbox, monkey bars). Ms. Lee is in her classroom: talk to her for a quiz question (get it
// right for coins!).
import { makeBlock, stack, SIGN, DOOR_TOP } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = {
  brick: 5, white: 12, glass: 9, roof: 26, floor: 25, tile: 24, carpet: 35, door: 21, road: 22, line: 23, sidewalk: 24, sand: 10, metal: 11,
  desk: 73, chair: 60, board: 78, shelf: 63, table: 62, couch: 61, picnic: 102, counter: 135, plant: 67, light: 41, slide: 146, railing: 54,
  streetLamp: 46, flowers: 27, red: 14, blue: 15, yellow: 16, stairs: 149, lantern: 45, teddy: 68,
};
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const SCHOOL = { L: 60, D: 50 };
export const QUIZ_COINS = 2, QUIZ_DAILY = 10; // (coins for a right answer; at most this many a day)
const BLD = [3, 56, 12, 36], H = 5; // (the building: u0, u1, v0, v1; walls up to y 4)
const HALL = [17, 19]; // (the hallway across, v)
// The doorways in the hall walls (u), and the desks (with their chairs) that used to stand right
// in front of a classroom's doorway, so you couldn't get in (fixed in v0.70.1): [u, v] of each.
const DOORWAY = u => u % 9 === 4 || u === 29 || u === 30;
const CLASSROOMS = [[3, 14], [14, 26], [33, 45]];
export const DESKS_IN_DOORWAYS = CLASSROOMS.flatMap(([u0, u1]) => {
  const out = [];
  for (let u = u0 + 4; u <= u1 - 2; u += 2) if (DOORWAY(u) || DOORWAY(u + 1)) out.push([u, HALL[0] - 2], [u + 1, HALL[0] - 2]);
  return out;
});

// Ms. Lee's quiz: [question, right answer, wrong answer].
export const QUIZ = [
  ['What is 2 + 3?', '5', '6'], ['What is 10 − 4?', '6', '7'], ['What is 3 × 3?', '9', '6'], ['How many legs does a spider have?', '8 🕷️', '6'],
  ['Which planet is called the Red Planet?', 'Mars 🔴', 'Venus'], ['What do bees make?', 'Honey 🍯', 'Milk'], ['How many days are in a week?', '7', '5'],
  ['Which is the biggest ocean?', 'Pacific 🌊', 'Atlantic'], ['What color do you get mixing blue and yellow?', 'Green 💚', 'Purple'],
  ['Which animal is the tallest?', 'Giraffe 🦒', 'Elephant'], ['What is frozen water called?', 'Ice 🧊', 'Steam'], ['How many sides does a triangle have?', '3 🔺', '4'],
  ['Which is a mammal?', 'Whale 🐋', 'Shark'], ['What star is closest to Earth?', 'The Sun ☀️', 'The North Star'], ['What do caterpillars turn into?', 'Butterflies 🦋', 'Bees'],
  ['What is 5 + 5?', '10', '12'], ['How many months are in a year?', '12', '10'], ['What gas do we breathe in to live?', 'Oxygen', 'Smoke'],
  ['Which is the largest planet?', 'Jupiter 🪐', 'Earth'], ['What is a baby cat called?', 'A kitten 🐱', 'A puppy'], ['How many continents are there?', '7 🌍', '3'],
  ['What do plants need from the sky to grow?', 'Sunlight ☀️', 'Snow'], ['What is 20 ÷ 2?', '10', '15'], ['Which animal says "moo"?', 'A cow 🐄', 'A duck'],
  ['What shape has 4 equal sides?', 'A square ⬛', 'A circle'], ['Which is the fastest land animal?', 'Cheetah 🐆', 'Turtle'], ['What do you call a word that means the opposite?', 'An antonym', 'A synonym'],
  ['How many hours are in a day?', '24', '12'], ['What is the color of a ripe banana?', 'Yellow 🍌', 'Blue'], ['What helps you see in the dark?', 'A flashlight 🔦', 'Sunglasses'],
];

export function buildSchool({ get, set, canUse, near = [-RING - 40, 380] }) {
  const site = findBigSite({ ...SCHOOL, tall: 8, near, get, canUse });
  return site ? schoolAt(site, set) : null;
}

function schoolAt(site, set) {
  const { L, D } = SCHOOL;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const outward = faceDir(-fx, -fz), inward = faceDir(fx, fz), toLow = faceDir(-ux, -uz), toHigh = faceDir(ux, uz);
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };
  const [b0, b1, bv0, bv1] = BLD;
  const on = (u, v, b, f = B.floor) => put(u, 0, v, stack(b, f));
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  const door = (u, v) => {
    put(u, 0, v, makeBlock(B.door, doorFacing));
    put(u, 1, v, makeBlock(B.door, doorFacing | DOOR_TOP));
  };

  // ---------- Out front ----------
  // The bus loop (the school bus waits here), a path to the doors, the flagpole, flowers.
  for (let u = 3; u <= 56; u++) for (let v = 1; v <= 7; v++) put(u, 0, v, v === 4 && u % 3 ? B.line : B.road);
  for (let u = 27; u <= 32; u++) for (let v = 8; v <= 11; v++) put(u, 0, v, B.sidewalk);
  for (let u = 3; u <= 56; u++) if (u < 27 || u > 32) for (const v of [9, 10]) put(u, 0, v, v === 10 ? B.flowers : B.sidewalk);
  for (let y = 0; y < 9; y++) put(24, y, 9, B.metal); // (the flagpole)
  put(24, 8, 10, B.red);
  put(24, 7, 10, B.white);
  put(24, 6, 10, B.blue);
  for (const [u, v] of [[2, 1], [20, 1], [40, 1], [57, 1]]) put(u, 0, v, B.streetLamp);
  sign(33, 1, 0, outward, '🏫 BUILDZONE ELEMENTARY · Welcome, students! 🍎');
  put(33, 0, 0, B.metal);
  sign(26, 1, 8, outward, '🚌 School bus stop');
  put(26, 0, 8, B.metal);

  // ---------- The building ----------
  for (let u = b0; u <= b1; u++)
    for (let v = bv0; v <= bv1; v++) {
      const edgeU = u === b0 || u === b1, edgeV = v === bv0 || v === bv1;
      put(u, H, v, B.roof);
      if (!edgeU && !edgeV) {
        put(u, 0, v, v >= HALL[0] && v <= HALL[1] ? B.tile : B.floor);
        continue;
      }
      for (let y = 0; y < H; y++) {
        if (v === bv0 && (u === 29 || u === 30) && y < 2) continue; // (the front doors)
        const window = y >= 1 && y <= 2 && ((edgeV && !edgeU && u % 3 === 1) || (edgeU && !edgeV && v % 3 === 0));
        put(u, y, v, window ? B.glass : y === H - 1 ? B.white : B.brick);
      }
    }
  door(29, bv0);
  door(30, bv0);
  sign(29, 3, bv0 - 1, outward, '🏫 SCHOOL');
  // The rooms: walls between them (with doorways off the hall), front rooms and back rooms.
  const wall = (u, v0, v1, gap) => {
    for (let v = v0; v <= v1; v++) for (let y = 0; y < H; y++) if (!(v === gap && y < 2)) put(u, y, v, B.white);
  };
  for (let u = b0 + 1; u < b1; u++) for (let y = 0; y < H; y++) for (const v of [HALL[0] - 1, HALL[1] + 1]) if (!(DOORWAY(u) && y < 2)) put(u, y, v, B.white);
  // (front, left to right: classrooms 1 and 2, the office in the middle, classroom 3, the library)
  for (const u of [14, 26, 33, 45]) wall(u, bv0 + 1, HALL[0] - 2);
  // (back: the cafeteria, the gym)
  wall(28, HALL[1] + 2, bv1 - 1);
  for (let u = b0 + 1; u < b1; u++) for (const v of HALL) if (u % 6 === 0) put(u, H - 1, v, B.light);

  // A classroom: rows of desks and chairs facing the whiteboard (and a fun fact on it).
  const classroom = (u0, u1, fact) => {
    for (let v = bv0 + 1; v <= HALL[0] - 2; v++) put(u0 + 1, 2, v, makeBlock(B.board, toHigh));
    sign(u0 + 1, 3, Math.floor((bv0 + HALL[0]) / 2), toHigh, fact);
    on(u0 + 2, bv0 + 2, makeBlock(B.desk, toHigh)); // (the teacher's desk)
    for (let u = u0 + 4; u <= u1 - 2; u += 2) for (const v of [bv0 + 1, bv0 + 3]) {
      if (v === HALL[0] - 2 && (DOORWAY(u) || DOORWAY(u + 1))) continue; // (the way in from the hall)
      on(u, v, makeBlock(B.desk, toLow));
      on(u + 1, v, makeBlock(B.chair, toLow));
    }
    put(Math.floor((u0 + u1) / 2), H - 1, bv0 + 2, B.light);
  };
  // (CLASSROOMS, above: the same three)
  classroom(b0, 14, '🦕 Fun fact: some dinosaurs were as small as chickens!');
  classroom(14, 26, '🐙 Fun fact: an octopus has three hearts!');
  classroom(33, 45, '🌕 Fun fact: there are footprints on the Moon that will last for millions of years!');
  // The office (in the middle, by the front doors): a desk, a plant, a couch.
  on(27, bv0 + 3, makeBlock(B.desk, outward));
  on(32, bv0 + 1, B.plant);
  // The library: bookshelves along the walls, reading tables, couches, a teddy.
  for (let u = 46; u < b1; u++) for (let y = 0; y < 3; y++) put(u, y, bv0 + 1, B.shelf);
  for (let v = bv0 + 2; v <= HALL[0] - 2; v++) for (let y = 0; y < 3; y++) put(b1 - 1, y, v, B.shelf);
  for (const u of [48, 51]) {
    on(u, 14, B.table);
    on(u, 15, makeBlock(B.chair, outward));
  }
  on(47, 15, makeBlock(B.couch, toHigh));
  on(53, 14, B.teddy);
  sign(49, 3, bv0 + 1, inward, '📚 LIBRARY · Shh! Right-click a bookshelf to read');
  // The cafeteria (back left): long tables, the lunch counter.
  for (const v of [24, 28, 32]) for (let u = 7; u <= 22; u += 5) {
    on(u, v, B.picnic);
  }
  for (let u = 6; u <= 12; u++) on(u, bv1 - 1, makeBlock(B.counter, outward));
  sign(16, 3, HALL[1] + 2, inward, '🍕 CAFETERIA');
  // The gym (back right): a painted court, bleachers (steps) along the wall, hoops (a board up high).
  for (let u = 31; u <= 54; u++) for (const v of [22, 34]) put(u, 0, v, B.line);
  for (let v = 22; v <= 34; v++) for (const u of [31, 54, 42]) put(u, 0, v, B.line);
  for (let u = 32; u <= 53; u++) put(u, 0, bv1 - 1, makeBlock(B.stairs, (faceDir(fx, fz) + 2) % 4)); // (steps up to the back wall)
  for (const u of [31, 54]) put(u, 3, 28, makeBlock(B.board, u === 31 ? toHigh : toLow));
  sign(42, 3, HALL[1] + 2, inward, '🏀 GYM');

  // ---------- The playground (out the back) ----------
  for (let u = 6; u <= 26; u++) for (let v = bv1 + 2; v <= bv1 + 11; v++) put(u, 0, v, B.sand);
  for (const [u, v] of [[9, bv1 + 4], [18, bv1 + 4]]) put(u, 0, v, makeBlock(B.slide, inward));
  for (let u = 12; u <= 16; u++) for (const v of [bv1 + 8, bv1 + 10]) put(u, 2, v, B.metal); // (monkey bars)
  for (const u of [12, 16]) for (const v of [bv1 + 8, bv1 + 10]) for (let y = 0; y < 2; y++) put(u, y, v, B.metal);
  for (let u = 30; u <= 54; u++) for (let v = bv1 + 2; v <= bv1 + 11; v++) put(u, 0, v, u === 30 || u === 54 || v === bv1 + 2 || v === bv1 + 11 ? B.line : B.road); // (a blacktop court)
  // (a way round to the back: a path down the side)
  for (let v = 8; v <= bv1 + 2; v++) for (const u of [1, 2]) put(u, 0, v, B.sidewalk);

  // ---------- The school bus ----------
  const h = Math.atan2(-ux, -uz), cars = []; // (along the loop)
  const [x, z] = site.pos(40, 5);
  cars.push({ kind: 'bus', color: '#fbc02d', x, y: 0, z, h });

  const [ax0, az0] = site.at(0, 0), [ax1, az1] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
  const [px, pz] = site.pos(29.5, 18.5), [tx, tz] = site.pos(19, 15), [qa, qb] = [site.pos(16, 13), site.pos(24, 16)];
  return {
    signs, cars,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Elementary', key: 'school', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      school: { x: px, y: 0, z: pz, rect },
      school_class: { x: tx, y: 0, z: tz, face: Math.atan2(ux, uz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}

// A school that's already built: where its (u, v) cells are in the world, worked out from its
// places (the classroom spot and which way it faces, and the school's own spot).
export function schoolFrame(places) {
  const t = places?.school_class, p = places?.school;
  if (!t || !p || !Number.isFinite(t.face)) return null;
  const U = [Math.round(Math.sin(t.face)), Math.round(Math.cos(t.face))];
  const V = [Math.round((p.x - t.x - 10.5 * U[0]) / 3.5), Math.round((p.z - t.z - 10.5 * U[1]) / 3.5)];
  if (Math.abs(U[0]) + Math.abs(U[1]) !== 1 || Math.abs(V[0]) + Math.abs(V[1]) !== 1) return null;
  const back = V[0] + V[1] < 0 ? V : [0, 0]; // (cells sit one back from exact spots on that side)
  return { at: (u, v) => [Math.round(t.x + (u - 19) * U[0] + (v - 15) * V[0] + back[0]), Math.round(t.z + (u - 19) * U[1] + (v - 15) * V[1] + back[1])] };
}
