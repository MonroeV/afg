// The Loop Express (since v0.51): an elevated train all the way round the Outer Loop, high over
// the outside edge of the road on concrete pillars. Three trains go round and round (each player's
// game works out where they are from the game's clock, so everyone sees the same trains). At
// each stop there's a ticket machine 🚉: right-click it, pick where you're going, and you're
// lifted aboard the next train and set down again when it gets there (see trainui.js).
//
// The track and the trains are drawn by the game (nothing to knock down); the pillars and the
// ticket machines are blocks, and only ever go on empty land nobody owns.
import { DAY_LENGTH } from './blocks.js';
import { RING } from './outerlands.js';
import { FAR_ROADS } from './frontier.js';

export const TRACK_Y = 12.6; // the top of the track (the trains run on it)
export const TRAIN_SPEED = 26; // blocks a second
export const TRAINS = 3, CARS = 3, CAR_LENGTH = 7, CAR_GAP = 0.6;
export const STOP_BLOCK = 147;
const R = 14; // (how round the corners are)
// The track's line round the four sides (a block and a half outside the road's sidewalk).
const N = -RING - 3.5, S = RING + 4.5, W = -RING - 3.5, E = RING + 4.5;

// The track, as points a block or so apart (going round clockwise, seen from above), with how
// far along each one is.
function makeTrack() {
  const pts = [];
  const line = (x0, z0, x1, z1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
    for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  };
  const arc = (cx, cz, a0) => {
    const n = Math.ceil((Math.PI / 2) * R);
    for (let i = 0; i < n; i++) {
      const a = a0 + ((Math.PI / 2) * i) / n;
      pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
  };
  line(W + R, N, E - R, N);
  arc(E - R, N + R, -Math.PI / 2);
  line(E, N + R, E, S - R);
  arc(E - R, S - R, 0);
  line(E - R, S, W + R, S);
  arc(W + R, S - R, Math.PI / 2);
  line(W, S - R, W, N + R);
  arc(W + R, N + R, Math.PI);
  const at = [0];
  for (let i = 1; i <= pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i % pts.length];
    at.push(at[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  return { pts, at, length: at[pts.length] };
}
export const TRACK = makeTrack();

// Where along the track (0 to its length) is, and which way it's heading there.
export function trackPoint(s) {
  const { pts, at, length } = TRACK;
  s = ((s % length) + length) % length;
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

// The nearest spot on the track to (x, z): how far along it is.
export function nearestOnTrack(x, z) {
  let best = 0, bestD = Infinity;
  TRACK.pts.forEach(([px, pz], i) => {
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bestD) [best, bestD] = [TRACK.at[i], d];
  });
  return best;
}

// Where train k's front is at game time t (seconds since the world began: day * DAY_LENGTH + time).
export const trainFront = (k, t) => (t * TRAIN_SPEED + (k * TRACK.length) / TRAINS) % TRACK.length;
export const gameTime = (day, time) => (day || 0) * DAY_LENGTH + (time || 0);
// How far behind the front of its train a car's middle is.
export const carBack = c => c * (CAR_LENGTH + CAR_GAP) + CAR_LENGTH / 2;

// The stops: by the places out on the Outer Loop, and where the roads from town come out to it.
// (Places close together share a stop.)
const STOP_PLACES = [
  ['shop_grocery', '🛒', 'FreshMart'], ['shop_fiesta', '🌮', 'Casa Fiesta'], ['shop_salon', '💇', 'Snip & Style'],
  ['church', '⛪', 'Church'], ['airport', '✈️', 'Airport'], ['skytowers', '🏙️', 'Sky Tower'], ['park', '🤝', 'Friendship Park'],
  ['funland', '🎢', 'Fun Land'], ['zoo', '🦁', 'Zoo'], ['firestation', '🚒', 'Fire Station'],
];
const ROAD_STOPS = [[-RING, FAR_ROADS.west, '🏘️', 'West Road'], [RING, -60, '🏘️', 'East Road'], [-100, -RING, '🏘️', 'North Road']];
export function trainStops(places) {
  const stops = [];
  const add = (x, z, icon, name) => {
    const s = nearestOnTrack(x, z), near = stops.find(o => Math.abs(o.s - s) < 36 || TRACK.length - Math.abs(o.s - s) < 36);
    if (near) {
      if (!near.icon.includes(icon)) near.icon += icon;
      near.name += ` · ${name}`;
      return;
    }
    stops.push({ s, icon, name });
  };
  for (const [key, icon, name] of STOP_PLACES) if (places?.[key] && Number.isFinite(places[key].x)) add(places[key].x, places[key].z, icon, name);
  for (const [x, z, icon, name] of ROAD_STOPS) add(x, z, icon, name);
  return stops.sort((a, b) => a.s - b.s).map((st, i) => ({ ...st, id: i }));
}

// The blocks: a pillar under the track every so often, and a ticket machine at each stop (on
// the outside of the track). Only on empty land nobody owns; safe to run again (it adds just
// what's missing, so new places get stops too). Returns the stops (with their machines).
export function buildTrainLine({ get, set, canUse, places }) {
  const empty = (x, z, h) => {
    if (!canUse(x, z)) return false;
    for (let y = 0; y < h; y++) if (get(x, y, z)) return false;
    return true;
  };
  // Pillars, along the straight parts.
  for (let s = 0; s < TRACK.length; s += 24) {
    const p = trackPoint(s), x = Math.floor(p.x), z = Math.floor(p.z);
    if (Math.abs(Math.abs(p.x) - Math.abs(p.z)) < R * 2 + 10) continue; // (not round the corners)
    if (!empty(x, z, Math.ceil(TRACK_Y) + 1)) continue;
    for (let y = 0; y < Math.floor(TRACK_Y); y++) set(x, y, z, y % 4 === 3 ? 12 : 13);
  }
  // Ticket machines: just outside the track, by each stop.
  const stops = trainStops(places);
  for (const st of stops) {
    const p = trackPoint(st.s), ox = Math.abs(p.x) > Math.abs(p.z) ? Math.sign(p.x) : 0, oz = ox ? 0 : Math.sign(p.z);
    let spot = null;
    // (Already one here? Then that's it.)
    for (let d = -45; d <= 45 && !spot; d++)
      for (let out = 0; out <= 3 && !spot; out++) {
        const x = Math.floor(p.x + ox * out + (ox ? 0 : d)), z = Math.floor(p.z + oz * out + (oz ? 0 : d));
        if (get(x, 0, z) === STOP_BLOCK) spot = [x, z];
      }
    for (let d = 0; d <= 45 && !spot; d++)
      for (const sgn of d ? [1, -1] : [1]) {
        const along = d * sgn, x = Math.floor(p.x + ox * 2 + (ox ? 0 : along)), z = Math.floor(p.z + oz * 2 + (oz ? 0 : along));
        if (empty(x, z, 3)) {
          set(x, 0, z, STOP_BLOCK);
          spot = [x, z];
          break;
        }
      }
    if (spot) Object.assign(st, { x: spot[0] + 0.5, z: spot[1] + 0.5 });
  }
  return stops.filter(st => Number.isFinite(st.x));
}
