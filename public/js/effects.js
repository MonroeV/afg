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

export class Fireworks {
  constructor(scene) {
    this.scene = scene;
    this.texture = glowTexture();
    this.rockets = [];
    this.bursts = [];
  }

  points(count, size) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({
      size, map: this.texture, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return pts;
  }

  launch(x, y, z, color, seed = Math.random()) {
    const trail = this.points(14, 0.5);
    this.rockets.push({
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(Math.sin(seed * 20) * 1.5, 22 + (seed * 7) % 6, Math.cos(seed * 20) * 1.5),
      fuse: 0.9 + (seed * 3) % 0.4,
      color: new THREE.Color(color),
      seed,
      trail,
      history: [],
    });
  }

  explode(r) {
    const n = 160;
    const pts = this.points(n, 0.7);
    const vel = [];
    const second = new THREE.Color().setHSL((r.seed * 7) % 1, 1, 0.65);
    const colors = pts.geometry.attributes.color;
    const style = Math.floor(r.seed * 100) % 3; // ball, ring or willow
    for (let i = 0; i < n; i++) {
      let v;
      if (style === 1) {
        const a = (i / n) * Math.PI * 2;
        v = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.3, Math.sin(a)).multiplyScalar(13);
      } else {
        v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(7 + Math.random() * 6);
      }
      vel.push(v);
      const c = i % 3 === 0 ? second : r.color;
      colors.setXYZ(i, c.r, c.g, c.b);
      pts.geometry.attributes.position.setXYZ(i, r.pos.x, r.pos.y, r.pos.z);
    }
    colors.needsUpdate = true;
    this.bursts.push({ pts, vel, life: 2.2, drag: style === 2 ? 2.2 : 1.4, gravity: style === 2 ? 7 : 4 });
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
      r.history.length = Math.min(r.history.length, 14);
      const pos = r.trail.geometry.attributes.position, col = r.trail.geometry.attributes.color;
      for (let j = 0; j < 14; j++) {
        const p = r.history[Math.min(j, r.history.length - 1)];
        pos.setXYZ(j, p.x, p.y, p.z);
        const k = 1 - j / 14;
        col.setXYZ(j, k, k * 0.8, k * 0.5);
      }
      pos.needsUpdate = col.needsUpdate = true;
      if (r.fuse <= 0) {
        this.scene.remove(r.trail);
        r.trail.geometry.dispose();
        this.explode(r);
        booms.push(r.pos.clone());
        this.rockets.splice(i, 1);
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const pos = b.pts.geometry.attributes.position;
      const drag = Math.exp(-b.drag * dt);
      for (let j = 0; j < b.vel.length; j++) {
        const v = b.vel[j];
        v.multiplyScalar(drag);
        v.y -= b.gravity * dt;
        pos.setXYZ(j, pos.getX(j) + v.x * dt, pos.getY(j) + v.y * dt, pos.getZ(j) + v.z * dt);
      }
      pos.needsUpdate = true;
      b.pts.material.opacity = Math.min(1, b.life / 1.2);
      b.pts.material.size = 0.7 + (2.2 - b.life) * 0.1;
      if (b.life <= 0) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
    return booms;
  }
}

// ---------- Sounds ----------
// Everything is synthesized with the Web Audio API, so there are no audio files.

export class Sounds {
  constructor() {
    this.ctx = null;
    this.volume = 0.4;
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
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
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
  horn(volume = 1) {
    this.tone(330, 325, 0.38, 0.25 * volume, 'square');
    this.tone(415, 410, 0.38, 0.22 * volume, 'square');
  }
  launch(volume = 1) { this.tone(500, 1800, 0.8, 0.12 * volume, 'sine'); this.noiseHit(3000, 0.6, 0.15 * volume, 'highpass'); }
  boom(volume = 1) {
    this.noiseHit(120, 1.2, 1.6 * volume, 'lowpass');
    for (let i = 0; i < 6; i++) this.noiseHit(3000 + Math.random() * 3000, 0.08, 0.2 * volume, 'bandpass', 0.3 + Math.random() * 0.6);
  }
  spawnCar() { this.tone(300, 600, 0.15, 0.3, 'triangle'); this.tone(600, 900, 0.15, 0.3, 'triangle', 0.12); }
  tune() {
    // A short happy melody for dancing.
    const notes = [523, 659, 784, 659, 698, 880, 784, 0, 659, 784, 1047];
    notes.forEach((f, i) => f && this.tone(f, f * 0.99, 0.18, 0.18, 'square', i * 0.16));
  }

  // Engine hum that follows the car's speed (0 = idle, 1 = flat out). Pass null to stop.
  engine(level) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (level === null) {
      if (this.eng) {
        this.eng.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        const e = this.eng;
        setTimeout(() => e.osc.stop(), 500);
        this.eng = null;
      }
      return;
    }
    if (!this.eng) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      this.eng = { osc, gain, filter };
    }
    const t = ctx.currentTime;
    this.eng.osc.frequency.setTargetAtTime(45 + level * 110, t, 0.05);
    this.eng.filter.frequency.setTargetAtTime(300 + level * 900, t, 0.05);
    this.eng.gain.gain.setTargetAtTime(0.07 + level * 0.08, t, 0.05);
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
