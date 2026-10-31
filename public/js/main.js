// BuildZone: game setup, input and the main loop.
import * as THREE from 'three';
import {
  BLOCKS, WORLD, inBounds, blockId, blockMeta, shapeOf, isReplaceable, makeBlock, doorFacingFromYaw, paintOf, withPaint,
  railMask, railBoxes, nearestRailEdge, canHoldItem, stack, itemOf, floorOf, turnLine, blockKey, faceIndex, hexToRgb,
  switchable, lightOff, toggleLight, setDoorOpen, isWaterBlock, facingTowards,
  PAINT_COLORS, PAINT_NAMES, DOOR_OPEN, DOOR_TOP, BED_FOOT, NOTE_NAMES, NOTE_FREQS, PICTURES,
} from './shared/blocks.js';
import { generateWorld } from './shared/worldgen.js';
import { randomLook, sanitizeLook } from './shared/avatar.js';
import { generateTextures } from './textures.js';
import { World, createBlockMaterials, blockMaterial, RAILING, WIND, rayBox } from './world.js';
import { Player, EYE_HEIGHT, CROUCH_DROP } from './player.js';
import { Network } from './network.js';
import { Avatar, Avatars, FLAG } from './avatars.js';
import { Cars, SEAT_SCALE } from './cars.js';
import { MAX_HP, FIRE_HP, PERSON_MASS } from './shared/vehicles.js';
import { normalizeRect, claimSizeOk, rectsOverlap, canBuild, claimAt, nameKey } from './shared/claims.js';
import { Structures } from './structures.js';
import { TVs, CHANNELS } from './tv.js';
import { Reflections, Glow } from './lighting.js';
import { LightPools } from './lightpools.js';
import { LandView, describeSize } from './landview.js';
import { Ball, PetBrain } from './pets.js';
import { PetNav } from './petmove.js';
import { DayNight } from './daynight.js';
import { Editor } from './editor.js';
import { CharacterClient, Gallery } from './gallery.js';
import { Hud, renderControls, CUSTOM_PAINT } from './hud.js';
import {
  HAMMER, FIREWORKS, BALL, CLAIM, BRUSH, SCRAPER, LADDER, WATER_BALLOON, BUBBLES, BALLOON, FILL, COPY, CAMERA, JETPACK, TRAIL, SHOWTIME,
  ALL_ITEMS, DEFAULT_HOTBAR, makeIcon, ViewModel,
} from './items.js';
import { MAX_MANY } from './shared/game.js';
import { NPC_ACT } from './shared/npcs.js';
import { Shop } from './shop.js';
import { Particles, Fireworks, Sounds, Effects } from './effects.js';
import { TouchControls, IS_TOUCH } from './touch.js';

const $ = id => document.getElementById(id);
const REACH = 7;
const BASE_FOV = 80;
const FIREWORK_COLORS = ['#ff4d4d', '#ffd84a', '#4dd2ff', '#7dff6a', '#ff7af0', '#ffffff', '#ff9a3c', '#b388ff'];
const DOOR = 21;
const BED = 64;

// ---------- Saved settings ----------

const settings = { name: '', look: null, sensitivity: 1, volume: 0.4, quality: 'high', fps: 60, paint: 1, customColor: '#ff9ec7', hotbar: DEFAULT_HOTBAR.slice() };
let savedSettings = {};
try {
  savedSettings = JSON.parse(localStorage.getItem('buildzone') || '{}') || {};
} catch { /* storage unavailable */ }
Object.assign(settings, savedSettings);
if (IS_TOUCH && !savedSettings.quality) settings.quality = 'low'; // phones start on the faster graphics
if (!Array.isArray(settings.hotbar) || settings.hotbar.length !== 9 || !settings.hotbar.every(i => ALL_ITEMS.includes(i))) {
  settings.hotbar = DEFAULT_HOTBAR.slice();
}
// The hammer always lives in slot 1.
if (settings.hotbar[0] !== HAMMER) {
  const at = settings.hotbar.indexOf(HAMMER);
  if (at > 0) settings.hotbar[at] = settings.hotbar[0];
  settings.hotbar[0] = HAMMER;
}
if (!PAINT_COLORS[settings.paint] && settings.paint !== CUSTOM_PAINT) settings.paint = 1;
if (!/^#[0-9a-f]{6}$/i.test(settings.customColor)) settings.customColor = '#ff9ec7';
if (![0, 30, 60].includes(settings.fps)) settings.fps = 60;
settings.recent = Array.isArray(settings.recent) ? settings.recent.filter(i => ALL_ITEMS.includes(i)).slice(0, 12) : [];
// The brush's color: a palette color, or your own.
const paintHex = () => (settings.paint === CUSTOM_PAINT ? settings.customColor : PAINT_COLORS[settings.paint]);
const paintName = () => (settings.paint === CUSTOM_PAINT ? 'your color' : PAINT_NAMES[settings.paint]);
settings.look = settings.look ? sanitizeLook(settings.look) : randomLook();
function saveSettings() {
  try {
    localStorage.setItem('buildzone', JSON.stringify(settings));
  } catch { /* storage unavailable */ }
}

// ---------- Renderer, scene and sky ----------

const canvas = $('game');
// (The browser picks the graphics chip: on laptops that's usually the cooler, battery-friendly one.)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // shadows are redrawn every few frames (see frame())
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.rotation.order = 'YXZ';
const sky = new DayNight(renderer, scene);
const reflections = new Reflections(renderer, scene);
const glow = new Glow(renderer, scene, camera);

// Graphics settings. Live reflections and glow look great but need a good graphics card.
// shadowEvery: shadows are redrawn every this many frames (they barely change between two).
const QUALITY = {
  high: { pixelRatio: 1.5, shadowMap: 2048, shadowSoftness: 3, shadowEvery: 2, lamps: 8, bloom: true, reflections: 128, reflectEvery: 2 },
  medium: { pixelRatio: 1, shadowMap: 1024, shadowSoftness: 2, shadowEvery: 3, lamps: 6, bloom: true, reflections: 64, reflectEvery: 4 },
  low: { pixelRatio: 0.75, shadowMap: 0, shadowSoftness: 1, shadowEvery: 4, lamps: 3, bloom: false, reflections: 0 },
};
function applyQuality() {
  const q = QUALITY[settings.quality] || QUALITY.high;
  const pixelRatio = Math.min(window.devicePixelRatio, q.pixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  glow.enabled = sky.glowOn = q.bloom;
  glow.setSize(window.innerWidth, window.innerHeight, pixelRatio);
  reflections.configure(q.reflections, q.reflectEvery);
  sky.liveReflections = reflections.live;
  sky.sun.shadow.radius = q.shadowSoftness;
  sky.sun.castShadow = q.shadowMap > 0;
  if (q.shadowMap && sky.sun.shadow.mapSize.x !== q.shadowMap) {
    sky.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    sky.sun.shadow.map?.dispose();
    sky.sun.shadow.map = null;
  }
  if (sky.lampLights.length !== q.lamps) sky.setLampLightCount(q.lamps);
}
applyQuality();

// Block highlight under the crosshair.
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.65 }),
);
highlight.visible = false;
scene.add(highlight);

// Headlights for the car you're driving (always in the scene so shaders don't recompile).
const headlight = new THREE.SpotLight(0xfff2d0, 0, 50, 0.62, 0.85, 1.2); // a wide, soft-edged beam
scene.add(headlight, headlight.target);

const view = new ViewModel();
const tmpColor = new THREE.Color();
const particles = new Particles(scene);
const effects = new Effects(scene);
const fireworks = new Fireworks(scene, effects);
const tvs = new TVs(scene);
const lightPools = new LightPools(scene);
const landView = new LandView(scene);
const sounds = new Sounds();
sounds.volume = settings.volume;

// ---------- Game state ----------

let world, player, materials, textures, icons, hud, cars, myBody, editor, gallery, structures, ball, shop;
const npcs = new Map(); // the town's people (run by the server): id -> Avatar
const coinMap = new Map(); // gold coins lying about: id -> { x, y, z, value, asked }
let wallet = { coins: 0, owned: [] };
let shopOpen = false;
let claims = [];
const net = new Network();
const avatars = new Avatars(scene);
let myId = null;
let online = false;
let inGame = false;
let myCar = null; // the vehicle we're driving
let myRide = null; // the vehicle we're riding in as a passenger
const riding = () => myCar || myRide;
// Seat 0 is the driver's; passengers sit in seats 1 and 2 in the order they got in.
const mySeat = () => (myCar ? 0 : 1 + Math.max(0, myRide.passengers.indexOf(myId)));
let viewMode = 0; // 0 first person, 1 behind, 2 in front
let carView = 1;
const carCam = { yaw: 0, pitch: -0.15 };
let danceView = 0;

function buildGround() {
  const groundTex = textures.grass_top;
  const repeat = 700;
  const map = groundTex.map.clone();
  const normalMap = groundTex.normalMap.clone();
  for (const t of [map, normalMap]) {
    t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
  }
  const geo = new THREE.PlaneGeometry(repeat, repeat, 140, 140).rotateX(-Math.PI / 2);
  // Gentle large-scale color variation hides the texture repeating.
  const colors = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.5 + Math.sin(x * 0.023 + z * 0.031) * 0.5;
    const k = 0.9 + n * 0.1;
    colors.push(k * (0.97 + n * 0.03), k, k * (0.95 - n * 0.05));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, normalMap, vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // A soft force-field marks the edge of the world.
  const fc = document.createElement('canvas');
  fc.width = 4;
  fc.height = 64;
  const g = fc.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(90,180,255,0)');
  grad.addColorStop(1, 'rgba(90,180,255,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const fieldMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const span = WORLD.max - WORLD.min + 1, h = 4, mid = (WORLD.min + WORLD.max + 1) / 2;
  for (const [x, z, ry] of [[mid, WORLD.min, 0], [mid, WORLD.max + 1, 0], [WORLD.min, mid, Math.PI / 2], [WORLD.max + 1, mid, Math.PI / 2]]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(span, h), fieldMat);
    wall.position.set(x, h / 2, z);
    wall.rotation.y = ry;
    scene.add(wall);
  }
}

async function load() {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  textures = await generateTextures(anisotropy, p => ($('loading-fill').style.width = `${p * 100}%`));
  materials = createBlockMaterials(textures);
  for (const m of new Set(Object.values(materials).flat())) if (m.userData.shine) reflections.addShiny(m, m.userData.shine);
  // Lamp models' glowing parts get brighter at night (indoor ones stay on all day).
  sky.glowMaterials = Object.entries(BLOCKS).filter(([, d]) => d.shape === 'model').map(([id, d]) => ({ material: materials[id][1], always: !!d.light?.always }));
  view.materials = materials;
  icons = Object.fromEntries(ALL_ITEMS.map(i => [i, makeIcon(i, textures, paintHex())]));
  view.setPaint(paintHex());
  world = new World(scene, materials);
  structures = new Structures(world);
  world.onChange = (x, y, z) => structures.changed(x, y, z);
  world.onLoad = () => structures.scan();
  sky.extraLights = structureLights;
  player = new Player(world);
  player.bouncePower = trampolineBounce;
  player.onBoost = () => sounds.zoom();
  cars = new Cars(scene, world, effects);
  cars.reflections = reflections;
  player.extraBoxes = () => cars.boxes(myCar?.id);
  player.onPushCar = pushCar;
  cars.people = () => [...avatars.list.values()].filter(a => !a.seat && !a.lying).map(a => ({ id: a.id, pos: a.pos }));
  ball = new Ball(scene);
  ball.onBounce = (p, k, axis) => {
    sounds.ballBounce(k * loudness(p.x, p.y, p.z, 30));
    if (axis === 'y' && k > 0.3) for (let i = 0; i < 2; i++) effects.smokePuff(p.x, p.y - 0.15, p.z, 0);
  };
  buildGround();

  // Show the town behind the main menu.
  const preview = generateWorld();
  world.load(preview.blocks.flat());
  preview.cars.forEach((c, i) => cars.add({ ...c, id: -1 - i, driver: 0, color: c.color || FIREWORK_COLORS[i % FIREWORK_COLORS.length] }));

  hud = new Hud({
    icons, settings, sounds, onPaint: choosePaint,
    onChange: item => {
      view.setItem(item);
      if (fillable(item)) lastBlock = item;
    },
  });
  shop = new Shop({
    icons, sounds,
    onBuy: item => net.send({ t: 'buy', item }),
    onClose: () => {
      shopOpen = false;
      lock();
      updateOverlays();
    },
  });
  editor = new Editor();
  gallery = new Gallery(new CharacterClient(), sounds);
  myBody = new Avatar(scene, { id: 0, name: '', look: settings.look }, { tag: false });
  myBody.snap = true;
  myBody.root.visible = false;
  myBody.brain = new PetBrain();
  myBody.ball = ball;
  myBody.petNav = new PetNav(world);
  myBody.petBoxes = () => cars.boxes(); // pets bump into cars too
  myBody.onPetEvent = (kind, what) => {
    const pet = myBody.pet;
    if (!pet) return;
    if (kind === 'dropped') {
      sounds.pet(pet.kind);
      effects.heartsAt(pet.pos.x, pet.pos.y + 0.6, pet.pos.z);
    } else if (kind === 'whine') {
      sounds.pet(pet.kind);
    } else if (kind === 'giveup') {
      // It couldn't get to the ball (or back to you): the ball pops back into your hand.
      if (ball.active) effects.sparkle(ball.pos.x, ball.pos.y, ball.pos.z, 14);
      ball.active = ball.carried = false;
      sounds.pet(pet.kind);
      hud.toast(what === 'ball'
        ? "🐾 Your pet can't find a way to the ball, so it's back in your hand."
        : "🐾 Your pet can't find a way up to you, so it's waiting below. (The ball is back in your hand.)");
    }
  };
  renderControls($('menu-controls'));
  renderControls($('pause-controls'));

  $('name').value = settings.name;
  $('sensitivity').value = settings.sensitivity;
  $('volume').value = settings.volume;
  $('quality').value = settings.quality;
  $('fps').value = String(settings.fps);
  $('loading').classList.add('hidden');
  $('join-form').classList.remove('hidden');
  if (!IS_TOUCH) $('name').focus();
  requestAnimationFrame(frame);
}

// ---------- Joining ----------

$('join-form').addEventListener('submit', async e => {
  e.preventDefault();
  goFullscreen();
  settings.name = $('name').value.trim() || 'Builder';
  saveSettings();
  $('play').disabled = true;
  $('status').textContent = 'Connecting…';
  sounds.ensure();

  let welcome;
  try {
    welcome = await net.connect(settings.name, settings.look);
    online = true;
  } catch {
    welcome = await net.connectOffline(settings.name, settings.look);
    online = false;
  }

  // The server has a newer version of the game than this page (it was updated while this
  // tab was open): load the new version. Only once, so it can never keep reloading.
  const pageBuild = document.querySelector('meta[name="build"]')?.content;
  if (welcome.build && pageBuild && pageBuild !== '%BUILD%' && welcome.build !== pageBuild) {
    let tried = null;
    try {
      tried = sessionStorage.getItem('buildzone-update');
      sessionStorage.setItem('buildzone-update', welcome.build);
    } catch { /* storage unavailable */ }
    if (tried !== welcome.build) {
      $('status').textContent = 'BuildZone was updated! Loading the new version…';
      net.leave?.();
      location.reload();
      return;
    }
  }

  myId = welcome.id;
  world.load(welcome.world);
  world.loadPaints(welcome.paints);
  avatars.clear();
  for (const p of welcome.players) avatars.add(p);
  for (const n of welcome.npcs || []) npcs.set(n.id, new Avatar(scene, { id: n.id, name: n.name, look: n.look }));
  for (const [id, x, y, z, value] of welcome.coins || []) coinMap.set(id, { x, y, z, value });
  $('coins').classList.remove('hidden');
  cars.clear();
  for (const c of welcome.cars) cars.add(c);
  setClaims(welcome.claims || []);
  sky.time = welcome.time;
  hud.addChat({ system: true, text: online
    ? `Welcome, ${settings.name}! ${welcome.players.length} other builder(s) online.`
    : 'Playing single player. Your world saves in this browser. Run "npm start" to play with friends!' });
  hud.addChat({ system: true, text: touch
    ? 'Tip: look at a car or the helicopter and tap ✋ to drive it. Tap 🎒 to see the Build Book!'
    : 'Tip: right-click a car or the helicopter to drive it. Press E to see the Build Book!' });

  inGame = true;
  respawn(true);
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  lock();
});

net.on('set', ({ x, y, z, b }) => {
  const old = world.get(x, y, z);
  if (world.set(x, y, z, b) && !b && old) particles.burst(x, y, z, blockMaterial(materials, old), 6);
});
net.on('paint', ({ x, y, z, floor, faces }) => world.setPaint(blockKey(x, y, z) + (floor ? '|f' : ''), faces));
net.on('states', ({ list, cars: carStates, npcs: npcStates }) => {
  avatars.applyStates(list, myId);
  cars.applyStates(carStates || [], myCar?.id);
  // The town's people: where they are and what they're doing.
  for (const [id, x, y, z, yaw, action] of npcStates || []) {
    const a = npcs.get(id);
    if (!a) continue;
    a.setState(x, y, z, yaw, 0);
    if (action === NPC_ACT.wave && a.wave <= 0) a.emote('wave');
    if (action === NPC_ACT.dance || action === NPC_ACT.cheer) a.dance = Math.max(a.dance, 0.6);
    a.crouching = action === NPC_ACT.pet;
  }
});
net.on('npc_say', ({ id, text }) => {
  const a = npcs.get(id);
  if (!a) return;
  a.say(text);
  if (a.pos.distanceTo(player.pos) < 16) hud.addChat({ name: a.name, color: '#ffd54f', text });
});
net.on('npc_pet', () => myBody.brain?.cheer()); // somebody petted our pet: it's so happy!
net.on('shop_open', () => openShop());
net.on('wallet', ({ coins, owned }) => {
  const more = coins > wallet.coins;
  wallet = { coins, owned };
  hud.setOwned(owned);
  shop.update(coins, owned);
  const el = $('coins');
  el.textContent = `🪙 ${coins}`;
  if (more) {
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 180);
  }
});
net.on('coin_new', ({ id, x, y, z, value }) => coinMap.set(id, { x, y, z, value }));
net.on('coin_gone', ({ id }) => {
  const c = coinMap.get(id);
  if (c) effects.sparkle(c.x, c.y + 0.4, c.z, 16);
  coinMap.delete(id);
});
net.on('coin_got', ({ value }) => {
  sounds.coin();
  hud.toast(value > 1 ? `🪙 +${value} coins! A big one!` : '🪙 +1 coin');
});
net.on('join', info => avatars.add(info));
net.on('leave', ({ id }) => avatars.remove(id));
net.on('chat', msg => hud.addChat(msg));
net.on('look', ({ id, look, name }) => {
  const a = avatars.list.get(id);
  a?.setLook(look);
  if (name) a?.setName(name);
});
net.on('emote', ({ id, kind }) => avatars.list.get(id)?.emote(kind));
net.on('fx', ({ kind, x, y, z, color, seed, dir }) => {
  if (kind === 'hearts') effects.heartsAt(x, y, z);
  else if (kind === 'bubbles') effects.blowBubbles(x, y, z, dir || [0, 0.3, 0], 4);
  else if (kind === 'balloon') letBalloonGo(x, y, z, color);
  else if (kind === 'sparkle') effects.sparkle(x, y, z, 30);
  else if (fireworks.launch(x, y, z, color, seed)) {
    sounds.launch(loudness(x, y, z, 80));
  }
});
// A vehicle (re)appeared.
net.on('car', ({ car }) => {
  cars.add(car);
  if (loudness(car.x, car.y, car.z, 40) > 0) {
    sounds.spawnCar();
    effects.sparkle(car.x, car.y, car.z, 40);
  }
});
net.on('car_hp', ({ id, hp, impact }) => {
  const car = cars.list.get(id);
  if (!car) return;
  const hurt = hp < car.hp;
  if (hurt && car.hp >= FIRE_HP && hp < FIRE_HP && riding() === car) hud.addChat({ system: true, text: '🔥 Your vehicle is on fire! Get out (E) before it blows up!' });
  cars.applyHp(car, hp, impact);
  if (hurt && impact && riding() !== car) sounds.crash(loudness(car.pos.x, car.pos.y, car.pos.z, 40) * 0.6);
});
net.on('car_destroy', ({ id, x, y, z }) => {
  const car = cars.list.get(id);
  const p = car ? car.pos : new THREE.Vector3(x, y, z);
  effects.explosion(p.x, p.y + 1, p.z);
  sounds.explode(loudness(p.x, p.y, p.z, 120));
  if (car) particles.burst(p.x - 0.5, p.y + 0.5, p.z - 0.5, car.model.paint, 20);
  if (riding()?.id === id) {
    if (myCar) leaveCar();
    else leaveRide();
    player.vel.set(0, 12, 0); // blown clear!
    hud.addChat({ system: true, text: `💥 Boom! It'll be back in ${car?.spec.flying ? '5 minutes' : '30 seconds'}.` });
  }
  cars.remove(id);
});
net.on('claims', ({ claims: list }) => setClaims(list));
net.on('many', ({ cells }) => applyMany(cells));
net.on('throw', ({ id, p, v, color }) => launchWater(new THREE.Vector3(...p), new THREE.Vector3(...v), color, id));
net.on('splash_hit', ({ name }) => hud.toast(`💦 You splashed ${name}!`));
net.on('race_board', ({ board }) => {
  hud.addChat({ system: true, text: `🏆 Best times here: ${board.map(([name, time], i) => `${i + 1}. ${name} ${time.toFixed(2)} s`).join('   ')}` });
});
// Someone crashed into the car we're driving.
net.on('car_impulse', ({ id, vx, vz, spin }) => {
  if (myCar?.id !== id) return;
  cars.setVelocity(myCar, cars.velocityOf(myCar).add(new THREE.Vector3(vx, 0, vz)));
  myCar.h += spin * 0.25; // spun by the hit (the driver feels it as a sudden turn)
  sounds.crash(Math.min(1, Math.hypot(vx, vz) / 10));
});
// A vehicle bumped into us.
net.on('push', ({ vx, vy, vz }) => {
  if (riding()) return;
  wakeUp(true);
  standUp(true);
  player.vel.add(new THREE.Vector3(vx, vy, vz));
  player.launched = true;
  player.onGround = false;
  player.flying = false;
  sounds.crash(0.3);
});
net.on('wake', () => wakeUp());
net.on('car_driver', msg => {
  const car = cars.list.get(msg.id);
  if (myCar?.id === msg.id && msg.driver === myId) {
    // That's us driving, we already know. Somebody may have hopped in with us, though.
    if (car) car.passengers = msg.passengers || [];
    return;
  }
  cars.setDriver(msg);
  if (msg.driver === myId) enterCar(car);
  else if (msg.passengers?.includes(myId) && myRide !== car) enterRide(car);
});
net.on('horn', ({ id }) => {
  const car = cars.list.get(id);
  if (car) sounds.horn(loudness(car.pos.x, car.pos.y, car.pos.z, 60), hornPitch(car));
});
net.on('time', ({ time }) => (sky.time = time));
net.on('disconnect', () => {
  online = false;
  avatars.clear();
  $('banner').textContent = 'Disconnected from the server. Refresh the page to reconnect.';
  $('banner').classList.remove('hidden');
});

function loudness(x, y, z, range) {
  const d = camera.position.distanceTo(new THREE.Vector3(x, y, z));
  return Math.max(0, 1 - d / range);
}

// ---------- Pointer lock and overlays ----------

let locked = false;
let inventoryOpen = false;
let editorOpen = false;
let galleryOpen = false;

function lock() {
  if (touch) {
    // Phones have no mouse to lock: just start taking touches.
    locked = true;
    touch.show(true);
    updateOverlays();
    return;
  }
  const req = canvas.requestPointerLock?.();
  if (req?.catch) req.catch(() => updateOverlays());
}

// Stop playing for a moment (the pause menu, the item menu…).
function unlock() {
  if (!touch) {
    document.exitPointerLock();
    return;
  }
  locked = false;
  keys.clear();
  mouse.clear();
  touch.show(false);
  updateOverlays();
}

// On phones: fill the whole screen, sideways.
function goFullscreen() {
  if (!touch || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => { /* not allowed here: that's fine */ });
}

function updateOverlays() {
  $('pause').classList.toggle('hidden', !inGame || locked || inventoryOpen || hud?.chatOpen || editorOpen || galleryOpen || shopOpen);
  $('inventory').classList.toggle('hidden', !inventoryOpen);
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) {
    keys.clear();
    mouse.clear();
    if (hud?.chatOpen) closeChat();
  }
  updateOverlays();
});
document.addEventListener('pointerlockerror', updateOverlays);

$('resume').addEventListener('click', () => {
  goFullscreen();
  lock();
});
$('go-home').addEventListener('click', () => {
  respawn();
  lock();
});
// Back to the main menu: get out of any vehicle, save, and start the page fresh.
$('exit-menu').addEventListener('click', () => {
  getOut();
  wakeUp(true);
  saveSettings();
  setTimeout(() => {
    net.leave();
    location.reload();
  }, 150); // a moment for "I got out of the car" to reach the server
});
canvas.addEventListener('click', () => inGame && !locked && !inventoryOpen && !editorOpen && !galleryOpen && !shopOpen && lock());
$('sensitivity').addEventListener('input', e => {
  settings.sensitivity = Number(e.target.value);
  saveSettings();
});
$('volume').addEventListener('input', e => {
  settings.volume = sounds.volume = Number(e.target.value);
  if (sounds.master) sounds.master.gain.value = settings.volume;
  saveSettings();
});
$('quality').addEventListener('change', e => {
  settings.quality = e.target.value;
  saveSettings();
  applyQuality();
});
$('fps').addEventListener('change', e => {
  settings.fps = Number(e.target.value);
  saveSettings();
});

async function customize() {
  editorOpen = true;
  updateOverlays();
  const look = await editor.show(settings.look);
  editorOpen = false;
  settings.look = look;
  saveSettings();
  myBody.setLook(look);
  if (inGame) net.send({ t: 'look', look });
  updateOverlays();
}
$('customize').addEventListener('click', customize);
$('pause-customize').addEventListener('click', customize);

// Becomes a character: a new name and look (from the gallery).
function setIdentity(name, look) {
  settings.name = name;
  settings.look = sanitizeLook(look);
  $('name').value = name;
  saveSettings();
  myBody.setLook(settings.look);
  landView.set(claims, name);
  if (inGame) net.send({ t: 'look', look: settings.look, name });
}

async function openGallery() {
  galleryOpen = true;
  updateOverlays();
  const name = inGame ? settings.name : $('name').value.trim() || settings.name || 'Builder';
  const picked = await gallery.show({
    name,
    look: settings.look,
    onSaved: savedName => setIdentity(savedName, settings.look),
  });
  galleryOpen = false;
  if (picked) {
    setIdentity(picked.name, picked.look);
    if (inGame) hud.addChat({ system: true, text: `You are now playing as ${picked.name}!` });
  }
  updateOverlays();
}
$('gallery-open').addEventListener('click', openGallery);
$('pause-gallery').addEventListener('click', openGallery);

function toggleInventory(open) {
  inventoryOpen = open;
  if (open) unlock();
  else lock();
  updateOverlays();
}
$('inventory-done').addEventListener('click', () => {
  saveSettings();
  toggleInventory(false);
});

// ---------- Chat ----------

function closeChat() {
  hud.closeChat();
  updateOverlays();
}

$('chat-input').addEventListener('blur', () => {
  if (touch && hud.chatOpen) closeChat();
});
$('chat-input').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = e.target.value.trim();
    if (text) net.send({ t: 'chat', text });
    closeChat();
  } else if (e.key === 'Escape') {
    closeChat();
  }
});

// ---------- Input ----------

const keys = new Set();
const noKeys = new Set();
const mouse = new Set();
let useCooldown = 0;

window.addEventListener('keydown', e => {
  if (!inGame || hud.chatOpen || editorOpen || galleryOpen) return;
  if (shopOpen) {
    if (e.code === 'Escape' || e.code === 'KeyE') shop.close();
    return;
  }
  if (inventoryOpen) {
    if (e.code === 'Escape') {
      saveSettings();
      toggleInventory(false);
      return;
    }
    if (hud.inventoryKey(e)) {
      saveSettings();
      return;
    }
  }
  if (e.code === 'KeyE') {
    if (riding()) getOut();
    else if (target?.car && locked) requestEnter(target.car);
    else toggleInventory(!inventoryOpen);
    return;
  }
  if (!locked) return;
  // (Ctrl is crouch: stop Ctrl+S, Ctrl+D and friends from opening browser windows.)
  if (['Space', 'Tab', 'ControlLeft', 'ControlRight'].includes(e.code) || e.ctrlKey || e.metaKey) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if ((sleeping || seated) && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) {
    // Get up (once you've finished getting in).
    if (!move) {
      wakeUp();
      standUp();
    }
    return;
  }

  if (e.code === 'KeyT' || e.code === 'Enter') {
    e.preventDefault();
    keys.clear();
    hud.openChat();
  } else if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
    hud.select(Number(e.code.slice(5)) - 1);
    saveSettings();
  } else if (e.code === 'KeyV') {
    if (riding()) carView = (carView + 1) % 3;
    else viewMode = (viewMode + 1) % 3;
    danceView = 0;
  } else if (e.code === 'KeyF' && !riding()) {
    player.flying = !player.flying;
    player.vel.y = 0;
  } else if (e.code === 'KeyR') {
    respawn();
  } else if (e.code === 'KeyX' && riding()) {
    getOut();
  } else if (e.code === 'KeyH' && myCar) {
    honk();
  } else if (e.code === 'KeyG') {
    if (myCar) {
      if (myCar.kind === 'police') myCar.siren = myCar.siren ? 0 : 1;
    } else if (!myRide) {
      emote('dance');
    }
  } else if (e.code === 'KeyB' && !riding()) {
    emote('wave');
  } else if (e.code === 'KeyQ' && !riding()) {
    hud.select(hud.prevSelected ?? 0);
    saveSettings();
  } else if (e.code === 'KeyP') {
    takePhoto();
  } else if (e.code === 'KeyH' && !myCar) {
    toggleHud();
  } else if (e.code === 'KeyZ' && !riding()) {
    undo();
  }
});
// Leaving the page by accident (Ctrl+W while crouch-walking!) asks first.
window.addEventListener('beforeunload', e => {
  if (!inGame) return;
  e.preventDefault();
  e.returnValue = '';
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  mouse.clear();
});

// Turning your head (or the camera, in a vehicle) with the mouse or a finger.
function lookBy(dx, dy) {
  const sens = 0.0022 * settings.sensitivity;
  if (riding()) {
    carCam.yaw -= dx * sens;
    carCam.pitch = Math.max(-1.2, Math.min(0.5, carCam.pitch - dy * sens));
  } else {
    player.look(dx, dy, sens);
  }
}
document.addEventListener('mousemove', e => {
  if (locked && !touch) lookBy(e.movementX, e.movementY);
});

// ---------- Phone controls ----------

const touch = IS_TOUCH ? new TouchControls({
  look: (dx, dy) => locked && lookBy(dx * 2.3, dy * 2.3),
  tap: () => {
    if (!locked || hud.chatOpen) return;
    if (myCar) {
      if (!myCar.spec.flying) honk();
    } else if (!myRide) {
      useItem();
      useCooldown = hud.item === HAMMER ? 0.25 : 0.28;
    }
  },
  // Holding a finger still keeps hammering.
  hold: () => {
    if (locked && !riding() && hud.item === HAMMER && useCooldown <= 0) {
      useItem();
      useCooldown = 0.25;
    } else if (locked && !riding() && hud.item === BUBBLES) {
      blowBubbles(1 / 30);
    }
  },
  interact: () => {
    if (!locked) return;
    if (riding()) getOut();
    else interact();
  },
  flyToggle: () => {
    if (riding()) return;
    player.flying = !player.flying;
    player.vel.y = 0;
  },
  pause: () => unlock(),
  items: () => toggleInventory(true),
  camera: () => {
    if (riding()) carView = (carView + 1) % 3;
    else viewMode = (viewMode + 1) % 3;
    danceView = 0;
  },
  chat: () => {
    keys.clear();
    hud.openChat();
  },
  dance: () => !riding() && emote('dance'),
}) : null;
if (touch) {
  document.body.classList.add('touch');
  $('sensitivity').parentElement.firstChild.textContent = 'Look sensitivity ';
}
canvas.addEventListener('mousedown', e => {
  if (!locked) return;
  if (myCar) {
    if (!myCar.spec.flying) honk();
    return;
  }
  if (myRide) return;
  mouse.add(e.button);
  if (e.button === 1) {
    e.preventDefault();
    pickBlock();
  } else if (e.button === 2) {
    interact();
  } else {
    useItem();
    useCooldown = hud.item === HAMMER ? 0.25 : 0.28;
  }
});
window.addEventListener('mouseup', e => mouse.delete(e.button));
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('wheel', e => {
  if (!locked || hud.chatOpen || riding() || !e.deltaY) return;
  if (!wandWheel(Math.sign(e.deltaY))) hud.select(hud.selected + Math.sign(e.deltaY));
}, { passive: true });

// ---------- Emotes and fun ----------

function emote(kind) {
  myBody.emote(kind);
  net.send({ t: 'emote', kind });
  if (kind === 'dance') {
    if (onDanceFloor(player.pos)) {
      sounds.party();
      myBody.dance = 8;
      hud.toast('🪩 Dance party!');
    } else {
      sounds.tune();
    }
    // Turn the camera around so you can see yourself dance.
    if (viewMode === 0) {
      viewMode = 2;
      danceView = myBody.dance;
    }
  }
}

// Every vehicle's horn has its own note.
function hornPitch(car) {
  return car.kind === 'police' ? 1.06 : car.kind === 'monster' ? 0.82 : car.kind === 'boat' ? 0.68 : 0.92 + ((car.id * 0.618) % 1) * 0.14;
}

function honk() {
  sounds.horn(1, hornPitch(myCar));
  net.send({ t: 'horn' });
}

function launchFirework() {
  let x, y, z;
  if (hit) {
    [x, y, z] = hit.place;
    x += 0.5;
    z += 0.5;
  } else {
    x = player.pos.x - Math.sin(player.yaw) * 4;
    y = player.pos.y;
    z = player.pos.z - Math.cos(player.yaw) * 4;
  }
  const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
  const seed = Math.random();
  if (!fireworks.launch(x, y, z, color, seed)) {
    hud.toast('🎆 The sky is full of fireworks! Wait a moment.');
    return;
  }
  sounds.launch(1);
  net.send({ t: 'fx', kind: 'firework', x, y, z, color, seed });
}

function throwBall() {
  ball.throw(eye, lookDir);
  sounds.swing();
  if (myBody.pet) setTimeout(() => sounds.pet(myBody.pet?.kind), 250);
}

// Everything the ball can bounce off: blocks, railings, cars and people (including you,
// once it's out of your hand).
function ballBoxes(r) {
  const out = [];
  for (let x = Math.floor(r[0]); x <= Math.floor(r[3]); x++)
    for (let y = Math.floor(r[1]) - 1; y <= Math.floor(r[4]); y++)
      for (let z = Math.floor(r[2]); z <= Math.floor(r[5]); z++) world.cellBoxes(x, y, z, out);
  const people = [...avatars.list.values()].filter(a => !a.seat && !a.lying).map(a => a.pos);
  if (ball.age > 0.4 && !riding()) people.push(player.pos);
  for (const p of people) out.push([p.x - 0.3, p.y, p.z - 0.3, p.x + 0.3, p.y + 1.8, p.z + 0.3]);
  for (const b of cars.boxes()) if (b[0] < r[3] && b[3] > r[0] && b[1] < r[4] && b[4] > r[1] && b[2] < r[5] && b[5] > r[2]) out.push(b);
  return out;
}

// Rays against pets (yours and everyone else's).
function petRaycast(origin, dir, max) {
  let best = null;
  const check = avatar => {
    const p = avatar.pet;
    if (!p || !p.group.visible) return;
    const c = p.pos.clone();
    c.y += p.kind === 'dragon' ? 1.1 : 0.35;
    const oc = origin.clone().sub(c);
    const b = oc.dot(dir), disc = b * b - (oc.lengthSq() - 0.45 * 0.45);
    if (disc < 0) return;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < max && (!best || t < best.distance)) best = { pet: p, avatar, distance: t, point: c };
  };
  check(myBody);
  for (const a of avatars.list.values()) check(a);
  return best;
}

function petThePet(t) {
  sounds.pet(t.pet.kind);
  effects.heartsAt(t.point.x, t.point.y + 0.4, t.point.z);
  net.send({ t: 'fx', kind: 'hearts', x: t.point.x, y: t.point.y + 0.4, z: t.point.z });
  if (t.avatar === myBody) myBody.brain.cheer();
}

// ---------- Vehicles ----------

// Climb in: you drive if the seat is free, otherwise you ride along (two passengers at most).
function requestEnter(car) {
  if (car.driver && car.passengers.length >= 2) {
    hud.addChat({ system: true, text: "It's full! Every seat is taken." });
    return;
  }
  net.send({ t: 'car_enter', id: car.id });
}

function enterCar(car) {
  if (!car) return;
  wakeUp(true);
  standUp(true);
  myCar = car;
  car.driver = myId;
  car.gear = 1;
  car.vel.set(0, 0, 0);
  player.flying = false;
  carCam.yaw = 0;
  carCam.pitch = car.spec.flying ? -0.25 : -0.15;
  danceView = 0;
  hud.setCarHelp(car.kind);
  sounds.setEngineVoice(car.id, car.kind);
  if (!car.spec.flying) sounds.engine(0.15, 0);
  sounds.spawnCar();
  if (car.spec.flying && settings.heliTip !== 2) { // shown again when the controls change
    hud.addChat({ system: true, text: touch
      ? '🚁 Wait for the rotor to spin up, then hold ⬆ to lift off and ⬇ to come down. It turns to face where you look (drag on the right side). The joystick tilts it forward and back and slides it sideways. Land gently!'
      : '🚁 Wait for the rotor to spin up, then hold Space to lift off. Steer with the mouse (it turns to where you look), tilt with W/S, slide sideways with A/D, Shift to go down. Land gently!' });
    settings.heliTip = 2;
    saveSettings();
  }
}

// Hop in as a passenger: someone else drives, you look around and enjoy the ride.
function enterRide(car) {
  if (!car) return;
  wakeUp(true);
  standUp(true);
  myRide = car;
  player.flying = false;
  carCam.yaw = 0;
  carCam.pitch = car.spec.flying ? -0.25 : -0.15;
  danceView = 0;
  hud.setCarHelp('passenger');
  sounds.spawnCar();
  const driver = avatars.list.get(car.driver);
  hud.toast(`🚗 Riding along${driver ? ` with ${driver.name}` : ''}! Press E to get out.`);
}

function getOut() {
  if (myCar) leaveCar(true);
  else if (myRide) leaveRide(true);
}

// Gets out of the vehicle. `tell` sends the news to the server.
function leaveCar(tell = false) {
  const car = myCar;
  if (!car) return;
  if (tell && car.spec.flying && !car.onGround) dropHelicopter(car);
  if (tell) {
    sendCarState();
    net.send({ t: 'car_exit', id: car.id });
  }
  myCar = null;
  car.driver = 0;
  car.speed = car.steer = car.siren = 0;
  car.braking = car.reversing = false;
  stepOut(car, -1); // the driver's door is on the left
  hud.setCarHelp(null);
  hud.setVehicleInfo(null);
  sounds.engine(null);
}

function leaveRide(tell = false) {
  const car = myRide;
  if (!car) return;
  const seat = mySeat();
  if (tell) net.send({ t: 'car_exit', id: car.id });
  myRide = null;
  car.passengers = car.passengers.filter(id => id !== myId);
  stepOut(car, seat === 1 ? 1 : Math.random() < 0.5 ? -1 : 1);
  hud.setCarHelp(null);
  hud.setVehicleInfo(null);
}

// Climb out beside the vehicle: your own door first, then the other side, then behind and
// in front. Spots with ground to stand on win; the roof is only for when you're boxed in.
function stepOut(car, side) {
  const s = car.spec;
  const right = new THREE.Vector3(Math.cos(car.h), 0, -Math.sin(car.h));
  const forward = new THREE.Vector3(-Math.sin(car.h), 0, -Math.cos(car.h));
  const w = s.width / 2 + 0.55, l = s.length / 2 + 0.55;
  const spots = [];
  for (const along of [0, -0.6, 0.6]) {
    spots.push(right.clone().multiplyScalar(side * w).addScaledVector(forward, along));
    spots.push(right.clone().multiplyScalar(-side * w).addScaledVector(forward, along));
  }
  spots.push(forward.clone().multiplyScalar(-l), forward.clone().multiplyScalar(l));
  // (Out of a boat, dry land beats stepping onto the water.)
  const dry = p => !car.spec.boat || !isWaterBlock(world.get(Math.floor(p.x), Math.floor(p.y + 0.05), Math.floor(p.z)));
  const grounded = p => dry(p) && (p.y < 0.05 || world.isSolid(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z)) ||
    world.isSolid(Math.floor(p.x), Math.floor(p.y - 1.05), Math.floor(p.z)));
  const fits = (off, dy) => {
    player.pos.set(car.pos.x + off.x, Math.max(0, car.pos.y) + dy, car.pos.z + off.z);
    return !player.overlapsSomething();
  };
  let found = false;
  for (const needGround of [true, false]) {
    for (const off of spots) {
      for (const dy of [0, 0.5, 1]) {
        if (fits(off, dy) && (!needGround || grounded(player.pos))) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (!found) player.pos.set(car.pos.x, car.pos.y + (s.flying ? 2.1 : s.height) + 0.05, car.pos.z);
  player.vel.set(0, 0, 0);
  player.yaw = car.h;
  player.pitch = 0;
}

// Nobody's flying it any more: it falls to the ground (and gets hurt if it was high up).
function dropHelicopter(car) {
  const start = car.pos.y;
  for (let i = 0; i < 400 && !cars.blocked(car.spec, car.pos.x, car.pos.y - 0.25, car.pos.z, car.h, car.id, car.outline); i++) car.pos.y -= 0.25;
  car.pitch = car.roll = 0;
  const fall = start - car.pos.y;
  if (fall > 3) net.send({ t: 'car_damage', id: car.id, amount: Math.min(45, fall * 3), impact: [0, 0, 0] });
}

function sendCarState() {
  if (!myCar) return;
  const r = v => Math.round(v * 100) / 100;
  net.send({
    t: 'car_state', id: myCar.id, x: r(myCar.pos.x), y: r(myCar.pos.y), z: r(myCar.pos.z), h: r(myCar.h),
    speed: r(myCar.speed), steer: r(myCar.steer), siren: myCar.siren, p: r(myCar.pitch), r: r(myCar.roll), rs: r(myCar.rotorSpin),
    f: (myCar.braking ? 1 : 0) | (myCar.reversing ? 2 : 0),
  });
}

// Things that happen to vehicles: sounds, damage, and shoves to pass on to other players.
function vehicleEvent(ev, car) {
  const volume = car === myCar ? 1 : loudness(car.pos.x, car.pos.y, car.pos.z, 50);
  if (ev.type === 'shift') sounds.shift();
  else if (ev.type === 'bump') sounds.crash(ev.power * volume);
  else if (ev.type === 'land') sounds.land();
  else if (ev.type === 'bounce') sounds.bounce();
  else if (ev.type === 'boost') sounds.zoom();
  else if (ev.type === 'damage') reportDamage(ev.other || car, ev.amount, ev.impact);
  else if (ev.type === 'impulse') net.send({ t: 'car_impulse', id: ev.other.id, vx: ev.dv.x, vz: ev.dv.z, spin: ev.spin });
  else if (ev.type === 'push') net.send({ t: 'push', id: ev.id, vx: ev.dv.x, vy: ev.dv.y, vz: ev.dv.z });
}

// Walking into a parked car pushes it. People are much lighter than cars, so it moves
// slowly, and it rolls forward and back much more easily than sideways.
function pushCar(car, axis, speed) {
  if (car.driver || Math.abs(speed) < 0.5) return;
  const dv = new THREE.Vector3();
  dv[axis] = speed * (PERSON_MASS / (PERSON_MASS + car.spec.mass)) * 0.35;
  car.loose = true;
  car.push.add(dv);
}

// The ball gets kicked when you run into it (or drive into it).
function kickBall() {
  if (!ball.active || ball.carried) return;
  let center, vel, radius;
  if (myCar) {
    center = myCar.pos;
    vel = cars.velocityOf(myCar);
    radius = Math.max(myCar.spec.width, myCar.spec.length) / 2;
  } else {
    center = player.pos;
    vel = player.vel;
    radius = 0.5;
  }
  const n = new THREE.Vector3(ball.pos.x - center.x, 0, ball.pos.z - center.z);
  const dist = n.length();
  if (dist > radius || ball.pos.y < center.y - 0.3 || ball.pos.y > center.y + 1.2 || dist < 1e-4) return;
  n.normalize();
  const closing = vel.dot(n) - ball.vel.dot(n);
  if (closing <= 0.3) return;
  // A ball is so light that it flies off at about twice your speed.
  ball.vel.addScaledVector(n, closing * 1.6);
  ball.vel.y = Math.max(ball.vel.y, 2 + closing * 0.3);
  ball.restTime = 0;
  ball.age = 0;
  sounds.swing();
}

function reportDamage(car, amount, impact) {
  if (amount < 1) return;
  net.send({ t: 'car_damage', id: car.id, amount: Math.round(amount), impact });
}

function hitVehicle(t) {
  sounds.crack();
  particles.burst(t.point.x - 0.5, t.point.y - 0.5, t.point.z - 0.5, t.car.model.paint, 4);
  reportDamage(t.car, 8, cars.toLocal(t.car, t.point));
}

// ---------- Helicopter downwash ----------
// A helicopter flying low blows things around under it: dust (or sand, or spray off the
// water) rushing outward, leaves torn off the trees, flowers bending flat, the ball rolling
// away and people pushed back a little.

const WASH_HEIGHT = 12; // how low it has to be
let washTimer = 0;

// The top of whatever is under (x, z), at or below height y.
function groundBelow(x, y, z) {
  const fx = Math.floor(x), fz = Math.floor(z);
  for (let gy = Math.min(WORLD.maxY, Math.floor(y)); gy >= 0; gy--) if (world.isSolid(fx, gy, fz)) return gy + 1;
  return 0;
}

// What the wind kicks up from the ground at (x, z): its color and how it flies.
function washDebris(x, gy, z) {
  const fx = Math.floor(x), fz = Math.floor(z);
  const on = blockId(floorOf(world.get(fx, gy, fz)) || itemOf(world.get(fx, gy, fz))), under = gy > 0 ? blockId(world.get(fx, gy - 1, fz)) : 0;
  if (on === 36) return { color: [0.88, 0.95, 1], up: 2.5, size: 0.7, alpha: 0.7 }; // spray
  if (under === 10) return { color: [0.9, 0.8, 0.56], up: 0.8, size: 0.85, alpha: 0.7 }; // sand
  if ([22, 23, 24, 55, 56, 57].includes(on) || [3, 4, 13].includes(under)) return { color: [0.72, 0.71, 0.68], up: 0.6, size: 0.85, alpha: 0.6 };
  return { color: [0.66, 0.62, 0.46], up: 0.7, size: 0.8, alpha: 0.65 }; // grass and dirt
}

function updateDownwash(dt, time) {
  let wash = null;
  for (const car of cars.list.values()) {
    if (!car.spec.flying || car.rotorSpin < 0.3) continue;
    const ground = groundBelow(car.pos.x, car.pos.y, car.pos.z);
    const height = car.pos.y - ground;
    if (height > WASH_HEIGHT) continue;
    const s = (1 - Math.max(0, height) / WASH_HEIGHT) * Math.min(1, (car.rotorSpin - 0.3) / 0.5);
    if (!wash || s > wash.s) wash = { car, ground, s };
  }
  WIND.time.value = time;
  WIND.strength.value += ((wash?.s ?? 0) - WIND.strength.value) * Math.min(1, dt * 4);
  sounds.wind(wash ? wash.s * Math.max(riding() === wash.car ? 0.5 : 0, loudness(wash.car.pos.x, wash.ground, wash.car.pos.z, 40)) : 0);
  if (!wash) return;
  const { car, ground, s } = wash;
  const cx = car.pos.x, cz = car.pos.z;
  WIND.center.value.set(cx, ground, cz);
  // Dust rushing outward in a ring.
  washTimer += dt * 160 * s;
  for (; washTimer >= 1; washTimer--) {
    const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const gy = groundBelow(x, ground + 1.5, z);
    if (Math.abs(gy - ground) > 2) continue;
    const d = washDebris(x, gy, z), speed = (4 + 7 * s) * (0.7 + Math.random() * 0.6);
    effects.smoke.spawn({
      x, y: gy + 0.15, z, vx: Math.cos(a) * speed, vy: d.up * (0.5 + Math.random()), vz: Math.sin(a) * speed,
      life: 0.8 + Math.random() * 0.8, size: d.size, grow: 1.8, color: d.color, alpha: d.alpha * (0.6 + s * 0.4), drag: 1.3,
    });
  }
  // Leaves blown off the trees underneath.
  if (Math.random() < s * dt * 20) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 5;
    const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
    for (let y = Math.floor(car.pos.y) - 1; y >= ground; y--) {
      if (blockId(world.get(x, y, z)) !== 8) continue;
      for (let i = 0; i < 3; i++) {
        effects.smoke.spawn({
          x: x + Math.random(), y: y + Math.random(), z: z + Math.random(),
          vx: Math.cos(a) * (3 + Math.random() * 4), vy: -1 + Math.random() * 2, vz: Math.sin(a) * (3 + Math.random() * 4),
          life: 1.4 + Math.random(), size: 0.22, grow: 0, color: [0.25 + Math.random() * 0.15, 0.55, 0.18], alpha: 0.95, drag: 0.8, gravity: 1.5,
        });
      }
      break;
    }
  }
  // Shove the ball and anyone standing underneath out from the middle.
  const push = (pos, vel, power) => {
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d > 6.5 || pos.y - ground > 3 || d < 0.05) return false;
    const k = power * s * (1 - d / 6.5) * dt;
    vel.x += (dx / d) * k;
    vel.z += (dz / d) * k;
    return true;
  };
  if (ball.active && !ball.carried && push(ball.pos, ball.vel, 22)) ball.restTime = 0;
  if (!riding() && !sleeping) push(player.pos, player.vel, 14);
}

// ---------- Land claims ----------

const claimTool = { a: null, rect: null, confirm: false, unclaimAsk: 0 };
let lastLandKey = null, landMsgTime = 0;

function setClaims(list) {
  claims = list;
  landView.set(claims, settings.name);
}

const canBuildAt = (x, z) => canBuild(claims, settings.name, x, z);

function notifyLand(x, z) {
  if (performance.now() - landMsgTime < 2000) return;
  landMsgTime = performance.now();
  hud.toast(`🚧 This is ${claimAt(claims, x, z).owner}'s land. You can visit, but not build.`);
}

function claimProblem(rect) {
  if (!claimSizeOk(rect)) return '🚩 Too big! Land can be at most 10 × 15 blocks.';
  const clash = claims.find(c => c.key !== nameKey(settings.name) && rectsOverlap(c, rect));
  return clash ? `🚩 That overlaps ${clash.owner}'s land.` : null;
}

function claimCell() {
  if (!hit) return null;
  const [x, , z] = hit.ground ? hit.place : hit.block;
  return [x, z];
}

function resetClaimTool() {
  claimTool.a = claimTool.rect = null;
  claimTool.confirm = false;
  landView.preview(null);
}

function claimClick() {
  const cell = claimCell();
  if (!cell) return;
  if (!claimTool.a) {
    claimTool.a = cell;
    sounds.click();
    hud.toast('🚩 Now click the opposite corner of your land.');
    return;
  }
  if (!claimTool.confirm) {
    const rect = normalizeRect(claimTool.a[0], claimTool.a[1], cell[0], cell[1]);
    const problem = claimProblem(rect);
    if (problem) {
      hud.toast(problem);
      return;
    }
    claimTool.rect = rect;
    claimTool.confirm = true;
    landView.preview(rect, true);
    sounds.click();
    hud.toast(`🚩 Click once more to claim this ${describeSize(rect)} land! (Right-click to cancel)`);
    return;
  }
  net.send({ t: 'claim', ...claimTool.rect });
  sounds.claim();
  resetClaimTool();
}

function unclaimClick() {
  if (!claims.some(c => c.key === nameKey(settings.name))) {
    hud.toast("🚩 You don't own any land yet. Click two corners to claim some!");
  } else if (performance.now() - claimTool.unclaimAsk < 4000) {
    net.send({ t: 'unclaim' });
    claimTool.unclaimAsk = 0;
  } else {
    claimTool.unclaimAsk = performance.now();
    hud.toast('🏳️ Right-click again to give up your land.');
  }
}

// ---------- Special structures ----------

let fxTimer = 0, teleCharge = 0, teleCooldown = 0, trampCombo = 0, lastBounceTramp = false;
let sleeping = null; // { bed, standAt }
let snoreTimer = 0;

function structureLights() {
  const out = [];
  if (!structures) return out;
  const t = performance.now() / 1000;
  for (const s of structures.near(camera.position, 60)) {
    if (s.type === 'campfire') out.push({ x: s.x, y: s.y + 1, z: s.z, color: new THREE.Color(0xff8a3c), intensity: 10 });
    if (s.type === 'disco') out.push({ x: s.x, y: s.y + 2.5, z: s.z, color: new THREE.Color().setHSL((t * 0.7) % 1, 1, 0.55), intensity: 30, always: true });
    if (s.type === 'tv') {
      // The screen softly lights up a dark room in the color of the show.
      const sc = tvs.find(s);
      const flicker = 0.85 + Math.sin(t * 7) * 0.1 + Math.sin(t * 13) * 0.05;
      out.push({ x: s.x + s.ax * s.width / 2 - 0.5 * s.ax, y: s.y, z: s.z + s.az * s.width / 2 - 0.5 * s.az, color: new THREE.Color(CHANNELS[sc?.channel || 0].glow), intensity: 7 * flicker });
    }
  }
  return out;
}

function trampolineBounce(x, y, z, held) {
  const t = structures?.trampolineAt(x, y, z);
  lastBounceTramp = !!t;
  if (!t) {
    trampCombo = 0;
    return 19;
  }
  // Hold Space as you land to bounce higher each time.
  trampCombo = held.has('Space') ? Math.min(trampCombo + 1, 5) : 0;
  return 21 + trampCombo * 5;
}

function onDanceFloor(pos) {
  return structures.ofType('disco').some(s => Math.abs(pos.x - s.x - 0.5) < 1.6 && Math.abs(pos.z - s.z - 0.5) < 1.6 && Math.abs(pos.y - s.y - 1) < 0.5);
}

function fireCannon(s) {
  player.flying = false;
  player.launched = true;
  player.vel.copy(lookDir).multiplyScalar(26);
  player.vel.y = Math.max(player.vel.y, 4) + 8;
  player.onGround = false;
  sounds.cannon();
  for (let i = 0; i < 12; i++) effects.smokePuff(s.x + 0.5, s.y + 2, s.z + 0.5, 0.2);
  hud.toast('💥 WHEEEE!');
}

function goToBed(bed) {
  if (riding()) return;
  const px = bed.x + 0.5, pz = bed.z + 0.5, bx = bed.x + bed.dx + 0.5, bz = bed.z + bed.dz + 0.5;
  const dir = { x: px - bx, z: pz - bz };
  const top = bed.top ?? bed.y + 1;
  sleeping = { bed, standAt: bedsideSpot(bed) || [bx, top, bz] };
  // Climb in and lie back, head on the pillow (the body tips back as it goes, see avatars.js).
  player.vel.set(0, 0, 0);
  player.flying = false;
  scriptMove([bx - dir.x * 0.45, bed.lieY ?? top + 0.15, bz - dir.z * 0.45], Math.atan2(dir.x, dir.z), 1.1, { arc: 0.45 });
  myBody.lying = true;
  settings.bed = { x: bed.x, y: bed.y, z: bed.z };
  saveSettings();
  net.send({ t: 'sleep', on: true });
  hud.toast(sky.isNight ? '😴 Zzz… When everyone is asleep, the sun comes up!' : '🛏️ This bed is your home now. Press R to come back here. (Move to get up)');
}

// A free spot on the floor beside a Bed block to get up onto: off the foot end, or either
// side. (Build Book beds are solid blocks, so you just stand up on them.)
function bedsideSpot(bed) {
  if (bed.top === undefined) return null;
  const { x, y, z, dx, dz } = bed, fx = x + dx, fz = z + dz;
  const room = (cx, cz) => !world.isSolid(cx, y, cz) && !world.isSolid(cx, y + 1, cz) && (y === 0 || world.isSolid(cx, y - 1, cz));
  for (const [cx, cz] of [[fx + dx, fz + dz], [fx + dz, fz - dx], [fx - dz, fz + dx], [x + dz, z - dx], [x - dz, z + dx]]) {
    if (room(cx, cz)) return [cx + 0.5, y, cz + 0.5];
  }
  return null;
}

// Getting up: sit up, swing round and stand beside the bed (or straight away, when being
// sent home or shoved).
function wakeUp(instant = false) {
  if (!sleeping) return;
  const [x, y, z] = sleeping.standAt;
  sleeping = null;
  myBody.lying = false;
  net.send({ t: 'sleep', on: false });
  if (instant) {
    move = null;
    player.pos.set(x, y, z);
  } else {
    scriptMove([x, y, z], player.yaw + Math.PI, 0.9, { arc: 0.35 });
  }
}

// ---------- Little scripted moves ----------
// Sitting down, getting up, climbing into bed and out again: you glide there along a gentle
// curve (eased in and out) while your body bends into the new pose.

let move = null; // { from, to, fromYaw, toYaw, t, dur, arc, then }

function scriptMove(to, toYaw, dur, { arc = 0, then = null } = {}) {
  move = { from: player.pos.clone(), to: new THREE.Vector3(...to), fromYaw: player.yaw, toYaw, t: 0, dur, arc, then };
}

// Returns true while a scripted move is happening (you can't walk about meanwhile).
function updateMove(dt) {
  if (!move) return false;
  move.t = Math.min(1, move.t + dt / move.dur);
  const k = move.t * move.t * (3 - 2 * move.t); // ease in and out
  player.pos.lerpVectors(move.from, move.to, k);
  player.pos.y += Math.sin(Math.PI * k) * move.arc;
  let dy = move.toYaw - move.fromYaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw = move.fromYaw + dy * k;
  player.vel.set(0, 0, 0);
  if (move.t >= 1) {
    const then = move.then;
    move = null;
    then?.();
  }
  return true;
}

// A safe place to stand on your own land: open ground nearest its middle,
// or else on top of whatever has been built there.
function landSpawn() {
  const mine = claims.find(c => c.key === nameKey(settings.name));
  if (!mine) return null;
  const cx = (mine.x0 + mine.x1) / 2, cz = (mine.z0 + mine.z1) / 2;
  const cells = [];
  for (let x = mine.x0; x <= mine.x1; x++) for (let z = mine.z0; z <= mine.z1; z++) cells.push([x, z, Math.hypot(x + 0.5 - cx, z + 0.5 - cz)]);
  cells.sort((a, b) => a[2] - b[2]);
  const roomAt = (x, y, z) => !world.isSolid(x, y, z) && !world.isSolid(x, y + 1, z);
  for (const [x, z] of cells) if (roomAt(x, 0, z)) return [x + 0.5, 0, z + 0.5];
  for (const [x, z] of cells) {
    let top = 62;
    while (top >= 0 && !world.isSolid(x, top, z)) top--;
    if (roomAt(x, top + 1, z)) return [x + 0.5, top + 1, z + 0.5];
  }
  return null;
}

// Back home: your bed if you have one, then your land, then the town square.
function respawn(joining = false) {
  wakeUp(true);
  standUp(true);
  move = null;
  getOut();
  const b = settings.bed;
  const bed = b && structures.ofType('bed').find(s => s.x === b.x && s.y === b.y && s.z === b.z);
  const land = !bed && landSpawn();
  player.vel.set(0, 0, 0);
  if (bed) {
    player.pos.set(bed.x + bed.dx + 0.5, bed.y + 1, bed.z + bed.dz + 0.5);
    hud.toast(joining ? '🛏️ Welcome back! You woke up next to your bed.' : '🛏️ Back to your bed!');
  } else if (land) {
    player.pos.set(...land);
    hud.toast(joining ? '🏠 Welcome back to your land!' : '🏠 Home sweet home: back on your land!');
  } else {
    player.respawn();
  }
}

// Lamps with real flames (tiki torches and candles), refreshed when the world changes.
let flameLamps = [], flameVersion = -1;

// Effects for structures near you, and teleporting. Returns how loud nearby fires are.
function updateStructures(dt, time) {
  fxTimer -= dt;
  const emit = fxTimer <= 0;
  if (emit) fxTimer = 0.06;
  let fire = 0;
  if (flameVersion !== structures.version) {
    flameVersion = structures.version;
    flameLamps = [...world.lamps].map(k => k.split(',').map(Number)).filter(([x, y, z]) => BLOCKS[world.get(x, y, z) & 255]?.light?.flame);
  }
  if (emit) {
    for (const [x, y, z] of flameLamps) {
      const flame = BLOCKS[world.get(x, y, z) & 255]?.light;
      if (!flame || lightOff(world.get(x, y, z)) || (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2 > 30 * 30) continue;
      effects.flame(x + 0.5, y + flame.y + 0.05, z + 0.5, flame.flame);
      if (flame.flame > 0.5) fire = Math.max(fire, loudness(x, y, z, 8) * 0.4);
    }
  }
  for (const s of structures.near(camera.position, 45)) {
    const cx = s.x + 0.5, cz = s.z + 0.5;
    if (s.type === 'campfire') {
      if (emit) {
        effects.flame(cx, s.y + 1.05, cz, 0.9);
        if (Math.random() < 0.3) effects.smokePuff(cx, s.y + 1.8, cz, 0.3);
      }
      fire = Math.max(fire, loudness(cx, s.y, cz, 14) * 0.6);
    } else if (s.type === 'fountain' && emit) {
      for (let i = 0; i < 3; i++) effects.spray(cx, s.y + 0.1, cz);
    } else if (s.type === 'teleporter' && emit && Math.random() < 0.5) {
      effects.sparkle(cx, s.y + 1, cz, 2);
    } else if (s.type === 'disco' && emit && Math.random() < 0.25) {
      const dancers = [myBody, ...avatars.list.values()].filter(a => a.dance > 0 && Math.abs(a.pos.x - cx) < 1.6 && Math.abs(a.pos.z - cz) < 1.6);
      for (const a of dancers) effects.note(a.pos.x, a.pos.y + 2.2, a.pos.z);
    }
  }

  // Stand on a teleporter's lamp for a moment to zoom to the next one.
  teleCooldown -= dt;
  const p = player.pos;
  const tp = !riding() && !sleeping && teleCooldown <= 0 &&
    structures.ofType('teleporter').find(t => Math.floor(p.x) === t.x && Math.floor(p.z) === t.z && Math.abs(p.y - t.y - 1) < 0.2);
  if (tp) {
    teleCharge += dt;
    if (emit) effects.sparkle(p.x, p.y, p.z, 3);
    if (teleCharge > 0.6) {
      teleCharge = 0;
      const next = structures.nextTeleporter(tp);
      if (next) {
        net.send({ t: 'fx', kind: 'sparkle', x: p.x, y: p.y, z: p.z });
        player.pos.set(next.x + 0.5, next.y + 1, next.z + 0.5);
        player.vel.set(0, 0, 0);
        effects.sparkle(player.pos.x, player.pos.y, player.pos.z, 40);
        net.send({ t: 'fx', kind: 'sparkle', x: player.pos.x, y: player.pos.y, z: player.pos.z });
        sounds.whoosh();
        teleCooldown = 2.5;
      } else {
        hud.toast('🌀 Build another teleporter somewhere to travel to it!');
        teleCooldown = 4;
      }
    }
  } else {
    teleCharge = 0;
  }

  // Snoring sleepers.
  snoreTimer -= dt;
  if (snoreTimer <= 0) {
    snoreTimer = 1.2;
    for (const a of [myBody, ...avatars.list.values()]) {
      if (a.lying) effects.snore(a.pos.x + Math.sin(a.yaw) * 1.6, a.pos.y + 0.4, a.pos.z + Math.cos(a.yaw) * 1.6);
    }
  }
  if (sleeping && !structures.ofType('bed').some(b => b === sleeping.bed || (b.x === sleeping.bed.x && b.y === sleeping.bed.y && b.z === sleeping.bed.z))) wakeUp(true);
  return fire;
}

// ---------- Building ----------

let hit = null;
let target = null; // { car } or { pet } when looking at one
const lookDir = new THREE.Vector3();
const eye = new THREE.Vector3();
let hitState = { key: null, count: 0, timer: 0 };
let treeTipShown = false;

// Cracks on a block you're hammering (it breaks on the third hit).
const crack = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 7; i++) {
    let x = 32, y = 32;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
    for (let j = 0; j < 4; j++) {
      x += Math.cos(a + (Math.random() - 0.5)) * 9;
      y += Math.sin(a + (Math.random() - 0.5)) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.012, 1.012, 1.012), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
})();

function setBlock(x, y, z, b) {
  if (!world.set(x, y, z, b)) return false;
  net.send({ t: 'set', x, y, z, b });
  return true;
}

function blockedByPlayer(x, y, z) {
  if (player.overlapsBlock(x, y, z)) return true;
  for (const a of avatars.list.values()) {
    const p = a.pos;
    if (x + 1 > p.x - 0.3 && x < p.x + 0.3 && y + 1 > p.y && y < p.y + 1.8 && z + 1 > p.z - 0.3 && z < p.z + 0.3) return true;
  }
  return false;
}

// Makes every column of the garage door at (x, y, z) the same height: at least 3 blocks, as
// tall as its tallest column, plus `extra` rows. Only builds where there's room.
function growGarage(x, y, z, extra) {
  const columns = world.doorRow(x, y, z).cells.map(([cx, cy, cz]) => ({ cx, cz, ...world.doorColumn(cx, cy, cz) }));
  const tall = Math.max(3, ...columns.map(c => c.hi - c.lo + 1 + extra));
  const open = blockMeta(world.get(x, y, z)) & DOOR_OPEN;
  for (const c of columns) {
    const top = world.get(c.cx, c.hi, c.cz);
    for (let yy = c.hi + 1; yy < c.lo + tall; yy++) {
      const here = world.get(c.cx, yy, c.cz);
      if (!inBounds(c.cx, yy, c.cz) || (here && !isReplaceable(here)) || !canBuildAt(c.cx, c.cz)) break;
      setBlock(c.cx, yy, c.cz, makeBlock(DOOR, (blockMeta(top) & 3) | DOOR_TOP | open));
    }
  }
}

// Opens or closes a door, together with the doors next to it (double doors and garage doors).
function toggleDoor(x, y, z) {
  const parts = world.doorGroup(x, y, z);
  if (!parts.length) return;
  const opening = !(blockMeta(world.get(x, y, z)) & DOOR_OPEN);
  // Everything in the group ends up the same way (open or closed).
  const changes = parts.map(([px, py, pz, v]) => [px, py, pz, v, setDoorOpen(v, opening)]).filter(c => c[3] !== c[4]);
  // Vehicles parked in the doorway (that would be shut in by closing it).
  const near = [...cars.list.values()].filter(c => c.pos.distanceTo(new THREE.Vector3(x, y, z)) < 12);
  const inDoorway = () => near.filter(c => cars.blocked(c.spec, c.pos.x, c.pos.y, c.pos.z, c.h, c.id, c.outline));
  const stuckBefore = new Set(inDoorway());
  for (const [px, py, pz, , nv] of changes) world.set(px, py, pz, nv);
  if (player.overlapsSomething() || (!opening && inDoorway().some(c => !stuckBefore.has(c)))) {
    // Don't close a door on yourself (or on a car).
    for (const [px, py, pz, v] of changes) world.set(px, py, pz, v);
    return;
  }
  for (const [px, py, pz, , nv] of changes) net.send({ t: 'set', x: px, y: py, z: pz, b: nv });
  if (world.doorRole(x, y, z).kind === 'garage') {
    const { lo, hi } = world.doorColumn(x, y, z);
    sounds.garage(opening, World.rollSeconds(hi - lo + 1));
  }
  else sounds.door(opening);
}

// What a click on this block affects: a whole door (or one column of a garage door), a
// whole ladder, or just the block.
function blockGroup(x, y, z, v) {
  if (shapeOf(v) === 'door') return world.doorColumnCells(x, y, z);
  if (shapeOf(v) === 'ladder') return world.ladderCells(x, y, z);
  if (blockId(itemOf(v)) === BED) return bedCells(x, y, z, v);
  return [[x, y, z, v]];
}

// Hammer hits: blocks crack on the first two hits and break on the third.
function hitBlock() {
  if (!hit || hit.ground) {
    sounds.swing();
    return;
  }
  const [x, y, z] = hit.block;
  if (!canBuildAt(x, z)) {
    notifyLand(x, z);
    return;
  }
  const key = hit.block.join(',');
  if (hitState.key !== key) hitState = { key, count: 0, timer: 0 };
  hitState.count++;
  hitState.timer = 2.5;
  // Glass and carpet break with one hit; everything else takes three.
  const hits = BLOCKS[blockId(hit.value)]?.fragile ? 1 : 3;
  if (hitState.count < hits) {
    sounds.crack();
    particles.burst(x, y, z, blockMaterial(materials, hit.value), 3);
    crack.position.set(x + 0.5, y + 0.5, z + 0.5);
    crack.material.opacity = hitState.count === 1 ? 0.45 : 0.9;
    crack.visible = true;
    return;
  }
  hitState.key = null;
  crack.visible = false;
  if (floorOf(hit.value) && (hit.part === 'floor' || shapeOf(hit.value) !== 'door')) {
    // A torch on a sidewalk (or among railings): knock off the part you hit, keep the rest.
    // Hitting the floor takes its railings off first, then the floor itself.
    const item = itemOf(hit.value), floor = floorOf(hit.value);
    const rest = hit.part !== 'floor' ? floor : railMask(floor) && shapeOf(floor) === 'flat' ? stack(item, blockId(floor)) : item;
    setBlock(x, y, z, rest);
    particles.burst(x, y, z, hit.part === 'floor' ? blockMaterial(materials, floor) : blockMaterial(materials, item));
    sounds.break();
    return;
  }
  if (shapeOf(hit.value) === 'flat' && railMask(hit.value)) {
    // A railing on a sidewalk (or carpet…): take the railing (and its paint) off and leave the floor.
    setBlock(x, y, z, blockId(hit.value));
    particles.burst(x, y, z, materials[RAILING]);
    sounds.break();
    return;
  }
  const parts = blockGroup(x, y, z, hit.value);
  for (const [px, py, pz, v] of parts) {
    // Anything standing on a carpet (like a door) leaves the carpet behind.
    if (setBlock(px, py, pz, floorOf(v))) particles.burst(px, py, pz, blockMaterial(materials, v));
  }
  sounds.break();
}

function placeBlock(item) {
  const def = BLOCKS[item];
  if (def.shape === 'rail') return placeRail();
  if (def.shape === 'picture') return placePicture(item);
  // Furniture turns to face you, speed pads point the way you're looking, and each new
  // music block plays the next note up.
  const placed = def.speedPad ? makeBlock(item, facingTowards(player.yaw + Math.PI))
    : def.facing ? makeBlock(item, facingTowards(player.yaw)) : def.music ? makeBlock(item, nextNote) : item;
  if (def.shape === 'model' && item !== BED && placeOnFloor(placed)) return;
  if (def.shape === 'flat' && placeUnder(item)) return;
  let [x, y, z] = hit.value && isReplaceable(hit.value) ? hit.block : hit.place;
  if (!canBuildAt(x, z)) {
    notifyLand(x, z);
    return;
  }
  const shape = BLOCKS[item].shape || 'cube';
  const existing = world.get(x, y, z);
  if (!inBounds(x, y, z) || (existing && !isReplaceable(existing))) return;
  if (railMask(existing)) {
    hud.toast('🚧 There\'s a railing there. Take it off with the hammer first.');
    return;
  }
  if (shape === 'ladder') {
    placeLadder();
    return;
  }
  if (item === BED) {
    placeBed(item, x, y, z);
    return;
  }
  if (shape === 'door') {
    // A door on top of a garage door makes the whole garage door one row taller.
    const below = world.get(x, y - 1, z);
    if (shapeOf(below) === 'door' && world.doorRole(x, y - 1, z).kind === 'garage') {
      growGarage(x, y - 1, z, 1);
      sounds.place();
      return;
    }
    const above = world.get(x, y + 1, z);
    if (!inBounds(x, y + 1, z) || (above && !isReplaceable(above))) return;
    if (blockedByPlayer(x, y, z) || blockedByPlayer(x, y + 1, z)) return;
    // Next to another door? Line up with it so they work as double (or garage) doors.
    let facing = doorFacingFromYaw(player.yaw);
    for (const [dx, dz, parity] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      const n = world.get(x + dx, y, z + dz);
      if (shapeOf(n) === 'door' && (blockMeta(n) & 3) % 2 === parity) {
        facing = blockMeta(n) & 3;
        break;
      }
    }
    // On a carpet (or any floor), the door stands on it.
    setBlock(x, y, z, canHoldItem(existing) ? stack(makeBlock(DOOR, facing), existing) : makeBlock(DOOR, facing));
    setBlock(x, y + 1, z, makeBlock(DOOR, facing | DOOR_TOP));
    // Three in a row make a garage door: 3 blocks tall (so cars fit under it when it's
    // rolled up), or as tall as the garage door it joins.
    if (world.doorRole(x, y, z).kind === 'garage') growGarage(x, y, z, 0);
  } else {
    if ((shape === 'cube' || (shape === 'model' && def.box)) && blockedByPlayer(x, y, z)) return;
    // Road and parking lines run the way you're facing.
    const along = Math.abs(Math.sin(player.yaw)) > Math.abs(Math.cos(player.yaw)) ? 'x' : 'z';
    const v = def.turns && def.along !== along ? def.turns : placed;
    if (!setBlock(x, y, z, v)) return;
  }
  sounds.place();
  if (def.music) {
    playMusic(x, y, z);
    nextNote = (nextNote + 1) % 16;
    if (!musicTipShown) {
      musicTipShown = true;
      hud.toast('🎵 Each Music Block you put down plays the next note up. Walk on them to play a tune! Right-click to change a note, paint it for a new sound.');
    }
  }
  if (item === 7 && !treeTipShown && (y === 0 || [1, 2].includes(world.get(x, y - 1, z) & 255))) {
    treeTipShown = true;
    hud.toast('🌱 A lone log on the grass grows into a tree! Give it a minute.');
  }
}

// Torches, lamps and other small things stand on a sidewalk, road or carpet (or in the
// middle of railings) without replacing it.
function placeOnFloor(item) {
  const cell = canHoldItem(hit.value) ? hit.block : canHoldItem(world.get(...hit.place)) ? hit.place : null;
  if (!cell) return false;
  const [x, y, z] = cell;
  if (!canBuildAt(x, z)) notifyLand(x, z);
  else if (setBlock(x, y, z, stack(item, world.get(x, y, z)))) sounds.place();
  return true;
}

// A carpet (or any floor) slides in under a door or a standing lamp: click the door (or
// lamp), or the floor right under it.
function placeUnder(item) {
  if (!canHoldItem(item)) return false;
  const standing = v => v && !floorOf(v) && ((shapeOf(v) === 'door' && !(blockMeta(v) & DOOR_TOP)) || (shapeOf(v) === 'model' && BLOCKS[blockId(v)].box));
  let cell = null;
  if (hit.value && shapeOf(hit.value) === 'door') cell = [hit.block[0], world.doorColumn(...hit.block).lo, hit.block[2]];
  else if (standing(hit.value)) cell = hit.block;
  else if (standing(world.get(...hit.place))) cell = hit.place;
  if (!cell || !standing(world.get(...cell))) return false;
  const [x, y, z] = cell;
  if (!canBuildAt(x, z)) notifyLand(x, z);
  else if (setBlock(x, y, z, stack(world.get(x, y, z), item))) sounds.place();
  return true;
}

// Left click: use whatever you're holding.
function useItem() {
  const item = hud.item;
  view.swing();
  myBody.swing = 0;
  // Things you throw, blow or point work wherever you're looking.
  if (item === WATER_BALLOON) return throwWaterBalloon();
  if (item === BUBBLES) return blowBubbles(1);
  if (item === CAMERA) return takePhoto();
  if (item === SHOWTIME) return fireworkShow();
  if (target?.npc || item === JETPACK || item === TRAIL) return;
  if (item === BALLOON) {
    const p = eye.clone().addScaledVector(lookDir, 0.8);
    letBalloonGo(p.x, p.y + 0.8, p.z, paintHex());
    net.send({ t: 'fx', kind: 'balloon', x: p.x, y: p.y + 0.8, z: p.z, color: paintHex() });
    hud.toast('🎈 Bye bye, balloon! (Pick another color in the 🎨 Paint tab)');
    return;
  }
  if (target?.car) {
    if (item === HAMMER) hitVehicle(target);
    else requestEnter(target.car);
    return;
  }
  if (target?.pet) {
    if (item === BALL && target.avatar === myBody) throwBall();
    else if (item !== HAMMER) petThePet(target);
    return;
  }
  if (item === HAMMER) {
    hitBlock();
    return;
  }
  if (item === BRUSH || item === SCRAPER) {
    paintBlock(item === BRUSH ? paintHex() : null);
    return;
  }
  if (item === FIREWORKS) launchFirework();
  else if (item === BALL) throwBall();
  else if (item === CLAIM) claimClick();
  else if (item === FILL) fillClick();
  else if (item === COPY) copyClick();
  else if (!hit) sounds.swing();
  else placeBlock(item);
}

// Right click: interact with things (never breaks anything).
function interact() {
  // Wands: right-click empties the Fill box, or forgets what was copied.
  if (hud.item === FILL && wand.b) return fillClick(true);
  if ((hud.item === FILL || hud.item === COPY) && (wand.a || wand.clip)) {
    resetWand(false);
    hud.toast('✨ Cancelled.');
    return;
  }
  if (claimTool.a) {
    resetClaimTool();
    hud.toast('🚩 Claiming cancelled.');
    return;
  }
  if (target?.car) return requestEnter(target.car);
  if (target?.pet) return petThePet(target);
  if (target?.npc) {
    net.send({ t: 'npc_talk', id: target.npc.id });
    return;
  }
  if (hit && !hit.ground) {
    if (shapeOf(hit.value) === 'door' && hit.part !== 'floor') return toggleDoor(...hit.block);
    if (switchable(hit.value) && hit.part !== 'floor') {
      // Light switch: off, and on again.
      if (!canBuildAt(hit.block[0], hit.block[2])) return notifyLand(hit.block[0], hit.block[2]);
      if (setBlock(...hit.block, toggleLight(hit.value))) sounds.click();
      return;
    }
    const def = BLOCKS[blockId(itemOf(hit.value))];
    if (hit.part !== 'floor') {
      if (def?.seat) return sitOn(...hit.block, itemOf(hit.value));
      if (def?.hug) return hugTeddy(...hit.block);
      if (def?.shape === 'picture') return nextPicture(...hit.block, hit.value);
      if (def?.music) return changeNote(...hit.block, hit.value);
      if (def?.shop) return openShop();
      if (def?.piano) return playPiano(...hit.block);
    }
    if (BLOCKS[blockId(hit.value)]?.turns && !floorOf(hit.value)) {
      // Turn a road line (or parking line) to run the other way.
      if (!canBuildAt(hit.block[0], hit.block[2])) return notifyLand(hit.block[0], hit.block[2]);
      if (setBlock(...hit.block, turnLine(hit.value))) sounds.click();
      return;
    }
    const s = structures.at(...hit.block);
    if (s?.type === 'bed') return goToBed(s);
    if (s?.type === 'cannon') return fireCannon(s);
    if (s?.type === 'tv') {
      const name = tvs.nextChannel(s);
      if (name) {
        sounds.click();
        hud.toast(`📺 ${name}`);
      }
      return;
    }
  }
  if (hud.item === CLAIM) unclaimClick();
}

// ---------- Ladders ----------

// A ladder goes on the side of a wall and reaches from the bottom of the wall to the top.
function placeLadder() {
  if (!hit || hit.ground || hit.normal[1] !== 0 || shapeOf(hit.value) !== 'cube') {
    hud.toast('🪜 Ladders go on the side of a wall. Point at a wall and click!');
    return;
  }
  const [bx, by, bz] = hit.block, [nx, , nz] = hit.normal;
  const lx = bx + nx, lz = bz + nz;
  if (!canBuildAt(lx, lz)) {
    notifyLand(lx, lz);
    return;
  }
  const facing = nz === 1 ? 0 : nx === 1 ? 1 : nz === -1 ? 2 : 3; // the ladder leans on the wall behind it
  const free = y => {
    const v = world.get(lx, y, lz);
    return inBounds(lx, y, lz) && (!v || isReplaceable(v));
  };
  const wall = y => {
    const v = world.get(bx, y, bz);
    return y >= 0 && v !== 0 && shapeOf(v) === 'cube';
  };
  if (!free(by)) return;
  let lo = by, hi = by;
  while (lo > 0 && wall(lo - 1) && free(lo - 1)) lo--;
  while (wall(hi + 1) && free(hi + 1)) hi++;
  for (let y = lo; y <= hi; y++) setBlock(lx, y, lz, makeBlock(LADDER, facing));
  sounds.place();
  if (hi > lo) hud.toast(`🪜 ${hi - lo + 1} blocks tall! Walk into it and hold W or Space to climb.`);
}

// ---------- Railings ----------

// Where a railing would go: click near an edge on top of a block (or the ground, or a
// sidewalk) to put one along that edge, or click the side of a block to put one along
// its top edge on that side. Clicking again adds more sides to the same spot.
function railSpot() {
  if (!hit) return null;
  const [bx, by, bz] = hit.block;
  const v = hit.value || 0, shape = shapeOf(v), n = hit.normal;
  // Where the look ray meets the floor of a cell (or the hit point, if it doesn't).
  const floorPoint = y => {
    const t = lookDir.y < -0.01 ? (y - eye.y) / lookDir.y : -1;
    return t > 0 && t < REACH + 2 ? eye.clone().addScaledVector(lookDir, t) : hit.point;
  };
  const edgeAt = (p, cx, cz) => nearestRailEdge(Math.min(1, Math.max(0, p.x - cx)), Math.min(1, Math.max(0, p.z - cz)));
  if (hit.ground) return { cell: [bx, 0, bz], edge: edgeAt(hit.point, bx, bz) };
  if (['rail', 'flat', 'plant', 'model'].includes(shape)) return { cell: [bx, by, bz], edge: edgeAt(floorPoint(by), bx, bz) };
  if (shape !== 'cube') return null;
  if (n[1] === 1) return { cell: [bx, by + 1, bz], edge: edgeAt(hit.point, bx, bz) };
  if (n[1] === 0) {
    // The side of a wall: the railing goes along the top of the wall, on this side.
    let top = by;
    while (top < by + 8 && shapeOf(world.get(bx, top + 1, bz)) === 'cube' && world.get(bx, top + 1, bz)) top++;
    return { cell: [bx, top + 1, bz], edge: n[0] === 1 ? 2 : n[0] === -1 ? 8 : n[2] === 1 ? 4 : 1 };
  }
  return null;
}

// The block a railing spot would become (or null if a railing can't go there).
function withRail(spot) {
  const [x, y, z] = spot.cell;
  if (!inBounds(x, y, z)) return null;
  const v = world.get(x, y, z), shape = shapeOf(v);
  if (!v || shape === 'plant') return makeBlock(RAILING, spot.edge);
  if (railMask(v) & spot.edge) return null;
  if (shape === 'rail' || shape === 'flat') return v | (spot.edge << 8);
  // A torch (or lamp) gets railings around it: they go in the floor part of the spot.
  if (shape === 'model') return stack(itemOf(v), floorOf(v) ? floorOf(v) | (spot.edge << 8) : makeBlock(RAILING, spot.edge));
  return null;
}

function placeRail() {
  const spot = railSpot();
  const b = spot && withRail(spot);
  if (!b) {
    const there = spot && railMask(world.get(...spot.cell)) & spot.edge;
    hud.toast(there ? '🚧 There\'s already a railing there.' : spot ? '🚧 There\'s no room for a railing there.' : '🚧 Click near the edge of a floor, or the side of a block, to put a railing there.');
    return;
  }
  const [x, y, z] = spot.cell;
  if (!canBuildAt(x, z)) {
    notifyLand(x, z);
    return;
  }
  // Don't trap anyone inside the new railing.
  const [r] = railBoxes(spot.edge, 1);
  const box = [x + r[0], y + r[1], z + r[2], x + r[3], y + r[4], z + r[5]];
  const people = [player.pos, ...[...avatars.list.values()].map(a => a.pos)];
  if (people.some(p => box[0] < p.x + 0.3 && box[3] > p.x - 0.3 && box[1] < p.y + 1.8 && box[4] > p.y && box[2] < p.z + 0.3 && box[5] > p.z - 0.3)) {
    hud.toast('🚧 Step back a little first: you\'re standing where the railing goes.');
    return;
  }
  if (setBlock(x, y, z, b)) sounds.place();
}

// ---------- Paint ----------

const paintMaterials = {};
function choosePaint(i) {
  settings.paint = i;
  icons[BRUSH] = makeIcon(BRUSH, textures, paintHex());
  view.setPaint(paintHex());
  const at = settings.hotbar.indexOf(BRUSH);
  if (at >= 0) {
    hud.buildHotbar();
    hud.select(at);
  } else {
    hud.setSlot(BRUSH);
  }
  saveSettings();
}

// Which side of the thing you're pointing at the crosshair is on (0-5: +x, -x, +y, -y,
// +z, -z). Doors count their sides as they're turned, so the paint swings open with them.
function hitSide(h, part) {
  const n = h.normal.some(c => c) ? h.normal : [0, 1, 0];
  if (shapeOf(part) !== 'door') return faceIndex(n);
  const meta = blockMeta(part);
  const swung = meta & DOOR_OPEN && world.doorRole(...h.block).kind !== 'garage';
  const a = (meta & 3) * Math.PI / 2 + (swung ? Math.PI / 2 : 0), c = Math.cos(a), s = Math.sin(a);
  return faceIndex([Math.round(n[0] * c - n[2] * s), n[1], Math.round(n[0] * s + n[2] * c)]);
}

// The paint on the side you're pointing at (-1 if none).
function sidePaint(h) {
  const floor = h.part === 'floor', part = floor ? floorOf(h.value) : itemOf(h.value);
  const faces = world.facePaint(blockKey(...h.block) + (floor ? '|f' : ''));
  const side = faces?.[hitSide(h, part)] ?? -1;
  return side >= 0 ? side : paintOf(part) ? hexToRgb(PAINT_COLORS[paintOf(part)]) : -1;
}

// Paints the side of the block you're looking at, and only that side (color null = scrape
// that side back to its own colors). A door's whole side is painted at once, and so is a
// whole garage door or ladder.
function paintBlock(color) {
  if (!hit || hit.ground) {
    sounds.swing();
    return;
  }
  const [x, y, z] = hit.block;
  if (!canBuildAt(x, z)) {
    notifyLand(x, z);
    return;
  }
  const floor = hit.part === 'floor';
  const part = floor ? floorOf(hit.value) : itemOf(hit.value);
  const side = hitSide(hit, part);
  const cells = floor ? [[x, y, z]]
    : shapeOf(part) === 'door' && world.doorRole(x, y, z).kind === 'garage' ? world.doorGroup(x, y, z) : blockGroup(x, y, z, hit.value);
  let changed = false;
  for (const [cx, cy, cz] of cells) changed = paintSide(cx, cy, cz, floor, side, color) || changed;
  if (!changed) {
    if (!color) hud.toast("🧽 That side isn't painted.");
    return;
  }
  const shown = color || '#dddddd';
  paintMaterials[shown] ??= new THREE.MeshStandardMaterial({ color: shown, roughness: 0.6 });
  const p = hit.point;
  particles.burst(p.x - 0.5 + hit.normal[0] * 0.2, p.y - 0.5 + hit.normal[1] * 0.2, p.z - 0.5 + hit.normal[2] * 0.2, paintMaterials[shown], 6);
  sounds.paint();
}

function paintSide(x, y, z, floor, side, color) {
  const v = world.get(x, y, z);
  const part = floor ? floorOf(v) : itemOf(v);
  const key = blockKey(x, y, z) + (floor ? '|f' : '');
  let faces = (world.facePaint(key) || Array(6).fill(-1)).slice();
  // Painted all over the old way? Put that color on every side first (and take the
  // all-over paint off), so painting one side leaves the others as they were.
  const all = paintOf(part);
  if (all) {
    faces = faces.map(c => (c >= 0 ? c : hexToRgb(PAINT_COLORS[all])));
    setBlock(x, y, z, floor ? stack(itemOf(v), withPaint(part, 0)) : withPaint(v, 0));
  }
  const want = color ? hexToRgb(color) : -1;
  if (faces[side] === want && !all) return false;
  faces[side] = want;
  world.setPaint(key, faces);
  net.send({ t: 'paint', x, y, z, floor, faces: faces.every(c => c < 0) ? null : faces });
  return true;
}

function pickBlock() {
  if (!hit?.id) return;
  const existing = settings.hotbar.indexOf(hit.id);
  if (existing >= 0) hud.select(existing);
  else hud.setSlot(hit.id);
  saveSettings();
}

// ---------- Furniture ----------

let seated = null; // { x, y, z, standAt } while sitting on a chair or couch
let pictureCount = 0;

// Sit down on a chair or couch, facing out of it.
function sitOn(x, y, z, v) {
  if (riding() || sleeping || seated) return;
  const def = BLOCKS[blockId(v)], a = (blockMeta(v) & 3) * Math.PI / 2;
  const fx = Math.sin(a), fz = Math.cos(a);
  seated = { x, y, z, standAt: [x + 0.5 + Math.round(fx), y, z + 0.5 + Math.round(fz)] };
  player.vel.set(0, 0, 0);
  player.flying = false;
  // Turn round and lower yourself onto the seat (hips on the seat).
  scriptMove([x + 0.5 - fx * 0.06, y + def.seat - 0.72, z + 0.5 - fz * 0.06], a + Math.PI, 0.55, { arc: 0.06, then: () => sounds.land() });
  player.pitch = Math.max(player.pitch, -0.3);
  hud.toast('🛋️ Comfy! Move or jump to get up.');
}

function standUp(instant = false) {
  if (!seated) return;
  const { x, y, z, standAt } = seated;
  seated = null;
  // Step out in front, or (no room there) climb out over the top.
  const from = player.pos.clone();
  player.pos.set(...standAt);
  const to = player.overlapsSomething() ? [x + 0.5, y + 1, z + 0.5] : standAt;
  player.pos.copy(from);
  player.vel.set(0, 0, 0);
  if (instant) {
    move = null;
    player.pos.set(...to);
  } else {
    scriptMove(to, player.yaw, 0.45, { arc: 0.12 });
  }
}

function hugTeddy(x, y, z) {
  effects.heartsAt(x + 0.5, y + 0.7, z + 0.5, 8);
  sounds.squeak();
  net.send({ t: 'fx', kind: 'hearts', x: x + 0.5, y: y + 0.7, z: z + 0.5 });
}

// A new value for a block with different meta bits (keeping its paint).
const withMeta = (v, meta) => (v & ~(15 << 8)) | (meta << 8);

// Right-click a picture to hang a different one.
function nextPicture(x, y, z, v) {
  if (!canBuildAt(x, z)) return notifyLand(x, z);
  const meta = blockMeta(v), design = ((meta >> 2) + 1) % 4;
  if (setBlock(x, y, z, withMeta(v, (meta & 3) | (design << 2)))) {
    sounds.click();
    hud.toast(`🖼️ ${PICTURES[BLOCKS[blockId(v)].art][design]}`);
  }
}

// Pictures hang on the side of a block, like ladders.
function placePicture(item) {
  if (!hit || hit.ground || hit.normal[1] !== 0 || shapeOf(hit.value) !== 'cube') {
    hud.toast('🖼️ Pictures go on walls. Point at the side of a block and click!');
    return;
  }
  const [bx, by, bz] = hit.block, [nx, , nz] = hit.normal;
  const x = bx + nx, z = bz + nz;
  if (!canBuildAt(x, z)) return notifyLand(x, z);
  if (!inBounds(x, by, z) || world.get(x, by, z)) return;
  const facing = nz === 1 ? 0 : nx === 1 ? 1 : nz === -1 ? 2 : 3;
  const design = pictureCount++ % 4;
  if (setBlock(x, by, z, makeBlock(item, facing | (design << 2)))) {
    sounds.place();
    hud.toast(`🖼️ ${PICTURES[BLOCKS[item].art][design]}. Right-click it to hang a different one.`);
  }
}

// A bed is two blocks long: the foot where you click, the head one further away.
function placeBed(item, x, y, z) {
  const q = facingTowards(player.yaw), a = q * Math.PI / 2;
  const dx = Math.round(Math.sin(a)), dz = Math.round(Math.cos(a));
  const hx = x - dx, hz = z - dz;
  const free = (cx, cz) => {
    const v = world.get(cx, y, cz);
    return inBounds(cx, y, cz) && (!v || (isReplaceable(v) && !railMask(v))) && !blockedByPlayer(cx, y, cz);
  };
  if (!canBuildAt(x, z) || !canBuildAt(hx, hz)) return notifyLand(x, z);
  if (!free(x, z) || !free(hx, hz)) {
    hud.toast('🛏️ A bed needs two empty spaces in a row.');
    return;
  }
  setBlock(hx, y, hz, makeBlock(item, q));
  setBlock(x, y, z, makeBlock(item, q | BED_FOOT));
  sounds.place();
}

// The other half of a bed.
function bedCells(x, y, z, v) {
  const a = (blockMeta(v) & 3) * Math.PI / 2, dx = Math.round(Math.sin(a)), dz = Math.round(Math.cos(a));
  const s = blockMeta(v) & BED_FOOT ? -1 : 1;
  const ox = x + dx * s, oz = z + dz * s, other = world.get(ox, y, oz);
  return blockId(itemOf(other)) === blockId(itemOf(v)) ? [[x, y, z, v], [ox, y, oz, other]] : [[x, y, z, v]];
}

// ---------- Music blocks ----------

let nextNote = 0, musicTipShown = false;
const musicCells = new Map(); // who -> the music block they're standing on

// The instrument comes from the paint on the block: none is a piano, dark is a drum,
// white or gray is a bell, red and orange are video game beeps, yellow and green a flute,
// blue and purple a bell.
function instrumentAt(x, y, z) {
  const faces = world.facePaint(blockKey(x, y, z));
  const c = faces ? [faces[2], ...faces].find(f => f >= 0) : undefined;
  if (c === undefined) return 'piano';
  const hsl = new THREE.Color(c).getHSL({});
  if (hsl.l < 0.22) return 'drum';
  if (hsl.s < 0.2) return 'bell';
  if (hsl.h < 0.11 || hsl.h > 0.9) return 'game';
  if (hsl.h < 0.45) return 'flute';
  return 'bell';
}

function playMusic(x, y, z, volume = 1) {
  const v = world.get(x, y, z);
  if (!BLOCKS[blockId(itemOf(v))]?.music) return;
  sounds.note(NOTE_FREQS[blockMeta(v)], instrumentAt(x, y, z), volume);
  effects.note(x + 0.5, y + 1.3, z + 0.5);
}

// Stepping onto a music block plays its note (anyone's steps, not just yours).
function stepMusic(id, pos) {
  const x = Math.floor(pos.x), y = Math.floor(pos.y - 0.05), z = Math.floor(pos.z);
  const above = pos.y - (y + 1); // how far above the top of that block our feet are
  const v = above > -0.1 && above < 0.25 ? world.get(x, y, z) : 0;
  const key = BLOCKS[blockId(itemOf(v))]?.music ? `${x},${y},${z}` : null;
  if (key === (musicCells.get(id) ?? null)) return;
  musicCells.set(id, key);
  if (key) playMusic(x, y, z, id === myId ? 1 : loudness(x, y, z, 30));
}

function changeNote(x, y, z, v) {
  if (!canBuildAt(x, z)) return notifyLand(x, z);
  const n = (blockMeta(v) + 1) % 16;
  if (setBlock(x, y, z, withMeta(v, n))) {
    playMusic(x, y, z);
    hud.toast(`🎵 ${NOTE_NAMES[n]}`);
  }
}

// ---------- Races ----------
// Step off a Race Start line and the clock starts; cross a Race Finish line to stop it.
// Works on foot and in cars. The server keeps the best times for each finish line.

const race = { running: false, t0: 0, line: null };

function updateRace() {
  const now = performance.now();
  const p = myCar ? myCar.pos : player.pos;
  const x = Math.floor(p.x), y = Math.floor(p.y + 0.05), z = Math.floor(p.z);
  const v = inGame ? world.get(x, y, z) : 0;
  const kind = [itemOf(v), floorOf(v)].map(u => BLOCKS[blockId(u)]?.race).find(Boolean) || null;
  const line = kind ? `${kind}:${x},${y},${z}` : null;
  if (kind === 'start') {
    // On the start line: ready… (the clock starts as you leave it)
    if (!race.running) sounds.beep();
    race.running = true;
    race.t0 = now;
  } else if (kind === 'finish' && line !== race.line && race.running) {
    const time = (now - race.t0) / 1000;
    race.running = false;
    sounds.claim();
    if (time >= 1) net.send({ t: 'race', x, y, z, time });
    hud.toast(`🏁 ${time.toFixed(2)} seconds!`);
  }
  if (race.running && kind !== 'start' && race.line?.startsWith('start')) sounds.beep(true); // GO!
  race.line = line;
  if (race.running && now - race.t0 > 600000) race.running = false; // gave up?
  const el = $('race');
  el.classList.toggle('hidden', !race.running);
  if (race.running) el.textContent = kind === 'start' ? '🏁 Ready… GO!' : `⏱️ ${((now - race.t0) / 1000).toFixed(2)}`;
}

// ---------- Things flying through the air ----------
// Water balloons (thrown by anyone: every game works out who gets splashed) and balloons
// that were let go (they float up and away, then pop).

const flying = [];
const balloonGeo = new THREE.SphereGeometry(0.14, 12, 9).scale(1, 1.15, 1);
const BALLOON_COLORS = ['#42a5f5', '#ec407a', '#66bb6a', '#ffca28', '#ab47bc', '#ff7043'];

function launchWater(p, v, color, by) {
  const mesh = new THREE.Mesh(balloonGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.15, transparent: true, opacity: 0.9 }));
  mesh.position.copy(p);
  scene.add(mesh);
  flying.push({ kind: 'water', mesh, pos: p.clone(), vel: v.clone(), by, age: 0, color });
}

function throwWaterBalloon() {
  const color = BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
  const p = eye.clone().addScaledVector(lookDir, 0.6);
  p.y -= 0.15;
  const v = lookDir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 2.5, 0)).addScaledVector(player.vel, 0.5);
  launchWater(p, v, color, myId);
  const r = n => Math.round(n * 100) / 100;
  net.send({ t: 'throw', p: [r(p.x), r(p.y), r(p.z)], v: [r(v.x), r(v.y), r(v.z)], color });
  sounds.swing();
}

function letBalloonGo(x, y, z, color) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.25 }));
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.2, 4).translate(0, -0.9, 0), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
  g.add(ball, string);
  g.position.set(x, y, z);
  scene.add(g);
  flying.push({ kind: 'float', mesh: g, pos: g.position, vel: new THREE.Vector3(0, 1.8, 0), age: 0, seed: Math.random() * 10, color });
}

// Is a point inside someone standing at `feet`?
const touches = (p, feet, crouch = false) => Math.abs(p.x - feet.x) < 0.45 && Math.abs(p.z - feet.z) < 0.45 && p.y > feet.y - 0.1 && p.y < feet.y + (crouch ? 1.5 : 1.9);

function updateFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.age += dt;
    let done = false;
    if (f.kind === 'float') {
      f.pos.x += Math.sin(f.age * 1.3 + f.seed) * 0.4 * dt;
      f.pos.y += f.vel.y * dt;
      f.mesh.rotation.z = Math.sin(f.age * 1.7 + f.seed) * 0.12;
      if (f.age > 9) {
        done = true;
        sounds.pop();
        effects.sparkle(f.pos.x, f.pos.y, f.pos.z, 12);
      }
    } else {
      f.vel.y -= 20 * dt;
      const steps = Math.max(1, Math.ceil((f.vel.length() * dt) / 0.2));
      for (let s = 0; s < steps && !done; s++) {
        f.pos.addScaledVector(f.vel, dt / steps);
        if (f.pos.y < 0 || world.isSolid(Math.floor(f.pos.x), Math.floor(f.pos.y), Math.floor(f.pos.z))) done = true;
        else if (f.by !== myId && !riding() && touches(f.pos, player.pos, player.crouching)) {
          done = true;
          splashed(f.by);
        } else if ([...avatars.list.values(), ...npcs.values()].some(a => a.id !== f.by && !a.seat && touches(f.pos, a.pos))) done = true;
      }
      f.mesh.position.copy(f.pos);
      if (done || f.age > 6) {
        done = true;
        const c = new THREE.Color(f.color);
        effects.splash(f.pos.x, Math.max(0.1, f.pos.y), f.pos.z, [0.4 + c.r * 0.3, 0.6 + c.g * 0.3, 0.9 + c.b * 0.1]);
        sounds.splash(loudness(f.pos.x, f.pos.y, f.pos.z, 30));
      }
    }
    if (done) {
      scene.remove(f.mesh);
      flying.splice(i, 1);
    }
  }
}

// We got hit by somebody's water balloon!
function splashed(by) {
  const el = $('splash');
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  sounds.splash(1.2);
  const who = avatars.list.get(by)?.name;
  hud.toast(who ? `💦 SPLASH! ${who} got you!` : '💦 SPLASH!');
  net.send({ t: 'splashed', by });
}

// ---------- Bubbles ----------

let bubbleTimer = 0, bubbleSendTimer = 0, popTimer = 0;

function blowBubbles(dt) {
  bubbleTimer -= dt;
  bubbleSendTimer -= dt;
  if (bubbleTimer > 0) return;
  bubbleTimer = 0.12;
  const p = eye.clone().addScaledVector(lookDir, 0.8);
  p.y -= 0.1;
  const dir = [lookDir.x, lookDir.y, lookDir.z];
  effects.blowBubbles(p.x, p.y, p.z, dir, 2);
  if (bubbleSendTimer <= 0) {
    bubbleSendTimer = 0.3;
    const r = n => Math.round(n * 100) / 100;
    net.send({ t: 'fx', kind: 'bubbles', x: r(p.x), y: r(p.y), z: r(p.z), dir: dir.map(r) });
  }
}

// Little pops now and then while there are bubbles about.
function popBubbles(dt) {
  popTimer -= dt;
  if (popTimer > 0 || !effects.bubbles.count) return;
  popTimer = 0.15 + Math.random() * 0.5;
  sounds.pop();
}

// ---------- Builder wands ----------
// The Fill Wand fills a box with a block (or empties it), and the Copy Wand copies a box of
// blocks and pastes it somewhere else. Z undoes the last one.

const wand = { a: null, b: null, raise: 0, clip: null };
const undoStack = [];
let lastBlock = 5; // the Fill Wand fills with the last block you held

const wandBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0xffca28, transparent: true, opacity: 0.95, depthTest: false }),
);
wandBox.renderOrder = 6;
wandBox.visible = false;
scene.add(wandBox);

const wandCell = () => (hit ? (hit.ground ? hit.place.slice() : hit.block.slice()) : null);

function resetWand(keepClip = true) {
  wand.a = wand.b = null;
  wand.raise = 0;
  if (!keepClip) wand.clip = null;
}

// The selected box: [x0, y0, z0, x1, y1, z1] (inclusive).
function wandRange() {
  if (!wand.a || !wand.b) return null;
  const [a, b] = [wand.a, wand.b];
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(y0, Math.min(WORLD.maxY, Math.max(a[1], b[1]) + wand.raise));
  return [Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2])];
}
const rangeSize = r => (r[3] - r[0] + 1) * (r[4] - r[1] + 1) * (r[5] - r[2] + 1);

function showWandBox(r, color) {
  wandBox.visible = !!r;
  if (!r) return;
  wandBox.material.color.set(color);
  wandBox.position.set((r[0] + r[3] + 1) / 2, (r[1] + r[4] + 1) / 2, (r[2] + r[5] + 1) / 2);
  wandBox.scale.set(r[3] - r[0] + 1.02, r[4] - r[1] + 1.02, r[5] - r[2] + 1.02);
}

// Changes lots of blocks at once (here and for everyone), and remembers how to undo it.
function changeMany(changes, label) {
  if (!changes.length) {
    hud.toast('✨ Nothing to change there.');
    return false;
  }
  const cells = [], undo = [];
  let blocked = 0;
  for (const [x, y, z, v] of changes) {
    if (!inBounds(x, y, z)) continue;
    if (!canBuildAt(x, z)) {
      blocked++;
      continue;
    }
    const old = world.get(x, y, z);
    if (old === v) continue;
    cells.push(x, y, z, v);
    undo.push(x, y, z, old);
  }
  if (!cells.length) {
    hud.toast(blocked ? `🚧 That's ${claimAt(claims, changes[0][0], changes[0][2])?.owner || 'someone'}'s land.` : '✨ Nothing to change there.');
    return false;
  }
  applyMany(cells);
  net.send({ t: 'many', cells });
  if (label) {
    undoStack.push({ cells: undo, label });
    if (undoStack.length > 10) undoStack.shift();
  }
  sounds.magic();
  return true;
}

function applyMany(cells) {
  const onChange = world.onChange;
  world.onChange = null; // look for structures once at the end, not after every block
  let changed = 0;
  for (let i = 0; i + 3 < cells.length; i += 4) if (world.set(cells[i], cells[i + 1], cells[i + 2], cells[i + 3])) changed++;
  world.onChange = onChange;
  if (changed) structures.scan();
  if (player && player.overlapsSomething()) player.unstick();
}

function undo() {
  const last = undoStack.pop();
  if (!last) {
    hud.toast('↩️ Nothing to undo.');
    return;
  }
  applyMany(last.cells);
  net.send({ t: 'many', cells: last.cells });
  sounds.magic();
  hud.toast(`↩️ Undid the ${last.label}.`);
}

// Blocks that can't fill a box: they need a wall or a partner block.
const fillable = item => typeof item === 'number' && !['door', 'ladder', 'picture'].includes(BLOCKS[item].shape) && item !== 64;

function fillClick(empty = false) {
  const cell = wandCell();
  if (!wand.a) {
    if (!cell) return;
    wand.a = cell;
    sounds.click();
    hud.toast('✨ Now click the opposite corner.');
    return;
  }
  if (!wand.b) {
    if (!cell) return;
    wand.b = cell;
    sounds.click();
    const r = wandRange();
    hud.toast(`✨ ${r[3] - r[0] + 1} × ${r[4] - r[1] + 1} × ${r[5] - r[2] + 1}. Scroll to make it taller, click to fill it, right-click to empty it.`);
    return;
  }
  const r = wandRange();
  if (rangeSize(r) > MAX_MANY) {
    hud.toast(`✨ Too big! A box can have up to ${MAX_MANY} blocks (that one has ${rangeSize(r)}).`);
    return;
  }
  if (!empty && !fillable(lastBlock)) {
    hud.toast('✨ Hold a block for a moment first (like Brick), then come back to the Fill Wand.');
    return;
  }
  const v = empty ? 0 : lastBlock;
  const changes = [];
  for (let x = r[0]; x <= r[3]; x++) for (let y = r[1]; y <= r[4]; y++) for (let z = r[2]; z <= r[5]; z++) changes.push([x, y, z, v]);
  if (changeMany(changes, empty ? 'emptied box' : 'fill')) {
    hud.toast(empty ? '✨ Emptied! (Press Z to undo)' : `✨ Filled with ${BLOCKS[v].name}! (Press Z to undo)`);
    resetWand();
  }
}

// Turns a block a quarter turn (for pasting a copy turned around).
function turnValue(v) {
  if (!v) return v;
  if (floorOf(v)) return stack(turnValue(itemOf(v)), turnValue(floorOf(v)));
  const def = BLOCKS[blockId(v)];
  if (!def) return v;
  const meta = blockMeta(v), shape = def.shape || 'cube';
  if (shape === 'door' || shape === 'ladder' || shape === 'picture' || def.facing) return withMeta(v, (meta & ~3) | ((meta + 1) & 3));
  if (shape === 'rail' || shape === 'flat') {
    const turned = withMeta(v, ((meta >> 1) | (meta << 3)) & 15);
    return def.turns ? turnLine(turned) : turned;
  }
  return v;
}

function turnClip() {
  const c = wand.clip;
  c.cells = c.cells.map(([dx, dy, dz, v]) => [dz, dy, c.w - 1 - dx, turnValue(v)]);
  [c.w, c.d] = [c.d, c.w];
  sounds.click();
}

function copyClick() {
  if (wand.clip) {
    // Paste, with its bottom corner where you point.
    const o = hit?.place;
    if (!o) return;
    const changes = wand.clip.cells.map(([dx, dy, dz, v]) => [o[0] + dx, o[1] + dy, o[2] + dz, v]);
    if (changeMany(changes, 'paste')) hud.toast('📋 Pasted! Click again for another copy. (Z to undo, right-click to forget it)');
    return;
  }
  const cell = wandCell();
  if (!cell) return;
  if (!wand.a) {
    wand.a = cell;
    sounds.click();
    hud.toast('📋 Now click the opposite corner of what you want to copy.');
    return;
  }
  wand.b = cell;
  const r = wandRange();
  if (rangeSize(r) > MAX_MANY * 4) {
    hud.toast('📋 That\'s too big to copy. Try a smaller piece!');
    resetWand();
    return;
  }
  const cells = [];
  for (let x = r[0]; x <= r[3]; x++) for (let y = r[1]; y <= r[4]; y++) for (let z = r[2]; z <= r[5]; z++) {
    const v = world.get(x, y, z);
    if (v) cells.push([x - r[0], y - r[1], z - r[2], v]);
  }
  resetWand();
  if (!cells.length) {
    hud.toast('📋 There\'s nothing there to copy.');
    return;
  }
  if (cells.length > MAX_MANY) {
    hud.toast(`📋 That has ${cells.length} blocks: the most you can copy is ${MAX_MANY}.`);
    return;
  }
  wand.clip = { w: r[3] - r[0] + 1, h: r[4] - r[1] + 1, d: r[5] - r[2] + 1, cells };
  sounds.magic();
  hud.toast(`📋 Copied ${cells.length} blocks! Point somewhere and click to paste. Scroll to turn it around.`);
}

// While holding a wand: show the box, and what the mouse wheel does.
function updateWand() {
  const item = hud.item;
  if (item !== FILL && item !== COPY) {
    if (wand.a) resetWand();
    wandBox.visible = false;
    return;
  }
  if (item === COPY && wand.clip && hit && !wand.a) {
    const o = hit.place, c = wand.clip;
    showWandBox([o[0], o[1], o[2], o[0] + c.w - 1, o[1] + c.h - 1, o[2] + c.d - 1], 0x4dd0e1);
    return;
  }
  const cell = wandCell();
  const r = wandRange() || (wand.a && cell ? [Math.min(wand.a[0], cell[0]), Math.min(wand.a[1], cell[1]), Math.min(wand.a[2], cell[2]), Math.max(wand.a[0], cell[0]), Math.max(wand.a[1], cell[1]), Math.max(wand.a[2], cell[2])] : null);
  showWandBox(r, item === FILL ? 0xffca28 : 0x4dd0e1);
}

// The mouse wheel: taller or shorter Fill box, or turn the copy around. Returns true if used.
function wandWheel(dir) {
  if (hud.item === FILL && wand.b) {
    // (Scrolling up makes it taller; it can't get shorter than one block.)
    wand.raise = Math.max(-Math.abs(wand.a[1] - wand.b[1]), Math.min(40, wand.raise - dir));
    sounds.click();
    return true;
  }
  if (hud.item === COPY && wand.clip) {
    turnClip();
    return true;
  }
  return false;
}

// ---------- Photos ----------

let photoPending = false, hudHidden = false;

function takePhoto() {
  photoPending = true;
}

// Called right after drawing a frame, while the picture is still there.
function savePhoto() {
  photoPending = false;
  sounds.shutter();
  const flash = $('flash');
  flash.classList.remove('show');
  void flash.offsetWidth;
  flash.classList.add('show');
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    a.download = `BuildZone ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.png`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    hud.toast('📸 Photo saved! (Look in your Downloads)');
  }, 'image/png');
}

function toggleHud() {
  hudHidden = !hudHidden;
  $('hud').classList.toggle('photo-mode', hudHidden);
  hud.toast(hudHidden ? '🙈 HUD hidden. Press H to bring it back.' : '👀 HUD is back.');
}

// ---------- Coins, the Luxe Store, and the town's people ----------

// Gold coins: they spin and bob, and you pick one up by walking (or driving) into it.
const COIN_LOOK = { 1: 0xffc83d, 2: 0xffa000, 5: 0x8ff0ff };
const coinMesh = new THREE.InstancedMesh(
  new THREE.CylinderGeometry(0.3, 0.3, 0.07, 20).rotateX(Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.25, emissive: 0x4a3000 }),
  64,
);
coinMesh.count = 0;
coinMesh.frustumCulled = false;
coinMesh.castShadow = true;
scene.add(coinMesh);
const coinMatrix = new THREE.Matrix4(), coinQuat = new THREE.Quaternion(), coinScale = new THREE.Vector3(), coinPos = new THREE.Vector3();

function updateCoins(dt, time) {
  let i = 0;
  for (const [id, c] of coinMap) {
    if (i >= 64) break;
    const s = c.value === 5 ? 1.35 : c.value === 2 ? 1.15 : 1;
    coinQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, time * 2.2 + id);
    coinPos.set(c.x, c.y + 0.75 + Math.sin(time * 2 + id) * 0.12, c.z);
    coinMesh.setMatrixAt(i, coinMatrix.compose(coinPos, coinQuat, coinScale.setScalar(s)));
    coinMesh.setColorAt(i, tmpColor.set(COIN_LOOK[c.value] || COIN_LOOK[1]));
    i++;
    // Close enough to grab? Ask the server (once every couple of seconds).
    const p = player.pos;
    if (Math.hypot(p.x - c.x, p.z - c.z) < (myCar ? 2 : 1.1) && Math.abs(p.y - c.y) < 2 && time - (c.asked ?? -9) > 2) {
      c.asked = time;
      net.send({ t: 'coin', id });
    }
  }
  coinMesh.count = i;
  coinMesh.instanceMatrix.needsUpdate = true;
  if (coinMesh.instanceColor) coinMesh.instanceColor.needsUpdate = true;
}

// Jetpack flames and rainbow trails (yours and everyone else's).
let sparkleTimer = 0, jetSoundTimer = 0;
function updateSparkly(dt, time) {
  sparkleTimer -= dt;
  jetSoundTimer -= dt;
  const trailNow = sparkleTimer <= 0;
  if (trailNow) sparkleTimer = 0.035;
  if (player.jetting && !riding()) {
    effects.jet(player.pos.x, player.pos.y + 0.35, player.pos.z);
    if (jetSoundTimer <= 0) {
      jetSoundTimer = 0.12;
      sounds.jet();
    }
  }
  if (trailNow && hud.item === TRAIL && !riding() && Math.hypot(player.vel.x, player.vel.z) > 1) effects.trail(player.pos.x, player.pos.y, player.pos.z, time * 0.5);
  for (const a of avatars.list.values()) {
    if (a.seat) continue;
    if (a.jet) effects.jet(a.pos.x, a.pos.y + 0.35, a.pos.z);
    if (a.trail && trailNow && a.speed > 0.15) effects.trail(a.pos.x, a.pos.y, a.pos.z, time * 0.5 + a.id);
  }
}

// The town's people, under the crosshair.
function npcRaycast(origin, dir, max) {
  let best = null;
  for (const a of npcs.values()) {
    const p = a.pos;
    const h = rayBox(origin, dir, [p.x - 0.4, p.y, p.z - 0.4, p.x + 0.4, p.y + 1.95, p.z + 0.4]);
    if (h && h.t < max && (!best || h.t < best.distance)) best = { npc: a, distance: h.t };
  }
  return best;
}

function openShop() {
  if (shopOpen || !inGame) return;
  shopOpen = true;
  unlock();
  shop.open();
  updateOverlays();
}

// The Firework Show: rockets all around you, one after another.
function fireworkShow() {
  const p = player.pos.clone();
  sounds.launch(1);
  hud.toast('🎇 SHOWTIME!');
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const a = (i / 8) * Math.PI * 2, r = 4 + (i % 2) * 3;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = p.y;
      const color = FIREWORK_COLORS[i % FIREWORK_COLORS.length], seed = Math.random();
      if (!fireworks.launch(x, y, z, color, seed)) return;
      sounds.launch(0.7);
      net.send({ t: 'fx', kind: 'firework', x, y, z, color, seed });
    }, i * 380);
  }
}

// The grand piano plays a little tune (a different one each time).
const TUNES = [[0, 2, 4, 0, 0, 2, 4, 0], [4, 4, 5, 7, 7, 5, 4, 2], [7, 4, 4, 5, 2, 2, 0, 4, 7], [0, 4, 7, 11, 9, 7, 4, 2, 0]];
let tuneIndex = 0;
function playPiano(x, y, z) {
  const tune = TUNES[tuneIndex++ % TUNES.length];
  tune.forEach((n, i) => setTimeout(() => {
    sounds.note(NOTE_FREQS[n], 'piano', 0.9);
    effects.note(x + 0.5, y + 1.3, z + 0.5);
  }, i * 230));
}

// ---------- Camera ----------

const tmp = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();
const sleepCam = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
let camSleepK = 0;

// Moves `desired` closer to `focus` if a wall is in the way.
function avoidWalls(focus, desired) {
  const dir = tmp.copy(desired).sub(focus);
  const dist = dir.length();
  dir.normalize();
  const h = world.raycast(focus, dir, dist);
  if (h && !h.ground && isReplaceable(h.value)) return desired;
  if (h) desired.copy(focus).addScaledVector(dir, Math.max(0.3, h.distance - 0.3));
  return desired;
}

function updateCamera(dt) {
  const car = riding();
  if (car) {
    const s = car.spec;
    if (carView === 0) {
      const seat = cars.seat(car, mySeat());
      camera.position.copy(seat.position).y += EYE_HEIGHT * SEAT_SCALE;
      camera.rotation.set(carCam.pitch * 0.6 + car.pitch, car.h + carCam.yaw, 0);
    } else {
      if (Math.abs(car.speed) > 2 && !(car === myCar && s.flying)) carCam.yaw *= Math.exp(-1.5 * dt);
      const yaw = car.h + carCam.yaw + (carView === 2 ? Math.PI : 0);
      const dist = s.flying ? 12 : s.length + 3.5;
      const focus = car.pos.clone().add(new THREE.Vector3(0, s.height * 0.8, 0));
      const lift = (s.flying ? 3 : s.height + 1.2) - carCam.pitch * 4;
      const desired = focus.clone().add(new THREE.Vector3(Math.sin(yaw) * dist, lift, Math.cos(yaw) * dist));
      camera.position.copy(avoidWalls(focus, desired));
      camera.lookAt(focus);
    }
    camera.fov += (BASE_FOV - camera.fov) * Math.min(1, dt * 8);
    camera.updateProjectionMatrix();
    return;
  }
  player.eye(eye);
  eye.y -= CROUCH_DROP * crouchK;
  lookDir.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
  if (sleeping) {
    // Looking down at yourself sleeping, from above the foot of the bed (beds have
    // headboards). Worked out from where you'll be lying, even while you're climbing in.
    const lie = move ? move.to : player.pos, yaw = move ? move.toYaw : player.yaw;
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); // feet to head
    const above = lie.clone().addScaledVector(dir, 0.9).add(new THREE.Vector3(0, 0.8, 0));
    sleepCam.pos.copy(avoidWalls(above, lie.clone().addScaledVector(dir, -0.7).add(new THREE.Vector3(0, 2.1, 0))));
    sleepCam.quat.setFromRotationMatrix(tmpMatrix.lookAt(sleepCam.pos, tmp.set(lie.x + dir.x * 1.2, lie.y + 0.2, lie.z + dir.z * 1.2), camera.up));
  }
  if (viewMode === 0) {
    camera.position.copy(eye);
    camera.rotation.set(player.pitch, player.yaw, 0);
  } else if (viewMode === 1) {
    const desired = eye.clone().addScaledVector(lookDir, -4).add(new THREE.Vector3(0, 0.5, 0));
    camera.position.copy(avoidWalls(eye, desired));
    camera.rotation.set(player.pitch, player.yaw, 0);
  } else {
    const flat = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const desired = eye.clone().addScaledVector(flat, 3.2).add(new THREE.Vector3(0, 0.3, 0));
    camera.position.copy(avoidWalls(eye, desired));
    camera.lookAt(eye.x, eye.y - 0.4, eye.z);
  }
  // Glide over to the sleeping view (and back again when you get up).
  camSleepK += ((sleeping ? 1 : 0) - camSleepK) * Math.min(1, dt * 2.4);
  if (camSleepK > 0.002) {
    camera.position.lerp(sleepCam.pos, camSleepK);
    camera.quaternion.slerp(sleepCam.quat, camSleepK);
  }
  const targetFov = BASE_FOV + (player.sprinting && player.moving ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();
}

// ---------- Main loop ----------

const timer = new THREE.Timer();
timer.connect(document);
let sendTimer = 0, hudTimer = 0, fpsFrames = 0, fpsTime = 0, fps = 0, landTimer = 0, vehicleHudTimer = 0;
let menuSpin = 0, lastFrame = 0, frameCount = 0, crouchK = 0;

// How many frames a second to draw. Fewer frames means a cooler, quieter computer: the
// frame rate setting while playing, and much less while the game is paused or behind a
// menu (nothing much is moving then).
function frameRateNow() {
  if (!inGame) return 30;
  if (!locked || inventoryOpen || editorOpen || galleryOpen || shopOpen) return 12;
  return settings.fps || 1000;
}

function frame(timestamp) {
  requestAnimationFrame(frame);
  // Skip this screen refresh if it's too soon for the next frame. (A little slack, so a
  // 60 Hz screen doesn't drop to 30 frames a second when it's a touch early.)
  // The next frame is due one interval after the last one was, which keeps fast (120 Hz)
  // screens at a steady 60, and never tries to catch up on frames that were skipped.
  const interval = 1000 / frameRateNow();
  if (timestamp - lastFrame < interval - 2) return;
  lastFrame = Math.max(lastFrame + interval, timestamp - interval);
  frameCount++;
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const time = timer.getElapsed();
  const active = locked && !hud.chatOpen;
  // Keys held on the keyboard, plus the ones the touch joystick and pads are pressing.
  const held = touch?.enabled ? new Set([...keys, ...touch.keys]) : keys;
  if (touch) {
    touch.setMode(myCar ? (myCar.spec.flying ? 'heli' : 'car') : myRide ? 'ride' : player?.flying ? 'fly' : 'walk');
    touch.update();
    if ((sleeping || seated) && !move && (touch.stick.x || touch.stick.y || touch.keys.has('Space'))) {
      wakeUp();
      standUp();
    }
  }
  const nightK = 1 - sky.dayK;
  let fire = 0;

  if (inGame) {
    if (myCar) {
      // The helicopter turns to face where you're looking, so keep the camera pointing there.
      const aim = myCar.h + carCam.yaw;
      for (const ev of cars.drive(myCar, dt, active ? held : noKeys, aim)) vehicleEvent(ev, myCar);
      if (myCar.spec.flying) carCam.yaw = Math.atan2(Math.sin(aim - myCar.h), Math.cos(aim - myCar.h));
      player.pos.copy(cars.seat(myCar).position);
      player.vel.set(0, 0, 0);
      if (myCar.spec.flying) sounds.engine(null);
      else {
        // The engine note follows the revs smoothly (so you hear each gear change).
        myCar.rpmShown = (myCar.rpmShown ?? myCar.rpm) + (myCar.rpm - (myCar.rpmShown ?? myCar.rpm)) * Math.min(1, dt * 9);
        sounds.engine(myCar.rpmShown, myCar.load);
      }
    } else if (myRide) {
      player.pos.copy(cars.seat(myRide, mySeat()).position);
      player.vel.set(0, 0, 0);
    } else if (updateMove(dt)) {
      // Gliding into (or out of) a seat or a bed.
    } else if (seated) {
      // Sitting still. (If the chair gets broken, you stand up.)
      player.vel.set(0, 0, 0);
      if (!BLOCKS[blockId(itemOf(world.get(seated.x, seated.y, seated.z)))]?.seat) standUp(true);
    } else if (!sleeping) {
      const wasOnGround = player.onGround;
      const vyBefore = player.vel.y;
      player.stick = touch?.enabled && active ? touch.stick : null;
      player.balloon = hud.item === BALLOON;
      player.jetpack = hud.item === JETPACK;
      player.update(dt, active ? held : noKeys);
      if (player.springed) {
        player.springed = false;
        sounds.boing();
      } else if (player.bounced) {
        player.bounced = false;
        if (lastBounceTramp) sounds.boing();
        else sounds.bounce();
      } else if (!wasOnGround && player.onGround && vyBefore < -8) {
        sounds.land();
      } else if (wasOnGround && !player.onGround && player.vel.y > 0) {
        sounds.jump();
      }
    }

    if (danceView > 0) {
      danceView -= dt;
      if (danceView <= 0 && viewMode === 2) viewMode = 0;
    }
    crouchK += ((player.crouching && !riding() ? 1 : 0) - crouchK) * Math.min(1, dt * 12);
    updateCamera(dt);

    // What are we looking at? Vehicles and pets count if they're closer than the nearest block.
    hit = null;
    target = null;
    if (locked && !riding() && !sleeping) {
      hit = world.raycast(eye, lookDir, REACH);
      const carHit = cars.raycast(eye, lookDir, REACH);
      const petHit = petRaycast(eye, lookDir, REACH);
      const npcHit = npcRaycast(eye, lookDir, REACH);
      const nearest = [carHit, petHit, npcHit].filter(Boolean).sort((a, b) => a.distance - b.distance)[0];
      if (nearest && (!hit || nearest.distance < hit.distance)) {
        target = nearest;
        hit = null;
      }
    }
    const item = hud.item;
    const railPreview = item === RAILING && hit && railSpot();
    const showHighlight = hit && !(hit.ground && (item === HAMMER || item === BALL || item === FIREWORKS)) && (item !== RAILING || railPreview);
    highlight.visible = !!showHighlight;
    if (railPreview) {
      // Outline the railing that a click would build.
      const [r] = railBoxes(railPreview.edge, 1), [x, y, z] = railPreview.cell;
      highlight.position.set(x + (r[0] + r[3]) / 2, y + 0.5, z + (r[2] + r[5]) / 2);
      highlight.scale.set(r[3] - r[0], 1, r[5] - r[2]);
    } else if (showHighlight) {
      if (hit.ground) {
        highlight.position.set(hit.place[0] + 0.5, 0.003, hit.place[2] + 0.5);
        highlight.scale.set(1, 0.001, 1);
      } else {
        // Outline exactly what you're pointing at (a carpet, a door, a lamp…), or the whole block.
        const b = hit.box || [...hit.block, hit.block[0] + 1, hit.block[1] + 1, hit.block[2] + 1];
        highlight.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
        highlight.scale.set(Math.max(0.02, b[3] - b[0]), Math.max(0.02, b[4] - b[1]), Math.max(0.02, b[5] - b[2]));
      }
    }
    if (hitState.key && (!hit || hit.block.join(',') !== hitState.key)) hitState.timer = Math.min(hitState.timer, 0.3);
    hitState.timer -= dt;
    if (hitState.timer <= 0 && hitState.key) {
      hitState.key = null;
      crack.visible = false;
    }

    // A hint under the crosshair about what you can do.
    let hint = '';
    if (target?.car) {
      const what = target.car.spec.flying ? '🚁 Right-click or E to fly' : target.car.spec.boat ? '🚤 Right-click or E to drive the boat' : '🚗 Right-click or E to drive';
      const full = target.car.driver && target.car.passengers.length >= 2;
      hint = full ? "🚗 It's full" : target.car.driver ? '🚗 Right-click or E to ride along' : what + (item === HAMMER ? ' · Click to whack it' : '');
    } else if (target?.pet) {
      hint = item === BALL && target.avatar === myBody ? '🎾 Click to throw the ball · Right-click to pet' : '🐾 Right-click to pet';
    } else if (target?.npc) {
      hint = target.npc.id === -1 ? '🛍️ Right-click to shop at the Luxe Store' : `💬 Right-click to talk to ${target.npc.name.replace(/ \S+$/, '')}`;
    } else if (hitState.key) {
      hint = `🔨 Hit ${hitState.count} of 3`;
    } else if (player.climbing) {
      hint = '🪜 W / Space: up · S: down';
    } else if (item === CLAIM && claimTool.a) {
      hint = claimTool.confirm ? '🚩 Click to claim · Right-click to cancel' : '🚩 Click the opposite corner';
    } else if (item === FILL) {
      hint = wand.b ? `✨ Click: fill with ${BLOCKS[lastBlock]?.name} · Scroll: taller / shorter · Right-click: empty it`
        : wand.a ? '✨ Click the opposite corner · Right-click to cancel' : `✨ Click a corner of the box to fill (with ${BLOCKS[lastBlock]?.name}, the last block you held)`;
    } else if (item === COPY) {
      hint = wand.clip ? '📋 Click to paste · Scroll to turn it · Right-click to forget it · Z to undo'
        : wand.a ? '📋 Click the opposite corner · Right-click to cancel' : '📋 Click one corner of what you want to copy';
    } else if (seated) {
      hint = '🛋️ Move or jump to get up';
    } else {
      const s = hit && !hit.ground ? structures.at(...hit.block) : null;
      const def = hit && !hit.ground && hit.part !== 'floor' ? BLOCKS[blockId(itemOf(hit.value))] : null;
      const tool = item === HAMMER || item === BRUSH || item === SCRAPER;
      if (item === BRUSH && hit && !hit.ground) hint = `🎨 Click to paint this side ${paintName()}`;
      else if (item === SCRAPER && hit && !hit.ground) hint = sidePaint(hit) >= 0 ? '🧽 Click to scrape the paint off this side' : '';
      else if (hit && shapeOf(hit.value) === 'door') hint = '🚪 Right-click to open / close';
      else if (hit && switchable(hit.value) && hit.part !== 'floor' && item !== HAMMER) hint = lightOff(hit.value) ? '💡 Right-click to turn it on' : '💡 Right-click to turn it off';
      else if (hit && blockId(hit.value) === 46 && item !== HAMMER) hint = '🌙 Street lamps turn on by themselves at night';
      else if (hit && BLOCKS[blockId(hit.value)]?.turns && !floorOf(hit.value) && item !== HAMMER) hint = '↻ Right-click to turn the line';
      else if (hit && shapeOf(hit.value) === 'ladder' && item !== HAMMER) hint = '🪜 Walk into it and hold W or Space to climb';
      else if (item === RAILING && hit) hint = railPreview && withRail(railPreview) ? '🚧 Click to add a railing here' : '🚧 Point near the edge of a floor, or at the side of a block';
      else if (s?.type === 'bed') hint = '🛏️ Right-click to sleep · Jump on it to bounce!';
      else if (def?.seat && !tool) hint = '🛋️ Right-click to sit down';
      else if (def?.hug && !tool) hint = '🧸 Right-click for a hug';
      else if (def?.shape === 'picture' && !tool) hint = '🖼️ Right-click to hang a different picture';
      else if (def?.music && !tool) hint = `🎵 ${NOTE_NAMES[blockMeta(hit.value)]} · Walk on it to play · Right-click: next note`;
      else if (def?.speedPad && item !== HAMMER) hint = '⚡ Run (or drive) over it the way the arrows point!';
      else if (def?.shop && !tool) hint = '🛍️ Right-click to open the Luxe Store';
      else if (def?.piano && !tool) hint = '🎹 Right-click to play a tune';
      else if (def?.race === 'start' && item !== HAMMER) hint = '🏁 Start line: step off it to start the clock, then race to a Finish line!';
      else if (def?.race === 'finish' && item !== HAMMER) hint = '🏁 Finish line: cross it after a Start line to set a time';
      else if (s?.type === 'cannon') hint = '💥 Right-click to launch yourself!';
      else if (s?.type === 'tv') hint = '📺 Right-click to change the channel';
      else if (item === CLAIM) hint = '🚩 Click a corner to start claiming land (max 10×15)';
      else if (item === WATER_BALLOON) hint = '💦 Click to throw a water balloon!';
      else if (item === BUBBLES) hint = '🫧 Hold the mouse button to blow bubbles';
      else if (item === BALLOON) hint = player.onGround ? '🎈 Jump off something high and float down! Click to let a balloon go' : '🎈 Wheee!';
      else if (item === CAMERA) hint = '📸 Click (or press P) to take a photo · H hides the HUD';
      else if (item === JETPACK) hint = player.jetting ? '🚀 WHOOSH!' : '🚀 Hold Space to blast off!';
      else if (item === TRAIL) hint = '🌈 Run around to leave a rainbow trail!';
      else if (item === SHOWTIME) hint = '🎇 Click for a fireworks show! (Best at night)';
    }
    hud.setHint(hint);

    // Live preview while picking the second corner of a land claim.
    if (item !== CLAIM && claimTool.a) resetClaimTool();
    if (item === CLAIM && claimTool.a && !claimTool.confirm) {
      const cell = claimCell();
      if (cell) {
        const rect = normalizeRect(claimTool.a[0], claimTool.a[1], cell[0], cell[1]);
        landView.preview(rect, !claimProblem(rect));
      }
    }

    // Holding the mouse button keeps hammering or building.
    useCooldown -= dt;
    if (locked && !riding() && useCooldown <= 0 && mouse.has(0) && (item === HAMMER || typeof item === 'number')) {
      useItem();
      useCooldown = item === HAMMER ? 0.25 : 0.2;
    }
    if (locked && !riding() && mouse.has(0) && item === BUBBLES) blowBubbles(dt);

    // Music blocks play under anyone's feet; races, flying balloons and the wands' boxes.
    if (!riding() && (player.onGround || seated)) stepMusic(myId, player.pos);
    for (const a of avatars.list.values()) if (!a.seat) stepMusic(a.id, a.pos);
    updateRace();
    updateFlying(dt);
    popBubbles(dt);
    updateWand();

    kickBall();
    updateDownwash(dt, time);
    ball.update(dt, ballBoxes);
    // No pet to fetch it? It pops back into your hand after a while.
    if (ball.active && !myBody.pet && ball.restTime > 4) ball.active = false;
    fire = updateStructures(dt, time);

    sendTimer -= dt;
    if (sendTimer <= 0) {
      sendTimer = 1 / 15;
      const r = v => Math.round(v * 100) / 100;
      const rot = myCar ? [r(myCar.h), 0] : [r(player.yaw), r(player.pitch)];
      const ballPos = ball.active && !ball.carried ? [r(ball.pos.x), r(ball.pos.y), r(ball.pos.z)] : 0;
      const balloon = hud.item === BALLOON && !riding() && !sleeping;
      const flags = (sleeping ? FLAG.sleeping : 0) | (seated ? FLAG.sitting : 0) | (player.crouching && !riding() ? FLAG.crouching : 0) |
        (player.jetting && !riding() ? FLAG.jet : 0) | (hud.item === TRAIL && !riding() ? FLAG.trail : 0) |
        (balloon ? FLAG.balloon | (hexToRgb(paintHex()) << 8) : 0);
      net.send({ t: 'state', pos: [r(player.pos.x), r(player.pos.y), r(player.pos.z)], rot, pet: myBody.petState(), ball: ballPos, flags, hold: riding() ? '' : hud.item });
      sendCarState();
      // Parked cars we knocked (or pushed): tell everyone where they are.
      for (const car of cars.list.values()) {
        if (!car.loose && !car.settled) continue;
        car.settled = false;
        net.send({ t: 'car_nudge', id: car.id, x: r(car.pos.x), y: r(car.pos.y), z: r(car.pos.z), h: r(car.h) });
      }
    }

    // Headlights on the car we're driving.
    if (myCar && !myCar.spec.flying && nightK > 0.2) {
      const s = myCar.spec, f = new THREE.Vector3(-Math.sin(myCar.h), 0, -Math.cos(myCar.h));
      headlight.position.copy(myCar.pos).addScaledVector(f, s.length / 2).y += s.ride + s.bodyH * 0.6;
      headlight.target.position.copy(headlight.position).addScaledVector(f, 12).y -= 2;
      headlight.intensity = 70 * nightK;
    } else {
      headlight.intensity = 0;
    }

    // Our own body, seen in the third-person views.
    // (Getting into bed, you see yourself once the camera has pulled back out of your head.)
    myBody.root.visible = riding() ? carView !== 0 : viewMode !== 0 || camSleepK > 0.3;
    myBody.seat = riding() ? cars.seat(riding(), mySeat()) : null;
    myBody.target.copy(player.pos);
    myBody.targetYaw = player.yaw;
    myBody.targetPitch = player.pitch;
    myBody.flying = player.flying;
    myBody.swing = view.swingT;
    myBody.sitting = !!seated;
    myBody.crouching = player.crouching && !riding();
    myBody.balloon = hud.item === BALLOON && !riding() && !sleeping ? paintHex() : null;
    myBody.update(dt, time);

    // Say whose land you just walked onto.
    landTimer -= dt;
    if (landTimer <= 0) {
      landTimer = 0.3;
      const c = claimAt(claims, Math.floor(player.pos.x), Math.floor(player.pos.z));
      const key = c ? c.key : null;
      if (key !== lastLandKey) {
        lastLandKey = key;
        if (c) hud.toast(c.key === nameKey(settings.name) ? '🏠 Welcome home! This is your land.' : `🏠 ${c.owner}'s land. You can visit, but not build.`);
      }
    }

    vehicleHudTimer -= dt;
    if (vehicleHudTimer <= 0) {
      vehicleHudTimer = 0.1;
      if (myCar) {
        const kmh = Math.round(Math.abs(myCar.speed) * 3.6);
        const health = `❤️ ${Math.max(0, Math.round((myCar.hp / MAX_HP) * 100))}%`;
        let ground = Math.floor(myCar.pos.y);
        while (ground > 0 && !world.isSolid(Math.floor(myCar.pos.x), ground - 1, Math.floor(myCar.pos.z))) ground--;
        hud.setVehicleInfo(myCar.spec.flying
          ? `⬆️ ${Math.max(0, Math.round(myCar.pos.y - ground))} m · ${kmh} km/h · Rotor ${Math.round(myCar.rotorSpin * 100)}% · ${health}`
          : myCar.spec.boat ? `🚤 ${kmh} km/h · ${health}`
            : `Gear ${myCar.gear === 0 ? 'R' : myCar.gear === 3 ? '3 (overdrive)' : myCar.gear} · ${kmh} km/h · ${health}`);
      } else if (myRide) {
        const driver = avatars.list.get(myRide.driver);
        hud.setVehicleInfo(`🧍 Passenger${driver ? ` · ${driver.name} is driving` : ' · Waiting for a driver'} · ${Math.round(Math.abs(myRide.speed) * 3.6)} km/h`);
      }
    }

    fpsFrames++;
    fpsTime += dt;
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.5;
      fps = Math.round(fpsFrames / Math.max(fpsTime, 1e-3));
      fpsFrames = fpsTime = 0;
      hud.updateInfo({ online, fps, pos: player.pos, flying: player.flying, clock: sky.clockText() });
      hud.updatePlayers([{ name: settings.name + ' (you)', color: settings.look.shirtColor }, ...[...avatars.list.values()].map(a => ({ name: a.name, color: a.color }))]);
    }
    hud.update(dt);
  } else {
    // Slow orbit over the town behind the main menu.
    menuSpin += dt * 0.04;
    camera.position.set(Math.sin(menuSpin) * 34, 16, Math.cos(menuSpin) * 34);
    camera.lookAt(0, 2, 0);
  }

  // Other players sit in the vehicles they drive or ride in.
  for (const a of avatars.list.values()) a.seat = null;
  for (const car of cars.list.values()) {
    [car.driver, ...car.passengers].forEach((id, seat) => {
      const a = id && id !== myId && avatars.list.get(id);
      if (a) a.seat = cars.seat(car, seat);
    });
  }

  // Loudest nearby siren, fire and helicopter.
  let siren = 0, rotor = 0, rotorSpin = 0, rotorEffort = 0.5;
  for (const car of cars.list.values()) {
    if (car.siren) siren = Math.max(siren, loudness(car.pos.x, car.pos.y, car.pos.z, 70));
    if (car.hp < FIRE_HP) fire = Math.max(fire, loudness(car.pos.x, car.pos.y, car.pos.z, 35));
    if (car.spec.flying && car.rotorSpin > 0.02) {
      const level = car === riding() ? 1 : loudness(car.pos.x, car.pos.y, car.pos.z, 120);
      if (level > rotor) {
        rotor = level;
        rotorSpin = car.rotorSpin;
        rotorEffort = car === myCar ? car.collective : 0.5 + Math.max(-0.3, Math.min(0.4, (car.target.y - car.pos.y) * 0.5));
      }
    }
  }
  if (inGame) {
    sounds.siren(siren);
    sounds.fire(fire);
    sounds.rotor(rotor * Math.min(1, rotorSpin * 3), rotorSpin, rotorEffort);
  }

  sky.update(dt, camera, world, materials);
  if (structures) {
    lightPools.update(world, structures.version, sky.lampK || 0);
    tvs.sync(structures);
    const phase = sky.phase;
    tvs.update(dt, time, camera.position, { players: avatars.list.size + 1, clock: sky.clockText(), night: sky.isNight, dayPhase: phase < 0.62 ? phase / 0.62 : 0 });
  }
  world.updateVisibility(camera.position, settings.quality === 'low' ? Math.min(140, scene.fog.far) : scene.fog.far);
  world.update(dt);
  avatars.update(dt, time);
  for (const a of npcs.values()) a.update(dt, time);
  if (inGame) {
    updateCoins(dt, time);
    updateSparkly(dt, time);
  }
  cars.setView(camera.position, scene.fog.far);
  cars.update(dt, time, nightK, myCar?.id);
  if (inGame) for (const ev of cars.events) vehicleEvent(ev, ev.other);
  particles.update(dt, world);
  effects.update(dt, camera, renderer.domElement.height);
  for (const p of fireworks.update(dt)) sounds.boom(loudness(p.x, p.y, p.z, 160));
  // Bursts light up the whole night sky in their color.
  if (fireworks.flash > 0.01 && nightK > 0.2) {
    // The whole town is bathed in the burst's color: the sky light, the light bouncing off
    // the ground, the moonlight and the haze all take on its hue.
    const f = Math.min(1, fireworks.flash) * nightK, c = fireworks.flashColor;
    sky.hemi.intensity += f * 0.7;
    sky.hemi.color.lerp(c, Math.min(1, f * 1.1));
    sky.hemi.groundColor.lerp(c, f * 0.7);
    sky.sun.color.lerp(c, f * 0.9);
    sky.sun.intensity += f * 0.4;
    scene.fog.color.lerp(tmpColor.copy(c).multiplyScalar(0.35), f * 0.6);
  }
  const firstPerson = inGame && !riding() && viewMode === 0 && !sleeping;
  // While the ball is off being thrown (or fetched), it isn't in your hand.
  view.holder.visible = !(hud?.item === BALL && ball?.active);
  view.update(dt, player.moving && player.onGround, camera.aspect, scene.environment, sky.dayK);

  // Water ripples drift slowly.
  const water = materials?.[36];
  if (water) {
    water.normalMap.offset.x += dt * 0.02;
    water.normalMap.offset.y += dt * 0.013;
    water.map.offset.x += dt * 0.006;
  }

  // Shadows only need redrawing every couple of frames.
  if (frameCount % (QUALITY[settings.quality] || QUALITY.high).shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
  reflections.update(dt, camera, [highlight, crack]);
  reflections.refresh(sky.dayK);
  if (glow.enabled) {
    glow.render(sky.dayK);
  } else {
    renderer.clear();
    renderer.render(scene, camera);
  }
  if (firstPerson && !photoPending) {
    renderer.clearDepth();
    renderer.render(view.scene, view.camera);
  }
  if (photoPending) savePhoto();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  glow.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
});

load();

// Handy for poking at the game from the browser console.
window.buildzone = {
  scene, camera, sky, net, avatars, renderer, fireworks, effects, glow, reflections, view, sounds,
  get world() { return world; },
  get player() { return player; },
  get cars() { return cars; },
  get myCar() { return myCar; },
  get myRide() { return myRide; },
  get hit() { return hit; },
  get touch() { return touch; },
  get target() { return target; },
  get hud() { return hud; },
  get structures() { return structures; },
  get myBody() { return myBody; },
  get ball() { return ball; },
  get claims() { return claims; },
  get sleeping() { return sleeping; },
  get seated() { return seated; },
  get npcs() { return npcs; },
  get coinMap() { return coinMap; },
  get coinCount() { return coinMap.size; },
  get npcNames() { return [...npcs.values()].map(a => a.name).join(', '); },
  get wallet() { return wallet; },
  get wand() { return wand; },
  get flying() { return flying; },
  get race() { return race; },
  get undoStack() { return undoStack; },
  undo: () => undo(),
  useItem: () => useItem(),
  kickBall: () => kickBall(),
  throwBall: () => throwBall(),
  ballBoxes: r => ballBoxes(r),
  interact: () => interact(),
  setView: v => (viewMode = v),
};
