import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, RULES, cellAt, cellKey, overlapsRock } from '../src/game.js';

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
  game.acorns = [{ id: game.nextId++, x, z, born: game.matchElapsed }];
  game.update(1 / 60, idle);
  assert.equal(player.carrying, true);
}

test('three rounds last exactly 60 seconds each, with 12 drops per round and five-second breaks', () => {
  const game = makeGame();
  for (let round = 1; round <= 3; round++) {
    assert.equal(game.round, round);
    assert.equal(game.drops, (round - 1) * 12 + 1);
    game.update(4.99, idle);
    assert.equal(game.drops, (round - 1) * 12 + 1);
    game.update(0.01, idle);
    assert.equal(game.drops, (round - 1) * 12 + 2);
    game.update(54, idle);
    assert.equal(game.phase, 'playing');
    assert.ok(Math.abs(game.remaining - 1) < 1e-6);
    game.update(1, idle);
    assert.equal(game.elapsed, 60);
    assert.equal(game.drops, round * 12);
    assert.equal(game.roundResults.length, round);
    if (round < 3) {
      assert.equal(game.phase, 'intermission');
      game.update(4.99, idle);
      assert.equal(game.phase, 'intermission');
      game.update(0.01, idle);
      assert.equal(game.phase, 'playing');
      assert.equal(game.elapsed, 0);
    }
  }
  assert.equal(game.phase, 'finished');
  assert.equal(game.matchElapsed, 180);
  game.update(50, idle);
  assert.equal(game.drops, 36);
});

test('movement is continuous, accelerates smoothly, and clamps to the 40 × 15 board', () => {
  const game = makeGame();
  game.rocks = [];
  game.stumps = [];
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
  assert.equal(game.players[1].z, 15 - RULES.playerRadius);
});

test('diagonal movement is normalized and neither squirrel is fenced into its half', () => {
  const straight = makeGame();
  const diagonal = makeGame();
  straight.update(0.5, [{ x: 1, z: 0 }, idle[1]]);
  diagonal.update(0.5, [{ x: 1, z: -1 }, idle[1]]);
  const a = straight.players[0],
    b = diagonal.players[0];
  assert.ok(Math.abs(a.x - 8.5 - Math.hypot(b.x - 8.5, b.z - RULES.depth / 2)) < 1e-7);
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

test('empty-handed digging recovers one’s own buried acorns and removes their old score', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  assert.equal(game.players[0].carrying, true);
  assert.deepEqual(game.scores, [0, 0]);
  assert.ok(game.drainEvents().some((e) => e.type === 'unearth'));
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
    'friendly-crow',
    'slowdown',
    'hungry-crow',
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

test('helpful and harmful crows remove one acorn from the correct patch without revealing its location', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  giveAcorn(game, 1, 30.5, 4.5);
  game.requestDig(1);
  game.update(RULES.digDuration, idle);
  game.drainEvents();
  game.applyPowerup(game.players[0], 'friendly-crow');
  assert.deepEqual(game.scores, [1, 0]);
  game.applyPowerup(game.players[0], 'hungry-crow');
  assert.deepEqual(game.scores, [0, 0]);
  game.applyPowerup(game.players[0], 'hungry-crow');
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

test('match end rejects further movement and digs; rematch clears all round state', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.update(RULES.duration * RULES.rounds + RULES.intermission * (RULES.rounds - 1), idle);
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
  assert.equal(cellKey(cellAt(40, 15)), '39,14');
});

test('round transitions retain buried stashes but reset positions and clear all unburied acorns', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  giveAcorn(game, 1, 30.5, 4.5);
  const board = game.buried;
  const rocks = JSON.stringify(game.rocks);
  const stumps = JSON.stringify(game.stumps);
  game.update(60 - game.elapsed, idle);
  assert.equal(game.phase, 'intermission');
  assert.equal(game.acorns.length, 0);
  assert.deepEqual(game.players.map(p => [p.x, p.z, p.carrying, p.vx, p.vz]),
    [[8.5, 7.5, false, 0, 0], [31.5, 7.5, false, 0, 0]]);
  game.update(RULES.intermission, idle);
  assert.equal(game.round, 2);
  assert.equal(game.buried, board);
  assert.deepEqual(game.scores, [1, 0]);
  assert.equal(game.acorns.length, 1);
  assert.equal(game.acorns[0].born, 60);
  assert.equal(JSON.stringify(game.rocks), rocks);
  assert.equal(JSON.stringify(game.stumps), stumps);
  Object.assign(game.players[1], { x: 8.5, z: 5.5 });
  game.requestDig(1);
  game.update(RULES.digDuration, idle);
  assert.equal(game.players[1].carrying, true);
  assert.deepEqual(game.scores, [0, 0]);
});

test('a round-one stash stays in its exact cell through round two and can be recovered in round three', () => {
  const game = makeGame();
  giveAcorn(game, 0, 12.2, 8.7);
  assert.equal(game.requestDig(0), true);
  game.update(RULES.digDuration, idle);
  const stash = { ...game.buried.get('12,8') };
  assert.deepEqual(stash, { col: 12, row: 8, territory: 0, player: 0 });

  for (const round of [1, 2]) {
    game.update(RULES.duration - game.elapsed, idle);
    assert.equal(game.phase, 'intermission');
    assert.equal(game.round, round);
    assert.equal(game.acorns.length, 0);
    assert.deepEqual(game.buried.get('12,8'), stash);
    game.update(RULES.intermission, idle);
    assert.equal(game.round, round + 1);
    assert.deepEqual(game.buried.get('12,8'), stash);
    assert.deepEqual(game.scores, [1, 0]);
  }

  // Searching an adjacent cell cannot retrieve or move the old stash.
  Object.assign(game.players[1], { x: 13.5, z: 8.5 });
  assert.equal(game.requestDig(1), true);
  game.update(RULES.digDuration, idle);
  assert.equal(game.players[1].carrying, false);
  assert.deepEqual(game.buried.get('12,8'), stash);

  // A different point in the original cell retrieves it for either player.
  Object.assign(game.players[1], { x: 12.8, z: 8.2 });
  assert.equal(game.requestDig(1), true);
  game.update(RULES.digDuration, idle);
  assert.equal(game.players[1].carrying, true);
  assert.equal(game.buried.has('12,8'), false);
  assert.deepEqual(game.scores, [0, 0]);
});

test('round breaks freeze movement and digging, pause cleanly, and preserve remaining buff time', () => {
  const game = makeGame();
  game.update(59, idle);
  game.applyPowerup(game.players[0], 'speed-boost');
  game.update(1, idle);
  assert.equal(game.phase, 'intermission');
  assert.equal(game.requestDig(0), false);
  const x = game.players[0].x;
  game.pause();
  game.update(20, [{ x: 1, z: 0 }, idle[1]]);
  assert.equal(game.intermissionRemaining, 5);
  game.resume();
  game.update(RULES.intermission, [{ x: 1, z: 0 }, idle[1]]);
  assert.equal(game.players[0].x, x);
  assert.equal(game.round, 2);
  assert.ok(
    Math.abs(game.players[0].effectUntil - game.matchElapsed - 5) < 1e-6,
  );
  game.update(5.01, idle);
  assert.equal(game.players[0].effect, null);
});

test('only the final board decides the match and each round keeps its own score snapshot', () => {
  const game = makeGame();
  giveAcorn(game, 0);
  game.requestDig(0);
  game.update(RULES.digDuration, idle);
  game.update(60 - game.elapsed, idle);
  assert.deepEqual(game.roundResults[0], { round: 1, scores: [1, 0] });
  assert.equal(game.phase, 'intermission');
  game.update(RULES.intermission, idle);
  Object.assign(game.players[1], { x: 8.5, z: 5.5 });
  game.requestDig(1);
  game.update(RULES.digDuration, idle);
  Object.assign(game.players[1], { x: 30.5, z: 5.5 });
  game.requestDig(1);
  game.update(RULES.digDuration, idle);
  game.update(60 - game.elapsed, idle);
  assert.deepEqual(game.roundResults[0].scores, [1, 0]);
  assert.deepEqual(game.roundResults[1].scores, [0, 1]);
  game.update(RULES.intermission + RULES.duration - 0.5, idle);
  game.applyPowerup(game.players[0], 'speed-boost');
  game.update(0.5, idle);
  assert.equal(game.phase, 'finished');
  assert.equal(game.players[0].effect, null);
  assert.equal(game.winner, 1);
  assert.deepEqual(
    game.roundResults.map((r) => r.scores),
    [
      [1, 0],
      [0, 1],
      [0, 1],
    ],
  );
});

test('3×3 rocks and 2×2 stumps are random, mirrored, separated, and clear of starts and the runway', () => {
  const a = new Game({ random: () => 0.1 });
  const b = new Game({ random: () => 0.8 });
  assert.notDeepEqual(a.rocks, b.rocks);
  assert.notDeepEqual(a.stumps, b.stumps);
  for (const game of [a, b, new Game({ random: () => 0 }), new Game({ random: () => 0.9999 })]) {
    for (const [items, size] of [[game.rocks, 3], [game.stumps, 2]]) {
      assert.equal(items.length, 4);
      for (let i = 0; i < 2; i++) {
        const obstacle = items[i], mirrored = items[i + 2];
        assert.deepEqual(mirrored, { ...obstacle, x: RULES.width - obstacle.x - size });
        assert.equal(obstacle.width, size); assert.equal(obstacle.depth, size);
        assert.ok(game.players.every(p => !overlapsRock(p.x, p.z, obstacle)));
      }
    }
    for (const obstacle of game.obstacles) {
      assert.ok(obstacle.x >= 1 && obstacle.x + obstacle.width <= RULES.width - 1);
      assert.ok(obstacle.z >= 1 && obstacle.z + obstacle.depth <= RULES.depth - 1);
      assert.ok(obstacle.z + obstacle.depth <= 5 || obstacle.z >= 10);
    }
    const obstacles = game.obstacles;
    for (let i = 0; i < obstacles.length; i++)
      for (let j = i + 1; j < obstacles.length; j++) {
        const left = obstacles[i], right = obstacles[j];
        const gapX = Math.max(left.x - right.x - right.width, right.x - left.x - left.width, 0);
        const gapZ = Math.max(left.z - right.z - right.depth, right.z - left.z - left.depth, 0);
        assert.ok(Math.hypot(gapX, gapZ) >= 1);
      }
    for (let x = 0.5; x < RULES.width; x++)
      assert.ok(obstacles.every(obstacle => !overlapsRock(x, 7.5, obstacle)));
  }
});

test('both solid obstacle types stop fast movement from all four directions and allow sliding', () => {
  for (const [kind, size] of [['rocks', 3], ['stumps', 2]]) {
    for (const [x, z, dx, dz, axis, boundary] of [
      [7, 6, 1, 0, 'x', 10 - RULES.playerRadius],
      [16, 6, -1, 0, 'x', 10 + size + RULES.playerRadius],
      [11, 2, 0, 1, 'z', 5 - RULES.playerRadius],
      [11, 11, 0, -1, 'z', 5 + size + RULES.playerRadius],
    ]) {
      const game = makeGame();
      game.rocks = []; game.stumps = [];
      game[kind] = [{ x: 10, z: 5, width: size, depth: size }];
      Object.assign(game.players[0], { x, z });
      game.applyPowerup(game.players[0], 'speed-boost');
      game.update(1, [{ x: dx, z: dz }, idle[1]]);
      assert.ok(Math.abs(game.players[0][axis] - boundary) < 1e-6);
      assert.ok(!overlapsRock(game.players[0].x, game.players[0].z, game[kind][0], RULES.playerRadius - 1e-6));
    }
    const game = makeGame();
    game.rocks = []; game.stumps = [];
    game[kind] = [{ x: 10, z: 5, width: size, depth: size }];
    Object.assign(game.players[0], { x: 9.5, z: 5.5 });
    game.update(0.4, [{ x: 1, z: 1 }, idle[1]]);
    assert.ok(game.players[0].z > 6);
    assert.ok(game.players[0].x <= 10 - RULES.playerRadius + 1e-6);
  }
});

test('normal and bonus drops avoid rocks and stumps even when the RNG repeats an obstructed point', () => {
  for (const kind of ['rocks', 'stumps']) {
    const game = makeGame();
    game.rocks = []; game.stumps = [];
    // Repeat an obstructed point for global and both half-specific drops.
    for (const side of [null, 0, 1]) {
      game[kind] = [{ x: side === null ? 19 : side * 20 + 9, z: 7, width: 3, depth: 3 }];
      const acorn = game.dropAcorn(side, side !== null);
      assert.ok(!game.obstacles.some(obstacle => overlapsRock(acorn.x, acorn.z, obstacle, 0.55)));
      if (side !== null) assert.ok(acorn.x >= side * 20 && acorn.x < (side + 1) * 20);
    }
  }
});

test('starting a prepared countdown preserves the layout that both players saw', () => {
  const game = makeGame();
  const rocks = JSON.stringify(game.rocks);
  const stumps = JSON.stringify(game.stumps);
  game.phase = 'countdown'; game.start(true);
  assert.equal(JSON.stringify(game.rocks), rocks);
  assert.equal(JSON.stringify(game.stumps), stumps);
  assert.deepEqual(game.snapshot().rocks, game.rocks);
  assert.deepEqual(game.snapshot().stumps, game.stumps);
});
