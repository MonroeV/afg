// The Loop Express (since v0.51; two tracks and real stations since v0.55): an elevated railway
// all the way round the Outer Loop, high over the outside edge of the road on concrete pillars.
// There are two tracks side by side: on the inner one the trains go round clockwise (seen from
// above), on the outer one the other way. Four trains run on each track, to a timetable: each
// one slows into every station, stops, opens its doors, waits, shuts them and pulls away again.
// Every player's game works the trains out from the game's clock, so everyone sees the same
// trains in the same places.
//
// The stations are blocks: an island platform between the two tracks (level with the trains'
// floors), with a roof, lamps, benches and the station's name, and stairs down to the ground.
// No tickets: walk in through the open doors, ride, and walk out at any station you like (see
// trainui.js). The track and the trains are drawn by the game (nothing to knock down); the
// pillars and the stations only ever go on empty land nobody owns.
import { DAY_LENGTH, makeBlock, SIGN } from './blocks.js';
import { RING } from './outerlands.js';
import { FAR_ROADS } from './frontier.js';

export const TRACK_Y = 12.6; // the top of the track (the trains' wheels run on it)
export const FLOOR_Y = 0.4; // a car's floor, above TRACK_Y: level with the platforms (y 13)
export const PLATFORM_Y = 12; // (the platforms' blocks: their tops at y 13)
export const TRAIN_SPEED = 28; // top speed, blocks a second
export const ACCEL = 3; // speeding up and slowing down, blocks a second per second
export const DWELL = 12; // seconds stopped at a station (the doors open for most of it)
export const TRAINS = 4; // on each track
export const CARS = 3, CAR_LENGTH = 7, CAR_GAP = 0.6, CAR_WIDTH = 2.6, CAR_HEIGHT = 2.3;
export const TRAIN_LENGTH = CARS * CAR_LENGTH + (CARS - 1) * CAR_GAP;
export const DOOR_AT = [-1.9, 1.9], DOOR_WIDTH = 1.4; // (each car's doors, both sides: along the car)
export const STOP_BLOCK = 147; // (the old ticket machines: now they tell you when the trains come)
export const STAIRS = 149;
const R = 14; // (how round the corners are)
const APART = 6; // (the two tracks' middles: the platforms fit between them)
const PLATFORM = 26, STEPS = 13; // (a platform's length; its stairs, one block down each)
// The inner track's line round the four sides (a block and a half outside the road's sidewalk).
const N = -RING - 3.5, S = RING + 4.5, W = -RING - 3.5, E = RING + 4.5;

// A track: points a block or so apart all the way round (in the way its trains go), how far
// along each one is, and its length. d: how far out from the inner track's line.
function makeTrack(d, backward) {
  const pts = [], r = R + d, [n, s, w, e] = [N - d, S + d, W - d, E + d];
  const line = (x0, z0, x1, z1) => {
    const k = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
    for (let i = 0; i < k; i++) pts.push([x0 + ((x1 - x0) * i) / k, z0 + ((z1 - z0) * i) / k]);
  };
  const arc = (cx, cz, a0) => {
    const k = Math.ceil((Math.PI / 2) * r);
    for (let i = 0; i < k; i++) {
      const a = a0 + ((Math.PI / 2) * i) / k;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  line(w + r, n, e - r, n);
  arc(e - r, n + r, -Math.PI / 2);
  line(e, n + r, e, s - r);
  arc(e - r, s - r, 0);
  line(e - r, s, w + r, s);
  arc(w + r, s - r, Math.PI / 2);
  line(w, s - r, w, n + r);
  arc(w + r, n + r, Math.PI);
  if (backward) pts.reverse();
  const at = [0];
  for (let i = 1; i <= pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i % pts.length];
    at.push(at[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  return { pts, at, length: at[pts.length] };
}
// Track 0: the inner one (clockwise); track 1: the outer one (the other way round).
export const TRACKS = [makeTrack(0, false), makeTrack(APART, true)];
export const TRACK = TRACKS[0];
const mod = (a, m) => ((a % m) + m) % m;

// Where along a track (0 to its length) is, and which way it's heading there.
export function trackPoint(s, track = TRACK) {
  const { pts, at, length } = track;
  s = mod(s, length);
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (at[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const [ax, az] = pts[lo], [bx, bz] = pts[(lo + 1) % pts.length];
  const k = (s - at[lo]) / Math.max(1e-6, at[lo + 1] - at[lo]);
  return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, yaw: Math.atan2(-(bx - ax), -(bz - az)) };
}

// The nearest spot on a track to (x, z): how far along it is.
export function nearestOnTrack(x, z, track = TRACK) {
  const { pts, at } = track;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2, k = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len2 || 1)));
    const px = ax + (bx - ax) * k, pz = az + (bz - az) * k, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bestD) [best, bestD] = [at[i] + k * Math.sqrt(len2), d];
  }
  return best;
}

export const gameTime = (day, time) => (day || 0) * DAY_LENGTH + (time || 0);
// How far behind the front of its train a car's middle is.
export const carBack = c => c * (CAR_LENGTH + CAR_GAP) + CAR_LENGTH / 2;

// ---------- The timetable ----------

// How long a run of D blocks takes (from standing to standing), and how far along it is after
// τ seconds, and how fast it's going.
function runTime(D) {
  const ta = TRAIN_SPEED / ACCEL, da = (TRAIN_SPEED * ta) / 2;
  return D >= 2 * da ? 2 * ta + (D - 2 * da) / TRAIN_SPEED : 2 * Math.sqrt(D / ACCEL);
}
function runAt(D, T, tau) {
  const ta = TRAIN_SPEED / ACCEL, da = (TRAIN_SPEED * ta) / 2;
  if (D >= 2 * da) {
    if (tau < ta) return [0.5 * ACCEL * tau * tau, ACCEL * tau];
    if (tau < T - ta) return [da + TRAIN_SPEED * (tau - ta), TRAIN_SPEED];
    const r = T - tau;
    return [D - 0.5 * ACCEL * r * r, ACCEL * r];
  }
  if (tau < T / 2) return [0.5 * ACCEL * tau * tau, ACCEL * tau];
  const r = T - tau;
  return [D - 0.5 * ACCEL * r * r, ACCEL * r];
}

// Each track's timetable, from its stations (where each train's front stops): a stop (with its
// doors) and a run to the next, all the way round. { track, legs: [{ t0, s0, D, run, station }], lap }
export function timetables(stations) {
  return TRACKS.map((track, ti) => {
    const stops = (stations || []).filter(st => Number.isFinite(st.s?.[ti])).map(st => ({ s: st.s[ti], id: st.id })).sort((a, b) => a.s - b.s);
    if (!stops.length) return { track, legs: [], lap: track.length / TRAIN_SPEED };
    const legs = [];
    let t = 0;
    stops.forEach((st, i) => {
      const next = stops[(i + 1) % stops.length], D = mod(next.s - st.s, track.length) || track.length, run = runTime(D);
      legs.push({ t0: t, s0: st.s, D, run, station: st.id });
      t += DWELL + run;
    });
    return { track, legs, lap: t };
  });
}

// Train k on a track at game time t: its front (how far along), its speed, and (stopped at a
// station) which one, and how open its doors are (0 shut to 1 open).
export function trainAt(table, k, t) {
  const { legs, lap, track } = table;
  if (!legs.length) return { s: mod(t * TRAIN_SPEED + (k * track.length) / TRAINS, track.length), v: TRAIN_SPEED, station: null, doors: 0 };
  const tt = mod(t + (k * lap) / TRAINS, lap);
  let leg = legs[legs.length - 1];
  for (const l of legs) if (l.t0 <= tt) leg = l;
  const tau = tt - leg.t0;
  if (tau < DWELL) {
    // Stopped: the doors slide open, stay open, slide shut; then a moment to go.
    const doors = tau < 1 ? 0 : tau < 2 ? tau - 1 : tau < DWELL - 3 ? 1 : tau < DWELL - 2 ? DWELL - 2 - tau : 0;
    return { s: leg.s0, v: 0, station: leg.station, doors, wait: DWELL - tau };
  }
  const [d, v] = runAt(leg.D, leg.run, tau - DWELL);
  return { s: mod(leg.s0 + d, track.length), v, station: null, doors: 0 };
}

// When the next train on a track stops at a station (seconds from now), if one ever does.
export function nextTrain(table, stationId, t) {
  const leg = table.legs.find(l => l.station === stationId);
  if (!leg) return null;
  let best = Infinity;
  for (let k = 0; k < TRAINS; k++) {
    const tt = mod(t + (k * table.lap) / TRAINS, table.lap), d = mod(leg.t0 - tt, table.lap);
    best = Math.min(best, d > table.lap - DWELL + 2 ? 0 : d); // (one there now, doors still open: 0)
  }
  return best;
}

// ---------- The stations ----------

// Where they go: by the places out on the Outer Loop, and where the roads from town come out
// to it. (Places close together share a station.)
const STOP_PLACES = [
  ['shop_grocery', '🛒', 'FreshMart'], ['shop_fiesta', '🌮', 'Casa Fiesta'], ['shop_salon', '💇', 'Snip & Style'],
  ['church', '⛪', 'Church'], ['airport', '✈️', 'Airport'], ['skytowers', '🏙️', 'Sky Tower'], ['park', '🤝', 'Friendship Park'],
  ['funland', '🎢', 'Fun Land'], ['zoo', '🦁', 'Zoo'], ['firestation', '🚒', 'Fire Station'], ['dealer', '🚗', 'BuildZone Motors'], ['farm', '🐄', 'Sunny Acres Farm'], ['raceway', '🏎️', 'Thunder Raceway'], ['space', '🚀', 'Space Center'],
];
const ROAD_STOPS = [[-RING, FAR_ROADS.west, '🏘️', 'West Road'], [RING, -60, '🏘️', 'East Road'], [-100, -RING, '🏘️', 'North Road']];
const MERGE = 60;
export function trainStops(places) {
  const stops = [];
  const add = (x, z, icon, name) => {
    const s = nearestOnTrack(x, z), near = stops.find(o => Math.abs(o.s - s) < MERGE || TRACK.length - Math.abs(o.s - s) < MERGE);
    if (near) {
      if (!near.icon.includes(icon)) near.icon += icon;
      near.name += ` · ${name}`;
      return;
    }
    stops.push({ s, icon, name });
  };
  for (const [key, icon, name] of STOP_PLACES) if (places?.[key] && Number.isFinite(places[key].x)) add(places[key].x, places[key].z, icon, name);
  for (const [x, z, icon, name] of ROAD_STOPS) add(x, z, icon, name);
  return stops.sort((a, b) => a.s - b.s);
}

// The blocks: a pillar under each track every so often, and a station by each stop (on empty
// land nobody owns, along a straight bit of the track as near the stop as there's room). Safe to
// run again: stations already built stay (`old`), and new places get stations too. Returns the
// stations, and the signs on them.
export function buildTrainLine({ get, set, canUse, places, old = [] }) {
  const empty = (x, z, y0, y1) => {
    if (!canUse(x, z)) return false;
    for (let y = y0; y <= y1; y++) if (get(x, y, z)) return false;
    return true;
  };
  // Pillars, along the straight parts.
  for (const track of TRACKS)
    for (let s = 0; s < track.length; s += 24) {
      const p = trackPoint(s, track), x = Math.floor(p.x), z = Math.floor(p.z);
      if (Math.abs(Math.abs(p.x) - Math.abs(p.z)) < R * 2 + 20) continue; // (not round the corners)
      if (!empty(x, z, 0, Math.ceil(TRACK_Y) + 1)) continue;
      for (let y = 0; y < Math.floor(TRACK_Y); y++) set(x, y, z, y % 4 === 3 ? 12 : 13);
    }
  const stations = (Array.isArray(old) ? old : []).filter(st => Number.isFinite(st?.x)).map(st => ({ ...st }));
  const signs = [];
  let nextId = stations.reduce((m, st) => Math.max(m, st.id + 1), 0);
  const renamed = new Set();
  for (const stop of trainStops(places)) {
    // (Already a station by this stop? Then that's it, with its name brought up to date.)
    const have = stations.find(st => Math.abs(mod(st.sc - stop.s + TRACK.length / 2, TRACK.length) - TRACK.length / 2) < MERGE + 30);
    if (have) {
      // (Two stops sharing a station this time round: it gets both their names.)
      const both = renamed.has(have) && !have.name.includes(stop.name);
      const icon = both ? have.icon + (have.icon.includes(stop.icon) ? '' : stop.icon) : stop.icon, name = both ? `${have.name} · ${stop.name}` : stop.name;
      renamed.add(have);
      if (have.name !== name) {
        Object.assign(have, { icon, name });
        for (const [x, y, z] of have.signs || []) signs.push([x, y, z, `🚉 ${have.icon} ${name}`]);
      }
      continue;
    }
    const st = findStation(stop, stations, empty);
    if (!st) continue;
    buildStation(st, set, signs, `🚉 ${stop.icon} ${stop.name}`);
    stations.push({ ...st, id: nextId++, icon: stop.icon, name: stop.name });
  }
  return { stations: stations.sort((a, b) => a.sc - b.sc), signs };
}

// Somewhere for a station near a stop: a straight bit of track with empty, unowned land for the
// platform (up high) and the stairs (down to the ground), not too near another station.
function findStation(stop, stations, empty) {
  for (let i = 0; i <= 40; i++) {
    const shift = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 4, sc = mod(stop.s + shift, TRACK.length);
    const p = trackPoint(sc), yaw = p.yaw;
    // (A straight bit: the same way all along, platform, stairs and all.)
    const reach = PLATFORM / 2 + STEPS + 4;
    if ([-reach, -reach / 2, reach / 2, reach].some(d => Math.abs(Math.sin(trackPoint(sc + d).yaw - yaw)) > 1e-3 || Math.abs(Math.cos(trackPoint(sc + d).yaw - yaw) - 1) > 1e-3)) continue;
    if (stations.some(o => Math.abs(mod(o.sc - sc + TRACK.length / 2, TRACK.length) - TRACK.length / 2) < PLATFORM + 2 * STEPS + 10)) continue;
    // The axes: along the track (ax, az), and out across it (ox, oz: away from the middle of the
    // world, toward the outer track).
    const ax = Math.round(-Math.sin(yaw)), az = Math.round(-Math.cos(yaw));
    const ox = Math.abs(p.x) > Math.abs(p.z) ? Math.sign(p.x) : 0, oz = ox ? 0 : Math.sign(p.z);
    // The platform's middle (between the tracks), and its cells: 3 across, PLATFORM along.
    const mx = p.x + ox * (APART / 2), mz = p.z + oz * (APART / 2);
    const along = ax ? Math.round(mx) : Math.round(mz), across = Math.floor((ox ? mx : mz) - 1.5);
    const cell = (a, c) => (ax ? [a, c] : [c, a]);
    const a0 = along - PLATFORM / 2;
    let ok = true;
    for (let a = a0; a < a0 + PLATFORM && ok; a++) for (let c = across; c < across + 3 && ok; c++) ok = empty(...cell(a, c), PLATFORM_Y - 1, PLATFORM_Y + 5);
    if (!ok) continue;
    // The stairs, at one end or the other (whichever has room).
    for (const end of [1, -1]) {
      const stepA = d => (end > 0 ? a0 + PLATFORM + d : a0 - 1 - d);
      let room = true;
      for (let d = 0; d < STEPS && room; d++) for (let c = across; c < across + 3 && room; c++) room = empty(...cell(stepA(d), c), 0, PLATFORM_Y + 2);
      for (let c = across; c < across + 3 && room; c++) room = empty(...cell(stepA(STEPS), c), 0, 2); // (room to walk off the bottom step)
      if (!room) continue;
      const [cx, cz] = ax ? [along, across + 1.5] : [across + 1.5, along];
      // Where each track's trains stop: their middles beside the middle of the platform.
      const s = TRACKS.map(track => mod(nearestOnTrack(cx, cz, track) + TRAIN_LENGTH / 2, track.length));
      return { x: cx, z: cz, sc: nearestOnTrack(cx, cz), s, ax, az, ox, oz, a0, across, end, steps: [...Array(STEPS)].map((_, d) => cell(stepA(d), across + 1)) };
    }
  }
  return null;
}

function buildStation(st, set, signs, text) {
  const { ax, a0, across, end } = st;
  const cell = (a, c) => (ax ? [a, c] : [c, a]);
  const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
  const B = { concrete: 13, stone: 3, white: 12, yellow: 16, log: 7, lamp: 41, chair: 60, lantern: 45 };
  const P = PLATFORM_Y, mid = across + 1;
  // The platform: stone, with yellow lines along both edges (mind the gap!). (Not concrete: a
  // Concrete block beside a Paint block, with nothing on top, makes a Build Book bed!)
  for (let a = a0; a < a0 + PLATFORM; a++)
    for (let c = across; c < across + 3; c++) {
      const [x, z] = cell(a, c);
      set(x, P, z, c === mid ? B.stone : B.yellow);
      set(x, P + 4, z, B.white); // (the roof)
    }
  // Posts holding up the roof (down the middle), lamps under it, benches between.
  for (const a of [a0 + 1, a0 + 9, a0 + 16, a0 + PLATFORM - 2]) {
    const [x, z] = cell(a, mid);
    for (let y = P + 1; y < P + 4; y++) set(x, y, z, B.concrete);
  }
  for (const a of [a0 + 5, a0 + 13, a0 + 20]) {
    const [x, z] = cell(a, mid);
    set(x, P + 3, z, B.lamp);
  }
  // (Benches facing each way: toward the inner track and the outer one.)
  const [ix, iz] = [-st.ox, -st.oz];
  for (const [a, out] of [[a0 + 4, 1], [a0 + 6, -1], [a0 + 19, 1], [a0 + 21, -1]]) {
    const [x, z] = cell(a, mid);
    set(x, P + 1, z, makeBlock(B.chair, out > 0 ? faceDir(st.ox, st.oz) : faceDir(ix, iz)));
  }
  // The station's name, under the roof in the middle (one each way).
  for (const [a, out] of [[a0 + 12, -1], [a0 + 13, 1]]) {
    const [x, z] = cell(a, mid);
    set(x, P + 3, z, makeBlock(SIGN, out > 0 ? faceDir(st.ox, st.oz) : faceDir(ix, iz)));
    signs.push([x, P + 3, z, text]);
  }
  st.signs = signs.slice(-2).map(([x, y, z]) => [x, y, z]);
  // The stairs down (three wide, solid underneath), and lanterns at the bottom.
  const down = end > 0 ? [st.ax, st.az] : [-st.ax, -st.az];
  for (let d = 0; d < STEPS; d++)
    for (let c = across; c < across + 3; c++) {
      const a = end > 0 ? a0 + PLATFORM + d : a0 - 1 - d, [x, z] = cell(a, c), y = P - d;
      set(x, y, z, makeBlock(STAIRS, faceDir(...down)));
      for (let yy = 0; yy < y; yy++) set(x, yy, z, B.concrete);
    }
  const foot = end > 0 ? a0 + PLATFORM + STEPS : a0 - 1 - STEPS;
  for (const c of [across - 1, across + 3]) {
    const [x, z] = cell(foot, c);
    set(x, 0, z, B.lantern);
  }
}

// (v0.55's stations had concrete down the middle of their platforms, beside the yellow edges:
// which the game took for Build Book beds. Right-click one from a train and you lay down on the
// platform. Their middles become stone, as new stations' are: only our own concrete, there.)
export function fixPlatforms({ get, set, stations }) {
  let fixed = 0;
  for (const st of stations || []) {
    if (!Number.isFinite(st.a0) || !Number.isFinite(st.across)) continue;
    for (let a = st.a0; a < st.a0 + PLATFORM; a++) {
      const [x, z] = st.ax ? [a, st.across + 1] : [st.across + 1, a];
      if (get(x, PLATFORM_Y, z) === 13) {
        set(x, PLATFORM_Y, z, 3);
        fixed++;
      }
    }
  }
  return fixed;
}
