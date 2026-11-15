// Playground games on the town square: Tag and Hide-and-seek. Coach Kai starts a round for
// everyone nearby; when there aren't many players, the town's kids (Max, Zoe and Ava) join in, so
// there are always at least three playing. The server runs it all: who's "it", tagging (by
// how close people are), the kids running about, finding hiders, and who wins.
import { NPC_ACT } from './npcs.js';

export const GAME_KINDS = ['tag', 'hide'];
const CENTER = [0.5, 0, 0.5]; // the town square
const JOIN_RADIUS = 40; // players this close to the coach join a new round
const ARENA = 26; // the kids stay this close to the square (in tag, and when seeking)
const TAG_TIME = 120, HIDE_TIME = 20, SEEK_TIME = 100; // seconds
const TAG_REACH = 1.5, FIND_REACH = 2.2, KID_SPOT = 6; // blocks
const NO_TAGBACKS = 3; // seconds before you can tag the one who tagged you
const MIN_PLAYING = 3;
const PRIZE = 3; // coins for a winner (people, not kids)
const KID_RUN = 6.3, KID_WALK = 3.2; // blocks a second (people walk at 6 and sprint at 9.5)

const pickOne = list => list[Math.floor(Math.random() * list.length)];
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export class Playground {
  constructor(room) {
    this.room = room;
    this.game = null; // { kind, phase, ids: [..], it / seeker, found: Set, left, timeAsIt: {id: s}, tagBack: {id, until} }
    this.syncT = 0;
  }

  get npcs() {
    return this.room.npcs;
  }

  kids() {
    return this.npcs.list.filter(n => n.def.kid);
  }

  // Where someone playing is: a player's position, or a kid's.
  posOf(id) {
    if (id < 0) return this.npcs.list.find(n => n.id === id)?.pos || null;
    const c = this.room.clients.get(id);
    return c?.joined ? c.pos : null;
  }

  nameOf(id) {
    if (id < 0) return this.npcs.list.find(n => n.id === id)?.def.name || '?';
    return this.room.clients.get(id)?.name || '?';
  }

  // Coach Kai: start a round (or join the one that's on).
  start(client, kind) {
    if (!GAME_KINDS.includes(kind)) return;
    const g = this.game;
    if (g) return this.join(client);
    const coach = this.npcs.list.find(n => n.def.coach);
    const at = coach?.pos || client.pos;
    const people = [...this.room.clients.values()].filter(c => c.joined && !c.car && c.pos && flat(c.pos, at) < JOIN_RADIUS).map(c => c.id);
    if (!people.includes(client.id)) people.push(client.id);
    const kids = this.kids().slice(0, Math.max(0, MIN_PLAYING - people.length));
    const ids = [...people, ...kids.map(k => k.id)];
    for (const k of kids) {
      k.game = { goal: null, think: 0 };
      k.goal = null;
      k.task = null;
    }
    this.game = { kind, ids, found: new Set(), timeAsIt: {}, tagBack: null, winners: null };
    if (kind === 'tag') {
      this.game.phase = 'play';
      this.game.left = TAG_TIME;
      this.game.it = pickOne(ids);
    } else {
      this.game.phase = 'hide';
      this.game.left = HIDE_TIME;
      this.game.seeker = pickOne(ids);
    }
    this.room.log(`${kind === 'tag' ? 'Tag' : 'Hide-and-seek'} started by ${client.name} (${ids.map(id => this.nameOf(id)).join(', ')})`);
    if (coach) this.npcs.say(coach, kind === 'tag' ? `TAG! ${this.nameOf(this.game.it)} is IT! Run! 🏃` : `Hide-and-seek! ${this.nameOf(this.game.seeker)} counts to 20. Everybody HIDE! 🙈`, true);
    this.send();
  }

  // Joining a round that's already on (not once the seeking has started).
  join(client) {
    const g = this.game;
    if (!g || g.ids.includes(client.id) || g.phase === 'seek' || g.phase === 'over') return this.send(client);
    g.ids.push(client.id);
    this.send();
  }

  // Someone left the game (or BuildZone).
  leave(id) {
    const g = this.game;
    if (!g || !g.ids.includes(id)) return;
    g.ids = g.ids.filter(i => i !== id);
    if (!g.ids.some(i => i > 0)) return this.end(true); // (no people left: stop)
    if (g.it === id) g.it = pickOne(g.ids);
    if (g.seeker === id) return this.finish();
    this.send();
  }

  // What everyone's screen needs to know (to everyone, or one player).
  send(to = null) {
    const g = this.game;
    const msg = g
      ? { t: 'game', kind: g.kind, phase: g.phase, ids: g.ids, it: g.it ?? null, seeker: g.seeker ?? null, found: [...g.found], left: Math.ceil(g.left), names: Object.fromEntries(g.ids.map(id => [id, this.nameOf(id)])), winners: g.winners }
      : { t: 'game', kind: null };
    if (to) to.send(msg);
    else this.room.broadcast(msg);
  }

  end(quiet = false) {
    for (const k of this.kids()) {
      k.game = null;
      k.goal = null;
      k.wait = 2 + Math.random() * 3;
    }
    this.game = null;
    if (!quiet) this.send();
    else this.room.broadcast({ t: 'game', kind: null });
  }

  // Time's up (or everyone's found): who won.
  finish() {
    const g = this.game;
    let winners;
    if (g.kind === 'tag') {
      const least = Math.min(...g.ids.map(id => g.timeAsIt[id] || 0));
      winners = g.ids.filter(id => (g.timeAsIt[id] || 0) === least);
    } else {
      const hiding = g.ids.filter(id => id !== g.seeker && !g.found.has(id));
      winners = hiding.length ? hiding : [g.seeker];
    }
    g.phase = 'over';
    g.left = 6;
    g.winners = winners.map(id => this.nameOf(id));
    for (const id of winners) {
      if (id > 0) {
        const c = this.room.clients.get(id);
        if (c) {
          this.room.wallet(c).coins += PRIZE;
          this.room.sendWallet(c);
        }
      } else {
        const k = this.npcs.list.find(n => n.id === id);
        if (k) this.npcs.act(k, NPC_ACT.cheer, 3);
      }
    }
    const coach = this.npcs.list.find(n => n.def.coach);
    if (coach) this.npcs.say(coach, `🏆 ${g.winners.join(' & ')}! Great game, everybody! 🎉`, true);
    this.room.onDirty();
    this.send();
  }

  // ---------- Every tick ----------

  update(dt) {
    const g = this.game;
    if (!g) return;
    g.left -= dt;
    this.syncT -= dt;
    if (g.phase === 'over') {
      if (g.left <= 0) this.end();
      this.moveKids(dt);
      return;
    }
    if (g.kind === 'tag') this.updateTag(dt);
    else this.updateHide(dt);
    if (!this.game) return;
    this.moveKids(dt);
    if (this.syncT <= 0) {
      this.syncT = 5; // (everyone's countdown, kept in step)
      this.send();
    }
  }

  updateTag(dt) {
    const g = this.game;
    g.timeAsIt[g.it] = (g.timeAsIt[g.it] || 0) + dt;
    if (g.left <= 0) return this.finish();
    const itPos = this.posOf(g.it);
    if (!itPos) return;
    for (const id of g.ids) {
      if (id === g.it || (g.tagBack && g.tagBack.id === id && g.left > g.tagBack.until)) continue;
      const p = this.posOf(id);
      if (!p || flat(p, itPos) > TAG_REACH || Math.abs(p[1] - itPos[1]) > 2) continue;
      // Tagged! Now they're it (and can't tag straight back).
      g.tagBack = { id: g.it, until: g.left - NO_TAGBACKS };
      g.it = id;
      const k = this.npcs.list.find(n => n.id === id);
      if (k) this.npcs.say(k, pickOne(['Aww! I\'m IT! 😆', 'You got me! 👉', 'Here I come! 🏃']), true);
      this.room.broadcast({ t: 'game_tag', it: id, by: g.tagBack.id });
      this.send();
      return;
    }
  }

  updateHide(dt) {
    const g = this.game;
    if (g.phase === 'hide') {
      if (g.left <= 0) {
        g.phase = 'seek';
        g.left = SEEK_TIME;
        const k = this.npcs.list.find(n => n.id === g.seeker);
        if (k) this.npcs.say(k, 'Ready or not, here I come! 👀', true);
        this.send();
      }
      return;
    }
    if (g.left <= 0) return this.finish();
    const seekerPos = this.posOf(g.seeker);
    if (!seekerPos) return;
    for (const id of g.ids) {
      if (id === g.seeker || g.found.has(id)) continue;
      const p = this.posOf(id);
      if (!p || flat(p, seekerPos) > FIND_REACH || Math.abs(p[1] - seekerPos[1]) > 2.5) continue;
      g.found.add(id);
      const k = this.npcs.list.find(n => n.id === id);
      if (k) {
        this.npcs.say(k, pickOne(['You found me! 😆', 'Aww, how did you see me? 🙈', 'Good finding! 👀']), true);
        k.game.goal = null;
      }
      this.room.broadcast({ t: 'game_found', id, by: g.seeker });
      if (g.ids.every(i => i === g.seeker || g.found.has(i))) return this.finish();
      this.send();
    }
  }

  // ---------- The kids ----------

  moveKids(dt) {
    const g = this.game;
    for (const k of this.kids()) {
      if (!k.game) continue;
      const plan = g.phase === 'over' ? null : g.kind === 'tag' ? this.tagPlan(k, dt) : this.hidePlan(k, dt);
      if (!plan) {
        k.action = k.actionT > 0 ? k.action : NPC_ACT.idle;
        continue;
      }
      this.steer(k, plan.to, plan.speed, dt);
    }
  }

  // Tag: whoever's it chases the nearest player (not the one who just tagged them); the rest
  // run away from it when it comes close, and otherwise play about.
  tagPlan(k, dt) {
    const g = this.game;
    if (g.it === k.id) {
      let best = null, bestD = Infinity;
      for (const id of g.ids) {
        if (id === k.id || (g.tagBack && g.tagBack.id === id && g.left > g.tagBack.until)) continue;
        const p = this.posOf(id);
        const d = p ? flat(p, k.pos) : Infinity;
        if (d < bestD) [best, bestD] = [p, d];
      }
      return best ? { to: best, speed: KID_RUN } : null;
    }
    const itPos = this.posOf(g.it);
    if (itPos && flat(itPos, k.pos) < 9) {
      // Run! (Away from it, and back toward the square if we're getting far.)
      let ax = k.pos[0] - itPos[0], az = k.pos[2] - itPos[2];
      const d = Math.hypot(ax, az) || 1;
      ax /= d;
      az /= d;
      const home = flat(k.pos, CENTER);
      if (home > ARENA * 0.7) {
        ax += (CENTER[0] - k.pos[0]) / home;
        az += (CENTER[2] - k.pos[2]) / home;
      }
      return { to: [k.pos[0] + ax * 4, k.pos[1], k.pos[2] + az * 4], speed: KID_RUN * 0.92 };
    }
    return this.roam(k, dt, KID_WALK);
  }

  // Hide-and-seek: hiders find a spot tucked in behind something and stay there; a kid who's
  // seeking covers their eyes and counts, then looks about (and gets warmer as time goes on).
  hidePlan(k, dt) {
    const g = this.game;
    if (g.seeker === k.id) {
      if (g.phase === 'hide') {
        if (Math.random() < dt * 0.25) this.npcs.say(k, `${Math.max(1, Math.ceil(HIDE_TIME - g.left))}... 🙈`);
        return null;
      }
      // Anyone close by and in plain sight? Go and get them. Later on, head for the nearest.
      const hiders = g.ids.filter(id => id !== k.id && !g.found.has(id)).map(id => this.posOf(id)).filter(Boolean);
      const seen = hiders.filter(p => flat(p, k.pos) < KID_SPOT && this.npcs.clearLine(k.pos, [p[0], k.pos[1], p[2]], k.def));
      const warm = g.left < SEEK_TIME * 0.55;
      const target = seen[0] || (warm && hiders.sort((a, b) => flat(a, k.pos) - flat(b, k.pos))[0]);
      if (target) return { to: target, speed: KID_RUN * 0.8 };
      return this.roam(k, dt, KID_WALK * 1.4, ARENA);
    }
    if (g.found.has(k.id)) return this.roam(k, dt, KID_WALK, 6); // (found: wander back to the square)
    if (!k.game.spot) k.game.spot = this.hidingSpot(k);
    if (!k.game.spot) return this.roam(k, dt, KID_WALK);
    if (flat(k.pos, k.game.spot) < 0.3) return null; // (hiding: shh!)
    return { to: k.game.spot, speed: g.phase === 'hide' ? KID_RUN * 0.85 : KID_WALK };
  }

  // Somewhere to hide: a spot with walls (or trees, or anything) round it, out from the square,
  // that we can run straight to.
  hidingSpot(k) {
    let best = null, bestScore = 0;
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 18;
      const x = Math.floor(CENTER[0] + Math.cos(a) * r), z = Math.floor(CENTER[2] + Math.sin(a) * r);
      if (!this.npcs.standable(x, 0, z, k.def)) continue;
      let cover = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (this.npcs.solid(x + dx, 0, z + dz) || this.npcs.solid(x + dx, 1, z + dz)) cover++;
      }
      const spot = [x + 0.5, 0, z + 0.5];
      if (cover < 2 || !this.npcs.clearLine(k.pos, spot, k.def)) continue;
      const score = cover + Math.random() * 2;
      if (score > bestScore) [best, bestScore] = [spot, score];
    }
    return best;
  }

  // Playing about: off to somewhere nearby, now and then.
  roam(k, dt, speed, radius = 12) {
    k.game.think -= dt;
    if (!k.game.goal || k.game.think <= 0 || flat(k.pos, k.game.goal) < 0.4) {
      k.game.think = 2 + Math.random() * 3;
      k.game.goal = null;
      for (let i = 0; i < 10 && !k.game.goal; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
        const spot = [Math.floor(CENTER[0] + Math.cos(a) * r) + 0.5, 0, Math.floor(CENTER[2] + Math.sin(a) * r) + 0.5];
        if (this.npcs.standable(Math.floor(spot[0]), 0, Math.floor(spot[2]), k.def) && this.npcs.clearLine(k.pos, spot, k.def)) k.game.goal = spot;
      }
    }
    return k.game.goal ? { to: k.game.goal, speed } : null;
  }

  // A step toward `to` (round anything in the way), on the ground, near the square.
  steer(k, to, speed, dt) {
    const dx = to[0] - k.pos[0], dz = to[2] - k.pos[2], d = Math.hypot(dx, dz);
    if (d < 0.2) {
      k.action = NPC_ACT.idle;
      return;
    }
    const step = Math.min(d, speed * dt);
    const base = Math.atan2(dz, dx);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = base + off;
      const next = [k.pos[0] + Math.cos(a) * step, k.pos[1], k.pos[2] + Math.sin(a) * step];
      if (flat(next, CENTER) > ARENA + 4 && flat(next, CENTER) > flat(k.pos, CENTER)) continue; // (not too far from the square)
      if (!this.npcs.standable(Math.floor(next[0]), k.pos[1], Math.floor(next[2]), k.def)) continue;
      k.pos = next;
      k.yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
      k.action = NPC_ACT.walk;
      return;
    }
    k.action = NPC_ACT.idle;
    if (k.game) k.game.goal = null; // (stuck: try somewhere else)
  }
}
