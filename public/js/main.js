// BuildZone: game setup, input and the main loop.
import * as THREE from 'three';
import {
  BLOCKS, WORLD, inBounds, blockId, blockMeta, shapeOf, isReplaceable, makeBlock, doorFacingFromYaw, paintOf, withPaint,
  railMask, railBoxes, nearestRailEdge, PAINT_COLORS, PAINT_NAMES, DOOR_OPEN, DOOR_TOP,
} from './shared/blocks.js';
import { generateWorld } from './shared/worldgen.js';
import { randomLook, sanitizeLook } from './shared/avatar.js';
import { generateTextures } from './textures.js';
import { World, createBlockMaterials, blockMaterial, RAILING } from './world.js';
import { Player, EYE_HEIGHT } from './player.js';
import { Network } from './network.js';
import { Avatar, Avatars } from './avatars.js';
import { Cars, SEAT_SCALE } from './cars.js';
import { MAX_HP, FIRE_HP, PERSON_MASS } from './shared/vehicles.js';
import { normalizeRect, claimSizeOk, rectsOverlap, canBuild, claimAt, nameKey } from './shared/claims.js';
import { Structures } from './structures.js';
import { TVs, CHANNELS } from './tv.js';
import { Reflections, Glow } from './lighting.js';
import { LightPools } from './lightpools.js';
import { LandView, describeSize } from './landview.js';
import { Ball, PetBrain } from './pets.js';
import { DayNight } from './daynight.js';
import { Editor } from './editor.js';
import { CharacterClient, Gallery } from './gallery.js';
import { Hud, renderControls } from './hud.js';
import { HAMMER, FIREWORKS, BALL, CLAIM, BRUSH, SCRAPER, LADDER, ALL_ITEMS, DEFAULT_HOTBAR, makeIcon, ViewModel } from './items.js';
import { Particles, Fireworks, Sounds, Effects } from './effects.js';
import { TouchControls, IS_TOUCH } from './touch.js';

const $ = id => document.getElementById(id);
const REACH = 7;
const BASE_FOV = 80;
const FIREWORK_COLORS = ['#ff4d4d', '#ffd84a', '#4dd2ff', '#7dff6a', '#ff7af0', '#ffffff', '#ff9a3c', '#b388ff'];
const DOOR = 21;

// ---------- Saved settings ----------

const settings = { name: '', look: null, sensitivity: 1, volume: 0.4, quality: 'high', paint: 1, hotbar: DEFAULT_HOTBAR.slice() };
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
if (!PAINT_COLORS[settings.paint]) settings.paint = 1;
settings.look = settings.look ? sanitizeLook(settings.look) : randomLook();
function saveSettings() {
  try {
    localStorage.setItem('buildzone', JSON.stringify(settings));
  } catch { /* storage unavailable */ }
}

// ---------- Renderer, scene and sky ----------

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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
const QUALITY = {
  high: { pixelRatio: 2, shadowMap: 2048, shadowSoftness: 3, lamps: 12, bloom: true, reflections: 128, reflectEvery: 1.2 },
  medium: { pixelRatio: 1, shadowMap: 1024, shadowSoftness: 2, lamps: 8, bloom: true, reflections: 64, reflectEvery: 4 },
  low: { pixelRatio: 0.75, shadowMap: 0, shadowSoftness: 1, lamps: 4, bloom: false, reflections: 0 },
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
const headlight = new THREE.SpotLight(0xfff2d0, 0, 50, 0.55, 0.6, 1.2);
scene.add(headlight, headlight.target);

const view = new ViewModel();
const particles = new Particles(scene);
const effects = new Effects(scene);
const fireworks = new Fireworks(scene, effects);
const tvs = new TVs(scene);
const lightPools = new LightPools(scene);
const landView = new LandView(scene);
const sounds = new Sounds();
sounds.volume = settings.volume;

// ---------- Game state ----------

let world, player, materials, textures, icons, hud, cars, myBody, editor, gallery, structures, ball;
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
  icons = Object.fromEntries(ALL_ITEMS.map(i => [i, makeIcon(i, textures, settings.paint)]));
  view.setPaint(PAINT_COLORS[settings.paint]);
  world = new World(scene, materials);
  structures = new Structures(world);
  world.onChange = (x, y, z) => structures.changed(x, y, z);
  world.onLoad = () => structures.scan();
  sky.extraLights = structureLights;
  player = new Player(world);
  player.bouncePower = trampolineBounce;
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

  hud = new Hud({ icons, settings, sounds, onChange: item => view.setItem(item), onPaint: choosePaint });
  editor = new Editor();
  gallery = new Gallery(new CharacterClient(), sounds);
  myBody = new Avatar(scene, { id: 0, name: '', look: settings.look }, { tag: false });
  myBody.snap = true;
  myBody.root.visible = false;
  myBody.brain = new PetBrain();
  myBody.ball = ball;
  myBody.groundAt = groundAt;
  myBody.onPetEvent = () => {
    sounds.pet(myBody.pet?.kind);
    effects.heartsAt(myBody.pet.pos.x, myBody.pet.pos.y + 0.6, myBody.pet.pos.z);
  };
  renderControls($('menu-controls'));
  renderControls($('pause-controls'));

  $('name').value = settings.name;
  $('sensitivity').value = settings.sensitivity;
  $('volume').value = settings.volume;
  $('quality').value = settings.quality;
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

  myId = welcome.id;
  world.load(welcome.world);
  avatars.clear();
  for (const p of welcome.players) avatars.add(p);
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
net.on('states', ({ list, cars: carStates }) => {
  avatars.applyStates(list, myId);
  cars.applyStates(carStates || [], myCar?.id);
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
net.on('fx', ({ kind, x, y, z, color, seed }) => {
  if (kind === 'hearts') effects.heartsAt(x, y, z);
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
  wakeUp();
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
  if (car) sounds.horn(loudness(car.pos.x, car.pos.y, car.pos.z, 60));
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
  $('pause').classList.toggle('hidden', !inGame || locked || inventoryOpen || hud?.chatOpen || editorOpen || galleryOpen);
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
  wakeUp();
  saveSettings();
  setTimeout(() => {
    net.leave();
    location.reload();
  }, 150); // a moment for "I got out of the car" to reach the server
});
canvas.addEventListener('click', () => inGame && !locked && !inventoryOpen && !editorOpen && !galleryOpen && lock());
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
  if (e.code === 'KeyE') {
    if (riding()) getOut();
    else if (target?.car && locked) requestEnter(target.car);
    else toggleInventory(!inventoryOpen);
    return;
  }
  if (!locked) return;
  if (['Space', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (sleeping && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) {
    wakeUp();
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
  }
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
  if (locked && !hud.chatOpen && !riding()) hud.select(hud.selected + Math.sign(e.deltaY));
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

function honk() {
  sounds.horn(1);
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
  wakeUp();
  myCar = car;
  car.driver = myId;
  car.gear = 1;
  car.vel.set(0, 0, 0);
  player.flying = false;
  carCam.yaw = 0;
  carCam.pitch = car.spec.flying ? -0.25 : -0.15;
  danceView = 0;
  hud.setCarHelp(car.kind);
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
  wakeUp();
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
  const grounded = p => p.y < 0.05 || world.isSolid(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z)) ||
    world.isSolid(Math.floor(p.x), Math.floor(p.y - 1.05), Math.floor(p.z));
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
  const top = bed.y + 1;
  sleeping = { bed, standAt: [bx, top, bz] };
  // Lie on your back with your head on the pillow.
  player.pos.set(bx - dir.x * 0.45, top + 0.15, bz - dir.z * 0.45);
  player.vel.set(0, 0, 0);
  player.flying = false;
  player.yaw = Math.atan2(dir.x, dir.z);
  myBody.lying = true;
  settings.bed = { x: bed.x, y: bed.y, z: bed.z };
  saveSettings();
  net.send({ t: 'sleep', on: true });
  hud.toast(sky.isNight ? '😴 Zzz… When everyone is asleep, the sun comes up!' : '🛏️ This bed is your home now. Press R to come back here. (Move to get up)');
}

function wakeUp() {
  if (!sleeping) return;
  const [x, y, z] = sleeping.standAt;
  player.pos.set(x, y, z);
  sleeping = null;
  myBody.lying = false;
  net.send({ t: 'sleep', on: false });
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
  wakeUp();
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
      if (!flame || (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2 > 30 * 30) continue;
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
  if (sleeping && !structures.ofType('bed').some(b => b === sleeping.bed || (b.x === sleeping.bed.x && b.y === sleeping.bed.y && b.z === sleeping.bed.z))) wakeUp();
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

// Opens or closes a door, together with the doors next to it (double doors and garage doors).
function toggleDoor(x, y, z) {
  const parts = world.doorGroup(x, y, z);
  if (!parts.length) return;
  const opening = !(blockMeta(world.get(x, y, z)) & DOOR_OPEN);
  // Everything in the group ends up the same way (open or closed).
  const changes = parts.map(([px, py, pz, v]) => [px, py, pz, v, opening ? v | (DOOR_OPEN << 8) : v & ~(DOOR_OPEN << 8)]).filter(c => c[3] !== c[4]);
  for (const [px, py, pz, , nv] of changes) world.set(px, py, pz, nv);
  if (player.overlapsSomething()) {
    // Don't close a door on yourself.
    for (const [px, py, pz, v] of changes) world.set(px, py, pz, v);
    return;
  }
  for (const [px, py, pz, , nv] of changes) net.send({ t: 'set', x: px, y: py, z: pz, b: nv });
  if (world.doorRole(x, y, z).kind === 'garage') sounds.garage(opening);
  else sounds.door(opening);
}

// The two halves of one door.
function doorPair(x, y, z) {
  const by = blockMeta(world.get(x, y, z)) & DOOR_TOP ? y - 1 : y;
  return [[x, by, z, world.get(x, by, z)], [x, by + 1, z, world.get(x, by + 1, z)]].filter(([, , , v]) => shapeOf(v) === 'door');
}

// What a click on this block affects: both halves of a door, a whole ladder, or just the block.
function blockGroup(x, y, z, v) {
  if (shapeOf(v) === 'door') return doorPair(x, y, z);
  if (shapeOf(v) === 'ladder') return world.ladderCells(x, y, z);
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
  if (shapeOf(hit.value) === 'flat' && railMask(hit.value)) {
    // A railing on a sidewalk (or carpet…): take the railing (and its paint) off and leave the floor.
    setBlock(x, y, z, blockId(hit.value));
    particles.burst(x, y, z, materials[RAILING]);
    sounds.break();
    return;
  }
  const parts = blockGroup(x, y, z, hit.value);
  for (const [px, py, pz, v] of parts) {
    if (setBlock(px, py, pz, 0)) particles.burst(px, py, pz, blockMaterial(materials, v));
  }
  sounds.break();
}

function placeBlock(item) {
  if (BLOCKS[item].shape === 'rail') return placeRail();
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
  if (shape === 'door') {
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
    setBlock(x, y, z, makeBlock(DOOR, facing));
    setBlock(x, y + 1, z, makeBlock(DOOR, facing | DOOR_TOP));
  } else {
    if (shape === 'cube' && blockedByPlayer(x, y, z)) return;
    if (!setBlock(x, y, z, item)) return;
  }
  sounds.place();
  if (item === 7 && !treeTipShown && (y === 0 || [1, 2].includes(world.get(x, y - 1, z) & 255))) {
    treeTipShown = true;
    hud.toast('🌱 A lone log on the grass grows into a tree! Give it a minute.');
  }
}

// Left click: use whatever you're holding.
function useItem() {
  const item = hud.item;
  view.swing();
  myBody.swing = 0;
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
    paintBlock(item === BRUSH ? settings.paint : 0);
    return;
  }
  if (item === FIREWORKS) launchFirework();
  else if (item === BALL) throwBall();
  else if (item === CLAIM) claimClick();
  else if (!hit) sounds.swing();
  else placeBlock(item);
}

// Right click: interact with things (never breaks anything).
function interact() {
  if (claimTool.a) {
    resetClaimTool();
    hud.toast('🚩 Claiming cancelled.');
    return;
  }
  if (target?.car) return requestEnter(target.car);
  if (target?.pet) return petThePet(target);
  if (hit && !hit.ground) {
    if (shapeOf(hit.value) === 'door') return toggleDoor(...hit.block);
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
  if (shape === 'rail' || shape === 'flat' || shape === 'plant') return { cell: [bx, by, bz], edge: edgeAt(floorPoint(by), bx, bz) };
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
  if (shape === 'rail' || shape === 'flat') return railMask(v) & spot.edge ? null : v | (spot.edge << 8);
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
  icons[BRUSH] = makeIcon(BRUSH, textures, i);
  view.setPaint(PAINT_COLORS[i]);
  const at = settings.hotbar.indexOf(BRUSH);
  if (at >= 0) {
    hud.buildHotbar();
    hud.select(at);
  } else {
    hud.setSlot(BRUSH);
  }
  saveSettings();
}

// Paints the block you're looking at (paint 0 = scrape it back to its original colors).
function paintBlock(paint) {
  if (!hit || hit.ground) {
    sounds.swing();
    return;
  }
  const [x, y, z] = hit.block;
  if (!canBuildAt(x, z)) {
    notifyLand(x, z);
    return;
  }
  if (!paint && !paintOf(hit.value)) {
    hud.toast("🧽 That block isn't painted.");
    return;
  }
  // A garage door is painted all at once; double doors can have a different color on each side.
  const garage = shapeOf(hit.value) === 'door' && world.doorRole(x, y, z).kind === 'garage';
  let changed = false;
  for (const [px, py, pz, v] of garage ? world.doorGroup(x, y, z) : blockGroup(x, y, z, hit.value)) changed = setBlock(px, py, pz, withPaint(v, paint)) || changed;
  if (!changed) return;
  const color = paint ? PAINT_COLORS[paint] : '#dddddd';
  paintMaterials[color] ??= new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  particles.burst(x, y, z, paintMaterials[color], 8);
  sounds.paint();
}

function pickBlock() {
  if (!hit?.id) return;
  const existing = settings.hotbar.indexOf(hit.id);
  if (existing >= 0) hud.select(existing);
  else hud.setSlot(hit.id);
  saveSettings();
}

function groundAt(x, z, nearY) {
  const fx = Math.floor(x), fz = Math.floor(z);
  for (let y = Math.floor(nearY) + 1; y >= Math.floor(nearY) - 4; y--) {
    if (world.isSolid(fx, y, fz) && !world.isSolid(fx, y + 1, fz)) return y + 1;
  }
  return nearY;
}

// ---------- Camera ----------

const tmp = new THREE.Vector3();

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
  lookDir.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
  if (sleeping) {
    // Look down at yourself sleeping.
    const head = new THREE.Vector3(player.pos.x + Math.sin(player.yaw) * 1.4, player.pos.y, player.pos.z + Math.cos(player.yaw) * 1.4);
    camera.position.copy(avoidWalls(head, head.clone().add(new THREE.Vector3(Math.sin(player.yaw) * 1.2, 2.2, Math.cos(player.yaw) * 1.2))));
    camera.lookAt(player.pos.x + Math.sin(player.yaw) * 0.8, player.pos.y, player.pos.z + Math.cos(player.yaw) * 0.8);
  } else if (viewMode === 0) {
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
  const targetFov = BASE_FOV + (player.sprinting && player.moving ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();
}

// ---------- Main loop ----------

const timer = new THREE.Timer();
timer.connect(document);
let sendTimer = 0, hudTimer = 0, fpsFrames = 0, fpsTime = 0, fps = 0, landTimer = 0, vehicleHudTimer = 0;
let menuSpin = 0;

function frame(timestamp) {
  requestAnimationFrame(frame);
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const time = timer.getElapsed();
  const active = locked && !hud.chatOpen;
  // Keys held on the keyboard, plus the ones the touch joystick and pads are pressing.
  const held = touch?.enabled ? new Set([...keys, ...touch.keys]) : keys;
  if (touch) {
    touch.setMode(myCar ? (myCar.spec.flying ? 'heli' : 'car') : myRide ? 'ride' : player?.flying ? 'fly' : 'walk');
    touch.update();
    if (sleeping && (touch.stick.x || touch.stick.y || touch.keys.has('Space'))) wakeUp();
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
    } else if (!sleeping) {
      const wasOnGround = player.onGround;
      const vyBefore = player.vel.y;
      player.stick = touch?.enabled && active ? touch.stick : null;
      player.update(dt, active ? held : noKeys);
      if (player.bounced) {
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
    updateCamera(dt);

    // What are we looking at? Vehicles and pets count if they're closer than the nearest block.
    hit = null;
    target = null;
    if (locked && !riding() && !sleeping) {
      hit = world.raycast(eye, lookDir, REACH);
      const carHit = cars.raycast(eye, lookDir, REACH);
      const petHit = petRaycast(eye, lookDir, REACH);
      const nearest = [carHit, petHit].filter(Boolean).sort((a, b) => a.distance - b.distance)[0];
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
        highlight.position.set(hit.block[0] + 0.5, hit.block[1] + 0.5, hit.block[2] + 0.5);
        highlight.scale.set(1, 1, 1);
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
      const what = target.car.spec.flying ? '🚁 Right-click or E to fly' : '🚗 Right-click or E to drive';
      const full = target.car.driver && target.car.passengers.length >= 2;
      hint = full ? "🚗 It's full" : target.car.driver ? '🚗 Right-click or E to ride along' : what + (item === HAMMER ? ' · Click to whack it' : '');
    } else if (target?.pet) {
      hint = item === BALL && target.avatar === myBody ? '🎾 Click to throw the ball · Right-click to pet' : '🐾 Right-click to pet';
    } else if (hitState.key) {
      hint = `🔨 Hit ${hitState.count} of 3`;
    } else if (player.climbing) {
      hint = '🪜 W / Space: up · S: down';
    } else if (item === CLAIM && claimTool.a) {
      hint = claimTool.confirm ? '🚩 Click to claim · Right-click to cancel' : '🚩 Click the opposite corner';
    } else {
      const s = hit && !hit.ground ? structures.at(...hit.block) : null;
      if (item === BRUSH && hit && !hit.ground) hint = `🎨 Click to paint it ${PAINT_NAMES[settings.paint]}`;
      else if (item === SCRAPER && hit && !hit.ground) hint = paintOf(hit.value) ? '🧽 Click to scrape off the paint' : '';
      else if (hit && shapeOf(hit.value) === 'door') hint = '🚪 Right-click to open / close';
      else if (hit && shapeOf(hit.value) === 'ladder' && item !== HAMMER) hint = '🪜 Walk into it and hold W or Space to climb';
      else if (item === RAILING && hit) hint = railPreview && withRail(railPreview) ? '🚧 Click to add a railing here' : '🚧 Point near the edge of a floor, or at the side of a block';
      else if (s?.type === 'bed') hint = '🛏️ Right-click to sleep';
      else if (s?.type === 'cannon') hint = '💥 Right-click to launch yourself!';
      else if (s?.type === 'tv') hint = '📺 Right-click to change the channel';
      else if (item === CLAIM) hint = '🚩 Click a corner to start claiming land (max 10×15)';
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

    kickBall();
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
      net.send({ t: 'state', pos: [r(player.pos.x), r(player.pos.y), r(player.pos.z)], rot, pet: myBody.petState(), ball: ballPos, flags: sleeping ? 1 : 0 });
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
      headlight.intensity = 120 * nightK;
    } else {
      headlight.intensity = 0;
    }

    // Our own body, seen in the third-person views.
    myBody.root.visible = riding() ? carView !== 0 : viewMode !== 0 || !!sleeping;
    myBody.seat = riding() ? cars.seat(riding(), mySeat()) : null;
    myBody.target.copy(player.pos);
    myBody.targetYaw = player.yaw;
    myBody.targetPitch = player.pitch;
    myBody.flying = player.flying;
    myBody.swing = view.swingT;
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
  let siren = 0, rotor = 0, rotorSpin = 0;
  for (const car of cars.list.values()) {
    if (car.siren) siren = Math.max(siren, loudness(car.pos.x, car.pos.y, car.pos.z, 70));
    if (car.hp < FIRE_HP) fire = Math.max(fire, loudness(car.pos.x, car.pos.y, car.pos.z, 35));
    if (car.spec.flying && car.rotorSpin > 0.02) {
      const level = car === riding() ? 1 : loudness(car.pos.x, car.pos.y, car.pos.z, 120);
      if (level > rotor) {
        rotor = level;
        rotorSpin = car.rotorSpin;
      }
    }
  }
  if (inGame) {
    sounds.siren(siren);
    sounds.fire(fire);
    sounds.rotor(rotor * Math.min(1, rotorSpin * 3), rotorSpin);
  }

  sky.update(dt, camera, world, materials);
  if (structures) {
    lightPools.update(world, structures.version, sky.lampK || 0);
    tvs.sync(structures);
    const phase = sky.phase;
    tvs.update(dt, time, camera.position, { players: avatars.list.size + 1, clock: sky.clockText(), night: sky.isNight, dayPhase: phase < 0.62 ? phase / 0.62 : 0 });
  }
  world.updateVisibility(camera.position, settings.quality === 'low' ? Math.min(140, scene.fog.far) : scene.fog.far);
  avatars.update(dt, time);
  cars.setView(camera.position, scene.fog.far);
  cars.update(dt, time, nightK, myCar?.id);
  if (inGame) for (const ev of cars.events) vehicleEvent(ev, ev.other);
  particles.update(dt, world);
  effects.update(dt, camera, renderer.domElement.height);
  for (const p of fireworks.update(dt)) sounds.boom(loudness(p.x, p.y, p.z, 160));
  // Bursts light up the whole night sky in their color.
  if (fireworks.flash > 0.01 && nightK > 0.2) {
    const f = Math.min(1, fireworks.flash) * nightK;
    sky.hemi.intensity += f * 0.5;
    sky.hemi.color.lerp(fireworks.flashColor, f * 0.5);
    scene.fog.color.lerp(fireworks.flashColor, f * 0.2);
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

  reflections.update(dt, camera, [highlight, crack]);
  reflections.refresh(sky.dayK);
  if (glow.enabled) {
    glow.render(sky.dayK);
  } else {
    renderer.clear();
    renderer.render(scene, camera);
  }
  if (firstPerson) {
    renderer.clearDepth();
    renderer.render(view.scene, view.camera);
  }
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
  scene, camera, sky, net, avatars, renderer, fireworks, effects, glow, reflections, view,
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
  useItem: () => useItem(),
  kickBall: () => kickBall(),
  throwBall: () => throwBall(),
  ballBoxes: r => ballBoxes(r),
  interact: () => interact(),
  setView: v => (viewMode = v),
};
