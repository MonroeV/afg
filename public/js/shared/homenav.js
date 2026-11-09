// How the people who live at someone's place (their family from the Luxe Store, and their
// bodyguards) get about it: a map of everywhere they can walk on that land and just round it,
// on every floor. They walk across rooms, step up stairs, climb ladders, go through doors (and
// shut them behind them: see npcs.js) and ride elevators to every floor of a tower. Garage
// doors are for cars: they keep away from those.
import { blockId, blockMeta, itemOf, shapeOf, DOOR_TOP, ELEVATOR } from './blocks.js';
import { liftColumn, liftStops, liftFront } from './elevator.js';

export const STAND = 1, LADDER = 2, DOOR = 4;
const ALONG_X = 8; // (a door you go through along x, not z)
export const WALK = 0, CLIMB = 1, RIDE = 2; // how you get to the next cell of a route
const MAX_NODES = 6000;
const TOP = 62;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const cellKey = (x, y, z) => ((x + 512) * 128 + (y + 1)) * 1024 + (z + 512);

// A door's column (lo to hi) and whether it's a garage door (three or more wide, or three or
// more tall), or null if there's no door at (x, y, z).
export function doorAt(get, x, y, z) {
  const v = itemOf(get(x, y, z));
  if (shapeOf(v) !== 'door') return null;
  const f = blockMeta(v) & 3;
  const same = (a, b, c) => {
    const n = itemOf(get(a, b, c));
    return shapeOf(n) === 'door' && (blockMeta(n) & 3) === f;
  };
  let lo = y, hi = y;
  while (lo > 0 && y - lo < 24 && same(x, lo - 1, z)) lo--;
  while (hi < 63 && hi - y < 24 && same(x, hi + 1, z)) hi++;
  const [ax, az] = f % 2 === 0 ? [1, 0] : [0, 1];
  const beside = (a, c) => {
    const n = itemOf(get(a, lo, c));
    return shapeOf(n) === 'door' && (blockMeta(n) & 3) % 2 === f % 2;
  };
  let wide = 1;
  for (const s of [1, -1]) for (let i = 1; i < 3 && beside(x + ax * i * s, z + az * i * s); i++) wide++;
  return { lo, hi, f, garage: hi - lo >= 2 || wide >= 3 };
}

// What someone can do in a cell: stand there, climb a ladder there, or walk through a door
// there (flags). w: { get, solid, stand(x, y, z), allowed(x, z), own(x, z), garages }.
export function cellFlags(w, x, y, z) {
  if (y < 0 || y > TOP || !w.allowed(x, z) || nearGarage(w.garages, x, y, z, 1)) return 0;
  const v = itemOf(w.get(x, y, z)), shape = shapeOf(v);
  if (shape === 'door') {
    if (blockMeta(v) & DOOR_TOP || !w.own(x, z) || !w.solid(x, y - 1, z)) return 0;
    const d = doorAt(w.get, x, y, z);
    if (!d || d.garage || d.hi - d.lo > 1 || (d.hi === d.lo && w.solid(x, y + 1, z))) return 0;
    return DOOR | (blockMeta(v) & 1 ? ALONG_X : 0);
  }
  // (On a floor, the ground or a step: not up on the furniture.)
  let f = w.stand(x, y, z) && (y === 0 || shapeOf(itemOf(w.get(x, y - 1, z))) === 'cube') ? STAND : 0;
  if (shape === 'ladder' && !w.solid(x, y + 1, z)) f |= LADDER;
  return f;
}

export function nearGarage(garages, x, y, z, r) {
  for (const [gx, gy, gz] of garages) if (Math.abs(gx - x) <= r && Math.abs(gz - z) <= r && y >= gy - 1 && y <= gy + 3) return true;
  return false;
}

// (Doors only let you through one way: straight through them.)
const passes = (f, dx) => !(f & DOOR) || (f & ALONG_X ? dx !== 0 : dx === 0);

// The map: every cell you can get to from `seed` without leaving `rect` ([x0, z0, x1, z1]).
// Returns { nodes: Map(key -> { x, y, z, f, roof, to: [[key, how, shaftX, shaftZ]] }), garages }.
export function buildMap(w, rect, seed) {
  const [rx0, rz0, rx1, rz1] = rect;
  const garages = [];
  for (let x = rx0; x <= rx1; x++)
    for (let z = rz0; z <= rz1; z++)
      for (let y = 0; y <= TOP; y++) {
        const v = itemOf(w.get(x, y, z));
        if (shapeOf(v) === 'door' && !(blockMeta(v) & DOOR_TOP) && doorAt(w.get, x, y, z)?.garage) garages.push([x, y, z]);
      }
  const ctx = { ...w, garages };
  const memo = new Map();
  const flags = (x, y, z) => {
    if (x < rx0 || x > rx1 || z < rz0 || z > rz1) return 0;
    const k = cellKey(x, y, z);
    let f = memo.get(k);
    if (f === undefined) memo.set(k, (f = cellFlags(ctx, x, y, z)));
    return f;
  };
  const roofed = (x, y, z) => {
    for (let yy = y + 2; yy < y + 12; yy++) if (w.solid(x, yy, z)) return true;
    return false;
  };
  const nodes = new Map();
  const start = [seed, [seed[0], seed[1] + 1, seed[2]], [seed[0], seed[1] - 1, seed[2]]].find(([x, y, z]) => flags(x, y, z));
  if (!start) return { nodes, garages };
  const add = (x, y, z) => {
    const k = cellKey(x, y, z);
    if (!nodes.has(k)) nodes.set(k, { x, y, z, f: flags(x, y, z), roof: roofed(x, y, z), to: null });
    return k;
  };
  const queue = [add(...start)];
  for (let qi = 0; qi < queue.length && nodes.size < MAX_NODES; qi++) {
    const n = nodes.get(queue[qi]);
    n.to = moves(n, flags, w);
    for (const m of n.to) {
      const fresh = !nodes.has(m[0]);
      const [x, y, z] = m.cell;
      add(x, y, z);
      if (fresh) queue.push(m[0]);
    }
  }
  for (const n of nodes.values()) {
    n.to ??= [];
    for (const m of n.to) delete m.cell;
    n.to = n.to.filter(m => nodes.has(m[0]));
  }
  return { nodes, garages };
}

// Where you can go from node n.
function moves(n, flags, w) {
  const { x, y, z, f } = n, out = [];
  const push = (cx, cy, cz, how, sx, sz) => {
    const m = [cellKey(cx, cy, cz), how, sx, sz];
    m.cell = [cx, cy, cz];
    out.push(m);
  };
  for (const [dx, dz] of SIDES) {
    const nx = x + dx, nz = z + dz;
    if (passes(f, dx)) {
      const b = flags(nx, y, nz);
      if (b && passes(b, dx)) push(nx, y, nz, WALK);
      if (!(f & DOOR)) {
        // A step up (with room for your head), or down.
        if (flags(nx, y + 1, nz) & (STAND | LADDER) && !w.solid(x, y + 2, z)) push(nx, y + 1, nz, WALK);
        if (flags(nx, y - 1, nz) & (STAND | LADDER) && !w.solid(nx, y + 1, nz)) push(nx, y - 1, nz, WALK);
      }
    }
    // An elevator's doors, right here: ride it to its other floors.
    if (f & STAND && blockId(w.get(nx, y, nz)) === ELEVATOR) {
      const col = liftColumn(w.get, nx, y, nz);
      const [fx, fz] = liftFront(col.facing);
      if (nx + fx !== x || nz + fz !== z) continue;
      const stops = liftStops(w.solid, nx, nz, col.lo, col.hi, col.facing);
      if (!stops.includes(y)) continue;
      for (const s of stops) if (s !== y && flags(x, s, z) & STAND) push(x, s, z, RIDE, nx, nz);
    }
  }
  if (f & STAND && !(f & DOOR))
    for (const [dx, dz] of CORNERS) {
      const ok = (a, b) => (flags(a, y, b) & (STAND | DOOR | LADDER)) === STAND;
      if (ok(x + dx, z + dz) && ok(x + dx, z) && ok(x, z + dz)) push(x + dx, y, z + dz, WALK);
    }
  if (f & LADDER) {
    if (flags(x, y + 1, z) & LADDER) push(x, y + 1, z, CLIMB);
    if (flags(x, y - 1, z) & LADDER) push(x, y - 1, z, CLIMB);
  }
  return out;
}

// The way from one node to another: [{ x, y, z, how, sx, sz }] (not counting where you are), or
// null if there's no way.
export function route(map, fromKey, toKey) {
  if (!map.nodes.has(fromKey) || !map.nodes.has(toKey)) return null;
  if (fromKey === toKey) return [];
  const came = new Map([[fromKey, null]]);
  const queue = [fromKey];
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    if (k === toKey) break;
    for (const m of map.nodes.get(k).to) {
      if (came.has(m[0])) continue;
      came.set(m[0], [k, m]);
      queue.push(m[0]);
    }
  }
  if (!came.has(toKey)) return null;
  const out = [];
  for (let k = toKey; came.get(k); k = came.get(k)[0]) {
    const [, m] = came.get(k);
    const n = map.nodes.get(k);
    out.push({ x: n.x, y: n.y, z: n.z, f: n.f, how: m[1], sx: m[2], sz: m[3] });
  }
  return out.reverse();
}

// The node nearest a spot (a little more weight on being on the same floor), within `max`.
export function nearestNode(map, x, y, z, max = 3) {
  let best = null, bestD = max;
  for (const [k, n] of map.nodes) {
    if (n.f & (DOOR | LADDER) && !(n.f & STAND)) continue;
    const d = Math.hypot(n.x + 0.5 - x, n.z + 0.5 - z) + Math.abs(n.y - y) * 2;
    if (d < bestD) [best, bestD] = [k, d];
  }
  return best;
}
