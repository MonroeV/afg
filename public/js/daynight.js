// Sky, sun, moon, stars and the lights that change from day to night.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { DAY_LENGTH, DAY_FRACTION, BLOCKS, blockId, lightOff } from './shared/blocks.js';

// How bright lamps are. Light fades gently with distance (decay 1) so it spreads wide
// instead of making a harsh bright spot right next to the lamp.
const LAMP_BRIGHTNESS = 4;
const LAMP_DECAY = 1;
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function makeSky() {
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  return sky;
}

function moonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const glow = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  glow.addColorStop(0, 'rgba(220,230,255,0.5)');
  glow.addColorStop(1, 'rgba(220,230,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#f4f1e6';
  ctx.beginPath();
  ctx.arc(64, 64, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,175,160,0.6)';
  for (const [x, y, r] of [[56, 58, 6], [72, 70, 4], [66, 52, 3], [58, 74, 3]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class DayNight {
  constructor(renderer, scene) {
    this.scene = scene;
    this.time = DAY_LENGTH * 0.1;
    this.sky = makeSky();
    scene.add(this.sky);

    // Reflections/ambient light come from a blurred copy of the daytime sky.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = makeSky();
    envSky.material.uniforms.cloudCoverage.value = 0;
    envSky.material.uniforms.sunPosition.value.set(0.3, 0.8, 0.4);
    envScene.add(envSky);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;

    this.hemi = new THREE.HemisphereLight(0xd6e8ff, 0x5d4c36, 0.55);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 3);
    this.sun.castShadow = true;
    const S = 45;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    // Stars: lots of dots on a big sphere that follows the camera.
    const starPos = [];
    for (let i = 0; i < 1800; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.1 - 0.1, Math.random() * 2 - 1).normalize().multiplyScalar(800);
      starPos.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -1;
    scene.add(this.stars);

    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, fog: false, depthWrite: false }));
    this.moon.scale.setScalar(120);
    scene.add(this.moon);

    // A few real lights that sit in the lamps closest to you at night.
    this.lampLights = [];
    this.lampTimer = 0;
    this.setLampLightCount(8);

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.dayK = 1;
    this.fogDay = new THREE.Color(0xc4d6e6);
    this.fogSunset = new THREE.Color(0xe8a882);
    this.fogNight = new THREE.Color(0x0b1226);
    scene.fog = new THREE.Fog(0xc4d6e6, 60, 230);
  }

  setLampLightCount(n) {
    for (const l of this.lampLights) this.scene.remove(l);
    this.lampLights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffc477, 0, 30, LAMP_DECAY);
      l.userData.phase = i * 1.7;
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this.lampTimer = 0;
  }

  get phase() {
    return (((this.time % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH) / DAY_LENGTH;
  }

  get isNight() {
    return this.dayK < 0.4;
  }

  clockText() {
    const p = this.phase;
    const hours = p < DAY_FRACTION ? 6 + (13 * p) / DAY_FRACTION : (19 + (11 * (p - DAY_FRACTION)) / (1 - DAY_FRACTION)) % 24;
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
    const icon = this.dayK > 0.5 ? '☀️' : '🌙';
    return `${icon} ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  update(dt, camera, world, materials) {
    this.time += dt;
    const p = this.phase;
    const sunA = p < DAY_FRACTION ? Math.PI * (p / DAY_FRACTION) : Math.PI + Math.PI * ((p - DAY_FRACTION) / (1 - DAY_FRACTION));
    const moonA = sunA - Math.PI;
    this.sunDir.set(Math.cos(sunA), Math.sin(sunA) * 0.88, 0.42).normalize();
    this.moonDir.set(Math.cos(moonA), Math.sin(moonA) * 0.8, -0.35).normalize();
    const h = this.sunDir.y;

    this.dayK = smooth(-0.1, 0.18, h);
    const nightK = 1 - this.dayK;
    const sunsetK = (1 - smooth(0.05, 0.35, Math.abs(h))) * smooth(-0.15, 0, h);

    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.material.uniforms.time.value += dt;

    // One directional light plays the sun by day and the moon by night.
    const cx = Math.round(camera.position.x), cz = Math.round(camera.position.z);
    const sunUp = h > -0.03;
    const dir = sunUp ? this.sunDir : this.moonDir;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx, 0, cz).addScaledVector(dir, 140);
    if (sunUp) {
      this.sun.intensity = 3 * smooth(-0.03, 0.15, h);
      this.sun.color.setRGB(1, 0.94 - sunsetK * 0.3, 0.86 - sunsetK * 0.5);
    } else {
      this.sun.intensity = 0.5 * smooth(0.03, 0.2, -h);
      this.sun.color.setHex(0x9db4ff);
    }

    this.hemi.intensity = 0.14 + 0.41 * this.dayK;
    this.hemi.color.setRGB(0.23 + 0.61 * this.dayK, 0.29 + 0.62 * this.dayK, 0.5 + 0.5 * this.dayK);
    this.hemi.groundColor.setRGB(0.06 + 0.3 * this.dayK, 0.06 + 0.24 * this.dayK, 0.08 + 0.13 * this.dayK);
    // Live reflections already get darker at night; the plain sky picture doesn't.
    this.scene.environmentIntensity = this.liveReflections ? 0.3 : 0.04 + 0.26 * this.dayK;

    this.scene.fog.color.copy(this.fogNight).lerp(this.fogDay, this.dayK).lerp(this.fogSunset, sunsetK * 0.6);
    this.scene.fog.near = 40 + 20 * this.dayK;
    this.scene.fog.far = 170 + 60 * this.dayK;

    this.stars.position.copy(camera.position);
    this.stars.material.opacity = smooth(0.3, 0.9, nightK);
    this.stars.rotation.y = this.time * 0.002;
    this.moon.position.copy(camera.position).addScaledVector(this.moonDir, 700);
    this.moon.material.opacity = smooth(-0.1, 0.05, this.moonDir.y);

    // Lamps glow at night (indoor ones all the time) and light up their surroundings.
    const lampK = smooth(0.25, 0.85, nightK);
    this.lampK = lampK;
    const lamp = materials?.[18];
    // With the glow effect on, lamps already shine brighter, so they need less of a boost.
    if (lamp) lamp.emissiveIntensity = 2 + (this.glowOn ? 0.6 : 1.5) * lampK;
    for (const g of this.glowMaterials || []) {
      const k = g.always ? 1.4 + 0.4 * lampK : 0.7 + 1.3 * lampK;
      g.material.color.copy(g.material.userData.baseColor).multiplyScalar(k);
    }

    // A handful of real lights move to the lamps nearest to you. Lights already on a lamp
    // that's still close stay put, and newly placed ones fade in, so nothing pops.
    this.lampTimer -= dt;
    if (this.lampTimer <= 0 && world) {
      this.lampTimer = 0.5;
      const near = [];
      const dist = (x, y, z) => (x - camera.position.x) ** 2 + (y - camera.position.y) ** 2 + (z - camera.position.z) ** 2;
      // Lamps with a roof over them count as indoors: they're on day and night, a bit brighter.
      if (this.coverRevision !== world.revision) {
        this.coverRevision = world.revision;
        this.covered = new Map();
      }
      for (const k of world.lamps) {
        const [x, y, z] = k.split(',').map(Number);
        const v = world.get(x, y, z);
        const light = BLOCKS[blockId(v)]?.light;
        if (!light || lightOff(v)) continue;
        if (!this.covered.has(k)) this.covered.set(k, world.isCovered(x, y, z));
        const indoor = light.always || this.covered.get(k);
        if (!(indoor || lampK > 0.02)) continue;
        const d = dist(x, y, z);
        if (d >= 70 * 70) continue;
        const def = { ...light, always: indoor, power: light.power * (indoor ? 1.4 : 1), color: world.lightTint(k, v) || light.color };
        near.push({ key: `${k}:${v}`, d, x: x + 0.5, y: y + (light.y ?? 0.5), z: z + 0.5, def });
      }
      // Campfires, dance floors and TVs glow too (dance floors even in the daytime).
      for (const e of this.extraLights?.() || []) {
        const d = dist(e.x, e.y, e.z);
        if (d < 60 * 60 && (lampK > 0 || e.always)) {
          near.push({ key: `extra:${e.x},${e.y},${e.z}`, d: d - 400, x: e.x + 0.5, y: e.y + 0.3, z: e.z + 0.5, def: { color: e.color, power: (e.intensity || 14) / 14 * 1.4, range: 30, always: e.always }, extra: true });
        }
      }
      // Brighter, farther-reaching lamps (like street lamps) win the real lights first.
      near.sort((a, b) => a.d / a.def.power ** 2 - b.d / b.def.power ** 2);
      const chosen = new Map(near.slice(0, this.lampLights.length).map(n => [n.key, n]));
      const free = [];
      for (const l of this.lampLights) {
        const n = chosen.get(l.userData.key);
        if (n) {
          l.userData.lamp = n; // still close: keep it (extras may have moved or changed color)
          chosen.delete(n.key);
        } else free.push(l);
      }
      for (const l of free) {
        const n = chosen.values().next().value;
        l.userData.lamp = n || null;
        l.userData.key = n?.key;
        if (n) {
          chosen.delete(n.key);
          l.intensity = 0; // fade in from dark
        }
      }
    }
    const t = performance.now() / 1000;
    for (const l of this.lampLights) {
      const n = l.userData.lamp;
      let target = 0;
      if (n) {
        const def = n.def;
        l.position.set(n.x, n.y, n.z);
        l.color.set(def.color);
        l.distance = def.range;
        const flicker = def.flicker ? 1 - def.flicker * (0.5 + 0.5 * Math.sin(t * 13 + l.userData.phase) * Math.sin(t * 7.3 + l.userData.phase * 2)) : 1;
        target = LAMP_BRIGHTNESS * def.power * (def.always ? 1 : lampK) * flicker;
      }
      l.intensity += (target - l.intensity) * Math.min(1, dt * (n?.def.flicker ? 20 : 4));
    }
  }
}
