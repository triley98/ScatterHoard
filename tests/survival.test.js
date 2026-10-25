import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, RULES, cellAt, cellKey } from '../src/game.js';
import { MatchRoom } from '../server/room.js';
import { SquirrelAI } from '../src/ai.js';

function survival() {
  const game = new Game({mode:'survival', random:() => 0.5});
  game.start(); game.rocks = []; game.stumps = [];
  return game;
}
function deliver(game, id, count = 5) {
  for (let i=0; i<count; i++) {
    Object.assign(game.players[id], {x:id ? 39.5 : 0.5, z:7.5, carrying:true, vx:0, vz:0});
    game.update(0.01);
  }
}
function endRound(game) { game.update(60-game.elapsed); }

test('Survival consumes deliveries only at the player’s own tree and caps the goal at five', () => {
  const game = survival(), player = game.players[0];
  Object.assign(player,{x:39.5,z:7.5,carrying:true});
  game.update(0.01);
  assert.equal(player.delivered,0); assert.equal(player.carrying,true);
  deliver(game,0);
  assert.equal(player.delivered,5); assert.equal(player.carrying,false);
  assert.deepEqual(game.scores,[0,0]);
  deliver(game,0,1);
  assert.equal(player.delivered,5); assert.equal(player.carrying,true);
  assert.equal(game.drainEvents().filter(event => event.type === 'deliver').length,5);
});

test('buried reserves persist between rounds and can be retrieved for later deliveries', () => {
  const game = survival();
  deliver(game,0); deliver(game,1);
  Object.assign(game.players[0],{x:6.5,z:7.5,carrying:true});
  game.requestDig(0); game.update(RULES.digDuration);
  const key = cellKey(cellAt(6.5,7.5));
  assert.ok(game.buried.has(key));
  assert.equal(game.players[0].delivered,5);
  endRound(game); game.update(RULES.intermission);
  assert.equal(game.round,2); assert.equal(game.players[0].delivered,0);
  assert.ok(game.buried.has(key));
  Object.assign(game.players[0],{x:6.5,z:7.5});
  game.requestDig(0); game.update(RULES.digDuration);
  assert.equal(game.players[0].carrying,true); assert.equal(game.buried.has(key),false);
  Object.assign(game.players[0],{x:0.5,z:7.5}); game.update(0.01);
  assert.equal(game.players[0].delivered,1);
  assert.equal(game.snapshot().players[0].delivered,1);
  assert.equal('buried' in game.snapshot(),false);
});

test('Survival drops follow 3, 5, 7, 8, 9, 10 seconds and reset quota beyond three rounds', () => {
  const game = survival();
  let previousDrops=0;
  const intervals = [3,5,7,8,9,10];
  for (let round=1; round<=6; round++) {
    assert.equal(game.round,round);
    assert.equal(game.roundDropInterval,intervals[round-1]);
    assert.ok(game.players.every(player => player.delivered === 0));
    deliver(game,0); deliver(game,1); endRound(game);
    assert.equal(game.drops-previousDrops,Math.ceil(60/intervals[round-1]));
    previousDrops=game.drops;
    assert.equal(game.matchEnding,false);
    assert.equal(game.phase,'intermission');
    game.update(RULES.intermission);
  }
  assert.equal(game.round,7);
});

test('an eliminated squirrel cannot move, dig or collect; the survivor continues alone', () => {
  const game = survival();
  deliver(game,0); endRound(game);
  assert.equal(game.players[1].eliminated,true);
  assert.equal(game.matchEnding,false);
  game.update(RULES.intermission);
  const player=game.players[1], x=player.x;
  game.acorns=[{id:999,x:player.x,z:player.z,born:game.matchElapsed}];
  assert.equal(game.requestDig(1),false);
  game.update(1,[{x:0,z:0},{x:1,z:0}]);
  assert.equal(player.x,x); assert.equal(player.carrying,false);
  deliver(game,0); endRound(game); game.update(RULES.intermission);
  assert.equal(game.round,3); assert.equal(game.phase,'playing');
  endRound(game); assert.equal(game.matchEnding,true);
  game.update(RULES.ending);
  assert.equal(game.phase,'finished'); assert.equal(game.winner,0);
  assert.equal(game.players[0].eliminatedRound,3);
  assert.equal(game.players[1].eliminatedRound,1);
  game.start();
  assert.equal(game.mode,'survival'); assert.equal(game.round,1);
  assert.equal(game.roundDropInterval,3); assert.equal(game.nextDrop,3);
  assert.ok(game.players.every(p => !p.eliminated && p.delivered === 0));
});

test('both squirrels failing in the same round is a draw and takes the final black transition', () => {
  const game = survival(); endRound(game);
  assert.equal(game.intermissionRemaining,RULES.ending);
  game.update(RULES.ending);
  assert.equal(game.phase,'finished'); assert.equal(game.winner,null);
});

test('online Survival mode survives ready, elimination, disconnect, snapshots and rematches', () => {
  const room = new MatchRoom({code:'ABC234',hostToken:'host',mode:'survival',now:1000});
  room.join('host',()=> ''); room.join(null,()=> 'guest');
  room.setReady(0); room.setReady(1); room.tick(4000);
  room.game.players[0].delivered=5;
  room.tick(64000);
  room.disconnect(1,64000);
  assert.equal(room.game.phase,'intermission');
  const nextRoundAt = 64000 + RULES.intermission * 1000;
  room.tick(nextRoundAt);
  const view=room.snapshot();
  assert.equal(view.mode,'survival'); assert.equal(view.round,2);
  assert.equal(view.roundDropInterval,5); assert.equal(view.players[1].eliminated,true);
  assert.equal('buried' in view,false);
  room.disconnect(0,nextRoundAt); room.tick(nextRoundAt + 1000);
  assert.equal(room.game.phase,'paused');
  room.join('host',()=> '');
  assert.equal(room.game.phase,'playing');
  room.tick(nextRoundAt + 1000 + (RULES.duration + RULES.ending) * 1000);
  assert.equal(room.game.phase,'finished'); assert.equal(room.game.winner,0);
  room.join('guest',()=> ''); room.setReady(0); room.setReady(1);
  assert.equal(room.game.mode,'survival'); assert.equal(room.game.phase,'countdown');
  assert.ok(room.game.players.every(p => !p.eliminated));
});

test('AI collects and buries in Arcade and delivers five in Survival using public snapshots', () => {
  for (const mode of ['arcade','survival']) {
    const game = new Game({mode,random:() => 0.5}); game.start();
    game.rocks=[]; game.stumps=[];
    game.acorns=Array.from({length:7},(_,id)=>({id:100+id,x:31.5+id*0.15,z:7.5,born:0}));
    const bot=new SquirrelAI();
    for (let i=0; i<1800 && game.phase === 'playing'; i++) {
      const action=bot.update(game.snapshot(),1/30);
      if (action.dig) game.requestDig(1);
      game.update(1/30,[{x:0,z:0},action]);
      for (const event of game.drainEvents()) bot.observe(event,game.snapshot());
    }
    if (mode === 'arcade') assert.ok(game.scores[1] > 0);
    else assert.equal(game.players[1].delivered,5);
  }
});
