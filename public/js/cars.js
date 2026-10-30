// Cars you can spawn, drive and share with other players.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, blockId } from './shared/blocks.js';

export const CAR_SPECS = {
  car: { name: 'Car', length: 3.6, width: 1.8, ride: 0.32, bodyH: 0.55, cabinH: 0.72, wheelR: 0.34, maxSpeed: 17, accel: 9, climb: false },
  police: { name: 'Police Car', length: 3.8, width: 1.85, ride: 0.32, bodyH: 0.55, cabinH: 0.72, wheelR: 0.35, maxSpeed: 21, accel: 11, climb: false },
  monster: { name: 'Monster Truck', length: 4.0, width: 2.5, ride: 1.05, bodyH: 0.7, cabinH: 0.85, wheelR: 0.8, maxSpeed: 14, accel: 8, climb: true },
};
for (const s of Object.values(CAR_SPECS)) s.height = s.ride + s.bodyH + s.cabinH;

const GRAVITY = 30;
export const SEAT_SCALE = 0.85;

function textTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCarModel(kind, color) {
  const s = CAR_SPECS[kind];
  const g = new THREE.Group();
  const mats = {
    paint: new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.28 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.55 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.95, roughness: 0.2 }),
    head: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.3 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xff2020, emissiveIntensity: 0.3 }),
    red: new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xff1a1a, emissiveIntensity: 0.2 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x112266, emissive: 0x1a5cff, emissiveIntensity: 0.2 }),
    label: kind === 'police' ? new THREE.MeshStandardMaterial({ map: textTexture('POLICE', '#111111', '#ffffff'), roughness: 0.4 }) : null,
  };
  // The body is made of many boxes; boxes with the same material are merged into one mesh
  // so each car only costs a handful of draw calls.
  const parts = {};
  const add = (geo, mat, x, y, z, rotY = 0) => {
    (parts[mat] ??= []).push(geo.rotateY(rotY).translate(x, y, z));
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const { length: L, width: W, ride, bodyH, cabinH, wheelR } = s;
  const bodyY = ride + bodyH / 2;

  add(B(W, bodyH, L), 'paint', 0, bodyY, 0);
  // Cabin: glass all round with a painted roof and pillars.
  const cabinL = L * 0.5, cabinW = W * 0.86, cabinY = ride + bodyH + cabinH / 2;
  add(B(cabinW, cabinH, cabinL), 'glass', 0, cabinY, 0.15);
  add(B(cabinW + 0.04, 0.07, cabinL + 0.04), 'paint', 0, ride + bodyH + cabinH, 0.15);
  for (const x of [-1, 1]) for (const z of [-1, 1]) add(B(0.07, cabinH, 0.07), 'paint', x * cabinW / 2, cabinY, 0.15 + z * cabinL / 2);
  // Bumpers, grille, lights, mirrors
  const bumper = kind === 'monster' ? 'chrome' : 'dark';
  add(B(W + 0.04, 0.16, 0.14), bumper, 0, ride + 0.1, -L / 2 - 0.04);
  add(B(W + 0.04, 0.16, 0.14), bumper, 0, ride + 0.1, L / 2 + 0.04);
  add(B(W * 0.4, 0.16, 0.03), 'dark', 0, bodyY + 0.05, -L / 2 - 0.01);
  for (const x of [-1, 1]) {
    add(B(0.34, 0.14, 0.04), 'head', x * (W / 2 - 0.3), bodyY + 0.08, -L / 2 - 0.01);
    add(B(0.3, 0.12, 0.04), 'tail', x * (W / 2 - 0.28), bodyY + 0.08, L / 2 + 0.01);
    add(B(0.08, 0.06, 0.16), 'paint', x * (W / 2 + 0.04), ride + bodyH + 0.02, -0.55);
  }
  const wz = L / 2 - wheelR - (kind === 'monster' ? 0.05 : 0.3);
  if (kind === 'monster') {
    for (const z of [-1, 1]) add(B(W - 0.2, 0.12, 0.12), 'chrome', 0, wheelR, z * wz);
    add(B(0.2, ride - wheelR + 0.1, L * 0.7), 'dark', 0, (ride + wheelR) / 2, 0);
  }
  if (kind === 'police') {
    const top = ride + bodyH + cabinH + 0.1;
    add(B(0.5, 0.14, 0.3), 'red', -0.27, top, 0.15);
    add(B(0.5, 0.14, 0.3), 'blue', 0.27, top, 0.15);
    add(B(W + 0.01, bodyH * 0.45, L * 0.32), 'dark', 0, bodyY - bodyH * 0.2, -L * 0.33);
    for (const x of [-1, 1]) add(new THREE.PlaneGeometry(L * 0.55, 0.32), 'label', x * (W / 2 + 0.005), bodyY, 0.1, x * Math.PI / 2);
  }
  for (const [mat, geos] of Object.entries(parts)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mats[mat]);
    mesh.castShadow = ['paint', 'dark', 'glass', 'chrome'].includes(mat);
    mesh.receiveShadow = true;
    g.add(mesh);
    for (const geo of geos) geo.dispose();
  }

  // Wheels (front ones steer). The six-sided hub shows them spinning.
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, kind === 'monster' ? 0.6 : 0.3, 18).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, kind === 'monster' ? 0.62 : 0.32, 6).rotateZ(Math.PI / 2);
  const wheels = [], steerers = [];
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * (W / 2 - (kind === 'monster' ? -0.05 : 0.12)), wheelR, z * wz);
      const wheel = new THREE.Mesh(wheelGeo, mats.dark);
      wheel.castShadow = true;
      wheel.add(new THREE.Mesh(hubGeo, mats.chrome));
      pivot.add(wheel);
      g.add(pivot);
      wheels.push(wheel);
      if (z < 0) steerers.push(pivot);
    }

  return { group: g, wheels, steerers, paint: mats.paint, headMat: mats.head, tailMat: mats.tail, siren: kind === 'police' ? { red: mats.red, blue: mats.blue } : null };
}

// Is the point (x, y, z) inside something solid?
const solidAt = (world, x, y, z) => world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z));

export class Cars {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = new Map();
  }

  add(data) {
    this.remove(data.id);
    const spec = CAR_SPECS[data.kind] || CAR_SPECS.car;
    const model = buildCarModel(data.kind, data.color);
    const car = {
      ...data,
      spec,
      model,
      pos: new THREE.Vector3(data.x, data.y, data.z),
      target: new THREE.Vector3(data.x, data.y, data.z),
      h: data.h,
      targetH: data.h,
      speed: 0,
      steer: 0,
      siren: 0,
      vy: 0,
      spin: 0,
    };
    this.list.set(car.id, car);
    this.scene.add(model.group);
    this.place(car);
    return car;
  }

  remove(id) {
    const car = this.list.get(id);
    if (!car) return;
    this.scene.remove(car.model.group);
    car.model.group.traverse(o => o.isMesh && o.geometry.dispose());
    this.list.delete(id);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }

  setDriver({ id, driver, x, y, z, h }) {
    const car = this.list.get(id);
    if (!car) return;
    car.driver = driver;
    car.target.set(x, y, z);
    car.targetH = h;
    if (!driver) car.speed = car.steer = car.siren = 0;
  }

  // Positions from the server for cars other people are driving.
  applyStates(states, myCarId) {
    for (const [id, x, y, z, h, speed, steer, siren] of states) {
      const car = this.list.get(id);
      if (!car || id === myCarId) continue;
      car.target.set(x, y, z);
      car.targetH = h;
      car.speed = speed;
      car.steer = steer;
      car.siren = siren;
    }
  }

  place(car) {
    car.model.group.position.copy(car.pos);
    car.model.group.rotation.y = car.h;
  }

  // Where the driver sits, in world space. Drivers are drawn a little smaller (SEAT_SCALE)
  // so they fit under the roof.
  seat(car) {
    const s = car.spec;
    const local = new THREE.Vector3(-s.width * 0.22, s.ride + 0.12 - 0.72 * SEAT_SCALE, 0.25);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.h);
    return { position: local.add(car.pos), yaw: car.h };
  }

  // Axis-aligned boxes so players can bump into (and stand on) cars.
  boxes(exceptId) {
    const out = [];
    for (const car of this.list.values()) {
      if (car.id === exceptId) continue;
      const s = car.spec, c = Math.abs(Math.cos(car.h)), n = Math.abs(Math.sin(car.h));
      const ex = c * s.width / 2 + n * s.length / 2, ez = n * s.width / 2 + c * s.length / 2;
      out.push([car.pos.x - ex, car.pos.y + s.ride * 0.6, car.pos.z - ez, car.pos.x + ex, car.pos.y + s.height, car.pos.z + ez]);
    }
    return out;
  }

  // Finds the car a ray points at (for getting in or removing it).
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const car of this.list.values()) {
      const s = car.spec;
      const o = origin.clone().sub(car.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), -car.h);
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -car.h);
      let tMin = 0, tMax = maxDist;
      const min = [-s.width / 2, 0, -s.length / 2], max = [s.width / 2, s.height, s.length / 2];
      const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
      let hit = true;
      for (let i = 0; i < 3 && hit; i++) {
        if (Math.abs(da[i]) < 1e-9) {
          if (oa[i] < min[i] || oa[i] > max[i]) hit = false;
          continue;
        }
        let t1 = (min[i] - oa[i]) / da[i], t2 = (max[i] - oa[i]) / da[i];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) hit = false;
      }
      if (hit && (!best || tMin < best.distance)) best = { car, distance: tMin };
    }
    return best;
  }

  // Would a car of this kind fit at this spot?
  blocked(spec, x, y, z, h, ignoreId) {
    const sin = Math.sin(h), cos = Math.cos(h);
    const hw = spec.width / 2 - 0.1, hl = spec.length / 2 - 0.1;
    const heights = spec.climb ? [y + 0.3, y + 1.4, y + spec.height - 0.1] : [y + 0.25, y + spec.height - 0.1];
    for (const lx of [-hw, 0, hw])
      for (const lz of [-hl, -hl / 2, 0, hl / 2, hl]) {
        if (lx === 0 && Math.abs(lz) < hl) continue; // only the outline matters
        const wx = x + lx * cos + lz * sin, wz = z - lx * sin + lz * cos;
        for (const py of heights) if (solidAt(this.world, wx, py, wz)) return true;
      }
    for (const other of this.list.values()) {
      if (other.id === ignoreId || Math.abs(other.pos.y - y) > 2) continue;
      const r = (spec.length + other.spec.length) * 0.32;
      if (Math.hypot(other.pos.x - x, other.pos.z - z) < r) return true;
    }
    return false;
  }

  // The car the local player drives. Returns events like 'bump' or 'bounce' for sounds.
  drive(car, dt, keys) {
    const s = car.spec;
    const throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const steerIn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const max = s.maxSpeed * (boost ? 1.35 : 1);
    const events = [];

    if (throttle > 0) car.speed += (car.speed < 0 ? s.accel * 2.5 : s.accel * (boost ? 1.4 : 1)) * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0 ? s.accel * 2.5 : s.accel * 0.7) * dt;
    else car.speed -= car.speed * Math.min(1, 1.2 * dt);
    if (keys.has('Space')) car.speed -= car.speed * Math.min(1, 5 * dt);
    car.speed = Math.max(-7, Math.min(max, car.speed));
    if (Math.abs(car.speed) < 0.05 && !throttle) car.speed = 0;

    car.steer += (steerIn * 0.6 - car.steer) * Math.min(1, 6 * dt);
    const steer = car.steer * (1 - 0.45 * Math.min(1, Math.abs(car.speed) / s.maxSpeed));
    const newH = car.h + (car.speed * Math.tan(steer) / (s.length * 0.62)) * dt;

    const nx = car.pos.x - Math.sin(newH) * car.speed * dt;
    const nz = car.pos.z - Math.cos(newH) * car.speed * dt;
    if (!this.blocked(s, nx, car.pos.y, nz, newH, car.id)) {
      car.pos.x = nx;
      car.pos.z = nz;
      car.h = newH;
    } else if (s.climb && car.vy <= 0 && !this.blocked(s, nx, car.pos.y + 1.05, nz, newH, car.id)) {
      // Monster trucks can climb up one block.
      car.pos.set(nx, Math.floor(car.pos.y + 1.05), nz);
      car.h = newH;
      car.speed *= 0.8;
    } else {
      if (Math.abs(car.speed) > 4) events.push('bump');
      car.speed *= -0.3;
      if (!this.blocked(s, car.pos.x, car.pos.y, car.pos.z, newH, car.id)) car.h = newH;
    }

    // Gravity, landing, and bounce pads.
    car.vy -= GRAVITY * dt;
    const ny = car.pos.y + car.vy * dt;
    const sin = Math.sin(car.h), cos = Math.cos(car.h);
    const feet = [];
    for (const lx of [-s.width / 2 + 0.2, s.width / 2 - 0.2])
      for (const lz of [-s.length / 2 + 0.3, s.length / 2 - 0.3]) feet.push([car.pos.x + lx * cos + lz * sin, car.pos.z - lx * sin + lz * cos]);
    const landed = car.vy <= 0 && feet.some(([x, z]) => solidAt(this.world, x, ny - 0.001, z));
    if (landed) {
      car.pos.y = Math.floor(ny - 0.001) + 1;
      if (car.vy < -12) events.push('land');
      car.vy = 0;
      const below = Math.floor(car.pos.y - 0.5);
      if (feet.some(([x, z]) => BLOCKS[blockId(this.world.get(Math.floor(x), below, Math.floor(z)))]?.bounce)) {
        car.vy = 17;
        events.push('bounce');
      }
    } else {
      car.pos.y = ny;
    }
    car.target.copy(car.pos);
    car.targetH = car.h;
    return events;
  }

  // Cars further away than this from `viewer` aren't drawn.
  setView(viewer, distance) {
    this.viewer = viewer;
    this.viewDistance = distance;
  }

  update(dt, time, nightK, myCarId) {
    const k = 1 - Math.exp(-10 * dt);
    for (const car of this.list.values()) {
      if (car.id !== myCarId) {
        car.pos.lerp(car.target, k);
        let dh = car.targetH - car.h;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        car.h += dh * k;
      }
      this.place(car);
      const far = this.viewer && car.pos.distanceToSquared(this.viewer) > this.viewDistance ** 2;
      car.model.group.visible = !far;
      if (far) continue;
      car.spin -= (car.speed * dt) / car.spec.wheelR;
      for (const w of car.model.wheels) w.rotation.x = car.spin;
      for (const p of car.model.steerers) p.rotation.y = car.steer;
      // Headlights glow at night or while someone is driving.
      const lit = car.driver ? 0.6 + nightK * 2.5 : 0.15;
      car.model.headMat.emissiveIntensity = lit;
      car.model.tailMat.emissiveIntensity = car.driver ? 0.6 + nightK * 1.5 : 0.15;
      if (car.model.siren) {
        const flash = Math.floor(time * 6) % 2;
        car.model.siren.red.emissiveIntensity = car.siren && flash === 0 ? 5 : 0.2;
        car.model.siren.blue.emissiveIntensity = car.siren && flash === 1 ? 5 : 0.2;
      }
    }
  }
}
