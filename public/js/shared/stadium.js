// BuildZone Stadium, out by the Outer Loop (since v0.62): a soccer field (grass, white lines, a
// goal at each end with a net behind it), boards round the edge, stands full of cheering fans
// down both sides, floodlights on tall towers at the corners and a big scoreboard. On the field:
// a GIANT soccer ball, as big as you. Run into it to kick it (sprint for a big kick, look up a
// little to chip it)! Get it into a goal and the crowd goes wild. 🔴 Red scores in the blue goal
// and 🔵 Blue in the red one; anyone can play for either side.
//
// The ball's rolling and bouncing is worked out here (stepBall), by the server (the real ball)
// and by everyone's game in between the server's updates, so it looks smooth.
import { makeBlock, SIGN } from './blocks.js';
import { findBigSite } from './airport.js';
import { RING } from './outerlands.js';

const B = { sidewalk: 24, stone: 3, metal: 11, chair: 60, railing: 54, lamp: 18, red: 14, blue: 15, white: 12, streetLamp: 46, flowers: 27 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
export const STADIUM = { L: 84, D: 58 };
export const BALL_R = 1.0; // (the ball's radius: it's 2 blocks across)
export const GOAL_DEPTH = 4, GOAL_H = 3;
export const SOCCER_COINS = 2; // (for scoring a goal)
const FIELD = [12, 71, 14, 43]; // (u0, u1, v0, v1: the playing area, inside the boards)
const MOUTH = [25, 32]; // (the goal mouths, v)
const STAND_ROWS = 8;

export function buildStadium({ get, set, canUse, near = [-RING - 40, 60] }) {
  const site = findBigSite({ ...STADIUM, tall: 14, near, get, canUse });
  return site ? stadiumAt(site, set) : null;
}

function stadiumAt(site, set) {
  const { L, D } = STADIUM;
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
  const rail = (u, v, mask) => put(u, 0, v, makeBlock(B.railing, mask));
  const [f0, f1, fv0, fv1] = FIELD, [m0, m1] = MOUTH;

  // ---------- The field ----------
  // White lines (flat): round the edge, halfway, the center circle and spot, the penalty boxes.
  const line = (u, v) => put(u, 0, v, B.sidewalk);
  for (let u = f0; u <= f1; u++) for (const v of [fv0, fv1]) line(u, v);
  for (let v = fv0; v <= fv1; v++) for (const u of [f0, f1, Math.floor((f0 + f1) / 2)]) line(u, v);
  const cu = (f0 + f1 + 1) / 2, cv = (fv0 + fv1 + 1) / 2;
  for (let a = 0; a < 64; a++) line(Math.floor(cu + Math.cos((a / 64) * Math.PI * 2) * 5), Math.floor(cv + Math.sin((a / 64) * Math.PI * 2) * 5));
  for (const [a, b] of [[f0, f0 + 8], [f1 - 8, f1]])
    for (let u = a; u <= b; u++)
      for (let v = 19; v <= 38; v++) if (v === 19 || v === 38 || u === (a === f0 ? b : a)) line(u, v);
  // Boards all round (railings), open at the goal mouths.
  for (let u = f0 - 1; u <= f1 + 1; u++) {
    rail(u, fv0 - 1, site.edge(0, 1));
    rail(u, fv1 + 1, site.edge(0, -1));
  }
  for (let v = fv0; v <= fv1; v++)
    for (const [u, du] of [[f0 - 1, 1], [f1 + 1, -1]]) if (v < m0 - 1 || v > m1 + 1) rail(u, v, site.edge(du, 0));
  // The goals: white posts and crossbar, a net (railings) round the back and sides.
  for (const [end, back, du] of [[f0, f0 - GOAL_DEPTH, -1], [f1, f1 + GOAL_DEPTH, 1]]) {
    for (const v of [m0 - 1, m1 + 1]) for (let y = 0; y < GOAL_H; y++) put(end + du, y, v, B.white);
    for (let v = m0 - 1; v <= m1 + 1; v++) put(end + du, GOAL_H, v, du < 0 ? B.red : B.blue); // (the crossbar: red's goal, blue's goal)
    for (let v = m0 - 1; v <= m1 + 1; v++) for (let y = 0; y < GOAL_H; y++) put(back + du, y, v, y ? B.white : makeBlock(B.railing, site.edge(-du, 0)));
    for (let u = Math.min(end + du * 2, back); u <= Math.max(end + du * 2, back); u++) for (const [v, dv] of [[m0 - 1, 1], [m1 + 1, -1]]) rail(u, v, site.edge(0, dv));
  }

  // ---------- The stands ----------
  // Rows of seats stepping up, down both long sides (a gap in the middle of the near one: the way
  // in), and the fans who sit in them (see stadiumui.js).
  const fans = [];
  const stand = (vFront, dv) => {
    for (let u = f0 + 2; u <= f1 - 2; u++) {
      if (dv < 0 && u >= 39 && u <= 44) continue; // (the entrance)
      for (let r = 0; r < STAND_ROWS; r++) {
        const v = vFront + dv * r;
        for (let y = 0; y < r; y++) put(u, y, v, B.stone);
        if (u % 2 === 0) {
          put(u, r, v, makeBlock(B.chair, dv < 0 ? inward : outward));
          if ((u * 7 + r * 3) % 5 < 3) {
            const [x, z] = site.pos(u + 0.5, v + 0.5);
            fans.push([Math.round(x * 10) / 10, r, Math.round(z * 10) / 10, dv < 0 ? 0 : 1]); // (and which side: they face the field)
          }
        }
      }
    }
  };
  stand(fv0 - 3, -1); // (the near side: from v 11 back to v 4)
  stand(fv1 + 3, 1); // (the far side)
  // Floodlight towers at the four corners.
  for (const [u, v] of [[f0 - 3, fv0 - 3], [f1 + 3, fv0 - 3], [f0 - 3, fv1 + 3], [f1 + 3, fv1 + 3]]) {
    for (let y = 0; y < 14; y++) put(u, y, v, B.metal);
    for (const du of [-1, 0, 1]) put(u + du, 14, v, B.lamp);
  }
  // The way in: a path from the road through the gap in the stands.
  for (let u = 39; u <= 44; u++) for (let v = 0; v <= fv0 - 2; v++) put(u, 0, v, B.sidewalk);
  for (let u = f0 - 2; u <= f1 + 2; u++) put(u, 0, fv0 - 2, B.sidewalk); // (the walkway round the boards)
  for (const u of [38, 45]) put(u, 0, 1, B.streetLamp);
  sign(46, 1, 1, outward, '⚽ BUILDZONE STADIUM 🏟️ Kick the giant ball!');
  put(46, 0, 1, B.metal);
  sign(41, 1, fv0 - 2, inward, '⚽ Run into the ball to kick it! Sprint = big kick 💥');
  put(41, 0, fv0 - 2, B.metal);

  // ---------- The scoreboard ----------
  // Behind the far goal: two tall legs (the board is drawn by everyone's game).
  const sb = f1 + GOAL_DEPTH + 4;
  for (const v of [22, 35]) for (let y = 0; y < 12; y++) put(sb, y, v, B.metal);

  // Where things are, in the world.
  const box = (a, b, c, d) => {
    const [x0, z0] = site.pos(a, c), [x1, z1] = site.pos(b, d);
    return [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)];
  };
  const field = box(f0, f1 + 1, fv0, fv1 + 1); // (the playing area's edges)
  const longX = Math.abs(ux) > 0.5; // (the field's long way: along x or z)
  // The ends: which world coordinate (x or z, along the long way) each goal line is at (the
  // first, at u = f0, is red's goal), and the goal mouths (across).
  const [ex0, ez0] = site.pos(f0, cv), [ex1, ez1] = site.pos(f1 + 1, cv);
  const endA = longX ? ex0 : ez0, endB = longX ? ex1 : ez1;
  const [mx0, mz0] = site.pos(cu, m0), [mx1, mz1] = site.pos(cu, m1 + 1);
  const mouth = longX ? [mz0, mz1] : [mx0, mx1];
  const [sx, sz] = site.pos(sb - 0.6, (22 + 36) / 2);
  const [cx, cz] = site.pos(cu, cv), [px, pz] = site.pos(41.5, fv0 - 2.5);
  const [ax0, az0] = site.at(0, 0), [ax1, az1] = site.at(L - 1, D - 1);
  const rect = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
  const [qa, qb] = [site.pos(37, fv0 - 3), site.pos(46, fv0 - 1.5)];
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'BuildZone Stadium', key: 'stadium', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    places: {
      stadium: {
        x: px, y: 0, z: pz, rect, center: [cx, cz],
        // The ball's world: the playing area, which way is long, the two goal lines (the first
        // is red's goal: blue scores there), the goal mouths (across), and their depth.
        field, long: longX ? 'x' : 'z', ends: [Math.min(endA, endB), Math.max(endA, endB)], redAt: endA < endB ? 0 : 1, mouth: [Math.min(...mouth), Math.max(...mouth)],
        board: { x: sx, y: 6.5, z: sz, face: Math.atan2(-ux, -uz), w: 12, h: 6 },
        fans, fanFace: [Math.atan2(-fx, -fz), Math.atan2(fx, fz)], // (which way each side's fans look: at the field)
      },
      stadium_gate: { x: px, y: 0, z: pz, face: Math.atan2(fx, fz), area: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1])] },
    },
  };
}

// The ball, a little later: rolling (slowing down on the grass), bouncing, off the boards and the
// goal nets. Returns 'red' or 'blue' (who scored) the moment it goes right over a goal line.
export function stepBall(b, dt, F) {
  const R = BALL_R, X = F.long === 'x';
  b.vy -= 20 * dt;
  b.y += b.vy * dt;
  if (b.y <= 0) {
    b.y = 0;
    b.vy = b.vy < -2.5 ? -b.vy * 0.5 : 0;
  }
  const drag = Math.exp(-(b.y <= 0.01 ? 0.75 : 0.15) * dt);
  b.vx *= drag;
  b.vz *= drag;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  // (along: the long way; across: the short way)
  let a = X ? b.x : b.z, c = X ? b.z : b.x, va = X ? b.vx : b.vz, vc = X ? b.vz : b.vx;
  const [a0, a1] = F.ends, [c0, c1] = X ? [F.field[1], F.field[3]] : [F.field[0], F.field[2]], [g0, g1] = F.mouth;
  const inMouth = c > g0 + R * 0.4 && c < g1 - R * 0.4 && b.y < GOAL_H - R * 0.5;
  let scored = null;
  // The ends: the boards, or into the goal (and the net behind it).
  if (a < a0 + R && !(inMouth || a < a0)) {
    a = a0 + R;
    va = Math.abs(va) * 0.6;
  } else if (a > a1 - R && !(inMouth || a > a1)) {
    a = a1 - R;
    va = -Math.abs(va) * 0.6;
  }
  if (a < a0 || a > a1) {
    // In a goal: the net stops it (back and sides).
    const back = a < a0 ? a0 - GOAL_DEPTH + R : a1 + GOAL_DEPTH - R;
    if ((a < a0 && a < back) || (a > a1 && a > back)) {
      a = back;
      va = -va * 0.3;
    }
    if (c < g0 + R) [c, vc] = [g0 + R, Math.abs(vc) * 0.3];
    if (c > g1 - R) [c, vc] = [g1 - R, -Math.abs(vc) * 0.3];
    if (!b.scored && (a + R < a0 || a - R > a1)) {
      b.scored = true;
      const end = a < a0 ? 0 : 1; // (which goal it went in)
      scored = end === F.redAt ? 'blue' : 'red'; // (in red's goal: a point for blue)
    }
  } else {
    // The side boards.
    if (c < c0 + R) [c, vc] = [c0 + R, Math.abs(vc) * 0.6];
    if (c > c1 - R) [c, vc] = [c1 - R, -Math.abs(vc) * 0.6];
  }
  if (X) Object.assign(b, { x: a, z: c, vx: va, vz: vc });
  else Object.assign(b, { z: a, x: c, vz: va, vx: vc });
  return scored;
}

// A kick: from where the kicker is, which way they're looking (yaw, pitch), how hard (0..1).
export function kickBall(b, yaw, pitch, power, boost = 1) {
  const speed = (8 + power * 10) * boost;
  b.vx = -Math.sin(yaw) * speed;
  b.vz = -Math.cos(yaw) * speed;
  b.vy = Math.max(b.vy, 2 + Math.max(0, Math.min(1, pitch * 1.5)) * 9 * (0.6 + power * 0.4));
}
