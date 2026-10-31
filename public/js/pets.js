// What your pet does: follow you, wander and sniff around when you stand still,
// play fetch with the ball, and jump for joy when you pet it.
import * as THREE from 'three';

export const PET_IDLE = 0, PET_MOVING = 1, PET_HAPPY = 2, PET_CARRYING = 3;

// A ball you throw for your pet. It flies in an arc (with a little trail and a shadow
// on the ground under it), bounces off anything solid and rolls to a stop.
const BALL_R = 0.2;
const BALL_GRAVITY = 18;
const TRAIL = 12;
const AXES = ['x', 'y', 'z'];
const AXIS = { x: 0, y: 1, z: 2 };

export class Ball {
  constructor(scene) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe53935, emissive: 0x3a0000, roughness: 0.35 }));
    this.mesh.add(new THREE.Mesh(new THREE.TorusGeometry(BALL_R + 0.002, 0.02, 6, 28), new THREE.MeshStandardMaterial({ color: 0xfdd835, roughness: 0.4 })));
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    // A streak of fading dots behind it while it flies.
    this.trail = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff4c4, transparent: true, opacity: 0.55, depthWrite: false }), TRAIL);
    this.trail.frustumCulled = false;
    this.trail.count = 0;
    scene.add(this.trail);
    this.trailPts = [];
    // A soft dark spot on the ground under it, so you can see how high it is.
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.renderOrder = 2;
    this.shadow.visible = false;
    scene.add(this.shadow);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.active = false;
    this.carried = false;
    this.restTime = 0;
    this.squash = 0;
    this.squashAxis = 1;
    this.onBounce = null; // (position, how hard) after a good bounce
    this.matrix = new THREE.Matrix4();
  }

  throw(from, dir) {
    this.pos.copy(from).addScaledVector(dir, 0.7);
    // A nice high arc that you can follow with your eyes.
    this.vel.copy(dir).multiplyScalar(11.5);
    this.vel.y += 4.5;
    this.active = true;
    this.carried = false;
    this.restTime = 0;
    this.age = 0;
    this.trailPts.length = 0;
  }

  // boxesNear(region) lists the solid boxes ([x0, y0, z0, x1, y1, z1]) around a region.
  update(dt, boxesNear) {
    const flying = this.active && !this.carried;
    this.mesh.visible = flying;
    if (!flying) {
      this.trail.count = 0;
      this.shadow.visible = false;
      return;
    }
    this.age += dt;
    this.onGround = false;
    // Fast balls move in small steps so they can't pass through thin things.
    const steps = Math.min(8, Math.max(1, Math.ceil((this.vel.length() * dt) / 0.12)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vel.y -= BALL_GRAVITY * h;
      for (const axis of AXES) this.move(axis, this.vel[axis] * h, boxesNear);
    }
    if (this.onGround) {
      // Rolling slows down bit by bit.
      const k = Math.exp(-1.4 * dt);
      this.vel.x *= k;
      this.vel.z *= k;
    }
    const still = this.onGround && this.vel.lengthSq() < 0.4;
    this.restTime = still ? this.restTime + dt : 0;

    // Spin with the motion, and squash flat for a moment after a bounce.
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this.vel.z * dt / BALL_R * 0.5;
    this.mesh.rotation.z -= this.vel.x * dt / BALL_R * 0.5;
    this.squash = Math.max(0, this.squash - dt * 6);
    const sq = 1 - this.squash * 0.35, wide = 1 + this.squash * 0.2;
    this.mesh.scale.set(this.squashAxis === 0 ? sq : wide, this.squashAxis === 1 ? sq : wide, this.squashAxis === 2 ? sq : wide);

    // Trail: remember where it has been, while it's going fast.
    if (this.vel.lengthSq() > 9) this.trailPts.unshift(this.pos.clone());
    else this.trailPts.pop();
    if (this.trailPts.length > TRAIL) this.trailPts.length = TRAIL;
    this.trail.count = this.trailPts.length;
    this.trailPts.forEach((p, i) => {
      const size = BALL_R * 0.85 * (1 - i / TRAIL);
      this.trail.setMatrixAt(i, this.matrix.makeScale(size, size, size).setPosition(p));
    });
    this.trail.instanceMatrix.needsUpdate = true;

    // Shadow: on whatever is below the ball.
    const below = [this.pos.x - 0.01, this.pos.y - 20, this.pos.z - 0.01, this.pos.x + 0.01, this.pos.y, this.pos.z + 0.01];
    let floor = -Infinity;
    for (const b of boxesNear(below)) {
      if (b[0] <= this.pos.x && b[3] >= this.pos.x && b[2] <= this.pos.z && b[5] >= this.pos.z && b[4] <= this.pos.y) floor = Math.max(floor, b[4]);
    }
    const height = this.pos.y - floor;
    this.shadow.visible = floor > -Infinity && height < 15;
    if (this.shadow.visible) {
      this.shadow.position.set(this.pos.x, floor + 0.02, this.pos.z);
      this.shadow.scale.setScalar(BALL_R * (1.1 + height * 0.08));
      this.shadow.material.opacity = 0.35 / (1 + height * 0.25);
    }
  }

  // Moves along one axis, bouncing off the first solid thing in the way.
  move(axis, d, boxesNear) {
    if (d === 0) return;
    const a = AXIS[axis], r = BALL_R, p = this.pos;
    const me = [p.x - r, p.y - r, p.z - r, p.x + r, p.y + r, p.z + r];
    const region = me.slice();
    if (d > 0) region[a + 3] += d;
    else region[a] += d;
    const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
    let allowed = d;
    for (const b of boxesNear(region)) {
      if (b[o1] >= me[o1 + 3] || b[o1 + 3] <= me[o1] || b[o2] >= me[o2 + 3] || b[o2 + 3] <= me[o2]) continue;
      if (d > 0 && b[a] >= me[a + 3] - 1e-4) allowed = Math.min(allowed, b[a] - me[a + 3]);
      else if (d < 0 && b[a + 3] <= me[a] + 1e-4) allowed = Math.max(allowed, b[a + 3] - me[a]);
    }
    p[axis] += allowed;
    if (allowed === d) return;
    // Bounce! Faster hits bounce back harder (but always lose some speed).
    const speed = Math.abs(this.vel[axis]);
    this.vel[axis] *= -0.62;
    const rub = axis === 'y' ? 0.88 : 0.9;
    for (const other of AXES) if (other !== axis) this.vel[other] *= rub;
    if (axis === 'y' && d < 0) {
      this.onGround = true;
      if (Math.abs(this.vel.y) < 1.2) this.vel.y = 0; // too slow to bounce: start rolling
    }
    if (speed > 2) {
      this.squash = Math.min(1, speed / 10);
      this.squashAxis = a;
      this.onBounce?.(p, Math.min(1, speed / 12), axis);
    }
  }

  get resting() {
    return this.restTime > 0.3 || this.age > 10;
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

  // owner: { pos, yaw, speed }. reachable: whether the pet can find a way to where it's
  // going. Returns where to go, how fast, and what the pet is doing.
  think(dt, owner, petPos, ball, reachable = true) {
    this.timer -= dt;
    this.unreach = reachable ? 0 : (this.unreach || 0) + dt;
    this.happy = Math.max(0, this.happy - dt);
    this.idle = owner.speed < 0.2 ? this.idle + dt : 0;
    const behind = () => {
      const sin = Math.sin(owner.yaw), cos = Math.cos(owner.yaw);
      return new THREE.Vector3(owner.pos.x + cos * 0.9 + sin * 0.7, owner.pos.y, owner.pos.z - sin * 0.9 + cos * 0.7);
    };

    if (ball?.active && !ball.carried && this.state !== 'return' && this.state !== 'fetch') {
      // Spotted the ball! A moment to watch where it's going, then off it runs.
      this.state = 'fetch';
      this.react = 0.3 + Math.random() * 0.4;
      this.chase = 1.5;
      this.topSpeed = 6.2 + Math.random() * 1.8;
      this.aim = null;
      this.aimTimer = 0;
      this.missTimer = 0;
      this.unreach = 0;
    }
    if (this.state === 'fetch') {
      if (!ball?.active) this.state = 'follow';
      else if (this.unreach > 4 && ball.resting) {
        // It can't find a way to the ball (on a roof with no way up?): it gives up.
        this.state = 'follow';
        this.unreach = 0;
        return { goal: null, action: PET_IDLE, giveUp: 'ball', look: ball.pos };
      } else {
        this.react -= dt;
        if (this.react > 0) return { goal: null, action: PET_IDLE, look: ball.pos };
        // It only checks where the ball is every so often (and not exactly), so it runs past
        // it, swings round and has another go, like a real puppy.
        this.aimTimer -= dt;
        if (!this.aim || this.aimTimer <= 0) {
          this.aimTimer = 0.2 + Math.random() * 0.2;
          this.aim = ball.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
        }
        this.chase = Math.min(this.topSpeed, this.chase + dt * 7); // picks up speed
        this.missTimer -= dt;
        const reach = Math.hypot(petPos.x - ball.pos.x, petPos.z - ball.pos.z), high = ball.pos.y - petPos.y;
        if (this.missTimer <= 0 && reach < 0.75 && high < 0.8) {
          // A slow ball on the ground is easy to grab; a fast or bouncing one gets away
          // about half the time (a skid, and it tries again).
          const easy = Math.hypot(ball.vel.x, ball.vel.z) < 2.5 && high < 0.45;
          if (easy || Math.random() < 0.45) {
            ball.carried = true;
            this.state = 'return';
          } else {
            this.missTimer = 0.7;
            this.chase *= 0.4;
          }
        }
        if (this.state === 'fetch') return { goal: this.aim, speed: this.chase, action: PET_MOVING, far: 60, turnRate: 5 };
      }
    }
    if (this.state === 'return') {
      const front = new THREE.Vector3(owner.pos.x - Math.sin(owner.yaw) * 1.1, owner.pos.y, owner.pos.z - Math.cos(owner.yaw) * 1.1);
      if (this.unreach > 5) {
        // It can't find a way back to you: it waits where it is (and you get the ball back).
        this.state = 'follow';
        this.unreach = 0;
        return { goal: null, action: PET_IDLE, giveUp: 'return', look: owner.pos };
      }
      if (petPos.distanceTo(front) < 0.6) {
        ball.active = ball.carried = false; // dropped at your feet: throw it again!
        this.state = 'follow';
        this.cheer();
        return { goal: null, action: PET_HAPPY, dropped: true };
      }
      return { goal: front, speed: 5.5, action: PET_CARRYING, far: 60, turnRate: 6 };
    }
    if (this.happy > 0) return { goal: null, action: PET_HAPPY };

    // Wander a little when you stand still for a while.
    if (this.idle > 3 && owner.pos.distanceTo(petPos) < 7 && reachable) {
      if (this.state !== 'wander' || this.timer <= 0) {
        this.state = 'wander';
        const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3;
        this.goal = new THREE.Vector3(owner.pos.x + Math.cos(a) * r, owner.pos.y, owner.pos.z + Math.sin(a) * r);
        this.timer = 3 + Math.random() * 3;
      }
      return { goal: this.goal, speed: 1.6, action: PET_MOVING, sniff: petPos.distanceTo(this.goal) < 0.4, level: true };
    }
    this.state = 'follow';
    // Can't get to you (you're up on a roof with no way up)? It waits as close as it can get,
    // looking up at you and whining now and then.
    if (!reachable) {
      let whine = false;
      this.whine = (this.whine ?? 2) - dt;
      if (this.whine <= 0) {
        this.whine = 6 + Math.random() * 4;
        whine = true;
      }
      return { goal: behind(), speed: null, action: PET_MOVING, look: owner.pos, whine };
    }
    return { goal: behind(), speed: null, action: PET_MOVING };
  }
}
