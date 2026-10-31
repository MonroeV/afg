// The game "room": the world, players, vehicles, land claims, growing trees and the clock.
// The Node server runs one of these for everybody. When there is no server,
// the browser runs its own copy so single player works exactly the same way.
import { blockKey, inBounds, isValidBlock, isSolidBlock, blocksVehicles, blockId, shapeOf, itemOf, floorOf, validFaces, carryPaint, isWaterBlock, isExclusive, DOOR_OPEN, DAY_LENGTH, WORLD, isNightTime, SHOP_ITEMS, BLOCKS, SHOP_TOOLS } from './blocks.js';
import { sanitizeLook, cleanName } from './avatar.js';
import { generateWorld, helipadBlocks, upgradeLamps, buildLandmarks, buildLake, orientRoadLines, buildStore, furnishHouses, furnishTowers } from './worldgen.js';
import { NpcCrew } from './npcs.js';
import { VEHICLES, MAX_HP, FIRE_HP, findVehicleSpot } from './vehicles.js';
import { normalizeRect, claimSizeOk, rectsOverlap, canBuild, claimAt, nameKey, CLAIM_EXPIRE_DAYS, CLAIM_MAX } from './claims.js';

export const SAVE_VERSION = 7;
const COIN_COUNT = 26; // gold coins lying around the world at once
const DAILY_BONUS = 10;
const RACE_PRIZE = 3;
const FIX_AMOUNT = 8; // health a turn of the wrench puts back (out of 100)
const TICK_RATE = 15; // how often the town's people's positions go out
const DAY_MS = 24 * 60 * 60 * 1000;
const LOG = 7, LEAVES = 8, GRASS = 1, DIRT = 2, RACE_FINISH = 72;
export const MAX_MANY = 4096; // the most blocks one Fill or Paste can change

const num = v => (Number.isFinite(v) ? v : 0);
const clampWorld = v => Math.max(WORLD.min, Math.min(WORLD.max + 1, num(v)));
const numbers = (a, n) => (Array.isArray(a) ? a.slice(0, n).map(num) : 0);

export class GameRoom {
  constructor({ maxPlayers = 32, onDirty = () => {}, log = () => {} } = {}) {
    this.maxPlayers = maxPlayers;
    this.onDirty = onDirty;
    this.log = log;
    this.world = new Map(); // "x,y,z" -> block value
    this.paints = new Map(); // painted sides: "x,y,z" or "x,y,z|f" -> six colors (see blocks.js)
    this.vehicles = new Map(); // id -> vehicle
    this.homes = new Map(); // id -> where a vehicle lives: { id, kind, color, x, y, z, h }
    this.respawns = []; // { home, at }
    this.clients = new Map(); // id -> client
    this.claims = []; // { owner, key, x0, z0, x1, z1, createdAt }
    this.names = {}; // lowercase name -> last time someone played with it
    this.saplings = []; // logs growing into trees
    this.races = {}; // finish line "x,y,z" -> best times [{ name, key, time }]
    this.places = null; // where the store, the tower lobby and the town square are (for the NPCs)
    this.wallets = {}; // name key -> { coins, owned: [items], day }
    this.coins = new Map(); // id -> [x, y, z, value]: gold coins to pick up
    this.coinTimers = []; // when to put new coins out
    this.nextCoin = 1;
    this.npcs = new NpcCrew(this);
    this.nextId = 1;
    this.nextVehicleId = 1;
    this.nextHomeId = 1;
    this.time = DAY_LENGTH * 0.08; // start in the morning
    this.timers = { sync: 0, state: 0, names: 0, expire: 0, burn: 0 };
    this.isSolid = (x, y, z) =>
      y < 0 || x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max ||
      blocksVehicles(this.world.get(blockKey(x, y, z)) || 0);
    this.isWater = (x, y, z) => isWaterBlock(this.world.get(blockKey(x, y, z)) || 0);
  }

  // ---------- World data ----------

  generate() {
    const { blocks, cars, places, claims } = generateWorld();
    this.world.clear();
    for (const [x, y, z, v] of blocks) this.world.set(blockKey(x, y, z), v);
    this.setHomes(cars);
    this.places = places;
    this.claims = claims.slice();
    this.populate();
  }

  // People at work, and coins lying about.
  populate() {
    this.npcs.setup(this.places);
    this.coins.clear();
    for (let i = 0; i < COIN_COUNT; i++) this.dropCoin();
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
    const spot = findVehicleSpot(this.isSolid, VEHICLES[home.kind], home, [...this.vehicles.values()], this.isWater);
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
      this.setHomes(generateWorld().cars.filter(c => !c.landmark));
      this.upgradeLamps();
      this.upgradeTo5();
      this.upgradeTo6();
      this.upgradeTo7();
      this.populate();
      return true;
    }
    this.vehicles.clear();
    this.homes.clear();
    for (const h of data.homes || []) this.addHome(h);
    for (const v of data.vehicles || []) if (this.homes.has(v.home)) this.addVehicle({ ...this.homes.get(v.home), ...v });
    const parked = new Set([...this.vehicles.values()].map(v => v.home));
    this.respawns = [...this.homes.values()].filter(h => !parked.has(h.id)).map(home => ({ home: home.id, at: Date.now() + 30000 }));
    this.claims = (data.claims || []).filter(c => c && c.key);
    this.paints = new Map((data.paints || []).filter(([k, f]) => typeof k === 'string' && this.world.has(k.split('|')[0]) && validFaces(f)));
    this.names = data.names || {};
    this.saplings = data.saplings || [];
    this.races = {};
    for (const [k, list] of Object.entries(data.races && typeof data.races === 'object' ? data.races : {})) {
      if (Array.isArray(list)) this.races[k] = list.filter(r => r && typeof r.name === 'string' && Number.isFinite(r.time)).slice(0, 5);
    }
    this.wallets = {};
    for (const [k, w] of Object.entries(data.wallets && typeof data.wallets === 'object' ? data.wallets : {})) {
      if (w && Number.isFinite(w.coins)) this.wallets[k] = { coins: Math.max(0, Math.floor(w.coins)), owned: Array.isArray(w.owned) ? w.owned.filter(i => SHOP_ITEMS.some(([s]) => s === i)) : [], day: w.day || '' };
    }
    this.places = data.places && typeof data.places === 'object' ? data.places : null;
    this.expireClaims();
    if (data.version < 4) this.upgradeLamps();
    if (data.version < 5) this.upgradeTo5();
    if (data.version < 6) this.upgradeTo6();
    if (data.version < 7) this.upgradeTo7();
    this.populate();
    return true;
  }

  // Worlds saved before version 7: the Luxe Store (on empty land), and furniture in the
  // houses and towers nobody has changed (only in empty spots: nothing anyone built is touched).
  upgradeTo7() {
    const get = (x, y, z) => this.get(x, y, z);
    const set = (x, y, z, v) => {
      if (inBounds(x, y, z) && v) this.world.set(blockKey(x, y, z), v);
    };
    const each = fn => {
      for (const [k, v] of [...this.world]) {
        const [x, y, z] = k.split(',').map(Number);
        fn(x, y, z, v);
      }
    };
    const canUse = this.freeLand();
    const store = buildStore({ get, set, canUse });
    if (store) this.claims.push(store.claim);
    furnishHouses({ each, get, set, canUse });
    const towers = furnishTowers({ each, get, set, canUse });
    this.places = { plaza: { x: 0, z: 0 }, store: store?.place || null, tower: towers.find(t => t.lobby)?.lobby || null };
    this.onDirty();
  }

  // Land a new landmark may be built on: nobody has claimed it, and no vehicle is parked
  // there off the road (cars parked along a road are never in the way).
  freeLand() {
    const onRoad = h => [22, 23, 24, 55].includes(blockId(this.get(Math.floor(h.x), 0, Math.floor(h.z))));
    const parked = [...this.homes.values()].filter(h => !onRoad(h));
    return (x, z) => !claimAt(this.claims, x, z) && parked.every(h => Math.hypot(h.x - x, h.z - z) > 5);
  }

  // Worlds saved before version 6: a lake with a dock and boats, on empty land.
  upgradeTo6() {
    const lake = buildLake({ get: (x, y, z) => this.get(x, y, z), set: (x, y, z, v) => this.world.set(blockKey(x, y, z), v), canUse: this.freeLand() });
    if (lake) for (const c of lake.cars) this.spawn(this.addHome(c));
    this.onDirty();
  }

  // Worlds saved before version 5: road lines turn to run along their roads, and parking
  // lots and skyscrapers go up on empty land (never on anything built, claimed or parked on).
  upgradeTo5() {
    const get = (x, y, z) => this.get(x, y, z), set = (x, y, z, v) => this.world.set(blockKey(x, y, z), v);
    orientRoadLines([...this.world].filter(([, v]) => blockId(v) === 23).map(([k]) => k), get, set);
    for (const c of buildLandmarks({ get, set, canUse: this.freeLand() }).cars) this.spawn(this.addHome(c));
    this.onDirty();
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
      paints: [...this.paints],
      // Best race times, for finish lines that are still there.
      races: Object.fromEntries(Object.entries(this.races).filter(([k]) => this.isFinish(k))),
      places: this.places,
      wallets: this.wallets,
    };
  }

  isFinish(key) {
    const v = this.world.get(key) || 0;
    return blockId(itemOf(v)) === RACE_FINISH || blockId(floorOf(v)) === RACE_FINISH;
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

  // ---------- Coins and the store ----------

  wallet(client) {
    return (this.wallets[nameKey(client.name)] ??= { coins: 0, owned: [], day: '' });
  }

  sendWallet(client) {
    const w = this.wallet(client);
    client.send({ t: 'wallet', coins: w.coins, owned: w.owned });
  }

  owns(client, v) {
    const owned = this.wallet(client).owned;
    return [itemOf(v) & 255, floorOf(v) & 255].every(id => !BLOCKS[id]?.price || owned.includes(id));
  }

  pay(client, amount) {
    this.wallet(client).coins += amount;
    this.sendWallet(client);
    this.onDirty();
  }

  // A gold coin somewhere out of doors: on a road, a path or the grass, with sky above.
  dropCoin() {
    for (let tries = 0; tries < 60; tries++) {
      const x = Math.floor(Math.random() * 220) - 110, z = Math.floor(Math.random() * 220) - 110;
      const here = this.get(x, 0, z);
      if (here && shapeOf(here) !== 'flat') continue;
      if (blockId(itemOf(here)) === 36) continue; // not in the water
      let open = true;
      for (let y = 1; y < 12 && open; y++) if (this.get(x, y, z)) open = false;
      if (!open || [...this.coins.values()].some(c => Math.hypot(c[0] - x, c[2] - z) < 8)) continue;
      const r = Math.random(), value = r < 0.08 ? 5 : r < 0.3 ? 2 : 1;
      const id = this.nextCoin++;
      this.coins.set(id, [x + 0.5, 0, z + 0.5, value]);
      this.broadcast({ t: 'coin_new', id, x: x + 0.5, y: 0, z: z + 0.5, value });
      return;
    }
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
      build: this.build, // (the server's version of the game files; none in single player)
      time: this.time,
      dayLength: DAY_LENGTH,
      world: this.flatBlocks(),
      paints: [...this.paints],
      cars: [...this.vehicles.values()].map(publicVehicle),
      claims: this.claims,
      players: [...this.clients.values()].filter(o => o.joined && o !== client).map(publicPlayer),
      npcs: this.npcs.info(),
      coins: [...this.coins].map(([id, c]) => [id, ...c]),
    });
    // Coins: your wallet, and a little present the first time you play each day.
    const wallet = this.wallet(client);
    const today = new Date().toISOString().slice(0, 10);
    if (wallet.day !== today) {
      wallet.day = today;
      wallet.coins += DAILY_BONUS;
      client.send({ t: 'chat', system: true, text: `🪙 Daily bonus: ${DAILY_BONUS} coins! Spend them at the Luxe Store.` });
      this.onDirty();
    }
    this.sendWallet(client);
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
    this.npcs.onExplosion(v.x, v.y, v.z);
    if (this.homes.has(v.home)) this.respawns.push({ home: v.home, at: Date.now() + VEHICLES[v.kind].respawn * 1000 });
    this.onDirty();
  }

  // Close enough to reach it (or in it).
  nearVehicle(client, v) {
    return client.car === v.id || Math.hypot(client.pos[0] - v.x, client.pos[1] - v.y, client.pos[2] - v.z) < 14;
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
      // When they were there, on their own clock: other players replay their moves at that pace.
      client.ts = Number.isFinite(msg.ts) ? msg.ts : null;
      client.fresh = true;
      client.hold = typeof msg.hold === 'string' || typeof msg.hold === 'number' ? String(msg.hold).slice(0, 16) : '';
    },

    set(client, { x, y, z, b }) {
      if (!inBounds(x, y, z) || !isValidBlock(b)) return;
      const old = this.get(x, y, z);
      // Things from the Luxe Store can only be put down by someone who bought them.
      if (isExclusive(b) && !this.owns(client, b) && !(isExclusive(old) && (old & ~(15 << 8)) === (b & ~(15 << 8)))) {
        client.send({ t: 'set', x, y, z, b: old });
        return;
      }
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
      // Paint goes with the block: it's gone when the block is broken or replaced.
      carryPaint(this.paints, k, old, b);
      this.broadcast({ t: 'set', x, y, z, b }, client);
      if (blockId(b) === LOG && blockId(old) !== LOG) this.maybePlant(x, y, z);
      this.onDirty();
    },

    // Painting one or more sides of a block (or of the floor under a lamp or door).
    paint(client, { x, y, z, floor, faces }) {
      const v = this.get(x, y, z);
      if (!inBounds(x, y, z) || !v || (floor && !floorOf(v)) || !(faces === null || validFaces(faces))) return;
      const key = blockKey(x, y, z) + (floor ? '|f' : '');
      if (!this.allow(client, 'paint', 20, 60) || !canBuild(this.claims, client.name, x, z)) {
        // Too fast, or not your land: put the paint back the way it was for this player.
        client.send({ t: 'paint', x, y, z, floor: !!floor, faces: this.paints.get(key) || null });
        return;
      }
      if (!faces || faces.every(c => c < 0)) this.paints.delete(key);
      else this.paints.set(key, faces.slice());
      this.broadcast({ t: 'paint', x, y, z, floor: !!floor, faces: this.paints.get(key) || null }, client);
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
      if (msg.kind === 'dance') this.npcs.onDance(client);
    },

    fx(client, msg) {
      if (!['firework', 'hearts', 'sparkle', 'bubbles', 'balloon'].includes(msg.kind) || !this.allow(client, 'fx', 5, 10)) return;
      const color = /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color : '#ffffff';
      this.broadcast({ t: 'fx', kind: msg.kind, x: num(msg.x), y: num(msg.y), z: num(msg.z), color, seed: num(msg.seed), dir: numbers(msg.dir, 3) || undefined }, client);
      if (msg.kind === 'firework') setTimeout(() => this.npcs.onFirework(num(msg.x), num(msg.y) + 30, num(msg.z)), 1600);
    },

    // Lots of blocks at once: the Fill Wand, the Copy Wand's paste, and undoing them.
    // cells: [x, y, z, block, x, y, z, block, …]
    many(client, { cells }) {
      if (!Array.isArray(cells) || cells.length % 4 || cells.length > MAX_MANY * 4) return;
      const back = [];
      const tooFast = !this.allow(client, 'many', 0.7, 3);
      const applied = [];
      let blocked = null;
      for (let i = 0; i < cells.length; i += 4) {
        const [x, y, z, b] = cells.slice(i, i + 4);
        if (!inBounds(x, y, z) || !isValidBlock(b)) continue;
        const old = this.get(x, y, z);
        if (tooFast || !canBuild(this.claims, client.name, x, z) || (isExclusive(b) && !this.owns(client, b))) {
          // Not allowed: put it back the way it was for this player.
          back.push(x, y, z, old);
          if (!tooFast) blocked ??= claimAt(this.claims, x, z);
          continue;
        }
        if (old === b) continue;
        const k = blockKey(x, y, z);
        if (b === 0) this.world.delete(k);
        else this.world.set(k, b);
        carryPaint(this.paints, k, old, b);
        applied.push(x, y, z, b);
      }
      if (applied.length) {
        this.broadcast({ t: 'many', cells: applied }, client);
        this.onDirty();
      }
      if (back.length) client.send({ t: 'many', cells: back });
      if (blocked && this.allow(client, 'claimMsg', 0.2, 1)) client.send({ t: 'chat', system: true, text: `🚧 Some of that is ${blocked.owner}'s land, so it was left alone.` });
      if (tooFast) client.send({ t: 'chat', system: true, text: '🐢 Whoa, slow down! Wait a moment between big builds.' });
    },

    // Water balloons: everyone's game shows the balloon flying (and works out who it hits).
    throw(client, msg) {
      if (!this.allow(client, 'throw', 4, 8)) return;
      const p = numbers(msg.p, 3), v = numbers(msg.v, 3);
      if (!p || !v) return;
      const color = /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color : '#42a5f5';
      this.broadcast({ t: 'throw', id: client.id, p, v: v.map(n => Math.max(-40, Math.min(40, n))), color }, client);
      this.npcs.onThrow(client, p, v);
    },

    // Picking up a gold coin (you have to really be next to it).
    coin(client, { id }) {
      const c = this.coins.get(id);
      if (!c || !this.allow(client, 'coin', 6, 10)) return;
      if (Math.hypot(client.pos[0] - c[0], client.pos[2] - c[2]) > 3 || Math.abs(client.pos[1] - c[1]) > 3) return;
      this.coins.delete(id);
      this.broadcast({ t: 'coin_gone', id, by: client.id });
      this.pay(client, c[3]);
      client.send({ t: 'coin_got', value: c[3] });
      this.coinTimers.push(Date.now() + 15000 + Math.random() * 25000);
    },

    // Buying something at the Luxe Store.
    buy(client, { item }) {
      const entry = SHOP_ITEMS.find(([i]) => i === item);
      if (!entry || !this.allow(client, 'buy', 1, 3)) return;
      const w = this.wallet(client), [, price] = entry;
      const name = typeof item === 'number' ? BLOCKS[item].name : SHOP_TOOLS[item].name;
      const reply = text => client.send({ t: 'chat', system: true, text });
      if (w.owned.includes(item)) return reply(`🛍️ You already have the ${name}!`);
      if (w.coins < price) return reply(`🪙 The ${name} costs ${price} coins, and you have ${w.coins}. Find more coins around town!`);
      w.coins -= price;
      w.owned.push(item);
      this.sendWallet(client);
      this.onDirty();
      reply(`🛍️ You bought the ${name}! It's in your items now (press E).`);
      this.npcs.onBuy(client, item);
    },

    // Right-clicking one of the town's people.
    npc_talk(client, { id }) {
      if (this.allow(client, 'talk', 1, 3)) this.npcs.onTalk(client, num(id));
    },

    // Someone got splashed: tell whoever threw it.
    splashed(client, { by }) {
      const thrower = this.clients.get(by);
      if (!thrower || thrower === client || !this.allow(client, 'splashed', 3, 5)) return;
      thrower.send({ t: 'splash_hit', name: client.name });
    },

    // Crossing a finish line: the time since crossing a start line (timed by the racer).
    race(client, { x, y, z, time }) {
      time = Math.round(num(time) * 100) / 100;
      if (!inBounds(x, y, z) || time < 1 || time > 3600 || !this.allow(client, 'race', 0.5, 2)) return;
      const key = blockKey(x, y, z);
      if (!this.isFinish(key)) return;
      const list = (this.races[key] ||= []);
      const me = nameKey(client.name);
      const record = !list.length || time < list[0].time;
      const mine = list.find(r => r.key === me);
      if (!mine || time < mine.time) {
        this.races[key] = list.filter(r => r.key !== me).concat({ name: client.name, key: me, time }).sort((a, b) => a.time - b.time).slice(0, 5);
        this.onDirty();
      }
      const place = this.races[key].findIndex(r => r.key === me && r.time === time);
      const medal = ['🥇', '🥈', '🥉', '4th', '5th'][place] || '';
      this.broadcast({ t: 'chat', system: true, text: `🏁 ${client.name} finished in ${time.toFixed(2)} s!${record ? ' 🥇 NEW RECORD!' : place >= 0 ? ` ${medal} on the leaderboard` : ''}` });
      client.send({ t: 'race_board', board: this.races[key].map(r => [r.name, r.time]) });
      this.pay(client, RACE_PRIZE);
      client.send({ t: 'chat', system: true, text: `🪙 +${RACE_PRIZE} coins for finishing the race!` });
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
      v.ts = Number.isFinite(msg.ts) ? msg.ts : null;
      v.fresh = true;
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

    // The Paint Brush on a vehicle: a new color, for good (it comes back that color, too).
    car_paint(client, msg) {
      const v = this.vehicles.get(msg.id);
      const color = typeof msg.color === 'string' && /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color.toLowerCase() : null;
      if (!v || !color || !this.allow(client, 'carPaint', 4, 6)) return;
      if (!this.nearVehicle(client, v)) return client.send({ t: 'car_color', id: v.id, color: v.color });
      v.color = color;
      const home = this.homes.get(v.home);
      if (home) home.color = color;
      this.broadcast({ t: 'car_color', id: v.id, color });
      this.onDirty();
    },

    // The Wrench: each turn of it fixes a bit of the damage (and can even save a burning one).
    car_fix(client, msg) {
      const v = this.vehicles.get(msg.id);
      if (!v || v.hp >= MAX_HP || !this.allow(client, 'fix', 5, 6) || !this.nearVehicle(client, v)) return;
      v.hp = Math.min(MAX_HP, v.hp + FIX_AMOUNT);
      this.broadcast({ t: 'car_hp', id: v.id, hp: Math.round(v.hp), fixer: client.id });
      this.onDirty();
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
      if (!claimSizeOk(rect)) return reply(`🚧 Land can be at most ${CLAIM_MAX} by ${CLAIM_MAX} blocks.`);
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
    this.claims = this.claims.filter(c => c.permanent || (this.names[c.key] || c.createdAt) > limit);
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
    // New coins to replace the ones picked up, and the town's people going about their day.
    for (const at of this.coinTimers.filter(at => at <= now)) {
      this.coinTimers.splice(this.coinTimers.indexOf(at), 1);
      this.dropCoin();
    }
    if (this.clients.size) this.npcs.update(dt);

    // Where everyone is. Players' and drivers' updates are passed on as soon as they come in
    // (every tick), so none get skipped or bunched up; the town's people go out 15 times a second.
    const slow = t.state <= 0;
    if (slow) t.state = Math.max(0, t.state + 1 / TICK_RATE);
    let joined = 0;
    for (const c of this.clients.values()) if (c.joined) joined++;
    const list = [], cars = [];
    for (const c of this.clients.values()) {
      if (c.joined && c.fresh && joined > 1) list.push([c.id, ...c.pos, ...c.rot, c.pet, c.ball, c.flags, c.ts]);
      c.fresh = false;
    }
    for (const v of this.vehicles.values()) {
      // Driven vehicles, plus parked ones that are rolling after being knocked.
      if (joined > 1 && (v.driver ? v.fresh : slow && now - (v.nudgedAt || 0) < 1500)) {
        cars.push([v.id, v.x, v.y, v.z, v.h, v.speed, v.steer, v.siren, v.pitch, v.roll, v.rotor, v.driver ? v.flags : 0, v.driver ? v.ts : null]);
      }
      v.fresh = false;
    }
    const people = slow && joined && this.npcs.list.length;
    if (!list.length && !cars.length && !people) return;
    const msg = { t: 'states', list, cars };
    if (people) Object.assign(msg, { npcs: this.npcs.states(), ts: Math.round(performance.now()) });
    this.broadcast(msg);
  }
}

// Opening or closing a door is allowed even on someone else's land.
function isDoorToggle(old, b) {
  return shapeOf(old) === 'door' && (old ^ b) === DOOR_OPEN << 8;
}

const publicPlayer = c => ({ id: c.id, name: c.name, look: c.look, pos: c.pos, rot: c.rot });
const publicVehicle = ({ id, kind, color, x, y, z, h, driver, passengers, hp }) => ({ id, kind, color, x, y, z, h, driver, passengers, hp: Math.round(hp) });
