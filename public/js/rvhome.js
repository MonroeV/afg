// Inside the RV: walk about its rooms (even while somebody drives it along), sit on the couch, at
// the dinette or up front, sleep in the big bed, cook pancakes, get a juice from the fridge, watch
// TV... You move in the RV's own space (so the RV can turn and drive with you in it): left and
// right are x, front and back z (the front is -z), and the floor is at RV_FLOOR. The furniture
// matches the RV's model in cars.js.
import { toWorld } from './shared/vehicles.js';

export const RV_FLOOR = 0.67;
const R = 0.22; // how wide you are (half), in here
const WALL = 1.22; // the inside of the side walls (x)
const DOOR = { z0: -0.6, z1: 0.3 }; // the door, in the right-hand wall (+x)
const SEAT = 1.15; // how high you sit (hips) on the benches and the couch

// What you bump into: [x0, z0, x1, z1].
const SOLID = [
  [-1.3, -4.2, 1.3, -3.42], // the dashboard
  [-0.88, -3.45, -0.36, -2.8], // the driver's seat
  [0.36, -3.45, 0.88, -2.8], // the other front seat
  [-1.3, -2.45, -0.4, -0.65], // the dinette (two benches and the table)
  [0.67, -2.2, 1.3, -0.7], // the couch
  [-1.3, 0, -0.65, 1.95], // the kitchen counter and the fridge
  [0.22, 0.67, 1.3, 1.93], // the bathroom
  [-1.3, 2.17, 1.3, 4.2], // the bed
];

// Things to do: where they are ([x0, y0, z0, x1, y1, z1], to point at), and what they do. Seats
// have where you sit and which way you face (`yaw`, turned from the RV's front).
export const SPOTS = [
  { id: 'drive', box: [-0.88, 0.67, -3.45, -0.36, 1.7, -2.8], hint: '🚐 Right-click to drive' },
  { id: 'sit', box: [0.36, 0.67, -3.45, 0.88, 1.7, -2.8], seat: [0.6, 1.09, -3.15], yaw: 0, hint: '💺 Right-click to sit up front' },
  { id: 'sit', box: [-1.16, 0.67, -2.45, -0.4, 1.5, -1.95], seat: [-0.78, SEAT, -2.2], yaw: Math.PI, hint: '🪑 Right-click to sit at the table' },
  { id: 'sit', box: [-1.16, 0.67, -1.15, -0.4, 1.5, -0.65], seat: [-0.78, SEAT, -0.9], yaw: 0, hint: '🪑 Right-click to sit at the table' },
  { id: 'game', box: [-1.16, 1.3, -1.93, -0.4, 1.62, -1.17], hint: '🎲 Right-click to play a game at the table' },
  { id: 'sit', box: [0.67, 0.67, -2.2, 1.25, 1.5, -1.45], seat: [0.92, SEAT, -1.85], yaw: Math.PI / 2, hint: '🛋️ Right-click to sit on the couch' },
  { id: 'sit', box: [0.67, 0.67, -1.45, 1.25, 1.5, -0.7], seat: [0.92, SEAT, -1.05], yaw: Math.PI / 2, hint: '🛋️ Right-click to sit on the couch' },
  { id: 'tv', box: [-0.48, 2.2, -4.1, 0.48, 2.8, -3.95], hint: '📺 Right-click to change the channel' },
  { id: 'wash', box: [-1.15, 1.5, 0.15, -0.75, 1.75, 0.55], hint: '🚰 Right-click to wash your hands' },
  { id: 'cook', box: [-1.25, 0.67, 0.6, -0.65, 2.5, 1.3], hint: '🍳 Right-click to cook something' },
  { id: 'cook', box: [-1.25, 0.67, 0, -0.65, 2.5, 0.6], hint: '🍳 Right-click to cook something' },
  { id: 'juice', box: [-1.25, 0.67, 1.35, -0.65, 2.45, 1.95], hint: '🧃 Right-click to open the fridge' },
  { id: 'bath', box: [0.22, 0.67, 0.67, 1.3, 2.7, 1.93], hint: '🚿 Right-click to look in the bathroom' },
  { id: 'sleep', box: [-1.18, 0.67, 2.17, 1.18, 1.5, 4.05], hint: '🛏️ Right-click to go to sleep (B)' },
  { id: 'out', box: [1.1, 0.67, DOOR.z0, 1.32, 2.3, DOOR.z1], hint: '🚪 Right-click (or walk out, or E) to go outside' },
];
// Where you lie in the big bed: feet at the end, head on the pillows (toward the front).
const BEDS = [[-0.45, 1.36, 3.85], [0.45, 1.36, 3.85]];

const hits = (x, z) => SOLID.some(([x0, z0, x1, z1]) => x + R > x0 && x - R < x1 && z + R > z0 && z - R < z1);
const inDoor = z => z - R > DOOR.z0 && z + R < DOOR.z1;

export class RVHome {
  constructor() {
    this.car = null;
    this.local = { x: 0, y: RV_FLOOR, z: 0 };
    this.relYaw = 0; // which way you face, from the RV's front
    this.sit = null; // the seat you're on
    this.bed = -1; // asleep in the bed (which side)
  }

  get inside() {
    return !!this.car;
  }

  // In through the door (or, from the driver's seat, standing just behind it).
  enter(car, at = 'door') {
    this.car = car;
    this.sit = null;
    this.bed = -1;
    if (at === 'cab') Object.assign(this.local, { x: 0, y: RV_FLOOR, z: -2.55 });
    else Object.assign(this.local, { x: 0.85, y: RV_FLOOR, z: (DOOR.z0 + DOOR.z1) / 2 });
    this.relYaw = at === 'cab' ? Math.PI : Math.PI / 2; // (facing back into the RV, or across it from the door)
    this.lastYaw = undefined;
  }

  leave() {
    this.car = null;
    this.sit = null;
    this.bed = -1;
  }

  // A spot in the RV, in the world.
  toWorld(lx, ly, lz) {
    const c = this.car;
    return toWorld([lx, ly, lz], c.pos.x, c.pos.y, c.pos.z, c.h);
  }

  // A world point (or direction, with `dir`) in the RV's own space.
  toLocal(x, y, z, dir = false) {
    const c = this.car, cos = Math.cos(c.h), sin = Math.sin(c.h);
    const dx = dir ? x : x - c.pos.x, dz = dir ? z : z - c.pos.z;
    return [dx * cos - dz * sin, dir ? y : y - c.pos.y, dx * sin + dz * cos];
  }

  // Keeps which way you face turning with the RV (it may be driving round a corner), given your
  // view's yaw (the mouse may have turned it). Returns the new yaw to look along.
  turnWith(yaw) {
    this.relYaw += yaw - (this.lastYaw ?? yaw);
    this.lastYaw = this.car.h + this.relYaw;
    return this.lastYaw;
  }

  // Walking about. move: [forward, right] (-1..1), already from the keys or the joystick.
  // Returns 'out' when you walk out of the door.
  walk(dt, [fwd, right], run) {
    if (this.sit || this.bed >= 0) return null;
    const speed = run ? 4.2 : 2.8;
    const s = Math.sin(this.relYaw), c = Math.cos(this.relYaw);
    const dx = (-s * fwd + c * right) * speed * dt, dz = (-c * fwd - s * right) * speed * dt;
    const L = this.local;
    // One way at a time, so you slide along walls (and only the doorway lets you out).
    const nx = L.x + dx;
    const wall = inDoor(L.z) ? 2 : WALL - R;
    if (nx > -WALL + R && nx < wall && !hits(nx, L.z)) L.x = nx;
    const nz = L.z + dz;
    if (nz > -4.05 + R && nz < 4.05 - R && !hits(L.x, nz) && (L.x < WALL - R || inDoor(nz))) L.z = nz;
    return L.x > 1.55 ? 'out' : null;
  }

  // The thing you're pointing at (within reach), or null.
  aim(eye, dir) {
    const [ox, oy, oz] = this.toLocal(eye.x, eye.y, eye.z);
    const [vx, vy, vz] = this.toLocal(dir.x, dir.y, dir.z, true);
    let best = null, bestT = 2.6;
    for (const spot of SPOTS) {
      const [x0, y0, z0, x1, y1, z1] = spot.box;
      let t0 = 0, t1 = bestT;
      for (const [o, v, a, b] of [[ox, vx, x0, x1], [oy, vy, y0, y1], [oz, vz, z0, z1]]) {
        if (Math.abs(v) < 1e-6) {
          if (o < a || o > b) t0 = Infinity;
          continue;
        }
        const ta = (a - o) / v, tb = (b - o) / v;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
      if (t0 <= t1 && t0 < bestT) {
        best = spot;
        bestT = t0;
      }
    }
    return best;
  }

  sitOn(spot) {
    this.sit = spot;
    this.bed = -1;
    Object.assign(this.local, { x: spot.seat[0], y: spot.seat[1] - 0.72, z: spot.seat[2] });
    this.relYaw = spot.yaw;
  }

  // Lie down in the big bed (the side nobody's... well, the left side, or the right).
  lieDown(side = 0) {
    this.sit = null;
    this.bed = side;
    const [x, y, z] = BEDS[side];
    Object.assign(this.local, { x, y, z });
    this.relYaw = Math.PI; // (head toward the front: see cars.js bed())
  }

  // Up off a seat (or out of bed): stand in the aisle beside it.
  standUp() {
    const L = this.local;
    const wasBed = this.bed >= 0;
    this.sit = null;
    this.bed = -1;
    if (wasBed) Object.assign(L, { x: -0.2, y: RV_FLOOR, z: 2.0 });
    else {
      L.y = RV_FLOOR;
      // Step off sideways into the aisle (on that side of it), or as near as there's room.
      const side = Math.sign(L.x) || 1;
      for (const z of [L.z, L.z + 0.4, L.z - 0.4, -2.55, -1.5]) {
        for (const x of [0.37, 0.2, 0, -0.2].map(a => a * side)) {
          if (!hits(x, z)) return Object.assign(L, { x, z });
        }
      }
    }
    return L;
  }

  // Where you step out to: just outside the door.
  exitSpot() {
    return this.toWorld(this.car.spec.width / 2 + 0.6, 0, (DOOR.z0 + DOOR.z1) / 2);
  }
}
