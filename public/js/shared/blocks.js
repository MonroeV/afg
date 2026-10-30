// Block definitions shared by the server and the browser.
// IDs are saved in the world file, so never reorder or reuse them.
//
// A stored block value is `id + meta * 256`. Most blocks have meta 0; doors use
// the meta bits to remember which way they face and whether they are open.
//
// shape: 'cube' (default), 'door' (two blocks tall, opens), 'flat' (a thin floor
// layer you can walk over, like roads) or 'plant' (crossed sprites, no collision).

export const BLOCKS = {
  1: { name: 'Grass', tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } },
  2: { name: 'Dirt', tex: 'dirt' },
  3: { name: 'Stone', tex: 'stone' },
  4: { name: 'Cobblestone', tex: 'cobble' },
  5: { name: 'Brick', tex: 'brick' },
  6: { name: 'Planks', tex: 'planks' },
  7: { name: 'Log', tex: { top: 'log_top', side: 'log_side', bottom: 'log_top' } },
  8: { name: 'Leaves', tex: 'leaves', cutout: true },
  9: { name: 'Glass', tex: 'glass', transparent: true },
  10: { name: 'Sand', tex: 'sand' },
  11: { name: 'Metal Plate', tex: 'metal', metal: true },
  12: { name: 'Marble', tex: 'marble', glossy: true },
  13: { name: 'Concrete', tex: 'concrete' },
  14: { name: 'Red Paint', tex: 'paint_red' },
  15: { name: 'Blue Paint', tex: 'paint_blue' },
  16: { name: 'Yellow Paint', tex: 'paint_yellow' },
  17: { name: 'Black Paint', tex: 'paint_black' },
  18: { name: 'Lamp', tex: 'lamp', emissive: true, light: true },
  19: { name: 'Bounce Pad', tex: 'bounce', bounce: true },
  20: { name: 'Floor Tiles', tex: 'tiles', glossy: true },
  21: { name: 'Door', shape: 'door', tex: { bottom: 'door_bottom', top: 'door_top', edge: 'planks' } },
  22: { name: 'Road', shape: 'flat', tex: 'asphalt' },
  23: { name: 'Road Line', shape: 'flat', tex: 'road_line' },
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
  35: { name: 'Red Carpet', shape: 'flat', tex: 'paint_red' },
  36: { name: 'Water', shape: 'flat', tex: 'water', glossy: true, water: true },
  37: { name: 'Mirror', tex: 'mirror', mirror: true },
  38: { name: 'Gold', tex: 'gold', gold: true },
};

export const BLOCK_IDS = Object.keys(BLOCKS).map(Number);

export const blockId = v => v & 255;
export const blockMeta = v => v >> 8;
export const makeBlock = (id, meta = 0) => id | (meta << 8);
export const shapeOf = v => BLOCKS[v & 255]?.shape || 'cube';

// Solid blocks stop players and cars. Roads, carpets and flowers don't.
export const isSolidBlock = v => {
  const shape = shapeOf(v);
  return v !== 0 && shape !== 'flat' && shape !== 'plant';
};
export const isReplaceable = v => {
  const shape = shapeOf(v);
  return shape === 'flat' || shape === 'plant';
};

export function isValidBlock(v) {
  if (!Number.isInteger(v) || v < 0) return false;
  if (v === 0) return true;
  const def = BLOCKS[v & 255];
  if (!def) return false;
  return def.shape === 'door' ? v >> 8 < 16 : v >> 8 === 0;
}

// ---------- Doors ----------
// meta bits: 0-1 facing (quarter turns), 2 open, 3 top half.
export const DOOR_OPEN = 4;
export const DOOR_TOP = 8;
export const toggleDoorValue = v => v ^ (DOOR_OPEN << 8);
export const doorFacingFromYaw = yaw => ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;

// The door panel as a box inside its cell, relative to the cell's corner.
export function doorBox(meta) {
  const open = meta & DOOR_OPEN;
  // Panel in local space, centred on the cell (x/z from -0.5 to 0.5).
  const [x0, z0, x1, z1] = open ? [-0.5, -0.5, -0.32, 0.5] : [-0.5, -0.09, 0.5, 0.09];
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
