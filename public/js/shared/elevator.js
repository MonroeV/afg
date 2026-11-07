// Elevators. You put one at the bottom of a wall (like a ladder) and its shaft goes all the way up
// the wall. It stops at every floor: every level where there's somewhere to step out onto in
// front of its doors (a floor, the ground, or the roof up top), at least two blocks apart. Its
// doors are drawn at the floors it stops at, so you can see where it goes.
//
// The shaft is solid: you ride it by right-clicking its doors and picking a floor, and a little
// cab (with doors that slide open) carries you up or down.
import { ELEVATOR, LIFT_SHAFT, LIFT_DOOR, LIFT_DOOR_TOP, blockId, blockMeta, makeBlock, liftRole } from './blocks.js';

// Which way an elevator's doors face (out of the shaft): its facing (meta & 3).
export const liftFront = facing => [[0, 1], [1, 0], [0, -1], [-1, 0]][facing & 3];

// The shaft that (x, y, z) is part of: { lo, hi, facing }, or null if it isn't an elevator.
export function liftColumn(get, x, y, z) {
  const v = get(x, y, z);
  if (blockId(v) !== ELEVATOR) return null;
  const facing = blockMeta(v) & 3;
  const same = yy => {
    const n = get(x, yy, z);
    return blockId(n) === ELEVATOR && (blockMeta(n) & 3) === facing;
  };
  let lo = y, hi = y;
  while (lo > 0 && same(lo - 1)) lo--;
  while (hi < 63 && same(hi + 1)) hi++;
  return { lo, hi, facing };
}

// Where it stops: the heights (feet) of the floors in front of its doors. solid(x, y, z) says
// whether a cell is solid (below y = 0 is the ground). The top stop can be just above the shaft:
// the cab comes up out of it onto the roof.
export function liftStops(solid, x, z, lo, hi, facing) {
  const [dx, dz] = liftFront(facing), fx = x + dx, fz = z + dz;
  const out = [];
  for (let y = lo; y <= hi + 1; y++) {
    if (y > hi && solid(x, y, z)) break; // (nothing can come up out of a shaft with a roof on it)
    if (!solid(fx, y - 1, fz) || solid(fx, y, fz) || solid(fx, y + 1, fz)) continue;
    if (out.length && y - out[out.length - 1] < 2) continue;
    out.push(y);
  }
  return out;
}

// The block for each height of a shaft: doors where it stops (two blocks high), plain shaft
// everywhere else. Returns [[y, block], …] for the ones that aren't right yet.
export function liftDoors(get, x, z, lo, hi, facing, stops) {
  const role = new Map();
  for (let y = lo; y <= hi; y++) role.set(y, LIFT_SHAFT);
  for (const s of stops) {
    if (s <= hi) role.set(s, LIFT_DOOR);
    if (s + 1 <= hi && role.get(s + 1) === LIFT_SHAFT) role.set(s + 1, LIFT_DOOR_TOP);
  }
  const out = [];
  for (const [y, r] of role) {
    const v = get(x, y, z);
    if (blockId(v) === ELEVATOR && liftRole(v) !== r) out.push([y, makeBlock(ELEVATOR, facing | (r << 2))]);
  }
  return out;
}

// Names for its floors, bottom to top: G for the ground floor, then 2, 3, 4… and R for the roof
// (if the top stop is out in the open).
export function liftLabels(stops, roofOpen) {
  return stops.map((y, i) => (i === 0 ? (y === 0 ? 'G' : '1') : i === stops.length - 1 && roofOpen ? 'R' : String(i + 1)));
}
