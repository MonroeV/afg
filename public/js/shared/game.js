// The game "room": the world, players, cars and the clock.
// The Node server runs one of these for everybody. When there is no server,
// the browser runs its own copy so single player works exactly the same way.
import { blockKey, inBounds, isValidBlock, DAY_LENGTH, CAR_KINDS, WORLD } from './blocks.js';
import { sanitizeLook } from './avatar.js';
import { generateWorld } from './worldgen.js';

export const SAVE_VERSION = 2;
const TICK_RATE = 15;
const MAX_CARS = 80;
const CARS_PER_PLAYER = 3;
const CAR_COLORS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#ff7043', '#8e24aa', '#ec407a', '#26c6da', '#ffffff', '#212121'];

const num = v => (Number.isFinite(v) ? v : 0);
const clampWorld = v => Math.max(WORLD.min, Math.min(WORLD.max + 1, num(v)));
const cleanName = s => String(s ?? '').replace(/[^\w \-.]/g, '').trim().slice(0, 16) || 'Builder';

export class GameRoom {
  constructor({ maxPlayers = 32, onDirty = () => {}, log = () => {} } = {}) {
    this.maxPlayers = maxPlayers;
    this.onDirty = onDirty;
    this.log = log;
    this.world = new Map(); // "x,y,z" -> block value
    this.cars = new Map(); // id -> car
    this.clients = new Map(); // id -> client
    this.nextId = 1;
    this.nextCarId = 1;
    this.time = DAY_LENGTH * 0.08; // start in the morning
    this.timeSync = 0;
    this.stateTimer = 0;
  }

  // ---------- World data ----------

  generate() {
    const { blocks, cars } = generateWorld();
    this.world.clear();
    this.cars.clear();
    for (const [x, y, z, v] of blocks) this.world.set(blockKey(x, y, z), v);
    for (const c of cars) this.addCar(c);
  }

  load(data) {
    if (!data || data.version !== SAVE_VERSION) return false;
    this.world.clear();
    this.cars.clear();
    const b = data.blocks;
    for (let i = 0; i + 3 < b.length; i += 4) this.world.set(blockKey(b[i], b[i + 1], b[i + 2]), b[i + 3]);
    for (const c of data.cars || []) this.addCar(c);
    if (Number.isFinite(data.time)) this.time = data.time % DAY_LENGTH;
    return true;
  }

  serialize() {
    return {
      version: SAVE_VERSION,
      time: Math.round(this.time),
      blocks: this.flatBlocks(),
      cars: [...this.cars.values()].map(({ kind, color, x, y, z, h }) => ({ kind, color, x, y, z, h })),
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

  addCar({ kind, color, x, y, z, h, owner = 0 }) {
    const car = {
      id: this.nextCarId++,
      kind: CAR_KINDS.includes(kind) ? kind : 'car',
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      x: clampWorld(x), y: Math.max(0, num(y)), z: clampWorld(z), h: num(h),
      speed: 0, steer: 0, siren: 0, driver: 0, owner,
    };
    this.cars.set(car.id, car);
    return car;
  }

  // ---------- Connections ----------

  // `send` is a function that delivers one message object to this client.
  connect(send) {
    if (this.clients.size >= this.maxPlayers) {
      send({ t: 'full' });
      return null;
    }
    const client = { id: this.nextId++, send, joined: false, name: 'Builder', look: sanitizeLook(null), pos: [0, 0, 0], rot: [0, 0], car: 0, cars: [], buckets: {} };
    this.clients.set(client.id, client);
    return client;
  }

  disconnect(client) {
    this.clients.delete(client.id);
    if (!client.joined) return;
    this.leaveCar(client);
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
    client.send({
      t: 'welcome',
      id: client.id,
      time: this.time,
      dayLength: DAY_LENGTH,
      world: this.flatBlocks(),
      cars: [...this.cars.values()].map(publicCar),
      players: [...this.clients.values()].filter(o => o.joined && o !== client).map(publicPlayer),
    });
    this.broadcast({ t: 'join', ...publicPlayer(client) }, client);
    this.broadcast({ t: 'chat', system: true, text: `${client.name} joined` });
    this.log(`${client.name} joined (${this.clients.size} online)`);
  }

  leaveCar(client) {
    const car = this.cars.get(client.car);
    client.car = 0;
    if (!car || car.driver !== client.id) return;
    car.driver = 0;
    car.speed = car.steer = car.siren = 0;
    this.broadcast({ t: 'car_driver', ...publicCar(car) });
    this.onDirty();
  }

  handlers = {
    state(client, msg) {
      if (Array.isArray(msg.pos) && Array.isArray(msg.rot)) {
        client.pos = msg.pos.slice(0, 3).map(num);
        client.rot = msg.rot.slice(0, 2).map(num);
      }
    },

    set(client, { x, y, z, b }) {
      if (!inBounds(x, y, z) || !isValidBlock(b)) return;
      if (!this.allow(client, 'set', 25, 50)) return;
      const k = blockKey(x, y, z);
      if (b === 0) this.world.delete(k);
      else this.world.set(k, b);
      this.broadcast({ t: 'set', x, y, z, b }, client);
      this.onDirty();
    },

    chat(client, msg) {
      const text = String(msg.text ?? '').trim().slice(0, 160);
      if (!text || !this.allow(client, 'chat', 1, 5)) return;
      this.broadcast({ t: 'chat', name: client.name, color: client.look.shirtColor, text });
    },

    look(client, msg) {
      if (!this.allow(client, 'look', 1, 5)) return;
      client.look = sanitizeLook(msg.look);
      this.broadcast({ t: 'look', id: client.id, look: client.look }, client);
    },

    emote(client, msg) {
      if (!['dance', 'wave'].includes(msg.kind) || !this.allow(client, 'emote', 1, 3)) return;
      this.broadcast({ t: 'emote', id: client.id, kind: msg.kind }, client);
    },

    fx(client, msg) {
      if (msg.kind !== 'firework' || !this.allow(client, 'fx', 3, 6)) return;
      const color = /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color : '#ffffff';
      this.broadcast({ t: 'fx', kind: 'firework', x: num(msg.x), y: num(msg.y), z: num(msg.z), color, seed: num(msg.seed) }, client);
    },

    car_spawn(client, msg) {
      if (!CAR_KINDS.includes(msg.kind) || !this.allow(client, 'car', 1, 3)) return;
      if (!inBounds(Math.floor(msg.x), Math.floor(msg.y), Math.floor(msg.z))) return;
      // Each player can have a few cars; the oldest one goes away when they spawn more.
      client.cars = client.cars.filter(id => this.cars.has(id));
      while (client.cars.length >= CARS_PER_PLAYER) {
        const old = this.cars.get(client.cars[0]);
        if (old?.driver) break;
        this.cars.delete(client.cars.shift());
        this.broadcast({ t: 'car_remove', id: old.id });
      }
      if (client.cars.length >= CARS_PER_PLAYER || this.cars.size >= MAX_CARS) {
        client.send({ t: 'chat', system: true, text: 'Too many cars! Remove one with the hammer first.' });
        return;
      }
      const car = this.addCar({ kind: msg.kind, x: msg.x, y: msg.y, z: msg.z, h: msg.h, owner: client.id, color: msg.kind === 'police' ? '#f5f5f5' : undefined });
      client.cars.push(car.id);
      this.broadcast({ t: 'car', car: publicCar(car) });
      this.onDirty();
    },

    car_enter(client, { id }) {
      const car = this.cars.get(id);
      if (!car || car.driver || client.car) return;
      car.driver = client.id;
      client.car = id;
      this.broadcast({ t: 'car_driver', ...publicCar(car) });
    },

    car_exit(client) {
      this.leaveCar(client);
    },

    car_state(client, msg) {
      const car = this.cars.get(msg.id);
      if (!car || car.driver !== client.id) return;
      car.x = clampWorld(msg.x);
      car.y = Math.max(0, Math.min(WORLD.maxY, num(msg.y)));
      car.z = clampWorld(msg.z);
      car.h = num(msg.h);
      car.speed = num(msg.speed);
      car.steer = num(msg.steer);
      car.siren = msg.siren ? 1 : 0;
    },

    car_remove(client, { id }) {
      const car = this.cars.get(id);
      if (!car || car.driver) return;
      this.cars.delete(id);
      this.broadcast({ t: 'car_remove', id });
      this.onDirty();
    },

    horn(client) {
      if (!client.car || !this.allow(client, 'horn', 3, 4)) return;
      this.broadcast({ t: 'horn', id: client.car }, client);
    },
  };

  // ---------- Clock ----------

  tick(dt) {
    this.time = (this.time + dt) % DAY_LENGTH;
    this.timeSync -= dt;
    if (this.timeSync <= 0) {
      this.timeSync = 10;
      this.broadcast({ t: 'time', time: this.time });
    }
    this.stateTimer -= dt;
    if (this.stateTimer > 0) return;
    this.stateTimer = 1 / TICK_RATE;
    const list = [];
    for (const c of this.clients.values()) if (c.joined) list.push([c.id, ...c.pos, ...c.rot]);
    if (list.length < 2) return;
    const cars = [];
    for (const car of this.cars.values()) {
      if (car.driver) cars.push([car.id, car.x, car.y, car.z, car.h, car.speed, car.steer, car.siren]);
    }
    this.broadcast({ t: 'states', list, cars });
  }
}

const publicPlayer = c => ({ id: c.id, name: c.name, look: c.look, pos: c.pos, rot: c.rot });
const publicCar = ({ id, kind, color, x, y, z, h, driver }) => ({ id, kind, color, x, y, z, h, driver });
