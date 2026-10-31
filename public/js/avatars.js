// Other players: a customizable character with a floating name tag.
import * as THREE from 'three';
import { buildCharacter, animateCharacter, buildPet, animatePet } from './character.js';
import { SEAT_SCALE } from './cars.js';
import { PET_HAPPY, PET_CARRYING } from './pets.js';

function nameTag(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px system-ui, sans-serif';
  const w = Math.min(248, ctx.measureText(name).width + 34);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 10, w, 44, 12);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect((256 - w) / 2 + 10, 27, 10, 10);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128 + 7, 33, 220);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// What a player is doing, sent with their position: bits of `flags`. The top 24 bits are
// the color of the balloon they're holding.
export const FLAG = { sleeping: 1, sitting: 2, crouching: 4, balloon: 8 };

// A character in the world that can walk, dance, wave and sit in cars.
export class Avatar {
  constructor(scene, info, { tag = true } = {}) {
    this.scene = scene;
    this.id = info.id;
    this.name = info.name;
    this.root = new THREE.Group();
    this.pos = new THREE.Vector3().fromArray(info.pos || [0, 0, 0]);
    this.target = this.pos.clone();
    this.yaw = this.targetYaw = info.rot?.[0] || 0;
    this.pitch = this.targetPitch = info.rot?.[1] || 0;
    this.walk = 0;
    this.speed = 0;
    this.dance = 0;
    this.wave = 0;
    this.swing = 1;
    this.seat = null; // { position, yaw } while sitting in a car
    this.sitting = false; // on a chair or couch
    this.crouching = false;
    this.balloon = null; // the color of the balloon they're holding, if they are
    if (tag) {
      this.tag = nameTag(info.name, info.look?.shirtColor || '#fff');
      this.tag.position.y = 2.35;
      this.root.add(this.tag);
    }
    this.setLook(info.look);
    this.root.position.copy(this.pos);
    scene.add(this.root);
  }

  get color() {
    return this.character.look.shirtColor;
  }

  setLook(look) {
    if (this.character) {
      this.root.remove(this.character.group);
      this.character.dispose();
    }
    this.character = buildCharacter(look);
    this.root.add(this.character.group);
    // The pet lives in the world (not attached to us) so it can follow along behind.
    const { pet, petColor } = this.character.look;
    if (this.pet && (this.pet.kind !== pet || this.petColor !== petColor)) {
      this.scene.remove(this.pet.group);
      this.pet.dispose();
      this.pet = null;
    }
    if (!this.pet && pet !== 'none') {
      this.pet = buildPet(pet, petColor);
      this.petColor = petColor;
      this.pet.pos = this.pos.clone();
      this.pet.target = this.pos.clone();
      this.pet.yaw = this.pet.targetYaw = this.yaw;
      this.pet.action = 0;
      // A ball the pet can carry in its mouth.
      this.pet.ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe53935 }));
      this.pet.ball.position.set(0, -0.08, -0.2);
      this.pet.ball.visible = false;
      this.pet.head.add(this.pet.ball);
      this.scene.add(this.pet.group);
    }
  }

  // A ball this (other) player threw, as their game reports it.
  updateRemoteBall(dt) {
    const b = this.remoteBall;
    if (!Array.isArray(b)) {
      if (this.ballMesh) this.ballMesh.visible = false;
      return;
    }
    if (!this.ballMesh) {
      this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe53935, emissive: 0x3a0000, roughness: 0.4 }));
      this.ballMesh.castShadow = true;
      this.scene.add(this.ballMesh);
      this.ballMesh.position.fromArray(b);
    }
    this.ballMesh.visible = true;
    this.ballMesh.position.lerp(new THREE.Vector3().fromArray(b), Math.min(1, dt * 12));
  }

  // Where our pet is, for sending to other players: [x, y, z, yaw, action].
  petState() {
    const p = this.pet;
    if (!p) return 0;
    const r = v => Math.round(v * 100) / 100;
    return [r(p.pos.x), r(p.pos.y), r(p.pos.z), r(p.yaw), p.action];
  }

  // Another player's pet, as they sent it.
  setPetState(state) {
    if (!this.pet || !Array.isArray(state)) return;
    this.pet.target.set(state[0], state[1], state[2]);
    this.pet.targetYaw = state[3];
    this.pet.action = state[4];
  }

  setName(name) {
    if (!this.tag || name === this.name) return;
    this.name = name;
    this.root.remove(this.tag);
    this.tag.material.map.dispose();
    this.tag = nameTag(name, this.character.look.shirtColor);
    this.tag.position.y = 2.35;
    this.root.add(this.tag);
  }

  updatePet(dt, time) {
    const pet = this.pet;
    if (!pet) return;
    pet.group.visible = !this.seat;
    if (this.seat) {
      pet.pos.copy(this.pos);
      return;
    }
    let moving = 0;
    if (this.brain) {
      // Our own pet thinks for itself.
      const plan = this.brain.think(dt, { pos: this.pos, yaw: this.yaw, speed: this.speed }, pet.pos, this.ball);
      pet.action = plan.action;
      if (plan.dropped) this.onPetEvent?.('dropped');
      if (plan.goal) {
        const to = plan.goal.clone().sub(pet.pos);
        const dist = Math.hypot(to.x, to.z);
        if (dist > (plan.far ?? 14)) pet.pos.copy(plan.goal); // too far behind: catch up
        else if (dist > 0.3) {
          const speed = plan.speed ?? Math.max(3, dist * 2.5);
          if (plan.turnRate) {
            // Running like an animal: it can only turn so fast (so it swings wide and
            // overshoots), and it slows down for sharp turns.
            let dy = Math.atan2(-to.x, -to.z) - pet.yaw;
            dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            pet.yaw += Math.max(-plan.turnRate * dt, Math.min(plan.turnRate * dt, dy));
            const step = Math.min(dist, speed * dt * Math.max(0.25, Math.cos(dy)));
            pet.pos.x -= Math.sin(pet.yaw) * step;
            pet.pos.z -= Math.cos(pet.yaw) * step;
          } else {
            const step = Math.min(dist, speed * dt);
            pet.pos.x += (to.x / dist) * step;
            pet.pos.z += (to.z / dist) * step;
            pet.yaw = Math.atan2(-to.x, -to.z);
          }
          moving = Math.min(1, dist);
        } else if (!plan.sniff) {
          let dy = this.yaw - pet.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          pet.yaw += dy * Math.min(1, dt * 3);
        }
      }
      if (!plan.goal && plan.look) {
        // Watching something (the ball flying off).
        let dy = Math.atan2(-(plan.look.x - pet.pos.x), -(plan.look.z - pet.pos.z)) - pet.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        pet.yaw += dy * Math.min(1, dt * 8);
      }
      const ground = this.groundAt ? this.groundAt(pet.pos.x, pet.pos.z, this.pos.y) : this.pos.y;
      pet.pos.y += (ground - pet.pos.y) * Math.min(1, dt * 10);
      pet.sniff = plan.sniff;
    } else {
      // Someone else's pet: glide to where their game says it is.
      const before = pet.pos.clone();
      if (pet.pos.distanceTo(pet.target) > 14) pet.pos.copy(pet.target);
      pet.pos.lerp(pet.target, Math.min(1, dt * 10));
      let dy = pet.targetYaw - pet.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      pet.yaw += dy * Math.min(1, dt * 10);
      moving = Math.min(1, before.distanceTo(pet.pos) / Math.max(dt, 1e-3) / 3);
    }
    pet.group.position.copy(pet.pos);
    pet.group.rotation.y = pet.yaw;
    pet.ball.visible = pet.action === PET_CARRYING;
    animatePet(pet, moving, time);
    if (pet.action === PET_HAPPY) {
      // Jump for joy and spin around.
      pet.body.position.y += Math.abs(Math.sin(time * 9)) * 0.35;
      pet.group.rotation.y = pet.yaw + time * 6;
    } else if (pet.sniff) {
      pet.head.rotation.x = -0.5 + Math.sin(time * 12) * 0.08;
    }
  }

  setState(x, y, z, yaw, pitch) {
    this.target.set(x, y, z);
    this.targetYaw = yaw;
    this.targetPitch = pitch;
  }

  emote(kind) {
    if (kind === 'dance') this.dance = 4;
    if (kind === 'wave') this.wave = 2;
  }

  update(dt, time) {
    const k = 1 - Math.exp(-12 * dt);
    const before = this.pos.clone();
    if (this.seat) {
      this.pos.copy(this.seat.position);
      this.yaw = this.seat.yaw;
    } else if (this.snap) {
      // Our own body follows the camera exactly.
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
    } else {
      // Glide to where they are, but jump straight there after a teleport.
      if (this.pos.distanceToSquared(this.target) > 100) this.pos.copy(this.target);
      this.pos.lerp(this.target, k);
      let dy = this.targetYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * k;
    }
    this.pitch += (this.targetPitch - this.pitch) * k;

    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    this.speed += (Math.min(moved / 6, 1) - this.speed) * Math.min(1, dt * 10);
    this.walk += dt * Math.min(moved, 10) * 1.6;
    this.dance = Math.max(0, this.dance - dt);
    this.wave = Math.max(0, this.wave - dt);
    if (this.speed > 0.3 && !this.seat) this.dance = 0;

    this.root.position.copy(this.pos);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.lying ? Math.PI / 2 : 0; // asleep in bed, on our back
    this.root.scale.setScalar(this.seat ? SEAT_SCALE : 1);
    if (this.tag) {
      this.tag.visible = !this.lying;
      this.tag.position.y = this.crouching ? 2.05 : 2.35;
    }
    this.updateRemoteBall(dt);
    this.updateBalloon(time);
    const sitting = !!this.seat || this.sitting;
    animateCharacter(this.character, {
      walk: this.walk, speed: sitting || this.lying ? 0 : this.speed, pitch: this.lying ? 0 : this.pitch, time,
      dance: this.dance, wave: this.wave, swing: this.swing, sitting,
      flying: this.flying, crouch: this.crouching && !sitting,
    });
    this.updatePet(dt, time);
  }

  // A balloon on a string, held up in the right hand.
  updateBalloon(time) {
    if (!this.balloon) {
      if (this.balloonGroup) this.balloonGroup.visible = false;
      return;
    }
    if (!this.balloonGroup) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ roughness: 0.25 }));
      ball.position.y = 1.7;
      ball.castShadow = true;
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.4, 4).translate(0, 0.7, 0), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
      g.add(ball, string);
      g.position.set(0.38, 1.05, -0.1);
      this.root.add(g);
      this.balloonGroup = g;
      this.balloonBall = ball;
    }
    this.balloonGroup.visible = true;
    this.balloonBall.material.color.set(this.balloon);
    this.balloonGroup.rotation.z = Math.sin(time * 1.3 + this.id) * 0.08;
    this.balloonGroup.rotation.x = Math.sin(time * 0.9 + this.id * 2) * 0.06 + this.speed * 0.25;
  }

  dispose() {
    this.scene.remove(this.root);
    this.character.dispose();
    if (this.pet) {
      this.scene.remove(this.pet.group);
      this.pet.dispose();
    }
    if (this.ballMesh) this.scene.remove(this.ballMesh);
    this.tag?.material.map.dispose();
  }
}

export class Avatars {
  constructor(scene) {
    this.scene = scene;
    this.list = new Map();
  }

  add(info) {
    this.remove(info.id);
    this.list.set(info.id, new Avatar(this.scene, info));
  }

  remove(id) {
    this.list.get(id)?.dispose();
    this.list.delete(id);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }

  applyStates(list, myId) {
    for (const [id, x, y, z, yaw, pitch, pet, ball, flags] of list) {
      const a = this.list.get(id);
      if (id === myId || !a) continue;
      a.setState(x, y, z, yaw, pitch);
      a.setPetState(pet);
      a.remoteBall = ball;
      a.lying = !!(flags & FLAG.sleeping);
      a.sitting = !!(flags & FLAG.sitting);
      a.crouching = !!(flags & FLAG.crouching);
      a.balloon = flags & FLAG.balloon ? `#${((flags >>> 8) & 0xffffff).toString(16).padStart(6, '0')}` : null;
    }
  }

  update(dt, time) {
    for (const a of this.list.values()) a.update(dt, time);
  }
}
