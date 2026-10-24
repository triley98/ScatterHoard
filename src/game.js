import { ROUND_TIMING, transitionDuration } from './round-transition.js';

export const RULES = Object.freeze({
  width: 40,
  depth: 15,
  half: 20,
  duration: 60,
  rounds: 3,
  intermission: transitionDuration(),
  ending: transitionDuration(true),
  countdown: ROUND_TIMING.countdown,
  dropInterval: 5,
  speed: 7,
  acceleration: 32,
  pickupRadius: 0.72,
  digDuration: 0.55,
  playerRadius: 0.32,
  powerupChance: 0.1,
  effectDuration: 6,
});

export const POWERUPS = [
  'acorn-rain',
  'speed-boost',
  'friendly-crow',
  'slowdown',
  'hungry-crow',
];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const cellAt = (x, z) => ({
  col: clamp(Math.floor(x), 0, RULES.width - 1),
  row: clamp(Math.floor(z), 0, RULES.depth - 1),
});
export const cellKey = ({ col, row }) => `${col},${row}`;
export const territoryFor = (col) => (col < RULES.half ? 0 : 1);

export function overlapsRock(x, z, rock, radius = RULES.playerRadius) {
  const nearX = clamp(x, rock.x, rock.x + rock.width);
  const nearZ = clamp(z, rock.z, rock.z + rock.depth);
  return Math.hypot(x - nearX, z - nearZ) < radius;
}

function makeObstacles(random) {
  // Seed an independent layout shuffle so placement work never consumes an
  // unbounded number of the authority's drop/powerup random values.
  let seed = 0;
  for (let i = 0; i < 8; i++) {
    seed = Math.imul(seed ^ Math.floor(random() * 4294967296), 73244475) >>> 0;
    seed = (seed ^ (seed >>> 16)) >>> 0;
  }
  const roll = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const shuffle = (items) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(roll() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const gap = (a, b) => Math.hypot(
    Math.max(a.x - b.x - b.width, b.x - a.x - a.width, 0),
    Math.max(a.z - b.z - b.depth, b.z - a.z - a.depth, 0),
  );
  const kinds = shuffle(['rock', 'rock', 'stump', 'stump']);
  const candidates = kinds.map(kind => {
    const size = kind === 'rock' ? 3 : 2;
    const items = [];
    for (let z = 1; z <= RULES.depth - size - 1; z++) {
      // Both types share all legal locations. Only the tree entrance lane and
      // outside walking routes are reserved; no type has an inner/outer slot.
      if (z + size > 6 && z < 9) continue;
      for (let x = 1; x <= RULES.half - size - 1; x++)
        items.push({ kind, x, z, width: size, depth: size });
    }
    return shuffle(items);
  });
  const chosen = [];
  let attempts = 0;
  function place(index) {
    if (index === candidates.length) return true;
    for (const candidate of candidates[index]) {
      if (++attempts > 10000) return false;
      if (chosen.some(other => gap(candidate, other) < 2)) continue;
      chosen.push(candidate);
      if (place(index + 1)) return true;
      chosen.pop();
    }
    return false;
  }
  if (!place(0)) {
    // A bounded, guaranteed layout for pathological RNG orderings. Shuffling
    // the corner assignment keeps either type eligible for every corner.
    chosen.length = 0;
    const corners = shuffle([[false, false], [true, false], [false, true], [true, true]]);
    kinds.forEach((kind, i) => {
      const size = kind === 'rock' ? 3 : 2;
      const [inner, lower] = corners[i];
      chosen.push({ kind, x: inner ? RULES.half - size - 1 : 1,
        z: lower ? RULES.depth - size - 1 : 1, width: size, depth: size });
    });
  }
  const mirrored = kind => {
    const left = chosen.filter(item => item.kind === kind)
      .map(({ kind: omitted, ...obstacle }) => obstacle);
    return [...left, ...left.map(obstacle => ({
      ...obstacle, x: RULES.width - obstacle.x - obstacle.width,
    }))];
  };
  // Left footprints end at x19 or earlier, so reflected footprints also keep
  // at least two cells of clearance across the center line.
  return { rocks: mirrored('rock'), stumps: mirrored('stump') };
}

export function playerStart(id) {
  return { x: id === 0 ? 8.5 : 31.5, z: RULES.depth / 2,
    facing: id === 0 ? Math.PI / 2 : -Math.PI / 2 };
}

function newPlayer(id) {
  return {
    id,
    ...playerStart(id),
    vx: 0,
    vz: 0,
    carrying: false,
    dig: null,
    facing: 0,
    buried: 0,
    effect: null,
    effectUntil: 0,
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
    this.round = 1;
    this.roundResults = [];
    this.intermissionRemaining = 0;
    this.resumePhase = null;
    this.nextDrop = 0;
    this.players = [newPlayer(0), newPlayer(1)];
    this.acorns = [];
    const obstacles = makeObstacles(this.random);
    this.rocks = obstacles.rocks;
    this.stumps = obstacles.stumps;
    this.buried = new Map();
    this.scores = [0, 0];
    this.events = [];
    this.drops = 0;
    this.bonusDrops = 0;
    this.nextId = 0;
    this.pickupPriority = 0;
  }

  get obstacles() {
    return [...this.rocks, ...this.stumps];
  }

  get remaining() {
    return Math.max(0, RULES.duration - this.elapsed);
  }
  get matchElapsed() {
    return (this.round - 1) * RULES.duration + this.elapsed;
  }
  get winner() {
    return this.scores[0] === this.scores[1]
      ? null
      : this.scores[0] > this.scores[1]
        ? 0
        : 1;
  }

  start(prepared = false) {
    if (!prepared) this.reset();
    this.phase = 'playing';
    this.dropAcorn();
    this.nextDrop = RULES.dropInterval;
  }

  pause() {
    if (['playing', 'intermission'].includes(this.phase)) {
      this.resumePhase = this.phase;
      this.phase = 'paused';
    }
  }
  resume() {
    if (this.phase === 'paused') {
      this.phase = this.resumePhase || 'playing';
      this.resumePhase = null;
    }
  }
  drainEvents() {
    return this.events.splice(0);
  }

  dropAcorn(side = null, bonus = false) {
    const obstacles = this.obstacles;
    // Keep drops in the playable interior; retry occupied cells without unbounded loops.
    let x, z;
    for (let attempt = 0; attempt < 50; attempt++) {
      x =
        side === null
          ? 1 + this.random() * (RULES.width - 2)
          : side * RULES.half + 1 + this.random() * (RULES.half - 2);
      z = 0.8 + this.random() * (RULES.depth - 1.6);
      const key = cellKey(cellAt(x, z));
      if (
        !obstacles.some((obstacle) => overlapsRock(x, z, obstacle, 0.55)) &&
        !this.buried.has(key) &&
        !this.acorns.some((a) => cellKey(cellAt(a.x, a.z)) === key)
      )
        break;
    }
    // A fixed RNG or a crowded board must never leave a drop inside an obstacle.
    if (obstacles.some((obstacle) => overlapsRock(x, z, obstacle, 0.55))) {
      outer: for (let row = 0; row < RULES.depth; row++)
        for (let col = side === null ? 0 : side * RULES.half;
          col < (side === null ? RULES.width : (side + 1) * RULES.half); col++) {
          if (!obstacles.some((obstacle) => overlapsRock(col + 0.5, row + 0.5, obstacle, 0.55))) {
            x = col + 0.5; z = row + 0.5; break outer;
          }
        }
    }
    const acorn = { id: this.nextId++, x, z, born: this.matchElapsed };
    this.acorns.push(acorn);
    if (bonus) this.bonusDrops++;
    else this.drops++;
    this.events.push({ type: 'drop', acorn: { ...acorn } });
    return acorn;
  }

  requestDig(id) {
    if (this.phase !== 'playing') return false;
    const player = this.players[id];
    if (!player || player.dig) return false;
    const cell = cellAt(player.x, player.z);
    const key = cellKey(cell);
    if (this.players.some((p) => p.dig?.key === key)) {
      this.events.push({ type: 'hint', player: id, reason: 'busy' });
      return false;
    }
    player.dig = {
      ...cell,
      key,
      elapsed: 0,
      mode: player.carrying ? 'bury' : 'search',
    };
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
    if (
      !['playing', 'intermission'].includes(this.phase) ||
      !Number.isFinite(dt) ||
      dt <= 0
    )
      return;
    // Substeps make movement, pickup, drops, and digging independent of frame rate.
    let left = dt;
    while (left > 1e-8 && ['playing', 'intermission'].includes(this.phase)) {
      if (this.phase === 'intermission') {
        const used = Math.min(left, this.intermissionRemaining);
        this.intermissionRemaining -= used;
        left -= used;
        if (this.intermissionRemaining < 1e-8) this.nextRound();
        continue;
      }
      const step = Math.min(left, 1 / 60, this.remaining);
      this.step(step, inputs);
      left -= step;
    }
  }

  step(dt, inputs) {
    const obstacles = this.obstacles;
    this.elapsed = Math.min(RULES.duration, this.elapsed + dt);
    while (
      this.nextDrop < RULES.duration &&
      this.elapsed + 1e-8 >= this.nextDrop
    ) {
      this.dropAcorn();
      this.nextDrop += RULES.dropInterval;
    }

    for (const player of this.players) {
      if (player.effect && this.matchElapsed >= player.effectUntil)
        player.effect = null;
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
      const multiplier =
        player.effect === 'speed-boost'
          ? 1.6
          : player.effect === 'slowdown'
            ? 0.6
            : 1;
      const dx = x * RULES.speed * multiplier - player.vx;
      const dz = z * RULES.speed * multiplier - player.vz;
      const change = Math.hypot(dx, dz);
      const blend = change > maxChange ? maxChange / change : 1;
      player.vx += dx * blend;
      player.vz += dz * blend;
      const oldX = player.x, oldZ = player.z;
      player.x = clamp(
        player.x + player.vx * dt,
        RULES.playerRadius,
        RULES.width - RULES.playerRadius,
      );
      for (const rock of obstacles) {
        if (!overlapsRock(player.x, oldZ, rock)) continue;
        const gap = Math.max(rock.z - oldZ, oldZ - rock.z - rock.depth, 0);
        const reach = Math.sqrt(Math.max(0, RULES.playerRadius ** 2 - gap ** 2));
        player.x = oldX < rock.x ? rock.x - reach : rock.x + rock.width + reach;
        player.vx = 0;
      }
      player.z = clamp(
        player.z + player.vz * dt,
        RULES.playerRadius,
        RULES.depth - RULES.playerRadius,
      );
      for (const rock of obstacles) {
        if (!overlapsRock(player.x, player.z, rock)) continue;
        const gap = Math.max(rock.x - player.x, player.x - rock.x - rock.width, 0);
        const reach = Math.sqrt(Math.max(0, RULES.playerRadius ** 2 - gap ** 2));
        player.z = oldZ < rock.z ? rock.z - reach : rock.z + rock.depth + reach;
        player.vz = 0;
      }
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
      this.roundResults.push({ round: this.round, scores: [...this.scores] });
      this.acorns = [];
      for (const player of this.players) {
        // Retain the last public position so every client can animate the return,
        // including a client that reconnects partway through the break.
        player.carrying = false;
        player.dig = null;
        player.vx = 0;
        player.vz = 0;
      }
      const final = this.round === RULES.rounds;
      this.phase = 'intermission';
      this.intermissionRemaining = final ? RULES.ending : RULES.intermission;
      if (final) {
        for (const player of this.players) {
          player.effect = null;
          player.effectUntil = 0;
        }
      }
      this.events.push({
        type: 'roundEnd',
        round: this.round,
        scores: [...this.scores],
      });
    }
  }

  finishDig(player) {
    const cell = player.dig;
    player.dig = null;
    if (cell.mode === 'search') {
      const acorn = this.buried.get(cell.key);
      if (acorn) {
        this.buried.delete(cell.key);
        this.scores[acorn.territory]--;
        player.carrying = true;
        this.events.push({ type: 'unearth', player: player.id });
      } else this.events.push({ type: 'miss', player: player.id });
      if (this.random() < RULES.powerupChance)
        this.applyPowerup(
          player,
          POWERUPS[Math.floor(this.random() * POWERUPS.length)],
        );
      return;
    }
    if (this.buried.has(cell.key)) {
      this.events.push({ type: 'hint', player: player.id, reason: 'occupied' });
      return;
    }
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
    this.events.push({
      type: 'bury',
      player: player.id,
      territory,
    });
  }

  applyPowerup(player, kind) {
    let stolen = false;
    let victim = null;
    if (kind === 'acorn-rain')
      for (let i = 0; i < 3; i++) this.dropAcorn(player.id, true);
    if (kind === 'speed-boost' || kind === 'slowdown') {
      player.effect = kind;
      player.effectUntil = this.matchElapsed + RULES.effectDuration;
    }
    if (kind === 'friendly-crow' || kind === 'hungry-crow') {
      victim = kind === 'friendly-crow' ? 1 - player.id : player.id;
      const options = [...this.buried.entries()].filter(
        ([, acorn]) => acorn.territory === victim,
      );
      if (options.length) {
        const [key] = options[Math.floor(this.random() * options.length)];
        this.buried.delete(key);
        this.scores[victim]--;
        stolen = true;
      }
    }
    this.events.push({
      type: 'powerup',
      player: player.id,
      kind,
      stolen,
      victim,
    });
  }

  nextRound() {
    if (this.phase !== 'intermission') return;
    this.intermissionRemaining = 0;
    if (this.round === RULES.rounds) {
      this.phase = 'finished';
      this.events.push({ type: 'finish', scores: [...this.scores], winner: this.winner });
      return;
    }
    this.round++;
    for (const player of this.players) Object.assign(player, playerStart(player.id));
    this.elapsed = 0;
    this.nextDrop = RULES.dropInterval;
    this.phase = 'playing';
    this.events.push({ type: 'roundStart', round: this.round });
    this.dropAcorn();
  }

  // Hidden cell coordinates, ownership, reservations, and RNG never leave the authority.
  snapshot() {
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      round: this.round,
      roundResults: this.roundResults.map((result) => ({
        round: result.round,
        scores: [...result.scores],
      })),
      intermissionRemaining: this.intermissionRemaining,
      nextDrop: this.nextDrop,
      scores: [...this.scores],
      drops: this.drops,
      bonusDrops: this.bonusDrops,
      rocks: this.rocks.map((rock) => ({ ...rock })),
      stumps: this.stumps.map((stump) => ({ ...stump })),
      acorns: this.acorns.map((a) => ({ ...a })),
      players: this.players.map(
        ({ id, x, z, vx, vz, carrying, facing, effect, effectUntil, dig }) => ({
          id,
          x,
          z,
          vx,
          vz,
          carrying,
          facing,
          effect,
          effectUntil,
          dig: dig ? { elapsed: dig.elapsed, mode: dig.mode } : null,
        }),
      ),
    };
  }
}
