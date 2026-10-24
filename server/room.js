import { Game, RULES } from '../src/game.js';

const emptyInput = () => ({ x: 0, z: 0, at: 0, seq: -1 });

/** One authoritative room. Tokens stay private and snapshots contain no burial map. */
export class MatchRoom {
  constructor({ code, hostToken, random, now = Date.now() }) {
    this.code = code;
    this.tokens = [hostToken, null];
    this.connected = [false, false];
    this.ready = [false, false];
    this.inputs = [emptyInput(), emptyInput()];
    this.game = new Game({ random });
    this.countdown = 0;
    this.epoch = 0;
    this.lastTick = now;
    this.createdAt = now;
    this.disconnectedAt = null;
    this.resumePhase = null;
  }

  join(token, mintToken, now = this.lastTick) {
    this.expireReconnect(now);
    let slot = token ? this.tokens.indexOf(token) : -1;
    if (token && slot < 0)
      throw new Error('Your room session has expired. Host a new clearing.');
    if (!token) {
      if (this.tokens[1])
        throw new Error('This clearing already has two squirrels.');
      slot = 1;
      this.tokens[slot] = mintToken();
    }
    if (this.connected[slot])
      throw new Error('This squirrel is already connected in another tab.');
    this.connected[slot] = true;
    this.inputs[slot] = emptyInput();
    if (this.connected.every(Boolean) && this.game.phase === 'paused') {
      this.game.phase = this.resumePhase || 'ready';
      this.resumePhase = null;
      this.disconnectedAt = null;
    }
    return { slot, token: this.tokens[slot] };
  }

  disconnect(slot, now = Date.now()) {
    this.connected[slot] = false;
    this.ready[slot] = false;
    this.inputs[slot] = emptyInput();
    if (['playing', 'countdown', 'intermission'].includes(this.game.phase)) {
      this.resumePhase = this.game.phase;
      this.game.phase = 'paused';
      this.disconnectedAt = now;
    }
  }

  setReady(slot) {
    if (
      !this.connected[slot] ||
      !['ready', 'finished'].includes(this.game.phase)
    )
      return;
    this.ready[slot] = true;
    if (this.ready.every(Boolean) && this.connected.every(Boolean)) {
      this.game.reset();
      this.game.phase = 'countdown';
      this.countdown = RULES.countdown;
      this.ready = [false, false];
      this.epoch++;
      this.inputs = [emptyInput(), emptyInput()];
    }
  }

  input(slot, message, now) {
    if (!this.connected[slot] || this.game.phase !== 'playing') return;
    if (
      !Number.isSafeInteger(message.seq) ||
      message.seq <= this.inputs[slot].seq
    )
      return;
    if (
      ![message.x, message.z].every(
        (v) => Number.isFinite(v) && Math.abs(v) <= 1,
      )
    )
      return;
    this.inputs[slot] = {
      x: message.x,
      z: message.z,
      at: now,
      seq: message.seq,
    };
    if (message.dig === true) this.game.requestDig(slot);
  }

  tick(now) {
    const dt = Math.max(0, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.expireReconnect(now);
    if (this.game.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (!this.countdown) this.game.start(true);
    } else if (['playing', 'intermission'].includes(this.game.phase)) {
      this.game.update(
        dt,
        this.inputs.map((input) =>
          now - input.at > 750 ? emptyInput() : input,
        ),
      );
    }
    return this.game.drainEvents();
  }

  expireReconnect(now) {
    if (
      this.game.phase === 'paused' &&
      this.disconnectedAt !== null &&
      now - this.disconnectedAt > 30000
    ) {
      this.game.reset();
      this.ready = [false, false];
      this.resumePhase = null;
      this.disconnectedAt = null;
      this.epoch++;
    }
  }

  snapshot() {
    return {
      ...this.game.snapshot(),
      code: this.code,
      epoch: this.epoch,
      countdown: this.countdown,
      resumePhase: this.resumePhase || this.game.resumePhase,
      seats: this.connected.map((connected, slot) => ({
        connected,
        ready: this.ready[slot],
      })),
    };
  }
}
