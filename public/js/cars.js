// Cars you can spawn, drive and share with other players.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, blockId } from './shared/blocks.js';
import { VEHICLES, MAX_HP, SMOKE_HP, FIRE_HP, PERSON_MASS, outlinePoints, rotorPoints, vehicleBlocked, toWorld } from './shared/vehicles.js';

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
    // Car paint with a glossy clear coat on top, so it reflects the world around it.
    paint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.7 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x223344, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.5, envMapIntensity: 2 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.95, roughness: 0.2 }),
    head: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.3 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x8a0a0a, emissive: 0xff0000, emissiveIntensity: 0.3 }),
    brake: new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff0000, emissiveIntensity: 0.04 }),
    reverse: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0.05 }),
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
    add(B(0.36, 0.16, 0.04), 'tail', x * (W / 2 - 0.3), bodyY + 0.08, L / 2 + 0.01);
    add(B(0.14, 0.08, 0.04), 'reverse', x * (W / 2 - 0.55), bodyY + 0.08, L / 2 + 0.01);
    add(B(0.08, 0.06, 0.16), 'paint', x * (W / 2 + 0.04), ride + bodyH + 0.02, -0.55);
  }
  // A third brake light along the top of the back window.
  add(B(cabinW * 0.4, 0.05, 0.03), 'brake', 0, ride + bodyH + cabinH - 0.09, 0.15 + cabinL / 2 + 0.03);
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
    headMat: mats.head, tailMat: mats.tail, brakeMat: mats.brake, reverseMat: mats.reverse, siren: kind === 'police' ? { red: mats.red, blue: mats.blue } : null,
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
    paint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
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

// Do two vehicles' rectangles (seen from above) overlap? Checks along each car's
// length and width (the "separating axis" test).
function footprintsOverlap(sa, ax, az, ah, sb, bx, bz, bh) {
  const axes = [[-Math.sin(ah), -Math.cos(ah)], [Math.cos(ah), -Math.sin(ah)], [-Math.sin(bh), -Math.cos(bh)], [Math.cos(bh), -Math.sin(bh)]];
  const half = (s, h, [ux, uz]) => {
    const f = [-Math.sin(h), -Math.cos(h)], side = [Math.cos(h), -Math.sin(h)];
    return Math.abs(ux * f[0] + uz * f[1]) * s.length / 2 + Math.abs(ux * side[0] + uz * side[1]) * s.width / 2;
  };
  for (const u of axes) {
    const gap = Math.abs((bx - ax) * u[0] + (bz - az) * u[1]);
    if (gap > half(sa, ah, u) + half(sb, bh, u) - 0.05) return false;
  }
  return true;
}

// A three-speed automatic. Each gear's top speed, as a fraction of the car's top speed:
// 1st is short, 2nd pulls all the way up to top speed, and 3rd is an overdrive that
// would only redline at well over top speed, so it cruises at medium revs.
const GEAR_TOPS = [0, 0.3, 1.0, 1 / 0.58];
const IDLE_RPM = 0.14;
const gearTop = (spec, gear) => spec.maxSpeed * GEAR_TOPS[gear];
const rpmIn = (spec, gear, speed) => IDLE_RPM + (1 - IDLE_RPM) * Math.min(1, Math.max(0, speed) / gearTop(spec, gear));

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
      passengers: data.passengers || [],
      spec,
      model,
      pos: new THREE.Vector3(data.x, data.y, data.z),
      target: new THREE.Vector3(data.x, data.y, data.z),
      vel: new THREE.Vector3(), // helicopter velocity
      push: new THREE.Vector3(), // a shove from a crash: sideways skid (or rolling, for a loose car)
      loose: false, // true while this game is moving a knocked car that nobody is driving
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
    // Shiny paint and windows reflect the world around them.
    model.group.traverse(o => {
      if (o.isMesh && o.material.metalness !== undefined && o.material.roughness < 0.5) this.reflections?.addShiny(o.material, o.material.transparent ? 1.4 : 1);
    });
    this.applyHp(car, car.hp);
    this.place(car);
    return car;
  }

  remove(id) {
    const car = this.list.get(id);
    if (!car) return;
    this.scene.remove(car.model.group);
    car.model.group.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      this.reflections?.removeShiny(o.material);
    });
    this.list.delete(id);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }

  setDriver({ id, driver, passengers, x, y, z, h }) {
    const car = this.list.get(id);
    if (!car) return;
    car.driver = driver;
    car.passengers = passengers || [];
    car.loose = false;
    car.push.set(0, 0, 0);
    car.target.set(x, y, z);
    car.targetH = h;
    if (!driver) car.speed = car.steer = car.siren = 0;
  }

  // Positions from the server for vehicles other people are driving.
  applyStates(states, myCarId) {
    for (const [id, x, y, z, h, speed, steer, siren, pitch, roll, rotor, flags] of states) {
      const car = this.list.get(id);
      if (!car || id === myCarId || car.loose) continue;
      car.braking = !!(flags & 1);
      car.reversing = !!(flags & 2);
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
  // Seat 0 is the driver (front left), 1 is front right, 2 is in the back.
  seat(car, index = 0) {
    const s = car.spec;
    const front = s.flying ? -0.75 : 0.25, back = s.flying ? 0.35 : 0.95;
    const sx = [-1, 1, 0][index] * (s.flying ? 0.4 : s.width * 0.22);
    const local = new THREE.Vector3(sx, (s.flying ? 0.62 : s.ride + 0.12) - 0.72 * SEAT_SCALE, index === 2 ? back : front);
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
      // Three boxes along the car fit a turned car much better than one big box.
      const s = car.spec, c = Math.abs(Math.cos(car.h)), n = Math.abs(Math.sin(car.h));
      const piece = s.length / 3;
      const ex = c * s.width / 2 + n * piece / 2, ez = n * s.width / 2 + c * piece / 2;
      const bottom = s.flying ? 0.3 : s.ride * 0.6, top = s.flying ? 2.0 : s.height;
      const fx = -Math.sin(car.h), fz = -Math.cos(car.h);
      for (const k of [-1, 0, 1]) {
        const px = car.pos.x + fx * piece * k, pz = car.pos.z + fz * piece * k;
        const box = [px - ex, car.pos.y + bottom, pz - ez, px + ex, car.pos.y + top, pz + ez];
        box.car = car; // so a player walking into it can push it
        out.push(box);
      }
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
      if (footprintsOverlap(spec, x, z, h, other.spec, other.pos.x, other.pos.z, other.h)) {
        this.lastHit = other;
        return true;
      }
    }
    return false;
  }

  // ---------- Momentum ----------

  fwd(car) {
    return new THREE.Vector3(-Math.sin(car.h), 0, -Math.cos(car.h));
  }

  velocityOf(car) {
    if (car.spec.flying) return car.vel.clone();
    return this.fwd(car).multiplyScalar(car.speed).add(car.push);
  }

  // Splits a new velocity into "rolling forward/back" (speed) and "skidding" (push).
  setVelocity(car, v) {
    if (car.spec.flying) {
      car.vel.copy(v);
      return;
    }
    const f = this.fwd(car);
    const along = v.x * f.x + v.z * f.z;
    if (car.loose) {
      car.push.set(v.x, 0, v.z);
    } else {
      car.speed = along;
      car.push.set(v.x - f.x * along, 0, v.z - f.z * along);
    }
  }

  // Two vehicles bumped: trade momentum (Newton's laws). The heavier one barely moves,
  // the lighter one gets knocked back, both slow down, and off-center hits make things spin.
  collide(a, b) {
    const events = [];
    const va = this.velocityOf(a), vb = this.velocityOf(b);
    const toB = new THREE.Vector3(b.pos.x - a.pos.x, 0, b.pos.z - a.pos.z);
    if (toB.lengthSq() < 1e-6) toB.copy(this.fwd(a));
    toB.normalize();

    // Where they touch: the point of A's body pointing at B, kept inside B's outline.
    const rel = va.clone().sub(vb).setY(0);
    const dir = rel.lengthSq() > 0.01 ? rel.normalize() : toB.clone();
    const fa = this.fwd(a), sa = new THREE.Vector3(-fa.z, 0, fa.x);
    const reach = Math.abs(dir.dot(fa)) * a.spec.length / 2 + Math.abs(dir.dot(sa)) * a.spec.width / 2;
    const contact = a.pos.clone().addScaledVector(dir, reach);
    const local = contact.clone().sub(b.pos).applyAxisAngle(UP, -b.h);
    local.x = Math.max(-b.spec.width / 2, Math.min(b.spec.width / 2, local.x));
    local.z = Math.max(-b.spec.length / 2, Math.min(b.spec.length / 2, local.z));
    // The push goes straight into whichever side of B was hit.
    const sideHit = Math.abs(local.x) / b.spec.width > Math.abs(local.z) / b.spec.length;
    const n = (sideHit ? new THREE.Vector3(-Math.sign(local.x), 0, 0) : new THREE.Vector3(0, 0, -Math.sign(local.z))).applyAxisAngle(UP, b.h);
    if (n.dot(toB) < 0) n.negate();

    const closing = va.clone().sub(vb).dot(n);
    if (closing <= 0.05) return events;
    const ma = a.spec.mass, mb = b.spec.mass, bounce = 0.25;
    const J = ((1 + bounce) * closing) / (1 / ma + 1 / mb);
    const dva = n.clone().multiplyScalar(-J / ma), dvb = n.clone().multiplyScalar(J / mb);
    this.setVelocity(a, va.add(dva));

    // Turning force: lever arm (contact point from B's middle) times the push,
    // divided by how hard a box that size is to spin.
    const r = local.applyAxisAngle(UP, b.h);
    const inertia = (b.spec.length ** 2 + b.spec.width ** 2) / 12;
    const spin = (r.z * dvb.x - r.x * dvb.z) / inertia;
    if (b.id === this.myCarId) {
      this.setVelocity(b, vb.clone().add(dvb)); // a loose car rolled into the car we're driving
    } else if (b.driver) {
      events.push({ type: 'impulse', other: b, dv: dvb, spin });
    } else {
      b.loose = true;
      b.push.add(dvb);
      b.yawRate = (b.yawRate || 0) + spin;
    }
    if (closing > 1.5) events.push({ type: 'bump', power: Math.min(1, closing / 15) });
    if (closing > 7) {
      // The lighter vehicle takes more of the damage.
      const total = (closing - 7) * 3;
      const at = (car, p) => this.toLocal(car, p).map(v => Math.max(-2, Math.min(2, v)));
      events.push({ type: 'damage', amount: total * (2 * mb) / (ma + mb), impact: at(a, b.pos) });
      events.push({ type: 'damage', other: b, amount: total * (2 * ma) / (ma + mb), impact: at(b, a.pos) });
    }
    return events;
  }

  // Bumping into people knocks them back (cartoon style: no harm done).
  // `people` is a list of { id, pos } for other players standing around.
  hitPeople(car, events) {
    if (!this.people) return;
    const s = car.spec, now = performance.now();
    car.bumped ??= {};
    for (const person of this.people()) {
      const local = person.pos.clone().sub(car.pos).applyAxisAngle(UP, -car.h);
      if (Math.abs(local.x) > s.width / 2 + 0.35 || Math.abs(local.z) > s.length / 2 + 0.35) continue;
      if (local.y < -1.5 || local.y > s.height) continue;
      if (now - (car.bumped[person.id] || 0) < 600) continue;
      const n = new THREE.Vector3(person.pos.x - car.pos.x, 0, person.pos.z - car.pos.z).normalize();
      const v = this.velocityOf(car);
      const closing = v.dot(n);
      if (closing < 1) continue;
      car.bumped[person.id] = now;
      const mc = s.mass, mp = PERSON_MASS, bounce = 0.15;
      const J = ((1 + bounce) * closing) / (1 / mc + 1 / mp);
      this.setVelocity(car, v.addScaledVector(n, -J / mc));
      const dv = n.multiplyScalar(Math.min(12, J / mp));
      dv.y = Math.min(9, 3 + closing * 0.4);
      events.push({ type: 'push', id: person.id, dv });
      events.push({ type: 'bump', power: 0.3 });
    }
  }

  // Falling, landing and bounce pads (for cars, driven or loose).
  fall(car, dt, events) {
    const s = car.spec;
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
  }

  // A car nobody is driving that got knocked: it rolls easily forward and back,
  // skids to a stop sideways, spins a little, and can knock into other cars.
  simulateLoose(car, dt) {
    const s = car.spec;
    const events = [];
    const f = this.fwd(car);
    const along = car.push.dot(f);
    const side = car.push.clone().addScaledVector(f, -along);
    const roll = s.flying ? 5 : 1.1, skid = s.flying ? 5 : 5.5;
    car.push.copy(f).multiplyScalar(along * Math.exp(-roll * dt)).addScaledVector(side, Math.exp(-skid * dt));
    car.yawRate = (car.yawRate || 0) * Math.exp(-4.5 * dt); // tires resist spinning

    const nx = car.pos.x + car.push.x * dt, nz = car.pos.z + car.push.z * dt, nh = car.h + car.yawRate * dt;
    if (!this.blocked(s, nx, car.pos.y, nz, nh, car.id, car.outline)) {
      car.pos.x = nx;
      car.pos.z = nz;
      car.h = nh;
    } else if (this.lastHit) {
      events.push(...this.collide(car, this.lastHit));
      car.yawRate *= 0.5;
    } else {
      if (car.push.length() > 4) events.push({ type: 'bump', power: Math.min(1, car.push.length() / 15) });
      car.push.multiplyScalar(-0.3);
      car.yawRate *= -0.3;
    }
    if (!s.flying) this.fall(car, dt, events);
    car.target.copy(car.pos);
    car.targetH = car.h;
    if (car.push.lengthSq() < 0.003 && Math.abs(car.yawRate) < 0.02 && car.vy === 0) {
      car.loose = false;
      car.push.set(0, 0, 0);
      car.yawRate = 0;
      car.settled = true; // tell everyone where it ended up
    }
    return events;
  }

  // Drives the vehicle the local player is in. Returns events for sounds and damage:
  // { type: 'shift' | 'bump' | 'land' | 'bounce' | 'damage', amount, impact, other }
  drive(car, dt, keys) {
    this.myCarId = car.id;
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

    // Automatic gearbox: 1st revs up slowly from a stop, shifts to 2nd at high revs,
    // and drops into overdrive (3rd) once you're near top speed. Gear 0 is reverse.
    car.shiftT = Math.max(0, car.shiftT - dt);
    car.stopTimer = Math.max(0, (car.stopTimer || 0) - dt);
    car.braking = false;
    const fwd = Math.max(0, car.speed);
    if (car.gear > 0) {
      const upshift = car.gear === 1 ? rpmIn(s, 1, fwd) > 0.93 : car.gear === 2 && fwd > s.maxSpeed * 0.93;
      if (upshift && throttle > 0 && !car.shiftT) {
        car.gear++;
        car.shiftT = 0.3;
        events.push({ type: 'shift' });
      } else if (car.gear === 3 && fwd < s.maxSpeed * 0.7 || car.gear === 2 && fwd < gearTop(s, 1) * 0.6) {
        car.gear--;
        if (throttle > 0) events.push({ type: 'shift' });
      }
      car.rpm = rpmIn(s, car.gear, fwd);
    } else {
      car.rpm = IDLE_RPM + (1 - IDLE_RPM) * Math.min(1, -car.speed / 7);
    }
    // Getting going takes effort: in 1st the pull builds up as the revs rise.
    const firstFrac = Math.min(1, fwd / gearTop(s, 1));
    const gearPull = car.gear === 1 ? 0.15 + 0.45 * firstFrac : car.gear === 2 ? 0.8 : car.gear === 3 ? 0.35 : 0.7;
    const pull = s.accel * gearPull * health * (car.shiftT > 0 ? 0.1 : 1) * (boost ? 1.35 : 1);

    // Changing direction: brake to a stop, wait a moment (shifting), then go the other way.
    const brakeTo0 = rate => {
      const before = car.speed;
      car.speed -= Math.sign(car.speed) * rate * dt;
      if (Math.sign(car.speed) !== Math.sign(before)) car.speed = 0;
      car.braking = true;
    };
    if (throttle < 0 && car.gear !== 0) {
      if (car.speed > 0.2) {
        brakeTo0(s.accel * 2.5);
        car.stopTimer = 0.6;
      } else {
        car.speed = 0;
        car.braking = true;
        if (!car.waiting) car.stopTimer = Math.max(car.stopTimer, 0.35);
        car.waiting = true;
        if (car.stopTimer <= 0) {
          car.gear = 0; // into reverse: the reverse lights come on
          car.waiting = false;
          events.push({ type: 'shift' });
        }
      }
    } else if (throttle > 0 && car.gear === 0) {
      if (car.speed < -0.2) {
        brakeTo0(s.accel * 2.5);
        car.stopTimer = 0.4;
      } else {
        car.speed = 0;
        car.braking = true;
        if (!car.waiting) car.stopTimer = Math.max(car.stopTimer, 0.25);
        car.waiting = true;
        if (car.stopTimer <= 0) {
          car.gear = 1;
          car.waiting = false;
          events.push({ type: 'shift' });
        }
      }
    } else {
      car.waiting = false;
      if (throttle > 0) car.speed += pull * dt;
      else if (throttle < 0) car.speed -= s.accel * 0.7 * dt; // reversing
      else car.speed -= car.speed * Math.min(1, 1.2 * dt);
    }
    if (keys.has('Space') && Math.abs(car.speed) > 0.05) {
      car.speed -= car.speed * Math.min(1, 5 * dt);
      car.braking = true;
    }
    car.speed = Math.max(-7, Math.min(max, car.speed));
    if (Math.abs(car.speed) < 0.05 && !throttle) car.speed = 0;
    car.load = throttle !== 0 && !car.braking ? 1 : 0;
    car.reversing = car.gear === 0;

    car.steer += (steerIn * 0.6 - car.steer) * Math.min(1, 6 * dt);
    const steer = car.steer * (1 - 0.45 * Math.min(1, Math.abs(car.speed) / s.maxSpeed));
    const newH = car.h + (car.speed * Math.tan(steer) / (s.length * 0.62)) * dt;

    // Any sideways shove from a crash becomes a skid that the tires quickly stop.
    const f0 = this.fwd(car);
    car.speed += car.push.dot(f0);
    car.push.addScaledVector(f0, -car.push.dot(f0)).multiplyScalar(Math.exp(-5 * dt));

    const nx = car.pos.x - Math.sin(newH) * car.speed * dt + car.push.x * dt;
    const nz = car.pos.z - Math.cos(newH) * car.speed * dt + car.push.z * dt;
    if (!this.blocked(s, nx, car.pos.y, nz, newH, car.id, car.outline)) {
      car.pos.x = nx;
      car.pos.z = nz;
      car.h = newH;
    } else if (s.climb && car.vy <= 0 && !this.lastHit && !this.blocked(s, nx, car.pos.y + 1.05, nz, newH, car.id, car.outline)) {
      // Monster trucks can climb up one block.
      car.pos.set(nx, Math.floor(car.pos.y + 1.05), nz);
      car.h = newH;
      car.speed *= 0.8;
    } else if (this.lastHit) {
      // Hit another vehicle: momentum is shared between the two.
      events.push(...this.collide(car, this.lastHit));
    } else {
      const impact = Math.abs(car.speed);
      if (impact > 4) events.push({ type: 'bump', power: Math.min(1, impact / 20) });
      // Hitting walls hard damages the car.
      if (impact > 7) {
        const front = car.speed > 0 ? -1 : 1;
        events.push({ type: 'damage', amount: (impact - 7) * 3, impact: [0, s.ride + s.bodyH * 0.6, front * s.length / 2] });
      }
      car.speed *= -0.3;
      car.push.multiplyScalar(-0.3);
      if (!this.blocked(s, car.pos.x, car.pos.y, car.pos.z, newH, car.id, car.outline)) car.h = newH;
    }
    this.hitPeople(car, events);
    this.fall(car, dt, events);
    this.checkStuck(car, dt, throttle);
    car.target.copy(car.pos);
    car.targetH = car.h;
    return events;
  }

  // If you're pressing the gas but the car hasn't really moved (its corner is caught
  // on the corner of something), slide it gently to a nearby spot where it can drive.
  checkStuck(car, dt, throttle) {
    const s = car.spec;
    if (car.unstick) {
      const u = car.unstick;
      const k = Math.min(dt / u.duration, 1 - u.done);
      const x = car.pos.x + u.dx * k, z = car.pos.z + u.dz * k, h = car.h + u.dh * k;
      if (!this.blocked(s, x, car.pos.y, z, h, car.id, car.outline)) {
        car.pos.set(x, car.pos.y, z);
        car.h = h;
      }
      u.done += k;
      if (u.done >= 1) car.unstick = null;
      return;
    }
    car.stuckCheck = (car.stuckCheck || 0) + dt;
    if (car.stuckCheck < 0.4) return;
    const moved = car.stuckFrom ? Math.hypot(car.pos.x - car.stuckFrom.x, car.pos.z - car.stuckFrom.z) : 1;
    car.stuckCheck = 0;
    car.stuckFrom = car.pos.clone();
    if (!throttle || moved > 0.15 || car.vy !== 0) return;
    const f = this.fwd(car).multiplyScalar(throttle > 0 ? 1 : -1);
    const side = new THREE.Vector3(-f.z, 0, f.x);
    const tries = [];
    for (const m of [0.12, 0.25, 0.4, 0.6, 0.85])
      for (const sign of [1, -1]) {
        tries.push([side.x * m * sign, side.z * m * sign, 0]);
        tries.push([side.x * m * sign, side.z * m * sign, 0.06 * sign]);
      }
    for (const dh of [0.08, -0.08, 0.16, -0.16]) tries.push([0, 0, dh]);
    for (const [dx, dz, dh] of tries) {
      const x = car.pos.x + dx, z = car.pos.z + dz, h = car.h + dh;
      if (this.blocked(s, x, car.pos.y, z, h, car.id, car.outline)) continue;
      if (this.blocked(s, x + f.x * 0.4, car.pos.y, z + f.z * 0.4, h, car.id, car.outline)) continue;
      car.unstick = { dx, dz, dh, duration: 0.3, done: 0 };
      return;
    }
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
    // Turning: the helicopter banks (leans) into the turn like a bird, and the tilted
    // rotor pulls it sideways into the curve. Faster flight means wider, swoopier turns.
    const yawIn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const flatSpeed = Math.hypot(car.vel.x, car.vel.z);
    car.yawRate += (yawIn * (0.9 + Math.min(flatSpeed, 15) / 15 * 0.5) * lift - car.yawRate) * Math.min(1, 2.2 * dt);
    car.h += car.yawRate * dt;
    const bank = car.onGround ? 0 : yawIn * (0.2 + Math.min(flatSpeed, 15) / 15 * 0.25) * lift;
    car.roll += (bank - car.roll) * Math.min(1, 2.5 * dt);

    // Forces: lift along the tilted rotor, gravity down, a bit of air drag.
    const thrust = lift * car.collective * 2 * HELI_GRAVITY * health;
    const fwd = new THREE.Vector3(-Math.sin(car.h), 0, -Math.cos(car.h));
    car.vel.addScaledVector(fwd, thrust * Math.sin(-car.pitch) * dt);
    const left = new THREE.Vector3(-Math.cos(car.h), 0, Math.sin(car.h));
    car.vel.addScaledVector(left, thrust * Math.sin(car.roll) * dt);
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
      } else if (this.lastHit) {
        events.push(...this.collide(car, this.lastHit));
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
    this.myCarId = myCarId;
    const k = 1 - Math.exp(-10 * dt);
    this.events = [];
    for (const car of this.list.values()) {
      if (car.loose && !car.driver) {
        this.events.push(...this.simulateLoose(car, dt).map(e => ({ ...e, other: e.other || car })));
      } else if (car.id !== myCarId) {
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
      // Brake lights burn bright red; reverse lights come on in reverse.
      car.model.tailMat.emissiveIntensity = car.braking ? 2 : car.driver ? 0.45 + nightK * 0.6 : 0.12;
      car.model.brakeMat.emissiveIntensity = car.braking ? 2 : 0.04;
      car.model.reverseMat.emissiveIntensity = car.driver && (car.reversing || car.gear === 0 && car.id === myCarId) ? 3 : 0.05;
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
