// BuildZone server: serves the game files and keeps everyone's world in sync.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { BLOCKS, blockKey, inBounds } from './public/js/shared/blocks.js';
import { generateWorld } from './public/js/shared/worldgen.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(ROOT, 'data');
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const MAX_PLAYERS = 32;
const TICK_RATE = 15;

// ---------- Static file serving ----------

const STATIC_ROOTS = [
  { prefix: '/vendor/three/', dir: path.join(ROOT, 'node_modules/three') },
  { prefix: '/', dir: path.join(ROOT, 'public') },
];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const root = STATIC_ROOTS.find(r => pathname.startsWith(r.prefix));
  const file = path.normalize(path.join(root.dir, pathname.slice(root.prefix.length)));
  if (!file.startsWith(root.dir + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- World state ----------

const world = new Map(); // "x,y,z" -> blockId

function loadWorld() {
  let blocks;
  try {
    blocks = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
    console.log(`Loaded ${blocks.length} blocks from ${WORLD_FILE}`);
  } catch {
    blocks = generateWorld();
    console.log(`Generated a new world with ${blocks.length} blocks`);
  }
  for (const [x, y, z, b] of blocks) world.set(blockKey(x, y, z), b);
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveWorld, 5000);
}
function saveWorld() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const blocks = [];
  for (const [k, b] of world) blocks.push([...k.split(',').map(Number), b]);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(WORLD_FILE + '.tmp', JSON.stringify(blocks));
  fs.renameSync(WORLD_FILE + '.tmp', WORLD_FILE);
}

function worldArray() {
  const out = [];
  for (const [k, b] of world) out.push([...k.split(',').map(Number), b]);
  return out;
}

// ---------- Players ----------

const players = new Map(); // id -> player
let nextId = 1;

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
function broadcast(msg, except) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p !== except && p.joined && p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

const cleanName = s => String(s ?? '').replace(/[^\w \-.]/g, '').trim().slice(0, 16) || 'Builder';
const cleanColor = s => (/^#[0-9a-f]{6}$/i.test(s) ? s : '#3fa7ff');
const num = v => (Number.isFinite(v) ? v : 0);

// Simple token bucket so one client can't flood the server.
function allow(p, kind, perSecond, burst) {
  const now = Date.now();
  const b = (p.buckets[kind] ??= { tokens: burst, t: now });
  b.tokens = Math.min(burst, b.tokens + ((now - b.t) / 1000) * perSecond);
  b.t = now;
  if (b.tokens < 1) return false;
  b.tokens--;
  return true;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', ws => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { t: 'full' });
    ws.close();
    return;
  }
  const p = { id: nextId++, ws, name: 'Builder', color: '#3fa7ff', pos: [0, 1, 0], rot: [0, 0], joined: false, buckets: {} };
  players.set(p.id, p);

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'join' && !p.joined) {
      p.name = cleanName(msg.name);
      p.color = cleanColor(msg.color);
      p.joined = true;
      send(ws, {
        t: 'welcome',
        id: p.id,
        world: worldArray(),
        players: [...players.values()].filter(o => o.joined && o !== p).map(o => ({ id: o.id, name: o.name, color: o.color, pos: o.pos, rot: o.rot })),
      });
      broadcast({ t: 'join', id: p.id, name: p.name, color: p.color, pos: p.pos, rot: p.rot }, p);
      broadcast({ t: 'chat', system: true, text: `${p.name} joined` });
      console.log(`${p.name} joined (${players.size} online)`);
      return;
    }
    if (!p.joined) return;

    switch (msg.t) {
      case 'state':
        if (Array.isArray(msg.pos) && Array.isArray(msg.rot)) {
          p.pos = msg.pos.slice(0, 3).map(num);
          p.rot = msg.rot.slice(0, 2).map(num);
        }
        break;
      case 'set': {
        const { x, y, z, b } = msg;
        if (!inBounds(x, y, z) || !(b === 0 || BLOCKS[b])) return;
        if (!allow(p, 'set', 20, 40)) return;
        const k = blockKey(x, y, z);
        if (b === 0) world.delete(k);
        else world.set(k, b);
        broadcast({ t: 'set', x, y, z, b }, p);
        scheduleSave();
        break;
      }
      case 'chat': {
        const text = String(msg.text ?? '').trim().slice(0, 160);
        if (!text || !allow(p, 'chat', 1, 5)) return;
        broadcast({ t: 'chat', name: p.name, color: p.color, text });
        break;
      }
    }
  });

  ws.on('close', () => {
    players.delete(p.id);
    if (p.joined) {
      broadcast({ t: 'leave', id: p.id });
      broadcast({ t: 'chat', system: true, text: `${p.name} left` });
      console.log(`${p.name} left (${players.size} online)`);
    }
  });
});

// Send everyone's position to everyone, a few times per second.
setInterval(() => {
  const list = [];
  for (const p of players.values()) if (p.joined) list.push([p.id, ...p.pos, ...p.rot]);
  if (list.length > 1) broadcast({ t: 'states', list });
}, 1000 / TICK_RATE);

function shutdown() {
  if (saveTimer) saveWorld();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

loadWorld();
server.listen(PORT, () => console.log(`BuildZone running at http://localhost:${PORT}`));
