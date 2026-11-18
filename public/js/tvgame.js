// Block Hopper: the video game on the TV's Game channel. A blocky hero runs along by himself;
// hop (Space, ↑, W, or tap) over the gaps and the blocks in the way, and grab the stars. Two hops
// in a row make a double jump. The longer you last, the faster it goes. Your best score is kept
// on this device. On the TV it plays itself (a demo); right-click the TV to play it yourself.
const GROUND = 0.78; // (the ground's height on the screen, as a share of it)
const BEST_KEY = 'buildzone-hopper-best';

export class BlockHopper {
  constructor({ demo = false } = {}) {
    this.demo = demo;
    this.best = 0;
    try {
      this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      // (no storage: never mind)
    }
    this.reset();
  }

  reset() {
    this.x = 0; // how far along (in screen widths, more or less)
    this.speed = 0.45;
    this.y = 0; // the hero's height above the ground
    this.vy = 0;
    this.jumps = 0;
    this.stars = 0;
    this.over = false;
    this.overT = 0;
    this.things = []; // { kind: 'gap' | 'block' | 'star', at, w, h }
    this.nextAt = 1.2;
    this.seed = 7;
  }

  get score() {
    return Math.floor(this.x * 10) + this.stars * 5;
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  jump() {
    if (this.over) {
      if (this.overT > 0.6) this.reset();
      return;
    }
    if (this.jumps >= 2) return;
    this.vy = this.jumps ? 1.15 : 1.35;
    this.jumps++;
    this.onJump?.();
  }

  // dt: seconds. Returns what happened ('star', 'crash' or null).
  step(dt) {
    if (this.over) {
      this.overT += dt;
      if (this.demo && this.overT > 1.5) this.reset();
      return null;
    }
    this.x += this.speed * dt;
    this.speed = Math.min(1.1, this.speed + dt * 0.012);
    // Make more of the course ahead.
    while (this.nextAt < this.x + 2) {
      const r = this.rand();
      if (r < 0.35) this.things.push({ kind: 'gap', at: this.nextAt, w: 0.08 + this.rand() * 0.06 });
      else this.things.push({ kind: 'block', at: this.nextAt, w: 0.05, h: this.rand() < 0.3 ? 0.2 : 0.11 });
      if (this.rand() < 0.6) this.things.push({ kind: 'star', at: this.nextAt + 0.02, h: 0.3 + this.rand() * 0.15 });
      this.nextAt += 0.45 + this.rand() * 0.5 / (0.6 + this.speed);
    }
    this.things = this.things.filter(t => t.at > this.x - 0.4);
    // The demo plays itself: it hops just before anything in the way.
    if (this.demo) {
      const ahead = this.things.find(t => t.kind !== 'star' && t.at > this.x - 0.01 && t.at - this.x < 0.11 + this.speed * 0.05);
      if (ahead && this.y === 0) this.jump();
    }
    this.vy -= 3.6 * dt;
    this.y += this.vy * dt;
    const hero = this.x; // (the hero's spot along the course)
    const over = this.things.find(t => t.kind === 'gap' && hero > t.at && hero < t.at + t.w);
    if (this.y <= 0 && !over) {
      this.y = 0;
      this.vy = 0;
      this.jumps = 0;
    }
    let event = null;
    for (const t of this.things) {
      if (t.kind === 'block' && Math.abs(t.at - hero) < 0.03 && this.y < t.h) event = 'crash';
      if (t.kind === 'star' && !t.got && Math.abs(t.at - hero) < 0.04 && Math.abs(this.y + 0.05 - t.h) < 0.09) {
        t.got = true;
        this.stars++;
        event = event || 'star';
      }
    }
    if (this.y < -0.3) event = 'crash'; // (fell down a gap)
    if (event === 'crash') {
      this.over = true;
      this.overT = 0;
      if (!this.demo && this.score > this.best) {
        this.best = this.score;
        this.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(this.best));
        } catch {
          // (no storage)
        }
      }
    }
    return event;
  }

  draw(ctx, W, H, t) {
    // The sky, hills going by slowly, and the ground.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#4fc3f7');
    sky.addColorStop(1, '#e1f5fe');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9ccc65';
    for (let i = -1; i < 5; i++) {
      const hx = ((i * 0.35 - this.x * 0.15) % 1.4 + 1.4) % 1.4 * W - W * 0.2;
      ctx.beginPath();
      ctx.arc(hx, H * GROUND, H * 0.28, Math.PI, 0);
      ctx.fill();
    }
    const gy = H * GROUND, sx = a => (a - this.x) * W + W * 0.22; // (the hero runs at 22% across)
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = '#7cb342';
    ctx.fillRect(0, gy, W, H * 0.04);
    for (const th of this.things) {
      const x = sx(th.at);
      if (th.kind === 'gap') {
        ctx.fillStyle = '#263238';
        ctx.fillRect(x, gy, th.w * W, H - gy);
      } else if (th.kind === 'block') {
        ctx.fillStyle = '#e53935';
        ctx.fillRect(x - 0.025 * W, gy - th.h * H, 0.05 * W, th.h * H);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x - 0.025 * W, gy - th.h * H, 0.05 * W, H * 0.015);
      } else if (!th.got) {
        star(ctx, x, gy - th.h * H, H * 0.04, t);
      }
    }
    // The hero: a little blocky runner, legs going (tucked up in the air).
    const hx = W * 0.22, hy = gy - this.y * H, s = H * 0.09;
    const run = this.y > 0 ? 0 : Math.sin(t * 18) * s * 0.18;
    ctx.fillStyle = '#3949ab';
    ctx.fillRect(hx - s * 0.32, hy - s * 0.35 + run, s * 0.25, s * 0.35);
    ctx.fillRect(hx + s * 0.07, hy - s * 0.35 - run, s * 0.25, s * 0.35);
    ctx.fillStyle = '#1e88e5';
    ctx.fillRect(hx - s * 0.36, hy - s * 0.9, s * 0.72, s * 0.58);
    ctx.fillStyle = '#f5c9a0';
    ctx.fillRect(hx - s * 0.3, hy - s * 1.45, s * 0.6, s * 0.55);
    ctx.fillStyle = '#3b2314';
    ctx.fillRect(hx - s * 0.32, hy - s * 1.5, s * 0.64, s * 0.16);
    ctx.fillStyle = '#111';
    ctx.fillRect(hx + s * 0.08, hy - s * 1.25, s * 0.1, s * 0.1);
    // The score, the stars and your best.
    ctx.font = `900 ${Math.round(H * 0.09)}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    const line = `⭐ ${this.stars}   ${this.score}`;
    ctx.strokeText(line, W * 0.03, H * 0.04);
    ctx.fillText(line, W * 0.03, H * 0.04);
    ctx.textAlign = 'right';
    const best = `🏆 ${this.best}`;
    ctx.strokeText(best, W * 0.97, H * 0.04);
    ctx.fillText(best, W * 0.97, H * 0.04);
    if (this.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, H * 0.3, W, H * 0.3);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffeb3b';
      ctx.fillText(this.newBest ? '🏆 NEW BEST! 🏆' : '💥 OOPS!', W / 2, H * 0.34);
      ctx.fillStyle = '#fff';
      if (!this.demo) ctx.fillText('↻ Space', W / 2, H * 0.46);
    }
    if (this.demo) {
      ctx.textAlign = 'center';
      ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ffeb3b' : '#fff';
      ctx.strokeText('🎮 BLOCK HOPPER', W / 2, H * 0.17);
      ctx.fillText('🎮 BLOCK HOPPER', W / 2, H * 0.17);
    }
  }
}

function star(ctx, x, y, r, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 3) * 0.3);
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// The game window (right-click a TV on the Game channel): the game big, with a button to change
// the channel and one to stop. sounds: for the hop, star and crash noises.
export class HopperWindow {
  constructor({ sounds, onClose, onChannel }) {
    Object.assign(this, { sounds, onClose, onChannel });
    this.el = document.createElement('div');
    this.el.id = 'hopper';
    this.el.className = 'screen hidden';
    this.el.innerHTML = `<div class="panel game-panel hopper-panel">
      <canvas width="640" height="360"></canvas>
      <div class="hopper-buttons"><button class="hop-btn">⬆ Hop!</button><button class="secondary chan-btn" title="Next channel">📺 ⏭</button><button class="secondary close-btn" title="Stop (Esc)">✖</button></div>
    </div>`;
    document.body.append(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    const hop = e => {
      e.preventDefault();
      this.game?.jump();
    };
    this.canvas.addEventListener('pointerdown', hop);
    this.el.querySelector('.hop-btn').addEventListener('pointerdown', hop);
    this.el.querySelector('.close-btn').addEventListener('click', () => this.close());
    this.el.querySelector('.chan-btn').addEventListener('click', () => {
      this.close();
      this.onChannel?.();
    });
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show() {
    this.game = new BlockHopper();
    this.game.onJump = () => this.sounds.tone(500, 900, 0.12, 0.12, 'square');
    this.el.classList.remove('hidden');
    let last = performance.now();
    const loop = now => {
      if (!this.open) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ev = this.game.step(dt);
      if (ev === 'star') this.sounds.tone(1320, 1760, 0.12, 0.12, 'triangle');
      if (ev === 'crash') this.sounds.tone(300, 80, 0.4, 0.2, 'sawtooth');
      this.game.draw(this.ctx, this.canvas.width, this.canvas.height, now / 1000);
    };
    requestAnimationFrame(loop);
  }

  // Keys while playing: Space, ↑ or W hop; Esc stops.
  key(e) {
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.game?.jump();
    } else if (e.code === 'Escape' || e.code === 'KeyE') this.close();
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.onClose?.();
  }
}
