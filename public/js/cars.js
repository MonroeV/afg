// Cars you can spawn, drive and share with other players.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, blockId } from './shared/blocks.js';
import { VEHICLES, MAX_HP, SMOKE_HP, FIRE_HP, outlinePoints, rotorPoints, vehicleBlocked, toWorld } from './shared/vehicles.js';

export const CAR_SPECS = VEHICLES;

const GRAVITY = 30;
const HELI_GRAVITY = 14;
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
  if (kind === 'heli') return buildHeliModel(color);
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
  const meshes = mergeParts(g, parts, mats);

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

  return {
    group: g, wheels, steerers, paint: mats.paint, paintMesh: meshes.paint, baseColor: new THREE.Color(color),
    headMat: mats.head, tailMat: mats.tail, siren: kind === 'police' ? { red: mats.red, blue: mats.blue } : null,
  };
}

// Boxes with the same material are merged into one mesh, so each vehicle only costs a few draw calls.
function mergeParts(group, parts, mats) {
  const meshes = {};
  for (const [mat, geos] of Object.entries(parts)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mats[mat]);
    mesh.castShadow = ['paint', 'dark', 'glass', 'chrome'].includes(mat);
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes[mat] = mesh;
    for (const geo of geos) geo.dispose();
  }
  return meshes;
}

function buildHeliModel(color) {
  const s = VEHICLES.heli;
  const g = new THREE.Group();
  const mats = {
    paint: new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.5 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xff2020, emissiveIntensity: 0.6 }),
  };
  const parts = {};
  const add = (geo, mat, x, y, z) => (parts[mat] ??= []).push(geo.translate(x, y, z));
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  add(B(1.8, 1.3, 2.4), 'paint', 0, 1.25, 0.2);
  add(B(1.82, 0.35, 2.42), 'white', 0, 0.75, 0.2);
  add(B(1.6, 1.0, 1.0), 'glass', 0, 1.3, -1.45);
  add(B(1.4, 0.3, 0.9), 'paint', 0, 0.75, -1.35);
  for (const x of [-1, 1]) add(B(0.05, 0.7, 1.2), 'glass', x * 0.91, 1.4, -0.1);
  add(B(0.36, 0.36, s.tail), 'paint', 0, 1.55, 1.4 + s.tail / 2);
  add(B(0.08, 0.9, 0.55), 'paint', 0, 2.0, 1.4 + s.tail - 0.1);
  add(B(1.1, 0.06, 0.4), 'white', 0, 1.6, 1.4 + s.tail - 0.5);
  add(B(0.1, 0.1, 0.1), 'tail', 0, 2.48, 1.4 + s.tail - 0.1);
  add(new THREE.CylinderGeometry(0.1, 0.14, 0.45, 8), 'dark', 0, 2.1, 0.1);
  for (const x of [-1, 1]) {
    add(B(0.09, 0.09, 3.0), 'dark', x * 0.85, 0.05, 0.1);
    for (const z of [-0.8, 0.9]) add(B(0.07, 0.6, 0.07), 'dark', x * 0.8, 0.35, z);
  }
  const meshes = mergeParts(g, parts, mats);

  // Main rotor (4 blades) and tail rotor spin separately.
  const rotor = new THREE.Group();
  rotor.position.set(0, s.height - 0.05, 0.1);
  const bladeGeo = new THREE.BoxGeometry(s.rotor * 2, 0.04, 0.22);
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(bladeGeo, mats.dark);
    blade.rotation.y = a;
    blade.castShadow = true;
    rotor.add(blade);
  }
  const blur = new THREE.Mesh(new THREE.CircleGeometry(s.rotor, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false }));
  rotor.add(blur);
  g.add(rotor);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.12, 2.0, 1.4 + s.tail - 0.1);
  tailRotor.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.1), mats.dark));
  g.add(tailRotor);
  return {
    group: g, wheels: [], steerers: [], rotor, tailRotor, blur, paint: mats.paint, paintMesh: meshes.paint,
    baseColor: new THREE.Color(color), headMat: mats.tail, tailMat: mats.tail, siren: null,
  };
}

// Is the point (x, y, z) inside something solid?
const solidAt = (world, x, y, z) => world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z));
const UP = new THREE.Vector3(0, 1, 0);

// Top speed of each gear: low gears are short, high gears are long.
const gearTop = (spec, gear) => spec.maxSpeed * (gear / spec.gears) ** 0.8;

export class Cars {
  constructor(scene, world, effects) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.list = new Map();
    this.isSolid = (x, y, z) => world.isSolid(x, y, z);
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
      vel: new THREE.Vector3(),
      h: data.h,
      targetH: data.h,
      hp: data.hp ?? MAX_HP,
      speed: 0, steer: 0, siren: 0, vy: 0, spin: 0,
      gear: 1, rpm: 0, shiftT: 0,
      pitch: 0, roll: 0, targetPitch: 0, targetRoll: 0, yawRate: 0, collective: 0.5, rotorSpin: 0, rotorAngle: 0,
      outline: outlinePoints(spec),
      rotorPts: spec.flying ? rotorPoints(spec) : null,
      fxTimer: 0, strikeTimer: 0,
    };
    this.list.set(car.id, car);
    this.scene.add(model.group);
    this.applyHp(car, car.hp);
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

  // Positions from the server for vehicles other people are driving.
  applyStates(states, myCarId) {
    for (const [id, x, y, z, h, speed, steer, siren, pitch, roll, rotor] of states) {
      const car = this.list.get(id);
      if (!car || id === myCarId) continue;
      car.target.set(x, y, z);
      car.targetH = h;
      car.speed = speed;
      car.steer = steer;
      car.siren = siren;
      car.targetPitch = pitch || 0;
      car.targetRoll = roll || 0;
      car.rotorSpin = rotor || 0;
    }
  }

  // Health changed: darken the paint, and dent the body where it was hit.
  applyHp(car, hp, impact) {
    const lost = car.hp - hp;
    car.hp = hp;
    const k = 1 - hp / MAX_HP;
    car.model.paint.color.copy(car.model.baseColor).lerp(new THREE.Color(0x2a2522), k * 0.75);
    if (impact && lost > 0) this.dent(car, impact, Math.min(1, lost / 25));
  }

  dent(car, [ix, iy, iz], strength) {
    const geo = car.model.paintMesh?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position;
    const cy = car.spec.height / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const d = Math.hypot(x - ix, y - iy, z - iz);
      if (d > 1) continue;
      // Push the panel in toward the middle of the vehicle.
      const k = (1 - d) * 0.22 * strength;
      pos.setXYZ(i, x - x * k, y + (cy - y) * k * 0.6, z - z * k * 0.5);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  place(car) {
    const g = car.model.group;
    g.position.copy(car.pos);
    g.rotation.order = 'YXZ';
    g.rotation.set(car.pitch, car.h, car.roll);
  }

  // Where the driver sits, in world space. Drivers are drawn a little smaller (SEAT_SCALE)
  // so they fit under the roof.
  seat(car) {
    const s = car.spec;
    const local = s.flying
      ? new THREE.Vector3(-0.4, 0.62 - 0.72 * SEAT_SCALE, -0.75)
      : new THREE.Vector3(-s.width * 0.22, s.ride + 0.12 - 0.72 * SEAT_SCALE, 0.25);
    local.applyEuler(new THREE.Euler(car.pitch, car.h, car.roll, 'YXZ'));
    return { position: local.add(car.pos), yaw: car.h };
  }

  // Turns a world point into the vehicle's own coordinates (for dents).
  toLocal(car, p) {
    return p.clone().sub(car.pos).applyAxisAngle(UP, -car.h).toArray().map(v => Math.round(v * 100) / 100);
  }

  // Axis-aligned boxes so players can bump into (and stand on) vehicles.
  boxes(exceptId) {
    const out = [];
    for (const car of this.list.values()) {
      if (car.id === exceptId) continue;
      const s = car.spec, c = Math.abs(Math.cos(car.h)), n = Math.abs(Math.sin(car.h));
      const ex = c * s.width / 2 + n * s.length / 2, ez = n * s.width / 2 + c * s.length / 2;
      const bottom = s.flying ? 0.3 : s.ride * 0.6;
      out.push([car.pos.x - ex, car.pos.y + bottom, car.pos.z - ez, car.pos.x + ex, car.pos.y + (s.flying ? 2.0 : s.height), car.pos.z + ez]);
    }
    return out;
  }

  // Finds the vehicle a ray points at (for getting in or hitting it).
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const car of this.list.values()) {
      const s = car.spec;
      const o = origin.clone().sub(car.pos).applyAxisAngle(UP, -car.h);
      const d = dir.clone().applyAxisAngle(UP, -car.h);
      let tMin = 0, tMax = maxDist;
      const min = [-s.width / 2, 0, -s.length / 2], max = [s.width / 2, s.flying ? 2.1 : s.height, s.length / 2];
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
      if (hit && (!best || tMin < best.distance)) best = { car, distance: tMin, point: origin.clone().addScaledVector(dir, tMin) };
    }
    return best;
  }

  // Would this vehicle fit here? Also notes which other vehicle it bumped into.
  blocked(spec, x, y, z, h, ignoreId, points) {
    this.lastHit = null;
    if (vehicleBlocked(this.isSolid, spec, x, y, z, h, points || outlinePoints(spec))) return true;
    for (const other of this.list.values()) {
      if (other.id === ignoreId || Math.abs(other.pos.y - y) > 2) continue;
      const r = (spec.length + other.spec.length) * 0.32;
      if (Math.hypot(other.pos.x - x, other.pos.z - z) < r) {
        this.lastHit = other;
        return true;
      }
    }
    return false;
  }

  // Drives the vehicle the local player is in. Returns events for sounds and damage:
  // { type: 'shift' | 'bump' | 'land' | 'bounce' | 'damage', amount, impact, other }
  drive(car, dt, keys) {
    return car.spec.flying ? this.fly(car, dt, keys) : this.driveCar(car, dt, keys);
  }

  driveCar(car, dt, keys) {
    const s = car.spec;
    const throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const steerIn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const max = s.maxSpeed * (boost ? 1.3 : 1);
    const events = [];
    const health = 0.55 + 0.45 * (car.hp / MAX_HP); // wrecked cars are sluggish

    // Automatic gearbox: shift up near the top of each gear, down when slowing.
    car.shiftT = Math.max(0, car.shiftT - dt);
    const fwd = Math.max(0, car.speed);
    if (car.speed < -0.5) car.gear = 0; // reverse
    else if (car.gear === 0) car.gear = 1;
    if (car.gear > 0) {
      if (fwd / gearTop(s, car.gear) > 0.95 && car.gear < s.gears && throttle > 0 && !car.shiftT) {
        car.gear++;
        car.shiftT = 0.25;
        events.push({ type: 'shift' });
      } else if (car.gear > 1 && fwd < gearTop(s, car.gear - 1) * 0.7) {
        car.gear--;
        if (throttle > 0) events.push({ type: 'shift' });
      }
      car.rpm = Math.min(1, fwd / gearTop(s, car.gear));
    } else {
      car.rpm = Math.min(1, -car.speed / 7);
    }
    const gearPull = car.gear > 0 ? 1.45 - 0.13 * car.gear : 1;
    const pull = s.accel * gearPull * health * (car.shiftT > 0 ? 0.1 : 1) * (boost ? 1.35 : 1);

    if (throttle > 0) car.speed += (car.speed < 0 ? s.accel * 2.5 : pull) * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0 ? s.accel * 2.5 : s.accel * 0.7) * dt;
    else car.speed -= car.speed * Math.min(1, 1.2 * dt);
    if (keys.has('Space')) car.speed -= car.speed * Math.min(1, 5 * dt);
    car.speed = Math.max(-7, Math.min(max, car.speed));
    if (Math.abs(car.speed) < 0.05 && !throttle) car.speed = 0;
    car.load = throttle > 0 ? 1 : 0;

    car.steer += (steerIn * 0.6 - car.steer) * Math.min(1, 6 * dt);
    const steer = car.steer * (1 - 0.45 * Math.min(1, Math.abs(car.speed) / s.maxSpeed));
    const newH = car.h + (car.speed * Math.tan(steer) / (s.length * 0.62)) * dt;

    const nx = car.pos.x - Math.sin(newH) * car.speed * dt;
    const nz = car.pos.z - Math.cos(newH) * car.speed * dt;
    if (!this.blocked(s, nx, car.pos.y, nz, newH, car.id, car.outline)) {
      car.pos.x = nx;
      car.pos.z = nz;
      car.h = newH;
    } else if (s.climb && car.vy <= 0 && !this.blocked(s, nx, car.pos.y + 1.05, nz, newH, car.id, car.outline)) {
      // Monster trucks can climb up one block.
      car.pos.set(nx, Math.floor(car.pos.y + 1.05), nz);
      car.h = newH;
      car.speed *= 0.8;
    } else {
      const impact = Math.abs(car.speed);
      const other = this.lastHit;
      if (impact > 4) events.push({ type: 'bump', power: Math.min(1, impact / 20) });
      // Hitting things hard damages the car (and whatever car it hit).
      if (impact > 7) {
        const amount = (impact - 7) * 3;
        const front = car.speed > 0 ? -1 : 1;
        events.push({ type: 'damage', amount, impact: [0, s.ride + s.bodyH * 0.6, front * s.length / 2] });
        if (other) events.push({ type: 'damage', other, amount: amount * 0.8, impact: this.toLocal(other, car.pos) });
      }
      car.speed *= -0.3;
      if (!this.blocked(s, car.pos.x, car.pos.y, car.pos.z, newH, car.id, car.outline)) car.h = newH;
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
      if (car.vy < -12) {
        events.push({ type: 'land' });
        if (car.vy < -16) events.push({ type: 'damage', amount: (-car.vy - 16) * 3, impact: [0, 0, 0] });
      }
      car.vy = 0;
      const below = Math.floor(car.pos.y - 0.5);
      if (feet.some(([x, z]) => BLOCKS[blockId(this.world.get(Math.floor(x), below, Math.floor(z)))]?.bounce)) {
        car.vy = 17;
        events.push({ type: 'bounce' });
      }
    } else {
      car.pos.y = ny;
    }
    car.target.copy(car.pos);
    car.targetH = car.h;
    return events;
  }

  // Helicopter flight. Tilting moves you, but also steals lift, and you keep sliding
  // until you tilt the other way: easy to learn, tricky to master.
  fly(car, dt, keys) {
    const s = car.spec;
    const events = [];
    const health = 0.6 + 0.4 * (car.hp / MAX_HP);
    car.rotorSpin = Math.min(1, car.rotorSpin + dt / 3.5); // engine spools up when you get in
    const lift = car.rotorSpin ** 2;

    const up = keys.has('Space'), down = keys.has('ShiftLeft') || keys.has('ShiftRight');
    car.collective += ((up ? 1 : down ? 0.2 : 0.5) - car.collective) * Math.min(1, 1.6 * dt);
    const pitchIn = (keys.has('KeyW') ? -0.45 : 0) + (keys.has('KeyS') ? 0.35 : 0);
    car.pitch += (pitchIn - car.pitch) * Math.min(1, 1.8 * dt);
    const yawIn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    car.yawRate += (yawIn * 1.3 * lift - car.yawRate) * Math.min(1, 2.2 * dt);
    car.h += car.yawRate * dt;
    car.roll += (-car.yawRate * 0.25 - car.roll) * Math.min(1, 3 * dt);

    // Forces: lift along the tilted rotor, gravity down, a bit of air drag.
    const thrust = lift * car.collective * 2 * HELI_GRAVITY * health;
    const fwd = new THREE.Vector3(-Math.sin(car.h), 0, -Math.cos(car.h));
    car.vel.addScaledVector(fwd, thrust * Math.sin(-car.pitch) * dt);
    car.vel.y += (thrust * Math.cos(car.pitch) * Math.cos(car.roll) - HELI_GRAVITY) * dt;
    const drag = Math.exp(-0.32 * dt);
    car.vel.x *= drag;
    car.vel.z *= drag;
    car.vel.y *= Math.exp(-0.9 * dt);
    // A little wind keeps you on your toes.
    const t = performance.now() / 1000;
    if (car.pos.y > 3) {
      car.vel.x += Math.sin(t * 0.3) * 0.25 * dt;
      car.vel.z += Math.cos(t * 0.23) * 0.25 * dt;
    }

    // Move one axis at a time so we can slide along walls and land on things.
    for (const axis of ['x', 'z', 'y']) {
      const step = car.vel[axis] * dt;
      if (!step) continue;
      const next = car.pos.clone();
      next[axis] += step;
      if (axis === 'y' && next.y > 120) {
        car.vel.y = Math.min(car.vel.y, 0);
        continue;
      }
      if (!this.blocked(s, next.x, next.y, next.z, car.h, car.id, car.outline)) {
        car.pos.copy(next);
        continue;
      }
      const speed = Math.abs(car.vel[axis]);
      if (axis === 'y' && car.vel.y < 0) {
        // Touchdown. Land gently or you'll damage the helicopter!
        if (speed > 8) events.push({ type: 'damage', amount: (speed - 8) * 5, impact: [0, 0, 0] });
        if (speed > 4) events.push({ type: 'land' });
        // Settle right down onto whatever we landed on.
        for (let i = 0; i < 25 && !this.blocked(s, car.pos.x, car.pos.y - 0.02, car.pos.z, car.h, car.id, car.outline); i++) car.pos.y -= 0.02;
        car.vel.y = 0;
      } else {
        if (speed > 4) {
          events.push({ type: 'bump', power: Math.min(1, speed / 15) });
          events.push({ type: 'damage', amount: (speed - 4) * 4, impact: axis === 'y' ? [0, s.height, 0] : [0, 1.2, -s.length / 2] });
        }
        car.vel[axis] *= -0.3;
      }
    }
    // On the ground: skids grip.
    car.onGround = this.blocked(s, car.pos.x, car.pos.y - 0.08, car.pos.z, car.h, car.id, car.outline);
    if (car.onGround) {
      car.vel.x *= Math.exp(-5 * dt);
      car.vel.z *= Math.exp(-5 * dt);
      car.pitch *= Math.exp(-4 * dt);
    }
    // Rotor strikes hurt.
    car.strikeTimer -= dt;
    if (car.strikeTimer <= 0 && car.rotorSpin > 0.3 && vehicleBlocked(this.isSolid, s, car.pos.x, car.pos.y, car.pos.z, car.h, car.rotorPts)) {
      car.strikeTimer = 0.5;
      car.vel.multiplyScalar(-0.4);
      events.push({ type: 'bump', power: 1 });
      events.push({ type: 'damage', amount: 14, impact: [0, s.height, 0] });
    }

    car.speed = Math.hypot(car.vel.x, car.vel.z);
    car.target.copy(car.pos);
    car.targetH = car.h;
    car.targetPitch = car.pitch;
    car.targetRoll = car.roll;
    return events;
  }

  update(dt, time, nightK, myCarId) {
    const k = 1 - Math.exp(-10 * dt);
    for (const car of this.list.values()) {
      if (car.id !== myCarId) {
        car.pos.lerp(car.target, k);
        let dh = car.targetH - car.h;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        car.h += dh * k;
        car.pitch += (car.targetPitch - car.pitch) * k;
        car.roll += (car.targetRoll - car.roll) * k;
        if (car.spec.flying && !car.driver) car.rotorSpin = Math.max(0, car.rotorSpin - dt / 6);
      }
      this.place(car);
      const s = car.spec;

      // Smoke when badly damaged, fire when it's about to blow.
      car.fxTimer -= dt;
      if (car.hp < SMOKE_HP && car.fxTimer <= 0 && this.effects) {
        car.fxTimer = car.hp < FIRE_HP ? 0.04 : 0.12;
        const [x, y, z] = toWorld(s.flying ? [0, 2.2, 0.6] : [0, s.ride + s.bodyH, -s.length / 2 + 0.6], car.pos.x, car.pos.y, car.pos.z, car.h);
        this.effects.smokePuff(x, y, z, car.hp < FIRE_HP ? 0.9 : 0.4);
        if (car.hp < FIRE_HP) for (let i = 0; i < 3; i++) this.effects.flame(x, y, z, 1.4);
      }

      const far = this.viewer && car.pos.distanceToSquared(this.viewer) > this.viewDistance ** 2;
      car.model.group.visible = !far;
      if (far) continue;
      if (s.flying) {
        car.rotorAngle += car.rotorSpin * 28 * dt;
        car.model.rotor.rotation.y = car.rotorAngle;
        car.model.tailRotor.rotation.x = car.rotorAngle * 1.7;
        car.model.blur.material.opacity = Math.max(0, car.rotorSpin - 0.5) * 0.35;
        continue;
      }
      car.spin -= (car.speed * dt) / s.wheelR;
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

  // Cars further away than this from `viewer` aren't drawn.
  setView(viewer, distance) {
    this.viewer = viewer;
    this.viewDistance = distance;
  }
}
