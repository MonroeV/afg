// BuildZone Stadium, as everyone sees it (see shared/stadium.js): the giant soccer ball (where the
// server says it is, rolling on smoothly in between), kicking it when you run into it, the big
// scoreboard, and the crowd in the stands, who jump up and cheer at every goal.
import * as THREE from 'three';
import { stepBall, kickBall, BALL_R } from './shared/stadium.js';

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#111111';
  // (black patches, spread about like a soccer ball's)
  for (const [x, y] of [[32, 24], [96, 64], [160, 24], [224, 64], [32, 104], [160, 104], [96, 8], [224, 8], [96, 120], [224, 120]]) {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15);
    }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StadiumUI {
  constructor({ scene, sounds, effects, hud, net }) {
    Object.assign(this, { scene, sounds, effects, hud, net });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.place = null;
    this.ball = null; // { x, y, z, vx, vy, vz } (as we think it is now)
    this.score = { red: 0, blue: 0 };
    this.lastKick = 0;
    this.cheer = 0;
  }

  setPlace(place, ball) {
    this.group.clear();
    this.place = place?.field ? place : null;
    if (!this.place) return;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.5 }));
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    this.ball = { x: place.center[0], y: 0, z: place.center[1], vx: 0, vy: 0, vz: 0 };
    if (ball) this.serverBall(ball);
    // The scoreboard.
    const b = place.board, canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    this.canvas = canvas;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide }));
    board.position.set(b.x, b.y, b.z);
    board.rotation.y = b.face;
    this.group.add(board);
    this.drawBoard();
    // The crowd: little blocky people in all sorts of colors, sitting in the stands.
    const fans = place.fans || [], n = fans.length;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.75, 0.35), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
    const colors = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xffffff, 0x8e24aa, 0xff7043, 0xe53935, 0x1e88e5];
    const skins = [0xf5c9a0, 0xe0ac69, 0xc68642, 0x8d5524, 0xffe0c4];
    const c = new THREE.Color();
    fans.forEach((f, i) => {
      body.setColorAt(i, c.set(colors[(i * 7) % colors.length]));
      head.setColorAt(i, c.set(skins[(i * 3) % skins.length]));
    });
    body.frustumCulled = head.frustumCulled = false;
    this.fans = { body, head, list: fans };
    this.group.add(body, head);
    this.placeFans(0);
  }

  // The fans: sitting, swaying a bit, and up on their feet jumping when there's a goal.
  placeFans(t) {
    const { body, head, list } = this.fans, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = this.cheer > 0;
    list.forEach(([x, y, z, side], i) => {
      const jump = up ? Math.abs(Math.sin(t * 9 + i)) * 0.6 + 0.3 : Math.max(0, Math.sin(t * 0.7 + i * 1.7)) * 0.05;
      q.setFromEuler(e.set(0, this.place.fanFace[side], 0));
      body.setMatrixAt(i, m.compose(p.set(x, y + 0.85 + jump, z), q, s));
      head.setMatrixAt(i, m.compose(p.set(x, y + 1.45 + jump, z), q, s));
    });
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
  }

  drawBoard() {
    if (!this.canvas) return;
    const g = this.canvas.getContext('2d'), W = 512, H = 256;
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#ffd54f';
    g.fillText('⚽ BUILDZONE STADIUM', W / 2, 52);
    g.font = 'bold 110px system-ui, sans-serif';
    g.fillStyle = '#ff5252';
    g.fillText(String(this.score.red), W * 0.25, 190);
    g.fillStyle = '#ffffff';
    g.fillText(':', W / 2, 180);
    g.fillStyle = '#448aff';
    g.fillText(String(this.score.blue), W * 0.75, 190);
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillStyle = '#ff8a80';
    g.fillText('🔴 RED', W * 0.25, 238);
    g.fillStyle = '#82b1ff';
    g.fillText('BLUE 🔵', W * 0.75, 238);
    this.texture.needsUpdate = true;
  }

  // Where the server says the ball is: glide there (a small difference), or jump (a big one).
  serverBall(m) {
    if (!this.ball) return;
    const b = this.ball, far = Math.hypot(m.x - b.x, m.y - b.y, m.z - b.z) > 3;
    if (far) Object.assign(b, { x: m.x, y: m.y, z: m.z });
    else this.nudge = { x: m.x - b.x, y: m.y - b.y, z: m.z - b.z, left: 0.15 };
    Object.assign(b, { vx: m.vx, vy: m.vy, vz: m.vz, scored: false });
    if (m.score && (m.score.red !== this.score.red || m.score.blue !== this.score.blue)) {
      this.score = { ...m.score };
      this.drawBoard();
    }
  }

  goal({ team, score, by }) {
    this.score = { ...score };
    this.drawBoard();
    this.cheer = 5;
    this.hud.toast(`⚽ GOAL! ${team === 'red' ? '🔴' : '🔵'}${by ? ` ${by}` : ''} · 🔴 ${score.red} : ${score.blue} 🔵`);
    this.sounds.noiseHit(1200, 1.2, 0.5, 'bandpass');
    this.sounds.magic();
    if (this.ball) this.effects.sparkle(this.ball.x, this.ball.y + 1, this.ball.z, 50);
  }

  // Every frame: roll the ball on, kick it if we've run into it, the crowd.
  update(dt, t, player, eye, walking) {
    if (!this.place) return;
    const near = Math.hypot(eye.x - this.place.center[0], eye.z - this.place.center[1]) < 260;
    this.group.visible = near;
    if (!near) return;
    const b = this.ball;
    stepBall(b, dt, this.place);
    if (this.nudge) {
      const k = Math.min(1, dt / Math.max(dt, this.nudge.left));
      b.x += this.nudge.x * k;
      b.y += this.nudge.y * k;
      b.z += this.nudge.z * k;
      this.nudge.left -= dt;
      if (this.nudge.left <= 0) this.nudge = null;
    }
    this.mesh.position.set(b.x, b.y + BALL_R, b.z);
    // (rolling: it spins the way it's going)
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 0.05) this.mesh.rotateOnWorldAxis(new THREE.Vector3(-b.vz, 0, b.vx).normalize(), (speed * dt) / BALL_R);
    // Ran into it? Kick! (Which way: the way you're running, or looking.)
    if (walking && t - this.lastKick > 0.35) {
      const p = player.pos, d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < BALL_R + 0.75 && p.y < b.y + BALL_R * 2 && p.y + 1.8 > b.y) {
        this.lastKick = t;
        const v = player.vel, run = Math.hypot(v.x, v.z);
        const yaw = run > 1 ? Math.atan2(-v.x, -v.z) : player.yaw;
        const power = Math.min(1, run / 7);
        kickBall(b, yaw, player.pitch, power); // (our guess, till the server says)
        this.net.send({ t: 'kick', yaw, pitch: player.pitch, power });
        this.sounds.tone(160, 90, 0.12, 0.3, 'sine');
      }
    }
    this.cheer = Math.max(0, this.cheer - dt);
    this.placeFans(t);
  }
}
