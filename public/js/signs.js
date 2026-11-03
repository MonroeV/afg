// What's written on signs: each sign's words are drawn on a little canvas and shown on the front
// of its board. (The board itself is drawn with the other blocks; see world.js.)
import * as THREE from 'three';
import { SIGN, blockId, blockMeta, itemOf } from './shared/blocks.js';

const W = 256, H = 190;
// Writing color for each board: dark on wood and white, white on green and blue.
const INK = ['#2b1a0c', '#1d1f24', '#ffffff', '#ffffff'];

export class SignTexts {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.texts = new Map(); // "x,y,z" -> what it says
    this.meshes = new Map(); // "x,y,z" -> the writing
    this.geometry = new THREE.PlaneGeometry(0.84, 0.62);
  }

  get(x, y, z) {
    return this.texts.get(`${x},${y},${z}`) || '';
  }

  load(list) {
    for (const k of [...this.texts.keys()]) this.drop(k);
    for (const [x, y, z, text] of list) this.set(x, y, z, text);
  }

  set(x, y, z, text) {
    const k = `${x},${y},${z}`;
    if (text) this.texts.set(k, text);
    else this.texts.delete(k);
    this.draw(k);
  }

  drop(k) {
    this.texts.delete(k);
    this.draw(k);
  }

  // A block changed: a sign that's gone takes its writing with it; one that turned (or changed
  // color) is drawn again.
  changed(x, y, z) {
    const k = `${x},${y},${z}`;
    if (!this.texts.has(k)) return;
    if (blockId(itemOf(this.world.get(x, y, z))) !== SIGN) this.drop(k);
    else this.draw(k);
  }

  draw(k) {
    const old = this.meshes.get(k);
    if (old) {
      this.scene.remove(old);
      old.material.map.dispose();
      old.material.dispose();
      this.meshes.delete(k);
    }
    const text = this.texts.get(k);
    const [x, y, z] = k.split(',').map(Number);
    const v = this.world.get(x, y, z);
    if (!text || blockId(itemOf(v)) !== SIGN) return;
    const meta = blockMeta(itemOf(v));
    const tex = new THREE.CanvasTexture(writing(text, INK[(meta >> 2) & 3]));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    // Same place and turn as the board: hanging on the wall, its front facing out.
    const m = new THREE.Matrix4().makeTranslation(x + 0.5, y, z + 0.5).multiply(new THREE.Matrix4().makeRotationY((meta & 3) * Math.PI / 2));
    m.multiply(new THREE.Matrix4().makeTranslation(0, 0.5, -0.447));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(m);
    this.scene.add(mesh);
    this.meshes.set(k, mesh);
  }
}

// The words, as big as they'll fit (up to four lines), in the middle of the board.
function writing(text, ink) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 64, lines;
  for (; size >= 16; size -= 4) {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    lines = wrap(ctx, text, W - 24);
    if (lines.length * size * 1.15 <= H - 20 && lines.every(l => ctx.measureText(l).width <= W - 24)) break;
  }
  const lh = size * 1.15, top = H / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh));
  return c;
}

function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
