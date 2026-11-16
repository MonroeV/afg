// Someone's bodyguards keeping you off their land (when you're not on their guest list). No
// teleporting: what happens depends on how you got in.
//  - On foot: a whistle and "HALT!", and a bodyguard comes running (the server runs them: see
//    catchIntruder in npcs.js). Run if you like: they're always a good bit faster than you, and
//    when they catch you they walk you off the land (out through the doors and down the stairs).
//    Get back off the land first and that's that, no fuss. (Can't get to you? They shoo you off.)
//  - From above (flying, a jetpack, a balloon, up on a roof): they huff and puff and BLOW you away.
//  - Driving: a stop sign, and your vehicle's pushed back out.
//  - Tunnelling underneath: they hear the digging and flush you out with a bucket of water.
// Whoever's watching sees it too: you're moved for real, and the guards are where they are.
const ESCORT_SPEED = 3; // (the same as the guard walking beside you: see guardChase)
const FAILSAFE = 15; // seconds of being chased with no word from the server: shoo
const COOLDOWN = 2;

export class GuardCatch {
  // agency: knows whose land is guarded (keptOut). splash(): the screen goes splashy.
  constructor({ agency, player, hud, sounds, effects, net, shout, splash }) {
    Object.assign(this, { agency, player, hud, sounds, effects, net, shout, splash });
    this.state = null;
    this.cooldown = 0;
  }

  // Can't walk about just now (being walked off, or blown away). (Being chased, you can run!)
  get frozen() {
    return !!this.state && this.state.kind !== 'car' && this.state.kind !== 'chase';
  }

  // Where you go to be off the land: just past the nearest edge (and `extra` further on).
  exit(land, p, extra = 0) {
    const [x0, z0, x1, z1] = land.rect;
    const ways = [[x0 - 1.5 - extra, p.z, p.x - x0], [x1 + 2.5 + extra, p.z, x1 + 1 - p.x], [p.x, z0 - 1.5 - extra, p.z - z0], [p.x, z1 + 2.5 + extra, z1 + 1 - p.z]];
    return ways.sort((a, b) => a[2] - b[2]).map(([x, z]) => ({ x, z }));
  }

  // Never left inside something: up a bit, or another way out.
  settle(land) {
    const p = this.player.pos;
    if (!this.player.overlapsSomething()) return;
    for (const w of this.exit(land, p).slice(1)) {
      const [x, z] = [p.x, p.z];
      p.x = w.x;
      p.z = w.z;
      if (!this.player.overlapsSomething()) return;
      [p.x, p.z] = [x, z];
    }
    for (let i = 0; i < 70 && this.player.overlapsSomething(); i++) p.y = Math.floor(p.y) + 1;
  }

  // Every frame, after you've moved. ride: { driving: your vehicle (if you're driving), busy:
  // in an elevator, the RV, a bed or a seat, or a passenger }.
  frame(dt, { driving = null, busy = false } = {}) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const s = this.state;
    if (s) return this.play(s, dt);
    if (this.cooldown > 0 || (busy && !driving)) return;
    const p = driving ? driving.pos : this.player.pos;
    const land = this.agency.keptOut(p.x, p.z);
    if (!land || p.y > 60) return;
    const how = driving ? 'car' : p.y < -0.5 ? 'tunnel' : !this.player.onGround || this.player.flying || p.y > 1.3 ? 'air' : 'foot';
    this.net.send({ t: 'intrude', key: land.key, how });
    if (how === 'foot') {
      this.state = { kind: 'chase', land, t: 0, resend: 2.5 };
      this.sounds.tone(2600, 2400, 0.25, 0.2, 'square');
      this.sounds.tone(2600, 2400, 0.35, 0.2, 'square', 0.32); // (the whistle: tweet-tweeeet!)
      this.shout('🛑 HALT!');
    } else if (how === 'air') {
      const to = this.exit(land, p, 3)[0];
      this.state = { kind: 'wind', land, t: 0, from: p.clone(), to: { x: to.x, y: p.y + 2.5, z: to.z } };
      this.sounds.whoosh();
      this.shout('💨💨💨');
    } else if (how === 'car') {
      const to = this.exit(land, p, 2.5)[0];
      this.state = { kind: 'car', land, t: 0, car: driving, from: p.clone(), to };
      this.sounds.tone(500, 300, 0.3, 0.2, 'square');
      this.shout('🚧 STOP!');
    } else {
      this.state = { kind: 'flush', land, t: 0 };
      this.splash();
      this.shout('🪣💦');
    }
  }

  // A bodyguard caught you: they walk you off, along `path` (the way out: [x, y, z] each).
  caught({ path, gentle }) {
    if (this.state?.kind !== 'chase' || !Array.isArray(path) || !path.length) return;
    this.state = { kind: 'escort', land: this.state.land, path: path.map(([x, y, z]) => ({ x, y, z })), i: 0, gentle, t: 0 };
    this.player.vel.set(0, 0, 0);
    this.shout(gentle ? '🕶️👋' : '🛡️ GOTCHA!');
  }

  // They couldn't get to you: off you go anyway (quick, with a puff of dust).
  shoo() {
    if (this.state?.kind !== 'chase') return;
    this.startSlide(this.state.land);
  }

  // The bodyguard's happy we're off the land again (we got off before they caught us).
  release() {
    if (this.state?.kind !== 'chase') return;
    this.state = null;
    this.cooldown = COOLDOWN;
    this.shout('👍');
  }

  startSlide(land) {
    const p = this.player.pos, to = this.exit(land, p)[0];
    this.state = { kind: 'slide', land, from: p.clone(), to: { x: to.x, y: p.y, z: to.z }, t: 0 };
    this.sounds.whoosh();
  }

  done(text) {
    const land = this.state.land;
    this.state = null;
    this.cooldown = COOLDOWN;
    this.player.vel.set(0, 0, 0);
    this.settle(land);
    this.hud.toast(text);
  }

  play(s, dt) {
    const pl = this.player, p = pl.pos;
    s.t += dt;
    if (s.kind === 'chase') {
      // Run! (A bodyguard's coming, much faster than you.) Off the land again: no fuss.
      if (!this.agency.keptOut(p.x, p.z) || p.y < -0.5) {
        this.net.send({ t: 'intrude_off', key: s.land.key });
        return this.release();
      }
      if (s.t > s.resend) {
        // (No word yet: the server might not have known where we were. Tell it again.)
        s.resend += 2.5;
        this.net.send({ t: 'intrude', key: s.land.key, how: 'foot' });
      }
      if (s.t > FAILSAFE) this.startSlide(s.land);
    } else if (s.kind === 'escort') {
      // Walked along the way out, a spot at a time (through doors, down stairs).
      pl.vel.set(0, 0, 0);
      let left = ESCORT_SPEED * dt;
      while (left > 0 && s.i < s.path.length) {
        const to = s.path[s.i], dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
        if (d <= left) {
          p.x = to.x;
          p.z = to.z;
          p.y = to.y;
          left -= d;
          s.i++;
          continue;
        }
        p.x += (dx / d) * left;
        p.z += (dz / d) * left;
        p.y += (to.y - p.y) * Math.min(1, left / Math.max(d, 0.01));
        left = 0;
      }
      if (s.i >= s.path.length || s.t > 25) {
        const end = s.path.at(-1);
        p.set(end.x, Math.max(p.y, end.y), end.z);
        return this.done(s.gentle ? `🛡️ Time's up on ${s.land.owner}'s land. Bye for now! 👋` : `🛡️ The bodyguards walked you off ${s.land.owner}'s land. Guests only! (🔔 Right-click a bodyguard to ask to come in.)`);
      }
    } else if (s.kind === 'slide') {
      const k = Math.min(1, s.t / 0.5);
      p.x = s.from.x + (s.to.x - s.from.x) * k;
      p.z = s.from.z + (s.to.z - s.from.z) * k;
      pl.vel.set(0, 0, 0);
      if (Math.random() < 0.5) this.effects.powder(p.x, p.y + 0.1, p.z, 0.6);
      if (k >= 1) this.done(`👋 SHOO! ${s.land.owner}'s bodyguards chased you off. Guests only! (🔔 Ask a bodyguard to let you in.)`);
    } else if (s.kind === 'wind') {
      // Swept up and away on a big gust (easing out), with puffs of wind behind.
      const k = Math.min(1, s.t / 0.9), e = 1 - (1 - k) ** 3;
      p.x = s.from.x + (s.to.x - s.from.x) * e;
      p.z = s.from.z + (s.to.z - s.from.z) * e;
      p.y = s.from.y + (s.to.y - s.from.y) * e + Math.sin(k * Math.PI) * 1.2;
      pl.vel.set(0, 0, 0);
      this.effects.powder(p.x, p.y + 0.6, p.z, 0.8);
      if (k >= 1) {
        const dx = s.to.x - s.from.x, dz = s.to.z - s.from.z, d = Math.hypot(dx, dz) || 1;
        this.done(`💨 ${s.land.owner}'s bodyguards huffed and puffed and BLEW you off their land! (🔔 Ask a bodyguard to let you in.)`);
        pl.vel.set((dx / d) * 4, 2, (dz / d) * 4); // (still drifting a bit)
      }
    } else if (s.kind === 'car') {
      // Pushed back out, and stopped.
      const car = s.car, k = Math.min(1, s.t / 0.6), e = 1 - (1 - k) ** 2;
      car.pos.x = s.from.x + (s.to.x - s.from.x) * e;
      car.pos.z = s.from.z + (s.to.z - s.from.z) * e;
      car.speed = 0;
      car.push?.set(0, 0, 0);
      car.vel?.set(0, 0, 0);
      if (k >= 1) {
        this.state = null;
        this.cooldown = COOLDOWN;
        this.hud.toast(`🚧 STOP! No vehicles on ${s.land.owner}'s land, say the bodyguards. (🔔 Ask a bodyguard to let you in.)`);
      }
    } else if (s.kind === 'flush') {
      // Water everywhere, then you pop up out of the ground, just off the land.
      pl.vel.set(0, 0, 0);
      if (s.t > 0.6) {
        const to = this.exit(s.land, p)[0];
        p.set(to.x, 0, to.z);
        this.effects.splash(p.x, 0.2, p.z);
        this.done(`🪣💦 ${s.land.owner}'s bodyguards heard digging and FLUSHED you out of the tunnel!`);
      }
    }
  }
}
