// Shows land claims: glowing borders on the ground, corner posts and the owner's name.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nameKey, claimSize } from './shared/claims.js';

function label(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 44px system-ui, sans-serif';
  const w = Math.min(500, ctx.measureText(text).width + 40);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect((512 - w) / 2, 14, w, 68, 18);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(5, 0.94, 1);
  return sprite;
}

// Thin strips around the edge of a rectangle, plus posts at the corners.
function borderGeometry(r, height) {
  const geos = [];
  const strip = 0.12, y = 0.06;
  const x0 = r.x0, z0 = r.z0, x1 = r.x1 + 1, z1 = r.z1 + 1;
  const add = (w, h, d, x, yy, z) => geos.push(new THREE.BoxGeometry(w, h, d).translate(x, yy, z));
  add(x1 - x0, 0.02, strip, (x0 + x1) / 2, y, z0);
  add(x1 - x0, 0.02, strip, (x0 + x1) / 2, y, z1);
  add(strip, 0.02, z1 - z0, x0, y, (z0 + z1) / 2);
  add(strip, 0.02, z1 - z0, x1, y, (z0 + z1) / 2);
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) add(0.12, height, 0.12, x, height / 2, z);
  return mergeGeometries(geos);
}

export class LandView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.previewMesh = null;
  }

  set(claims, myName) {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.geometry?.dispose();
      o.material.map?.dispose();
    }
    const mine = nameKey(myName);
    for (const c of claims) {
      const color = c.key === mine ? '#7dff8a' : '#ffb321';
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
      this.group.add(new THREE.Mesh(borderGeometry(c, 3), mat));
      const tag = label(c.key === mine ? `🏠 Your land` : `🏠 ${c.owner}'s land`, color);
      tag.position.set((c.x0 + c.x1 + 1) / 2, 3.2, (c.z0 + c.z1 + 1) / 2);
      this.group.add(tag);
    }
  }

  // Shows the area you're about to claim (red if it's too big).
  preview(rect, ok) {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      this.previewMesh = null;
    }
    if (!rect) return;
    this.previewMesh = new THREE.Mesh(borderGeometry(rect, 2), new THREE.MeshBasicMaterial({ color: ok ? 0x4dd2ff : 0xff4d4d, transparent: true, opacity: 0.9 }));
    this.scene.add(this.previewMesh);
  }
}

export function describeSize(rect) {
  const [w, d] = claimSize(rect);
  return `${w} × ${d}`;
}
