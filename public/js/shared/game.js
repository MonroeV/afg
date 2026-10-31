// The game "room": the world, players, vehicles, land claims, growing trees and the clock.
// The Node server runs one of these for everybody. When there is no server,
// the browser runs its own copy so single player works exactly the same way.
import { blockKey, inBounds, isValidBlock, isSolidBlock, blocksVehicles, blockId, shapeOf, DOOR_OPEN, DAY_LENGTH, WORLD, isNightTime } from './blocks.js';
import { sanitizeLook, cleanName } from './avatar.js';
import { generateWorld, helipadBlocks, upgradeLamps } from './worldgen.js';
import { VEHICLES, MAX_HP, FIRE_HP, findVehicleSpot } from './vehicles.js';
import { normalizeRect, claimSizeOk, rectsOverlap, canBuild, claimAt, nameKey, CLAIM_EXPIRE_DAYS } from './claims.js';

export const SAVE_VERSION = 4;
const TICK_RATE = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOG = 7, LEAVES = 8, GRASS = 1, DIRT = 2;

const num = v => (Number.isFinite(v) ? v : 0);
const clampWorld = v => Math.max(WORLD.min, Math.min(WORLD.max + 1, num(v)));
const numbers = (a, n) => (Array.isArray(a) ? a.slice(0, n).map(num) : 0);

export class GameRoom {
  constructor({ maxPlayers = 32, onDirty = () => {}, log = () => {} } = {}) {
    this.maxPlayers = maxPlayers;
    this.onDirty = onDirty;
    this.log = log;
    this.world = new Map(); // "x,y,z" -> block value
    this.vehicles = new Map(); // id -> vehicle
    this.homes = new Map(); // id -> where a vehicle lives: { id, kind, color, x, y, z, h }
    this.respawns = []; // { home, at }
    this.clients = new Map(); // id -> client
    this.claims = []; // { owner, key, x0, z0, x1, z1, createdAt }
    this.names = {}; // lowercase name -> last time someone played with it
    this.saplings = []; // logs growing into trees
    this.nextId = 1;
    this.nextVehicleId = 1;
    this.nextHomeId = 1;
    this.time = DAY_LENGTH * 0.08; // start in the morning
    this.timers = { sync: 0, state: 0, names: 0, expire: 0, burn: 0 };
    this.isSolid = (x, y, z) =>
      y < 0 || x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max ||
      blocksVehicles(this.world.get(blockKey(x, y, z)) || 0);
  }

  // ---------- World data ----------

  generate() {
    const { blocks, cars } = generateWorld();
    this.world.clear();
    for (const [x, y, z, v] of blocks) this.world.set(blockKey(x, y, z), v);
    this.setHomes(cars);
  }

  setHomes(list) {
    this.vehicles.clear();
    this.homes.clear();
    this.respawns = [];
    for (const c of list) {
      const home = this.addHome(c);
      this.spawn(home);
    }
  }

  addHome({ id, kind, color, x, y, z, h }) {
    const home = {
      id: id || this.nextHomeId++,
      kind: VEHICLES[kind] ? kind : 'car',
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#ff7043', '#8e24aa', '#ec407a', '#26c6da'][this.homes.size % 8],
      x: num(x), y: num(y), z: num(z), h: num(h),
    };
    this.nextHomeId = Math.max(this.nextHomeId, home.id + 1);
    this.homes.set(home.id, home);
    return home;
  }

  // Puts a home's vehicle back in the world (somewhere nearby if its spot is built on).
  spawn(home) {
    const spot = findVehicleSpot(this.isSolid, VEHICLES[home.kind], home, [...this.vehicles.values()]);
    if (!spot) return null;
    return this.addVehicle({ ...home, ...spot, home: home.id, hp: MAX_HP });
  }

  addVehicle({ kind, color, x, y, z, h, home, hp }) {
    const v = {
      id: this.nextVehicleId++, kind, color, home,
      x: clampWorld(x), y: Math.max(0, num(y)), z: clampWorld(z), h: num(h),
      hp: Math.max(1, Math.min(MAX_HP, Number.isFinite(hp) ? hp : MAX_HP)),
      speed: 0, steer: 0, siren: 0, pitch: 0, roll: 0, rotor: 0, flags: 0, driver: 0, passengers: [],
    };
    this.vehicles.set(v.id, v);
    return v;
  }

  // Loads a saved world. Older saves are upgraded by *adding* things (never by removing
  // what players built). Returns false only if there's nothing usable in `data`.
  load(data) {
    if (Array.isArray(data)) data = { version: 1, blocks: data.flat() }; // the very first save format
    if (!data || !Array.isArray(data.blocks) || !(data.version >= 1 && data.version <= SAVE_VERSION)) return false;
    this.world.clear();
    const b = data.blocks;
    for (let i = 0; i + 3 < b.length; i += 4) this.world.set(blockKey(b[i], b[i + 1], b[i + 2]), b[i + 3]);
    if (Number.isFinite(data.time)) this.time = data.time % DAY_LENGTH;
    if (data.version <= 2) {
      // Older saves had player-spawned cars; use the town's parking spots instead, and
      // add the helipad wherever the ground is still empty (it never replaces anything).
      for (const [x, y, z, v] of helipadBlocks()) if (!this.world.has(blockKey(x, y, z))) this.world.set(blockKey(x, y, z), v);
      this.setHomes(generateWorld().cars);
      this.upgradeLamps();
      return true;
    }
    this.vehicles.clear();
    this.homes.clear();
    for (const h of data.homes || []) this.addHome(h);
    for (const v of data.vehicles || []) if (this.homes.has(v.home)) this.addVehicle({ ...this.homes.get(v.home), ...v });
    const parked = new Set([...this.vehicles.values()].map(v => v.home));
    this.respawns = [...this.homes.values()].filter(h => !parked.has(h.id)).map(home => ({ home: home.id, at: Date.now() + 30000 }));
    this.claims = (data.claims || []).filter(c => c && c.key);
    this.names = data.names || {};
    this.saplings = data.saplings || [];
    this.expireClaims();
    if (data.version < 4) this.upgradeLamps();
    return true;
  }

  // Worlds saved before version 4 get the new lamps (and are saved again soon after).
  upgradeLamps() {
    const lamps = [...this.world].filter(([, v]) => v === 18).map(([k]) => k);
    upgradeLamps(lamps, (x, y, z) => this.get(x, y, z), (x, y, z, v) => this.world.set(blockKey(x, y, z), v));
    this.onDirty();
  }

  serialize() {
    return {
      version: SAVE_VERSION,
      time: Math.round(this.time),
      blocks: this.flatBlocks(),
      homes: [...this.homes.values()],
      vehicles: [...this.vehicles.values()].map(({ home, kind, color, x, y, z, h, hp }) => ({ home, kind, color, x, y, z, h, hp: Math.round(hp) })),
      claims: this.claims,
      names: this.names,
      saplings: this.saplings,
    };
  }

  flatBlocks() {
    const out = [];
    for (const [k, v] of this.world) {
      const [x, y, z] = k.split(',');
      out.push(+x, +y, +z, v);
    }
    return out;
  }

  get(x, y, z) {
    return this.world.get(blockKey(x, y, z)) || 0;
  }

  // Changes a block on the server's own behalf (growing trees) and tells everyone.
  serverSet(x, y, z, v) {
    if (!inBounds(x, y, z)) return;
    if (v) this.world.set(blockKey(x, y, z), v);
    else this.world.delete(blockKey(x, y, z));
    this.broadcast({ t: 'set', x, y, z, b: v });
    this.onDirty();
  }

  // ---------- Connections ----------

  // `send` is a function that delivers one message object to this client.
  connect(send) {
    if (this.clients.size >= this.maxPlayers) {
      send({ t: 'full' });
      return null;
    }
    const client = {
      id: this.nextId++, send, joined: false, name: 'Builder', look: sanitizeLook(null),
      pos: [0, 0, 0], rot: [0, 0], pet: 0, ball: 0, flags: 0, car: 0, sleeping: false, buckets: {},
    };
    this.clients.set(client.id, client);
    return client;
  }

  disconnect(client) {
    this.clients.delete(client.id);
    if (!client.joined) return;
    this.leaveVehicle(client);
    this.seen(client.name);
    this.broadcast({ t: 'leave', id: client.id });
    this.broadcast({ t: 'chat', system: true, text: `${client.name} left` });
    this.log(`${client.name} left (${this.clients.size} online)`);
  }

  broadcast(msg, except) {
    for (const c of this.clients.values()) if (c !== except && c.joined) c.send(msg);
  }

  // Simple token bucket so one client can't flood everyone.
  allow(client, kind, perSecond, burst) {
    const now = Date.now();
    const b = (client.buckets[kind] ??= { tokens: burst, t: now });
    b.tokens = Math.min(burst, b.tokens + ((now - b.t) / 1000) * perSecond);
    b.t = now;
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  seen(name) {
    this.names[nameKey(name)] = Date.now();
  }

  // ---------- Messages ----------

  handle(client, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'join') {
      if (!client.joined) this.join(client, msg);
      return;
    }
    if (!client.joined) return;
    const handler = this.handlers[msg.t];
    if (handler) handler.call(this, client, msg);
  }

  join(client, msg) {
    client.name = cleanName(msg.name);
    client.look = sanitizeLook(msg.look);
    client.joined = true;
    this.seen(client.name);
    client.send({
      t: 'welcome',
      id: client.id,
      time: this.time,
      dayLength: DAY_LENGTH,
      world: this.flatBlocks(),
      cars: [...this.vehicles.values()].map(publicVehicle),
      claims: this.claims,
      players: [...this.clients.values()].filter(o => o.joined && o !== client).map(publicPlayer),
    });
    this.broadcast({ t: 'join', ...publicPlayer(client) }, client);
    this.broadcast({ t: 'chat', system: true, text: `${client.name} joined` });
    this.log(`${client.name} joined (${this.clients.size} online)`);
  }

  leaveVehicle(client) {
    const v = this.vehicles.get(client.car);
    client.car = 0;
    if (!v) return;
    if (v.passengers.includes(client.id)) {
      v.passengers = v.passengers.filter(id => id !== client.id);
      this.broadcast({ t: 'car_driver', ...publicVehicle(v) });
      return;
    }
    if (v.driver !== client.id) return;
    v.driver = 0;
    v.speed = v.steer = v.siren = v.pitch = v.roll = v.rotor = 0;
    // Nobody flying it any more? It drops to the ground.
    if (VEHICLES[v.kind].flying) {
      const x = Math.floor(v.x), z = Math.floor(v.z), start = v.y;
      v.y = Math.ceil(v.y - 0.05);
      while (v.y > 0 && !this.isSolid(x, v.y - 1, z)) v.y--;
      if (start - v.y > 3) {
        this.damageVehicle(v, Math.min(45, (start - v.y) * 3), [0, 0, 0]);
        if (!this.vehicles.has(v.id)) return;
      }
    }
    this.broadcast({ t: 'car_driver', ...publicVehicle(v) });
    this.onDirty();
  }

  destroyVehicle(v) {
    this.vehicles.delete(v.id);
    for (const id of [v.driver, ...v.passengers]) {
      const c = this.clients.get(id);
      if (c) c.car = 0;
    }
    this.broadcast({ t: 'car_destroy', id: v.id, x: v.x, y: v.y, z: v.z });
    if (this.homes.has(v.home)) this.respawns.push({ home: v.home, at: Date.now() + VEHICLES[v.kind].respawn * 1000 });
    this.onDirty();
  }

  damageVehicle(v, amount, impact) {
    v.hp = Math.max(0, v.hp - amount);
    this.broadcast({ t: 'car_hp', id: v.id, hp: Math.round(v.hp), impact });
    if (v.hp <= 0) this.destroyVehicle(v);
  }

  handlers = {
    state(client, msg) {
      if (Array.isArray(msg.pos) && Array.isArray(msg.rot)) {
        client.pos = msg.pos.slice(0, 3).map(num);
        client.rot = msg.rot.slice(0, 2).map(num);
      }
      client.pet = numbers(msg.pet, 5);
      client.ball = numbers(msg.ball, 3);
      client.flags = num(msg.flags) | 0;
    },

    set(client, { x, y, z, b }) {
      if (!inBounds(x, y, z) || !isValidBlock(b)) return;
      const old = this.get(x, y, z);
      // Room for a whole ladder or garage door at once. Too fast? Undo it for that player.
      if (!this.allow(client, 'set', 40, 160)) {
        client.send({ t: 'set', x, y, z, b: old });
        return;
      }
      if (!canBuild(this.claims, client.name, x, z) && !isDoorToggle(old, b)) {
        // Not your land: put the block back the way it was for this player.
        client.send({ t: 'set', x, y, z, b: old });
        if (this.allow(client, 'claimMsg', 0.2, 1)) {
          client.send({ t: 'chat', system: true, text: `🚧 This land belongs to ${claimAt(this.claims, x, z).owner}. Only they can build here.` });
        }
        return;
      }
      const k = blockKey(x, y, z);
      if (b === 0) this.world.delete(k);
      else this.world.set(k, b);
      this.broadcast({ t: 'set', x, y, z, b }, client);
      if (blockId(b) === LOG && blockId(old) !== LOG) this.maybePlant(x, y, z);
      this.onDirty();
    },

    chat(client, msg) {
      const text = String(msg.text ?? '').trim().slice(0, 160);
      if (!text || !this.allow(client, 'chat', 1, 5)) return;
      this.broadcast({ t: 'chat', name: client.name, color: client.look.shirtColor, text });
    },

    // A new look, and optionally a new name (when someone picks a saved character).
    look(client, msg) {
      if (!this.allow(client, 'look', 1, 5)) return;
      client.look = sanitizeLook(msg.look);
      const oldName = client.name;
      if (msg.name !== undefined) client.name = cleanName(msg.name);
      this.seen(client.name);
      this.broadcast({ t: 'look', id: client.id, look: client.look, name: client.name }, client);
      if (client.name !== oldName) this.broadcast({ t: 'chat', system: true, text: `${oldName} is now ${client.name}` });
    },

    emote(client, msg) {
      if (!['dance', 'wave'].includes(msg.kind) || !this.allow(client, 'emote', 1, 3)) return;
      this.broadcast({ t: 'emote', id: client.id, kind: msg.kind }, client);
    },

    fx(client, msg) {
      if (!['firework', 'hearts', 'sparkle'].includes(msg.kind) || !this.allow(client, 'fx', 3, 6)) return;
      const color = /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color : '#ffffff';
      this.broadcast({ t: 'fx', kind: msg.kind, x: num(msg.x), y: num(msg.y), z: num(msg.z), color, seed: num(msg.seed) }, client);
    },

    // The first one in drives; up to two more can ride along as passengers.
    car_enter(client, { id }) {
      const v = this.vehicles.get(id);
      if (!v || client.car) return;
      if (!v.driver) v.driver = client.id;
      else if (v.passengers.length < 2) v.passengers.push(client.id);
      else return;
      client.car = id;
      this.broadcast({ t: 'car_driver', ...publicVehicle(v) });
    },

    car_exit(client) {
      this.leaveVehicle(client);
    },

    car_state(client, msg) {
      const v = this.vehicles.get(msg.id);
      if (!v || v.driver !== client.id) return;
      v.x = clampWorld(msg.x);
      v.y = Math.max(0, Math.min(WORLD.maxY + 40, num(msg.y)));
      v.z = clampWorld(msg.z);
      v.h = num(msg.h);
      v.speed = num(msg.speed);
      v.steer = num(msg.steer);
      v.siren = msg.siren ? 1 : 0;
      v.pitch = num(msg.p);
      v.roll = num(msg.r);
      v.rotor = num(msg.rs);
      v.flags = num(msg.f) & 3; // brake lights, reverse lights
    },

    // Crashes (reported by the driver) and hammer hits (from anyone close by).
    car_damage(client, msg) {
      const v = this.vehicles.get(msg.id);
      if (!v || !this.allow(client, 'damage', 8, 12)) return;
      const close = Math.hypot(client.pos[0] - v.x, client.pos[2] - v.z) < 14;
      if (client.car !== v.id && !close) return;
      const impact = numbers(msg.impact, 3) || [0, 1, 0];
      this.damageVehicle(v, Math.max(0, Math.min(45, num(msg.amount))), impact);
    },

    // A parked car got knocked (by someone's car, or by someone pushing it): its new spot.
    car_nudge(client, msg) {
      const v = this.vehicles.get(msg.id);
      if (!v || v.driver || !this.allow(client, 'nudge', 40, 80)) return;
      if (Math.hypot(client.pos[0] - v.x, client.pos[2] - v.z) > 40) return;
      v.x = clampWorld(msg.x);
      v.y = Math.max(0, Math.min(WORLD.maxY, num(msg.y)));
      v.z = clampWorld(msg.z);
      v.h = num(msg.h);
      v.nudgedAt = Date.now();
      this.onDirty();
    },

    // Someone crashed into a car another player is driving: pass the shove on to that driver.
    car_impulse(client, msg) {
      const v = this.vehicles.get(msg.id);
      if (!v || !v.driver || v.driver === client.id || !this.allow(client, 'impulse', 10, 20)) return;
      if (Math.hypot(client.pos[0] - v.x, client.pos[2] - v.z) > 25) return;
      const clamp = n => Math.max(-30, Math.min(30, num(n)));
      this.clients.get(v.driver)?.send({ t: 'car_impulse', id: v.id, vx: clamp(msg.vx), vz: clamp(msg.vz), spin: clamp(msg.spin) });
    },

    // A vehicle bumped into a person: knock them back (on their screen).
    push(client, msg) {
      const target = this.clients.get(msg.id);
      if (!target || target === client || !target.joined || !this.allow(client, 'push', 10, 20)) return;
      if (Math.hypot(client.pos[0] - target.pos[0], client.pos[2] - target.pos[2]) > 15) return;
      const clamp = n => Math.max(-25, Math.min(25, num(n)));
      target.send({ t: 'push', vx: clamp(msg.vx), vy: clamp(msg.vy), vz: clamp(msg.vz) });
    },

    horn(client) {
      if (this.vehicles.get(client.car)?.driver !== client.id || !this.allow(client, 'horn', 3, 4)) return;
      this.broadcast({ t: 'horn', id: client.car }, client);
    },

    claim(client, msg) {
      const coords = [msg.x0, msg.z0, msg.x1, msg.z1];
      if (!coords.every(Number.isInteger) || !inBounds(msg.x0, 0, msg.z0) || !inBounds(msg.x1, 0, msg.z1)) return;
      if (!this.allow(client, 'claim', 0.2, 2)) return;
      const rect = normalizeRect(...coords);
      const key = nameKey(client.name);
      const reply = text => client.send({ t: 'chat', system: true, text });
      if (!claimSizeOk(rect)) return reply('🚧 Land can be at most 10 by 15 blocks.');
      const clash = this.claims.find(c => c.key !== key && rectsOverlap(c, rect));
      if (clash) return reply(`🚧 That overlaps ${clash.owner}'s land. Try somewhere else!`);
      const had = this.claims.some(c => c.key === key);
      this.claims = this.claims.filter(c => c.key !== key);
      this.claims.push({ owner: client.name, key, ...rect, createdAt: Date.now() });
      this.seen(client.name);
      this.broadcast({ t: 'claims', claims: this.claims });
      reply(`🏠 This land is now yours, ${client.name}!${had ? ' (Your old land is free again.)' : ''} Only someone named ${client.name} can build here.`);
      this.onDirty();
    },

    unclaim(client) {
      const key = nameKey(client.name);
      if (!this.claims.some(c => c.key === key)) return;
      this.claims = this.claims.filter(c => c.key !== key);
      this.broadcast({ t: 'claims', claims: this.claims });
      client.send({ t: 'chat', system: true, text: '🏳️ You gave up your land. Anyone can build there now.' });
      this.onDirty();
    },

    sleep(client, msg) {
      client.sleeping = !!msg.on;
      this.checkSleep();
    },
  };

  // ---------- Growing trees ----------

  // A lone log on the ground (with room above it) is a sapling that grows into a tree.
  maybePlant(x, y, z) {
    const below = y === 0 ? GRASS : blockId(this.get(x, y - 1, z));
    if (below !== GRASS && below !== DIRT) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isSolidBlock(this.get(x + dx, y, z + dz))) return;
    for (let k = 1; k <= 3; k++) if (this.get(x, y + k, z)) return;
    if (this.saplings.length > 200) return;
    this.saplings.push({ x, y, z, stage: 0, height: 4 + Math.floor(Math.random() * 3), at: Date.now() + 8000 });
  }

  growSapling(s) {
    if (blockId(this.get(s.x, s.y, s.z)) !== LOG) return true; // chopped down: stop
    const h = s.height;
    if (s.stage < h - 1) {
      const y = s.y + s.stage + 1;
      if (this.get(s.x, y, s.z)) {
        s.height = s.stage + 1; // something's in the way: become a shorter tree
      } else {
        this.serverSet(s.x, y, s.z, LOG);
        s.stage++;
        s.at = Date.now() + 9000;
        return false;
      }
    }
    // Leaves grow in three layers from the bottom of the crown to the top.
    const layer = s.stage - (s.height - 1);
    const dys = [[s.height - 2], [s.height - 1], [s.height, s.height + 1]][layer] || [];
    for (const dy of dys)
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          const r = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - s.height) * 2;
          const x = s.x + dx, y = s.y + dy, z = s.z + dz;
          if (r <= 3 && !(dx === 0 && dz === 0 && dy < s.height) && !this.get(x, y, z) && inBounds(x, y, z)) this.serverSet(x, y, z, LEAVES);
        }
    s.stage++;
    s.at = Date.now() + 6000;
    return layer >= 2;
  }

  // ---------- Sleeping ----------

  checkSleep() {
    const players = [...this.clients.values()].filter(c => c.joined);
    if (!players.length || !isNightTime(this.time) || !players.every(c => c.sleeping)) return;
    this.time = DAY_LENGTH * 0.01;
    for (const c of players) c.sleeping = false;
    this.broadcast({ t: 'time', time: this.time });
    this.broadcast({ t: 'wake' });
    this.broadcast({ t: 'chat', system: true, text: '☀️ Everyone slept through the night. Good morning!' });
  }

  expireClaims() {
    const limit = Date.now() - CLAIM_EXPIRE_DAYS * DAY_MS;
    const before = this.claims.length;
    this.claims = this.claims.filter(c => (this.names[c.key] || c.createdAt) > limit);
    if (this.claims.length !== before) {
      this.broadcast({ t: 'claims', claims: this.claims });
      this.onDirty();
    }
  }

  // ---------- Clock ----------

  tick(dt) {
    const now = Date.now();
    this.time = (this.time + dt) % DAY_LENGTH;
    const t = this.timers;
    for (const k in t) t[k] -= dt;

    if (t.sync <= 0) {
      t.sync = 10;
      this.broadcast({ t: 'time', time: this.time });
    }
    if (t.names <= 0) {
      t.names = 60;
      for (const c of this.clients.values()) if (c.joined) this.seen(c.name);
    }
    if (t.expire <= 0) {
      t.expire = 600;
      this.expireClaims();
    }

    // Burning vehicles lose health until they blow up.
    const burnTick = t.burn <= 0;
    if (burnTick) t.burn = 1;
    for (const v of [...this.vehicles.values()]) {
      if (v.hp >= FIRE_HP) continue;
      v.hp -= 3 * dt;
      if (v.hp <= 0) this.destroyVehicle(v);
      else if (burnTick) this.broadcast({ t: 'car_hp', id: v.id, hp: Math.round(v.hp) });
    }

    for (const r of this.respawns.filter(r => r.at <= now)) {
      const home = this.homes.get(r.home);
      const v = home && this.spawn(home);
      if (v || !home) this.respawns.splice(this.respawns.indexOf(r), 1);
      else r.at = now + 10000; // no room yet; try again soon
      if (v) {
        this.broadcast({ t: 'car', car: publicVehicle(v) });
        this.onDirty();
      }
    }

    for (const s of this.saplings.filter(s => s.at <= now)) {
      if (this.growSapling(s)) this.saplings.splice(this.saplings.indexOf(s), 1);
    }

    if (t.state > 0) return;
    t.state = 1 / TICK_RATE;
    const list = [];
    for (const c of this.clients.values()) if (c.joined) list.push([c.id, ...c.pos, ...c.rot, c.pet, c.ball, c.flags]);
    if (list.length < 2) return;
    const cars = [];
    for (const v of this.vehicles.values()) {
      // Driven vehicles, plus parked ones that are rolling after being knocked.
      if (v.driver || now - (v.nudgedAt || 0) < 1500) cars.push([v.id, v.x, v.y, v.z, v.h, v.speed, v.steer, v.siren, v.pitch, v.roll, v.rotor, v.driver ? v.flags : 0]);
    }
    this.broadcast({ t: 'states', list, cars });
  }
}

// Opening or closing a door is allowed even on someone else's land.
function isDoorToggle(old, b) {
  return shapeOf(old) === 'door' && (old ^ b) === DOOR_OPEN << 8;
}

const publicPlayer = c => ({ id: c.id, name: c.name, look: c.look, pos: c.pos, rot: c.rot });
const publicVehicle = ({ id, kind, color, x, y, z, h, driver, passengers, hp }) => ({ id, kind, color, x, y, z, h, driver, passengers, hp: Math.round(hp) });
