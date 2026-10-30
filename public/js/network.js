// Talks to the server over a WebSocket.
export class Network {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.online = false;
  }

  on(type, fn) {
    this.handlers[type] = fn;
  }

  // Resolves with the server's welcome message, or rejects if there is no server.
  connect(name, color, timeoutMs = 4000) {
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
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('timeout'));
      }, timeoutMs);

      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, color }));
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('connection failed'));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (this.online) {
          this.online = false;
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
          this.online = true;
          resolve(msg);
        } else if (msg.t === 'full') {
          clearTimeout(timer);
          reject(new Error('server full'));
        } else {
          this.handlers[msg.t]?.(msg);
        }
      };
    });
  }

  send(msg) {
    if (this.online && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
