import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUND_TIMING, roundTransition, transitionDuration, returnPath, pointOnPath } from '../src/round-transition.js';
import { Game, RULES } from '../src/game.js';
import { overlapsRock } from '../src/game.js';

test('return, basket hoist, three-second fade out, three-second dawn, then countdown run in order', () => {
  assert.equal(transitionDuration(), 14);
  const at = seconds => roundTransition(transitionDuration() - seconds);
  assert.equal(at(0).stage, 'returning');
  assert.equal(at(2.99).opacity, 0);
  assert.deepEqual(at(3), { stage: 'hoisting', progress: 0, opacity: 0, daylight: false });
  assert.equal(at(4).progress, 0.5);
  assert.deepEqual(at(5), { stage: 'fade-out', progress: 0, opacity: 0, daylight: false });
  assert.equal(at(6.5).opacity, 0.5);
  assert.deepEqual(at(8), { stage: 'fade-in', progress: 0, opacity: 1, daylight: true });
  assert.equal(at(9.5).opacity, 0.5);
  assert.deepEqual(at(11), { stage: 'countdown', progress: 0, opacity: 0, daylight: true });
  assert.equal(at(14).progress, 1);
  assert.equal(ROUND_TIMING.countdown, 3);
});

test('the last round returns, fades to black, and stays black behind results', () => {
  const game = new Game();
  game.start();
  game.round = RULES.rounds;
  game.update(RULES.duration - 0.1);
  assert.equal(game.requestDig(0), true);
  game.update(0.1);
  assert.equal(game.phase, 'intermission');
  assert.equal(game.players[0].dig, null);
  assert.equal(game.requestDig(0), false);
  assert.equal(game.intermissionRemaining, 8);
  assert.ok(!game.drainEvents().some(event => event.type === 'finish'));
  game.update(6.5);
  const frozen = roundTransition(game.intermissionRemaining, true);
  assert.equal(frozen.opacity, 0.5);
  game.pause();
  game.update(20);
  assert.deepEqual(roundTransition(game.intermissionRemaining, true), frozen);
  game.resume();
  game.update(1.5);
  assert.equal(game.phase, 'finished');
  assert.deepEqual(roundTransition(0, true), {stage:'black', progress:1, opacity:1, daylight:false});
  game.update(30);
  assert.equal(game.phase, 'finished');
  assert.equal(game.drainEvents().filter(event => event.type === 'finish').length, 1);
});

test('return routes avoid obstacles and keep the real endpoint until reaching the tree', () => {
  const start = { x: 8, z: 7.5 }, tree = { x: -2, z: 8.65 };
  const obstacle = { x: 2, z: 6, width: 3, depth: 3 };
  const path = returnPath(start, tree, [obstacle]);
  assert.ok(path.length > 2);
  assert.deepEqual(path[0], start);
  assert.deepEqual(path.at(-1), tree);
  for (let i = 0; i <= 100; i++) {
    const point = pointOnPath(path, i / 100);
    assert.ok(!(point.x > 1.6 && point.x < 5.4 && point.z > 5.6 && point.z < 9.4));
  }
  assert.equal(pointOnPath(path, 0).x, start.x);
  assert.ok(Math.abs(pointOnPath(path, 1).x - tree.x) < 1e-8);
  const edgePath = returnPath({ x: 5.32, z: 7.5 }, tree, [obstacle]);
  assert.ok(edgePath.length > 2);
  for (let i = 0; i <= 100; i++) {
    const point = pointOnPath(edgePath, i / 100);
    assert.equal(overlapsRock(point.x, point.z, obstacle), false);
  }
});
