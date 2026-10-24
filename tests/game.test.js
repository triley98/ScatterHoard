import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, RULES, cellAt, cellKey } from '../src/game.js';

const idle = [
  { x: 0, z: 0 },
  { x: 0, z: 0 },
];
const makeGame = () => {
  const game = new Game({ random: () => 0.5 });
  game.start();
  return game;
};
function giveAcorn(game, id, x = 8.5, z = 5.5) {
  const player = game.players[id];
  Object.assign(player, { x, z, vx: 0, vz: 0 });
  game.acorns = [{ id: game.nextId++, x, z, born: game.elapsed }];
  game.update(1 / 60, idle);
  assert.equal(player.carrying, true);
}

test('a round lasts exactly 60 seconds and has 12 drops, at 0, 5, …, 55', () => {
  const game = makeGame();
  assert.equal(game.drops, 1);
  game.update(4.99, idle);
  assert.equal(game.drops, 1);
  game.update(0.01, idle);
  assert.equal(game.drops, 2);
  game.update(54, idle);
  assert.equal(game.phase, 'playing');
  assert.ok(Math.abs(game.remaining - 1) < 1e-6);
  game.update(2, idle);
  assert.equal(game.phase, 'finished');
  assert.equal(game.elapsed, 60);
  assert.equal(game.drops, 12);
  assert.equal(game.remaining, 0);
  game.update(50, idle);
  assert.equal(game.drops, 12);
});

test('movement is continuous, accelerates smoothly, and clamps to the 40 × 10 board', () => {
  const game = makeGame();
  const start = game.players[0].x;
  game.update(0.1, [{ x: 1, z: 0 }, idle[1]]);
  assert.ok(
    game.players[0].x > start && game.players[0].x < start + RULES.speed * 0.1,
  );
  assert.notEqual(game.players[0].x % 1, 0.5);
  game.update(10, [
    { x: 1, z: -1 },
    { x: -1, z: 1 },
  ]);
  assert.equal(game.players[0].x, 40 - RULES.playerRadius);
  assert.equal(game.players[0].z, RULES.playerRadius);
  assert.equal(game.players[1].x, RULES.playerRadius);
  assert.equal(game.players[1].z, 10 - RULES.playerRadius);
});

test('diagonal movement is normalized and neither squirrel is fenced into its half', () => {
  const straight = makeGame();
  const diagonal = makeGame();
  straight.update(0.5, [{ x: 1, z: 0 }, idle[1]]);
  diagonal.update(0.5, [{ x: 1, z: -1 }, idle[1]]);
  const a = straight.players[0],
    b = diagonal.players[0];
  assert.ok(Math.abs(a.x - 8.5 - Math.hypot(b.x - 8.5, b.z - 5.5)) < 1e-7);
  straight.update(3, [{ x: 1, z: 0 }, idle[1]]);
  assert.ok(straight.players[0].x > 20);
});

test('a squirrel picks up automatically, carries only one acorn, and must dig to score', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.acorns.push({ id: 999, x: 8.5, z: 5.5, born: 0 });
  game.update(0.1, idle);
  assert.equal(game.acorns.length, 1);
  assert.deepEqual(game.scores, [0, 0]);
  assert.equal(game.requestDig(0), true);
  game.update(0.3, idle);
  assert.deepEqual(game.scores, [0, 0]);
  game.update(0.25, idle);
  assert.deepEqual(game.scores, [1, 0]);
  assert.equal(game.buried.size, 1);
  assert.deepEqual(game.buried.get('8,5'), {
    col: 8,
    row: 5,
    territory: 0,
    player: 0,
  });
});

test('a cell accepts only one acorn, including simultaneous dig attempts', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  giveAcorn(game, 1, 8.6, 5.6);
  assert.equal(game.requestDig(0), true);
  assert.equal(game.requestDig(1), false);
  assert.equal(game.players[1].carrying, true);
  game.update(RULES.digDuration, idle);
  assert.equal(game.requestDig(1), true); // Occupancy is discovered only after a full dig.
  game.update(RULES.digDuration, idle);
  assert.equal(game.players[1].carrying, true);
  assert.equal(game.buried.size, 1);
  assert.deepEqual(game.scores, [1, 0]);
  game.players[1].x = 9.1;
  assert.equal(game.requestDig(1), true);
  game.update(RULES.digDuration, idle);
  assert.deepEqual(game.scores, [2, 0]);
});

test('empty-pawed digging steals an opponent’s hidden acorn and removes its old score', () => {
  const game = makeGame();
  giveAcorn(game, 1, 27.5, 3.5);
  game.requestDig(1);
  game.update(RULES.digDuration, idle);
  assert.deepEqual(game.scores, [0, 1]);
  Object.assign(game.players[0], { x: 27.5, z: 3.5 });
  assert.equal(game.requestDig(0), true);
  game.update(RULES.digDuration, idle);
  assert.equal(game.players[0].carrying, true);
  assert.equal(game.buried.size, 0);
  assert.deepEqual(game.scores, [0, 0]);
  Object.assign(game.players[0], { x: 12.2, z: 3.4 });
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  assert.deepEqual(game.scores, [1, 0]);
  assert.equal(game.players[0].carrying, false);
});

test('search misses do not take one’s own buried acorns', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  assert.equal(game.players[0].carrying, false);
  assert.deepEqual(game.scores, [1, 0]);
  assert.ok(game.drainEvents().some((e) => e.type === 'miss'));
});

test('powerups roll only after completed empty-handed digs, at the exact 10% threshold', () => {
  const game = makeGame();
  let rolls = 0;
  game.random = () => {
    rolls++;
    return 0.5;
  };
  game.requestDig(0);
  game.update(0.2, idle);
  assert.equal(rolls, 0);
  game.update(0.1, [{ x: 1, z: 0 }, idle[1]]);
  assert.equal(rolls, 0);
  game.update(0.3, idle);
  for (const [chance, expected] of [
    [0.099999, true],
    [0.1, false],
  ]) {
    const values = [chance, 0.3];
    game.random = () => values.shift() ?? 0.5;
    game.drainEvents();
    game.requestDig(0);
    game.update(RULES.digDuration, idle);
    assert.equal(
      game.drainEvents().some((e) => e.type === 'powerup'),
      expected,
    );
  }
});

test('all five outcomes are selected, with three bonus drops restricted to the finder’s half', () => {
  const kinds = [
    'acorn-rain',
    'speed-boost',
    'friendly-corvid',
    'slowdown',
    'hungry-corvid',
  ];
  for (let i = 0; i < kinds.length; i++) {
    const game = makeGame();
    const values = [0.05, (i + 0.5) / 5];
    game.random = () => values.shift() ?? 0.7;
    game.requestDig(1);
    game.update(RULES.digDuration, idle);
    const event = game.drainEvents().find((e) => e.type === 'powerup');
    assert.equal(event.kind, kinds[i]);
    if (i === 0) {
      assert.equal(game.bonusDrops, 3);
      assert.equal(game.drops, 1);
      assert.equal(game.acorns.length, 4);
      assert.ok(game.acorns.slice(1).every((a) => a.x >= 20 && a.x < 40));
    }
  }
});

test('speed boost and slowdown change movement for six seconds, do not stack, and expire', () => {
  const boosted = makeGame(),
    slowed = makeGame(),
    normal = makeGame();
  boosted.applyPowerup(boosted.players[0], 'speed-boost');
  slowed.applyPowerup(slowed.players[0], 'slowdown');
  for (const game of [boosted, slowed, normal])
    game.update(1, [{ x: 1, z: 0 }, idle[1]]);
  assert.ok(boosted.players[0].x > normal.players[0].x);
  assert.ok(slowed.players[0].x < normal.players[0].x);
  boosted.applyPowerup(boosted.players[0], 'slowdown');
  assert.equal(boosted.players[0].effect, 'slowdown');
  assert.equal(boosted.players[0].effectUntil, boosted.elapsed + 6);
  boosted.update(6.1, idle);
  slowed.update(5.1, idle);
  assert.equal(boosted.players[0].effect, null);
  assert.equal(slowed.players[0].effect, null);
});

test('helpful and harmful corvids remove one acorn from the correct patch without revealing its location', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  giveAcorn(game, 1, 30.5, 4.5);
  game.requestDig(1);
  game.update(RULES.digDuration, idle);
  game.drainEvents();
  game.applyPowerup(game.players[0], 'friendly-corvid');
  assert.deepEqual(game.scores, [1, 0]);
  game.applyPowerup(game.players[0], 'hungry-corvid');
  assert.deepEqual(game.scores, [0, 0]);
  game.applyPowerup(game.players[0], 'hungry-corvid');
  const events = game.drainEvents();
  assert.deepEqual(
    events.map((e) => e.stolen),
    [true, true, false],
  );
  assert.ok(events.every((e) => !('col' in e) && !('row' in e)));
});

test('wire snapshots and burial events never disclose hidden cells or dig reservations', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  game.players[1].carrying = true;
  game.requestDig(1);
  const snapshot = game.snapshot();
  assert.equal('buried' in snapshot, false);
  assert.equal('key' in snapshot.players[1].dig, false);
  assert.equal('col' in snapshot.players[1].dig, false);
  assert.equal('row' in snapshot.players[1].dig, false);
  const bury = game.drainEvents().find((e) => e.type === 'bury');
  assert.deepEqual(Object.keys(bury).sort(), ['player', 'territory', 'type']);
});

test('a burial scores for the board half, including a burial by the opponent', () => {
  const game = makeGame();
  giveAcorn(game, 0, 20.001, 4.2);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  assert.deepEqual(game.scores, [0, 1]);
  assert.equal(game.winner, 1);
  assert.equal(game.players[0].buried, 1);
  giveAcorn(game, 1, 19.999, 4.2);
  game.requestDig(1);
  game.update(RULES.digDuration, idle);
  assert.deepEqual(game.scores, [1, 1]);
  assert.equal(game.winner, null);
});

test('moving cancels digging, preserving the acorn and the empty cell', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(0.2, idle);
  game.update(0.5, [{ x: 1, z: 0 }, idle[1]]);
  assert.equal(game.players[0].dig, null);
  assert.equal(game.players[0].carrying, true);
  assert.equal(game.buried.size, 0);
  assert.equal(game.scores[0], 0);
});

test('pause freezes the clock, movement, drops, and ongoing digs; resume continues them', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(0.2, idle);
  const elapsed = game.elapsed;
  game.pause();
  game.update(10, [{ x: 1, z: 0 }, idle[1]]);
  assert.equal(game.elapsed, elapsed);
  assert.equal(game.buried.size, 0);
  assert.equal(game.players[0].x, 8.5);
  assert.equal(game.drops, 1);
  game.resume();
  game.update(0.35, idle);
  assert.equal(game.buried.size, 1);
});

test('round end rejects further movement and digs; rematch clears all round state', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.update(60, idle);
  assert.equal(game.phase, 'finished');
  assert.equal(game.requestDig(0), false);
  const x = game.players[0].x;
  game.update(1, [{ x: 1, z: 0 }, idle[1]]);
  assert.equal(game.players[0].x, x);
  game.start();
  assert.equal(game.phase, 'playing');
  assert.equal(game.elapsed, 0);
  assert.equal(game.players[0].carrying, false);
  assert.equal(game.buried.size, 0);
  assert.deepEqual(game.scores, [0, 0]);
  assert.equal(game.acorns.length, 1);
  assert.equal(game.drops, 1);
});

test('contested acorns go to the closest eligible squirrel; exact ties alternate', () => {
  const game = makeGame();
  Object.assign(game.players[0], { x: 20, z: 5 });
  Object.assign(game.players[1], { x: 20, z: 5 });
  game.acorns = [{ id: 500, x: 20, z: 5, born: 0 }];
  game.update(0.01, idle);
  assert.equal(game.players[0].carrying, true);
  assert.equal(game.players[1].carrying, false);
  game.players[0].carrying = false;
  game.acorns = [{ id: 501, x: 20, z: 5, born: 0 }];
  game.update(0.01, idle);
  assert.equal(game.players[1].carrying, true);
  assert.equal(game.players[0].carrying, false);
});

test('fractional coordinates map to grid cells at edges and across the center line', () => {
  assert.equal(cellKey(cellAt(19.999, 9.99)), '19,9');
  assert.equal(cellKey(cellAt(20, 0)), '20,0');
  assert.equal(cellKey(cellAt(40, 10)), '39,9');
});
