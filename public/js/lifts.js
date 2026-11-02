// Ski lifts: each Ski Lift chair goes with the nearest other one, and a cable runs between them
// (high enough over the ground in between), with chairs going up one side and down the other.
// Right-click a chair to ride to the other end.
import * as THREE from 'three';

const RANGE = 140; // how far apart two lift chairs can be and still go together
const SPEED = 4.5; // blocks a second
const CLEAR = 3.2; // how high the chairs hang over the ground (away from the ends)
const SIDE = 0.8; // the up and down cables are this far either side of the middle

export class SkiLifts {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.version = -1;
    this.lines = []; // { a, b, up: [points], down: [points], length, chairs: [meshes] }
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cableMaterial = new THREE.LineBasicMaterial({ color: 0x2a2d33 });
    this.chairGeometry = chairGeometry();
    this.chairMaterial = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.6 });
    this.speed = SPEED;
  }

  chairs() {
    return [...this.world.lifts].map(k => k.split(',').map(Number));
  }

  // The nearest other chair in range.
  nearest(x, y, z, list) {
    let best = null, bestD = RANGE;
    for (const c of list) {
      if (c[0] === x && c[1] === y && c[2] === z) continue;
      const d = Math.hypot(c[0] - x, c[1] - y, c[2] - z);
      if (d < bestD) [best, bestD] = [c, d];
    }
    return best;
  }

  // The chair that goes with this one: two chairs go together when each is the other's nearest
  // (so a chair someone puts down on its own doesn't hook up to a lift far away).
  partner(x, y, z, list = this.chairs()) {
    const b = this.nearest(x, y, z, list);
    const back = b && this.nearest(b[0], b[1], b[2], list);
    return back && back[0] === x && back[1] === y && back[2] === z ? b : null;
  }

  // The highest solid thing under (x, z) between heights lo and hi (or lo if there's nothing).
  ground(x, z, lo, hi) {
    for (let y = Math.ceil(hi); y >= Math.floor(lo); y--) if (this.world.isSolid(Math.floor(x), y, Math.floor(z))) return y + 1;
    return lo;
  }

  // Where a rider's seat goes, from chair a to chair b: hanging well clear of the ground in
  // between, and coming down to the chairs at each end. `side` moves it off to one side.
  path(a, b, side) {
    const A = new THREE.Vector3(a[0] + 0.5, a[1] + 0.45, a[2] + 0.5), Bv = new THREE.Vector3(b[0] + 0.5, b[1] + 0.45, b[2] + 0.5);
    const flat = Math.hypot(Bv.x - A.x, Bv.z - A.z) || 1;
    const sx = (Bv.z - A.z) / flat * side, sz = -(Bv.x - A.x) / flat * side;
    const n = Math.max(8, Math.round(A.distanceTo(Bv) / 1.5));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, p = new THREE.Vector3().lerpVectors(A, Bv, k);
      const ends = Math.min(k, 1 - k) * A.distanceTo(Bv);
      const clear = CLEAR * Math.min(1, ends / 4);
      const g = this.ground(p.x + sx * Math.min(1, ends / 2), p.z + sz * Math.min(1, ends / 2), Math.min(A.y, Bv.y) - 2, Math.max(A.y, Bv.y) + 12);
      p.y = Math.max(p.y + Math.sin(Math.PI * k) * 1.5, g + clear);
      p.x += sx * Math.min(1, ends / 2);
      p.z += sz * Math.min(1, ends / 2);
      pts.push(p);
    }
    // Smooth out the bumps (but never lower than it has to be).
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n; i++) pts[i].y = Math.max(pts[i].y, (pts[i - 1].y + pts[i + 1].y) / 2);
    }
    return pts;
  }

  // A ride from the chair at (x, y, z) to the other end: the seat positions along the way.
  ride(x, y, z) {
    const b = this.partner(x, y, z);
    if (!b) return null;
    const up = b[1] >= y;
    // Going up you ride the "up" side of the cable; coming down, the other side.
    const pts = this.path([x, y, z], b, up ? SIDE : -SIDE);
    return { pts, length: length(pts), to: b };
  }

  // Builds the cables and chairs again when lift chairs come or go.
  rebuild() {
    for (const l of this.lines) for (const o of l.objects) {
      this.group.remove(o);
      o.geometry?.dispose();
    }
    this.lines = [];
    const list = this.chairs(), done = new Set();
    for (const a of list) {
      const b = this.partner(...a, list);
      if (!b) continue;
      const key = [a.join(','), b.join(',')].sort().join('|');
      if (done.has(key)) continue;
      done.add(key);
      const [lo, hi] = a[1] <= b[1] ? [a, b] : [b, a];
      const up = this.path(lo, hi, SIDE), down = this.path(hi, lo, SIDE);
      const objects = [];
      for (const pts of [up, down]) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => p.clone().setY(p.y + 1.25))), this.cableMaterial);
        this.group.add(line);
        objects.push(line);
      }
      const len = length(up) + length(down);
      const n = Math.max(2, Math.round(len / 9));
      const chairs = [];
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(this.chairGeometry, this.chairMaterial);
        m.castShadow = true;
        this.group.add(m);
        objects.push(m);
        chairs.push(m);
      }
      this.lines.push({ up, down, upLen: length(up), len, chairs, objects });
    }
  }

  update(time) {
    if (this.version !== this.world.liftsVersion) {
      this.version = this.world.liftsVersion;
      this.rebuild();
    }
    // Chairs go round and round: up one side, down the other.
    for (const l of this.lines) {
      l.chairs.forEach((m, i) => {
        const s = ((time * SPEED) + (i / l.chairs.length) * l.len) % l.len;
        const [pts, d] = s < l.upLen ? [l.up, s] : [l.down, s - l.upLen];
        const p = along(pts, d), q = along(pts, d + 0.5);
        m.position.copy(p);
        m.rotation.y = Math.atan2(q.x - p.x, q.z - p.z) + Math.PI;
      });
    }
  }
}

export function length(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += pts[i].distanceTo(pts[i - 1]);
  return d;
}

// The point `d` along a line of points.
export function along(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const seg = pts[i].distanceTo(pts[i - 1]);
    if (d <= seg) return new THREE.Vector3().lerpVectors(pts[i - 1], pts[i], seg ? d / seg : 0);
    d -= seg;
  }
  return pts[pts.length - 1].clone();
}

// A chair hanging from the cable: seat, back, and the bar up to the cable.
function chairGeometry() {
  const parts = [
    new THREE.BoxGeometry(0.9, 0.08, 0.45).translate(0, 0, 0.05),
    new THREE.BoxGeometry(0.9, 0.4, 0.07).translate(0, 0.22, 0.25),
    new THREE.BoxGeometry(0.05, 1.0, 0.05).translate(0, 0.75, 0.25),
    new THREE.BoxGeometry(0.8, 0.04, 0.04).translate(0, 0.42, -0.2),
  ];
  return mergeAll(parts);
}

function mergeAll(list) {
  // (A tiny merge: positions and normals only.)
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const geo of list) {
    const p = geo.attributes.position, nn = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(nn.getX(i), nn.getY(i), nn.getZ(i));
    }
    for (const i of geo.index.array) idx.push(i + base);
    base += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
