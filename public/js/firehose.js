// The fire truck's hose, and the fires in town (since v0.54). A fire truck with its hose on
// (G twice: 🚨 then 💦) sprays a jet of water ahead of it; the driver's game tells the server
// what it's hitting (a fire, a burning vehicle, a crashed airplane), a few squirts a second.
// Fires burn on roads in town (just flames and smoke: nothing really burns). When one starts the
// alarm rings, and a 🔥 arrow at the top of the screen points the way.
import { HOSE_RANGE } from './shared/firestation.js';
import { FIRE_HP } from './shared/vehicles.js';

const NOZZLE = [0, 2.55, -2.1]; // (where the water comes out, on the truck: see cars.js)

export class FireHose {
  constructor({ effects, sounds, net, hud }) {
    Object.assign(this, { effects, sounds, net, hud });
    this.fires = [];
    this.squirt = 0;
    this.chip = document.createElement('div');
    this.chip.className = 'fire-chip';
    Object.assign(this.chip.style, {
      position: 'fixed', top: '112px', left: '50%', transform: 'translateX(-50%)', padding: '4px 12px', borderRadius: '16px',
      background: 'rgba(211, 47, 47, 0.85)', color: '#fff', font: 'bold 18px system-ui, sans-serif', display: 'none', pointerEvents: 'none', zIndex: 5,
    });
    this.chip.innerHTML = '🔥 <span class="arrow" style="display:inline-block">⬆</span> <span class="dist"></span>';
    document.body.appendChild(this.chip);
  }

  setFires(list) {
    this.fires = (list || []).map(f => ({ ...f }));
  }

  fireHp(id, hp) {
    const f = this.fires.find(o => o.id === id);
    if (f) f.hp = hp;
  }

  // The alarm! (A bell ringing, and the arrow points the way.)
  alarm() {
    for (let i = 0; i < 10; i++) this.sounds.tone(1400, 1350, 0.07, 0.12, 'square', i * 0.13);
    this.hud.toast('🚨🔥🚒');
  }

  // Each frame: flames and smoke on the fires near you, the water from every fire truck with its
  // hose on, and (if you're driving one) what your hose is hitting.
  update(dt, viewer, yaw, cars, myCar, perks, wrecks) {
    let nearest = null, nd = Infinity;
    for (const f of this.fires) {
      const d = Math.hypot(f.x - viewer.x, f.z - viewer.z);
      if (d < nd) [nearest, nd] = [f, d];
      if (d > 200) continue;
      const k = Math.max(0.25, f.hp / 100);
      for (let n = dt * 40 * k; n > 0; n--) if (n >= 1 || Math.random() < n) this.effects.flame(f.x + (Math.random() - 0.5) * 2.2, 0.1, f.z + (Math.random() - 0.5) * 2.2, 1.6 * k + 0.4);
      if (Math.random() < dt * 5) this.effects.smokePuff(f.x, 1.5 + Math.random(), f.z, 0.8);
    }
    // The arrow to the nearest fire (unless you're right there).
    this.chip.style.display = nearest && nd > 12 ? 'block' : 'none';
    if (nearest && nd > 12) {
      const a = Math.atan2(-(nearest.x - viewer.x), -(nearest.z - viewer.z)) - yaw;
      this.chip.querySelector('.arrow').style.transform = `rotate(${-a}rad)`;
      this.chip.querySelector('.dist').textContent = `${Math.round(nd)}`;
    }
    // Water from every fire truck with its hose on.
    for (const car of cars) {
      if (car.kind !== 'firetruck' || car.siren !== 2) continue;
      if (Math.hypot(car.pos.x - viewer.x, car.pos.z - viewer.z) > 160) continue;
      const fwd = [-Math.sin(car.h), -Math.cos(car.h)], right = [Math.cos(car.h), -Math.sin(car.h)];
      const x = car.pos.x + right[0] * NOZZLE[0] + fwd[0] * -NOZZLE[2], z = car.pos.z + right[1] * NOZZLE[0] + fwd[1] * -NOZZLE[2], y = car.pos.y + NOZZLE[1];
      const far = car === myCar && perks?.has('fire') ? 1.25 : 1;
      for (let i = 0; i < 6; i++) {
        const sp = (11 + Math.random() * 2) * far, wob = (Math.random() - 0.5) * 0.6;
        // (Blue droplets that show up in the sunshine, and a glint of light among them.)
        const o = { x, y, z, vx: fwd[0] * sp + right[0] * wob, vy: 3.8 + Math.random() * 0.8, vz: fwd[1] * sp + right[1] * wob, life: 1.5, gravity: 9 };
        this.effects.smoke.spawn({ ...o, size: 0.32, grow: 0.5, color: [0.35, 0.62, 0.95], alpha: 0.85, drag: 0 });
        if (i % 2) this.effects.glow.spawn({ ...o, size: 0.2, color: [0.6, 0.85, 1], alpha: 0.8 });
      }
      if (Math.random() < dt * 8) this.effects.smoke.spawn({ x: x + fwd[0] * HOSE_RANGE * far, y: 0.4, z: z + fwd[1] * HOSE_RANGE * far, vx: 0, vy: 0.6, vz: 0, life: 1, size: 0.6, grow: 1.5, color: [0.85, 0.92, 1], alpha: 0.5, drag: 2 });
    }
    // Your own hose: what's it hitting? (A few squirts a second; the server checks.)
    this.squirt -= dt;
    if (!myCar || myCar.kind !== 'firetruck' || myCar.siren !== 2 || this.squirt > 0) return;
    this.squirt = 0.25;
    const reach = HOSE_RANGE * (perks?.has('fire') ? 1.5 : 1) + 3;
    const fwd = [-Math.sin(myCar.h), -Math.cos(myCar.h)];
    const inJet = (px, pz) => {
      const dx = px - myCar.pos.x, dz = pz - myCar.pos.z, along = dx * fwd[0] + dz * fwd[1], side = Math.abs(dx * fwd[1] - dz * fwd[0]);
      return along > 2 && along < reach && side < 3 + along * 0.12;
    };
    for (const f of this.fires) if (inJet(f.x, f.z)) return this.net.send({ t: 'douse', fire: f.id });
    for (const car of cars) if (car !== myCar && car.hp < FIRE_HP && inJet(car.pos.x, car.pos.z)) return this.net.send({ t: 'douse', id: car.id });
    for (const w of wrecks) if (inJet(w.x, w.z)) return this.net.send({ t: 'douse', x: w.x, z: w.z });
  }
}

// Spray from the hose, put to use: a puff of steam where a fire went out.
export function steam(effects, x, y, z) {
  for (let i = 0; i < 14; i++) effects.smoke.spawn({ x: x + (Math.random() - 0.5) * 2, y: y + Math.random(), z: z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5), vy: 1.5 + Math.random(), vz: (Math.random() - 0.5), life: 2.2, size: 0.8, grow: 1.6, color: [0.95, 0.95, 0.95], alpha: 0.7, drag: 0.6 });
  effects.sparkle(x, y + 1, z, 16);
}
