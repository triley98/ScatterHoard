import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeSquirrel } from '../src/scene.js';
import { poseSquirrel } from '../src/squirrel-motion.js';
import { makeLandscape, makeRock } from '../src/landscape.js';

const pose = { dt: 1 / 60, animate: true, moving: true, carrying: false, digging: false };

test('tree descent puts the head below the hips and all four paws against the bark', () => {
  const squirrel = makeSquirrel(0);
  squirrel.root.position.set(-22, 5, 1.15);
  poseSquirrel(squirrel, { ...pose, climb: 1, climbPitch: Math.PI / 2 });
  squirrel.root.updateMatrixWorld(true);
  const position = object => object.getWorldPosition(new THREE.Vector3());
  assert.ok(position(squirrel.head).y < position(squirrel.feet[0]).y);
  for (const paw of [...squirrel.feet, ...squirrel.forepaws]) {
    assert.ok(position(paw).z > 1.2 && position(paw).z < 1.45);
  }
  assert.ok(squirrel.forepaws.every(p => p.visible));
  assert.equal(squirrel.ring.visible, false);
  assert.equal(squirrel.marker.visible, false);
});

test('stationary squirrels stand upright on their hind legs', () => {
  const squirrel = makeSquirrel(1);
  poseSquirrel(squirrel, { ...pose, moving: false });
  assert.ok(squirrel.head.position.y > 1);
  assert.ok(squirrel.torso.scale.y > squirrel.torso.scale.z);
  assert.equal(squirrel.body.rotation.x, 0);
  assert.ok(squirrel.forepaws.every(p => !p.visible));
});

test('natural rocks use one continuous mesh with matching mirrored facets', () => {
  const left = makeRock({ x: 5, z: 2, width: 2, depth: 2 }, 0);
  const right = makeRock({ x: 33, z: 2, width: 2, depth: 2 }, 2);
  assert.equal(left.children.length, 1);
  assert.equal(left.children[0].geometry.type, 'BufferGeometry');
  assert.deepEqual(left.children[0].geometry.attributes.position.array,
    right.children[0].geometry.attributes.position.array);
  assert.equal(right.scale.x, -1);
  const box = new THREE.Box3().setFromObject(left);
  assert.ok(box.max.y > 1 && box.min.y < 0.05);
});

test('forest border contains only trees, bushes, mushrooms and a plain ground', () => {
  const border = makeLandscape(new THREE.Scene());
  const groups = border.children.filter(c => c.isGroup);
  assert.ok(groups.every(c => ['background-tree', 'bush', 'mushroom-cluster'].includes(c.name)));
  assert.ok(groups.filter(c => c.name === 'mushroom-cluster').length >= 10);
  assert.ok(groups.filter(c => c.name === 'bush').length >= 10);
});

test('experimental hopping bounds on four legs, then stands upright when stopped', () => {
  const squirrel = makeSquirrel(0);
  let peak = 0;
  for (let frame = 0; frame < 60; frame++) {
    poseSquirrel(squirrel, { ...pose, hopping: true, speed: 7 });
    peak = Math.max(peak, squirrel.body.position.y);
  }
  assert.ok(peak > 0.25);
  assert.ok(squirrel.head.position.y < 0.8);
  assert.ok(squirrel.forepaws.every(p => p.visible));
  const hopHeight = squirrel.body.position.y;
  poseSquirrel(squirrel, { ...pose, hopping: true, frozen: true });
  assert.equal(squirrel.body.position.y, hopHeight);
  for (let frame = 0; frame < 40; frame++)
    poseSquirrel(squirrel, { ...pose, hopping: true, moving: false });
  assert.ok(squirrel.head.position.y > 1.1);
  assert.ok(squirrel.body.position.y < 0.01);
  assert.ok(squirrel.forepaws.every(p => !p.visible));
});

test('hopping can be disabled without affecting climbing or movement authority', () => {
  const squirrel = makeSquirrel(0);
  const position = squirrel.root.position.clone();
  for (let frame = 0; frame < 30; frame++)
    poseSquirrel(squirrel, { ...pose, hopping: false });
  assert.ok(squirrel.head.position.y > 1);
  assert.deepEqual(squirrel.root.position, position);
  poseSquirrel(squirrel, { ...pose, hopping: false, climb: 1, climbPitch: Math.PI / 2 });
  assert.ok(squirrel.forepaws.every(p => p.visible));
  assert.equal(squirrel.body.rotation.x, Math.PI / 2);
});
