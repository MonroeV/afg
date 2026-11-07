// Rain. Now and then (not often: the server decides, so everybody gets the same weather) a shower
// rolls in: the sky greys over, the fog closes in, rain streaks down around you with little
// splashes, and you hear it pattering (muffled when you're indoors). Afterwards, a rainbow.
//
// Rain never falls inside: each drop stops at the first roof (or floor, or anything solid) above
// the ground in its column, and holes in a roof (an elevator or ladder shaft, a hatch, a
// skylight a few blocks wide) count as roof too, so it can't drip down them into a building.
import * as THREE from 'three';
import { BLOCKS, blockId, itemOf, shapeOf, isSnowyAt, WORLD } from './shared/blocks.js';

const R = 24; // rain falls this far round you
const HOLE = 3; // a gap in a roof up to this far from its edges (7 blocks across) still counts as roof

export class Weather {
  // vehicles: () => their boxes ([x0, y0, z0, x1, y1, z1]).
  constructor(scene, world, sounds, vehicles = () => []) {
    this.world = world;
    this.sounds = sounds;
    this.vehicles = vehicles;
    this.cover = [];
    this.target = 0; // how hard it's raining (0..1), as the server says
    this.rain = 0; // and as shown (it eases in and out)
    this.rainbow = 0; // a rainbow after the rain (seconds left)
    this.tops = new Map(); // column -> the height rain stops at there (the roof, or the ground)
    this.ownTops = new Map();
    this.revision = -1;
    this.setQuality(1000);
    this.splashes = this.makeSplashes(scene);
    this.rainbowMesh = makeRainbow();
    scene.add(this.rainbowMesh);
    scene.add(this.lines);
  }

  // How many raindrops at most (fewer on low graphics).
  setQuality(n) {
    if (this.lines && this.count === n) return;
    this.count = n;
    const pos = new Float32Array(n * 6);
    this.drops = Array.from({ length: n }, () => ({ x: 0, y: -999, z: 0, stop: 0, v: 18 + Math.random() * 6 }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (!this.lines) {
      this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaebfcf, transparent: true, opacity: 0.55, depthWrite: false }));
      this.lines.frustumCulled = false;
      this.lines.visible = false;
    } else {
      this.lines.geometry.dispose();
      this.lines.geometry = geo;
    }
    this.placed = false;
  }

  makeSplashes(scene) {
    const n = 120, pos = new Float32Array(n * 3).fill(-999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8e6f2, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, life: new Float32Array(n), next: 0 };
  }

  // The server says: raining (how hard), or not.
  set(rain) {
    const was = this.target;
    this.target = Math.max(0, Math.min(1, rain || 0));
    if (was > 0 && !this.target) this.rainbow = 50; // (the rain's stopped: a rainbow)
  }

  get raining() {
    return this.rain > 0.02;
  }

  // ---------- Where the rain stops ----------

  // The top of the first thing (from the sky down) that rain can't get through in this column.
  // Flowers, railings and ladders let it through; carpets and roads catch it right at the ground.
  ownTop(x, z) {
    const k = (x + 1024) * 4096 + (z + 1024);
    let t = this.ownTops.get(k);
    if (t !== undefined) return t;
    t = 0;
    if (x >= WORLD.min && x <= WORLD.max && z >= WORLD.min && z <= WORLD.max) {
      for (let y = WORLD.maxY; y >= 0; y--) {
        const v = this.world.get(x, y, z);
        if (!v) continue;
        const item = itemOf(v), shape = shapeOf(item);
        if (shape === 'plant' || shape === 'rail' || shape === 'ladder' || shape === 'picture') continue;
        const def = BLOCKS[blockId(item)];
        t = y + (shape === 'flat' ? 0.06 : shape === 'model' && def?.box ? def.box[4] : 1);
        break;
      }
    }
    this.ownTops.set(k, t);
    return t;
  }

  // Where rain stops in a column: its own roof, or, if it's in a hole in a roof (a shaft, a
  // hatch: roof on every side within a few blocks, higher up than its own top), that roof.
  top(x, z) {
    if (this.revision !== this.world.revision) {
      this.revision = this.world.revision;
      this.tops.clear();
      this.ownTops = new Map();
    }
    const k = (x + 1024) * 4096 + (z + 1024);
    let t = this.tops.get(k);
    if (t !== undefined) return t;
    t = this.ownTop(x, z);
    let roof = Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let found = 0;
      for (let d = 1; d <= HOLE && !found; d++) {
        const n = this.ownTop(x + dx * d, z + dz * d);
        if (n > t + 2.5) found = n;
      }
      if (!found) {
        roof = 0;
        break;
      }
      roof = Math.min(roof, found);
    }
    if (roof > t) t = roof;
    this.tops.set(k, t);
    return t;
  }

  // The roof of a vehicle over this spot (vehicles keep the rain off too), or -Infinity.
  vehicleTop(x, z) {
    let t = -Infinity;
    for (const b of this.cover) if (x > b[0] && x < b[3] && z > b[2] && z < b[5]) t = Math.max(t, b[4]);
    return t;
  }

  // Is this spot out of the rain (under a roof, or in a vehicle)?
  sheltered(x, y, z) {
    return this.top(Math.floor(x), Math.floor(z)) > y + 0.5 || this.vehicleTop(x, z) > y + 0.5;
  }

  // ---------- Every frame ----------

  // camera: where you are. Returns how dark the rain makes things (0..1), for the sky.
  update(dt, camera) {
    this.rain += (this.target - this.rain) * Math.min(1, dt * 0.25);
    if (this.target === 0 && this.rain < 0.01) this.rain = 0;
    this.rainbow = Math.max(0, this.rainbow - dt);
    const c = camera.position;
    const snowy = isSnowyAt(c.x, c.z); // (up north it snows instead)
    const show = this.rain > 0.01 && !snowy;
    this.lines.visible = show;
    this.splashes.pts.visible = show;
    this.updateSound(dt, c, show);
    this.updateRainbow(c);
    if (!show) {
      this.placed = false;
      return this.rain;
    }
    // (Just the vehicles near enough to be rained on round here.)
    this.cover = this.vehicles().filter(b => b[3] > c.x - R - 2 && b[0] < c.x + R + 2 && b[5] > c.z - R - 2 && b[2] < c.z + R + 2);
    const drops = this.drops, n = Math.round(drops.length * Math.min(1, this.rain * 1.15));
    const a = this.lines.geometry.attributes.position.array;
    const sp = this.splashes, spa = sp.pts.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      // (Spread out the first time; after that, new drops start up above you.)
      if (!this.placed || d.y < d.stop || Math.abs(d.x - c.x) > R || Math.abs(d.z - c.z) > R) {
        if (this.placed && d.y < d.stop && d.stop > -50 && Math.abs(d.x - c.x) < 12 && Math.abs(d.z - c.z) < 12) {
          // A little splash where it landed.
          const j = sp.next = (sp.next + 1) % sp.life.length;
          spa.set([d.x, d.stop + 0.03, d.z], j * 3);
          sp.life[j] = 0.12;
        }
        d.x = c.x + (Math.random() * 2 - 1) * R;
        d.z = c.z + (Math.random() * 2 - 1) * R;
        const top = c.y + 14 + Math.random() * 6;
        d.y = this.placed ? top : c.y - 6 + Math.random() * 26;
        d.stop = Math.max(this.top(Math.floor(d.x), Math.floor(d.z)), this.vehicleTop(d.x, d.z));
        if (d.stop >= d.y) d.y = d.stop = -999; // (under a roof that's higher up than the rain: none here)
      }
      d.y -= d.v * dt;
      const k = i * 6;
      if (d.y < -500) {
        a[k + 1] = a[k + 4] = -999;
        continue;
      }
      a[k] = d.x;
      a[k + 1] = d.y;
      a[k + 2] = d.z;
      a[k + 3] = d.x - 0.03;
      a[k + 4] = Math.max(d.stop, d.y + 0.7);
      a[k + 5] = d.z - 0.02;
    }
    for (let i = n; i < drops.length; i++) a[i * 6 + 1] = a[i * 6 + 4] = -999;
    this.placed = true;
    this.lines.geometry.attributes.position.needsUpdate = true;
    for (let j = 0; j < sp.life.length; j++) {
      if (sp.life[j] <= 0) continue;
      sp.life[j] -= dt;
      if (sp.life[j] <= 0) spa[j * 3 + 1] = -999;
    }
    sp.pts.geometry.attributes.position.needsUpdate = true;
    this.lines.material.opacity = 0.35 + 0.25 * this.rain;
    return this.rain;
  }

  // The patter of rain (quieter and duller indoors).
  updateSound(dt, c, show) {
    const s = this.sounds;
    if (!s.ctx || !s.master) return;
    if (!this.noise) {
      if (!show) return;
      const ctx = s.ctx, len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(s.master);
      src.start();
      this.noise = { filter, gain };
    }
    const indoors = this.sheltered(c.x, c.y, c.z);
    const want = show ? this.rain * (indoors ? 0.05 : 0.13) : 0;
    const g = this.noise.gain.gain;
    g.value += (want - g.value) * Math.min(1, dt * 2);
    this.noise.filter.frequency.value += ((indoors ? 700 : 2400) - this.noise.filter.frequency.value) * Math.min(1, dt * 3);
  }

  // A rainbow across the sky for a little while after the rain (in the daytime).
  updateRainbow(c) {
    const m = this.rainbowMesh;
    const k = Math.min(1, this.rainbow / 8) * (this.dayK ?? 1);
    m.visible = k > 0.01;
    if (!m.visible) return;
    m.position.set(c.x, -40, c.z - 380);
    for (const part of m.children) part.material.opacity = 0.38 * k;
  }
}

// Seven colored bands, a big half circle far off in the sky.
function makeRainbow() {
  const g = new THREE.Group();
  ['#ff4d4d', '#ff9f43', '#ffe66d', '#7bd389', '#4dabf7', '#5c7cfa', '#b197fc'].forEach((color, i) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(260 - i * 9, 4.6, 6, 64, Math.PI),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    g.add(band);
  });
  g.renderOrder = -1;
  g.visible = false;
  return g;
}
