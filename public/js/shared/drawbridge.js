// Your own drawbridge (since v0.72). Put Drawbridge blocks in a row (or a wide path) across a moat
// or a gap, and a Lever right by one end. Right-click the lever and the bridge swings up on its
// hinge (the end by the lever), standing tall like a wall, so nobody can cross; again, and down
// it comes. (The server does it: see the lever handler in game.js.)
//
// How it works: the bridge is every Drawbridge block joined to the ones by the lever (up to
// MAX_BLOCKS). Lying flat, it's down: each block moves up over the hinge row, as high as it was
// far from it. Standing up, it's up: each block moves back out, as far as it is high. Which way
// it lies back down is kept in the standing blocks (their meta: 0 +x, 1 -x, 2 +z, 3 -z). The
// spots a lowered bridge leaves turn back into water if there's water on both sides.
import { blockId, blockMeta, makeBlock, isWaterBlock } from './blocks.js';

export const DRAWBRIDGE = 150, LEVER = 151;
export const MAX_BLOCKS = 96;
const REACH = 2; // (how close to the lever the bridge has to start)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const WATER = 36;

// What changes when the lever at (lx, ly, lz) is pulled: { up, cells: [[x, y, z, value]...] }
// (up: it's going up), or { error } if it can't (no bridge, or something in the way).
export function pullLever(get, lx, ly, lz) {
  if (blockId(get(lx, ly, lz)) !== LEVER) return { error: 'none' };
  const isBridge = (x, y, z) => blockId(get(x, y, z)) === DRAWBRIDGE;
  // The bridge: start from the Drawbridge blocks right by the lever, and everything joined on.
  const seen = new Map(), todo = [];
  for (let dx = -REACH; dx <= REACH; dx++)
    for (let dy = -REACH; dy <= REACH; dy++)
      for (let dz = -REACH; dz <= REACH; dz++) if (isBridge(lx + dx, ly + dy, lz + dz)) todo.push([lx + dx, ly + dy, lz + dz]);
  while (todo.length && seen.size <= MAX_BLOCKS) {
    const [x, y, z] = todo.pop(), k = `${x},${y},${z}`;
    if (seen.has(k)) continue;
    seen.set(k, [x, y, z]);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (isBridge(x + dx, y + dy, z + dz) && !seen.has(`${x + dx},${y + dy},${z + dz}`)) todo.push([x + dx, y + dy, z + dz]);
  }
  if (!seen.size) return { error: 'none' };
  if (seen.size > MAX_BLOCKS) return { error: 'big' };
  const cells = [...seen.values()];
  const ys = cells.map(c => c[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const free = (x, y, z) => {
    const v = get(x, y, z);
    return !v || isWaterBlock(v) || seen.has(`${x},${y},${z}`);
  };
  const out = [];
  if (y0 === y1) {
    // Down: up it goes. The long way across is the way it swings; the hinge is the end by the lever.
    const xs = cells.map(c => c[0]), zs = cells.map(c => c[2]);
    const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs);
    const a = c => (alongX ? c[0] : c[2]), lo = Math.min(...cells.map(a)), hi = Math.max(...cells.map(a));
    const la = alongX ? lx : lz, sign = Math.abs(la - lo) <= Math.abs(la - hi) ? 1 : -1, hinge = sign > 0 ? lo : hi;
    if (hi === lo) return { error: 'short' };
    const dir = alongX ? (sign > 0 ? 0 : 1) : sign > 0 ? 2 : 3;
    const moves = cells.map(([x, y, z]) => {
      const d = (a([x, y, z]) - hinge) * sign;
      return [x, y, z, alongX ? hinge : x, y + d, alongX ? z : hinge];
    });
    for (const [, , , x, y, z] of moves) if (y > 127 || !free(x, y, z)) return { error: 'blocked' };
    const target = new Set(moves.map(m => `${m[3]},${m[4]},${m[5]}`));
    for (const [x, y, z] of cells) if (!target.has(`${x},${y},${z}`)) out.push([x, y, z, refill(get, seen, x, y, z)]);
    for (const [, , , x, y, z] of moves) out.push([x, y, z, makeBlock(DRAWBRIDGE, dir)]);
    return { up: true, cells: out };
  }
  // Up: back down it comes, the way it was lying.
  const base = cells.filter(c => c[1] === y0);
  const dir = blockMeta(get(...base[0])) & 3, [ddx, ddz] = DIRS[dir];
  const moves = cells.map(([x, y, z]) => [x, y, z, x + ddx * (y - y0), y0, z + ddz * (y - y0)]);
  for (const [, , , x, y, z] of moves) if (!free(x, y, z)) return { error: 'blocked' };
  const target = new Set(moves.map(m => `${m[3]},${m[4]},${m[5]}`));
  for (const [x, y, z] of cells) if (!target.has(`${x},${y},${z}`)) out.push([x, y, z, 0]);
  for (const [, , , x, y, z] of moves) out.push([x, y, z, DRAWBRIDGE]);
  return { up: false, cells: out };
}

// What a spot the bridge has just left goes back to: water, if there's water on both sides of it
// (a moat: looking past the rest of the bridge), or nothing.
function refill(get, bridge, x, y, z) {
  const wet = ([dx, dz]) => {
    let k = 1;
    while (k < 100 && bridge.has(`${x + dx * k},${y},${z + dz * k}`)) k++;
    return isWaterBlock(get(x + dx * k, y, z + dz * k));
  };
  return (wet(DIRS[0]) && wet(DIRS[1])) || (wet(DIRS[2]) && wet(DIRS[3])) ? WATER : 0;
}
