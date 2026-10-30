// Hotbar items: every block, plus the hammer for breaking blocks.
import * as THREE from 'three';
import { BLOCKS, BLOCK_IDS } from './shared/blocks.js';

export const HAMMER = 'hammer';
export const ALL_ITEMS = [HAMMER, ...BLOCK_IDS];
export const DEFAULT_HOTBAR = [HAMMER, 1, 3, 5, 6, 7, 9, 18, 19];

export const itemName = item => (item === HAMMER ? 'Hammer' : BLOCKS[item].name);

// Draws a small isometric cube (or a hammer) for the hotbar and inventory.
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

  const tex = BLOCKS[item].tex;
  const top = textures[typeof tex === 'string' ? tex : tex.top].canvas;
  const side = textures[typeof tex === 'string' ? tex : tex.side].canvas;
  const s = 22; // half-width of the cube's top diamond
  const cx = 32, cy = 18;
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
  // Scale the 256px texture into a unit square via drawImage(img, 0,0,1,1).
  face(top, s, -s / 2, s, s / 2, cx - s, cy, 0);
  face(side, s, s / 2, 0, s, cx - s, cy, 0.25);
  face(side, s, -s / 2, 0, s, cx, cy + s / 2, 0.45);
  return canvas;
}

// The item held in the bottom-right of the screen.
export class ViewModel {
  constructor(materials) {
    this.materials = materials;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x554433, 0.7));
    const sun = new THREE.DirectionalLight(0xfff0dc, 1.8);
    sun.position.set(1, 2, 1);
    this.scene.add(sun);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.blockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32));
    this.hammer = this.buildHammer();
    this.swingT = 1;
    this.switchT = 1;
    this.bobT = 0;
    this.item = null;
  }

  buildHammer() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2a, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.35, metalness: 0.8 });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), wood);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.09), steel);
    head.position.y = 0.25;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 }));
    grip.position.y = -0.2;
    g.add(handle, head, grip);
    g.scale.setScalar(0.6);
    g.position.set(0.04, -0.02, -0.05);
    g.rotation.set(0.35, 0.5, 0.25);
    return g;
  }

  setItem(item) {
    if (item === this.item) return;
    this.item = item;
    this.holder.clear();
    if (item === HAMMER) {
      this.holder.add(this.hammer);
    } else {
      this.blockMesh.material = this.materials[item];
      this.blockMesh.rotation.set(0, Math.PI / 4, 0);
      this.holder.add(this.blockMesh);
    }
    this.switchT = 0;
  }

  swing() {
    this.swingT = 0;
  }

  update(dt, moving, aspect, envMap) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.3;
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
