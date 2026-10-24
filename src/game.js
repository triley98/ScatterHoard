export const RULES = Object.freeze({
  width: 40,
  depth: 10,
  half: 20,
  duration: 60,
  dropInterval: 5,
  speed: 7,
  acceleration: 32,
  pickupRadius: 0.72,
  digDuration: 0.55,
  playerRadius: 0.32,
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const cellAt = (x, z) => ({
  col: clamp(Math.floor(x), 0, 39),
  row: clamp(Math.floor(z), 0, 9),
});
export const cellKey = ({ col, row }) => `${col},${row}`;
export const territoryFor = (col) => (col < RULES.half ? 0 : 1);

function newPlayer(id) {
  return {
    id,
    x: id === 0 ? 8.5 : 31.5,
    z: 5.5,
    vx: 0,
    vz: 0,
    carrying: false,
    dig: null,
    facing: 0,
    buried: 0,
  };
}

/** Deterministic, rendering-independent rules for two local players. All times are seconds. */
export class Game {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.phase = 'ready';
    this.elapsed = 0;
    this.nextDrop = 0;
    this.players = [newPlayer(0), newPlayer(1)];
    this.acorns = [];
    this.buried = new Map();
    this.scores = [0, 0];
    this.events = [];
    this.drops = 0;
    this.nextId = 0;
    this.pickupPriority = 0;
  }

  get remaining() {
    return Math.max(0, RULES.duration - this.elapsed);
  }
  get winner() {
    return this.scores[0] === this.scores[1]
      ? null
      : this.scores[0] > this.scores[1]
        ? 0
        : 1;
  }

  start() {
    this.reset();
    this.phase = 'playing';
    this.dropAcorn();
    this.nextDrop = RULES.dropInterval;
  }

  pause() {
    if (this.phase === 'playing') this.phase = 'paused';
  }
  resume() {
    if (this.phase === 'paused') this.phase = 'playing';
  }
  drainEvents() {
    return this.events.splice(0);
  }

  dropAcorn() {
    // Keep drops in the playable interior; retry occupied cells without unbounded loops.
    let x, z;
    for (let attempt = 0; attempt < 50; attempt++) {
      x = 1 + this.random() * (RULES.width - 2);
      z = 0.8 + this.random() * (RULES.depth - 1.6);
      const key = cellKey(cellAt(x, z));
      if (
        !this.buried.has(key) &&
        !this.acorns.some((a) => cellKey(cellAt(a.x, a.z)) === key)
      )
        break;
    }
    const acorn = { id: this.nextId++, x, z, born: this.elapsed };
    this.acorns.push(acorn);
    this.drops++;
    this.events.push({ type: 'drop', acorn: { ...acorn } });
    return acorn;
  }

  requestDig(id) {
    if (this.phase !== 'playing') return false;
    const player = this.players[id];
    if (!player || player.dig) return false;
    if (!player.carrying) {
      this.events.push({ type: 'hint', player: id, reason: 'empty' });
      return false;
    }
    const cell = cellAt(player.x, player.z);
    const key = cellKey(cell);
    if (this.buried.has(key) || this.players.some((p) => p.dig?.key === key)) {
      this.events.push({ type: 'hint', player: id, reason: 'occupied' });
      return false;
    }
    player.dig = { ...cell, key, elapsed: 0 };
    player.vx = 0;
    player.vz = 0;
    this.events.push({ type: 'dig', player: id });
    return true;
  }

  update(
    dt,
    inputs = [
      { x: 0, z: 0 },
      { x: 0, z: 0 },
    ],
  ) {
    if (this.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // Substeps make movement, pickup, drops, and digging independent of frame rate.
    let left = Math.min(dt, this.remaining);
    while (left > 1e-8 && this.phase === 'playing') {
      const step = Math.min(left, 1 / 60);
      this.step(step, inputs);
      left -= step;
    }
  }

  step(dt, inputs) {
    this.elapsed = Math.min(RULES.duration, this.elapsed + dt);
    while (
      this.nextDrop < RULES.duration &&
      this.elapsed + 1e-8 >= this.nextDrop
    ) {
      this.dropAcorn();
      this.nextDrop += RULES.dropInterval;
    }

    for (const player of this.players) {
      let { x = 0, z = 0 } = inputs[player.id] ?? {};
      const magnitude = Math.hypot(x, z);
      if (magnitude > 1) {
        x /= magnitude;
        z /= magnitude;
      }
      if (player.dig) {
        if (magnitude > 0) {
          player.dig = null;
          this.events.push({ type: 'cancelDig', player: player.id });
        } else {
          player.dig.elapsed += dt;
          if (player.dig.elapsed + 1e-8 >= RULES.digDuration)
            this.finishDig(player);
          continue;
        }
      }
      const maxChange = RULES.acceleration * dt;
      const dx = x * RULES.speed - player.vx;
      const dz = z * RULES.speed - player.vz;
      const change = Math.hypot(dx, dz);
      const blend = change > maxChange ? maxChange / change : 1;
      player.vx += dx * blend;
      player.vz += dz * blend;
      player.x = clamp(
        player.x + player.vx * dt,
        RULES.playerRadius,
        RULES.width - RULES.playerRadius,
      );
      player.z = clamp(
        player.z + player.vz * dt,
        RULES.playerRadius,
        RULES.depth - RULES.playerRadius,
      );
      if (magnitude > 0) player.facing = Math.atan2(x, z);
    }

    // Alternate priority only for contested pickups, so neither player owns every tie.
    for (let i = this.acorns.length - 1; i >= 0; i--) {
      const acorn = this.acorns[i];
      const eligible = this.players.filter(
        (p) =>
          !p.carrying &&
          !p.dig &&
          Math.hypot(p.x - acorn.x, p.z - acorn.z) <= RULES.pickupRadius,
      );
      if (!eligible.length) continue;
      eligible.sort((a, b) => {
        const distance =
          Math.hypot(a.x - acorn.x, a.z - acorn.z) -
          Math.hypot(b.x - acorn.x, b.z - acorn.z);
        return Math.abs(distance) > 1e-8
          ? distance
          : a.id === this.pickupPriority
            ? -1
            : 1;
      });
      const player = eligible[0];
      player.carrying = true;
      this.acorns.splice(i, 1);
      if (eligible.length > 1) this.pickupPriority = 1 - player.id;
      this.events.push({ type: 'pickup', player: player.id, acorn: acorn.id });
    }

    if (this.elapsed >= RULES.duration - 1e-8) {
      this.elapsed = RULES.duration;
      this.phase = 'finished';
      for (const player of this.players) player.dig = null;
      this.events.push({
        type: 'finish',
        scores: [...this.scores],
        winner: this.winner,
      });
    }
  }

  finishDig(player) {
    const cell = player.dig;
    const territory = territoryFor(cell.col);
    this.buried.set(cell.key, {
      col: cell.col,
      row: cell.row,
      territory,
      player: player.id,
    });
    this.scores[territory]++;
    player.buried++;
    player.carrying = false;
    player.dig = null;
    this.events.push({
      type: 'bury',
      player: player.id,
      territory,
      col: cell.col,
      row: cell.row,
    });
  }
}
