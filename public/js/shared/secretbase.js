// The Secret Agency: a top secret base hidden out in the south-east of the far country, and three
// TOP SECRET files hidden around BuildZone. Find all three files and you get Top Secret clearance;
// only agents with clearance get past the guards at the base's door (and nobody else, players or
// the town's people, can step inside: see npcs.js and spy.js).
//
// Inside: the spy room (screens, spy-camera consoles that can watch anyone, anywhere, and a radar
// table that shows where everybody is), the drone bay (drones to fly all over town, up through a
// hatch in the roof), and the laser hall (dodge the blinking lasers!) with the gadget vault at the
// end: night-vision goggles, and a big red button that says DO NOT PRESS.
import { WORLD, SIGN, DOOR_TOP, makeBlock, isSolidBlock, itemOf, shapeOf, stack } from './blocks.js';
import { QUARRY } from './farcountry.js';

// The base's land: nobody's name can have a # in it, so no player can ever build there.
export const AGENCY = { owner: 'Secret Agency', key: '#agency' };
export const FILES_NEEDED = 3;
// Agent Shadow, on the town square (in a corner, looking out over it).
export const AGENT_SPOT = { x: -5.5, y: 0, z: -5.5, face: -Math.PI * 0.75, area: [-7, -7, -4, -4] };
const B = {
  metal: 11, concrete: 13, black: 17, floorTiles: 24, door: 21, sidewalk: 24, // (the floor: flat grey concrete) plant: 67, red: 14,
  ceilingLight: 41, officeChair: 74, railing: 54, neonPink: 50, neonBlue: 51, neonGreen: 52,
  file: 104, console: 105, dronePad: 106, button: 107, screen: 108, radar: 109, shelf: 110, dish: 111,
};
const W = 25, D = 21, H = 5; // the base: 25 blocks east-west, 21 north-south, walls 5 high

// Is (x, y, z) inside the base (where you need clearance)? zone: places.base.zone.
export function inZone(zone, x, y, z) {
  return !!zone && x >= zone[0] && x < zone[2] + 1 && z >= zone[1] && z < zone[3] + 1 && y > -2 && y < zone[4];
}

// Builds the base on empty land in the south-east (only where canUse(x, z) says so, and only into
// empty spots). Returns null if there's no room, or { places, claim, signs, area, count }.
export function buildSecretBase({ get, set, canUse }) {
  const site = findSite(get, canUse);
  if (!site) return null;
  const [x0, z0] = site;
  let count = 0;
  const placed = new Set(); // (columns where we put something on the ground)
  const put = (u, y, v, b) => {
    const x = x0 + u, z = z0 + v;
    if (!b || get(x, y, z)) return false;
    set(x, y, z, b);
    if (y === 0) placed.add(`${x},${z}`);
    count++;
    return true;
  };
  const signs = [];
  const sign = (u, y, v, facing, text, style = 0) => {
    if (put(u, y, v, makeBlock(SIGN, facing | (style << 2)))) signs.push([x0 + u, y, z0 + v, text]);
  };
  const mid = 12; // the door is at u = 11 and 12, on the north side (v = 0)
  // The walls (with black bands along the top), the roof, and the floor inside.
  const inner = new Set();
  const wall = (u, v) => u === 0 || u === W - 1 || v === 0 || v === D - 1 // outside walls
    || (v === 5 && u > 0 && u < W - 1 && !((u === 5 || u === 6) || (u >= 11 && u <= 13) || (u === 18 || u === 19))) // the hall's back wall, with three ways through
    || ((u === 9 || u === 15) && v > 5 && v < D - 1); // between the rooms
  const doorway = (u, v, y) => (v === 0 && (u === mid - 1 || u === mid) && y < 2) || (v === 5 && ((u === 5 || u === 6) || (u === 18 || u === 19)) && y < 2) || (v === 5 && u >= 11 && u <= 13 && y < 3);
  const hatch = (u, v) => u >= 17 && u <= 22 && v >= 10 && v <= 14; // the drone bay's roof hatch
  for (let u = 0; u < W; u++)
    for (let v = 0; v < D; v++) {
      const edge = u === 0 || u === W - 1 || v === 0 || v === D - 1;
      const corner = (u === 0 || u === W - 1) && (v === 0 || v === D - 1);
      if (!edge) inner.add(`${u},${v}`);
      for (let y = 0; y < H; y++) {
        if (doorway(u, v, y)) continue;
        if (wall(u, v)) put(u, y, v, corner ? B.metal : y === H - 1 && edge ? B.black : B.concrete);
      }
      if (!hatch(u, v)) put(u, H, v, B.concrete);
    }
  // The front door (double doors), and two signs either side of it.
  for (const u of [mid - 1, mid]) {
    put(u, 0, 0, makeBlock(B.door, 0));
    put(u, 1, 0, makeBlock(B.door, DOOR_TOP));
  }
  sign(mid - 3, 1, -1, 2, '⚠️ TOP SECRET ⚠️ Secret Agency: agents only!', 1);
  sign(mid + 2, 1, -1, 2, 'No clearance? Find Agent Shadow on the town square 🕶️', 1);
  // Lamps on the posts by the door, a path up to it, and the guards' spots either side.
  for (let v = -4; v <= -1; v++) for (const u of [mid - 1, mid]) put(u, 0, v, B.sidewalk);
  // The security scanner just inside: walk through the glowing arch.
  for (const y of [0, 1]) {
    put(mid - 2, y, 2, B.neonBlue);
    put(mid + 1, y, 2, B.neonBlue);
  }
  for (let u = mid - 2; u <= mid + 1; u++) put(u, 2, 2, B.neonBlue);
  sign(mid - 4, 2, 1, 0, '🔍 Security scan: walk through the arch, agent!', 3);
  for (const [u, v] of [[2, 2], [W - 3, 2]]) put(u, 0, v, B.plant);
  // Lights in the ceiling.
  for (const [u, v] of [[4, 2], [W - 5, 2], [mid, 3], [3, 9], [6, 15], [12, 9], [12, 15], [19, 7], [19, 17]]) put(u, H - 1, v, B.ceilingLight);

  // ---------- The spy room (west) ----------
  for (let v = 7; v <= 18; v++) for (const y of [1, 2]) put(1, y, v, makeBlock(B.screen, 1));
  for (const v of [9, 11, 13, 15]) {
    put(3, 0, v, makeBlock(B.console, 1)); // (facing the chair: the agent looks past it at the big screens)
    put(4, 0, v, makeBlock(B.officeChair, 3));
  }
  put(6, 0, 12, B.radar);
  sign(3, 2, 6, 0, '🕵️ SPY ROOM: right-click a console to watch anyone, anywhere. The radar table shows where everybody is!', 2);

  // ---------- The laser hall (the middle), and the gadget vault at the end ----------
  const lasers = [8, 10, 12, 14];
  for (const v of lasers) for (const y of [0, 1]) {
    set(x0 + 9, y, z0 + v, B.neonPink); // (the emitters, in the walls either side)
    set(x0 + 15, y, z0 + v, B.neonPink);
  }
  sign(10, 2, 6, 0, '🔴 LASER HALL: get through without touching a laser! (They blink: time it right!)', 2);
  put(12, 0, D - 2, makeBlock(B.shelf, 2));
  put(13, 0, D - 2, makeBlock(B.shelf, 2));
  put(10, 0, 18, B.button);
  sign(10, 1, D - 2, 2, '🔴 DO NOT PRESS', 1);
  sign(12, 2, D - 2, 2, '🔬 GADGET VAULT: night-vision goggles for every agent!', 3);

  // ---------- The drone bay (east), with the hatch in the roof ----------
  put(18, 0, 12, B.dronePad);
  put(21, 0, 12, B.dronePad);
  sign(16, 2, 6, 0, '🚁 DRONE BAY: right-click a drone to fly it out through the roof hatch!', 2);
  // Railings round the hatch up on the roof, a radar dish and an antenna.
  for (let u = 17; u <= 22; u++) for (let v = 10; v <= 14; v++) {
    const mask = (v === 10 ? 1 : 0) | (u === 22 ? 2 : 0) | (v === 14 ? 4 : 0) | (u === 17 ? 8 : 0);
    if (mask) put(u, H + 1, v, makeBlock(B.railing, mask));
  }
  put(4, H + 1, 4, B.dish);
  for (let y = H + 1; y <= H + 5; y++) put(W - 3, y, D - 3, B.metal);
  put(W - 3, H + 6, D - 3, B.neonPink);

  // The floor inside, last: tiles everywhere, under the furniture and gadgets too.
  for (const k of inner) {
    const [u, v] = k.split(',').map(Number), x = x0 + u, z = z0 + v, here = get(x, 0, z);
    if (!here) put(u, 0, v, B.floorTiles);
    else if (shapeOf(here) === 'model' && here < 65536 && placed.has(`${x},${z}`)) set(x, 0, z, stack(here, B.floorTiles));
  }

  const cx = x0 + mid, out = z0 - 1;
  const zone = [x0 + 1, z0 + 1, x0 + W - 2, z0 + D - 2, H + 3];
  const places = {
    base: {
      x: cx, y: 0, z: out - 1.5, zone, door: [[cx - 1, 0, z0], [cx, 0, z0]],
      out: [cx + 0.5, 0, z0 - 3.5], scan: z0 + 2,
      lasers: { x0: x0 + 10, x1: x0 + 15, rows: lasers.map(v => z0 + v), start: [x0 + 12.5, 0, z0 + 6.5], end: z0 + 16 },
      roof: H,
    },
    guard1: { x: cx - 2.5, y: 0, z: z0 - 1.5, face: 0, area: [cx - 4, z0 - 3, cx - 2, z0 - 1] },
    guard2: { x: cx + 2.5, y: 0, z: z0 - 1.5, face: 0, area: [cx + 2, z0 - 3, cx + 4, z0 - 1] },
    spyroom: { x: x0 + 6.5, y: 0, z: z0 + 9.5, face: Math.PI / 2, area: [x0 + 5, z0 + 7, x0 + 7, z0 + 17] },
    dronebay: { x: x0 + 19.5, y: 0, z: z0 + 16.5, face: Math.PI, area: [x0 + 16, z0 + 15, x0 + 22, z0 + 18] },
  };
  const claim = { ...AGENCY, x0: x0 - 4, z0: z0 - 5, x1: x0 + W + 3, z1: z0 + D + 3, createdAt: 0, permanent: true };
  return { places, claim, signs, area: [x0 - 4, z0 - 5, x0 + W + 3, z0 + D + 3], count };
}

// Somewhere out in the south-east with nothing on it (and nobody's land), for the base and a
// little room round it. Looks nearest the middle of the south-east first.
function findSite(get, canUse) {
  const free = (x0, z0) => {
    for (let x = x0 - 5; x <= x0 + W + 4; x++)
      for (let z = z0 - 6; z <= z0 + D + 4; z++) {
        if (x < WORLD.min + 4 || x > WORLD.max - 4 || z < WORLD.min + 4 || z > WORLD.max - 4 || !canUse(x, z)) return false;
        for (let y = 0; y < 12; y++) if (get(x, y, z)) return false;
      }
    return true;
  };
  const spots = [];
  for (let x = 160; x <= 280; x += 4) for (let z = 120; z <= 250; z += 4) spots.push([x, z]);
  spots.sort((a, b) => Math.hypot(a[0] - 215, a[1] - 190) - Math.hypot(b[0] - 215, b[1] - 190));
  return spots.find(([x, z]) => free(x, z)) || null;
}

// ---------- The TOP SECRET files ----------
// Three of them, in places worth a visit: up on the roof of the tallest tower (take the
// elevator!), down in Big Rock Quarry, and in the ski lodge (or, if one of those is taken, the
// campground or the farm). Only into empty spots on land nobody's claimed (or the town's own).
// Returns [[x, y, z, where], …].
export function hideSecretFiles({ get, set, canUse, places }) {
  const solid = (x, y, z) => y < 0 || isSolidBlock(itemOf(get(x, y, z)));
  const flat = v => !v || (shapeOf(v) === 'flat' && itemOf(v) === v); // empty, or just a floor (carpet, boards)
  const room = (x, y, z) => canUse(x, z) && flat(get(x, y, z)) && !get(x, y + 1, z) && solid(x, y - 1, z);
  // A spot on the ground (or floor) near (x, z), at height y.
  const near = (x, y, z, r = 6) => {
    for (let d = 0; d <= r; d++)
      for (let dx = -d; dx <= d; dx++)
        for (let dz = -d; dz <= d; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
          const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
          if (room(cx, y, cz)) return [cx, y, cz];
        }
    return null;
  };
  // Up on a tower's roof: the highest flat bit of roof (with room to stand) inside its walls.
  const roofOf = area => {
    if (!area) return null;
    let top = 0;
    const tops = [];
    for (let x = area[0] - 1; x <= area[2] + 1; x++)
      for (let z = area[1] - 1; z <= area[3] + 1; z++) {
        let y = 62;
        while (y > 0 && !solid(x, y, z)) y--;
        tops.push([x, y, z]);
        top = Math.max(top, y);
      }
    if (top < 20) return null;
    const cx = (area[0] + area[2]) / 2, cz = (area[1] + area[3]) / 2;
    const spots = tops.filter(([x, y, z]) => y === top && room(x, y + 1, z)).sort((a, b) => Math.hypot(b[0] - cx, b[2] - cz) - Math.hypot(a[0] - cx, a[2] - cz));
    return spots.length ? [spots[0][0], top + 1, spots[0][2]] : null;
  };
  const lodge = places?.lodge?.area;
  const candidates = [
    ['tower', () => roofOf(places?.tower?.area)],
    ['quarry', () => near(QUARRY.x - 4, 0, QUARRY.z + 4, 8)],
    ['lodge', () => lodge && near(lodge[0] + 1.5, places.lodge.y ?? 0, lodge[3] - 1.5, 3)],
    ['camp', () => places?.camp && near(places.camp.x + 4, 0, places.camp.z - 6, 8)],
    ['farm', () => places?.farm && near(places.farm.x + 6, 0, places.farm.z + 6, 8)],
  ];
  const files = [];
  for (const [where, find] of candidates) {
    if (files.length >= FILES_NEEDED) break;
    const spot = find();
    if (!spot) continue;
    set(...spot, stack(makeBlock(B.file, 0), get(...spot))); // (on the floor that's there, if there is one)
    files.push([...spot, where]);
  }
  return files;
}

// Where each file is, in Agent Shadow's words.
export const FILE_HINTS = {
  tower: 'on the roof of the tallest tower (take the elevator! 🛗)',
  quarry: 'down in Big Rock Quarry ⛏️',
  lodge: 'inside the ski lodge, up north ❄️',
  camp: 'at Sunny Shores Campground ⛺',
  farm: 'at Happy Acres Farm 🚜',
};
