// WikiRacer matchmaking server: a PeerJS-compatible signalling server (PeerServer protocol) on
// Cloudflare Workers. It only introduces browsers to each other (offers, answers, ICE candidates);
// game traffic then flows directly between players (or through the TURN relay), never through here.
//
// Why our own: the free shared server (0.peerjs.com) rate-limits busy internet connections (an
// office or school full of players) and can go down at any time.
//
// Protocol (what the PeerJS 1.5 client expects):
//   GET  /peerjs/id                    -> a fresh random peer ID (text)
//   WS   /peerjs?key=&id=&token=       -> server sends {type:"OPEN"} (or "ID-TAKEN"), then relays
//        OFFER / ANSWER / CANDIDATE / LEAVE messages to `dst`, adding `src`. If `dst` isn't
//        connected, the sender gets {type:"EXPIRE", src:dst}, which the client reports as
//        "peer-unavailable" (the game relies on that for quick match and joining).
//   Clients send {type:"HEARTBEAT"} every few seconds; a socket silent for 60s is dropped,
//   which also frees the room ID of a host whose tab froze.

const ID_RE = /^[A-Za-z0-9][\w-]{0,63}$/;
const MAX_SOCKETS_PER_IP = 150; // one office/school NAT can host plenty of players, but not a flood
const ALIVE_MS = 60000;
const HEARTBEAT = '{"type":"HEARTBEAT"}';
const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    // Random ID for peers that don't choose their own (same shape as PeerServer's).
    if (url.pathname.endsWith('/id') && request.headers.get('Upgrade') !== 'websocket') {
      return new Response(crypto.randomUUID(), { headers: { ...cors, 'Content-Type': 'text/plain' } });
    }
    if (request.headers.get('Upgrade') === 'websocket') {
      // One Durable Object holds every connection so any peer can reach any other.
      const stub = env.SIGNAL.get(env.SIGNAL.idFromName('global'));
      return stub.fetch(request);
    }
    if (url.pathname === '/' || url.pathname === '/peerjs' || url.pathname === '/peerjs/') {
      return new Response(JSON.stringify({ name: 'WikiRacer signalling', ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    return new Response('Not found', { status: 404, headers: cors });
  },
};

export class Signal {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // Heartbeats are answered without waking the object (cheap), and we can still read when the
    // last one arrived to drop dead sockets.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT, HEARTBEAT));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    const token = url.searchParams.get('token') || '';
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const reject = (type, msg) => {
      server.accept();
      server.send(JSON.stringify({ type, payload: { msg } }));
      server.close(1008, msg);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!ID_RE.test(id) || !token) return reject('ERROR', 'Invalid ID or token');

    const sockets = this.ctx.getWebSockets();
    let fromIp = 0;
    for (const ws of sockets) { const a = ws.deserializeAttachment(); if (a && a.ip === ip) fromIp++; }
    if (fromIp >= MAX_SOCKETS_PER_IP) return reject('ERROR', 'Too many connections from this network');

    // Same ID already connected: a reconnect with the same token replaces it; anyone else is refused.
    for (const ws of this.ctx.getWebSockets(id)) {
      const a = ws.deserializeAttachment();
      if (a && a.token === token) { try { ws.close(1000, 'Replaced by a new connection'); } catch {} }
      else return reject('ID-TAKEN', 'ID is taken');
    }

    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, token, ip, since: Date.now() });
    server.send(JSON.stringify({ type: 'OPEN' }));
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 64 * 1024) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const me = ws.deserializeAttachment();
    if (!me) return;
    const { type, dst } = msg;
    if (type === 'HEARTBEAT') return;
    if (!['OFFER', 'ANSWER', 'CANDIDATE', 'LEAVE', 'EXPIRE'].includes(type) || typeof dst !== 'string') return;
    const targets = this.ctx.getWebSockets(dst);
    if (targets.length) {
      const out = JSON.stringify({ type, src: me.id, dst, payload: msg.payload });
      for (const t of targets) { try { t.send(out); } catch {} }
    } else if (type !== 'LEAVE' && type !== 'EXPIRE') {
      // Nobody with that ID: tell the sender straight away ("peer-unavailable" on their side).
      try { ws.send(JSON.stringify({ type: 'EXPIRE', src: dst, dst: me.id })); } catch {}
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'Closed'); } catch {}
  }

  async webSocketError(ws) {
    try { ws.close(1011, 'Error'); } catch {}
  }

  // Every 30s while anyone is connected: drop sockets that stopped sending heartbeats.
  async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + 30000);
  }

  async alarm() {
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() || {};
      const last = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      const seen = last ? last.getTime() : a.since || 0;
      if (now - seen > ALIVE_MS) { try { ws.close(1001, 'Timed out'); } catch {} }
    }
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(now + 30000);
  }
}
