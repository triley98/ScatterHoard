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
  assert.equal(game.requestDig(1), false);
  assert.equal(game.buried.size, 1);
  assert.deepEqual(game.scores, [1, 0]);
  game.players[1].x = 9.1;
  assert.equal(game.requestDig(1), true);
  game.update(RULES.digDuration, idle);
  assert.deepEqual(game.scores, [2, 0]);
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
