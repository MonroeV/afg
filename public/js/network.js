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

  // Resolves with the server's welcome message, or rejects if there is no server. A server that
  // doesn't answer at all within `openMs` isn't there; once it has answered, the world it sends
  // can take a good while to arrive (a big world, from a Raspberry Pi, over wi-fi, to a slow
  // computer), so we wait much longer for that. (onOpen: it's answered, the world's on its way.)
  connect(name, look, { openMs = 8000, welcomeMs = 120000, onOpen = null } = {}) {
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
      const giveUp = ms => setTimeout(() => {
        ws.close();
        reject(new Error('timeout'));
      }, ms);
      let timer = giveUp(openMs);

      ws.onopen = () => {
        clearTimeout(timer);
        timer = giveUp(welcomeMs);
        ws.send(JSON.stringify({ t: 'join', name, look }));
        onOpen?.();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('connection failed'));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!welcomed) reject(new Error('closed'));
        if (welcomed && this.ws === ws && !this.leaving) {
          this.online = this.connected = false;
          this.handlers.disconnect?.();
        }
      };
      ws.onmessage = e => {
        this.heardAt = performance.now();
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
          this.heartbeat(ws);
          resolve(msg);
        } else if (msg.t === 'full') {
          clearTimeout(timer);
          reject(new Error('full'));
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
      this.online = false;
      let last = performance.now();
      clearInterval(this.ticker);
      this.ticker = setInterval(() => {
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
    if (this.local) this.checkpoint();
    else this.ws?.close();
  }

  // Single player: remember where we are and save now (the page may be about to close).
  // (A server hears where we are all the time, and keeps it when we go.)
  checkpoint() {
    if (!this.local) return;
    const { room, client } = this.local;
    if (client.moved) room.rememberSpot(client);
    this.local.save();
  }

  // Stop talking to the server (quietly: no "disconnected"), e.g. before playing by yourself.
  drop() {
    const ws = this.ws;
    this.ws = null;
    this.online = this.connected = false;
    try {
      ws?.close();
    } catch { /* already closed */ }
  }

  // The connection's gone quiet: give up on it, and say so.
  lost() {
    if (!this.online) return;
    this.drop();
    this.handlers.disconnect?.();
  }

  // Is the server there? (Asks for the page, without waiting long.)
  async reachable(timeoutMs = 3000) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), timeoutMs);
    try {
      const res = await fetch(`./?alive=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: stop.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  // Every few seconds, "still there?": the server answers, so even a quiet server (nothing
  // moving, nobody else on) is heard from regularly.
  heartbeat(ws) {
    clearInterval(this.beat);
    this.beat = setInterval(() => {
      if (this.ws !== ws || !this.online) return clearInterval(this.beat);
      if (ws.readyState === WebSocket.OPEN) ws.send('{"t":"ping"}');
    }, 4000);
  }

  // Connected, but nothing heard from the server for a while (wi-fi gone, the server switched
  // off): the connection's as good as lost.
  silent(ms = 20000) {
    return this.online && this.heardAt && performance.now() - this.heardAt > ms;
  }

  // (We were busy, or the tab was put away: whatever the server sent meanwhile is still waiting
  // to be read, so that's no reason to think it's gone. Start counting again from now.)
  stillListening() {
    this.heardAt = performance.now();
  }

  send(msg) {
    if (this.local) this.local.room.handle(this.local.client, JSON.parse(JSON.stringify(msg)));
    else if (this.online && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
