// Special things you can make by arranging blocks in a pattern (see the Build Book).
// Every player's game spots these patterns by itself, so no server work is needed.
import { blockId, blockKey } from './shared/blocks.js';

const B = { concrete: 13, log: 7, cobble: 4, lamp: 18, rainbow: 28, metal: 11, black: 17, water: 36, marble: 12, tiles: 20, bounce: 19, glass: 9 };
const PAINTS = new Set([14, 15, 16, 17, 29, 30, 31, 32, 33, 34]);
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// For the Build Book: what to build, a top-down picture (block ids, 0 = anything) and what it does.
export const RECIPES = [
  { type: 'bed', icon: '🛏️', name: 'Bed', grid: [[13, 14]], how: 'A Concrete pillow next to a Paint block (any color) with nothing on top.', use: 'Right-click to sleep. You\'ll wake up here when you press R. If everyone sleeps at night, it turns to morning!' },
  { type: 'trampoline', icon: '🤸', name: 'Trampoline', grid: [[19, 19, 19], [19, 19, 19], [19, 19, 19]], how: 'Nine Bounce Pads in a 3 by 3 square.', use: 'Super bounces! Hold Space when you land to bounce higher and higher.' },
  { type: 'campfire', icon: '🔥', name: 'Campfire', grid: [[0, 4, 0], [4, 7, 4], [0, 4, 0]], how: 'A Log with Cobblestone on all four sides.', use: 'A cozy crackling fire that lights up the night.' },
  { type: 'teleporter', icon: '🌀', name: 'Teleporter', grid: [[0, 28, 0], [28, 18, 28], [0, 28, 0]], how: 'A Lamp with Rainbow blocks on all four sides. Build two or more!', use: 'Stand on the Lamp to zoom to the next teleporter.' },
  { type: 'cannon', icon: '💥', name: 'Cannon', grid: [[17]], side: [[17], [11]], how: 'Black Paint on top of a Metal Plate.', use: 'Right-click it to blast yourself into the sky, in the direction you\'re looking!' },
  { type: 'fountain', icon: '⛲', name: 'Fountain', grid: [[0, 12, 0], [12, 36, 12], [0, 12, 0]], how: 'Water with Marble on all four sides.', use: 'Sprays water into the air.' },
  { type: 'tv', icon: '📺', name: 'TV', grid: [[17, 9, 9, 17], [0, 17, 17, 0]], side: [[17, 9, 9, 17], [0, 17, 17, 0]], how: 'Glass with Black Paint at both ends and Black Paint under every Glass block. The screen can be 1, 2 or 3 Glass wide.', use: 'Watch cartoons, news, weather and silly commercials! Right-click it to change the channel.' },
  { type: 'disco', icon: '🪩', name: 'Dance Floor', grid: [[20, 20, 20], [20, 18, 20], [20, 20, 20]], how: 'A Lamp in the middle of eight Floor Tiles.', use: 'Flashing party lights. Press G on it to start a dance party!' },
];

export class Structures {
  constructor(world) {
    this.world = world;
    this.list = new Map(); // "type:x,y,z" -> { type, x, y, z, ... }
  }

  id(x, y, z) {
    return blockId(this.world.get(x, y, z));
  }

  empty(x, y, z) {
    return !this.world.get(x, y, z);
  }

  // Is there a structure anchored at this cell? Returns it, or null.
  detect(x, y, z) {
    const id = this.id(x, y, z);
    const sides = v => SIDES.every(([dx, dz]) => this.id(x + dx, y, z + dz) === v);
    switch (id) {
      case B.concrete:
        for (const [dx, dz] of SIDES) {
          if (PAINTS.has(this.id(x + dx, y, z + dz)) && this.empty(x, y + 1, z) && this.empty(x + dx, y + 1, z + dz)) {
            return { type: 'bed', x, y, z, dx, dz };
          }
        }
        return null;
      case B.bounce: {
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (this.id(x + i, y, z + j) !== B.bounce) return null;
        return { type: 'trampoline', x, y, z };
      }
      case B.log:
        return sides(B.cobble) && this.empty(x, y + 1, z) ? { type: 'campfire', x, y, z } : null;
      case B.lamp:
        if (sides(B.rainbow) && this.empty(x, y + 1, z) && this.empty(x, y + 2, z)) return { type: 'teleporter', x, y, z };
        if (AROUND.every(([dx, dz]) => this.id(x + dx, y, z + dz) === B.tiles)) return { type: 'disco', x, y, z };
        return null;
      case B.metal:
        return this.id(x, y + 1, z) === B.black ? { type: 'cannon', x, y, z } : null;
      case B.water:
        return sides(B.marble) ? { type: 'fountain', x, y, z } : null;
      case B.glass:
        return this.detectTV(x, y, z);
    }
    return null;
  }

  // A TV: a row of 1-3 Glass with Black Paint at each end and under each Glass.
  // It's anchored at the first Glass in the row.
  detectTV(x, y, z) {
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      if (this.id(x - ax, y, z - az) !== B.black) continue;
      let w = 0;
      while (w < 3 && this.id(x + ax * w, y, z + az * w) === B.glass && this.id(x + ax * w, y - 1, z + az * w) === B.black) w++;
      if (w > 0 && this.id(x + ax * w, y, z + az * w) === B.black) return { type: 'tv', x, y, z, ax, az, width: w };
    }
    return null;
  }

  recheck(x, y, z) {
    for (const type of ['bed', 'trampoline', 'campfire', 'teleporter', 'disco', 'cannon', 'fountain', 'tv']) this.list.delete(`${type}:${blockKey(x, y, z)}`);
    const s = this.detect(x, y, z);
    if (s) this.list.set(`${s.type}:${blockKey(x, y, z)}`, s);
  }

  // A block changed: look again at everything it could be part of.
  changed(x, y, z) {
    // Wide enough to reach the anchor of a 3-wide TV from its far end.
    for (let dx = -4; dx <= 4; dx++)
      for (let dy = -2; dy <= 1; dy++)
        for (let dz = -4; dz <= 4; dz++) this.recheck(x + dx, y + dy, z + dz);
    this.version = (this.version || 0) + 1;
  }

  scan() {
    this.version = (this.version || 0) + 1;
    this.list.clear();
    const anchors = new Set([B.concrete, B.bounce, B.log, B.lamp, B.metal, B.water, B.glass]);
    for (const [k, v] of this.world.blocks) {
      if (!anchors.has(blockId(v))) continue;
      const [x, y, z] = k.split(',').map(Number);
      this.recheck(x, y, z);
    }
  }

  ofType(type) {
    return [...this.list.values()].filter(s => s.type === type);
  }

  // The structure that includes this block (for right-clicking beds and cannons).
  at(x, y, z) {
    for (const s of this.list.values()) {
      if (s.type === 'bed' && ((s.x === x && s.y === y && s.z === z) || (s.x + s.dx === x && s.y === y && s.z + s.dz === z))) return s;
      if (s.type === 'cannon' && s.x === x && s.z === z && (y === s.y || y === s.y + 1)) return s;
      if (s.type === 'tv' && y >= s.y - 1 && y <= s.y) {
        // Any block of the TV (screen, frame or stand) counts.
        for (let i = -1; i <= s.width; i++) if (x === s.x + s.ax * i && z === s.z + s.az * i) return s;
      }
    }
    return null;
  }

  // Is (x, y, z) a bounce pad that belongs to a trampoline?
  trampolineAt(x, y, z) {
    for (const s of this.list.values()) {
      if (s.type === 'trampoline' && s.y === y && x >= s.x && x <= s.x + 2 && z >= s.z && z <= s.z + 2) return s;
    }
    return null;
  }

  // The teleporter after this one (in a fixed order, so everyone agrees).
  nextTeleporter(from) {
    const all = this.ofType('teleporter').sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
    if (all.length < 2) return null;
    const i = all.findIndex(t => t.x === from.x && t.y === from.y && t.z === from.z);
    return all[(i + 1) % all.length];
  }

  near(pos, range) {
    const out = [];
    for (const s of this.list.values()) {
      const dx = s.x + 0.5 - pos.x, dz = s.z + 0.5 - pos.z;
      if (dx * dx + dz * dz < range * range) out.push(s);
    }
    return out;
  }
}
