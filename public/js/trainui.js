// The Loop Express, as you see it (see shared/train.js): the track high over the Outer Loop, the
// trains going round, and catching one: right-click a ticket machine 🚉, pick a stop, wait for
// the next train (a countdown), and up you go into a car. It carries you round and sets you down
// at your stop. E gets you off at the next stop instead.
import * as THREE from 'three';
import { TRACK, TRACK_Y, TRAIN_SPEED, TRAINS, CARS, CAR_LENGTH, carBack, trackPoint, trainFront } from './shared/train.js';

const SEG = 2; // (track pieces, blocks long)
const RIDE_CAR = 1; // (riders sit in the middle car)
const mod = (a, m) => ((a % m) + m) % m;

export class LoopExpress {
  constructor({ scene, sounds, hud, onPick }) {
    Object.assign(this, { scene, sounds, hud, onPick });
    this.stops = [];
    this.ride = null; // { phase: 'wait' | 'lift' | 'ride' | 'down', from, to, k, t, start }
    this.buildTrack();
    this.trains = [...Array(TRAINS)].map(() => [...Array(CARS)].map((_, c) => this.buildCar(c === 0)));
    this.buildPicker();
  }

  setStops(stops) {
    this.stops = Array.isArray(stops) ? stops : [];
  }

  // The track: a concrete beam with two rails on top, in short straight pieces (one instanced mesh).
  buildTrack() {
    const n = Math.ceil(TRACK.length / SEG);
    const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.6, SEG + 0.05), new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.8 }), n);
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.12, SEG + 0.05).translate(0, 0.36, 0), new THREE.MeshStandardMaterial({ color: 0x5d6168, metalness: 0.6, roughness: 0.4 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const p = trackPoint(i * SEG + SEG / 2);
      q.setFromAxisAngle(up, p.yaw);
      m.compose(new THREE.Vector3(p.x, TRACK_Y - 0.3, p.z), q, one);
      beam.setMatrixAt(i, m);
      rails.setMatrixAt(i, m);
    }
    for (const mesh of [beam, rails]) {
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  // A train car: white with a red stripe and a band of windows (you can see out from inside),
  // a grey roof; the front car has a pointed nose.
  buildCar(front) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
    const red = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.5, side: THREE.DoubleSide });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, side: THREE.DoubleSide });
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    const L = CAR_LENGTH, W = 2.6, T = 0.08;
    // A hollow car (so riders see out): the floor, the sides (white, a red stripe, then a band of
    // windows), the ends (windows at the top), and the roof.
    add(new THREE.BoxGeometry(W, 0.12, L), grey, 0, 0.1, 0);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(T, 0.95, L), white, sx * (W / 2 - T / 2), 0.62, 0);
      add(new THREE.BoxGeometry(T + 0.02, 0.22, L + 0.02), red, sx * (W / 2 - T / 2), 1.2, 0);
      add(new THREE.BoxGeometry(T, 0.95, L), glass, sx * (W / 2 - T / 2), 1.78, 0);
    }
    for (const sz of [-1, 1]) {
      add(new THREE.BoxGeometry(W, 1.3, T), white, 0, 0.8, sz * (L / 2 - T / 2));
      add(new THREE.BoxGeometry(W, 0.85, T), glass, 0, 1.88, sz * (L / 2 - T / 2));
    }
    add(new THREE.BoxGeometry(W + 0.1, 0.22, L + 0.1), grey, 0, 2.36, 0);
    // Seats along the sides.
    for (const sx of [-1, 1]) for (const z of [-2.2, 0, 2.2]) add(new THREE.BoxGeometry(0.7, 0.4, 1.2), red, sx * 0.75, 0.36, z);
    if (front) {
      const nose = add(new THREE.CylinderGeometry(0.2, 1.3, 2.2, 4, 1).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), white, 0, 1.1, -L / 2 - 1.1);
      nose.scale.set(1, 0.85, 1);
      add(new THREE.BoxGeometry(1.2, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }), 0, 0.7, -L / 2 - 0.02); // (headlight)
    }
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  // Every frame: where the trains are (t: the game's clock), and the ride, if we're on one.
  update(dt, t, viewer) {
    for (let k = 0; k < TRAINS; k++) {
      const front = trainFront(k, t);
      this.trains[k].forEach((car, c) => {
        const s = front - carBack(c);
        const p = trackPoint(s);
        car.position.set(p.x, TRACK_Y, p.z);
        car.rotation.y = p.yaw;
        car.visible = Math.hypot(p.x - viewer.x, p.z - viewer.z) < 260;
      });
    }
  }

  // ---------- Catching the train ----------

  // The stop by a ticket machine at (x, z).
  stopAt(x, z) {
    return this.stops.reduce((best, st) => (Math.hypot(st.x - x, st.z - z) < Math.hypot((best?.x ?? 1e9) - x, (best?.z ?? 1e9) - z) ? st : best), null);
  }

  buildPicker() {
    this.el = document.createElement('div');
    this.el.id = 'train-picker';
    this.el.className = 'screen hidden';
    this.el.innerHTML = '<div class="panel game-panel train-panel"><button class="pet-close secondary">✖</button><h2>🚉 ➡ ❓</h2><div class="train-stops"></div></div>';
    document.body.append(this.el);
    this.el.querySelector('.pet-close').addEventListener('click', () => this.closePicker());
    this.el.addEventListener('pointerdown', e => e.target === this.el && this.closePicker());
  }

  get pickerOpen() {
    return !this.el.classList.contains('hidden');
  }

  openPicker(from) {
    this.from = from;
    const list = this.el.querySelector('.train-stops');
    list.textContent = '';
    for (const st of this.stops) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="big">${st.icon}</span>${st.name}`;
      b.disabled = st.id === from.id;
      if (st.id === from.id) b.classList.add('here');
      b.addEventListener('click', () => {
        this.closePicker(true);
        this.wait(from, st);
      });
      list.append(b);
    }
    this.el.classList.remove('hidden');
  }

  closePicker(picked = false) {
    if (!this.pickerOpen) return;
    this.el.classList.add('hidden');
    this.onPick?.(picked);
  }

  wait(from, to) {
    this.ride = { phase: 'wait', from, to, shown: null };
    this.sounds.click();
  }

  get riding() {
    return !!this.ride && this.ride.phase !== 'wait';
  }

  // When the next train's middle car gets to stop `st` (seconds), and which train.
  nextTrain(st, t) {
    let best = null;
    for (let k = 0; k < TRAINS; k++) {
      const car = trainFront(k, t) - carBack(RIDE_CAR), wait = mod(st.s - car, TRACK.length) / TRAIN_SPEED;
      if (!best || wait < best.wait) best = { k, wait };
    }
    return best;
  }

  seat(k, t) {
    // (On the seat on the right, sitting: feet a bit below the seat.)
    const p = trackPoint(trainFront(k, t) - carBack(RIDE_CAR));
    return new THREE.Vector3(p.x + Math.cos(p.yaw) * 0.75, TRACK_Y + 0.56 - 0.72, p.z - Math.sin(p.yaw) * 0.75);
  }

  // Every frame, while catching or riding a train: moves the player (returns true while it's
  // doing that, so they don't walk). E (getOff) gets off at the next stop.
  updateRide(dt, t, player) {
    const r = this.ride;
    if (!r) return false;
    if (r.phase === 'wait') {
      // Walked off? Then never mind.
      if (Math.hypot(player.pos.x - r.from.x, player.pos.z - r.from.z) > 8) {
        this.ride = null;
        return false;
      }
      const next = this.nextTrain(r.from, t), secs = Math.ceil(next.wait);
      if (secs !== r.shown) {
        r.shown = secs;
        this.hud.toast(`🚆 ⏳ ${secs}  ➡ ${r.to.icon}`);
      }
      if (next.wait < 0.4) {
        // (How far to go, worked out from the clock: the same however fast this computer is.)
        Object.assign(r, { phase: 'lift', k: next.k, t: 0, start: player.pos.clone(), t0: t + next.wait, trip: mod(r.to.s - r.from.s, TRACK.length) });
        this.sounds.horn(0.6, 1.2, 'air');
      }
      return false;
    }
    r.t += dt;
    player.vel.set(0, 0, 0);
    r.left = r.trip - (t - r.t0) * TRAIN_SPEED;
    if (r.phase === 'lift') {
      // Up into the train (it keeps going, so we catch it up).
      const k = Math.min(1, r.t / 1.2), e = k * k * (3 - 2 * k);
      player.pos.copy(r.start).lerp(this.seat(r.k, t), e);
      if (k >= 1) Object.assign(r, { phase: 'ride', t: 0 });
      return true;
    }
    if (r.phase === 'ride') {
      player.pos.copy(this.seat(r.k, t));
      if (r.left <= 0) {
        Object.assign(r, { phase: 'down', t: 0, start: player.pos.clone() });
        this.sounds.horn(0.5, 1.2, 'air');
      }
      return true;
    }
    // Down at the stop.
    const k = Math.min(1, r.t / 1.2), e = k * k * (3 - 2 * k);
    player.pos.copy(r.start).lerp(new THREE.Vector3(r.to.x + 0.8, 0, r.to.z + 0.8), e);
    if (k >= 1) {
      this.hud.toast(`🚉 ${r.to.icon} ${r.to.name}`);
      this.ride = null;
    }
    return true;
  }

  // E on the train: off at the next stop along.
  getOff() {
    const r = this.ride;
    if (!r || r.phase !== 'ride') return;
    const here = mod(r.to.s - r.left, TRACK.length);
    const next = this.stops.map(st => ({ st, d: mod(st.s - here, TRACK.length) })).filter(o => o.d > 25).sort((a, b) => a.d - b.d)[0];
    if (!next) return;
    r.to = next.st;
    r.trip += next.d - r.left;
    this.hud.toast(`🚉 ➡ ${next.st.icon}`);
  }

  cancel() {
    if (this.ride?.phase === 'wait') this.ride = null;
  }
}
