// The BuildZone Space Center, out by the Outer Loop (since v0.61): a launch pad with a tall
// rocket standing beside its gantry tower, Mission Control (rows of desks and computers facing
// the big screens, where Commander Nova runs the Space Cadets club), the Space Museum (planets
// hanging from the ceiling, a moon rock, fun facts on the walls), and the landing zone.
//
// Right-click the gate at the foot of the tower to climb aboard. Anyone else has 15 seconds to
// hop in too (four seats), then the countdown: 10… 9… 8… LIFTOFF! The rocket roars up high above
// the whole world, the capsule floats in space for a moment, then comes down under its big
// parachutes and lands on the landing zone. The server runs the launches (see launch in
// game.js); everyone's game draws the same one (see rocketui.js).
import { makeBlock, stack, SIGN, DOOR_TOP } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = {
  sidewalk: 24, cobble: 4, stone: 3, metal: 11, white: 12, glass: 9, red: 14, planks: 6, railing: 54, door: 21, carpet: 35,
  desk: 73, computer: 75, officeChair: 74, screens: 108, radar: 111, statue: 81, lantern: 45, streetLamp: 46, flowers: 27,
  floor: 25, gate: 148, roof: 13, ceilingLight: 41, flowerPot: 67, trophy: 85, line: 23,
};
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const SPACE = { L: 72, D: 56 };
// The launch, second by second: boarding, the countdown, then the flight (up, a moment in
// space, and down under the parachutes).
export const BOARDING = 15, COUNTDOWN = 10, ASCENT = 22, COAST = 6, DESCENT = 26, SEATS = 4;
export const FLIGHT = ASCENT + COAST + DESCENT;
export const TOP = 320; // (how high it goes)
const PAD = [50, 62, 32, 44]; // (u0, u1, v0, v1: the launch pad, raised one block)
const ROCKET = [56.5, 38.5]; // (where the rocket stands)
const TOWER = [51, 53, 37, 39], TOWER_H = 22;
const CONTROL = [4, 26, 8, 24]; // Mission Control
const MUSEUM = [4, 26, 30, 50]; // the Space Museum
const LANDING = [38, 46]; // (the landing zone's middle, u v)

// Where the rocket (its base) and the capsule are, t seconds into the flight (u along the way
// to the landing zone: 0 at the pad, 1 there). { y, k, capsule: true once it's on its own }
export function flightAt(t) {
  if (t < 0) return { y: 0, k: 0, rocket: true };
  if (t < ASCENT) return { y: TOP * (t / ASCENT) ** 2, k: 0, rocket: true, burn: true };
  if (t < ASCENT + COAST) return { y: TOP, k: 0, capsule: true, space: true };
  const d = Math.min(1, (t - ASCENT - COAST) / DESCENT);
  // (Falling fast at first, then the parachutes open and it drifts down gently.)
  const e = d < 0.25 ? d * 1.6 : 0.4 + (d - 0.25) * 0.8;
  return { y: Math.max(0, TOP * (1 - e)), k: d, capsule: true, chutes: d > 0.2 };
}

export function buildSpaceCenter({ get, set, canUse, near = [200, RING + 40] }) {
  const site = findBigSite({ ...SPACE, tall: 10, near, get, canUse });
  return site ? spaceAt(site, set) : null;
}

function spaceAt(site, set) {
  const { L, D } = SPACE;
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
  const fence = (u0, v0, u1, v1, gap = () => false) => {
    for (let u = u0 - 1; u <= u1 + 1; u++)
      for (let v = v0 - 1; v <= v1 + 1; v++) {
        if ((u >= u0 && u <= u1 && v >= v0 && v <= v1) || gap(u, v)) continue;
        let mask = 0;
        if (u === u0 - 1) mask |= site.edge(1, 0);
        if (u === u1 + 1) mask |= site.edge(-1, 0);
        if (v === v0 - 1) mask |= site.edge(0, 1);
        if (v === v1 + 1) mask |= site.edge(0, -1);
        put(u, 0, v, makeBlock(B.railing, mask));
      }
  };

  // ---------- Paths ----------
  for (let u = 30; u <= 33; u++) for (let v = 0; v <= 27; v++) put(u, 0, v, B.sidewalk); // (in from the road)
  for (let u = 4; u <= 66; u++) for (let v = 25; v <= 27; v++) put(u, 0, v, B.sidewalk); // (across, between the buildings and the pad)
  for (const [u, v] of [[29, 1], [34, 1], [29, 14], [34, 14], [40, 27], [64, 27]]) put(u, 0, v, B.streetLamp);
  sign(35, 1, 1, outward, '🚀 BUILDZONE SPACE CENTER 🌍 Fly to space!');
  put(35, 0, 1, B.metal);

  // ---------- The launch pad ----------
  // Raised stone with a cobbled edge, yellow-and-black hazard stripes round it (flat), a fence,
  // and the gantry tower: four tall metal legs with rings, a red light on top and an arm out to
  // the capsule.
  const [p0, p1, pv0, pv1] = PAD;
  for (let u = p0; u <= p1; u++) for (let v = pv0; v <= pv1; v++) put(u, 0, v, u === p0 || u === p1 || v === pv0 || v === pv1 ? B.cobble : B.stone);
  fence(p0 - 2, pv0 - 2, p1 + 2, pv1 + 2, (u, v) => v === pv0 - 3 && u >= 51 && u <= 53); // (a way in, to the gate)
  const [t0, t1, tv0, tv1] = TOWER;
  for (let y = 1; y <= TOWER_H; y++)
    for (let u = t0; u <= t1; u++)
      for (let v = tv0; v <= tv1; v++) {
        const corner = (u === t0 || u === t1) && (v === tv0 || v === tv1);
        if (corner || y % 5 === 0) put(u, y, v, B.metal);
      }
  put(t0 + 1, TOWER_H + 1, tv0 + 1, B.red);
  for (let u = t1 + 1; u <= 54; u++) put(u, 18, tv0 + 1, B.metal); // (the access arm, to the capsule)
  // The boarding gate, at the foot of the tower, with its sign.
  put(52, 1, pv0, makeBlock(B.gate, outward));
  sign(51, 2, pv0, outward, '🚀 Right-click the gate to fly to space! 👩‍🚀');
  put(51, 1, pv0, B.metal);
  // Big floodlights at the pad's corners.
  for (const [u, v] of [[p0 - 1, pv0 - 1], [p1 + 1, pv0 - 1], [p0 - 1, pv1 + 1], [p1 + 1, pv1 + 1]]) put(u, 0, v, B.streetLamp);

  // ---------- The landing zone ----------
  // A big target on the ground: red and white rings.
  const [lu, lv] = LANDING;
  for (let u = lu - 6; u <= lu + 6; u++)
    for (let v = lv - 6; v <= lv + 6; v++) {
      const r = Math.hypot(u + 0.5 - lu - 0.5, v + 0.5 - lv - 0.5);
      if (r <= 6) put(u, 0, v, Math.floor(r / 1.5) % 2 ? B.sidewalk : B.carpet);
    }
  sign(lu, 1, lv - 7, outward, '🪂 LANDING ZONE · Keep clear! 🚀');
  put(lu, 0, lv - 7, B.metal);

  // ---------- Mission Control ----------
  // White walls, a big window looking out at the pad, rows of desks with computers facing the
  // big screens, and a door to the path.
  const building = ([b0, b1, bv0, bv1], H, door, window) => {
    for (let u = b0; u <= b1; u++)
      for (let v = bv0; v <= bv1; v++) {
        const edgeU = u === b0 || u === b1, edgeV = v === bv0 || v === bv1;
        put(u, H, v, B.roof);
        if (!edgeU && !edgeV) {
          put(u, 0, v, B.floor);
          continue;
        }
        for (let y = 0; y < H; y++) {
          if (door(u, v) && y < 2) continue;
          put(u, y, v, window(u, v, y) ? B.glass : B.white);
        }
      }
  };
  const [c0, c1, cv0, cv1] = CONTROL;
  building(CONTROL, 5, (u, v) => v === cv1 && (u === 15 || u === 16), (u, v, y) => (u === c1 && v > cv0 && v < cv1 && y >= 1 && y <= 3) || (v === cv0 && u > c0 + 1 && u < c1 - 1 && y >= 2 && y <= 3));
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  for (const [u, v] of [[15, cv1], [16, cv1]]) {
    put(u, 0, v, makeBlock(B.door, doorFacing));
    put(u, 1, v, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  // The big screens along the far wall (facing the desks), the desks in rows.
  const toScreens = faceDir(-ux, -uz);
  for (let v = cv0 + 2; v <= cv1 - 3; v += 2) {
    put(c0 + 1, 0, v, stack(makeBlock(B.desk, faceDir(ux, uz)), B.floor));
    put(c0 + 1, 1, v, makeBlock(B.screens, faceDir(ux, uz)));
  }
  for (const u of [9, 14, 19]) for (let v = cv0 + 3; v <= cv1 - 4; v++) {
    put(u, 0, v, stack(makeBlock(B.desk, toScreens), 25));
    if (v % 2) put(u, 1, v, makeBlock(B.computer, toScreens));
    put(u + 1, 0, v, stack(makeBlock(B.officeChair, toScreens), 25));
  }
  for (const [u, v] of [[8, 11], [20, 11], [8, 19], [20, 19]]) put(u, 4, v, B.ceilingLight);
  put(c1 - 2, 0, cv0 + 2, stack(B.radar, 25));
  sign(17, 3, cv1 + 1, inward, '🖥️ MISSION CONTROL');

  // ---------- The Space Museum ----------
  const [m0, m1, mv0, mv1] = MUSEUM;
  building(MUSEUM, 7, (u, v) => v === mv0 && (u === 15 || u === 16), (u, v, y) => (u === m1 && v > mv0 + 1 && v < mv1 - 1 && y >= 2 && y <= 4 && v % 3 === 0));
  for (const [u, v] of [[15, mv0], [16, mv0]]) {
    put(u, 0, v, makeBlock(B.door, doorFacing));
    put(u, 1, v, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  sign(17, 3, mv0 - 1, outward, '🪐 SPACE MUSEUM');
  // Exhibits: the moon rock, an astronaut statue, a satellite dish, a trophy, fun facts.
  put(8, 0, 34, B.stone);
  sign(8, 1, 34, inward, '🌑 A moon rock! The Moon is about 384,000 km away');
  put(22, 0, 34, B.statue);
  sign(22, 1, 35, inward, '👩‍🚀 Astronauts float in space: there\'s no gravity pulling them down!');
  put(22, 0, 45, B.radar);
  sign(22, 1, 44, inward, '📡 Satellites send TV, phone calls and maps all round the world');
  put(8, 0, 45, B.trophy);
  sign(8, 1, 44, inward, '🏆 The first people walked on the Moon in 1969');
  for (const [u, v, text] of [[m0, 40, '☀️ The Sun is a star! It\'s so big a million Earths would fit inside'], [m1, 37, '🪐 Saturn\'s rings are made of ice and rock'], [m1, 43, '🔴 Mars is red because of rusty dust'], [m0, 36, '🌍 Earth is the only planet we know of with life']])
    sign(u, 3, v, u === m0 ? faceDir(ux, uz) : faceDir(-ux, -uz), text); // (on the walls, inside)
  for (const [u, v] of [[m0 + 1, mv0 + 1], [m1 - 1, mv0 + 1], [m0 + 1, mv1 - 1], [m1 - 1, mv1 - 1]]) put(u, 0, v, stack(B.flowerPot, 25));
  for (const [u, v] of [[10, 37], [20, 37], [10, 44], [20, 44]]) put(u, 6, v, B.ceilingLight);

  // Where things are, in the world.
  const at = (u, v) => site.pos(u, v);
  const [rx, rz] = at(...ROCKET), [gx, gz] = at(52.5, pv0 - 1.5), [lx, lz] = at(lu + 0.5, lv + 0.5);
  const box = ([a, b, c, d]) => {
    const [x0, z0] = site.at(a, c), [x1, z1] = site.at(b, d);
    return [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)];
  };
  const [ax, az] = at(c1 - 3, (cv0 + cv1) / 2), [mx, mz] = at((m0 + m1) / 2 + 0.5, (mv0 + mv1) / 2 + 0.5);
  const [qa, qb] = [at(c0 + 6, cv0 + 2), at(c1 - 1, cv1 - 2)];
  const [sx0, sz0] = site.at(0, 0), [sx1, sz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(sx0, sx1), Math.min(sz0, sz1), Math.max(sx0, sx1), Math.max(sz0, sz1)];
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Space Center', key: 'space', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      space: {
        x: gx, y: 0, z: gz, rect,
        rocket: { x: rx, y: 1, z: rz, face: Math.atan2(-fx, -fz) },
        gate: [gx, gz], landing: [lx, lz], museum: box(MUSEUM), planets: { x: mx, y: 4.2, z: mz },
      },
      space_control: { x: ax, y: 0, z: az, face: Math.atan2(ux, uz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}
