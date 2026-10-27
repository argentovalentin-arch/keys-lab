import * as THREE from 'three/webgpu';
import {
  color, float, length, max, mix, mx_noise_float, positionWorld, sin, smoothstep, texture, time, uniform, vec3,
} from 'three/tsl';
import { TERRAIN_SIZE } from './island';

/**
 * Flat sea plane shaded entirely in TSL. Water depth comes from the island
 * heightfield, which drives the turquoise-to-deep gradient and the shore foam.
 */
export function createSea(heightTexture: THREE.Texture) {
  const xz = positionWorld.xz;

  const terrainHeight = texture(heightTexture, xz.div(TERRAIN_SIZE).add(0.5)).r;
  // Beyond the heightfield the sea keeps getting deeper with distance.
  const offshore = max(length(xz).sub(650), 0).mul(0.04);
  const depth = max(terrainHeight.negate(), 0).add(offshore);

  const shallow = color('#86c3b5');
  const mid = color('#3f8c94');
  const deep = color('#2c6276');
  const water = mix(mix(shallow, mid, smoothstep(0, 7, depth)), deep, smoothstep(7, 34, depth));

  // Foam: bands rolling towards the shore, broken up by animated noise.
  const ripple = mx_noise_float(vec3(xz.mul(0.07), time.mul(0.25)));
  const swell = sin(depth.mul(3.2).sub(time.mul(1.4)).add(ripple.mul(1.5))).mul(0.5).add(0.5);
  const shoreBand = float(1).sub(smoothstep(0.2, 3.2, depth));
  const foam = shoreBand.mul(smoothstep(0.45, 0.85, swell)).add(float(1).sub(smoothstep(0, 0.6, depth)));

  // Fine surface glints so open water is never a flat fill.
  const glint = smoothstep(0.55, 0.9, mx_noise_float(vec3(xz.mul(0.035), time.mul(0.35)))).mul(0.06);

  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.22, metalness: 0.05 });
  const surface = mix(water.add(glint), color('#f7f1e4'), foam.clamp(0, 1));
  material.colorNode = surface;
  // Without an environment map, grazing angles go near-black; lift them so the sea reads as daylight.
  // The time of day lowers this towards dusk.
  const glow = uniform(0.35);
  material.emissiveNode = surface.mul(glow);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return { mesh, glow };
}
