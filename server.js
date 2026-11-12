// BuildZone server: serves the game files and keeps everyone's world in sync.
// The actual game rules live in public/js/shared/game.js.
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameRoom, SAVE_VERSION } from './public/js/shared/game.js';
import { CharacterStore } from './public/js/shared/characters.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5010;
const DATA_DIR = path.join(ROOT, 'data');
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

// ---------- Static file serving ----------

const THREE_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/three/package.json'), 'utf8')).version;
  } catch {
    return '0';
  }
})();
const STATIC_ROOTS = [
  { prefix: `/vendor/three@${THREE_VERSION}/`, dir: path.join(ROOT, 'node_modules/three'), versioned: true },
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
  '.mp3': 'audio/mpeg',
};

// Which version of each game file this server has: a fingerprint of what's in it. The page
// asks for every file with its fingerprint on the end (js/main.js?v=3f2a…), so whenever a file
// changes, browsers fetch the new one straight away (nobody has to clear their cache), and the
// files that haven't changed come from the browser's own copy without even asking.
const PUBLIC_DIR = path.join(ROOT, 'public');
const hashes = new Map(); // file -> { size, mtimeMs, hash }
function fileVersions() {
  const out = {};
  const walk = d => {
    for (const name of fs.readdirSync(d).sort()) {
      const f = path.join(d, name), st = fs.statSync(f);
      if (st.isDirectory()) walk(f);
      else {
        let h = hashes.get(f);
        if (!h || h.size !== st.size || h.mtimeMs !== st.mtimeMs) {
          h = { size: st.size, mtimeMs: st.mtimeMs, hash: crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10) };
          hashes.set(f, h);
        }
        out[path.relative(PUBLIC_DIR, f).split(path.sep).join('/')] = h.hash;
      }
    }
  };
  walk(PUBLIC_DIR);
  return out;
}

// The whole game's version (browsers are told it, so one still running older files, in a tab
// left open while the game was updated, can notice and reload itself).
const BUILD = (() => {
  const all = fileVersions(), hash = crypto.createHash('sha1');
  for (const [f, h] of Object.entries(all)) hash.update(`${f}:${h}\n`);
  return hash.update(THREE_VERSION).digest('hex').slice(0, 12);
})();

// The page, with every file it loads asked for by version: the stylesheet, the game's script,
// every module it imports (through the import map), three.js, and the sounds (by the list in
// #bz-files, see js/assets.js).
function versionedPage(html) {
  const v = fileVersions();
  const imports = {
    three: `./vendor/three@${THREE_VERSION}/build/three.module.js`,
    'three/addons/': `./vendor/three@${THREE_VERSION}/examples/jsm/`,
  };
  for (const [f, h] of Object.entries(v)) if (f.startsWith('js/') && f.endsWith('.js')) imports[`./${f}`] = `./${f}?v=${h}`;
  const assets = Object.fromEntries(Object.entries(v).filter(([f]) => !f.startsWith('js/') && f !== 'index.html'));
  return html
    .replace('%BUILD%', BUILD)
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, () => `<script type="importmap">${JSON.stringify({ imports })}</script>\n  <script type="application/json" id="bz-files">${JSON.stringify(assets)}</script>`)
    .replace('href="style.css"', `href="style.css?v=${v['style.css'] || BUILD}"`)
    .replace('src="js/main.js"', `src="js/main.js?v=${v['js/main.js'] || BUILD}"`);
}

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
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    // A file asked for by its version (?v=… or a three.js with its version in the path) never
    // changes: browsers can keep it for good. Anything else (the page itself, and files asked
    // for without a version) is checked with us every time (unchanged: a quick "304").
    const versioned = root.versioned || (url.searchParams.has('v') && !file.endsWith('index.html'));
    const etag = `"${st.size}-${Math.round(st.mtimeMs)}-${BUILD}"`;
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache', ETag: etag };
    // (The page itself is always sent afresh: it's small, and it lists the newest versions.)
    const page = file.endsWith('index.html');
    if (page) delete headers.ETag;
    if (!page && req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        res.writeHead(404).end('Not found');
        return;
      }
      if (file.endsWith('index.html')) data = versionedPage(data.toString());
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

// ---------- Saving and loading ----------

let saveTimer = null;
// The world is saved a little while after something changes (not after every block, which
// would wear out a Raspberry Pi's SD card), and written in the background so nobody's game
// stutters while the file is being written.
const SAVE_DELAY = 15000;
const room = new GameRoom({
  onDirty: () => (saveTimer ??= setTimeout(saveWorld, SAVE_DELAY)),
  log: msg => console.log(msg),
});
room.build = BUILD;

let saving = null; // the save being written right now
function saveWorld() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const text = JSON.stringify(room.serialize());
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const write = async () => {
    await fs.promises.writeFile(WORLD_FILE + '.tmp', text);
    await fs.promises.rename(WORLD_FILE + '.tmp', WORLD_FILE);
  };
  // One write at a time (the newest one goes last).
  saving = (saving || Promise.resolve()).then(write).catch(err => console.error('Could not save the world:', err.message));
}

// When the server is stopped: save right away, and wait for it to finish.
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(WORLD_FILE + '.tmp', JSON.stringify(room.serialize()));
  fs.renameSync(WORLD_FILE + '.tmp', WORLD_FILE);
}

function loadWorld() {
  let text = null;
  try {
    text = fs.readFileSync(WORLD_FILE, 'utf8');
  } catch {
    // no saved world yet
  }
  if (text === null) {
    room.generate();
    saveNow();
    console.log(`Generated a new world (${room.world.size} blocks, ${room.vehicles.size} vehicles)`);
    return;
  }

  // There is a saved world. Whatever happens, never replace it with a new one.
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`${WORLD_FILE} could not be read, so the server won't start (to keep your world safe).`);
    console.error('Restore it from one of the backups in the data folder, or move it away to start a new world.');
    process.exit(1);
  }
  const version = Array.isArray(data) ? 1 : data.version;
  if (version > SAVE_VERSION) {
    console.error(`${WORLD_FILE} was saved by a newer version of BuildZone. Update the game (git pull) to load it.`);
    process.exit(1);
  }
  if (version < SAVE_VERSION) {
    // Keep a copy of the world exactly as it was before upgrading it.
    const backup = path.join(DATA_DIR, `world-backup-v${version}-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`);
    fs.copyFileSync(WORLD_FILE, backup);
    console.log(`Upgrading your world. A copy of the old one is saved as ${backup}`);
  }
  if (!room.load(data)) {
    console.error(`${WORLD_FILE} doesn't look like a BuildZone world, so the server won't start (to keep it safe).`);
    process.exit(1);
  }
  console.log(`Loaded saved world (${room.world.size} blocks, ${room.vehicles.size} vehicles)`);
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
  const client = room.connect(msg => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)), () => ws.terminate());
  if (!client) {
    ws.close();
    return;
  }
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', raw => {
    ws.alive = true;
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

// A browser that's closed properly says goodbye, but a tablet put to sleep, a phone that lost
// its wi-fi or a laptop lid snapped shut just goes quiet, and the connection would hang around
// for ages (with their player standing there, and not knowing where they left off). So every
// 15 seconds each connection is asked "still there?"; one that didn't answer the last time is
// hung up. (Browsers answer by themselves, even from a tab in the background.)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    try {
      ws.ping();
    } catch { /* already closing */ }
  }
}, 15000);

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  room.tick((now - last) / 1000);
  last = now;
}, 1000 / 30);

function shutdown() {
  if (saveTimer || saving) saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

loadWorld();
server.listen(PORT, () => console.log(`BuildZone running at http://localhost:${PORT}`));
