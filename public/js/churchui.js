// The church's meetings (see shared/church.js), as everyone sees them: Sunday morning's (below),
// Youth Night on Wednesday evening (the youth leaders, a hidden-gift hunt, a thought, "Amazing
// Grace") and the Sunday evening fireside (Brother Hale's talk). On Sunday morning the members come
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
import * as THREE from 'three';
import { meetingAt, giftSpots, LEADERS } from './shared/church.js';
import { rng } from './shared/frontier.js';

const NEAR = 110; // (closer than this to the church, and the meeting's there to see)
const MEMBERS = 18; // in the pews
const SEAT_DROP = 0.72; // (sitting: how far below the seat a body's feet are, as in main.js)

// ---------- The hymns ----------
// Notes are MIDI numbers. Old Hundredth: each line [melody, bass], the first and last of each line
// held for two beats.
const midi = n => 440 * 2 ** ((n - 69) / 12);
const G = { G2: 43, A2: 45, B1: 35, B2: 47, C2: 36, D2: 38, E2: 40, Fs2: 42, D4: 62, E4: 64, Fs4: 66, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74 };
const LINES = [
  [['G4', 'G2'], ['G4', 'E2'], ['Fs4', 'D2'], ['E4', 'C2'], ['D4', 'B1'], ['G4', 'E2'], ['A4', 'D2'], ['B4', 'G2']],
  [['B4', 'G2'], ['B4', 'G2'], ['B4', 'E2'], ['A4', 'Fs2'], ['G4', 'G2'], ['C5', 'A2'], ['B4', 'D2'], ['A4', 'D2']],
  [['G4', 'E2'], ['A4', 'D2'], ['B4', 'G2'], ['A4', 'Fs2'], ['G4', 'E2'], ['E4', 'C2'], ['Fs4', 'D2'], ['G4', 'G2']],
  [['D5', 'B2'], ['B4', 'G2'], ['G4', 'E2'], ['A4', 'Fs2'], ['C5', 'A2'], ['B4', 'D2'], ['A4', 'D2'], ['G4', 'G2']],
];
// "Amazing Grace" (the tune "New Britain", from 1829: free for anyone to play), in 3/4: bars of
// [melody, beats] and the bass note for the bar.
const GRACE = [
  [[['D4', 1]], 'D2'],
  [[['G4', 2], ['B4', 0.5], ['G4', 0.5]], 'G2'], [[['B4', 2], ['A4', 1]], 'G2'], [[['G4', 2], ['E4', 1]], 'C2'], [[['D4', 2], ['D4', 1]], 'G2'],
  [[['G4', 2], ['B4', 0.5], ['G4', 0.5]], 'G2'], [[['B4', 2], ['A4', 1]], 'E2'], [[['D5', 3]], 'D2'], [[['D5', 2], ['B4', 1]], 'D2'],
  [[['D5', 2], ['B4', 0.5], ['G4', 0.5]], 'G2'], [[['B4', 2], ['A4', 1]], 'G2'], [[['G4', 2], ['E4', 1]], 'C2'], [[['D4', 2], ['D4', 1]], 'G2'],
  [[['G4', 2], ['B4', 0.5], ['G4', 0.5]], 'G2'], [[['B4', 2], ['A4', 1]], 'D2'], [[['G4', 3]], 'G2'], [[['G4', 2]], 'G2'],
];
// The G major scale (for the voice a third under the tune).
const SCALE = [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76];
const thirdBelow = n => SCALE[Math.max(0, SCALE.indexOf(n) - 2)] ?? n - 4;
// Every note of each hymn: { at (seconds from the start), len, melody, bass }.
const TUNES = { old100: [], grace: [] };
{
  const BEAT = 0.72;
  let at = 0;
  for (const line of LINES) {
    line.forEach(([m, b], i) => {
      const len = (i === 0 || i === line.length - 1 ? 2 : 1) * BEAT;
      TUNES.old100.push({ at, len: len * 0.95, melody: G[m], bass: G[b] });
      at += len;
    });
    at += BEAT; // (a breath between lines)
  }
  const GBEAT = 0.62;
  at = 0;
  for (const [notes, bass] of GRACE)
    for (const [m, beats] of notes) {
      TUNES.grace.push({ at, len: beats * GBEAT * 0.95, melody: G[m], bass: G[bass] });
      at += beats * GBEAT;
    }
}
const tuneLength = notes => notes.at(-1).at + notes.at(-1).len;
export const HYMN_LENGTH = tuneLength(TUNES.old100);
export const TUNE_LENGTHS = Object.fromEntries(Object.entries(TUNES).map(([k, n]) => [k, tuneLength(n)]));

// A gift box (for Youth Night's game): a box in a bright color, a ribbon round it and a bow.
function giftModel(color) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.4, emissive: 0x332200 });
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.08), ribbonMat), r2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.44), ribbonMat);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 12), ribbonMat);
  bow.position.y = 0.24;
  const bow2 = bow.clone();
  bow2.rotation.y = Math.PI / 2;
  g.add(box, r1, r2, bow, bow2);
  return g;
}
const GIFT_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0x8e24aa, 0xfb8c00, 0x00acc1, 0xd81b60, 0x3949ab];

export class ChurchMeeting {
  constructor({ scene, sounds, effects, onGift = () => {} }) {
    Object.assign(this, { scene, sounds, effects, onGift });
    this.people = null; // { leaders: { bishop, … }, members: [...] }
    this.key = null; // (which meeting: the day and its key)
    this.said = -2; // (which line of the program we've shown)
    this.played = -1; // (the last hymn note scheduled, and which hymn)
    this.hymnKey = null;
    this.out = null;
    this.gifts = null; // Youth Night's hidden gifts: [{ i, x, z, mesh }]
    this.found = new Set(); // (gifts somebody's found: `${day}:${i}`)
    this.asked = 0;
  }

  // Somebody found a gift (the server says): it's gone for everyone.
  giftFound(day, i) {
    this.found.add(`${day}:${i}`);
    const g = this.gifts?.find(o => o.i === i && o.day === day);
    if (!g || !g.mesh.visible) return;
    g.mesh.visible = false;
    this.effects.sparkle(g.x, 0.8, g.z, 20);
  }

  // Every frame: the place (from the world: see church.js), the day and time, where the camera
  // is, and where you are (for finding gifts).
  update(dt, time, { place, day, now, camera, player = null }) {
    const m = place ? meetingAt(day, now) : null;
    const [cx, cz] = place ? [(place.chapel[0] + place.chapel[2]) / 2, (place.chapel[1] + place.chapel[3]) / 2] : [0, 0];
    const far = place ? Math.hypot(camera.x - cx, camera.z - cz) : Infinity;
    if (!m || far > NEAR) {
      this.clear();
      this.music(0);
      return;
    }
    const meet = m.meeting, key = `${day}:${meet.key}`;
    if (!this.people || this.key !== key) this.gather(place, day, meet);
    this.key = key;
    const { leaders, members } = this.people;
    const speaking = ['welcome', 'talk', 'prayer', 'end', 'thought', 'game'].includes(m.part) ? m.who : null;
    // The speaker stands at the pulpit; everyone else sits.
    for (const [k, a] of Object.entries(leaders)) {
      if (k === 'organist') continue;
      const seat = a.home, stand = speaking === k;
      a.sitting = !stand;
      if (stand) a.target.set(place.pulpit[0], 0, place.pulpit[1]);
      else a.target.set(seat[0], 0.5 - SEAT_DROP, seat[1]);
      a.targetYaw = stand ? place.pulpit[2] : seat[2];
    }
    // Youth Night's game: everyone's up and hunting round the chapel for the gifts.
    const game = m.part === 'game';
    members.forEach((a, n) => {
      if (game) {
        const [x0, z0, x1, z1] = place.chapel, k = Math.floor(m.t / 5) + n * 7;
        const fx = ((k * 0.618) % 1), fz = ((k * 0.381 + n * 0.17) % 1);
        // (walking there, not gliding)
        const gx = x0 + 1 + fx * (x1 - x0 - 1), gz = z0 + 1 + fz * (z1 - z0 - 3), dx = gx - a.target.x, dz = gz - a.target.z, d = Math.hypot(dx, dz);
        if (a.sitting) a.target.y = 0;
        a.sitting = false;
        const step = Math.min(d, dt * 2.6);
        if (d > 0.05) {
          a.target.x += (dx / d) * step;
          a.target.z += (dz / d) * step;
          a.targetYaw = Math.atan2(-dx, -dz);
        }
      } else {
        a.sitting = true;
        a.target.set(a.home[0], a.homeY, a.home[1]);
        a.targetYaw = a.home[2];
      }
    });
    // Heads bowed for the prayers.
    const bow = m.part === 'prayer' ? -0.7 : 0;
    for (const a of [...members, ...Object.values(leaders)]) a.targetPitch = a === leaders[speaking] && m.part !== 'prayer' ? 0 : bow;
    // Say each line as it comes.
    if (m.i !== this.said) {
      this.said = m.i;
      if (speaking && m.line) leaders[speaking].say(m.line, m.part === 'prayer' ? 9 : 7.5);
    }
    this.updateGifts(dt, time, place, day, m, player);
    // Singing (music notes over the members), and the organ.
    const hymn = m.part === 'hymn' || m.part === 'prelude';
    if (m.part === 'hymn') for (const a of members) if (Math.random() < dt * 0.35) this.effects.note(a.pos.x, a.pos.y + 1.9, a.pos.z);
    const inside = camera.x >= place.chapel[0] - 1 && camera.x <= place.chapel[2] + 2 && camera.z >= place.chapel[1] - 1 && camera.z <= place.chapel[3] + 2;
    const loud = inside ? 1 : Math.max(0, 1 - far / 45) * 0.5;
    this.music(hymn ? loud * (m.part === 'prelude' ? 0.45 : 1) : 0, m, now);
    for (const a of [...members, ...Object.values(leaders)]) a.update(dt, time);
  }

  // Youth Night's gifts: out during the game (bobbing and sparkling), gone when found. Walk up
  // to one to find it (the server checks, and pays).
  updateGifts(dt, time, place, day, m, player) {
    const game = m.part === 'game';
    if (game && !this.gifts) {
      this.gifts = giftSpots(place, day).map(([x, z], i) => {
        const mesh = giftModel(GIFT_COLORS[i % GIFT_COLORS.length]);
        mesh.position.set(x, 0.62, z);
        mesh.visible = !this.found.has(`${day}:${i}`);
        this.scene.add(mesh);
        return { i, x, z, mesh, day };
      });
    }
    if (!game) return this.clearGifts();
    for (const g of this.gifts) {
      if (!g.mesh.visible) continue;
      g.mesh.position.y = 0.62 + Math.sin(time * 3 + g.i) * 0.06;
      g.mesh.rotation.y += dt * 1.2;
      if (Math.random() < dt * 1.5) this.effects.sparkle(g.x, 0.9, g.z, 2);
      if (player && time - this.asked > 1 && Math.hypot(player.x - g.x, player.z - g.z) < 1.3 && player.y < 3) {
        this.asked = time;
        this.onGift(g.i);
      }
    }
  }

  clearGifts() {
    if (!this.gifts) return;
    for (const g of this.gifts) {
      this.scene.remove(g.mesh);
      g.mesh.traverse(o => o.geometry?.dispose());
    }
    this.gifts = null;
  }

  // Everybody arrives: the leaders on the stand, the organist at the organ, members in the pews
  // (different people each time). Sundays they're in their Sunday best; Youth Night is kids in
  // everyday clothes.
  gather(place, day, meet) {
    this.clear();
    const rand = rng(1000 + day * 7 + (meet.key === 'sunday' ? 0 : meet.key === 'youth' ? 3 : 5));
    const make = (name, look, [x, z, yaw], sit = true, y = 0.5) => {
      const a = new Avatar(this.scene, { id: -900 - Math.floor(rand() * 1e6), name, look, pos: [x, sit ? y - SEAT_DROP : 0, z], rot: [yaw, 0] }, { tag: !!name });
      a.sitting = sit;
      a.home = [x, z, yaw];
      a.homeY = y - SEAT_DROP;
      return a;
    };
    const leaders = Object.fromEntries(meet.leaders.map((k, n) => [k, make(LEADERS[k].name, LEADERS[k].look, place.seats[2 + n])]));
    leaders.organist = make(LEADERS.organist.name, LEADERS.organist.look, place.organ);
    const youth = meet.key === 'youth';
    const spots = [...place.pews].sort(() => rand() - 0.5).slice(0, youth ? 12 : MEMBERS);
    const members = spots.map(spot => {
      const look = randomLook(rand);
      const pick = list => list[Math.floor(rand() * list.length)];
      // (Sunday best: jackets and dresses, no hats, everyday hair and smiles. Youth Night: kids'
      // everyday clothes, no hats.)
      Object.assign(look, {
        hat: 'none', extra: 'none', pet: 'none',
        face: pick(['smile', 'grin', 'wink', 'smile']), hair: pick(['short', 'long', 'ponytail', 'buns', 'afro', 'short', 'curly', 'braids']),
        hairColor: pick(['#1b1209', '#3b2314', '#6b3e1f', '#a0632b', '#d9a441', '#f3d98b', '#c23b22', '#e8e8e8']),
      });
      if (!youth) {
        Object.assign(look, { shirt: rand() < 0.5 ? 'jacket' : 'dress', shirtColor2: '#ffffff' });
        look.pants = look.shirt === 'dress' ? 'skirt' : 'jeans';
      } else if (look.shirt === 'dress') look.pants = 'skirt';
      return make('', look, spot, true, 0.45);
    });
    this.people = { leaders, members };
    this.said = -2;
  }

  clear() {
    this.clearGifts();
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
    // Which hymn, and where we are in it (the prelude plays it over and over, softly).
    const tune = m.meeting?.tune || 'old100', HYMN = TUNES[tune], len = TUNE_LENGTHS[tune] + 3;
    const pos = m.part === 'prelude' ? ((m.t % len) + len) % len : m.since;
    const key = `${tune}:${m.part}:${m.i}:${m.part === 'prelude' ? Math.floor((m.t + 1000 * len) / len) : 0}`;
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
