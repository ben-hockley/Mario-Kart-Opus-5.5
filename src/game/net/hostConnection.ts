import { WS_PATH, type HostToPhone, type HostToServer, type ServerToHost } from '../../shared/protocol';

/** The game screen's link to the relay server. Reconnects automatically. */
export class HostConnection {
  onMessage: (msg: ServerToHost) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};
  private ws: WebSocket | null = null;

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}${WS_PATH}`);
    this.ws = ws;
    ws.onopen = () => {
      this.raw({ t: 'host' });
      this.onStatus(true);
    };
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data));
      } catch {
        // ignore malformed
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onStatus(false);
      setTimeout(() => this.connect(), 1500);
    };
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private raw(msg: HostToServer) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Send to one phone slot, or all phones with slot = -1. */
  send(slot: number, msg: HostToPhone) {
    this.raw({ t: 'send', slot, msg });
  }
}
