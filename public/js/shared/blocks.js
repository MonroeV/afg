// Block definitions shared by the server and the browser.
// IDs are saved in the world file, so never reorder or reuse them.
//
// A stored block value is `id + meta * 256 + paint * 4096`:
//   id     (8 bits)  which block it is
//   meta   (4 bits)  doors: which way they face, open, top half; ladders: which way they face;
//                    railings and flat blocks: which edges of the cell have a railing
//   paint  (4 bits)  0 = original colors, 1-15 = painted (see PAINT_COLORS)
// Old saves have paint 0 everywhere, so they load unchanged.
//
// A small thing in the middle of a cell (a torch, a lamp…) can also stand on a floor block
// (sidewalk, road, carpet) or among railings without replacing them. Then the value is
// `item + floor * 65536`: the low 16 bits are the item as above, the high 16 bits the floor.
//
// shape: 'cube' (default), 'door' (two blocks tall, opens), 'flat' (a thin floor
// layer you can walk over, like roads), 'plant' (crossed sprites, no collision) or
// 'model' (a small 3D object such as a lamp; `box` is the part you bump into, if any),
// 'ladder' (flat against a wall) or 'rail' (railings along some edges of the cell).
//
// light: blocks that light up their surroundings. color, power (brightness), range
// (how far the light reaches), always (indoor lamps stay on in the daytime),
// flicker (for flames), y (height of the light inside the block).

const warm = 0xffc98a;

export const BLOCKS = {
  1: { name: 'Grass', tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } },
  2: { name: 'Dirt', tex: 'dirt' },
  3: { name: 'Stone', tex: 'stone' },
  4: { name: 'Cobblestone', tex: 'cobble' },
  5: { name: 'Brick', tex: 'brick' },
  6: { name: 'Planks', tex: 'planks' },
  7: { name: 'Log', tex: { top: 'log_top', side: 'log_side', bottom: 'log_top' } },
  8: { name: 'Leaves', tex: 'leaves', cutout: true },
  9: { name: 'Glass', tex: 'glass', transparent: true, fragile: true },
  10: { name: 'Sand', tex: 'sand' },
  11: { name: 'Metal Plate', tex: 'metal', metal: true },
  12: { name: 'Marble', tex: 'marble', glossy: true },
  13: { name: 'Concrete', tex: 'concrete' },
  14: { name: 'Red Paint', tex: 'paint_red' },
  15: { name: 'Blue Paint', tex: 'paint_blue' },
  16: { name: 'Yellow Paint', tex: 'paint_yellow' },
  17: { name: 'Black Paint', tex: 'paint_black' },
  18: { name: 'Lamp', tex: 'lamp', emissive: true, light: { color: warm, power: 1, range: 30 } },
  19: { name: 'Bounce Pad', tex: 'bounce', bounce: true },
  20: { name: 'Floor Tiles', tex: 'tiles', glossy: true },
  21: { name: 'Door', shape: 'door', tex: { bottom: 'door_bottom', top: 'door_top', edge: 'planks' } },
  22: { name: 'Road', shape: 'flat', tex: 'asphalt' },
  23: { name: 'Road Line', shape: 'flat', tex: 'road_line', turns: 55, along: 'z' },
  24: { name: 'Sidewalk', shape: 'flat', tex: 'sidewalk' },
  25: { name: 'Wood Floor', shape: 'flat', tex: 'planks' },
  26: { name: 'Roof Tiles', tex: 'roof' },
  27: { name: 'Flowers', shape: 'plant', tex: 'flowers' },
  28: { name: 'Rainbow', tex: 'rainbow', glossy: true },
  29: { name: 'Pink Paint', tex: 'paint_pink' },
  30: { name: 'Mint Paint', tex: 'paint_mint' },
  31: { name: 'Sky Paint', tex: 'paint_sky' },
  32: { name: 'Orange Paint', tex: 'paint_orange' },
  33: { name: 'Purple Paint', tex: 'paint_purple' },
  34: { name: 'Green Paint', tex: 'paint_green' },
  35: { name: 'Red Carpet', shape: 'flat', tex: 'paint_red', fragile: true },
  36: { name: 'Water', shape: 'flat', tex: 'water', glossy: true, water: true },
  37: { name: 'Mirror', tex: 'mirror', mirror: true },
  38: { name: 'Gold', tex: 'gold', gold: true },
  // Indoor lights
  39: { name: 'Table Lamp', shape: 'model', model: 'tableLamp', box: [0.25, 0, 0.25, 0.75, 0.7, 0.75], light: { color: 0xffd6a0, power: 0.7, range: 18, always: true, y: 0.6 } },
  40: { name: 'Floor Lamp', shape: 'model', model: 'floorLamp', box: [0.3, 0, 0.3, 0.7, 1, 0.7], light: { color: 0xffd6a0, power: 0.8, range: 22, always: true, y: 0.85 } },
  41: { name: 'Ceiling Light', shape: 'model', model: 'ceilingLight', light: { color: 0xfff1dc, power: 1, range: 24, always: true, y: 0.75 } },
  42: { name: 'Chandelier', shape: 'model', model: 'chandelier', light: { color: 0xffd08a, power: 1.2, range: 28, always: true, flicker: 0.05, y: 0.6 } },
  43: { name: 'Candle', shape: 'model', model: 'candle', box: [0.38, 0, 0.38, 0.62, 0.3, 0.62], light: { color: 0xffa040, power: 0.45, range: 12, always: true, flicker: 0.25, y: 0.35, flame: 0.3 } },
  44: { name: 'Lava Lamp', shape: 'model', model: 'lavaLamp', box: [0.35, 0, 0.35, 0.65, 0.7, 0.65], light: { color: 0xff4fd8, power: 0.5, range: 14, always: true, y: 0.4 } },
  // Outdoor lights (they switch on at dusk)
  45: { name: 'Lantern', shape: 'model', model: 'lantern', box: [0.3, 0, 0.3, 0.7, 0.7, 0.7], light: { color: 0xffb060, power: 0.8, range: 22, flicker: 0.08, y: 0.3 } },
  46: { name: 'Street Lamp', shape: 'model', model: 'streetLamp', box: [0.25, 0, 0.25, 0.75, 1, 0.75], light: { color: 0xffd2a0, power: 1.1, range: 34, y: 0.35 } },
  47: { name: 'Garden Light', shape: 'model', model: 'gardenLight', box: [0.38, 0, 0.38, 0.62, 0.65, 0.62], light: { color: 0xfff0d0, power: 0.5, range: 14, y: 0.55 } },
  48: { name: 'Tiki Torch', shape: 'model', model: 'tikiTorch', box: [0.42, 0, 0.42, 0.58, 1, 0.58], light: { color: 0xff9040, power: 0.8, range: 22, flicker: 0.3, y: 1.05, flame: 0.7 } },
  49: { name: 'Party Lights', shape: 'model', model: 'partyLights', light: { color: 0xffe0f0, power: 0.6, range: 18, y: 0.8 } },
  // Glowing neon blocks
  50: { name: 'Neon Pink', tex: 'neon_pink', emissive: true, light: { color: 0xff3fa4, power: 0.9, range: 22, always: true } },
  51: { name: 'Neon Blue', tex: 'neon_blue', emissive: true, light: { color: 0x3fb4ff, power: 0.9, range: 22, always: true } },
  52: { name: 'Neon Green', tex: 'neon_green', emissive: true, light: { color: 0x5cff6a, power: 0.9, range: 22, always: true } },
  53: { name: 'Ladder', shape: 'ladder', tex: 'planks' },
  54: { name: 'Railing', shape: 'rail', tex: 'railing' },
  // Lines that can be turned (right-click) come in pairs: `turns` is the other way round.
  55: { name: 'Road Line', shape: 'flat', tex: 'road_line_turned', turns: 23, along: 'x', hidden: true },
  56: { name: 'Parking Line', shape: 'flat', tex: 'parking_line', turns: 57, along: 'z' },
  57: { name: 'Parking Line', shape: 'flat', tex: 'parking_line_turned', turns: 56, along: 'x', hidden: true },
  58: { name: 'Parking Sign', tex: 'parking_sign' },
  59: { name: 'Tinted Glass', tex: 'tinted_glass', transparent: true, fragile: true },
};

// Paint colors for the Paint Brush (index 1-15; 0 means "not painted").
export const PAINT_COLORS = [
  null, '#e53935', '#ff7a1a', '#fdd835', '#9ccc3c', '#2e9e4f', '#1fb5a0', '#26c6da', '#5aa9f0',
  '#2f5ec4', '#7e4dd2', '#d23fbf', '#f48fb1', '#f5f5f5', '#8a8f98', '#1d1f24',
];
export const PAINT_NAMES = [
  'Original', 'Red', 'Orange', 'Yellow', 'Lime', 'Green', 'Teal', 'Cyan', 'Sky Blue',
  'Blue', 'Purple', 'Magenta', 'Pink', 'White', 'Gray', 'Black',
];

export const BLOCK_IDS = Object.keys(BLOCKS).map(Number);

export const blockId = v => v & 255;
export const blockMeta = v => (v >> 8) & 15;
export const paintOf = v => (v >> 12) & 15;
export const SPLIT = 65536;
export const itemOf = v => v % SPLIT; // the item in the middle (or the whole block)
export const floorOf = v => Math.floor(v / SPLIT); // the floor or railing under it (0 if none)
export const stack = (item, floor) => item + floor * SPLIT;
export const withPaint = (v, paint) => stack((itemOf(v) & 0x0fff) | (paint << 12), floorOf(v));
export const makeBlock = (id, meta = 0) => id | (meta << 8);
export const shapeOf = v => BLOCKS[v & 255]?.shape || 'cube';

// Solid blocks stop players and cars. Roads, carpets, flowers and hanging lights don't.
export const isSolidBlock = v => {
  const shape = shapeOf(v);
  if (shape === 'model') return !!BLOCKS[v & 255].box;
  return v !== 0 && shape !== 'flat' && shape !== 'plant' && shape !== 'ladder' && shape !== 'rail';
};
export const isReplaceable = v => {
  const shape = shapeOf(v);
  return shape === 'flat' || shape === 'plant';
};

export function isValidBlock(v) {
  if (!Number.isInteger(v) || v < 0 || v >= SPLIT * SPLIT) return false;
  if (v >= SPLIT) {
    // An item standing on a floor or among railings.
    const item = itemOf(v), floor = floorOf(v);
    const shape = shapeOf(item);
    return item > 0 && (shape === 'model' || shape === 'door') && isValidBlock(item) && canHoldItem(floor) && isValidBlock(floor);
  }
  if (v === 0) return true;
  const def = BLOCKS[v & 255];
  if (!def) return false;
  const meta = blockMeta(v);
  if (def.shape === 'door' || def.shape === 'flat') return true;
  if (def.shape === 'rail') return meta > 0;
  if (def.light && (v & 255) !== STREET_LAMP) return meta === 0 || meta === LIGHT_OFF;
  return def.shape === 'ladder' ? meta < 4 : meta === 0;
}

// A road (or parking) line turned the other way round, keeping its paint and anything on it.
export const turnLine = v => {
  const other = BLOCKS[blockId(v)]?.turns;
  return other ? v - blockId(v) + other : v;
};

// Water (boats float on it), even with something standing in it.
export const isWaterBlock = v => blockId(itemOf(v)) === 36 || blockId(floorOf(v)) === 36;

// ---------- Light switches ----------
// Lamps can be switched off and on with a right-click (meta bit 1). Street lamps can't:
// they come on by themselves when it gets dark.
export const LIGHT_OFF = 1;
const STREET_LAMP = 46;
export const switchable = v => !!BLOCKS[v & 255]?.light && (v & 255) !== STREET_LAMP;
export const lightOff = v => switchable(v) && (blockMeta(v) & LIGHT_OFF) !== 0;
export const toggleLight = v => stack(itemOf(v) ^ (LIGHT_OFF << 8), floorOf(v));

// A door opened or closed (keeping whatever it stands on).
export const setDoorOpen = (v, open) => stack((itemOf(v) & ~(DOOR_OPEN << 8)) | (open ? DOOR_OPEN << 8 : 0), floorOf(v));

// ---------- Painted sides ----------
// Every side of a block can have its own paint color. Paint is kept beside the blocks, by
// spot: "x,y,z" for the block (or the item in the middle), "x,y,z|f" for the floor or
// railing under an item. Each entry is six colors, in the order +x, -x, +y, -y, +z, -z:
// an RGB number (0xrrggbb), or -1 for "not painted".
export const faceIndex = ([nx, ny, nz]) => (nx > 0 ? 0 : nx < 0 ? 1 : ny > 0 ? 2 : ny < 0 ? 3 : nz > 0 ? 4 : nz < 0 ? 5 : 2);
export const validFaces = f => Array.isArray(f) && f.length === 6 && f.every(c => Number.isInteger(c) && c >= -1 && c <= 0xffffff);
export const hexToRgb = hex => parseInt(hex.slice(1), 16);
export const rgbToHex = c => `#${c.toString(16).padStart(6, '0')}`;

// Paint stays when a block changes state (a door opening, a light switching off, a road line
// turning) but not when it becomes a different block.
const paintKind = v => (v ? Math.min(blockId(v), BLOCKS[blockId(v)]?.turns ?? 999) : 0);
// Updates the paint map `paints` when spot k changes from `old` to `v`. A floor keeps its
// paint when something is put on it or taken off it (the paint moves between "k" and "k|f").
export function carryPaint(paints, k, old, v) {
  const f = `${k}|f`;
  const move = (from, to) => {
    const p = paints.get(from);
    paints.delete(from);
    paints.delete(to);
    if (p) paints.set(to, p);
  };
  if (!floorOf(old) && floorOf(v) && paintKind(itemOf(old)) === paintKind(floorOf(v))) return move(k, f);
  if (floorOf(old) && !floorOf(v) && paintKind(floorOf(old)) === paintKind(itemOf(v))) return move(f, k);
  if (paintKind(itemOf(old)) !== paintKind(itemOf(v))) paints.delete(k);
  if (paintKind(floorOf(old)) !== paintKind(floorOf(v))) paints.delete(f);
}

// ---------- Railings ----------
// A railing runs along one or more edges of a cell (meta bits: 1 = -z side, 2 = +x,
// 4 = +z, 8 = -x). It stops you walking (or falling) off that side but not the others.
// Railings can stand in their own cell, or on a flat block like a sidewalk or carpet.
export const RAIL_EDGES = [1, 2, 4, 8];
const RAIL_THICK = 0.12;
export const RAIL_HEIGHT = 1.6; // taller than it looks, so you can't jump over it (jumps reach 1.45)

const partRails = v => {
  const shape = shapeOf(v);
  return v && (shape === 'rail' || shape === 'flat') ? blockMeta(v) : 0;
};
export const railMask = v => partRails(itemOf(v)) | partRails(floorOf(v));

// Floors and railings can have an item (a torch, a lamp…) standing in the middle of them.
export const canHoldItem = v => v > 0 && v < SPLIT && (shapeOf(v) === 'flat' || shapeOf(v) === 'rail');

// The railing pieces as boxes inside the cell: [x0, y0, z0, x1, y1, z1] from its corner.
export function railBoxes(mask, height = RAIL_HEIGHT) {
  const t = RAIL_THICK, out = [];
  if (mask & 1) out.push([0, 0, 0, 1, height, t]);
  if (mask & 2) out.push([1 - t, 0, 0, 1, height, 1]);
  if (mask & 4) out.push([0, 0, 1 - t, 1, height, 1]);
  if (mask & 8) out.push([0, 0, 0, t, height, 1]);
  return out;
}

// Which edge of a cell is closest to a point (fx, fz from the cell's corner).
export function nearestRailEdge(fx, fz) {
  const d = [fz, 1 - fx, 1 - fz, fx];
  return RAIL_EDGES[d.indexOf(Math.min(...d))];
}

// Railings stop cars too.
export const blocksVehicles = v => isSolidBlock(v) || railMask(v) > 0;

// ---------- Doors ----------
// meta bits: 0-1 facing (quarter turns), 2 open, 3 top half.
export const DOOR_OPEN = 4;
export const DOOR_TOP = 8;
export const toggleDoorValue = v => v ^ (DOOR_OPEN << 8);
export const doorFacingFromYaw = yaw => ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;

// The door panel as a box inside its cell, relative to the cell's corner.
// hinge: which side (-1 left, +1 right) an open door swings to.
export function doorBox(meta, hinge = -1) {
  const open = meta & DOOR_OPEN;
  // Panel in local space, centred on the cell (x/z from -0.5 to 0.5).
  const [x0, z0, x1, z1] = !open ? [-0.5, -0.09, 0.5, 0.09] : hinge < 0 ? [-0.5, -0.5, -0.32, 0.5] : [0.32, -0.5, 0.5, 0.5];
  const a = (meta & 3) * Math.PI / 2;
  const c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const xs = [], zs = [];
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    xs.push(x * c + z * s);
    zs.push(-x * s + z * c);
  }
  return [Math.min(...xs) + 0.5, 0, Math.min(...zs) + 0.5, Math.max(...xs) + 0.5, 1, Math.max(...zs) + 0.5];
}

// ---------- World ----------

// Playable area (block coordinates, inclusive).
export const WORLD = { min: -128, max: 127, maxY: 63 };

export const SPAWN = { x: 0.5, y: 0, z: 5.5 };

// One full day + night, in seconds; the first DAY_FRACTION of it is daytime.
export const DAY_LENGTH = 600;
export const DAY_FRACTION = 0.62;
export const isNightTime = time => ((time % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH / DAY_LENGTH >= DAY_FRACTION;

export const blockKey = (x, y, z) => `${x},${y},${z}`;

export function inBounds(x, y, z) {
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
    x >= WORLD.min && x <= WORLD.max && z >= WORLD.min && z <= WORLD.max &&
    y >= 0 && y <= WORLD.maxY;
}
