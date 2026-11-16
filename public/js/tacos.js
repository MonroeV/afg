// Showers from the weather station (paid for by talking to Stormy: see weather.js). Real little
// 3D things tumble down all around you: 🌮 tacos, 🍦 ice cream cones, 🍕 pizza slices, 🍩 donuts,
// or 🐱🐶 cats and dogs floating down on little parachutes (and running off once they land!).
// Food lands on the ground (and roofs) and lies there a moment before it vanishes. Catch one (it
// hits you) and you've got it: 🍦 × how many you've caught. Every player sees things falling
// round themselves (not the very same ones: they're just for fun). Tacos and ice cream have
// their own songs ("Taco Rain BuildZone", "Ice Cream Rain BuildZone"), which play for everyone
// while it lasts (see ShowerSong).
// Also: the weather station's mast, with its wind cups spinning and a light blinking on top.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHOWERS } from './shared/weather.js';
import { asset } from './assets.js';

const AROUND = 26; // how far around you things fall
const LIE = 5; // seconds a landed thing lies there (or runs about)

function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const merge = parts => mergeGeometries(parts.map(g => {
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}));

// A taco: a golden shell folded like a U (a half disc, open at the top), with lettuce, meat,
// tomato and cheese poking out along the top.
function tacoGeometry() {
  const shell = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 18, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2);
  const parts = [colored(shell, 0xf2b84b)];
  const strip = (w, h, d, y, hex, x = 0) => parts.push(colored(new THREE.BoxGeometry(w, h, d).translate(x, y, 0), hex));
  strip(0.56, 0.06, 0.16, 0.01, 0x7a4a2a); // meat
  strip(0.5, 0.05, 0.18, 0.05, 0x5bbf3a); // lettuce
  for (const x of [-0.17, 0.02, 0.18]) strip(0.07, 0.05, 0.07, 0.08, 0xe53935, x); // tomato
  strip(0.4, 0.03, 0.12, 0.1, 0xffd54f, 0.03); // cheese
  return merge(parts);
}

// An ice cream cone: a waffle cone (point down) with a scoop or two, and a cherry on top.
function iceCreamGeometry(flavors) {
  const parts = [colored(new THREE.ConeGeometry(0.13, 0.38, 12).rotateX(Math.PI).translate(0, -0.13, 0), 0xd9a05b)];
  parts.push(colored(new THREE.TorusGeometry(0.12, 0.025, 6, 14).rotateX(Math.PI / 2).translate(0, 0.05, 0), 0xc68a45)); // (the rim)
  flavors.forEach((hex, i) => parts.push(colored(new THREE.SphereGeometry(0.15 - i * 0.02, 12, 9).translate(0, 0.11 + i * 0.2, 0), hex)));
  parts.push(colored(new THREE.SphereGeometry(0.04, 8, 6).translate(0, 0.27 + (flavors.length - 1) * 0.18, 0), 0xd50000));
  return merge(parts);
}
const FLAVORS = { strawberry: 0xf8a5c2, vanilla: 0xfff3d6, chocolate: 0x6d3b1e, mint: 0x9fe3c4 };

// A slice of pizza: a wedge of cheesy pizza with its crust round the edge and pepperoni on top.
function pizzaGeometry() {
  const wedge = Math.PI / 4, r = 0.44;
  const parts = [
    colored(new THREE.CylinderGeometry(r, r, 0.04, 8, 1, false, 0, wedge), 0xe8b060), // the base
    colored(new THREE.CylinderGeometry(r - 0.03, r - 0.03, 0.02, 8, 1, false, 0, wedge).translate(0, 0.025, 0), 0xffc93c), // cheese
    colored(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.08, 8, 1, true, 0, wedge).translate(0, 0.02, 0), 0xb87333), // the crust
  ];
  for (const [a, d] of [[0.25, 0.18], [0.55, 0.3], [0.3, 0.34], [0.6, 0.14]]) {
    const t = a * wedge;
    parts.push(colored(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10).translate(Math.sin(t) * d, 0.04, Math.cos(t) * d), 0xc62828));
  }
  const c = 0.27, mid = wedge / 2;
  return merge(parts).translate(-Math.sin(mid) * c, 0, -Math.cos(mid) * c); // (turn round its middle)
}

// A donut: golden dough with frosting on top, and sprinkles.
function donutGeometry(frosting, sprinkly) {
  const parts = [
    colored(new THREE.TorusGeometry(0.17, 0.08, 10, 20).rotateX(Math.PI / 2), 0xd99a4e),
    colored(new THREE.TorusGeometry(0.17, 0.076, 8, 20).rotateX(Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.035, 0), frosting),
  ];
  const colors = [0xff5252, 0xffeb3b, 0x40c4ff, 0x69f0ae, 0xffffff, 0xe040fb];
  for (let i = 0; sprinkly && i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + (i % 3) * 0.2, d = 0.13 + (i % 4) * 0.025;
    parts.push(colored(new THREE.BoxGeometry(0.045, 0.012, 0.014).rotateY(a * 3).translate(Math.cos(a) * d, 0.085, Math.sin(a) * d), colors[i % colors.length]));
  }
  return merge(parts);
}

// A blocky little dog or cat (standing on y = 0, its nose to -z).
function petGeometry(kind, fur, dark) {
  const cat = kind === 'cat', s = cat ? 1.1 : 1.3;
  const parts = [];
  const box = (w, h, d, x, y, z, hex) => parts.push(colored(new THREE.BoxGeometry(w * s, h * s, d * s).translate(x * s, y * s, z * s), hex));
  box(0.3, 0.22, 0.44, 0, 0.27, 0, fur); // body
  box(0.26, 0.24, 0.24, 0, 0.44, -0.3, fur); // head
  for (const x of [-0.1, 0.1]) for (const z of [-0.15, 0.15]) box(0.08, 0.17, 0.08, x, 0.085, z, dark); // legs
  for (const x of [-0.06, 0.06]) box(0.04, 0.05, 0.01, x, 0.48, -0.425, 0x111111); // eyes
  box(0.06, 0.04, 0.03, 0, 0.42, -0.43, cat ? 0xff8a9a : 0x111111); // nose
  if (cat) {
    for (const x of [-0.08, 0.08]) parts.push(colored(new THREE.ConeGeometry(0.055 * s, 0.11 * s, 4).rotateY(Math.PI / 4).translate(x * s, 0.61 * s, -0.3 * s), fur));
    box(0.05, 0.3, 0.05, 0, 0.42, 0.22, fur); // tail, up
  } else {
    for (const x of [-0.145, 0.145]) box(0.05, 0.16, 0.1, x, 0.42, -0.3, dark); // floppy ears
    box(0.14, 0.09, 0.08, 0, 0.38, -0.44, 0xf5e6d0); // snout
    box(0.05, 0.05, 0.2, 0, 0.36, 0.28, fur); // tail
  }
  return merge(parts);
}

// A striped parachute (with its strings), hanging over a pet.
function parachuteGeometry() {
  const dome = new THREE.SphereGeometry(0.7, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.25, 0);
  const pos = dome.attributes.position, cols = new Float32Array(pos.count * 3);
  const red = new THREE.Color(0xff5252), white = new THREE.Color(0xffffff), yellow = new THREE.Color(0xffd740);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i)) + Math.PI;
    const c = [red, white, yellow, white][Math.floor(a / (Math.PI / 4)) % 4];
    cols.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const parts = [dome];
  const to = new THREE.Vector3(0, 0.62, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const from = new THREE.Vector3(Math.cos(a) * 0.68, 1.25, Math.sin(a) * 0.68);
    const dir = to.clone().sub(from), len = dir.length();
    const string = new THREE.CylinderGeometry(0.006, 0.006, len, 4).translate(0, len / 2, 0);
    string.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    parts.push(colored(string.translate(from.x, from.y, from.z), 0xeeeeee));
  }
  return merge(parts);
}

// What each shower drops, and how it falls. models: a few looks, picked at random. rest: how high
// its middle is once it's lying on the ground; side: it lies on its side. Pets float down on
// parachutes and run about once they land.
const KINDS = {
  taco: { rate: 28, max: 360, fall: [5, 8], rest: 0.02, models: () => [tacoGeometry()] },
  icecream: {
    rate: 26, max: 340, fall: [4.5, 7], rest: 0.14, side: true,
    models: () => [[FLAVORS.strawberry], [FLAVORS.chocolate, FLAVORS.vanilla], [FLAVORS.mint], [FLAVORS.vanilla, FLAVORS.strawberry], [FLAVORS.chocolate]].map(iceCreamGeometry),
  },
  pizza: { rate: 26, max: 340, fall: [5, 8], rest: 0.03, models: () => [pizzaGeometry()] },
  donut: { rate: 26, max: 340, fall: [5, 8], rest: 0.08, models: () => [donutGeometry(0xff7eb6, true), donutGeometry(0x5d3420, true), donutGeometry(0xfafafa, true), donutGeometry(0x5d3420, false)] },
  pets: {
    rate: 7, max: 110, fall: [1.7, 2.3], rest: 0, parachute: true,
    models: () => [petGeometry('dog', 0xb07a4a, 0x7a4f2a), petGeometry('dog', 0xf2f2f2, 0x9e9e9e), petGeometry('cat', 0xf5a04a, 0xd27a2a), petGeometry('cat', 0x9e9e9e, 0x616161)],
    names: ['dog', 'dog', 'cat', 'cat'],
  },
};

export class ShowerRain {
  constructor(scene, world, sounds) {
    this.scene = scene;
    this.world = world;
    this.sounds = sounds;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = {}; // kind -> [an InstancedMesh for each look] (made the first time it rains that)
    this.all = [];
    this.things = [];
    this.kind = null;
    this.until = 0;
    this.caught = {};
    this.carry = 0;
    this.songs = {};
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.onCatch = null; // (kind, how many caught, which: 'dog'/'cat' for pets)
  }

  mesh(kind, i) {
    if (!this.meshes[kind]) {
      const def = KINDS[kind];
      this.meshes[kind] = def.models().map(geo => this.instanced(geo, def.max));
      if (def.parachute && !this.chutes) this.chutes = this.instanced(parachuteGeometry(), def.max);
    }
    return this.meshes[kind][i];
  }

  instanced(geo, max) {
    const mesh = new THREE.InstancedMesh(geo, this.material, max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.all.push(mesh);
    return mesh;
  }

  // A shower's song (tacos and ice cream have one), made the first time it's needed.
  song(kind) {
    const url = SHOWERS[kind]?.song;
    if (!url) return null;
    return (this.songs[kind] ??= new ShowerSong(asset(url)));
  }

  // seconds: how much of the shower is left (all of it, unless we've joined partway through).
  start(kind, seconds) {
    if (!KINDS[kind]) return;
    if (this.kind && this.kind !== kind) this.song(this.kind)?.stop(true);
    this.kind = kind;
    this.until = performance.now() + seconds * 1000;
    this.mesh(kind, 0);
    this.song(kind)?.play(SHOWERS[kind].seconds - seconds);
  }

  get raining() {
    return performance.now() < this.until;
  }

  stop() {
    this.until = 0;
    for (const s of Object.values(this.songs)) s.stop(true);
  }

  // volume: the game's sound volume (the songs follow it).
  update(dt, me, volume = 0.4) {
    for (const [kind, s] of Object.entries(this.songs)) {
      if (!this.raining || kind !== this.kind) s.stop();
      s.update(dt, volume);
    }
    const def = KINDS[this.kind];
    if (this.raining && me && def) {
      this.carry += def.rate * dt;
      const models = this.meshes[this.kind].length;
      while (this.carry >= 1 && this.things.length < def.max) {
        this.carry--;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * AROUND;
        const pet = !!def.parachute;
        this.things.push({
          kind: this.kind, look: Math.floor(Math.random() * models),
          x: me.x + Math.cos(a) * r, y: me.y + (pet ? 12 : 16) + Math.random() * 12, z: me.z + Math.sin(a) * r,
          vy: -(def.fall[0] + Math.random() * (def.fall[1] - def.fall[0])),
          spin: pet ? [0, Math.random() * 6.3, 0] : [Math.random() * 6, Math.random() * 6, Math.random() * 6],
          w: pet ? [0, 0, 0] : [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6],
          sway: Math.random() * 6.3, landed: -1,
        });
      }
      this.carry = Math.min(this.carry, 1);
    }
    for (const mesh of this.all) mesh.count = 0;
    if (!this.things.length) return;
    const keep = [];
    for (const t of this.things) {
      const k = KINDS[t.kind];
      if (t.landed < 0) {
        t.y += t.vy * dt;
        for (let i = 0; i < 3; i++) t.spin[i] += t.w[i] * dt;
        if (k.parachute) {
          // Floating down, swaying gently under the parachute.
          t.sway += dt * 1.6;
          t.x += Math.cos(t.sway) * 0.35 * dt;
        }
        // Caught! (It fell on you.)
        if (me && Math.abs(t.x - me.x) < 0.6 && Math.abs(t.z - me.z) < 0.6 && t.y > me.y && t.y < me.y + 2) {
          this.caught[t.kind] = (this.caught[t.kind] || 0) + 1;
          if (!k.parachute) {
            this.sounds?.noiseHit?.(2600, 0.06, 0.25);
            this.sounds?.noiseHit?.(1800, 0.05, 0.2, 'bandpass', 0.07);
          }
          this.onCatch?.(t.kind, this.caught[t.kind], k.names?.[t.look]);
          continue;
        }
        // Landed: on the ground, or on whatever's under it.
        const bx = Math.floor(t.x), by = Math.floor(t.y), bz = Math.floor(t.z);
        if (t.y < -2 || this.world.isSolid(bx, by, bz)) {
          t.y = by + 1 + k.rest;
          t.ground = t.y;
          t.landed = 0;
          t.spin = [k.side ? Math.PI / 2 : 0, t.spin[1], 0]; // (lying flat, the right way up, or on its side)
          t.run = Math.random() * Math.PI * 2;
        }
      } else {
        t.landed += dt;
        if (t.landed > LIE) continue;
        if (k.parachute) {
          // Off it runs (turning round at walls), with a little bounce in its step.
          const step = 2.6 * dt, nx = t.x + Math.cos(t.run) * step, nz = t.z + Math.sin(t.run) * step;
          if (this.world.isSolid(Math.floor(nx), Math.floor(t.ground + 0.1), Math.floor(nz))) t.run += Math.PI * (0.6 + Math.random() * 0.8);
          else {
            t.x = nx;
            t.z = nz;
          }
          t.spin[1] = Math.atan2(-Math.cos(t.run), -Math.sin(t.run));
          t.y = t.ground + Math.abs(Math.sin(t.landed * 14)) * 0.08;
        }
      }
      keep.push(t);
      const shrink = t.landed > LIE - 0.6 ? Math.max(0.01, (LIE - t.landed) / 0.6) : 1;
      this.e.set(t.spin[0], t.spin[1], t.spin[2]);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(t.x, t.y, t.z), this.q, this.s.setScalar(shrink));
      const mesh = this.meshes[t.kind][t.look];
      if (mesh.count < mesh.instanceMatrix.count) mesh.setMatrixAt(mesh.count++, this.m);
      if (k.parachute && t.landed < 0) {
        // The parachute, tilting a little with the sway.
        this.e.set(0, t.spin[1], Math.sin(t.sway) * 0.15);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(t.x, t.y, t.z), this.q, this.s.setScalar(1));
        if (this.chutes.count < this.chutes.instanceMatrix.count) this.chutes.setMatrixAt(this.chutes.count++, this.m);
      }
    }
    this.things = keep;
    for (const mesh of this.all) if (mesh.count) mesh.instanceMatrix.needsUpdate = true;
  }
}

// A shower's song. It's not fetched at all until the first time it rains that; then the browser
// streams it from the server (playing as it arrives, asking for just the part it needs if it
// starts partway through), and keeps it (it's asked for by its version, see assets.js), so the
// next time it plays straight from the browser's own copy. It fades in and out.
class ShowerSong {
  constructor(url) {
    this.url = url;
    this.audio = null;
    this.on = false;
    this.level = 0;
  }

  // Plays from `at` seconds in (the same bit everyone else is hearing).
  play(at = 0) {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'none';
      this.audio.src = this.url;
    }
    const a = this.audio;
    // (Where to start is worked out when it's ready to play: by then a bit more of the song has
    // gone by for everyone else.)
    this.startedAt = performance.now() - at * 1000;
    const seek = () => {
      try {
        a.currentTime = Math.max(0, (performance.now() - this.startedAt) / 1000);
      } catch { /* not seekable yet */ }
    };
    if (a.readyState >= 1) seek();
    else a.addEventListener('loadedmetadata', seek, { once: true });
    this.on = true;
    a.play().catch(() => {}); // (a browser that won't play sound yet: no song, the tacos still fall)
  }

  // Fades out (or stops at once).
  stop(now = false) {
    this.on = false;
    if (now && this.audio) {
      this.level = 0;
      this.audio.volume = 0;
      this.audio.pause();
    }
  }

  update(dt, volume) {
    const a = this.audio;
    if (!a) return;
    // (Fades go by the clock, not the frame rate: a slow computer fades just as smoothly.)
    const now = performance.now();
    dt = Math.min(1, (now - (this.at || now)) / 1000);
    this.at = now;
    const want = this.on ? Math.min(1, volume * 1.5) : 0;
    const speed = this.on ? 1.5 : 0.4; // (a quick fade in, a slow fade out)
    this.level += Math.sign(want - this.level) * Math.min(Math.abs(want - this.level), dt * speed);
    a.volume = Math.max(0, Math.min(1, this.level));
    if (!this.on && this.level <= 0.001 && !a.paused) a.pause();
  }
}

// The weather station's mast: three cups on arms spinning in the wind, and a red light that
// blinks. at: [x, y, z] of the lamp block on top.
export class WeatherMast {
  constructor(scene, at) {
    this.group = new THREE.Group();
    this.group.position.set(at[0] + 0.5, at[1] + 1, at[2] + 0.5);
    const metal = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.4, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), metal);
    pole.position.y = 0.4;
    this.spin = new THREE.Group();
    this.spin.position.y = 0.8;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.55), metal);
      arm.position.set(Math.sin(a) * 0.27, 0, Math.cos(a) * 0.27);
      arm.rotation.y = a;
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      cup.rotation.z = Math.PI / 2;
      cup.position.set(Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55);
      cup.rotation.y = a;
      this.spin.add(arm, cup);
    }
    this.light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff1744 }));
    this.light.position.y = 1.0;
    this.group.add(pole, this.spin, this.light);
    scene.add(this.group);
  }

  update(dt, time) {
    this.spin.rotation.y += dt * 4;
    this.light.visible = Math.sin(time * 4) > 0;
  }
}
