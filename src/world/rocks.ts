import * as THREE from 'three/webgpu';
import { ISLET, coastRockiness, heightAt } from './island';

/**
 * Granite boulders along the shore: thick on the rocky points, half in the water,
 * and absent from the sand of the coves. A ring of them also sits around the islet.
 * One instanced mesh, one draw call.
 */
export function createRocks(): THREE.InstancedMesh {
  let seed = 91;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const matrices: THREE.Matrix4[] = [];
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const place = (x: number, z: number, size: number) => {
    const y = heightAt(x, z);
    position.set(x, y - size * 0.35, z); // bedded in, not perched
    rotation.setFromEuler(euler.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI));
    scale.set(size * (0.8 + rand() * 0.5), size * (0.5 + rand() * 0.4), size * (0.8 + rand() * 0.5));
    matrices.push(new THREE.Matrix4().compose(position, rotation, scale));
  };

  // Shoreline: from just under the water to a few metres up, mostly on the rocky points.
  for (let attempts = 0; matrices.length < 1100 && attempts < 120000; attempts++) {
    const x = (rand() * 2 - 1) * 330;
    const z = (rand() * 2 - 1) * 560;
    const y = heightAt(x, z);
    if (y < -1.8 || y > 6) continue;
    const rocky = coastRockiness(x, z);
    if (rand() > rocky * rocky + 0.03) continue; // a few stray stones even in the coves
    place(x, z, 1.5 + rand() * rand() * 6.5);
  }

  // Around the islet, where the waves break.
  for (let i = 0; i < 70; i++) {
    const angle = rand() * Math.PI * 2;
    const r = ISLET.radius * (0.75 + rand() * 0.35);
    place(ISLET.x + Math.cos(angle) * r, ISLET.z + Math.sin(angle) * r, 1.5 + rand() * 4);
  }

  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardNodeMaterial({ flatShading: true, roughness: 0.95 });
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  const palette = ['#a39b8e', '#8f887c', '#b3ab9e', '#9a8f80'].map((c) => new THREE.Color(c));
  matrices.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, palette[Math.floor(rand() * palette.length)]);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}
