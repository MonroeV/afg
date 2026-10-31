// Little 3D models for the lamp blocks. Each model is built from simple shapes in
// three parts: the body, the part that glows, and an accent. Positions are inside a
// 1 x 1 x 1 block whose corner is at (0, 0, 0).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x, y, z, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const ball = (r, x, y, z) => new THREE.SphereGeometry(r, 10, 8).translate(x, y, z);
const cone = (r, h, x, y, z, seg = 10) => new THREE.ConeGeometry(r, h, seg).rotateY(seg === 4 ? Math.PI / 4 : 0).translate(x, y, z);

// For each model: the shapes in each part, and the colors of the parts.
// glow is the color of the lit-up part; glowColors lets each glowing bulb be different.
export const MODELS = {
  tableLamp: {
    body: [cyl(0.17, 0.19, 0.06, 0.5, 0.03, 0.5), cyl(0.025, 0.025, 0.4, 0.5, 0.26, 0.5)],
    glow: [cyl(0.15, 0.25, 0.26, 0.5, 0.55, 0.5, 18)],
    colors: { body: 0x8d6e63, glow: 0xfff0d8, metal: 0.2 },
  },
  floorLamp: {
    body: [cyl(0.2, 0.22, 0.05, 0.5, 0.025, 0.5), cyl(0.022, 0.022, 0.8, 0.5, 0.45, 0.5)],
    glow: [cyl(0.16, 0.24, 0.22, 0.5, 0.88, 0.5, 18)],
    colors: { body: 0x2f3237, glow: 0xfff0d8, metal: 0.7 },
  },
  ceilingLight: {
    body: [cyl(0.3, 0.3, 0.04, 0.5, 0.98, 0.5, 20)],
    glow: [cyl(0.27, 0.2, 0.1, 0.5, 0.91, 0.5, 20)],
    colors: { body: 0xe8e8e8, glow: 0xfff8ee, metal: 0.3 },
  },
  chandelier: {
    body: [
      cyl(0.015, 0.015, 0.32, 0.5, 0.84, 0.5),
      new THREE.TorusGeometry(0.3, 0.025, 6, 24).rotateX(Math.PI / 2).translate(0.5, 0.6, 0.5),
      box(0.62, 0.02, 0.02, 0.5, 0.65, 0.5), box(0.02, 0.02, 0.62, 0.5, 0.65, 0.5),
      ball(0.06, 0.5, 0.62, 0.5),
    ],
    accent: [0, 1, 2, 3, 4, 5].map(i => cyl(0.025, 0.025, 0.09, 0.5 + Math.cos(i * Math.PI / 3) * 0.3, 0.665, 0.5 + Math.sin(i * Math.PI / 3) * 0.3, 8)),
    glow: [0, 1, 2, 3, 4, 5].map(i => cone(0.022, 0.06, 0.5 + Math.cos(i * Math.PI / 3) * 0.3, 0.74, 0.5 + Math.sin(i * Math.PI / 3) * 0.3, 6)),
    colors: { body: 0xd4a537, glow: 0xffc060, accent: 0xfaf3e0, metal: 0.9 },
  },
  candle: {
    body: [cyl(0.12, 0.13, 0.03, 0.5, 0.015, 0.5)],
    accent: [cyl(0.065, 0.07, 0.22, 0.5, 0.14, 0.5)],
    glow: [cone(0.03, 0.09, 0.5, 0.3, 0.5, 8)],
    colors: { body: 0xc9a227, glow: 0xffa53a, accent: 0xfaf3e0, metal: 0.8 },
  },
  lavaLamp: {
    body: [cyl(0.1, 0.16, 0.14, 0.5, 0.07, 0.5), cyl(0.06, 0.1, 0.08, 0.5, 0.64, 0.5)],
    glow: [cyl(0.1, 0.1, 0.46, 0.5, 0.37, 0.5, 16)],
    accent: [ball(0.05, 0.47, 0.25, 0.47), ball(0.04, 0.53, 0.45, 0.52), ball(0.035, 0.48, 0.55, 0.5)],
    colors: { body: 0x7e57c2, glow: 0xff4fd8, accent: 0xffd54f, metal: 0.6 },
  },
  lantern: {
    body: [
      box(0.42, 0.05, 0.42, 0.5, 0.025, 0.5),
      cone(0.3, 0.16, 0.5, 0.6, 0.5, 4),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => box(0.04, 0.46, 0.04, 0.5 + x * 0.17, 0.27, 0.5 + z * 0.17)),
      new THREE.TorusGeometry(0.06, 0.012, 6, 12).translate(0.5, 0.72, 0.5),
    ],
    glow: [box(0.3, 0.4, 0.3, 0.5, 0.27, 0.5)],
    colors: { body: 0x1f2124, glow: 0xffb35c, metal: 0.7 },
  },
  streetLamp: {
    body: [
      box(0.28, 0.1, 0.28, 0.5, 0.05, 0.5),
      box(0.5, 0.06, 0.5, 0.5, 0.66, 0.5),
      cone(0.42, 0.24, 0.5, 0.81, 0.5, 4),
      ball(0.05, 0.5, 0.95, 0.5),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => box(0.04, 0.56, 0.04, 0.5 + x * 0.21, 0.38, 0.5 + z * 0.21)),
    ],
    glow: [box(0.4, 0.5, 0.4, 0.5, 0.37, 0.5)],
    colors: { body: 0x1f2124, glow: 0xffe2b8, metal: 0.7 },
  },
  gardenLight: {
    body: [cyl(0.1, 0.11, 0.45, 0.5, 0.225, 0.5), cyl(0.14, 0.12, 0.05, 0.5, 0.625, 0.5)],
    glow: [cyl(0.095, 0.095, 0.13, 0.5, 0.53, 0.5)],
    colors: { body: 0x3a3d42, glow: 0xfff4dc, metal: 0.6 },
  },
  tikiTorch: {
    body: [cyl(0.04, 0.045, 0.86, 0.5, 0.43, 0.5, 8)],
    accent: [cyl(0.11, 0.07, 0.14, 0.5, 0.92, 0.5, 8), cyl(0.05, 0.05, 0.04, 0.5, 0.3, 0.5, 8), cyl(0.05, 0.05, 0.04, 0.5, 0.6, 0.5, 8)],
    glow: [cone(0.08, 0.2, 0.5, 1.07, 0.5, 8)],
    colors: { body: 0xc8a165, glow: 0xff8a30, accent: 0x6d4c2f, metal: 0 },
  },
  partyLights: {
    body: [box(1, 0.02, 0.02, 0.5, 0.95, 0.5), ...[0.1, 0.3, 0.5, 0.7, 0.9].map(x => box(0.01, 0.06, 0.01, x, 0.91, 0.5))],
    glow: [0.1, 0.3, 0.5, 0.7, 0.9].map((x, i) => ball(0.045, x, 0.86 - (i % 2) * 0.03, 0.5)),
    glowColors: [0xff4d4d, 0xffd84a, 0x4dd2ff, 0x7dff6a, 0xff7af0],
    colors: { body: 0x222222, glow: 0xffffff, metal: 0.2 },
  },
};

const cache = {};

// One geometry per model, with a group for each part: 0 body, 1 glow, 2 accent.
export function modelGeometry(name) {
  if (cache[name]) return cache[name];
  const m = MODELS[name];
  const parts = [];
  for (const key of ['body', 'glow', 'accent']) {
    const geos = (m[key] || []).map(g => g.index ? g.toNonIndexed() : g);
    if (key === 'glow' && m.glowColors) {
      // Give each bulb its own color.
      geos.forEach((g, i) => {
        const c = new THREE.Color(m.glowColors[i % m.glowColors.length]);
        const colors = new Float32Array(g.attributes.position.count * 3);
        for (let j = 0; j < colors.length; j += 3) colors.set([c.r, c.g, c.b], j);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      });
    } else {
      for (const g of geos) {
        const colors = new Float32Array(g.attributes.position.count * 3).fill(1);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
    }
    // An empty part still needs a (tiny, invisible) group so material slots line up.
    parts.push(geos.length ? mergeGeometries(geos) : new THREE.BoxGeometry(0, 0, 0).toNonIndexed().setAttribute('color', new THREE.BufferAttribute(new Float32Array(108), 3)));
  }
  cache[name] = mergeGeometries(parts, true);
  return cache[name];
}

// Materials for the three parts. The glowing part ignores lighting so it always shines;
// `brightness` is how bright it glows (above 1 makes the glow effect pick it up).
export function modelMaterials(name) {
  const c = MODELS[name].colors;
  const body = new THREE.MeshStandardMaterial({ color: c.body, roughness: 0.45, metalness: c.metal ?? 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: c.glow, vertexColors: true, toneMapped: true });
  glow.userData.baseColor = new THREE.Color(c.glow);
  const accent = new THREE.MeshStandardMaterial({ color: c.accent ?? c.body, roughness: 0.6, metalness: 0.1 });
  return [body, glow, accent];
}
