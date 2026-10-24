import { MatchRoom } from './room.js';

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const json = (body, status = 200, headers = {}) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
const token = () => crypto.randomUUID();

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // CLI health checks; browsers always supply an origin for WebSockets.
  const url = new URL(request.url);
  return (
    origin === url.origin ||
    (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .includes(origin)
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!allowedOrigin(request, env))
      return json(
        { error: 'This website is not allowed to connect to the lobby.' },
        403,
      );
    const cors = {
      'Access-Control-Allow-Origin':
        request.headers.get('Origin') || url.origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/api/health')
      return json({ service: 'scatterhoard-lobby', version: 1 }, 200, cors);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = [...bytes]
        .map((n) => alphabet[n % alphabet.length])
        .join('');
      const hostToken = token();
      const stub = env.LOBBIES.get(env.LOBBIES.idFromName(code));
      const result = await stub.fetch(
        new Request('https://room.internal/init', {
          method: 'POST',
          body: JSON.stringify({ code, hostToken }),
        }),
      );
      if (!result.ok)
        return json(
          { error: 'Could not create this clearing. Please try again.' },
          503,
          cors,
        );
      return json({ code, token: hostToken }, 201, cors);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})\/ws$/);
    if (
      match &&
      request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
    ) {
      return env.LOBBIES.get(env.LOBBIES.idFromName(match[1])).fetch(request);
    }
    return json({ error: 'Lobby route not found.' }, 404, cors);
  },
};

/** Non-hibernating WebSockets keep a one-minute authoritative match resident. */
export class Lobby {
  constructor(ctx) {
    this.ctx = ctx;
    this.sockets = new Map();
    this.timer = null;
    this.room = null;
    this.ctx.blockConcurrencyWhile(async () => {
      const meta = await ctx.storage.get('room');
      if (meta) this.room = new MatchRoom(meta);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.room) return json({ error: 'Room already exists.' }, 409);
      const meta = { ...(await request.json()), now: Date.now() };
      if (!ROOM_CODE.test(meta.code) || typeof meta.hostToken !== 'string')
        return json({ error: 'Invalid room.' }, 400);
      this.room = new MatchRoom(meta);
      await this.ctx.storage.put('room', meta);
      await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
      return json({ ok: true });
    }
    if (!this.room || Date.now() - this.room.createdAt > 15 * 60 * 1000)
      return json({ error: 'This clearing expired. Host a new room.' }, 404);
    if (this.sockets.size >= 4)
      return json({ error: 'This clearing is full.' }, 409);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const connection = { slot: null, messages: 0, window: Date.now() };
    this.sockets.set(server, connection);
    const authTimeout = setTimeout(() => {
      if (connection.slot === null) server.close(1008, 'Join timed out.');
    }, 5000);
    server.addEventListener('message', (event) => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 512)
          throw new Error('Invalid lobby message.');
        if (Date.now() - connection.window >= 1000) {
          connection.window = Date.now();
          connection.messages = 0;
        }
        if (++connection.messages > 80) throw new Error('Too many messages.');
        const message = JSON.parse(event.data);
        if (!message || typeof message !== 'object')
          throw new Error('Invalid lobby message.');
        if (connection.slot === null) {
          if (
            message.type !== 'hello' ||
            (message.token !== null && typeof message.token !== 'string')
          )
            throw new Error('Join this clearing first.');
          const member = this.room.join(message.token, token, Date.now());
          connection.slot = member.slot;
          clearTimeout(authTimeout);
          server.send(
            JSON.stringify({
              type: 'welcome',
              ...member,
              code: this.room.code,
            }),
          );
          this.room.lastTick = Date.now();
          this.startTicking();
          this.broadcast([]);
        } else if (message.type === 'input')
          this.room.input(connection.slot, message, Date.now());
        else if (message.type === 'ready') {
          this.room.setReady(connection.slot);
          this.broadcast([]);
        } else if (message.type === 'leave') {
          // Only an idle guest seat can be released for a different friend.
          if (
            connection.slot === 1 &&
            ['ready', 'finished'].includes(this.room.game.phase)
          )
            this.room.tokens[1] = null;
          server.close(1000, 'Left the clearing.');
        }
      } catch (error) {
        server.send(JSON.stringify({ type: 'error', message: error.message }));
        server.close(1008, 'Could not join the clearing.');
      }
    });
    const close = () => {
      clearTimeout(authTimeout);
      if (!this.sockets.delete(server)) return;
      if (connection.slot !== null) this.room.disconnect(connection.slot);
      this.broadcast([]);
      if (![...this.sockets.values()].some((c) => c.slot !== null)) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
    server.addEventListener('close', close);
    server.addEventListener('error', close);
    return new Response(null, { status: 101, webSocket: client });
  }

  startTicking() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const active = ['playing', 'countdown', 'paused'].includes(
        this.room.game.phase,
      );
      const events = this.room.tick(Date.now());
      if (active || events.length) this.broadcast(events);
    }, 50);
  }

  broadcast(events) {
    const data = JSON.stringify({
      type: 'state',
      state: this.room.snapshot(),
      events,
    });
    for (const [socket, connection] of this.sockets) {
      if (connection.slot === null) continue;
      try {
        socket.send(data);
      } catch {
        /* The close listener removes dead sockets. */
      }
    }
  }

  async alarm() {
    clearInterval(this.timer);
    for (const socket of this.sockets.keys())
      socket.close(1001, 'This clearing expired. Host a fresh room.');
    this.sockets.clear();
    this.room = null;
    await this.ctx.storage.deleteAll();
  }
}
