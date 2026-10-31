import { RULES, cellAt, cellKey, overlapsRock, basketBase } from './game.js';
import { returnPath } from './round-transition.js';

const center = ({col, row}) => ({
  x: (col + 0.5) * RULES.width / RULES.gridColumns,
  z: (row + 0.5) * RULES.depth / RULES.gridRows,
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const MEMORY_PROFILES = Object.freeze({
  easy: Object.freeze({
    opponent: Object.freeze({ forgotten: 0.5, uncertain: 0.5, area: 3 }),
    own: Object.freeze({ forgotten: 0.5, uncertain: 0.5, area: 2 }),
  }),
  medium: Object.freeze({
    opponent: Object.freeze({ forgotten: 0.35, uncertain: 0.4, area: 2 }),
    own: Object.freeze({ forgotten: 0.25, uncertain: 0.25, area: 2 }),
  }),
  hard: Object.freeze({
    opponent: Object.freeze({ forgotten: 0.2, uncertain: 0.4, area: 2 }),
    own: Object.freeze({ forgotten: 0.05, uncertain: 0.15, area: 2 }),
  }),
});

function clueCells(cell, size) {
  const start = (position, length) => size % 2
    ? Math.min(Math.max(0, position - Math.floor(size / 2)), length - size)
    : Math.min(Math.floor(position / size) * size, length - size);
  const col = start(cell.col, RULES.gridColumns);
  const row = start(cell.row, RULES.gridRows);
  return Array.from({length:size * size}, (_, index) => {
    const candidate = {col:col + index % size, row:row + Math.floor(index / size)};
    return {...center(candidate), key:cellKey(candidate)};
  });
}

/** A local opponent with public observations and memory, never the burial map. */
export class SquirrelAI {
  constructor(id = 1, { random = Math.random, difficulty = 'hard' } = {}) {
    this.id = id; this.random = random; this.setDifficulty(difficulty); this.reset();
  }
  setDifficulty(difficulty) {
    if (!Object.hasOwn(MEMORY_PROFILES, difficulty))
      throw new Error('Choose Easy, Medium, or Hard.');
    this.difficulty = difficulty;
  }
  reset() {
    this.memory = new Map(); this.goal = null; this.path = [];
    this.thinkIn = 0; this.searchIndex = 0; this.round = 0;
  }

  observe(event, view) {
    const player = view.players[event.player];
    if (!player) return;
    const cell = cellAt(player.x, player.z), key = cellKey(cell);
    if (event.type === 'bury') {
      const odds = MEMORY_PROFILES[this.difficulty][player.id === this.id ? 'own' : 'opponent'];
      const roll = this.random();
      if (roll >= odds.forgotten) {
        const uncertain = roll < odds.forgotten + odds.uncertain;
        if (uncertain) {
          const cells = clueCells(cell, odds.area);
          // Keep only the possible cells, with no trace of which one was
          // actually observed. Search order comes from the bot's own position.
          this.memory.set(`area:${cells[0].key}:${player.id}`, {cells, player:player.id});
        } else this.rememberExact(cell, player.id);
      }
    }
    if (event.type === 'unearth' || event.type === 'miss') {
      for (const [id, stash] of this.memory) {
        if (!stash.cells.some(candidate => candidate.key === key)) continue;
        if (event.type === 'unearth') this.memory.delete(id);
        else {
          stash.cells = stash.cells.filter(candidate => candidate.key !== key);
          if (!stash.cells.length) this.memory.delete(id);
        }
      }
      if (this.goal?.kind === 'search' && this.goal.key === key) this.goal = null;
    }
    // A completed failed burial confirms that this square is occupied. This
    // prevents a forgotten stash from trapping the bot in repeated burials.
    if (event.type === 'hint' && event.reason === 'occupied' && player.id === this.id)
      this.rememberExact(cell, null);
    if (player.id === this.id && ['bury', 'miss', 'unearth', 'deliver', 'hint'].includes(event.type))
      this.goal = null;
  }

  rememberExact(cell, player) {
    const key = cellKey(cell);
    this.memory.set(key, {cells:[{...center(cell), key}], player});
  }

  choose(view, player) {
    const survival = view.mode === 'survival';
    const obstacles = [...view.rocks, ...view.stumps];
    const safe = point => !obstacles.some(obstacle => overlapsRock(point.x, point.z, obstacle, 0.6));
    if (player.carrying) {
      if (survival && player.delivered < RULES.survivalQuota)
        return {kind:'delivery', x:this.id ? RULES.width - 0.55 : 0.55, z:basketBase(this.id).z};
      const cells = [];
      for (let row = 0; row < RULES.gridRows; row++)
        for (let col = this.id * RULES.gridColumns / 2; col < (this.id + 1) * RULES.gridColumns / 2; col++) {
          const cell = {col, row}, point = center(cell);
          if (!this.memory.has(cellKey(cell)) && safe(point)) cells.push({...point, key:cellKey(cell), kind:'bury'});
        }
      return cells.sort((a,b) => distance(a,player) - distance(b,player))[0];
    }
    const choices = view.acorns.map(acorn => ({...acorn, kind:'acorn'}));
    if (!survival || player.delivered < RULES.survivalQuota)
      for (const stash of this.memory.values())
        for (const candidate of stash.cells)
          if ((survival || Number(candidate.x >= RULES.half) !== this.id) && safe(candidate))
            choices.push({...candidate, kind:'search'});
    choices.sort((a,b) => distance(a,player) + (a.kind === 'search' ? 2 : 0) -
      distance(b,player) - (b.kind === 'search' ? 2 : 0));
    if (choices.length) return choices[0];
    // With nothing visible to collect, search normally for remembered stashes
    // or a powerup. The bot has the same search chances as a human.
    for (let i = 0; i < 300; i++) {
      const index = (this.searchIndex++ * 37 + this.id * 53) % (RULES.gridColumns * RULES.gridRows);
      const cell = {col:index % RULES.gridColumns, row:Math.floor(index / RULES.gridColumns)};
      const point = center(cell);
      if (safe(point)) return {...point, key:cellKey(cell), kind:'search'};
    }
    return null;
  }

  update(view, dt) {
    const still = {x:0, z:0, dig:false};
    if (view.phase !== 'playing') return still;
    const player = view.players[this.id];
    if (player.eliminated) return still;
    if (player.dig) return still;
    this.thinkIn -= dt;
    const invalid = this.round !== view.round || !this.goal ||
      (player.carrying !== ['bury','delivery'].includes(this.goal?.kind)) ||
      (this.goal?.kind === 'acorn' && !view.acorns.some(acorn => acorn.id === this.goal.id));
    if (invalid || (this.thinkIn <= 0 && this.goal?.kind !== 'bury')) {
      const next = this.choose(view, player);
      if (!this.goal || !next || next.kind !== this.goal.kind || distance(next,this.goal) > 0.05) {
        this.goal = next;
        this.path = next ? returnPath({x:player.x,z:player.z}, next,
          [...view.rocks,...view.stumps], 0.65).slice(1) : [];
      }
      this.round = view.round;
      this.thinkIn = 0.3;
    }
    if (!this.goal) return still;
    const atGoal = distance(player, this.goal) < 0.25;
    if (atGoal) {
      const dig = ['bury','search'].includes(this.goal.kind) && Math.hypot(player.vx,player.vz) < 0.15;
      return {...still, dig};
    }
    while (this.path.length > 1 && distance(player,this.path[0]) < 0.2) this.path.shift();
    const point = this.path[0] || this.goal, length = distance(player,point);
    const scale = Math.min(1, length / 1.1) / Math.max(length, 0.01);
    return {x:(point.x-player.x)*scale, z:(point.z-player.z)*scale, dig:false};
  }
}
