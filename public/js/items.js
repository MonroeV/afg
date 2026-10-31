// Hotbar items: every block, the hammer, cars and fireworks.
import * as THREE from 'three';
import { BLOCKS, BLOCK_IDS, PAINT_COLORS } from './shared/blocks.js';
import { blockMaterial } from './world.js';
import { modelGeometry, modelMaterials } from './models.js';

export const HAMMER = 'hammer';
export const FIREWORKS = 'fireworks';
export const BALL = 'ball';
export const CLAIM = 'claim';
export const BRUSH = 'brush';
export const SCRAPER = 'scraper';
export const LADDER = 53;
export const TOOLS = [HAMMER, BRUSH, SCRAPER, BALL, FIREWORKS, CLAIM];
export const ALL_ITEMS = [...TOOLS, ...BLOCK_IDS];
// The hammer always lives in slot 1.
export const DEFAULT_HOTBAR = [HAMMER, 5, 6, 9, 21, LADDER, BRUSH, FIREWORKS, CLAIM];

export const isBlockItem = item => typeof item === 'number';

export function itemName(item) {
  if (item === HAMMER) return 'Hammer';
  if (item === FIREWORKS) return 'Fireworks';
  if (item === BALL) return 'Pet Ball';
  if (item === CLAIM) return 'Land Flag';
  if (item === BRUSH) return 'Paint Brush';
  if (item === SCRAPER) return 'Paint Scraper';
  return BLOCKS[item].name;
}

// Draws a small icon for the hotbar and the item menu. `paint` is the brush's color.
export function makeIcon(item, textures, paint = 1) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (item === BRUSH || item === SCRAPER) {
    ctx.translate(32, 32);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#a0522d';
    ctx.fillRect(-4, 2, 8, 26);
    ctx.fillStyle = '#c0c4c8';
    ctx.fillRect(-7, -6, 14, 9);
    if (item === BRUSH) {
      ctx.fillStyle = PAINT_COLORS[paint] || '#e53935';
      ctx.beginPath();
      ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(6, -24); ctx.lineTo(0, -28); ctx.lineTo(-6, -24);
      ctx.fill();
    } else {
      ctx.fillStyle = '#dfe3e6';
      ctx.fillRect(-12, -26, 24, 20);
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(-12, -26, 24, 3);
    }
    return canvas;
  }

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
  if (item === BALL) {
    const g = ctx.createRadialGradient(26, 24, 2, 32, 32, 22);
    g.addColorStop(0, '#ff8a80');
    g.addColorStop(1, '#c62828');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fdd835';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(32, 32, 20, -0.4, 0.4 + Math.PI);
    ctx.stroke();
    return canvas;
  }
  if (item === CLAIM) {
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(18, 8, 5, 50);
    ctx.fillStyle = '#43a047';
    ctx.beginPath();
    ctx.moveTo(23, 10); ctx.lineTo(54, 20); ctx.lineTo(23, 32); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('★', 28, 25);
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(10, 54, 22, 6);
    return canvas;
  }

  const def = BLOCKS[item];
  const shape = def.shape || 'cube';
  if (shape === 'model') {
    ctx.drawImage(modelIcon(def), 0, 0, size, size);
    return canvas;
  }
  if (shape === 'ladder') {
    ctx.fillStyle = '#9c6b3f';
    ctx.fillRect(16, 4, 6, 56);
    ctx.fillRect(42, 4, 6, 56);
    for (let y = 12; y < 60; y += 12) ctx.fillRect(16, y, 32, 5);
    return canvas;
  }
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

// Lamp models get a tiny 3D picture as their icon.
let iconKit = null;
function modelIcon(def) {
  if (!iconKit) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(64, 64);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2, 3, 2);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(1.9, 1.5, 2.4);
    camera.lookAt(0.5, 0.5, 0.5);
    iconKit = { renderer, scene, camera };
  }
  const { renderer, scene, camera } = iconKit;
  const mats = modelMaterials(def.model);
  mats[1].color.multiplyScalar(1.6);
  const mesh = new THREE.Mesh(modelGeometry(def.model), mats);
  scene.add(mesh);
  renderer.render(scene, camera);
  scene.remove(mesh);
  return renderer.domElement;
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
    } else if (item === BALL) {
      obj = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 }));
      obj.add(new THREE.Mesh(new THREE.TorusGeometry(0.111, 0.012, 6, 24), new THREE.MeshStandardMaterial({ color: 0xfdd835 })));
      obj.position.y = 0.05;
    } else if (item === BRUSH || item === SCRAPER) {
      obj = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.7 });
      const metal = new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.8, roughness: 0.3 });
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.04).translate(0, -0.08, 0), wood));
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.05).translate(0, 0.07, 0), metal));
      if (item === BRUSH) {
        this.bristles = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.8 });
        obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.045).translate(0, 0.15, 0), this.bristles));
      } else {
        obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.01).translate(0, 0.16, 0), metal));
      }
      obj.rotation.set(0.4, 0.4, -0.3);
    } else if (item === CLAIM) {
      obj = new THREE.Group();
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x8d6e63 })));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0x43a047, side: THREE.DoubleSide }));
      flag.position.set(0.11, 0.2, 0);
      obj.add(flag);
      obj.rotation.set(0.2, 0.4, -0.2);
    } else {
      const shape = BLOCKS[item].shape || 'cube';
      if (shape === 'model') {
        obj = new THREE.Group();
        const mesh = new THREE.Mesh(modelGeometry(BLOCKS[item].model), this.materials[item]);
        mesh.scale.setScalar(0.4);
        mesh.position.set(-0.2, -0.25, -0.2);
        obj.add(mesh);
        obj.rotation.set(0.15, 0.6, 0);
        this.models[item] = obj;
        return obj;
      }
      const mat = blockMaterial(this.materials, item);
      const geo = shape === 'flat' ? new THREE.BoxGeometry(0.32, 0.03, 0.32)
        : shape === 'door' ? new THREE.BoxGeometry(0.2, 0.4, 0.04)
          : shape === 'plant' ? new THREE.PlaneGeometry(0.35, 0.35) : new THREE.BoxGeometry(0.32, 0.32, 0.32);
      obj = new THREE.Mesh(geo, mat);
      obj.rotation.set(shape === 'flat' ? 0.5 : 0, Math.PI / 4, 0);
    }
    this.models[item] = obj;
    if (item === BRUSH && this.paintColor) this.bristles.color.set(this.paintColor);
    return obj;
  }

  // The color on the end of the paint brush.
  setPaint(color) {
    this.paintColor = color;
    this.bristles?.color.set(color);
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
