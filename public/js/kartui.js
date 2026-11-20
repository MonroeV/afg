// Thunder Raceway, as each player's game shows it (see shared/karts.js for the track): the five
// start lights on the gantry (the same for everyone, on the game's clock: red, red, red, red,
// red… GREEN!), the big Best Laps board by the grandstand, and, while you're driving a go-kart,
// your lap time at the top of the screen (the server does the timing: see kartStep in game.js).
import * as THREE from 'three';

const CYCLE = 16; // (seconds: the start lights' sequence, over and over)
export const fmtLap = ms => {
  const s = ms / 1000, m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
};

// The lights now: how many reds are on (0-5), and whether it's green.
export function lightsAt(t) {
  const p = ((t % CYCLE) + CYCLE) % CYCLE;
  if (p < 5) return { reds: Math.floor(p) + 1, green: false };
  if (p < 6.5) return { reds: 5, green: false };
  if (p < 10) return { reds: 0, green: true };
  return { reds: 0, green: false };
}

export class KartUI {
  constructor({ scene, sounds, hud }) {
    Object.assign(this, { scene, sounds, hud });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.place = null;
    this.board = [];
    this.lapStart = 0; // (when the server said this lap started: our clock)
    this.best = 0;
    this.last = null; // (the lights, last frame)
    this.chip = document.createElement('div');
    Object.assign(this.chip.style, {
      position: 'fixed', top: '112px', left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: '16px',
      background: 'rgba(20, 20, 24, 0.82)', color: '#fff', font: 'bold 20px system-ui, sans-serif', display: 'none', pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap',
    });
    document.body.appendChild(this.chip);
  }

  setPlace(place, board = []) {
    this.group.clear();
    this.place = place || null;
    this.board = board || [];
    if (!place) return;
    // The start lights: a black panel of five lamps hanging from the gantry, facing the drivers.
    const lights = new THREE.Group();
    lights.position.set(place.lights.x, place.lights.y, place.lights.z);
    lights.rotation.y = place.lights.face;
    lights.add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 })));
    this.lamps = [];
    for (let i = 0; i < 5; i++) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0x331111 }));
      lamp.position.set(-1.6 + i * 0.8, 0, 0.11);
      lights.add(lamp);
      const back = lamp.clone();
      back.material = lamp.material;
      back.position.z = -0.11;
      back.rotation.y = Math.PI;
      lights.add(back);
      this.lamps.push(lamp);
    }
    this.group.add(lights);
    // The Best Laps board.
    const b = place.board, canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round((512 * b.h) / b.w);
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
    g.fillStyle = '#101418';
    g.fillRect(0, 0, W, H);
    // A checkered stripe across the top, and the title.
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#ffffff' : '#111111';
      g.fillRect(i * (W / 16), j * 16, W / 16, 16);
    }
    g.fillStyle = '#ffd54f';
    g.font = 'bold 54px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('🏁 BEST LAPS', W / 2, 96);
    g.font = 'bold 40px system-ui, sans-serif';
    const rows = this.board.slice(0, 10), top = 150, step = (H - top - 20) / 10;
    if (!rows.length) {
      g.fillStyle = '#9e9e9e';
      g.fillText('🏎️ Be the first!', W / 2, top + step * 2);
    }
    rows.forEach(([name, ms], i) => {
      const y = top + step * i + step * 0.7;
      g.fillStyle = i === 0 ? '#ffd54f' : i < 3 ? '#e0e0e0' : '#bdbdbd';
      g.textAlign = 'left';
      g.fillText(`${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${String(name).slice(0, 12)}`, 24, y);
      g.textAlign = 'right';
      g.fillText(fmtLap(ms), W - 24, y);
    });
    this.texture.needsUpdate = true;
  }

  // The server's timing: a lap's started (over the line), a checkpoint passed, a lap done.
  go() {
    this.lapStart = performance.now();
    this.cp = 0;
  }

  checkpoint(i, of) {
    this.cp = i;
    this.of = of;
    this.sounds.tone(1200, 1300, 0.05, 0.05, 'sine');
  }

  lap({ ms, best, coins, record }) {
    this.best = best;
    const fanfare = record || coins;
    this.sounds.tone(fanfare ? 880 : 660, fanfare ? 1760 : 880, 0.3, 0.15, 'triangle');
    this.hud.toast(`🏁 ${fmtLap(ms)}${record ? ' 🏆 RECORD!' : coins ? ' ⭐ Best!' : ''}${coins ? ` +${coins} 🪙` : ''}`);
  }

  // Every frame: the lights (and their beeps, if you're in a kart nearby), and the lap chip.
  update(t, myCar, eye) {
    if (!this.place) return;
    const near = Math.hypot(eye.x - this.place.x, eye.z - this.place.z) < 300;
    this.group.visible = near;
    const kart = myCar?.kind === 'kart';
    this.chip.style.display = kart ? 'block' : 'none';
    if (!near) return;
    const l = lightsAt(t);
    this.lamps.forEach((lamp, i) => lamp.material.color.set(l.green ? 0x22ff55 : i < l.reds ? 0xff2020 : 0x331111));
    const key = `${l.reds}:${l.green}`;
    if (kart && this.last !== key && Math.hypot(eye.x - this.place.x, eye.z - this.place.z) < 45) {
      if (l.green) this.sounds.tone(1320, 1320, 0.5, 0.18, 'square');
      else if (l.reds) this.sounds.tone(660, 660, 0.18, 0.12, 'square');
    }
    this.last = key;
    if (!kart) return;
    const text = this.lapStart ? `⏱️ ${fmtLap(performance.now() - this.lapStart)}${this.best ? ` · 🏆 ${fmtLap(this.best)}` : ''}` : `🏁 ➡ ${l.green ? '🟢 GO!' : l.reds ? '🔴'.repeat(l.reds) : ''}`;
    if (this.chip.textContent !== text) this.chip.textContent = text;
  }

  // Out of the kart: the lap's off (the server starts again from the line next time).
  reset() {
    this.lapStart = 0;
  }
}
