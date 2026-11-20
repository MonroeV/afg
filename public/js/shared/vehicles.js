// Vehicle sizes and rules, shared by the server (for respawning) and the browser (for driving).

export const VEHICLES = {
  car: { name: 'Car', mass: 1200, length: 3.6, width: 1.8, ride: 0.32, bodyH: 0.55, cabinH: 0.72, wheelR: 0.34, maxSpeed: 17, accel: 9, gears: 3, respawn: 30 },
  police: { name: 'Police Car', mass: 1400, length: 3.8, width: 1.85, ride: 0.32, bodyH: 0.55, cabinH: 0.72, wheelR: 0.35, maxSpeed: 21, accel: 11, gears: 3, respawn: 30 },
  monster: { name: 'Monster Truck', mass: 3000, length: 4.0, width: 2.5, ride: 1.05, bodyH: 0.7, cabinH: 0.85, wheelR: 0.8, maxSpeed: 14, accel: 8, gears: 3, climb: true, respawn: 30 },
  boat: { name: 'Boat', mass: 700, length: 3.8, width: 1.7, ride: 0, bodyH: 0.55, cabinH: 0.4, wheelR: 0.3, height: 0.95, maxSpeed: 13, accel: 5.5, boat: true, respawn: 30 },
  heli: { name: 'Helicopter', mass: 1800, length: 3.4, width: 2.0, tail: 3.0, height: 2.4, rotor: 3.6, flying: true, respawn: 300 },
  // A little propeller plane (high wings, two seats side by side). Unlike the helicopter it needs
  // speed to fly: down the runway, then pull up (see flyPlane in cars.js). width: wingtip to
  // wingtip.
  plane: {
    name: 'Airplane', mass: 1100, length: 7.2, width: 8.4, height: 2.8, flying: true, plane: true, respawn: 120,
    seats: [[-0.32, 0.92, -1.0], [0.32, 0.92, -1.0]], engine: 'big', pitch: 0.62,
  },
  // The Sky Cub: a little slow plane with big wings, for sightseeing. It takes off in no time,
  // floats along gently (it can fly really slowly without stalling) and lands almost anywhere.
  cub: {
    name: 'Sky Cub', mass: 650, length: 6.6, width: 10.2, height: 2.8, flying: true, plane: true, respawn: 120,
    seats: [[0, 0.92, -1.1], [0, 1.0, 0.1]], engine: 'normal', pitch: 0.9,
    // (How it flies: see flyPlane in cars.js. Slow top speed, and slow enough to land gently.)
    flight: { thrust: 3.2, dragK: 0.0058, liftSpeed: 10, stall: 6.5, rotate: 7.5, maxTurn: 1.3, crash: 13, hardLanding: 6 },
    frame: { nose: -3.6, tail: 3.2, bodyY: 1.2, finTop: 2.6, wingY: 2.1, half: 5.0, wingZ: [-1.3, 0.3], mainZ: -0.6, wheel: 'tail' },
  },
  // A jet: fast and sleek, with swept-back wings and a jet engine (no propeller). It needs a good
  // long run down the runway to take off, and a long, careful approach to land.
  jet: {
    name: 'Jet', mass: 1400, length: 9.4, width: 6.8, height: 2.7, flying: true, plane: true, respawn: 120,
    seats: [[0, 0.82, -2.3], [0, 0.95, -1.15]], engine: 'sport', pitch: 1.5,
    flight: { thrust: 17, dragK: 0.0034, liftSpeed: 32, stall: 23, rotate: 25, maxTurn: 1.0, turnBoost: 2.2, crash: 16, hardLanding: 7 },
    frame: { nose: -5.0, tail: 4.2, bodyY: 1.1, finTop: 2.6, wingY: 0.95, half: 3.3, wingZ: [-0.6, 1.8], mainZ: 0.6, wheel: 'nose' },
  },
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
  // A bumper car (at Fun Land): small, slow and round, with a rubber bumper all the way round.
  // Bump into each other as much as you like: they bounce, and never get hurt.
  bumper: {
    name: 'Bumper Car', mass: 260, length: 2.1, width: 1.5, ride: 0.1, bodyH: 0.42, cabinH: 0.2, wheelR: 0.12, maxSpeed: 6.5, accel: 7, gears: 3, respawn: 20,
    seats: [[0, 0.32, 0.15]], bouncy: true, noDamage: true, engine: 'normal', pitch: 1.7,
  },
  // A fire truck (at the fire station): big and red, with a ladder on top and a water cannon. G
  // turns on its lights and siren, and G again the hose too (it sprays where you're heading).
  firetruck: {
    name: 'Fire Truck', mass: 9000, length: 7.0, width: 2.5, ride: 0.5, bodyH: 1.6, cabinH: 0.3, wheelR: 0.55, maxSpeed: 18, accel: 7, gears: 3, respawn: 30,
    seats: [[-0.55, 1.1, -2.3], [0.55, 1.1, -2.3], [-0.55, 1.1, -1.3], [0.55, 1.1, -1.3]], special: 'hose', engine: 'diesel', pitch: 0.95,
  },
  // A go-kart (at Thunder Raceway): tiny, low and quick, and it corners like it's on rails. Like
  // the bumper cars, bumps don't hurt it (it bounces off).
  kart: {
    name: 'Go-Kart', mass: 180, length: 1.9, width: 1.3, ride: 0.06, bodyH: 0.22, cabinH: 0.3, wheelR: 0.16, maxSpeed: 15, accel: 11, gears: 3, respawn: 20,
    seats: [[0, 0.2, 0.2]], bouncy: true, noDamage: true, engine: 'sport', pitch: 1.6,
  },
  // A skateboard and a BMX bike (at the skate park): you stand on them. Light and quick; ride up a
  // ramp (the Stairs block) and you fly off the top. In the air, A and D spin you round and Space
  // does a flip: land it straight for a trick! Bumps don't hurt them.
  skateboard: {
    name: 'Skateboard', mass: 70, length: 1.0, width: 0.4, ride: 0.07, bodyH: 0.06, cabinH: 0, wheelR: 0.06, height: 1.6, maxSpeed: 11, accel: 8, gears: 3, respawn: 20,
    seats: [[0, 0.84, 0]], stand: true, skate: true, bouncy: true, noDamage: true,
  },
  bmx: {
    name: 'BMX Bike', mass: 90, length: 1.7, width: 0.55, ride: 0.3, bodyH: 0.1, cabinH: 0, wheelR: 0.3, height: 1.8, maxSpeed: 12, accel: 7, gears: 3, respawn: 20,
    seats: [[0, 1.2, 0.15]], stand: true, skate: true, bouncy: true, noDamage: true,
  },
  // An ambulance (at the hospital): a big white van with red stripes and crosses. G: lights and
  // siren. Two up front, and room in the back for patients (a hurt friend riding in it gets
  // better when it stops in the hospital's ambulance bay).
  ambulance: {
    name: 'Ambulance', mass: 3200, length: 5.2, width: 2.2, ride: 0.4, bodyH: 1.9, cabinH: 0, wheelR: 0.42, maxSpeed: 20, accel: 8, gears: 3, respawn: 30,
    seats: [[-0.45, 0.95, -1.75], [0.45, 0.95, -1.75], [-0.4, 0.95, 0.9], [0.4, 0.95, 0.9]], special: 'siren', engine: 'big', pitch: 1.0,
  },
  // A tractor (at the farm): slow and steady, big wheels at the back and little ones in front, an
  // open seat under a sunshade roof. It climbs up one block, like a monster truck.
  tractor: {
    name: 'Tractor', mass: 3500, length: 3.6, width: 2.0, ride: 0.5, bodyH: 0.7, cabinH: 1.0, wheelR: 0.45, maxSpeed: 9, accel: 4.5, gears: 3, respawn: 30,
    seats: [[0, 1.12, 0.45]], climb: true, engine: 'diesel', pitch: 1.25,
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
  if (spec.plane) return planePoints(spec);
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

// The airplane isn't a box: its body, the wings up top, the tail, and the wheels underneath.
function planePoints(spec) {
  if (spec.frame) {
    // (The Sky Cub and the jet: from their measurements.)
    const f = spec.frame, out = [[0, f.bodyY, f.nose], [0, f.finTop, f.tail], [-1.1, 0.02, f.mainZ], [1.1, 0.02, f.mainZ]];
    out.push(f.wheel === 'tail' ? [0, 0.02, f.tail - 0.4] : [0, 0.02, f.nose + 1.6]);
    for (const y of [f.bodyY - 0.45, f.bodyY, f.bodyY + 0.45])
      for (const x of [-0.6, 0.6])
        for (let z = f.nose + 0.6; z <= f.tail - 0.3; z += (f.tail - f.nose - 0.9) / 4) out.push([x, y, z]);
    for (let x = 1.3; x <= f.half; x += (f.half - 1.3) / 3) for (const z of f.wingZ) for (const sx of [-1, 1]) out.push([sx * x, f.wingY, z]);
    return out;
  }
  const pts = [[0, 1.2, -3.6], [0, 0.02, -2.6], [-1.1, 0.02, 0], [1.1, 0.02, 0], [0, 2.7, 3.4], [-1.5, 1.5, 3.3], [1.5, 1.5, 3.3]];
  for (const y of [0.7, 1.4, 1.9]) for (const x of [-0.7, 0.7]) for (const z of [-3.4, -1.7, 0, 1.7, 3.4]) pts.push([x, y, z]);
  for (const x of [-4.1, -3.3, -2.4, -1.4, 1.4, 2.4, 3.3, 4.1]) for (const z of [-1.0, 0.1]) pts.push([x, 2.05, z]);
  return pts;
}

// A grid of points filling the whole vehicle, used when checking a spawn spot.
export function densePoints(spec) {
  const pts = [];
  const hw = spec.width / 2 - 0.1, hl = spec.length / 2 - 0.1;
  for (const y of [0.15, 0.75, 1.35, 1.95, spec.height - 0.05].filter(y => y < spec.height))
    for (let x = -hw; x <= hw + 1e-6; x += hw / 2)
      for (let z = -hl; z <= hl + 1e-6; z += hl / 4) pts.push([x, y, z]);
  if (spec.flying && !spec.plane) for (let t = 1; t <= 3; t++) pts.push([0, 1.3, hl + t * spec.tail / 3]);
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
