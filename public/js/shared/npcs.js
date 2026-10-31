// The town's people who aren't players: Penny at the Luxe Store, Rex at the tower's
// reception desk and Mayor Maple on the town square. The server runs them (in the room), so
// everyone sees them do the same things. They wander about a little, say hello when you
// come near, pet your pet, love your cool stuff, and react to fireworks, explosions,
// dancing and water balloons.
import { sanitizeLook } from './avatar.js';
import { BLOCKS, isSolidBlock, blockId, itemOf, SHOP_TOOLS } from './blocks.js';

export const NPC_ACT = { idle: 0, walk: 1, wave: 2, dance: 3, pet: 4, cheer: 5 };

const pickOne = list => list[Math.floor(Math.random() * list.length)];

const NPCS = [
  {
    id: -1, place: 'store', name: 'Penny', title: 'Penny 🛍️', roam: 2.5,
    look: { face: 'grin', hair: 'ponytail', shirt: 'dress', pants: 'skirt', skin: '#f5c9a0', hairColor: '#c23b22', shirtColor: '#ec407a', shirtColor2: '#ffffff', pantsColor: '#ec407a', shoesColor: '#111111' },
    hello: n => [`Hi ${n}! Welcome to the Luxe Store! ✨`, `Hello again, ${n}! Got coins to spend? 🪙`, `${n}! Come and see our shiny things!`],
    tips: ['Right-click me (or the cash register) to see what\'s for sale! 🛍️', 'The Jetpack is our most popular item! 🚀', 'Everything here is one of a kind. Well, almost! ✨'],
  },
  {
    id: -2, place: 'tower', name: 'Rex', title: 'Rex 💼', roam: 2,
    look: { face: 'cool', hair: 'short', shirt: 'jacket', pants: 'jeans', skin: '#8d5a34', hairColor: '#1b1209', shirtColor: '#424242', shirtColor2: '#ffffff', pantsColor: '#111111', shoesColor: '#111111' },
    hello: n => [`Welcome to the tower, ${n}! 💼`, `Hi ${n}! The penthouse is at the top. Take the ladder!`, `Good to see you, ${n}!`],
    tips: ['Every floor has offices. The top floor has a grand piano! 🎹', 'The ladder in the corner goes all the way up to the roof.', 'You can sit in the office chairs. Very comfy!'],
  },
  {
    id: -3, place: 'plaza', name: 'Mayor Maple', title: 'Mayor Maple 🎩', roam: 7,
    look: { face: 'smile', hair: 'none', hat: 'tophat', shirt: 'jacket', pants: 'jeans', skin: '#e8b088', hatColor: '#111111', shirtColor: '#6d4c41', shirtColor2: '#ffd54f', pantsColor: '#424242', shoesColor: '#111111' },
    hello: n => [`Hello ${n}! Welcome to town! 🎩`, `Lovely day, ${n}! Have you found the gold coins yet?`, `${n}! Have you been to the Luxe Store? It's fabulous!`],
    tips: ['Gold coins pop up all over town. Walk into them to collect them! 🪙', 'Win a race and you get 3 coins! 🏁', 'You get 10 coins every day just for visiting!', 'Spend your coins at the Luxe Store by the road out of town!'],
  },
];

// Things players hold that the town's people just have to comment on.
const COOL = {
  fireworks: 'Ooh, fireworks! Light one up! 🎆', balloon: 'What a pretty balloon! 🎈', waterballoon: "Don't you dare splash me with that! 😆",
  bubbles: 'Bubbles! I love bubbles! 🫧', jetpack: "A JETPACK?! That's the coolest thing ever! 🚀", trail: 'Ooh, sparkly! ✨',
  showtime: 'A whole fireworks show? Can I watch? 🎇', camera: 'Say cheese! 📸', ball: 'Playing fetch? 🎾',
  82: 'Is that a real diamond?! 💎', 83: 'A throne fit for a king! 👑', 84: 'Party time! 🪩', 85: "A golden trophy! You're a champion! 🏆",
  wrench: 'A wrench! Are you a mechanic? 🔧', 68: 'Aww, a teddy bear! 🧸', 79: 'A grand piano! Can you play it? 🎹',
};
const PET_WORDS = { dog: 'puppy', cat: 'kitty', bunny: 'bunny', pig: 'piggy', dragon: 'dragon' };

const SECOND = 1000;

export class NpcCrew {
  constructor(room) {
    this.room = room;
    this.list = [];
    this.clock = 0;
  }

  // Puts everyone where they work (if that place is in this world).
  setup(places) {
    this.list = [];
    for (const def of NPCS) {
      const place = def.place === 'plaza' ? { x: 4.5, y: 0, z: 6.5, face: 0, area: [-7, -7, 7, 7] } : places?.[def.place];
      if (!place) continue;
      const home = this.findStand(place.x, place.y ?? 0, place.z) || [place.x, place.y ?? 0, place.z];
      this.list.push({
        def, id: def.id, home, area: place.area, face: place.face ?? 0,
        pos: home.slice(), yaw: place.face ?? 0, goal: null, wait: 2 + Math.random() * 4,
        action: NPC_ACT.idle, actionT: 0, saidAt: 0, look: sanitizeLook(def.look),
        seen: new Map(), // client id -> when we last said hello
        noticed: new Map(), // "client id:item" -> when we last said something about it
        petted: new Map(), // client id -> when we last petted their pet
        task: null, // what we're busy with: walking over to pet a pet
      });
    }
  }

  info() {
    return this.list.map(n => ({ id: n.id, name: n.def.title, look: n.look }));
  }

  states() {
    const r = v => Math.round(v * 100) / 100;
    return this.list.map(n => [n.id, r(n.pos[0]), r(n.pos[1]), r(n.pos[2]), r(n.yaw), n.action]);
  }

  // ---------- Where they can walk ----------

  solid(x, y, z) {
    return y < 0 || isSolidBlock(itemOf(this.room.get(x, y, z)));
  }

  standable(x, y, z) {
    const v = this.room.get(x, y, z);
    return !this.solid(x, y, z) && !this.solid(x, y + 1, z) && this.solid(x, y - 1, z) && blockId(itemOf(v)) !== 36 && blockId(v >> 16) !== 36;
  }

  // The nearest spot to stand on, near (x, y, z).
  findStand(x, y, z) {
    for (let r = 0; r <= 3; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
          if (this.standable(cx, y, cz)) return [cx + 0.5, y, cz + 0.5];
        }
    return null;
  }

  // Can we walk in a straight line from a to b (on one level)?
  clearLine(a, b) {
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]), steps = Math.ceil(d / 0.3);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.standable(Math.floor(a[0] + (b[0] - a[0]) * t), a[1], Math.floor(a[2] + (b[2] - a[2]) * t))) return false;
    }
    return true;
  }

  // ---------- Talking ----------

  say(n, text, force = false) {
    const now = Date.now();
    if (!force && now - n.saidAt < 2.5 * SECOND) return false;
    n.saidAt = now;
    this.room.broadcast({ t: 'npc_say', id: n.id, text });
    return true;
  }

  act(n, action, seconds) {
    n.action = action;
    n.actionT = seconds;
  }

  face(n, x, z) {
    n.yaw = Math.atan2(-(x - n.pos[0]), -(z - n.pos[2]));
  }

  near(n, x, y, z, r) {
    return Math.abs(y - n.pos[1]) < 4 && Math.hypot(x - n.pos[0], z - n.pos[2]) < r;
  }

  // ---------- Every tick ----------

  update(dt) {
    if (!this.list.length) return;
    const now = Date.now();
    const players = [...this.room.clients.values()].filter(c => c.joined && !c.car);
    for (const n of this.list) {
      n.actionT -= dt;
      if (n.actionT <= 0 && n.action !== NPC_ACT.walk) n.action = NPC_ACT.idle;
      this.notice(n, players, now);
      this.move(n, dt, players);
    }
  }

  // Say hello, admire things, go and pet pets.
  notice(n, players, now) {
    if (n.task || n.actionT > 0) return;
    for (const c of players) {
      const [x, y, z] = c.pos;
      if (!this.near(n, x, y, z, 5)) continue;
      if (now - (n.seen.get(c.id) || 0) > 120 * SECOND) {
        n.seen.set(c.id, now);
        this.face(n, x, z);
        this.act(n, NPC_ACT.wave, 2);
        this.say(n, pickOne(n.def.hello(c.name)), true);
        return;
      }
      const hold = c.hold;
      const line = COOL[hold];
      const key = `${c.id}:${hold}`;
      if (line && now - (n.noticed.get(key) || 0) > 180 * SECOND && this.near(n, x, y, z, 6)) {
        n.noticed.set(key, now);
        this.face(n, x, z);
        this.act(n, NPC_ACT.cheer, 1.5);
        this.say(n, line);
        return;
      }
      // A pet! Go over and give it a pat.
      const pet = Array.isArray(c.pet) ? c.pet : null;
      if (pet && c.look?.pet !== 'none' && now - (n.petted.get(c.id) || 0) > 75 * SECOND && this.near(n, pet[0], pet[1], pet[2], 7)) {
        n.petted.set(c.id, now);
        n.task = { kind: 'pet', client: c.id, until: now + 8 * SECOND };
        return;
      }
    }
  }

  move(n, dt, players) {
    const now = Date.now();
    let target = null;
    if (n.task?.kind === 'pet') {
      const c = this.room.clients.get(n.task.client);
      const pet = c && Array.isArray(c.pet) ? c.pet : null;
      if (!pet || now > n.task.until) {
        n.task = null;
      } else {
        const d = Math.hypot(pet[0] - n.pos[0], pet[2] - n.pos[2]);
        if (d < 1.1) {
          // Crouch down and give it a pat.
          this.face(n, pet[0], pet[2]);
          this.act(n, NPC_ACT.pet, 2.5);
          const kind = c.look?.pet || 'dog';
          this.say(n, kind === 'dragon' ? 'A baby dragon?! How amazing! 🐉' : pickOne([`Aww, what a cute ${PET_WORDS[kind] || kind}! 🐾`, `Who's a good ${PET_WORDS[kind] || kind}? You are! 💕`, `Hello, little ${PET_WORDS[kind] || kind}! 🐾`]), true);
          this.room.broadcast({ t: 'fx', kind: 'hearts', x: pet[0], y: pet[1] + 0.6, z: pet[2], color: '#ffffff', seed: 0 });
          c.send({ t: 'npc_pet' });
          n.task = null;
          n.goal = null;
          return;
        }
        target = [pet[0] - ((pet[0] - n.pos[0]) / d) * 0.8, n.pos[1], pet[2] - ((pet[2] - n.pos[2]) / d) * 0.8];
      }
    }
    if (n.actionT > 0 && n.action !== NPC_ACT.walk) return; // busy waving, dancing, petting
    if (!target) {
      if (!n.goal) {
        n.wait -= dt;
        // Standing about: look at whoever is nearby.
        const c = players.find(p => this.near(n, p.pos[0], p.pos[1], p.pos[2], 6));
        if (c) n.yaw = turn(n.yaw, Math.atan2(-(c.pos[0] - n.pos[0]), -(c.pos[2] - n.pos[2])), dt * 4);
        else if (Math.hypot(n.pos[0] - n.home[0], n.pos[2] - n.home[2]) < 0.6) n.yaw = turn(n.yaw, n.face, dt * 2);
        if (n.wait <= 0) n.goal = this.wanderGoal(n);
        n.action = NPC_ACT.idle;
        if (!n.goal) return;
      }
      target = n.goal;
    }
    // Walk toward the target, if the way is clear.
    const dx = target[0] - n.pos[0], dz = target[2] - n.pos[2], d = Math.hypot(dx, dz);
    if (d < 0.15) {
      n.goal = null;
      n.wait = 2 + Math.random() * 5;
      n.action = NPC_ACT.idle;
      return;
    }
    const step = Math.min(d, 1.4 * dt);
    const next = [n.pos[0] + (dx / d) * step, n.pos[1], n.pos[2] + (dz / d) * step];
    if (!this.standable(Math.floor(next[0]), n.pos[1], Math.floor(next[2]))) {
      n.goal = null;
      if (n.task) n.task = null;
      n.wait = 1;
      n.action = NPC_ACT.idle;
      return;
    }
    n.pos = next;
    n.yaw = turn(n.yaw, Math.atan2(-dx, -dz), dt * 8);
    n.action = NPC_ACT.walk;
  }

  // Somewhere nearby to stroll to (home, now and then).
  wanderGoal(n) {
    if (Math.random() < 0.3) return n.home.slice();
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * n.def.roam;
      const x = n.home[0] + Math.cos(a) * r, z = n.home[2] + Math.sin(a) * r;
      if (n.area && (x < n.area[0] || x > n.area[2] + 1 || z < n.area[1] || z > n.area[3] + 1)) continue;
      const spot = [Math.floor(x) + 0.5, n.home[1], Math.floor(z) + 0.5];
      if (this.standable(Math.floor(x), n.home[1], Math.floor(z)) && this.clearLine(n.pos, spot)) return spot;
    }
    return null;
  }

  // ---------- Things happening around them ----------

  react(x, y, z, range, action, lines, cooldownKey) {
    const now = Date.now();
    for (const n of this.list) {
      if (!this.near(n, x, y - Math.min(30, Math.max(0, y - n.pos[1])), z, range)) continue;
      if (now - (n[cooldownKey] || 0) < 8 * SECOND) continue;
      n[cooldownKey] = now;
      this.face(n, x, z);
      this.act(n, action, 2.5);
      n.goal = null;
      this.say(n, pickOne(lines), true);
    }
  }

  onFirework(x, y, z) {
    this.react(x, y, z, 80, NPC_ACT.cheer, ['Wooow! 🎆', 'So pretty! ✨', 'Again! Again! 🎇', 'Ooooh! Aaaah! 🎆'], 'fireworkAt');
  }

  onExplosion(x, y, z) {
    this.react(x, y, z, 80, NPC_ACT.cheer, ['WHOA!! 💥', 'Yikes! Is everyone okay?! 😱', 'That car went BOOM! 💥'], 'boomAt');
  }

  onDance(c) {
    const [x, y, z] = c.pos;
    for (const n of this.list) {
      if (!this.near(n, x, y, z, 10) || n.task) continue;
      this.face(n, x, z);
      this.act(n, NPC_ACT.dance, 4);
      n.goal = null;
      this.say(n, pickOne(['I love this song! 💃', 'Dance party! 🕺', 'Look at my moves! 💃']));
    }
  }

  // A water balloon flying past: work out whether it hits anyone.
  onThrow(c, p, v) {
    let [x, y, z] = p, [vx, vy, vz] = v;
    for (let t = 0; t < 3; t += 0.05) {
      vy -= 20 * 0.05;
      x += vx * 0.05;
      y += vy * 0.05;
      z += vz * 0.05;
      if (y < 0 || isSolidBlock(itemOf(this.room.get(Math.floor(x), Math.floor(y), Math.floor(z))))) return;
      for (const n of this.list) {
        if (Math.abs(x - n.pos[0]) < 0.45 && Math.abs(z - n.pos[2]) < 0.45 && y > n.pos[1] && y < n.pos[1] + 1.9) {
          setTimeout(() => {
            this.face(n, c.pos[0], c.pos[2]);
            this.act(n, NPC_ACT.wave, 2);
            this.say(n, pickOne(["Hey! I'm soaked! 😂", 'Eek! Cold water! 💦', `You got me, ${c.name}! 😆`]), true);
          }, t * 1000);
          return;
        }
      }
    }
  }

  // Someone right-clicked one of us.
  onTalk(c, id) {
    const n = this.list.find(m => m.id === id);
    if (!n || !this.near(n, c.pos[0], c.pos[1], c.pos[2], 9)) return;
    this.face(n, c.pos[0], c.pos[2]);
    this.act(n, NPC_ACT.wave, 1.5);
    if (n.def.place === 'store') {
      this.say(n, pickOne([`Take a look, ${c.name}! ✨`, 'Everything sparkles here! 💎', 'What catches your eye? 🛍️']), true);
      c.send({ t: 'shop_open' });
    } else {
      this.say(n, pickOne(n.def.tips), true);
    }
  }

  onBuy(c, item) {
    const n = this.list.find(m => m.def.place === 'store');
    const name = typeof item === 'number' ? BLOCKS[item]?.name : SHOP_TOOLS[item]?.name;
    if (n && name) this.say(n, `Thank you, ${c.name}! Enjoy your ${name}! ✨`, true);
  }
}

// Turns an angle a toward b by at most `step`.
function turn(a, b, step) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + Math.max(-step, Math.min(step, d));
}
