// TVs built from blocks (see the Build Book) show a little broadcast:
// silly commercials, the weather, a cartoon and the news. Right-click to change channel.
import * as THREE from 'three';

const PX = 128, PY = 96; // canvas pixels per screen block

function gradient(ctx, W, H, a, b) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Writes text as big as fits in the given width.
function fitText(ctx, text, x, y, maxW, size, color, align = 'left') {
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = `900 ${Math.floor(size * maxW / w)}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

const rect = (ctx, c, x, y, w, h) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

// ---------- Commercials ----------

const ADS = [
  {
    name: 'ROCKET SODA', tag: 'Tastes like outer space!', bg: ['#1a237e', '#7c4dff'],
    art(ctx, x, y, s, t) {
      const hop = Math.abs(Math.sin(t * 3)) * s * 0.15;
      rect(ctx, '#e53935', x - s * 0.18, y - s * 0.35 - hop, s * 0.36, s * 0.6);
      rect(ctx, '#cfd8dc', x - s * 0.18, y - s * 0.4 - hop, s * 0.36, s * 0.06);
      rect(ctx, '#ffffff', x - s * 0.18, y - s * 0.1 - hop, s * 0.36, s * 0.08);
      for (let i = 0; i < 6; i++) {
        const by = y - s * 0.5 - ((t * 40 + i * 23) % (s * 0.6));
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(x - s * 0.15 + (i * 13) % (s * 0.3), by, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    name: 'BUILDZONE BURGERS', tag: 'Now with 2 extra blocks!', bg: ['#e65100', '#ffb300'],
    art(ctx, x, y, s, t) {
      const layers = ['#d7a86e', '#2e7d32', '#e53935', '#fdd835', '#6d4c41', '#d7a86e'];
      const shown = Math.min(layers.length, Math.floor((t % 4) * 3) + 1);
      for (let i = 0; i < shown; i++) rect(ctx, layers[i], x - s * 0.3, y + s * 0.3 - i * s * 0.1, s * 0.6, s * 0.09);
    },
  },
  {
    name: 'SUPER JUMP SNEAKERS', tag: 'Jump over your house!*', small: '*not really', bg: ['#00695c', '#4db6ac'],
    art(ctx, x, y, s, t) {
      rect(ctx, '#8d6e63', x - s * 0.1, y + s * 0.15, s * 0.2, s * 0.2);
      const jump = Math.abs(Math.sin(t * 2.5)) * s * 0.45;
      const sx = x - s * 0.35 + ((t * 30) % (s * 0.7));
      rect(ctx, '#ffffff', sx - s * 0.12, y + s * 0.2 - jump, s * 0.24, s * 0.08);
      rect(ctx, '#e53935', sx - s * 0.12, y + s * 0.1 - jump, s * 0.16, s * 0.1);
    },
  },
  {
    name: 'PUPPY CHOW DELUXE', tag: 'Your pet will do backflips!', bg: ['#880e4f', '#f06292'],
    art(ctx, x, y, s, t) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.max(0, Math.sin(t * 2)) * Math.PI * 2);
      rect(ctx, '#d7a86e', -s * 0.2, -s * 0.2, s * 0.4, s * 0.36);
      rect(ctx, '#8d6e63', -s * 0.26, -s * 0.18, s * 0.08, s * 0.2);
      rect(ctx, '#8d6e63', s * 0.18, -s * 0.18, s * 0.08, s * 0.2);
      rect(ctx, '#111', -s * 0.1, -s * 0.08, s * 0.05, s * 0.05);
      rect(ctx, '#111', s * 0.05, -s * 0.08, s * 0.05, s * 0.05);
      rect(ctx, '#ff8fab', -s * 0.03, s * 0.04, s * 0.06, s * 0.06);
      ctx.restore();
    },
  },
  {
    name: 'MOON TAXI', tag: 'Book your ride today!', bg: ['#0d1b2a', '#283593'],
    art(ctx, x, y, s, t) {
      ctx.fillStyle = '#fff59d';
      ctx.beginPath();
      ctx.arc(x + s * 0.25, y - s * 0.2, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 12; i++) rect(ctx, '#fff', x - s * 0.45 + (i * 37) % (s * 0.9), y - s * 0.4 + (i * 53) % (s * 0.6), 2, 2);
      const cx = x - s * 0.4 + ((t * 25) % (s * 0.8)), cy = y + s * 0.1 - ((t * 25) % (s * 0.8)) * 0.3;
      rect(ctx, '#fdd835', cx - s * 0.12, cy - s * 0.05, s * 0.24, s * 0.08);
      rect(ctx, '#fdd835', cx - s * 0.06, cy - s * 0.11, s * 0.12, s * 0.07);
      rect(ctx, '#222', cx - s * 0.1, cy + s * 0.03, s * 0.05, s * 0.04);
      rect(ctx, '#222', cx + s * 0.05, cy + s * 0.03, s * 0.05, s * 0.04);
    },
  },
];

function commercials(ctx, W, H, t) {
  const ad = ADS[Math.floor(t / 6) % ADS.length];
  gradient(ctx, W, H, ad.bg[0], ad.bg[1]);
  const s = Math.min(H, W * 0.45);
  ad.art(ctx, s * 0.55, H * 0.55, s, t);
  const tx = Math.max(s * 1.05, W * 0.42);
  fitText(ctx, ad.name, tx, H * 0.36, W - tx - 6, H * 0.2, '#ffffff');
  fitText(ctx, ad.tag, tx, H * 0.6, W - tx - 6, H * 0.12, '#ffeb3b');
  if (ad.small) fitText(ctx, ad.small, tx, H * 0.8, W - tx - 6, H * 0.08, 'rgba(255,255,255,0.7)');
  rect(ctx, 'rgba(0,0,0,0.4)', 4, 4, 22, 13);
  fitText(ctx, 'AD', 15, 11, 20, 10, '#fff', 'center');
}

function weather(ctx, W, H, t, info) {
  gradient(ctx, W, H, info.night ? '#0b1430' : '#1e88e5', info.night ? '#283593' : '#90caf9');
  const s = Math.min(H, W * 0.4);
  ctx.fillStyle = info.night ? '#fff59d' : '#ffd54f';
  ctx.beginPath();
  ctx.arc(s * 0.5, H * 0.45, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  if (!info.night) {
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(s * 0.5 + Math.cos(a) * s * 0.28, H * 0.45 + Math.sin(a) * s * 0.28);
      ctx.lineTo(s * 0.5 + Math.cos(a) * s * 0.36, H * 0.45 + Math.sin(a) * s * 0.36);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const cx = ((t * 12) % (W + 60)) - 30;
  for (const [dx, dy, r] of [[0, 0, 10], [12, -4, 12], [24, 0, 9]]) {
    ctx.beginPath();
    ctx.arc(cx + dx, H * 0.25 + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tx = s * 1.0;
  const temp = info.night ? 14 : 18 + Math.round(Math.sin(info.dayPhase * Math.PI) * 9);
  fitText(ctx, `${temp}°`, tx, H * 0.35, W - tx - 6, H * 0.32, '#fff');
  fitText(ctx, info.clock.replace(/^\S+ /, ''), tx, H * 0.62, W - tx - 6, H * 0.13, '#fff');
  fitText(ctx, '100% chance of building!', tx, H * 0.82, W - tx - 6, H * 0.1, '#ffeb3b');
  rect(ctx, 'rgba(0,0,0,0.35)', 0, 0, W, 14);
  fitText(ctx, 'BUILDZONE WEATHER', 6, 7, W - 12, 10, '#fff');
}

function cartoon(ctx, W, H, t) {
  gradient(ctx, W, H, '#81d4fa', '#e1f5fe');
  rect(ctx, '#7cb342', 0, H * 0.75, W, H * 0.25);
  // Trampoline
  const tx = W * 0.3;
  rect(ctx, '#333', tx - 22, H * 0.72, 44, 4);
  rect(ctx, '#333', tx - 20, H * 0.72, 3, 10);
  rect(ctx, '#333', tx + 17, H * 0.72, 3, 10);
  // Bouncing blocky kid doing flips
  const b = Math.abs(Math.sin(t * 2.2));
  ctx.save();
  ctx.translate(tx, H * 0.62 - b * H * 0.42);
  ctx.rotate(b > 0.6 ? (t * 6) % (Math.PI * 2) : 0);
  rect(ctx, '#f5c9a0', -6, -20, 12, 12);
  rect(ctx, '#1e88e5', -7, -8, 14, 12);
  rect(ctx, '#3949ab', -6, 4, 5, 8);
  rect(ctx, '#3949ab', 1, 4, 5, 8);
  rect(ctx, '#111', -3, -16, 2, 2);
  rect(ctx, '#111', 2, -16, 2, 2);
  ctx.restore();
  // A puppy chasing a ball back and forth
  const run = Math.sin(t * 0.8);
  const dx = W * 0.7 + run * W * 0.2;
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.arc(dx + 18 * Math.sign(Math.cos(t * 0.8)), H * 0.8, 4, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, '#d7a86e', dx - 9, H * 0.72, 18, 9);
  rect(ctx, '#d7a86e', dx + (Math.cos(t * 0.8) > 0 ? 6 : -14), H * 0.66, 8, 8);
  rect(ctx, '#8d6e63', dx - 8, H * 0.81, 3, 4 + Math.abs(Math.sin(t * 12)) * 2);
  rect(ctx, '#8d6e63', dx + 5, H * 0.81, 3, 4 + Math.abs(Math.cos(t * 12)) * 2);
  fitText(ctx, 'The Blocky Bunch', 6, 10, W - 12, 11, '#e53935');
}

function news(ctx, W, H, t, info) {
  gradient(ctx, W, H, '#0d47a1', '#1565c0');
  // Anchor at the desk
  const ax = W * 0.3;
  rect(ctx, '#f5c9a0', ax - 9, H * 0.22, 18, 18);
  rect(ctx, '#3b2314', ax - 10, H * 0.2, 20, 6);
  rect(ctx, '#111', ax - 5, H * 0.3, 3, 3);
  rect(ctx, '#111', ax + 2, H * 0.3, 3, 3);
  rect(ctx, '#7a2b2b', ax - 4, H * 0.36 + (Math.sin(t * 9) > 0 ? 1 : 0), 8, 2 + (Math.sin(t * 9) > 0 ? 2 : 0));
  rect(ctx, '#263238', ax - 14, H * 0.42, 28, 20);
  rect(ctx, '#90a4ae', ax - 40, H * 0.6, 80, 10);
  rect(ctx, '#d32f2f', 6, 6, 44, 16);
  fitText(ctx, 'BZ NEWS', 28, 14, 40, 11, '#fff', 'center');
  if (Math.floor(t * 2) % 2) {
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(W - 30, 14, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  fitText(ctx, 'LIVE', W - 22, 14, 30, 10, '#fff');
  const headlines = [
    `${info.players} builder${info.players === 1 ? '' : 's'} in town right now!`,
    'Monster truck spotted climbing houses',
    'Local puppy fetches ball 1,000 times, not tired',
    'Fireworks tonight! Look up!',
    `Time check: ${info.clock.replace(/^\S+ /, '')}`,
    'Scientists confirm: bounce pads are bouncy',
    'Helicopter pilot lands gently, everyone cheers',
  ];
  const big = headlines[Math.floor(t / 5) % headlines.length];
  fitText(ctx, big, W * 0.55, H * 0.42, W * 0.42, H * 0.13, '#fff', 'center');
  rect(ctx, '#fdd835', 0, H - 18, W, 18);
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = '#111';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const ticker = headlines.join('   •   ') + '   •   ';
  const tw = ctx.measureText(ticker).width;
  const off = (t * 40) % tw;
  ctx.fillText(ticker, -off, H - 9);
  ctx.fillText(ticker, tw - off, H - 9);
}

export const CHANNELS = [
  { name: 'Commercials', draw: commercials, glow: '#9575cd' },
  { name: 'Weather', draw: weather, glow: '#64b5f6' },
  { name: 'Cartoons', draw: cartoon, glow: '#aed581' },
  { name: 'News', draw: news, glow: '#5c8bd6' },
];

function staticNoise(ctx, W, H) {
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export class TVs {
  constructor(scene) {
    this.scene = scene;
    this.screens = new Map(); // structure key -> screen
    this.version = -1;
  }

  key(tv) {
    return `${tv.x},${tv.y},${tv.z},${tv.ax},${tv.width}`;
  }

  // Makes screens for new TVs and removes screens for TVs that were taken apart.
  sync(structures) {
    if (structures.version === this.version) return;
    this.version = structures.version;
    const now = new Set();
    for (const tv of structures.ofType('tv')) {
      const k = this.key(tv);
      now.add(k);
      if (!this.screens.has(k)) this.screens.set(k, this.build(tv));
    }
    for (const [k, sc] of this.screens) {
      if (now.has(k)) continue;
      for (const m of sc.meshes) this.scene.remove(m);
      sc.texture.dispose();
      sc.material.dispose();
      sc.meshes[0].geometry.dispose();
      this.screens.delete(k);
    }
  }

  build(tv) {
    const canvas = document.createElement('canvas');
    canvas.width = PX * tv.width;
    canvas.height = PY;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Bright and unaffected by the scene's lighting, so it glows in the dark.
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) });
    const geo = new THREE.PlaneGeometry(tv.width - 0.08, 0.86);
    const along = tv.ax === 1;
    const cx = tv.x + (along ? tv.width / 2 : 0.5), cz = tv.z + (along ? 0.5 : tv.width / 2);
    const meshes = [1, -1].map(side => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(cx + (along ? 0 : side * 0.52), tv.y + 0.5, cz + (along ? side * 0.52 : 0));
      m.rotation.y = along ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.scene.add(m);
      return m;
    });
    return { tv, canvas, ctx: canvas.getContext('2d'), texture, material, meshes, channel: 0, switchT: 1, timer: 0, center: new THREE.Vector3(cx, tv.y + 0.5, cz) };
  }

  find(tv) {
    return this.screens.get(this.key(tv));
  }

  nextChannel(tv) {
    const sc = this.find(tv);
    if (!sc) return null;
    sc.channel = (sc.channel + 1) % CHANNELS.length;
    sc.switchT = 0;
    return CHANNELS[sc.channel].name;
  }

  // info: { players, clock, night, dayPhase }
  update(dt, time, cameraPos, info) {
    for (const sc of this.screens.values()) {
      const d = sc.center.distanceTo(cameraPos);
      for (const m of sc.meshes) m.visible = d < 90;
      sc.switchT += dt;
      sc.timer -= dt;
      if (d > 35 || sc.timer > 0) continue;
      sc.timer = 1 / 12; // redraw 12 times a second
      const { ctx, canvas } = sc;
      if (sc.switchT < 0.35) {
        staticNoise(ctx, canvas.width, canvas.height);
      } else {
        CHANNELS[sc.channel].draw(ctx, canvas.width, canvas.height, time, info);
        if (sc.switchT < 2.5) {
          rect(ctx, 'rgba(0,0,0,0.5)', canvas.width - 46, canvas.height - 40, 40, 18);
          fitText(ctx, `CH ${sc.channel + 1}`, canvas.width - 26, canvas.height - 31, 36, 12, '#7dff8a', 'center');
        }
      }
      sc.texture.needsUpdate = true;
    }
  }
}
