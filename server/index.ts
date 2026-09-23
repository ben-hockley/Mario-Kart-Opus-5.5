import express from 'express';
import { createServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';
import { getCertificate } from './cert.ts';
import {
  MAX_PHONES,
  WS_PATH,
  type HostToServer,
  type PhoneToServer,
  type ServerInfo,
  type ServerToHost,
  type ServerToPhone,
} from '../src/shared/protocol.ts';

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT ?? 5173);
const ROOT = join(import.meta.dirname, '..');

// ---------------------------------------------------------------------------
// LAN address discovery
// ---------------------------------------------------------------------------

function lanAddresses(): string[] {
  const found: { ip: string; score: number }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family !== 'IPv4' || addr.internal || addr.address.startsWith('169.254.')) continue;
      let score = 0;
      if (addr.address.startsWith('192.168.')) score += 30;
      else if (addr.address.startsWith('10.')) score += 20;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr.address)) score += 10;
      if (/vethernet|virtualbox|vmware|wsl|hyper-v|docker|loopback|tailscale|zerotier|vpn/i.test(name)) score -= 50;
      // Virtual adapters by MAC vendor prefix (VirtualBox, Hyper-V, VMware, Docker) and VirtualBox's default subnet.
      if (/^(0a:00:27|08:00:27|00:15:5d|00:50:56|00:0c:29|00:05:69|02:42)/i.test(addr.mac)) score -= 50;
      if (addr.address.startsWith('192.168.56.')) score -= 20;
      if (/wi-?fi|wlan|wireless/i.test(name)) score += 15;
      else if (/ethernet|^en\d|^eth\d/i.test(name)) score += 5;
      found.push({ ip: addr.address, score });
    }
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.ip);
}

// ---------------------------------------------------------------------------
// Relay between one game host and up to MAX_PHONES phone controllers
// ---------------------------------------------------------------------------

interface PhoneSlot {
  token: string;
  socket: WebSocket | null;
  lastSeen: number;
}

const slots: (PhoneSlot | null)[] = new Array(MAX_PHONES).fill(null);
let host: WebSocket | null = null;

function send(ws: WebSocket | null, msg: ServerToHost | ServerToPhone) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function toHost(msg: ServerToHost) {
  send(host, msg);
}

function broadcastPhones(msg: ServerToPhone) {
  for (const slot of slots) if (slot?.socket) send(slot.socket, msg);
}

function assignSlot(ws: WebSocket, token: string | undefined): number {
  // Reclaim a previous slot with the same token (phone reconnecting).
  if (token) {
    const idx = slots.findIndex((s) => s?.token === token);
    if (idx >= 0) {
      const slot = slots[idx]!;
      const old = slot.socket;
      slot.socket = ws;
      slot.lastSeen = Date.now();
      if (old && old !== ws) old.close(4000, 'replaced');
      return idx;
    }
  }
  let idx = slots.findIndex((s) => s === null);
  if (idx < 0) {
    // Take over the longest-disconnected slot.
    let oldest = Infinity;
    slots.forEach((s, i) => {
      if (s && !s.socket && s.lastSeen < oldest) {
        oldest = s.lastSeen;
        idx = i;
      }
    });
  }
  if (idx < 0) return -1;
  slots[idx] = { token: token ?? randomUUID(), socket: ws, lastSeen: Date.now() };
  return idx;
}

function handleHost(ws: WebSocket) {
  if (host && host !== ws) host.close(4001, 'replaced by a new game window');
  host = ws;
  console.log('Game screen connected');
  slots.forEach((s, slot) => {
    if (s?.socket) toHost({ t: 'phoneJoin', slot });
  });
  broadcastPhones({ t: 'host', connected: true });

  ws.on('message', (data) => {
    let msg: HostToServer;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg.t === 'send') {
      if (msg.slot < 0) broadcastPhones(msg.msg);
      else send(slots[msg.slot]?.socket ?? null, msg.msg);
    }
  });
  ws.on('close', () => {
    if (host === ws) {
      host = null;
      console.log('Game screen disconnected');
      broadcastPhones({ t: 'host', connected: false });
    }
  });
}

function handlePhone(ws: WebSocket, token: string | undefined) {
  const slot = assignSlot(ws, token);
  if (slot < 0) {
    send(ws, { t: 'full' });
    ws.close(4002, 'full');
    return;
  }
  const entry = slots[slot]!;
  send(ws, { t: 'assigned', slot, token: entry.token });
  send(ws, { t: 'host', connected: !!host });
  toHost({ t: 'phoneJoin', slot });
  console.log(`Phone connected in slot ${slot + 1}`);

  ws.on('message', (data) => {
    let msg: PhoneToServer;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (entry.socket !== ws) return;
    entry.lastSeen = Date.now();
    switch (msg.t) {
      case 'in':
        toHost({ t: 'in', slot, s: msg.s, b: msg.b });
        break;
      case 'menu':
        toHost({ t: 'menu', slot, a: msg.a });
        break;
      case 'ping':
        send(ws, { t: 'pong', id: msg.id });
        break;
    }
  });
  ws.on('close', () => {
    if (entry.socket === ws) {
      entry.socket = null;
      entry.lastSeen = Date.now();
      toHost({ t: 'phoneLeave', slot });
      console.log(`Phone in slot ${slot + 1} disconnected`);
    }
  });
}

// ---------------------------------------------------------------------------
// HTTP(S) server
// ---------------------------------------------------------------------------

async function main() {
  const ips = lanAddresses();
  const { key, cert } = await getCertificate(ips);
  const app = express();
  const server = createServer({ key, cert }, app);

  const primaryHost = ips[0] ?? 'localhost';
  const controllerUrl = `https://${primaryHost}:${PORT}/controller.html`;

  app.get('/api/info', async (_req, res) => {
    const info: ServerInfo = {
      controllerUrl,
      alternateUrls: ips.slice(1).map((ip) => `https://${ip}:${PORT}/controller.html`),
      qrSvg: await QRCode.toString(controllerUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
    };
    res.json(info);
  });
  app.get(['/c', '/controller'], (_req, res) => res.redirect('/controller.html'));

  if (DEV) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: ROOT,
      appType: 'mpa',
      server: { middlewareMode: true, hmr: { server } },
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(join(ROOT, 'dist')));
  }

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) return; // leave other upgrades (Vite HMR) alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const alive = new WeakSet<WebSocket>();
  wss.on('connection', (ws) => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    ws.once('message', (data) => {
      let msg: HostToServer | PhoneToServer;
      try {
        msg = JSON.parse(String(data));
      } catch {
        ws.close();
        return;
      }
      if (msg.t === 'host') handleHost(ws);
      else if (msg.t === 'join') handlePhone(ws, msg.token);
      else ws.close();
    });
  });
  // Drop sockets that stop answering (e.g. a phone whose screen locked).
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 4000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  Kart Racer is running' + (DEV ? ' (dev mode)' : ''));
    console.log(`  Game screen:  https://localhost:${PORT}/`);
    console.log(`  Controllers:  ${controllerUrl}`);
    for (const ip of ips.slice(1)) console.log(`                https://${ip}:${PORT}/controller.html`);
    console.log('');
    console.log('  Your browser will warn about the self-signed certificate - choose');
    console.log('  "Advanced" -> "Proceed" once on each device.');
    console.log('');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
