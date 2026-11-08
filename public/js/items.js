// Hotbar items: every block, the hammer, cars and fireworks.
import * as THREE from 'three';
import { BLOCKS, BLOCK_IDS, PAINT_COLORS, SHOP_TOOLS } from './shared/blocks.js';
import { blockMaterial, railGeometry } from './world.js';
import { modelGeometry, modelMaterials } from './models.js';
import { pictureCanvas } from './pictures.js';

export const HAMMER = 'hammer';
export const FIREWORKS = 'fireworks';
export const BALL = 'ball';
export const CLAIM = 'claim';
export const BRUSH = 'brush';
export const SCRAPER = 'scraper';
export const WRENCH = 'wrench';
export const LADDER = 53;
export const WATER_BALLOON = 'waterballoon';
export const BUBBLES = 'bubbles';
export const BALLOON = 'balloon';
export const FILL = 'fill';
export const COPY = 'copy';
export const CAMERA = 'camera';
// From the Luxe Store:
export const JETPACK = 'jetpack';
export const TRAIL = 'trail';
export const SHOWTIME = 'showtime';
export const GOLDPAINT = 'goldpaint';
export const SNEAKERS = 'sneakers';
export const SKIS = 'skis';
export const GOGGLES = 'goggles'; // night-vision goggles (from the Secret Agency's vault)
export const BODYGUARDS = 'bodyguards'; // (a Luxe Store thing: they guard your land)
export const VACATION = 'vacationflag';
export const TOOLS = [HAMMER, BRUSH, SCRAPER, WRENCH, BALL, FIREWORKS, CLAIM, WATER_BALLOON, BUBBLES, BALLOON, FILL, COPY, CAMERA, SHOWTIME, VACATION];
// Things you have to buy at the Luxe Store before you can use them.
export const fromStore = item => (typeof item === 'number' ? !!BLOCKS[item]?.price : !!SHOP_TOOLS[item]);
// Everything that can go in the hotbar.
export const ALL_ITEMS = [...TOOLS, ...BLOCK_IDS];
// Gear isn't held: you wear it (put it on and take it off in the item menu's 🎒 Gear).
export const GEAR = [SNEAKERS, JETPACK, TRAIL, SKIS, GOGGLES];
// Everything that needs a little picture: the hotbar things, gear, and Gold Car Paint (for the store).
export const ICON_ITEMS = [...ALL_ITEMS, ...GEAR, GOLDPAINT, BODYGUARDS];

// ---------- Styles ----------
// Look-alikes share one place in the item menu. Pick one, then choose its style: X in the game
// (or tap its slot again), or the style strip at the bottom of the item menu. The items are
// all still their own blocks underneath (so every world built before looks just the same).
export const FAMILIES = [
  { id: 'color', name: 'Color Block', items: [14, 32, 16, 34, 30, 31, 15, 33, 29, 17] },
  { id: 'glass', name: 'Glass', items: [9, 59, 112] },
  { id: 'glow', name: 'Glow Block', items: [18, 50, 51, 52] },
  { id: 'lamp', name: 'Lamp', items: [39, 40, 41, 42, 44, 43] },
  { id: 'outdoor', name: 'Outdoor Light', items: [46, 47, 45, 48, 49] },
  { id: 'chair', name: 'Chair', items: [60, 74, 95] },
  { id: 'table', name: 'Table', items: [62, 73] },
  { id: 'picture', name: 'Picture', items: [65, 66, 78] },
  { id: 'floor', name: 'Floor', items: [25, 35, 20] },
  { id: 'office', name: 'Office Stuff', items: [75, 76, 77] },
  { id: 'road', name: 'Road', items: [22, 23, 56] },
  { id: 'leaves', name: 'Leaves', items: [8, 89] },
  { id: 'snow', name: 'Snow & Ice', items: [87, 88] },
  { id: 'camp', name: 'Outdoor Stuff', items: [97, 98, 99, 100, 101, 102] },
  { id: 'race', name: 'Race Line', items: [71, 72] },
  { id: 'brush', name: 'Paint Brush', items: [BRUSH, SCRAPER] },
  { id: 'wand', name: 'Builder Wand', items: [FILL, COPY] },
  // The Vacation Flag (from the Luxe Store) is the Land Flag's other style, until you plant it.
  { id: 'flag', name: 'Land Flag', items: [CLAIM, VACATION] },
];
const FAMILY_OF = new Map(FAMILIES.flatMap(f => f.items.map(i => [i, f])));
export const familyOf = item => FAMILY_OF.get(item) || null;

// The tabs of the item menu. Blocks not listed anywhere go under Blocks. (Each family of styles
// shows up once, where its first style is.) Lamps are in Home, outdoor lights in Town.
const HOME = [94, 60, 74, 95, 61, 62, 73, 64, 63, 65, 66, 78, 67, 68, 39, 40, 41, 42, 44, 43, 21, 53, 103, 54, 25, 35, 20, 75, 76, 77, 79, 80, 81, 86, 92];
const TOWN = [22, 23, 56, 24, 58, 46, 47, 45, 48, 49, 27, 36, 1, 7, 8, 89, 87, 88, 91, 90, 97, 98, 99, 100, 101, 102];
const FUN = [93, SHOWTIME, 83, 84, 82, 85, BALL, FIREWORKS, WATER_BALLOON, BUBBLES, BALLOON, 19, 70, 69, 71, 72, 28];
const listed = new Set([...HOME, ...TOWN, ...FUN]);
const visible = i => typeof i !== 'number' || !BLOCKS[i].hidden;
export const TABS = [
  { id: 'tools', icon: '🧰', name: 'Tools', items: [HAMMER, BRUSH, SCRAPER, WRENCH, CLAIM, VACATION, FILL, COPY, CAMERA] },
  { id: 'fun', icon: '🎉', name: 'Fun', items: FUN },
  { id: 'blocks', icon: '🧱', name: 'Blocks', items: BLOCK_IDS.filter(i => !listed.has(i) && !BLOCKS[i].shape && visible(i)) },
  { id: 'home', icon: '🛋️', name: 'Home', items: HOME },
  { id: 'town', icon: '🌳', name: 'Town', items: TOWN },
  { id: 'paint', icon: '🎨', name: 'Paint' },
  { id: 'book', icon: '📖', name: 'Build Book' },
];
// Anything left over (so nothing is ever missing from the menu).
for (const i of BLOCK_IDS) if (visible(i) && !TABS.some(t => t.items?.includes(i))) TABS[2].items.push(i);

// Extra words the search box understands.
export const SEARCH_WORDS = {
  [WATER_BALLOON]: 'throw splash water fight', [BUBBLES]: 'bubble blow', [BALLOON]: 'float fly slow fall', [FILL]: 'fill wall floor big box builder',
  [COPY]: 'copy paste clone duplicate builder', [WRENCH]: 'fix repair mechanic car truck boat helicopter smoke fire',
  [BRUSH]: 'paint color car', [CAMERA]: 'photo picture screenshot', [CLAIM]: 'land claim home', [BALL]: 'pet dog fetch throw',
  61: 'sofa', 60: 'seat sit', 62: 'desk', 64: 'sleep', 65: 'picture art wall', 66: 'picture art wall cat dog rocket dinosaur', 67: 'plant flower',
  68: 'toy bear hug', 69: 'piano song note sound', 73: 'office table', 74: 'office seat sit', 75: 'pc screen office', 76: 'office drawers',
  77: 'office water drink', 78: 'office board chart', 79: 'music play keys', 80: 'aquarium fish', 81: 'gold', 82: 'gem shiny store',
  83: 'gold king queen chair store', 84: 'party light store', 85: 'gold cup winner store', 86: 'shop store buy',
  [VACATION]: 'land claim second holiday beach store flag', 97: 'camp camping outdoor', 98: 'beach sun shade parasol', 99: 'farm straw hay',
  100: 'farm halloween orange', 101: 'road works orange', 102: 'picnic bench camp park', 95: 'fish fishing rod lake dock stool seat', 18: 'light glow',
  50: 'glow light', 51: 'glow light', 52: 'glow light', 14: 'color', 15: 'color', 16: 'color', 17: 'color', 29: 'color', 30: 'color',
  31: 'color', 32: 'color', 33: 'color', 34: 'color', 39: 'light', 40: 'light', 41: 'light', 42: 'light', 43: 'light', 44: 'light',
  45: 'light torch', 46: 'light', 47: 'light', 48: 'light torch', 49: 'light', 87: 'winter white cold', 88: 'skate slippery winter cold', 89: 'tree pine christmas snow',
  90: 'chair lift ride cable ski', 91: 'winter snow', 92: 'pizza job work cook', 94: 'write words text name label board', 93: 'hot tub bath spa bubbles store', [TRAIL]: 'rainbow sparkle store', [SHOWTIME]: 'fireworks show store', 70: 'boost fast arrow run', 71: 'race timer go', 72: 'race timer end', 19: 'trampoline jump',
  36: 'pool lake', 21: 'garage', 54: 'fence rail', 103: 'lift up down floors building tower', 112: 'window see through transparent clear', 9: 'window', 59: 'window',
};
// The hammer always lives in slot 1.
export const DEFAULT_HOTBAR = [HAMMER, 5, 6, 9, 21, LADDER, BRUSH, FIREWORKS, CLAIM];

export const isBlockItem = item => typeof item === 'number';

export function itemName(item) {
  if (item === HAMMER) return 'Hammer';
  if (item === FIREWORKS) return 'Fireworks';
  if (item === BALL) return 'Pet Ball';
  if (item === CLAIM) return 'Land Flag';
  if (item === BRUSH) return 'Paint Brush';
  if (item === SCRAPER) return 'Paint Scraper';
  if (item === WRENCH) return 'Wrench';
  if (item === SKIS) return 'Skis';
  if (item === GOGGLES) return 'Night-Vision Goggles';
  if (item === BODYGUARDS) return 'Bodyguards';
  if (item === WATER_BALLOON) return 'Water Balloons';
  if (item === BUBBLES) return 'Bubble Wand';
  if (item === BALLOON) return 'Balloon';
  if (item === FILL) return 'Fill Wand';
  if (item === COPY) return 'Copy Wand';
  if (item === CAMERA) return 'Camera';
  if (SHOP_TOOLS[item]) return SHOP_TOOLS[item].name;
  return BLOCKS[item].name;
}

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
};

// Draws a small icon for the hotbar and the item menu. `paint` is the brush's color (a
// palette number or a '#rrggbb' color).
export function makeIcon(item, textures, paint = 1) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (item === BRUSH || item === SCRAPER) {
    ctx.translate(32, 32);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#a0522d';
    ctx.fillRect(-4, 2, 8, 26);
    ctx.fillStyle = '#c0c4c8';
    ctx.fillRect(-7, -6, 14, 9);
    if (item === BRUSH) {
      ctx.fillStyle = typeof paint === 'string' ? paint : PAINT_COLORS[paint] || '#e53935';
      ctx.beginPath();
      ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(6, -24); ctx.lineTo(0, -28); ctx.lineTo(-6, -24);
      ctx.fill();
    } else {
      ctx.fillStyle = '#dfe3e6';
      ctx.fillRect(-12, -26, 24, 20);
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(-12, -26, 24, 3);
    }
    return canvas;
  }

  if (item === BODYGUARDS) {
    // Two guards in black suits and sunglasses.
    for (const [x, skin] of [[20, '#6b4226'], [44, '#e8b088']]) {
      ctx.fillStyle = '#111316';
      ctx.fillRect(x - 12, 34, 24, 28);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 3, 34, 6, 10);
      ctx.fillStyle = '#111316';
      ctx.fillRect(x - 1, 36, 2, 10);
      ctx.fillStyle = skin;
      ctx.fillRect(x - 9, 12, 18, 20);
      ctx.fillStyle = '#1b1209';
      ctx.fillRect(x - 9, 10, 18, 5);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x - 8, 19, 7, 4);
      ctx.fillRect(x + 1, 19, 7, 4);
      ctx.fillRect(x - 1, 20, 2, 2);
    }
    return canvas;
  }
  if (item === GOGGLES) {
    // Two big green lenses on a black strap.
    ctx.fillStyle = '#212121';
    ctx.fillRect(4, 26, 56, 8);
    for (const x of [21, 43]) {
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(x, 31, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#76ff03';
      ctx.beginPath();
      ctx.arc(x, 31, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(x - 3, 28, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }
  if (item === SKIS) {
    ctx.translate(32, 32);
    for (const [x, c] of [[-9, '#e53935'], [9, '#1e88e5']]) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(0.35);
      ctx.fillStyle = c;
      ctx.fillRect(-3.5, -24, 7, 50);
      ctx.beginPath();
      ctx.arc(0, -24, 3.5, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-4, 2, 8, 6);
      ctx.restore();
    }
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 2;
    for (const x of [-22, 22]) {
      ctx.beginPath();
      ctx.moveTo(x, -26);
      ctx.lineTo(x * 0.8, 26);
      ctx.stroke();
    }
    return canvas;
  }
  if (item === GOLDPAINT) {
    const g = ctx.createLinearGradient(18, 0, 46, 0);
    g.addColorStop(0, '#a87a12');
    g.addColorStop(0.45, '#ffe58a');
    g.addColorStop(1, '#b8860b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(19, 20, 26, 38, 5);
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(25, 12, 14, 9);
    ctx.fillStyle = '#333';
    ctx.fillRect(30, 7, 5, 6);
    ctx.fillStyle = '#fff6c8';
    for (const [x, y] of [[14, 8], [9, 14], [16, 16]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }
  if (item === SNEAKERS) {
    ctx.translate(32, 36);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-24, 10, 48, 7); // the sole
    ctx.fillStyle = '#29b6f6';
    ctx.beginPath();
    ctx.moveTo(-24, 10); ctx.lineTo(-22, -6); ctx.lineTo(-6, -10); ctx.lineTo(2, -2); ctx.lineTo(22, 2); ctx.lineTo(24, 10);
    ctx.fill();
    ctx.fillStyle = '#fdd835'; // a lightning bolt
    ctx.beginPath();
    ctx.moveTo(-6, -6); ctx.lineTo(-12, 3); ctx.lineTo(-7, 3); ctx.lineTo(-11, 10); ctx.lineTo(-1, 0); ctx.lineTo(-6, 0);
    ctx.fill();
    return canvas;
  }
  if (item === WRENCH) {
    ctx.translate(32, 32);
    ctx.rotate(Math.PI / 4);
    const g = ctx.createLinearGradient(-8, 0, 8, 0);
    g.addColorStop(0, '#f1f4f7');
    g.addColorStop(1, '#8a929b');
    ctx.fillStyle = g;
    ctx.fillRect(-4.5, -14, 9, 36);
    // The open end, with its jaws...
    ctx.beginPath();
    ctx.arc(0, -17, 11, 0, Math.PI * 2);
    ctx.fill();
    // ...and the ring end.
    ctx.beginPath();
    ctx.arc(0, 22, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(-4.5, -32, 9, 15);
    ctx.beginPath();
    ctx.arc(0, 22, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#e53935'; // a red rubber grip
    ctx.fillRect(-5.5, -1, 11, 14);
    return canvas;
  }

  if (item === HAMMER) {
    ctx.translate(32, 32);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#7a4e2a';
    ctx.fillRect(-4, -8, 8, 34);
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(-4, 18, 8, 8);
    const g = ctx.createLinearGradient(0, -24, 0, -8);
    g.addColorStop(0, '#d6dbe0');
    g.addColorStop(1, '#7f8790');
    ctx.fillStyle = g;
    ctx.fillRect(-18, -24, 36, 16);
    ctx.fillStyle = '#5c636b';
    ctx.fillRect(-18, -12, 36, 4);
    return canvas;
  }
  if (item === FIREWORKS) {
    ctx.translate(32, 34);
    ctx.rotate(0.5);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(-7, -12, 14, 26);
    ctx.fillStyle = '#fdd835';
    ctx.fillRect(-7, -4, 14, 5);
    ctx.fillStyle = '#1e88e5';
    ctx.beginPath();
    ctx.moveTo(-9, -12); ctx.lineTo(9, -12); ctx.lineTo(0, -26); ctx.fill();
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(-1, 14, 2, 12);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [x, y, c] of [[12, 10, '#fdd835'], [52, 14, '#ec407a'], [50, 50, '#26c6da'], [10, 50, '#7cb342']]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }
  if (item === BALL) {
    const g = ctx.createRadialGradient(26, 24, 2, 32, 32, 22);
    g.addColorStop(0, '#ff8a80');
    g.addColorStop(1, '#c62828');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fdd835';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(32, 32, 20, -0.4, 0.4 + Math.PI);
    ctx.stroke();
    return canvas;
  }
  if (item === WATER_BALLOON || item === BALLOON) {
    const water = item === WATER_BALLOON;
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5;
    if (!water) {
      ctx.beginPath();
      ctx.moveTo(30, 44);
      ctx.quadraticCurveTo(24, 54, 32, 62);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(24, 20, 2, 30, 28, 22);
    g.addColorStop(0, water ? '#bfe9ff' : '#ff9a9a');
    g.addColorStop(1, water ? '#1e88e5' : '#d32f2f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(31, water ? 34 : 26, 18, water ? 18 : 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = water ? '#1565c0' : '#b71c1c';
    ctx.beginPath();
    ctx.moveTo(27, water ? 52 : 47); ctx.lineTo(35, water ? 52 : 47); ctx.lineTo(31, water ? 46 : 42); ctx.fill();
    if (water) {
      ctx.fillStyle = '#4fc3f7';
      for (const [x, y] of [[52, 18], [56, 30], [12, 50]]) {
        ctx.beginPath();
        ctx.moveTo(x, y - 6); ctx.quadraticCurveTo(x + 5, y + 2, x, y + 3); ctx.quadraticCurveTo(x - 5, y + 2, x, y - 6);
        ctx.fill();
      }
    }
    return canvas;
  }
  if (item === BUBBLES) {
    ctx.strokeStyle = '#ab47bc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, 58); ctx.lineTo(30, 36);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(35, 28, 9, 0, Math.PI * 2);
    ctx.stroke();
    for (const [x, y, r] of [[50, 16, 8], [54, 36, 5], [42, 8, 4]]) {
      const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.6, 'rgba(160,220,255,0.25)');
      g.addColorStop(1, 'rgba(200,140,255,0.8)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }
  if (item === FILL || item === COPY) {
    ctx.save();
    ctx.translate(32, 32);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#3e2a5c';
    ctx.fillRect(-3, -6, 6, 34);
    ctx.fillStyle = item === FILL ? '#ffca28' : '#4dd0e1';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 6 : 13;
      ctx.lineTo(Math.cos(a) * r, -16 + Math.sin(a) * r);
    }
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = item === FILL ? '#ffca28' : '#4dd0e1';
    if (item === FILL) {
      ctx.fillStyle = 'rgba(255,202,40,0.45)';
      ctx.fillRect(38, 38, 20, 20);
      ctx.strokeRect(38, 38, 20, 20);
    } else {
      ctx.strokeRect(34, 34, 16, 16);
      ctx.strokeRect(42, 42, 16, 16);
    }
    return canvas;
  }
  if (item === CAMERA) {
    ctx.fillStyle = '#37474f';
    roundRect(ctx, 6, 18, 52, 34, 6);
    ctx.fillStyle = '#546e7a';
    roundRect(ctx, 18, 12, 16, 8, 2);
    ctx.fillStyle = '#90a4ae';
    ctx.beginPath();
    ctx.arc(32, 35, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a237e';
    ctx.beginPath();
    ctx.arc(32, 35, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(29, 32, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(46, 22, 7, 4);
    return canvas;
  }
  if (item === JETPACK) {
    for (const x of [18, 36]) {
      const g = ctx.createLinearGradient(x, 0, x + 12, 0);
      g.addColorStop(0, '#9aa3ad');
      g.addColorStop(0.5, '#eef1f4');
      g.addColorStop(1, '#7d8690');
      ctx.fillStyle = g;
      roundRect(ctx, x, 8, 12, 34, 5);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(x, 14, 12, 4);
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.moveTo(x + 1, 42); ctx.lineTo(x + 11, 42); ctx.lineTo(x + 6, 60); ctx.fill();
      ctx.fillStyle = '#fff3a0';
      ctx.beginPath();
      ctx.moveTo(x + 3, 42); ctx.lineTo(x + 9, 42); ctx.lineTo(x + 6, 52); ctx.fill();
    }
    ctx.fillStyle = '#546e7a';
    ctx.fillRect(28, 16, 10, 18);
    return canvas;
  }
  if (item === TRAIL) {
    const colors = ['#ff4d4d', '#ffb300', '#fdd835', '#66bb6a', '#29b6f6', '#7e57c2'];
    colors.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(32, 44, 26 - i * 4, Math.PI, Math.PI * 1.9);
      ctx.stroke();
    });
    ctx.fillStyle = '#fff';
    for (const [x, y] of [[50, 12], [12, 20], [56, 30]]) {
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, r = k % 2 ? 2 : 6;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.fill();
    }
    return canvas;
  }
  if (item === SHOWTIME) {
    for (const [x, c, rot] of [[16, '#e53935', -0.3], [32, '#1e88e5', 0], [48, '#43a047', 0.3]]) {
      ctx.save();
      ctx.translate(x, 40);
      ctx.rotate(rot);
      ctx.fillStyle = c;
      ctx.fillRect(-5, -14, 10, 22);
      ctx.fillStyle = '#fdd835';
      ctx.beginPath();
      ctx.moveTo(-6, -14); ctx.lineTo(6, -14); ctx.lineTo(0, -24); ctx.fill();
      ctx.restore();
    }
    for (const [x, y, c] of [[10, 10, '#ff7af0'], [32, 6, '#fdd835'], [54, 12, '#4dd2ff']]) {
      ctx.fillStyle = c;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ctx.fillRect(x + Math.cos(a) * 5 - 1, y + Math.sin(a) * 5 - 1, 3, 3);
      }
    }
    return canvas;
  }
  if (item === VACATION) {
    // A beachy flag: orange with a sun on it, on a sandy mound.
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(18, 8, 5, 50);
    ctx.fillStyle = '#ff8f1f';
    ctx.beginPath();
    ctx.moveTo(23, 10); ctx.lineTo(56, 21); ctx.lineTo(23, 33); ctx.fill();
    ctx.fillStyle = '#fff176';
    ctx.beginPath();
    ctx.arc(33, 21, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8cf8a';
    ctx.beginPath();
    ctx.ellipse(21, 58, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  }
  if (item === CLAIM) {
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(18, 8, 5, 50);
    ctx.fillStyle = '#43a047';
    ctx.beginPath();
    ctx.moveTo(23, 10); ctx.lineTo(54, 20); ctx.lineTo(23, 32); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('★', 28, 25);
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(10, 54, 22, 6);
    return canvas;
  }

  const def = BLOCKS[item];
  const shape = def.shape || 'cube';
  if (shape === 'model') {
    ctx.drawImage(modelIcon(def), 0, 0, size, size);
    return canvas;
  }
  if (shape === 'picture') {
    ctx.drawImage(pictureCanvas(def.art, def.art === 'poster' || def.art === 'sign' ? 0 : 1), 2, 10, 60, 45);
    return canvas;
  }
  if (shape === 'rail') {
    // A little stretch of fence: posts, a handrail, a bottom rail and bars.
    ctx.fillStyle = '#6d6a64';
    ctx.fillRect(4, 50, 56, 4);
    ctx.fillStyle = '#ece8df';
    for (const x of [6, 50]) ctx.fillRect(x, 12, 8, 40);
    ctx.fillRect(4, 10, 56, 6);
    ctx.fillRect(4, 42, 56, 4);
    for (const x of [20, 29, 38]) ctx.fillRect(x, 16, 4, 26);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(4.5, 10.5, 55, 5);
    return canvas;
  }
  if (shape === 'ladder') {
    ctx.fillStyle = '#9c6b3f';
    ctx.fillRect(16, 4, 6, 56);
    ctx.fillRect(42, 4, 6, 56);
    for (let y = 12; y < 60; y += 12) ctx.fillRect(16, y, 32, 5);
    return canvas;
  }
  if (shape === 'door' || shape === 'plant') {
    // Doors and flowers are drawn flat, straight on.
    const img = textures[shape === 'door' ? def.tex.bottom : def.tex].canvas;
    if (shape === 'door') {
      ctx.drawImage(textures[def.tex.top].canvas, 18, 2, 28, 30);
      ctx.drawImage(img, 18, 32, 28, 30);
    } else {
      ctx.drawImage(img, 4, 4, 56, 56);
    }
    return canvas;
  }
  const tex = def.tex;
  const top = textures[typeof tex === 'string' ? tex : tex.top].canvas;
  const side = textures[typeof tex === 'string' ? tex : tex.side].canvas;
  const s = 22; // half-width of the cube's top diamond
  const cx = 32, cy = shape === 'flat' ? 26 : 18;
  const depth = shape === 'flat' ? 4 : s;
  const face = (img, a, b, c, d, e, f, dim) => {
    ctx.save();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0, 1, 1);
    if (dim) {
      ctx.fillStyle = `rgba(0,0,0,${dim})`;
      ctx.fillRect(0, 0, 1, 1);
    }
    ctx.restore();
  };
  // Each face maps the texture onto a unit square, then skews it into place.
  face(top, s, -s / 2, s, s / 2, cx - s, cy, 0);
  face(side, s, s / 2, 0, depth, cx - s, cy, 0.25);
  face(side, s, -s / 2, 0, depth, cx, cy + s / 2, 0.45);
  return canvas;
}

// Lamp models get a tiny 3D picture as their icon.
let iconKit = null;
function modelIcon(def) {
  if (!iconKit) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(64, 64);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2, 3, 2);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(1.9, 1.5, 2.4);
    camera.lookAt(0.5, 0.5, 0.5);
    iconKit = { renderer, scene, camera };
  }
  const { renderer, scene, camera } = iconKit;
  const mats = modelMaterials(def.model);
  mats[1].color.multiplyScalar(1.6);
  const geo = modelGeometry(def.model);
  // Zoom in on small things (a candle, a teddy bear) so they fill the icon.
  geo.computeBoundingBox();
  const box = geo.boundingBox, center = box.getCenter(new THREE.Vector3());
  const size = Math.max(0.45, box.getSize(new THREE.Vector3()).length() / Math.sqrt(3));
  camera.position.copy(center).add(new THREE.Vector3(1.4, 1.0, 1.9).multiplyScalar(size * 1.05));
  camera.lookAt(center);
  const mesh = new THREE.Mesh(geo, mats);
  scene.add(mesh);
  renderer.render(scene, camera);
  scene.remove(mesh);
  return renderer.domElement;
}

// The item held in the bottom-right of the screen.
export class ViewModel {
  constructor() {
    this.materials = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x554433, 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 1.8);
    this.sun.position.set(1, 2, 1);
    this.scene.add(this.sun);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.models = {};
    this.swingT = 1;
    this.switchT = 1;
    this.bobT = 0;
    this.item = null;
  }

  model(item) {
    if (this.models[item]) return this.models[item];
    let obj;
    if (item === HAMMER) {
      obj = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2a, roughness: 0.7 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.35, metalness: 0.8 });
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), wood);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.09), steel);
      head.position.y = 0.25;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 }));
      grip.position.y = -0.2;
      obj.add(handle, head, grip);
      obj.scale.setScalar(0.6);
      obj.position.set(0.04, -0.02, -0.05);
      obj.rotation.set(0.35, 0.5, 0.25);
    } else if (item === FIREWORKS) {
      obj = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0xe53935 }));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x1e88e5 }));
      cone.position.y = 0.19;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0xfdd835 }));
      obj.add(tube, cone, band);
      obj.scale.setScalar(0.75);
      obj.rotation.set(0.2, 0, -0.3);
    } else if (item === BALL) {
      obj = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 }));
      obj.add(new THREE.Mesh(new THREE.TorusGeometry(0.111, 0.012, 6, 24), new THREE.MeshStandardMaterial({ color: 0xfdd835 })));
      obj.position.y = 0.05;
    } else if (item === BRUSH || item === SCRAPER) {
      obj = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.7 });
      const metal = new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.8, roughness: 0.3 });
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.04).translate(0, -0.08, 0), wood));
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.05).translate(0, 0.07, 0), metal));
      if (item === BRUSH) {
        this.bristles = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.8 });
        obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.045).translate(0, 0.15, 0), this.bristles));
      } else {
        obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.01).translate(0, 0.16, 0), metal));
      }
      obj.rotation.set(0.4, 0.4, -0.3);
    } else if (item === WRENCH) {
      obj = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0xbfc6ce, metalness: 0.85, roughness: 0.28 });
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.022), steel));
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.12, 0.032).translate(0, -0.06, 0), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.6 })));
      // Open jaws at the top (a ring with a gap), a closed ring at the bottom.
      const gap = Math.PI * 0.55;
      obj.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.022, 6, 16, Math.PI * 2 - gap).rotateZ(Math.PI / 2 + gap / 2).translate(0, 0.19, 0), steel));
      obj.add(new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.014, 6, 14).translate(0, -0.17, 0), steel));
      obj.scale.setScalar(0.9);
      obj.position.set(0.04, -0.02, -0.05);
      obj.rotation.set(0.35, 0.5, 0.25);
    } else if (item === 'rod') {
      // (Not an item: what you hold sitting on a fishing stool.)
      obj = new THREE.Group();
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.014, 1.1, 6).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: 0x2f3237, roughness: 0.5 })));
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8).translate(0, -0.12, 0), new THREE.MeshStandardMaterial({ color: 0x8d5a34, roughness: 0.8 })));
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 14).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.7, roughness: 0.35 }));
      reel.position.set(0.035, 0, 0);
      obj.add(reel);
      this.rodTip = new THREE.Object3D();
      this.rodTip.position.y = 1.0;
      obj.add(this.rodTip);
      obj.scale.setScalar(0.8);
      obj.position.set(0.02, -0.12, 0);
      obj.rotation.set(-0.85, 0.1, -0.22);
    } else if (item === 'gascan') {
      // (Not an item: a gas can you've bought, carried to a vehicle that needs it.)
      obj = new THREE.Group();
      const red = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.45, metalness: 0.2 });
      const black = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.6 });
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.12), red));
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04).translate(-0.03, 0.17, 0), black)); // the handle
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.12, 8).rotateZ(-0.7).translate(0.12, 0.17, 0), black)); // the spout
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.005).translate(0, 0, 0.0625), new THREE.MeshStandardMaterial({ color: 0xffeb3b, roughness: 0.5 })));
      obj.scale.setScalar(1.15);
      obj.position.set(-0.04, 0.1, 0.05);
      obj.rotation.set(0.15, -0.6, 0.05);
    } else if (item === WATER_BALLOON) {
      obj = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12).scale(1, 1.15, 1), new THREE.MeshStandardMaterial({ color: 0x42a5f5, roughness: 0.15, transparent: true, opacity: 0.85 }));
      obj.position.y = 0.05;
    } else if (item === BALLOON) {
      obj = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.25 }));
      b.position.y = 0.3;
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.24, 4), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
      string.position.y = 0.12;
      obj.add(b, string);
      obj.position.set(0.04, 0, 0);
      obj.rotation.z = -0.2;
      this.balloonMesh = b;
    } else if (item === BUBBLES) {
      obj = new THREE.Group();
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xab47bc })));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 20), new THREE.MeshStandardMaterial({ color: 0xab47bc }));
      ring.position.y = 0.23;
      obj.add(ring);
      obj.rotation.set(0.3, 0.3, -0.3);
    } else if (item === FILL || item === COPY) {
      obj = new THREE.Group();
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.38, 6), new THREE.MeshStandardMaterial({ color: 0x3e2a5c, roughness: 0.5 })));
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: item === FILL ? 0xffca28 : 0x4dd0e1 }));
      tip.position.y = 0.23;
      obj.add(tip);
      obj.rotation.set(0.35, 0.4, -0.25);
    } else if (item === CAMERA) {
      obj = new THREE.Group();
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08), new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.5 })));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a237e, roughness: 0.1, metalness: 0.5 }));
      lens.position.z = -0.06;
      obj.add(lens);
      obj.rotation.set(0.1, 0.2, 0);
    } else if (item === SHOWTIME) {
      obj = new THREE.Group();
      [0xe53935, 0x1e88e5, 0x43a047].forEach((c, i) => {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10), new THREE.MeshStandardMaterial({ color: c }));
        tube.position.set((i - 1) * 0.075, 0, 0);
        tube.rotation.z = (i - 1) * -0.2;
        obj.add(tube);
      });
      obj.rotation.set(0.3, 0.4, -0.25);
    } else if (item === CLAIM || item === VACATION) {
      obj = new THREE.Group();
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x8d6e63 })));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ color: item === VACATION ? 0xff8f1f : 0x43a047, side: THREE.DoubleSide }));
      flag.position.set(0.11, 0.2, 0);
      obj.add(flag);
      obj.rotation.set(0.2, 0.4, -0.2);
    } else {
      const shape = BLOCKS[item].shape || 'cube';
      if (shape === 'model') {
        obj = new THREE.Group();
        const mesh = new THREE.Mesh(modelGeometry(BLOCKS[item].model), this.materials[item]);
        mesh.scale.setScalar(0.4);
        mesh.position.set(-0.2, -0.25, -0.2);
        obj.add(mesh);
        obj.rotation.set(0.15, 0.6, 0);
        this.models[item] = obj;
        return obj;
      }
      if (shape === 'rail') {
        obj = new THREE.Group();
        const mesh = new THREE.Mesh(railGeometry(1), blockMaterial(this.materials, item));
        mesh.scale.setScalar(0.35);
        mesh.position.set(-0.17, -0.2, 0);
        obj.add(mesh);
        obj.rotation.set(0.2, 0.5, 0);
        this.models[item] = obj;
        return obj;
      }
      const mat = blockMaterial(this.materials, item);
      const geo = shape === 'picture' ? new THREE.BoxGeometry(0.32, 0.24, 0.02)
        : shape === 'flat' ? new THREE.BoxGeometry(0.32, 0.03, 0.32)
        : shape === 'door' ? new THREE.BoxGeometry(0.2, 0.4, 0.04)
          : shape === 'plant' ? new THREE.PlaneGeometry(0.35, 0.35) : new THREE.BoxGeometry(0.32, 0.32, 0.32);
      obj = new THREE.Mesh(geo, mat);
      obj.rotation.set(shape === 'flat' ? 0.5 : 0, Math.PI / 4, 0);
    }
    this.models[item] = obj;
    if (item === BRUSH && this.paintColor) this.bristles.color.set(this.paintColor);
    if (item === BALLOON && this.paintColor) this.balloonMesh.material.color.set(this.paintColor);
    return obj;
  }

  // The color on the end of the paint brush.
  // (The balloon is the brush's color too.)
  setPaint(color) {
    this.paintColor = color;
    this.bristles?.color.set(color);
    this.balloonMesh?.material.color.set(color);
  }

  setItem(item) {
    if (item === this.item || !this.materials) return;
    this.item = item;
    this.holder.clear();
    this.holder.add(this.model(item));
    this.switchT = 0;
  }

  swing() {
    this.swingT = 0;
  }

  update(dt, moving, aspect, envMap, dayK) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.05 + 0.25 * dayK;
    this.hemi.intensity = 0.25 + 0.45 * dayK;
    this.sun.intensity = 0.4 + 1.4 * dayK;
    this.swingT = Math.min(1, this.swingT + dt * 4.5);
    this.switchT = Math.min(1, this.switchT + dt * 5);
    if (moving) this.bobT += dt * 9;

    const s = Math.sin(this.swingT * Math.PI);
    const bob = moving ? Math.sin(this.bobT) * 0.012 : 0;
    const bobY = moving ? Math.abs(Math.cos(this.bobT)) * 0.012 : 0;
    const drop = (1 - this.switchT) * 0.3;
    this.holder.position.set(0.38 + bob - s * 0.1, -0.32 + bobY - drop + s * 0.04, -0.6 - s * 0.12);
    this.holder.rotation.set(-s * 0.9, 0, -s * 0.2);
  }
}
