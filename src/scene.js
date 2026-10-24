import * as THREE from 'three';
import { RULES, cellAt, cellKey } from './game.js';

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

function makeSquirrel(id) {
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
  mesh(geometries.sphere, fur, [0, 0.62, 0], [0.36, 0.49, 0.32], body);
  mesh(geometries.sphere, lightFur, [0, 0.59, 0.25], [0.23, 0.34, 0.13], body);
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
  return { root, body, tail, feet, arms, held, head, marker, rotation: 0 };
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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.23;
    this.camera = new THREE.OrthographicCamera(-23, 23, 10, -10, 0.1, 150);
    this.camera.position.set(0, 40, 40);
    this.camera.lookAt(0, 0, 0); // Exactly 45 degrees to the horizontal ground.
    this.scene.add(new THREE.HemisphereLight(0xfff1d0, 0x52664a, 2.25));
    const sun = new THREE.DirectionalLight(0xffe4ae, 3.2);
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
    this.buriedMeshes = new Map();
    this.particles = [];
    this.makeLandscape();
    this.makeBoard();
    this.squirrels = [makeSquirrel(0), makeSquirrel(1)];
    for (const squirrel of this.squirrels) this.scene.add(squirrel.root);
    this.selectors = [0, 1].map((id) => {
      const group = new THREE.Group();
      const color = id === 0 ? 0xf5bf87 : 0xe2efcd;
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.91, 0.91)),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
        }),
      );
      outline.rotation.x = -Math.PI / 2;
      group.add(outline);
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(0.91, 0.91),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = -0.003;
      group.add(fill);
      group.position.y = 0.065;
      group.visible = false;
      this.scene.add(group);
      return group;
    });
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
    const halfWidth = 23.3;
    const halfHeight = halfWidth / aspect;
    Object.assign(this.camera, {
      left: -halfWidth,
      right: halfWidth,
      top: halfHeight,
      bottom: -halfHeight,
    });
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  makeLandscape() {
    const random = seededRandom(23);
    const ground = mesh(
      new THREE.PlaneGeometry(200, 200),
      material(0x3c5443),
      [0, -0.8, 0],
      null,
      this.scene,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    const grassMats = [0x485f43, 0x4c6445, 0x526c49, 0x425b40].map((c) =>
      material(c),
    );
    const stoneMats = [0x7c8972, 0x6e7d68, 0x8c927b].map((c) => material(c));
    const leafMats = [0x304f38, 0x365b3c, 0x426640, 0x4d6d43].map((c) =>
      material(c),
    );
    const trunkMat = material(0x5b4931);
    // Small low-poly vegetation frames the clearing without obscuring its 400 cells.
    for (let i = 0; i < 80; i++) {
      const x = (random() - 0.5) * 54;
      const z = (random() - 0.5) * 28;
      if (Math.abs(x) < 21.3 && Math.abs(z) < 6.6) continue;
      const size = 0.4 + random() * 1.3;
      const patch = mesh(
        geometries.lowSphere,
        grassMats[i % grassMats.length],
        [x, -0.74, z],
        [size * 1.8, 0.18, size],
        this.scene,
      );
      patch.castShadow = false;
      if (i % 3 === 0) {
        const stone = mesh(
          geometries.lowSphere,
          stoneMats[i % 3],
          [x, -0.45, z],
          [0.35 + random() * 0.5, 0.3 + random() * 0.3, 0.35 + random() * 0.3],
          this.scene,
        );
        stone.rotation.y = random() * Math.PI;
      } else {
        for (let j = 0; j < 3; j++) {
          const tuft = mesh(
            geometries.cone,
            grassMats[(i + 1) % 4],
            [x + (random() - 0.5) * size, -0.48, z + (random() - 0.5) * size],
            [0.06, 0.45 + random() * 0.3, 0.06],
            this.scene,
          );
          tuft.rotation.z = (random() - 0.5) * 0.8;
        }
      }
    }
    const trees = [
      [-23, -5, 4.4],
      [-20, -9, 4.5],
      [-17, -10.5, 3.5],
      [-12, -11.5, 4],
      [-5, -12, 3.5],
      [3, -12, 4.4],
      [12, -11, 3.8],
      [18, -9.7, 4.5],
      [23, -7, 5],
      [25, 0, 3.7],
      [-25, 1, 3.8],
      [-24, 8, 4],
      [24, 9, 4.7],
      [-15, 12, 3.6],
      [17, 13, 3.6],
    ];
    for (const [x, z, h] of trees) {
      const tree = new THREE.Group();
      tree.position.set(x, -0.8, z);
      mesh(
        geometries.cylinder,
        trunkMat,
        [0, h * 0.28, 0],
        [0.13, h * 0.56, 0.13],
        tree,
      );
      for (let layer = 0; layer < 3; layer++) {
        const size = h * (0.36 - layer * 0.072);
        const crown = mesh(
          geometries.cone,
          leafMats[(layer + Math.floor(random() * 2)) % 4],
          [0, h * (0.47 + layer * 0.19), 0],
          [size, h * 0.5, size],
          tree,
        );
        crown.rotation.y = layer * 0.6;
      }
      this.scene.add(tree);
    }
    // Log and mushrooms add a little woodland life around the board.
    const log = mesh(
      geometries.cylinder,
      material(0x6f5437),
      [-20.8, -0.15, 7.2],
      [0.43, 2.8, 0.43],
      this.scene,
    );
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.18;
    const end = mesh(
      geometries.cylinder,
      material(0xba9c6d),
      [-22.19, -0.15, 7.45],
      [0.36, 0.025, 0.36],
      this.scene,
    );
    end.rotation.z = Math.PI / 2;
    for (const [x, z] of [
      [-21, 5.7],
      [22, 4],
      [20.8, 7],
      [-22, -3],
    ]) {
      mesh(
        geometries.cylinder,
        material(0xd2c2a0),
        [x, -0.42, z],
        [0.08, 0.6, 0.08],
        this.scene,
      );
      mesh(
        geometries.sphere,
        material(0xb56d40),
        [x, -0.1, z],
        [0.35, 0.15, 0.35],
        this.scene,
      );
    }
  }

  makeBoard() {
    mesh(
      new THREE.BoxGeometry(40.3, 0.55, 10.3),
      material(0x4c4d32),
      [0, -0.35, 0],
      null,
      this.scene,
    );
    mesh(
      new THREE.BoxGeometry(40.15, 0.12, 10.15),
      material(0x9a9861),
      [0, -0.04, 0],
      null,
      this.scene,
    );
    const random = seededRandom(14);
    const tileGeometry = new THREE.PlaneGeometry(0.994, 0.994);
    tileGeometry.rotateX(-Math.PI / 2);
    const tiles = new THREE.InstancedMesh(
      tileGeometry,
      material(0xffffff),
      RULES.width * RULES.depth,
    );
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let col = 0; col < RULES.width; col++) {
      for (let row = 0; row < RULES.depth; row++) {
        const index = col * RULES.depth + row;
        dummy.position.set(col - 19.5, 0.025, row - 4.5);
        dummy.updateMatrix();
        tiles.setMatrixAt(index, dummy.matrix);
        color.set(col < 20 ? 0x84955f : 0x7a9464);
        color.multiplyScalar(
          0.94 + ((col + row) % 2) * 0.045 + random() * 0.035,
        );
        tiles.setColorAt(index, color);
      }
    }
    tiles.receiveShadow = true;
    this.scene.add(tiles);
    const vertices = [];
    for (let x = -20; x <= 20; x++) vertices.push(x, 0.035, -5, x, 0.035, 5);
    for (let z = -5; z <= 5; z++) vertices.push(-20, 0.035, z, 20, 0.035, z);
    const lines = new THREE.BufferGeometry();
    lines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    this.scene.add(
      new THREE.LineSegments(
        lines,
        new THREE.LineBasicMaterial({
          color: 0x415b34,
          transparent: true,
          opacity: 0.22,
        }),
      ),
    );
    for (let z = -4.8; z < 5; z += 0.7) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 0.35),
        new THREE.MeshBasicMaterial({
          color: 0xe3dfb3,
          transparent: true,
          opacity: 0.7,
        }),
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.045, z);
      this.scene.add(dash);
    }
    mesh(
      new THREE.BoxGeometry(19.9, 0.035, 0.075),
      material(0xd5976a),
      [-10, 0.035, 5.02],
      null,
      this.scene,
    );
    mesh(
      new THREE.BoxGeometry(19.9, 0.035, 0.075),
      material(0xb3c6a4),
      [10, 0.035, 5.02],
      null,
      this.scene,
    );
    const postMat = material(0xc0a67b);
    for (const x of [-20.2, 0, 20.2]) {
      for (const z of [-5.2, 5.2]) {
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
    for (const object of this.buriedMeshes.values()) this.removeGroup(object);
    this.acornMeshes.clear();
    this.buriedMeshes.clear();
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
    if (event.type !== 'bury') return;
    const { col, row, territory } = event;
    const group = new THREE.Group();
    group.position.set(col - 19.5, 0.06, row - 4.5);
    mesh(
      geometries.sphere,
      material(0x5a4730),
      [0, -0.018, 0],
      [0.35, 0.065, 0.29],
      group,
    );
    mesh(
      geometries.sphere,
      material(0x9c7850),
      [0, 0.016, 0],
      [0.27, 0.07, 0.22],
      group,
    );
    const stem = mesh(
      geometries.cylinder,
      material(0xd3c39a),
      [0, 0.12, 0],
      [0.025, 0.24, 0.025],
      group,
    );
    stem.rotation.z = -0.1;
    for (const side of [-1, 1]) {
      const leaf = mesh(
        geometries.sphere,
        material(territory === 0 ? 0xe5b079 : 0xd7e3b7),
        [side * 0.09, 0.23, 0],
        [0.13, 0.035, 0.065],
        group,
      );
      leaf.rotation.z = side * 0.35;
    }
    const outline = new THREE.Mesh(
      new THREE.PlaneGeometry(0.88, 0.88),
      new THREE.MeshBasicMaterial({
        color: territory === 0 ? 0xeab283 : 0xe0e9bc,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = -0.005;
    group.add(outline);
    this.scene.add(group);
    this.buriedMeshes.set(`${col},${row}`, group);
    if (this.reducedMotion) return;
    for (let i = 0; i < 9; i++) {
      const piece = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.05 + Math.random() * 0.05),
        material(0xb89a65),
      );
      piece.position.copy(group.position);
      piece.position.y += 0.15;
      this.scene.add(piece);
      this.particles.push({
        mesh: piece,
        vx: (Math.random() - 0.5) * 2,
        vy: 1 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 2,
        life: 0.6,
      });
    }
  }

  render(time, dt) {
    const { game } = this;
    const active = game.phase === 'playing';
    const animate = !this.reducedMotion && game.phase !== 'paused';
    this.demoAcorns.visible = game.phase === 'ready';
    if (animate) {
      this.demoAcorns.children.forEach((acorn, i) => {
        acorn.children[0].position.y = 0.2 + Math.sin(time * 1.8 + i) * 0.055;
        acorn.children[0].rotation.y = time * 0.35 + i;
      });
    }
    for (const player of game.players) {
      const squirrel = this.squirrels[player.id];
      squirrel.root.position.set(player.x - 20, 0.055, player.z - 5);
      const diff = Math.atan2(
        Math.sin(player.facing - squirrel.rotation),
        Math.cos(player.facing - squirrel.rotation),
      );
      squirrel.rotation += diff * Math.min(1, dt * 14);
      squirrel.body.rotation.y = squirrel.rotation;
      const moving = active && Math.hypot(player.vx, player.vz) > 0.3;
      const runCycle = time * 21;
      squirrel.body.position.y =
        animate && moving
          ? Math.abs(Math.sin(runCycle)) * 0.12
          : animate
            ? Math.sin(time * 2 + player.id) * 0.025
            : 0;
      squirrel.body.rotation.x = player.dig
        ? 0.18 + Math.sin(time * 30) * 0.15
        : 0;
      squirrel.feet.forEach((foot, i) => {
        foot.position.z =
          0.16 +
          (animate && moving ? Math.sin(runCycle + i * Math.PI) * 0.18 : 0);
      });
      squirrel.arms.forEach((arm, i) => {
        arm.rotation.x = player.dig
          ? -0.8 + Math.sin(time * 30 + i) * 0.4
          : player.carrying
            ? -0.55
            : moving && animate
              ? Math.sin(runCycle + i * Math.PI) * 0.35
              : 0;
      });
      squirrel.tail.rotation.x =
        moving && animate ? Math.sin(runCycle * 0.5) * 0.1 : 0;
      squirrel.held.visible = player.carrying && !player.dig;
      squirrel.marker.position.y =
        2.5 + (animate ? Math.sin(time * 2 + player.id) * 0.08 : 0);
      const cell = cellAt(player.x, player.z);
      const selector = this.selectors[player.id];
      selector.visible = active && player.carrying;
      selector.position.x = cell.col - 19.5;
      selector.position.z = cell.row - 4.5;
      const occupied = game.buried.has(cellKey(cell));
      const color = occupied ? 0xe18d6f : player.id === 0 ? 0xf5bf87 : 0xe2efcd;
      selector.children.forEach((child) => child.material.color.setHex(color));
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
        object.position.set(acorn.x - 20, 0.05, acorn.z - 5);
        this.acornMeshes.set(acorn.id, object);
        this.scene.add(object);
      }
      const age = game.elapsed - acorn.born;
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
    this.renderer.render(this.scene, this.camera);
  }
}
