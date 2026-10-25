export const PUBLIC_LOBBY_URL = 'https://scatterhoard.scatterhoard.workers.dev';

export function defaultLobby(origin, configured, saved) {
  // Old builds saved the static Pages origin as if it were a lobby.
  let usableSaved = false;
  try {
    usableSaved = saved && !new URL(saved).hostname.endsWith('.github.io');
  } catch { /* Ignore an invalid address saved by an earlier build. */ }
  return configured || (usableSaved && saved) ||
    (new URL(origin).hostname.endsWith('.github.io') ? PUBLIC_LOBBY_URL : origin);
}

export function lobbyBase(value = '') {
  const url = new URL(value || window.location.origin);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  )
    throw new Error('Use the HTTPS address of your Cloudflare lobby.');
  if (url.username || url.password)
    throw new Error('The lobby address cannot contain credentials.');
  if (url.hostname.endsWith('.github.io'))
    throw new Error('GitHub Pages cannot run the online lobby. Use https://scatterhoard.scatterhoard.workers.dev.');
  return url.origin;
}

export class OnlineSession extends EventTarget {
  constructor(base, code, ticket) {
    super();
    this.base = lobbyBase(base);
    this.code = code;
    this.ticket = ticket;
    this.slot = null;
    this.socket = null;
    this.closed = false;
    this.seq = 0;
    this.attempts = 0;
  }

  static async host(base, mode = 'arcade') {
    base = lobbyBase(base);
    const response = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.code)
      throw new Error(
        data.error ||
          'Could not reach the Cloudflare lobby. Check its website address.',
      );
    sessionStorage.setItem(`scatterhoard:${base}:${data.code}`, data.token);
    return new OnlineSession(base, data.code, data.token);
  }

  static join(base, code) {
    base = lobbyBase(base);
    code = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code))
      throw new Error('Enter the six-character room code.');
    return new OnlineSession(
      base,
      code,
      sessionStorage.getItem(`scatterhoard:${base}:${code}`),
    );
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  connect() {
    if (this.closed) return;
    const endpoint = new URL(`/api/rooms/${this.code}/ws`, this.base);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(endpoint);
    this.socket = socket;
    const timeout = setTimeout(() => socket.close(), 10000);
    socket.addEventListener('open', () =>
      socket.send(JSON.stringify({ type: 'hello', token: this.ticket })),
    );
    socket.addEventListener('message', (event) => {
      if (this.closed) return;
      const data = JSON.parse(event.data);
      if (data.type === 'welcome') {
        clearTimeout(timeout);
        this.slot = data.slot;
        this.ticket = data.token;
        sessionStorage.setItem(
          `scatterhoard:${this.base}:${this.code}`,
          data.token,
        );
        this.attempts = 0;
        this.emit('welcome', data);
      } else if (data.type === 'state') {
        this.phase = data.state.phase;
        this.emit('state', data);
      } else if (data.type === 'error') {
        this.closed = true;
        this.emit('failure', data.message);
      }
    });
    socket.addEventListener('close', () => {
      clearTimeout(timeout);
      if (this.closed) return;
      if (++this.attempts > 8) {
        this.closed = true;
        this.emit(
          'failure',
          'Connection lost. Rejoin this clearing or host a new one.',
        );
        return;
      }
      this.emit('reconnecting', null);
      this.retry = setTimeout(() => this.connect(), 1000);
    });
    // Browser errors are followed by close; reconnect or a visible failure handles them.
    socket.addEventListener('error', () => {});
  }

  send(type, data = {}) {
    if (this.socket?.readyState === WebSocket.OPEN && !this.closed)
      this.socket.send(JSON.stringify({ type, ...data }));
  }
  input(input, dig = false) {
    this.send('input', { x: input.x, z: input.z, dig, seq: this.seq++ });
  }
  leave() {
    this.send('leave');
    if (this.slot === 1 && ['ready', 'finished'].includes(this.phase))
      sessionStorage.removeItem(`scatterhoard:${this.base}:${this.code}`);
    this.closed = true;
    clearTimeout(this.retry);
    this.socket?.close();
  }
}
