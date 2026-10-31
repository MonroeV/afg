// Smooth movement for things someone else controls (other players, their pets and cars, the
// town's people). Their positions arrive about 20 times a second, but never evenly: the network
// bunches some up and delays others. Chasing the newest position makes them speed up, slow
// down and jitter. Instead we replay their movement a tenth of a second or so behind, sliding
// between the positions they actually had at the times they had them (each update carries the
// sender's own clock), so they move at the same even pace they really did.

const MAX_SNAPS = 40;
const MAX_LEAD = 100; // ms we'll guess ahead along their last direction if an update is late
const MAX_DELAY = 350; // ms: never play back further behind than this

// Keeps a player's playback time: their clock, a little behind, moving at an even pace.
export class PlayClock {
  constructor() {
    this.reset();
  }

  reset() {
    this.off = null; // our clock minus theirs, for the quickest update we've had
    this.late = 40; // how much later than that quickest one updates can arrive (ms)
    this.gap = 60; // usual time between their updates (ms)
    this.play = null; // the moment of theirs we're showing
    this.lastTs = null;
  }

  // An update stamped `ts` on their clock just arrived.
  heard(ts, now = performance.now()) {
    const sample = now - ts;
    if (this.off === null || sample < this.off) this.off = sample;
    else if (this.lastTs !== null) this.off += Math.min(sample - this.off, 0.002 * Math.max(0, ts - this.lastTs)); // follow slow changes
    this.late = Math.min(MAX_DELAY, Math.max(this.late, sample - this.off));
    if (this.lastTs !== null && ts > this.lastTs) this.gap += (Math.min(250, ts - this.lastTs) - this.gap) * 0.1;
    this.lastTs = ts;
  }

  // Moves playback along by one frame; returns the moment of theirs to show.
  tick(dt, now = performance.now()) {
    if (this.off === null) return null;
    this.late = Math.max(0, this.late - dt * 15); // ease back once the network calms down
    const delay = Math.min(MAX_DELAY, this.gap + this.late + 15);
    const want = now - this.off - delay;
    if (this.play === null || Math.abs(want - this.play) > 400) this.play = want;
    // Run up to a quarter faster or slower to drift onto the right delay without a jump.
    else this.play += dt * 1000 * (1 + Math.max(-0.25, Math.min(0.25, (want - this.play) * 0.003)));
    return this.play;
  }
}

// The positions (and anything else) someone had, and when, to slide between.
export class Track {
  // size: how many numbers each update has. angles: which of them are angles (turn the short
  // way round). jump: farther than this between two updates is a teleport, not a walk.
  constructor(size, { angles = [], jump = 10 } = {}) {
    this.size = size;
    this.angles = new Set(angles);
    this.jump = jump;
    this.snaps = [];
    this.out = new Array(size).fill(0);
    this.extra = null;
  }

  clear() {
    this.snaps.length = 0;
  }

  get empty() {
    return !this.snaps.length;
  }

  newest() {
    return this.snaps[this.snaps.length - 1];
  }

  // Adds an update. Starts over if it doesn't follow on from the others: their clock jumped
  // (their game was in the background, or restarted).
  push(ts, values, extra = null) {
    const last = this.newest();
    if (last && (ts < last.ts - 1 || ts > last.ts + 3000)) this.clear();
    else if (last && ts <= last.ts) return; // a repeat
    this.snaps.push({ ts, v: values.slice(0, this.size), extra });
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
  }

  teleport(a, b) {
    const d = Math.hypot(b.v[0] - a.v[0], b.v[1] - a.v[1], b.v[2] - a.v[2]);
    return d > this.jump || b.ts - a.ts > 1000;
  }

  // Where they were at moment t (of their clock). Returns the numbers (or null if we have none).
  sample(t) {
    const s = this.snaps;
    if (!s.length) return null;
    if (t === null) t = s[s.length - 1].ts;
    // Forget what's long past (keeping the one just before t).
    while (s.length > 2 && s[1].ts <= t) s.shift();
    let a = s[0], b = s[1], k;
    if (!b || t <= a.ts) return this.fill(a, a, 0);
    if (t >= b.ts) {
      // Past the newest update: keep going the way they were going, briefly.
      if (this.teleport(a, b)) return this.fill(b, b, 0);
      const lead = Math.min(t - b.ts, MAX_LEAD);
      k = 1 + lead / Math.max(1, b.ts - a.ts);
      return this.fill(a, b, Math.min(k, 2));
    }
    if (this.teleport(a, b)) return this.fill(b, b, 0);
    return this.fill(a, b, (t - a.ts) / (b.ts - a.ts));
  }

  fill(a, b, k) {
    for (let i = 0; i < this.size; i++) {
      const x = a.v[i], y = b.v[i];
      if (this.angles.has(i)) {
        const d = Math.atan2(Math.sin(y - x), Math.cos(y - x));
        this.out[i] = x + d * k;
      } else this.out[i] = x + (y - x) * k;
    }
    this.extra = k >= 1 ? b.extra : a.extra;
    return this.out;
  }
}
