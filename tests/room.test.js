import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom } from '../server/room.js';

function makeRoom() {
  const room = new MatchRoom({
    code: 'ABC234',
    hostToken: 'host-secret',
    random: () => 0.5,
    now: 1000,
  });
  room.join('host-secret', () => 'unused');
  room.join(null, () => 'guest-secret');
  return room;
}
function start(room) {
  room.setReady(0);
  room.setReady(1);
  room.tick(4000);
}

test('lobby assigns host and guest, rejects extra players, duplicates, and invalid tickets', () => {
  const room = makeRoom();
  assert.deepEqual(room.connected, [true, true]);
  assert.throws(() => room.join(null, () => ''), /two squirrels/);
  assert.throws(() => room.join('host-secret', () => ''), /another tab/);
  assert.throws(() => room.join('invented-token', () => ''), /expired/);
  const wire = JSON.stringify(room.snapshot());
  assert.ok(!wire.includes('host-secret') && !wire.includes('guest-secret'));
});

test('both players must ready up before a synchronized three-second countdown', () => {
  const room = makeRoom();
  room.setReady(0);
  assert.equal(room.game.phase, 'ready');
  room.setReady(1);
  assert.equal(room.game.phase, 'countdown');
  room.tick(3000);
  assert.equal(room.game.phase, 'countdown');
  room.tick(4000);
  assert.equal(room.game.phase, 'playing');
  assert.equal(room.game.elapsed, 0);
  assert.equal(room.epoch, 1);
});

test('server applies only valid inputs for that seat, expires stale input, and rejects replayed sequences', () => {
  const room = makeRoom();
  start(room);
  room.input(0, { x: Infinity, z: 0, seq: 0 }, 4000);
  assert.equal(room.inputs[0].seq, -1);
  room.input(
    0,
    { x: 1, z: 0, seq: 1, scores: [999, 0], powerup: 'speed-boost' },
    4000,
  );
  room.tick(4500);
  assert.ok(room.game.players[0].x > 8.5);
  assert.equal(room.game.players[1].x, 31.5);
  assert.deepEqual(room.game.scores, [0, 0]);
  room.input(0, { x: -1, z: 0, seq: 1 }, 4500);
  assert.equal(room.inputs[0].x, 1);
  room.tick(5000);
  room.tick(5500);
  const x = room.game.players[0].x;
  room.tick(6000);
  assert.equal(room.game.players[0].x, x);
});

test('disconnect pauses the match and an authenticated reconnect resumes without losing score', () => {
  const room = makeRoom();
  start(room);
  room.tick(4500);
  const elapsed = room.game.elapsed;
  room.disconnect(1, 4500);
  room.tick(10000);
  assert.equal(room.game.phase, 'paused');
  assert.equal(room.game.elapsed, elapsed);
  room.join('guest-secret', () => '');
  assert.equal(room.game.phase, 'playing');
  room.tick(10500);
  assert.ok(room.game.elapsed > elapsed);
});

test('a 30-second reconnect timeout resets the round; both players can ready for a rematch', () => {
  const room = makeRoom();
  start(room);
  room.disconnect(1, 4000);
  room.tick(35001);
  assert.equal(room.game.phase, 'ready');
  assert.deepEqual(room.ready, [false, false]);
  room.join('guest-secret', () => '');
  room.setReady(0);
  room.setReady(1);
  room.tick(38001);
  assert.equal(room.game.phase, 'playing');
  room.tick(224001);
  assert.equal(room.game.phase, 'finished');
  room.setReady(0);
  assert.equal(room.game.phase, 'finished');
  room.setReady(1);
  assert.equal(room.game.phase, 'countdown');
  assert.deepEqual(room.game.scores, [0, 0]);
});

test('returning after both sockets were offline still enforces the reconnect deadline', () => {
  const room = makeRoom();
  start(room);
  room.disconnect(0, 4000);
  room.disconnect(1, 4000);
  // No timer ticks while both sockets are gone.
  room.join('host-secret', () => '', 35001);
  room.join('guest-secret', () => '', 35001);
  assert.equal(room.game.phase, 'ready');
  assert.deepEqual(room.ready, [false, false]);
});

test('online rounds retain the authoritative board and synchronize intermission and round numbers', () => {
  const room = makeRoom();
  start(room);
  room.game.players[0].carrying = true;
  room.game.requestDig(0);
  room.tick(4600);
  room.tick(64000);
  assert.equal(room.game.phase, 'intermission');
  assert.deepEqual(room.game.scores, [1, 0]);
  assert.equal(room.game.acorns.length, 0);
  assert.deepEqual(room.snapshot().players.map(p => [p.x, p.z, p.carrying]), [[8.5, 7.5, false], [31.5, 7.5, false]]);
  const rocks = room.snapshot().rocks;
  const epoch = room.epoch;
  room.disconnect(1, 64000);
  room.tick(65000);
  assert.equal(room.game.phase, 'paused');
  room.join('guest-secret', () => '', 65000);
  assert.equal(room.game.phase, 'intermission');
  room.tick(68000);
  const snapshot = room.snapshot();
  assert.equal(snapshot.round, 2);
  assert.equal(snapshot.phase, 'playing');
  assert.equal(snapshot.epoch, epoch);
  assert.deepEqual(snapshot.rocks, rocks);
  assert.equal(snapshot.acorns.length, 1);
  assert.equal(room.game.buried.size, 1);
  assert.deepEqual(snapshot.scores, [1, 0]);
  assert.equal('buried' in snapshot, false);
  assert.deepEqual(snapshot.roundResults[0], { round: 1, scores: [1, 0] });
});

test('online round-three digging retrieves a round-one stash only from its original cell', () => {
  const room = makeRoom();
  start(room);
  Object.assign(room.game.players[0], { x: 12.2, z: 8.7, carrying: true });
  room.input(0, { x: 0, z: 0, seq: 0, dig: true }, 4000);
  room.tick(4600);
  const stash = { ...room.game.buried.get('12,8') };
  assert.deepEqual(stash, { col: 12, row: 8, territory: 0, player: 0 });

  for (const [round, end, next] of [[1, 64000, 67000], [2, 127000, 130000]]) {
    room.tick(end);
    assert.equal(room.game.phase, 'intermission');
    assert.equal(room.game.round, round);
    assert.equal(room.game.acorns.length, 0);
    assert.deepEqual(room.game.buried.get('12,8'), stash);
    room.tick(next);
    const snapshot = room.snapshot();
    assert.equal(snapshot.round, round + 1);
    assert.equal(snapshot.phase, 'playing');
    assert.deepEqual(snapshot.scores, [1, 0]);
    assert.equal('buried' in snapshot, false);
    assert.deepEqual(room.game.buried.get('12,8'), stash);
  }

  Object.assign(room.game.players[1], { x: 13.5, z: 8.5 });
  room.input(1, { x: 0, z: 0, seq: 0, dig: true }, 130000);
  room.tick(130600);
  assert.equal(room.snapshot().players[1].carrying, false);
  assert.deepEqual(room.game.buried.get('12,8'), stash);

  Object.assign(room.game.players[1], { x: 12.8, z: 8.2 });
  room.input(1, { x: 0, z: 0, seq: 1, dig: true }, 130600);
  room.tick(131200);
  assert.equal(room.snapshot().players[1].carrying, true);
  assert.equal(room.game.buried.has('12,8'), false);
  assert.deepEqual(room.snapshot().scores, [0, 0]);
});
