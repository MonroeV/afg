// Other players: a blocky robot builder with a floating name tag.
import * as THREE from 'three';
import { EYE_HEIGHT } from './player.js';

function nameTag(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px system-ui, sans-serif';
  const w = Math.min(248, ctx.measureText(name).width + 28);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 10, w, 44, 12);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect((256 - w) / 2 + 10, 28, 8, 8);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128 + 6, 33, 220);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

class Avatar {
  constructor(scene, info) {
    this.scene = scene;
    this.name = info.name;
    this.color = info.color;
    const body = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.5, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.3 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.6, emissive: 0x2288ff, emissiveIntensity: 0.6 });

    this.group = new THREE.Group();
    this.legL = box(0.24, 0.75, 0.26, dark, 0, -0.375, 0);
    this.legR = this.legL.clone();
    this.legPivotL = new THREE.Group(); this.legPivotL.position.set(-0.14, 0.75, 0); this.legPivotL.add(this.legL);
    this.legPivotR = new THREE.Group(); this.legPivotR.position.set(0.14, 0.75, 0); this.legPivotR.add(this.legR);
    const torso = box(0.56, 0.7, 0.32, body, 0, 1.1, 0);
    this.armL = box(0.18, 0.65, 0.2, body, 0, -0.3, 0);
    this.armR = this.armL.clone();
    this.armPivotL = new THREE.Group(); this.armPivotL.position.set(-0.38, 1.4, 0); this.armPivotL.add(this.armL);
    this.armPivotR = new THREE.Group(); this.armPivotR.position.set(0.38, 1.4, 0); this.armPivotR.add(this.armR);
    this.head = new THREE.Group();
    this.head.position.y = EYE_HEIGHT - 0.05;
    this.head.add(box(0.48, 0.42, 0.44, body, 0, 0.05, 0));
    this.head.add(box(0.4, 0.14, 0.05, visor, 0, 0.08, -0.22));
    this.group.add(this.legPivotL, this.legPivotR, torso, this.armPivotL, this.armPivotR, this.head);

    this.tag = nameTag(info.name, info.color);
    this.tag.position.y = 2.2;
    this.group.add(this.tag);

    this.pos = new THREE.Vector3().fromArray(info.pos || [0, 0, 0]);
    this.target = this.pos.clone();
    this.yaw = this.targetYaw = info.rot?.[0] || 0;
    this.pitch = this.targetPitch = info.rot?.[1] || 0;
    this.walk = 0;
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  setState(x, y, z, yaw, pitch) {
    this.target.set(x, y, z);
    this.targetYaw = yaw;
    this.targetPitch = pitch;
  }

  update(dt) {
    const k = 1 - Math.exp(-12 * dt);
    const before = this.pos.clone();
    this.pos.lerp(this.target, k);
    let dy = this.targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * k;
    this.pitch += (this.targetPitch - this.pitch) * k;

    const speed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    this.walk += dt * Math.min(speed, 10) * 1.6;
    const swing = Math.sin(this.walk) * Math.min(speed / 6, 1) * 0.8;
    this.legPivotL.rotation.x = swing;
    this.legPivotR.rotation.x = -swing;
    this.armPivotL.rotation.x = -swing;
    this.armPivotR.rotation.x = swing;

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.head.rotation.x = this.pitch;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      o.geometry?.dispose();
      if (o.material?.map) o.material.map.dispose();
    });
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

  update(dt) {
    for (const a of this.list.values()) a.update(dt);
  }
}
