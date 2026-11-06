// Vehicle sizes and rules, shared by the server (for respawning) and the browser (for driving).

export const VEHICLES = {
  car: { name: 'Car', mass: 1200, length: 3.6, width: 1.8, ride: 0.32, bodyH: 0.55, cabinH: 0.72, wheelR: 0.34, maxSpeed: 17, accel: 9, gears: 3, respawn: 30 },
  police: { name: 'Police Car', mass: 1400, length: 3.8, width: 1.85, ride: 0.32, bodyH: 0.55, cabinH: 0.72, wheelR: 0.35, maxSpeed: 21, accel: 11, gears: 3, respawn: 30 },
  monster: { name: 'Monster Truck', mass: 3000, length: 4.0, width: 2.5, ride: 1.05, bodyH: 0.7, cabinH: 0.85, wheelR: 0.8, maxSpeed: 14, accel: 8, gears: 3, climb: true, respawn: 30 },
  boat: { name: 'Boat', mass: 700, length: 3.8, width: 1.7, ride: 0, bodyH: 0.55, cabinH: 0.4, wheelR: 0.3, height: 0.95, maxSpeed: 13, accel: 5.5, boat: true, respawn: 30 },
  heli: { name: 'Helicopter', mass: 1800, length: 3.4, width: 2.0, tail: 3.0, height: 2.4, rotor: 3.6, flying: true, respawn: 300 },
  // A camper van: four seats (two up front, two in the back), and G pops the roof up.
  camper: {
    name: 'Camper Van', mass: 2200, length: 4.6, width: 2.0, ride: 0.32, bodyH: 0.95, cabinH: 0.8, wheelR: 0.38, maxSpeed: 14, accel: 6.5, gears: 3, respawn: 30,
    seats: [[-0.45, 0.62, -1.05], [0.45, 0.62, -1.05], [-0.45, 0.62, 0.55], [0.45, 0.62, 0.55]], special: 'roof',
    // Where you lie down to sleep in it (B, parked): [x, y, z] of your feet, head toward the front.
    beds: [[-0.42, 0.86, 1.95], [0.42, 0.86, 1.95]], engine: 'normal', pitch: 0.86,
  },
  // A pickup truck: two in the cab and one riding in the back (in the open truck bed).
  pickup: {
    name: 'Pickup Truck', mass: 1900, length: 4.4, width: 1.95, ride: 0.42, bodyH: 0.6, cabinH: 0.72, wheelR: 0.42, maxSpeed: 18, accel: 9, gears: 3, respawn: 30,
    seats: [[-0.42, 0.56, -0.55], [0.42, 0.56, -0.55], [0, 1.02, 1.25]], engine: 'big', pitch: 1.08,
  },
  // A big dump truck: slow and heavy, and G tips the dump bed up (and down again).
  dump: {
    name: 'Dump Truck', mass: 6000, length: 5.4, width: 2.4, ride: 0.55, bodyH: 0.85, cabinH: 0.85, wheelR: 0.62, maxSpeed: 12, accel: 5, gears: 3, respawn: 30,
    seats: [[-0.5, 0.95, -1.75], [0.5, 0.95, -1.75]], special: 'tip', engine: 'diesel',
  },
  // The RV: a whole home on wheels. Two up front, two at the dinette table (facing each other) and
  // two on the couch; a kitchen, a TV, a bathroom and a big bed at the back (B: sleep, parked), and
  // G rolls the awning out. (A seat's 4th number turns you to face across the RV.)
  rv: {
    name: 'RV', mass: 7500, length: 8.2, width: 2.6, ride: 0.42, bodyH: 2.5, cabinH: 0, wheelR: 0.5, maxSpeed: 12, accel: 4.5, gears: 3, respawn: 60,
    seats: [[-0.6, 1.08, -3.15], [0.6, 1.08, -3.15], [-0.78, 1.15, -2.15, Math.PI], [-0.78, 1.15, -0.95, 0], [0.92, 1.15, -1.9, Math.PI / 2], [0.92, 1.15, -1.05, Math.PI / 2]],
    beds: [[-0.45, 1.22, 3.9], [0.45, 1.22, 3.9], [0.92, 1.18, -0.6]], special: 'awning', lightY: 0.55, engine: 'diesel', pitch: 1.1,
  },
  // A sports car: low, light and quick, with a spoiler on the back. Two seats.
  sports: {
    name: 'Sports Car', mass: 1100, length: 3.9, width: 1.86, ride: 0.2, bodyH: 0.42, cabinH: 0.5, wheelR: 0.33, maxSpeed: 24, accel: 13, gears: 3, respawn: 30,
    seats: [[-0.4, 0.34, 0.25], [0.4, 0.34, 0.25]], engine: 'sport',
  },
};
// The engine sound of each kind (shared/../sounds): normal cars, sports cars, big V8 trucks, diesels.
VEHICLES.car.engine = 'normal';
VEHICLES.police.engine = 'sport';
VEHICLES.police.pitch = 0.88;
VEHICLES.monster.engine = 'big';
VEHICLES.monster.pitch = 0.9;
VEHICLES.boat.engine = 'outboard';
for (const s of Object.values(VEHICLES)) s.height ??= s.ride + s.bodyH + s.cabinH;
// How many people fit (the driver too).
export const seatCount = spec => spec.seats?.length ?? 3;

export const VEHICLE_KINDS = Object.keys(VEHICLES);
export const MAX_HP = 100;
export const PERSON_MASS = 70; // kilograms, for bumping into people
export const SMOKE_HP = 50; // below this, smoke pours out
export const FIRE_HP = 25; // below this it's on fire and will burn up

// Points around the outside of a vehicle (and, for the helicopter, its tail and rotor tips),
// in the vehicle's own space: [x, y, z]. Forward is -z.
export function outlinePoints(spec) {
  const pts = [];
  const hw = spec.width / 2 - 0.1, hl = spec.length / 2 - 0.1;
  const heights = spec.flying ? [0.02, 1.2, 2.0] : spec.climb ? [0.3, 1.4, spec.height - 0.1] : [0.25, spec.height - 0.1];
  for (const y of heights)
    for (const x of [-hw, 0, hw])
      for (const z of [-hl, -hl / 2, 0, hl / 2, hl]) {
        if (x === 0 && Math.abs(z) < hl) continue; // only the outline matters
        pts.push([x, y, z]);
      }
  if (spec.flying) {
    for (let t = 1; t <= 3; t++) pts.push([0, 1.3, hl + t * spec.tail / 3]);
  }
  return pts;
}

// A grid of points filling the whole vehicle, used when checking a spawn spot.
export function densePoints(spec) {
  const pts = [];
  const hw = spec.width / 2 - 0.1, hl = spec.length / 2 - 0.1;
  for (const y of [0.15, 0.75, 1.35, 1.95, spec.height - 0.05].filter(y => y < spec.height))
    for (let x = -hw; x <= hw + 1e-6; x += hw / 2)
      for (let z = -hl; z <= hl + 1e-6; z += hl / 4) pts.push([x, y, z]);
  if (spec.flying) for (let t = 1; t <= 3; t++) pts.push([0, 1.3, hl + t * spec.tail / 3]);
  return pts;
}

export function rotorPoints(spec) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pts.push([Math.cos(a) * spec.rotor * 0.9, spec.height + 0.05, Math.sin(a) * spec.rotor * 0.9]);
  }
  return pts;
}

export function toWorld([lx, ly, lz], x, y, z, h) {
  const sin = Math.sin(h), cos = Math.cos(h);
  return [x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos];
}

// Does the vehicle overlap anything solid? `isSolid(x, y, z)` takes whole-block coordinates.
export function vehicleBlocked(isSolid, spec, x, y, z, h, points = outlinePoints(spec)) {
  for (const p of points) {
    const [wx, wy, wz] = toWorld(p, x, y, z, h);
    if (isSolid(Math.floor(wx), Math.floor(wy), Math.floor(wz))) return true;
  }
  return false;
}

function supported(isSolid, spec, x, y, z, h) {
  if (y <= 0) return true;
  for (const p of [[0, 0, 0], [-spec.width / 3, 0, -spec.length / 3], [spec.width / 3, 0, spec.length / 3]]) {
    const [wx, , wz] = toWorld(p, x, y, z, h);
    if (isSolid(Math.floor(wx), Math.floor(y) - 1, Math.floor(wz))) return true;
  }
  return false;
}

// Where a boat's hull touches the water (in its own space), to check it's afloat.
export function hullPoints(spec) {
  const hw = spec.width / 2 - 0.15, hl = spec.length / 2 - 0.2;
  return [[-hw, 0, -hl * 0.5], [hw, 0, -hl * 0.5], [-hw, 0, hl], [hw, 0, hl], [0, 0, -hl], [0, 0, 0]];
}

// Is every part of a boat's hull over water? isWater(x, y, z) takes whole-block coordinates.
export function afloat(isWater, spec, x, y, z, h) {
  for (const p of hullPoints(spec)) {
    const [wx, , wz] = toWorld(p, x, y, z, h);
    if (!isWater(Math.floor(wx), Math.floor(y + 0.05), Math.floor(wz))) return false;
  }
  return true;
}

// Finds somewhere for a vehicle to (re)appear near its home spot, even if players
// have built on it since. Boats need water under them (isWater).
export function findVehicleSpot(isSolid, spec, home, others = [], isWater = null) {
  const dense = densePoints(spec);
  const free = (x, y, z) =>
    !vehicleBlocked(isSolid, spec, x, y, z, home.h, dense) &&
    (spec.boat ? !!isWater && afloat(isWater, spec, x, y, z, home.h) : supported(isSolid, spec, x, y, z, home.h)) &&
    others.every(o => Math.hypot(o.x - x, o.z - z) > 4 || Math.abs(o.y - y) > 2.5);
  // Prefer the ground near home; failing that, anywhere (even on top of buildings).
  for (const [maxR, maxY] of spec.boat ? [[12, home.y]] : [[8, home.y], [14, 20]]) {
    for (let r = 0; r <= maxR; r++) {
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = home.x + dx, z = home.z + dz;
          for (let y = home.y; y <= maxY; y++) if (free(x, y, z)) return { x, y, z, h: home.h };
        }
    }
  }
  return null;
}
