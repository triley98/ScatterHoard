import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RULES } from '../src/game.js';
import { makeLandscape, makeRock, makeStump } from '../src/landscape.js';

test('five large rear trees sit beyond the board and small foreground trees leave its front clear', () => {
  const border = makeLandscape(new THREE.Scene());
  const large = border.children.filter(c => c.userData.largeRearTree);
  const small = border.children.filter(c => c.userData.smallFrontTree);
  assert.equal(large.length, 5);
  assert.ok(large.every(c => c.position.z < -RULES.depth / 2));
  assert.equal(small.length, 13);
  for (const tree of small) {
    const box = new THREE.Box3().setFromObject(tree);
    assert.ok(box.min.z > RULES.depth / 2);
    assert.ok(box.max.y < 2.5);
  }
});

test('three-cell rocks grow in height along with their footprint', () => {
  const rock = makeRock({ x: 3, z: 2, width: 3, depth: 3 });
  const size = new THREE.Box3().setFromObject(rock).getSize(new THREE.Vector3());
  assert.ok(size.x > 2.7 && size.x <= 3);
  assert.ok(size.z > 2.6 && size.z <= 3);
  assert.ok(size.y > 1.7 && size.y < 2);
});

test('stumps have exposed cut wood, growth rings, and matching mirrored footprints', () => {
  const left = makeStump({ x: 3, z: 2, width: 2, depth: 2 }, 0);
  const right = makeStump({ x: 35, z: 2, width: 2, depth: 2 }, 2);
  assert.equal(left.name, 'tree-stump');
  assert.equal(left.children.filter(c => c.name === 'growth-ring').length, 5);
  assert.ok(left.children.some(c => c.name === 'cut-wood'));
  assert.equal(right.scale.x, -1);
  const leftSize = new THREE.Box3().setFromObject(left).getSize(new THREE.Vector3());
  const rightSize = new THREE.Box3().setFromObject(right).getSize(new THREE.Vector3());
  assert.ok(leftSize.distanceTo(rightSize) < 1e-6);
  assert.ok(leftSize.x <= 2.05 && leftSize.z <= 2.05);
  assert.ok(leftSize.y > 0.9 && leftSize.y < 1.2);
});
