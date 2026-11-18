// Sunday at the church (see shared/church.js): the meeting, as everyone sees it. The members come
// and sit in the pews, the bishop and the speakers sit on the stand facing everyone, and Sister
// Moss plays the organ. The bishop welcomes everybody, they all sing a hymn, someone says a
// prayer, two members give short talks (in speech bubbles), they sing again and there's a closing
// prayer. Each player's game works it all out from the day and the time, so everybody sees the
// same meeting at the same moment, and the server doesn't have to run any of it.
//
// The hymn is "Old Hundredth" (the tune of "Praise God, From Whom All Blessings Flow", from 1551:
// free for anyone to play), on a synthesized organ, with a soft choir singing the tune.
import { Avatar } from './avatars.js';
import { randomLook } from './shared/avatar.js';
import { meetingAt, LEADERS } from './shared/church.js';
import { rng } from './shared/frontier.js';

const NEAR = 110; // (closer than this to the church, and the meeting's there to see)
const MEMBERS = 18; // in the pews
const SEAT_DROP = 0.72; // (sitting: how far below the seat a body's feet are, as in main.js)

// ---------- The hymn ----------
// Each line: [melody, bass] notes (MIDI), the first and last of each line held for two beats.
const midi = n => 440 * 2 ** ((n - 69) / 12);
const G = { G2: 43, A2: 45, B1: 35, B2: 47, C2: 36, D2: 38, E2: 40, Fs2: 42, D4: 62, E4: 64, Fs4: 66, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74 };
const LINES = [
  [['G4', 'G2'], ['G4', 'E2'], ['Fs4', 'D2'], ['E4', 'C2'], ['D4', 'B1'], ['G4', 'E2'], ['A4', 'D2'], ['B4', 'G2']],
  [['B4', 'G2'], ['B4', 'G2'], ['B4', 'E2'], ['A4', 'Fs2'], ['G4', 'G2'], ['C5', 'A2'], ['B4', 'D2'], ['A4', 'D2']],
  [['G4', 'E2'], ['A4', 'D2'], ['B4', 'G2'], ['A4', 'Fs2'], ['G4', 'E2'], ['E4', 'C2'], ['Fs4', 'D2'], ['G4', 'G2']],
  [['D5', 'B2'], ['B4', 'G2'], ['G4', 'E2'], ['A4', 'Fs2'], ['C5', 'A2'], ['B4', 'D2'], ['A4', 'D2'], ['G4', 'G2']],
];
const BEAT = 0.72;
// The G major scale (for the voice a third under the tune).
const SCALE = [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76];
const thirdBelow = n => SCALE[Math.max(0, SCALE.indexOf(n) - 2)] ?? n - 4;
// Every note of the hymn: { at (seconds from the start), len, melody, bass }.
const HYMN = [];
{
  let at = 0;
  for (const line of LINES) {
    line.forEach(([m, b], i) => {
      const len = (i === 0 || i === line.length - 1 ? 2 : 1) * BEAT;
      HYMN.push({ at, len: len * 0.95, melody: G[m], bass: G[b] });
      at += len;
    });
    at += BEAT; // (a breath between lines)
  }
}
export const HYMN_LENGTH = HYMN.at(-1).at + HYMN.at(-1).len;

export class ChurchMeeting {
  constructor({ scene, sounds, effects }) {
    Object.assign(this, { scene, sounds, effects });
    this.people = null; // { leaders: { bishop, … }, members: [...] }
    this.day = null;
    this.said = -2; // (which line of the program we've shown)
    this.played = -1; // (the last hymn note scheduled, and which hymn)
    this.hymnKey = null;
    this.out = null;
  }

  // Every frame: the place (from the world: see church.js), the day and time, where the camera is.
  update(dt, time, { place, day, now, camera }) {
    const m = place ? meetingAt(day, now) : null;
    const [cx, cz] = place ? [(place.chapel[0] + place.chapel[2]) / 2, (place.chapel[1] + place.chapel[3]) / 2] : [0, 0];
    const far = place ? Math.hypot(camera.x - cx, camera.z - cz) : Infinity;
    if (!m || far > NEAR) {
      this.clear();
      this.music(0);
      return;
    }
    if (!this.people || this.day !== day) this.gather(place, day);
    this.day = day;
    const { leaders, members } = this.people;
    const speaking = ['welcome', 'talk', 'prayer', 'end'].includes(m.part) ? m.who : null;
    // The speaker stands at the pulpit; everyone else sits.
    for (const [k, a] of Object.entries(leaders)) {
      if (k === 'organist') continue;
      const seat = a.home, stand = speaking === k;
      a.sitting = !stand;
      if (stand) a.target.set(place.pulpit[0], 0, place.pulpit[1]);
      else a.target.set(seat[0], 0.5 - SEAT_DROP, seat[1]);
      a.targetYaw = stand ? place.pulpit[2] : seat[2];
    }
    // Heads bowed for the prayers.
    const bow = m.part === 'prayer' ? -0.7 : 0;
    for (const a of [...members, ...Object.values(leaders)]) a.targetPitch = a === leaders[speaking] && m.part !== 'prayer' ? 0 : bow;
    // Say each line as it comes.
    if (m.i !== this.said) {
      this.said = m.i;
      if (speaking && m.line) leaders[speaking].say(m.line, m.part === 'prayer' ? 9 : 7.5);
    }
    // Singing (music notes over the members), and the organ.
    const hymn = m.part === 'hymn' || m.part === 'prelude';
    if (m.part === 'hymn') for (const a of members) if (Math.random() < dt * 0.35) this.effects.note(a.pos.x, a.pos.y + 1.9, a.pos.z);
    const inside = camera.x >= place.chapel[0] - 1 && camera.x <= place.chapel[2] + 2 && camera.z >= place.chapel[1] - 1 && camera.z <= place.chapel[3] + 2;
    const loud = inside ? 1 : Math.max(0, 1 - far / 45) * 0.5;
    this.music(hymn ? loud * (m.part === 'prelude' ? 0.45 : 1) : 0, m, now);
    for (const a of [...members, ...Object.values(leaders)]) a.update(dt, time);
  }

  // Everybody arrives: the leaders on the stand, the organist at the organ, members in the pews
  // (different people each Sunday).
  gather(place, day) {
    this.clear();
    const rand = rng(1000 + day * 7);
    const make = (name, look, [x, z, yaw], sit = true, y = 0.5) => {
      const a = new Avatar(this.scene, { id: -900 - Math.floor(rand() * 1e6), name, look, pos: [x, sit ? y - SEAT_DROP : 0, z], rot: [yaw, 0] }, { tag: !!name });
      a.sitting = sit;
      a.home = [x, z, yaw];
      return a;
    };
    const leaders = {
      bishop: make(LEADERS.bishop.name, LEADERS.bishop.look, place.seats[2]),
      sister: make(LEADERS.sister.name, LEADERS.sister.look, place.seats[3]),
      brother: make(LEADERS.brother.name, LEADERS.brother.look, place.seats[4]),
      organist: make(LEADERS.organist.name, LEADERS.organist.look, place.organ),
    };
    const spots = [...place.pews].sort(() => rand() - 0.5).slice(0, MEMBERS);
    const members = spots.map(spot => {
      const look = randomLook(rand);
      // (Sunday best: jackets and dresses, no hats, everyday hair and smiles.)
      const pick = list => list[Math.floor(rand() * list.length)];
      Object.assign(look, {
        hat: 'none', extra: 'none', pet: 'none', shirt: rand() < 0.5 ? 'jacket' : 'dress', shirtColor2: '#ffffff',
        face: pick(['smile', 'grin', 'wink', 'smile']), hair: pick(['short', 'long', 'ponytail', 'buns', 'afro', 'short', 'curly', 'braids']),
        hairColor: pick(['#1b1209', '#3b2314', '#6b3e1f', '#a0632b', '#d9a441', '#f3d98b', '#c23b22', '#e8e8e8']),
      });
      look.pants = look.shirt === 'dress' ? 'skirt' : 'jeans';
      return make('', look, spot, true, 0.45);
    });
    this.people = { leaders, members };
    this.said = -2;
  }

  clear() {
    if (!this.people) return;
    for (const a of [...this.people.members, ...Object.values(this.people.leaders)]) a.dispose();
    this.people = null;
  }

  // ---------- The organ and the choir ----------

  // volume 0..1; m: the meeting now (the hymn's place in it); now: the game's time.
  music(volume, m = null, now = 0) {
    const ctx = volume > 0.01 ? this.sounds.ensure() : this.sounds.ctx;
    if (!ctx) return;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.sounds.master);
    }
    this.out.gain.setTargetAtTime(volume * 0.55, ctx.currentTime, 0.4);
    if (volume <= 0.01 || !m) {
      this.hymnKey = null;
      return;
    }
    // Where we are in the hymn (the prelude plays it over and over, softly).
    const pos = m.part === 'prelude' ? ((m.t % (HYMN_LENGTH + 3)) + HYMN_LENGTH + 3) % (HYMN_LENGTH + 3) : m.since;
    const key = `${m.part}:${m.i}:${m.part === 'prelude' ? Math.floor((m.t + 1000 * (HYMN_LENGTH + 3)) / (HYMN_LENGTH + 3)) : 0}`;
    if (key !== this.hymnKey) {
      this.hymnKey = key;
      this.played = HYMN.findIndex(n => n.at >= pos) - 1; // (start from here: we may have come in late)
      if (this.played < -1) this.played = HYMN.length;
    }
    const choir = m.part === 'hymn';
    while (this.played + 1 < HYMN.length && HYMN[this.played + 1].at < pos + 0.35) {
      const n = HYMN[++this.played], t = ctx.currentTime + Math.max(0, n.at - pos);
      this.organ(ctx, midi(n.melody), t, n.len, 0.11);
      this.organ(ctx, midi(thirdBelow(n.melody)), t, n.len, 0.06);
      this.organ(ctx, midi(n.bass), t, n.len, 0.09);
      if (choir) this.voice(ctx, midi(n.melody), t, n.len);
    }
  }

  // An organ pipe: a soft start, steady while held, a short fade. A few harmonics make it sound
  // like a pipe organ rather than a beep.
  organ(ctx, f, t, len, gain) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.06);
    g.gain.setValueAtTime(gain, t + len - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.12);
    g.connect(this.out);
    for (const [mul, level, type] of [[1, 1, 'sine'], [2, 0.45, 'sine'], [3, 0.2, 'triangle'], [4, 0.12, 'sine']]) {
      const o = ctx.createOscillator(), h = ctx.createGain();
      o.type = type;
      o.frequency.value = f * mul;
      h.gain.value = level;
      o.connect(h).connect(g);
      o.start(t);
      o.stop(t + len + 0.2);
    }
  }

  // The choir singing the tune: "aah", a warm voice with a gentle vibrato.
  voice(ctx, f, t, len) {
    const g = ctx.createGain(), filter = ctx.createBiquadFilter(), vib = ctx.createOscillator(), depth = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
    g.gain.setValueAtTime(0.05, t + len - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.15);
    vib.frequency.value = 5;
    depth.gain.value = f * 0.008;
    vib.connect(depth);
    for (const detune of [-8, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      depth.connect(o.frequency);
      o.connect(filter);
      o.start(t);
      o.stop(t + len + 0.2);
    }
    vib.start(t);
    vib.stop(t + len + 0.2);
    filter.connect(g).connect(this.out);
  }
}
