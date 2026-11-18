// Fun Land's big rides, as you see and ride them (see shared/funland.js for their shapes):
//  - the roller coaster: right-click its gate and you're off. The chain clanks you up the lift
//    hill, then it's all gravity: the lower you go the faster you go, down the big drop, over
//    the hills and round the curves, and back into the station.
//  - the Ferris wheel: it turns slowly all the time (everyone sees the same turn). Right-click
//    its gate and you step into the gondola at the bottom, ride it all the way round, and get off.
import * as THREE from 'three';
import { coasterPath, COASTER_STATION, COASTER_CREST, WHEEL } from './shared/funland.js';

const G = 9.8, LIFT_SPEED = 4.5;

// Joins a few box geometries into one (same attributes), for an instanced mesh.
function mergeBoxes(list) {
  const out = new THREE.BufferGeometry(), pos = [], nor = [], idx = [];
  let base = 0;
  for (const g of list) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    idx.push(...g.index.array.map(i => i + base));
    base += g.attributes.position.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

export class FunRides {
  constructor({ scene, sounds, hud }) {
    Object.assign(this, { scene, sounds, hud });
    this.place = null;
    this.ride = null;
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  // Fun Land's place (from the world): builds the rides there.
  setPlace(place) {
    this.group.clear();
    this.place = place?.frame ? place : null;
    if (!this.place) return;
    const { o, U, V } = this.place.frame;
    this.w = (u, y, v) => new THREE.Vector3(o[0] + u * U[0] + v * V[0], y, o[1] + u * U[1] + v * V[1]);
    this.buildCoaster();
    this.buildWheel();
  }

  // ---------- The roller coaster ----------

  buildCoaster() {
    const path = coasterPath();
    this.path = path;
    this.pts = path.pts.map(([u, y, v, s]) => Object.assign(this.w(u, y, v), { s }));
    this.stationS = path.marks[COASTER_STATION];
    this.liftFrom = path.marks[COASTER_STATION + 1];
    this.crestS = path.marks[COASTER_CREST];
    this.crestY = this.pts.reduce((m, p) => (Math.abs(p.s - this.crestS) < 1 ? Math.max(m, p.y) : m), 0);
    const n = this.pts.length;
    // Two red rails (one geometry, both sides) on white crossties.
    const both = mergeBoxes([new THREE.BoxGeometry(0.16, 0.14, 1).translate(-0.55, 0, 0), new THREE.BoxGeometry(0.16, 0.14, 1).translate(0.55, 0, 0)]);
    const rail = new THREE.InstancedMesh(both, new THREE.MeshStandardMaterial({ color: 0xe53935, metalness: 0.4, roughness: 0.4 }), n);
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.08, 0.18), new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.6 }), n);
    const supports = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), fwd = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const a = this.pts[i], b = this.pts[(i + 1) % n];
      fwd.subVectors(b, a);
      const len = fwd.length() + 0.05;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      q.setFromRotationMatrix(new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)));
      rail.setMatrixAt(i, m.compose(mid, q, new THREE.Vector3(1, 1, len)));
      ties.setMatrixAt(i, m.compose(mid.clone().setY(mid.y - 0.08), q, one));
      if (i % 6 === 0 && a.y > 1.6) supports.push(a);
    }
    const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.5 }), supports.length);
    supports.forEach((p, i) => legs.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y / 2 - 0.1, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.y - 0.2, 1))));
    for (const mesh of [rail, ties, legs]) {
      mesh.castShadow = true;
      this.group.add(mesh);
    }
    // The coaster car: red, with two seats and a lap bar. It waits in the station.
    const car = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.3, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.7 });
    const piece = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      car.add(mesh);
    };
    piece(new THREE.BoxGeometry(1.4, 0.5, 2.6), red, 0, 0.35, 0);
    for (const z of [-0.6, 0.6]) piece(new THREE.BoxGeometry(1.2, 0.5, 0.15), dark, 0, 0.8, z + 0.35);
    piece(new THREE.BoxGeometry(1.5, 0.1, 0.12), dark, 0, 0.95, -0.9);
    piece(new THREE.BoxGeometry(1.2, 0.3, 0.5), red, 0, 0.25, -1.5); // (a low nose, so you can see where you're going)
    this.car = car;
    this.group.add(car);
    this.placeCar(this.stationS);
  }

  // Where the track is at s (and which way it's going): { p, dir }.
  at(s) {
    const L = this.path.length, n = this.pts.length;
    s = ((s % L) + L) % L;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.pts[mid].s <= s) lo = mid;
      else hi = mid - 1;
    }
    const a = this.pts[lo], b = this.pts[(lo + 1) % n];
    const span = (b.s || L) - a.s, k = span > 0 ? (s - a.s) / span : 0;
    return { p: a.clone().lerp(b, Math.min(1, Math.max(0, k))), dir: b.clone().sub(a).normalize() };
  }

  placeCar(s) {
    const { p, dir } = this.at(s);
    this.car.position.copy(p).y += 0.1;
    this.car.lookAt(p.clone().add(dir));
    this.car.rotateY(Math.PI); // (its front is -z)
  }

  // How fast the coaster goes at s (blocks a second): the chain up the lift hill, then gravity.
  speedAt(s, gone) {
    const { p } = this.at(s);
    if (gone < 3) return 1.5 + gone; // (rolling out of the station)
    if (s >= this.liftFrom && s < this.crestS) return LIFT_SPEED;
    const drop = Math.max(0, this.crestY - p.y);
    let v = Math.sqrt(LIFT_SPEED ** 2 + 2 * G * drop) * (1 - 0.0012 * Math.max(0, gone - this.crestS + this.stationS));
    const left = this.path.length - gone;
    if (left < 14) v = Math.min(v, 2 + left * 0.5); // (the brakes, coming into the station)
    return Math.max(2.5, v);
  }

  // ---------- The Ferris wheel ----------

  buildWheel() {
    const W = WHEEL, hub = this.w(W.u, W.y, W.v);
    this.hub = hub;
    const steel = new THREE.MeshStandardMaterial({ color: 0xeceff1, metalness: 0.5, roughness: 0.35 });
    const lights = new THREE.MeshStandardMaterial({ color: 0xff80ab, emissive: 0xff4081, emissiveIntensity: 0.8 });
    // The legs: an A-frame each side of the wheel, from the hub down to the platform.
    const { U, V } = this.place.frame;
    const u = new THREE.Vector3(U[0], 0, U[1]), v = new THREE.Vector3(V[0], 0, V[1]);
    for (const side of [-1, 1])
      for (const out of [-1, 1]) {
        const foot = hub.clone().addScaledVector(u, side * 1.6).addScaledVector(v, out * 6).setY(0.9);
        const top = hub.clone().addScaledVector(u, side * 0.8);
        const len = foot.distanceTo(top);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, len, 6), steel);
        leg.position.copy(foot).add(top).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
        leg.castShadow = true;
        this.group.add(leg);
      }
    // The wheel: two rims (with lights), spokes and the hub, turning in the v-y plane.
    const wheel = new THREE.Group();
    wheel.position.copy(hub);
    wheel.lookAt(hub.clone().add(u));
    for (const side of [-0.6, 0.6]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(W.r, 0.12, 6, 48), steel);
      rim.position.z = side;
      wheel.add(rim);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(W.r + 0.15, 0.06, 4, 48), lights);
      glow.position.z = side;
      wheel.add(glow);
      for (let i = 0; i < W.gondolas; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, W.r * 2, 0.1), steel);
        spoke.rotation.z = (i / W.gondolas) * Math.PI;
        spoke.position.z = side;
        wheel.add(spoke);
      }
    }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 12).rotateX(Math.PI / 2), steel));
    this.wheel = wheel;
    this.group.add(wheel);
    // The gondolas: little cabins that hang level as the wheel turns.
    const colors = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047, 0xab47bc, 0xff7043, 0x26c6da, 0xec407a];
    this.gondolas = colors.slice(0, W.gondolas).map(c => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.4), mat);
      base.position.y = -0.8;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 4).rotateY(Math.PI / 4), mat);
      roof.position.y = 0.6;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), steel);
      bar.position.y = -0.1;
      g.add(base, roof, bar);
      g.traverse(o => o.isMesh && (o.castShadow = true));
      this.group.add(g);
      return g;
    });
  }

  // The wheel's turn at game time t (radians).
  wheelAngle(t) {
    return (t / WHEEL.turn) * Math.PI * 2;
  }

  // Where gondola i hangs at game time t.
  gondolaAt(i, t) {
    const a = this.wheelAngle(t) + (i / WHEEL.gondolas) * Math.PI * 2 - Math.PI / 2;
    const { V } = this.place.frame;
    return this.hub.clone().add(new THREE.Vector3(V[0] * Math.cos(a) * WHEEL.r, Math.sin(a) * WHEEL.r - 0.4, V[1] * Math.cos(a) * WHEEL.r));
  }

  // ---------- Every frame ----------

  update(dt, t, viewer) {
    if (!this.place) return;
    this.group.visible = this.hub.distanceTo(viewer) < 320;
    if (!this.group.visible) return;
    this.wheel.rotation.z = this.wheelAngle(t) * (this.wheelSpinSign ??= this.spinSign());
    this.gondolas.forEach((g, i) => g.position.copy(this.gondolaAt(i, t)));
    if (this.ride?.kind !== 'coaster') this.placeCar(this.stationS);
  }

  // (Which way the wheel's mesh has to turn to match the gondolas.)
  spinSign() {
    const probe = new THREE.Vector3(1, 0, 0).applyQuaternion(this.wheel.quaternion);
    const { V } = this.place.frame;
    return Math.sign(probe.x * V[0] + probe.z * V[1]) || 1;
  }

  // Right-clicked a gate near (x, z): ride the ride it's for.
  board(x, z, player, t) {
    if (!this.place || this.ride) return;
    const g = this.place.gates, d = k => Math.hypot(g[k][0] - x, g[k][1] - z);
    if (d('coaster') < d('wheel')) {
      this.ride = { kind: 'coaster', s: this.stationS, gone: 0, start: player.pos.clone(), t: 0, yaw: this.at(this.stationS).dir };
      this.hud.toast('🎢 Hold on tight!');
    } else {
      // The gondola nearest the bottom.
      let best = 0;
      for (let i = 1; i < WHEEL.gondolas; i++) if (this.gondolaAt(i, t).y < this.gondolaAt(best, t).y) best = i;
      this.ride = { kind: 'wheel', i: best, t0: t, start: player.pos.clone(), t: 0 };
      this.hud.toast('🎡 Up we go!');
    }
    this.sounds.click();
  }

  get riding() {
    return !!this.ride;
  }

  // Moves the player along the ride (returns true while riding).
  updateRide(dt, t, player) {
    const r = this.ride;
    if (!r) return false;
    r.t += dt;
    player.vel.set(0, 0, 0);
    if (r.kind === 'coaster') {
      const v = this.speedAt(r.s, r.gone);
      r.s += v * dt;
      r.gone += v * dt;
      const { p, dir } = this.at(r.s);
      this.placeCar(r.s);
      const seat = p.clone().setY(p.y + 0.45);
      if (r.t < 0.6) player.pos.copy(r.start).lerp(seat, r.t / 0.6);
      else player.pos.copy(seat);
      // Facing the way the car goes (turning with it, so you can still look round).
      const yaw = Math.atan2(-dir.x, -dir.z);
      if (r.lastYaw !== undefined) player.yaw += Math.atan2(Math.sin(yaw - r.lastYaw), Math.cos(yaw - r.lastYaw));
      else player.yaw = yaw;
      r.lastYaw = yaw;
      // Clank clank up the lift hill; whoosh down the drops.
      r.tick = (r.tick || 0) - dt;
      if (r.s > this.liftFrom && r.s < this.crestS && r.tick <= 0) {
        r.tick = 0.3;
        this.sounds.tone(180, 160, 0.05, 0.12, 'square');
      }
      if (v > 13 && !r.screamed) {
        r.screamed = true;
        this.sounds.whoosh();
        this.hud.toast('🎢 WHEEEEE! 😱');
      }
      if (r.gone >= this.path.length) {
        this.ride = null;
        player.pos.copy(this.w(30.5, 0, 7.5));
        this.hud.toast('🎢 Again? 🎟️');
      }
      return true;
    }
    // The Ferris wheel: round once, then off at the bottom.
    const seat = this.gondolaAt(r.i, t).add(new THREE.Vector3(0, -1.1, 0));
    if (r.t < 1) player.pos.copy(r.start).lerp(seat, r.t);
    else player.pos.copy(seat);
    if (t - r.t0 > WHEEL.turn + 0.5) {
      this.ride = null;
      player.pos.copy(this.w(WHEEL.u + 0.5, 0, WHEEL.v - 4.6));
      this.hud.toast('🎡 What a view! 😄');
    }
    return true;
  }
}
