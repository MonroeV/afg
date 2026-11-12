// Quests from the town's residents (residents.js): talk to one and they ask for a little help.
//   deliver: take a package to another resident (talk to them)
//   fetch:   bring them something: hold it and talk to them (some things come from the stores)
//   visit:   go and see somewhere for them, then come back and tell them about it
// One at a time. Each pays some coins (twice as many with the Good Neighbors club's badge), and
// each counts toward that club. A resident has another job for you a little while after the last.
import { BLOCKS, storeOf, STORES } from './blocks.js';
import { RESIDENTS } from './residents.js';

const AGAIN = 8 * 60 * 1000; // a resident has a new job for you this long after the last one
const REWARD = { deliver: 5, fetch: 5, visit: 6 };
// Things to bring: plain ones anyone can build with, and some from the stores.
const FETCH = [27, 67, 68, 39, 65, 63, 116, 117, 121, 122, 126, 128, 118];
// Places to go and see (their keys in the world's places), and what they're called.
const VISIT = {
  plaza: 'the town square', tower: 'the tower', store: 'the Luxe Store', pizza: 'the Pizza Palace', lodge: 'the ski lodge',
  camp: 'the campground', quarry: 'the quarry', farm: 'the farm', gas1: 'the gas station', shop_garden: 'the Garden Center',
  shop_toys: 'the Toy Box', shop_pets: 'the Pet Shop',
};
const pick = list => list[Math.floor(Math.random() * list.length)];
const PILOT = -45; // Captain Leo
const SECRET_AFTER = 3; // how many of his jobs before he tells you how to fly
// (See cheat() in main.js: typed in the chat, these switch flying on and off.)
const pickSecret = () => pick(['🤫 Psst… want to fly like me? Type UP UP AND AWAY in the chat! ✈️', '🤫 Here\'s a secret, just for you: type UP UP AND AWAY in the chat, then you can fly! ✈️']);

export class Quests {
  constructor(room) {
    this.room = room;
  }

  residents() {
    return this.room.npcs.list.filter(n => n.def.resident);
  }

  // What the player's game needs to show: the quest (who it's for, what to do, where) and which
  // residents have a job for them.
  info(client) {
    const w = this.room.wallet(client), q = w.quest;
    const now = Date.now();
    const available = q ? [] : this.residents().filter(n => !(now - (w.questAt?.[n.id] || 0) < AGAIN)).map(n => n.id);
    if (!q) return { quest: null, available };
    const npc = id => this.residents().find(n => n.id === id);
    const giver = npc(q.from), to = q.to ? npc(q.to) : null;
    const place = q.place ? this.room.places?.[q.place] : null;
    return {
      available,
      quest: {
        type: q.type, from: q.from, fromName: giver?.def.name, fromEmoji: giver?.def.emoji, to: q.to || null, toName: to?.def.name, toEmoji: to?.def.emoji,
        item: q.item || null, itemName: q.item ? BLOCKS[q.item]?.name : null, store: q.item && BLOCKS[q.item]?.price ? storeOf(q.item) : null,
        place: place ? [place.x, place.z] : null, placeName: q.place ? VISIT[q.place] : null, visited: !!q.visited, reward: this.reward(client, q.type),
      },
    };
  }

  send(client) {
    client.send({ t: 'quest', ...this.info(client) });
  }

  reward(client, type) {
    return REWARD[type] * (this.room.perk(client, 'neighbor') ? 2 : 1);
  }

  // Someone talked to a resident: hand out a job, or see if this finishes one. Returns what the
  // resident says.
  talk(c, n) {
    const room = this.room, w = room.wallet(c), q = w.quest, me = c.name;
    if (q) {
      if (q.type === 'deliver' && n.id === q.to) return this.finish(c, n, pick(['📦 For me? Thank you! 💌', '📦 Oh, how lovely! Thanks! 😊']));
      if (q.type === 'fetch' && n.id === q.from) {
        const holding = String(c.hold) === String(q.item) && room.owns(c, q.item);
        if (holding) return this.finish(c, n, pick([`Oh, a ${BLOCKS[q.item].name}! Just what I wanted! 🥰`, 'Perfect! Thank you so much! 🎁']));
        return `Have you found me a ${BLOCKS[q.item].name}? Hold it and come and see me! 🎁`;
      }
      if (q.type === 'visit' && n.id === q.from) {
        if (q.visited) return this.finish(c, n, pick(['Was it nice? Thank you for telling me! 😊', 'Oh, I wish I\'d been there too! Thanks! 🌟']));
        return `Have you been to ${VISIT[q.place]} yet? 📍`;
      }
      if (n.id === q.from) return pick(['Thanks for helping me! 😊', 'Off you go! 🙂']);
      return pick([`Hello, ${me}! 👋`, 'Lovely day, isn\'t it? 🌞']);
    }
    if (Date.now() - (w.questAt?.[n.id] || 0) < AGAIN) return pick([`Thanks again, ${me}! 😊`, 'Come back and see me later! 👋']);
    // A new job.
    const others = this.residents().filter(o => o.id !== n.id);
    const places = Object.keys(VISIT).filter(k => room.places?.[k] && Number.isFinite(room.places[k].x));
    const types = ['fetch', ...(others.length ? ['deliver'] : []), ...(places.length ? ['visit'] : [])];
    const type = pick(types);
    let say;
    if (type === 'deliver') {
      const to = pick(others);
      w.quest = { type, from: n.id, to: to.id };
      say = `Could you take this package to ${to.def.name} for me? 📦`;
    } else if (type === 'fetch') {
      const item = pick(FETCH.filter(i => BLOCKS[i]));
      w.quest = { type, from: n.id, item };
      const store = BLOCKS[item].price ? STORES[storeOf(item)] : null;
      say = `I'd love a ${BLOCKS[item].name}! Could you bring me one? 🎁${store ? ` (${store.icon} ${store.name} has them!)` : ''}`;
    } else {
      const place = pick(places);
      w.quest = { type, from: n.id, place };
      say = `I've always wanted to see ${VISIT[place]}. Could you go and see it for me, then tell me all about it? 📍`;
    }
    this.send(c);
    room.onDirty();
    return say;
  }

  finish(c, n, say) {
    const room = this.room, w = room.wallet(c), q = w.quest;
    const coins = this.reward(c, q.type);
    w.quest = null;
    (w.questAt ??= {})[q.from] = Date.now();
    w.coins += coins;
    room.sendWallet(c);
    c.send({ t: 'quest_done', coins, type: q.type });
    room.progress(c, 'neighbor', q.type);
    this.send(c);
    room.onDirty();
    // Captain Leo the pilot (or, in a town without him, whoever lives in the last house) knows
    // a secret: the magic words for flying. Do a few of his jobs and he whispers them to you (just
    // you), with a hint after each one before that, so you know to come back.
    const list = this.residents(), pilot = list.find(r => r.id === PILOT) || list[list.length - 1];
    if (pilot && q.from === pilot.id) {
      w.pilotJobs = (w.pilotJobs || 0) + 1;
      const left = SECRET_AFTER - w.pilotJobs;
      const text = left <= 0 ? pickSecret()
        : left === 1 ? '🤫 You\'re a super helper! Do one more job for me and I\'ll tell you my secret… ✈️'
        : '✈️ Thank you! Help me again sometime, and maybe I\'ll tell you a secret… 🤫';
      setTimeout(() => c.send({ t: 'npc_say', id: pilot.id, text }), 3500);
    }
    return say;
  }

  // Every second or so: anyone sent to see somewhere who's got there.
  update() {
    for (const c of this.room.clients.values()) {
      const q = c.joined && this.room.wallet(c).quest;
      if (!q || q.type !== 'visit' || q.visited) continue;
      const p = this.room.places?.[q.place];
      if (!p || Math.hypot(c.pos[0] - p.x, c.pos[2] - p.z) > 14) continue;
      q.visited = true;
      c.send({ t: 'quest_visited' });
      this.send(c);
      this.room.onDirty();
    }
  }
}

// A saved quest, checked over.
export function cleanQuest(q) {
  if (!q || typeof q !== 'object' || !['deliver', 'fetch', 'visit'].includes(q.type) || !RESIDENTS.some(r => r.id === q.from)) return null;
  if (q.type === 'deliver' && !RESIDENTS.some(r => r.id === q.to)) return null;
  if (q.type === 'fetch' && !FETCH.includes(q.item)) return null;
  if (q.type === 'visit' && !VISIT[q.place]) return null;
  return { type: q.type, from: q.from, to: q.to, item: q.item, place: q.place, visited: !!q.visited };
}
