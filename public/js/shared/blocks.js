// Block definitions shared by the server and the browser.
// IDs are saved in the world file, so never reorder or reuse them.

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
  18: { name: 'Lamp', tex: 'lamp', emissive: true },
  19: { name: 'Bounce Pad', tex: 'bounce', bounce: true },
  20: { name: 'Floor Tiles', tex: 'tiles', glossy: true },
};

export const BLOCK_IDS = Object.keys(BLOCKS).map(Number);

// Playable area (block coordinates, inclusive).
export const WORLD = { min: -64, max: 63, maxY: 63 };

export const SPAWN = { x: 0.5, y: 1, z: 6.5 };

export const blockKey = (x, y, z) => `${x},${y},${z}`;

export function inBounds(x, y, z) {
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
    x >= WORLD.min && x <= WORLD.max && z >= WORLD.min && z <= WORLD.max &&
    y >= 0 && y <= WORLD.maxY;
}
