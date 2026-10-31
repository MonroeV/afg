// First-person movement and collision.
// Collision works with boxes, so thin doors and car roofs feel solid in the right places.
import * as THREE from 'three';
import { BLOCKS, SPAWN, blockId, blockMeta, shapeOf, itemOf, floorOf } from './shared/blocks.js';

const HALF_WIDTH = 0.3;
export const HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const CROUCH_DROP = 0.32; // how much lower your eyes are when you crouch

const WALK_SPEED = 6;
const SPRINT_SPEED = 9.5;
const FLY_SPEED = 14;
const GRAVITY = 28;
const JUMP_SPEED = 9;
const BOUNCE_SPEED = 19;
const CROUCH_SPEED = 2.4;
const BOOST_SPEED = 22; // speed pads
const BOOST_TIME = 0.7;
const BALLOON_FALL = 2.4; // holding a balloon, you float down this fast
const AXES = { x: 0, y: 1, z: 2 };

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z); // feet position
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.sprinting = false;
    this.moving = false;
    this.extraBoxes = () => []; // other solid things, like cars
    this.bouncePower = () => BOUNCE_SPEED; // how hard a bounce pad at (x, y, z) launches you
    this.keys = new Set();
    this.stick = null; // { x, y } from a touch joystick, if there is one
    this.crouching = false;
    this.balloon = false; // holding a balloon: you float down gently
    this.jetpack = false; // holding the jetpack: Space blasts you up
    this.jetting = false;
    this.boost = new THREE.Vector3(); // a speed pad's push
    this.boostT = 0;
  }

  respawn() {
    this.pos.set(SPAWN.x, SPAWN.y, SPAWN.z);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
  }

  look(dx, dy, sensitivity) {
    this.yaw -= dx * sensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch - dy * sensitivity));
  }

  // keys: a Set of KeyboardEvent.code values currently held down
  update(dt, keys) {
    this.keys = keys;
    let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    let strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    // A touch joystick moves you smoothly: push it a little to walk slowly.
    const analog = this.stick && (this.stick.x || this.stick.y);
    if (analog) {
      forward = this.stick.y;
      strafe = this.stick.x;
    }
    this.sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    this.moving = forward !== 0 || strafe !== 0;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
    if (wish.lengthSq() > (analog ? 1 : 0)) wish.normalize();

    this.climbing = !this.flying && this.onLadder();
    // Ctrl or C to crouch (C is "down" while flying).
    this.crouching = !this.flying && !this.climbing && (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'));
    if (this.crouching) this.sprinting = false;
    this.speedPad(dt);
    if (this.climbing) {
      // On a ladder: W or Space climbs, S or C climbs down, otherwise you hold on.
      const up = keys.has('KeyW') || keys.has('Space');
      const down = keys.has('KeyS') || keys.has('KeyC');
      this.vel.y = up ? 3.6 : down ? -3.6 : 0;
      const k = 1 - Math.exp(-14 * dt);
      this.vel.x += (wish.x * WALK_SPEED * 0.6 - this.vel.x) * k;
      this.vel.z += (wish.z * WALK_SPEED * 0.6 - this.vel.z) * k;
    } else if (this.flying) {
      const speed = this.sprinting ? FLY_SPEED * 1.8 : FLY_SPEED;
      const up = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') || keys.has('ControlLeft') ? 1 : 0);
      const target = new THREE.Vector3(wish.x * speed, up * speed, wish.z * speed);
      this.vel.lerp(target, 1 - Math.exp(-10 * dt));
    } else {
      const speed = this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      // Less control in the air, and almost none while flying out of a cannon (a jetpack
      // steers better).
      const accel = this.onGround ? 14 : this.launched ? 0.4 : this.jetting ? 6 : 3;
      const k = 1 - Math.exp(-accel * dt);
      // A speed pad's push fades away over a moment.
      const push = this.boostT > 0 ? this.boostT / BOOST_TIME : 0;
      this.vel.x += (wish.x * speed + this.boost.x * push - this.vel.x) * k;
      this.vel.z += (wish.z * speed + this.boost.z * push - this.vel.z) * k;
      if (keys.has('Space') && this.onGround) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }
    // The jetpack: hold Space to blast upward (harder than gravity pulls you down).
    this.jetting = this.jetpack && !this.flying && !this.climbing && keys.has('Space') && this.pos.y < 60;
    if (this.jetting) {
      this.vel.y = Math.min(this.vel.y + 40 * dt, 7);
      this.launched = false;
    }
    // Gravity is added half before and half after moving, so a jump is just as high at
    // any frame rate (on a slow phone too).
    const falling = !this.climbing && !this.flying;
    // Holding a balloon, you drift down slowly (jumps go just as high, though).
    const gravity = this.balloon && this.vel.y < 0 ? GRAVITY * 0.35 : GRAVITY;
    if (falling) this.vel.y -= gravity * dt / 2;

    this.unstick();
    const wasOnGround = this.onGround;
    this.onGround = false;
    // Crouching, you don't walk off edges: a step that would leave nothing under your
    // feet is taken back (like holding on with your toes).
    const guard = this.crouching && wasOnGround && falling;
    for (const axis of ['x', 'z']) {
      const before = this.pos[axis];
      this.moveAxis(axis, this.vel[axis] * dt);
      if (guard && !this.supported()) {
        this.pos[axis] = before;
        this.vel[axis] = 0;
      }
    }
    this.moveAxis('y', this.vel.y * dt);
    if (falling && !this.onGround) this.vel.y -= gravity * dt / 2;
    if (this.balloon && falling && this.vel.y < -BALLOON_FALL) this.vel.y += (-BALLOON_FALL - this.vel.y) * (1 - Math.exp(-5 * dt));
    if (this.onGround && this.flying && !wasOnGround) this.flying = false;
  }

  // Is there something to stand on under our feet (no more than a small step down)?
  supported() {
    const p = this.pos, e = 0.001;
    const r = [p.x - HALF_WIDTH + e, p.y - 0.6, p.z - HALF_WIDTH + e, p.x + HALF_WIDTH - e, p.y + 0.01, p.z + HALF_WIDTH - e];
    return this.boxesNear(r).some(b => b[0] < r[3] && b[3] > r[0] && b[2] < r[5] && b[5] > r[2] && b[4] > r[1] && b[1] < r[4]);
  }

  // Standing on a speed pad shoots you off the way its arrows point.
  speedPad(dt) {
    this.boostT = Math.max(0, this.boostT - dt);
    if (!this.onGround || this.flying) return;
    const cell = this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.02), Math.floor(this.pos.z));
    const pad = [itemOf(cell), floorOf(cell)].find(v => BLOCKS[blockId(v)]?.speedPad);
    if (pad === undefined) return;
    const a = (blockMeta(pad) & 3) * Math.PI / 2;
    if (this.boostT < BOOST_TIME - 0.15) this.onBoost?.();
    this.boost.set(Math.sin(a) * BOOST_SPEED, 0, Math.cos(a) * BOOST_SPEED);
    this.boostT = BOOST_TIME;
  }

  // Are we touching a ladder (at our feet or chest)? Checking a little below our feet
  // lets you climb just past the top rung, high enough to step off onto the wall.
  onLadder() {
    const p = this.pos;
    for (let x = Math.floor(p.x - HALF_WIDTH); x <= Math.floor(p.x + HALF_WIDTH - 1e-6); x++)
      for (let z = Math.floor(p.z - HALF_WIDTH); z <= Math.floor(p.z + HALF_WIDTH - 1e-6); z++)
        for (const y of [Math.floor(p.y - 0.12), Math.floor(p.y + 0.9)]) if (shapeOf(this.world.get(x, y, z)) === 'ladder') return true;
    return false;
  }

  box() {
    const p = this.pos;
    return [p.x - HALF_WIDTH, p.y, p.z - HALF_WIDTH, p.x + HALF_WIDTH, p.y + HEIGHT, p.z + HALF_WIDTH];
  }

  // All solid boxes that could touch the region [min, max].
  boxesNear(r) {
    const out = [];
    for (let x = Math.floor(r[0]); x <= Math.floor(r[3]); x++)
      for (let y = Math.floor(r[1]) - 1; y <= Math.floor(r[4]); y++) // one lower: railings stick up out of their cell
        for (let z = Math.floor(r[2]); z <= Math.floor(r[5]); z++) this.world.cellBoxes(x, y, z, out);
    for (const b of this.extraBoxes()) {
      if (b[0] < r[3] && b[3] > r[0] && b[1] < r[4] && b[4] > r[1] && b[2] < r[5] && b[5] > r[2]) out.push(b);
    }
    return out;
  }

  // Moves along one axis as far as possible without entering anything solid.
  moveAxis(axis, d) {
    if (d === 0) return;
    const a = AXES[axis];
    const p = this.box();
    const region = p.slice();
    if (d > 0) region[a + 3] += d;
    else region[a] += d;
    const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
    let allowed = d, stopper = null;
    for (const b of this.boxesNear(region)) {
      // Only boxes that overlap us on the other two axes can block this move.
      if (b[o1] >= p[o1 + 3] - 1e-7 || b[o1 + 3] <= p[o1] + 1e-7) continue;
      if (b[o2] >= p[o2 + 3] - 1e-7 || b[o2 + 3] <= p[o2] + 1e-7) continue;
      if (d > 0 && b[a] >= p[a + 3] - 1e-4 && b[a] - p[a + 3] < allowed) {
        allowed = b[a] - p[a + 3];
        stopper = b;
      } else if (d < 0 && b[a + 3] <= p[a] + 1e-4 && b[a + 3] - p[a] > allowed) {
        allowed = b[a + 3] - p[a];
        stopper = b;
      }
    }
    this.pos[axis] += allowed;
    if (allowed !== d) {
      // Walking into a car pushes on it (and it pushes back: we stop).
      if (stopper?.car && axis !== 'y') this.onPushCar?.(stopper.car, axis, this.vel[axis]);
      const impact = this.vel[axis];
      this.vel[axis] = 0;
      if (axis === 'y' && d < 0) this.landed(impact);
    }
  }

  landed(impact = 0) {
    this.onGround = true;
    this.launched = false;
    // Bounce pads launch you upward.
    const x0 = Math.floor(this.pos.x - HALF_WIDTH), x1 = Math.floor(this.pos.x + HALF_WIDTH);
    const z0 = Math.floor(this.pos.z - HALF_WIDTH), z1 = Math.floor(this.pos.z + HALF_WIDTH);
    const y = Math.floor(this.pos.y - 0.01);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        if (BLOCKS[blockId(this.world.get(x, y, z))]?.bounce) {
          this.vel.y = this.bouncePower(x, y, z, this.keys);
          this.onGround = false;
          this.bounced = true;
          return;
        }
    // Beds are a little bouncy (everyone jumps on beds).
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        if (impact < -4 && BLOCKS[blockId(itemOf(this.world.get(x, y, z)))]?.springy) {
          this.vel.y = Math.min(10, -impact * 0.6);
          this.onGround = false;
          this.springed = true;
          return;
        }
  }

  overlapsSomething() {
    const p = this.box();
    return this.boxesNear(p).some(b =>
      b[0] < p[3] - 1e-4 && b[3] > p[0] + 1e-4 && b[1] < p[4] - 1e-4 && b[4] > p[1] + 1e-4 && b[2] < p[5] - 1e-4 && b[5] > p[2] + 1e-4);
  }

  // If something appears inside us (e.g. someone built on top of us), pop up.
  unstick() {
    let tries = 0;
    while (this.overlapsSomething() && tries++ < 64) this.pos.y = Math.floor(this.pos.y) + 1;
  }

  // Would a block at (x,y,z) overlap the player?
  overlapsBlock(x, y, z) {
    return x + 1 > this.pos.x - HALF_WIDTH && x < this.pos.x + HALF_WIDTH &&
      y + 1 > this.pos.y && y < this.pos.y + HEIGHT &&
      z + 1 > this.pos.z - HALF_WIDTH && z < this.pos.z + HALF_WIDTH;
  }

  eye(target) {
    return target.set(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
  }
}
