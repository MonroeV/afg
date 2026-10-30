// First-person movement and collision against the block grid.
import * as THREE from 'three';
import { BLOCKS, SPAWN } from './shared/blocks.js';

const HALF_WIDTH = 0.3;
const HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

const WALK_SPEED = 6;
const SPRINT_SPEED = 9.5;
const FLY_SPEED = 14;
const GRAVITY = 28;
const JUMP_SPEED = 9;
const BOUNCE_SPEED = 19;

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
      const accel = this.onGround ? 14 : 3; // less control in the air
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

    // Move in small steps so fast movement can't tunnel through blocks.
    const dist = this.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.35));
    const wasOnGround = this.onGround;
    this.onGround = false;
    for (let i = 0; i < steps; i++) {
      this.moveAxis('x', (this.vel.x * dt) / steps);
      this.moveAxis('z', (this.vel.z * dt) / steps);
      this.moveAxis('y', (this.vel.y * dt) / steps);
    }
    if (this.onGround && this.flying && !wasOnGround) this.flying = false;
  }

  // Cells that the player's box would overlap at the current position.
  collides() {
    const minX = Math.floor(this.pos.x - HALF_WIDTH), maxX = Math.floor(this.pos.x + HALF_WIDTH - 1e-6);
    const minY = Math.floor(this.pos.y), maxY = Math.floor(this.pos.y + HEIGHT - 1e-6);
    const minZ = Math.floor(this.pos.z - HALF_WIDTH), maxZ = Math.floor(this.pos.z + HALF_WIDTH - 1e-6);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (this.world.isSolid(x, y, z)) return true;
    return false;
  }

  moveAxis(axis, d) {
    if (d === 0) return;
    this.pos[axis] += d;
    if (!this.collides()) return;

    // Back off to the edge of the block we ran into.
    const before = this.pos[axis] - d;
    if (axis === 'y') {
      this.pos.y = d < 0 ? Math.floor(this.pos.y) + 1 : Math.floor(this.pos.y + HEIGHT) - HEIGHT - 1e-4;
    } else if (d > 0) {
      this.pos[axis] = Math.floor(this.pos[axis] + HALF_WIDTH) - HALF_WIDTH - 1e-4;
    } else {
      this.pos[axis] = Math.floor(this.pos[axis] - HALF_WIDTH) + 1 + HALF_WIDTH + 1e-4;
    }
    if (this.collides()) this.pos[axis] = before; // couldn't resolve cleanly, just undo
    this.vel[axis] = 0;
    if (axis === 'y' && d < 0) this.landed();
  }

  landed() {
    this.onGround = true;
    // Bounce pads launch you upward.
    const x0 = Math.floor(this.pos.x - HALF_WIDTH), x1 = Math.floor(this.pos.x + HALF_WIDTH);
    const z0 = Math.floor(this.pos.z - HALF_WIDTH), z1 = Math.floor(this.pos.z + HALF_WIDTH);
    const y = Math.floor(this.pos.y) - 1;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        if (BLOCKS[this.world.get(x, y, z)]?.bounce) {
          this.vel.y = BOUNCE_SPEED;
          this.onGround = false;
          this.bounced = true;
          return;
        }
  }

  // If a block appears inside us (e.g. someone built on top of us), pop up.
  unstick() {
    let tries = 0;
    while (this.collides() && tries++ < 64) this.pos.y = Math.floor(this.pos.y) + 1;
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
