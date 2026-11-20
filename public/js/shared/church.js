// The church: a meetinghouse of The Church of Jesus Christ of Latter-day Saints, out on the Outer
// Loop. Red brick with white trim and a tall white steeple; a front lawn with flower beds and a
// path; inside, a foyer (couches, plants) and the chapel: rows of pews, and at the front the
// stand with the pulpit, chairs for the speakers, the organ, and the sacrament table.
//
// On Sundays (the game's week: see seasons.js) there's a meeting in the morning: an opening hymn
// on the organ, a prayer, two short talks, a closing hymn and a prayer. Wednesday evening is
// Youth Night (a hidden-gift game, a thought, a song), and Sunday evening a fireside. Everybody's game works it
// out from the day and the time (so all agree, and the server has nothing to run: see
// churchui.js), and the server pays a little thank-you for coming (MEETING_COINS, once each meeting:
// see game.js). Sister Grace in the foyer welcomes visitors any day.
import { DOOR_TOP, makeBlock, stack, SIGN, DAY_LENGTH, DAY_FRACTION } from './blocks.js';
import { makeSite, siteFree } from './worldgen.js';
import { ringRoads, RING } from './outerlands.js';
import { weekday, SUNDAY } from './seasons.js';

export const CHURCH_BLOCKS = { pew: 141, pulpit: 142, organ: 143, sacrament: 144, spire: 145 };
const B = { brick: 5, white: 12, roof: 13, floor: 25, carpet: 35, grass: 1, flowers: 27, sidewalk: 24, glass: 9, door: 21, chandelier: 42, ceilingLight: 41, couch: 61, chair: 60, flowerPot: 67, lantern: 45, ...CHURCH_BLOCKS };
const faceDir = (dx, dz) => (dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3);
const onWall = (wx, wz) => faceDir(-wx, -wz);
// The site: u along the road (0-21), v in from it (0-30). The building is u 1-20, v 4-29.
const L = 22, D = 30;
const X0 = 1, X1 = 20, FRONT = 4, BACK = 29, FOYER_END = 10, H = 7; // walls y 0-6, roof at 7
const PEWS = [13, 15, 17, 19, 21]; // pew rows (v)
const PEW_U = [3, 4, 5, 6, 7, 8, 13, 14, 15, 16, 17, 18];

// ---------- The meetings ----------

// Three meetings a week, in game time (a day is 600: 0 is 6 AM, 90 about 9 AM, 343 6 PM and 372
// 7 PM, sunset: the clock runs faster at night, see clockText in daynight.js): Sunday morning's
// meeting, Youth Activity Night on Wednesday evening (a game, a thought, a song, a prayer), and a
// fireside on Sunday evening (one gentle talk, a hymn, a prayer).
export const MEETING_START = 90, MEETING_END = 270; // (Sunday morning's)
export const MEETING_COINS = 10, MEETING_STAY = 60; // (seconds there to get the coins)
export const WEDNESDAY = 3;
export const isSunday = day => weekday(day) === SUNDAY;
const PRELUDE = 25; // (seconds of soft organ music while people arrive)

// Who's who (the bishop conducts on Sundays, members give talks, a sister plays the organ; two
// youth leaders run Youth Night; a guest speaker for the fireside).
export const LEADERS = {
  bishop: { name: 'Bishop Allen', look: { face: 'smile', hair: 'short', shirt: 'jacket', pants: 'jeans', skin: '#e8b088', hairColor: '#9e9e9e', shirtColor: '#263238', shirtColor2: '#ffffff', pantsColor: '#263238', shoesColor: '#111111' } },
  sister: { name: 'Sister Taylor', look: { face: 'smile', hair: 'long', shirt: 'dress', pants: 'skirt', skin: '#f5c9a0', hairColor: '#a0632b', shirtColor: '#5c6bc0', shirtColor2: '#ffffff', pantsColor: '#5c6bc0', shoesColor: '#3b2314' } },
  brother: { name: 'Brother Jensen', look: { face: 'grin', hair: 'short', shirt: 'jacket', pants: 'jeans', skin: '#d39a6a', hairColor: '#3b2314', shirtColor: '#37474f', shirtColor2: '#ffffff', pantsColor: '#37474f', shoesColor: '#111111' } },
  organist: { name: 'Sister Moss', look: { face: 'smile', hair: 'buns', shirt: 'dress', pants: 'skirt', skin: '#ffe0c4', hairColor: '#e8e8e8', shirtColor: '#8e24aa', shirtColor2: '#ffffff', pantsColor: '#8e24aa', shoesColor: '#111111' } },
  lopez: { name: 'Sister Lopez', look: { face: 'grin', hair: 'ponytail', shirt: 'tshirt', pants: 'jeans', skin: '#c68642', hairColor: '#1b1209', shirtColor: '#ff7043', shirtColor2: '#ffffff', pantsColor: '#3949ab', shoesColor: '#ffffff' } },
  kim: { name: 'Brother Kim', look: { face: 'smile', hair: 'short', shirt: 'tshirt', pants: 'jeans', skin: '#f1c27d', hairColor: '#1b1209', shirtColor: '#26a69a', shirtColor2: '#ffffff', pantsColor: '#263238', shoesColor: '#ffffff' } },
  hale: { name: 'Brother Hale', look: { face: 'smile', hair: 'short', shirt: 'jacket', pants: 'jeans', skin: '#8d5524', hairColor: '#e8e8e8', shirtColor: '#4e342e', shirtColor2: '#ffffff', pantsColor: '#4e342e', shoesColor: '#111111' } },
};
// [from (seconds into the meeting), what, who speaks (at the pulpit), what they say]
export const PROGRAM = [
  [0, 'welcome', 'bishop', 'Good morning, everyone! Welcome! We\'re so glad you\'re here. 😊'],
  [7, 'welcome', 'bishop', 'Let\'s begin by singing together. 🎵'],
  [12, 'hymn'],
  [48, 'prayer', 'brother', '🙏'],
  [58, 'talk', 'sister', 'Jesus Christ taught us to love one another. ❤️'],
  [66, 'talk', 'sister', 'Kindness can be small: a smile, sharing, helping someone up. 😊'],
  [74, 'talk', 'sister', 'When we\'re kind to others, we\'re following Jesus. 🌟'],
  [82, 'talk', 'sister', 'This week, try to do one kind thing every day! 🤝'],
  [90, 'talk', 'brother', 'We can pray to Heavenly Father any time, anywhere. 🙏'],
  [98, 'talk', 'brother', 'He loves each one of us, and He listens. 💛'],
  [106, 'talk', 'brother', 'Families can pray together too, and help each other. 👨‍👩‍👧‍👦'],
  [114, 'talk', 'brother', 'Serving others, like helping a neighbor, brings happiness! 🏡'],
  [122, 'welcome', 'bishop', 'Thank you both! Let\'s close by singing again. 🎵'],
  [128, 'hymn'],
  [164, 'prayer', 'sister', '🙏'],
  [172, 'end', 'bishop', 'Thanks for coming! Have a wonderful Sunday! 👋'],
];
// Youth Night: hellos, the game (hidden gifts all over the chapel: find them!), a thought, a song,
// a prayer.
export const GIFTS = 8, GIFT_COINS = 2;
export const YOUTH = [
  [0, 'welcome', 'lopez', 'Hi everyone! Welcome to Youth Night! 🎉'],
  [6, 'welcome', 'kim', 'Tonight\'s game: find the hidden gifts! 🎁'],
  [12, 'welcome', 'kim', 'They\'re all over the chapel. Ready... go! 🏃'],
  [18, 'game', 'lopez', 'Look on the pews and up front! 👀'],
  [42, 'game', 'kim', 'Keep looking! 🎁'],
  [66, 'thought', 'lopez', 'Great job, everyone! Here\'s a thought for tonight. 💭'],
  [73, 'thought', 'lopez', 'Each of you is a child of God, and He loves you. 💛'],
  [81, 'thought', 'lopez', 'Like those gifts, His blessings are all around us. 🎁'],
  [89, 'thought', 'lopez', 'Look for them this week, and say thank you! 🙏'],
  [97, 'welcome', 'kim', 'Let\'s sing together! 🎵'],
  [102, 'hymn'],
  [138, 'prayer', 'kim', '🙏'],
  [146, 'end', 'lopez', 'Thanks for coming! See you next Wednesday! 👋'],
];
// The fireside: one longer, gentle talk, then a hymn and a prayer.
export const FIRESIDE = [
  [0, 'welcome', 'bishop', 'Good evening! Welcome to our fireside. 🔥'],
  [7, 'welcome', 'bishop', 'Brother Hale will share a few thoughts with us. 😊'],
  [13, 'talk', 'hale', 'Tonight, let\'s talk about gratitude: saying thank you. 🙏'],
  [21, 'talk', 'hale', 'Every day is full of gifts: sunshine, friends, family. ☀️'],
  [29, 'talk', 'hale', 'When we notice them, our hearts feel happy and full. 💛'],
  [37, 'talk', 'hale', 'Being thankful makes us want to help others too. 🤝'],
  [45, 'talk', 'hale', 'Jesus served everyone: He helped, taught and loved them. ❤️'],
  [53, 'talk', 'hale', 'We can serve too: help at home, cheer up a friend. 🏡'],
  [61, 'talk', 'hale', 'Even small acts of service make a big difference. 🌟'],
  [69, 'talk', 'hale', 'This week, say thank you every day, and help someone! 😊'],
  [77, 'welcome', 'bishop', 'Thank you, Brother Hale! Let\'s sing together. 🎵'],
  [82, 'hymn'],
  [118, 'prayer', 'sister', '🙏'],
  [126, 'end', 'bishop', 'Thank you for coming! Good night! 🌙'],
];
const meeting = (key, name, icon, day, start, program, leaders, tune) => ({ key, name, icon, day, start, end: start + program.at(-1)[0] + 8, program, leaders, tune });
// (leaders: who sits on the stand, in order; tune: which hymn the organ plays: see churchui.js)
export const MEETINGS = [
  meeting('sunday', 'Sunday meeting', '⛪', SUNDAY, MEETING_START, PROGRAM, ['bishop', 'sister', 'brother'], 'old100'),
  meeting('youth', 'Youth Night', '🎉', WEDNESDAY, 343, YOUTH, ['lopez', 'kim'], 'grace'),
  meeting('fireside', 'Fireside', '🔥', SUNDAY, 372, FIRESIDE, ['bishop', 'hale', 'sister'], 'grace'),
];
// The meeting on now (people arriving for it counts), or null.
export const meetingOn = (day, time) => MEETINGS.find(m => weekday(day) === m.day && time >= m.start - PRELUDE && time < m.end) || null;
// What's happening at this moment (null: no meeting now).
export function meetingAt(day, time) {
  const meet = meetingOn(day, time);
  if (!meet) return null;
  const t = time - meet.start, { program } = meet;
  if (t < 0) return { part: 'prelude', t, i: -1, meeting: meet }; // (people arriving, the organ playing softly)
  let i = 0;
  while (i + 1 < program.length && program[i + 1][0] <= t) i++;
  const [from, part, who, line] = program[i];
  return { part, who, line, t, i, since: t - from, meeting: meet };
}
// The next meeting from now (or the one on now): { meeting, days } (days from today).
export function nextMeeting(day, time) {
  for (let d = 0; d < 8; d++)
    for (const m of [...MEETINGS].sort((a, b) => a.start - b.start)) if (weekday(day + d) === m.day && (d > 0 || time < m.end)) return { meeting: m, days: d };
  return null;
}
// "6 PM" for a time of day (game time: the same clock as clockText in daynight.js).
export const clockAt = time => {
  const p = (((time % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH) / DAY_LENGTH;
  const h = Math.round(p < DAY_FRACTION ? 6 + (13 * p) / DAY_FRACTION : (19 + (11 * (p - DAY_FRACTION)) / (1 - DAY_FRACTION)) % 24) % 24;
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};
// Where Youth Night's gifts are hidden (the same for everyone: picked from the pews and the
// stand's chairs, different each week). [x, z] in the world.
export function giftSpots(place, day) {
  const spots = [...(place?.pews || []), ...(place?.seats || [])];
  if (!spots.length) return [];
  let s = (day * 2654435761 + 97) >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pool = spots.map(p => [p[0], p[1]]), out = [];
  while (out.length < GIFTS && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

// ---------- Building it ----------

// Along the Outer Loop, as near to `near` as there's room.
export function buildChurch({ get, set, canUse, near = [RING, 160] }) {
  const roads = ringRoads(), sites = [];
  for (const name of ['loopE', 'loopS', 'loopN', 'loopW']) {
    const road = roads[name];
    for (const side of [-1, 1]) for (let a = road.from + 30; a + L <= road.to - 30; a += 3) sites.push(makeSite(road, side, a));
  }
  const centre = s => s.at(L / 2, D / 2);
  sites.sort((p, q) => Math.hypot(centre(p)[0] - near[0], centre(p)[1] - near[1]) - Math.hypot(centre(q)[0] - near[0], centre(q)[1] - near[1]));
  const site = sites.find(s => siteFree(s, L, D, 8, get, canUse));
  return site ? churchAt(site, set) : null;
}

function churchAt(site, set) {
  const put = (u, y, v, b) => {
    const [x, z] = site.at(u, v);
    set(x, y, z, b);
  };
  const [fx, fz] = site.dirV, [ux, uz] = site.dirU;
  const inward = faceDir(fx, fz), outward = faceDir(-fx, -fz);
  const signs = [];
  const sign = (u, y, v, text) => {
    put(u, y, v, makeBlock(SIGN, onWall(fx, fz)));
    const [x, z] = site.at(u, v);
    signs.push([x, y, z, text]);
  };

  // The front lawn: a path up the middle to the doors, flower beds, lanterns.
  for (let u = 0; u < L; u++) put(u, 0, 0, B.sidewalk);
  for (let u = 0; u < L; u++)
    for (let v = 1; v < FRONT; v++) {
      const path = u === 10 || u === 11;
      put(u, 0, v, path ? B.sidewalk : v === 2 && u > 1 && u < L - 2 && u !== 9 && u !== 12 ? B.flowers : B.grass);
    }
  for (const u of [8, 13]) put(u, 0, 1, stack(B.lantern, B.sidewalk));

  // The walls, roof and floor.
  for (let u = X0; u <= X1; u++)
    for (let v = FRONT; v <= BACK; v++) {
      const edgeU = u === X0 || u === X1, edgeV = v === FRONT || v === BACK;
      put(u, H, v, B.roof);
      if (!edgeU && !edgeV) {
        put(u, 0, v, v > FOYER_END && (u === 10 || u === 11) ? B.carpet : B.floor); // (a carpet up the aisle)
        continue;
      }
      for (let y = 0; y < H; y++) {
        let b = (edgeU && edgeV) || y === H - 1 || y === 0 ? B.white : B.brick; // (white corners and trim)
        // Tall windows along the sides of the chapel, and either side of the front doors.
        if (edgeU && !edgeV && v > FOYER_END + 1 && v < BACK - 1 && v % 3 === 0 && y >= 2 && y <= 4) b = B.glass;
        if (v === FRONT && (u === 7 || u === 14) && y >= 1 && y <= 3) b = B.glass;
        if (v === FRONT && (u === 10 || u === 11) && y < 2) b = 0; // (the doors go here)
        if (b) put(u, y, v, b);
      }
    }
  // The front doors, and the doors from the foyer into the chapel (a wall between them).
  const doorFacing = site.road.axis === 'x' ? 0 : 1;
  for (let u = X0 + 1; u < X1; u++)
    for (let y = 0; y < H; y++) if (!((u === 10 || u === 11) && y < 2)) put(u, y, FOYER_END, y === H - 1 ? B.white : B.brick);
  for (const v of [FRONT, FOYER_END])
    for (const u of [10, 11]) {
      put(u, 0, v, makeBlock(B.door, doorFacing));
      put(u, 1, v, makeBlock(B.door, doorFacing | DOOR_TOP));
    }

  // The steeple: a white tower over the doors, up above the roof, and a tall slender spire.
  for (let y = H; y <= H + 6; y++) for (const u of [10, 11]) for (const v of [FRONT, FRONT + 1]) put(u, y, v, B.white);
  // (The spire's model stands on the tower's corner nearest -x, -z, and covers all four.)
  const [ax, az] = site.at(10, FRONT), [bx, bz] = site.at(11, FRONT + 1);
  set(Math.min(ax, bx), H + 7, Math.min(az, bz), B.spire);

  // Signs on the front wall: the Church's name, and a welcome.
  sign(5, 3, FRONT - 1, 'The Church of Jesus Christ of Latter-day Saints');
  sign(16, 3, FRONT - 1, '🤝 Visitors Welcome! ⛪');

  // The foyer: couches either side, plants, lights.
  const on = (u, v, b) => put(u, 0, v, stack(b, B.floor)); // (things stand on the floor)
  for (const u of [3, 4, 17, 18]) on(u, 8, makeBlock(B.couch, outward));
  for (const u of [2, 19]) on(u, 5, B.flowerPot);
  put(6, H - 1, 7, B.ceilingLight);
  put(15, H - 1, 7, B.ceilingLight);

  // The chapel: rows of pews facing the front, the aisle up the middle.
  for (const v of PEWS) for (const u of PEW_U) on(u, v, makeBlock(B.pew, inward));
  // The stand: the sacrament table, the pulpit, chairs for the speakers (facing everyone), and
  // the organ off to the side.
  for (const u of [9, 10, 11, 12]) on(u, 23, makeBlock(B.sacrament, outward));
  on(10, 25, makeBlock(B.pulpit, outward));
  for (const u of [6, 7, 8, 13, 14, 15]) on(u, 27, makeBlock(B.chair, outward));
  on(3, 25, makeBlock(B.organ, faceDir(-ux, -uz)));
  on(4, 25, makeBlock(B.chair, faceDir(-ux, -uz))); // (the organist's bench)
  for (const u of [2, 19]) on(u, 28, B.flowerPot);
  // Chandeliers down the chapel.
  for (const v of [14, 19, 24]) for (const u of [6, 15]) put(u, H - 1, v, B.chandelier);

  // Where things are, for the meeting and the server (world x, z).
  const at = (u, v) => site.pos(u + 0.5, v + 0.5);
  const [cx0, cz0] = site.at(X0 + 1, FOYER_END + 1), [cx1, cz1] = site.at(X1 - 1, BACK - 1);
  const [gx, gz] = at(10.5, 6.5);
  const [rx0, rz0] = site.at(0, 0), [rx1, rz1] = site.at(L - 1, D);
  const rect = [Math.min(rx0, rx1), Math.min(rz0, rz1), Math.max(rx0, rx1), Math.max(rz0, rz1)];
  const yaw = dir => Math.atan2(-dir[0], -dir[1]); // (looking along dir)
  return {
    signs,
    area: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1],
    claim: { owner: 'The Church of Jesus Christ of Latter-day Saints', key: 'church', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], createdAt: 0, permanent: true },
    // The place (the greeter stands in the foyer). chapel: the room's rect (for coming to the
    // meeting); pulpit: where speakers stand (and which way they face); organ: the organist's
    // seat; seats: the stand's chairs.
    place: {
      x: gx, y: 0, z: gz, face: yaw([-fx, -fz]),
      area: [Math.min(...[at(3, 6), at(18, 9)].map(p => p[0])), Math.min(...[at(3, 6), at(18, 9)].map(p => p[1])), Math.max(...[at(3, 6), at(18, 9)].map(p => p[0])), Math.max(...[at(3, 6), at(18, 9)].map(p => p[1]))],
      chapel: [Math.min(cx0, cx1), Math.min(cz0, cz1), Math.max(cx0, cx1), Math.max(cz0, cz1)],
      pulpit: [...at(10, 26), yaw([-fx, -fz])],
      organ: [...at(4, 25), yaw([-ux, -uz])],
      seats: [6, 7, 8, 13, 14, 15].map(u => [...at(u, 27), yaw([-fx, -fz])]),
      pews: PEWS.flatMap(v => PEW_U.map(u => [...at(u, v), yaw([fx, fz])])),
    },
  };
}
