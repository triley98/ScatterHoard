import { RULES, cellAt, cellKey, overlapsRock } from './game.js';
import { returnPath } from './round-transition.js';

const center = ({col, row}) => ({
  x: (col + 0.5) * RULES.width / RULES.gridColumns,
  z: (row + 0.5) * RULES.depth / RULES.gridRows,
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** A local opponent with public observations and memory, never the burial map. */
export class SquirrelAI {
  constructor(id = 1) { this.id = id; this.reset(); }
  reset() {
    this.memory = new Map(); this.goal = null; this.path = [];
    this.thinkIn = 0; this.searchIndex = 0; this.round = 0;
  }

  observe(event, view) {
    const player = view.players[event.player];
    if (!player) return;
    const cell = cellAt(player.x, player.z), key = cellKey(cell);
    if (event.type === 'bury') this.memory.set(key, {...center(cell), player:player.id, territory:Number(player.x >= RULES.half), key});
    if (event.type === 'unearth' || event.type === 'miss') this.memory.delete(key);
    if (player.id === this.id && ['bury', 'miss', 'unearth', 'deliver', 'hint'].includes(event.type))
      this.goal = null;
  }

  choose(view, player) {
    const survival = view.mode === 'survival';
    const obstacles = [...view.rocks, ...view.stumps];
    const safe = point => !obstacles.some(obstacle => overlapsRock(point.x, point.z, obstacle, 0.6));
    if (player.carrying) {
      if (survival && player.delivered < RULES.survivalQuota)
        return {kind:'delivery', x:this.id ? RULES.width - 0.55 : 0.55, z:RULES.depth / 2};
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
        if (survival || stash.territory !== this.id) choices.push({...stash, kind:'search'});
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
