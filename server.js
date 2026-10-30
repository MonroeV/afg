// BuildZone server: serves the game files and keeps everyone's world in sync.
// The actual game rules live in public/js/shared/game.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameRoom } from './public/js/shared/game.js';
import { CharacterStore } from './public/js/shared/characters.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5010;
const DATA_DIR = path.join(ROOT, 'data');
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

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
  if (url.pathname === '/api/characters') {
    charactersApi(req, res);
    return;
  }
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

// ---------- Saving and loading ----------

let saveTimer = null;
const room = new GameRoom({
  onDirty: () => (saveTimer ??= setTimeout(saveWorld, 5000)),
  log: msg => console.log(msg),
});

function saveWorld() {
  clearTimeout(saveTimer);
  saveTimer = null;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(WORLD_FILE + '.tmp', JSON.stringify(room.serialize()));
  fs.renameSync(WORLD_FILE + '.tmp', WORLD_FILE);
}

function loadWorld() {
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
  } catch {
    // no saved world yet
  }
  if (room.load(data)) {
    console.log(`Loaded saved world (${room.world.size} blocks, ${room.cars.size} cars)`);
    return;
  }
  if (data) {
    // A world from an older version of the game: keep a copy, then build a fresh one.
    const backup = path.join(DATA_DIR, `world-old-${Date.now()}.json`);
    fs.renameSync(WORLD_FILE, backup);
    console.log(`Old world saved as ${backup}`);
  }
  room.generate();
  saveWorld();
  console.log(`Generated a new world (${room.world.size} blocks, ${room.cars.size} cars)`);
}

// ---------- Character gallery ----------
// GET /api/characters lists saved characters; POST saves one.

const characters = new CharacterStore(readJson(CHARACTERS_FILE) || [], () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHARACTERS_FILE + '.tmp', JSON.stringify(characters.serialize()));
  fs.renameSync(CHARACTERS_FILE + '.tmp', CHARACTERS_FILE);
});

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const saveCounts = new Map(); // ip -> { count, since } to stop anyone spamming saves

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function charactersApi(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { characters: characters.list() });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method' });
    return;
  }
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  const count = saveCounts.get(ip);
  if (count && now - count.since < 10 * 60 * 1000 && count.count >= 30) {
    sendJson(res, 429, { error: 'slow down' });
    return;
  }
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 8192) req.destroy();
  });
  req.on('end', () => {
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'bad json' });
      return;
    }
    const result = characters.save({
      name: msg.name,
      look: msg.look,
      replaceId: Number(msg.replaceId) || undefined,
      replaceOldest: msg.replaceOldest === true,
    });
    if (!result.error) {
      saveCounts.set(ip, count && now - count.since < 10 * 60 * 1000 ? { ...count, count: count.count + 1 } : { count: 1, since: now });
      console.log(`Saved character "${result.saved.name}"${result.replaced ? ` (replaced "${result.replaced}")` : ''}`);
    }
    sendJson(res, 200, { ...result, characters: characters.list() });
  });
}

// ---------- Multiplayer ----------

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });

wss.on('connection', ws => {
  const client = room.connect(msg => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)));
  if (!client) {
    ws.close();
    return;
  }
  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    room.handle(client, msg);
  });
  ws.on('close', () => room.disconnect(client));
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  room.tick((now - last) / 1000);
  last = now;
}, 1000 / 30);

function shutdown() {
  if (saveTimer) saveWorld();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

loadWorld();
server.listen(PORT, () => console.log(`BuildZone running at http://localhost:${PORT}`));
