// The character gallery: up to 25 saved characters (name + look) that anyone can pick.
// The server keeps one for everybody; single player keeps one in the browser.
import { sanitizeLook, cleanName } from './avatar.js';

export const MAX_CHARACTERS = 25;

export class CharacterStore {
  constructor(list = [], onChange = () => {}) {
    this.onChange = onChange;
    this.characters = [];
    this.nextId = 1;
    for (const c of Array.isArray(list) ? list.slice(0, MAX_CHARACTERS) : []) {
      if (!c || typeof c !== 'object') continue;
      this.characters.push({ id: this.nextId++, name: cleanName(c.name), look: sanitizeLook(c.look), savedAt: Number(c.savedAt) || 0 });
    }
  }

  list() {
    return this.characters;
  }

  oldest() {
    return this.characters.reduce((a, b) => (b.savedAt < a.savedAt ? b : a), this.characters[0]);
  }

  // Saves a character. If one with the same name exists, it's updated.
  // When the gallery is full you must say which one to replace (replaceId),
  // or ask to replace the oldest (replaceOldest). Otherwise this returns { error: 'full' }.
  save({ name, look, replaceId, replaceOldest } = {}) {
    const entry = { name: cleanName(name), look: sanitizeLook(look), savedAt: Date.now() };
    let slot = this.characters.findIndex(c => c.id === replaceId);
    if (slot < 0) slot = this.characters.findIndex(c => c.name.toLowerCase() === entry.name.toLowerCase());
    if (slot < 0 && this.characters.length >= MAX_CHARACTERS) {
      if (!replaceOldest) return { error: 'full' };
      slot = this.characters.indexOf(this.oldest());
    }
    const saved = { id: this.nextId++, ...entry };
    const replaced = slot >= 0 ? this.characters[slot] : null;
    // Replacing keeps the same spot in the grid; new characters go at the end.
    if (slot >= 0) this.characters[slot] = saved;
    else this.characters.push(saved);
    this.onChange();
    return { saved, replaced: replaced && replaced.name };
  }

  serialize() {
    return this.characters.map(({ name, look, savedAt }) => ({ name, look, savedAt }));
  }
}
