// First-person movement and collision.
// Collision works with boxes, so thin doors and car roofs feel solid in the right places.
import * as THREE from 'three';
import { BLOCKS, SPAWN, blockId } from './shared/blocks.js';

const HALF_WIDTH = 0.3;
export const HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

const WALK_SPEED = 6;
const SPRINT_SPEED = 9.5;
const FLY_SPEED = 14;
const GRAVITY = 28;
const JUMP_SPEED = 9;
const BOUNCE_SPEED = 19;
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
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    this.sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    this.moving = forward !== 0 || strafe !== 0;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
    if (wish.lengthSq() > 0) wish.normalize();

    if (this.flying) {
      const speed = this.sprinting ? FLY_SPEED * 1.8 : FLY_SPEED;
      const up = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') || keys.has('ControlLeft') ? 1 : 0);
      const target = new THREE.Vector3(wish.x * speed, up * speed, wish.z * speed);
      this.vel.lerp(target, 1 - Math.exp(-10 * dt));
    } else {
      const speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      // Less control in the air, and almost none while flying out of a cannon.
      const accel = this.onGround ? 14 : this.launched ? 0.4 : 3;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (wish.x * speed - this.vel.x) * k;
      this.vel.z += (wish.z * speed - this.vel.z) * k;
      this.vel.y -= GRAVITY * dt;
      if (keys.has('Space') && this.onGround) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    this.unstick();
    const wasOnGround = this.onGround;
    this.onGround = false;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveAxis('y', this.vel.y * dt);
    if (this.onGround && this.flying && !wasOnGround) this.flying = false;
  }

  box() {
    const p = this.pos;
    return [p.x - HALF_WIDTH, p.y, p.z - HALF_WIDTH, p.x + HALF_WIDTH, p.y + HEIGHT, p.z + HALF_WIDTH];
  }

  // All solid boxes that could touch the region [min, max].
  boxesNear(r) {
    const out = [];
    for (let x = Math.floor(r[0]); x <= Math.floor(r[3]); x++)
      for (let y = Math.floor(r[1]); y <= Math.floor(r[4]); y++)
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
      this.vel[axis] = 0;
      if (axis === 'y' && d < 0) this.landed();
    }
  }

  landed() {
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
