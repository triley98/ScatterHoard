import * as THREE from 'three';
import { RULES } from './game.js';

const material = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.96, ...extra });

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function mesh(geometry, mat, position, scale, parent) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(...position);
  if (scale) object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function makeOuterForest(landscape, { cone, trunk, bark }) {
  // A separate seed preserves every existing tree, bush, and mushroom placement.
  const random = seededRandom(78134);
  const protectedBorder = (x, z) => Math.abs(x) < 29 && z > -18 && z < 17;
  const trees = [];
  for (let z = -56; z <= 56; z += 3.4) {
    for (let x = -56; x <= 56; x += 3.4) {
      const px = x + (random() - 0.5) * 1.5;
      const pz = z + (random() - 0.5) * 1.5;
      if (protectedBorder(px, pz)) continue;
      trees.push({ x: px, z: pz, height: 2 + random() * 4, rotation: random() * Math.PI * 2 });
    }
  }
  const treeGroup = new THREE.Group();
  treeGroup.name = 'background-tree';
  treeGroup.userData.outerForest = true;
  landscape.add(treeGroup);
  const trunks = new THREE.InstancedMesh(trunk, bark, trees.length);
  trunks.name = 'outer-tree-trunks';
  const canopyMaterial = material(0xffffff);
  const crowns = Array.from({ length: 3 }, () =>
    new THREE.InstancedMesh(cone, canopyMaterial, trees.length));
  const transform = new THREE.Object3D();
  const treeColors = [0x304f38, 0x365b3c, 0x426640, 0x4d6d43].map(c => new THREE.Color(c));
  trees.forEach(({ x, z, height, rotation }, i) => {
    const radius = 0.13 * Math.max(1, height / 4);
    transform.position.set(x, -0.8 + height * 0.28, z);
    transform.rotation.set(0, rotation, 0);
    transform.scale.set(radius, height * 0.56, radius);
    transform.updateMatrix();
    trunks.setMatrixAt(i, transform.matrix);
    crowns.forEach((crown, layer) => {
      const size = height * (0.36 - layer * 0.072);
      transform.position.set(x, -0.8 + height * (0.47 + layer * 0.19), z);
      transform.rotation.y = rotation + layer * 0.6;
      transform.scale.set(size, height * 0.5, size);
      transform.updateMatrix();
      crown.setMatrixAt(i, transform.matrix);
      crown.setColorAt(i, treeColors[Math.floor(random() * treeColors.length)]);
    });
  });
  for (const part of [trunks, ...crowns]) {
    // Distant foliage follows daylight without extra shadow-map passes.
    part.castShadow = false;
    part.receiveShadow = false;
    part.instanceMatrix.needsUpdate = true;
    if (part.instanceColor) part.instanceColor.needsUpdate = true;
    part.computeBoundingBox();
    part.computeBoundingSphere();
    treeGroup.add(part);
  }

  const bushes = [];
  for (let z = -55; z <= 55; z += 4.3) {
    for (let x = -55; x <= 55; x += 4.3) {
      const px = x + (random() - 0.5) * 2;
      const pz = z + (random() - 0.5) * 2;
      if (protectedBorder(px, pz)) continue;
      bushes.push({ x: px, z: pz, size: 0.65 + random() * 0.9 });
    }
  }
  const bushGroup = new THREE.Group();
  bushGroup.name = 'bush';
  bushGroup.userData.outerForest = true;
  landscape.add(bushGroup);
  const distantFoliage = new THREE.IcosahedronGeometry(1, 0);
  const bushMesh = new THREE.InstancedMesh(distantFoliage, material(0xffffff), bushes.length * 3);
  bushMesh.name = 'outer-bush-foliage';
  const bushColors = [0x4a6a40, 0x587547, 0x6a844e].map(c => new THREE.Color(c));
  bushes.forEach(({ x, z, size }, i) => {
    for (let lobe = 0; lobe < 3; lobe++) {
      const scale = size * (lobe === 0 ? 1 : 0.72);
      transform.position.set(x + (lobe - 1) * size * 0.5,
        -0.8 + size * (lobe === 0 ? 0.5 : 0.36), z + (lobe % 2) * size * 0.2);
      transform.rotation.set(0, random() * Math.PI * 2, 0);
      transform.scale.set(scale, scale * 0.72, scale * 0.82);
      transform.updateMatrix();
      bushMesh.setMatrixAt(i * 3 + lobe, transform.matrix);
      bushMesh.setColorAt(i * 3 + lobe, bushColors[Math.floor(random() * bushColors.length)]);
    }
  });
  // The distant understory receives the moving sun without adding shadow draws.
  bushMesh.receiveShadow = false;
  bushMesh.instanceMatrix.needsUpdate = true;
  bushMesh.instanceColor.needsUpdate = true;
  bushMesh.computeBoundingBox();
  bushMesh.computeBoundingSphere();
  bushGroup.add(bushMesh);
}

/** A quiet forest border: only trees, mushroom clusters, and leafy bushes. */
export function makeLandscape(scene) {
  const random = seededRandom(23);
  const landscape = new THREE.Group();
  landscape.name = 'forest-border';
  scene.add(landscape);
  const ground = mesh(new THREE.PlaneGeometry(200, 200), material(0x3c5443),
    [0, -0.8, 0], null, landscape);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;

  const cone = new THREE.ConeGeometry(1, 1, 7);
  const trunk = new THREE.CylinderGeometry(1, 1, 1, 8);
  const foliage = new THREE.IcosahedronGeometry(1, 1);
  const bark = material(0x5b4931);
  const treeLeaves = [0x304f38, 0x365b3c, 0x426640, 0x4d6d43].map(c => material(c));
  const trees = [];
  for (let i = 0; i < 24; i++) {
    trees.push([-28 + i * 2.4, -RULES.depth / 2 - 3 - random() * 2.2, 2.7 + random() * 2]);
    if (i % 2 === 0) trees.push([-28 + i * 2.4, -15, 3.7 + random() * 2.5]);
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++)
      trees.push([side * (25.8 + random() * 2), -8 + i * 3.2, 2.4 + random() * 1.5]);
  // The five tall trees sit just beyond the back edge, behind the playable clearing.
  for (const [i, x] of [-17, -8.5, 0, 8.5, 17].entries())
    trees.push([x, -RULES.depth / 2 - 1.8 - (i % 2) * 0.35, 12 + (i % 3) * 0.6, 'large-rear']);
  // Low foreground trees are far enough from the front edge to leave the board in view.
  for (const [i, x] of [-24, -20, -16, -12, -8, -4, 0, 4, 8, 12, 16, 20, 24].entries())
    trees.push([x + (random() - 0.5) * 1.1, RULES.depth / 2 + 4.2 + (i % 3) * 1.1,
      1.8 + random() * 0.7, 'small-front']);
  for (const [x, z, h, kind] of trees) {
    const tree = new THREE.Group();
    tree.name = 'background-tree';
    tree.userData.largeRearTree = kind === 'large-rear';
    tree.userData.smallFrontTree = kind === 'small-front';
    tree.position.set(x, -0.8, z);
    const trunkRadius = 0.13 * Math.max(1, h / 4);
    const tallRear = kind === 'large-rear';
    const trunkHeight = h * (tallRear ? 0.78 : 0.56);
    mesh(trunk, bark, [0, trunkHeight / 2, 0], [trunkRadius, trunkHeight, trunkRadius], tree);
    for (let layer = 0; layer < 3; layer++) {
      const size = h * (tallRear ? 0.26 - layer * 0.052 : 0.36 - layer * 0.072);
      const crown = mesh(cone, treeLeaves[(layer + Math.floor(random() * 2)) % 4],
        [0, h * ((tallRear ? 0.62 : 0.47) + layer * 0.19), 0], [size, h * 0.5, size], tree);
      crown.rotation.y = layer * 0.6;
    }
    landscape.add(tree);
  }

  const bushLeaves = [0x537345, 0x65814b, 0x739054].map(c => material(c));
  for (const [x, z, size] of [
    [-19, 10.1, 1.1], [-12, 10.3, 0.9], [-4.5, 11, 1.05],
    [4, 10.7, 0.95], [13, 10.2, 1.15], [21.5, 10.3, 0.9],
    [-24, -6.7, 0.9], [24.5, -6.7, 1], [-20, -10.2, 0.95],
    [-8, -10.3, 0.9], [7, -10.4, 1], [19, -10.2, 1.15],
  ]) {
    const bush = new THREE.Group();
    bush.name = 'bush';
    bush.position.set(x, -0.8, z);
    for (const [dx, dy, dz, scale] of [[0, 0.5, 0, 1], [-0.65, 0.34, 0.05, 0.7], [0.58, 0.37, 0.08, 0.75], [0.12, 0.32, -0.5, 0.7]]) {
      const leaves = mesh(foliage, bushLeaves[Math.floor(random() * bushLeaves.length)],
        [dx * size, dy * size, dz * size],
        [size * scale, size * scale * 0.72, size * scale * 0.82], bush);
      leaves.rotation.y = random() * Math.PI;
    }
    landscape.add(bush);
  }

  const stemGeometry = new THREE.CylinderGeometry(0.7, 1, 1, 7);
  const capGeometry = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const stemMaterial = material(0xdfcfaa);
  const caps = [0xb76e42, 0xc18652, 0xa95d3d].map(c => material(c, { side: THREE.DoubleSide }));
  const spotGeometry = new THREE.SphereGeometry(1, 5, 3);
  const spotMaterial = material(0xe4d6ad);
  for (const [x, z] of [
    [-21.4, 8.9], [-15.5, 9.2], [-6.3, 9.4], [2.3, 9.4],
    [10.5, 9.1], [20.4, 9.4], [-23.2, 4.5], [23.7, 5.3],
    [-22.8, -4.8], [23.7, -4.8], [-13, -9.1], [13.5, -9.1],
  ]) {
    const cluster = new THREE.Group();
    cluster.name = 'mushroom-cluster';
    cluster.position.set(x, -0.8, z);
    for (let i = 0; i < 3; i++) {
      const mushroom = new THREE.Group();
      const size = i === 0 ? 1 : 0.5 + random() * 0.3;
      const height = (0.45 + random() * 0.18) * size;
      const radius = 0.36 * size;
      mushroom.position.set((i - 1) * 0.48, 0, (random() - 0.5) * 0.45);
      mesh(stemGeometry, stemMaterial, [0, height / 2, 0], [0.075 * size, height, 0.075 * size], mushroom);
      mesh(capGeometry, caps[Math.floor(random() * caps.length)], [0, height, 0], [radius, radius * 0.55, radius], mushroom);
      for (let spot = 0; spot < 3; spot++) {
        const angle = spot * Math.PI * 2 / 3 + 0.3;
        mesh(spotGeometry, spotMaterial,
          [Math.cos(angle) * radius * 0.47, height + radius * 0.47, Math.sin(angle) * radius * 0.47],
          [0.05 * size, 0.018 * size, 0.04 * size], mushroom);
      }
      cluster.add(mushroom);
    }
    landscape.add(cluster);
  }
  makeOuterForest(landscape, { cone, trunk, bark });
  return landscape;
}

/** One continuous, irregular stone embedded slightly in the turf; no pedestal. */
export function makeRock(rock, index = 0) {
  // The paired obstacle uses the same facets, reflected along with its placement.
  const random = seededRandom(481 + index % 2 * 97);
  const sides = 10;
  const heightScale = Math.sqrt(rock.width * rock.depth) / 2;
  const vertices = [];
  for (let ring = 0; ring < 3; ring++) {
    for (let i = 0; i < sides; i++) {
      const angle = i * Math.PI * 2 / sides;
      const squircle = value => Math.sign(value) * Math.sqrt(Math.abs(value));
      const radius = (ring === 0 ? 0.94 : ring === 1 ? 0.96 : 0.63) * (0.93 + random() * 0.07);
      const x = squircle(Math.cos(angle)) * radius + (ring === 2 ? 0.08 : 0);
      const z = squircle(Math.sin(angle)) * radius;
      const y = ring === 0 ? -0.08 : ring === 1 ? 0.3 + random() * 0.15 : 0.85 + random() * 0.23;
      vertices.push([x * rock.width / 2, y * heightScale, z * rock.depth / 2]);
    }
  }
  vertices.push([0.06, 1.18 * heightScale, -0.04]);
  const positions = [], colors = [];
  function triangle(a, b, c) {
    const shade = 0.83 + random() * 0.2;
    const color = new THREE.Color(0x839084).multiplyScalar(shade);
    for (const point of [a, b, c]) {
      positions.push(...vertices[point]);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let ring = 0; ring < 2; ring++)
    for (let i = 0; i < sides; i++) {
      const a = ring * sides + i, b = ring * sides + (i + 1) % sides;
      const c = (ring + 1) * sides + i, d = (ring + 1) * sides + (i + 1) % sides;
      triangle(a, c, b);
      triangle(b, c, d);
    }
  for (let i = 0; i < sides; i++) triangle(20 + i, 30, 20 + (i + 1) % sides);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const group = new THREE.Group();
  group.name = 'natural-boulder';
  group.position.set(rock.x + rock.width / 2 - RULES.width / 2, 0.035,
    rock.z + rock.depth / 2 - RULES.depth / 2);
  if (index >= 2) group.scale.x = -1;
  mesh(geometry, material(0xffffff, { vertexColors: true, flatShading: true }), [0, 0, 0], null, group);
  return group;
}


/** A cut, rooted trunk with bark ridges and visible end-grain growth rings. */
export function makeStump(stump, index = 0) {
  const group = new THREE.Group();
  group.name = 'tree-stump';
  group.position.set(stump.x + stump.width / 2 - RULES.width / 2, 0.035,
    stump.z + stump.depth / 2 - RULES.depth / 2);
  group.scale.set(stump.width / 2 * (index >= 2 ? -1 : 1), 1, stump.depth / 2);
  const bark = material(index % 2 ? 0x765037 : 0x69492f);
  const darkBark = material(0x503b2a);
  const cutWood = material(0xd2ae72);
  const grain = material(0x9d753f);
  const trunkGeometry = new THREE.CylinderGeometry(0.82, 0.94, 0.96, 14, 1);
  const position = trunkGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    const variation = 1 + Math.sin(angle * 5 + index % 2) * 0.025;
    position.setX(i, position.getX(i) * variation);
    position.setZ(i, position.getZ(i) * variation);
  }
  trunkGeometry.computeVertexNormals();
  mesh(trunkGeometry, bark, [0, 0.48, 0], null, group);
  for (let i = 0; i < 14; i++) {
    const angle = i * Math.PI * 2 / 14;
    const start = new THREE.Vector3(Math.cos(angle) * 0.94, 0.06, Math.sin(angle) * 0.94);
    const end = new THREE.Vector3(Math.cos(angle) * 0.82, 0.92, Math.sin(angle) * 0.82);
    const direction = end.clone().sub(start);
    const ridge = mesh(new THREE.CylinderGeometry(0.018, 0.03, direction.length(), 4),
      darkBark, start.clone().add(end).multiplyScalar(0.5).toArray(), null, group);
    ridge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5 + 0.2;
    const root = mesh(new THREE.ConeGeometry(0.18, 0.58, 5), bark,
      [Math.cos(angle) * 0.70, 0.15, Math.sin(angle) * 0.70], null, group);
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(Math.cos(angle), 0.5, Math.sin(angle)).normalize());
  }
  const top = mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.035, 28), cutWood,
    [0, 0.969, 0], null, group);
  top.name = 'cut-wood';
  for (let i = 1; i <= 5; i++) {
    const ring = mesh(new THREE.TorusGeometry(i * 0.123, 0.009, 4, 36), grain,
      [0.018, 0.99, -0.018], null, group);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.x = 0.95;
    ring.name = 'growth-ring';
  }
  // Short radial checks make the cut face read as wood even at board scale.
  for (const [angle, length] of [[0.5, 0.28], [2.6, 0.21], [4.5, 0.18]]) {
    const crack = mesh(new THREE.BoxGeometry(length, 0.008, 0.013), grain,
      [Math.cos(angle) * (0.76 - length / 2), 0.991,
        Math.sin(angle) * (0.76 - length / 2)], null, group);
    crack.rotation.y = -angle;
  }
  return group;
}
