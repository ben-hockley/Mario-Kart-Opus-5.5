import { WS_PATH, type PhoneToServer, type ServerToPhone } from '../shared/protocol';

const TOKEN_KEY = 'kart.token';

function loadToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage unavailable (private mode): reconnects just get a fresh slot
  }
}

/** WebSocket link to the relay server with automatic reconnect. */
export class ControllerNet {
  onMessage: (msg: ServerToPhone) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};
  latencyMs = 0;

  private ws: WebSocket | null = null;
  private pingId = 0;
  private pingSent = new Map<number, number>();
  private stopped = false;

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}${WS_PATH}`);
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: 'join', token: loadToken() });
      this.onStatus(true);
    };
    ws.onmessage = (ev) => {
      let msg: ServerToPhone;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'assigned') saveToken(msg.token);
      if (msg.t === 'pong') {
        const sent = this.pingSent.get(msg.id);
        if (sent !== undefined) {
          const rtt = performance.now() - sent;
          this.latencyMs = this.latencyMs ? this.latencyMs * 0.7 + rtt * 0.3 : rtt;
          this.pingSent.delete(msg.id);
        }
        return;
      }
      if (msg.t === 'full') this.stopped = true;
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onStatus(false);
      if (!this.stopped) setTimeout(() => this.connect(), 1000);
    };
  }

  /** Reconnect immediately (e.g. when the page becomes visible again). */
  ensureConnected() {
    if (this.stopped) return;
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) this.connect();
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: PhoneToServer) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  ping() {
    const id = ++this.pingId;
    this.pingSent.set(id, performance.now());
    if (this.pingSent.size > 20) this.pingSent.delete(this.pingSent.keys().next().value!);
    this.send({ t: 'ping', id });
  }
}
