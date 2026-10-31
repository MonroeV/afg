// Little 3D models for lamps and furniture. Each model is built from simple shapes in
// up to four parts: the body, the part that glows, an accent and a trim (each part has its
// own color). Positions are inside a 1 x 1 x 1 block whose corner is at (0, 0, 0).
// Furniture's front is the +z side (it's turned to face you when you put it down).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x, y, z, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const ball = (r, x, y, z) => new THREE.SphereGeometry(r, 8, 6).translate(x, y, z);
const cone = (r, h, x, y, z, seg = 8) => new THREE.ConeGeometry(r, h, seg).rotateY(seg === 4 ? Math.PI / 4 : 0).translate(x, y, z);

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
      new THREE.TorusGeometry(0.3, 0.025, 4, 16).rotateX(Math.PI / 2).translate(0.5, 0.6, 0.5),
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
      new THREE.TorusGeometry(0.06, 0.012, 4, 8).translate(0.5, 0.72, 0.5),
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
  // ---------- Furniture ----------
  chair: {
    body: [
      ...[[0.22, 0.24], [0.78, 0.24], [0.22, 0.8], [0.78, 0.8]].map(([x, z]) => box(0.06, 0.48, 0.06, x, 0.24, z)),
      box(0.64, 0.05, 0.64, 0.5, 0.48, 0.52),
      box(0.06, 0.62, 0.06, 0.22, 0.79, 0.21), box(0.06, 0.62, 0.06, 0.78, 0.79, 0.21),
      box(0.62, 0.08, 0.05, 0.5, 1.06, 0.21),
    ],
    accent: [box(0.58, 0.06, 0.58, 0.5, 0.535, 0.53), box(0.5, 0.36, 0.04, 0.5, 0.82, 0.24)],
    colors: { body: 0x8d5a34, accent: 0xd84f4f, metal: 0 },
  },
  table: {
    body: [
      box(1, 0.07, 1, 0.5, 0.965, 0.5),
      ...[[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([x, z]) => box(0.08, 0.93, 0.08, x, 0.465, z)),
      box(0.84, 0.08, 0.04, 0.5, 0.88, 0.1), box(0.84, 0.08, 0.04, 0.5, 0.88, 0.9),
    ],
    colors: { body: 0xa0703c, metal: 0 },
  },
  flowerPot: {
    body: [cyl(0.15, 0.11, 0.26, 0.5, 0.13, 0.5), cyl(0.17, 0.17, 0.04, 0.5, 0.26, 0.5)],
    accent: [
      cyl(0.012, 0.012, 0.28, 0.5, 0.4, 0.5), cyl(0.012, 0.012, 0.22, 0.42, 0.36, 0.46), cyl(0.012, 0.012, 0.24, 0.58, 0.37, 0.55),
      box(0.12, 0.02, 0.05, 0.44, 0.34, 0.5), box(0.12, 0.02, 0.05, 0.57, 0.31, 0.47),
    ],
    trim: [ball(0.06, 0.5, 0.56, 0.5), ball(0.05, 0.42, 0.48, 0.46), ball(0.05, 0.58, 0.5, 0.55)],
    colors: { body: 0xc8693c, accent: 0x3f9a3a, trim: 0xff6fa8, metal: 0 },
  },
  teddy: {
    body: [
      ball(0.15, 0.5, 0.22, 0.5).scale(1, 1.1, 0.9).translate(0, -0.02, 0.05), // body
      ball(0.12, 0.5, 0.48, 0.52), // head
      ball(0.045, 0.41, 0.57, 0.52), ball(0.045, 0.59, 0.57, 0.52), // ears
      box(0.08, 0.2, 0.08, 0.34, 0.26, 0.55), box(0.08, 0.2, 0.08, 0.66, 0.26, 0.55), // arms
      box(0.09, 0.09, 0.18, 0.42, 0.05, 0.6), box(0.09, 0.09, 0.18, 0.58, 0.05, 0.6), // legs
    ],
    accent: [ball(0.09, 0.5, 0.2, 0.6).scale(1, 1, 0.5).translate(0, 0, 0.32), ball(0.05, 0.5, 0.45, 0.63).scale(1, 0.8, 0.8).translate(0, 0.09, 0.13)],
    trim: [ball(0.018, 0.455, 0.51, 0.63), ball(0.018, 0.545, 0.51, 0.63), ball(0.02, 0.5, 0.465, 0.66)],
    colors: { body: 0xa8703f, accent: 0xe8c9a0, trim: 0x1d1410, metal: 0 },
  },
  // ---------- Office ----------
  desk: {
    body: [
      box(1, 0.07, 1, 0.5, 0.965, 0.5),
      box(0.36, 0.86, 0.86, 0.79, 0.47, 0.5), // drawers
      box(0.06, 0.93, 0.06, 0.06, 0.465, 0.12), box(0.06, 0.93, 0.06, 0.06, 0.465, 0.88),
      box(0.62, 0.5, 0.04, 0.32, 0.68, 0.07), // modesty panel at the back
    ],
    trim: [0.25, 0.5, 0.75].map(y => box(0.12, 0.03, 0.02, 0.79, y + 0.05, 0.935)),
    colors: { body: 0x6d4c33, trim: 0xc9ccd1, metal: 0 },
  },
  officeChair: {
    body: [
      // A five-legged star on the floor.
      ...[0, 1, 2, 3, 4].map(i => new THREE.BoxGeometry(0.05, 0.04, 0.3).translate(0, 0.03, 0.15).rotateY(i * Math.PI * 0.4).translate(0.5, 0, 0.5)),
      cyl(0.03, 0.03, 0.34, 0.5, 0.22, 0.5),
    ],
    accent: [box(0.56, 0.1, 0.54, 0.5, 0.48, 0.52), box(0.5, 0.5, 0.08, 0.5, 0.82, 0.22)],
    trim: [box(0.06, 0.04, 0.4, 0.2, 0.62, 0.5), box(0.06, 0.04, 0.4, 0.8, 0.62, 0.5), box(0.04, 0.12, 0.04, 0.2, 0.56, 0.5), box(0.04, 0.12, 0.04, 0.8, 0.56, 0.5)],
    colors: { body: 0x2b2f36, accent: 0x2f3e5c, trim: 0x1d1f24, metal: 0 },
  },
  computer: {
    body: [box(0.66, 0.44, 0.05, 0.5, 0.42, 0.37), box(0.08, 0.2, 0.06, 0.5, 0.12, 0.34), box(0.32, 0.03, 0.2, 0.5, 0.015, 0.34)],
    glow: [box(0.6, 0.38, 0.02, 0.5, 0.42, 0.4)],
    accent: [box(0.5, 0.03, 0.16, 0.5, 0.015, 0.68)],
    trim: [box(0.07, 0.03, 0.1, 0.83, 0.015, 0.68)],
    colors: { body: 0x23262b, glow: 0x7fd0ff, accent: 0xe8e8e8, trim: 0x9aa0a6, metal: 0 },
  },
  waterCooler: {
    body: [box(0.42, 0.56, 0.42, 0.5, 0.28, 0.5)],
    glow: [cyl(0.15, 0.15, 0.36, 0.5, 0.76, 0.5), cyl(0.06, 0.12, 0.06, 0.5, 0.59, 0.5)],
    trim: [box(0.05, 0.05, 0.05, 0.42, 0.42, 0.72), box(0.05, 0.05, 0.05, 0.58, 0.42, 0.72), box(0.3, 0.02, 0.1, 0.5, 0.3, 0.74)],
    colors: { body: 0xf2f2f0, glow: 0x9fd8ff, trim: 0x4a90d9, metal: 0 },
  },
  // ---------- Fancy things ----------
  piano: {
    body: [
      box(0.92, 0.3, 0.78, 0.5, 0.66, 0.44),
      new THREE.BoxGeometry(0.88, 0.02, 0.74).rotateX(-0.65).translate(0.5, 0.97, 0.3), // the lid, propped open
      box(0.02, 0.4, 0.02, 0.15, 1.0, 0.42),
      ...[[0.1, 0.12], [0.9, 0.12], [0.5, 0.82]].map(([x, z]) => cyl(0.04, 0.03, 0.52, x, 0.26, z)),
      box(0.9, 0.08, 0.16, 0.5, 0.55, 0.9),
    ],
    accent: [box(0.84, 0.04, 0.13, 0.5, 0.61, 0.9)],
    trim: Array.from({ length: 9 }, (_, i) => box(0.035, 0.03, 0.07, 0.14 + i * 0.09, 0.64, 0.87)),
    colors: { body: 0x0d0d0f, accent: 0xf7f6f0, trim: 0x0d0d0f, metal: 0.25 },
  },
  fishTank: {
    body: [
      box(0.9, 0.34, 0.7, 0.5, 0.17, 0.5),
      ...[[0.06, 0.17], [0.94, 0.17], [0.06, 0.83], [0.94, 0.83]].map(([x, z]) => box(0.03, 0.5, 0.03, x, 0.6, z)),
      box(0.92, 0.04, 0.72, 0.5, 0.87, 0.5),
    ],
    glow: [box(0.86, 0.44, 0.64, 0.5, 0.58, 0.5)],
    accent: [box(0.03, 0.18, 0.005, 0.25, 0.44, 0.823), box(0.03, 0.24, 0.005, 0.3, 0.47, 0.823), box(0.03, 0.14, 0.005, 0.78, 0.42, 0.823)],
    trim: [box(0.1, 0.05, 0.005, 0.45, 0.62, 0.824), box(0.04, 0.06, 0.005, 0.39, 0.62, 0.824), box(0.08, 0.04, 0.005, 0.66, 0.52, 0.824), box(0.03, 0.05, 0.005, 0.71, 0.52, 0.824), box(0.07, 0.04, 0.005, 0.58, 0.72, 0.824)],
    colors: { body: 0x2a2018, glow: 0x3aa0e8, accent: 0x3fae4a, trim: 0xff8a1f, metal: 0 },
  },
  statue: {
    body: [box(0.5, 0.36, 0.5, 0.5, 0.18, 0.5), box(0.56, 0.05, 0.56, 0.5, 0.385, 0.5)],
    accent: [
      box(0.18, 0.3, 0.12, 0.5, 0.62, 0.5), ball(0.08, 0.5, 0.86, 0.5),
      box(0.05, 0.26, 0.05, 0.62, 0.86, 0.5), box(0.05, 0.22, 0.05, 0.38, 0.6, 0.5),
      box(0.07, 0.22, 0.08, 0.45, 0.33, 0.5).translate(0, 0.14, 0), box(0.07, 0.22, 0.08, 0.55, 0.33, 0.5).translate(0, 0.14, 0),
      cone(0.05, 0.1, 0.62, 1.03, 0.5, 5),
    ],
    colors: { body: 0xefeae0, accent: 0xffc83d, metal: 0, accentMetal: 0.9 },
  },
  // ---------- From the Luxe Store ----------
  throne: {
    body: [
      ...[[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].map(([x, z]) => box(0.08, 0.4, 0.08, x, 0.2, z)),
      box(0.78, 0.08, 0.74, 0.5, 0.42, 0.5),
      box(0.78, 0.95, 0.1, 0.5, 0.9, 0.12),
      box(0.1, 0.24, 0.62, 0.12, 0.58, 0.5), box(0.1, 0.24, 0.62, 0.88, 0.58, 0.5),
      ...[0.18, 0.5, 0.82].map(x => ball(0.06, x, 1.4, 0.12)),
    ],
    accent: [box(0.64, 0.1, 0.6, 0.5, 0.5, 0.53), box(0.6, 0.7, 0.05, 0.5, 0.88, 0.18)],
    trim: [ball(0.045, 0.5, 1.15, 0.19)],
    colors: { body: 0xffc83d, accent: 0xa3122f, trim: 0x37d0ff, metal: 0.85 },
  },
  discoBall: {
    body: [cyl(0.012, 0.012, 0.3, 0.5, 0.85, 0.5), ball(0.22, 0.5, 0.52, 0.5)],
    glow: [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([x, z], i) => ball(0.035, 0.5 + x * 0.205, 0.52 + ((i % 3) - 1) * 0.08, 0.5 + z * 0.205)),
    glowColors: [0xff4fd8, 0x4fd2ff, 0xffe04f, 0x7dff6a],
    colors: { body: 0xd8dde4, glow: 0xffffff, metal: 1 },
  },
  trophy: {
    body: [box(0.32, 0.12, 0.32, 0.5, 0.06, 0.5), box(0.24, 0.06, 0.24, 0.5, 0.15, 0.5)],
    accent: [
      cyl(0.03, 0.06, 0.2, 0.5, 0.28, 0.5), cyl(0.17, 0.07, 0.26, 0.5, 0.51, 0.5),
      new THREE.TorusGeometry(0.07, 0.015, 4, 10).translate(0.32, 0.55, 0.5), new THREE.TorusGeometry(0.07, 0.015, 4, 10).translate(0.68, 0.55, 0.5),
    ],
    trim: [ball(0.04, 0.5, 0.42, 0.66)],
    colors: { body: 0x1d1f24, accent: 0xffc83d, trim: 0xe53935, metal: 0, accentMetal: 0.9 },
  },
  register: {
    body: [box(0.66, 0.24, 0.5, 0.5, 0.12, 0.5), box(0.5, 0.12, 0.3, 0.5, 0.3, 0.42).rotateX(0)],
    glow: [box(0.3, 0.12, 0.02, 0.5, 0.42, 0.28)],
    accent: [box(0.06, 0.18, 0.06, 0.5, 0.33, 0.3)],
    trim: Array.from({ length: 9 }, (_, i) => box(0.06, 0.02, 0.06, 0.4 + (i % 3) * 0.1, 0.37, 0.48 + Math.floor(i / 3) * 0.08)),
    colors: { body: 0x5b6470, glow: 0x7dff9a, accent: 0x3b414a, trim: 0xf2f2f2, metal: 0 },
  },
};

// A couch piece. Side by side, couches join up into one long couch: the arms only go on
// the ends. `arms` says which ends get one: 'a' (the -x side) and/or 'b' (the +x side).
function couch(arms) {
  const x0 = arms.includes('a') ? 0.14 : 0, x1 = arms.includes('b') ? 0.86 : 1;
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const out = {
    body: [[0.06, 0.15], [0.94, 0.15], [0.06, 0.9], [0.94, 0.9]].map(([x, z]) => box(0.06, 0.08, 0.06, x, 0.04, z)),
    accent: [box(1, 0.28, 0.82, 0.5, 0.22, 0.54), box(1, 0.56, 0.2, 0.5, 0.62, 0.2)],
    trim: [box(w - 0.02, 0.1, 0.6, cx, 0.41, 0.6), box(w - 0.02, 0.3, 0.08, cx, 0.6, 0.34)],
    colors: { body: 0x3e2a22, accent: 0x4f6fae, trim: 0x6d8cc8, metal: 0 },
  };
  for (const [side, x] of [['a', 0.07], ['b', 0.93]]) if (arms.includes(side)) out.accent.push(box(0.14, 0.5, 0.82, x, 0.4, 0.54));
  return out;
}
for (const arms of ['ab', 'a', 'b', '']) MODELS[`couch${arms}`] = couch(arms);

// A bed, two cells long: the head end (headboard and pillow) and the foot end.
function bed(foot) {
  return {
    body: [
      box(1, 0.2, 1, 0.5, 0.17, 0.5),
      ...[0.04, 0.96].map(x => box(0.07, 0.07, 0.07, x, 0.035, foot ? 0.96 : 0.04)),
      foot ? box(1, 0.5, 0.06, 0.5, 0.25, 0.97) : box(1, 0.95, 0.07, 0.5, 0.475, 0.035),
    ],
    accent: [box(0.98, 0.13, foot ? 0.93 : 0.58, 0.5, 0.39, foot ? 0.465 : 0.69)],
    trim: foot ? [box(0.94, 0.1, 0.96, 0.5, 0.33, 0.5)] : [box(0.94, 0.1, 0.94, 0.5, 0.33, 0.53), box(0.62, 0.12, 0.26, 0.5, 0.44, 0.22)],
    colors: { body: 0x7b4b2a, accent: 0x4fa3e0, trim: 0xf4f1ea, metal: 0 },
  };
}
MODELS.bed = bed(false);
MODELS.bedFoot = bed(true);

const cache = {};

// A part with nothing in it: its group draws nothing (and costs no draw call).
function emptyPart() {
  const g = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(0), size));
  return g;
}

export const PARTS = ['body', 'glow', 'accent', 'trim'];

// One geometry per model, with a group for each part: 0 body, 1 glow, 2 accent, 3 trim.
export function modelGeometry(name) {
  if (cache[name]) return cache[name];
  const m = MODELS[name];
  const parts = [];
  for (const key of PARTS) {
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
    // An empty part still needs a group so the material slots line up.
    parts.push(geos.length ? mergeGeometries(geos) : emptyPart());
  }
  cache[name] = mergeGeometries(parts, true);
  return cache[name];
}

// Materials for the four parts. The glowing part ignores lighting so it always shines.
// Furniture (no metal) is soft and matte, like wood and fabric.
export function modelMaterials(name) {
  const c = MODELS[name].colors;
  const soft = c.metal === 0;
  const body = new THREE.MeshStandardMaterial({ color: c.body, roughness: soft ? 0.75 : 0.45, metalness: c.metal ?? 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: c.glow ?? 0xffffff, vertexColors: true, toneMapped: true });
  glow.userData.baseColor = new THREE.Color(c.glow ?? 0xffffff);
  const accent = new THREE.MeshStandardMaterial({ color: c.accent ?? c.body, roughness: c.accentMetal ? 0.3 : soft ? 0.9 : 0.6, metalness: c.accentMetal ?? (soft ? 0 : 0.1) });
  const trim = new THREE.MeshStandardMaterial({ color: c.trim ?? c.accent ?? c.body, roughness: soft ? 0.85 : 0.6, metalness: 0 });
  return [body, glow, accent, trim];
}
