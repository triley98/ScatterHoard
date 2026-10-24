import * as THREE from 'three';
import { RULES } from './game.js';

/** Derive daylight from the authoritative round clock, including paused clocks. */
export function roundLighting(elapsed = 0) {
  const seconds = THREE.MathUtils.clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, RULES.duration);
  const progress = seconds / RULES.duration;
  const dusk = THREE.MathUtils.smoothstep(seconds, RULES.duration - 15, RULES.duration);
  return {
    position: [
      THREE.MathUtils.lerp(-14, 18, progress),
      25 + Math.sin(progress * Math.PI) * 10 - progress * 13,
      14,
    ],
    sunIntensity: THREE.MathUtils.lerp(3.2, 0.7, dusk),
    ambientIntensity: THREE.MathUtils.lerp(2.25, 1.1, dusk),
    dusk,
  };
}

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Decorative, instanced windfall; leaves disappear before reaching the ground. */
export class WindLeaves {
  constructor(scene) {
    this.random = seededRandom(64219);
    this.time = 0;
    this.transform = new THREE.Object3D();
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.28);
    shape.quadraticCurveTo(-0.2, -0.04, -0.12, 0.1);
    shape.quadraticCurveTo(-0.07, 0.22, 0, 0.29);
    shape.quadraticCurveTo(0.22, 0.08, 0.12, -0.09);
    shape.quadraticCurveTo(0.07, -0.2, 0, -0.28);
    const geometry = new THREE.ShapeGeometry(shape, 3);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      positions.setZ(i, Math.sin(positions.getY(i) * 6) * 0.035);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, 72);
    this.mesh.name = 'windblown-leaves';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const palette = [0xc49a46, 0xb06d3b, 0x9b994e, 0xc68e50];
    this.leaves = Array.from({ length: this.mesh.count }, (_, i) => {
      const leaf = {
        x: -29 + this.random() * 58,
        y: 0.6 + this.random() * 9.4,
        z: -10 + this.random() * 20,
        drift: 0.65 + this.random() * 0.9,
        fall: 0.32 + this.random() * 0.4,
        phase: this.random() * Math.PI * 2,
        size: 0.55 + this.random() * 0.5,
      };
      this.mesh.setColorAt(i, new THREE.Color(palette[i % palette.length]));
      return leaf;
    });
    this.writeMatrices();
    scene.add(this.mesh);
  }

  writeMatrices() {
    this.leaves.forEach((leaf, i) => {
      this.transform.position.set(leaf.x, leaf.y, leaf.z);
      this.transform.rotation.set(
        Math.sin(this.time * 2.7 + leaf.phase) * 0.85 + 0.4,
        this.time * 1.7 + leaf.phase,
        Math.sin(this.time * 1.9 + leaf.phase) * 0.65,
      );
      this.transform.scale.setScalar(leaf.size);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(i, this.transform.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, { active = true, reducedMotion = false } = {}) {
    this.mesh.visible = !reducedMotion;
    if (!active || reducedMotion || !Number.isFinite(dt) || dt <= 0) return;
    // Small substeps preserve the wind path when previewing or resuming slow frames.
    let remaining = dt;
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 0.1);
      this.time += step;
      const gust = 0.75 + Math.sin(this.time * 0.55) * 0.6;
      for (const leaf of this.leaves) {
        leaf.x += (leaf.drift + gust + Math.sin(this.time * 2.1 + leaf.phase) * 0.25) * step;
        leaf.y -= (leaf.fall + Math.sin(this.time * 2.5 + leaf.phase) * 0.12) * step;
        leaf.z += Math.sin(this.time * 0.9 + leaf.phase) * 0.35 * step;
        if (leaf.x > 29) leaf.x -= 58;
        if (leaf.z > 10) leaf.z -= 20;
        if (leaf.z < -10) leaf.z += 20;
        if (leaf.y < 0.25) {
          leaf.y = 8 + this.random() * 3;
          leaf.x = -29 + this.random() * 58;
          leaf.z = -10 + this.random() * 20;
        }
      }
      remaining -= step;
    }
    this.writeMatrices();
  }
}
