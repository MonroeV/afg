// What the newer Build Book things look like (see structures.js for how they're built, and
// contraptions.js for riding and playing with them): a rocket on its launch pad, a volcano, fish
// in a fish tank, a merry-go-round, a wishing well's roof and bucket, and a rainbow.
import * as THREE from 'three';

const mat = (color, more = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...more });
const M = {
  white: mat(0xf5f5f5, { roughness: 0.4 }),
  red: mat(0xe53935, { roughness: 0.45 }),
  dark: mat(0x37474f, { roughness: 0.5, metalness: 0.4 }),
  glass: mat(0x4fc3f7, { roughness: 0.15, metalness: 0.2, emissive: 0x0b3a52 }),
  rock: mat(0x5d4037, { roughness: 0.95, flatShading: true }),
  rockDark: mat(0x3e2723, { roughness: 0.95, flatShading: true }),
  lava: new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
  gold: mat(0xffc93c, { roughness: 0.3, metalness: 0.6 }),
  wood: mat(0x8d5a34, { roughness: 0.85 }),
  roof: mat(0xc0392b, { roughness: 0.7 }),
  rope: mat(0xc9b38a, { roughness: 0.9 }),
  seaweed: mat(0x2e7d32, { roughness: 0.8 }),
};
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);

// ---------- The rocket ----------
// Standing on its launch pad, nose up. Its middle is at the group's origin (x, z); y is the pad.
export function rocketModel() {
  const g = new THREE.Group();
  const body = cyl(0.32, 0.36, 1.7, M.white, 18);
  body.position.y = 1.1;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 18), M.red);
  nose.position.y = 2.32;
  const stripe = cyl(0.335, 0.335, 0.14, M.red, 18);
  stripe.position.y = 1.75;
  const win = cyl(0.13, 0.13, 0.05, M.glass, 16);
  win.rotation.x = Math.PI / 2;
  win.position.set(0, 1.4, 0.33);
  const nozzle = cyl(0.2, 0.28, 0.28, M.dark);
  nozzle.position.y = 0.14;
  g.add(body, nose, stripe, win, nozzle);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = box(0.05, 0.62, 0.36, M.red);
    fin.position.set(Math.sin(a) * 0.4, 0.55, Math.cos(a) * 0.4);
    fin.rotation.y = a;
    g.add(fin);
  }
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return g;
}

// A parachute (over your head on the way down).
export function parachuteModel() {
  const g = new THREE.Group();
  const colors = [0xe53935, 0xffffff, 0xfdd835, 0xffffff, 0x1e88e5, 0xffffff, 0x43a047, 0xffffff];
  colors.forEach((c, i) => {
    const part = new THREE.Mesh(new THREE.SphereGeometry(1.5, 4, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.4), mat(c, { side: THREE.DoubleSide }));
    part.position.y = 3.2;
    g.add(part);
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(Math.sin(a) * 1.05, 3.35, Math.cos(a) * 1.05)]), new THREE.LineBasicMaterial({ color: 0x333333 }));
    g.add(line);
  }
  return g;
}

// ---------- The volcano ----------
// A rocky cone on top of the 3 by 3, with a glowing pool of lava in its top (and lava dribbling
// down its sides).
export function volcanoModel() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.55, 1.7, 9, 3), M.rock);
  cone.position.y = 0.85;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.6, 0.18, 9), M.rockDark);
  rim.position.y = 1.7;
  const lava = new THREE.Mesh(new THREE.CircleGeometry(0.44, 16).rotateX(-Math.PI / 2), M.lava.clone());
  lava.position.y = 1.72;
  g.add(cone, rim, lava);
  for (const a of [0.4, 2.5, 4.4]) {
    const drip = box(0.12, 0.7, 0.05, M.lava);
    drip.position.set(Math.sin(a) * 0.8, 1.25, Math.cos(a) * 0.8);
    drip.lookAt(new THREE.Vector3(Math.sin(a) * 3, -1.5, Math.cos(a) * 3));
    g.add(drip);
  }
  cone.castShadow = true;
  g.lava = lava;
  return g;
}

// ---------- The fish tank ----------
// Three fish swimming round and round in the water, and a little seaweed.
const FISH_COLORS = [0xff8f00, 0xffeb3b, 0x29b6f6, 0xef5350, 0xab47bc];
export function fishTankModel(seed) {
  const g = new THREE.Group();
  g.fish = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    const color = FISH_COLORS[(seed + i) % FISH_COLORS.length];
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(color, { roughness: 0.4 }));
    body.scale.set(1, 0.65, 0.45);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 6), mat(color, { roughness: 0.4 }));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.12;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(0.06, 0.02, 0.035);
    f.add(body, tail, eye);
    g.add(f);
    g.fish.push(f);
  }
  for (const [x, z] of [[-0.3, -0.25], [0.28, 0.3]]) {
    const weed = box(0.04, 0.45, 0.04, M.seaweed);
    weed.position.set(x, -0.27, z);
    g.add(weed);
    (g.weeds ??= []).push(weed);
  }
  return g;
}

// ---------- The merry-go-round ----------
// A round platform, a pole in the middle, a striped canopy, and four horses going up and down on
// their poles. (The whole thing turns: see contraptions.js.)
const HORSE_COLORS = [0xffffff, 0xf8bbd0, 0x90caf9, 0xffe082];
export const CAROUSEL_R = 1.05; // how far out the horses are
export function carouselModel() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const floor = cyl(1.48, 1.48, 0.14, mat(0xffffff, { roughness: 0.5 }), 24);
  floor.position.y = 0.07;
  const edge = cyl(1.5, 1.5, 0.08, M.red, 24);
  edge.position.y = 0.04;
  const pole = cyl(0.09, 0.09, 2.8, M.gold, 10);
  pole.position.y = 1.4;
  spin.add(edge, floor, pole);
  for (let i = 0; i < 8; i++) {
    const wedge = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.75, 3, 1, false, (i / 8) * Math.PI * 2, Math.PI / 4), i % 2 ? M.white : M.red);
    wedge.position.y = 3.05;
    spin.add(wedge);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M.gold);
  top.position.y = 3.5;
  spin.add(top);
  g.horses = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * CAROUSEL_R, 0, Math.cos(a) * CAROUSEL_R);
    holder.rotation.y = a + Math.PI / 2; // (facing the way it goes round)
    const rod = cyl(0.03, 0.03, 2.65, M.gold, 8);
    rod.position.y = 1.4;
    const horse = horseModel(HORSE_COLORS[i]);
    holder.add(rod, horse);
    spin.add(holder);
    g.horses.push({ holder, horse, a });
  }
  g.spin = spin;
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return g;
}

function horseModel(color) {
  const h = new THREE.Group();
  const coat = mat(color, { roughness: 0.5 });
  const body = box(0.62, 0.26, 0.24, coat);
  const neck = box(0.14, 0.3, 0.16, coat);
  neck.position.set(0.28, 0.2, 0);
  neck.rotation.z = -0.4;
  const head = box(0.26, 0.14, 0.15, coat);
  head.position.set(0.4, 0.34, 0);
  const mane = box(0.06, 0.28, 0.17, M.gold);
  mane.position.set(0.24, 0.24, 0);
  mane.rotation.z = -0.4;
  const saddle = box(0.24, 0.05, 0.27, M.red);
  saddle.position.y = 0.15;
  h.add(body, neck, head, mane, saddle);
  for (const [x, z] of [[0.22, 0.08], [0.22, -0.08], [-0.22, 0.08], [-0.22, -0.08]]) {
    const leg = box(0.07, 0.3, 0.07, coat);
    leg.position.set(x, -0.25, z);
    leg.rotation.z = x > 0 ? -0.5 : 0.5;
    h.add(leg);
  }
  h.position.y = 0.95;
  return h;
}

// ---------- The wishing well ----------
// Two posts and a little red roof over the water, with a bucket on a rope.
export function wellModel() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const post = box(0.12, 1.5, 0.12, M.wood);
    post.position.set(s * 0.8, 0.75, 0);
    g.add(post);
    const slope = box(0.1, 0.06, 1.0, M.roof);
    slope.scale.x = 11;
    slope.position.set(s * 0.42, 1.62, 0);
    slope.rotation.z = -s * 0.5;
    g.add(slope);
  }
  const bar = cyl(0.04, 0.04, 1.6, M.wood, 8);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.2;
  const rope = box(0.02, 0.6, 0.02, M.rope);
  rope.position.y = 0.88;
  const bucket = cyl(0.13, 0.1, 0.2, M.wood, 10);
  bucket.position.y = 0.5;
  g.add(bar, rope, bucket);
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return g;
}

// A coin, tossed into the well.
export function coinModel() {
  const c = cyl(0.07, 0.07, 0.02, M.gold, 12);
  c.rotation.x = Math.PI / 2;
  return c;
}

// ---------- The rainbow ----------
// Seven see-through glowing bands in an arch, from the rainbow block over to `R` blocks away.
export const RAINBOW_R = 7;
const RAINBOW_COLORS = [0xff1744, 0xff9100, 0xffea00, 0x00e676, 0x2979ff, 0x3d5afe, 0xd500f9];
export function rainbowModel() {
  const g = new THREE.Group();
  RAINBOW_COLORS.forEach((c, i) => {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(RAINBOW_R - i * 0.32, 0.17, 6, 64, Math.PI),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
    );
    g.add(band);
  });
  return g;
}
