// The pictures you can hang on a wall: four paintings in a golden frame and four bright
// posters. Each is drawn in code on a little canvas (no image files).

const W = 128, H = 96;

function make(draw) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  draw(ctx);
  return c;
}

const circle = (ctx, x, y, r, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};
const poly = (ctx, color, ...pts) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
};

// A thick golden frame with a darker inner edge.
function goldFrame(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f3d27a');
  g.addColorStop(0.5, '#b98a2e');
  g.addColorStop(1, '#f0c766');
  ctx.strokeStyle = g;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.strokeStyle = '#6b4a14';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, W - 28, H - 28);
}

// A poster: a white border, and a big word at the bottom.
function posterFrame(ctx, word, color) {
  ctx.strokeStyle = '#fafafa';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  if (!word) return;
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(word, W / 2, H - 13);
  ctx.fillStyle = color;
  ctx.fillText(word, W / 2, H - 13);
}

const PAINTINGS = [
  // Sunset over the sea, with a little sailboat.
  ctx => {
    const sky = ctx.createLinearGradient(0, 0, 0, 60);
    sky.addColorStop(0, '#5b3b8c');
    sky.addColorStop(0.55, '#f0627a');
    sky.addColorStop(1, '#ffb347');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 60);
    circle(ctx, 64, 60, 18, '#ffe27a');
    const sea = ctx.createLinearGradient(0, 58, 0, H);
    sea.addColorStop(0, '#e2706a');
    sea.addColorStop(1, '#2d3e78');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 58, W, H - 58);
    ctx.fillStyle = 'rgba(255,226,122,0.7)';
    for (let i = 0; i < 6; i++) ctx.fillRect(50 + (i % 2) * 6, 63 + i * 4, 28 - i * 3, 2);
    poly(ctx, '#2b2235', 30, 66, 46, 66, 42, 70, 33, 70);
    poly(ctx, '#f5ece0', 38, 46, 38, 65, 47, 65);
    goldFrame(ctx);
  },
  // Snowy mountains, green hills and pine trees.
  ctx => {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#6ab7f0');
    sky.addColorStop(1, '#d8f0ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    circle(ctx, 100, 26, 8, '#fff6c2');
    poly(ctx, '#7d8aa3', 10, 78, 48, 22, 86, 78);
    poly(ctx, '#6b7690', 56, 78, 90, 30, 124, 78);
    poly(ctx, '#ffffff', 48, 22, 40, 34, 46, 32, 50, 36, 56, 33);
    poly(ctx, '#ffffff', 90, 30, 83, 40, 89, 38, 93, 41, 97, 39);
    ctx.fillStyle = '#5fae4a';
    ctx.beginPath();
    ctx.ellipse(40, 92, 60, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(100, 94, 50, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, s] of [[22, 1], [32, 0.8], [104, 1.1], [114, 0.8]]) {
      poly(ctx, '#2f6b35', x, 66 - 18 * s, x - 7 * s, 72, x + 7 * s, 72);
      ctx.fillStyle = '#5a3b22';
      ctx.fillRect(x - 1, 72, 3, 4);
    }
    goldFrame(ctx);
  },
  // A vase of flowers on a table.
  ctx => {
    ctx.fillStyle = '#f3e3c8';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#b07a4a';
    ctx.fillRect(0, 70, W, H - 70);
    ctx.strokeStyle = '#3f8a3a';
    ctx.lineWidth = 2;
    const tops = [[48, 30], [58, 22], [68, 26], [78, 32], [62, 36], [72, 18]];
    for (const [x, y] of tops) {
      ctx.beginPath();
      ctx.moveTo(64, 56);
      ctx.quadraticCurveTo((x + 64) / 2, y + 20, x, y);
      ctx.stroke();
    }
    const colors = ['#ff5f8a', '#ffd23f', '#a46bff', '#ff8c42', '#ff4f4f', '#4fb6ff'];
    tops.forEach(([x, y], i) => {
      for (let k = 0; k < 5; k++) circle(ctx, x + Math.cos(k * 1.26) * 4, y + Math.sin(k * 1.26) * 4, 3.4, colors[i]);
      circle(ctx, x, y, 2.4, '#fff3a6');
    });
    poly(ctx, '#3d7fd0', 54, 52, 74, 52, 78, 72, 50, 72);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(56, 55, 4, 14);
    goldFrame(ctx);
  },
  // Swirly stars over a sleepy village.
  ctx => {
    ctx.fillStyle = '#1d2f6e';
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = i % 2 ? '#3f63b8' : '#7aa2e8';
      ctx.beginPath();
      ctx.arc(20 + i * 12, 30 + Math.sin(i) * 8, 10 + (i % 3) * 4, i, i + 3.6);
      ctx.stroke();
    }
    for (const [x, y, r] of [[22, 18, 5], [52, 12, 4], [80, 22, 5], [104, 14, 4], [62, 40, 3]]) {
      circle(ctx, x, y, r + 3, 'rgba(255,230,120,0.35)');
      circle(ctx, x, y, r, '#ffe36e');
    }
    circle(ctx, 106, 30, 9, '#ffd84a');
    circle(ctx, 110, 27, 8, '#1d2f6e');
    ctx.fillStyle = '#26314f';
    ctx.fillRect(0, 70, W, H - 70);
    for (const [x, w, h] of [[40, 12, 10], [58, 10, 8], [74, 14, 11], [94, 10, 9]]) {
      ctx.fillStyle = '#3b3f5c';
      ctx.fillRect(x, 74 - h, w, h + 4);
      ctx.fillStyle = '#ffd95c';
      ctx.fillRect(x + 3, 74 - h + 3, 3, 3);
    }
    poly(ctx, '#0f1a1a', 18, 20, 10, 84, 28, 84);
    goldFrame(ctx);
  },
];

const POSTERS = [
  // A cat.
  ctx => {
    ctx.fillStyle = '#ffb7d0';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) circle(ctx, (i * 37) % W, (i * 23) % 70, 3, 'rgba(255,255,255,0.6)');
    poly(ctx, '#f28c28', 36, 22, 44, 44, 30, 44);
    poly(ctx, '#f28c28', 92, 22, 84, 44, 98, 44);
    circle(ctx, 64, 50, 28, '#f6a04d');
    circle(ctx, 53, 46, 6, '#ffffff');
    circle(ctx, 75, 46, 6, '#ffffff');
    circle(ctx, 54, 47, 3.5, '#2a2a2a');
    circle(ctx, 76, 47, 3.5, '#2a2a2a');
    poly(ctx, '#ff6f91', 60, 56, 68, 56, 64, 61);
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) for (const dy of [-2, 3]) {
      ctx.beginPath();
      ctx.moveTo(64 + s * 8, 59);
      ctx.lineTo(64 + s * 26, 57 + dy);
      ctx.stroke();
    }
    posterFrame(ctx, 'MEOW!', '#d6336c');
  },
  // A puppy with floppy ears.
  ctx => {
    ctx.fillStyle = '#8fd3ff';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) circle(ctx, 14 + i * 20, 12 + (i % 2) * 6, 4, '#ffffff');
    ctx.fillStyle = '#7a4a26';
    ctx.beginPath();
    ctx.ellipse(38, 52, 9, 20, 0.3, 0, Math.PI * 2);
    ctx.ellipse(90, 52, 9, 20, -0.3, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, 64, 48, 26, '#c8884d');
    ctx.fillStyle = '#f0d2a8';
    ctx.beginPath();
    ctx.ellipse(64, 60, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, 54, 42, 4, '#2a2a2a');
    circle(ctx, 74, 42, 4, '#2a2a2a');
    circle(ctx, 64, 55, 5, '#2a2a2a');
    poly(ctx, '#ff6f7d', 60, 63, 68, 63, 66, 71, 62, 71);
    posterFrame(ctx, 'WOOF!', '#1c6fc2');
  },
  // A rocket in space.
  ctx => {
    ctx.fillStyle = '#121433';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) circle(ctx, (i * 53) % W, (i * 31) % H, i % 4 ? 1 : 1.8, '#ffffff');
    circle(ctx, 100, 70, 16, '#ff9e5e');
    ctx.strokeStyle = '#ffd7a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(100, 70, 24, 6, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(48, 48);
    ctx.rotate(0.6);
    poly(ctx, '#ffb000', -6, 22, 6, 22, 0, 38);
    poly(ctx, '#ff4d2e', -4, 22, 4, 22, 0, 31);
    ctx.fillStyle = '#eef0f5';
    ctx.fillRect(-8, -14, 16, 36);
    poly(ctx, '#e53935', -8, -14, 8, -14, 0, -30);
    poly(ctx, '#e53935', -8, 10, -16, 24, -8, 22);
    poly(ctx, '#e53935', 8, 10, 16, 24, 8, 22);
    circle(ctx, 0, -2, 4.5, '#4fb6ff');
    ctx.restore();
    posterFrame(ctx, 'TO THE MOON!', '#ff7a1a');
  },
  // A friendly dinosaur and a volcano.
  ctx => {
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(0, 0, W, H);
    poly(ctx, '#8a5a3c', 84, 70, 100, 30, 108, 30, 124, 70);
    poly(ctx, '#ff5a2e', 100, 30, 108, 30, 110, 22, 104, 16, 98, 22);
    circle(ctx, 104, 12, 5, 'rgba(120,120,120,0.6)');
    ctx.fillStyle = '#7ccf5c';
    ctx.fillRect(0, 70, W, H - 70);
    const g = '#3f9a52';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(52, 58, 22, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    poly(ctx, g, 30, 56, 8, 66, 32, 64); // tail
    ctx.fillRect(60, 30, 11, 26); // neck
    ctx.beginPath();
    ctx.ellipse(70, 30, 13, 8, 0, 0, Math.PI * 2); // head
    ctx.fill();
    ctx.fillRect(42, 66, 7, 10);
    ctx.fillRect(58, 66, 7, 10);
    for (let i = 0; i < 4; i++) poly(ctx, '#ffcf3f', 36 + i * 8, 47 - (i === 1 || i === 2 ? 2 : 0), 40 + i * 8, 41, 44 + i * 8, 47);
    circle(ctx, 74, 28, 2.4, '#ffffff');
    circle(ctx, 74.5, 28, 1.3, '#1a1a1a');
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) poly(ctx, '#ffffff', 71 + i * 4, 34, 73 + i * 4, 34, 72 + i * 4, 37);
    posterFrame(ctx, 'RAWR!', '#2d7a3e');
  },
];

const cache = {};

// The canvas for picture number `index` (0-3) of a kind ('painting' or 'poster').
export function pictureCanvas(kind, index) {
  const key = `${kind}:${index}`;
  return (cache[key] ??= make((kind === 'poster' ? POSTERS : PAINTINGS)[index % 4]));
}
