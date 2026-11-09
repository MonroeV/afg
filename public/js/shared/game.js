// The game "room": the world, players, vehicles, land claims, growing trees and the clock.
// The Node server runs one of these for everybody. When there is no server,
// the browser runs its own copy so single player works exactly the same way.
import { blockKey, inBounds, isValidBlock, isSolidBlock, blocksVehicles, blockId, shapeOf, itemOf, floorOf, validFaces, carryPaint, isWaterBlock, isExclusive, DOOR_OPEN, DOOR_TOP, DAY_LENGTH, WORLD, isNightTime, SHOP_ITEMS, BLOCKS, SHOP_TOOLS, FOUND_GEAR, HOLE_HEAL, SIGN, cleanSignText, cleanWords } from './blocks.js';
import { sanitizeLook, cleanName, randomLook } from './avatar.js';
import { generateWorld, helipadBlocks, upgradeLamps, buildLandmarks, buildLake, orientRoadLines, buildStore, furnishHouses, furnishTowers, elevatorTowers } from './worldgen.js';
import { buildSecretBase, hideSecretFiles, AGENCY, AGENT_SPOT, FILES_NEEDED, FILE_HINTS, inZone } from './secretbase.js';
import { NpcCrew } from './npcs.js';
import { buildFrontier, buildPizzeria, buildSignposts, refurnish, addFishingSpots } from './frontier.js';
import { buildFarCountry, moreVehicles } from './farcountry.js';
import { VEHICLES, MAX_HP, FIRE_HP, findVehicleSpot, seatCount } from './vehicles.js';
import { buildGasStations, usesFuel, getsDirty, TANK_RANGE, GAS_PUMP, GAS_CAN, GAS_CAN_PRICE, FULL_TANK_PRICE, PUMP_REACH, DIRT_RANGE, WASH_TIME, fillPrice, paved, isWash } from './fuel.js';
import { MAX_TUNNELS, isTunnelY, tunnelKey, openBelow } from './underground.js';
import { buildShops } from './shops.js';
import { findHomes } from './residents.js';
import { Quests, cleanQuest } from './quests.js';
import { CLUBS, clubById, PIZZA_TIP, MAGNET, STREAK_MAX } from './clubs.js';
import { normalizeRect, claimSizeOk, rectsOverlap, canBuild, claimAt, nameKey, CLAIM_EXPIRE_DAYS, CLAIM_MAX } from './claims.js';

export const SAVE_VERSION = 15;
const MAX_FAMILY = 5; // people in a family (from the Luxe Store)
const MAX_HOLES = 3000; // holes in the ground at once
const JOB_TIP = 2; // extra coins for a quick pizza delivery
const DOOR = 21;
const VACATION = 'vacationflag';
const COIN_COUNT = 26; // gold coins lying around the world at once
const DAILY_BONUS = 10;
const RACE_PRIZE = 3;
const FIX_AMOUNT = 8; // health a turn of the wrench puts back (out of 100)
const TOWN_REFILL = 10 * 60 * 1000; // a town vehicle left nearly empty this long gets filled up by the town
const MUDDY = new Set([1, 2, 10, 87]); // grass, dirt, sand, snow
const TICK_RATE = 15;
// The town mends itself: its own things (as the world was made), changed outside anyone's land,
// slowly go back the way they were. Not until they've been left like that a while, a couple of
// blocks at a time, and never right where someone is.
const MEND_AFTER = 15 * 60 * 1000;
const MEND_EVERY = 2; // seconds
const MEND_EACH = 2; // blocks each time
const MEND_AWAY = 14; // blocks from anyone // how often the town's people's positions go out
const DAY_MS = 24 * 60 * 60 * 1000;
// Rain: now and then, not often. Between showers it stays dry for 30 to 75 minutes; a shower lasts
// 1½ to 3½ minutes (so it rains about once an hour, and about one minute in twenty-five).
const RAIN_CALM = [30 * 60, 75 * 60], RAIN_SHOWER = [90, 210];
const between = ([a, b]) => a + Math.random() * (b - a);
const LOG = 7, LEAVES = 8, GRASS = 1, DIRT = 2, RACE_FINISH = 72;
export const MAX_OWNED_VEHICLES = 3; // vehicles one person can have of their own
export const MAX_MANY = 4096; // the most blocks one Fill or Paste can change

// What's in the water (sit on a fishing stool by the water and click to cast): name, emoji,
// coins, and how often it bites (out of all of them added up).
export const FISH = [
  { name: 'Minnow', icon: '🐟', coins: 1, chance: 30 },
  { name: 'Sunfish', icon: '🐠', coins: 1, chance: 22 },
  { name: 'Perch', icon: '🐟', coins: 2, chance: 15 },
  { name: 'Old Boot', icon: '👢', coins: 0, chance: 8 },
  { name: 'Puffer Fish', icon: '🐡', coins: 2, chance: 8 },
  { name: 'Rainbow Trout', icon: '🌈', coins: 3, chance: 8 },
  { name: 'Crab', icon: '🦀', coins: 2, chance: 5 },
  { name: 'Golden Koi', icon: '✨', coins: 8, chance: 3 },
  { name: 'Giant Catfish', icon: '🐋', coins: 5, chance: 1 },
];
const FISH_WAIT = [5000, 12000]; // ms before a bite
const FISH_BITE = 1800; // ms you have to reel it in once it bites

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
    this.spots = {}; // lowercase name -> where they were when they left: [x, y, z, yaw, when]
    this.saplings = []; // logs growing into trees
    this.races = {}; // finish line "x,y,z" -> best times [{ name, key, time }]
    this.places = null; // where the store, the tower lobby and the town square are (for the NPCs)
    this.wallets = {}; // name key -> { coins, owned: [items], day }
    this.holes = new Map(); // "x,z" -> when the ground there was dug out (it grows back)
    this.tunnels = new Set(); // "x,y,z" dug out underground (secret tunnels: see underground.js)
    this.signs = new Map(); // "x,y,z" -> what that sign says
    this.jobs = new Map(); // client id -> the pizza they're delivering: { x, z, reward, par, at }
    this.coins = new Map(); // id -> [x, y, z, value]: gold coins to pick up
    this.coinTimers = []; // when to put new coins out
    this.nextCoin = 1;
    this.npcs = new NpcCrew(this);
    this.quests = new Quests(this);
    this.nextId = 1;
    this.nextVehicleId = 1;
    this.nextHomeId = 1;
    this.time = DAY_LENGTH * 0.08; // start in the morning
    this.timers = { sync: 0, state: 0, names: 0, expire: 0, burn: 0, holes: 5 };
    this.isSolid = (x, y, z) =>
      y < 0 || x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max ||
      blocksVehicles(this.world.get(blockKey(x, y, z)) || 0);
    this.isWater = (x, y, z) => isWaterBlock(this.world.get(blockKey(x, y, z)) || 0);
  }

  // The ground (y = -1) is solid unless it's been dug out; under it, the earth is solid except where
  // Tunnel Diggers have dug tunnels; the bedrock under that always is.
  groundSolid(x, y, z) {
    return y < 0 && !openBelow(this.holes, this.tunnels, x, y, z);
  }

  // ---------- Under the ground ----------

  // Is (x, y, z) a spot under the ground this player may build in: a hole in the ground (anyone),
  // or a tunnel (Tunnel Diggers only)?
  underground(client, x, y, z) {
    if (!Number.isInteger(y) || y >= 0 || !inBounds(x, 0, z)) return false;
    if (y < -1 && !this.perk(client, 'tunnel')) return false;
    return openBelow(this.holes, this.tunnels, x, y, z);
  }

  // Tunnels are secret: only Tunnel Diggers hear about anything down there.
  diggers() {
    return [...this.clients.values()].filter(c => c.joined && this.perk(c, 'tunnel'));
  }

  tellDiggers(msg, except) {
    for (const c of this.diggers()) if (c !== except) c.send(msg);
  }

  // Everything secret under the ground (for someone who's just become a Tunnel Digger, or joins as one).
  undergroundInfo() {
    const blocks = [];
    for (const [k, v] of this.world) {
      const [x, y, z] = k.split(',').map(Number);
      if (y < -1) blocks.push(x, y, z, v);
    }
    return { tunnels: [...this.tunnels].map(k => k.split(',').map(Number)), blocks };
  }

  // ---------- World data ----------

  generate() {
    const { blocks, cars, places, claims, signs } = generateWorld();
    this.world.clear();
    this.holes.clear();
    this.tunnels.clear();
    this.signs.clear();
    for (const [x, y, z, v] of blocks) this.world.set(blockKey(x, y, z), v);
    this.setHomes(cars);
    this.places = places;
    this.claims = claims.slice();
    for (const [x, y, z, text] of signs || []) this.signs.set(blockKey(x, y, z), cleanSignText(text));
    this.setOriginal({ blocks, signs });
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

  // A vehicle's home: where it's parked when the world starts, and where it comes back after it
  // blows up. Someone's own vehicle (owner, key) has a home of its own: where they last parked it.
  addHome({ id, kind, color, x, y, z, h, owner, key }) {
    const home = {
      id: id || this.nextHomeId++,
      kind: VEHICLES[kind] ? kind : 'car',
      color: /^#[0-9a-f]{6}$/i.test(color) || color === 'gold' ? color : ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#ff7043', '#8e24aa', '#ec407a', '#26c6da'][this.homes.size % 8],
      x: num(x), y: num(y), z: num(z), h: num(h),
    };
    if (typeof key === 'string' && key) Object.assign(home, { owner: cleanName(owner), key: key.slice(0, 32) });
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

  addVehicle({ kind, color, x, y, z, h, home, hp, fuel, dirt }) {
    const owned = this.homes.get(home);
    const v = {
      id: this.nextVehicleId++, kind, color, home,
      x: clampWorld(x), y: Math.max(0, num(y)), z: clampWorld(z), h: num(h),
      hp: Math.max(1, Math.min(MAX_HP, Number.isFinite(hp) ? hp : MAX_HP)),
      speed: 0, steer: 0, siren: 0, pitch: 0, roll: 0, rotor: 0, flags: 0, driver: 0, passengers: [],
      owner: owned?.key ? owned.owner : '', key: owned?.key || '', loaded: false,
      // Gas in the tank (0..1) and how dirty it is (0..1). New ones come full and clean.
      fuel: Number.isFinite(fuel) ? Math.max(0, Math.min(1, fuel)) : 1,
      dirt: Number.isFinite(dirt) ? Math.max(0, Math.min(1, dirt)) : 0,
      idleAt: Date.now(),
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
      this.upgradeTo8();
      this.upgradeTo9();
      this.upgradeTo10();
      this.upgradeTo11();
      this.upgradeTo12();
      this.upgradeTo13();
      this.upgradeTo14();
      this.upgradeTo15();
      this.setOriginal(generateWorld());
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
    this.spots = {};
    for (const [k, p] of Object.entries(data.spots && typeof data.spots === 'object' ? data.spots : {})) {
      if (Array.isArray(p) && p.length >= 5 && p.every(Number.isFinite)) this.spots[k] = p.slice(0, 5);
    }
    this.saplings = data.saplings || [];
    this.races = {};
    for (const [k, list] of Object.entries(data.races && typeof data.races === 'object' ? data.races : {})) {
      if (Array.isArray(list)) this.races[k] = list.filter(r => r && typeof r.name === 'string' && Number.isFinite(r.time)).slice(0, 5);
    }
    this.wallets = {};
    for (const [k, w] of Object.entries(data.wallets && typeof data.wallets === 'object' ? data.wallets : {})) {
      if (!w || !Number.isFinite(w.coins)) continue;
      this.wallets[k] = {
        coins: Math.max(0, Math.floor(w.coins)), owned: Array.isArray(w.owned) ? w.owned.filter(i => SHOP_ITEMS.some(([s]) => s === i)) : [], day: w.day || '',
        found: Array.isArray(w.found) ? w.found.filter(g => FOUND_GEAR[g]) : [], // gear found in the world (the skis)
        fish: Array.isArray(w.fish) ? w.fish.filter(f => FISH.some(d => d.name === f)) : [], // the kinds of fish they've caught
        // The Secret Agency: which TOP SECRET files they've found, and whether they've got clearance.
        agent: { files: Array.isArray(w.agent?.files) ? w.agent.files.filter(k => typeof k === 'string').slice(0, 8) : [], clear: !!w.agent?.clear },
        guests: Array.isArray(w.guests) ? w.guests.filter(k => typeof k === 'string').map(nameKey).slice(0, 40) : [], // who their bodyguards let in
        can: w.can ? 1 : 0, // carrying a gas can
        // Clubs: how far along each club's tasks are, and the badges earned. And how many days in
        // a row they've come to play.
        clubs: cleanClubs(w.clubs),
        badges: Array.isArray(w.badges) ? w.badges.filter(b => clubById(b)) : [],
        streak: Number.isInteger(w.streak) && w.streak > 0 ? w.streak : 0,
        quest: cleanQuest(w.quest), // a resident's job they're doing (quests.js)
        questAt: w.questAt && typeof w.questAt === 'object' ? w.questAt : {},
        family: cleanFamily(w.family), // their family (from the Luxe Store), if they have one
      };
    }
    this.places = data.places && typeof data.places === 'object' ? data.places : null;
    this.signs = new Map();
    for (const s of Array.isArray(data.signs) ? data.signs : []) {
      if (!Array.isArray(s) || !s.slice(0, 3).every(Number.isInteger)) continue;
      const k = blockKey(s[0], s[1], s[2]), text = cleanSignText(s[3]);
      if (text && blockId(itemOf(this.world.get(k) || 0)) === SIGN) this.signs.set(k, text);
    }
    this.holes = new Map();
    for (const h of Array.isArray(data.holes) ? data.holes : []) {
      if (Array.isArray(h) && Number.isInteger(h[0]) && Number.isInteger(h[1])) this.holes.set(`${h[0]},${h[1]}`, Number.isFinite(h[2]) ? h[2] : Date.now());
    }
    this.tunnels = new Set();
    for (const t of Array.isArray(data.tunnels) ? data.tunnels : []) {
      if (Array.isArray(t) && inBounds(t[0], 0, t[2]) && isTunnelY(t[1])) this.tunnels.add(tunnelKey(t[0], t[1], t[2]));
    }
    this.expireClaims();
    if (data.version < 4) this.upgradeLamps();
    if (data.version < 5) this.upgradeTo5();
    if (data.version < 6) this.upgradeTo6();
    if (data.version < 7) this.upgradeTo7();
    if (data.version < 8) this.upgradeTo8();
    if (data.version < 9) this.upgradeTo9();
    if (data.version < 10) this.upgradeTo10();
    if (data.version < 11) this.upgradeTo11();
    if (data.version < 12) this.upgradeTo12();
    if (data.version < 13) this.upgradeTo13();
    if (data.version < 14) this.upgradeTo14();
    if (data.version < 15) this.upgradeTo15();
    this.setOriginal(generateWorld(), data.damaged);
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

  // Worlds saved before version 8 (the bigger map): the Pizza Palace in town, the ski resort up
  // north, and the woods with their cabins, lake and rocky mountain out west. All of it on empty
  // land nobody has claimed (out past the old edge of the world, or else only where it's empty).
  upgradeTo8() {
    const get = (x, y, z) => this.get(x, y, z);
    const set = (x, y, z, v) => {
      if (inBounds(x, y, z) && v) this.world.set(blockKey(x, y, z), v);
    };
    const canUse = this.freeLand();
    const pizza = buildPizzeria({ get, set, canUse });
    if (pizza) this.claims.push(pizza.claim);
    const frontier = buildFrontier({ get, set, canUse, canPave: (x, z) => !claimAt(this.claims, x, z) });
    this.claims.push(...frontier.claims);
    for (const c of frontier.cars) this.spawn(this.addHome(c));
    this.places = { ...(this.places || { plaza: { x: 0, z: 0 } }), pizza: pizza?.place || null, lodge: frontier.places.lodge };
    this.log(`Added the ski resort, the woods and the Pizza Palace (${frontier.count} blocks)`);
    this.onDirty();
  }

  // Worlds saved before version 9: "Build it here!" signposts in a few open spots (for swings,
  // basketball hoops, hot air balloons and zip lines), only on empty land nobody has claimed.
  upgradeTo9() {
    const get = (x, y, z) => this.get(x, y, z);
    const set = (x, y, z, v) => {
      if (inBounds(x, y, z) && v) this.world.set(blockKey(x, y, z), v);
    };
    const { signs } = buildSignposts({ get, set, canUse: this.freeLand(), canClimb: (x, z) => !claimAt(this.claims, x, z) });
    for (const [x, y, z, text] of signs) this.signs.set(blockKey(x, y, z), cleanSignText(text));
    this.onDirty();
  }

  // Worlds saved before version 10: the ski lodge and the log cabins get the furniture they were
  // meant to have (only onto their own plain floors, and not in cabins someone has claimed), the
  // lodge gets its ski rack, and the docks get fishing stools and a sign (only in empty spots).
  upgradeTo10() {
    const get = (x, y, z) => this.get(x, y, z);
    const set = (x, y, z, v) => {
      if (inBounds(x, y, z) && v) this.world.set(blockKey(x, y, z), v);
    };
    const mine = key => (x, z) => {
      const c = claimAt(this.claims, x, z);
      return !c || c.key === key;
    };
    const furnished = refurnish({ get, set, canUse: mine('ski lodge') });
    const fishing = addFishingSpots({ get, set, canUse: (x, z) => !claimAt(this.claims, x, z) });
    for (const [x, y, z, text] of fishing.signs) this.signs.set(blockKey(x, y, z), cleanSignText(text));
    this.log(`Furnished the lodge and cabins (${furnished} things), and put out ${fishing.stools} fishing stools`);
    this.onDirty();
  }

  // Worlds saved before version 11 (the 640 x 640 map): the far country, out past the old edge of
  // the world where nobody could build before (the beach and campground, the quarry, the farm, the
  // snowy north, and the rest of the ski mountain), with roads out to it on empty land only.
  upgradeTo11() {
    const get = (x, y, z) => this.get(x, y, z);
    const set = (x, y, z, v) => {
      if (inBounds(x, y, z) && v) this.world.set(blockKey(x, y, z), v);
    };
    const far = buildFarCountry({ get, set, canUse: this.freeLand(), canPave: (x, z) => !claimAt(this.claims, x, z), finishMountain: true });
    this.claims.push(...far.claims);
    for (const c of far.cars) this.spawn(this.addHome(c));
    for (const [x, y, z, text] of far.signs) this.signs.set(blockKey(x, y, z), cleanSignText(text));
    this.places = { ...(this.places || { plaza: { x: 0, z: 0 } }), ...far.places };
    this.log(`Added the far country: the beach and campground, the quarry and the farm (${far.count} blocks, ${far.cars.length} vehicles)`);
    this.onDirty();
  }

  // Worlds saved before version 12: the RV at the campground and two sports cars (just vehicles,
  // parked wherever there's room near their spots: no blocks change).
  upgradeTo12() {
    for (const c of moreVehicles()) this.spawn(this.addHome(c));
    this.log('Added the RV and two sports cars');
    this.onDirty();
  }

  // ---------- Bodyguards ----------

  // Everybody's land that has bodyguards: [{ owner, key, rect: [x0, z0, x1, z1], guests }].
  guardedLands() {
    const out = [];
    for (const [key, w] of Object.entries(this.wallets)) {
      if (!w.owned?.includes('bodyguards')) continue;
      const land = this.claims.find(c => c.key === key && !c.vacation && !c.permanent);
      if (land) out.push({ owner: land.owner, key, rect: [land.x0, land.z0, land.x1, land.z1], guests: w.guests || [] });
    }
    return out;
  }

  // (Called whenever someone buys them, changes their guest list, or their land changes.)
  updateGuards() {
    const lands = this.guardedLands();
    const sig = JSON.stringify(lands);
    if (sig === this.guardSig) return;
    this.guardSig = sig;
    this.npcs.syncGuards(lands);
    this.broadcast({ t: 'guards', lands });
    this.broadcast({ t: 'npcs', list: this.npcs.info() });
  }

  // Is this player allowed on this guarded land?
  welcomeOn(land, client) {
    const k = nameKey(client.name);
    return k === land.key || land.guests.includes(k);
  }

  // ---------- The weather ----------

  // Now and then a shower of rain (everyone gets the same weather). rain: how hard (0 when dry).
  updateWeather(dt) {
    const w = (this.weather ??= { rain: 0, left: between(RAIN_CALM) });
    w.left -= dt;
    if (w.left > 0) return;
    this.setRain(w.rain ? 0 : 0.55 + Math.random() * 0.45);
  }

  setRain(rain) {
    const w = (this.weather ??= { rain: 0, left: 0 });
    const was = w.rain;
    w.rain = rain;
    w.left = between(rain ? RAIN_SHOWER : RAIN_CALM);
    this.broadcast({ t: 'weather', rain });
    if (rain && !was) {
      this.log('It\'s raining');
      this.npcs.breaking(rain > 0.85 ? 'BREAKING NEWS: a big rainstorm over BuildZone! Head indoors, everybody! ⛈️' : 'This just in: it\'s raining in BuildZone! Don\'t forget your umbrella! ☔');
    } else if (!rain && was) {
      this.npcs.breaking('The rain has stopped! Look up: is that a rainbow? 🌈');
    }
  }

  // Worlds saved before version 13: elevators in the skyscrapers (instead of their ladders, where
  // they're just as they were built and nobody's claimed them), the Secret Agency's base out in
  // the south-east (on empty land nobody's claimed), its three TOP SECRET files (in empty spots),
  // and Agent Shadow on the town square. Nothing anyone built is touched.
  upgradeTo13() {
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
    const townLand = (x, z) => {
      const c = claimAt(this.claims, x, z);
      return !c || c.permanent; // (nobody's, or the town's own: the lodge, the quarry…)
    };
    const lifts = elevatorTowers({ each, get, set, canUse: townLand });
    const base = buildSecretBase({ get, set, canUse: this.freeLand() });
    if (base) {
      this.claims.push(base.claim);
      for (const [x, y, z, text] of base.signs) this.signs.set(blockKey(x, y, z), cleanSignText(text));
    }
    this.places = { ...(this.places || { plaza: { x: 0, z: 0 } }), ...(base?.places || {}), agent: AGENT_SPOT };
    this.places.files = hideSecretFiles({ get, set, canUse: townLand, places: this.places });
    this.log(`Added elevators to ${lifts} towers, the Secret Agency's base (${base ? `${base.count} blocks` : 'no room for it'}) and ${this.places.files.length} TOP SECRET files`);
    this.onDirty();
  }

  // Worlds saved before version 14: two gas stations, each with a car wash, by the roads out of
  // town (on empty land nobody's claimed). Nothing anyone built is touched.
  upgradeTo14() {
    const gas = buildGasStations({
      get: (x, y, z) => this.get(x, y, z),
      set: (x, y, z, v) => {
        if (inBounds(x, y, z) && v) this.world.set(blockKey(x, y, z), v);
      },
      canUse: this.freeLand(),
    });
    this.claims.push(...gas.claims);
    for (const [x, y, z, text] of gas.signs) this.signs.set(blockKey(x, y, z), cleanSignText(text));
    this.places = { ...(this.places || { plaza: { x: 0, z: 0 } }), ...gas.places };
    this.log(`Added ${gas.claims.length} gas stations with car washes (${gas.count} blocks)`);
    this.onDirty();
  }

  // Worlds saved before version 15: the Garden Center, the Toy Box and the Pet Shop by the roads
  // out of town (on empty land nobody's claimed), and residents in some of the town's houses.
  upgradeTo15() {
    const get = (x, y, z) => this.get(x, y, z);
    const shops = buildShops({
      get,
      set: (x, y, z, v) => {
        if (inBounds(x, y, z) && v) this.world.set(blockKey(x, y, z), v);
      },
      canUse: this.freeLand(),
    });
    this.claims.push(...shops.claims);
    for (const [x, y, z, text] of shops.signs) this.signs.set(blockKey(x, y, z), cleanSignText(text));
    const each = fn => {
      for (const [k, v] of this.world) {
        const [x, y, z] = k.split(',').map(Number);
        fn(x, y, z, v);
      }
    };
    const homes = findHomes({ each, get, canUse: (x, z) => !claimAt(this.claims, x, z) });
    this.places = { ...(this.places || { plaza: { x: 0, z: 0 } }), ...shops.places, ...Object.fromEntries(homes.map((h, i) => [`home${i + 1}`, h])) };
    this.log(`Added ${shops.built.length} stores (${shops.built.join(', ')}) and ${homes.length} residents`);
    this.onDirty();
  }

  // Families (from the Luxe Store) on their owners' home land.
  updateFamilies() {
    const list = [];
    for (const [key, w] of Object.entries(this.wallets)) {
      if (!w.family?.length || !w.owned?.includes('family')) continue;
      const land = this.claims.find(c => c.key === key && !c.vacation && !c.permanent);
      if (land) list.push({ key, owner: land.owner, rect: [land.x0, land.z0, land.x1, land.z1], members: w.family });
    }
    if (this.npcs.syncFamilies(list)) this.broadcast({ t: 'npcs', list: this.npcs.info() });
  }

  // Where the files still to find are, in Agent Shadow's words.
  filesLeft(w) {
    return (this.places?.files || []).filter(f => !w.agent.files.includes(blockKey(f[0], f[1], f[2]))).map(f => FILE_HINTS[f[3]] || 'somewhere out there');
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
      vehicles: [...this.vehicles.values()].map(({ home, kind, color, x, y, z, h, hp, fuel, dirt }) => ({ home, kind, color, x, y, z, h, hp: Math.round(hp), fuel: round3(fuel), dirt: round3(dirt) })),
      claims: this.claims,
      names: this.names,
      spots: this.spots,
      saplings: this.saplings,
      paints: [...this.paints],
      // Best race times, for finish lines that are still there.
      races: Object.fromEntries(Object.entries(this.races).filter(([k]) => this.isFinish(k))),
      places: this.places,
      wallets: this.wallets,
      holes: [...this.holes].map(([k, t]) => [...k.split(',').map(Number), t]),
      tunnels: [...this.tunnels].map(k => k.split(',').map(Number)),
      signs: this.signList(),
      // The town's own things that have been changed, to mend (see setOriginal).
      damaged: [...(this.damaged || [])].map(([k, since]) => [...k.split(',').map(Number), this.original.get(k), since]),
    };
  }

  isFinish(key) {
    const v = this.world.get(key) || 0;
    return blockId(itemOf(v)) === RACE_FINISH || blockId(floorOf(v)) === RACE_FINISH;
  }

  // Every block as one long list: x, y, z, value, x, y, z, value… (for saving, and for sending
  // the world to someone joining). Each block's x, y, z are remembered, so this is quick even on a
  // little computer like a Raspberry Pi.
  flatBlocks() {
    const out = new Array(this.world.size * 4);
    const coords = (this.coords ??= new Map());
    if (coords.size > this.world.size * 2 + 50000) coords.clear();
    let i = 0;
    for (const [k, v] of this.world) {
      let c = coords.get(k);
      if (!c) {
        c = k.split(',').map(Number);
        coords.set(k, c);
      }
      out[i++] = c[0];
      out[i++] = c[1];
      out[i++] = c[2];
      out[i++] = v;
    }
    return out;
  }

  get(x, y, z) {
    return this.world.get(blockKey(x, y, z)) || 0;
  }

  // ---------- The town mends itself ----------

  // What the world was like when it was made: every block the world maker put down that's still
  // just like that (in an older world, only the ones that match how the world is made now; things
  // already changed before, or built since, aren't known, so they're left alone), plus the ones
  // saved as changed (`damaged`: [x, y, z, block, since]).
  setOriginal(gen, damaged = []) {
    this.original = new Map();
    this.originalSigns = new Map();
    this.damaged = new Map();
    for (const [x, y, z, v] of gen.blocks) {
      const k = blockKey(x, y, z);
      if (this.world.get(k) === v) this.original.set(k, v);
    }
    for (const d of Array.isArray(damaged) ? damaged : []) {
      if (!Array.isArray(d) || d.length < 5 || !d.every(Number.isFinite) || !inBounds(d[0], d[1], d[2]) || !d[3] || !isValidBlock(d[3])) continue;
      const k = blockKey(d[0], d[1], d[2]);
      this.original.set(k, d[3]);
      this.damaged.set(k, d[4]);
    }
    for (const [x, y, z, text] of gen.signs || []) {
      const k = blockKey(x, y, z);
      if (this.original.has(k)) this.originalSigns.set(k, cleanSignText(text));
    }
  }

  // Someone changed something here (a block, its paint, a sign's words). If it's one of the town's
  // own things, it's noted, to mend later. On someone's land it's theirs now: it's left as it is.
  touched(x, y, z) {
    const k = blockKey(x, y, z);
    if (!this.original?.has(k)) return;
    if (claimAt(this.claims, x, z)) {
      this.original.delete(k);
      this.damaged.delete(k);
      return;
    }
    const sign = this.originalSigns.has(k) && this.signs.get(k) !== this.originalSigns.get(k);
    const same = this.world.get(k) === this.original.get(k) && !this.paints.has(k) && !this.paints.has(`${k}|f`) && !sign;
    if (same) this.damaged.delete(k);
    else if (!this.damaged.has(k)) this.damaged.set(k, Date.now());
  }

  // Puts back a couple of the town's things that were changed a while ago (oldest first).
  mend() {
    if (!this.damaged?.size) return;
    const now = Date.now(), cells = [];
    const people = [...this.clients.values()].filter(c => c.joined && c.pos);
    for (const [k, since] of this.damaged) {
      if (now - since < MEND_AFTER || cells.length >= MEND_EACH * 4) break;
      const [x, y, z] = k.split(',').map(Number);
      if (claimAt(this.claims, x, z)) {
        this.damaged.delete(k);
        this.original.delete(k);
        continue;
      }
      // (Not with someone watching, or standing or parked right there.)
      if (people.some(c => Math.hypot(c.pos[0] - x - 0.5, c.pos[2] - z - 0.5) < MEND_AWAY)) continue;
      let parked = false;
      for (const v of this.vehicles.values()) if (Math.hypot(v.x - x - 0.5, v.z - z - 0.5) < 4 && Math.abs(v.y - y) < 4) parked = true;
      if (parked) continue;
      const v = this.original.get(k);
      this.world.set(k, v);
      for (const pk of [k, `${k}|f`]) {
        if (!this.paints.delete(pk)) continue;
        this.broadcast({ t: 'paint', x, y, z, floor: pk !== k, faces: null });
      }
      const text = this.originalSigns.get(k);
      if (text && this.signs.get(k) !== text) {
        this.signs.set(k, text);
        this.broadcast({ t: 'sign', x, y, z, text });
      }
      this.damaged.delete(k);
      cells.push(x, y, z, v);
    }
    if (cells.length) {
      this.broadcast({ t: 'many', cells });
      this.onDirty();
    }
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

  // `send` delivers one message object to this client; `drop` hangs up on them (used when
  // they're back on a new page while the server still thinks the old one is here).
  connect(send, drop = null) {
    if (this.clients.size >= this.maxPlayers) {
      send({ t: 'full' });
      return null;
    }
    const client = {
      id: this.nextId++, send, drop, heard: Date.now(), joined: false, name: 'Builder', look: sanitizeLook(null),
      pos: [0, 0, 0], rot: [0, 0], pet: 0, ball: 0, flags: 0, car: 0, sleeping: false, buckets: {},
    };
    this.clients.set(client.id, client);
    return client;
  }

  disconnect(client) {
    if (!this.clients.delete(client.id)) return; // (already gone)
    this.jobs.delete(client.id);
    if (!client.joined) return;
    // Already back on a new page? Then that one keeps track of where they are.
    const back = this.sameName(client);
    if (client.moved && !back) {
      this.rememberSpot(client);
      this.onDirty();
    }
    this.leaveVehicle(client);
    this.seen(client.name);
    this.broadcast({ t: 'leave', id: client.id });
    if (!back) this.broadcast({ t: 'chat', system: true, text: `${client.name} left` });
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
    const w = (this.wallets[nameKey(client.name)] ??= { coins: 0, owned: [], day: '' });
    w.found ??= [];
    w.fish ??= [];
    w.agent ??= { files: [], clear: false };
    w.guests ??= [];
    w.can ??= 0;
    w.clubs ??= {};
    w.badges ??= [];
    w.streak ??= 0;
    return w;
  }

  sendWallet(client) {
    const w = this.wallet(client);
    client.send({ t: 'wallet', coins: w.coins, owned: w.owned, found: w.found, vacation: !!this.vacationOf(client), agent: { files: w.agent.files.length, need: this.filesNeeded(), clear: w.agent.clear }, can: w.can, clubs: w.clubs, badges: w.badges, streak: w.streak });
  }

  // ---------- Clubs ----------

  // Has this player earned this club's badge (and its perk)?
  perk(client, club) {
    return this.wallet(client).badges.includes(club);
  }

  // A step toward one of a club's tasks (by `n`, or up to `n` with `to`). All the tasks done: the
  // badge, its coins and its perk, and everybody hears about it.
  progress(client, club, task, n = 1, to = false) {
    const def = clubById(club), t = def?.tasks.find(k => k.id === task);
    if (!t || !client?.joined) return;
    const w = this.wallet(client);
    if (w.badges.includes(club)) return;
    const counts = (w.clubs[club] ??= {});
    const was = counts[task] || 0, now = Math.min(t.goal, Math.floor(to ? n : was + n));
    if (now <= was) return;
    counts[task] = now;
    client.send({ t: 'club_step', club, task, n: now, goal: t.goal });
    if (def.tasks.every(k => (counts[k.id] || 0) >= k.goal)) {
      w.badges.push(club);
      w.coins += def.reward.coins;
      client.send({ t: 'badge', club, coins: def.reward.coins });
      if (club === 'tunnel') client.send({ t: 'underground', ...this.undergroundInfo() }); // (now you know the secret)
      this.broadcast({ t: 'chat', system: true, text: `🏅 ${client.name} earned the ${def.icon} ${def.name} badge!` }, client);
      this.log(`${client.name} earned the ${def.name} badge`);
    }
    this.sendWallet(client);
    this.onDirty();
  }

  // A Mystery Box: something from one of the stores you don't have yet (a surprise!).
  openMysteryBox(client, price) {
    const w = this.wallet(client);
    const reply = text => client.send({ t: 'chat', system: true, text });
    const prizes = SHOP_ITEMS.filter(([i, p]) => typeof i === 'number' && p <= 30 && !w.owned.includes(i)).map(([i]) => i);
    if (!prizes.length) return reply('🎁 You have everything a Mystery Box could hold!');
    if (w.coins < price) return reply(`🪙 A Mystery Box costs ${price} coins, and you have ${w.coins}.`);
    const prize = prizes[Math.floor(Math.random() * prizes.length)];
    w.coins -= price;
    w.owned.push(prize);
    this.sendWallet(client);
    client.send({ t: 'mystery', item: prize });
    this.progress(client, 'gold', 'shop');
    this.onDirty();
  }

  // ---------- The Secret Agency ----------

  cleared(client) {
    return !!this.wallet(client).agent.clear;
  }

  // How many TOP SECRET files there are to find (three, unless there wasn't room for them all).
  filesNeeded() {
    return Math.min(FILES_NEEDED, this.places?.files?.length || FILES_NEEDED);
  }

  // Is this somewhere you need clearance to be? (Inside the base.)
  inBase(x, y, z) {
    return inZone(this.places?.base?.zone, x, y, z);
  }

  // Can this go down here? (Things from the Luxe Store need buying first; world-only things,
  // like the lodge's ski rack, are never put down by players: only kept as they are.)
  mayPlace(client, b, old) {
    if (BLOCKS[blockId(itemOf(old))]?.secretFile && blockId(itemOf(b)) !== blockId(itemOf(old))) return false; // (they stay where they're hidden)
    const same = (old & ~(15 << 8)) === (b & ~(15 << 8));
    if (isExclusive(b) && !this.owns(client, b) && !(isExclusive(old) && same)) return false;
    const worldOnly = v => BLOCKS[itemOf(v) & 255]?.worldOnly || BLOCKS[floorOf(v) & 255]?.worldOnly;
    return !worldOnly(b) || (worldOnly(old) && blockId(itemOf(old)) === blockId(itemOf(b)));
  }

  // Someone's land: their home land, and their vacation land (if they have any).
  homeOf(client) {
    const key = nameKey(client.name);
    return this.claims.find(c => c.key === key && !c.vacation) || null;
  }

  vacationOf(client) {
    const key = nameKey(client.name);
    return this.claims.find(c => c.key === key && c.vacation) || null;
  }

  owns(client, v) {
    const owned = this.wallet(client).owned;
    if (typeof v === 'string') return !SHOP_TOOLS[v] || owned.includes(v);
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
    client.heard = Date.now();
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
    // Still "here" on an old page that's gone quiet? That's them, back after closing the browser
    // or tablet without the server hearing (a sleeping phone, dropped wi-fi): carry on from where
    // that page last was, and hang it up.
    for (const old of this.sameName(client, true)) {
      if (Date.now() - old.heard < 3000) continue; // (someone actually playing under this name)
      if (old.moved) this.rememberSpot(old);
      this.disconnect(old);
      old.drop?.();
    }
    this.seen(client.name);
    client.send({
      t: 'welcome',
      id: client.id,
      build: this.build, // (the server's version of the game files; none in single player)
      time: this.time,
      dayLength: DAY_LENGTH,
      world: this.perk(client, 'tunnel') ? this.flatBlocks() : this.flatBlocks().filter((_, i, a) => a[i - (i % 4) + 1] >= -1),
      paints: [...this.paints],
      holes: [...this.holes.keys()].map(k => k.split(',').map(Number)),
      ...(this.perk(client, 'tunnel') ? { tunnels: this.undergroundInfo().tunnels } : {}),
      signs: this.signList(),
      cars: [...this.vehicles.values()].map(publicVehicle),
      claims: this.claims,
      players: [...this.clients.values()].filter(o => o.joined && o !== client).map(publicPlayer),
      npcs: this.npcs.info(),
      news: this.npcs.newsInfo(),
      // Where you were when you last left (your game puts you back there if there's room).
      resume: this.spots[nameKey(client.name)]?.slice(0, 4) || null,
      coins: [...this.coins].map(([id, c]) => [id, ...c]),
      rain: this.weather?.rain || 0, // (raining right now?)
      guards: this.guardedLands(), // land with bodyguards (and who may go in)
      // The Secret Agency's base (its inside, its lasers) and where the TOP SECRET files are.
      base: this.places?.base || null,
      files: (this.places?.files || []).map(f => f.slice(0, 3)),
      landmarks: Object.entries(this.places || {}).filter(([, p]) => p && Number.isFinite(p.x) && Number.isFinite(p.z)).map(([k, p]) => [k, p.x, p.z]),
    });
    // Coins: your wallet, and a little present the first time you play each day.
    const wallet = this.wallet(client);
    const today = new Date().toISOString().slice(0, 10);
    if (wallet.day !== today) {
      // Every day in a row you come to play, the bonus grows (and the Gold Club adds a bit).
      const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
      wallet.streak = wallet.day === yesterday ? wallet.streak + 1 : 1;
      wallet.day = today;
      const bonus = DAILY_BONUS + Math.min(STREAK_MAX, (wallet.streak - 1) * 2) + (this.perk(client, 'gold') ? 5 : 0);
      wallet.coins += bonus;
      client.send({ t: 'daily', coins: bonus, streak: wallet.streak });
      this.onDirty();
    }
    this.sendWallet(client);
    this.quests.send(client);
    this.broadcast({ t: 'join', ...publicPlayer(client) }, client);
    this.broadcast({ t: 'chat', system: true, text: `${client.name} joined` });
    this.log(`${client.name} joined (${this.clients.size} online)`);
  }

  leaveVehicle(client) {
    const v = this.vehicles.get(client.car);
    client.car = 0;
    if (!v) return;
    // Your own vehicle: wherever you leave it is where it lives now.
    const home = this.homes.get(v.home);
    if (home?.key && v.driver === client.id) {
      Object.assign(home, { x: v.x, y: v.y, z: v.z, h: v.h });
      this.onDirty();
    }
    if (v.passengers.includes(client.id)) {
      v.passengers = v.passengers.filter(id => id !== client.id);
      this.broadcast({ t: 'car_driver', ...publicVehicle(v) });
      return;
    }
    if (v.driver !== client.id) return;
    v.driver = 0;
    v.idleAt = Date.now();
    v.speed = v.steer = v.pitch = v.roll = v.rotor = 0;
    // (A police car's flashing lights stay on when you get out, if they were on: only the siren
    // stops. The camper's roof and such go back down.)
    if (v.kind !== 'police') v.siren = 0;
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

  // A vehicle's driver moved it (from `was`): it uses gas, and gets dirty (much faster off the
  // road, faster still off the road in the rain), or clean in the car wash.
  driven(v, was) {
    const now = Date.now();
    const dt = Math.min(0.25, (now - (v.drivenAt || now)) / 1000);
    v.drivenAt = now;
    const d = Math.hypot(v.x - was[0], VEHICLES[v.kind].flying ? v.y - was[1] : 0, v.z - was[2]);
    if (d > 12) return; // (a teleporter, not driving)
    // The Speed Club counts how far its members-to-be drive and fly.
    const driver = this.clients.get(v.driver);
    if (driver && d > 0 && !VEHICLES[v.kind].boat) {
      const flying = !!VEHICLES[v.kind].flying;
      driver.distance = (driver.distance || 0) + d;
      if (driver.distance >= 50) {
        this.progress(driver, 'speed', flying ? 'fly' : 'drive', driver.distance);
        driver.distance = 0;
      }
    }
    if (usesFuel(v.kind) && v.fuel > 0 && d > 0) {
      const before = v.fuel;
      v.fuel = Math.max(0, v.fuel - d / TANK_RANGE[v.kind]);
      if (!v.fuel || Math.floor(before * 50) !== Math.floor(v.fuel * 50)) this.broadcast({ t: 'car_fuel', id: v.id, fuel: round3(v.fuel) });
    }
    if (!getsDirty(v.kind)) return;
    const x = Math.floor(v.x), z = Math.floor(v.z), y = Math.max(0, Math.floor(v.y + 0.05));
    const here = this.get(x, y, z);
    const before = v.dirt;
    if (isWash(here)) v.dirt = Math.max(0, v.dirt - dt / WASH_TIME);
    else if (d > 0) {
      // (Driving on top of something built is clean; on the bare ground, or sand or snow, it's muddy.)
      const under = here || (y > 0 ? this.get(x, y - 1, z) : 0);
      const muddy = !paved(here) && (y === 0 ? !here || MUDDY.has(blockId(itemOf(here))) : MUDDY.has(blockId(itemOf(under))));
      const k = muddy ? 3 * (this.weather?.rain > 0 ? 2 : 1) : 1;
      v.dirt = Math.min(1, v.dirt + d * k / DIRT_RANGE);
    }
    if (!v.dirt && before > 0 && isWash(here) && driver) this.progress(driver, 'mechanic', 'wash');
    if (v.dirt !== before && (!v.dirt || Math.floor(before * 25) !== Math.floor(v.dirt * 25))) {
      this.broadcast({ t: 'car_dirt', id: v.id, dirt: round3(v.dirt), wash: v.dirt < before });
    }
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
        client.moved = true;
      }
      client.pet = numbers(msg.pet, 5);
      client.ball = numbers(msg.ball, 3);
      client.flags = num(msg.flags) | 0;
      // When they were there, on their own clock: other players replay their moves at that pace.
      client.ts = Number.isFinite(msg.ts) ? msg.ts : null;
      client.fresh = true;
      client.hold = typeof msg.hold === 'string' || typeof msg.hold === 'number' ? String(msg.hold).slice(0, 16) : '';
      client.drone = this.cleared(client) ? numbers(msg.drone, 4) : 0; // a Secret Agency drone they're flying
    },

    set(client, { x, y, z, b }) {
      if (!(inBounds(x, y, z) || this.underground(client, x, y, z)) || !isValidBlock(b)) return;
      const old = this.get(x, y, z);
      // Things from the Luxe Store can only be put down by someone who bought them.
      if (!this.mayPlace(client, b, old)) {
        client.send({ t: 'set', x, y, z, b: old });
        return;
      }
      // Room for a whole ladder or garage door at once. Too fast? Undo it for that player.
      if (!this.allow(client, 'set', 40, 160)) {
        client.send({ t: 'set', x, y, z, b: old });
        return;
      }
      if (isDoorToggle(old, b) && claimAt(this.claims, x, z)?.key === AGENCY.key && !this.cleared(client)) {
        // The Secret Agency's door: locked, unless you've got Top Secret clearance.
        client.send({ t: 'set', x, y, z, b: old });
        this.npcs.halt(client);
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
      this.carrySign(k, b);
      this.touched(x, y, z);
      if (y < -1) this.tellDiggers({ t: 'set', x, y, z, b }, client); // (secret!)
      else this.broadcast({ t: 'set', x, y, z, b }, client);
      if (y === -1 && b && !old) this.progress(client, 'tunnel', 'fill'); // something put in a hole
      if (blockId(b) === LOG && blockId(old) !== LOG && this.maybePlant(x, y, z)) this.progress(client, 'nature', 'trees');
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
      this.touched(x, y, z);
      this.broadcast({ t: 'paint', x, y, z, floor: !!floor, faces: this.paints.get(key) || null }, client);
      this.onDirty();
    },

    chat(client, msg) {
      const text = cleanWords(msg.text, 160); // (rude words become ♥♥♥)
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
        if (!(inBounds(x, y, z) || this.underground(client, x, y, z)) || !isValidBlock(b)) continue;
        const old = this.get(x, y, z);
        if (tooFast || !canBuild(this.claims, client.name, x, z) || !this.mayPlace(client, b, old)) {
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
        this.carrySign(k, b);
        this.touched(x, y, z);
        applied.push(x, y, z, b);
      }
      if (applied.length) {
        // (Anything in the tunnels is only for Tunnel Diggers to know about.)
        const open = [], secret = [];
        for (let i = 0; i < applied.length; i += 4) (applied[i + 1] < -1 ? secret : open).push(...applied.slice(i, i + 4));
        if (open.length) this.broadcast({ t: 'many', cells: open }, client);
        if (secret.length) this.tellDiggers({ t: 'many', cells: secret }, client);
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
      const reach = this.perk(client, 'gold') ? 3 * MAGNET : 3; // (the Gold Club's coin magnet)
      if (Math.hypot(client.pos[0] - c[0], client.pos[2] - c[2]) > reach || Math.abs(client.pos[1] - c[1]) > 3) return;
      this.coins.delete(id);
      this.broadcast({ t: 'coin_gone', id, by: client.id });
      this.pay(client, c[3]);
      client.send({ t: 'coin_got', value: c[3] });
      this.progress(client, 'gold', 'coins');
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
      if (item === 'mysterybox') return this.openMysteryBox(client, price);
      if (item === VACATION && this.vacationOf(client)) return reply('🏖️ You already have vacation land! Give it up first if you want to buy a flag for somewhere new.');
      if (SHOP_TOOLS[item]?.clearance && !this.cleared(client)) return reply(`🕶️ The ${name} are for Secret Agency agents only! Get Top Secret clearance first (Agent Shadow on the town square knows how).`);
      if (w.coins < price) return reply(`🪙 The ${name} costs ${price} coins, and you have ${w.coins}. Find more coins around town!`);
      w.coins -= price;
      w.owned.push(item);
      this.sendWallet(client);
      this.onDirty();
      reply(`🛍️ You bought the ${name}! ${item === 'bodyguards' && !this.homeOf(client) ? 'Plant your Land Flag somewhere and they\'ll guard it!' : SHOP_TOOLS[item]?.got || "It's in your items now (press E, 🎉 Fun tab)."}`);
      this.npcs.onBuy(client, item);
      this.progress(client, 'gold', 'shop');
      if (item === 'bodyguards') this.updateGuards();
      if (item === 'family') {
        // A family to start with (change them however you like).
        w.family = [{ name: 'Mom', look: randomLook() }, { name: 'Dad', look: randomLook() }, { name: 'Kiddo', look: randomLook() }];
        this.updateFamilies();
        if (!this.homeOf(client)) reply('🏡 Plant your Land Flag somewhere and your family moves in!');
      }
    },

    // Changing your family (names, looks, how many of them).
    family(client, { members }) {
      const w = this.wallet(client);
      if (!w.owned.includes('family') || !this.allow(client, 'family', 1, 3)) return;
      const clean = cleanFamily(members);
      if (!clean) return;
      w.family = clean;
      this.updateFamilies();
      this.onDirty();
      client.send({ t: 'chat', system: true, text: '🏡 ✓' });
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
      this.progress(client, 'speed', 'race');
      client.send({ t: 'chat', system: true, text: `🪙 +${RACE_PRIZE} coins for finishing the race!` });
    },

    // The first one in drives; up to two more can ride along as passengers.
    car_enter(client, { id }) {
      const v = this.vehicles.get(id);
      if (!v || client.car) return;
      if (!v.driver) {
        // Someone's own vehicle: only they can drive it (anyone can ride along with them).
        if (v.key && v.key !== nameKey(client.name)) {
          return client.send({ t: 'chat', system: true, text: `🔑 This ${VEHICLES[v.kind].name} is ${v.owner}'s. Only ${v.owner} can drive it, but you can ride along when they do!` });
        }
        v.driver = client.id;
      } else if (v.passengers.length < seatCount(VEHICLES[v.kind]) - 1) v.passengers.push(client.id);
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
      const was = [v.x, v.y, v.z];
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
      v.flags = num(msg.f) & 7; // brake lights, reverse lights, a load in the dump truck
      if (v.kind === 'dump' && v.loaded && !(v.flags & 4)) this.progress(client, 'tunnel', 'dump'); // (tipped out its load)
      v.loaded = !!(v.flags & 4);
      v.ts = Number.isFinite(msg.ts) ? msg.ts : null;
      v.fresh = true;
      this.driven(v, was);
    },

    // Crashes (reported by the driver) and hammer hits (from anyone close by).
    car_damage(client, msg) {
      const v = this.vehicles.get(msg.id);
      if (!v || !this.allow(client, 'damage', 8, 12)) return;
      const close = Math.hypot(client.pos[0] - v.x, client.pos[2] - v.z) < 14;
      if (client.car !== v.id && !close) return;
      if (v.key && v.key !== nameKey(client.name)) return; // (someone's own vehicle: only they can bash it)
      const impact = numbers(msg.impact, 3) || [0, 1, 0];
      this.damageVehicle(v, Math.max(0, Math.min(45, num(msg.amount))), impact);
    },

    // The Paint Brush on a vehicle: a new color, for good (it comes back that color, too).
    car_paint(client, msg) {
      const v = this.vehicles.get(msg.id);
      // (Shiny gold is from the Luxe Store: only for people who bought the Gold Car Paint.)
      const gold = msg.color === 'gold' && this.owns(client, 'goldpaint');
      const color = gold ? 'gold' : typeof msg.color === 'string' && /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color.toLowerCase() : null;
      if (!v || !color || !this.allow(client, 'carPaint', 4, 6)) return;
      if (!this.nearVehicle(client, v)) return client.send({ t: 'car_color', id: v.id, color: v.color });
      if (v.key && v.key !== nameKey(client.name)) {
        client.send({ t: 'car_color', id: v.id, color: v.color });
        return client.send({ t: 'chat', system: true, text: `🔑 That's ${v.owner}'s ${VEHICLES[v.kind].name}: only ${v.owner} can paint it.` });
      }
      v.color = color;
      const home = this.homes.get(v.home);
      if (home) home.color = color;
      this.broadcast({ t: 'car_color', id: v.id, color });
      this.onDirty();
    },

    // The Land Flag on a vehicle: make it your own (up to MAX_OWNED_VEHICLES), or give yours back.
    // Yours: only you can drive it (friends can ride along), nobody else can bash or paint it, it
    // stays wherever you park it, and if it blows up it comes back there. The town gets a new one
    // of its own in its place.
    car_claim(client, { id }) {
      const v = this.vehicles.get(id);
      const reply = text => client.send({ t: 'chat', system: true, text });
      if (!v || !this.allow(client, 'carClaim', 1, 3) || !this.nearVehicle(client, v)) return;
      const key = nameKey(client.name), name = VEHICLES[v.kind].name;
      if (v.key === key) return reply(`🔑 This ${name} is already yours!`);
      if (v.key) return reply(`🔑 This ${name} is ${v.owner}'s.`);
      if (v.driver && v.driver !== client.id) return reply(`🔑 Someone's driving it right now.`);
      if (this.ownedVehicles(key).length >= MAX_OWNED_VEHICLES) return reply(`🔑 You have ${MAX_OWNED_VEHICLES} vehicles already! Give one back first (click it with the Land Flag).`);
      const town = this.homes.get(v.home);
      const home = this.addHome({ kind: v.kind, color: v.color, x: v.x, y: v.y, z: v.z, h: v.h, owner: client.name, key });
      v.home = home.id;
      Object.assign(v, { owner: home.owner, key });
      if (town && !town.key) this.respawns.push({ home: town.id, at: Date.now() + VEHICLES[v.kind].respawn * 1000 });
      this.broadcast({ t: 'car_owner', id: v.id, owner: v.owner });
      reply(`🔑 The ${name} is yours! Only you can drive it, and it stays wherever you park it. (You can have up to ${MAX_OWNED_VEHICLES}.)`);
      this.log(`${client.name} claimed a ${name}`);
      this.onDirty();
    },

    car_unclaim(client, { id }) {
      const v = this.vehicles.get(id);
      if (!v || !this.allow(client, 'carClaim', 1, 3) || !this.nearVehicle(client, v) || v.key !== nameKey(client.name)) return;
      if (v.driver || v.passengers.length) return client.send({ t: 'chat', system: true, text: '🔑 Everybody has to get out first.' });
      this.giveBack(v);
      client.send({ t: 'chat', system: true, text: `🔑 You gave the ${VEHICLES[v.kind].name} back to the town. Thanks!` });
    },

    // The Wrench: each turn of it fixes a bit of the damage (and can even save a burning one).
    car_fix(client, msg) {
      const v = this.vehicles.get(msg.id);
      if (!v || v.hp >= MAX_HP || !this.allow(client, 'fix', 5, 6) || !this.nearVehicle(client, v)) return;
      v.hp = Math.min(MAX_HP, v.hp + FIX_AMOUNT);
      this.broadcast({ t: 'car_hp', id: v.id, hp: Math.round(v.hp), fixer: client.id });
      if (v.hp >= MAX_HP) this.progress(client, 'mechanic', 'fix');
      this.onDirty();
    },

    // At a gas pump: fill up a vehicle parked beside it (paying for the gas: as much as you can
    // afford, if you can't afford a whole tank), or buy a gas can to carry to one that's run dry.
    pump(client, { x, y, z, id, can }) {
      if (!this.allow(client, 'pump', 1, 3) || ![x, y, z].every(Number.isInteger)) return;
      if (blockId(itemOf(this.get(x, y, z))) !== GAS_PUMP) return;
      const reply = text => client.send({ t: 'chat', system: true, text });
      if (Math.hypot(client.pos[0] - x - 0.5, client.pos[2] - z - 0.5) > 6) return reply('⛽ Walk up to the pump first.');
      const w = this.wallet(client);
      const half = this.perk(client, 'mechanic'); // (the Mechanic Crew: gas costs half)
      const canPrice = half ? Math.ceil(GAS_CAN_PRICE / 2) : GAS_CAN_PRICE;
      if (can) {
        if (w.can) return reply('⛽ You\'re already carrying a gas can! Take it to your vehicle and right-click the vehicle to pour it in.');
        if (w.coins < canPrice) return reply(`🪙 A gas can costs ${canPrice} coins, and you have ${w.coins}. Find more coins around town!`);
        w.coins -= canPrice;
        w.can = 1;
        this.sendWallet(client);
        this.onDirty();
        client.send({ t: 'gas_can', got: true });
        return reply('⛽ You bought a gas can (a quarter of a tank). Carry it to your vehicle and right-click the vehicle to pour it in.');
      }
      const v = this.vehicles.get(id);
      if (!v || !usesFuel(v.kind)) return;
      const name = VEHICLES[v.kind].name;
      if (Math.hypot(v.x - x - 0.5, v.z - z - 0.5) > PUMP_REACH) return reply(`⛽ Park the ${name} right next to the pump first.`);
      if (v.driver && v.driver !== client.id) return reply(`⛽ Someone's driving that ${name}.`);
      if (v.key && v.key !== nameKey(client.name)) return reply(`🔑 That's ${v.owner}'s ${name}: only ${v.owner} can fill it up.`);
      if (v.fuel >= 0.995) return reply(`⛽ The ${name}'s tank is already full!`);
      const price = fillPrice(v.fuel, half);
      if (w.coins <= 0) return reply(`🪙 Filling up costs ${price} coins, and you don't have any. Find some coins around town!`);
      const paid = Math.min(price, w.coins);
      w.coins -= paid;
      v.fuel = paid >= price ? 1 : Math.min(1, v.fuel + paid / (half ? FULL_TANK_PRICE / 2 : FULL_TANK_PRICE));
      this.progress(client, 'mechanic', 'fuel');
      v.idleAt = Date.now();
      this.sendWallet(client);
      this.broadcast({ t: 'car_fuel', id: v.id, fuel: round3(v.fuel), filled: client.id });
      this.onDirty();
      reply(paid >= price ? `⛽ Filled up! The ${name} has a full tank. (${paid} coin${paid > 1 ? 's' : ''})` : `⛽ You had ${paid} coin${paid > 1 ? 's' : ''}, so you put in that much gas: the tank's ${Math.round(v.fuel * 100)}% full now.`);
    },

    // Pouring the gas can you're carrying into a vehicle.
    pour(client, { id }) {
      const v = this.vehicles.get(id);
      const w = this.wallet(client);
      if (!v || !usesFuel(v.kind) || !w.can || !this.allow(client, 'pour', 1, 3)) return;
      const reply = text => client.send({ t: 'chat', system: true, text });
      if (Math.hypot(client.pos[0] - v.x, client.pos[2] - v.z) > 7) return reply('⛽ Get right up to it first.');
      if (v.fuel >= 0.995) return reply(`⛽ The ${VEHICLES[v.kind].name}'s tank is already full! Keep the can for when you need it.`);
      w.can = 0;
      v.fuel = Math.min(1, v.fuel + GAS_CAN);
      this.progress(client, 'mechanic', 'fuel');
      this.sendWallet(client);
      this.broadcast({ t: 'car_fuel', id: v.id, fuel: round3(v.fuel), filled: client.id, can: true });
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
      // (Your two pieces of land can't overlap each other, either.)
      const vacation = !!msg.vacation;
      const clash = this.claims.find(c => (c.key !== key || !!c.vacation !== vacation) && rectsOverlap(c, rect));
      if (clash) return reply(clash.key === key ? `🚧 That overlaps your ${clash.vacation ? 'vacation ' : ''}land. Try somewhere else!` : `🚧 That overlaps ${clash.owner}'s land. Try somewhere else!`);
      if (vacation) {
        // Vacation land: a Vacation Flag from the Luxe Store, used up when you plant it. It
        // can't be moved (but it can be given up).
        const w = this.wallet(client);
        if (this.vacationOf(client)) return reply('🏖️ You already have vacation land. It stays where it is (you can give it up, and buy a new flag).');
        if (!w.owned.includes(VACATION)) return reply('🏖️ You need a Vacation Flag from the Luxe Store to claim vacation land.');
        w.owned = w.owned.filter(i => i !== VACATION);
        this.claims.push({ owner: client.name, key, ...rect, createdAt: Date.now(), vacation: true });
        this.sendWallet(client);
        reply(`🏖️ Welcome to your vacation land, ${client.name}! Only you can build here. (It stays here for good, unless you give it up.)`);
      } else {
        const had = !!this.homeOf(client);
        this.claims = this.claims.filter(c => c.key !== key || c.vacation);
        this.claims.push({ owner: client.name, key, ...rect, createdAt: Date.now() });
        reply(`🏠 This land is now yours, ${client.name}!${had ? ' (Your old land is free again.)' : ''} Only someone named ${client.name} can build here.`);
      }
      this.seen(client.name);
      this.progress(client, 'gold', 'land');
      this.broadcast({ t: 'claims', claims: this.claims });
      this.onDirty();
    },

    // Wrote on a sign.
    sign(client, { x, y, z, text }) {
      if (!inBounds(x, y, z) || !this.allow(client, 'sign', 2, 6)) return;
      const k = blockKey(x, y, z);
      if (blockId(itemOf(this.world.get(k) || 0)) !== SIGN) return;
      if (Math.hypot(client.pos[0] - x - 0.5, client.pos[1] - y, client.pos[2] - z - 0.5) > 12) return;
      if (!canBuild(this.claims, client.name, x, z)) {
        return client.send({ t: 'sign', x, y, z, text: this.signs.get(k) || '' });
      }
      const clean = cleanSignText(text);
      if (clean) this.signs.set(k, clean);
      else this.signs.delete(k);
      this.touched(x, y, z);
      this.broadcast({ t: 'sign', x, y, z, text: clean });
      this.onDirty();
    },

    // Right-clicked the pizza oven: take a pizza out for delivery.
    job(client) {
      const p = this.places?.pizza;
      if (!p || !this.allow(client, 'job', 1, 3) || Math.hypot(client.pos[0] - p.x, client.pos[2] - p.z) > 12) return;
      this.startJob(client);
    },

    // Got there with the pizza.
    job_done(client) {
      const job = this.jobs.get(client.id);
      if (!job || !this.allow(client, 'job', 1, 3)) return;
      if (Math.hypot(client.pos[0] - job.x, client.pos[2] - job.z) > 4.5) return;
      this.jobs.delete(client.id);
      const fast = (Date.now() - job.at) / 1000 <= job.par;
      const coins = job.reward + (fast ? JOB_TIP : 0) + (this.perk(client, 'pizza') ? PIZZA_TIP : 0);
      this.wallet(client).coins += coins;
      this.sendWallet(client);
      client.send({ t: 'job_done', coins, fast });
      this.progress(client, 'pizza', 'deliver');
      if (fast) this.progress(client, 'pizza', 'fast');
      this.log(`${client.name} delivered a pizza (+${coins} coins)`);
      this.onDirty();
    },

    job_quit(client) {
      this.jobs.delete(client.id);
    },

    // The ski rack at the lodge: a pair of skis to keep (they're gear: you wear them).
    take_skis(client, { x, y, z }) {
      if (!this.allow(client, 'skis', 1, 3) || !inBounds(x, y, z) || !BLOCKS[blockId(itemOf(this.get(x, y, z)))]?.skiRack) return;
      if (Math.hypot(client.pos[0] - x - 0.5, client.pos[1] - y, client.pos[2] - z - 0.5) > 6) return;
      const w = this.wallet(client);
      if (w.found.includes('skis')) return client.send({ t: 'gear_found', gear: 'skis', again: true });
      w.found.push('skis');
      this.sendWallet(client);
      client.send({ t: 'gear_found', gear: 'skis' });
      this.onDirty();
    },

    // A TOP SECRET file: find all of them and you get Top Secret clearance.
    secret_file(client, { x, y, z }) {
      if (!this.allow(client, 'file', 1, 3) || !inBounds(x, y, z) || !BLOCKS[blockId(itemOf(this.get(x, y, z)))]?.secretFile) return;
      if (Math.hypot(client.pos[0] - x - 0.5, client.pos[1] - y, client.pos[2] - z - 0.5) > 6) return;
      const w = this.wallet(client), key = blockKey(x, y, z), need = this.filesNeeded();
      const where = (this.places?.files || []).find(f => blockKey(f[0], f[1], f[2]) === key)?.[3];
      if (w.agent.files.includes(key)) return client.send({ t: 'secret_file', again: true, found: w.agent.files.length, need, clear: w.agent.clear });
      w.agent.files.push(key);
      const done = w.agent.files.length >= need && !w.agent.clear;
      if (done) w.agent.clear = true;
      this.sendWallet(client);
      client.send({ t: 'secret_file', found: w.agent.files.length, need, clear: w.agent.clear, where, left: this.filesLeft(w) });
      if (done) {
        this.log(`${client.name} got Top Secret clearance`);
        this.npcs.breaking('Rumor has it there\'s a brand new secret agent in BuildZone... but that\'s TOP SECRET! 🕵️');
      }
      this.onDirty();
    },

    // Who your bodyguards let onto your land (names from the Character Gallery, or anyone's).
    guests(client, { names }) {
      if (!Array.isArray(names) || !this.allow(client, 'guests', 1, 3)) return;
      const w = this.wallet(client);
      if (!w.owned.includes('bodyguards')) return;
      const me = nameKey(client.name);
      w.guests = [...new Set(names.filter(n => typeof n === 'string').map(n => nameKey(cleanName(n))).filter(k => k && k !== me))].slice(0, 40);
      client.send({ t: 'chat', system: true, text: w.guests.length ? `🛡️ Your bodyguards will let in: ${names.filter(n => typeof n === 'string').map(cleanName).filter(n => nameKey(n) !== me).slice(0, 40).join(', ')}.` : '🛡️ Your bodyguards won\'t let anybody in but you.' });
      this.onDirty();
      this.updateGuards();
    },

    // Night-vision goggles from the gadget vault (agents only: you'd have to be inside!).
    take_goggles(client, { x, y, z }) {
      if (!this.allow(client, 'skis', 1, 3) || !inBounds(x, y, z) || BLOCKS[blockId(itemOf(this.get(x, y, z)))]?.spy !== 'goggles') return;
      if (Math.hypot(client.pos[0] - x - 0.5, client.pos[1] - y, client.pos[2] - z - 0.5) > 6 || !this.cleared(client)) return;
      const w = this.wallet(client);
      if (w.found.includes('goggles')) return client.send({ t: 'gear_found', gear: 'goggles', again: true });
      w.found.push('goggles');
      this.sendWallet(client);
      client.send({ t: 'gear_found', gear: 'goggles' });
      this.onDirty();
    },

    // Fishing: cast from a fishing stool (the bite comes a little later), then reel in.
    fish_cast(client, { x, y, z }) {
      if (!this.allow(client, 'fish', 1, 3) || !inBounds(x, y, z) || !BLOCKS[blockId(itemOf(this.get(x, y, z)))]?.fishing) return;
      if (Math.hypot(client.pos[0] - x - 0.5, client.pos[2] - z - 0.5) > 2.5) return;
      if (!this.waterNear(x, y, z)) return client.send({ t: 'fish_gone', why: 'dry' });
      const [lo, hi] = FISH_WAIT;
      client.fish = { bite: Date.now() + lo + Math.random() * (hi - lo), bitten: 0, spot: [x, y, z] };
    },

    fish_reel(client) {
      const f = client.fish;
      if (!f) return;
      client.fish = null;
      const now = Date.now();
      if (!f.bitten) return client.send({ t: 'fish_gone', why: 'soon' });
      if (now > f.bitten + FISH_BITE + 600) return client.send({ t: 'fish_gone', why: 'away' }); // (a little extra for the trip here)
      const pick = () => {
        let r = Math.random() * FISH.reduce((a, d) => a + d.chance, 0);
        for (const d of FISH) if ((r -= d.chance) < 0) return d;
        return FISH[0];
      };
      let fish = pick();
      // The Nature Club's lucky rod: two tries, and the rarer fish wins.
      if (this.perk(client, 'nature')) {
        const other = pick();
        if (other.chance < fish.chance) fish = other;
      }
      const w = this.wallet(client), isNew = !w.fish.includes(fish.name);
      if (isNew) w.fish.push(fish.name);
      w.coins += fish.coins;
      this.sendWallet(client);
      if (fish.coins > 0) this.progress(client, 'nature', 'fish');
      this.progress(client, 'nature', 'kinds', w.fish.filter(f => f !== 'Old Boot').length, true);
      client.send({ t: 'fish_caught', name: fish.name, icon: fish.icon, coins: fish.coins, isNew, kinds: w.fish.length, of: FISH.length, rare: fish.chance <= 3 });
      if (fish.chance <= 3) this.broadcast({ t: 'chat', system: true, text: `🎣 ${client.name} caught a ${fish.name}! ${fish.icon}` }, client);
      this.onDirty();
    },

    fish_stop(client) {
      client.fish = null;
    },

    // The hammer dug out the ground (down to the bedrock), or someone filled a hole back in.
    // Digging: a hole in the ground (y -1, or no y), or (Tunnel Diggers) a tunnel further down.
    dig(client, { x, y, z }) {
      if (y !== undefined && y !== -1) return this.digTunnel(client, x, y, z, true);
      if (!this.canDig(client, x, z) || this.holes.has(`${x},${z}`) || this.holes.size >= MAX_HOLES) return client.send({ t: 'hole', x, z, on: this.holes.has(`${x},${z}`) });
      this.holes.set(`${x},${z}`, Date.now());
      this.broadcast({ t: 'hole', x, z, on: true });
      this.progress(client, 'tunnel', 'dig');
      this.onDirty();
    },

    // Filling it back in with earth (Grass or Dirt).
    fill(client, { x, y, z }) {
      if (y !== undefined && y !== -1) return this.digTunnel(client, x, y, z, false);
      if (!this.canDig(client, x, z, true) || !this.holes.has(`${x},${z}`) || this.get(x, -1, z)) return client.send({ t: 'hole', x, z, on: this.holes.has(`${x},${z}`) });
      this.holes.delete(`${x},${z}`);
      this.broadcast({ t: 'hole', x, z, on: false });
      this.onDirty();
    },

    // Giving up your home land, or your vacation land (msg.vacation).
    unclaim(client, msg = {}) {
      const land = msg.vacation ? this.vacationOf(client) : this.homeOf(client);
      if (!land) return;
      this.claims = this.claims.filter(c => c !== land);
      this.broadcast({ t: 'claims', claims: this.claims });
      if (land.vacation) this.sendWallet(client);
      client.send({ t: 'chat', system: true, text: land.vacation
        ? '🏳️ You gave up your vacation land. Anyone can build there now. (To get vacation land again, buy a new Vacation Flag.)'
        : '🏳️ You gave up your land. Anyone can build there now.' });
      this.onDirty();
    },

    sleep(client, msg) {
      client.sleeping = !!msg.on;
      this.checkSleep();
    },
  };

  // ---------- Signs ----------

  // A sign's writing goes when the sign does.
  carrySign(k, b) {
    if (this.signs.has(k) && blockId(itemOf(b)) !== SIGN) this.signs.delete(k);
  }

  signList() {
    const out = [];
    for (const [k, text] of this.signs) if (blockId(itemOf(this.world.get(k) || 0)) === SIGN) out.push([...k.split(',').map(Number), text]);
    return out;
  }

  // ---------- Pizza delivery ----------
  // Chef Rosa (or the oven at the Pizza Palace) gives you a pizza and a house to take it to.
  // Get it there and you're paid in coins, with a tip if you're quick.

  // Spots just outside the front doors of houses (and cabins, and anywhere else with a door).
  deliverySpots() {
    const now = Date.now();
    if (this.spotsCache && now - this.spotsCache.at < 5 * 60 * 1000) return this.spotsCache.list;
    const list = [];
    const covered = (x, z) => {
      for (let y = 1; y < 10; y++) if (isSolidBlock(this.get(x, y, z))) return true;
      return false;
    };
    for (const [k, v] of this.world) {
      if (blockId(itemOf(v)) !== DOOR || (itemOf(v) >> 8) & DOOR_TOP) continue; // (bottom halves of doors)
      const [x, y, z] = k.split(',').map(Number);
      if (y !== 0) continue;
      const along = ((itemOf(v) >> 8) & 1) === 0 ? [1, 0] : [0, 1];
      // Not garage doors (three or more doors side by side).
      const beside = [-1, 1].filter(s => blockId(itemOf(this.get(x + along[0] * s, 0, z + along[1] * s))) === DOOR).length;
      if (beside > 1) continue;
      // Outside is the side that's open to the sky a couple of steps out (a roof can hang over
      // the doorstep).
      const open = (cx, cz) => !isSolidBlock(this.get(cx, 0, cz)) && !isSolidBlock(this.get(cx, 1, cz));
      const out = [[along[1], along[0]], [-along[1], -along[0]]].find(([dx, dz]) =>
        open(x + dx, z + dz) && open(x + 2 * dx, z + 2 * dz) && !covered(x + 2 * dx, z + 2 * dz));
      if (out) list.push([x + out[0] + 0.5, z + out[1] + 0.5]);
    }
    this.spotsCache = { at: now, list };
    return list;
  }

  startJob(client) {
    const pizza = this.places?.pizza;
    if (!pizza) return;
    const job = this.jobs.get(client.id);
    if (job) {
      client.send({ t: 'job', ...job, again: true });
      this.npcs.chefSays(`That pizza's getting cold, ${client.name}! Follow the 🍕 marker!`);
      return;
    }
    const spots = this.deliverySpots().filter(([x, z]) => {
      const d = Math.hypot(x - pizza.x, z - pizza.z);
      return d > 25 && d < 170 && !claimAt(this.claims, x, z)?.permanent;
    });
    if (!spots.length) return this.npcs.chefSays('No orders right now. Come back soon!');
    const [x, z] = spots[Math.floor(Math.random() * spots.length)];
    const d = Math.hypot(x - pizza.x, z - pizza.z);
    const next = { x, z, reward: 3 + Math.round(d / 35), par: Math.round(d / 4 + 25), at: Date.now() };
    this.jobs.set(client.id, next);
    client.send({ t: 'job', ...next });
    this.npcs.chefSays(`Hot pizza, ${client.name}! Take it to the house with the 🍕 marker. Quick, for a tip!`);
  }

  // ---------- Holes in the ground ----------

  // under: digging (or filling) from underneath (from a tunnel), so what's on top doesn't matter.
  canDig(client, x, z, under = false) {
    if (!Number.isInteger(x) || !Number.isInteger(z) || !inBounds(x, 0, z)) return false;
    if (!this.allow(client, 'dig', 4, 8)) return false;
    if (!under && client.pos[1] >= -0.5 && this.world.has(blockKey(x, 0, z))) return false; // (only bare ground, not under a road or a building)
    if (Math.hypot(client.pos[0] - x - 0.5, client.pos[2] - z - 0.5) > 12) return false;
    if (!canBuild(this.claims, client.name, x, z)) {
      if (this.allow(client, 'claimMsg', 0.2, 1)) client.send({ t: 'chat', system: true, text: `🚧 This land belongs to ${claimAt(this.claims, x, z).owner}. Only they can dig here.` });
      return false;
    }
    return true;
  }

  // A Tunnel Digger digging out a spot underground (dig), or filling one back in with earth. It
  // has to be next to somewhere already open (a hole, or a tunnel), and nobody else's land.
  digTunnel(client, x, y, z, dig) {
    const k = tunnelKey(x, y, z);
    const undo = () => client.send({ t: 'tunnel', x, y, z, on: this.tunnels.has(k) });
    if (!this.perk(client, 'tunnel') || !isTunnelY(y) || !this.canDig(client, x, z, true)) return undo();
    if (Math.abs(client.pos[1] - y) > 10) return undo();
    if (dig) {
      if (this.tunnels.has(k) || this.tunnels.size >= MAX_TUNNELS) return undo();
      const open = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => openBelow(this.holes, this.tunnels, x + dx, y + dy, z + dz));
      if (!open) return undo();
      this.tunnels.add(k);
    } else {
      if (!this.tunnels.has(k) || this.world.has(k)) return undo();
      // (Not with anybody in it.)
      if ([...this.clients.values()].some(c => c.joined && Math.floor(c.pos[0]) === x && Math.floor(c.pos[2]) === z && c.pos[1] < y + 1 && c.pos[1] + 1.8 > y)) return undo();
      this.tunnels.delete(k);
    }
    this.tellDiggers({ t: 'tunnel', x, y, z, on: dig });
    this.onDirty();
  }

  // Bare bedrock doesn't stay that way for long: the grass grows back over it (but not while
  // someone, or a vehicle, is down in the hole).
  healHoles() {
    const now = Date.now();
    for (const [k, t] of this.holes) {
      if (now - t < HOLE_HEAL * 1000) continue;
      const [x, z] = k.split(',').map(Number);
      if (this.world.has(blockKey(x, -1, z))) continue; // (something's been put in it: it stays)
      const inside = p => Math.floor(p[0]) === x && Math.floor(p[2]) === z && p[1] < 0.5 && p[1] > -1.5;
      if ([...this.clients.values()].some(c => c.joined && inside(c.pos))) {
        this.holes.set(k, now - HOLE_HEAL * 1000 + 10000); // try again in a little while
        continue;
      }
      this.holes.delete(k);
      this.broadcast({ t: 'hole', x, z, on: false, grow: true });
      this.onDirty();
    }
  }

  // ---------- Growing trees ----------

  // A lone log on the ground (with room above it) is a sapling that grows into a tree.
  maybePlant(x, y, z) {
    const below = y === 0 ? (this.holes.has(`${x},${z}`) ? 0 : GRASS) : blockId(this.get(x, y - 1, z));
    if (below !== GRASS && below !== DIRT) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isSolidBlock(this.get(x + dx, y, z + dz))) return;
    for (let k = 1; k <= 3; k++) if (this.get(x, y + k, z)) return;
    if (this.saplings.length > 200) return;
    this.saplings.push({ x, y, z, stage: 0, height: 4 + Math.floor(Math.random() * 3), at: Date.now() + 8000 });
    return true;
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

  // Someone's own vehicles (their homes, whether or not the vehicle's out in the world right now).
  ownedVehicles(key) {
    return [...this.homes.values()].filter(h => h.key === key);
  }

  // An owned vehicle goes back to the town: it drives off (the town already has its own one).
  giveBack(v) {
    this.homes.delete(v.home);
    this.respawns = this.respawns.filter(r => r.home !== v.home);
    this.vehicles.delete(v.id);
    this.broadcast({ t: 'car_gone', id: v.id });
    this.onDirty();
  }

  // Is there water within a few blocks of (x, y, z), at that height or a little lower?
  waterNear(x, y, z, r = 7) {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++)
        for (let dy = 0; dy >= -2; dy--) if (isWaterBlock(this.get(x + dx, y + dy, z + dz))) return true;
    return false;
  }

  // Others online under the same name as `client` (the first one, or all of them).
  sameName(client, all = false) {
    const key = nameKey(client.name), found = [];
    for (const c of this.clients.values()) {
      if (c === client || !c.joined || nameKey(c.name) !== key) continue;
      if (!all) return c;
      found.push(c);
    }
    return all ? found : null;
  }

  // Where someone is, so they come back there next time they play.
  rememberSpot(client) {
    const [x, y, z] = client.pos, r = v => Math.round(v * 100) / 100;
    if (![x, y, z].every(Number.isFinite) || !inBounds(Math.floor(x), Math.max(0, Math.floor(y)), Math.floor(z))) return;
    this.spots[nameKey(client.name)] = [r(x), r(y), r(z), r(client.rot?.[0] || 0), Date.now()];
  }

  expireClaims() {
    const limit = Date.now() - CLAIM_EXPIRE_DAYS * DAY_MS;
    for (const [k, p] of Object.entries(this.spots)) if (p[4] < limit) delete this.spots[k];
    for (const home of [...this.homes.values()]) {
      if (!home.key || (this.names[home.key] || 0) > limit) continue;
      const v = [...this.vehicles.values()].find(o => o.home === home.id);
      if (v) this.giveBack(v);
      else this.homes.delete(home.id);
    }
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
    this.updateWeather(dt);
    const t = this.timers;
    for (const k in t) t[k] -= dt;

    if (t.sync <= 0) {
      t.sync = 10;
      this.broadcast({ t: 'time', time: this.time });
    }
    if (t.names <= 0) {
      t.names = 60;
      for (const c of this.clients.values()) {
        if (!c.joined) continue;
        this.seen(c.name);
        if (c.moved) this.rememberSpot(c); // (in case the server stops before they leave)
      }
    }
    if (!(t.mend > 0)) {
      t.mend = MEND_EVERY;
      this.mend();
    }
    if (t.holes <= 0) {
      t.holes = 5;
      if (this.holes.size) this.healHoles();
    }
    if (t.expire <= 0) {
      t.expire = 600;
      this.expireClaims();
    }
    if (!(t.guards > 0)) {
      t.guards = 2; // (land claimed, moved or given up: the bodyguards (and families) go with it)
      this.updateGuards();
      this.updateFamilies();
    }
    if (!(t.quests > 0)) {
      t.quests = 1;
      this.quests.update();
    }
    // A fish bites (or, too slow, swims off).
    for (const c of this.clients.values()) {
      const f = c.fish;
      if (!f) continue;
      if (!f.bitten && now >= f.bite) {
        f.bitten = now;
        c.send({ t: 'fish_bite' });
      } else if (f.bitten && now > f.bitten + FISH_BITE + 1500) {
        c.fish = null;
        c.send({ t: 'fish_gone', why: 'away' });
      }
    }

    // A town vehicle left with hardly any gas gets filled up by the town after a while (so the
    // town's cars don't all end up empty). People's own vehicles are up to them.
    if (!(t.refill > 0)) {
      t.refill = 30;
      for (const v of this.vehicles.values()) {
        if (v.key || v.driver || !usesFuel(v.kind) || v.fuel >= 0.3 || now - v.idleAt < TOWN_REFILL) continue;
        v.fuel = 1;
        this.broadcast({ t: 'car_fuel', id: v.id, fuel: 1 });
        this.onDirty();
      }
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
        if (v.key) for (const c of this.clients.values()) {
          if (c.joined && nameKey(c.name) === v.key) c.send({ t: 'chat', system: true, text: `🔑 Your ${VEHICLES[v.kind].name} is back where you parked it.` });
        }
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
      if (c.joined && c.fresh && joined > 1) list.push([c.id, ...c.pos, ...c.rot, c.pet, c.ball, c.flags, c.ts, c.drone || 0]);
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
const publicVehicle = ({ id, kind, color, x, y, z, h, driver, passengers, hp, owner, loaded, fuel, dirt, siren }) => ({ id, kind, color, x, y, z, h, driver, passengers, hp: Math.round(hp), owner: owner || '', loaded: !!loaded, fuel: round3(fuel), dirt: round3(dirt), siren: siren ? 1 : 0 });
const round3 = n => Math.round(num(n) * 1000) / 1000;
// A family's members, checked over: names and looks, a few of them.
function cleanFamily(list) {
  if (!Array.isArray(list)) return null;
  const out = list.filter(m => m && typeof m === 'object').slice(0, MAX_FAMILY).map(m => ({ name: cleanName(m.name), look: sanitizeLook(m.look) }));
  return out.length ? out : null;
}
// Saved club progress, checked over: only real clubs and tasks, and sensible counts.
function cleanClubs(saved) {
  const out = {};
  if (!saved || typeof saved !== 'object') return out;
  for (const def of CLUBS) {
    const c = saved[def.id];
    if (!c || typeof c !== 'object') continue;
    for (const t of def.tasks) if (Number.isFinite(c[t.id]) && c[t.id] > 0) (out[def.id] ??= {})[t.id] = Math.min(t.goal, Math.floor(c[t.id]));
  }
  return out;
}
