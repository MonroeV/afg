// BuildZone: game setup, input, UI and the main loop.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { BLOCKS, WORLD, inBounds } from './shared/blocks.js';
import { generateWorld } from './shared/worldgen.js';
import { generateTextures } from './textures.js';
import { World, createBlockMaterials } from './world.js';
import { Player } from './player.js';
import { Network } from './network.js';
import { Avatars } from './avatars.js';
import { HAMMER, ALL_ITEMS, DEFAULT_HOTBAR, itemName, makeIcon, ViewModel } from './items.js';
import { Particles, Sounds } from './effects.js';

const $ = id => document.getElementById(id);
const REACH = 7;
const BASE_FOV = 80;

// ---------- Saved settings ----------

const settings = { name: '', color: '#3fa7ff', sensitivity: 1, quality: 'high', hotbar: DEFAULT_HOTBAR.slice() };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('buildzone') || '{}'));
  if (!Array.isArray(settings.hotbar) || settings.hotbar.length !== 9 || !settings.hotbar.every(i => ALL_ITEMS.includes(i))) {
    settings.hotbar = DEFAULT_HOTBAR.slice();
  }
} catch { /* storage unavailable */ }
function saveSettings() {
  try {
    localStorage.setItem('buildzone', JSON.stringify(settings));
  } catch { /* storage unavailable */ }
}

// ---------- Renderer, scene, sky and lighting ----------

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc4d6e6, 60, 230);
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.rotation.order = 'YXZ';

const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(140));
function makeSky() {
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  return sky;
}
const sky = makeSky();
scene.add(sky);

// Reflections/ambient light come from a blurred copy of the sky.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = makeSky();
envSky.material.uniforms.cloudCoverage.value = 0;
envScene.add(envSky);
scene.environment = pmrem.fromScene(envScene, 0.04).texture;
scene.environmentIntensity = 0.3;

scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x5d4c36, 0.55));
const sun = new THREE.DirectionalLight(0xfff0dc, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SHADOW_SIZE = 45;
Object.assign(sun.shadow.camera, { left: -SHADOW_SIZE, right: SHADOW_SIZE, top: SHADOW_SIZE, bottom: -SHADOW_SIZE, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const QUALITY = {
  high: { pixelRatio: 2, shadowMap: 2048 },
  medium: { pixelRatio: 1, shadowMap: 1024 },
  low: { pixelRatio: 0.75, shadowMap: 0 },
};
function applyQuality() {
  const q = QUALITY[settings.quality] || QUALITY.high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  sun.castShadow = q.shadowMap > 0;
  if (q.shadowMap && sun.shadow.mapSize.x !== q.shadowMap) {
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
}
applyQuality();

// Block highlight under the crosshair.
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.65 }),
);
highlight.visible = false;
scene.add(highlight);

const view = new ViewModel(null);
const particles = new Particles(scene);
const sounds = new Sounds();

// ---------- Loading ----------

let world, player, materials, textures, icons;
const net = new Network();
const avatars = new Avatars(scene);
let myId = null;
let online = false;

function buildGround() {
  const groundTex = textures.grass_top;
  const repeat = 600;
  const map = groundTex.map.clone();
  const normalMap = groundTex.normalMap.clone();
  for (const t of [map, normalMap]) {
    t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
  }
  const geo = new THREE.PlaneGeometry(repeat, repeat, 120, 120).rotateX(-Math.PI / 2);
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

  // A soft force-field marks the edge of the buildable area.
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
  buildGround();
  world.load(generateWorld()); // something to look at behind the menu
  buildHotbar();
  buildInventory();

  $('name').value = settings.name;
  $('color').value = settings.color;
  $('sensitivity').value = settings.sensitivity;
  $('quality').value = settings.quality;
  $('loading').classList.add('hidden');
  $('join-form').classList.remove('hidden');
  $('name').focus();
  requestAnimationFrame(frame);
}

// ---------- Joining ----------

let inGame = false;

$('join-form').addEventListener('submit', async e => {
  e.preventDefault();
  settings.name = $('name').value.trim() || 'Builder';
  settings.color = $('color').value;
  saveSettings();
  $('play').disabled = true;
  $('status').textContent = 'Connecting…';
  sounds.ensure();

  try {
    const welcome = await net.connect(settings.name, settings.color);
    online = true;
    myId = welcome.id;
    world.load(welcome.world);
    for (const p of welcome.players) avatars.add(p);
    addChat({ system: true, text: `Welcome, ${settings.name}! ${welcome.players.length} other builder(s) online.` });
  } catch (err) {
    online = false;
    world.load(generateWorld());
    addChat({ system: true, text: 'No server found, so you are playing offline. Run "npm start" to play with friends.' });
  }

  inGame = true;
  player.respawn();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  lock();
});

net.on('set', ({ x, y, z, b }) => {
  const old = world.get(x, y, z);
  if (world.set(x, y, z, b) && !b && old) particles.burst(x, y, z, materials[old], 6);
});
net.on('states', ({ list }) => avatars.applyStates(list, myId));
net.on('join', info => avatars.add(info));
net.on('leave', ({ id }) => avatars.remove(id));
net.on('chat', msg => addChat(msg));
net.on('disconnect', () => {
  online = false;
  avatars.clear();
  $('banner').textContent = 'Disconnected from the server. Refresh the page to reconnect.';
  $('banner').classList.remove('hidden');
});

// ---------- Pointer lock and overlays ----------

let locked = false;
let inventoryOpen = false;
let chatOpen = false;

function lock() {
  const req = canvas.requestPointerLock?.();
  if (req?.catch) req.catch(() => updateOverlays());
}

function updateOverlays() {
  $('pause').classList.toggle('hidden', !inGame || locked || inventoryOpen || chatOpen);
  $('inventory').classList.toggle('hidden', !inventoryOpen);
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) {
    keys.clear();
    mouse.clear();
    if (chatOpen) closeChat();
  }
  updateOverlays();
});
document.addEventListener('pointerlockerror', updateOverlays);

$('resume').addEventListener('click', lock);
canvas.addEventListener('click', () => inGame && !locked && !inventoryOpen && lock());
$('quality').addEventListener('change', e => {
  settings.quality = e.target.value;
  saveSettings();
  applyQuality();
});
$('sensitivity').addEventListener('input', e => {
  settings.sensitivity = Number(e.target.value);
  saveSettings();
});

// ---------- Hotbar and inventory ----------

let selected = 0;
let itemNameTimer = 0;

function buildHotbar() {
  const bar = $('hotbar');
  bar.innerHTML = '';
  settings.hotbar.forEach((item, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === selected ? ' active' : '');
    const icon = document.createElement('canvas');
    icon.width = icon.height = 64;
    icon.getContext('2d').drawImage(icons[item], 0, 0);
    const num = document.createElement('span');
    num.textContent = i + 1;
    slot.append(icon, num);
    bar.append(slot);
  });
  view.setItem(settings.hotbar[selected]);
}

function select(i) {
  selected = (i + 9) % 9;
  [...$('hotbar').children].forEach((s, j) => s.classList.toggle('active', j === selected));
  view.setItem(settings.hotbar[selected]);
  $('item-name').textContent = itemName(settings.hotbar[selected]);
  $('item-name').style.opacity = 1;
  itemNameTimer = 1.5;
}

function buildInventory() {
  const grid = $('inventory-grid');
  for (const item of ALL_ITEMS) {
    const el = document.createElement('div');
    el.className = 'inv-item';
    const icon = document.createElement('canvas');
    icon.width = icon.height = 64;
    icon.getContext('2d').drawImage(icons[item], 0, 0);
    const label = document.createElement('div');
    label.textContent = itemName(item);
    el.append(icon, label);
    el.addEventListener('click', () => {
      setSlot(item);
      sounds.click();
    });
    grid.append(el);
  }
}

function setSlot(item) {
  settings.hotbar[selected] = item;
  saveSettings();
  buildHotbar();
  select(selected);
}

function toggleInventory(open) {
  inventoryOpen = open;
  if (open) document.exitPointerLock();
  else lock();
  updateOverlays();
}
$('inventory-done').addEventListener('click', () => toggleInventory(false));

// ---------- Chat ----------

function addChat(msg) {
  const line = document.createElement('div');
  line.className = 'chat-line' + (msg.system ? ' system' : '');
  if (msg.name) {
    const who = document.createElement('b');
    who.textContent = msg.name + ': ';
    who.style.color = msg.color || '#fff';
    line.append(who);
  }
  line.append(document.createTextNode(msg.text));
  const log = $('chat-log');
  log.append(line);
  while (log.children.length > 40) log.firstChild.remove();
  setTimeout(() => line.classList.add('faded'), 9000);
}

function openChat() {
  chatOpen = true;
  keys.clear();
  $('chat').classList.add('open');
  $('chat-input').focus();
}

function closeChat() {
  chatOpen = false;
  $('chat').classList.remove('open');
  $('chat-input').value = '';
  $('chat-input').blur();
  updateOverlays();
}

$('chat-input').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = e.target.value.trim();
    if (text) {
      if (online) net.send({ t: 'chat', text });
      else addChat({ name: settings.name, color: settings.color, text });
    }
    closeChat();
  } else if (e.key === 'Escape') {
    closeChat();
  }
});

// ---------- Input ----------

const keys = new Set();
const mouse = new Set();
let useCooldown = 0;

window.addEventListener('keydown', e => {
  if (!inGame || chatOpen) return;
  if (e.code === 'KeyE') {
    toggleInventory(!inventoryOpen);
    return;
  }
  if (!locked) return;
  if (['Space', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);

  if (e.code === 'KeyT' || e.code === 'Enter') {
    e.preventDefault();
    openChat();
  } else if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
    select(Number(e.code.slice(5)) - 1);
  } else if (e.code === 'KeyF') {
    player.flying = !player.flying;
    player.vel.y = 0;
  } else if (e.code === 'KeyR') {
    player.respawn();
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  mouse.clear();
});

document.addEventListener('mousemove', e => {
  if (locked) player.look(e.movementX, e.movementY, 0.0022 * settings.sensitivity);
});
canvas.addEventListener('mousedown', e => {
  if (!locked) return;
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
  if (locked && !chatOpen) select(selected + Math.sign(e.deltaY));
}, { passive: true });

// ---------- Building ----------

let hit = null;
const eye = new THREE.Vector3();
const lookDir = new THREE.Vector3();

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

function useItem(primary) {
  const item = settings.hotbar[selected];
  view.swing();
  if (!hit) {
    sounds.swing();
    return;
  }
  if (item === HAMMER || !primary) {
    if (hit.ground) return;
    const [x, y, z] = hit.block;
    const old = world.get(x, y, z);
    if (setBlock(x, y, z, 0)) {
      particles.burst(x, y, z, materials[old]);
      sounds.break();
    }
  } else {
    const [x, y, z] = hit.place;
    if (!inBounds(x, y, z) || world.get(x, y, z) || blockedByPlayer(x, y, z)) return;
    if (setBlock(x, y, z, item)) sounds.place();
  }
}

function pickBlock() {
  if (!hit?.id) return;
  const existing = settings.hotbar.indexOf(hit.id);
  if (existing >= 0) select(existing);
  else setSlot(hit.id);
}

// ---------- HUD text ----------

let fps = 0, fpsFrames = 0, fpsTime = 0;

function updateHud(dt) {
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = fpsTime = 0;
    const p = player.pos;
    $('info').innerHTML =
      `${online ? '<span style="color:#7dff8a">● Online</span>' : '<span style="color:#ffb3b3">● Offline</span>'} · ${fps} FPS<br>` +
      `XYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}${player.flying ? ' · <b>FLYING</b>' : ''}`;

    const list = $('players');
    list.textContent = '';
    const head = document.createElement('div');
    head.textContent = `${avatars.list.size + 1} builder${avatars.list.size ? 's' : ''}`;
    list.append(head);
    for (const { name, color } of [{ name: settings.name + ' (you)', color: settings.color }, ...avatars.list.values()]) {
      const row = document.createElement('div');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = color;
      row.append(document.createTextNode(name), dot);
      list.append(row);
    }
  }
  if (itemNameTimer > 0) {
    itemNameTimer -= dt;
    if (itemNameTimer <= 0) $('item-name').style.opacity = 0;
  }
}

// ---------- Main loop ----------

const timer = new THREE.Timer();
timer.connect(document);
let sendTimer = 0;
let menuSpin = 0;

function frame(timestamp) {
  requestAnimationFrame(frame);
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const time = timer.getElapsed();

  if (inGame) {
    const wasOnGround = player.onGround;
    const vyBefore = player.vel.y;
    player.update(dt, locked && !chatOpen ? keys : new Set());
    if (player.bounced) {
      player.bounced = false;
      sounds.bounce();
    } else if (!wasOnGround && player.onGround && vyBefore < -8) {
      sounds.land();
    } else if (wasOnGround && !player.onGround && player.vel.y > 0) {
      sounds.jump();
    }

    player.eye(camera.position);
    camera.rotation.set(player.pitch, player.yaw, 0);
    const targetFov = BASE_FOV + (player.sprinting && player.moving ? 6 : 0);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
    camera.updateProjectionMatrix();

    // What are we looking at?
    camera.getWorldDirection(lookDir);
    hit = locked ? world.raycast(camera.position, lookDir, REACH) : null;
    if (hit && !(hit.ground && settings.hotbar[selected] === HAMMER)) {
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

    // Holding the mouse button keeps building/breaking.
    useCooldown -= dt;
    if (locked && useCooldown <= 0 && (mouse.has(0) || mouse.has(2))) {
      useItem(mouse.has(0));
      useCooldown = 0.2;
    }

    sendTimer -= dt;
    if (online && sendTimer <= 0) {
      sendTimer = 1 / 15;
      const r = v => Math.round(v * 100) / 100;
      net.send({ t: 'state', pos: [r(player.pos.x), r(player.pos.y), r(player.pos.z)], rot: [r(player.yaw), r(player.pitch)] });
    }
    updateHud(dt);
  } else {
    // Slow orbit behind the main menu.
    menuSpin += dt * 0.05;
    camera.position.set(Math.sin(menuSpin) * 30, 14, Math.cos(menuSpin) * 30);
    camera.lookAt(0, 2, 0);
  }

  // Keep the shadow area centred on the camera (snapped to whole units to avoid shimmering).
  const cx = Math.round(camera.position.x), cz = Math.round(camera.position.z);
  sun.target.position.set(cx, 0, cz);
  sun.position.set(cx, 0, cz).addScaledVector(sunDir, 120);

  sky.material.uniforms.time.value = time;
  avatars.update(dt);
  particles.update(dt, world);
  view.update(dt, inGame && player.moving && player.onGround, camera.aspect, scene.environment);

  renderer.clear();
  renderer.render(scene, camera);
  if (inGame) {
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
window.buildzone = { scene, camera, get world() { return world; }, get player() { return player; }, avatars, net };
