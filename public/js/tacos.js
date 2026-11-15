// It's raining TACOS (paid for at the weather station: see weather.js). Real little 3D tacos
// tumble down all around you, land on the ground (and roofs) and lie there a moment before
// they vanish. Catch one (it hits you) and it's crunched: 🌮 × how many you've caught. Every
// player sees tacos falling round themselves (not the very same tacos: they're just for fun).
// Also: the weather station's mast, with its wind cups spinning and a light blinking on top.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAX = 360; // tacos at once
const RATE = 28; // new tacos a second
const AROUND = 26; // how far around you they fall
const LIE = 5; // seconds a landed taco lies there

function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

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
  return mergeGeometries(parts.map(g => {
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  }));
}

export class TacoRain {
  constructor(scene, world, sounds) {
    this.world = world;
    this.sounds = sounds;
    this.mesh = new THREE.InstancedMesh(tacoGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.tacos = [];
    this.until = 0;
    this.caught = 0;
    this.carry = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.onCatch = null;
  }

  start(seconds) {
    this.until = performance.now() + seconds * 1000;
  }

  get raining() {
    return performance.now() < this.until;
  }

  stop() {
    this.until = 0;
  }

  update(dt, me) {
    if (this.raining && me) {
      this.carry += RATE * dt;
      while (this.carry >= 1 && this.tacos.length < MAX) {
        this.carry--;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * AROUND;
        this.tacos.push({
          x: me.x + Math.cos(a) * r, y: me.y + 16 + Math.random() * 12, z: me.z + Math.sin(a) * r,
          vy: -(5 + Math.random() * 3), spin: [Math.random() * 6, Math.random() * 6, Math.random() * 6], w: [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6],
          landed: -1,
        });
      }
      this.carry = Math.min(this.carry, 1);
    }
    if (!this.tacos.length) {
      this.mesh.count = 0;
      return;
    }
    let n = 0;
    const keep = [];
    for (const t of this.tacos) {
      if (t.landed < 0) {
        t.y += t.vy * dt;
        for (let i = 0; i < 3; i++) t.spin[i] += t.w[i] * dt;
        // Caught! (It fell on you.)
        if (me && Math.abs(t.x - me.x) < 0.6 && Math.abs(t.z - me.z) < 0.6 && t.y > me.y && t.y < me.y + 2) {
          this.caught++;
          this.sounds?.noiseHit?.(2600, 0.06, 0.25);
          this.sounds?.noiseHit?.(1800, 0.05, 0.2, 'bandpass', 0.07);
          this.onCatch?.(this.caught);
          continue;
        }
        // Landed: on the ground, or on whatever's under it.
        const bx = Math.floor(t.x), by = Math.floor(t.y), bz = Math.floor(t.z);
        if (t.y < -2 || this.world.isSolid(bx, by, bz)) {
          t.y = by + 1.02;
          t.landed = 0;
          t.spin = [0, t.spin[1], 0]; // (lying flat, the right way up)
        }
      } else {
        t.landed += dt;
        if (t.landed > LIE) continue;
      }
      keep.push(t);
      const shrink = t.landed > LIE - 0.6 ? Math.max(0.01, (LIE - t.landed) / 0.6) : 1;
      this.e.set(t.spin[0], t.spin[1], t.spin[2]);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(t.x, t.y, t.z), this.q, this.s.setScalar(shrink));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.tacos = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
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
