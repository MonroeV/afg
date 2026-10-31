// Talks to the game room: over a WebSocket when there's a server,
// or to a copy of the room running right here in the browser for offline play.
import { GameRoom, SAVE_VERSION } from './shared/game.js';

const OFFLINE_SAVE = 'buildzone-offline-world';

export class Network {
  constructor() {
    this.ws = null;
    this.local = null;
    this.handlers = {};
    this.online = false; // true when connected to a real server
    this.connected = false;
  }

  on(type, fn) {
    this.handlers[type] = fn;
  }

  dispatch(msg) {
    this.handlers[msg.t]?.(msg);
  }

  // Resolves with the server's welcome message, or rejects if there is no server.
  connect(name, look, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      let ws;
      try {
        ws = new WebSocket(`${proto}://${location.host}/ws`);
      } catch (err) {
        reject(err);
        return;
      }
      this.ws = ws;
      let welcomed = false;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('timeout'));
      }, timeoutMs);

      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, look }));
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('connection failed'));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (welcomed && this.ws === ws && !this.leaving) {
          this.online = this.connected = false;
          this.handlers.disconnect?.();
        }
      };
      ws.onmessage = e => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.t === 'welcome') {
          clearTimeout(timer);
          welcomed = true;
          this.online = this.connected = true;
          resolve(msg);
        } else if (msg.t === 'full') {
          clearTimeout(timer);
          reject(new Error('server full'));
        } else {
          this.dispatch(msg);
        }
      };
    });
  }

  // Single player: run the game room in the browser and save the world in local storage.
  connectOffline(name, look) {
    this.ws = null;
    return new Promise(resolve => {
      let saveTimer = null;
      const save = () => {
        clearTimeout(saveTimer);
        saveTimer = null;
        try {
          localStorage.setItem(OFFLINE_SAVE, JSON.stringify(room.serialize()));
        } catch { /* storage full or unavailable */ }
      };
      const room = new GameRoom({ onDirty: () => (saveTimer ??= setTimeout(save, 3000)) });
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(OFFLINE_SAVE));
      } catch { /* no saved world */ }
      // Keep a copy of a saved world before upgrading it (or if it can't be loaded at all).
      const version = Array.isArray(saved) ? 1 : saved?.version;
      const loaded = saved && version <= SAVE_VERSION && room.load(saved);
      if (saved && (!loaded || version < SAVE_VERSION)) {
        try {
          localStorage.setItem(`${OFFLINE_SAVE}-backup-v${version ?? 0}`, JSON.stringify(saved));
        } catch { /* storage full or unavailable */ }
      }
      if (!loaded) room.generate();

      const client = room.connect(msg => {
        // Deliver asynchronously, like a real network would.
        queueMicrotask(() => (msg.t === 'welcome' ? resolve(msg) : this.dispatch(msg)));
      });
      this.local = { room, client, save };
      this.connected = true;
      let last = performance.now();
      setInterval(() => {
        const now = performance.now();
        room.tick((now - last) / 1000);
        last = now;
      }, 1000 / 30);
      room.handle(client, { t: 'join', name, look });
    });
  }

  // Leaving the game: say goodbye to the server, or save the single-player world right away.
  leave() {
    this.leaving = true;
    if (this.local) this.local.save();
    else this.ws?.close();
  }

  send(msg) {
    if (this.local) this.local.room.handle(this.local.client, JSON.parse(JSON.stringify(msg)));
    else if (this.online && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
