import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RULES } from '../src/game.js';
import { roundLighting, WindLeaves } from '../src/atmosphere.js';

test('each round begins at the established lighting and moves sunlight right', () => {
  const start = roundLighting(0);
  assert.deepEqual(start.position, [-14, 25, 14]);
  assert.equal(start.sunIntensity, 3.2);
  assert.equal(start.ambientIntensity, 2.25);
  assert.deepEqual(roundLighting(-10), start);
  let previous = start;
  for (let elapsed = 1; elapsed <= RULES.duration; elapsed++) {
    const current = roundLighting(elapsed);
    assert.ok(current.position[0] > previous.position[0]);
    previous = current;
  }
  assert.equal(previous.position[0], 18);
  assert.ok(roundLighting(RULES.duration / 2).position[1] > 25);
  assert.ok(previous.position[1] < 25);
});

test('daylight dims only over the last fifteen seconds and remains readable', () => {
  const threshold = RULES.duration - 15;
  assert.equal(roundLighting(threshold).sunIntensity, 3.2);
  assert.equal(roundLighting(threshold).dusk, 0);
  let previous = roundLighting(threshold);
  for (let elapsed = threshold + 1; elapsed <= RULES.duration; elapsed++) {
    const current = roundLighting(elapsed);
    assert.ok(current.sunIntensity < previous.sunIntensity);
    assert.ok(current.ambientIntensity < previous.ambientIntensity);
    assert.ok(current.dusk > previous.dusk);
    previous = current;
  }
  assert.ok(Math.abs(previous.sunIntensity - 0.7) < 1e-8);
  assert.ok(Math.abs(previous.ambientIntensity - 1.1) < 1e-8);
  assert.equal(previous.dusk, 1);
  assert.deepEqual(roundLighting(1000), roundLighting(RULES.duration));
});

test('wind leaves drift and fall, pause in place, and respect reduced motion', () => {
  const wind = new WindLeaves(new THREE.Scene());
  const initialMatrices = wind.mesh.instanceMatrix.array.slice();
  const initial = { ...wind.leaves[0] };
  wind.update(1);
  assert.ok(wind.leaves[0].x > initial.x);
  assert.ok(wind.leaves[0].y < initial.y);
  assert.notDeepEqual(wind.mesh.instanceMatrix.array, initialMatrices);
  const pausedMatrices = wind.mesh.instanceMatrix.array.slice();
  const time = wind.time;
  wind.update(1, { active: false });
  assert.deepEqual(wind.mesh.instanceMatrix.array, pausedMatrices);
  assert.equal(wind.time, time);
  wind.update(1, { reducedMotion: true });
  assert.equal(wind.mesh.visible, false);
  assert.deepEqual(wind.mesh.instanceMatrix.array, pausedMatrices);
  wind.update(0, { reducedMotion: false });
  assert.equal(wind.mesh.visible, true);
});

test('wind uses its own deterministic sequence and never leaves permanent ground marks', () => {
  const first = new WindLeaves(new THREE.Scene());
  const second = new WindLeaves(new THREE.Scene());
  for (let frame = 0; frame < 100; frame++) {
    first.update(0.25);
    second.update(0.25);
    assert.ok(first.leaves.every(leaf => leaf.y >= 0.25 && leaf.y <= 11));
  }
  assert.deepEqual(first.mesh.instanceMatrix.array, second.mesh.instanceMatrix.array);
  assert.equal(first.mesh.castShadow, false);
  assert.equal(first.mesh.receiveShadow, false);
});
