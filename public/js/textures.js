// Procedurally generated, tileable textures (color + normal maps).
// Everything is drawn in code, so there are no image files to download or license.
import * as THREE from 'three';

const SIZE = 256;

// ---------- Noise helpers ----------

function hash(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise that wraps every fx/fy cells, so textures tile seamlessly.
function vnoise(u, v, fx, fy, s) {
  const x = u * fx, y = v * fy;
  const ix = Math.floor(x), iy = Math.floor(y);
  let tx = x - ix, ty = y - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const x0 = ((ix % fx) + fx) % fx, x1 = (x0 + 1) % fx;
  const y0 = ((iy % fy) + fy) % fy, y1 = (y0 + 1) % fy;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function fbm(u, v, f, octaves = 5, s = 0, fy = f) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(u, v, f, fy, s + i * 31);
    norm += amp;
    amp *= 0.5;
    f *= 2;
    fy *= 2;
  }
  return sum / norm;
}

// Tileable cellular (Worley) noise: distance to nearest and second-nearest point.
function worley(u, v, n, s) {
  const x = u * n, y = v * n;
  const ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox, cy = iy + oy;
      const wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
      const px = cx + hash(wx, wy, s), py = cy + hash(wx, wy, s + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < d1) { d2 = d1; d1 = d; id = hash(wx, wy, s + 13); }
      else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id };
}

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---------- Texture generators ----------
// Each returns per-pixel { c: [r,g,b] (0..1), h: height 0..1, a?: alpha }.

function grassTop(u, v) {
  const n = fbm(u, v, 8, 5, 1);
  const blade = hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 3);
  const clump = fbm(u, v, 32, 2, 5);
  let c = mixc([0.20, 0.38, 0.10], [0.42, 0.62, 0.20], n * 0.7 + clump * 0.3);
  c = shade(c, 0.82 + blade * 0.3);
  if (fbm(u, v, 16, 3, 9) > 0.66) c = mixc(c, [0.52, 0.55, 0.22], 0.35); // dry patches
  return { c, h: n * 0.4 + blade * 0.6 };
}

function dirt(u, v) {
  const n = fbm(u, v, 6, 6, 2);
  const w = worley(u, v, 12, 4);
  let c = mixc([0.27, 0.18, 0.11], [0.47, 0.34, 0.22], n);
  let h = n * 0.6;
  if (w.d1 < 0.22) {
    const k = 1 - w.d1 / 0.22;
    c = mixc(c, mixc([0.45, 0.40, 0.35], [0.6, 0.55, 0.48], w.id), smooth(0, 0.3, k));
    h += k * 0.5;
  }
  c = shade(c, 0.9 + hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 8) * 0.18);
  return { c, h };
}

function grassSide(u, v) {
  const d = dirt(u, v);
  const edge = 0.16 + vnoise(u, 0, 24, 1, 11) * 0.12 + (hash(Math.floor(u * SIZE / 4), 0, 12) * 0.08);
  if (v < edge) {
    const g = grassTop(u, v);
    return { c: shade(g.c, 0.9 + (v / edge) * 0.1), h: g.h * 0.6 + 0.4 };
  }
  if (v < edge + 0.03) return { c: shade(d.c, 0.7), h: d.h * 0.5 };
  return d;
}

function stone(u, v) {
  const n = fbm(u, v, 4, 6, 20);
  const w = worley(u, v, 5, 21);
  const crack = 1 - smooth(0, 0.035, w.d2 - w.d1);
  let c = mixc([0.40, 0.40, 0.41], [0.62, 0.61, 0.60], n);
  c = shade(c, 0.9 + hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 22) * 0.15);
  c = mixc(c, [0.25, 0.25, 0.26], crack * 0.7);
  return { c, h: n - crack * 0.4 };
}

function cobble(u, v) {
  const w = worley(u, v, 5, 30);
  const edge = w.d2 - w.d1;
  const n = fbm(u, v, 8, 5, 31);
  const mortar = 1 - smooth(0.04, 0.10, edge);
  const tone = 0.42 + w.id * 0.25;
  let c = mixc([tone, tone * 0.98, tone * 0.95], [tone + 0.12, tone + 0.1, tone + 0.08], n);
  c = mixc(c, [0.22, 0.21, 0.2], mortar);
  return { c, h: Math.sqrt(clamp(edge * 4)) * 0.8 + n * 0.2 - mortar * 0.3 };
}

function brick(u, v) {
  const rows = 4, cols = 2, mortarW = 0.035;
  const row = Math.floor(v * rows);
  const off = row % 2 ? 0.5 / cols : 0;
  const bu = (u * cols + off * cols) % cols;
  const col = Math.floor(bu);
  const fx = bu - col, fy = v * rows - row;
  const edge = Math.min(fx / cols * 2, (1 - fx) / cols * 2, fy / rows * 2, (1 - fy) / rows * 2) * 2;
  const id = hash(col, row, 40);
  const n = fbm(u, v, 16, 4, 41);
  let c = mixc([0.55, 0.22, 0.15], [0.72, 0.36, 0.25], id * 0.6 + n * 0.4);
  if (hash(col, row, 42) > 0.8) c = shade(c, 0.78);
  const isMortar = edge < mortarW;
  if (isMortar) c = mixc([0.62, 0.6, 0.56], [0.75, 0.73, 0.7], n);
  const h = isMortar ? 0.1 + n * 0.1 : 0.6 + smooth(mortarW, mortarW + 0.04, edge) * 0.2 + n * 0.2;
  return { c, h };
}

function planks(u, v) {
  const boards = 4;
  const b = Math.floor(v * boards);
  const fy = v * boards - b;
  const seamAt = hash(b, 0, 50);
  const seg = ((u - seamAt) % 1 + 1) % 1 < 0.5 ? 0 : 1;
  const id = hash(b, seg, 51);
  const grainN = fbm(u, v, 2, 4, 52 + seg, 8);
  const grain = Math.sin((fy * 6 + grainN * 10 + id * 20) * Math.PI) * 0.5 + 0.5;
  let c = mixc([0.55, 0.38, 0.22], [0.72, 0.53, 0.33], id * 0.5 + 0.25);
  c = shade(c, 0.85 + grain * 0.2);
  const du = Math.min(Math.abs(((u - seamAt) % 0.5 + 0.5) % 0.5), 0.5 - Math.abs(((u - seamAt) % 0.5 + 0.5) % 0.5));
  const gap = fy < 0.04 || fy > 0.96 || du < 0.006;
  if (gap) c = [0.2, 0.13, 0.07];
  return { c, h: gap ? 0 : 0.6 + grain * 0.2 };
}

function logSide(u, v) {
  const n = fbm(u, v, 10, 5, 60, 2);
  const groove = Math.pow(1 - Math.abs(Math.sin((u * 10 + fbm(u, v, 4, 3, 61, 4) * 2) * Math.PI)), 3);
  let c = mixc([0.24, 0.16, 0.09], [0.40, 0.29, 0.18], n);
  c = mixc(c, [0.13, 0.08, 0.05], groove * 0.8);
  return { c, h: n * 0.4 + (1 - groove) * 0.6 };
}

function logTop(u, v) {
  const dx = u - 0.5, dy = v - 0.5;
  const r = Math.hypot(dx, dy) + fbm(u, v, 4, 3, 70) * 0.04;
  if (r > 0.44) return logSide(u, v);
  const ring = Math.sin(r * 90) * 0.5 + 0.5;
  let c = mixc([0.62, 0.46, 0.28], [0.78, 0.62, 0.40], ring);
  c = shade(c, 0.9 + fbm(u, v, 16, 3, 71) * 0.2);
  if (r > 0.41) c = [0.3, 0.2, 0.12];
  return { c, h: 0.5 + ring * 0.2 };
}

function leaves(u, v) {
  const w = worley(u, v, 10, 80);
  const n = fbm(u, v, 8, 4, 81);
  const leaf = 1 - w.d1 * 1.6;
  let c = mixc([0.10, 0.28, 0.07], [0.28, 0.52, 0.15], clamp(leaf * 0.7 + w.id * 0.4));
  c = shade(c, 0.8 + n * 0.4);
  const a = leaf + n * 0.5 > 0.45 ? 1 : 0;
  return { c, h: clamp(leaf), a };
}

function glass(u, v) {
  const border = Math.min(u, v, 1 - u, 1 - v);
  if (border < 0.04) return { c: [0.82, 0.86, 0.88], h: 1, a: 1 };
  // Mostly clear, with a couple of faint shine streaks.
  const streak = Math.abs(((u + v) % 0.5) - 0.18) < 0.03 || Math.abs(((u + v) % 0.5) - 0.26) < 0.012;
  return { c: [0.72, 0.86, 0.95], h: 0.5, a: streak ? 0.24 : 0.1 };
}

function sand(u, v) {
  const n = fbm(u, v, 8, 5, 90);
  const ripple = Math.sin((v * 10 + fbm(u, v, 3, 3, 91) * 3) * Math.PI * 2) * 0.5 + 0.5;
  const grain = hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 92);
  let c = mixc([0.78, 0.68, 0.46], [0.92, 0.84, 0.62], n * 0.6 + ripple * 0.2 + grain * 0.2);
  return { c, h: ripple * 0.5 + grain * 0.3 + n * 0.2 };
}

function metal(u, v) {
  const n = fbm(u, v, 32, 3, 100, 2); // brushed look
  const cells = 6;
  const cx = Math.floor(u * cells), cy = Math.floor(v * cells);
  const fx = u * cells - cx - 0.5, fy = v * cells - cy - 0.5;
  const ang = (cx + cy) % 2 ? Math.PI / 4 : -Math.PI / 4;
  const rx = fx * Math.cos(ang) - fy * Math.sin(ang), ry = fx * Math.sin(ang) + fy * Math.cos(ang);
  const d = Math.hypot(rx / 0.32, ry / 0.08);
  const bump = 1 - smooth(0.8, 1, d);
  let c = mixc([0.50, 0.52, 0.55], [0.66, 0.68, 0.70], n);
  c = shade(c, 0.95 + bump * 0.12);
  const border = Math.min(u, v, 1 - u, 1 - v);
  if (border < 0.02) c = shade(c, 0.6);
  return { c, h: bump * 0.8 + n * 0.1 };
}

function marble(u, v) {
  const t = fbm(u, v, 3, 6, 110);
  const vein = Math.abs(Math.sin((u * 2 + v * 3) * Math.PI + t * 12));
  const v2 = Math.abs(Math.sin((u * 3 - v * 1) * Math.PI * 2 + t * 9));
  let c = mixc([0.86, 0.85, 0.83], [0.96, 0.95, 0.94], fbm(u, v, 6, 4, 111));
  c = mixc(c, [0.45, 0.45, 0.48], (1 - smooth(0, 0.06, vein)) * 0.75);
  c = mixc(c, [0.62, 0.6, 0.6], (1 - smooth(0, 0.04, v2)) * 0.4);
  return { c, h: 0.5 };
}

function concrete(tint, gloss = 0) {
  return (u, v) => {
    const n = fbm(u, v, 8, 6, 120);
    const pore = hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 121) > 0.985;
    let c = shade(tint, 0.88 + n * 0.22);
    if (pore) c = shade(c, 0.6);
    const border = Math.min(u, v, 1 - u, 1 - v);
    if (border < 0.012) c = shade(c, 0.75 + gloss);
    return { c, h: pore ? 0 : 0.5 + n * 0.2 };
  };
}

function lamp(u, v) {
  const border = Math.min(u, v, 1 - u, 1 - v);
  if (border < 0.08) {
    const m = metal(u, v);
    return { c: shade(m.c, 0.5), h: 1, e: 0 };
  }
  const gx = (u * 4) % 1, gy = (v * 4) % 1;
  const grid = Math.min(gx, gy, 1 - gx, 1 - gy) < 0.04;
  const glow = 1 - Math.hypot(u - 0.5, v - 0.5) * 0.6;
  const c = grid ? [0.55, 0.42, 0.22] : mixc([1.0, 0.72, 0.35], [1.0, 0.93, 0.72], glow);
  return { c, h: grid ? 0.6 : 0.4, e: grid ? 0.4 : 1 };
}

function bounce(u, v) {
  const n = fbm(u, v, 6, 4, 130);
  const w = worley(u, v, 7, 131);
  const bubble = w.d1 < 0.12 ? 1 - w.d1 / 0.12 : 0;
  let c = mixc([0.25, 0.75, 0.15], [0.55, 0.95, 0.3], n);
  c = mixc(c, [0.85, 1, 0.7], bubble * 0.5);
  const border = Math.min(u, v, 1 - u, 1 - v);
  if (border < 0.06) c = [0.12, 0.3, 0.08];
  return { c, h: 0.4 + bubble * 0.4 + n * 0.2, e: border < 0.06 ? 0 : 0.35 };
}

function tiles(u, v) {
  const n = 4;
  const tx = Math.floor(u * n), ty = Math.floor(v * n);
  const fx = u * n - tx, fy = v * n - ty;
  const grout = Math.min(fx, fy, 1 - fx, 1 - fy) < 0.03;
  const dark = (tx + ty) % 2 === 1;
  const m = fbm(u, v, 8, 4, 140);
  let c = dark ? mixc([0.10, 0.11, 0.13], [0.18, 0.19, 0.22], m) : mixc([0.86, 0.86, 0.84], [0.95, 0.95, 0.93], m);
  if (grout) c = [0.45, 0.44, 0.42];
  return { c, h: grout ? 0 : 0.7 };
}


function doorPanel(u, v, top) {
  // Vertical boards with a frame; the top half has a 4-pane window (transparent).
  const frame = Math.min(u, 1 - u) < 0.1 || (top ? v < 0.08 : v > 0.92);
  const boards = Math.floor(u * 5);
  const grain = fbm(u, v, 2, 4, 150 + boards, 10);
  let c = mixc([0.50, 0.32, 0.18], [0.62, 0.42, 0.25], grain);
  if (Math.abs((u * 5) % 1 - 0.5) > 0.46) c = shade(c, 0.6);
  if (frame) c = shade(mixc([0.45, 0.28, 0.15], [0.55, 0.36, 0.2], grain), 0.85);
  if (top && !frame) {
    const inWin = u > 0.18 && u < 0.82 && v > 0.15 && v < 0.75;
    const bar = Math.abs(u - 0.5) < 0.03 || Math.abs(v - 0.45) < 0.03;
    if (inWin && !bar) return { c: [0.7, 0.85, 0.95], h: 0.2, a: 0 };
  }
  // Raised panels on the bottom half, and a gold handle.
  if (!top && !frame) {
    const inPanel = (v > 0.12 && v < 0.45 || v > 0.55 && v < 0.88) && u > 0.2 && u < 0.8;
    if (inPanel) c = shade(c, 1.08);
    if (Math.hypot(u - 0.8, v - 0.12) < 0.05) return { c: [0.95, 0.78, 0.25], h: 1 };
  }
  return { c, h: frame ? 0.8 : 0.5 + grain * 0.2 };
}

function asphalt(u, v) {
  const n = fbm(u, v, 8, 5, 160);
  const grit = hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 161);
  let c = mixc([0.16, 0.16, 0.17], [0.26, 0.26, 0.27], n);
  if (grit > 0.93) c = shade(c, 1.5);
  return { c, h: n * 0.5 + grit * 0.3 };
}

function roadLine(u, v) {
  const a = asphalt(u, v);
  if (Math.abs(u - 0.5) < 0.09) {
    const wear = fbm(u, v, 16, 3, 162);
    if (wear > 0.3) return { c: mixc([0.95, 0.78, 0.15], [1, 0.85, 0.3], wear), h: 0.6 };
  }
  return a;
}

// The same yellow line, turned to run the other way.
const roadLineTurned = (u, v) => roadLine(v, u);

// Parking lots: a white stripe along one edge of the asphalt (the edge between two spaces).
function parkingLine(u, v) {
  const a = asphalt(u, v);
  if (u < 0.08) {
    const wear = fbm(u, v, 16, 3, 163);
    if (wear > 0.25) return { c: mixc([0.86, 0.86, 0.84], [0.97, 0.97, 0.95], wear), h: 0.6 };
  }
  return a;
}
const parkingLineTurned = (u, v) => parkingLine(v, u);

// A blue parking sign with a big white P.
function parkingSign(u, v) {
  const border = Math.min(u, v, 1 - u, 1 - v);
  if (border < 0.06) return { c: [0.92, 0.93, 0.95], h: 1 };
  const stem = u > 0.3 && u < 0.43 && v > 0.18 && v < 0.82;
  const d = Math.hypot(u - 0.48, v - 0.37);
  const bowl = u > 0.36 && d < 0.2 && d > 0.09;
  if (stem || bowl) return { c: [0.97, 0.97, 0.97], h: 0.9 };
  const n = fbm(u, v, 8, 3, 164);
  return { c: shade([0.12, 0.33, 0.72], 0.92 + n * 0.12), h: 0.5 };
}

// Skyscraper windows: blue tinted glass in a dark frame, with a soft sky reflection.
function tintedGlass(u, v) {
  const border = Math.min(u, v, 1 - u, 1 - v);
  if (border < 0.035) return { c: [0.2, 0.23, 0.27], h: 1, a: 1 };
  const streak = Math.abs(((u + v * 0.6) % 0.6) - 0.2) < 0.04;
  const sky = 1 - v * 0.5;
  return { c: mixc([0.16, 0.3, 0.46], [0.42, 0.62, 0.8], sky * 0.6 + (streak ? 0.3 : 0)), h: 0.5, a: streak ? 0.5 : 0.38 };
}

function sidewalk(u, v) {
  const n = fbm(u, v, 8, 5, 170);
  const slab = Math.min((u * 2) % 1, (v * 2) % 1, 1 - (u * 2) % 1, 1 - (v * 2) % 1) < 0.025;
  let c = mixc([0.62, 0.61, 0.58], [0.74, 0.73, 0.70], n);
  if (slab) c = shade(c, 0.6);
  return { c, h: slab ? 0 : 0.5 + n * 0.2 };
}

function roofTiles(u, v) {
  const rows = 6;
  const row = Math.floor(v * rows);
  const fy = v * rows - row;
  const off = row % 2 ? 0.5 : 0;
  const cu = (u * 4 + off) % 1;
  const id = hash(Math.floor(u * 4 + off), row, 180);
  const curve = Math.sin(cu * Math.PI);
  const n = fbm(u, v, 12, 3, 181);
  let c = mixc([0.62, 0.22, 0.14], [0.78, 0.34, 0.2], id * 0.6 + n * 0.4);
  c = shade(c, 0.7 + fy * 0.3 + curve * 0.15);
  if (cu < 0.04 || cu > 0.96) c = shade(c, 0.5);
  return { c, h: fy * 0.6 + curve * 0.4 };
}

function flowers(u, v) {
  // Stems and leaves with colourful round blossoms; everything else is see-through.
  const stems = [0.2, 0.42, 0.63, 0.82];
  const colors = [[0.95, 0.2, 0.25], [1, 0.85, 0.2], [0.95, 0.45, 0.8], [0.6, 0.4, 1]];
  for (let i = 0; i < stems.length; i++) {
    const top = 0.25 + hash(i, 0, 190) * 0.25;
    const sx = stems[i] + Math.sin(v * 6 + i) * 0.02;
    const d = Math.hypot(u - sx, (v - top) * 1.1);
    if (d < 0.085) {
      const center = d < 0.03;
      return { c: center ? [1, 0.9, 0.3] : colors[i], h: 1 - d * 6 };
    }
    if (Math.abs(u - sx) < 0.018 && v > top) return { c: [0.2, 0.5, 0.15], h: 0.5 };
    const leafY = top + 0.35;
    if (Math.hypot((u - sx - 0.05) * 1.5, v - leafY) < 0.04) return { c: [0.25, 0.6, 0.2], h: 0.5 };
  }
  return { c: [0.2, 0.5, 0.15], h: 0, a: 0 };
}

function rainbow(u, v) {
  const bands = [[0.9, 0.2, 0.2], [1, 0.55, 0.15], [1, 0.88, 0.2], [0.3, 0.8, 0.3], [0.2, 0.55, 0.95], [0.55, 0.3, 0.85]];
  const b = Math.floor(v * 6);
  const n = fbm(u, v, 8, 3, 200);
  const edge = (v * 6) % 1;
  let c = shade(bands[b], 0.9 + n * 0.15);
  if (edge < 0.06) c = shade(c, 0.8);
  return { c, h: 0.5 + (edge < 0.06 ? -0.3 : 0) };
}

function water(u, v) {
  const n = fbm(u, v, 4, 5, 210);
  const ripple = Math.sin((u * 3 + v * 2 + n * 3) * Math.PI * 2) * 0.5 + 0.5;
  const c = mixc([0.10, 0.35, 0.60], [0.25, 0.60, 0.85], n * 0.6 + ripple * 0.4);
  return { c, h: ripple * 0.5 + n * 0.5 };
}

function mirror(u, v) {
  const border = Math.min(u, v, 1 - u, 1 - v);
  if (border < 0.05) return { c: [0.25, 0.25, 0.28], h: 1 };
  const n = fbm(u, v, 16, 2, 220);
  return { c: [0.9 + n * 0.04, 0.92 + n * 0.04, 0.95], h: border < 0.07 ? 0.6 : 0.5 };
}

function gold(u, v) {
  const n = fbm(u, v, 3, 4, 230, 24); // brushed
  const border = Math.min(u, v, 1 - u, 1 - v);
  let c = mixc([0.85, 0.6, 0.16], [1, 0.84, 0.38], n);
  if (border < 0.04) c = shade(c, 0.75);
  return { c, h: border < 0.04 ? 0.3 : 0.6 + n * 0.1 };
}

// Garage door: horizontal ribbed panels with a little handle row.
function garage(u, v) {
  const rib = (v * 5) % 1;
  const n = fbm(u, v, 16, 3, 250, 2);
  let c = mixc([0.62, 0.64, 0.67], [0.74, 0.75, 0.77], n);
  if (rib < 0.08) c = shade(c, 0.5);
  else if (rib < 0.16) c = shade(c, 1.08);
  return { c, h: rib < 0.08 ? 0.1 : 0.6 + (rib < 0.16 ? 0.2 : 0) };
}

// Railings: smooth, light painted wood, so paint colors show up well on them.
function railing(u, v) {
  const n = fbm(u, v, 4, 4, 130, 6);
  const grain = Math.sin((u * 24 + n * 5) * Math.PI) * 0.5 + 0.5;
  const c = shade([0.9, 0.88, 0.84], 0.9 + grain * 0.07 + n * 0.06);
  return { c, h: 0.5 + grain * 0.1 };
}

// Neon: a dark panel with a glowing tube bent into a frame and a zig-zag.
function neon(color) {
  return (u, v) => {
    const n = fbm(u, v, 8, 3, 240);
    const frame = Math.abs(Math.min(u, v, 1 - u, 1 - v) - 0.12);
    const zig = Math.abs(v - (0.5 + (Math.abs(((u * 4) % 1) - 0.5) - 0.25) * 0.5));
    const d = Math.min(frame, u > 0.2 && u < 0.8 ? zig : 1);
    if (d < 0.025) return { c: mixc(color, [1, 1, 1], 0.55), h: 1, e: 1 };
    if (d < 0.07) {
      const k = 1 - (d - 0.025) / 0.045;
      return { c: shade(color, 0.35 + k * 0.5), h: 0.6, e: k * 0.6 };
    }
    return { c: [0.07 + n * 0.03, 0.06 + n * 0.03, 0.09 + n * 0.03], h: 0.4, e: 0 };
  };
}

const GENERATORS = {
  grass_top: grassTop,
  grass_side: grassSide,
  dirt,
  stone,
  cobble,
  brick,
  planks,
  log_side: logSide,
  log_top: logTop,
  leaves,
  glass,
  sand,
  metal,
  marble,
  concrete: concrete([0.68, 0.68, 0.66]),
  paint_red: concrete([0.72, 0.12, 0.10], 0.1),
  paint_blue: concrete([0.12, 0.28, 0.72], 0.1),
  paint_yellow: concrete([0.92, 0.72, 0.12], 0.1),
  paint_black: concrete([0.07, 0.07, 0.08], 0.4),
  lamp,
  bounce,
  tiles,
  door_bottom: (u, v) => doorPanel(u, v, false),
  door_top: (u, v) => doorPanel(u, v, true),
  asphalt,
  road_line: roadLine,
  road_line_turned: roadLineTurned,
  parking_line: parkingLine,
  parking_line_turned: parkingLineTurned,
  parking_sign: parkingSign,
  tinted_glass: tintedGlass,
  sidewalk,
  roof: roofTiles,
  flowers,
  rainbow,
  water,
  paint_pink: concrete([0.95, 0.62, 0.72], 0.1),
  paint_mint: concrete([0.55, 0.88, 0.72], 0.1),
  paint_sky: concrete([0.55, 0.78, 0.95], 0.1),
  paint_orange: concrete([0.95, 0.5, 0.15], 0.1),
  paint_purple: concrete([0.5, 0.28, 0.75], 0.1),
  paint_green: concrete([0.25, 0.62, 0.25], 0.1),
  mirror,
  gold,
  garage,
  railing,
  neon_pink: neon([1, 0.25, 0.65]),
  neon_blue: neon([0.25, 0.7, 1]),
  neon_green: neon([0.35, 1, 0.42]),
};

const NORMAL_STRENGTH = {
  grass_top: 2, dirt: 3, stone: 3, cobble: 5, brick: 4, planks: 3, log_side: 4, log_top: 2,
  sand: 2, metal: 4, tiles: 3, lamp: 2, bounce: 2, leaves: 2,
  door_bottom: 3, door_top: 3, garage: 3, asphalt: 2, sidewalk: 3, roof: 4, rainbow: 2, water: 1,
};

// ---------- Building THREE textures ----------

function render(name) {
  const gen = GENERATORS[name];
  const color = new Uint8ClampedArray(SIZE * SIZE * 4);
  const heights = new Float32Array(SIZE * SIZE);
  let emissive = null;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const p = gen((x + 0.5) / SIZE, (y + 0.5) / SIZE);
      color[i * 4] = clamp(p.c[0]) * 255;
      color[i * 4 + 1] = clamp(p.c[1]) * 255;
      color[i * 4 + 2] = clamp(p.c[2]) * 255;
      color[i * 4 + 3] = (p.a ?? 1) * 255;
      heights[i] = p.h;
      if (p.e !== undefined) {
        emissive ??= new Uint8ClampedArray(SIZE * SIZE * 4);
        for (let k = 0; k < 3; k++) emissive[i * 4 + k] = color[i * 4 + k] * p.e;
        emissive[i * 4 + 3] = 255;
      }
    }
  }

  // Height map -> tangent-space normal map (Sobel filter, wrapping at the edges).
  const strength = NORMAL_STRENGTH[name] ?? 1.5;
  const normal = new Uint8ClampedArray(SIZE * SIZE * 4);
  const H = (x, y) => heights[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * SIZE + x) * 4;
      normal[i] = (nx / len * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      normal[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }

  return { color, normal, emissive };
}

function toCanvas(data) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.getContext('2d').putImageData(new ImageData(data, SIZE, SIZE), 0, 0);
  return canvas;
}

function toTexture(canvas, srgb, anisotropy) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Generates every texture. Yields between textures so the loading screen can update.
export async function generateTextures(anisotropy, onProgress) {
  const out = {};
  const names = Object.keys(GENERATORS);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const { color, normal, emissive } = render(name);
    const canvas = toCanvas(color);
    out[name] = {
      canvas,
      map: toTexture(canvas, true, anisotropy),
      normalMap: toTexture(toCanvas(normal), false, anisotropy),
      emissiveMap: emissive ? toTexture(toCanvas(emissive), true, anisotropy) : null,
    };
    onProgress?.((i + 1) / names.length);
    await new Promise(r => setTimeout(r, 0));
  }
  return out;
}
