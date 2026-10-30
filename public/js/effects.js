// Little extras that make building feel good: debris particles and sound effects.
import * as THREE from 'three';

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.list = [];
  }

  burst(x, y, z, material, count = 12) {
    const mat = Array.isArray(material) ? material[0] : material;
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

// Sounds are synthesized with the Web Audio API, so there are no audio files.
export class Sounds {
  constructor() {
    this.ctx = null;
    this.volume = 0.4;
  }

  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        const len = this.ctx.sampleRate * 0.5;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  noiseHit(freq, duration, gain) {
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + duration);
  }

  tone(from, to, duration, gain, type = 'sine') {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(ctx.destination);
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
}
