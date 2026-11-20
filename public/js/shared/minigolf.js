// Putt Putt Paradise, the mini golf course out by the Outer Loop (since v0.63): nine holes, each
// a lane of grass with log walls round it: a straight one, an L, a windmill (its sails sweep
// through the gap: time your putt!), a pond, bumpers, a U-turn, a zigzag, a loop-the-loop (putt it
// hard enough to go round!) and a little castle to finish. Each hole has a tee, a cup with a
// numbered flag, and a sign with its par.
//
// Stand on a tee and press G (on a phone: 💃) to put your ball down. G again starts the power
// meter swinging; G once more putts, the way you're looking. Each player plays with their own
// ball (see golfui.js); finish all nine and the server puts your round on the Best Rounds board.
import { makeBlock, stack, SIGN } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = { log: 7, stone: 3, water: 36, sidewalk: 24, planks: 6, red: 14, flowers: 27, lantern: 45, roof: 26, white: 12, glass: 9, metal: 11, cobble: 4 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const GOLF = { L: 62, D: 50 };
export const CUP_R = 0.32, GOLF_BALL_R = 0.12;
export const ROUND_COINS = 3, BEST_COINS = 5, GOLF_BOARD = 10;
// The holes, each in its own 18 x 14 cell (u, v inside it): the lane (rectangles the ball rolls
// on; walls all round), the tee, the cup, par, and what's in the way.
export const HOLES = [
  { par: 2, lane: [[1, 5, 16, 9]], tee: [2.5, 7], cup: [14.5, 7] },
  { par: 3, lane: [[1, 2, 13, 6], [9, 2, 13, 13]], tee: [2.5, 4], cup: [11, 11.5] },
  { par: 3, lane: [[1, 4, 16, 10]], tee: [2.5, 7], cup: [14.5, 7], windmill: { u: 8, gap: [6, 8] } },
  { par: 3, lane: [[1, 3, 16, 11]], tee: [2.5, 9.5], cup: [14.5, 4.5], water: [[6, 3, 10, 8]] },
  { par: 2, lane: [[1, 2, 16, 12]], tee: [2.5, 7], cup: [14.5, 7], bumpers: [[6, 4.5], [6, 9.5], [10.5, 7]] },
  { par: 3, lane: [[1, 1, 16, 5], [12, 1, 16, 13], [1, 9, 16, 13]], tee: [2.5, 3], cup: [2.5, 11] },
  { par: 3, lane: [[1, 1, 5, 13], [1, 1, 16, 5], [12, 1, 16, 13]], tee: [3, 11.5], cup: [14, 11.5] },
  { par: 2, lane: [[1, 5, 16, 9]], tee: [2.5, 7], cup: [14.5, 7], loop: { u: 8.5 } },
  { par: 3, lane: [[1, 2, 16, 12]], tee: [2.5, 7], cup: [14.6, 7], castle: { u: 11, gap: [6, 8] } },
];
const CELLS = [[2, 4], [21, 4], [40, 4], [2, 19], [21, 19], [40, 19], [2, 34], [21, 34], [40, 34]]; // (each hole's corner, u v)

// Is (u, v) on the hole's lane (inside its walls)?
export const onLane = (hole, u, v) => hole.lane.some(([u0, v0, u1, v1]) => u >= u0 && u <= u1 && v >= v0 && v <= v1);
// The windmill's sails: is the gap blocked right now (t: the game's clock)?
export const windmillBlocked = t => {
  const a = (((t * 1.3) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); // (four sails: the same every quarter turn)
  return Math.abs(a - Math.PI / 4) < 0.32;
};

export function buildMiniGolf({ get, set, canUse, near = [-300, -RING - 40] }) {
  const site = findBigSite({ ...GOLF, tall: 8, near, get, canUse });
  return site ? golfAt(site, set) : null;
}

function golfAt(site, set) {
  const { L, D } = GOLF;
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const outward = faceDir(-fx, -fz);
  const signs = [];
  const sign = (u, y, v, facing, text) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, makeBlock(SIGN, facing));
    signs.push([x, y, z, text]);
  };

  // Paths between the holes, from the road.
  for (let u = 0; u < L; u++) for (const v of [2, 3, 18, 33, 48]) put(u, 0, v, B.sidewalk);
  for (let v = 0; v <= 48; v++) for (const u of [20, 39]) put(u, 0, v, B.sidewalk);
  for (const [u, v] of [[20, 2], [39, 2], [20, 18], [39, 18], [20, 33], [39, 33], [0, 2]]) put(u, 0, v, stack(B.lantern, B.sidewalk));
  sign(22, 1, 0, outward, '⛳ PUTT PUTT PARADISE · Mini golf! Stand on a tee, press G');
  put(22, 0, 0, B.log);

  // ---------- The holes ----------
  HOLES.forEach((hole, i) => {
    const [cu, cv] = CELLS[i];
    const lane = (u, v) => onLane(hole, u + 0.5, v + 0.5);
    // Log walls all round the lane (and wherever it's not lane, within reach of it).
    for (let u = 0; u < 18; u++)
      for (let v = 0; v < 14; v++) {
        if (lane(u, v)) continue;
        const touches = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([du, dv]) => lane(u + du, v + dv));
        if (touches) put(cu + u, 0, cv + v, B.log);
      }
    for (const [u0, v0, u1, v1] of hole.water || []) for (let u = u0; u < u1; u++) for (let v = v0; v < v1; v++) put(cu + u, 0, cv + v, B.water);
    for (const [u, v] of hole.bumpers || []) put(cu + Math.floor(u), 0, cv + Math.floor(v), B.stone);
    if (hole.windmill) {
      // A wall across the lane with a gap at the bottom, and the windmill's tower over it.
      const { u, gap } = hole.windmill;
      for (const [, v0, , v1] of hole.lane) for (let v = v0; v < v1; v++) if (v < gap[0] || v >= gap[1]) for (let y = 0; y < 2; y++) put(cu + u, y, cv + v, B.planks);
      for (let y = 1; y < 6; y++) for (let v = gap[0] - 1; v <= gap[1]; v++) put(cu + u, y, cv + v, y === 5 ? B.roof : B.red);
    }
    if (hole.castle) {
      // A little castle: stone walls with a gateway the ball goes through, towers at the ends.
      const { u, gap } = hole.castle;
      for (const [, v0, , v1] of hole.lane) for (let v = v0; v < v1; v++) if (v < gap[0] || v >= gap[1]) for (let y = 0; y < 3; y++) put(cu + u, y, cv + v, B.cobble);
      for (let v = gap[0]; v < gap[1]; v++) put(cu + u, 2, cv + v, B.cobble);
      for (const v of [hole.lane[0][1], hole.lane[0][3] - 1]) for (let y = 0; y < 5; y++) put(cu + u, y, cv + v, B.stone);
    }
    // The hole's sign: number and par, by the tee.
    const [tu] = hole.tee;
    sign(cu + Math.floor(tu), 1, cv + hole.lane[0][1] - 1, outward, `⛳ HOLE ${i + 1} · Par ${hole.par}`);
  });
  // Flowers here and there.
  for (const [u, v] of [[1, 1], [19, 1], [38, 1], [57, 1], [19, 47], [38, 47]]) put(u, 0, v, B.flowers);

  // ---------- The clubhouse ----------
  // A little hut by the road with the Best Rounds board (drawn by everyone's game: see golfui.js).
  for (let u = 58; u <= 61; u++)
    for (let v = 4; v <= 12; v++) {
      const edge = u === 58 || u === 61 || v === 4 || v === 12;
      put(u, 4, v, B.roof);
      if (!edge) continue;
      for (let y = 0; y < 4; y++) if (!(v === 8 && u === 58 && y < 2)) put(u, y, v, y === 2 && v % 3 === 0 ? B.glass : B.white); // (a doorway, and windows)
    }
  for (const v of [14, 22]) for (let y = 0; y < 8; y++) put(59, y, v, B.metal);

  // Where things are, in the world.
  const holes = CELLS.map(([cu, cv]) => site.pos(cu, cv));
  const [px, pz] = site.pos(56.5, 8.5), [bx, bz] = site.pos(59.4, 18.5);
  const [ax0, az0] = site.at(0, 0), [ax1, az1] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
  const [qa, qb] = [site.pos(54, 6), site.pos(57, 11)];
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'Putt Putt Paradise', key: 'golf', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      // (U, V: a step along u and along v, in the world; each hole's corner o)
      golf: { x: px, y: 0, z: pz, rect, U: [ux, uz], V: [fx, fz], holes, board: { x: bx, y: 4.2, z: bz, face: Math.atan2(-ux, -uz), w: 7, h: 6.4 } },
      golf_hut: { x: px, y: 0, z: pz, face: Math.atan2(-ux, -uz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}
