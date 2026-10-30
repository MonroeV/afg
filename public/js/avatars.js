// Other players: a customizable character with a floating name tag.
import * as THREE from 'three';
import { buildCharacter, animateCharacter, buildPet, animatePet } from './character.js';
import { SEAT_SCALE } from './cars.js';

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
      this.pet.yaw = this.yaw;
      this.scene.add(this.pet.group);
    }
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
    // Trot to a spot just behind and beside the owner.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const target = new THREE.Vector3(this.pos.x + cos * 0.9 + sin * 0.7, this.pos.y, this.pos.z - sin * 0.9 + cos * 0.7);
    const toTarget = target.clone().sub(pet.pos);
    const dist = Math.hypot(toTarget.x, toTarget.z);
    if (dist > 14) pet.pos.copy(target);
    let moving = 0;
    if (dist > 0.35) {
      const step = Math.min(dist, Math.max(3, dist * 2.5) * dt);
      pet.pos.x += (toTarget.x / dist) * step;
      pet.pos.z += (toTarget.z / dist) * step;
      moving = Math.min(1, dist);
      pet.yaw = Math.atan2(-toTarget.x, -toTarget.z);
    } else {
      let dy = this.yaw - pet.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      pet.yaw += dy * Math.min(1, dt * 3);
    }
    pet.pos.y += (this.pos.y - pet.pos.y) * Math.min(1, dt * 8);
    pet.group.position.copy(pet.pos);
    pet.group.rotation.y = pet.yaw;
    animatePet(pet, moving, time);
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
    this.root.rotation.y = this.yaw;
    this.root.scale.setScalar(this.seat ? SEAT_SCALE : 1);
    animateCharacter(this.character, {
      walk: this.walk, speed: this.seat ? 0 : this.speed, pitch: this.pitch, time,
      dance: this.dance, wave: this.wave, swing: this.swing, sitting: !!this.seat,
      flying: this.flying,
    });
    this.updatePet(dt, time);
  }

  dispose() {
    this.scene.remove(this.root);
    this.character.dispose();
    if (this.pet) {
      this.scene.remove(this.pet.group);
      this.pet.dispose();
    }
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
    for (const [id, x, y, z, yaw, pitch] of list) {
      if (id !== myId) this.list.get(id)?.setState(x, y, z, yaw, pitch);
    }
  }

  update(dt, time) {
    for (const a of this.list.values()) a.update(dt, time);
  }
}
