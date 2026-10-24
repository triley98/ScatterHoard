import * as THREE from 'three';
import { RULES } from './game.js';
import { makeTurfTexture } from './turf.js';
import { poseSquirrel } from './squirrel-motion.js';
import { roundLighting, WindLeaves } from './atmosphere.js';
import { makeLandscape, makeRock, makeStump } from './landscape.js';

const colors = {
  red: 0xb6653e,
  grey: 0x8e9f98,
  cream: 0xf0dcc0,
  grass: 0x7b9461,
};
const material = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...extra });
const geometries = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  lowSphere: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1, 7),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
};

function mesh(geometry, mat, position, scale, parent) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(...position);
  if (scale) object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeAcorn(scale = 1) {
  const group = new THREE.Group();
  const nut = mesh(
    geometries.sphere,
    material(0xdb9c51),
    [0, 0.18, 0],
    [0.22, 0.29, 0.22],
    group,
  );
  nut.rotation.z = -0.15;
  mesh(
    geometries.sphere,
    material(0x775233),
    [0, 0.38, 0],
    [0.25, 0.12, 0.25],
    group,
  );
  const stem = mesh(
    geometries.cylinder,
    material(0x705134),
    [0.025, 0.52, 0],
    [0.035, 0.17, 0.035],
    group,
  );
  stem.rotation.z = -0.3;
  const tip = mesh(
    geometries.cone,
    material(0xdb9c51),
    [0, -0.09, 0],
    [0.09, 0.14, 0.09],
    group,
  );
  tip.rotation.z = Math.PI;
  group.scale.setScalar(scale);
  return group;
}

export function makeSquirrel(id) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = material(id === 0 ? colors.red : colors.grey);
  const tailFur = material(id === 0 ? 0x994a2c : 0x768983);
  const lightFur = material(id === 0 ? 0xf1c99d : 0xd7dfcc);
  const innerEar = material(id === 0 ? 0xd58962 : 0xb6bfb0);
  const dark = material(0x202e25);
  const eyeShine = material(0xfff9e2);
  // Oversized curled tail, built around a smooth curve with a tapered bushy profile.
  const tail = new THREE.Group();
  const points = [
    new THREE.Vector3(0, 0.42, -0.22),
    new THREE.Vector3(0, 0.9, -0.75),
    new THREE.Vector3(0, 1.65, -0.85),
    new THREE.Vector3(0, 1.98, -0.55),
    new THREE.Vector3(0, 1.77, -0.28),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const tailMesh = mesh(
    new THREE.TubeGeometry(curve, 24, 0.29, 10, false),
    tailFur,
    [0, 0, 0],
    [1, 1, 1],
    tail,
  );
  tailMesh.geometry.computeVertexNormals();
  mesh(geometries.sphere, fur, [0, 1.7, -0.63], [0.37, 0.41, 0.34], tail);
  body.add(tail);
  const torso = mesh(geometries.sphere, fur, [0, 0.62, 0], [0.36, 0.49, 0.32], body);
  const belly = mesh(geometries.sphere, lightFur, [0, 0.59, 0.25], [0.23, 0.34, 0.13], body);
  const head = new THREE.Group();
  head.position.set(0, 1.15, 0.11);
  body.add(head);
  mesh(geometries.sphere, fur, [0, 0, 0], [0.37, 0.35, 0.31], head);
  mesh(
    geometries.sphere,
    lightFur,
    [-0.14, -0.12, 0.24],
    [0.17, 0.14, 0.13],
    head,
  );
  mesh(
    geometries.sphere,
    lightFur,
    [0.14, -0.12, 0.24],
    [0.17, 0.14, 0.13],
    head,
  );
  mesh(geometries.sphere, dark, [0, -0.045, 0.355], [0.082, 0.064, 0.06], head);
  for (const side of [-1, 1]) {
    const ear = mesh(
      geometries.sphere,
      fur,
      [side * 0.24, 0.33, -0.015],
      [0.115, 0.25, 0.1],
      head,
    );
    ear.rotation.z = -side * 0.15;
    const earInside = mesh(
      geometries.sphere,
      innerEar,
      [side * 0.24, 0.35, 0.066],
      [0.062, 0.15, 0.025],
      head,
    );
    earInside.rotation.z = -side * 0.15;
    mesh(
      geometries.sphere,
      dark,
      [side * 0.235, 0.035, 0.235],
      [0.066, 0.08, 0.044],
      head,
    );
    mesh(
      geometries.sphere,
      eyeShine,
      [side * 0.235 - 0.013, 0.065, 0.271],
      [0.019, 0.023, 0.015],
      head,
    );
  }
  const feet = [-1, 1].map((side) =>
    mesh(
      geometries.sphere,
      tailFur,
      [side * 0.22, 0.15, 0.16],
      [0.16, 0.13, 0.26],
      body,
    ),
  );
  const arms = [-1, 1].map((side) => {
    const arm = mesh(
      geometries.sphere,
      fur,
      [side * 0.32, 0.66, 0.24],
      [0.11, 0.24, 0.12],
      body,
    );
    arm.rotation.z = side * 0.35;
    return arm;
  });
  const forepaws = [-1, 1].map((side) => {
    const paw = mesh(geometries.sphere, tailFur,
      [side * 0.28, 0.15, 0.55], [0.12, 0.10, 0.19], body);
    paw.visible = false;
    return paw;
  });
  const held = makeAcorn(0.85);
  held.position.set(0, 0.58, 0.43);
  held.visible = false;
  body.add(held);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.53, 40),
    new THREE.MeshBasicMaterial({
      color: id === 0 ? 0xf1b07b : 0xe3edcb,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.055;
  root.add(ring);
  const marker = mesh(
    geometries.cone,
    material(id === 0 ? 0xf0af78 : 0xe0e7d5),
    [0, 2.55, 0],
    [0.12, 0.25, 0.12],
    root,
  );
  marker.rotation.z = Math.PI;
  return { root, body, torso, belly, tail, feet, arms, forepaws, held, head, marker, ring, rotation: 0, poseBlend: 0, motionTime: 0 };
}

export class ForestScene {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3c5443);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.23;
    this.camera = new THREE.OrthographicCamera(-23, 23, 10, -10, 0.1, 150);
    this.camera.position.set(0, 40, 40);
    this.camera.lookAt(0, 0, 0); // Exactly 45 degrees to the horizontal ground.
    this.ambient = new THREE.HemisphereLight(0xfff1d0, 0x52664a, 2.25);
    this.scene.add(this.ambient);
    const sun = new THREE.DirectionalLight(0xffe4ae, 3.2);
    this.sun = sun;
    this.daySun = new THREE.Color(0xffe4ae);
    this.duskSun = new THREE.Color(0xffb47a);
    sun.position.set(-14, 25, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -29,
      right: 29,
      top: 18,
      bottom: -18,
      near: 1,
      far: 70,
    });
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0002;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    this.acornMeshes = new Map();
    this.birds = [];
    this.particles = [];
    makeLandscape(this.scene);
    this.makeBoard();
    this.rockGroup = new THREE.Group();
    this.scene.add(this.rockGroup);
    this.rockLayout = '';
    this.makeEndTrees();
    this.makeBoardTexture();
    this.windLeaves = new WindLeaves(this.scene);
    this.squirrels = [makeSquirrel(0), makeSquirrel(1)];
    for (const squirrel of this.squirrels) this.scene.add(squirrel.root);
    this.demoAcorns = new THREE.Group();
    for (const [x, z] of [
      [-14, -1.5],
      [-4, 2],
      [5, -2.5],
      [14, 1.8],
    ]) {
      const acorn = this.createWorldAcorn();
      acorn.position.set(x, 0.35, z);
      this.demoAcorns.add(acorn);
    }
    this.scene.add(this.demoAcorns);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const { clientWidth: width, clientHeight: height } =
      this.canvas.parentElement;
    if (!width || !height) return;
    const aspect = width / height;
    const halfWidth = Math.max(29.5, 12.2 * aspect);
    const halfHeight = halfWidth / aspect;
    Object.assign(this.camera, {
      left: -halfWidth,
      right: halfWidth,
      top: halfHeight + 1.2,
      bottom: -halfHeight + 1.2,
    });
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  makeBoard() {
    mesh(
      new THREE.BoxGeometry(RULES.width + 0.3, 0.55, RULES.depth + 0.3),
      material(0x4c4d32),
      [0, -0.35, 0],
      null,
      this.scene,
    );
    mesh(
      new THREE.BoxGeometry(RULES.width + 0.15, 0.12, RULES.depth + 0.15),
      material(0x9a9861),
      [0, -0.04, 0],
      null,
      this.scene,
    );
    const turfMap = makeTurfTexture();
    turfMap.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const turf = mesh(
      new THREE.PlaneGeometry(RULES.width, RULES.depth),
      material(0xffffff, { map: turfMap }),
      [0, 0.03, 0],
      null,
      this.scene,
    );
    turf.rotation.x = -Math.PI / 2;
    mesh(
      new THREE.BoxGeometry(19.9, 0.035, 0.075),
      material(0xd5976a),
      [-10, 0.035, RULES.depth / 2 + 0.02],
      null,
      this.scene,
    );
    mesh(
      new THREE.BoxGeometry(19.9, 0.035, 0.075),
      material(0xb3c6a4),
      [10, 0.035, RULES.depth / 2 + 0.02],
      null,
      this.scene,
    );
    const postMat = material(0xc0a67b);
    for (const x of [-20.2, 0, 20.2]) {
      for (const z of [-RULES.depth / 2 - 0.2, RULES.depth / 2 + 0.2]) {
        mesh(
          geometries.cylinder,
          postMat,
          [x, -0.05, z],
          [0.065, 0.7, 0.065],
          this.scene,
        );
        mesh(
          geometries.sphere,
          material(0xdfc797),
          [x, 0.32, z],
          [0.09, 0.09, 0.09],
          this.scene,
        );
      }
    }
  }

  makeEndTrees() {
    const bark = material(0x67482f);
    const leaves = [material(0x456c42), material(0x5d7e46), material(0x77944f)];
    for (const side of [-1, 1]) {
      const tree = new THREE.Group();
      tree.position.set(side * (RULES.width / 2 + 2), 0, 0);
      tree.scale.setScalar(2);
      mesh(geometries.cylinder, bark, [0, 2.5, 0], [0.65, 5, 0.65], tree);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        const root = mesh(geometries.cone, bark,
          [Math.cos(angle) * 0.5, 0.22, Math.sin(angle) * 0.5], [0.35, 1.2, 0.35], tree);
        root.rotation.z = Math.cos(angle) * 0.6;
        root.rotation.x = Math.sin(angle) * 0.6;
      }
      for (const [x, y, z, size] of [[0, 5.8, 0, 2], [-1.1, 5, 0, 1.5], [1, 5.2, 0.2, 1.5], [0, 5.3, -1, 1.5]])
        mesh(geometries.lowSphere, leaves[Math.floor(y * 3) % 3], [x, y, z], [size, size * 0.8, size], tree);
      // Bark ridges give the climbing route a readable vertical surface.
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        mesh(geometries.cylinder, material(0x806043),
          [Math.sin(angle) * 0.64, 2.2, Math.cos(angle) * 0.64], [0.035, 4.3, 0.035], tree);
      }
      this.scene.add(tree);
    }
  }

  makeBoardTexture() {
    // Fixed decoration never responds to digging or reveals hidden acorns.
    const random = seededRandom(872);
    const leafGeometry = new THREE.SphereGeometry(1, 5, 3);
    const leafMaterials = [0xb99854, 0xa76c40, 0x998d4e].map((c) => material(c));
    const bladeGeometry = new THREE.ConeGeometry(1, 1, 3);
    for (let i = 0; i < 3; i++) {
      const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterials[i], 120);
      const transform = new THREE.Object3D();
      for (let j = 0; j < 120; j++) {
        transform.position.set((random() - 0.5) * 39, 0.07, (random() - 0.5) * (RULES.depth - 0.7));
        transform.scale.set(0.09 + random() * 0.09, 0.018, 0.18 + random() * 0.12);
        transform.rotation.y = random() * Math.PI * 2;
        transform.updateMatrix(); leaves.setMatrixAt(j, transform.matrix);
      }
      leaves.receiveShadow = true;
      this.scene.add(leaves);
    }
    const blades = new THREE.InstancedMesh(bladeGeometry, material(0x637c43), 600);
    const transform = new THREE.Object3D();
    for (let clump = 0; clump < 150; clump++) {
      const x = (random() - 0.5) * 39, z = (random() - 0.5) * (RULES.depth - 0.7);
      for (let blade = 0; blade < 4; blade++) {
        const height = 0.12 + random() * 0.14;
        transform.position.set(x + (random() - 0.5) * 0.25, height / 2 + 0.04, z + (random() - 0.5) * 0.25);
        transform.scale.set(0.045, height, 0.045);
        transform.rotation.set((random() - 0.5) * 0.6, random() * 6, (random() - 0.5) * 0.6);
        transform.updateMatrix(); blades.setMatrixAt(clump * 4 + blade, transform.matrix);
      }
    }
    this.scene.add(blades);
  }

  syncRocks() {
    const layout = JSON.stringify([this.game.rocks || [], this.game.stumps || []]);
    if (layout === this.rockLayout) return;
    this.rockLayout = layout;
    for (const child of [...this.rockGroup.children]) {
      this.rockGroup.remove(child);
      this.removeGroup(child);
    }
    (this.game.rocks || []).forEach((rock, index) => {
      this.rockGroup.add(makeRock(rock, index));
    });
    (this.game.stumps || []).forEach((stump, index) => {
      this.rockGroup.add(makeStump(stump, index));
    });
  }

  createWorldAcorn() {
    const group = new THREE.Group();
    const acorn = makeAcorn(1.25);
    acorn.position.y = 0.17;
    group.add(acorn);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.43, 0.48, 32),
      new THREE.MeshBasicMaterial({
        color: 0xf0d185,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    group.add(halo);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfce9a7,
      transparent: true,
      opacity: 0.75,
    });
    for (let i = 0; i < 3; i++) {
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.055),
        sparkMat,
      );
      spark.position.set(
        Math.sin(i * 2.1) * 0.4,
        0.8 + i * 0.2,
        Math.cos(i * 2.1) * 0.4,
      );
      group.add(spark);
    }
    return group;
  }

  reset() {
    for (const object of this.acornMeshes.values()) this.removeGroup(object);
    for (const bird of this.birds) this.removeGroup(bird.root);
    this.acornMeshes.clear();
    this.birds = [];
    for (const particle of this.particles) this.removeGroup(particle.mesh);
    this.particles = [];
  }

  removeGroup(object) {
    this.scene.remove(object);
    // Shared squirrel/landscape geometries stay alive; transient objects own their resources.
    object.traverse((child) => {
      if (child.isMesh) {
        if (!Object.values(geometries).includes(child.geometry))
          child.geometry.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of mats) mat.dispose();
      }
    });
  }

  onEvent(event) {
    // Digging never changes the surface or leaves a marker, including during a crow theft.
    if (this.reducedMotion) return;
    if (event.type !== 'powerup' || !event.kind.includes('crow')) return;
    const root = new THREE.Group();
    const feather = material(0x26312d);
    mesh(geometries.sphere, feather, [0, 0, 0], [0.35, 0.22, 0.65], root);
    mesh(geometries.sphere, feather, [0, 0.15, 0.5], [0.23, 0.23, 0.24], root);
    const beak = mesh(
      geometries.cone,
      material(0x766e4f),
      [0, 0.12, 0.8],
      [0.1, 0.3, 0.1],
      root,
    );
    beak.rotation.x = Math.PI / 2;
    const wings = [-1, 1].map((side) =>
      mesh(
        geometries.sphere,
        feather,
        [side * 0.7, 0, -0.05],
        [0.85, 0.055, 0.37],
        root,
      ),
    );
    const nut = makeAcorn(0.8);
    nut.position.set(0, -0.35, 0.55);
    nut.visible = event.stolen;
    root.add(nut);
    this.scene.add(root);
    this.birds.push({
      root,
      wings,
      age: 0,
      target: event.victim === 0 ? -10 : 10,
    });
  }

  render(time, dt) {
    const { game } = this;
    this.syncRocks();
    const active = game.phase === 'playing';
    const animate = !this.reducedMotion && !['paused', 'paused-countdown'].includes(game.phase);
    const light = roundLighting(game.elapsed);
    this.sun.position.set(...light.position);
    this.sun.intensity = light.sunIntensity;
    this.sun.color.copy(this.daySun).lerp(this.duskSun, light.dusk);
    this.ambient.intensity = light.ambientIntensity;
    this.windLeaves.update(dt, { active: animate, reducedMotion: this.reducedMotion });
    this.demoAcorns.visible = game.phase === 'ready';
    if (animate) {
      this.demoAcorns.children.forEach((acorn, i) => {
        acorn.children[0].position.y = 0.2 + Math.sin(time * 1.8 + i) * 0.055;
        acorn.children[0].rotation.y = time * 0.35 + i;
      });
    }
    for (const player of game.players) {
      const squirrel = this.squirrels[player.id];
      if (this.networked) {
        const blend = 1 - Math.exp(-dt * 25);
        squirrel.root.position.x +=
          (player.x - 20 - squirrel.root.position.x) * blend;
        squirrel.root.position.z +=
          (player.z - RULES.depth / 2 - squirrel.root.position.z) * blend;
        squirrel.root.position.y = 0.055;
      } else squirrel.root.position.set(player.x - 20, 0.055, player.z - RULES.depth / 2);
      const intro = game.phase === 'countdown' || game.phase === 'intermission' ||
        game.phase === 'paused-countdown' || (game.phase === 'paused' && ['countdown', 'intermission'].includes(game.resumePhase));
      let entering = false;
      let climb = 0;
      let climbPitch = 0;
      if (intro && !this.reducedMotion) {
        const remaining = game.phase === 'intermission' || game.resumePhase === 'intermission'
          ? game.intermissionRemaining : game.countdown ?? 3;
        const progress = THREE.MathUtils.clamp(1 - remaining / 3, 0, 1);
        const side = player.id === 0 ? -1 : 1;
        const treeX = side * (RULES.width / 2 + 2);
        const descend = Math.min(1, progress / 0.56);
        const run = Math.max(0, (progress - 0.56) / 0.44);
        // Keep all four paws on the front of the bark, then curl onto the ground.
        const turn = THREE.MathUtils.smoothstep(run, 0, 0.18);
        climb = 1 - turn;
        climbPitch = climb * Math.PI / 2;
        squirrel.root.position.set(THREE.MathUtils.lerp(treeX, player.x - RULES.width / 2, run),
          0.055 + (1 - descend) * 6.2 + climb * 1.2, 1.15 * (1 - run));
        entering = remaining <= 3;
        squirrel.rotation = (side < 0 ? Math.PI / 2 : -Math.PI / 2) * turn;
      }
      const diff = Math.atan2(
        Math.sin(player.facing - squirrel.rotation),
        Math.cos(player.facing - squirrel.rotation),
      );
      if (!entering) squirrel.rotation += diff * Math.min(1, dt * 14);
      const moving = entering || (active && Math.hypot(player.vx, player.vz) > 0.3);
      poseSquirrel(squirrel, {
        dt, animate, moving, climb, climbPitch,
        frozen: ['paused', 'paused-countdown'].includes(game.phase),
        carrying: player.carrying, digging: Boolean(player.dig),
        speed: Math.hypot(player.vx, player.vz),
      });
    }
    const liveIds = new Set(game.acorns.map((a) => a.id));
    for (const [id, object] of this.acornMeshes) {
      if (!liveIds.has(id)) {
        this.removeGroup(object);
        this.acornMeshes.delete(id);
      }
    }
    for (const acorn of game.acorns) {
      let object = this.acornMeshes.get(acorn.id);
      if (!object) {
        object = this.createWorldAcorn();
        object.position.set(acorn.x - 20, 0.05, acorn.z - RULES.depth / 2);
        this.acornMeshes.set(acorn.id, object);
        this.scene.add(object);
      }
      const age = game.matchElapsed - acorn.born;
      object.children[0].position.y =
        0.17 +
        (animate ? Math.sin(time * 2 + acorn.id) * 0.06 : 0) +
        (!this.reducedMotion ? Math.max(0, 1 - age / 0.7) ** 2 * 5 : 0);
      if (animate) object.children[0].rotation.y = time * 0.55;
    }
    if (game.phase !== 'paused') {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        p.vy -= 7 * dt;
        p.mesh.position.add(new THREE.Vector3(p.vx * dt, p.vy * dt, p.vz * dt));
        p.mesh.scale.setScalar(Math.max(0, p.life / 0.6));
        if (p.life <= 0) {
          this.removeGroup(p.mesh);
          this.particles.splice(i, 1);
        }
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const bird = this.birds[i];
      if (animate) bird.age += dt;
      const t = bird.age / 3;
      // A decorative swoop over the patch; its path does not disclose the stolen cell.
      bird.root.position.set(
        bird.target + Math.sin(t * Math.PI * 2) * 5,
        1.4 + Math.abs(t - 0.5) * 13,
        -10 + t * 22,
      );
      bird.wings.forEach((wing, side) => {
        wing.rotation.z = (side ? -1 : 1) * Math.sin(time * 17) * 0.55;
      });
      if (t >= 1) {
        this.removeGroup(bird.root);
        this.birds.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  projectPlayer(id) {
    const position = this.squirrels[id].root.position.clone();
    position.y += 2.85;
    position.project(this.camera);
    return {
      x: Math.max(
        28,
        Math.min(
          this.canvas.clientWidth - 28,
          ((position.x + 1) * this.canvas.clientWidth) / 2,
        ),
      ),
      y: Math.max(
        52,
        Math.min(
          this.canvas.clientHeight - 15,
          ((1 - position.y) * this.canvas.clientHeight) / 2,
        ),
      ),
    };
  }
}
