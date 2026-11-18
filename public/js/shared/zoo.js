// The BuildZone Zoo, out by the Outer Loop (since v0.53): paths round seven fenced pens, each
// done up for its animals (sand and rocks for the elephants and lions, a pool and ice for the
// penguins, trees for the giraffes and monkeys, bamboo for the pandas, grass for the zebras),
// with a sign at the front of each, and Zookeeper Zara's hut. The animals themselves are drawn
// and walked about by each player's game (see zooanimals.js), the same for everyone. Right-click
// an animal to feed it something from your lunchbox.
import { makeBlock, stack, SIGN, DOOR_TOP } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = { sidewalk: 24, grass: 1, sand: 10, stone: 3, water: 36, ice: 88, snow: 87, log: 7, leaves: 8, green: 34, railing: 54, lantern: 45, planks: 6, flowers: 27, glass: 9, door: 21, roof: 26 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
export const ZOO = { L: 56, D: 40 };
// The animals: what's in each pen, how many, and the pen's ground.
export const ANIMALS = {
  elephant: { icon: '🐘', name: 'Elephants', count: 2, ground: 'sand', likes: 'banana' },
  giraffe: { icon: '🦒', name: 'Giraffes', count: 2, ground: 'grass', likes: 'apple' },
  lion: { icon: '🦁', name: 'Lions', count: 2, ground: 'sand', likes: 'sandwich' },
  zebra: { icon: '🦓', name: 'Zebras', count: 3, ground: 'grass', likes: 'carrot' },
  penguin: { icon: '🐧', name: 'Penguins', count: 4, ground: 'ice', likes: 'cheese' },
  panda: { icon: '🐼', name: 'Pandas', count: 2, ground: 'grass', likes: 'cookie' },
  monkey: { icon: '🐒', name: 'Monkeys', count: 3, ground: 'grass', likes: 'banana' },
};
export const ANIMAL_KINDS = Object.keys(ANIMALS);
// The pens ([u0, v0, u1, v1], inside their fences), two rows of four (the last is Zara's hut).
const PENS = [[5, 10, 13, 18], [17, 10, 25, 18], [31, 10, 39, 18], [43, 10, 51, 18], [5, 22, 13, 30], [17, 22, 25, 30], [31, 22, 39, 30]];
const HUT = [43, 22, 51, 30];

export function buildZoo({ get, set, canUse, near = [220, -RING - 30] }) {
  const site = findBigSite({ ...ZOO, tall: 10, near, get, canUse });
  return site ? zooAt(site, set) : null;
}

function zooAt(site, set) {
  const { L, D } = ZOO;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV;
  const outward = faceDir(-fx, -fz), inward = faceDir(fx, fz);
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };
  // Paths: in from the road, round the outside, and down the middle.
  for (let u = 26; u <= 29; u++) for (let v = 0; v <= 8; v++) put(u, 0, v, B.sidewalk);
  for (let u = 2; u < L - 2; u++) for (const v of [7, 8, 19, 20, 21, 32, 33]) put(u, 0, v, B.sidewalk);
  for (let v = 7; v <= 33; v++) for (const u of [2, 3, 15, 27, 28, 41, L - 4, L - 3]) put(u, 0, v, B.sidewalk);
  for (const [u, v] of [[2, 7], [L - 3, 7], [2, 33], [L - 3, 33], [27, 20], [15, 20], [41, 20]]) put(u, 0, v, stack(B.lantern, B.sidewalk));
  // A hedge round the outside (the way in at the front), and the sign.
  for (let u = 0; u < L; u++)
    for (let v = 1; v < D; v++) {
      const edge = u === 0 || u === L - 1 || v === D - 1 || v === 1;
      if (edge && !(v === 1 && u >= 26 && u <= 29)) put(u, 0, v, B.leaves);
    }
  for (const u of [25, 30]) for (let y = 0; y < 4; y++) put(u, y, 1, y === 3 ? B.lantern : B.log);
  for (let u = 25; u <= 30; u++) put(u, 4, 1, B.planks);
  const [ex, ez] = site.at(27, 1);
  set(ex - fx, 3, ez - fz, makeBlock(SIGN, onWall(fx, fz)));
  signs.push([ex - fx, 3, ez - fz, '🦁 BUILDZONE ZOO 🐘 Come and meet the animals!']);

  // The pens.
  const pens = [];
  ANIMAL_KINDS.forEach((kind, i) => {
    const [u0, v0, u1, v1] = PENS[i], a = ANIMALS[kind];
    for (let u = u0 - 1; u <= u1 + 1; u++)
      for (let v = v0 - 1; v <= v1 + 1; v++) {
        const wall = u === u0 - 1 || u === u1 + 1 || v === v0 - 1 || v === v1 + 1;
        if (!wall) {
          // The ground (and the penguins' pool, in the corner).
          const pool = kind === 'penguin' && u >= u1 - 3 && v >= v1 - 3;
          put(u, 0, v, pool ? B.water : a.ground === 'sand' ? B.sand : a.ground === 'ice' ? B.ice : B.grass);
          continue;
        }
        let mask = 0;
        if (u === u0 - 1) mask |= site.edge(1, 0);
        if (u === u1 + 1) mask |= site.edge(-1, 0);
        if (v === v0 - 1) mask |= site.edge(0, 1);
        if (v === v1 + 1) mask |= site.edge(0, -1);
        put(u, 0, v, makeBlock(B.railing, mask));
      }
    // Things in the pen for the animals.
    const midU = Math.floor((u0 + u1) / 2);
    if (kind === 'elephant' || kind === 'lion') for (const [du, dv, h] of [[2, 2, 2], [3, 2, 1], [2, 3, 1]]) for (let y = 0; y < h; y++) put(u1 - du, y, v1 - dv, B.stone);
    if (kind === 'giraffe' || kind === 'monkey') {
      for (const [tu, tv, h] of kind === 'giraffe' ? [[u1 - 1, v0 + 1, 6]] : [[u0 + 1, v0 + 1, 4], [u1 - 1, v1 - 1, 4]]) {
        for (let y = 0; y < h; y++) put(tu, y, tv, B.log);
        for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) for (let y = h - 1; y <= h; y++) if (!(du === 0 && dv === 0 && y === h - 1)) put(tu + du, y, tv + dv, B.leaves);
      }
    }
    if (kind === 'panda') for (const [bu, bv] of [[u0, v0], [u0 + 1, v0], [u0, v0 + 1], [u1, v1], [u1 - 1, v1]]) for (let y = 0; y < 3; y++) put(bu, y, bv, B.green);
    if (kind === 'penguin') for (let u = u0; u <= u0 + 2; u++) put(u, 0, v0, B.snow);
    // The sign at the front (facing the path).
    const front = i < 4 ? v0 - 2 : v1 + 2, facing = i < 4 ? outward : inward;
    put(midU, 0, front, stack(B.lantern, B.sidewalk));
    sign(midU + 1, 1, front, facing, `${a.icon} ${a.name.toUpperCase()}`);
    put(midU + 1, 0, front, B.log);
    // (Where the animals may wander, in the world: just inside the fence.)
    const [ax, az] = site.pos(u0 + 0.5, v0 + 0.5), [bx, bz] = site.pos(u1 + 0.5, v1 + 0.5);
    pens.push({ kind, rect: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)], pool: kind === 'penguin' });
  });

  // Zookeeper Zara's hut: planks, a window, a door to the path, flowers.
  const [h0, hv0, h1, hv1] = HUT;
  for (let u = h0; u <= h1; u++)
    for (let v = hv0; v <= hv1; v++) {
      const edge = u === h0 || u === h1 || v === hv0 || v === hv1;
      put(u, 4, v, B.roof);
      if (!edge) continue;
      for (let y = 0; y < 4; y++) put(u, y, v, (y === 1 || y === 2) && (u === h0 + 3 || u === h1 - 3) ? B.glass : B.planks);
    }
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  for (const u of [46, 47]) {
    put(u, 0, hv1, makeBlock(B.door, doorFacing));
    put(u, 1, hv1, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  for (let u = h0; u <= h1; u++) if (u !== 46 && u !== 47) put(u, 0, hv1 + 1, B.flowers);

  const [rx0, rz0] = site.at(0, 0), [rx1, rz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(rx0, rx1), Math.min(rz0, rz1), Math.max(rx0, rx1), Math.max(rz0, rz1)];
  const [px, pz] = site.pos(28, 20.5), [zx, zz] = site.pos(46.5, 32.5);
  const [qa, qb] = [site.pos(43, 31.5), site.pos(51, 33.5)];
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Zoo', key: 'zoo', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      zoo: { x: px, y: 0, z: pz, pens, rect },
      zookeeper: { x: zx, y: 0, z: zz, face: Math.atan2(fx, fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}
