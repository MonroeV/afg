// Little extras that make the game feel alive: debris, fireworks and sound effects.
import * as THREE from 'three';

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.list = [];
  }

  burst(x, y, z, material, count = 12) {
    const mat = Array.isArray(material) ? material[material.length - 1] : material;
    if (!mat) return;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geometry, mat);
      m.position.set(x + Math.random(), y + Math.random(), z + Math.random());
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      m.castShadow = true;
      this.scene.add(m);
      this.list.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 5 + 1, (Math.random() - 0.5) * 5),
        life: 0.6 + Math.random() * 0.4,
      });
    }
  }

  update(dt, world) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.vel.y -= 20 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      if (world.isSolid(Math.floor(pos.x), Math.floor(pos.y - 0.06), Math.floor(pos.z))) {
        pos.y = Math.floor(pos.y - 0.06) + 1.06;
        p.vel.multiplyScalar(0.4);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      p.mesh.scale.setScalar(Math.min(1, p.life * 3));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}

// ---------- Fireworks ----------

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// How many fireworks (rockets plus bursts) can be in the sky at once.
export const MAX_FIREWORKS = 8;
const STYLES = ['peony', 'ring', 'willow', 'chrysanthemum', 'glitter', 'crossette', 'heart', 'smiley'];

export class Fireworks {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects; // for spark trails
    this.texture = glowTexture();
    this.rockets = [];
    this.bursts = [];
    // A few colored lights that flash when a firework bursts. They stay in the scene
    // all the time (just dark when unused) so materials never need recompiling.
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 170, 1.6);
      scene.add(light);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
      halo.scale.setScalar(40);
      halo.renderOrder = 4;
      scene.add(halo);
      this.lights.push({ light, halo, life: 0, color: new THREE.Color() });
    }
    this.flash = 0; // 0..1, how much the whole sky is lit up right now
    this.flashColor = new THREE.Color();
  }

  get active() {
    return this.rockets.length + this.bursts.filter(b => !b.child).length;
  }

  points(count, size) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({
      size, map: this.texture, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    });
    mat.color.setScalar(1.5); // extra bright, so it glows
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    this.scene.add(pts);
    return pts;
  }

  // Returns false if the sky is already too full of fireworks.
  launch(x, y, z, color, seed = Math.random()) {
    if (this.active >= MAX_FIREWORKS) return false;
    const trail = this.points(16, 0.6);
    this.rockets.push({
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(Math.sin(seed * 20) * 1.5, 26 + (seed * 7) % 6, Math.cos(seed * 20) * 1.5),
      fuse: 1.1 + (seed * 3) % 0.5,
      color: new THREE.Color(color),
      seed,
      trail,
      history: [],
    });
    return true;
  }

  // Directions for each kind of burst (unit-ish vectors, scaled by speed later).
  shape(style, n, seed) {
    const dirs = [];
    const rand = () => Math.random() * 2 - 1;
    const sphere = () => new THREE.Vector3(rand(), rand(), rand()).normalize();
    // A flat shape, turned to face a random way.
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(seed * 4, seed * 9, 0));
    const flat = (x, y) => new THREE.Vector3(x, y, 0).applyQuaternion(tilt);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (style === 'ring') dirs.push(i % 5 === 0 ? sphere().multiplyScalar(0.35) : flat(Math.cos(a), Math.sin(a)));
      else if (style === 'heart') {
        const hx = 16 * Math.sin(a) ** 3, hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
        dirs.push(flat(hx / 17, hy / 17));
      } else if (style === 'smiley') {
        const part = i % 4;
        if (part < 2) dirs.push(flat(Math.cos(a), Math.sin(a)));
        else if (part === 2) dirs.push(flat(Math.cos(Math.PI * 1.15 + (i / n) * Math.PI * 0.7) * 0.6, Math.sin(Math.PI * 1.15 + (i / n) * Math.PI * 0.7) * 0.6));
        else dirs.push(flat((i % 8 < 4 ? -0.3 : 0.3) + rand() * 0.05, 0.3 + rand() * 0.05));
      } else dirs.push(sphere().multiplyScalar(style === 'peony' || style === 'crossette' ? 1 : 0.75 + Math.random() * 0.25));
    }
    return dirs;
  }

  explode(r) {
    const style = STYLES[Math.floor(r.seed * 1000) % STYLES.length];
    const n = { crossette: 18, smiley: 200, ring: 180, willow: 160 }[style] || 240;
    const pts = this.points(n, style === 'crossette' ? 2.2 : 1.2);
    const second = new THREE.Color().setHSL((r.seed * 7) % 1, 1, 0.6);
    const gold = new THREE.Color(1, 0.75, 0.3);
    const colors = pts.geometry.attributes.color;
    const speed = style === 'willow' ? 15 : style === 'crossette' ? 13 : 19;
    const vel = this.shape(style, n, r.seed).map(d => d.multiplyScalar(speed * (0.9 + Math.random() * 0.15)));
    for (let i = 0; i < n; i++) {
      let c = r.color;
      if (style === 'willow') c = gold;
      else if (style === 'glitter') c = new THREE.Color().setHSL(Math.random(), 1, 0.65);
      else if (style === 'peony' || style === 'chrysanthemum') c = i % 3 === 0 ? second : r.color;
      else if (style === 'smiley') c = new THREE.Color(1, 0.9, 0.2);
      colors.setXYZ(i, c.r, c.g, c.b);
      pts.geometry.attributes.position.setXYZ(i, r.pos.x, r.pos.y, r.pos.z);
    }
    colors.needsUpdate = true;
    const life = style === 'willow' ? 3.6 : 2.6;
    this.bursts.push({
      pts, vel, style, life, maxLife: life, age: 0, base: colors.array.slice(),
      drag: style === 'willow' ? 1.6 : style === 'crossette' ? 1.0 : 1.3,
      gravity: style === 'willow' ? 5 : 3.5,
      trails: style === 'willow' || style === 'chrysanthemum',
      color: r.color,
    });

    // Light up the town and the sky in the burst's color.
    const slot = this.lights.reduce((a, b) => (b.life < a.life ? b : a));
    slot.life = 1;
    slot.color.copy(style === 'willow' ? gold : r.color);
    slot.light.position.copy(r.pos);
    slot.light.color.copy(slot.color);
    slot.halo.position.copy(r.pos);
    slot.halo.material.color.copy(slot.color);
    this.flash = Math.min(1.5, this.flash + 1);
    this.flashColor.copy(slot.color);
  }

  // Crossette stars split into little bursts of their own.
  split(b) {
    const pos = b.pts.geometry.attributes.position;
    const per = 14, n = b.vel.length * per;
    const pts = this.points(n, 0.9);
    const vel = [];
    const colors = pts.geometry.attributes.color;
    for (let i = 0; i < b.vel.length; i++) {
      for (let j = 0; j < per; j++) {
        const k = i * per + j;
        pts.geometry.attributes.position.setXYZ(k, pos.getX(i), pos.getY(i), pos.getZ(i));
        vel.push(new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(6));
        colors.setXYZ(k, b.color.r, b.color.g, b.color.b);
      }
    }
    colors.needsUpdate = true;
    this.bursts.push({ pts, vel, style: 'split', life: 1.4, maxLife: 1.4, age: 0, drag: 1.5, gravity: 4, child: true });
  }

  // Returns positions of new explosions (for the boom sound).
  update(dt) {
    const booms = [];
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.fuse -= dt;
      r.vel.y -= 6 * dt;
      r.pos.addScaledVector(r.vel, dt);
      r.history.unshift(r.pos.clone());
      r.history.length = Math.min(r.history.length, 16);
      const pos = r.trail.geometry.attributes.position, col = r.trail.geometry.attributes.color;
      for (let j = 0; j < 16; j++) {
        const p = r.history[Math.min(j, r.history.length - 1)];
        pos.setXYZ(j, p.x, p.y, p.z);
        const k = 1 - j / 16;
        col.setXYZ(j, k, k * 0.8, k * 0.5);
      }
      pos.needsUpdate = col.needsUpdate = true;
      if (Math.random() < 0.6) this.effects?.glow.spawn({ x: r.pos.x, y: r.pos.y, z: r.pos.z, vx: (Math.random() - 0.5) * 2, vy: -2, vz: (Math.random() - 0.5) * 2, life: 0.5, size: 0.2, color: [1, 0.7, 0.3], gravity: 4 });
      if (r.fuse <= 0) {
        this.scene.remove(r.trail);
        r.trail.geometry.dispose();
        r.trail.material.dispose();
        this.explode(r);
        booms.push(r.pos.clone());
        this.rockets.splice(i, 1);
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      b.age += dt;
      const pos = b.pts.geometry.attributes.position;
      const drag = Math.exp(-b.drag * dt);
      for (let j = 0; j < b.vel.length; j++) {
        const v = b.vel[j];
        v.multiplyScalar(drag);
        v.y -= b.gravity * dt;
        pos.setXYZ(j, pos.getX(j) + v.x * dt, pos.getY(j) + v.y * dt, pos.getZ(j) + v.z * dt);
        // Willows and chrysanthemums leave glittering trails.
        if (b.trails && j % 7 === 0 && Math.random() < 0.5 && b.age < b.maxLife * 0.8) {
          const c = b.style === 'willow' ? [1, 0.6, 0.2] : [b.color.r, b.color.g, b.color.b];
          this.effects?.glow.spawn({ x: pos.getX(j), y: pos.getY(j), z: pos.getZ(j), vy: -0.5, life: 0.6, size: 0.35, color: c, gravity: 1.5, alpha: 0.7 });
        }
      }
      pos.needsUpdate = true;
      if (b.style === 'glitter') {
        // Twinkle!
        const col = b.pts.geometry.attributes.color;
        for (let j = 0; j < b.vel.length; j++) {
          const k = Math.random() < 0.3 ? 0.15 : 1;
          col.setXYZ(j, b.base[j * 3] * k, b.base[j * 3 + 1] * k, b.base[j * 3 + 2] * k);
        }
        col.needsUpdate = true;
      }
      if (b.style === 'crossette' && !b.didSplit && b.age > 0.6) {
        b.didSplit = true;
        this.split(b);
        b.life = Math.min(b.life, 0.15);
      }
      b.pts.material.opacity = Math.min(1, b.life / (b.maxLife * 0.45));
      b.pts.material.size = (b.style === 'crossette' ? 2.2 : 1.2) + b.age * 0.15;
      if (b.life <= 0) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
    for (const l of this.lights) {
      l.life = Math.max(0, l.life - dt / 1.6);
      l.light.intensity = 6000 * l.life ** 2;
      l.halo.material.opacity = l.life * 0.28;
      l.halo.visible = l.life > 0;
    }
    this.flash *= Math.exp(-2.5 * dt);
    return booms;
  }
}

// ---------- Particle emitters (smoke, fire, sparkles, hearts…) ----------

function spriteTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d'));
  return new THREE.CanvasTexture(c);
}

export const SPRITES = {
  glow: () => glowTexture(),
  smoke: () => spriteTexture(ctx => {
    for (let i = 0; i < 6; i++) {
      const x = 22 + Math.random() * 20, y = 22 + Math.random() * 20, r = 14 + Math.random() * 10;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
  }),
  heart: () => spriteTexture(ctx => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(32, 54);
    ctx.bezierCurveTo(4, 34, 8, 8, 32, 20);
    ctx.bezierCurveTo(56, 8, 60, 34, 32, 54);
    ctx.fill();
  }),
  note: () => spriteTexture(ctx => {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', 32, 34);
  }),
  z: () => spriteTexture(ctx => {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 46px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z', 32, 34);
  }),
};

export class Emitter {
  constructor(scene, sprite, { max = 1200, additive = false } = {}) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.p = []; // per-particle settings
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: SPRITES[sprite]() }, scale: { value: 400 } },
      vertexShader: `
        attribute vec3 pcolor; attribute float alpha; attribute float size;
        uniform float scale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vColor = pcolor; vAlpha = alpha;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  // o: { x, y, z, vx, vy, vz, life, size, grow, color: [r, g, b], gravity, drag, alpha }
  spawn(o) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.p[i] = { vx: 0, vy: 0, vz: 0, life: 1, size: 0.5, grow: 0, gravity: 0, drag: 0, alpha: 1, ...o, age: 0 };
    this.pos.set([o.x, o.y, o.z], i * 3);
    this.col.set(o.color || [1, 1, 1], i * 3);
  }

  update(dt, camera, height) {
    this.material.uniforms.scale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (let i = 0; i < this.count; i++) {
      const p = this.p[i];
      p.age += dt;
      if (p.age >= p.life) {
        // Swap the last particle into this slot.
        const last = --this.count;
        this.p[i] = this.p[last];
        this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
        this.col.copyWithin(i * 3, last * 3, last * 3 + 3);
        i--;
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k;
      p.vy = p.vy * k - p.gravity * dt;
      this.pos[i * 3] += p.vx * dt;
      this.pos[i * 3 + 1] += p.vy * dt;
      this.pos[i * 3 + 2] += p.vz * dt;
      const t = p.age / p.life;
      this.alpha[i] = p.alpha * Math.min(1, t * 6) * (1 - t);
      this.size[i] = p.size + p.grow * p.age;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.count);
    // Only send the particles that are alive to the graphics card (nothing at all when
    // there are none, which is most of the time).
    if (this.count || this.wasCount) {
      for (const name of ['position', 'pcolor', 'alpha', 'size']) {
        const attr = g.attributes[name];
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, Math.max(1, this.count) * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
    this.wasCount = this.count;
  }
}

// All the emitters the game uses, with handy effect presets.
export class Effects {
  constructor(scene) {
    this.glow = new Emitter(scene, 'glow', { additive: true, max: 4000 });
    this.smoke = new Emitter(scene, 'smoke', { max: 1500 });
    this.hearts = new Emitter(scene, 'heart', { max: 200 });
    this.notes = new Emitter(scene, 'note', { max: 200 });
    this.zzz = new Emitter(scene, 'z', { max: 60 });
  }

  update(dt, camera, height) {
    for (const e of [this.glow, this.smoke, this.hearts, this.notes, this.zzz]) e.update(dt, camera, height);
  }

  smokePuff(x, y, z, dark = 0.5) {
    const c = 0.25 + (1 - dark) * 0.5;
    this.smoke.spawn({ x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 2.5, size: 0.6, grow: 1.1, color: [c, c, c], alpha: 0.8, drag: 0.5 });
  }

  flame(x, y, z, size = 1) {
    const r = Math.random();
    this.glow.spawn({ x: x + (Math.random() - 0.5) * 0.6 * size, y, z: z + (Math.random() - 0.5) * 0.6 * size, vx: (Math.random() - 0.5) * 0.4, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.4, life: 0.5 + Math.random() * 0.4, size: 0.5 * size, grow: -0.4 * size, color: [1, 0.35 + r * 0.4, 0.05], alpha: 0.9 });
  }

  explosion(x, y, z) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, sp = 3 + Math.random() * 9;
      this.glow.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.abs(Math.sin(b)) * sp + 2, vz: Math.sin(a) * Math.cos(b) * sp, life: 0.6 + Math.random() * 0.7, size: 1.4, grow: -0.8, color: [1, 0.4 + Math.random() * 0.4, 0.1], gravity: 6, drag: 2 });
    }
    for (let i = 0; i < 40; i++) this.smoke.spawn({ x: x + (Math.random() - 0.5) * 2, y: y + Math.random(), z: z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 3 + Math.random() * 2, size: 1.2, grow: 1.6, color: [0.18, 0.18, 0.18], alpha: 0.9, drag: 1.2 });
  }

  sparkle(x, y, z, count = 20) {
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color().setHSL(Math.random(), 1, 0.65);
      const a = Math.random() * Math.PI * 2;
      this.glow.spawn({ x: x + Math.cos(a) * 0.6, y: y + Math.random() * 2, z: z + Math.sin(a) * 0.6, vx: Math.cos(a) * 0.5, vy: 0.5 + Math.random() * 1.5, vz: Math.sin(a) * 0.5, life: 1 + Math.random(), size: 0.25, color: [c.r, c.g, c.b] });
    }
  }

  heartsAt(x, y, z, count = 6) {
    for (let i = 0; i < count; i++) this.hearts.spawn({ x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.3, z: z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 0.5, vy: 1 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.5, life: 1.4, size: 0.35, color: [1, 0.3 + Math.random() * 0.3, 0.5] });
  }

  note(x, y, z) {
    const c = new THREE.Color().setHSL(Math.random(), 1, 0.6);
    this.notes.spawn({ x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 0.6, vy: 1.2, vz: (Math.random() - 0.5) * 0.6, life: 1.6, size: 0.45, color: [c.r, c.g, c.b] });
  }

  snore(x, y, z) {
    this.zzz.spawn({ x, y, z, vx: 0.3, vy: 0.5, vz: 0.1, life: 2.2, size: 0.3, grow: 0.15, color: [0.8, 0.9, 1] });
  }

  spray(x, y, z) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6;
    this.glow.spawn({ x, y, z, vx: Math.cos(a) * r, vy: 5 + Math.random() * 1.5, vz: Math.sin(a) * r, life: 1.1, size: 0.18, color: [0.5, 0.75, 1], gravity: 9, alpha: 0.8 });
  }
}

// ---------- Sounds ----------
// Everything is synthesized with the Web Audio API, so there are no audio files.

// Every sound is a little different each time it plays (pitch, length, loudness), so the
// same noises over and over don't wear on your ears. Steady engine and rotor drones also
// fade back a little while nothing changes, the way your ears stop noticing a hum.
const jitter = k => 1 + (Math.random() * 2 - 1) * k;

export class Sounds {
  constructor() {
    this.ctx = null;
    this.volume = 0.4;
    this.shared = null; // while set, a group of sounds (a melody, a horn) shares one pitch change
    this.engCalm = 0;
    this.rotCalm = 0;
    this.voice = { pitch: 1, q: 1, sub: 0.35 };
  }

  // Plays a group of sounds that should stay in tune with each other.
  together(fn) {
    this.shared = jitter(0.025);
    try {
      fn();
    } finally {
      this.shared = null;
    }
  }

  // How "settled" a steady sound is (0..1): it creeps up while nothing changes and drops
  // quickly when something does. Returns the new value.
  settle(calm, changing, dt) {
    return changing ? Math.max(0, calm - dt * 2.5) : Math.min(1, calm + dt / 14);
  }

  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  noiseHit(freq, duration, gain, type = 'bandpass', delay = 0) {
    const ctx = this.ensure();
    if (!ctx || gain <= 0.001) return;
    freq *= this.shared ?? jitter(0.12);
    duration *= jitter(0.1);
    gain *= 0.8 + Math.random() * 0.2;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = 0.9 + Math.random() * 0.6;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration);
  }

  tone(from, to, duration, gain, type = 'sine', delay = 0) {
    const ctx = this.ensure();
    if (!ctx || gain <= 0.001) return;
    const k = this.shared ?? jitter(0.05);
    from *= k;
    to *= k;
    duration *= this.shared ? 1 : jitter(0.06);
    gain *= 0.85 + Math.random() * 0.15;
    const osc = ctx.createOscillator();
    osc.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration);
  }

  place() { this.noiseHit(900, 0.08, 0.8); this.tone(220, 120, 0.08, 0.5, 'triangle'); }
  break() { this.noiseHit(500, 0.22, 1.2); this.noiseHit(1800, 0.1, 0.5); }
  swing() { this.noiseHit(2500, 0.07, 0.15); }
  jump() { this.noiseHit(700, 0.06, 0.25); }
  land() { this.noiseHit(300, 0.1, 0.5); }
  bounce() { this.tone(180, 720, 0.25, 0.5, 'sine'); }
  click() { this.tone(900, 700, 0.04, 0.25, 'square'); }
  door(open) {
    this.tone(open ? 260 : 420, open ? 420 : 240, 0.25, 0.25, 'triangle');
    this.noiseHit(400, 0.08, 0.6, 'bandpass', 0.22);
  }
  bump() { this.noiseHit(160, 0.25, 1.4, 'lowpass'); }
  horn(volume = 1, pitch = 1) {
    this.together(() => {
      this.tone(330 * pitch, 325 * pitch, 0.38, 0.25 * volume, 'square');
      this.tone(415 * pitch, 410 * pitch, 0.38, 0.22 * volume, 'square');
    });
  }
  launch(volume = 1) { this.tone(500, 1800, 0.8, 0.12 * volume, 'sine'); this.noiseHit(3000, 0.6, 0.15 * volume, 'highpass'); }
  boom(volume = 1) {
    this.noiseHit(120, 1.2, 1.6 * volume, 'lowpass');
    for (let i = 0; i < 6; i++) this.noiseHit(3000 + Math.random() * 3000, 0.08, 0.2 * volume, 'bandpass', 0.3 + Math.random() * 0.6);
  }
  spawnCar() { this.together(() => { this.tone(300, 600, 0.15, 0.3, 'triangle'); this.tone(600, 900, 0.15, 0.3, 'triangle', 0.12); }); }
  tune() {
    // A short happy melody for dancing.
    const notes = [523, 659, 784, 659, 698, 880, 784, 0, 659, 784, 1047];
    this.together(() => notes.forEach((f, i) => f && this.tone(f, f * 0.99, 0.18, 0.18, 'square', i * 0.16)));
  }

  // ---------- Vehicles ----------

  // Each vehicle sounds a bit different: monster trucks rumble deeper, police cars are
  // higher, and every other car gets its own slightly different engine.
  setEngineVoice(seed, kind) {
    const r = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
    // (A boat's outboard motor is a higher, buzzier engine.)
    const pitch = kind === 'monster' ? 0.78 : kind === 'police' ? 1.08 : kind === 'boat' ? 1.4 : 0.92 + r * 0.16;
    this.voice = { pitch, q: kind === 'boat' ? 1.8 : 0.7 + r * 0.8, sub: kind === 'monster' ? 0.55 : kind === 'boat' ? 0.12 : 0.25 + r * 0.2 };
    this.engine(null);
  }

  // Engine note: rpm 0..1 inside the current gear, load 0..1 (how hard you press the gas).
  engine(rpm, load = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (rpm === null) {
      if (this.eng) {
        this.eng.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        const e = this.eng;
        setTimeout(() => e.nodes.forEach(n => n.stop()), 500);
        this.eng = null;
      }
      return;
    }
    if (!this.eng) {
      // Two slightly detuned saws and a sub-octave, through a soft filter. A slow wobble on
      // the pitch and a gentle flutter on the volume keep it from sounding like a test tone.
      const v = this.voice;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.detune.value = 9;
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.value = 0.45;
      const sub = ctx.createOscillator();
      sub.type = 'square';
      const subGain = ctx.createGain();
      subGain.gain.value = v.sub;
      const wobble = ctx.createOscillator();
      wobble.frequency.value = 0.31 + Math.random() * 0.2;
      const wobbleGain = ctx.createGain();
      wobbleGain.gain.value = 7; // cents
      wobble.connect(wobbleGain);
      wobbleGain.connect(osc.detune);
      wobbleGain.connect(sub.detune);
      const flutter = ctx.createOscillator();
      flutter.frequency.value = 3.7 + Math.random();
      const flutterGain = ctx.createGain();
      flutterGain.gain.value = 0.06;
      const body = ctx.createGain();
      body.gain.value = 1;
      flutter.connect(flutterGain).connect(body.gain);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = v.q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(osc2Gain).connect(filter);
      sub.connect(subGain).connect(filter);
      filter.connect(body).connect(gain).connect(this.master);
      const nodes = [osc, osc2, sub, wobble, flutter];
      nodes.forEach(n => n.start());
      this.eng = { osc, osc2, sub, gain, filter, nodes, t: ctx.currentTime, rpm, load };
      this.engCalm = 0;
    }
    const e = this.eng, t = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, t - e.t));
    // Steady cruising (or idling) slowly gets quieter and a little softer; revving,
    // shifting or touching the gas brings it straight back.
    const changing = Math.abs(rpm - e.rpm) > dt * 0.15 || Math.abs(load - e.load) > 0.05;
    this.engCalm = this.settle(this.engCalm, changing, dt);
    e.t = t;
    e.rpm = rpm;
    e.load = load;
    const calm = this.engCalm;
    const f = (38 + rpm * 125) * this.voice.pitch;
    e.osc.frequency.setTargetAtTime(f, t, 0.03);
    e.osc2.frequency.setTargetAtTime(f, t, 0.03);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.03);
    e.filter.frequency.setTargetAtTime((250 + rpm * 1100 + load * 500) * (1 - calm * 0.25), t, 0.04);
    e.gain.gain.setTargetAtTime((0.05 + rpm * 0.05 + load * 0.05) * (1 - calm * 0.4), t, 0.05);
  }

  shift() {
    this.noiseHit(1100, 0.05, 0.5);
    this.tone(140, 70, 0.08, 0.25, 'triangle');
  }

  crash(power = 1) {
    this.noiseHit(180, 0.4, 1.6 * power, 'lowpass');
    this.noiseHit(2500, 0.25, 0.6 * power);
    this.tone(800, 300, 0.3, 0.12 * power, 'square');
  }

  explode(volume = 1) {
    this.noiseHit(80, 2, 2.4 * volume, 'lowpass');
    this.noiseHit(400, 0.8, 1.2 * volume);
    for (let i = 0; i < 8; i++) this.noiseHit(2000 + Math.random() * 3000, 0.1, 0.3 * volume, 'bandpass', 0.2 + Math.random() * 1.2);
  }

  // Crackling fire; level 0 silences it.
  fire(level) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.fireNode) {
      if (level <= 0) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      this.fireNode = { gain };
    }
    // Random flicker makes it crackle.
    this.fireNode.gain.gain.setTargetAtTime(level * (0.08 + Math.random() * 0.25), ctx.currentTime, 0.02);
  }

  // Helicopter: "whop-whop" blades plus a soft turbine whine. level 0 silences it.
  // effort 0..1 is how hard the rotor is working (climbing makes it louder and punchier).
  rotor(level, spin = 1, effort = 0.5) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.rot) {
      if (level <= 0) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      // Each blade passing is a soft thump (a rounded pulse, not a hard on/off click).
      const chop = ctx.createGain();
      chop.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.55, 0.3, 0.15, 0.07])));
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.42;
      lfo.connect(lfoGain).connect(chop.gain);
      const whine = ctx.createOscillator();
      whine.type = 'sine';
      const whineFilter = ctx.createBiquadFilter();
      whineFilter.type = 'lowpass';
      whineFilter.frequency.value = 900;
      const whineGain = ctx.createGain();
      whineGain.gain.value = 0.022;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(chop).connect(gain);
      whine.connect(whineFilter).connect(whineGain).connect(gain);
      gain.connect(this.master);
      src.start();
      lfo.start();
      whine.start();
      this.rot = { gain, lfo, whine, filter, t: ctx.currentTime, drift: 0, effort, spin };
      this.rotCalm = 0;
    }
    const r = this.rot, t = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, t - r.t));
    r.t = t;
    // The blades never turn at exactly the same speed: a slow, random drift of a few percent.
    r.drift = Math.max(-0.03, Math.min(0.03, r.drift + (Math.random() - 0.5) * dt * 0.05));
    const changing = Math.abs(effort - r.effort) > dt * 0.3 || Math.abs(spin - r.spin) > dt * 0.05;
    this.rotCalm = this.settle(this.rotCalm, changing, dt);
    r.effort = effort;
    r.spin = spin;
    const calm = this.rotCalm;
    r.lfo.frequency.setTargetAtTime((1 + spin * 5.5) * (1 + r.drift), t, 0.2);
    r.whine.frequency.setTargetAtTime((300 + spin * 420) * (1 + r.drift * 0.5), t, 0.2);
    r.filter.frequency.setTargetAtTime(200 + effort * 220, t, 0.15);
    r.gain.gain.setTargetAtTime(level * (0.4 + spin * 0.9) * (0.75 + effort * 0.4) * (1 - calm * 0.35), t, 0.12);
  }

  // ---------- Fun things ----------

  crack() { this.noiseHit(2400, 0.06, 0.7); this.tone(300, 200, 0.05, 0.15, 'square'); }
  whoosh() { this.noiseHit(600, 0.5, 0.8, 'highpass'); this.tone(300, 1500, 0.45, 0.12, 'sine'); }
  boing() { this.tone(120, 700, 0.35, 0.45, 'sine'); }
  ballBounce(volume = 1) {
    if (volume <= 0.01) return;
    this.tone(240 + Math.random() * 60, 120, 0.12, 0.35 * volume, 'sine');
    this.noiseHit(600, 0.05, 0.4 * volume, 'lowpass');
  }
  cannon() { this.noiseHit(90, 0.9, 2, 'lowpass'); this.whoosh(); }
  paint() { this.noiseHit(1200, 0.12, 0.6, 'lowpass'); this.noiseHit(3000, 0.06, 0.2, 'highpass', 0.04); }
  garage(open) {
    // A rattling roll-up door.
    for (let i = 0; i < 8; i++) this.noiseHit(300 + (i % 2) * 200, 0.08, 0.35, 'bandpass', i * 0.07);
    this.tone(open ? 90 : 120, open ? 130 : 80, 0.6, 0.12, 'sawtooth');
  }
  claim() { this.together(() => [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.15, 0.15, 'triangle', i * 0.09))); }
  party() {
    // Four bars of drum beat with the happy tune on top.
    for (let i = 0; i < 16; i++) this.noiseHit(90, 0.15, 1.2, 'lowpass', i * 0.25);
    for (let i = 0; i < 8; i++) this.noiseHit(6000, 0.05, 0.3, 'highpass', 0.125 + i * 0.5);
    this.tune();
  }
  pet(kind) {
    switch (kind) {
      case 'dog':
        for (const d of [0, 0.18]) { this.tone(520, 300, 0.09, 0.3, 'square', d); this.noiseHit(900, 0.06, 0.4, 'bandpass', d); }
        break;
      case 'cat': this.tone(600, 950, 0.18, 0.2, 'sine'); this.tone(950, 520, 0.3, 0.2, 'sine', 0.18); break;
      case 'bunny': this.tone(1600, 2200, 0.06, 0.15, 'sine'); this.tone(1700, 2300, 0.06, 0.15, 'sine', 0.1); break;
      case 'pig': for (const d of [0, 0.2]) this.tone(220, 140, 0.12, 0.35, 'sawtooth', d); break;
      case 'dragon': this.tone(160, 90, 0.6, 0.3, 'sawtooth'); this.noiseHit(400, 0.6, 0.6, 'lowpass'); break;
    }
  }

  // Rushing, gusty wind (under a helicopter flying low); level 0 silences it.
  wind(level) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.windNode) {
      if (level <= 0) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 520;
      filter.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      this.windNode = { gain, filter };
    }
    const t = ctx.currentTime, gust = 0.75 + 0.25 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1);
    this.windNode.filter.frequency.setTargetAtTime(380 + level * 500 * gust, t, 0.2);
    this.windNode.gain.gain.setTargetAtTime(level * 0.35 * gust, t, 0.15);
  }

  // A wailing siren; level 0 silences it.
  siren(level) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.sir) {
      if (level <= 0) return;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 750;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(osc.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.sir = { gain };
    }
    this.sir.gain.gain.setTargetAtTime(level * 0.09, ctx.currentTime, 0.1);
  }
}
