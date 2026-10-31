// Phone and tablet controls, played sideways. A joystick appears wherever your left thumb
// touches the screen, dragging on the right side looks around, tapping there uses what
// you're holding (keep your finger still to keep hammering), and a few round pads jump,
// interact and get in and out of things.

const params = new URLSearchParams(location.search);
export const IS_TOUCH = params.has('touch') || matchMedia('(hover: none) and (pointer: coarse)').matches;

const STICK_RADIUS = 56; // how far (in pixels) the knob can move from the middle
const DEAD_ZONE = 0.12;
const TAP_TIME = 300; // ms: a quick touch that doesn't move is a tap
const HOLD_TIME = 380; // ms: a touch that stays still this long starts "holding"
const MOVE_SLOP = 12; // px a finger can wiggle and still count as a tap

function div(className, parent, text = '') {
  const d = document.createElement('div');
  d.className = className;
  d.textContent = text;
  parent.append(d);
  return d;
}

// Keep getting this finger's moves even when it slides off the element.
function capture(el, e) {
  try {
    el.setPointerCapture(e.pointerId);
  } catch { /* the finger is already gone */ }
}

export class TouchControls {
  // on: { look(dx, dy), tap(), hold(), interact(), flyToggle(), pause(), items(), camera(), dance(), chat() }
  constructor(on) {
    this.on = on;
    this.keys = new Set(); // pretend keyboard keys, so the game can treat touch like a keyboard
    this.releasing = new Set(); // keys let go of since the last frame (a quick tap still counts once)
    this.stick = { x: 0, y: 0 }; // -1..1, y is forward
    this.enabled = false;
    this.mode = 'walk'; // walk, fly, car, heli or ride: what the joystick and pads do
    this.move = null; // the finger on the joystick
    this.look = null; // the finger looking around
    this.lastJump = 0;

    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.className = 'hidden';
    document.body.insertBefore(this.root, document.getElementById('hud'));
    const moveZone = div('touch-zone move', this.root);
    const lookZone = div('touch-zone look', this.root);
    this.base = div('stick idle', this.root);
    this.knob = div('knob', this.base);

    this.pads = {
      jump: div('pad jump', this.root, '⬆'),
      down: div('pad down hidden', this.root, '⬇'),
      use: div('pad use', this.root, '✋'),
    };
    const minis = div('minis', this.root);
    for (const [name, label] of [['pause', '⏸'], ['items', '🎒'], ['camera', '🎥'], ['dance', '💃'], ['chat', '💬']]) {
      const b = div('mini', minis, label);
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.on[name]?.();
      });
    }
    // Hold your phone sideways!
    const rotate = div('rotate-phone', document.body);
    div('rotate-icon', rotate, '📱');
    div('', rotate, 'Turn your phone sideways to play');

    moveZone.addEventListener('pointerdown', e => this.moveStart(e));
    moveZone.addEventListener('pointermove', e => this.moveDrag(e));
    for (const ev of ['pointerup', 'pointercancel']) moveZone.addEventListener(ev, e => this.moveEnd(e));
    lookZone.addEventListener('pointerdown', e => this.lookStart(e));
    lookZone.addEventListener('pointermove', e => this.lookDrag(e));
    for (const ev of ['pointerup', 'pointercancel']) lookZone.addEventListener(ev, e => this.lookEnd(e));

    this.padHold(this.pads.jump, () => (this.mode === 'ride' ? null : 'Space'), e => {
      // Tap jump twice quickly to start or stop flying (timed by when the finger touched).
      if ((this.mode === 'walk' || this.mode === 'fly') && e.timeStamp - this.lastJump < 320) {
        this.on.flyToggle?.();
        this.lastJump = -1e9;
      } else {
        this.lastJump = e.timeStamp;
      }
    });
    this.padHold(this.pads.down, () => (this.mode === 'heli' ? 'ShiftLeft' : 'KeyC'));
    this.pads.use.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.pads.use.classList.add('pressed');
      this.on.interact?.();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.pads.use.addEventListener(ev, () => this.pads.use.classList.remove('pressed'));
    this.root.addEventListener('contextmenu', e => e.preventDefault());
  }

  // A pad that holds a key down while your finger is on it.
  padHold(el, key, onPress) {
    let held = null;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      capture(el, e);
      held = key();
      if (held) {
        this.keys.add(held);
        this.releasing.delete(held);
      }
      el.classList.add('pressed');
      onPress?.(e);
    });
    const up = () => {
      if (held) this.releasing.add(held); // let go after the game has seen it at least once
      held = null;
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  show(on) {
    this.enabled = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.releaseAll();
  }

  releaseAll() {
    this.move = this.look = null;
    this.stick.x = this.stick.y = 0;
    this.keys.clear();
    this.releasing.clear();
    this.base.classList.add('idle');
    this.base.style.left = this.base.style.top = '';
    this.knob.style.transform = '';
    for (const p of Object.values(this.pads)) p.classList.remove('pressed');
  }

  // What the pads mean right now: walking, flying, driving, flying the helicopter, or riding.
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.pads.jump.textContent = mode === 'car' ? '🛑' : '⬆';
    this.pads.jump.classList.toggle('hidden', mode === 'ride');
    this.pads.down.classList.toggle('hidden', mode !== 'fly' && mode !== 'heli');
    this.pads.use.textContent = mode === 'car' || mode === 'heli' || mode === 'ride' ? '🚪' : '✋';
    this.stickKeys();
  }

  // ---------- Joystick ----------

  moveStart(e) {
    if (this.move) return;
    e.preventDefault();
    capture(e.currentTarget, e);
    // The joystick appears right under your thumb (but not hanging off the screen).
    const x = Math.max(STICK_RADIUS + 8, e.clientX), y = Math.min(innerHeight - STICK_RADIUS - 8, Math.max(STICK_RADIUS + 8, e.clientY));
    this.move = { id: e.pointerId, x, y };
    this.base.classList.remove('idle');
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.moveDrag(e);
  }

  moveDrag(e) {
    if (!this.move || e.pointerId !== this.move.id) return;
    let dx = e.clientX - this.move.x, dy = e.clientY - this.move.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx *= STICK_RADIUS / len;
      dy *= STICK_RADIUS / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Small wiggles near the middle don't count; past that it's smooth all the way out.
    const k = Math.min(1, len / STICK_RADIUS);
    const scaled = k < DEAD_ZONE ? 0 : (k - DEAD_ZONE) / (1 - DEAD_ZONE);
    this.stick.x = len ? (dx / Math.max(len, 1e-6)) * scaled : 0;
    this.stick.y = len ? (-dy / Math.max(len, 1e-6)) * scaled : 0;
    this.stickKeys();
  }

  moveEnd(e) {
    if (!this.move || e.pointerId !== this.move.id) return;
    this.move = null;
    this.stick.x = this.stick.y = 0;
    this.base.classList.add('idle');
    this.base.style.left = this.base.style.top = '';
    this.knob.style.transform = '';
    this.stickKeys();
  }

  // The joystick also presses W A S D (for ladders, flying, cars and the helicopter), and
  // pushing it all the way runs (or boosts a car).
  stickKeys() {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftRight']) this.keys.delete(k);
    if (this.mode === 'ride') return;
    const { x, y } = this.stick, t = 0.35;
    if (y > t) this.keys.add('KeyW');
    if (y < -t) this.keys.add('KeyS');
    if (x > t) this.keys.add('KeyD');
    if (x < -t) this.keys.add('KeyA');
    const full = Math.hypot(x, y) > 0.95;
    if ((this.mode === 'walk' && full) || (this.mode === 'car' && y > 0.95)) this.keys.add('ShiftRight');
  }

  // ---------- Looking around ----------

  lookStart(e) {
    if (this.look) return;
    e.preventDefault();
    capture(e.currentTarget, e);
    this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: false };
  }

  lookDrag(e) {
    const l = this.look;
    if (!l || e.pointerId !== l.id) return;
    this.on.look?.(e.clientX - l.x, e.clientY - l.y);
    l.x = e.clientX;
    l.y = e.clientY;
    if (Math.hypot(l.x - l.x0, l.y - l.y0) > MOVE_SLOP) l.moved = true;
  }

  lookEnd(e) {
    const l = this.look;
    if (!l || e.pointerId !== l.id) return;
    this.look = null;
    if (!l.moved && !l.holding && performance.now() - l.t < TAP_TIME) this.on.tap?.();
  }

  // Every frame (after the game has read the keys): let go of released pads, and a finger
  // held still on the right side keeps using the item (hammering).
  update() {
    for (const k of this.releasing) this.keys.delete(k);
    this.releasing.clear();
    const l = this.look;
    if (l && !l.moved && performance.now() - l.t > HOLD_TIME) {
      l.holding = true;
      this.on.hold?.();
    }
  }
}
