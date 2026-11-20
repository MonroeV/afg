// The Space Center's rocket, as everyone sees it (see shared/space.js for the site and the
// launch's timing, and game.js for how the server runs it). It stands on the pad by its tower;
// when someone climbs aboard there's a countdown (big numbers on the screen of anyone close by),
// then LIFTOFF: flames and smoke, a rumble, and up it goes, faster and faster, high over the
// whole world. Up there the capsule lets go of the rocket and floats in space for a moment, then
// falls back down, opens three big parachutes and drifts down onto the landing zone. If you're
// aboard, you ride along in the capsule (look around!), and step out on the landing zone.
// Also: the planets hanging in the Space Museum.
import * as THREE from 'three';
import { flightAt, ASCENT, COUNTDOWN, TOP } from './shared/space.js';

const CAPSULE_Y = 18; // (the capsule sits on top of the rocket: how high up it, from the base)
const SEATS = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]];

function rocketModel() {
  const g = new THREE.Group(), body = new THREE.Group(), capsule = new THREE.Group(), chutes = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  const white = mat(0xf5f5f5), black = mat(0x222222), red = mat(0xd32f2f), blue = mat(0x1e3a8a, { metalness: 0.4, roughness: 0.2 });
  const add = (parent, geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // The rocket: a tall white body with black bands, four red fins and the engine bell.
  add(body, new THREE.CylinderGeometry(1.5, 1.5, 16, 20), white, 0, 8, 0);
  for (const y of [3, 9, 15]) add(body, new THREE.CylinderGeometry(1.52, 1.52, 0.6, 20), black, 0, y, 0);
  add(body, new THREE.CylinderGeometry(1.5, 1.5, 2, 20), black, 0, 17, 0); // (where the capsule joins on)
  add(body, new THREE.CylinderGeometry(0.7, 1.2, 1.2, 16), black, 0, -0.3, 0); // the engine bell
  for (let i = 0; i < 4; i++) {
    const fin = add(body, new THREE.BoxGeometry(0.15, 3.2, 1.6), red, 0, 1.6, 0);
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    fin.position.set(Math.sin(a) * 1.9, 1.6, Math.cos(a) * 1.9);
    fin.rotation.y = a;
  }
  // "BUILDZONE" down the side.
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#f5f5f5';
  x.fillRect(0, 0, 64, 512);
  x.fillStyle = '#d32f2f';
  x.font = 'bold 54px system-ui, sans-serif';
  x.textAlign = 'center';
  'BUILDZONE'.split('').forEach((ch, i) => x.fillText(ch, 32, 60 + i * 52));
  const label = new THREE.CanvasTexture(c);
  label.colorSpace = THREE.SRGBColorSpace;
  const side = add(body, new THREE.PlaneGeometry(0.9, 7.2), new THREE.MeshStandardMaterial({ map: label, roughness: 0.5 }), 0, 9, 1.52);
  side.castShadow = false;
  // The capsule: a white cone with round windows and a red tower on top.
  add(capsule, new THREE.CylinderGeometry(0.55, 1.5, 3, 20), white, 0, 1.5, 0);
  // (Round windows: one-sided, facing out, so from inside the capsule you see out through them.)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, w = add(capsule, new THREE.CircleGeometry(0.28, 16), blue, Math.sin(a) * 1.06, 1.5, Math.cos(a) * 1.06);
    w.lookAt(Math.sin(a) * 3, 1.5, Math.cos(a) * 3);
  }
  add(capsule, new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), red, 0, 4.2, 0);
  add(capsule, new THREE.ConeGeometry(0.25, 0.6, 8), red, 0, 5.6, 0);
  // Three big parachutes (striped red and white), on lines to the capsule's top.
  for (let k = 0; k < 3; k++) {
    const chute = new THREE.Group(), a = (k / 3) * Math.PI * 2;
    for (let i = 0; i < 8; i++) {
      const panel = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xe53935, roughness: 0.8, side: THREE.DoubleSide }));
      panel.scale.y = 0.6;
      chute.add(panel);
    }
    chute.position.set(Math.sin(a) * 3.2, 13, Math.cos(a) * 3.2);
    chute.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
    chutes.add(chute);
    const len = 11, line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), new THREE.MeshBasicMaterial({ color: 0x444444 }));
    line.position.set(Math.sin(a) * 1.6, 3 + len / 2, Math.cos(a) * 1.6);
    line.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
    chutes.add(line);
  }
  chutes.visible = false;
  capsule.add(chutes);
  g.add(body);
  return { group: g, body, capsule, chutes };
}

// The planets in the Space Museum: the Sun, Earth, Mars, Jupiter and Saturn (with its rings).
function planetsModel() {
  const g = new THREE.Group(), list = [];
  const sphere = (r, color, o = {}) => new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }));
  const sun = sphere(1.3, 0xffc107, { emissive: 0xff9800, emissiveIntensity: 0.9 });
  const earth = sphere(0.6, 0x1e88e5);
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(0.605, 12, 8, 0.4, 1.4, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 0.8 })));
  const mars = sphere(0.45, 0xd84315);
  const jupiter = sphere(1.0, 0xd7a86e);
  for (const [y, c] of [[0.3, 0xa1603a], [-0.2, 0xb87a4b], [-0.5, 0xf0d9b5]]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(Math.sqrt(1 - y * y) * 1.01, Math.sqrt(1 - y * y) * 1.01, 0.12, 24, 1, true), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    band.position.y = y;
    jupiter.add(band);
  }
  const saturn = sphere(0.8, 0xe6c88a);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.7, 32), new THREE.MeshStandardMaterial({ color: 0xcdb27a, roughness: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2 - 0.4;
  saturn.add(ring);
  for (const p of [sun, earth, mars, jupiter, saturn]) {
    g.add(p);
    list.push(p);
  }
  return { group: g, list };
}

export class RocketUI {
  constructor({ scene, sounds, effects, hud }) {
    Object.assign(this, { scene, sounds, effects, hud });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.place = null;
    this.state = { phase: 'idle', riders: [] };
    this.start = 0;
    this.aboard = false;
    this.big = document.createElement('div');
    Object.assign(this.big.style, {
      position: 'fixed', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff', font: 'bold 96px system-ui, sans-serif',
      textShadow: '0 4px 16px rgba(0,0,0,0.7)', display: 'none', pointerEvents: 'none', zIndex: 6,
    });
    document.body.appendChild(this.big);
  }

  setPlace(place, state) {
    this.group.clear();
    this.place = place?.rocket ? place : null;
    if (!this.place) return;
    this.rocket = rocketModel();
    this.group.add(this.rocket.group, this.rocket.capsule);
    const p = planetsModel(), [x0, z0, x1, z1] = place.museum, long = x1 - x0 > z1 - z0;
    p.list.forEach((planet, i) => {
      const k = (i + 0.5) / p.list.length - 0.5, span = (long ? x1 - x0 : z1 - z0) * 0.75;
      planet.position.set(place.planets.x + (long ? k * span : 0), place.planets.y, place.planets.z + (long ? 0 : k * span));
    });
    this.planets = p;
    this.group.add(p.group);
    if (state) this.setState(state);
  }

  setState({ phase, since = 0, riders = [] }) {
    this.state = { phase, riders };
    this.start = performance.now() / 1000 - since;
    this.said = null;
  }

  // Seconds since this launch's liftoff (negative: still waiting), or null with nothing going on.
  flightTime() {
    const e = performance.now() / 1000 - this.start, { phase } = this.state;
    if (phase === 'flight') return e;
    if (phase === 'countdown') return e - COUNTDOWN;
    if (phase === 'boarding') return -COUNTDOWN - 99;
    return null;
  }

  // Where the capsule's floor is at flight time t, in the world.
  capsuleAt(t) {
    const r = this.place.rocket, f = flightAt(t ?? -1), [lx, lz] = this.place.landing;
    const y = f.rocket ? r.y + f.y + CAPSULE_Y : (f.y * (TOP + r.y + CAPSULE_Y)) / TOP;
    return new THREE.Vector3(r.x + (lx - r.x) * f.k, y, r.z + (lz - r.z) * f.k);
  }

  update(dt, eye) {
    if (!this.place) return;
    const r = this.place.rocket, t = this.flightTime(), f = flightAt(t ?? -1);
    const near = Math.hypot(eye.x - r.x, eye.z - r.z) < 700 || this.aboard;
    this.group.visible = near;
    // The rocket: on the pad, or climbing (gone once the capsule lets go, and back on the pad
    // after: the next one's ready).
    this.rocket.body.visible = !f.capsule;
    this.rocket.group.position.set(r.x, r.y + (f.rocket ? f.y : 0), r.z);
    this.rocket.group.rotation.y = r.face;
    this.rocket.capsule.position.copy(this.capsuleAt(t));
    this.rocket.capsule.rotation.y = r.face;
    this.rocket.capsule.rotation.z = f.space ? Math.sin(performance.now() / 900) * 0.15 : 0; // (floating, in space)
    this.rocket.chutes.visible = !!f.chutes;
    if (this.planets) this.planets.list.forEach((p, i) => (p.rotation.y += dt * (0.2 + i * 0.1)));
    if (!near) return this.showBig('');
    const close = this.aboard || Math.hypot(eye.x - r.x, eye.z - r.z) < 220;
    // The countdown, on the screen of anyone close by (and beeps).
    if (t !== null && t < 0 && t > -COUNTDOWN - 1 && close) {
      const n = Math.ceil(-t);
      this.showBig(n > 0 && n <= 10 ? String(n) : '');
      if (n !== this.said && n > 0 && n <= 10) {
        this.said = n;
        this.sounds.tone(880, 880, 0.12, 0.12, 'square');
      }
      if (t > -3 && Math.random() < dt * 12) this.effects.smokePuff(r.x + (Math.random() - 0.5) * 4, r.y + 0.5, r.z + (Math.random() - 0.5) * 4, 0.2);
    } else if (t !== null && t >= 0 && t < 2.5 && close) {
      this.showBig('🚀 LIFTOFF!');
      if (this.said !== 'go') {
        this.said = 'go';
        this.sounds.whoosh();
      }
    } else this.showBig(this.state.phase === 'boarding' && this.aboard ? '👩‍🚀' : '');
    // Fire and smoke from the engine while it burns, and a rumble.
    if (f.burn) {
      const base = this.rocket.group.position;
      for (let i = 0; i < 4; i++) this.effects.flame(base.x + (Math.random() - 0.5) * 1.2, base.y - 1 - Math.random() * 2, base.z + (Math.random() - 0.5) * 1.2, 2.2);
      if (Math.random() < dt * 20) this.effects.smokePuff(base.x + (Math.random() - 0.5) * 3, base.y - 2, base.z + (Math.random() - 0.5) * 3, 0.15);
      this.rumble = (this.rumble || 0) - dt;
      if (this.rumble <= 0 && close) {
        this.rumble = 0.25;
        this.sounds.noiseHit(90, 0.35, this.aboard ? 0.5 : 0.3, 'lowpass');
      }
    }
    if (t !== null && t >= ASCENT && t < ASCENT + 0.5 && this.aboard && this.said !== 'space') {
      this.said = 'space';
      this.hud.toast('🌍✨ SPACE! ✨🌙');
      this.effects.sparkle(this.rocket.capsule.position.x, this.rocket.capsule.position.y + 2, this.rocket.capsule.position.z, 40);
    }
    if (t !== null && f.chutes && this.said !== 'chutes' && this.aboard) {
      this.said = 'chutes';
      this.hud.toast('🪂🪂🪂');
    }
  }

  showBig(text) {
    if (this.big.textContent !== text) this.big.textContent = text;
    this.big.style.display = text ? 'block' : 'none';
  }

  // If we're aboard: in our seat in the capsule (returns true while we are). Back down: out onto
  // the landing zone.
  updateRide(dt, player, myId) {
    if (!this.place) return false;
    const seat = this.state.riders.indexOf(myId);
    if (seat < 0 || this.state.phase === 'idle') {
      if (this.aboard) {
        this.aboard = false;
        const [lx, lz] = this.place.landing;
        player.pos.set(lx + 3, 0.2, lz);
        player.vel.set(0, 0, 0);
        this.hud.toast('🪂 Welcome back, astronaut! 👩‍🚀🌍');
      }
      return false;
    }
    if (!this.aboard) {
      this.aboard = true;
      this.hud.toast('👩‍🚀 3… 2… 1…');
    }
    const p = this.capsuleAt(this.flightTime()), [sx, sz] = SEATS[seat % SEATS.length];
    player.pos.set(p.x + sx, p.y + 0.15, p.z + sz);
    player.vel.set(0, 0, 0);
    return true;
  }

  get riding() {
    return this.aboard;
  }
}
