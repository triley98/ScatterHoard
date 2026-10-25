import test from 'node:test';
import assert from 'node:assert/strict';
import { SquirrelAI } from '../src/ai.js';
import { Game, RULES, cellAt, cellKey } from '../src/game.js';

const center = (col, row) => ({x:(col + 0.5) * RULES.width / RULES.gridColumns, z:(row + 0.5) * RULES.depth / RULES.gridRows});
function gameFor(mode = 'arcade') {
  const game = new Game({mode, random:() => 0.99});
  game.start(); game.rocks = []; game.stumps = []; game.acorns = []; game.nextDrop = Infinity;
  game.drainEvents();
  return game;
}
function observeBurial(bot, game, id, col, row) {
  Object.assign(game.players[id], center(col, row));
  bot.observe({type:'bury', player:id}, game.snapshot());
}

test('opponent burials can go unnoticed, be remembered as a 2x2 area, or be remembered exactly', () => {
  for (const [roll, candidates] of [[0.1,0], [0.4,4], [0.8,1]]) {
    const bot = new SquirrelAI(1, {random:() => roll}), game = gameFor();
    observeBurial(bot, game, 0, 5, 3);
    assert.equal([...bot.memory.values()].flatMap(stash => stash.cells).length, candidates);
    if (candidates === 1) assert.equal([...bot.memory.values()][0].cells[0].key, '5,3');
  }
});

test('an uncertain memory is identical for every burial square in its 2x2 area', () => {
  const memories = [], goals = [];
  for (const [col,row] of [[4,2], [5,2], [4,3], [5,3]]) {
    const game = gameFor(), bot = new SquirrelAI(1, {random:() => 0.4});
    observeBurial(bot, game, 0, col, row);
    Object.assign(game.players[1], center(4,2));
    memories.push([...bot.memory]);
    goals.push(bot.choose(game.snapshot(), game.players[1]));
  }
  for (let i = 1; i < memories.length; i++) {
    assert.deepEqual(memories[i], memories[0]);
    assert.deepEqual(goals[i], goals[0]);
  }
  assert.equal(goals[3].key, '4,2'); // No preference for the actual square, 5,3.
});

test('uncertain searches rule out missed squares and stop following the clue after finding an acorn', () => {
  const game = gameFor(), bot = new SquirrelAI(1, {random:() => 0.4});
  observeBurial(bot, game, 0, 5, 3);
  Object.assign(game.players[1], center(4,2));
  const first = bot.choose(game.snapshot(), game.players[1]);
  bot.observe({type:'miss', player:1}, game.snapshot());
  assert.equal([...bot.memory.values()][0].cells.length, 3);
  const next = bot.choose(game.snapshot(), game.players[1]);
  assert.notEqual(next.key, first.key);
  Object.assign(game.players[1], center(5,3));
  bot.observe({type:'unearth', player:1}, game.snapshot());
  assert.equal(bot.memory.size, 0);
});

test('the AI can forget its own stash or retain only four possible squares', () => {
  for (const [roll, candidates] of [[0.02,0], [0.1,4], [0.8,1]]) {
    const game = gameFor('survival'), bot = new SquirrelAI(1, {random:() => roll});
    observeBurial(bot, game, 1, 23, 5);
    assert.equal([...bot.memory.values()].flatMap(stash => stash.cells).length, candidates);
  }
});

test('a vague own-stash memory causes real failed digs before recovering and delivering the reserve', () => {
  const game = gameFor('survival'), bot = new SquirrelAI(1, {random:() => 0.1});
  const player = game.players[1];
  Object.assign(player, center(23,5), {carrying:true});
  game.requestDig(1); game.update(RULES.digDuration);
  for (const event of game.drainEvents()) bot.observe(event, game.snapshot());
  Object.assign(player, center(22,4));
  let misses = 0;
  for (let frame = 0; frame < 900 && player.delivered < 1; frame++) {
    const action = bot.update(game.snapshot(), 1/30);
    if (action.dig) game.requestDig(1);
    game.update(1/30, [{x:0,z:0}, action]);
    for (const event of game.drainEvents()) {
      if (event.type === 'miss' && event.player === 1) misses++;
      bot.observe(event, game.snapshot());
    }
  }
  assert.ok(misses >= 1);
  assert.equal(player.delivered, 1);
});

test('a forgotten occupied square cannot trap the AI in an endless failed burial', () => {
  const game = gameFor(), bot = new SquirrelAI(1, {random:() => 0.02});
  const player = game.players[1];
  Object.assign(player, center(23,5), {carrying:true});
  game.requestDig(1); game.update(RULES.digDuration);
  for (const event of game.drainEvents()) bot.observe(event, game.snapshot());
  assert.equal(bot.memory.size, 0);
  player.carrying = true;
  game.requestDig(1); game.update(RULES.digDuration);
  for (const event of game.drainEvents()) bot.observe(event, game.snapshot());
  const next = bot.choose(game.snapshot(), player);
  assert.equal(next.kind, 'bury');
  assert.notEqual(next.key, cellKey(cellAt(player.x, player.z)));
});
