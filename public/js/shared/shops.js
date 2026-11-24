// The town's other stores: the Green Thumb Garden Center, the Toy Box and Happy Paws Pet Shop
// (the Luxe Store is in worldgen.js). Each is a little shop by a road out of town: walls in the
// store's colors, a glass front with double doors, its things on display, a counter with a cash
// register, a sign, and its shopkeeper inside. They belong to their store (permanent claims), so
// nobody can knock them down. What each one sells is in blocks.js (STORES, and `store` on things).
import { DOOR_TOP, makeBlock, stack, BLOCKS, isFlower } from './blocks.js';
import { exitRoads, makeSite, siteFree } from './worldgen.js';
import { ringRoads, RING } from './outerlands.js';
import { FAR_ROADS } from './frontier.js';

const B = { floor: 25, glass: 9, door: 21, sidewalk: 24, flowerPot: 67, ceilingLight: 41, register: 86, desk: 73, sign: 94, lantern: 45, white: 12, table: 62, chair: 60, mirror: 37, papel: 137, pinata: 138, salonChair: 140 };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);

// Each store's walls, trim and sign, and the roads it would like to be on.
const SHOPS = [
  { id: 'garden', walls: 34, trim: 30, roof: 26, roads: ['south', 'east', 'ringS', 'ringE', 'west', 'north'] },
  { id: 'toys', walls: 32, trim: 16, roof: 15, roads: ['north', 'west', 'ringN', 'ringW', 'east', 'south'] },
  { id: 'pets', walls: 6, trim: 29, roof: 26, roads: ['east', 'south', 'ringE', 'ringS', 'north', 'west'] },
];
// The stores out along the Outer Loop (in the outer lands): goods: what's on display (blocks).
const OUTER_SHOPS = [
  { id: 'grocery', walls: 13, trim: 16, roof: 26, roads: ['loopE', 'loopS', 'loopW', 'loopN'], sign: '🛒 FRESHMART GROCERY', owner: 'FreshMart Grocery', near: [RING, -40], goods: [136, 136, 136, 136, 135, 135, 135, 135] },
  // Casa Fiesta: orange walls, yellow trim, tables and chairs, cacti, a piñata and papel picado.
  { id: 'fiesta', walls: 32, trim: 16, roof: 26, roads: ['loopS', 'loopW', 'loopN', 'loopE'], sign: '🌮 CASA FIESTA (🎉 Taco Tuesday!)', owner: 'Casa Fiesta', near: [-RING, FAR_ROADS.west + 20], goods: [0, 0, 0, 0, 139, 139], decor: fiestaDecor },
  // Snip & Style: pink walls, white trim, salon chairs facing mirrors on the walls.
  { id: 'salon', walls: 29, trim: 12, roof: 15, roads: ['loopW', 'loopN', 'loopE', 'loopS'], sign: '💇 SNIP & STYLE', owner: 'Snip & Style', near: [-80, -RING], goods: [0, 0, 0, 0, 67, 67], decor: salonDecor },
];
// (u along the road, v in from it: the room inside is u 1-8, v 2-7, the counter at v 6.)
function fiestaDecor({ put, inward, outward }) {
  for (const u of [2, 7]) {
    put(u, 0, 3, stack(B.table, B.floor));
    put(u, 0, 2, stack(makeBlock(B.chair, inward), B.floor));
    put(u, 0, 4, stack(makeBlock(B.chair, outward), B.floor));
  }
  for (let u = 1; u <= 8; u++) put(u, 3, 5, makeBlock(B.papel, inward));
  for (let u = 1; u <= 8; u++) if (u !== 3 && u !== 6) put(u, 3, 3, makeBlock(B.papel, inward));
  put(4, 3, 4, B.pinata);
}
function salonDecor({ put, site }) {
  const [ux, uz] = site.dirU;
  for (const v of [3, 5]) {
    put(1, 0, v, stack(makeBlock(B.salonChair, faceDir(-ux, -uz)), B.floor));
    put(8, 0, v, stack(makeBlock(B.salonChair, faceDir(ux, uz)), B.floor));
    put(0, 1, v, B.mirror);
    put(L - 1, 1, v, B.mirror);
  }
}
const L = 10, D = 9;

// The stores along the Outer Loop (only: just these ones, by id). A store with `near` takes the
// free spot closest to there (by where a road comes out to the Outer Loop, say); the others go
// along their roads in order.
export function buildOuterShops({ get, set, canUse, only = null }) {
  const roads = ringRoads();
  const out = { claims: [], signs: [], places: {}, areas: [], built: [] };
  const used = [];
  for (const shop of OUTER_SHOPS.filter(s => !only || only.includes(s.id))) {
    const sites = [];
    for (const name of shop.roads) {
      const road = roads[name];
      for (const side of [-1, 1]) for (let a = road.from + 30; a + L <= road.to - 30; a += 3) sites.push(makeSite(road, side, a));
    }
    const centre = site => site.at(L / 2, D / 2);
    if (shop.near) sites.sort((p, q) => Math.hypot(...centre(p).map((c, i) => c - shop.near[i])) - Math.hypot(...centre(q).map((c, i) => c - shop.near[i])));
    for (const site of sites) {
      const [cx, cz] = centre(site);
      if (used.some(([x, z]) => Math.hypot(x - cx, z - cz) < 60)) continue;
      if (!siteFree(site, L, D, 6, get, canUse)) continue;
      const s = shopAt(site, shop, shop.goods, set);
      out.claims.push(s.claim);
      out.signs.push(...s.signs);
      out.places[`shop_${shop.id}`] = s.place;
      out.areas.push(s.area);
      out.built.push(shop.id);
      used.push([cx, cz]);
      break;
    }
  }
  return out;
}

export function buildShops({ get, set, canUse }) {
  const roads = exitRoads();
  const out = { claims: [], signs: [], places: {}, areas: [], built: [] };
  const used = [];
  const items = id => Object.entries(BLOCKS).filter(([, d]) => d.store === id).map(([k]) => Number(k));
  for (const shop of SHOPS) {
    let done = false;
    for (const name of shop.roads) {
      const road = roads[name];
      if (!road || done) continue;
      for (const side of [1, -1]) {
        if (done) break;
        for (let a = road.from + 2; a + L <= road.to - 1; a += 2) {
          const site = makeSite(road, side, a);
          const [cx, cz] = site.at(L / 2, D / 2);
          if (used.some(([x, z]) => Math.hypot(x - cx, z - cz) < 40)) continue;
          // (Not right up against anything else, either.)
          if (!siteFree(site, L, D, 6, get, (x, z) => canUse(x, z) && !used.some(([ux, uz]) => Math.abs(ux - x) < 12 && Math.abs(uz - z) < 12))) continue;
          const s = shopAt(site, shop, items(shop.id), set);
          out.claims.push(s.claim);
          out.signs.push(...s.signs);
          out.places[`shop_${shop.id}`] = s.place;
          out.areas.push(s.area);
          out.built.push(shop.id);
          used.push([cx, cz]);
          done = true;
          break;
        }
      }
    }
  }
  return out;
}

function shopAt(site, shop, goods, set) {
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV; // from the road into the shop
  const inward = faceDir(fx, fz), outward = faceDir(-fx, -fz);
  // The path from the road, with flowers and lanterns.
  for (let u = 0; u < L; u++) put(u, 0, 0, u === 2 || u === 7 ? stack(B.lantern, B.sidewalk) : u === 1 || u === 8 ? stack(B.flowerPot, B.sidewalk) : B.sidewalk);
  for (let u = 0; u < L; u++)
    for (let v = 1; v < D; v++) {
      const edgeU = u === 0 || u === L - 1, edgeV = v === 1 || v === D - 1;
      if (!edgeU && !edgeV) {
        put(u, 0, v, B.floor);
        put(u, 4, v, shop.roof);
        continue;
      }
      for (let y = 0; y < 4; y++) {
        let b = (edgeU && edgeV) || y === 3 ? shop.trim : shop.walls;
        if (v === 1 && !edgeU && y < 3) b = (u === 4 || u === 5) && y < 2 ? 0 : B.glass;
        if (b) put(u, y, v, b);
      }
      put(u, 4, v, shop.roof);
    }
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  for (const u of [4, 5]) {
    put(u, 0, 1, makeBlock(B.door, doorFacing));
    put(u, 1, 1, makeBlock(B.door, doorFacing | DOOR_TOP));
  }
  // Lights, the counter at the back with the cash register, and the goods on display.
  put(3, 3, 4, B.ceilingLight);
  put(6, 3, 4, B.ceilingLight);
  for (const u of [3, 4, 5, 6]) put(u, 0, 6, stack(makeBlock(B.desk, inward), B.floor));
  put(4, 1, 6, makeBlock(B.register, inward));
  const spots = [[1, 3], [8, 3], [1, 5], [8, 5], [1, 7], [8, 7], [2, 2], [7, 2]];
  goods.forEach((item, i) => {
    const s = spots[i];
    if (!s || !item) return;
    const def = BLOCKS[item];
    const v = def.facing ? makeBlock(item, outward) : item;
    put(s[0], 0, s[1], isFlower(v) ? v : stack(v, B.floor)); // (flowers in a patch of earth, not on the floor)
  });
  shop.decor?.({ put, site, inward, outward });
  // A sign with the store's name over the door, outside.
  const [sx, sz] = site.at(Math.floor(L / 2), 0);
  set(sx, 3, sz, makeBlock(B.sign, onWall(fx, fz)));
  const [px, pz] = site.pos(5, 7.5);
  const [cx0, cz0] = site.at(0, 0), [cx1, cz1] = site.at(L - 1, D - 1);
  const rect = [Math.min(cx0, cx1), Math.min(cz0, cz1), Math.max(cx0, cx1), Math.max(cz0, cz1)];
  const [ax, az] = site.at(1, 2), [bx, bz] = site.at(L - 2, D - 2);
  return {
    signs: [[sx, 3, sz, shop.sign || { garden: '🌻 GREEN THUMB GARDEN CENTER', toys: '🧸 THE TOY BOX', pets: '🐾 HAPPY PAWS PET SHOP' }[shop.id]]],
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    place: { x: px, y: 0, z: pz, area: [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)], face: Math.atan2(-fx, -fz) },
    claim: { owner: shop.owner || { garden: 'Green Thumb Garden Center', toys: 'The Toy Box', pets: 'Happy Paws Pet Shop' }[shop.id], key: `store ${shop.id}`, x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
  };
}
