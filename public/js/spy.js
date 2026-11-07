// The Secret Agency, on your screen: the TOP SECRET files (sparkling where they're hidden), the
// base's locked door and its security scanner, and the cool stuff inside: spy cameras that follow
// anyone, anywhere; a radar map of where everybody is; drones to fly all over town (everybody
// sees them); the laser hall; the big red button (DO NOT PRESS); and night-vision goggles.
//
// Nobody without Top Secret clearance can be inside the base: if they get in (through a door an
// agent left open, or down the roof hatch), the guards walk them straight back out.
import * as THREE from 'three';
import { inZone } from './shared/secretbase.js';

const PLACE_NAMES = {
  plaza: 'on the town square', store: 'at the Luxe Store', tower: 'at the tower', pizza: 'at the Pizza Palace',
  lodge: 'at the ski lodge', camp: 'at Sunny Shores Campground', quarry: 'at Big Rock Quarry', farm: 'at Happy Acres Farm',
  base: 'at the secret base', agent: 'on the town square',
};
const DRONE_RANGE = 180; // how far from the base a drone's signal reaches
const DRONE_BATTERY = 150; // seconds of flying
const LASER = { period: 2.6, on: 0.58, heights: [0.35, 1.2] };

export class SecretAgency {
  // deps: { scene, world, sounds, effects, hud, net, headlight, others: () => [{ id, name, pos, … }],
  //         people: () => [{ name, pos }] (players and the town's people, for the spy cameras and radar),
  //         vehicles: () => [{ pos }], me: () => name, nightK: () => 0..1 }
  constructor(deps) {
    Object.assign(this, deps);
    this.base = null;
    this.files = [];
    this.landmarks = [];
    this.agent = { files: 0, need: 3, clear: false };
    this.mode = null; // 'cams' | 'drone' | 'radar'
    this.camTarget = 0;
    this.camAngle = 0;
    this.drone = null; // { pos, vel, yaw, battery, view }
    this.alarm = 0; // the red-button alarm (seconds left)
    this.flash = 0; // red flash on screen (lasers, the alarm)
    this.fileT = 0;
    this.scanned = false;
    this.escortT = 0;
    this.laserDone = false;
    this.zapT = 0;
    this.remote = new Map(); // other players' drones: id -> model
    this.buildLasers();
    this.droneModel = makeDrone();
    this.droneModel.visible = false;
    this.scene.add(this.droneModel);
    this.overlay = document.getElementById('spy-overlay');
    this.radarCanvas = document.getElementById('radar-map');
    this.radarT = 0;
  }

  get clear() {
    return this.agent.clear;
  }

  setWorld({ base, files, landmarks }) {
    this.base = base || null;
    this.files = files || [];
    this.landmarks = landmarks || [];
    this.layLasers();
  }

  inside(p) {
    return !!this.base && inZone(this.base.zone, p.x, p.y, p.z);
  }

  // Is this door one of the base's (locked to anyone without clearance)?
  lockedDoor(x, y, z) {
    if (!this.base || this.clear) return false;
    return this.base.door.some(([dx, , dz]) => dx === x && dz === z) && y < 2;
  }

  // ---------- Every frame ----------

  // The things that happen whether or not you're using anything: lasers, the scanner, the
  // guards walking intruders out, files sparkling, other players' drones, the alarm.
  frame(dt, time, player, busy) {
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.zapT = Math.max(0, this.zapT - dt);
    this.escortT = Math.max(0, this.escortT - dt);
    const p = player.pos;
    const near = this.base && Math.hypot(p.x - this.base.x, p.z - this.base.z) < 60;
    // In the base without clearance? The guards walk you back out.
    if (this.base && !this.clear && !busy && this.inside(p)) {
      p.set(...this.base.out);
      player.vel.set(0, 0, 0);
      player.flying = false;
      if (this.escortT <= 0) {
        this.hud.toast('🚨 Intruder alert! The guards walk you back outside. Top Secret clearance only! (Agent Shadow on the town square can tell you how to get it.) 🕶️');
        this.sounds.tone(880, 440, 0.35, 0.18, 'square');
        this.escortT = 3;
      }
    }
    // The security scan, just inside the door.
    if (near && this.clear) {
      const inHall = this.inside(p) && p.z < this.base.scan + 2;
      if (inHall && !this.scanned && Math.abs(p.z - (this.base.scan + 0.5)) < 0.5 && Math.abs(p.x - this.base.x) < 2.5) {
        this.scanned = true;
        this.sounds.tone(1200, 1800, 0.18, 0.12, 'sine');
        this.sounds.tone(1800, 1800, 0.12, 0.12, 'sine', 0.25);
        this.hud.toast(`🔍 Scanning... ✅ Clearance confirmed. Welcome, Agent ${this.me()}! 🕶️`);
      }
      if (!this.inside(p)) this.scanned = false;
    }
    this.updateLasers(dt, time, player, near, busy);
    // The files sparkle a little, so you can spot them.
    this.fileT -= dt;
    if (this.fileT <= 0) {
      this.fileT = 0.7;
      for (const [x, y, z] of this.files) if (Math.hypot(x - p.x, z - p.z) < 40) this.effects.sparkle(x + 0.5, y + 0.9, z + 0.5, 3);
    }
    this.updateRemoteDrones(dt, time);
    if (this.alarm > 0) this.updateAlarm(dt);
    // On screen: the red flash (and the spy-cam look).
    document.body.classList.toggle('spycam', this.mode === 'cams' || (this.mode === 'drone' && this.drone?.view === 1));
    const red = document.getElementById('red-flash');
    if (red) red.style.opacity = String(Math.min(0.55, this.flash));
  }

  // Night vision: everything bright and green at night (wearing the goggles).
  nightVision(on) {
    const k = on ? this.nightK() : 0;
    const level = Math.round(k * 10);
    if (level === this.nvLevel) return;
    this.nvLevel = level;
    const canvas = document.getElementById('game');
    canvas.style.filter = level < 2 ? '' : `brightness(${(1 + 1.25 * k).toFixed(2)}) saturate(0) sepia(1) hue-rotate(60deg) saturate(${(1.6 + 1.6 * k).toFixed(1)}) contrast(1.1)`;
  }

  // ---------- Using things (spy cameras, radar, drones, the button) ----------

  get active() {
    return this.mode;
  }

  // Right-click on one of the base's gadgets (def.spy says which).
  use(kind, x, y, z) {
    if (!this.clear) return this.hud.toast('🔒 TOP SECRET! Only agents with clearance can use this.');
    if (kind === 'cams') return this.startCams();
    if (kind === 'radar') return this.openRadar();
    if (kind === 'drone') return this.startDrone(x, y, z);
    if (kind === 'button') return this.pressButton();
    if (kind === 'goggles') return this.net.send({ t: 'take_goggles', x, y, z });
  }

  stop() {
    if (this.mode === 'drone') {
      this.hud.toast('🚁 The drone flies itself home to its pad.');
      this.droneModel.visible = false;
      this.drone = null;
      this.headlight.intensity = 0;
    }
    if (this.mode === 'radar') document.getElementById('radar').classList.add('hidden');
    this.mode = null;
    this.overlay.classList.add('hidden');
  }

  // Keys while using something. Returns true if it was for us.
  keydown(e) {
    if (!this.mode) return false;
    if (e.code === 'KeyE' || e.code === 'Escape') {
      this.stop();
      return true;
    }
    if (this.mode === 'cams' && (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowRight' || e.code === 'KeyD')) {
      this.nextTarget(e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1);
      return true;
    }
    if (this.mode === 'drone' && e.code === 'KeyV') {
      this.drone.view = 1 - this.drone.view;
      return true;
    }
    return this.mode === 'cams' || this.mode === 'radar';
  }

  // Left-click while flying a drone: a shower of sparkles on whoever's below.
  click() {
    if (this.mode !== 'drone') return false;
    const d = this.drone;
    if (d.sparkleT > 0) return true;
    d.sparkleT = 0.8;
    const { x, y, z } = d.pos;
    this.effects.sparkle(x, y - 0.4, z, 40);
    this.net.send({ t: 'fx', kind: 'sparkle', x, y: y - 0.4, z, color: '#ffffff', seed: 0 });
    this.sounds.tone(1600, 2400, 0.25, 0.12, 'sine');
    return true;
  }

  // ---------- Spy cameras ----------

  startCams() {
    if (!this.people().length) return this.hud.toast('📹 Nobody to watch right now!');
    this.mode = 'cams';
    this.buttons(true);
    this.camTarget = 0;
    this.camAngle = Math.random() * Math.PI * 2;
    this.overlay.classList.remove('hidden');
    this.sounds.tone(300, 900, 0.15, 0.1, 'square');
    this.hud.toast('📹 Spy cameras! ◀ ▶ (or A and D) to switch, E to stop.');
    this.showCamInfo();
  }

  nextTarget(step) {
    const n = this.people().length;
    if (!n) return this.stop();
    this.camTarget = (this.camTarget + step + n) % n;
    this.camAngle = Math.random() * Math.PI * 2;
    this.sounds.tone(500, 700, 0.06, 0.08, 'square');
    this.showCamInfo();
  }

  showCamInfo() {
    const list = this.people();
    const who = list[this.camTarget % list.length];
    if (!who) return;
    document.getElementById('spy-cam').textContent = `● REC   SPY CAM ${this.camTarget + 1} / ${list.length}`;
    document.getElementById('spy-target').textContent = `🎯 ${who.name}: ${who.doing}, ${this.whereIs(who.pos)}`;
  }

  whereIs(p) {
    if (this.base && Math.hypot(p.x - this.base.x, p.z - this.base.z) < 30) return 'at the secret base 🤫';
    let best = null, bestD = 45;
    for (const [k, x, z] of this.landmarks) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD && PLACE_NAMES[k]) [best, bestD] = [k, d];
    }
    if (best) return PLACE_NAMES[best];
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const far = Math.hypot(p.x, p.z);
    return far < 60 ? 'in town' : `out ${dirs[(Math.round(Math.atan2(p.x, -p.z) / (Math.PI / 4)) + 8) % 8]} of town`;
  }

  // The ◀ ▶ buttons are for switching spy cameras (the ✕ stops either).
  buttons(switching) {
    for (const id of ['spy-prev', 'spy-next']) document.getElementById(id).style.display = switching ? '' : 'none';
  }

  // ---------- The radar ----------

  openRadar() {
    this.mode = 'radar';
    document.getElementById('radar').classList.remove('hidden');
    this.sounds.tone(200, 1200, 0.3, 0.08, 'sine');
    this.drawRadar(0);
  }

  drawRadar(time) {
    const c = this.radarCanvas, ctx = c.getContext('2d');
    const S = c.width, k = S / 660, at = (x, z) => [(x + 330) * k, (z + 330) * k];
    ctx.fillStyle = '#021a0e';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(46,230,122,0.18)';
    for (let i = 0; i <= 11; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 60 * k, 0);
      ctx.lineTo(i * 60 * k, S);
      ctx.moveTo(0, i * 60 * k);
      ctx.lineTo(S, i * 60 * k);
      ctx.stroke();
    }
    // The sweep.
    const a = (time * 1.4) % (Math.PI * 2), [cx, cy] = at(0, 0);
    const g = ctx.createConicGradient ? ctx.createConicGradient(a - 0.6, cx, cy) : null;
    if (g) {
      g.addColorStop(0, 'rgba(46,230,122,0)');
      g.addColorStop(0.09, 'rgba(46,230,122,0.25)');
      g.addColorStop(0.1, 'rgba(46,230,122,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    ctx.font = `${Math.max(10, S / 50)}px sans-serif`;
    ctx.textAlign = 'center';
    for (const [key, x, z] of this.landmarks) {
      if (!PLACE_NAMES[key] || key === 'agent') continue;
      const [px, py] = at(x, z);
      ctx.fillStyle = 'rgba(46,230,122,0.55)';
      ctx.fillRect(px - 2, py - 2, 4, 4);
      ctx.fillText(PLACE_NAMES[key].replace(/^(at|on) (the )?/, ''), px, py - 6);
    }
    for (const v of this.vehicles()) {
      const [px, py] = at(v.pos.x, v.pos.z);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    for (const who of this.people()) {
      const [px, py] = at(who.pos.x, who.pos.z);
      ctx.fillStyle = who.npc ? '#ffeb3b' : '#40c4ff';
      ctx.beginPath();
      ctx.arc(px, py, who.npc ? 3 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(who.short || who.name, px, py - 7);
    }
    const me = this.mePos();
    const [mx, my] = at(me.x, me.z);
    ctx.strokeStyle = '#76ff03';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 6 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // ---------- Drones ----------

  startDrone(x, y, z) {
    this.mode = 'drone';
    this.buttons(false);
    this.drone = { pos: new THREE.Vector3(x + 0.5, y + 1.15, z + 0.5), // (just above its pad: the pad itself is solid)
      vel: new THREE.Vector3(), battery: DRONE_BATTERY, view: 0, sparkleT: 0, warned: false };
    this.droneModel.visible = true;
    this.overlay.classList.remove('hidden');
    document.getElementById('spy-cam').textContent = '🚁 DRONE CAM';
    this.sounds.tone(200, 800, 0.4, 0.1, 'sawtooth');
    this.hud.toast('🚁 Drone launched! WASD to fly, Space up, C down, the mouse to look, click for sparkles, V to switch views, E to bring it home.');
  }

  // Flying it (keys: what's held down; yaw: which way you're looking). Returns true while flying.
  flyDrone(dt, held, yaw, stick) {
    const d = this.drone;
    if (!d) return false;
    d.battery -= dt;
    d.sparkleT -= dt;
    const fwd = (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0) + (stick ? -stick.y : 0);
    const right = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0) + (stick ? stick.x : 0);
    const up = (held.has('Space') ? 1 : 0) - (held.has('KeyC') || held.has('ControlLeft') || held.has('ShiftLeft') ? 1 : 0);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const want = new THREE.Vector3((-sin * fwd + cos * right) * 12, up * 6, (-cos * fwd - sin * right) * 12);
    d.vel.lerp(want, Math.min(1, dt * 3));
    // Out of range? It gets pushed back toward the base.
    const dx = d.pos.x - this.base.x, dz = d.pos.z - this.base.z, far = Math.hypot(dx, dz);
    if (far > DRONE_RANGE) {
      d.vel.x -= (dx / far) * 20 * dt;
      d.vel.z -= (dz / far) * 20 * dt;
      if (!d.rangeWarned) this.hud.toast('📡 Signal weak! The drone can\'t go any farther from the base.');
      d.rangeWarned = true;
    } else if (far < DRONE_RANGE - 20) d.rangeWarned = false;
    // Move, one way at a time (it bumps into things instead of going through them).
    for (const axis of ['x', 'y', 'z']) {
      const next = d.pos.clone();
      next[axis] += d.vel[axis] * dt;
      if (axis === 'y') next.y = Math.max(0.3, Math.min(70, next.y));
      if (this.world.isSolid(Math.floor(next.x), Math.floor(next.y), Math.floor(next.z))) d.vel[axis] = 0;
      else d.pos.copy(next);
    }
    const m = this.droneModel;
    m.position.copy(d.pos);
    m.rotation.set(-d.vel.dot(new THREE.Vector3(-sin, 0, -cos)) * 0.03, yaw, d.vel.dot(new THREE.Vector3(cos, 0, -sin)) * -0.03, 'YXZ');
    spinRotors(m, dt);
    // Its spotlight shines down at night.
    const night = this.nightK();
    this.headlight.intensity = night > 0.2 ? 40 * night : 0;
    this.headlight.position.copy(d.pos);
    this.headlight.target.position.set(d.pos.x - sin * 3, d.pos.y - 8, d.pos.z - cos * 3);
    if (d.battery < 20 && !d.warned) {
      d.warned = true;
      this.hud.toast('🔋 Battery low! Bring it home soon.');
    }
    document.getElementById('spy-target').textContent = `🔋 ${Math.max(0, Math.round(d.battery / DRONE_BATTERY * 100))}%   📡 ${Math.round(far)} m from base   ⬆ ${Math.round(d.pos.y)} m`;
    if (d.battery <= 0) {
      this.hud.toast('🔋 Battery flat!');
      this.stop();
      return false;
    }
    return true;
  }

  // For the state we send everyone: [x, y, z, yaw] while flying, 0 otherwise.
  droneState(yaw) {
    const d = this.drone;
    if (this.mode !== 'drone' || !d) return 0;
    const r = v => Math.round(v * 100) / 100;
    return [r(d.pos.x), r(d.pos.y), r(d.pos.z), r(yaw)];
  }

  // Other players' drones (their positions come with their other moves).
  updateRemoteDrones(dt) {
    const seen = new Set();
    for (const a of this.others()) {
      if (!Array.isArray(a.drone)) continue;
      seen.add(a.id);
      let m = this.remote.get(a.id);
      if (!m) {
        m = makeDrone();
        m.position.set(a.drone[0], a.drone[1], a.drone[2]);
        this.scene.add(m);
        this.remote.set(a.id, m);
      }
      m.position.lerp(new THREE.Vector3(a.drone[0], a.drone[1], a.drone[2]), Math.min(1, dt * 8));
      m.rotation.y = a.drone[3];
      spinRotors(m, dt);
    }
    for (const [id, m] of this.remote) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      this.remote.delete(id);
    }
  }

  // ---------- The camera ----------

  // Points the camera (for the spy cameras and the drone). Returns true if it did.
  view(camera, dt, pitch, yaw) {
    if (this.mode === 'cams') {
      const list = this.people();
      const who = list[this.camTarget % Math.max(1, list.length)];
      if (!who) return false;
      this.camAngle += dt * 0.25;
      const p = who.pos;
      const focus = new THREE.Vector3(p.x, p.y + 1.2, p.z);
      const want = new THREE.Vector3(p.x + Math.sin(this.camAngle) * 7, p.y + 4.5, p.z + Math.cos(this.camAngle) * 7);
      camera.position.copy(this.avoidWalls ? this.avoidWalls(focus, want) : want); // (not looking through walls)
      camera.lookAt(focus.x, focus.y - 0.2, focus.z);
      this.camInfoT = (this.camInfoT || 0) - dt;
      if (this.camInfoT <= 0) {
        this.camInfoT = 0.5;
        this.showCamInfo();
      }
      return true;
    }
    if (this.mode === 'drone' && this.drone) {
      const d = this.drone.pos;
      this.droneModel.visible = this.drone.view !== 1;
      if (this.drone.view === 1) {
        camera.position.set(d.x, d.y - 0.15, d.z);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
      } else {
        const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        camera.position.copy(d).addScaledVector(back, 3).y += 0.8;
        camera.lookAt(d.x, d.y + 0.2, d.z);
      }
      return true;
    }
    if (this.mode === 'radar') {
      this.radarT -= dt;
      if (this.radarT <= 0) {
        this.radarT = 0.1;
        this.drawRadar(performance.now() / 1000);
      }
    }
    return false;
  }

  // ---------- The big red button ----------

  pressButton() {
    if (this.alarm > 0) return;
    this.alarm = 6;
    this.alarmShown = -1;
    this.sounds.tone(300, 300, 0.15, 0.2, 'square');
  }

  updateAlarm(dt) {
    this.alarm -= dt;
    const left = Math.ceil(this.alarm) - 1;
    if (left !== this.alarmShown && this.alarm > 1) {
      this.alarmShown = left;
      this.flash = 0.6;
      this.sounds.tone(880, 520, 0.45, 0.2, 'sawtooth');
      this.hud.toast(left > 0 ? `🚨 SELF-DESTRUCT IN ${left}... 🚨` : '🚨 SELF-DESTRUCT IN... 🚨');
    }
    if (this.alarm <= 1 && this.alarmShown !== 'done') {
      this.alarmShown = 'done';
      const p = this.mePos();
      this.effects.sparkle(p.x, p.y + 1.5, p.z, 60);
      this.sounds.tone(523, 1046, 0.6, 0.18, 'triangle');
      this.hud.toast('😜 JUST KIDDING! Agent Byte says: "Who keeps pressing that button?!"');
    }
  }

  // ---------- The laser hall ----------

  buildLasers() {
    this.laserGroup = new THREE.Group();
    this.laserGroup.visible = false;
    this.scene.add(this.laserGroup);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beams = [];
  }

  // The beams across the hall, at each row (from the base's layout).
  layLasers() {
    for (const b of this.beams) this.laserGroup.remove(b.mesh);
    this.beams = [];
    const L = this.base?.lasers;
    if (!L) return;
    const len = L.x1 - L.x0;
    L.rows.forEach((z, i) => {
      for (const h of LASER.heights) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), this.beamMat);
        mesh.position.set(L.x0 + len / 2, h, z + 0.5);
        this.laserGroup.add(mesh);
        this.beams.push({ mesh, row: i, z: z + 0.5, h });
      }
    });
  }

  laserOn(row, time) {
    const t = ((time + row * 0.65) % LASER.period) / LASER.period;
    return t < LASER.on;
  }

  updateLasers(dt, time, player, near, busy) {
    const L = this.base?.lasers;
    this.laserGroup.visible = !!(near && L);
    if (!this.laserGroup.visible) return;
    for (const b of this.beams) {
      b.mesh.visible = this.laserOn(b.row, time);
      if (b.mesh.visible) b.mesh.material.opacity = 0.7 + Math.sin(time * 40 + b.row) * 0.15;
    }
    const p = player.pos;
    const inHall = p.x > L.x0 - 0.3 && p.x < L.x1 + 0.3 && p.z > L.start[2] - 1 && p.z < L.end + 0.5 && p.y < 3;
    if (!inHall || busy) return;
    if (p.z < L.start[2] + 0.6) this.laserDone = false;
    if (p.z > L.end && !this.laserDone) {
      this.laserDone = true;
      this.sounds.tone(523, 1046, 0.4, 0.15, 'triangle');
      this.hud.toast('🏆 You made it through the laser hall! Now THAT\'s a real secret agent! 🕵️');
    }
    if (this.zapT > 0) return;
    for (const b of this.beams) {
      if (!b.mesh.visible || Math.abs(p.z - b.z) > 0.32 || b.h < p.y || b.h > p.y + 1.8) continue;
      // Zap! The alarm goes off, and it's back to the start.
      this.zapT = 1.2;
      this.flash = 0.7;
      this.sounds.tone(1500, 300, 0.4, 0.2, 'sawtooth');
      this.hud.toast('🚨 ZAP! You touched a laser! Back to the start! (Wait for them to blink off...)');
      p.set(...L.start);
      player.vel.set(0, 0, 0);
      return;
    }
  }

  // What the hint line says while using something.
  hint() {
    if (this.mode === 'cams') return '📹 ◀ ▶ (A / D) next camera · E to stop';
    if (this.mode === 'drone') return '🚁 WASD fly · Space up · C down · click: sparkles · V: view · E: bring it home';
    if (this.mode === 'radar') return '📡 Blue: players · Yellow: the town\'s people · E to close';
    return '';
  }
}

// A little white quadcopter: a body, four arms with spinning rotors, and blinking lights.
function makeDrone() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.4, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.6 });
  const blade = new THREE.MeshBasicMaterial({ color: 0x90a4ae, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), white));
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), dark);
  cam.position.set(0, -0.07, -0.12);
  g.add(cam);
  g.rotors = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.4), white);
    arm.position.set(x * 0.13, 0.02, z * 0.13);
    arm.rotation.y = Math.atan2(x, z);
    g.add(arm);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.006, 0.04), blade);
    r.position.set(x * 0.27, 0.07, z * 0.27);
    g.add(r);
    g.rotors.push(r);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: z < 0 ? 0x00e676 : 0xff1744 }));
    led.position.set(x * 0.27, 0.0, z * 0.27);
    g.add(led);
  }
  return g;
}

function spinRotors(m, dt) {
  for (const r of m.rotors) r.rotation.y += dt * 40;
}
