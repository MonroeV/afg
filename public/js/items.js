// Hotbar items: every block, the hammer, cars and fireworks.
import * as THREE from 'three';
import { BLOCKS, BLOCK_IDS } from './shared/blocks.js';
import { CAR_SPECS, buildCarModel } from './cars.js';
import { blockMaterial } from './world.js';

export const HAMMER = 'hammer';
export const FIREWORKS = 'fireworks';
export const CAR_ITEMS = ['car', 'police', 'monster'];
export const ALL_ITEMS = [HAMMER, FIREWORKS, ...CAR_ITEMS, ...BLOCK_IDS];
export const DEFAULT_HOTBAR = [HAMMER, 5, 6, 9, 21, 18, 'car', FIREWORKS, 19];

export const isBlockItem = item => typeof item === 'number';
export const isCarItem = item => CAR_ITEMS.includes(item);

export function itemName(item) {
  if (item === HAMMER) return 'Hammer';
  if (item === FIREWORKS) return 'Fireworks';
  if (isCarItem(item)) return CAR_SPECS[item].name;
  return BLOCKS[item].name;
}

// Draws a small icon for the hotbar and the item menu.
export function makeIcon(item, textures) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (item === HAMMER) {
    ctx.translate(32, 32);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#7a4e2a';
    ctx.fillRect(-4, -8, 8, 34);
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(-4, 18, 8, 8);
    const g = ctx.createLinearGradient(0, -24, 0, -8);
    g.addColorStop(0, '#d6dbe0');
    g.addColorStop(1, '#7f8790');
    ctx.fillStyle = g;
    ctx.fillRect(-18, -24, 36, 16);
    ctx.fillStyle = '#5c636b';
    ctx.fillRect(-18, -12, 36, 4);
    return canvas;
  }
  if (item === FIREWORKS) {
    ctx.translate(32, 34);
    ctx.rotate(0.5);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(-7, -12, 14, 26);
    ctx.fillStyle = '#fdd835';
    ctx.fillRect(-7, -4, 14, 5);
    ctx.fillStyle = '#1e88e5';
    ctx.beginPath();
    ctx.moveTo(-9, -12); ctx.lineTo(9, -12); ctx.lineTo(0, -26); ctx.fill();
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(-1, 14, 2, 12);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [x, y, c] of [[12, 10, '#fdd835'], [52, 14, '#ec407a'], [50, 50, '#26c6da'], [10, 50, '#7cb342']]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }
  if (isCarItem(item)) {
    const body = item === 'police' ? '#f5f5f5' : item === 'monster' ? '#43a047' : '#e53935';
    const wheelR = item === 'monster' ? 11 : 7;
    const baseY = item === 'monster' ? 30 : 38;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(4, baseY - 12, 56, 14, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(16, baseY - 24, 30, 14, 5);
    ctx.fill();
    ctx.fillStyle = '#9fd3ff';
    ctx.fillRect(20, baseY - 21, 10, 9);
    ctx.fillRect(33, baseY - 21, 10, 9);
    if (item === 'police') {
      ctx.fillStyle = '#e53935'; ctx.fillRect(24, baseY - 29, 8, 5);
      ctx.fillStyle = '#1e88e5'; ctx.fillRect(32, baseY - 29, 8, 5);
      ctx.fillStyle = '#111'; ctx.fillRect(4, baseY - 6, 56, 4);
    }
    ctx.fillStyle = '#222';
    for (const x of [16, 48]) {
      ctx.beginPath();
      ctx.arc(x, baseY + 3 + (item === 'monster' ? 8 : 0), wheelR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ccc';
    for (const x of [16, 48]) {
      ctx.beginPath();
      ctx.arc(x, baseY + 3 + (item === 'monster' ? 8 : 0), wheelR * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

  const def = BLOCKS[item];
  const shape = def.shape || 'cube';
  if (shape === 'door' || shape === 'plant') {
    // Doors and flowers are drawn flat, straight on.
    const img = textures[shape === 'door' ? def.tex.bottom : def.tex].canvas;
    if (shape === 'door') {
      ctx.drawImage(textures[def.tex.top].canvas, 18, 2, 28, 30);
      ctx.drawImage(img, 18, 32, 28, 30);
    } else {
      ctx.drawImage(img, 4, 4, 56, 56);
    }
    return canvas;
  }
  const tex = def.tex;
  const top = textures[typeof tex === 'string' ? tex : tex.top].canvas;
  const side = textures[typeof tex === 'string' ? tex : tex.side].canvas;
  const s = 22; // half-width of the cube's top diamond
  const cx = 32, cy = shape === 'flat' ? 26 : 18;
  const depth = shape === 'flat' ? 4 : s;
  const face = (img, a, b, c, d, e, f, dim) => {
    ctx.save();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0, 1, 1);
    if (dim) {
      ctx.fillStyle = `rgba(0,0,0,${dim})`;
      ctx.fillRect(0, 0, 1, 1);
    }
    ctx.restore();
  };
  // Each face maps the texture onto a unit square, then skews it into place.
  face(top, s, -s / 2, s, s / 2, cx - s, cy, 0);
  face(side, s, s / 2, 0, depth, cx - s, cy, 0.25);
  face(side, s, -s / 2, 0, depth, cx, cy + s / 2, 0.45);
  return canvas;
}

// The item held in the bottom-right of the screen.
export class ViewModel {
  constructor() {
    this.materials = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x554433, 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 1.8);
    this.sun.position.set(1, 2, 1);
    this.scene.add(this.sun);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.models = {};
    this.swingT = 1;
    this.switchT = 1;
    this.bobT = 0;
    this.item = null;
  }

  model(item) {
    if (this.models[item]) return this.models[item];
    let obj;
    if (item === HAMMER) {
      obj = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2a, roughness: 0.7 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.35, metalness: 0.8 });
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), wood);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.09), steel);
      head.position.y = 0.25;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 }));
      grip.position.y = -0.2;
      obj.add(handle, head, grip);
      obj.scale.setScalar(0.6);
      obj.position.set(0.04, -0.02, -0.05);
      obj.rotation.set(0.35, 0.5, 0.25);
    } else if (item === FIREWORKS) {
      obj = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0xe53935 }));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x1e88e5 }));
      cone.position.y = 0.19;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0xfdd835 }));
      obj.add(tube, cone, band);
      obj.scale.setScalar(0.75);
      obj.rotation.set(0.2, 0, -0.3);
    } else if (isCarItem(item)) {
      obj = buildCarModel(item, item === 'police' ? '#f5f5f5' : item === 'monster' ? '#43a047' : '#e53935').group;
      obj.scale.setScalar(0.08);
      obj.rotation.set(0.25, 0.8, 0);
      obj.position.y = -0.05;
    } else {
      const shape = BLOCKS[item].shape || 'cube';
      const mat = blockMaterial(this.materials, item);
      const geo = shape === 'flat' ? new THREE.BoxGeometry(0.32, 0.03, 0.32)
        : shape === 'door' ? new THREE.BoxGeometry(0.2, 0.4, 0.04)
          : shape === 'plant' ? new THREE.PlaneGeometry(0.35, 0.35) : new THREE.BoxGeometry(0.32, 0.32, 0.32);
      obj = new THREE.Mesh(geo, mat);
      obj.rotation.set(shape === 'flat' ? 0.5 : 0, Math.PI / 4, 0);
    }
    this.models[item] = obj;
    return obj;
  }

  setItem(item) {
    if (item === this.item || !this.materials) return;
    this.item = item;
    this.holder.clear();
    this.holder.add(this.model(item));
    this.switchT = 0;
  }

  swing() {
    this.swingT = 0;
  }

  update(dt, moving, aspect, envMap, dayK) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.05 + 0.25 * dayK;
    this.hemi.intensity = 0.25 + 0.45 * dayK;
    this.sun.intensity = 0.4 + 1.4 * dayK;
    this.swingT = Math.min(1, this.swingT + dt * 4.5);
    this.switchT = Math.min(1, this.switchT + dt * 5);
    if (moving) this.bobT += dt * 9;

    const s = Math.sin(this.swingT * Math.PI);
    const bob = moving ? Math.sin(this.bobT) * 0.012 : 0;
    const bobY = moving ? Math.abs(Math.cos(this.bobT)) * 0.012 : 0;
    const drop = (1 - this.switchT) * 0.3;
    this.holder.position.set(0.38 + bob - s * 0.1, -0.32 + bobY - drop + s * 0.04, -0.6 - s * 0.12);
    this.holder.rotation.set(-s * 0.9, 0, -s * 0.2);
  }
}
