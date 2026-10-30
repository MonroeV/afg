// The Character Gallery: a 5x5 grid of saved characters that anyone can pick.
import * as THREE from 'three';
import { CharacterStore, MAX_CHARACTERS } from './shared/characters.js';
import { cleanName } from './shared/avatar.js';
import { buildCharacter, animateCharacter, buildPet, animatePet } from './character.js';

const $ = id => document.getElementById(id);
const LOCAL_KEY = 'buildzone-characters';

// Talks to the server's gallery, or keeps one in this browser when playing single player.
export class CharacterClient {
  constructor() {
    this.remote = null; // true = server, false = this browser
  }

  localStore() {
    if (!this.local) {
      let list = [];
      try {
        list = JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
      } catch { /* nothing saved yet */ }
      this.local = new CharacterStore(list, () => {
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify(this.local.serialize()));
        } catch { /* storage full or unavailable */ }
      });
    }
    return this.local;
  }

  async list() {
    if (this.remote !== false) {
      try {
        const res = await fetch('/api/characters', { cache: 'no-store' });
        if (res.ok && res.headers.get('content-type')?.includes('json')) {
          this.remote = true;
          return (await res.json()).characters;
        }
      } catch { /* no server */ }
      this.remote = false;
    }
    return this.localStore().list();
  }

  async save(data) {
    if (this.remote) {
      try {
        const res = await fetch('/api/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        return await res.json();
      } catch {
        return { error: 'offline' };
      }
    }
    return { ...this.localStore().save(data), characters: this.local.list() };
  }
}

// Draws little portraits of characters (with their pets) for the grid.
class Thumbnails {
  constructor() {
    this.cache = new Map();
  }

  init() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(192, 192);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(2, 4, 4);
    this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    this.camera.position.set(0.25, 1.1, 5.4);
    this.camera.lookAt(0.25, 0.9, 0);
  }

  get(look) {
    const key = JSON.stringify(look);
    if (this.cache.has(key)) return this.cache.get(key);
    this.init();
    const ch = buildCharacter(look);
    ch.group.rotation.y = Math.PI + 0.35; // turn the face toward the camera
    animateCharacter(ch, { time: 0, pitch: 0 });
    this.scene.add(ch.group);
    let pet = null;
    if (ch.look.pet !== 'none') {
      pet = buildPet(ch.look.pet, ch.look.petColor);
      pet.group.position.set(0.8, 0, 0.4);
      pet.group.rotation.y = Math.PI - 0.6;
      animatePet(pet, 0, 0.3);
      this.scene.add(pet.group);
    }
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL();
    this.scene.remove(ch.group);
    ch.dispose();
    if (pet) {
      this.scene.remove(pet.group);
      pet.dispose();
    }
    this.cache.set(key, url);
    return url;
  }
}

function timeAgo(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

export class Gallery {
  constructor(client, sounds) {
    this.client = client;
    this.sounds = sounds;
    this.thumbs = new Thumbnails();
    this.characters = [];
    this.replacing = false;
    this.open = false;
    $('gallery-save').addEventListener('click', () => this.save());
    $('gallery-oldest').addEventListener('click', () => this.save({ replaceOldest: true }));
    $('gallery-cancel').addEventListener('click', () => this.setReplacing(false));
    $('gallery-close').addEventListener('click', () => this.close(null));
    $('gallery-name').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') this.save();
    });
    window.addEventListener('keydown', e => {
      if (this.open && e.key === 'Escape') this.close(null);
    });
  }

  // Opens the gallery. `onSaved(name)` is called after saving.
  // Resolves with the picked character, or null if the player just closed it.
  async show({ name, look, onSaved }) {
    this.look = look;
    this.onSaved = onSaved;
    this.open = true;
    this.setReplacing(false);
    $('gallery-name').value = name;
    $('gallery-status').textContent = 'Loading…';
    $('gallery').classList.remove('hidden');
    this.characters = await this.client.list();
    $('gallery-status').textContent = this.client.remote ? '' : 'Single player: characters are saved in this browser.';
    this.render();
    return new Promise(resolve => (this.resolve = resolve));
  }

  close(picked) {
    if (!this.open) return;
    this.open = false;
    $('gallery').classList.add('hidden');
    this.resolve?.(picked);
  }

  setReplacing(on) {
    this.replacing = on;
    $('gallery-full').classList.toggle('hidden', !on);
    $('gallery-grid').classList.toggle('replacing', on);
    if (this.characters.length) this.render();
  }

  async save(extra = {}) {
    const name = cleanName($('gallery-name').value);
    $('gallery-name').value = name;
    $('gallery-status').textContent = 'Saving…';
    const result = await this.client.save({ name, look: this.look, ...extra });
    if (result.characters) this.characters = result.characters;
    if (result.error === 'full') {
      $('gallery-status').textContent = '';
      this.setReplacing(true);
      return;
    }
    if (result.error) {
      $('gallery-status').textContent = result.error === 'slow down' ? 'Too many saves! Try again in a few minutes.' : "Couldn't save right now. Try again!";
      return;
    }
    this.sounds?.spawnCar();
    $('gallery-status').textContent = result.replaced && result.replaced.toLowerCase() !== name.toLowerCase()
      ? `Saved "${name}" in place of "${result.replaced}". Everyone can pick it now!`
      : `Saved "${name}"! Everyone can pick it now.`;
    this.setReplacing(false);
    this.onSaved?.(name);
  }

  render() {
    const grid = $('gallery-grid');
    grid.textContent = '';
    const oldest = this.characters.reduce((a, b) => (!a || b.savedAt < a.savedAt ? b : a), null);
    const me = cleanName($('gallery-name').value).toLowerCase();
    const pending = [];
    for (let i = 0; i < MAX_CHARACTERS; i++) {
      const c = this.characters[i];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'char-card';
      if (!c) {
        card.classList.add('empty');
        card.disabled = true;
        card.textContent = 'Empty spot';
        grid.append(card);
        continue;
      }
      const img = document.createElement('img');
      img.alt = ''; // the name is shown under the picture
      pending.push([img, c.look]);
      const label = document.createElement('div');
      label.className = 'char-name';
      label.textContent = c.name;
      const when = document.createElement('div');
      when.className = 'char-when';
      when.textContent = timeAgo(c.savedAt);
      card.append(img, label, when);
      if (c.name.toLowerCase() === me) card.classList.add('mine');
      if (this.replacing && c === oldest) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Oldest';
        card.append(badge);
      }
      card.title = this.replacing ? `Replace ${c.name} with your character` : `Play as ${c.name}`;
      card.addEventListener('click', () => {
        if (this.replacing) this.save({ replaceId: c.id });
        else {
          this.sounds?.click();
          this.close(c);
        }
      });
      grid.append(card);
    }
    // Draw the portraits one per frame so the grid shows up right away.
    const next = () => {
      const job = pending.shift();
      if (!job || !this.open) return;
      job[0].src = this.thumbs.get(job[1]);
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }
}
