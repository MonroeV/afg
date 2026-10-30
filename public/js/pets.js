// What your pet does: follow you, wander and sniff around when you stand still,
// play fetch with the ball, and jump for joy when you pet it.
import * as THREE from 'three';

export const PET_IDLE = 0, PET_MOVING = 1, PET_HAPPY = 2, PET_CARRYING = 3;

// A ball you throw for your pet. It bounces off blocks and rolls to a stop.
export class Ball {
  constructor(scene) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 12), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 }));
    this.mesh.add(new THREE.Mesh(new THREE.TorusGeometry(0.151, 0.015, 6, 24), new THREE.MeshStandardMaterial({ color: 0xfdd835 })));
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.active = false;
    this.carried = false;
    this.restTime = 0;
  }

  throw(from, dir) {
    this.pos.copy(from).addScaledVector(dir, 0.6);
    this.vel.copy(dir).multiplyScalar(15).add(new THREE.Vector3(0, 3, 0));
    this.active = true;
    this.carried = false;
    this.restTime = 0;
    this.age = 0;
  }

  update(dt, world) {
    if (!this.active || this.carried) return;
    this.age += dt;
    this.vel.y -= 20 * dt;
    const r = 0.15;
    for (const axis of ['x', 'y', 'z']) {
      const next = this.pos[axis] + this.vel[axis] * dt;
      const p = this.pos.clone();
      p[axis] = next + Math.sign(this.vel[axis]) * r;
      if (world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
        this.vel[axis] *= -0.55;
        if (axis === 'y') {
          this.vel.x *= 0.8;
          this.vel.z *= 0.8;
        }
      } else {
        this.pos[axis] = next;
      }
    }
    const still = this.vel.lengthSq() < 0.5;
    this.restTime = still ? this.restTime + dt : 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this.vel.z * dt * 5;
    this.mesh.rotation.z -= this.vel.x * dt * 5;
  }

  get resting() {
    return this.restTime > 0.3 || this.age > 8;
  }
}

// The thinking part of your own pet. Other players just see where it goes.
export class PetBrain {
  constructor() {
    this.state = 'follow';
    this.timer = 0;
    this.idle = 0;
    this.goal = null;
    this.happy = 0;
  }

  cheer() {
    this.happy = 1.4;
  }

  // owner: { pos, yaw, speed }. Returns where to go, how fast, and what the pet is doing.
  think(dt, owner, petPos, ball) {
    this.timer -= dt;
    this.happy = Math.max(0, this.happy - dt);
    this.idle = owner.speed < 0.2 ? this.idle + dt : 0;
    const behind = () => {
      const sin = Math.sin(owner.yaw), cos = Math.cos(owner.yaw);
      return new THREE.Vector3(owner.pos.x + cos * 0.9 + sin * 0.7, owner.pos.y, owner.pos.z - sin * 0.9 + cos * 0.7);
    };

    if (ball?.active && !ball.carried && this.state !== 'return') this.state = 'fetch';
    if (this.state === 'fetch') {
      if (!ball?.active) this.state = 'follow';
      else {
        if (petPos.distanceTo(ball.pos) < 0.7 && ball.pos.y - petPos.y < 1.2) {
          ball.carried = true;
          this.state = 'return';
        }
        return { goal: ball.pos.clone(), speed: 8, action: PET_MOVING, far: 60 };
      }
    }
    if (this.state === 'return') {
      const front = new THREE.Vector3(owner.pos.x - Math.sin(owner.yaw) * 1.1, owner.pos.y, owner.pos.z - Math.cos(owner.yaw) * 1.1);
      if (petPos.distanceTo(front) < 0.6) {
        ball.active = ball.carried = false; // dropped at your feet: throw it again!
        this.state = 'follow';
        this.cheer();
        return { goal: null, action: PET_HAPPY, dropped: true };
      }
      return { goal: front, speed: 7, action: PET_CARRYING, far: 60 };
    }
    if (this.happy > 0) return { goal: null, action: PET_HAPPY };

    // Wander a little when you stand still for a while.
    if (this.idle > 3 && owner.pos.distanceTo(petPos) < 7) {
      if (this.state !== 'wander' || this.timer <= 0) {
        this.state = 'wander';
        const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3;
        this.goal = new THREE.Vector3(owner.pos.x + Math.cos(a) * r, owner.pos.y, owner.pos.z + Math.sin(a) * r);
        this.timer = 3 + Math.random() * 3;
      }
      return { goal: this.goal, speed: 1.6, action: PET_MOVING, sniff: petPos.distanceTo(this.goal) < 0.4 };
    }
    this.state = 'follow';
    return { goal: behind(), speed: null, action: PET_MOVING };
  }
}
