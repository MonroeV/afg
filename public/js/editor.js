// The "Customize your character" screen with a spinning 3D preview.
import * as THREE from 'three';
import { LOOK_OPTIONS, OPTION_LABELS, SKIN_TONES, PALETTE, HAIR_COLORS, sanitizeLook, randomLook } from './shared/avatar.js';
import { buildCharacter, animateCharacter } from './character.js';

const EMOJI = {
  smile: '😊', grin: '😁', cool: '😎', wink: '😉', surprised: '😮', silly: '😜', sleepy: '😴', cat: '🐱', robot: '🤖', starry: '🤩',
  none: '❌', short: '✂️', spiky: '⚡', long: '💇', ponytail: '🎀', mohawk: '🦔', afro: '☁️', buns: '🍡',
  cap: '🧢', beanie: '🧶', tophat: '🎩', crown: '👑', cowboy: '🤠', party: '🥳', wizard: '🧙', viking: '⚔️',
  tshirt: '👕', striped: '🦓', hoodie: '🧥', jacket: '🥼', tank: '🎽', jersey: '🏀', dress: '👗',
  jeans: '👖', shorts: '🩳', skirt: '💃', sweatpants: '🏃',
  backpack: '🎒', cape: '🦸', wings: '🧚',
};

const TABS = [
  { name: 'Face', icon: '😊', option: 'face', colors: [['skin', 'Skin', SKIN_TONES], ['eyes', 'Eyes', ['#3b2314', '#1e88e5', '#2e7d32', '#111111', '#8e24aa', '#e53935', '#26c6da', '#ffb300']]] },
  { name: 'Hair', icon: '💇', option: 'hair', colors: [['hairColor', 'Hair color', HAIR_COLORS]] },
  { name: 'Hat', icon: '🎩', option: 'hat', colors: [['hatColor', 'Hat color', PALETTE]] },
  { name: 'Shirt', icon: '👕', option: 'shirt', colors: [['shirtColor', 'Shirt color', PALETTE], ['shirtColor2', 'Second color', PALETTE]] },
  { name: 'Pants', icon: '👖', option: 'pants', colors: [['pantsColor', 'Pants color', PALETTE], ['shoesColor', 'Shoes', PALETTE]] },
  { name: 'Extras', icon: '🎒', option: 'extra', colors: [['extraColor', 'Extra color', PALETTE]] },
];

export class Editor {
  constructor() {
    this.el = document.getElementById('editor');
    this.canvas = document.getElementById('preview');
    this.tab = 0;
    this.look = null;
    this.open = false;
    this.spin = 0.4;
    this.dragging = false;

    document.getElementById('editor-tabs').append(...TABS.map((t, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = `${t.icon} ${t.name}`;
      b.addEventListener('click', () => {
        this.tab = i;
        this.renderOptions();
      });
      return b;
    }));
    document.getElementById('randomize').addEventListener('click', () => {
      this.setLook(randomLook());
      this.dance = 2;
    });
    document.getElementById('editor-done').addEventListener('click', () => this.close());

    this.canvas.addEventListener('pointerdown', e => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      this.spin += (e.clientX - this.lastX) * 0.01;
      this.lastX = e.clientX;
    });
    this.canvas.addEventListener('pointerup', () => (this.dragging = false));
  }

  initRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 1.25, 6.4);
    this.camera.lookAt(0, 1.05, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    this.scene.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
  }

  // Shows the editor. Resolves with the final look when the player presses Done.
  show(look, onChange) {
    this.initRenderer();
    this.onChange = onChange;
    this.setLook(look);
    this.renderOptions();
    this.el.classList.remove('hidden');
    this.open = true;
    this.dance = 2;
    const clock = new THREE.Timer();
    const loop = t => {
      if (!this.open) return;
      requestAnimationFrame(loop);
      clock.update(t);
      this.draw(Math.min(clock.getDelta(), 0.05), clock.getElapsed());
    };
    requestAnimationFrame(loop);
    return new Promise(resolve => (this.resolve = resolve));
  }

  close() {
    this.open = false;
    this.el.classList.add('hidden');
    this.resolve?.(this.look);
  }

  setLook(look) {
    this.look = sanitizeLook(look);
    if (this.character) {
      this.holder.remove(this.character.group);
      this.character.dispose();
    }
    this.character = buildCharacter(this.look);
    this.holder.add(this.character.group);
    this.renderOptions();
    this.onChange?.(this.look);
  }

  draw(dt, time) {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (!this.dragging) this.spin += dt * 0.5;
    this.dance = Math.max(0, (this.dance || 0) - dt);
    this.holder.rotation.y = this.spin;
    animateCharacter(this.character, { time, dance: this.dance, walk: 0, speed: 0, pitch: Math.sin(time) * 0.1 });
    this.renderer.render(this.scene, this.camera);
  }

  renderOptions() {
    if (!this.look) return;
    const tab = TABS[this.tab];
    [...document.getElementById('editor-tabs').children].forEach((b, i) => b.classList.toggle('active', i === this.tab));
    const body = document.getElementById('editor-body');
    body.textContent = '';

    const grid = document.createElement('div');
    grid.className = 'option-grid';
    for (const opt of LOOK_OPTIONS[tab.option]) {
      const b = document.createElement('button');
      b.className = 'option' + (this.look[tab.option] === opt ? ' selected' : '');
      const icon = document.createElement('span');
      icon.className = 'emoji';
      icon.textContent = EMOJI[opt] || '•';
      b.append(icon, document.createTextNode(OPTION_LABELS[opt] || opt));
      b.addEventListener('click', () => this.setLook({ ...this.look, [tab.option]: opt }));
      grid.append(b);
    }
    body.append(grid);

    for (const [key, label, colors] of tab.colors) {
      const row = document.createElement('div');
      row.className = 'color-row';
      const title = document.createElement('div');
      title.className = 'color-title';
      title.textContent = label;
      const swatches = document.createElement('div');
      swatches.className = 'swatches';
      for (const c of colors) {
        const s = document.createElement('button');
        s.className = 'swatch' + (this.look[key] === c.toLowerCase() ? ' selected' : '');
        s.style.background = c;
        s.title = c;
        s.addEventListener('click', () => this.setLook({ ...this.look, [key]: c }));
        swatches.append(s);
      }
      const custom = document.createElement('input');
      custom.type = 'color';
      custom.value = this.look[key];
      custom.title = 'Pick any color';
      custom.addEventListener('change', () => this.setLook({ ...this.look, [key]: custom.value }));
      swatches.append(custom);
      row.append(title, swatches);
      body.append(row);
    }
  }
}
