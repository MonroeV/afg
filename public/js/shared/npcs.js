// The town's people who aren't players: Penny at the Luxe Store, Rex at the tower's
// reception desk and Mayor Maple on the town square. The server runs them (in the room), so
// everyone sees them do the same things. They wander about a little, say hello when you
// come near, pet your pet, love your cool stuff, and react to fireworks, explosions,
// dancing and water balloons.
import { sanitizeLook } from './avatar.js';
import { BLOCKS, isSolidBlock, blockId, itemOf, shapeOf, blockMeta, DOOR_TOP, SHOP_TOOLS } from './blocks.js';
import { inZone } from './secretbase.js';

export const NPC_ACT = { idle: 0, walk: 1, wave: 2, dance: 3, pet: 4, cheer: 5 };

const pickOne = list => list[Math.floor(Math.random() * list.length)];
const nameKey = name => String(name || '').trim().toLowerCase();

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
    hello: n => [`Welcome to the tower, ${n}! 💼`, `Hi ${n}! The penthouse is at the top. Take the elevator! 🛗`, `Good to see you, ${n}!`],
    tips: ['Every floor has offices. The top floor has a grand piano! 🎹', 'The elevator in the corner goes all the way up to the roof. Right-click its doors and pick a floor! 🛗', 'You can sit in the office chairs. Very comfy!'],
  },
  {
    id: -3, place: 'plaza', name: 'Mayor Maple', title: 'Mayor Maple 🎩', roam: 7, club: 'gold',
    look: { face: 'smile', hair: 'none', hat: 'tophat', shirt: 'jacket', pants: 'jeans', skin: '#e8b088', hatColor: '#111111', shirtColor: '#6d4c41', shirtColor2: '#ffd54f', pantsColor: '#424242', shoesColor: '#111111' },
    hello: n => [`Hello ${n}! Welcome to town! 🎩`, `Lovely day, ${n}! Have you found the gold coins yet?`, `${n}! Have you been to the Luxe Store? It's fabulous!`],
    tips: ['Gold coins pop up all over town. Walk into them to collect them! 🪙', 'Win a race and you get 3 coins! 🏁', 'You get 10 coins every day just for visiting!', 'Spend your coins at the Luxe Store by the road out of town!', 'Need more coins? The Pizza Palace is looking for delivery helpers! 🍕', 'Have you been up north? There\'s a ski resort in the snow! ⛷️', 'Sit on a fishing stool on the dock and catch some fish! 🎣 Every kind is worth coins (well, not the old boots).', 'Found a car you love? Click it with the Land Flag and it can be yours! 🔑', 'Out past the edge of the old map: a beach, a campground, a quarry and a farm! 🗺️'],
  },
  {
    id: -4, place: 'pizza', name: 'Chef Rosa', title: 'Chef Rosa 🍕', roam: 2, club: 'pizza',
    look: { face: 'grin', hair: 'buns', hat: 'tophat', shirt: 'jacket', pants: 'jeans', skin: '#d9a273', hairColor: '#2b1a10', hatColor: '#ffffff', shirtColor: '#ffffff', shirtColor2: '#e53935', pantsColor: '#1d1f24', shoesColor: '#111111' },
    hello: n => [`Hi ${n}! Welcome to the Pizza Palace! 🍕`, `${n}! Want to earn some coins? I need a delivery helper!`, `Hello ${n}! The pizzas are hot and ready! 🔥`],
    tips: ['Right-click me (or the oven) to take a pizza out for delivery. 🍕', 'Deliver it quickly and you get a tip! ⏱️', 'Driving is faster than walking! 🚗', 'Super Sneakers from the Luxe Store make deliveries zoom! 👟'],
  },
  {
    // BZ News' roving reporter: she goes from place to place around town (and to whoever's
    // playing) and reports live. Tune a TV to BZ Live to watch her.
    id: -6, place: 'plaza', name: 'Skye Summers', title: 'Skye Summers 🎤', roam: 2.5, reporter: true,
    look: { face: 'smile', hair: 'long', hat: 'none', shirt: 'jacket', pants: 'skirt', skin: '#f0c4a0', eyes: '#2e6b4f', hairColor: '#e0b04a', shirtColor: '#c62828', shirtColor2: '#ffffff', pantsColor: '#1d1f24', shoesColor: '#1d1f24' },
    hello: n => [`Hi ${n}! You're on BZ Live! Wave to everyone at home! 👋📺`, `Look, everybody, it's ${n}! 🎤`, `${n}! Want to be on TV? You just were! 📺`],
    tips: ['Tune any TV to BZ Live to watch me report! 📺', 'I go wherever the news is! 🎤'],
  },
  {
    id: -5, place: 'lodge', name: 'Coach Frost', title: 'Coach Frost ⛷️', roam: 3, club: 'speed',
    look: { face: 'cool', hair: 'short', hat: 'beanie', shirt: 'hoodie', pants: 'jeans', skin: '#f2c6a5', hairColor: '#c9b38a', hatColor: '#1e88e5', shirtColor: '#e53935', shirtColor2: '#ffffff', pantsColor: '#283593', shoesColor: '#111111' },
    hello: n => [`Hey ${n}! Ready to hit the slopes? ⛷️`, `Welcome to the lodge, ${n}! Warm up by the fire! 🔥`, `${n}! The snow is perfect today! ❄️`],
    tips: ['Grab a pair of skis from the rack by the door, then ride down the slope! ⛷️', 'Right-click the chair at the bottom of the ski lift to ride up to the top! 🚡', 'On skis: hold W to carve toward where you look, S to slow down.', 'The ice rink is super slippery. Have fun skating! ⛸️', 'Try a jump on skis! Press Space! 🏂'],
  },
  // ---------- Club leaders (see clubs.js) ----------
  {
    id: -12, place: 'gas1', name: 'Mo', title: 'Mo 🔧', roam: 3, club: 'mechanic',
    look: { face: 'grin', hair: 'short', hat: 'cap', shirt: 'tshirt', pants: 'jeans', skin: '#c68642', hairColor: '#1b1209', hatColor: '#ff8f00', shirtColor: '#1565c0', shirtColor2: '#ff8f00', pantsColor: '#37474f', shoesColor: '#111111' },
    hello: n => [`Hey ${n}! Need gas? ⛽`, `${n}! Bring me a dirty car! 🧽`, `Howdy, ${n}! 🔧`],
    tips: ['🔧⛽🧽'],
  },
  {
    id: -13, place: 'camp', name: 'Ranger Rae', title: 'Ranger Rae 🌲', roam: 4, club: 'nature',
    look: { face: 'smile', hair: 'ponytail', hat: 'cowboy', shirt: 'tshirt', pants: 'jeans', skin: '#f2c6a5', hairColor: '#8d5524', hatColor: '#2e7d32', shirtColor: '#6d8b3a', shirtColor2: '#f9a825', pantsColor: '#5d4037', shoesColor: '#3e2723' },
    hello: n => [`Hi ${n}! Lovely day outdoors! 🌲`, `${n}! The fish are biting! 🎣`, `Hello ${n}! Plant a tree today? 🌳`],
    tips: ['🎣🌳'],
  },
  {
    id: -14, place: 'quarry', name: 'Digger Dot', title: 'Digger Dot ⛏️', roam: 3, club: 'tunnel',
    look: { face: 'grin', hair: 'buns', hat: 'cap', shirt: 'jacket', pants: 'jeans', skin: '#d39a6a', hairColor: '#6b3e1f', hatColor: '#fdd835', shirtColor: '#ff7043', shirtColor2: '#fdd835', pantsColor: '#3949ab', shoesColor: '#3b2314' },
    hello: n => [`Hey ${n}! Dig, dig, dig! ⛏️`, `${n}! Want to know a secret? 🤫`, `Howdy, ${n}! Mind the dump trucks! 🚚`],
    tips: ['⛏️🤫'],
  },
  // ---------- The Secret Agency ----------
  // Agent Shadow, on the town square: talk to him to join the Agency (find the three TOP SECRET
  // files for Top Secret clearance).
  {
    id: -7, place: 'agent', name: 'Agent Shadow', title: 'Agent Shadow 🕶️', roam: 1.2, agent: true,
    look: { face: 'cool', hair: 'short', hat: 'none', shirt: 'jacket', pants: 'jeans', skin: '#d39a6a', hairColor: '#1b1209', shirtColor: '#1d1f24', shirtColor2: '#ffffff', pantsColor: '#1d1f24', shoesColor: '#111111' },
    hello: n => [`Psst... ${n}! Over here! 🕶️`, `Psst! ${n}! Want to be a secret agent? Talk to me...`, `Keep it down, ${n}... 🤫 Right-click me.`],
    tips: ['🤫'],
  },
  // The guards at the base's door: only agents with Top Secret clearance get in.
  {
    id: -8, place: 'guard1', name: 'Guard Bruno', title: 'Guard Bruno 💂', roam: 0.6, guard: true, clearance: true,
    look: { face: 'cool', hair: 'short', hat: 'cap', shirt: 'jacket', pants: 'jeans', skin: '#b07548', hairColor: '#1b1209', hatColor: '#263238', shirtColor: '#37474f', shirtColor2: '#ffd54f', pantsColor: '#263238', shoesColor: '#111111' },
    hello: n => [`Halt, ${n}! 🛑`], tips: [],
  },
  {
    id: -9, place: 'guard2', name: 'Guard Tess', title: 'Guard Tess 💂', roam: 0.6, guard: true, clearance: true,
    look: { face: 'cool', hair: 'ponytail', hat: 'cap', shirt: 'jacket', pants: 'jeans', skin: '#f5c9a0', hairColor: '#6b3e1f', hatColor: '#263238', shirtColor: '#37474f', shirtColor2: '#ffd54f', pantsColor: '#263238', shoesColor: '#111111' },
    hello: n => [`Halt, ${n}! 🛑`], tips: [],
  },
  // Inside: Agent Byte watches the spy screens, Dr. Gizmo looks after the drones.
  {
    id: -10, place: 'spyroom', name: 'Agent Byte', title: 'Agent Byte 💻', roam: 2.5, clearance: true,
    look: { face: 'grin', hair: 'spiky', hat: 'none', shirt: 'hoodie', pants: 'jeans', skin: '#ffe0c4', hairColor: '#4fc3f7', shirtColor: '#263238', shirtColor2: '#66ffa6', pantsColor: '#1d1f24', shoesColor: '#111111' },
    hello: n => [`Agent ${n}! Welcome to the spy room! 💻`, `Hey ${n}! The screens are all yours. 🕵️`],
    tips: ['Right-click a console to watch anyone, anywhere, on the spy cameras! (◀ ▶ to switch) 📹', 'The radar table shows where everybody is, right now! 📡', 'Psst: the big red button in the vault? Please don\'t press it. 😬', 'Try the laser hall! Wait for the lasers to blink off, then GO! 🔴'],
  },
  {
    id: -11, place: 'dronebay', name: 'Dr. Gizmo', title: 'Dr. Gizmo 🔬', roam: 2.5, clearance: true,
    look: { face: 'surprised', hair: 'afro', hat: 'none', shirt: 'dress', pants: 'jeans', skin: '#8d5a34', hairColor: '#e8e8e8', shirtColor: '#ffffff', shirtColor2: '#40c4ff', pantsColor: '#283593', shoesColor: '#111111' },
    hello: n => [`Ah, Agent ${n}! Come and see my drones! 🚁`, `${n}! Mind the propellers! 🔬`],
    tips: ['Right-click a drone to fly it! It goes up through the hatch in the roof. 🚁', 'Flying a drone: WASD to fly, Space up, C down, the mouse to look. E to bring it home!', 'Click while flying to drop a shower of sparkles on whoever\'s below! ✨', 'My night-vision goggles are in the vault, past the lasers. Wear them at night! 🥽'],
  },
];

// Things players hold that the town's people just have to comment on.
const COOL = {
  fireworks: 'Ooh, fireworks! Light one up! 🎆', balloon: 'What a pretty balloon! 🎈', waterballoon: "Don't you dare splash me with that! 😆",
  bubbles: 'Bubbles! I love bubbles! 🫧', jetpack: "A JETPACK?! That's the coolest thing ever! 🚀", trail: 'Ooh, sparkly! ✨',
  showtime: 'A whole fireworks show? Can I watch? 🎇', camera: 'Say cheese! 📸', ball: 'Playing fetch? 🎾',
  82: 'Is that a real diamond?! 💎', 83: 'A throne fit for a king! 👑', 84: 'Party time! 🪩', 85: "A golden trophy! You're a champion! 🏆",
  wrench: 'A wrench! Are you a mechanic? 🔧', skis: 'Off to the slopes? ⛷️', sneakers: 'Whoa, those sneakers! You must be SO fast! 👟',
  goldpaint: 'Gold paint?! Make my car gold next! ✨', vacationflag: 'A Vacation Flag! Where are you going on vacation? 🏖️', 93: 'A hot tub! So fancy! 🛁', 68: 'Aww, a teddy bear! 🧸', 79: 'A grand piano! Can you play it? 🎹',
};
// What Skye says on location (then a sign-off or two), and when she drops in on a player.
const BEATS = {
  plaza: { label: 'at the town square', lines: ["Good day, BuildZone! I'm live at the town square!", 'Mayor Maple says the flowers have never looked better!', 'Builders are busy all over town today. Just look at it!', 'Remember: gold coins are hiding all over town! 🪙'] },
  store: { label: 'at the Luxe Store', lines: ["I'm live at the Luxe Store, the fanciest shop in town! ✨", 'Is that... a real diamond block? Wow! 💎', 'Shoppers say the Jetpack is out of this world! 🚀', 'Penny says there\'s something sparkly for everyone!'] },
  pizza: { label: 'at the Pizza Palace', lines: ['Live from the Pizza Palace, where the ovens never sleep! 🍕', 'Chef Rosa needs delivery helpers. Coins for pizza!', 'Mmm, can you smell that? Fresh pizza! 😋', 'Pizzas are flying out the door today!'] },
  tower: { label: 'at the tower', lines: ["I'm here at the tower, the tallest building in town! 🏢", "There's a grand piano all the way up at the top! 🎹", 'The view from the roof is amazing. Take the elevator! 🛗'] },
  camp: { label: 'at Sunny Shores Campground', lines: ['Live from Sunny Shores Campground! The campfires are crackling! 🔥', 'Camper vans as far as the eye can see! 🚐', 'In a camper van, press G and the roof pops up! ⛺', "The beach is just down the path. Surf's up! 🏖️"] },
  quarry: { label: 'at Big Rock Quarry', lines: ["I'm at Big Rock Quarry, where the dump trucks rumble! 🚚", 'Drive a dump truck under the chute to fill it with dirt! ⛏️', 'Then press G to dump it wherever you like! 🪨', 'Hard hats on, everybody! 👷'] },
  farm: { label: 'at Happy Acres Farm', lines: ['Live from Happy Acres Farm! Look at all those pumpkins! 🎃', 'The flower fields are in full bloom! 🌸', 'Hop in a pickup truck: a friend can ride in the back! 🛻', 'Nobody lives here yet. Claim it and it could be yours! 🚜'] },
  lodge: { label: 'at the ski lodge', lines: ['Brrr! Live from the ski lodge, up north! ❄️', 'The slopes are covered in fresh snow today! ⛷️', 'Grab some skis from the rack by the door and ride the lift to the top! 🚡', 'Coach Frost says: stay warm by the fire! 🔥'] },
};
const SIGN_OFFS = ["This is Skye Summers, BZ News, live! 🎤", "Stay tuned, I'll be back with more news! 📺"];
const GUEST_LINES = name => [
  `Breaking news! I'm here with ${name}, one of the best builders in town! 🎤`,
  `${name}, say hi to everyone watching at home! 👋`,
  `What are you building today, ${name}? It looks amazing!`,
  `${name}, you're a star! ⭐ Back to you in the studio!`,
];

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
    this.lands = []; // land with bodyguards: nobody but its own guards (and guests) goes in
    this.zone = places?.base?.zone || null; // the Secret Agency's base: clearance only
    for (const def of NPCS) {
      const place = def.place === 'plaza' ? { x: 4.5, y: 0, z: 6.5, face: 0, area: [-7, -7, 7, 7] } : places?.[def.place];
      if (!place) continue;
      const home = this.findStand(place.x, place.y ?? 0, place.z, def) || [place.x, place.y ?? 0, place.z];
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
    return y < 0 ? this.room.groundSolid(x, y, z) : isSolidBlock(itemOf(this.room.get(x, y, z)));
  }

  // def: who's asking (the base is only for the Agency's own people).
  standable(x, y, z, def = null) {
    if (this.zone && !def?.clearance && inZone(this.zone, x + 0.5, y, z + 0.5)) return false;
    for (const l of this.lands) if (def?.land !== l.key && x >= l.rect[0] && x <= l.rect[2] && z >= l.rect[1] && z <= l.rect[3]) return false;
    const v = this.room.get(x, y, z);
    return !this.solid(x, y, z) && !this.solid(x, y + 1, z) && this.solid(x, y - 1, z) && blockId(itemOf(v)) !== 36 && blockId(v >> 16) !== 36;
  }

  // The nearest spot to stand on, near (x, y, z).
  findStand(x, y, z, def = null) {
    for (let r = 0; r <= 3; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
          if (this.standable(cx, y, cz, def)) return [cx + 0.5, y, cz + 0.5];
        }
    return null;
  }

  // Can we walk in a straight line from a to b (on one level)?
  clearLine(a, b, def = null) {
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]), steps = Math.ceil(d / 0.3);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.standable(Math.floor(a[0] + (b[0] - a[0]) * t), a[1], Math.floor(a[2] + (b[2] - a[2]) * t), def)) return false;
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
      if (n.def.reporter) this.report(n, dt, players);
      this.notice(n, players, now);
      this.move(n, dt, players);
    }
  }

  // Say hello, admire things, go and pet pets.
  notice(n, players, now) {
    if (n.task || n.actionT > 0) return;
    if (n.def.guard) return this.guardWatch(n, players, now);
    if (n.def.land) return this.bodyguardWatch(n, players, now);
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
    if (!this.standable(Math.floor(next[0]), n.pos[1], Math.floor(next[2]), n.def)) {
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
      if (this.standable(Math.floor(x), n.home[1], Math.floor(z), n.def) && this.clearLine(n.pos, spot, n.def)) return spot;
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
    if (Math.random() < 0.4) this.breaking(pickOne(['This just in: fireworks over BuildZone! Look up! 🎆', 'What a show! Somebody is setting off fireworks! 🎇']));
  }

  onExplosion(x, y, z) {
    this.react(x, y, z, 80, NPC_ACT.cheer, ['WHOA!! 💥', 'Yikes! Is everyone okay?! 😱', 'That car went BOOM! 💥'], 'boomAt');
    this.breaking(pickOne(['BREAKING NEWS: a car just went BOOM! Don\'t worry, everyone is OK! 💥', 'This just in: an explosion in town! A new car is on its way! 🚗', 'BREAKING NEWS: KABOOM! Somebody call the mechanic! 🔧']));
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
    } else if (n.def.place === 'pizza') {
      this.room.startJob(c);
    } else if (n.def.land) {
      const land = this.lands.find(l => l.key === n.def.land);
      if (land && land.key === nameKey(c.name)) {
        this.say(n, pickOne(['Yes, boss! Who gets in? 📋', 'Your guest list, boss! 🕶️']), true);
        c.send({ t: 'guests_open', guests: land.guests });
      } else if (land && this.room.welcomeOn(land, c)) this.say(n, pickOne([`${c.name}! You're on the list. Come on in! ✅`, `Welcome, ${c.name}! ${land.owner} said you're a guest. 🫡`]), true);
      else this.say(n, pickOne([`🛑 Sorry ${c.name}, this is ${n.def.owner}'s house. Guests only!`, `🛑 You're not on the list, ${c.name}. Ask ${n.def.owner}!`]), true);
    } else if (n.def.agent) {
      this.say(n, this.mission(c), true);
      c.send({ t: 'club_open', club: 'agency' });
    } else if (n.def.guard) {
      this.say(n, this.room.cleared(c) ? pickOne([`Welcome back, Agent ${c.name}! 🫡 In you go.`, `Agent ${c.name}! The door's open for you. 🫡`]) : pickOne([`🛑 No clearance, no entry, ${c.name}! Agent Shadow on the town square can tell you how to get some.`, '🛑 This is a TOP SECRET area! Only agents with Top Secret clearance get in.']), true);
    } else if (n.def.club) {
      // A club's leader: shows you what to do (in the badge book: pictures, not lots of words).
      const done = this.room.perk(c, n.def.club);
      this.say(n, done ? pickOne([`You're a star, ${c.name}! ⭐`, `Thanks for all your help, ${c.name}! 🏅`]) : pickOne([`Join my club, ${c.name}! 🏅`, `Can you help me, ${c.name}? 🙂`, `Here's what to do! 👇`]), true);
      c.send({ t: 'club_open', club: n.def.club });
    } else {
      this.say(n, pickOne(n.def.tips), true);
    }
  }

  // ---------- The Secret Agency ----------

  // What Agent Shadow tells you: how to get clearance (and how you're getting on).
  mission(c) {
    const w = this.room.wallet(c), need = this.room.filesNeeded(), found = w.agent.files.length;
    if (w.agent.clear) return pickOne([`Agent ${c.name}! 🕶️ Your clearance is good. The base is hidden out in the south-east, past the campground. Show the guards your badge!`, `Good work, Agent ${c.name}. The drones, the spy cameras and the lasers are waiting for you at the base. Shhh! 🤫`]);
    const left = this.room.filesLeft(w);
    if (!found) return `Psst, ${c.name}... 🕶️ The Secret Agency needs new agents. Find our ${need} TOP SECRET files: one is ${left[0]}, one is ${left[1] || 'hidden'}, and one is ${left[2] || 'hidden'}. Right-click each one. Find them all and you'll get Top Secret clearance!`;
    return `You've found ${found} of ${need} TOP SECRET files, ${c.name}. 🕵️ Still to find: ${left.join(', and ')}.`;
  }

  // A guard at the base's door: stops anyone without clearance, salutes agents.
  guardWatch(n, players, now) {
    for (const c of players) {
      const [x, y, z] = c.pos;
      if (!this.near(n, x, y, z, 5)) continue;
      const clear = this.room.cleared(c);
      const key = `${c.id}:${clear}`;
      if (now - (n.seen.get(key) || 0) < (clear ? 90 : 25) * SECOND) continue;
      n.seen.set(key, now);
      this.face(n, x, z);
      this.act(n, NPC_ACT.wave, 1.5);
      this.say(n, clear ? pickOne([`Welcome, Agent ${c.name}! 🫡`, `Agent ${c.name}! Go right in. 🫡`, `Badge checked. Good to see you, Agent ${c.name}! 🕶️`])
        : pickOne([`🛑 Halt, ${c.name}! This is a TOP SECRET area. No clearance, no entry!`, `🛑 Stop right there, ${c.name}! Secret Agency agents only.`, `🛑 Sorry ${c.name}, Top Secret clearance only! Ask Agent Shadow on the town square. 🕶️`]), true);
      return;
    }
  }

  // ---------- Bodyguards (from the Luxe Store) ----------

  // Two bodyguards for each guarded land: they come and go with it (and look the part).
  syncGuards(lands) {
    this.lands = lands;
    const want = new Set(lands.map(l => l.key));
    this.list = this.list.filter(n => !n.def.land || want.has(n.def.land));
    this.guardIds ??= new Map();
    for (const land of lands) {
      if (this.list.some(n => n.def.land === land.key)) continue;
      if (!this.guardIds.has(land.key)) this.guardIds.set(land.key, -100 - this.guardIds.size * 2);
      const id0 = this.guardIds.get(land.key);
      const spots = this.guardSpots(land);
      ['Max', 'Jo'].forEach((who, i) => {
        const def = {
          id: id0 - i, name: who, title: `${who} 🛡️ ${land.owner}'s bodyguard`, roam: 0.6, land: land.key, owner: land.owner,
          look: { face: 'cool', hair: i ? 'buns' : 'short', hat: 'none', shirt: 'jacket', pants: 'jeans', skin: i ? '#e8b088' : '#6b4226', hairColor: '#1b1209', shirtColor: '#111316', shirtColor2: '#ffffff', pantsColor: '#111316', shoesColor: '#111111' },
          hello: () => [], tips: [],
        };
        const [x, y, z, face] = spots[i];
        const home = this.findStand(x, y, z, def) || [x, y, z];
        this.list.push({
          def, id: def.id, home, area: [Math.floor(home[0]) - 1, Math.floor(home[2]) - 1, Math.floor(home[0]) + 1, Math.floor(home[2]) + 1], face,
          pos: home.slice(), yaw: face, goal: null, wait: 3, action: NPC_ACT.idle, actionT: 0, saidAt: 0, look: sanitizeLook(def.look),
          seen: new Map(), noticed: new Map(), petted: new Map(), task: null,
        });
      });
    }
  }

  // Where a land's bodyguards stand: either side of its front door (outside it), or, with no
  // door, either side of the middle of the edge that's nearest the middle of town.
  guardSpots(land) {
    const [x0, z0, x1, z1] = land.rect, room = this.room;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const covered = (x, z) => {
      for (let y = 2; y < 14; y++) if (this.solid(x, y, z)) return 1;
      return 0;
    };
    // A front door: of the two sides you can walk through it from, the outside is the one with
    // less roof over the next few steps (and, if that's even, the one farther from the middle).
    let best = null;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const v = room.get(x, 0, z);
        if (shapeOf(itemOf(v)) !== 'door' || blockMeta(itemOf(v)) & DOOR_TOP) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ox = x + dx, oz = z + dz;
          if (this.solid(ox, 0, oz) || this.solid(ox, 1, oz)) continue;
          const roof = covered(ox, oz) + covered(ox + dx, oz + dz) + covered(ox + 2 * dx, oz + 2 * dz);
          const score = roof * 10 - Math.hypot(ox - cx, oz - cz);
          if (!best || score < best.score) best = { score, ox, oz, dx, dz };
        }
      }
    if (best) {
      const { ox, oz, dx, dz } = best;
      const face = Math.atan2(-dx, -dz); // (looking out, away from the door)
      return [[ox + dx + 0.5 + dz * 1.5, 0, oz + dz + 0.5 - dx * 1.5, face], [ox + dx + 0.5 - dz * 1.5, 0, oz + dz + 0.5 + dx * 1.5, face]];
    }
    const edges = [[(x0 + x1) / 2, z0 - 0.5, 0, 1], [(x0 + x1) / 2, z1 + 1.5, 0, -1], [x0 - 0.5, (z0 + z1) / 2, 1, 0], [x1 + 1.5, (z0 + z1) / 2, -1, 0]];
    edges.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    const [ex, ez, ix, iz] = edges[0];
    const face = Math.atan2(ix, iz); // (looking out, away from the land)
    return [[ex + 0.5 + iz * 1.5, 0, ez + 0.5 - ix * 1.5, face], [ex + 0.5 - iz * 1.5, 0, ez + 0.5 + ix * 1.5, face]];
  }

  // A bodyguard: stops anyone who isn't the owner or a guest, says hi to the boss and the guests.
  bodyguardWatch(n, players, now) {
    const land = this.lands.find(l => l.key === n.def.land);
    if (!land) return;
    for (const c of players) {
      const [x, y, z] = c.pos;
      if (!this.near(n, x, y, z, 5)) continue;
      const boss = nameKey(c.name) === land.key, ok = this.room.welcomeOn(land, c);
      const key = `${c.id}:${ok}`;
      if (now - (n.seen.get(key) || 0) < (ok ? 120 : 25) * SECOND) continue;
      n.seen.set(key, now);
      this.face(n, x, z);
      this.act(n, NPC_ACT.wave, 1.5);
      this.say(n, boss ? pickOne([`Welcome home, boss! 🫡`, `All quiet here, boss. 🕶️`]) : ok ? `Welcome, ${c.name}! You're on the list. ✅`
        : pickOne([`🛑 Halt, ${c.name}! This is ${land.owner}'s house. Guests only!`, `🛑 Sorry ${c.name}, you're not on ${land.owner}'s guest list.`]), true);
      return;
    }
  }

  // Someone without clearance tried the base's door: the nearest guard tells them.
  halt(c) {
    const now = Date.now();
    if (now - (c.haltedAt || 0) < 4 * SECOND) return;
    c.haltedAt = now;
    const guard = this.list.filter(n => n.def.guard).sort((a, b) => Math.hypot(a.pos[0] - c.pos[0], a.pos[2] - c.pos[2]) - Math.hypot(b.pos[0] - c.pos[0], b.pos[2] - c.pos[2]))[0];
    if (!guard) return;
    this.face(guard, c.pos[0], c.pos[2]);
    this.act(guard, NPC_ACT.wave, 1.5);
    this.say(guard, pickOne([`🛑 Locked! You need Top Secret clearance, ${c.name}.`, `🛑 Nice try, ${c.name}! Clearance only. Talk to Agent Shadow on the town square. 🕶️`]), true);
  }

  // ---------- The news ----------
  // Skye does a "segment" in one place, then cuts to the next one (she's off to her next story):
  // the town square, the Luxe Store, the Pizza Palace, the tower, the ski lodge, or wherever
  // someone's playing. She talks to the camera every few seconds.

  report(n, dt, players) {
    n.beatT = (n.beatT ?? 0) - dt;
    n.lineT = (n.lineT ?? 3) - dt;
    if (n.beatT <= 0) return this.nextBeat(n, players);
    const story = n.story;
    if (!story) return;
    if (story.guest) {
      const c = this.room.clients.get(story.guest);
      if (c?.joined) this.face(n, c.pos[0], c.pos[2]);
    }
    if (n.lineT <= 0 && !n.task) {
      n.lineT = 6 + Math.random() * 2.5;
      this.say(n, story.lines[story.i++ % story.lines.length], true);
      if (story.guest && story.i === 2) this.act(n, NPC_ACT.wave, 1.5);
    }
  }

  nextBeat(n, players) {
    const places = this.room.places || {};
    const spots = Object.entries(BEATS).map(([key, beat]) => ({ key, beat, p: key === 'plaza' ? { x: 3.5, y: 0, z: 3.5 } : places[key] })).filter(s => s.p);
    let stand = null, story = null;
    // Sometimes: drop in on someone who's playing (on foot, out in the open).
    const guests = players.filter(c => c.pos[1] < 40 && !c.sleeping && !inZone(this.zone, ...c.pos));
    if (guests.length && Math.random() < 0.45 && n.story?.guest === 0) {
      const c = guests[Math.floor(Math.random() * guests.length)];
      stand = this.besideGuest(c);
      if (stand) story = { label: `with ${c.name}`, guest: c.id, lines: GUEST_LINES(c.name), i: 0 };
    }
    if (!stand) {
      const choices = spots.filter(s => s.key !== n.story?.key);
      const s = choices[Math.floor(Math.random() * choices.length)] || spots[0];
      if (!s) return;
      stand = this.findStand(s.p.x, s.p.y ?? 0, s.p.z) || [s.p.x, s.p.y ?? 0, s.p.z];
      story = { key: s.key, label: s.beat.label, guest: 0, lines: [...s.beat.lines, ...SIGN_OFFS], i: 0 };
    }
    n.pos = stand.slice();
    n.home = stand.slice();
    n.area = [Math.floor(stand[0]) - 3, Math.floor(stand[2]) - 3, Math.floor(stand[0]) + 3, Math.floor(stand[2]) + 3];
    n.goal = null;
    n.task = null;
    n.wait = story.guest ? 99 : 3;
    n.story = story;
    n.beatT = story.guest ? 26 : 34;
    n.lineT = 1.2;
    this.room.broadcast({ t: 'news', place: story.label, guest: story.guest });
  }

  // Where Skye stands to interview someone: a few blocks away and off to one side of where
  // they're looking, so she's in view but never in the way of what they're building.
  besideGuest(c) {
    const a = c.rot[0], y = Math.floor(c.pos[1] + 0.05);
    const side = Math.random() < 0.5 ? 1 : -1;
    for (const turn of [55, 40, 70, 90, 30]) {
      for (const s of [side, -side]) {
        for (const d of [3.8, 4.5, 3.4]) {
          const b = a + s * turn * Math.PI / 180;
          const x = c.pos[0] - Math.sin(b) * d, z = c.pos[2] - Math.cos(b) * d;
          const cx = Math.floor(x), cz = Math.floor(z);
          if (!this.standable(cx, y, cz)) continue;
          const spot = [cx + 0.5, y, cz + 0.5];
          if (Math.hypot(spot[0] - c.pos[0], spot[2] - c.pos[2]) >= 3.2) return spot;
        }
      }
    }
    return null;
  }

  newsInfo() {
    const n = this.list.find(m => m.def.reporter);
    return n?.story ? { place: n.story.label, guest: n.story.guest } : null;
  }

  // Big news: Skye reports it wherever she is.
  breaking(text) {
    const n = this.list.find(m => m.def.reporter);
    if (n) {
      this.say(n, text, true);
      n.lineT = 7;
    }
  }

  // The chef sends someone off with a pizza (or cheers when they're back).
  chefSays(text) {
    const n = this.list.find(m => m.def.place === 'pizza');
    if (n) this.say(n, text, true);
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
