// Putt Putt Paradise, as you play it (see shared/minigolf.js for the course): the cups and their
// numbered flags, the windmill's sweeping sails, the loop-the-loop, your ball rolling and bouncing
// off the walls, the power meter, your scorecard, and the Best Rounds board. Your ball is just
// yours (each player plays their own); the server keeps the scores.
//
// On a tee: G puts your ball down. G starts the power meter swinging; G again putts it the way
// you're looking (on a phone, 💃 does what G does).
import * as THREE from 'three';
import { HOLES, onLane, windmillBlocked, CUP_R, GOLF_BALL_R } from './shared/minigolf.js';

const R = GOLF_BALL_R, FRICTION = 0.55, ROLL = 0.8, MAX_PUTT = 13;
const RESULT = (strokes, par) => (strokes === 1 ? '🎯 HOLE IN ONE!' : strokes <= par - 2 ? '🦅 Eagle!' : strokes === par - 1 ? '🐦 Birdie!' : strokes === par ? '👍 Par!' : strokes === par + 1 ? '🙂 Bogey' : '⛳ In!');

export class GolfUI {
  constructor({ scene, sounds, effects, hud, net }) {
    Object.assign(this, { scene, sounds, effects, hud, net });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.place = null;
    this.play = null; // { hole, u, v, vu, vv, strokes, meter: null | 0..1 swinging, safe: [u, v] }
    this.card = Array(9).fill(null);
    this.board = [];
    this.ui = document.createElement('div');
    Object.assign(this.ui.style, {
      position: 'fixed', top: '112px', left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: '16px',
      background: 'rgba(27, 94, 32, 0.85)', color: '#fff', font: 'bold 18px system-ui, sans-serif', display: 'none', pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap', textAlign: 'center',
    });
    this.ui.innerHTML = '<div class="t"></div><div class="m" style="margin:4px auto 0;width:180px;height:10px;border-radius:5px;background:rgba(255,255,255,0.25);overflow:hidden;display:none"><div style="height:100%;width:0;background:linear-gradient(90deg,#66bb6a,#ffeb3b,#ef5350)"></div></div>';
    document.body.appendChild(this.ui);
  }

  // (local u, v on hole i <-> the world)
  world(i, u, v) {
    const [ox, oz] = this.place.holes[i], { U, V } = this.place;
    return [ox + U[0] * u + V[0] * v, oz + U[1] * u + V[1] * v];
  }

  local(i, x, z) {
    const [ox, oz] = this.place.holes[i], { U, V } = this.place, dx = x - ox, dz = z - oz;
    return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]];
  }

  setPlace(place, board = []) {
    this.group.clear();
    this.place = place?.holes ? place : null;
    this.board = board || [];
    if (!this.place) return;
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const cupMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    this.sails = [];
    this.loops = [];
    HOLES.forEach((hole, i) => {
      // The cup (a dark hole in the grass), and its flag with the hole's number.
      const [cx, cz] = this.world(i, ...hole.cup);
      const cup = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 20), cupMat);
      cup.rotation.x = -Math.PI / 2;
      cup.position.set(cx, 0.02, cz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), white);
      pole.position.set(cx, 0.9, cz);
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 48;
      const g = c.getContext('2d');
      g.fillStyle = ['#e53935', '#fdd835', '#1e88e5'][i % 3];
      g.fillRect(0, 0, 64, 48);
      g.fillStyle = '#ffffff';
      g.font = 'bold 36px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(String(i + 1), 32, 38);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
      flag.position.set(cx + 0.3, 1.55, cz);
      // A tee mat.
      const [tx, tz] = this.world(i, ...hole.tee);
      const mat = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.9 }));
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(tx, 0.02, tz);
      this.group.add(cup, pole, flag, mat);
      // The windmill's sails, on the front of its tower (facing the tee).
      if (hole.windmill) {
        const { u, gap } = hole.windmill, [wx, wz] = this.world(i, u - 0.05, (gap[0] + gap[1]) / 2);
        const hub = new THREE.Group();
        hub.position.set(wx, 2.6, wz);
        hub.rotation.y = Math.atan2(-this.place.U[0], -this.place.U[1]);
        const wood = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 }), cloth = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.9, side: THREE.DoubleSide });
        const spin = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const arm = new THREE.Group();
          arm.rotation.z = (k * Math.PI) / 2;
          const spar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.08), wood);
          spar.position.y = 1.3;
          const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 2.0), cloth);
          sail.position.set(0.32, 1.5, 0.02);
          arm.add(spar, sail);
          spin.add(arm);
        }
        hub.add(spin);
        this.group.add(hub);
        this.sails.push(spin);
      }
      // The loop-the-loop: a big ring standing over the lane.
      if (hole.loop) {
        const [lx, lz] = this.world(i, hole.loop.u, (hole.lane[0][1] + hole.lane[0][3]) / 2);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 8, 32), new THREE.MeshStandardMaterial({ color: 0xff7043, roughness: 0.5 }));
        ring.position.set(lx, 1.25, lz);
        ring.rotation.y = Math.atan2(this.place.V[0], this.place.V[1]);
        this.group.add(ring);
        this.loops.push(ring);
      }
    });
    // Your ball (and the arrow showing which way you'll putt).
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x222222 }));
    this.ball.visible = false;
    this.arrow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 1), new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.8 }));
    this.arrow.visible = false;
    this.group.add(this.ball, this.arrow);
    // The Best Rounds board.
    const b = place.board, canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = Math.round((384 * b.h) / b.w);
    this.canvas = canvas;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide }));
    screen.position.set(b.x, b.y, b.z);
    screen.rotation.y = b.face;
    this.group.add(screen);
    this.drawBoard();
  }

  setBoard(board) {
    this.board = board || [];
    this.drawBoard();
  }

  drawBoard() {
    if (!this.canvas) return;
    const c = this.canvas, g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = '#1b5e20';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff';
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('⛳ BEST ROUNDS', W / 2, 52);
    g.font = 'bold 30px system-ui, sans-serif';
    const step = (H - 90) / 10;
    if (!this.board.length) g.fillText('Be the first! 🏌️', W / 2, 120);
    this.board.slice(0, 10).forEach(([name, total], i) => {
      const y = 100 + step * i;
      g.textAlign = 'left';
      g.fillStyle = i === 0 ? '#ffd54f' : '#ffffff';
      g.fillText(`${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${String(name).slice(0, 11)}`, 16, y);
      g.textAlign = 'right';
      g.fillText(String(total), W - 16, y);
    });
    this.texture.needsUpdate = true;
  }

  // The tee you're standing on (or -1).
  teeAt(p) {
    if (!this.place) return -1;
    for (let i = 0; i < HOLES.length; i++) {
      const [tx, tz] = this.world(i, ...HOLES[i].tee);
      if (Math.hypot(p.x - tx, p.z - tz) < 1.3 && p.y < 1.5) return i;
    }
    return -1;
  }

  // G (or 💃): put the ball down, start the power meter, or putt. True if golf used it.
  press(player) {
    if (!this.place) return false;
    const pl = this.play;
    if (!pl) {
      const i = this.teeAt(player.pos);
      if (i < 0) return false;
      const [u, v] = HOLES[i].tee;
      this.play = { hole: i, u, v, vu: 0, vv: 0, strokes: 0, meter: null, safe: [u, v] };
      this.ball.visible = true;
      this.sounds.click();
      return true;
    }
    if (Math.hypot(pl.vu, pl.vv) > 0.05) return true; // (still rolling: wait)
    if (pl.meter === null) {
      pl.meter = 0;
      pl.meterT = 0;
      return true;
    }
    // Putt! The way you're looking, as hard as the meter says.
    const power = pl.meter, dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw), { U, V } = this.place;
    const du = dx * U[0] + dz * U[1], dv = dx * V[0] + dz * V[1], speed = 0.6 + power * MAX_PUTT;
    pl.vu = du * speed;
    pl.vv = dv * speed;
    pl.safe = [pl.u, pl.v];
    pl.strokes++;
    pl.meter = null;
    this.sounds.tone(700, 500, 0.06, 0.2, 'triangle');
    return true;
  }

  // Is this spot free for the ball (on the lane, not in a wall, not where the windmill's sails are)?
  free(hole, u, v, t) {
    for (const [du, dv] of [[R, 0], [-R, 0], [0, R], [0, -R]]) if (!onLane(hole, u + du, v + dv)) return false;
    for (const wall of [hole.windmill, hole.castle]) {
      if (!wall || u + R < wall.u || u - R > wall.u + 1) continue;
      const inGap = v - R >= wall.gap[0] && v + R <= wall.gap[1];
      if (!inGap || (wall === hole.windmill && windmillBlocked(t))) return false;
    }
    return true;
  }

  // Every frame: the sails, your ball rolling, the meter, the messages.
  update(dt, t, player) {
    if (!this.place) return;
    const near = Math.hypot(player.pos.x - this.place.x, player.pos.z - this.place.z) < 120;
    this.group.visible = near;
    for (const s of this.sails) s.rotation.z = -t * 1.3;
    const pl = this.play;
    if (!pl) {
      const i = near ? this.teeAt(player.pos) : -1;
      this.show(i >= 0 ? `⛳ ${i + 1} · Par ${HOLES[i].par} · G` : '');
      this.arrow.visible = false;
      return;
    }
    const hole = HOLES[pl.hole];
    // Rolling (a few small steps, so it never skips through a wall).
    const steps = Math.max(1, Math.ceil((Math.hypot(pl.vu, pl.vv) * dt) / 0.1));
    for (let k = 0; k < steps; k++) this.roll(hole, pl, dt / steps, t);
    const [x, z] = this.world(pl.hole, pl.u, pl.v);
    this.ball.position.set(x, R + (pl.loopT > 0 ? Math.sin((1 - pl.loopT / 0.45) * Math.PI) * 2.2 : 0), z);
    if (pl.loopT > 0) pl.loopT -= dt;
    // Walked away? Then this hole's off.
    if (Math.hypot(player.pos.x - x, player.pos.z - z) > 22) {
      this.end();
      this.hud.toast('⛳ ✖');
      return;
    }
    // The power meter swings back and forth.
    if (pl.meter !== null) {
      pl.meterT += dt;
      pl.meter = Math.abs(((pl.meterT * 0.9) % 2) - 1) * -1 + 1;
    }
    const resting = Math.hypot(pl.vu, pl.vv) < 0.05;
    this.arrow.visible = resting;
    if (resting) {
      const yaw = player.yaw, len = 0.6 + (pl.meter ?? 0.3) * 1.6;
      this.arrow.scale.z = len;
      this.arrow.position.set(x - Math.sin(yaw) * (len / 2 + 0.2), 0.05, z - Math.cos(yaw) * (len / 2 + 0.2));
      this.arrow.rotation.y = yaw;
    }
    this.show(`⛳ ${pl.hole + 1} · Par ${hole.par} · 🏌️ ${pl.strokes}${resting ? (pl.meter === null ? ' · G: power' : ' · G: putt!') : ''}`, pl.meter);
  }

  roll(hole, pl, dt, t) {
    const speed = Math.hypot(pl.vu, pl.vv);
    if (speed < 0.05) {
      pl.vu = pl.vv = 0;
      return;
    }
    // Slowing down on the grass.
    const slow = Math.max(0, speed - (FRICTION * speed + ROLL) * dt) / speed;
    pl.vu *= slow;
    pl.vv *= slow;
    // The loop-the-loop: hard enough and round you go; too slow and it rolls back.
    if (hole.loop && pl.u < hole.loop.u && pl.u + pl.vu * dt >= hole.loop.u) {
      if (pl.vu >= 4.5) {
        pl.loopT = 0.45;
        this.sounds.whoosh();
      } else pl.vu = -pl.vu * 0.6;
    }
    const nu = pl.u + pl.vu * dt, nv = pl.v + pl.vv * dt;
    if (this.free(hole, nu, pl.v, t)) pl.u = nu;
    else {
      pl.vu = -pl.vu * 0.7;
      this.sounds.tone(300, 260, 0.03, 0.1, 'square');
    }
    if (this.free(hole, pl.u, nv, t)) pl.v = nv;
    else {
      pl.vv = -pl.vv * 0.7;
      this.sounds.tone(300, 260, 0.03, 0.1, 'square');
    }
    // Bumpers: round stones it bounces off.
    for (const [bu, bv] of hole.bumpers || []) {
      const cu = Math.floor(bu) + 0.5, cv = Math.floor(bv) + 0.5, du = pl.u - cu, dv = pl.v - cv, d = Math.hypot(du, dv), min = 0.55 + R;
      if (d < min && d > 0) {
        const nx = du / d, nz = dv / d, along = pl.vu * nx + pl.vv * nz;
        if (along < 0) {
          pl.vu -= 1.8 * along * nx;
          pl.vv -= 1.8 * along * nz;
        }
        pl.u = cu + nx * min;
        pl.v = cv + nz * min;
      }
    }
    // The pond: splash! Back where you putted from, and a stroke more.
    for (const [u0, v0, u1, v1] of hole.water || []) {
      if (pl.u > u0 && pl.u < u1 && pl.v > v0 && pl.v < v1) {
        const [x, z] = this.world(pl.hole, pl.u, pl.v);
        this.effects.splash?.(x, 0.2, z);
        this.hud.toast('💦 +1');
        [pl.u, pl.v] = pl.safe;
        pl.vu = pl.vv = 0;
        pl.strokes++;
        return;
      }
    }
    // The cup: close and slow enough, and it drops in.
    const [cu, cv] = hole.cup, dc = Math.hypot(pl.u - cu, pl.v - cv), sp = Math.hypot(pl.vu, pl.vv);
    if (dc < CUP_R && sp < 4.5) return this.holed();
    if (dc < CUP_R * 2.2 && sp < 2.5) {
      // (the cup's edge pulls it in a little)
      pl.vu += ((cu - pl.u) / dc) * 3 * dt;
      pl.vv += ((cv - pl.v) / dc) * 3 * dt;
    }
  }

  holed() {
    const pl = this.play, hole = HOLES[pl.hole];
    this.card[pl.hole] = pl.strokes;
    this.hud.toast(`${RESULT(pl.strokes, hole.par)} ⛳ ${pl.hole + 1}: ${pl.strokes}`);
    this.sounds.magic();
    const [x, z] = this.world(pl.hole, ...hole.cup);
    this.effects.sparkle(x, 0.6, z, pl.strokes === 1 ? 60 : 24);
    this.net.send({ t: 'golf_hole', hole: pl.hole, strokes: pl.strokes });
    this.end();
  }

  // The server: a whole round done (all nine holes).
  round({ total, coins, best, record }) {
    this.hud.toast(`⛳ 9 holes: ${total}${record ? ' 🏆 RECORD!' : best ? ' ⭐ Best!' : ''}${coins ? ` +${coins} 🪙` : ''}`);
    this.card = Array(9).fill(null);
  }

  end() {
    this.play = null;
    this.ball.visible = false;
    this.arrow.visible = false;
  }

  show(text, meter = null) {
    const t = this.ui.querySelector('.t'), m = this.ui.querySelector('.m');
    const card = this.card.some(s => s !== null) ? ` · 📋 ${this.card.map(s => (s === null ? '·' : s)).join(' ')}` : '';
    const full = text ? text + card : '';
    if (t.textContent !== full) t.textContent = full;
    this.ui.style.display = full ? 'block' : 'none';
    m.style.display = meter !== null && meter !== undefined ? 'block' : 'none';
    if (meter !== null && meter !== undefined) m.firstChild.style.width = `${Math.round(meter * 100)}%`;
  }

  get playing() {
    return !!this.play;
  }
}
