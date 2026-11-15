// Build Book things that you can ride or play with: swings, zip lines, basketball hoops and hot
// air balloons. Every player's game spots them in the blocks (structures.js) and draws their
// moving parts; riding them happens in your own game, and everyone else just sees you move
// (sitting on the swing, hanging off the zip line, up in your balloon).
import * as THREE from 'three';
import { rocketModel, parachuteModel, volcanoModel, fishTankModel, carouselModel, CAROUSEL_R, wellModel, coinModel, rainbowModel, RAINBOW_R } from './playthings.js';

// The newer Build Book things (playthings.js draws them).
const TOYS = ['rocket', 'volcano', 'fishtank', 'carousel', 'well', 'rainbow'];
const ROCKET_UP = 55; // how high a rocket goes
const WISHES = ['a pony 🐴', 'a giant ice cream 🍦', 'a rainbow dragon 🐉', 'a castle made of candy 🍭', 'a trip to the moon 🌙', 'a puppy that can talk 🐶', 'a mountain of pizza 🍕', 'a magic unicorn 🦄', 'a treehouse in the clouds ☁️', 'a pet dinosaur 🦕'];
const SWING_R = 2.3; // rope length
const SWING_W = Math.sqrt(28 / SWING_R); // how fast it swings (like a real pendulum)
const ZIP_RANGE = 80; // how far apart two zip line posts can be
const ZIP_MAX = 15; // top speed on a zip line
const BALLOON_COLORS = [[0xe53935, 0xfdd835], [0x1e88e5, 0xffffff], [0x43a047, 0xffeb3b], [0x8e24aa, 0xff7043], [0xff4fa3, 0x4fd2ff]];

const rope = new THREE.MeshStandardMaterial({ color: 0xc9b38a, roughness: 0.9 });
const wood = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.8 });
const red = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.6 });
const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
const orange = new THREE.MeshStandardMaterial({ color: 0xff6d1f, roughness: 0.4, metalness: 0.3 });
const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8 });
const cableMat = new THREE.LineBasicMaterial({ color: 0x24272d });

// A hot air balloon: a big striped balloon over a wicker basket, with ropes between them.
// `basket` adds the basket (a balloon waiting on its pad uses the planks instead).
export function balloonModel(seed = 0, basket = true) {
  const [c1, c2] = BALLOON_COLORS[Math.abs(seed) % BALLOON_COLORS.length];
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(2.2, 24, 16);
  geo.scale(1, 1.15, 1);
  const colors = [], pos = geo.attributes.position, a = new THREE.Color(c1), b = new THREE.Color(c2);
  for (let i = 0; i < pos.count; i++) {
    const stripe = Math.floor(((Math.atan2(pos.getZ(i), pos.getX(i)) / Math.PI + 1) * 8 + 0.5)) % 2;
    const c = stripe ? a : b;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const envelope = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
  envelope.position.y = 5.4;
  envelope.castShadow = true;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.45, 0.7, 14, 1, true), new THREE.MeshStandardMaterial({ color: c1, roughness: 0.6, side: THREE.DoubleSide }));
  skirt.position.y = 2.95;
  g.add(envelope, skirt);
  // Ropes from the bottom of the balloon down to the basket's corners.
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    const top = new THREE.Vector3(x * 0.7, 2.7, z * 0.7), bottom = new THREE.Vector3(x, 1.1, z);
    const len = top.distanceTo(bottom);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 4), rope);
    r.position.copy(top).add(bottom).multiplyScalar(0.5);
    r.lookAt(top);
    r.rotateX(Math.PI / 2);
    g.add(r);
  }
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.7, roughness: 0.4 }));
  burner.position.y = 2.45;
  g.add(burner);
  if (basket) {
    const wicker = new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.9 });
    for (const [w, d, x, z] of [[1.3, 0.08, 0, -0.62], [1.3, 0.08, 0, 0.62], [0.08, 1.3, -0.62, 0], [0.08, 1.3, 0.62, 0]]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(w, 1.05, d), wicker);
      side.position.set(x, 0.52, z);
      side.castShadow = true;
      g.add(side);
    }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.3), wicker);
    floor.position.y = 0.02;
    g.add(floor);
  }
  g.envelope = envelope;
  return g;
}

export class Contraptions {
  constructor({ scene, world, structures, effects, sounds }) {
    this.scene = scene;
    this.world = world;
    this.structures = structures;
    this.effects = effects;
    this.sounds = sounds;
    this.version = -1;
    this.items = new Map(); // structure key -> what's drawn for it
    this.zips = []; // { a, b, pts, line }
    this.ride = null;
    this.streak = { n: 0, at: 0 };
  }

  key(s) {
    return `${s.type}:${s.x},${s.y},${s.z}`;
  }

  // ---------- Drawing ----------

  // Puts in what's new, takes out what's gone (only when the blocks change).
  rebuild() {
    const want = new Map();
    for (const s of this.structures.list.values()) if (['swing', 'hoop', 'balloon', ...TOYS].includes(s.type)) want.set(this.key(s), s);
    for (const [k, item] of this.items) {
      const s = want.get(k);
      if (s && (s.type !== 'hoop' || (s.fx === item.s.fx && s.fz === item.s.fz)) && (s.type !== 'rainbow' || (s.ax === item.s.ax && s.az === item.s.az))) continue;
      this.scene.remove(item.group);
      this.items.delete(k);
      if (this.ride?.item === item && item.s.type !== 'balloon' && item.s.type !== 'rocket') this.end();
    }
    for (const [k, s] of want) {
      if (this.items.has(k)) continue;
      const item = s.type === 'swing' ? this.makeSwing(s) : s.type === 'hoop' ? this.makeHoop(s) : s.type === 'balloon' ? this.makeBalloon(s) : this.makeToy(s);
      this.scene.add(item.group);
      this.items.set(k, item);
    }
    // Zip lines: two posts go together when each is the other's nearest.
    for (const z of this.zips) this.scene.remove(z.line);
    this.zips = [];
    const posts = this.structures.ofType('zipline');
    const nearest = p => {
      let best = null, bestD = ZIP_RANGE;
      for (const q of posts) {
        if (q === p) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        if (d < bestD && d > 3) [best, bestD] = [q, d];
      }
      return best;
    };
    for (const p of posts) {
      const q = nearest(p);
      if (!q || nearest(q) !== p || this.zips.some(z => z.a === q)) continue;
      const pts = cablePoints(p, q);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat);
      this.scene.add(line);
      this.zips.push({ a: p, b: q, pts, line });
    }
  }

  makeSwing(s) {
    const pivot = new THREE.Vector3(s.x + s.ax + 0.5, s.y + 3, s.z + s.az + 0.5);
    const group = new THREE.Group();
    group.position.copy(pivot);
    for (const side of [-0.38, 0.38]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, SWING_R, 0.03), rope);
      r.position.set(s.ax * side, -SWING_R / 2, s.az * side);
      group.add(r);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(s.ax ? 0.9 : 0.42, 0.07, s.ax ? 0.42 : 0.9), red);
    seat.position.y = -SWING_R;
    seat.castShadow = true;
    group.add(seat);
    return { s, group, pivot, dir: s.ax ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), theta: 0 };
  }

  makeHoop(s) {
    const group = new THREE.Group();
    const f = new THREE.Vector3(s.fx, 0, s.fz);
    const top = new THREE.Vector3(s.x + 0.5, s.y + 3, s.z + 0.5);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 0.06), [white, white, white, white, boardFront(), white]);
    board.position.copy(top).addScaledVector(f, 0.45).setY(s.y + 3.55);
    board.rotation.y = Math.atan2(s.fx, s.fz);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 22).rotateX(Math.PI / 2), orange);
    const center = top.clone().addScaledVector(f, 0.82).setY(s.y + 3.2); // (out past the pole, so the ball drops clear of it)
    ring.position.copy(center);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.36, 12, 2, true), netMat);
    net.position.copy(center).setY(center.y - 0.19);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.55), orange);
    arm.position.copy(top).addScaledVector(f, 0.38).setY(center.y);
    arm.rotation.y = board.rotation.y;
    board.castShadow = true;
    group.add(board, ring, net, arm);
    // The backboard is solid to the ball (bank shots!).
    const c = board.position, hw = s.fx ? 0.04 : 0.63, hd = s.fx ? 0.63 : 0.04;
    return { s, group, center, net, box: [c.x - hw, c.y - 0.43, c.z - hd, c.x + hw, c.y + 0.43, c.z + hd], wiggle: 0, cool: 0 };
  }

  makeBalloon(s) {
    const group = balloonModel(s.x * 7 + s.z * 13, false);
    group.position.set(s.x + 0.5, s.y + 0.6, s.z + 0.5);
    return { s, group, seed: s.x * 7 + s.z * 13 };
  }

  // The newer things: a rocket, a volcano, a fish tank, a merry-go-round, a wishing well, a rainbow.
  makeToy(s) {
    const c = new THREE.Vector3(s.x + 0.5, s.y + 1, s.z + 0.5);
    const seed = Math.abs(s.x * 7 + s.z * 13);
    let group, r = 1.6;
    if (s.type === 'rocket') [group, r] = [rocketModel(), 1.4];
    else if (s.type === 'volcano') [group, r] = [volcanoModel(), 1.7];
    else if (s.type === 'fishtank') {
      group = fishTankModel(seed);
      c.y -= 0.5; // (in the water)
      r = 0.9;
    } else if (s.type === 'carousel') [group, r] = [carouselModel(), 2];
    else if (s.type === 'well') [group, r] = [wellModel(), 1.3];
    else {
      group = rainbowModel();
      c.set(s.x + 0.5 + s.ax * RAINBOW_R, s.y + 0.6, s.z + 0.5 + s.az * RAINBOW_R);
      group.rotation.y = s.ax ? 0 : Math.PI / 2;
      r = 0;
    }
    group.position.copy(c);
    return { s, group, c, r, seed, t: 0, next: 30 + (seed % 40) };
  }

  update(dt, time, others = [], me = null) {
    if (this.version !== this.structures.version) {
      this.version = this.structures.version;
      this.rebuild();
    }
    this.updateCoins(dt);
    for (const item of this.items.values()) {
      const t = item.s.type;
      if (TOYS.includes(t)) {
        this.updateToy(item, dt, time, me);
        continue;
      }
      if (t === 'swing') {
        let theta = Math.sin(time * 1.3 + item.s.x) * 0.05;
        if (this.ride?.item === item) theta = this.ride.theta;
        else {
          // Someone else swinging on it: the seat goes with them.
          for (const a of others) {
            if (!a.sitting) continue;
            const rel = a.pos.clone().setY(a.pos.y + 0.76).sub(item.pivot);
            const side = rel.x * item.s.ax + rel.z * item.s.az, along = rel.dot(item.dir);
            if (Math.abs(side) < 0.6 && Math.abs(Math.hypot(along, rel.y) - SWING_R) < 0.6) theta = Math.atan2(along, -rel.y);
          }
        }
        item.theta = theta;
        if (item.s.ax) item.group.rotation.x = -theta;
        else item.group.rotation.z = theta;
      } else if (t === 'hoop') {
        item.cool -= dt;
        item.wiggle = Math.max(0, item.wiggle - dt * 2.5);
        item.net.scale.set(1 + item.wiggle * 0.25, 1 + item.wiggle * 0.5, 1 + item.wiggle * 0.25);
      } else if (t === 'balloon') {
        item.group.visible = this.ride?.item !== item;
        item.group.envelope.position.y = 5.4 + Math.sin(time * 0.8 + item.seed) * 0.15;
      }
    }
  }

  updateToy(item, dt, time, me) {
    const { s, group, c } = item;
    const near = me ? Math.hypot(me.x - c.x, me.z - c.z) < 60 : true;
    if (s.type === 'carousel') {
      group.spin.rotation.y = time * 0.55;
      for (const h of group.horses) h.horse.position.y = 0.95 + Math.sin(time * 2.2 + h.a * 2) * 0.16;
    } else if (s.type === 'fishtank') {
      const fast = item.fed > 0 ? 2.2 : 1;
      item.fed = Math.max(0, (item.fed || 0) - dt);
      item.swim = (item.swim || 0) + dt * fast;
      group.fish.forEach((f, i) => {
        const a = item.swim * (0.7 + i * 0.25) + i * 2.1, r = 0.22 + i * 0.05;
        f.position.set(Math.cos(a) * r, -0.15 + i * 0.12 + Math.sin(item.swim * 2 + i) * 0.04 + (item.fed > 0 ? 0.12 : 0), Math.sin(a) * r);
        f.rotation.y = -a - Math.PI / 2;
      });
      for (const [i, w] of (group.weeds || []).entries()) w.rotation.z = Math.sin(time * 1.5 + i) * 0.15;
      if (near && Math.random() < dt * 0.8) this.effects.fizz(c.x + (Math.random() - 0.5) * 0.5, c.y - 0.3, c.z + (Math.random() - 0.5) * 0.5);
    } else if (s.type === 'volcano') {
      const top = c.y + 1.75;
      item.erupt = Math.max(0, (item.erupt || 0) - dt);
      const glow = item.erupt > 0 ? 1 : 0.75 + Math.sin(time * 3 + item.seed) * 0.15;
      group.lava.material.color.setRGB(1, 0.35 + glow * 0.25, 0.08 * glow);
      if (!near) return;
      if (item.erupt > 0) {
        // Lava blobs flying out, and lots of smoke.
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
          this.effects.glow.spawn({ x: c.x, y: top, z: c.z, vx: Math.cos(a) * sp, vy: 6 + Math.random() * 6, vz: Math.sin(a) * sp, life: 1.4 + Math.random() * 0.6, size: 0.45, grow: -0.15, color: [1, 0.3 + Math.random() * 0.45, 0.05], gravity: 9, alpha: 0.95 });
        }
        if (Math.random() < dt * 14) this.effects.smokePuff(c.x, top + 0.3, c.z, 0.85);
      } else if (Math.random() < dt * 0.6) this.effects.smokePuff(c.x, top + 0.2, c.z, 0.4);
      // Now and then it rumbles all by itself.
      item.next -= dt;
      if (item.next <= 0 && me && Math.hypot(me.x - c.x, me.z - c.z) < 35) {
        item.next = 45 + Math.random() * 40;
        this.erupt(item, 2.5);
      }
    } else if (s.type === 'rainbow') {
      group.children.forEach((b, i) => (b.material.opacity = 0.45 + Math.sin(time * 1.2 + i * 0.5) * 0.12));
    } else if (s.type === 'rocket') {
      if (item.show) {
        // Someone else's rocket taking off (they're in it): up it goes, then it's back.
        item.show.t += dt;
        const k = item.show.t;
        if (k < 3) group.position.y = c.y + Math.sin(k * 40) * 0.02;
        else if (k < 7) {
          group.position.y = c.y + 0.5 * 14 * (k - 3) * (k - 3);
          this.effects.flame(group.position.x, group.position.y - 0.1, group.position.z, 1.2);
          if (Math.random() < 0.5) this.effects.smokePuff(group.position.x, group.position.y - 0.4, group.position.z, 0.3);
        } else {
          group.visible = false;
          if (k > 12) {
            item.show = null;
            group.position.copy(c);
            group.visible = true;
            this.effects.sparkle(c.x, c.y, c.z, 20);
          }
        }
      }
    }
  }

  // ---------- Playing with the toys ----------

  // The nearest of the toys you're pointing at (the ray from your eye), if it's close.
  pick(origin, dir, max = 7) {
    let best = null, bestD = max;
    for (const item of this.items.values()) {
      if (!TOYS.includes(item.s.type) || !item.r) continue;
      const c = item.c.clone();
      if (item.s.type !== 'fishtank') c.y += item.r * 0.6;
      const to = c.sub(origin), along = to.dot(dir);
      if (along < 0 || along > bestD) continue;
      if (to.lengthSq() - along * along < item.r * item.r) [best, bestD] = [item.s, along];
    }
    return best;
  }

  // Right-clicked a volcano, a fish tank or a wishing well. Returns what to tell the player.
  use(s) {
    const item = this.items.get(this.key(s));
    if (!item) return null;
    const { c } = item;
    if (s.type === 'volcano') {
      this.erupt(item, 4);
      return '🌋 KABOOM!';
    }
    if (s.type === 'fishtank') {
      item.fed = 6;
      for (let i = 0; i < 14; i++) this.effects.glow.spawn({ x: c.x + (Math.random() - 0.5) * 0.5, y: c.y + 0.55, z: c.z + (Math.random() - 0.5) * 0.5, vx: 0, vy: -0.25 - Math.random() * 0.2, vz: 0, life: 2.2, size: 0.07, color: [0.75, 0.5, 0.25] });
      this.effects.heartsAt(c.x, c.y + 0.6, c.z, 4);
      this.sounds.tone?.(880, 1320, 0.15, 0.08, 'sine');
      return '🐠 Yum!';
    }
    if (s.type === 'well') {
      // Toss a coin: it arcs up and plops into the water.
      const coin = coinModel();
      coin.position.set(c.x, c.y + 1.4, c.z);
      this.scene.add(coin);
      item.coin = { mesh: coin, t: 0, mine: true };
      this.sounds.tone?.(1568, 2093, 0.12, 0.1, 'triangle');
      return null; // (the wish comes when it lands)
    }
    return null;
  }

  // Someone else played with one: their eruption, their fish food, their wish, their rocket.
  remote(kind, x, y, z) {
    for (const item of this.items.values()) {
      const { s } = item;
      if (Math.abs(s.x - x) > 1 || Math.abs(s.z - z) > 1 || Math.abs(s.y - y) > 1) continue;
      if (kind === 'volcano' && s.type === 'volcano') this.erupt(item, 4);
      else if (kind === 'feed' && s.type === 'fishtank') this.use(s);
      else if (kind === 'wish' && s.type === 'well') this.effects.sparkle(item.c.x, item.c.y, item.c.z, 24);
      else if (kind === 'rocket' && s.type === 'rocket' && !item.show && this.ride?.item !== item) item.show = { t: 0 };
    }
  }

  erupt(item, seconds) {
    item.erupt = Math.max(item.erupt || 0, seconds);
    const { c } = item;
    this.sounds.noiseHit?.(70, 1.4, 0.35, 'lowpass');
    this.sounds.boom?.(0.5);
    for (let i = 0; i < 10; i++) this.effects.smokePuff(c.x + (Math.random() - 0.5), c.y + 1.9, c.z + (Math.random() - 0.5), 0.9);
  }

  // A coin flying into a well (then the wish).
  updateCoins(dt) {
    for (const item of this.items.values()) {
      const k = item.coin;
      if (!k) continue;
      k.t += dt;
      const p = Math.min(1, k.t / 0.8);
      k.mesh.position.set(item.c.x, item.c.y + 1.4 + Math.sin(p * Math.PI) * 0.8 - p * 1.6, item.c.z);
      k.mesh.rotation.y += dt * 12;
      if (p < 1) continue;
      this.scene.remove(k.mesh);
      item.coin = null;
      this.effects.splash(item.c.x, item.c.y - 0.1, item.c.z);
      this.effects.sparkle(item.c.x, item.c.y, item.c.z, 30);
      this.effects.heartsAt(item.c.x, item.c.y + 0.5, item.c.z, 5);
      this.sounds.tone?.(1046, 1568, 0.5, 0.12, 'sine');
      if (k.mine) this.onSay?.(`⭐ You wished for ${WISHES[Math.floor(Math.random() * WISHES.length)]}`);
    }
  }

  // ---------- The basketball hoop ----------

  // The backboards near a box, for the ball to bounce off.
  boxes(r) {
    const out = [];
    for (const item of this.items.values()) {
      const b = item.box;
      if (b && b[0] < r[3] && b[3] > r[0] && b[1] < r[4] && b[4] > r[1] && b[2] < r[5] && b[5] > r[2]) out.push(b);
    }
    return out;
  }

  // Did the ball just drop through a hoop (from above)? Returns the streak if it scored.
  checkBall(prev, pos, now) {
    for (const item of this.items.values()) {
      if (item.s.type !== 'hoop' || item.cool > 0) continue;
      const c = item.center;
      if (!(prev.y >= c.y && pos.y < c.y)) continue;
      const k = (prev.y - c.y) / Math.max(1e-6, prev.y - pos.y);
      const x = prev.x + (pos.x - prev.x) * k, z = prev.z + (pos.z - prev.z) * k;
      if (Math.hypot(x - c.x, z - c.z) > 0.27) continue;
      item.cool = 0.8;
      item.wiggle = 1;
      this.streak.n = now - this.streak.at < 20000 ? this.streak.n + 1 : 1;
      this.streak.at = now;
      return { item, streak: this.streak.n };
    }
    return null;
  }

  // ---------- Rides ----------

  get riding() {
    return this.ride?.kind || null;
  }

  // Right-clicked a swing, zip line post or balloon: hop on. Returns what to tell the player.
  start(s, player) {
    if (this.ride) return null;
    const item = this.items.get(this.key(s));
    if (s.type === 'swing' && item) {
      this.ride = { kind: 'swing', item, theta: 0, amp: 0.25, phase: 0, last: null, space: true };
      player.yaw = Math.atan2(-item.dir.x, -item.dir.z);
      player.flying = false;
      return '🛝 Hold W to swing higher! Press Space to jump off. (S slows you down)';
    }
    if (s.type === 'zipline') {
      const same = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
      const z = this.zips.find(z => same(z.a, s) || same(z.b, s));
      if (!z) return '🧗 Build another zip line post (a bit lower, up to 80 blocks away) to zip to!';
      const fromA = same(z.a, s), other = fromA ? z.b : z.a;
      if (other.y > s.y + 1) return '⬆️ This is the bottom of the zip line. Climb up to the other post and zip down to here!';
      const pts = fromA ? z.pts : [...z.pts].reverse();
      this.ride = { kind: 'zip', pts, len: length(pts), d: 0.9, v: 2.5 };
      player.flying = false;
      this.sounds.whoosh();
      return '🧗 Wheeeee!';
    }
    if (s.type === 'rocket' && item) {
      if (item.show) return null;
      // Into the rocket (your head pokes out of the top), and the countdown starts.
      player.pos.set(item.c.x, item.c.y + 0.9, item.c.z);
      player.flying = false;
      this.ride = { kind: 'rocket', item, phase: 'count', t: 0, v: 0, beeps: 0, top: Math.min(60, item.c.y + ROCKET_UP) };
      return '🚀 3… 2… 1…';
    }
    if (s.type === 'carousel' && item) {
      // Onto the nearest horse.
      let best = 0, bestD = Infinity;
      item.group.horses.forEach((h, i) => {
        const p = new THREE.Vector3();
        h.horse.getWorldPosition(p);
        const d = p.distanceTo(player.pos);
        if (d < bestD) [best, bestD] = [i, d];
      });
      player.flying = false;
      this.ride = { kind: 'carousel', item, horse: item.group.horses[best], space: true };
      this.sounds.tone?.(523, 784, 0.25, 0.1, 'triangle');
      return '🎠 Wheee! (Space hops off)';
    }
    if (s.type === 'balloon' && item) {
      const model = balloonModel(item.seed, true);
      this.scene.add(model);
      player.pos.set(s.x + 0.5, s.y + 1, s.z + 0.5);
      player.flying = false;
      this.ride = { kind: 'balloon', item, model, vel: new THREE.Vector3(), t: 0, burn: 0 };
      this.sounds.whoosh();
      return '🎈 Up, up and away! Space fires the burner (up), Shift lets air out (down), WASD steers.';
    }
    return null;
  }

  end() {
    if (this.ride?.model) this.scene.remove(this.ride.model);
    if (this.ride?.chute) this.scene.remove(this.ride.chute);
    if (this.ride?.kind === 'rocket') {
      this.ride.item.group.position.copy(this.ride.item.c);
      this.ride.item.group.visible = true;
    }
    this.ride = null;
  }

  // Moves you along while you ride. Returns true while riding (and what to tell the player, if
  // anything, in this.said).
  updateRide(dt, keys, player) {
    const r = this.ride;
    if (!r) return false;
    this.said = null;
    player.vel.set(0, 0, 0);
    if (r.kind === 'swing') {
      const it = r.item;
      if (keys.has('KeyW') || keys.has('ArrowUp')) r.amp = Math.min(1.25, r.amp + 0.45 * dt);
      else if (keys.has('KeyS') || keys.has('ArrowDown')) r.amp = Math.max(0, r.amp - 0.9 * dt);
      else r.amp *= Math.exp(-0.1 * dt);
      r.phase += SWING_W * dt;
      r.theta = r.amp * Math.sin(r.phase);
      const seat = it.pivot.clone().addScaledVector(it.dir, Math.sin(r.theta) * SWING_R).setY(it.pivot.y - Math.cos(r.theta) * SWING_R);
      const feet = seat.setY(seat.y + 0.04 - 0.72);
      const space = keys.has('Space');
      if (space && !r.space && r.last) {
        // Jump off: fly on with the swing's speed (and a little hop).
        player.vel.copy(feet).sub(r.last).divideScalar(Math.max(dt, 1e-3)).multiplyScalar(1.15);
        player.vel.y = Math.max(player.vel.y, 0) + 4;
        player.pos.copy(feet);
        this.end();
        this.sounds.whoosh();
        return false;
      }
      r.space = space;
      r.last = feet.clone();
      player.pos.copy(feet);
      return true;
    }
    if (r.kind === 'zip') {
      const p = along(r.pts, r.d), q = along(r.pts, r.d + 1);
      r.v = Math.max(3, Math.min(ZIP_MAX, r.v + ((p.y - q.y) * 9 + 1.5) * dt));
      r.d += r.v * dt;
      player.pos.copy(along(r.pts, r.d)).setY(along(r.pts, r.d).y - 2);
      player.yaw = Math.atan2(-(q.x - p.x), -(q.z - p.z));
      if (r.d >= r.len - 1.2) {
        // Let go at the end, carrying on a little.
        const dir = new THREE.Vector3(q.x - p.x, 0, q.z - p.z).normalize();
        player.vel.copy(dir).multiplyScalar(Math.min(r.v, 6) * 0.5);
        this.end();
        this.sounds.land();
        return false;
      }
      return true;
    }
    if (r.kind === 'carousel') {
      const p = new THREE.Vector3();
      r.horse.horse.getWorldPosition(p);
      // Sitting on the saddle (hips on it), riding round.
      player.pos.set(p.x, p.y + 0.17 - 0.72, p.z);
      const space = keys.has('Space');
      if (space && !r.space) {
        // Hop off, outward.
        const c = r.item.c, out = new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize();
        player.pos.set(c.x + out.x * (CAROUSEL_R + 1.4), c.y, c.z + out.z * (CAROUSEL_R + 1.4));
        player.vel.set(out.x * 2, 4, out.z * 2);
        this.end();
        return false;
      }
      r.space = space;
      return true;
    }
    if (r.kind === 'rocket') return this.rideRocket(r, dt, keys, player);
    if (r.kind === 'balloon') {
      r.t += dt;
      const up = keys.has('Space'), down = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyC');
      // (It rises when you set off, then hovers until you let some air out.)
      const want = up ? 3 : down ? -2.5 : r.t < 4 ? 1.8 : 0;
      r.vel.y += (want - r.vel.y) * Math.min(1, dt * 1.5);
      // Steering: WASD pushes the basket along, slowly (it's a balloon). A breeze helps.
      const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      r.vel.x += (-sin * f + cos * s) * 2.2 * dt;
      r.vel.z += (-cos * f - sin * s) * 2.2 * dt;
      const drag = Math.exp(-0.45 * dt);
      r.vel.x = r.vel.x * drag + 0.25 * dt;
      r.vel.z *= drag;
      const hs = Math.hypot(r.vel.x, r.vel.z);
      if (hs > 5) r.vel.multiplyScalar(5 / hs).setY(r.vel.y);
      const solid = (x, y, z) => this.world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z));
      const p = player.pos;
      const nx = p.x + r.vel.x * dt, nz = p.z + r.vel.z * dt;
      if (!solid(nx, p.y + 0.5, nz) && !solid(nx, p.y + 1.5, nz)) p.set(nx, p.y, nz);
      else r.vel.set(0, r.vel.y, 0);
      if (r.vel.y > 0 && (p.y > 58 || solid(p.x, p.y + 8, p.z))) r.vel.y = 0;
      const ny = p.y + r.vel.y * dt;
      if (r.vel.y < 0 && solid(p.x, ny - 0.05, p.z) && r.t > 2) {
        // Touched down.
        p.y = Math.floor(ny - 0.05) + 1;
        this.end();
        this.sounds.land();
        this.said = '🎈 Nice landing!';
        return false;
      }
      p.y = ny;
      r.model.position.copy(p);
      r.burn -= dt;
      if (up && r.burn <= 0) {
        r.burn = 0.08;
        this.effects.flame(p.x, p.y + 2.6, p.z, 0.8);
      }
      return true;
    }
    return false;
  }
}

// (Riding a rocket: the countdown, blast off, the fireworks at the top, then down you float.)
Contraptions.prototype.rideRocket = function (r, dt, keys, player) {
  const it = r.item, c = it.c, model = it.group;
  r.t += dt;
  const solid = (x, y, z) => this.world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z));
  if (r.phase === 'count') {
    // 3, 2, 1: a beep a second, smoke round the bottom, and a shake.
    if (r.t >= r.beeps) {
      r.beeps++;
      this.sounds.tone?.(r.beeps > 3 ? 1320 : 660, r.beeps > 3 ? 1320 : 660, 0.15, 0.14, 'square');
    }
    if (Math.random() < dt * 12) this.effects.smokePuff(c.x + (Math.random() - 0.5) * 1.2, c.y + 0.1, c.z + (Math.random() - 0.5) * 1.2, 0.2);
    model.position.set(c.x + (Math.random() - 0.5) * 0.03 * r.t, c.y, c.z + (Math.random() - 0.5) * 0.03 * r.t);
    player.pos.set(model.position.x, c.y + 0.9, model.position.z);
    if (r.t >= 3) {
      r.phase = 'up';
      r.t = 0;
      this.sounds.whoosh?.();
      this.sounds.boom?.(0.4);
      this.onLaunch?.(it.s);
    }
    return true;
  }
  if (r.phase === 'up') {
    r.v = Math.min(26, r.v + 16 * dt);
    let y = model.position.y + r.v * dt;
    const blocked = solid(c.x, y + 3.2, c.z);
    model.position.set(c.x, y, c.z);
    player.pos.set(c.x, y + 0.9, c.z);
    this.effects.flame(c.x, y - 0.05, c.z, 1.3);
    this.effects.flame(c.x, y - 0.3, c.z, 1);
    if (Math.random() < dt * 25) this.effects.smokePuff(c.x, y - 0.6, c.z, 0.25);
    if (y >= r.top || blocked) {
      // The top: fireworks! And out you pop, with a parachute.
      y = model.position.y;
      this.onApex?.(c.x, y + 3, c.z);
      this.effects.sparkle(c.x, y + 2.5, c.z, 40);
      model.visible = false;
      r.chute = parachuteModel();
      this.scene.add(r.chute);
      r.phase = 'chute';
      r.t = 0;
      player.pos.set(c.x, y + 2.6, c.z);
      this.said = '🪂 WASD steers!';
    }
    return true;
  }
  // Floating down: slowly, steering with WASD, until you touch the ground.
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw), p = player.pos;
  const nx = p.x + (-sin * f + cos * s) * 3.5 * dt, nz = p.z + (-cos * f - sin * s) * 3.5 * dt;
  if (!solid(nx, p.y + 0.5, nz) && !solid(nx, p.y + 1.5, nz)) p.set(nx, p.y, nz);
  const ny = p.y - 3 * dt;
  r.chute.position.set(p.x, ny, p.z);
  r.chute.rotation.z = Math.sin(r.t * 1.5) * 0.06;
  if (solid(p.x, ny - 0.05, p.z) || ny < -0.5) {
    p.y = Math.max(0, Math.floor(ny - 0.05) + 1);
    this.scene.remove(r.chute);
    model.position.copy(c);
    model.visible = true; // (a new one, on the pad)
    this.ride = null;
    this.sounds.land?.();
    this.said = '🚀 What a trip!';
    return false;
  }
  p.y = ny;
  return true;
};

// The cable between two zip line posts: from the top of each, sagging a little in the middle.
function cablePoints(a, b) {
  const A = new THREE.Vector3(a.x + 0.5, a.y + 1.05, a.z + 0.5), B = new THREE.Vector3(b.x + 0.5, b.y + 1.05, b.z + 0.5);
  const sag = A.distanceTo(B) * 0.03, pts = [];
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    pts.push(new THREE.Vector3().lerpVectors(A, B, k).setY(A.y + (B.y - A.y) * k - Math.sin(Math.PI * k) * sag));
  }
  return pts;
}

function length(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += pts[i].distanceTo(pts[i - 1]);
  return d;
}

function along(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const seg = pts[i].distanceTo(pts[i - 1]);
    if (d <= seg) return new THREE.Vector3().lerpVectors(pts[i - 1], pts[i], seg ? d / seg : 0);
    d -= seg;
  }
  return pts[pts.length - 1].clone();
}

// The front of a backboard: white with a red border and a red square over the hoop.
let boardMaterial = null;
function boardFront() {
  if (boardMaterial) return boardMaterial;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 88;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f6f6';
  ctx.fillRect(0, 0, 128, 88);
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 82);
  ctx.lineWidth = 5;
  ctx.strokeRect(44, 40, 40, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  boardMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  return boardMaterial;
}
