// Castle Brightstone, out by the Outer Loop (since v0.69): a big stone castle with a moat all
// round it, a drawbridge (pull the lever, a gold knob on a post, by the gate inside or across the
// moat outside: up comes the bridge and down drops the portcullis; again to let everyone in), high
// walls with battlements you can walk along, four corner towers with spiral stairs up to the top,
// the keep with its great hall and the throne (sit on it!), a dungeon, a well, and knights. And
// treasure: five golden trophies are hidden round the castle. Find them all (right-click one) for
// Queen Elara's Royal Treasure Hunters.
import { makeBlock, stack, SIGN, DOOR_TOP } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = {
  cobble: 4, stone: 3, water: 36, planks: 6, log: 7, metal: 11, gold: 38, sidewalk: 24, carpet: 35, glass: 9, door: 21, stairs: 149,
  red: 14, blue: 15, yellow: 16, throne: 83, trophy: 85, lantern: 45, torch: 48, hay: 99, pumpkin: 100, railing: 54, table: 62, chair: 60,
  chandelier: 42, flowers: 27, floor: 25,
};
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const CASTLE = { L: 64, D: 64 };
export const TREASURE_COINS = 3;
const WALLS = [12, 51, 14, 53], WALL_H = 7; // (u0, u1, v0, v1; the walls go up to y 6, battlements on top)
const GATE = [30, 33]; // (the gateway in the front wall, u)
const MOAT = [6, 57, 8, 59, 3]; // (the moat's outer edge u0, u1, v0, v1, and how wide)
const TOWER_H = 13;
const KEEP = [22, 41, 38, 51];
// The spiral stairs' ring round a tower's middle (one step per cell, going round).
const RING8 = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

export function buildCastle({ get, set, canUse, near = [-200, RING + 60] }) {
  const site = findBigSite({ ...CASTLE, tall: 14, near, get, canUse });
  return site ? castleAt(site, set) : null;
}

function castleAt(site, set) {
  const { L, D } = CASTLE;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const outward = faceDir(-fx, -fz), inward = faceDir(fx, fz);
  // (a Stairs block going up toward (du, dv), in the site)
  const stairsUp = (du, dv) => (faceDir(du * ux + dv * fx, du * uz + dv * fz) + 2) % 4;
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };
  const [w0, w1, wv0, wv1] = WALLS;
  const doorFacing = site.road.axis === 'x' ? 0 : 1;

  // ---------- The moat, and the way in ----------
  const [m0, m1, mv0, mv1, mw] = MOAT;
  for (let u = m0; u <= m1; u++)
    for (let v = mv0; v <= mv1; v++) {
      const inner = u >= m0 + mw && u <= m1 - mw && v >= mv0 + mw && v <= mv1 - mw;
      if (!inner) put(u, 0, v, B.water);
    }
  for (let u = GATE[0]; u <= GATE[1]; u++) {
    for (let v = 0; v < mv0; v++) put(u, 0, v, B.sidewalk); // (the road in)
    for (let v = mv0; v < mv0 + mw; v++) put(u, 0, v, B.planks); // (the drawbridge, down)
    for (let v = mv0 + mw; v < wv0; v++) put(u, 0, v, B.sidewalk);
  }
  sign(GATE[1] + 2, 1, 1, outward, '🏰 CASTLE BRIGHTSTONE · Find the hidden treasure! 👑');
  put(GATE[1] + 2, 0, 1, B.log);
  for (const u of [GATE[0] - 1, GATE[1] + 1]) put(u, 0, 1, B.torch);

  // ---------- The walls ----------
  for (let u = w0; u <= w1; u++)
    for (let v = wv0; v <= wv1; v++) {
      if (u !== w0 && u !== w1 && v !== wv0 && v !== wv1) continue;
      for (let y = 0; y < WALL_H; y++) if (!(v === wv0 && u >= GATE[0] && u <= GATE[1] && y < 4)) put(u, y, v, y === WALL_H - 1 ? B.stone : B.cobble);
      if ((u + v) % 2 === 0) put(u, WALL_H, v, B.stone); // (battlements)
    }
  // A walkway along the inside of the top of the walls (behind the battlements).
  for (let u = w0 + 1; u < w1; u++) for (const v of [wv0 + 1, wv1 - 1]) if (!(v === wv0 + 1 && u >= GATE[0] - 8 && u <= GATE[0] - 3)) put(u, WALL_H - 1, v, B.stone); // (open over the stairs up)
  for (let v = wv0 + 1; v < wv1; v++) for (const u of [w0 + 1, w1 - 1]) put(u, WALL_H - 1, v, B.stone);
  // Banners on the front wall, either side of the gate; torches.
  for (const u of [GATE[0] - 3, GATE[1] + 3]) for (let y = 2; y <= 5; y++) put(u, y, wv0 - 1, y % 2 ? B.red : B.blue);
  for (const u of [GATE[0] - 1, GATE[1] + 1]) put(u, 2, wv0 - 1, B.lantern);
  // Stairs up onto the walls (inside, by the gate), so you can walk along the top.
  for (let k = 0; k < WALL_H; k++) put(GATE[0] - 3 - k, k, wv0 + 1, makeBlock(B.stairs, stairsUp(-1, 0)));
  for (let k = 1; k < WALL_H; k++) for (let y = 0; y < k; y++) put(GATE[0] - 3 - k, y, wv0 + 1, B.cobble);

  // ---------- The towers ----------
  // At the four corners: round and round up the spiral stairs to the top.
  const tower = (cu, cv) => {
    // (the door: on the side facing the middle of the castle, along u)
    const side = cu < (w0 + w1) / 2 ? 1 : -1, entry = RING8.findIndex(([a, b]) => a === side && b === 0);
    for (let du = -2; du <= 2; du++)
      for (let dv = -2; dv <= 2; dv++) {
        const wall = Math.abs(du) === 2 || Math.abs(dv) === 2;
        if (!wall) continue;
        for (let y = 0; y < TOWER_H - 1; y++) {
          if (du === 2 * side && dv === 0 && y < 2) continue; // (the doorway)
          const slit = y % 4 === 2 && (du === 0 || dv === 0); // (arrow slits)
          put(cu + du, y, cv + dv, slit ? B.glass : B.stone);
        }
        if ((du + dv) % 2 === 0) put(cu + du, TOWER_H - 1, cv + dv, B.stone); // (battlements)
      }
    for (let y = 0; y < TOWER_H - 2; y++) put(cu, y, cv, B.stone); // (the middle column)
    // The steps: one a cell, round the middle, each a block higher.
    const steps = TOWER_H - 1;
    for (let k = 0; k < steps; k++) {
      const i = (entry + 1 + k) % 8, [du, dv] = RING8[i], [nu, nv] = RING8[(i + 1) % 8];
      put(cu + du, k, cv + dv, makeBlock(B.stairs, stairsUp(nu - du, nv - dv)));
      if (k > 0) put(cu + du, k - 1, cv + dv, B.stone);
    }
    // The top: a floor round the stairwell (open where the last few steps come up).
    const open = new Set([1, 2, 3, 4].map(n => (entry + n) % 8));
    for (let i = 0; i < 8; i++) if (!open.has(i)) put(cu + RING8[i][0], steps - 1, cv + RING8[i][1], B.stone);
    put(cu, steps - 1, cv, B.stone);
    put(cu, steps, cv, B.torch);
  };
  for (const [u, v] of [[w0, wv0], [w1, wv0], [w0, wv1], [w1, wv1]]) tower(u, v);

  // ---------- The gate and its levers ----------
  // A lever (a gold knob on a log post) inside by the gate, and one outside across the moat.
  const levers = [[GATE[0] - 2, wv0 + 2], [GATE[1] + 2, mv0 - 1]];
  for (const [u, v] of levers) {
    put(u, 0, v, B.log);
    put(u, 1, v, B.gold);
  }
  sign(GATE[0] - 2, 2, wv0 + 2, inward, '🔱 Right-click the lever: drawbridge up / down');
  sign(GATE[1] + 2, 2, mv0 - 1, outward, '🔱 Right-click the lever: drawbridge up / down');

  // ---------- The courtyard ----------
  // A well, hay and training dummies, flowers, torches on posts.
  for (const [du, dv] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) put(24 + du, 0, 26 + dv, B.cobble);
  put(24, 0, 26, B.water);
  for (const [u, v] of [[45, 22], [45, 26], [45, 30]]) {
    put(u, 0, v, B.hay);
    put(u, 1, v, B.pumpkin); // (a training dummy)
  }
  for (const [u, v] of [[16, 20], [47, 20], [16, 34], [47, 34]]) put(u, 0, v, B.torch);
  for (let u = 17; u <= 21; u++) put(u, 0, 34, B.flowers);

  // ---------- The keep: the great hall and the throne ----------
  const [k0, k1, kv0, kv1] = KEEP, KH = 9;
  for (let u = k0; u <= k1; u++)
    for (let v = kv0; v <= kv1; v++) {
      const edge = u === k0 || u === k1 || v === kv0 || v === kv1;
      put(u, KH, v, B.stone);
      if (!edge) {
        put(u, 0, v, B.floor);
        continue;
      }
      for (let y = 0; y < KH; y++) {
        if (v === kv0 && (u === 31 || u === 32) && y < 3) continue; // (the big doors)
        put(u, y, v, y >= 3 && y <= 5 && (u - k0) % 4 === 2 ? B.glass : B.cobble);
      }
      if ((u + v) % 2 === 0) put(u, KH + 1, v, B.stone);
    }
  for (const u of [31, 32]) {
    put(u, 0, kv0, makeBlock(B.door, doorFacing));
    put(u, 1, kv0, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  sign(33, 4, kv0 - 1, outward, '👑 THE GREAT HALL');
  // A red carpet up to the throne on its dais, banners down the walls, a long table, chandeliers.
  for (let v = kv0 + 1; v <= kv1 - 3; v++) for (const u of [31, 32]) put(u, 0, v, B.carpet);
  for (let u = 28; u <= 35; u++) for (let v = kv1 - 3; v <= kv1 - 1; v++) put(u, 0, v, B.gold);
  put(31, 1, kv1 - 2, makeBlock(B.throne, outward));
  put(32, 1, kv1 - 2, makeBlock(B.throne, outward));
  for (const u of [k0 + 1, k1 - 1]) for (let v = kv0 + 2; v <= kv1 - 2; v += 3) for (let y = 3; y <= 6; y++) put(u, y, v, (v / 3) % 2 < 1 ? B.red : B.blue);
  for (let u = 25; u <= 28; u++) put(u, 0, 44, stack(B.table, B.floor));
  for (let u = 25; u <= 28; u++) for (const v of [43, 45]) put(u, 0, v, stack(makeBlock(B.chair, v < 44 ? inward : outward), B.floor));
  for (const v of [42, 47]) put(31, KH - 1, v, B.chandelier);

  // ---------- The dungeon ----------
  // A little stone block in the corner of the courtyard: cells behind bars.
  const [d0, d1, dv0, dv1] = [43, 49, 41, 49];
  for (let u = d0; u <= d1; u++)
    for (let v = dv0; v <= dv1; v++) {
      const edge = u === d0 || u === d1 || v === dv0 || v === dv1;
      put(u, 4, v, B.stone);
      if (!edge) {
        put(u, 0, v, B.sidewalk);
        continue;
      }
      for (let y = 0; y < 4; y++) if (!(v === dv0 && u === 46 && y < 2)) put(u, y, v, B.stone);
    }
  for (let u = d0 + 1; u < d1; u++) if (u !== 46) put(u, 0, 45, makeBlock(B.railing, site.edge(0, 1) | site.edge(0, -1))); // (the bars)
  sign(47, 2, dv0 - 1, outward, '🔒 DUNGEON (spooky!)');

  // ---------- The treasure ----------
  // Five golden trophies, tucked away round the castle.
  const treasure = [
    [d0 + 1, 0, dv1 - 1], // in a dungeon cell
    [w1 + 1, TOWER_H - 1, wv1 + 1], // up on a back tower (on its top floor)
    [k1 - 2, 0, kv1 - 1], // behind the throne, in the great hall
    [w0 + 3, 0, wv1 - 2], // in a back corner of the courtyard
    [GATE[1] + 6, WALL_H, wv0], // up on the wall, by the gate
  ];
  for (const [u, y, v] of treasure) put(u, y, v, B.trophy);
  put(w0 + 3, 0, wv1 - 3, B.hay); // (hiding the courtyard one)

  // Where things are, in the world.
  const cell = (u, y, v) => {
    const [x, z] = site.at(u, v);
    return [x, y, z];
  };
  const bridge = [], gate = [];
  for (let u = GATE[0]; u <= GATE[1]; u++) {
    for (let v = mv0; v < mv0 + mw; v++) bridge.push(cell(u, 0, v));
    for (let y = 0; y < 4; y++) gate.push(cell(u, y, wv0));
  }
  const [cx, cz] = site.pos(31.5, 30), [qx, qz] = site.pos(31.5, kv1 - 4), [kx, kz] = site.pos(31.5, wv0 + 3);
  const area = (u, v, r) => {
    const [a, b] = [site.pos(u - r, v - r), site.pos(u + r, v + r)];
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  };
  const [ax0, az0] = site.at(0, 0), [ax1, az1] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Castle Brightstone', key: 'castle', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      // levers, bridge (its cells), gate (the gateway's cells), treasures (the trophies)
      castle: { x: cx, y: 0, z: cz, rect, levers: levers.map(([u, v]) => cell(u, 1, v)), bridge, gate, treasures: treasure.map(t => cell(...t)) },
      castle_throne: { x: qx, y: 0, z: qz, face: Math.atan2(-fx, -fz), area: area(31.5, kv1 - 5, 3) },
      castle_gate: { x: kx, y: 0, z: kz, face: Math.atan2(-fx, -fz), area: area(31.5, wv0 + 4, 3) },
    },
  };
}
