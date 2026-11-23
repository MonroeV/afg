// "The Blocksons" 🏠, the sitcom at the Starlight Cinema (since v0.71). Episode 1: "The Big
// Surprise". It's Grandpa Gus's birthday, and the family tries to bake him a surprise cake
// without him finding out. Dad turns himself into a snowman with the flour, Ned from next door
// ("Howdy-doodle, neighbors!") falls in through the window and sneezes flour over everybody, Max
// does a magic show, Biscuit the dog sends the cake flying… and Grandpa still wants to go to the
// lake.
//
// It's all drawn here, on the cinema's screen (a canvas): the sets, the people (blocky, like
// everyone in BuildZone), speech bubbles, flour, confetti. The script is a list of moments in
// seconds; every player's game draws the same moment, from the game's clock (see showAt in
// shared/cinema.js). The sound (SitcomSound) is for whoever is in the theater: the theme song,
// the studio audience (laughs, applause, "awww": recordings in sounds/), little voices while
// people talk, and a few sound effects.
import { SITCOM_LENGTH } from './shared/cinema.js';
import { asset } from './assets.js';

const W0 = 640, H0 = 252; // (the stage: everything's drawn in these units, then scaled to fit)
const FLOOR = 226; // (where people's feet are)

// ---------- The cast ----------

export const CAST = {
  dad: { name: 'Barry', role: 'Dad', size: 1, skin: '#f1c27d', hair: '#5d3a1a', style: 'short', shirt: '#1e88e5', pants: '#37474f', shoes: '#3e2723', glasses: true, voice: 150 },
  mom: { name: 'Pam', role: 'Mom', size: 0.96, skin: '#e0ac69', hair: '#c62828', style: 'ponytail', shirt: '#43a047', dress: true, pants: '#2e7d32', shoes: '#6d4c41', voice: 270 },
  penny: { name: 'Penny', role: '', size: 0.76, skin: '#ffdbac', hair: '#fbc02d', style: 'pigtails', shirt: '#ec407a', pants: '#5c6bc0', shoes: '#ffffff', voice: 360 },
  max: { name: 'Max', role: '', size: 0.64, skin: '#8d5524', hair: '#1b1209', style: 'short', cap: '#e53935', shirt: '#fbc02d', pants: '#1565c0', shoes: '#e53935', voice: 440 },
  grandpa: { name: 'Grandpa Gus', role: '', size: 0.95, skin: '#f1c27d', hair: '#eeeeee', style: 'bald', mustache: '#f5f5f5', glasses: true, shirt: '#a1887f', vest: '#6d4c41', pants: '#4e342e', shoes: '#3e2723', cane: true, voice: 115 },
  ned: { name: 'Ned', role: 'next door', size: 1.1, skin: '#ffe0bd', hair: '#ff8f00', style: 'curly', shirt: '#00acc1', flowers: true, pants: '#fff176', shoes: '#8d6e63', voice: 210 },
  dog: { name: 'Biscuit', role: 'the dog', dog: true, fur: '#b07a43', voice: 520 },
};
const ORDER = ['dad', 'mom', 'penny', 'max', 'grandpa', 'ned', 'dog'];

// ---------- The script ----------
// Built once: each moment has a time (at, seconds into the episode). Helpers move the clock on.

const S = [];
let T = 0;
const ev = (kind, o = {}) => S.push({ kind, at: T, ...o });
const wait = d => (T += d);
const scene = (set, cast = {}, props = {}) => ev('scene', { set, cast, props });
const put = (who, x, f = 1, o = {}) => ev('put', { who, x, f, ...o });
const gone = who => ev('gone', { who });
// Someone says something (a speech bubble while they say it). 'all' is everybody at once.
const say = (who, text, o = {}) => {
  const dur = o.dur || Math.max(2.3, 0.9 + [...text].length * 0.068);
  ev('say', { who, text, dur });
  if (!o.noWait) T += dur + (o.gap ?? 0.3);
};
const move = (who, x, dur, o = {}) => {
  ev('move', { who, x, dur });
  if (o.wait) T += dur;
};
const face = (who, f) => ev('face', { who, f });
const pose = (who, p) => ev('pose', { who, pose: p });
const hop = (who, h, dur) => ev('hop', { who, h, dur });
const drop = (who, h, dur) => ev('drop', { who, h, dur });
const flour = (...who) => who.forEach(w => ev('flour', { who: w }));
const prop = (name, val) => ev('prop', { name, val });
const fx = (kind, x, y, dur, o = {}) => ev('fx', { fx: kind, x, y, dur, ...o });
const cam = (z, x, y, dur = 0.5) => ev('cam', { z, x, y, dur });
const cue = (sound, d, o = {}) => {
  ev('cue', { sound, dur: d });
  if (!o.noWait) T += d;
};
const sfx = name => ev('sfx', { name });

// The opening titles (the theme song plays).
scene('titles');
cue('theme', 15);

// --- 1. The living room: a secret ---
scene('living', { mom: { x: 300, f: 1 }, penny: { x: 385, f: -1 }, max: { x: 440, f: -1 }, dog: { x: 150, f: 1 } });
wait(1);
say('mom', 'Shh! Guess what day it is? 🤫');
say('penny', 'Saturday?');
say('mom', "It's Grandpa's BIRTHDAY! 🎂");
pose('max', 'cheer');
say('max', 'Woo-hoo! Birthday!');
pose('max', null);
say('mom', "Let's bake him a SURPRISE cake!");
say('max', 'A cake as big as a HOUSE! 🏠');
put('grandpa', 610, -1);
sfx('door');
move('grandpa', 525, 1.6, { wait: true });
say('grandpa', 'Did somebody say… CAKE? 🍰');
for (const w of ['mom', 'penny', 'max']) pose(w, 'shock');
sfx('boing');
wait(1.3);
cam(1.7, 430, 165, 0.35);
wait(0.4);
say('max', 'No! We said… LAKE!');
cam(1, 320, 126, 0.4);
for (const w of ['mom', 'penny', 'max']) pose(w, null);
say('grandpa', 'Ooh, I LOVE the lake! 🎣');
say('grandpa', "I'll go find my fishing rod!");
face('grandpa', 1);
move('grandpa', 615, 1.3, { wait: true });
gone('grandpa');
sfx('door');
cue('laugh', 3);
say('mom', 'Phew! Quick… to the kitchen! 🏃');
move('mom', 700, 1.6);
move('penny', 720, 1.5);
move('max', 745, 1.4);
face('mom', 1);
face('penny', 1);
face('max', 1);
wait(1.7);

// --- 2. The kitchen: flour everywhere ---
scene('kitchen', { dad: { x: 150, f: 1 }, penny: { x: 335, f: -1 }, mom: { x: 405, f: -1 }, max: { x: 455, f: -1 } }, { flour: true, bowl: true });
wait(0.8);
say('dad', "Don't worry. I'm a GREAT baker! 👨‍🍳");
pose('dad', 'reach');
say('dad', 'First… the flour!');
sfx('poof');
fx('poof', 120, 150, 1.6, { size: 1 });
wait(0.35);
flour('dad');
pose('dad', 'shock');
wait(1.5);
pose('dad', null);
cue('laugh', 2.6);
say('penny', 'Dad… you look like a SNOWMAN! ⛄');
cue('laugh', 2.4);
prop('window', 'ned');
sfx('ding');
wait(0.6);
say('ned', 'Howdy-doodle, neighbors! 👋');
cue('applause', 2.6);
say('mom', 'Oh! Hi, Ned!');
say('ned', "I smell BAKING! I'm a world-famous cake expert!");
say('ned', "I'll come in and help!");
prop('window', null);
put('ned', 215, 1, { y: -95 });
drop('ned', 95, 0.45);
wait(0.45);
sfx('crash');
pose('ned', 'fall');
fx('stars', 225, 200, 1.6);
wait(1.8);
pose('ned', null);
say('ned', '…I meant to do that. 😎');
cue('laugh', 2.4);
move('ned', 245, 0.9, { wait: true });
say('ned', "Ooh, is that flour? *sniff* *sniff*");
pose('ned', 'sneeze');
say('ned', 'Ah… ahh… AHHH…');
sfx('sneeze');
say('ned', 'AH-CHOOOOO!! 🤧', { noWait: true, dur: 2 });
fx('poof', 330, 150, 2.4, { size: 2.6 });
wait(0.35);
flour('mom', 'penny', 'max', 'ned');
for (const w of ['mom', 'penny', 'max', 'dad']) pose(w, 'shock');
wait(2.2);
for (const w of ['mom', 'penny', 'max', 'dad', 'ned']) pose(w, null);
cue('laugh', 3.4);
say('max', "Now we're ALL snowmen! ⛄⛄⛄");
cue('laugh', 2.4);

// --- 3. The living room: the magic show ---
scene('living', { grandpa: { x: 520, f: -1, rod: true }, max: { x: -40, f: 1, floured: true } }, { hat: true });
wait(0.6);
say('grandpa', "Found my fishing rod! Now… where's that lake?");
move('max', 270, 1.5, { wait: true });
say('max', 'Wait, Grandpa! Watch my… MAGIC SHOW! ✨');
say('grandpa', 'Max? Why are you all white?');
say('max', "Uh… it's my magic costume!");
cue('laugh', 2.2);
pose('max', 'reach');
say('max', 'Abra… ca… DABRA!');
sfx('magic');
fx('sparkle', 330, 160, 1.4);
put('dog', 330, 1, { y: 0 });
hop('dog', 55, 0.9);
wait(1);
pose('max', 'cheer');
say('dog', 'Woof! 🐶');
cue('laugh', 2.6);
pose('max', null);
say('grandpa', 'AMAZING! Do it again!');
say('max', '…That was my only trick.');
cue('laugh', 2.6);

// --- 4. The kitchen: the cake ---
scene('kitchen', { dad: { x: 110, f: 1, floured: true }, mom: { x: 300, f: -1, floured: true }, penny: { x: 360, f: -1, floured: true }, ned: { x: 440, f: -1, floured: true } }, { cake: { x: 205, y: 150 } });
wait(0.8);
say('mom', 'Ta-da! The cake is DONE! 🎂');
say('penny', "It's PERFECT!");
say('dad', 'Our best cake EVER!');
put('dog', 690, -1);
move('dog', 268, 2.2);
say('ned', 'Uh-oh… who let the dog in?');
say('mom', 'Biscuit… NO!', { dur: 1.4 });
hop('dog', 60, 0.7);
sfx('boing');
wait(0.45);
ev('fly', { name: 'cake', from: [205, 150], to: [440, 120], h: 115, dur: 2.1, spin: 2 });
for (const w of ['mom', 'penny', 'dad']) pose(w, 'shock');
say('ned', 'I got it! I got it!', { noWait: true, dur: 2 });
pose('ned', 'catch');
wait(2.15);
sfx('ding');
prop('cake', { on: 'ned' });
cue('applause', 2.8);
for (const w of ['mom', 'penny', 'dad']) pose(w, null);
say('ned', 'World-famous cake expert, remember? 😎');
cue('laugh', 2.6);

// --- 5. The living room, lights off: SURPRISE! ---
scene('living', { dad: { x: 262, f: 1, floured: true, pose: 'hide' }, mom: { x: 312, f: 1, floured: true, pose: 'hide' }, penny: { x: 358, f: 1, floured: true, pose: 'hide' }, max: { x: 398, f: 1, floured: true, pose: 'hide' }, ned: { x: 172, f: 1, floured: true, pose: 'catch' }, dog: { x: 120, f: 1 } }, { dark: true, banner: true, cake: { on: 'ned' }, behindCouch: true });
wait(1);
say('penny', 'Shh! Here he comes! 🤫');
put('grandpa', 615, -1, { rod: true });
sfx('door');
move('grandpa', 520, 1.6, { wait: true });
say('grandpa', 'Hello? Why is it so dark in here?');
sfx('click');
prop('dark', false);
prop('behindCouch', false);
for (const [w, x] of [['dad', 250], ['mom', 305], ['penny', 355], ['max', 400]]) {
  put(w, x, 1);
  pose(w, 'cheer');
  hop(w, 40, 0.6);
}
fx('confetti', 320, 0, 4);
sfx('horn');
say('all', 'SURPRISE!!! 🎉', { noWait: true, dur: 2.4 });
cue('applause', 2.8);
for (const w of ['dad', 'mom', 'penny', 'max']) pose(w, null);
say('grandpa', 'A birthday cake… for ME? 🥹');
fx('hearts', 520, 120, 3);
cue('aww', 3.2);
say('grandpa', 'But wait…');
say('grandpa', "…so we're NOT going to the lake?");
cue('laugh', 2.8);
say('dad', 'Tomorrow, Grandpa. Tomorrow! 😄');
say('all', 'HAPPY BIRTHDAY, GRANDPA! 🎂');
hop('dog', 70, 0.8);
wait(0.8);
fx('hearts', 185, 110, 2.4);
say('ned', 'Hey! That tickles! 😂');
cue('applause', 3);

// --- The end credits (the theme again) ---
export const CREDITS_AT = T;
scene('credits');
cue('theme', SITCOM_LENGTH - T, { noWait: true });
T = SITCOM_LENGTH;
export const SCRIPT = S;
export const RUNTIME = CREDITS_AT;

// ---------- Where everything is, at a moment ----------

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = k => Math.max(0, Math.min(1, k));
const ease = k => k * k * (3 - 2 * k);

function stateAt(s) {
  const st = { set: null, setAt: 0, actors: {}, props: {}, fx: [], says: [], cam: { z: 1, x: W0 / 2, y: H0 / 2, from: null, at: 0, dur: 0 }, cues: [] };
  const posAt = (a, t) => (a.mv ? lerp(a.mv.x0, a.mv.x1, clamp01((t - a.mv.t0) / a.mv.dur)) : a.x);
  for (const e of S) {
    if (e.at > s) break;
    const a = st.actors[e.who];
    switch (e.kind) {
      case 'scene':
        st.set = e.set;
        st.setAt = e.at;
        st.actors = {};
        for (const [who, o] of Object.entries(e.cast)) st.actors[who] = { x: o.x, f: o.f || 1, pose: o.pose || null, floured: !!o.floured, rod: !!o.rod, y: 0 };
        st.props = { ...e.props };
        st.fx = [];
        st.cam = { z: 1, x: W0 / 2, y: H0 / 2, from: null, at: e.at, dur: 0 };
        break;
      case 'put':
        st.actors[e.who] = { x: e.x, f: e.f, pose: null, floured: !!st.actors[e.who]?.floured, rod: !!e.rod, y: e.y || 0, mv: null };
        break;
      case 'gone':
        delete st.actors[e.who];
        break;
      case 'move':
        if (!a) break;
        a.x = posAt(a, e.at);
        a.mv = { x0: a.x, x1: e.x, t0: e.at, dur: e.dur };
        a.f = e.x >= a.x ? 1 : -1;
        a.x = e.x;
        break;
      case 'face':
        if (a) a.f = e.f;
        break;
      case 'pose':
        if (a) a.pose = e.pose;
        break;
      case 'hop':
        if (a) a.hop = { t0: e.at, h: e.h, dur: e.dur };
        break;
      case 'drop':
        if (a) a.drop = { t0: e.at, h: e.h, dur: e.dur };
        break;
      case 'flour':
        if (a) a.floured = true;
        break;
      case 'prop':
        st.props[e.name] = e.val;
        st.props[`${e.name}At`] = e.at;
        break;
      case 'fly':
        st.props[e.name] = { fly: e };
        break;
      case 'fx':
        st.fx.push(e);
        break;
      case 'say':
        if (s < e.at + e.dur) st.says.push(e);
        break;
      case 'cam': {
        const c = st.cam;
        const k = c.dur ? ease(clamp01((e.at - c.at) / c.dur)) : 1;
        const from = c.from || { z: c.z, x: c.x, y: c.y };
        st.cam = { z: e.z, x: e.x, y: e.y, from: { z: lerp(from.z, c.z, k), x: lerp(from.x, c.x, k), y: lerp(from.y, c.y, k) }, at: e.at, dur: e.dur };
        break;
      }
    }
  }
  for (const a of Object.values(st.actors)) {
    a.walking = !!a.mv && s < a.mv.t0 + a.mv.dur;
    a.drawX = posAt(a, s);
    let y = a.y || 0;
    if (a.drop) {
      const k = clamp01((s - a.drop.t0) / a.drop.dur);
      y = -a.drop.h * (1 - k * k);
      if (k >= 1) a.y = 0;
    }
    if (a.hop && s < a.hop.t0 + a.hop.dur) {
      const k = (s - a.hop.t0) / a.hop.dur;
      y -= a.hop.h * 4 * k * (1 - k);
    }
    a.drawY = y;
  }
  return st;
}

// ---------- Drawing ----------

function mix(a, b, k) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`;
}

function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

function wrap(c, text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (c.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// A person: feet at (0, 0), facing +x (flipped for -x), in their own size.
function drawPerson(c, who, a, t, talking) {
  const p = CAST[who], k = p.size, col = h => (a.floured ? mix(h, '#ffffff', 0.78) : h);
  c.save();
  if (a.pose === 'hide') {
    c.beginPath();
    c.rect(-1000, -1000, 3000, 1000 + 186);
    c.clip();
  }
  c.translate(a.drawX, FLOOR + a.drawY);
  if (a.pose === 'fall') {
    c.rotate((Math.PI / 2) * (a.f || 1)); // (flat on the floor, head first the way they were facing)
    c.translate(0, 10);
  }
  if (a.pose === 'hide') c.translate(0, 34);
  c.scale(k * (a.f || 1), k);
  const phase = who.length * 1.7;
  const swing = a.walking ? Math.sin(t * 11 + phase) * 0.55 : 0;
  const bob = talking ? Math.abs(Math.sin(t * 9 + phase)) * 1.2 : 0;
  c.translate(0, -bob);
  // Legs (a dress over the top of them, for Mom).
  for (const [side, sw] of [[-1, swing], [1, -swing]]) {
    c.save();
    c.translate(side * 5, -26);
    c.rotate(sw);
    rect(c, -4.5, 0, 9, 22, col(p.dress ? p.skin : p.pants));
    rect(c, -4.5, 22, 11, 5, col(p.shoes));
    c.restore();
  }
  if (p.dress) {
    c.fillStyle = col(p.shirt);
    c.beginPath();
    c.moveTo(-12, -40);
    c.lineTo(12, -40);
    c.lineTo(16, -12);
    c.lineTo(-16, -12);
    c.fill();
  }
  // The body.
  rect(c, -12, -54, 24, 29, col(p.shirt));
  if (p.vest) {
    rect(c, -12, -54, 7, 29, col(p.vest));
    rect(c, 5, -54, 7, 29, col(p.vest));
  }
  if (p.flowers) for (const [fx, fy, fc] of [[-6, -48, '#ff4081'], [5, -40, '#ffeb3b'], [-3, -32, '#ff9800'], [7, -50, '#ffffff']]) {
    c.fillStyle = col(fc);
    c.beginPath();
    c.arc(fx, fy, 2.6, 0, Math.PI * 2);
    c.fill();
  }
  // Arms: swinging while walking; up for cheering or a surprise; out front to reach or catch.
  const armsUp = a.pose === 'cheer' || a.pose === 'shock' || a.pose === 'catch';
  for (const [side, sw] of [[-1, -swing], [1, swing]]) {
    c.save();
    c.translate(side * 15.5, -52);
    let r = sw * 0.9;
    if (armsUp) r = side * (2.5 + (a.pose === 'cheer' ? Math.sin(t * 10 + side) * 0.3 : 0));
    if (a.pose === 'reach' && side > 0) r = -1.4;
    if (a.pose === 'sneeze') r = side > 0 ? -2.3 : 0.2;
    c.rotate(-r);
    rect(c, -3.5, 0, 7, 22, col(p.shirt));
    rect(c, -3.5, 20, 7, 5, col(p.skin));
    c.restore();
  }
  if (p.cane && !a.rod) rect(c, 18, -28, 3, 28, '#5d4037');
  if (a.rod) {
    c.strokeStyle = '#6d4c41';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(16, -30);
    c.lineTo(40, -95);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(40, -95);
    c.lineTo(44, -40);
    c.stroke();
  }
  // The head.
  c.save();
  c.translate(0, -54);
  if (a.pose === 'sneeze') c.rotate(-0.25 + Math.sin(t * 30) * 0.05);
  rect(c, -12, -24, 24, 24, col(p.skin));
  const hair = col(p.hair);
  if (p.style === 'short') {
    rect(c, -13, -27, 26, 7, hair);
    rect(c, -13, -24, 6, 14, hair);
  } else if (p.style === 'ponytail') {
    rect(c, -13, -27, 26, 7, hair);
    rect(c, -13, -24, 6, 16, hair);
    c.save();
    c.translate(-14, -20);
    c.rotate(Math.sin(t * 5) * 0.2 + 0.3);
    rect(c, -6, 0, 6, 18, hair);
    c.restore();
  } else if (p.style === 'pigtails') {
    rect(c, -13, -27, 26, 6, hair);
    rect(c, -13, -24, 4, 10, hair);
    for (const sx of [-17, 13]) rect(c, sx, -18, 5, 14, hair);
  } else if (p.style === 'bald') {
    rect(c, -13, -18, 4, 10, hair);
    rect(c, -12, -25, 6, 3, hair);
  } else if (p.style === 'curly') {
    c.fillStyle = hair;
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.arc(-12 + i * 4, -25 - (i % 2) * 2, 5, 0, Math.PI * 2);
      c.fill();
    }
    rect(c, -14, -24, 6, 13, hair);
  }
  if (p.cap) {
    rect(c, -13, -30, 26, 8, col(p.cap));
    rect(c, -21, -25, 9, 3, col(p.cap));
  }
  // The face: eyes (blinking now and then), glasses, mustache, mouth.
  const big = a.pose === 'shock' || a.pose === 'catch';
  const blink = (t + phase) % 3.7 < 0.13;
  c.fillStyle = '#1b1b1b';
  for (const ex of [1, 7]) {
    if (blink && !big) c.fillRect(ex, -15, 4, 1.5);
    else if (big) c.fillRect(ex - 0.5, -18, 5, 6);
    else c.fillRect(ex, -17, 3.5, 4);
  }
  if (p.glasses) {
    c.strokeStyle = '#263238';
    c.lineWidth = 1.2;
    c.strokeRect(-0.5, -19.5, 6.5, 7);
    c.strokeRect(6, -19.5, 6.5, 7);
  }
  if (p.mustache) rect(c, 2, -9, 10, 3, col(p.mustache));
  c.fillStyle = '#7b1f1f';
  if (big || a.pose === 'sneeze') {
    c.beginPath();
    c.ellipse(7, -5, 3, 3.5, 0, 0, Math.PI * 2);
    c.fill();
  } else if (talking && Math.sin(t * 22 + phase) > 0) c.fillRect(4, -7, 7, 4);
  else if (a.pose === 'cheer' || a.pose === 'hide') c.fillRect(3, -6, 8, 2.5);
  else c.fillRect(4, -5.5, 6, 1.8);
  c.restore();
  c.restore();
}

// Biscuit the dog.
function drawDog(c, a, t, talking) {
  const fur = a.floured ? '#f0ebe5' : CAST.dog.fur;
  c.save();
  c.translate(a.drawX, FLOOR + a.drawY);
  c.scale(a.f || 1, 1);
  const step = a.walking ? Math.sin(t * 16) * 3 : 0;
  for (const lx of [-12, -6, 6, 12]) rect(c, lx - 2, -9 + (lx % 4 ? step : -step) * 0.3, 4, 9, fur);
  rect(c, -16, -20, 32, 12, fur);
  c.save();
  c.translate(-16, -18);
  c.rotate(-0.6 + Math.sin(t * 18) * 0.5); // (wag wag wag)
  rect(c, -10, -2, 10, 3, fur);
  c.restore();
  rect(c, 10, -30, 15, 13, fur);
  rect(c, 22, -24, 6, 6, '#8d5a2b');
  rect(c, 26, -25, 3, 3, '#1b1b1b');
  rect(c, 16, -27, 3, 3, '#1b1b1b');
  rect(c, 9, -31, 5, 11, '#7b4a1f');
  if (talking) rect(c, 20, -17, 6, 3, '#e57373');
  c.restore();
}

// The birthday cake (three layers, candles flickering).
function drawCake(c, x, y, t, spin = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(spin);
  rect(c, -26, -14, 52, 14, '#fce4ec');
  rect(c, -20, -27, 40, 13, '#f8bbd0');
  rect(c, -13, -38, 26, 11, '#fce4ec');
  for (const [w, yy] of [[52, -14], [40, -27], [26, -38]]) for (let i = 0; i < w; i += 6) rect(c, -w / 2 + i, yy, 3, 3, '#ec407a');
  for (const cx of [-8, 0, 8]) {
    rect(c, cx - 1, -46, 2.5, 8, '#64b5f6');
    c.fillStyle = Math.sin(t * 20 + cx) > 0 ? '#ffeb3b' : '#ff9800';
    c.beginPath();
    c.ellipse(cx + 0.2, -49, 1.8, 3, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// ---------- The sets ----------

function livingRoom(c, st, t) {
  rect(c, 0, 0, W0, 200, '#ffe7a8');
  for (let x = 0; x < W0; x += 32) rect(c, x, 0, 14, 200, '#ffdf91');
  rect(c, 0, 0, W0, 10, '#c8a26a');
  rect(c, 0, 192, W0, 8, '#8d6e63');
  rect(c, 0, 200, W0, 52, '#b5835a');
  for (let y = 212; y < H0; y += 13) rect(c, 0, y, W0, 1.5, '#9c6e48');
  // The window (a sunny day; a cloud drifting by), with curtains.
  const sky = c.createLinearGradient(0, 40, 0, 140);
  sky.addColorStop(0, '#64b5f6');
  sky.addColorStop(1, '#bbdefb');
  c.fillStyle = sky;
  c.fillRect(40, 40, 110, 100);
  c.fillStyle = '#ffffff';
  const cx = 40 + ((t * 6) % 140) - 20;
  c.beginPath();
  c.arc(cx, 70, 10, 0, Math.PI * 2);
  c.arc(cx + 12, 66, 13, 0, Math.PI * 2);
  c.arc(cx + 26, 72, 9, 0, Math.PI * 2);
  c.fill();
  rect(c, 40, 118, 110, 22, '#81c784');
  c.strokeStyle = '#6d4c41';
  c.lineWidth = 5;
  c.strokeRect(40, 40, 110, 100);
  rect(c, 93, 40, 4, 100, '#6d4c41');
  rect(c, 28, 34, 26, 112, '#e57373');
  rect(c, 136, 34, 26, 112, '#e57373');
  // A picture: blocky mountains.
  rect(c, 300, 48, 84, 56, '#6d4c41');
  rect(c, 305, 53, 74, 46, '#b3e5fc');
  c.fillStyle = '#78909c';
  c.beginPath();
  c.moveTo(305, 99);
  c.lineTo(330, 64);
  c.lineTo(350, 86);
  c.lineTo(362, 72);
  c.lineTo(379, 99);
  c.fill();
  // The banner (for the party).
  if (st.props.banner) {
    for (let i = 0; i < 9; i++) {
      c.fillStyle = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'][i % 5];
      c.beginPath();
      c.moveTo(180 + i * 32, 16);
      c.lineTo(208 + i * 32, 16);
      c.lineTo(194 + i * 32, 38);
      c.fill();
    }
    c.fillStyle = '#d81b60';
    c.font = 'bold 17px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('🎉 HAPPY BIRTHDAY GRANDPA! 🎉', 340, 130);
  }
  // A floor lamp, the door (Grandpa's way in and out).
  rect(c, 486, 100, 4, 110, '#5d4037');
  c.fillStyle = '#ffcc80';
  c.beginPath();
  c.moveTo(470, 100);
  c.lineTo(506, 100);
  c.lineTo(498, 76);
  c.lineTo(478, 76);
  c.fill();
  rect(c, 560, 70, 62, 140, '#8d6e63');
  rect(c, 566, 78, 50, 56, '#a1887f');
  rect(c, 566, 142, 50, 60, '#a1887f');
  rect(c, 570, 140, 6, 6, '#ffd54f');
  // The rug.
  c.fillStyle = '#5c6bc0';
  c.beginPath();
  c.ellipse(330, 232, 170, 14, 0, 0, Math.PI * 2);
  c.fill();
}

// The little table in front of the couch, with the magic hat on it.
function hatTable(c) {
  rect(c, 312, 196, 36, 6, '#6d4c41');
  rect(c, 327, 202, 6, 24, '#6d4c41');
  rect(c, 318, 168, 24, 28, '#212121');
  rect(c, 312, 192, 36, 5, '#212121');
  rect(c, 318, 184, 24, 4, '#e53935');
}

function couch(c) {
  rect(c, 236, 150, 188, 40, '#c62828');
  rect(c, 226, 168, 22, 46, '#b71c1c');
  rect(c, 412, 168, 22, 46, '#b71c1c');
  rect(c, 240, 184, 180, 26, '#e53935');
  for (const x of [262, 330, 398]) rect(c, x - 1, 186, 2, 22, '#b71c1c');
  rect(c, 236, 210, 6, 14, '#4e342e');
  rect(c, 418, 210, 6, 14, '#4e342e');
}

function kitchen(c, st, t) {
  rect(c, 0, 0, W0, 200, '#e1f5fe');
  for (let x = 0; x < W0; x += 22) rect(c, x, 0, 1.5, 200, '#b3e5fc');
  for (let y = 0; y < 200; y += 22) rect(c, 0, y, W0, 1.5, '#b3e5fc');
  for (let x = 0; x < W0; x += 26) for (let y = 200; y < H0; y += 13) rect(c, x + ((y / 13) % 2) * 13, y, 13, 13, (x / 26 + y / 13) % 2 ? '#fafafa' : '#37474f');
  // The window over the counter (Ned looks in through it).
  rect(c, 110, 36, 110, 84, '#90caf9');
  if (st.props.window === 'ned') {
    const k = clamp01((t - (st.props.windowAt ?? 0)) / 0.4);
    c.save();
    c.beginPath();
    c.rect(110, 36, 110, 84);
    c.clip();
    drawPerson(c, 'ned', { drawX: 165, drawY: -84 + (1 - k) * 70, f: 1, pose: 'cheer', floured: false, walking: false }, t, true);
    c.restore();
  }
  c.strokeStyle = '#ffffff';
  c.lineWidth = 5;
  c.strokeRect(110, 36, 110, 84);
  rect(c, 163, 36, 4, 84, '#ffffff');
  // The counter, cupboards, the oven, the fridge.
  rect(c, 20, 150, 290, 10, '#8d6e63');
  rect(c, 24, 160, 282, 54, '#ffe0b2');
  for (let x = 24; x < 300; x += 47) {
    c.strokeStyle = '#d7a86e';
    c.lineWidth = 2;
    c.strokeRect(x + 3, 164, 41, 46);
    rect(c, x + 38, 184, 3, 8, '#8d6e63');
  }
  rect(c, 330, 120, 74, 94, '#cfd8dc');
  rect(c, 340, 150, 54, 46, '#37474f');
  rect(c, 346, 156, 42, 34, '#ff8a65');
  for (const x of [342, 358, 374, 390]) rect(c, x, 128, 8, 8, '#455a64');
  rect(c, 520, 52, 72, 162, '#eceff1');
  rect(c, 520, 116, 72, 3, '#b0bec5');
  rect(c, 580, 72, 4, 30, '#90a4ae');
  rect(c, 580, 130, 4, 40, '#90a4ae');
  // On the counter: the flour, the mixing bowl.
  if (st.props.flour) {
    rect(c, 58, 112, 30, 38, '#fff8e1');
    c.fillStyle = '#795548';
    c.font = 'bold 9px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('FLOUR', 73, 134);
  }
  if (st.props.bowl) {
    c.fillStyle = '#90caf9';
    c.beginPath();
    c.ellipse(245, 140, 26, 12, 0, 0, Math.PI);
    c.fill();
    rect(c, 219, 136, 52, 5, '#64b5f6');
  }
}

function titles(c, s) {
  const g = c.createLinearGradient(0, 0, 0, H0);
  g.addColorStop(0, '#42a5f5');
  g.addColorStop(1, '#ffca28');
  c.fillStyle = g;
  c.fillRect(0, 0, W0, H0);
  // Sunbeams, turning.
  c.save();
  c.translate(W0 / 2, H0 / 2);
  c.rotate(s * 0.25);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 12; i++) {
    c.rotate(Math.PI / 6);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(400, -60);
    c.lineTo(400, 60);
    c.fill();
  }
  c.restore();
  // "The Blocksons", the letters bouncing in one by one.
  const word = 'The Blocksons';
  c.font = 'bold 50px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let x = W0 / 2 - c.measureText(word).width / 2;
  [...word].forEach((ch, i) => {
    const w = c.measureText(ch).width, k = clamp01((s - 0.4 - i * 0.12) / 0.5);
    const y = 62 - Math.sin(k * Math.PI) * 18 - (1 - k) * 120 + Math.sin(s * 3 + i) * 2;
    c.fillStyle = '#5d2e8c';
    c.fillText(ch, x + w / 2 + 3, y + 3);
    c.fillStyle = ['#ffffff', '#fff59d', '#ffffff', '#b3e5fc'][i % 4];
    c.fillText(ch, x + w / 2, y);
    x += w;
  });
  c.font = 'bold 15px system-ui, sans-serif';
  c.fillStyle = '#ffffff';
  if (s > 2.4) c.fillText('🏠 "The Big Surprise" 🎂', W0 / 2, 102);
  // The cast, popping up one by one, with their names.
  ORDER.forEach((who, i) => {
    const k = clamp01((s - 4 - i * 1.25) / 0.4);
    if (k <= 0) return;
    const x = 60 + i * 87;
    const a = { drawX: x, drawY: (1 - k) * 80 + 0, f: 1, pose: s - 4 - i * 1.25 < 1.2 ? 'cheer' : null, floured: false, walking: false };
    c.save();
    c.translate(0, -4);
    if (who === 'dog') drawDog(c, a, s, false);
    else drawPerson(c, who, a, s, false);
    c.restore();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x - 40, 228, 80, 20);
    c.fillStyle = '#ffffff';
    c.font = 'bold 12px system-ui, sans-serif';
    c.fillText(CAST[who].name, x, 238);
  });
}

function credits(c, s) {
  const g = c.createLinearGradient(0, 0, 0, H0);
  g.addColorStop(0, '#311b92');
  g.addColorStop(1, '#880e4f');
  c.fillStyle = g;
  c.fillRect(0, 0, W0, H0);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffd54f';
  c.font = 'bold 40px system-ui, sans-serif';
  c.fillText('The End', W0 / 2, 50 - Math.max(0, s - 4) * 22);
  const lines = [['The Blocksons 🏠', 22], ['in "The Big Surprise"', 14], ['', 10], ['Starring', 13],
    ...ORDER.map(w => [w === 'dog' ? 'Biscuit … as himself 🐶' : `${CAST[w].name}${CAST[w].role ? ` (${CAST[w].role})` : ''}`, 16]),
    ['', 10], ['Filmed in front of a live studio audience 👏', 13], ['in BuildZone', 13], ['', 10], ['Happy birthday, Grandpa! 🎂', 18]];
  let y = 380 - s * 30;
  for (const [text, size] of lines) {
    c.font = `bold ${size}px system-ui, sans-serif`;
    c.fillStyle = '#ffffff';
    if (text) c.fillText(text, W0 / 2, y);
    y += size + 12;
  }
}

// The flour, confetti, stars, sparkles and hearts.
function drawFx(c, st, s) {
  for (const e of st.fx) {
    const k = (s - e.at) / e.dur;
    if (k < 0 || k > 1) continue;
    if (e.fx === 'poof') {
      for (let i = 0; i < 18; i++) {
        const ang = i * 2.4, r = (14 + i * 3) * e.size * (0.3 + k);
        c.fillStyle = `rgba(255,255,255,${(1 - k) * 0.85})`;
        c.beginPath();
        c.arc(e.x + Math.cos(ang) * r * 0.9, e.y + Math.sin(ang) * r * 0.5 - k * 20, (10 + (i % 4) * 5) * e.size * (0.6 + k), 0, Math.PI * 2);
        c.fill();
      }
    } else if (e.fx === 'confetti') {
      for (let i = 0; i < 70; i++) {
        const x = (i * 97) % W0 + Math.sin(s * 3 + i) * 10, y = ((i * 37) % 80) - 60 + k * 320;
        c.fillStyle = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ff7043'][i % 6];
        c.save();
        c.translate(x, y);
        c.rotate(s * 4 + i);
        c.fillRect(-3, -2, 6, 4);
        c.restore();
      }
    } else if (e.fx === 'stars' || e.fx === 'sparkle') {
      c.font = '16px system-ui, sans-serif';
      c.textAlign = 'center';
      for (let i = 0; i < 5; i++) {
        const ang = s * 4 + i * 1.256;
        c.globalAlpha = 1 - k;
        c.fillText(e.fx === 'stars' ? '⭐' : '✨', e.x + Math.cos(ang) * 26, e.y - 30 + Math.sin(ang) * 10 - (e.fx === 'sparkle' ? k * 30 : 0));
      }
      c.globalAlpha = 1;
    } else if (e.fx === 'hearts') {
      c.font = '16px system-ui, sans-serif';
      c.textAlign = 'center';
      for (let i = 0; i < 4; i++) {
        c.globalAlpha = 1 - k;
        c.fillText('💕', e.x - 30 + i * 20, e.y - k * 50 - (i % 2) * 12);
      }
      c.globalAlpha = 1;
    }
  }
}

// The speech bubbles (the words typing out as they say them).
function drawBubbles(c, st, s) {
  c.font = 'bold 15px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const e of st.says) {
    const a = st.actors[e.who];
    let x, top;
    if (e.who === 'all') {
      x = W0 / 2;
      top = 70;
    } else if (a) {
      const p = CAST[e.who];
      x = a.drawX;
      top = FLOOR + a.drawY - (p.dog ? 34 : 80 * p.size) - (a.pose === 'hide' ? -34 : 0) - (st.props.cake?.on === e.who ? 52 : 0);
    } else if (e.who === 'ned' && st.props.window === 'ned') {
      x = 165;
      top = 40;
    } else continue;
    const chars = [...e.text], shown = chars.slice(0, Math.ceil(clamp01((s - e.at) / Math.min(e.dur * 0.6, chars.length * 0.045)) * chars.length)).join('');
    const lines = wrap(c, e.text, e.who === 'all' ? 360 : 190);
    const shownLines = wrap(c, shown, e.who === 'all' ? 360 : 190);
    const w = Math.max(...lines.map(l => c.measureText(l).width)) + 22, h = lines.length * 18 + 12;
    const bx = Math.max(w / 2 + 4, Math.min(W0 - w / 2 - 4, x)), by = Math.max(h / 2 + 4, top - 14 - h / 2);
    c.fillStyle = e.who === 'all' ? '#fff59d' : '#ffffff';
    c.strokeStyle = '#263238';
    c.lineWidth = 2;
    c.beginPath();
    if (c.roundRect) c.roundRect(bx - w / 2, by - h / 2, w, h, 10);
    else c.rect(bx - w / 2, by - h / 2, w, h);
    c.fill();
    c.stroke();
    if (e.who !== 'all') {
      c.beginPath();
      c.moveTo(Math.max(bx - w / 2 + 10, Math.min(bx + w / 2 - 22, x - 6)), by + h / 2 - 1);
      c.lineTo(x + 2, by + h / 2 + 10);
      c.lineTo(Math.max(bx - w / 2 + 22, Math.min(bx + w / 2 - 10, x + 8)), by + h / 2 - 1);
      c.fill();
      c.stroke();
    }
    c.fillStyle = '#212121';
    shownLines.forEach((l, i) => c.fillText(l, bx, by - (lines.length - 1) * 9 + i * 18));
    if (e.who !== 'all' && e.who !== 'dog' && s - e.at < 0.9) {
      c.font = 'bold 10px system-ui, sans-serif';
      c.fillStyle = '#5d2e8c';
      c.fillText(CAST[e.who].name, bx - w / 2 + 6 + c.measureText(CAST[e.who].name).width / 2, by - h / 2 - 7);
      c.font = 'bold 15px system-ui, sans-serif';
    }
  }
}

// The episode at second s, on a canvas W × H.
export function drawSitcom(ctx, W, H, s) {
  s = Math.max(0, Math.min(SITCOM_LENGTH - 0.01, s));
  const st = stateAt(s);
  ctx.save();
  ctx.scale(W / W0, H / H0);
  if (st.set === 'titles') titles(ctx, s - st.setAt);
  else if (st.set === 'credits') credits(ctx, s - st.setAt);
  else {
    // The camera: a close-up now and then (for the punchlines).
    const c0 = st.cam, k = c0.dur ? ease(clamp01((s - c0.at) / c0.dur)) : 1, f = c0.from || c0;
    const z = lerp(f.z, c0.z, k), cx = lerp(f.x, c0.x, k), cy = lerp(f.y, c0.y, k);
    ctx.save();
    ctx.translate(W0 / 2, H0 / 2);
    ctx.scale(z, z);
    ctx.translate(-Math.max(W0 / 2 / z, Math.min(W0 - W0 / 2 / z, cx)), -Math.max(H0 / 2 / z, Math.min(H0 - H0 / 2 / z, cy)));
    if (st.set === 'living') livingRoom(ctx, st, s);
    else kitchen(ctx, st, s);
    if (st.set === 'living' && !st.props.behindCouch) couch(ctx);
    if (st.set === 'living' && st.props.hat) hatTable(ctx);
    const talking = new Set(st.says.filter(e => s - e.at < e.dur * 0.75).map(e => e.who));
    if (talking.has('all')) for (const w of Object.keys(st.actors)) talking.add(w);
    for (const [who, a] of Object.entries(st.actors)) {
      if (who === 'dog') drawDog(ctx, a, s, talking.has(who));
      else drawPerson(ctx, who, a, s, talking.has(who));
    }
    if (st.set === 'living' && st.props.behindCouch) couch(ctx);
    // The cake: on the counter, flying through the air, or in Ned's hands.
    const cake = st.props.cake;
    if (cake?.fly) {
      const e = cake.fly, q = clamp01((s - e.at) / e.dur);
      drawCake(ctx, lerp(e.from[0], e.to[0], q), lerp(e.from[1], e.to[1], q) - e.h * 4 * q * (1 - q), s, q < 1 ? q * e.spin * Math.PI * 2 : 0);
    } else if (cake?.on && st.actors[cake.on]) {
      const a = st.actors[cake.on], p = CAST[cake.on];
      drawCake(ctx, a.drawX + (a.f || 1) * 2, FLOOR + a.drawY - 78 * p.size - 32, s);
    } else if (cake) drawCake(ctx, cake.x, cake.y, s);
    drawFx(ctx, st, s);
    if (st.props.dark) {
      ctx.fillStyle = 'rgba(8,10,30,0.82)';
      ctx.fillRect(0, 0, W0, H0);
    }
    drawBubbles(ctx, st, s);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- The sound (for whoever is in the theater) ----------

const FILES = { theme: 'sitcom-theme.mp3', laugh: 'sitcom-laugh.mp3', applause: 'sitcom-applause.mp3', aww: 'sitcom-aww.mp3' };
const CUES = S.filter(e => e.kind === 'cue');
const SAYS = S.filter(e => e.kind === 'say');
const SFX = S.filter(e => e.kind === 'sfx');

export class SitcomSound {
  constructor(sounds) {
    this.sounds = sounds;
    this.buffers = {};
    this.loading = false;
    this.out = null;
    this.playing = []; // { src, gain, cue }
    this.last = null; // (where the episode was last time: anything between then and now plays)
    this.blipT = 0;
  }

  load(ctx) {
    if (this.loading) return;
    this.loading = true;
    for (const [k, f] of Object.entries(FILES)) {
      fetch(asset(`sounds/${f}`)).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => (this.buffers[k] = buf)).catch(() => {});
    }
  }

  // Every frame: s = seconds into the episode (null when it isn't on), here = in the theater.
  update(dt, s, here) {
    const on = here && s !== null;
    const ctx = on ? this.sounds.ensure() : this.sounds.ctx;
    if (!ctx) return;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.sounds.master);
    }
    this.out.gain.setTargetAtTime(on ? 0.75 : 0, ctx.currentTime, 0.3);
    if (!on) {
      this.stopAll(ctx);
      this.last = null;
      return;
    }
    this.load(ctx);
    const prev = this.last;
    this.last = s;
    if (prev === null || s < prev || s - prev > 2) {
      // (Just walked in, or the show started over: the theme song joins in where it's up to.)
      this.stopAll(ctx);
      for (const cue of CUES) if (cue.sound === 'theme' && s >= cue.at && s < cue.at + cue.dur - 1) this.play(ctx, cue, s - cue.at);
      return;
    }
    for (const cue of CUES) if (cue.at > prev && cue.at <= s) this.play(ctx, cue, 0);
    for (const e of SFX) if (e.at > prev && e.at <= s) this.effect(ctx, e.name);
    // Little voices while people's words type out.
    this.blipT -= dt;
    if (this.blipT <= 0) {
      this.blipT = 0.085;
      for (const e of SAYS) {
        const typing = Math.min(e.dur * 0.6, [...e.text].length * 0.045);
        if (s >= e.at && s < e.at + typing) this.blip(ctx, e.who === 'all' ? CAST[ORDER[Math.floor(Math.random() * 6)]].voice : CAST[e.who].voice, e.who === 'dog');
      }
    }
    // Fade out what's had its time.
    for (const p of this.playing) if (!p.fading && s > p.cue.at + p.cue.dur - (p.cue.sound === 'theme' ? 1.5 : 0.2)) {
      p.fading = true;
      p.gain.gain.setTargetAtTime(0, ctx.currentTime, p.cue.sound === 'theme' ? 0.5 : 0.45);
      p.src.stop(ctx.currentTime + 3);
    }
    this.playing = this.playing.filter(p => !p.done);
  }

  play(ctx, cue, offset) {
    const buf = this.buffers[cue.sound];
    if (!buf || offset >= buf.duration) return;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = cue.sound === 'theme' ? 0.55 : 0.8;
    src.connect(gain).connect(this.out);
    src.start(ctx.currentTime, offset);
    const p = { src, gain, cue };
    src.onended = () => (p.done = true);
    this.playing.push(p);
  }

  stopAll(ctx) {
    for (const p of this.playing) {
      try {
        p.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        p.src.stop(ctx.currentTime + 0.5);
      } catch {
        /* (already stopped) */
      }
    }
    this.playing = [];
  }

  // A voice: a short, bouncy little "bwip" at their pitch.
  blip(ctx, f, dog) {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = dog ? 'sawtooth' : 'square';
    const pitch = f * (0.85 + Math.random() * 0.35);
    o.frequency.setValueAtTime(pitch, t);
    o.frequency.exponentialRampToValueAtTime(pitch * (dog ? 0.5 : 1.25), t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.08);
  }

  noise(ctx, len) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  tone(ctx, type, f0, f1, len, vol, at = 0) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  burst(ctx, len, vol, freq, q = 0.8) {
    const t = ctx.currentTime, src = this.noise(ctx, len), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
  }

  effect(ctx, name) {
    if (name === 'poof') this.burst(ctx, 0.9, 0.5, 900, 0.5);
    else if (name === 'sneeze') {
      this.tone(ctx, 'sawtooth', 300, 500, 0.5, 0.05);
      this.burst(ctx, 0.6, 0.6, 2500, 0.7);
    } else if (name === 'crash') {
      this.burst(ctx, 0.5, 0.7, 400, 0.6);
      this.burst(ctx, 0.3, 0.4, 3000, 1);
    } else if (name === 'boing') this.tone(ctx, 'sine', 160, 620, 0.35, 0.2);
    else if (name === 'ding') {
      this.tone(ctx, 'sine', 1320, 1310, 0.8, 0.12);
      this.tone(ctx, 'sine', 1760, 1750, 0.8, 0.06, 0.08);
    } else if (name === 'door') this.tone(ctx, 'triangle', 220, 110, 0.25, 0.15);
    else if (name === 'click') this.tone(ctx, 'square', 1800, 1200, 0.03, 0.08);
    else if (name === 'magic') for (let i = 0; i < 6; i++) this.tone(ctx, 'sine', 900 + i * 220, 950 + i * 230, 0.25, 0.06, i * 0.07);
    else if (name === 'horn') this.tone(ctx, 'sawtooth', 420, 380, 0.6, 0.08);
  }
}
