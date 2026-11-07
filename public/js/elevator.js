// Riding elevators. Right-click an elevator's doors and pick a floor on its panel: the doors
// open, you step into the cab, the doors slide shut, it hums up (or down) the shaft with the
// floor number counting on its little screen, dings, and the doors open onto your floor.
// (Where it stops, and its floors' names, come from shared/elevator.js.)
import * as THREE from 'three';
import { liftColumn, liftStops, liftLabels, liftFront } from './shared/elevator.js';
import { blockKey } from './shared/blocks.js';

const WALK = 0.45; // stepping in or out (seconds)
const DOORS = 0.5; // the doors sliding open or shut
const ease = t => t * t * (3 - 2 * t);

export class Elevators {
  // world: the blocks; sounds: for the hum and the ding; hud: for the floor-number hint.
  constructor(scene, world, sounds) {
    this.world = world;
    this.sounds = sounds;
    this.ride = null; // { x, z, facing, stops, labels, from, to, phase, t, … }
    this.panel = null; // the floor buttons, while they're on screen
    this.cab = cabModel();
    this.cab.group.visible = false;
    scene.add(this.cab.group);
  }

  get riding() {
    return !!this.ride;
  }

  // The elevator at (x, y, z): its shaft, its floors, and which one you're on (by your feet).
  // Returns a message instead if there's no riding it from here.
  lookUp(x, y, z, feet) {
    const world = this.world;
    const col = liftColumn((a, b, c) => world.get(a, b, c), x, y, z);
    if (!col) return null;
    const solid = (a, b, c) => world.isSolid(a, b, c);
    const stops = liftStops(solid, x, z, col.lo, col.hi, col.facing);
    if (stops.length < 2) return '🛗 This elevator has nowhere to go yet! It stops wherever there\'s a floor to step out onto in front of its doors: build some floors (or a roof).';
    const [dx, dz] = liftFront(col.facing);
    const top = stops[stops.length - 1];
    const labels = liftLabels(stops, !world.isCovered(x + dx, top, z + dz));
    // Which floor you're on: the one at your feet (standing in front of its doors).
    let here = -1, best = 1.3;
    for (let i = 0; i < stops.length; i++) {
      const d = Math.abs(stops[i] - feet);
      if (d < best) [here, best] = [i, d];
    }
    if (here < 0) return '🛗 Walk up to the elevator\'s doors to call it!';
    return { x, z, ...col, stops, labels, here };
  }

  // Off we go: from the floor you're on to floor `to` (an index into its stops).
  start(info, to, player) {
    const from = info.here;
    if (to === from) return false;
    const [dx, dz] = liftFront(info.facing);
    const yaw = Math.atan2(-dx, -dz); // facing out of the doors (yaw 0 looks along -z)
    this.ride = {
      ...info, from, to, dx, dz, outYaw: yaw,
      phase: 'in', t: 0, start: player.pos.clone(), startYaw: player.yaw,
      y0: info.stops[from], y1: info.stops[to],
    };
    this.ride.travel = Math.max(1.4, Math.abs(this.ride.y1 - this.ride.y0) / 6 + 1);
    this.openDoors(info.stops[from], true);
    this.showCab(info.stops[from], true);
    this.sounds.tone(660, 660, 0.12, 0.12, 'sine');
    return true;
  }

  // Cancel the ride (going home, or the shaft got broken): you're left where you are.
  stop() {
    if (!this.ride) return;
    for (const y of [this.ride.y0, this.ride.y1]) this.openDoors(y, false);
    this.ride = null;
    this.cab.group.visible = false;
  }

  // Each frame while riding: moves you (and the cab). Returns true while riding.
  update(dt, player) {
    const r = this.ride;
    if (!r) return false;
    r.t += dt;
    const cx = r.x + 0.5, cz = r.z + 0.5;
    const outX = cx + r.dx, outZ = cz + r.dz;
    player.vel.set(0, 0, 0);
    player.onGround = true;
    if (r.phase === 'in') {
      // Step into the cab and turn round to face the doors.
      const k = ease(Math.min(1, r.t / WALK));
      player.pos.set(r.start.x + (cx - r.start.x) * k, r.y0, r.start.z + (cz - r.start.z) * k);
      player.yaw = lerpAngle(r.startYaw, r.outYaw, k);
      this.cab.doors(1);
      if (r.t >= WALK) next(r, 'close');
    } else if (r.phase === 'close') {
      this.cab.doors(1 - Math.min(1, r.t / DOORS));
      player.pos.set(cx, r.y0, cz);
      if (r.t >= DOORS) {
        this.openDoors(r.y0, false);
        next(r, 'go');
        this.sounds.tone(70, 74, r.travel, 0.06, 'sine'); // the motor's hum
        this.sounds.tone(140, 150, r.travel, 0.025, 'triangle');
      }
    } else if (r.phase === 'go') {
      const k = ease(Math.min(1, r.t / r.travel));
      const y = r.y0 + (r.y1 - r.y0) * k;
      player.pos.set(cx, y, cz);
      this.cab.group.position.y = y;
      this.cab.show(this.labelAt(y), r.y1 > r.y0 ? '▲' : '▼');
      if (r.t >= r.travel) {
        next(r, 'open');
        this.openDoors(r.y1, true);
        this.cab.show(r.labels[r.to], '');
        // Ding!
        this.sounds.tone(1318, 1318, 0.45, 0.16, 'sine');
        this.sounds.tone(1046, 1046, 0.7, 0.14, 'sine', 0.22);
      }
    } else if (r.phase === 'open') {
      this.cab.doors(Math.min(1, r.t / DOORS));
      player.pos.set(cx, r.y1, cz);
      if (r.t >= DOORS) next(r, 'out');
    } else if (r.phase === 'out') {
      const k = ease(Math.min(1, r.t / WALK));
      player.pos.set(cx + (outX - cx) * k, r.y1, cz + (outZ - cz) * k);
      if (r.t >= WALK) {
        this.ride = null;
        this.cab.group.visible = false;
        this.cab.doors(0);
        const y1 = r.y1;
        setTimeout(() => this.openDoors(y1, false, r), 1200);
        return false;
      }
    }
    return true;
  }

  // The floor you're passing (for the cab's screen).
  labelAt(y) {
    const r = this.ride;
    let best = 0;
    for (let i = 0; i < r.stops.length; i++) if (Math.abs(r.stops[i] - y) < Math.abs(r.stops[best] - y)) best = i;
    return r.labels[best];
  }

  // What the hint line says while riding.
  hint() {
    const r = this.ride;
    if (!r) return '';
    if (r.phase === 'go') return `🛗 ${r.y1 > r.y0 ? 'Going up' : 'Going down'}… ${this.labelAt(this.cab.group.position.y)}`;
    return `🛗 Floor ${r.labels[r.phase === 'in' || r.phase === 'close' ? r.from : r.to]}`;
  }

  showCab(y, open) {
    const r = this.ride;
    const g = this.cab.group;
    g.position.set(r.x + 0.5, y, r.z + 0.5);
    g.rotation.y = r.facing * Math.PI / 2;
    g.visible = true;
    this.cab.doors(open ? 1 : 0);
    this.cab.show(r.labels[r.from], '');
  }

  // The shaft's doors at a floor, open or shut (just on this screen).
  openDoors(y, open, ride = this.ride) {
    if (!ride) return;
    for (const yy of [y, y + 1]) {
      const k = blockKey(ride.x, yy, ride.z);
      if (open) this.world.liftOpen.add(k);
      else this.world.liftOpen.delete(k);
      this.world.rerender(ride.x, yy, ride.z);
    }
  }

  // ---------- The floor buttons ----------

  // Shows the panel; onPick(index) when a floor is chosen, onClose when it's put away.
  showPanel(info, onPick, onClose) {
    const screen = document.getElementById('lift-panel'), grid = document.getElementById('lift-buttons');
    grid.innerHTML = '';
    document.getElementById('lift-where').textContent = `You're on floor ${info.labels[info.here]}. Where to?`;
    // Top floor first, like a real elevator panel.
    const order = info.stops.map((_, i) => i).reverse();
    const buttons = [];
    for (const i of order) {
      const b = document.createElement('button');
      b.className = 'lift-button' + (i === info.here ? ' here' : '');
      b.textContent = info.labels[i];
      b.title = i === info.here ? "You're here" : `Floor ${info.labels[i]}`;
      b.addEventListener('click', () => this.pick(i));
      grid.append(b);
      buttons[i] = b;
    }
    this.panel = { info, onPick, onClose, buttons, focus: info.here };
    screen.classList.remove('hidden');
    setTimeout(() => buttons[info.here === 0 ? 1 : info.here - 1]?.focus(), 30);
  }

  pick(i) {
    const p = this.panel;
    if (!p) return;
    if (i === p.info.here) {
      this.sounds.click();
      return;
    }
    this.closePanel(false);
    p.onPick(i);
  }

  closePanel(cancelled = true) {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    document.getElementById('lift-panel').classList.add('hidden');
    p.onClose(cancelled);
  }

  // Keys while the panel is up: arrows move up and down the buttons, Enter (or Space) presses
  // one, G and R are the ground floor and the roof, Escape puts it away.
  panelKey(e) {
    const p = this.panel;
    if (!p) return false;
    const n = p.info.stops.length;
    if (e.key === 'Escape' || e.code === 'KeyE') this.closePanel(true);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const cur = p.buttons.indexOf(document.activeElement);
      const i = Math.max(0, Math.min(n - 1, (cur < 0 ? p.info.here : cur) + (e.key === 'ArrowUp' ? 1 : -1)));
      p.buttons[i].focus();
    } else if (e.code === 'KeyG') this.pick(0);
    else if (e.code === 'KeyR' && p.info.labels[n - 1] === 'R') this.pick(n - 1);
    else if (/^Digit[0-9]$/.test(e.code)) {
      const i = p.info.labels.indexOf(e.code.slice(5));
      if (i >= 0) p.buttons[i].focus();
    } else return false;
    e.preventDefault();
    return true;
  }
}

function next(r, phase) {
  r.phase = phase;
  r.t = 0;
}

function lerpAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}

// The cab: a little room the size of the shaft, seen from inside (brushed steel walls, a mirror,
// a light in the ceiling, a handrail, a screen with the floor on it, and two doors that slide).
// Its front (the doors) is +z, like the blocks'.
function cabModel() {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x737a82, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x969da5, metalness: 0.35, roughness: 0.4, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8d6e4f, roughness: 0.7, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2f3237, roughness: 0.9, side: THREE.DoubleSide });
  const mirror = new THREE.MeshStandardMaterial({ color: 0xdfe8ef, metalness: 0.95, roughness: 0.08, side: THREE.DoubleSide });
  const light = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  // (The front is a little in from the shaft's own doors, so they never hide it.)
  const W = 0.94, H = 2.3, h = W / 2, F = 0.4;
  const plane = (w, hh, mat, x, y, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0, 'YXZ');
    group.add(m);
    return m;
  };
  plane(W, h + F, floorMat, 0, 0.015, (F - h) / 2, 0, -Math.PI / 2);
  plane(W, h + F, steel, 0, H, (F - h) / 2, 0, Math.PI / 2);
  plane(0.5, 0.5, light, 0, H - 0.01, 0, 0, Math.PI / 2);
  plane(W, H, wood, 0, H / 2, -h); // the back
  plane(0.6, 1.2, mirror, 0, 1.25, -h + 0.01);
  plane(h + F, H, steel, -h, H / 2, (F - h) / 2, Math.PI / 2); // the sides
  plane(h + F, H, steel, h, H / 2, (F - h) / 2, -Math.PI / 2);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, W - 0.1, 8).rotateX(Math.PI / 2), steel);
  rail.position.set(-h + 0.05, 0.95, 0);
  group.add(rail);
  // The front: two doors that slide apart (behind the panels either side), the wall over them,
  // and (on the right as you face them) the floor display and the buttons.
  const D = 0.34, side = h - D, doorH = H - 0.3; // each door's width; the panels beside them
  const left = plane(D, doorH, doorMat, -D / 2, doorH / 2, F - 0.012, Math.PI);
  const right = plane(D, doorH, doorMat, D / 2, doorH / 2, F - 0.012, Math.PI);
  plane(0.006, doorH, new THREE.MeshBasicMaterial({ color: 0x2a2e33 }), 0, doorH / 2, F - 0.014, Math.PI);
  plane(side, H, steel, -(D + side / 2), H / 2, F - 0.006, Math.PI);
  plane(side, H, steel, D + side / 2, H / 2, F - 0.006, Math.PI);
  plane(2 * D, 0.3, steel, 0, H - 0.15, F - 0.006, Math.PI);
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // (On the right as you face the doors: the cab's -x side, once it's turned to face out.)
  plane(0.1, 0.066, new THREE.MeshBasicMaterial({ map: tex }), -(D + side / 2), 1.62, F - 0.018, Math.PI);
  const lit = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), lit);
    b.position.set(-(D + side / 2), 1.18 + i * 0.065, F - 0.018);
    b.rotation.y = Math.PI;
    group.add(b);
  }
  let shown = '';
  return {
    group,
    // 0: shut, 1: wide open.
    doors(k) {
      const open = Math.max(0, Math.min(1, k)) * (D - 0.02);
      left.position.x = -D / 2 - open;
      right.position.x = D / 2 + open;
    },
    show(label, arrow) {
      const text = `${arrow}${label}`;
      if (text === shown) return;
      shown = text;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#120a02';
      ctx.fillRect(0, 0, 96, 64);
      ctx.fillStyle = '#ffb02e';
      ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 48, 34);
      tex.needsUpdate = true;
    },
  };
}
