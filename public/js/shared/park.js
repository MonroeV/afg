// Friendship Park, out on the Outer Loop (since v0.50): paths and flower beds, trees, benches, a
// fountain in the middle, a swing set, and two big slides (climb the ladder, right-click the
// slide). Kids hang out here who'd love a best friend: talk to one and they'll ask you. Your
// best friend comes everywhere with you (see the pals in npcs.js). Scout Juno runs the Explorer
// Club, and Miss Joy the Best Friends club.
import { makeBlock, stack, SIGN } from './blocks.js';
import { makeSite, siteFree } from './worldgen.js';
import { ringRoads, RING } from './outerlands.js';

const B = { sidewalk: 24, flowers: 27, log: 7, leaves: 8, planks: 6, ladder: 53, slide: 146, picnic: 102, fountain: 120, lantern: 45, flowerPot: 67, rose: 117, sunflower: 116 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
const L = 32, D = 26;

export function buildPark({ get, set, canUse, near = [80, -RING + 20] }) {
  const roads = ringRoads(), sites = [];
  for (const road of Object.values(roads)) for (const side of [-1, 1]) for (let a = road.from + 30; a + L <= road.to - 30; a += 3) sites.push(makeSite(road, side, a));
  const centre = st => st.at(L / 2, D / 2);
  sites.sort((p, q) => Math.hypot(centre(p)[0] - near[0], centre(p)[1] - near[1]) - Math.hypot(centre(q)[0] - near[0], centre(q)[1] - near[1]));
  const site = sites.find(st => siteFree(st, L, D, 8, get, canUse));
  return site ? parkAt(site, set) : null;
}

function parkAt(site, set) {
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV;
  const inward = faceDir(fx, fz), outward = faceDir(-fx, -fz);
  const signs = [];
  // Paths: a cross through the middle and a loop round, with lanterns.
  const MU = 15, MV = 13;
  for (let u = 1; u < L - 1; u++)
    for (let v = 0; v < D - 1; v++) {
      const cross = u === MU || u === MU + 1 || v === MV || v === MV + 1;
      const loop = (u === 2 || u === L - 3) && v >= 2 && v <= D - 3 || (v === 2 || v === D - 3) && u >= 2 && u <= L - 3;
      if (cross || loop || v === 0) put(u, 0, v, B.sidewalk);
    }
  for (const [u, v] of [[MU - 1, 1], [MU + 2, 1], [2, 2], [L - 3, 2], [2, D - 3], [L - 3, D - 3]]) put(u, 0, v, stack(B.lantern, B.sidewalk));
  // A hedge all round (with a way in from the road).
  for (let u = 0; u < L; u++)
    for (let v = 1; v < D; v++) {
      const edge = u === 0 || u === L - 1 || v === D - 1 || (v === 1 && (u < MU - 1 || u > MU + 2));
      if (edge) put(u, 0, v, B.leaves);
    }
  // The fountain in the middle, and flower beds in the four corners of the cross.
  put(MU, 0, MV, B.fountain);
  for (const [u0, v0] of [[5, 5], [L - 10, 5], [5, MV + 4], [L - 10, MV + 4]])
    for (let u = u0; u < u0 + 5; u++) for (let v = v0; v < v0 + 3; v++) put(u, 0, v, (u + v) % 4 === 0 ? B.rose : (u * 3 + v) % 5 === 0 ? B.sunflower : B.flowers);
  // Trees in the corners.
  for (const [u, v] of [[4, 4], [L - 5, 4], [4, D - 5], [L - 5, D - 5]]) {
    for (let y = 0; y < 4; y++) put(u, y, v, B.log);
    for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) for (let y = 3; y <= 5; y++) {
      if (Math.abs(du) + Math.abs(dv) + Math.max(0, y - 4) * 2 > 3 || (du === 0 && dv === 0 && y < 4)) continue;
      put(u + du, y, v + dv, B.leaves);
    }
  }
  // Benches (picnic tables) along the cross path.
  for (const [u, v] of [[MU - 4, MV - 2], [MU + 5, MV - 2], [MU - 4, MV + 3], [MU + 5, MV + 3]]) put(u, 0, v, B.picnic);
  // Two big slides: a tower with a ladder up the back and a slide down the front, a block lower
  // each step.
  for (const u of [8, L - 9]) {
    const v0 = 6;
    for (let y = 0; y < 3; y++) put(u, y, v0, B.log);
    put(u, 3, v0, B.planks);
    for (let y = 0; y <= 3; y++) put(u, y, v0 - 1, makeBlock(B.ladder, outward));
    for (let i = 0; i < 4; i++) put(u, 3 - i, v0 + 1 + i, makeBlock(B.slide, inward));
  }
  // A swing set (Log posts with Logs across the top: see the Build Book).
  for (const u of [MU - 2, MU + 3]) {
    const v = D - 5;
    for (let y = 0; y < 3; y++) {
      put(u, y, v, B.log);
      put(u + 2, y, v, B.log);
    }
    for (let du = 0; du <= 2; du++) put(u + du, 3, v, B.log);
  }
  // The sign at the way in.
  put(MU - 1, 0, 1, stack(B.lantern, B.sidewalk));
  const [sx, sz] = site.at(MU + 2, 2);
  put(MU + 2, 0, 2, B.log);
  set(sx - fx, 1, sz - fz, makeBlock(SIGN, onWall(fx, fz)));
  signs.push([sx - fx, 1, sz - fz, '🤝 FRIENDSHIP PARK 🎢']);

  const [rx0, rz0] = site.at(0, 0), [rx1, rz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(rx0, rx1), Math.min(rz0, rz1), Math.max(rx0, rx1), Math.max(rz0, rz1)];
  const [ax, az] = site.at(3, 3), [bx, bz] = site.at(L - 4, D - 4);
  const [px, pz] = site.pos(MU + 1, MV + 3);
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Friendship Park', key: 'park', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    place: { x: px, y: 0, z: pz, face: Math.atan2(fx, fz), area: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)], rect },
  };
}
