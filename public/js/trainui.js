// The Loop Express, as you see it and ride it (see shared/train.js): two tracks high over the
// Outer Loop, four trains on each, running to the timetable. At each station a train slows in,
// stops, slides its doors open (on the platform side), waits, shuts them and pulls away. No
// tickets: walk in through the open doors, and walk out at whichever station you like.
//
// The cars are solid while they're stopped (walk in and out through the doorways). Once you're
// aboard you ride along with your car: you walk about inside it as if it were standing still
// (the game works out your steps in the car's own space, then puts you where the car is now).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TRACKS, TRACK_Y, FLOOR_Y, TRAINS, CARS, CAR_LENGTH, CAR_WIDTH, CAR_HEIGHT, DOOR_AT, DOOR_WIDTH, PLATFORM_Y,
  carBack, trackPoint, timetables, trainAt, nextTrain,
} from './shared/train.js';

const SEG = 2; // (track pieces, blocks long)
const L = CAR_LENGTH, W = CAR_WIDTH, T = 0.1; // (a car's length, width, and its walls' thickness)
const ROOF = FLOOR_Y + CAR_HEIGHT; // (the underside of the roof, above TRACK_Y)
const SEE = 260; // (trains farther away than this aren't drawn)
const NO_WORLD = { cellBoxes() {}, get: () => 0, isSolid: () => false }; // (inside a moving car: just the car)

// A car's solid parts, in its own space (x across, z along: -z is the way it goes; y up from
// the ground): the floor, the roof, the ends, the sides round the doorways, the benches, and the
// doors themselves (shut: `open` is which side's doors are open, -1 or 1, or 0 for none).
function carBoxes(open) {
  const y0 = TRACK_Y + FLOOR_Y, y1 = TRACK_Y + ROOF, out = [];
  out.push([-W / 2, TRACK_Y + 0.15, -L / 2, W / 2, y0, L / 2]);
  out.push([-W / 2, y1, -L / 2, W / 2, y1 + 0.2, L / 2]);
  out.push([-W / 2, y0, L / 2 - T, W / 2, y1, L / 2], [-W / 2, y0, -L / 2, W / 2, y1, -L / 2 + T]);
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? W / 2 - T : -W / 2, x1 = sx > 0 ? W / 2 : -W / 2 + T;
    // (The wall in pieces, between the doorways; and the doors, unless they're open.)
    const cuts = [-L / 2, ...DOOR_AT.flatMap(d => [d - DOOR_WIDTH / 2, d + DOOR_WIDTH / 2]), L / 2];
    for (let i = 0; i < cuts.length; i += 2) out.push([x0, y0, cuts[i], x1, y1, cuts[i + 1]]);
    if (open !== sx) for (const d of DOOR_AT) out.push([x0, y0, d - DOOR_WIDTH / 2, x1, y1, d + DOOR_WIDTH / 2]);
    // Benches along the side: in the middle, and at the ends.
    const bx0 = sx > 0 ? W / 2 - 0.75 : -W / 2 + T, bx1 = sx > 0 ? W / 2 - T : -W / 2 + 0.75;
    for (const [z0, z1] of [[-1, 1], [L / 2 - 0.85, L / 2 - T], [-L / 2 + T, -L / 2 + 0.85]]) out.push([bx0, y0, z0, bx1, y0 + 0.45, z1]);
  }
  return out;
}
const BOXES = { [-1]: carBoxes(-1), 0: carBoxes(0), 1: carBoxes(1) };

// From a car's own space to the world, and back (cx, cz: the car's middle; yaw: its heading).
const toWorld = (lx, lz, cx, cz, yaw) => [cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
const toLocal = (wx, wz, cx, cz, yaw) => {
  const dx = wx - cx, dz = wz - cz;
  return [dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw)];
};
// A box in a car's space, as a box in the world (exact when the car's square to the world, as it
// always is at a station).
function worldBox(b, cx, cz, yaw) {
  const [ax, az] = toWorld(b[0], b[2], cx, cz, yaw), [bx, bz] = toWorld(b[3], b[5], cx, cz, yaw);
  return [Math.min(ax, bx), b[1], Math.min(az, bz), Math.max(ax, bx), b[4], Math.max(az, bz)];
}

export class LoopExpress {
  constructor({ scene, sounds, hud }) {
    Object.assign(this, { scene, sounds, hud });
    this.stations = [];
    this.tables = timetables([]);
    this.aboard = null; // { track, k, c, prev: [x, z, yaw] } while we're in a car
    this.cars = []; // every car, with where it is now: { track, k, c, x, z, yaw, v, doors, side, open }
    this.t = null;
    this.buildTracks();
    for (let ti = 0; ti < TRACKS.length; ti++) for (let k = 0; k < TRAINS; k++) for (let c = 0; c < CARS; c++) this.cars.push({ track: ti, k, c });
    this.draw = carMeshes(scene, this.cars.length);
  }

  setStations(stations) {
    this.stations = Array.isArray(stations) ? stations : [];
    this.tables = timetables(this.stations);
    this.t = null;
  }

  // The tracks: a concrete beam with two rails on top, in short straight pieces (one instanced
  // mesh each).
  buildTracks() {
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.8 }), railMat = new THREE.MeshStandardMaterial({ color: 0x5d6168, metalness: 0.6, roughness: 0.4 });
    for (const track of TRACKS) {
      const n = Math.ceil(track.length / SEG);
      const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.6, SEG + 0.05), beamMat, n);
      const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.12, SEG + 0.05).translate(0, 0.36, 0), railMat, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < n; i++) {
        const p = trackPoint(i * SEG + SEG / 2, track);
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
  }

  // Where every car is at game time t (once per frame), and which side its doors are open on.
  place(t) {
    if (this.t === t) return;
    this.t = t;
    const trains = TRACKS.map((track, ti) => [...Array(TRAINS)].map((_, k) => trainAt(this.tables[ti], k, t)));
    for (const car of this.cars) {
      const tr = trains[car.track][car.k], track = TRACKS[car.track];
      const p = trackPoint(tr.s - carBack(car.c), track);
      Object.assign(car, { x: p.x, z: p.z, yaw: p.yaw, v: tr.v, doors: tr.doors, station: tr.station, train: tr });
      // (Its doors open on the platform's side.)
      const st = tr.station !== null && this.stations.find(o => o.id === tr.station);
      car.side = st ? Math.sign((st.x - p.x) * Math.cos(p.yaw) - (st.z - p.z) * Math.sin(p.yaw)) || 1 : 0;
      car.open = car.side && tr.doors > 0.75 ? car.side : 0;
    }
  }

  // Every frame (drawing): the cars where they are, their doors sliding, and the chimes and
  // horns of trains near you.
  update(dt, t, viewer) {
    this.place(t);
    // (All the cars are drawn together: one batch of bodies, one of windows, of doors, of noses.)
    const { body, glass, lamp, doors, noses } = this.draw, m = this.m ??= new THREE.Matrix4(), d = this.d ??= new THREE.Matrix4();
    const q = this.q ??= new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(0, 0, 0);
    let nose = 0;
    this.cars.forEach((car, i) => {
      const near = Math.hypot(car.x - viewer.x, car.z - viewer.z), show = near < SEE;
      q.setFromAxisAngle(up, car.yaw);
      m.compose(new THREE.Vector3(car.x, TRACK_Y, car.z), q, show ? one : none);
      for (const mesh of [body, glass, lamp]) mesh.setMatrixAt(i, m);
      // The doors slide along the outside of the car (toward its nearer end), on the open side.
      let j = 0;
      for (const side of [-1, 1])
        for (const z of DOOR_AT) {
          const open = car.side === side ? car.doors : 0;
          d.makeTranslation(side * (W / 2 + 0.04), FLOOR_Y + 1.08, z + Math.sign(z) * open * DOOR_WIDTH * 0.95);
          doors.setMatrixAt(i * 4 + j++, d.premultiply(m));
        }
      // A nose at each end of the train.
      for (const [end, on] of [[-1, car.c === 0], [1, car.c === CARS - 1]]) {
        if (!on) continue;
        d.makeRotationY(end > 0 ? Math.PI : 0).setPosition(0, 0, end * (L / 2));
        noses.setMatrixAt(nose++, d.premultiply(m));
      }
    });
    for (const mesh of [body, glass, lamp, doors, noses]) mesh.instanceMatrix.needsUpdate = true;
    for (const car of this.cars) {
      const near = Math.hypot(car.x - viewer.x, car.z - viewer.z);
      // (Sounds: the middle car of a train near you.)
      if (car.c !== 1 || near > 70) continue;
      const vol = Math.max(0, 1 - near / 70);
      if (car.doors > 0 && car.lastDoors === 0) {
        this.sounds.tone(660, 660, 0.25, 0.12 * vol, 'sine');
        this.sounds.tone(523, 523, 0.35, 0.12 * vol, 'sine', 0.25); // (ding-dong: doors opening)
      }
      if (car.lastDoors > 0 && car.doors === 0) this.sounds.tone(880, 880, 0.12, 0.08 * vol, 'square'); // (beep: doors shut)
      if (car.lastV === 0 && car.v > 0) this.sounds.horn(0.5 * vol, 1.2, 'air');
      car.lastDoors = car.doors;
      car.lastV = car.v;
    }
  }

  // ---------- Walking on and off, and riding ----------

  get riding() {
    return !!this.aboard;
  }

  carOf(a) {
    return this.cars.find(c => c.track === a.track && c.k === a.k && c.c === a.c);
  }

  // Is the player (feet at p) inside this car?
  inside(car, p) {
    const [lx, lz] = toLocal(p.x, p.z, car.x, car.z, car.yaw), y = p.y - TRACK_Y;
    return Math.abs(lx) < W / 2 - 0.05 && Math.abs(lz) < L / 2 - 0.05 && y > FLOOR_Y - 0.4 && y < FLOOR_Y + 1.6;
  }

  // Before the player moves, every frame. Gets you aboard when you walk into a car (or off when
  // you walk out), and while your car's moving, moves you with it (and does your walking about
  // in it): returns true then, so the game doesn't move you itself.
  step(dt, t, player, keys) {
    this.place(t);
    const p = player.pos;
    if (this.aboard) {
      const car = this.carOf(this.aboard);
      // (Where we are in the car: from where the car was a moment ago.)
      const [px, pz, pyaw] = this.aboard.prev;
      const [lx, lz] = toLocal(p.x, p.z, px, pz, pyaw), ly = p.y - TRACK_Y;
      const off = Math.abs(lx) > W / 2 + 0.6 || Math.abs(lz) > L / 2 + 0.6 || ly < FLOOR_Y - 1.5 || ly > ROOF + 1;
      // (Carried along with the car, exactly: even the last little roll as it stops.)
      if (!off && car.v === 0) {
        const [wx, wz] = toWorld(lx, lz, car.x, car.z, car.yaw);
        p.set(wx, p.y, wz);
      }
      if (off || (car.v === 0 && !this.inside(car, p))) {
        // Walked out onto the platform (or got somewhere else, like a respawn).
        this.aboard = null;
      } else if (car.v > 0) {
        // Riding: walk about the car as if it were still, then go where it's got to.
        const [vx, vz] = toLocal(player.vel.x, player.vel.z, 0, 0, pyaw);
        const world = player.world, extra = player.extraBoxes, open = car.open;
        player.world = NO_WORLD;
        player.extraBoxes = () => BOXES[open];
        player.pos.set(lx, p.y, lz);
        player.vel.set(vx, player.vel.y, vz);
        player.yaw -= pyaw;
        try {
          player.update(dt, keys);
        } finally {
          player.world = world;
          player.extraBoxes = extra;
          player.yaw += car.yaw;
        }
        const [wx, wz] = toWorld(player.pos.x, player.pos.z, car.x, car.z, car.yaw), [wvx, wvz] = toWorld(player.vel.x, player.vel.z, 0, 0, car.yaw);
        player.pos.set(wx, player.pos.y, wz);
        player.vel.set(wvx, player.vel.y, wvz);
        this.aboard.prev = [car.x, car.z, car.yaw];
        return true;
      } else this.aboard.prev = [car.x, car.z, car.yaw];
    }
    if (!this.aboard) {
      // Walked in through a stopped train's doors? Aboard!
      for (const car of this.cars) {
        if (car.v > 0 || Math.abs(car.x - p.x) > 8 || Math.abs(car.z - p.z) > 8 || !this.inside(car, p)) continue;
        this.aboard = { track: car.track, k: car.k, c: car.c, prev: [car.x, car.z, car.yaw] };
        this.hud.toast(`🚆 ⏭️ ${this.nextStop(car)?.icon || ''}`);
        break;
      }
    }
    // Doors about to shut on someone in the doorway: in (or out) you go.
    for (const car of this.cars) {
      if (car.v > 0 || !car.side || car.doors >= 0.95 || Math.abs(car.x - p.x) > 8 || Math.abs(car.z - p.z) > 8) continue;
      const [lx, lz] = toLocal(p.x, p.z, car.x, car.z, car.yaw), y = p.y - TRACK_Y;
      if (y < FLOOR_Y - 0.4 || y > ROOF || !DOOR_AT.some(d => Math.abs(lz - d) < DOOR_WIDTH / 2 + 0.3) || Math.abs(lx) < W / 2 - 0.45 || Math.abs(lx) > W / 2 + 0.35) continue;
      const mine = this.aboard && this.carOf(this.aboard) === car, nx = Math.sign(lx) * (mine ? W / 2 - 0.45 : W / 2 + 0.36);
      const [wx, wz] = toWorld(nx, lz, car.x, car.z, car.yaw);
      p.set(wx, p.y, wz);
    }
    return false;
  }

  // The solid parts of the trains stopped near the player (walk in through their doors), for
  // the game's collisions.
  boxes(p) {
    const out = [];
    if (!p) return out;
    for (const car of this.cars) {
      if (car.v > 0 || car.x === undefined || Math.abs(car.x - p.x) > 10 || Math.abs(car.z - p.z) > 10) continue;
      for (const b of BOXES[car.open]) out.push(worldBox(b, car.x, car.z, car.yaw));
    }
    return out;
  }

  // The next station a car's train stops at (the one it's at, while its doors are still open).
  nextStop(car) {
    const table = this.tables[car.track];
    if (!table.legs.length) return null;
    if (car.station !== null && car.doors > 0) return this.stations.find(s => s.id === car.station);
    const s = car.train.s, len = TRACKS[car.track].length;
    const leg = table.legs.map(l => ({ l, d: (((l.s0 - s) % len) + len) % len })).sort((a, b) => a.d - b.d)[0].l;
    return this.stations.find(st => st.id === leg.station);
  }

  // The station whose platform (or stairs, or ticket machine) is near (x, z).
  stationNear(x, z, r = 30) {
    let best = null, bd = r;
    for (const st of this.stations) {
      const d = Math.hypot(st.x - x, st.z - z);
      if (d < bd) [best, bd] = [st, d];
    }
    return best;
  }

  // When the next trains come to a station, each way: "🚆 25 · 🚆 70".
  times(st, t) {
    return this.tables.map(table => nextTrain(table, st.id, t)).filter(w => w !== null).map(w => `🚆 ${w < 1 ? '🚪' : `${Math.ceil(w)}s`}`).join(' · ');
  }

  // A hint for the bottom of the screen: on a platform, when the trains come; aboard, the next stop.
  hint(player, t) {
    if (this.aboard) {
      const car = this.carOf(this.aboard), next = this.nextStop(car);
      return car.v === 0 && car.doors > 0 ? `🚆 ${next?.icon || ''} ${next?.name || ''} · 🚪 Walk out to get off` : `🚆 ⏭️ ${next?.icon || ''} ${next?.name || ''}`;
    }
    const p = player.pos;
    if (p.y < PLATFORM_Y + 0.5 || p.y > PLATFORM_Y + 3) return '';
    const st = this.stationNear(p.x, p.z, 16);
    return st ? `🚉 ${st.icon} · ${this.times(st, t)}` : '';
  }
}

// ---------- The cars ----------

// Every car's meshes, drawn in batches (instanced: one draw for all the cars' bodies, one for
// their windows, and so on). A hollow car (so riders see out): white with a red stripe and a band
// of windows, a grey roof and floor, blue benches, an underframe with wheels, a light along the
// ceiling; red doors that slide; and a nose (with a headlight) at each end of a train.
function carMeshes(scene, n) {
  const colored = [], glassGeos = [], lampGeos = [];
  const add = (list, color, w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    if (color !== null) {
      const c = new THREE.Color(color), k = g.attributes.position.count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(k * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    }
    list.push(g);
  };
  const [white, red, grey, dark, seat] = [0xf5f5f5, 0xe53935, 0x9aa0a6, 0x2b2f35, 0x1565c0];
  const y0 = FLOOR_Y, H = CAR_HEIGHT;
  add(colored, grey, W, 0.25, L, 0, y0 - 0.125, 0); // (the floor)
  add(colored, dark, W - 0.3, 0.3, L - 1, 0, 0.12, 0); // (the underframe)
  for (const z of [-L / 2 + 1.2, L / 2 - 1.2]) for (const x of [-0.75, 0.75]) add(colored, dark, 0.2, 0.5, 0.5, x, 0.15, z); // (wheels)
  add(colored, grey, W + 0.1, 0.2, L + 0.1, 0, y0 + H + 0.1, 0); // (the roof)
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - T / 2);
    const cuts = [-L / 2, ...DOOR_AT.flatMap(d => [d - DOOR_WIDTH / 2, d + DOOR_WIDTH / 2]), L / 2];
    for (let i = 0; i < cuts.length; i += 2) {
      const len = cuts[i + 1] - cuts[i], z = (cuts[i] + cuts[i + 1]) / 2;
      add(colored, white, T, 1.0, len, x, y0 + 0.5, z);
      add(colored, red, T + 0.02, 0.2, len, x, y0 + 1.1, z);
      add(glassGeos, null, T, 0.8, len, x, y0 + 1.6, z);
      add(colored, white, T, H - 2.0, len, x, y0 + 2.0 + (H - 2.0) / 2, z);
    }
    // Benches (blue cushions), as in carBoxes; and over each doorway, a band of white.
    for (const [z0, z1] of [[-1, 1], [L / 2 - 0.85, L / 2 - T], [-L / 2 + T, -L / 2 + 0.85]]) add(colored, seat, 0.65, 0.45, z1 - z0, sx * (W / 2 - 0.42), y0 + 0.225, (z0 + z1) / 2);
    for (const d of DOOR_AT) add(colored, white, T, H - 2.2, DOOR_WIDTH, x, y0 + 2.2 + (H - 2.2) / 2, d);
  }
  for (const sz of [-1, 1]) {
    add(colored, white, W, 1.2, T, 0, y0 + 0.6, sz * (L / 2 - T / 2));
    add(glassGeos, null, W, H - 1.2, T, 0, y0 + 1.2 + (H - 1.2) / 2, sz * (L / 2 - T / 2));
  }
  add(lampGeos, null, 0.3, 0.04, L - 1.5, 0, y0 + H - 0.03, 0); // (the light along the ceiling)
  // The nose (pointing out from the end of the car at z = 0, toward -z), with its headlight.
  const noseGeo = new THREE.CylinderGeometry(0.25, 1.3, 1.8, 4, 1).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.95, 1).translate(0, y0 + 0.9, -0.9);
  const nc = new THREE.Color(white);
  noseGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(noseGeo.attributes.position.count * 3).map((_, i) => [nc.r, nc.g, nc.b][i % 3]), 3));
  const headlight = [];
  add(headlight, 0xfff6c0, 1.1, 0.18, 0.05, 0, y0 + 0.5, -0.03);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide });
  // A door: red, with a window in its top half (a pale blue pane, framed in red).
  const doorParts = [], DH = 2.15, DW = DOOR_WIDTH;
  add(doorParts, red, 0.06, DH * 0.5, DW, 0, -DH * 0.25, 0);
  add(doorParts, red, 0.06, 0.12, DW, 0, DH / 2 - 0.06, 0);
  for (const z of [-1, 1]) add(doorParts, red, 0.06, DH * 0.5 - 0.12, 0.15, 0, DH / 4 - 0.06, z * (DW / 2 - 0.075));
  add(doorParts, 0x9cc7e6, 0.04, DH * 0.5 - 0.12, DW - 0.3, 0, DH / 4 - 0.06, 0);
  const doorGeo = mergeGeometries(doorParts);
  const make = (geo, material, count, shadow) => {
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    scene.add(mesh);
    return mesh;
  };
  const ends = TRACKS.length * TRAINS * 2;
  return {
    body: make(mergeGeometries(colored), mat, n, true),
    glass: make(mergeGeometries(glassGeos), new THREE.MeshStandardMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false }), n, false),
    lamp: make(mergeGeometries(lampGeos), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }), n, false),
    doors: make(doorGeo, mat, n * 4, true),
    noses: make(mergeGeometries([noseGeo, ...headlight]), mat, ends, true),
  };
}
