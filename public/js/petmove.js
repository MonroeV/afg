// How pets get around: they find a real route through the world (walking, hopping up one
// block, jumping down a few, climbing ladders), and move along it with gravity and
// collisions, so they never walk through walls, railings, closed doors or cars.
import * as THREE from 'three';
import { WORLD, shapeOf, itemOf, railMask } from './shared/blocks.js';

const HW = 0.2; // half the pet's width
const HEIGHT = 0.6;
const GRAVITY = 20;
const JUMP_SPEED = 7.4; // enough to hop up one block
const CLIMB_SPEED = 2.4;
const MAX_DROP = 3; // the furthest a pet will jump down (any higher and it looks for another way)
const MAX_NODES = 2500; // how hard it looks for a route before settling for the closest spot
const WINDUP = 0.1; // the little crouch before a jump

// A cell packed into one number: x and z from -128 to 127, y from 0 to 63.
const pack = (x, y, z) => ((x + 128) * 64 + y) * 256 + (z + 128);
const unpack = k => [Math.floor(k / 16384) - 128, Math.floor(k / 256) % 64, (k % 256) - 128];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Answers "can a pet be here?" questions about the blocks, and finds routes.
export class PetNav {
  constructor(world) {
    this.world = world;
    this.revision = -1;
    this.cache = new Map();
    this.boxes = [];
  }

  // Forget what we knew whenever a block changes.
  refresh() {
    if (this.world.revision === this.revision) return;
    this.revision = this.world.revision;
    this.cache.clear();
  }

  cached(kind, x, y, z, fn) {
    const k = kind + pack(x, y, z) * 4;
    let v = this.cache.get(k);
    if (v === undefined) {
      v = fn();
      this.cache.set(k, v);
    }
    return v;
  }

  inside(x, y, z) {
    return y >= 0 && y < 63 && x >= WORLD.min && x <= WORLD.max && z >= WORLD.min && z <= WORLD.max;
  }

  // Room for a pet's body in the middle of this cell? (An open door or a railing along the
  // edge leaves room; a block, a closed door or a couch doesn't.)
  passable(x, y, z) {
    if (!this.inside(x, y, z)) return false;
    return this.cached(0, x, y, z, () => {
      const out = this.boxes;
      out.length = 0;
      this.world.cellBoxes(x, y, z, out);
      this.world.cellBoxes(x, y - 1, z, out); // things that stick up from below (railings)
      const r = [x + 0.28, y + 0.04, z + 0.28, x + 0.72, y + 0.66, z + 0.72];
      return !out.some(b => b[0] < r[3] && b[3] > r[0] && b[1] < r[4] && b[4] > r[1] && b[2] < r[5] && b[5] > r[2]);
    });
  }

  // Something to stand on at the bottom of this cell (the ground, or the top of a block).
  support(x, y, z) {
    if (y === 0) return true;
    return this.cached(1, x, y, z, () => {
      const out = this.boxes;
      out.length = 0;
      this.world.cellBoxes(x, y - 1, z, out);
      return out.some(b => b[4] >= y - 0.06 && b[0] < x + 0.7 && b[3] > x + 0.3 && b[2] < z + 0.7 && b[5] > z + 0.3);
    });
  }

  // On a ladder (or just above the top of one, climbing off it).
  climb(x, y, z) {
    if (!this.inside(x, y, z)) return false;
    return this.cached(2, x, y, z, () => shapeOf(itemOf(this.world.get(x, y, z))) === 'ladder' || (y > 0 && shapeOf(itemOf(this.world.get(x, y - 1, z))) === 'ladder'));
  }

  standable(x, y, z) {
    return this.passable(x, y, z) && (this.support(x, y, z) || this.climb(x, y, z));
  }

  // A railing between this cell and the next one (in either cell)?
  railBetween(x, y, z, dx, dz) {
    const a = railMask(this.world.get(x, y, z)), b = railMask(this.world.get(x + dx, y, z + dz));
    if (!a && !b) return false;
    if (dx === 1) return (a & 2) || (b & 8);
    if (dx === -1) return (a & 8) || (b & 2);
    if (dz === 1) return (a & 4) || (b & 1);
    return (a & 1) || (b & 4);
  }

  // The spot a pet would stand on at (or below) a point: where it lands if it falls.
  landing(p, below = 64) {
    const x = Math.floor(p.x), z = Math.floor(p.z), top = Math.min(62, Math.floor(p.y + 0.05));
    for (let y = top; y >= Math.max(0, top - below); y--) if (this.standable(x, y, z)) return [x, y, z];
    return null;
  }

  // Where a pet can get to from a cell in one step: [x, y, z, cost].
  moves(x, y, z, out) {
    out.length = 0;
    const climbing = this.climb(x, y, z);
    for (let i = 0; i < 8; i++) {
      const [dx, dz] = DIRS[i];
      const nx = x + dx, nz = z + dz;
      if (i >= 4) {
        // Diagonal: only on the flat, with room on both sides (no cutting corners).
        if (this.standable(nx, y, nz) && this.passable(nx, y, z) && this.passable(x, y, nz) &&
          !this.railBetween(x, y, z, dx, 0) && !this.railBetween(x, y, z, 0, dz) &&
          !this.railBetween(nx, y, z, 0, dz) && !this.railBetween(x, y, nz, dx, 0)) out.push([nx, y, nz, 1.42]);
        continue;
      }
      if (this.railBetween(x, y, z, dx, dz)) continue;
      if (this.standable(nx, y, nz)) {
        out.push([nx, y, nz, 1]);
      } else if (this.passable(nx, y, nz)) {
        // Nothing to stand on there: jump down (not too far).
        for (let k = 1; k <= MAX_DROP && this.passable(nx, y - k + 1, nz); k++) {
          if (this.standable(nx, y - k, nz)) {
            out.push([nx, y - k, nz, 1 + k * 0.6]);
            break;
          }
        }
      } else if (!climbing && this.passable(x, y + 1, z) && this.standable(nx, y + 1, nz) && !this.railBetween(x, y + 1, z, dx, dz)) {
        // A block in the way, with room on top: hop up.
        out.push([nx, y + 1, nz, 2.2]);
      }
    }
    // Up and down ladders.
    if (climbing && this.passable(x, y + 1, z) && (this.climb(x, y + 1, z) || this.standable(x, y + 1, z))) out.push([x, y + 1, z, 1.5]);
    if (this.climb(x, y - 1, z) && this.passable(x, y - 1, z)) out.push([x, y - 1, z, 1.5]);
    return out;
  }

  // A* from one cell to another. Returns { path (cells after the start), reached }. When the
  // goal can't be reached, the path leads to the closest spot it could get to.
  find(start, goal) {
    const sk = pack(...start), gk = pack(...goal);
    const h = ([x, y, z]) => {
      const dx = Math.abs(x - goal[0]), dz = Math.abs(z - goal[2]);
      return Math.max(dx, dz) + 0.42 * Math.min(dx, dz) + Math.abs(y - goal[1]) * 1.2;
    };
    const g = new Map([[sk, 0]]), from = new Map();
    const heap = [[h(start), sk]];
    const closed = new Set();
    let best = sk, bestH = h(start);
    const moves = [];
    while (heap.length && closed.size < MAX_NODES) {
      const [, k] = heapPop(heap);
      if (closed.has(k)) continue;
      closed.add(k);
      if (k === gk) {
        best = k;
        bestH = 0;
        break;
      }
      const c = unpack(k);
      const hc = h(c);
      if (hc < bestH) {
        bestH = hc;
        best = k;
      }
      for (const [x, y, z, cost] of this.moves(c[0], c[1], c[2], moves)) {
        const nk = pack(x, y, z);
        if (closed.has(nk)) continue;
        const ng = g.get(k) + cost;
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          from.set(nk, k);
          heapPush(heap, [ng + h([x, y, z]), nk]);
        }
      }
    }
    const path = [];
    for (let k = best; k !== sk; k = from.get(k)) path.unshift(unpack(k));
    return { path, reached: best === gk };
  }

  // Can a pet walk straight from a point to a cell on the same level (for cutting corners
  // off a route)?
  clearWalk(p, cell) {
    const tx = cell[0] + 0.5, tz = cell[2] + 0.5, y = cell[1];
    const d = Math.hypot(tx - p.x, tz - p.z), steps = Math.ceil(d / 0.25);
    let lx = Math.floor(p.x), lz = Math.floor(p.z);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = p.x + (tx - p.x) * t, z = p.z + (tz - p.z) * t;
      for (const [ox, oz] of [[-HW, -HW], [HW, -HW], [-HW, HW], [HW, HW]]) {
        if (!this.standable(Math.floor(x + ox), y, Math.floor(z + oz)) || this.climb(Math.floor(x + ox), y, Math.floor(z + oz))) return false;
      }
      const cx = Math.floor(x), cz = Math.floor(z);
      if (cx !== lx && this.railBetween(lx, y, lz, cx - lx, 0)) return false;
      if (cz !== lz && this.railBetween(cx, y, lz, 0, cz - lz)) return false;
      lx = cx;
      lz = cz;
    }
    return true;
  }
}

function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p][0] <= h[i][0]) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}

function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}

// Moves one pet along its route with real physics: it speeds up and slows down, falls,
// bumps into things, crouches and leaps up steps, and climbs ladders paw over paw.
export class PetMover {
  constructor(nav, flying = false) {
    this.nav = nav;
    this.flying = flying; // dragons fly over things instead of walking round them
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.onGround = false;
    this.path = [];
    this.goalKey = null;
    this.repath = 0;
    this.reachable = true;
    this.windup = 0;
    this.climbing = false;
    this.landed = 0; // how hard it just landed (for the squash)
    this.stuck = 0;
    this.best = Infinity;
    this.lift = 0;
  }

  place(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.path = [];
    this.goalKey = null;
    this.repath = 0;
  }

  cell() {
    return [Math.floor(this.pos.x), Math.floor(this.pos.y + 0.05), Math.floor(this.pos.z)];
  }

  // Where to start a route from: the cell it's in, or (standing on top of something odd,
  // like a couch or a car) the nearest spot it could step to. Not while in the air.
  startCell(x, y, z) {
    const nav = this.nav;
    if (nav.standable(x, y, z)) return [x, y, z];
    if (!this.onGround) return null;
    for (const dy of [1, 0, -1]) for (const [dx, dz] of [[0, 0], ...DIRS]) if (nav.standable(x + dx, y + dy, z + dz)) return [x + dx, y + dy, z + dz];
    return null;
  }

  // goal: where to go (or null to stay). opts: { speed, turnRate, fallback, boxes }.
  // Returns how fast it's going (0..1) for the walking animation.
  // level: only go somewhere on about the same level as the goal (for wandering about).
  update(dt, goal, { speed = 4, turnRate = 0, fallback = null, boxes = () => [], level = false } = {}) {
    const nav = this.nav;
    nav.refresh();
    if (this.flying) return this.fly(dt, goal, speed, boxes);
    const [cx, cy, cz] = this.cell();
    const start = this.startCell(cx, cy, cz);

    // Find (or refresh) the route now and then, and whenever the goal moves to another cell.
    this.repath -= dt;
    if (goal) {
      const g = nav.landing(goal, level ? 1 : 64) || (fallback && nav.landing(fallback));
      const gk = g ? g.join(',') : null;
      // (No point looking again for a way that wasn't there, unless something changed.)
      const search = `${start}|${gk}|${nav.revision}`;
      if (start && (this.repath <= 0 || gk !== this.goalKey) && !(search === this.lastSearch && !this.reachable)) {
        this.goalKey = gk;
        this.lastSearch = search;
        const r = g ? nav.find(start, g) : { path: [], reached: false };
        this.path = r.path;
        this.reachable = r.reached;
        // (Looking for a way that isn't there is hard work: don't keep trying so often.)
        this.repath = r.reached ? 0.6 : 2;
        this.best = Infinity;
      }
    } else {
      this.path = [];
      this.reachable = true;
    }

    // Tick off the steps we've reached, and skip ahead where a straight run is clear.
    while (this.path.length) {
      const w = this.path[0];
      if (Math.hypot(w[0] + 0.5 - this.pos.x, w[2] + 0.5 - this.pos.z) < 0.3 && Math.abs(w[1] - this.pos.y) < 0.6) {
        this.path.shift();
        this.best = Infinity;
      } else break;
    }
    if (this.onGround) {
      while (this.path.length >= 2 && this.path[0][1] === cy && this.path[1][1] === cy && nav.clearWalk(this.pos, this.path[1])) this.path.shift();
    }

    const w = this.path[0];
    let tx = null, tz = null;
    if (w) {
      tx = w[0] + 0.5;
      tz = w[2] + 0.5;
    } else if (goal && this.reachable && Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < 1.2 && Math.abs(goal.y - this.pos.y) < 0.7) {
      tx = goal.x; // the last little bit, right up to the spot
      tz = goal.z;
    }
    const ladder = nav.climb(cx, cy, cz);
    const vertical = w && w[0] === cx && w[2] === cz && w[1] !== cy;
    const holding = ladder && !(this.onGround && !vertical); // hanging on to a ladder
    // On a ladder, keep climbing until it's high enough to step off at the top.
    const climbUp = holding && w && w[1] > this.pos.y + 0.02;
    const climbDown = holding && vertical && w[1] < cy;
    this.holding = holding;
    this.climbing = climbUp || climbDown;

    // Which way it wants to go, and how fast.
    let wx = 0, wz = 0;
    if (tx !== null && !(holding && vertical) && !climbUp) {
      const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.04) {
        let sp = speed * Math.min(1, 0.35 + d * 1.2); // eases in at the end
        let dir = Math.atan2(-dx, -dz);
        if (turnRate) {
          // Running like an animal: it can only turn so fast, so it swings wide, and it
          // slows down for sharp turns.
          let dy = dir - this.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          this.yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, dy));
          sp *= Math.max(0.25, Math.cos(dy));
          dir = this.yaw;
        } else {
          let dy = dir - this.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          this.yaw += dy * Math.min(1, dt * 12);
        }
        wx = -Math.sin(dir) * sp;
        wz = -Math.cos(dir) * sp;
      }
    }
    if (holding) {
      // On a ladder: stay lined up with it.
      wx += (cx + 0.5 - this.pos.x) * 4;
      wz += (cz + 0.5 - this.pos.z) * 4;
    }
    if (this.windup > 0) {
      wx *= 0.25;
      wz *= 0.25;
    }
    const accel = this.onGround || holding ? 16 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    // Hop up a step: crouch for a moment, then leap.
    const stepUp = w && w[1] > cy && !vertical && Math.hypot(w[0] + 0.5 - this.pos.x, w[2] + 0.5 - this.pos.z) < 1.25;
    if (this.onGround && !holding && stepUp && this.windup <= 0) this.windup = WINDUP;
    // Stuck against something it should get past? Try a hop, and look for a new way.
    if (tx !== null && this.onGround && !holding) {
      const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      if (d < this.best - 0.05) {
        this.best = d;
        this.stuck = 0;
      } else if ((this.stuck += dt) > 0.8) {
        this.stuck = 0;
        this.best = Infinity;
        this.repath = 0;
        if (this.windup <= 0) this.windup = WINDUP;
      }
    }
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0 && this.onGround) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    // Up or down a ladder, or else gravity (half before moving and half after, like people).
    if (holding) this.vel.y = climbUp ? CLIMB_SPEED : climbDown ? -CLIMB_SPEED : 0;
    else this.vel.y -= GRAVITY * dt / 2;
    const falling = this.vel.y;
    const wasOnGround = this.onGround;
    this.onGround = false;
    this.move('x', this.vel.x * dt, boxes);
    this.move('z', this.vel.z * dt, boxes);
    this.move('y', this.vel.y * dt, boxes);
    if (!holding && !this.onGround) this.vel.y -= GRAVITY * dt / 2;
    if (holding && Math.abs(this.vel.y) < 0.01) this.onGround = this.onGround || nav.support(cx, cy, cz);
    if (this.onGround && !wasOnGround && falling < -1.5) this.landed = Math.min(1, 0.25 - falling / 12); // bigger drops, bigger squash
    this.landed = Math.max(0, this.landed - dt * 5);
    if (this.pos.y < -3) this.pos.y = 0; // fell out of the world somehow: back on the ground
    return Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 3);
  }

  // Dragons fly: they go straight for the goal, and rise up over anything in the way.
  fly(dt, goal, speed, boxes) {
    this.climbing = false;
    this.onGround = true;
    if (!goal) return 0;
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, d = Math.hypot(dx, dz);
    const sp = d > 0.3 ? Math.min(speed, d * 3) : 0;
    const wx = d > 0.3 ? (dx / d) * sp : 0, wz = d > 0.3 ? (dz / d) * sp : 0;
    if (d > 0.3) {
      let dy = Math.atan2(-dx, -dz) - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 8);
    }
    const k = 1 - Math.exp(-6 * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;
    const bx = this.pos.x, bz = this.pos.z, meant = Math.hypot(this.vel.x, this.vel.z) * dt;
    this.move('x', this.vel.x * dt, boxes, 1.6);
    this.move('z', this.vel.z * dt, boxes, 1.6);
    const blocked = sp > 0.5 && Math.hypot(this.pos.x - bx, this.pos.z - bz) < meant * 0.5;
    // Blocked by something? Keep rising until it's clear, then a moment longer to get over it.
    if (blocked) {
      this.lift = 1;
      this.liftY = this.pos.y + 1;
    } else this.lift = Math.max(0, this.lift - dt);
    const ground = this.nav.landing(this.pos, 8);
    const floor = ground ? ground[1] : 0;
    const want = Math.max(floor, goal.y, this.lift > 0 ? this.liftY : -Infinity);
    this.vel.y = Math.max(-4, Math.min(4, (want - this.pos.y) * 3));
    this.move('y', this.vel.y * dt, boxes, 1.6);
    return Math.min(1, sp / 3);
  }

  // Moves along one axis as far as it can without going into anything solid.
  move(axis, d, boxes, height = HEIGHT) {
    if (!d) return;
    const a = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const p = this.pos;
    const me = [p.x - HW, p.y, p.z - HW, p.x + HW, p.y + height, p.z + HW];
    const r = me.slice();
    if (d > 0) r[a + 3] += d;
    else r[a] += d;
    const out = [];
    for (let x = Math.floor(r[0]); x <= Math.floor(r[3]); x++)
      for (let y = Math.floor(r[1]) - 1; y <= Math.floor(r[4]); y++)
        for (let z = Math.floor(r[2]); z <= Math.floor(r[5]); z++) this.nav.world.cellBoxes(x, y, z, out);
    for (const b of boxes()) if (b[0] < r[3] && b[3] > r[0] && b[1] < r[4] && b[4] > r[1] && b[2] < r[5] && b[5] > r[2]) out.push(b);
    const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
    let allowed = d;
    for (const b of out) {
      if (b[o1] >= me[o1 + 3] - 1e-7 || b[o1 + 3] <= me[o1] + 1e-7 || b[o2] >= me[o2 + 3] - 1e-7 || b[o2 + 3] <= me[o2] + 1e-7) continue;
      if (d > 0 && b[a] >= me[a + 3] - 1e-4) allowed = Math.min(allowed, b[a] - me[a + 3]);
      else if (d < 0 && b[a + 3] <= me[a] + 1e-4) allowed = Math.max(allowed, b[a + 3] - me[a]);
    }
    p[axis] += allowed;
    if (allowed !== d) {
      if (axis === 'y' && d < 0) this.onGround = true;
      this.vel[axis] = 0;
    }
  }
}
