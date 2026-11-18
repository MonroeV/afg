// The zoo's animals (see shared/zoo.js for their pens): elephants, giraffes, lions, zebras,
// penguins, pandas and monkeys, all made of blocks. Each wanders about its pen, worked out from
// the game's clock (so everyone sees them in the same places), walking, waddling or hopping as
// suits it. Right-click one to feed it (the server takes something from your lunchbox): it
// munches happily, with hearts, and gets extra excited about its favorite food.
import * as THREE from 'three';
import { ANIMALS } from './shared/zoo.js';

const SLOT = 9; // (seconds between each animal picking somewhere new to go)
const FLOOR = 1; // (the pens' sand, grass and ice are whole blocks on the ground: they stand on top)
const hash = n => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- The animals' models ----------
// Each: a group (standing on y = 0, facing -z), its legs (they swing), how tall, how big round.
function model(kind) {
  const g = new THREE.Group(), legs = [];
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const box = (w, h, d, c, x, y, z, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? mat(c) : c);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // A leg that swings from the top (its pivot at the hip).
  const leg = (w, h, c, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    box(w, h, w, c, 0, -h / 2, 0, pivot);
    g.add(pivot);
    legs.push(pivot);
  };
  const four = (w, h, c, hx, hz, top) => [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].forEach(([x, z]) => leg(w, h, c, x, top, z));
  let head = null, height = 1, radius = 0.8;
  if (kind === 'elephant') {
    const grey = mat(0x8d9aa3);
    box(1.8, 1.6, 2.8, grey, 0, 2.0, 0);
    four(0.55, 1.3, grey, 0.6, 0.9, 1.3);
    head = new THREE.Group();
    head.position.set(0, 2.3, -1.6);
    box(1.2, 1.2, 1.0, grey, 0, 0, 0, head);
    for (const s of [-1, 1]) box(0.15, 1.2, 1.0, mat(0x7d8a93), s * 0.75, -0.05, 0.2, head); // (big ears)
    for (let i = 0; i < 3; i++) box(0.3 - i * 0.04, 0.45, 0.3 - i * 0.04, grey, 0, -0.65 - i * 0.42, -0.45 - i * 0.08, head); // (the trunk)
    for (const s of [-1, 1]) box(0.08, 0.08, 0.5, mat(0xfffde7), s * 0.35, -0.45, -0.6, head); // (tusks)
    g.add(head);
    height = 3.2;
    radius = 1.8;
  } else if (kind === 'giraffe') {
    const yellow = mat(0xf2c14e), spot = mat(0x9a5b2b);
    box(1.0, 0.9, 1.8, yellow, 0, 2.3, 0);
    for (const [x, y, z] of [[0.51, 2.4, 0.3], [-0.51, 2.3, -0.4], [0.51, 2.2, -0.5], [-0.51, 2.45, 0.5]]) box(0.02, 0.3, 0.3, spot, x, y, z);
    four(0.25, 1.9, yellow, 0.35, 0.7, 1.9);
    head = new THREE.Group();
    head.position.set(0, 2.6, -0.8);
    const neck = box(0.35, 2.2, 0.35, yellow, 0, 1.0, -0.25, head);
    neck.rotation.x = -0.3;
    box(0.4, 0.4, 0.7, yellow, 0, 2.15, -0.75, head);
    for (const s of [-1, 1]) box(0.06, 0.25, 0.06, spot, s * 0.12, 2.45, -0.6, head);
    g.add(head);
    height = 5.0;
    radius = 1.2;
  } else if (kind === 'lion' || kind === 'zebra') {
    const lion = kind === 'lion', body = mat(lion ? 0xe0a458 : 0xffffff);
    box(0.9, 0.8, 1.8, body, 0, 1.15, 0);
    if (!lion) for (let i = 0; i < 6; i++) box(0.92, 0.82, 0.12, mat(0x222222), 0, 1.15, -0.75 + i * 0.3);
    four(0.22, 0.8, lion ? body : mat(0xffffff), 0.3, 0.7, 0.8);
    head = new THREE.Group();
    head.position.set(0, 1.45, -1.0);
    if (lion) box(1.0, 1.0, 0.5, mat(0x8d5524), 0, 0, 0.1, head); // (the mane)
    box(0.55, 0.55, 0.6, body, 0, 0, -0.2, head);
    box(0.3, 0.2, 0.3, mat(lion ? 0x6d4c33 : 0x333333), 0, -0.15, -0.55, head);
    if (!lion) box(0.1, 0.35, 0.8, mat(0x222222), 0, 0.4, 0.5, head); // (the zebra's mane)
    g.add(head);
    const tail = box(0.08, 0.08, 0.8, lion ? body : mat(0x222222), 0, 1.3, 1.25);
    tail.rotation.x = 0.5;
    height = 1.9;
  } else if (kind === 'penguin') {
    box(0.6, 0.9, 0.5, mat(0x1d1f24), 0, 0.6, 0);
    box(0.45, 0.7, 0.05, mat(0xffffff), 0, 0.55, -0.26);
    head = new THREE.Group();
    head.position.set(0, 1.2, 0);
    box(0.45, 0.35, 0.4, mat(0x1d1f24), 0, 0, 0, head);
    box(0.15, 0.1, 0.2, mat(0xff9800), 0, -0.05, -0.28, head);
    g.add(head);
    for (const s of [-1, 1]) {
      box(0.2, 0.06, 0.28, mat(0xff9800), s * 0.15, 0.04, -0.05);
      const wing = box(0.08, 0.55, 0.3, mat(0x1d1f24), s * 0.34, 0.65, 0);
      legs.push(wing); // (the flippers flap instead)
    }
    height = 1.4;
    radius = 0.5;
  } else if (kind === 'panda') {
    const white = mat(0xffffff), black = mat(0x1d1f24);
    box(1.1, 0.9, 1.4, white, 0, 0.95, 0);
    box(1.12, 0.5, 0.5, black, 0, 1.1, -0.35);
    four(0.35, 0.55, black, 0.35, 0.45, 0.55);
    head = new THREE.Group();
    head.position.set(0, 1.35, -0.9);
    box(0.75, 0.65, 0.6, white, 0, 0, 0, head);
    for (const s of [-1, 1]) {
      box(0.2, 0.2, 0.05, black, s * 0.18, 0.05, -0.31, head);
      box(0.2, 0.2, 0.12, black, s * 0.3, 0.38, 0, head);
    }
    box(0.15, 0.1, 0.05, black, 0, -0.15, -0.31, head);
    g.add(head);
    height = 1.8;
  } else {
    // A monkey: small and brown, long arms, a curly tail.
    const brown = mat(0x7b4a2b), face = mat(0xe8c39e);
    box(0.5, 0.6, 0.4, brown, 0, 0.9, 0);
    four(0.12, 0.6, brown, 0.3, 0.12, 1.1);
    head = new THREE.Group();
    head.position.set(0, 1.4, -0.05);
    box(0.45, 0.4, 0.4, brown, 0, 0, 0, head);
    box(0.32, 0.25, 0.05, face, 0, -0.03, -0.21, head);
    for (const s of [-1, 1]) box(0.08, 0.15, 0.1, face, s * 0.26, 0.02, 0, head);
    g.add(head);
    const tail = box(0.06, 0.06, 0.7, brown, 0, 0.8, 0.45);
    tail.rotation.x = -0.8;
    height = 1.6;
    radius = 0.5;
  }
  return { group: g, legs, head, height, radius };
}

export class ZooAnimals {
  constructor({ scene, effects, sounds }) {
    Object.assign(this, { scene, effects, sounds });
    this.animals = [];
  }

  setPlace(place) {
    for (const a of this.animals) this.scene.remove(a.group);
    this.animals = [];
    if (!place?.pens) return;
    place.pens.forEach((pen, p) => {
      const def = ANIMALS[pen.kind];
      for (let i = 0; i < def.count; i++) {
        const m = model(pen.kind);
        // (Pairs of grown-ups, and smaller ones too.)
        const scale = i > 1 && pen.kind !== 'penguin' ? 0.7 : 1;
        m.group.scale.setScalar(scale);
        this.scene.add(m.group);
        this.animals.push({ ...m, kind: pen.kind, i, pen, seed: p * 10 + i + 1, scale, fedUntil: 0 });
      }
    });
  }

  // Where an animal is heading in time slot n (somewhere in its pen, out of the penguins' pool).
  target(a, n) {
    const [x0, z0, x1, z1] = a.pen.rect, m = 1.2;
    let x = x0 + m + hash(a.seed * 7.13 + n * 1.7) * (x1 - x0 - 2 * m), z = z0 + m + hash(a.seed * 3.91 + n * 2.3) * (z1 - z0 - 2 * m);
    if (a.pen.pool && x > x1 - 4.5 && z > z1 - 4.5) x = x0 + m + (x - x0 - m) * 0.4;
    return [x, z];
  }

  update(dt, t, viewer) {
    for (const a of this.animals) {
      const far = Math.hypot(a.pen.rect[0] - viewer.x, a.pen.rect[1] - viewer.z) > 220;
      a.group.visible = !far;
      if (far) continue;
      const tt = t + a.seed * 3.3, n = Math.floor(tt / SLOT), into = tt - n * SLOT;
      const from = this.target(a, n - 1), to = this.target(a, n);
      const speed = { elephant: 1.2, giraffe: 1.4, lion: 1.6, zebra: 2, penguin: 0.9, panda: 0.8, monkey: 2.2 }[a.kind];
      const d = Math.hypot(to[0] - from[0], to[1] - from[1]), dur = Math.max(0.5, d / speed);
      const eating = t < a.fedUntil;
      const k = Math.min(1, into / dur), e = k * k * (3 - 2 * k);
      const moving = k < 1 && !eating;
      // (Munching: it stays put where it was fed.)
      if (eating) a.group.position.set(a.frozen[0], FLOOR, a.frozen[1]);
      else a.group.position.set(from[0] + (to[0] - from[0]) * e, FLOOR, from[1] + (to[1] - from[1]) * e);
      if (d > 0.1) a.group.rotation.y = Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
      // Walking (legs swinging), a waddle, a hop, or (fed) munching away.
      const swing = moving ? Math.sin(t * (a.kind === 'monkey' ? 14 : 8) + a.seed) * 0.5 : 0;
      a.legs.forEach((l, j) => {
        if (a.kind === 'penguin') l.rotation.z = (j ? -1 : 1) * (moving ? 0.3 + Math.sin(t * 10) * 0.25 : 0.1);
        else l.rotation.x = (j % 2 === (j < 2 ? 0 : 1) ? 1 : -1) * swing;
      });
      if (a.kind === 'penguin') a.group.rotation.z = moving ? Math.sin(t * 8 + a.seed) * 0.12 : 0;
      if (a.kind === 'monkey') a.group.position.y = FLOOR + (moving ? Math.abs(Math.sin(t * 7 + a.seed)) * 0.4 : 0);
      if (a.head) a.head.rotation.x = eating ? -0.4 + Math.sin(t * 12) * 0.15 : Math.sin(t * 1.5 + a.seed) * 0.05;
      if (eating && Math.random() < dt * 3) this.effects.heartsAt(a.group.position.x, FLOOR + a.height * a.scale + 0.3, a.group.position.z, a.liked ? 3 : 1);
    }
  }

  // The animal under the crosshair (close enough to feed), or null.
  aimed(camera, reach = 7) {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), o = camera.position;
    let best = null, bestT = reach;
    for (const a of this.animals) {
      if (!a.group.visible) continue;
      const c = a.group.position.clone().setY(FLOOR + (a.height * a.scale) / 2), r = a.radius * a.scale + 0.3;
      const oc = c.clone().sub(o), along = oc.dot(dir);
      if (along < 0 || along > bestT) continue;
      if (oc.lengthSq() - along * along < r * r) [best, bestT] = [a, along];
    }
    return best;
  }

  // The server says an animal was fed: it munches (and loves it, if it was its favorite).
  fed(kind, i, liked, t) {
    const a = this.animals.find(x => x.kind === kind && x.i === i) || this.animals.find(x => x.kind === kind);
    if (!a) return;
    a.frozen = [a.group.position.x, a.group.position.z];
    a.fedUntil = t + 4;
    a.liked = liked;
    this.effects.heartsAt(a.group.position.x, FLOOR + a.height * a.scale + 0.3, a.group.position.z, liked ? 8 : 4);
  }
}
