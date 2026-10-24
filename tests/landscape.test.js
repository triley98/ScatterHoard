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
  for (const tree of large) {
    tree.updateMatrixWorld(true);
    const crowns = tree.children.filter(child => child.geometry?.type === 'ConeGeometry');
    assert.ok(crowns.length >= 3);
    for (const crown of crowns)
      assert.ok(new THREE.Box3().setFromObject(crown).min.y >= 3.5, 'rear branches clear a standing squirrel');
    assert.ok(new THREE.Box3().setFromObject(tree).max.y >= 14);
  }
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

test('outer forest fills distant side, front, rear, and corner spaces using instancing', () => {
  const border = makeLandscape(new THREE.Scene());
  const outer = border.children.filter(c => c.userData.outerForest);
  assert.deepEqual(outer.map(c => c.name).sort(), ['background-tree', 'bush']);
  const trunks = outer.flatMap(c => c.children).find(c => c.name === 'outer-tree-trunks');
  const bushes = outer.flatMap(c => c.children).find(c => c.name === 'outer-bush-foliage');
  assert.ok(trunks.isInstancedMesh && bushes.isInstancedMesh);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const trees = [];
  for (let i = 0; i < trunks.count; i++) {
    trunks.getMatrixAt(i, matrix);
    matrix.decompose(position, rotation, scale);
    assert.ok(!(Math.abs(position.x) < 29 && position.z > -18 && position.z < 17));
    trees.push({ x: position.x, z: position.z, height: scale.y / 0.56 });
  }
  assert.ok(trees.some(t => t.height < 2.2));
  assert.ok(trees.some(t => t.height > 5.8));
  // All distant tiles visible at narrow/tall or wide aspect ratios have forest.
  for (let x = -50; x <= 50; x += 10) {
    for (let z = -50; z <= 50; z += 10) {
      if (Math.abs(x) < 30 && z > -20 && z < 20) continue;
      assert.ok(trees.some(t => Math.abs(t.x - x) <= 5 && Math.abs(t.z - z) <= 5), `blank tile ${x},${z}`);
    }
  }
  const bushBox = new THREE.Box3().setFromObject(bushes);
  assert.ok(bushBox.min.x < -50 && bushBox.max.x > 50);
  assert.ok(bushBox.min.z < -50 && bushBox.max.z > 50);
  assert.ok(outer.reduce((n, group) => n + group.children.length, 0) <= 5);
});
