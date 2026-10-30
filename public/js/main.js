// BuildZone: game setup, input and the main loop.
import * as THREE from 'three';
import { BLOCKS, WORLD, inBounds, blockMeta, shapeOf, isReplaceable, makeBlock, doorFacingFromYaw, toggleDoorValue, DOOR_OPEN, DOOR_TOP } from './shared/blocks.js';
import { generateWorld } from './shared/worldgen.js';
import { randomLook, sanitizeLook } from './shared/avatar.js';
import { generateTextures } from './textures.js';
import { World, createBlockMaterials, blockMaterial } from './world.js';
import { Player, EYE_HEIGHT } from './player.js';
import { Network } from './network.js';
import { Avatar, Avatars } from './avatars.js';
import { Cars, CAR_SPECS, SEAT_SCALE } from './cars.js';
import { DayNight } from './daynight.js';
import { Editor } from './editor.js';
import { Hud, renderControls } from './hud.js';
import { HAMMER, FIREWORKS, ALL_ITEMS, DEFAULT_HOTBAR, isCarItem, makeIcon, ViewModel } from './items.js';
import { Particles, Fireworks, Sounds } from './effects.js';

const $ = id => document.getElementById(id);
const REACH = 7;
const BASE_FOV = 80;
const FIREWORK_COLORS = ['#ff4d4d', '#ffd84a', '#4dd2ff', '#7dff6a', '#ff7af0', '#ffffff', '#ff9a3c', '#b388ff'];
const DOOR = 21;

// ---------- Saved settings ----------

const settings = { name: '', look: null, sensitivity: 1, volume: 0.4, quality: 'high', hotbar: DEFAULT_HOTBAR.slice() };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('buildzone') || '{}'));
} catch { /* storage unavailable */ }
if (!Array.isArray(settings.hotbar) || settings.hotbar.length !== 9 || !settings.hotbar.every(i => ALL_ITEMS.includes(i))) {
  settings.hotbar = DEFAULT_HOTBAR.slice();
}
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

const QUALITY = {
  high: { pixelRatio: 2, shadowMap: 2048, lamps: 8 },
  medium: { pixelRatio: 1, shadowMap: 1024, lamps: 6 },
  low: { pixelRatio: 0.75, shadowMap: 0, lamps: 3 },
};
function applyQuality() {
  const q = QUALITY[settings.quality] || QUALITY.high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
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
const fireworks = new Fireworks(scene);
const sounds = new Sounds();
sounds.volume = settings.volume;

// ---------- Game state ----------

let world, player, materials, textures, icons, hud, cars, myBody, editor;
const net = new Network();
const avatars = new Avatars(scene);
let myId = null;
let online = false;
let inGame = false;
let myCar = null;
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
  view.materials = materials;
  icons = Object.fromEntries(ALL_ITEMS.map(i => [i, makeIcon(i, textures)]));
  world = new World(scene, materials);
  player = new Player(world);
  cars = new Cars(scene, world);
  player.extraBoxes = () => cars.boxes(myCar?.id);
  buildGround();

  // Show the town behind the main menu.
  const preview = generateWorld();
  world.load(preview.blocks.flat());
  preview.cars.forEach((c, i) => cars.add({ ...c, id: -1 - i, driver: 0, color: c.color || FIREWORK_COLORS[i % FIREWORK_COLORS.length] }));

  hud = new Hud({ icons, settings, sounds, onChange: item => view.setItem(item) });
  editor = new Editor();
  myBody = new Avatar(scene, { id: 0, name: '', look: settings.look }, { tag: false });
  myBody.snap = true;
  myBody.root.visible = false;
  renderControls($('menu-controls'));
  renderControls($('pause-controls'));

  $('name').value = settings.name;
  $('sensitivity').value = settings.sensitivity;
  $('volume').value = settings.volume;
  $('quality').value = settings.quality;
  $('loading').classList.add('hidden');
  $('join-form').classList.remove('hidden');
  $('name').focus();
  requestAnimationFrame(frame);
}

// ---------- Joining ----------

$('join-form').addEventListener('submit', async e => {
  e.preventDefault();
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
  sky.time = welcome.time;
  hud.addChat({ system: true, text: online
    ? `Welcome, ${settings.name}! ${welcome.players.length} other builder(s) online.`
    : 'Playing single player. Your world saves in this browser. Run "npm start" to play with friends!' });
  hud.addChat({ system: true, text: 'Tip: click a car (or press E) to drive it. Press G to dance!' });

  inGame = true;
  player.respawn();
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
net.on('look', ({ id, look }) => avatars.list.get(id)?.setLook(look));
net.on('emote', ({ id, kind }) => avatars.list.get(id)?.emote(kind));
net.on('fx', ({ x, y, z, color, seed }) => {
  fireworks.launch(x, y, z, color, seed);
  sounds.launch(loudness(x, y, z, 80));
});
net.on('car', ({ car }) => {
  cars.add(car);
  const v = loudness(car.x, car.y, car.z, 30);
  if (v > 0) sounds.spawnCar();
});
net.on('car_remove', ({ id }) => {
  if (myCar?.id === id) leaveCar();
  const car = cars.list.get(id);
  if (car) particles.burst(car.pos.x - 0.5, car.pos.y + 0.5, car.pos.z - 0.5, car.model.paint, 14);
  cars.remove(id);
});
net.on('car_driver', msg => {
  if (myCar?.id === msg.id && msg.driver === myId) return; // that's us, we already know
  cars.setDriver(msg);
  if (msg.driver === myId) enterCar(cars.list.get(msg.id));
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

function lock() {
  const req = canvas.requestPointerLock?.();
  if (req?.catch) req.catch(() => updateOverlays());
}

function updateOverlays() {
  $('pause').classList.toggle('hidden', !inGame || locked || inventoryOpen || hud?.chatOpen || editorOpen);
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

$('resume').addEventListener('click', lock);
canvas.addEventListener('click', () => inGame && !locked && !inventoryOpen && !editorOpen && lock());
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

function toggleInventory(open) {
  inventoryOpen = open;
  if (open) document.exitPointerLock();
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
  if (!inGame || hud.chatOpen || editorOpen) return;
  if (e.code === 'KeyE') {
    if (myCar) leaveCar(true);
    else if (target?.car && locked) requestEnter(target.car);
    else toggleInventory(!inventoryOpen);
    return;
  }
  if (!locked) return;
  if (['Space', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);

  if (e.code === 'KeyT' || e.code === 'Enter') {
    e.preventDefault();
    keys.clear();
    hud.openChat();
  } else if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
    hud.select(Number(e.code.slice(5)) - 1);
    saveSettings();
  } else if (e.code === 'KeyV') {
    if (myCar) carView = (carView + 1) % 3;
    else viewMode = (viewMode + 1) % 3;
    danceView = 0;
  } else if (e.code === 'KeyF' && !myCar) {
    player.flying = !player.flying;
    player.vel.y = 0;
  } else if (e.code === 'KeyR') {
    if (myCar) leaveCar(true);
    player.respawn();
  } else if (e.code === 'KeyX' && myCar) {
    leaveCar(true);
  } else if (e.code === 'KeyH' && myCar) {
    honk();
  } else if (e.code === 'KeyG') {
    if (myCar) {
      if (myCar.kind === 'police') myCar.siren = myCar.siren ? 0 : 1;
    } else {
      emote('dance');
    }
  } else if (e.code === 'KeyB' && !myCar) {
    emote('wave');
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  mouse.clear();
});

document.addEventListener('mousemove', e => {
  if (!locked) return;
  const sens = 0.0022 * settings.sensitivity;
  if (myCar) {
    carCam.yaw -= e.movementX * sens;
    carCam.pitch = Math.max(-1.2, Math.min(0.5, carCam.pitch - e.movementY * sens));
  } else {
    player.look(e.movementX, e.movementY, sens);
  }
});
canvas.addEventListener('mousedown', e => {
  if (!locked) return;
  if (myCar) {
    honk();
    return;
  }
  mouse.add(e.button);
  if (e.button === 1) {
    e.preventDefault();
    pickBlock();
  } else {
    useItem(e.button === 0);
    useCooldown = 0.28;
  }
});
window.addEventListener('mouseup', e => mouse.delete(e.button));
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('wheel', e => {
  if (locked && !hud.chatOpen && !myCar) hud.select(hud.selected + Math.sign(e.deltaY));
}, { passive: true });

// ---------- Emotes and fun ----------

function emote(kind) {
  myBody.emote(kind);
  net.send({ t: 'emote', kind });
  if (kind === 'dance') {
    sounds.tune();
    // Turn the camera around so you can see yourself dance.
    if (viewMode === 0) {
      viewMode = 2;
      danceView = 4;
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
  fireworks.launch(x, y, z, color, seed);
  sounds.launch(1);
  net.send({ t: 'fx', kind: 'firework', x, y, z, color, seed });
}

// ---------- Cars ----------

function requestEnter(car) {
  if (car.driver) {
    hud.addChat({ system: true, text: 'Someone is already driving that car!' });
    return;
  }
  net.send({ t: 'car_enter', id: car.id });
}

function enterCar(car) {
  if (!car) return;
  myCar = car;
  car.driver = myId;
  player.flying = false;
  carCam.yaw = 0;
  carCam.pitch = -0.15;
  danceView = 0;
  hud.setCarHelp(car.kind);
  sounds.engine(0);
  sounds.spawnCar();
}

// Gets out of the car. `tell` sends the news to the server.
function leaveCar(tell = false) {
  const car = myCar;
  if (!car) return;
  if (tell) {
    sendCarState();
    net.send({ t: 'car_exit', id: car.id });
  }
  myCar = null;
  car.driver = 0;
  car.speed = car.steer = car.siren = 0;
  const s = car.spec;
  // Step out of the driver's door, or onto the roof if that's blocked.
  const side = -(s.width / 2 + 0.6);
  player.pos.set(car.pos.x + side * Math.cos(car.h), car.pos.y, car.pos.z - side * Math.sin(car.h));
  if (player.overlapsSomething()) player.pos.set(car.pos.x, car.pos.y + s.height + 0.05, car.pos.z);
  player.vel.set(0, 0, 0);
  player.yaw = car.h;
  player.pitch = 0;
  hud.setCarHelp(null);
  sounds.engine(null);
}

function sendCarState() {
  if (!myCar) return;
  const r = v => Math.round(v * 100) / 100;
  net.send({ t: 'car_state', id: myCar.id, x: r(myCar.pos.x), y: r(myCar.pos.y), z: r(myCar.pos.z), h: r(myCar.h), speed: r(myCar.speed), steer: r(myCar.steer), siren: myCar.siren });
}

function spawnCar(kind) {
  if (!hit) return;
  let [x, y, z] = hit.value && isReplaceable(hit.value) ? hit.block : hit.place;
  const h = player.yaw;
  // Put the car a little in front of where you clicked, pointing the way you're looking.
  const cx = x + 0.5 - Math.sin(h) * 1.2, cz = z + 0.5 - Math.cos(h) * 1.2;
  const spec = CAR_SPECS[kind];
  if (cars.blocked(spec, cx, y, cz, h)) {
    hud.addChat({ system: true, text: 'Not enough room for a car there. Try an open road!' });
    return;
  }
  net.send({ t: 'car_spawn', kind, x: cx, y, z: cz, h });
}

// ---------- Building ----------

let hit = null;
let target = null; // { car } when looking at a car
const lookDir = new THREE.Vector3();
const eye = new THREE.Vector3();

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

function toggleDoor(x, y, z) {
  const parts = world.doorParts(x, y, z);
  if (!parts.length) return;
  const opening = !(blockMeta(parts[0][3]) & DOOR_OPEN);
  for (const [px, py, pz, v] of parts) world.set(px, py, pz, toggleDoorValue(v));
  if (player.overlapsSomething()) {
    // Don't close a door on yourself.
    for (const [px, py, pz, v] of parts) world.set(px, py, pz, v);
    return;
  }
  for (const [px, py, pz, v] of parts) net.send({ t: 'set', x: px, y: py, z: pz, b: toggleDoorValue(v) });
  sounds.door(opening);
}

function breakBlock() {
  if (!hit || hit.ground) return;
  const [x, y, z] = hit.block;
  const parts = shapeOf(hit.value) === 'door' ? world.doorParts(x, y, z) : [[x, y, z, hit.value]];
  for (const [px, py, pz, v] of parts) {
    if (setBlock(px, py, pz, 0)) particles.burst(px, py, pz, blockMaterial(materials, v));
  }
  sounds.break();
}

function placeBlock(item) {
  let [x, y, z] = hit.value && isReplaceable(hit.value) ? hit.block : hit.place;
  const existing = world.get(x, y, z);
  if (!inBounds(x, y, z) || (existing && !isReplaceable(existing))) return;
  const shape = BLOCKS[item].shape || 'cube';
  if (shape === 'door') {
    const above = world.get(x, y + 1, z);
    if (!inBounds(x, y + 1, z) || (above && !isReplaceable(above))) return;
    if (blockedByPlayer(x, y, z) || blockedByPlayer(x, y + 1, z)) return;
    const facing = doorFacingFromYaw(player.yaw);
    setBlock(x, y, z, makeBlock(DOOR, facing));
    setBlock(x, y + 1, z, makeBlock(DOOR, facing | DOOR_TOP));
  } else {
    if (shape === 'cube' && blockedByPlayer(x, y, z)) return;
    if (!setBlock(x, y, z, item)) return;
  }
  sounds.place();
}

function useItem(primary) {
  const item = hud.item;
  view.swing();
  myBody.swing = 0;
  if (target?.car) {
    // Left click always means "drive"; removing a car takes a right click with the hammer.
    if (item === HAMMER && !primary) {
      if (target.car.driver) hud.addChat({ system: true, text: "You can't remove a car while someone is driving it." });
      else {
        net.send({ t: 'car_remove', id: target.car.id });
        sounds.break();
      }
    } else {
      requestEnter(target.car);
    }
    return;
  }
  if (primary && item !== HAMMER && hit && shapeOf(hit.value) === 'door') {
    toggleDoor(...hit.block);
    return;
  }
  if (primary && item === FIREWORKS) {
    launchFirework();
    return;
  }
  if (!hit) {
    sounds.swing();
    return;
  }
  if (item === HAMMER || !primary) breakBlock();
  else if (isCarItem(item)) spawnCar(item);
  else placeBlock(item);
}

function pickBlock() {
  if (!hit?.id) return;
  const existing = settings.hotbar.indexOf(hit.id);
  if (existing >= 0) hud.select(existing);
  else hud.setSlot(hit.id);
  saveSettings();
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
  if (myCar) {
    const s = myCar.spec;
    if (carView === 0) {
      const seat = cars.seat(myCar);
      camera.position.copy(seat.position).y += EYE_HEIGHT * SEAT_SCALE;
      camera.rotation.set(carCam.pitch * 0.6, myCar.h + carCam.yaw, 0);
    } else {
      if (Math.abs(myCar.speed) > 2) carCam.yaw *= Math.exp(-1.5 * dt);
      const yaw = myCar.h + carCam.yaw + (carView === 2 ? Math.PI : 0);
      const dist = s.length + 3.5;
      const focus = myCar.pos.clone().add(new THREE.Vector3(0, s.height * 0.8, 0));
      const lift = s.height + 1.2 - carCam.pitch * 4;
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
  const targetFov = BASE_FOV + (player.sprinting && player.moving ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();
}

// ---------- Main loop ----------

const timer = new THREE.Timer();
timer.connect(document);
let sendTimer = 0, hudTimer = 0, fpsFrames = 0, fpsTime = 0, fps = 0;
let menuSpin = 0;

function frame(timestamp) {
  requestAnimationFrame(frame);
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const time = timer.getElapsed();
  const active = locked && !hud.chatOpen;
  const nightK = 1 - sky.dayK;

  if (inGame) {
    if (myCar) {
      for (const ev of cars.drive(myCar, dt, active ? keys : noKeys)) sounds[ev === 'bounce' ? 'bounce' : ev === 'land' ? 'land' : 'bump']();
      player.pos.copy(cars.seat(myCar).position);
      player.vel.set(0, 0, 0);
      sounds.engine(Math.min(1, Math.abs(myCar.speed) / myCar.spec.maxSpeed));
    } else {
      const wasOnGround = player.onGround;
      const vyBefore = player.vel.y;
      player.update(dt, active ? keys : noKeys);
      if (player.bounced) {
        player.bounced = false;
        sounds.bounce();
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

    // What are we looking at? Cars count if they're closer than the nearest block.
    hit = null;
    target = null;
    if (locked && !myCar) {
      hit = world.raycast(eye, lookDir, REACH);
      const carHit = cars.raycast(eye, lookDir, REACH);
      if (carHit && (!hit || carHit.distance < hit.distance)) {
        target = { car: carHit.car };
        hit = null;
      }
    }
    const item = hud.item;
    if (hit && !(hit.ground && item === HAMMER)) {
      highlight.visible = true;
      if (hit.ground) {
        highlight.position.set(hit.place[0] + 0.5, 0.003, hit.place[2] + 0.5);
        highlight.scale.set(1, 0.001, 1);
      } else {
        highlight.position.set(hit.block[0] + 0.5, hit.block[1] + 0.5, hit.block[2] + 0.5);
        highlight.scale.set(1, 1, 1);
      }
    } else {
      highlight.visible = false;
    }
    if (target?.car) hud.setHint(target.car.driver ? '🚗 Someone is driving this car' : `🚗 Click or press E to drive${item === HAMMER ? ' · Right-click to remove' : ''}`);
    else if (hit && shapeOf(hit.value) === 'door') hud.setHint(item === HAMMER ? '' : '🚪 Click to open / close');
    else hud.setHint('');

    // Holding the mouse button keeps building/breaking.
    useCooldown -= dt;
    if (locked && !myCar && useCooldown <= 0 && (mouse.has(0) || mouse.has(2))) {
      useItem(mouse.has(0));
      useCooldown = 0.2;
    }

    sendTimer -= dt;
    if (sendTimer <= 0) {
      sendTimer = 1 / 15;
      const r = v => Math.round(v * 100) / 100;
      const rot = myCar ? [r(myCar.h), 0] : [r(player.yaw), r(player.pitch)];
      net.send({ t: 'state', pos: [r(player.pos.x), r(player.pos.y), r(player.pos.z)], rot });
      sendCarState();
    }

    // Headlights on the car we're driving.
    if (myCar && nightK > 0.2) {
      const s = myCar.spec, f = new THREE.Vector3(-Math.sin(myCar.h), 0, -Math.cos(myCar.h));
      headlight.position.copy(myCar.pos).addScaledVector(f, s.length / 2).y += s.ride + s.bodyH * 0.6;
      headlight.target.position.copy(headlight.position).addScaledVector(f, 12).y -= 2;
      headlight.intensity = 120 * nightK;
    } else {
      headlight.intensity = 0;
    }

    // Our own body, seen in the third-person views.
    myBody.root.visible = myCar ? carView !== 0 : viewMode !== 0;
    myBody.seat = myCar ? cars.seat(myCar) : null;
    myBody.target.copy(player.pos);
    myBody.targetYaw = player.yaw;
    myBody.targetPitch = player.pitch;
    myBody.flying = player.flying;
    myBody.swing = view.swingT;
    myBody.update(dt, time);

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

  // Other players sit in the cars they drive.
  for (const a of avatars.list.values()) a.seat = null;
  for (const car of cars.list.values()) {
    if (car.driver && car.driver !== myId) {
      const a = avatars.list.get(car.driver);
      if (a) a.seat = cars.seat(car);
    }
  }

  // The loudest nearby siren.
  let siren = 0;
  for (const car of cars.list.values()) if (car.siren) siren = Math.max(siren, loudness(car.pos.x, car.pos.y, car.pos.z, 70));
  if (inGame) sounds.siren(siren);

  sky.update(dt, camera, world, materials);
  world.updateVisibility(camera.position, settings.quality === 'low' ? Math.min(140, scene.fog.far) : scene.fog.far);
  avatars.update(dt, time);
  cars.setView(camera.position, scene.fog.far);
  cars.update(dt, time, nightK, myCar?.id);
  particles.update(dt, world);
  for (const p of fireworks.update(dt)) sounds.boom(loudness(p.x, p.y, p.z, 140));
  const firstPerson = inGame && !myCar && viewMode === 0;
  view.update(dt, player.moving && player.onGround, camera.aspect, scene.environment, sky.dayK);

  renderer.clear();
  renderer.render(scene, camera);
  if (firstPerson) {
    renderer.clearDepth();
    renderer.render(view.scene, view.camera);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

load();

// Handy for poking at the game from the browser console.
window.buildzone = {
  scene, camera, sky, net, avatars, renderer, fireworks,
  get world() { return world; },
  get player() { return player; },
  get cars() { return cars; },
  get myCar() { return myCar; },
  get hud() { return hud; },
  useItem: primary => useItem(primary),
  setView: v => (viewMode = v),
};
