import * as THREE from 'three/webgpu';
import { abs, attribute, color, float, mix, mx_noise_float, smoothstep, time, uv, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { riverProfile } from './island';

/**
 * The river's water: a ribbon laid along the carved channel, shaded in TSL.
 * Texture coordinates run across (u) and downstream (v, in metres / 10), so the
 * shader can make the surface flow downhill. Steeper stretches get white water. Near the
 * mouth the ribbon widens with the estuary and takes on the sea's colour, so it melts into it.
 */
export function createRiver(glow: Node<'float'>): THREE.Mesh {
  const profile = riverProfile();
  const line = profile.map((p) => p.position);
  const count = line.length;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const slopes = new Float32Array(count * 2);
  const mouth = new Float32Array(count * 2);
  const indices: number[] = [];

  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  let along = 0;

  for (let i = 0; i < count; i++) {
    const prev = line[Math.max(i - 1, 0)];
    const next = line[Math.min(i + 1, count - 1)];
    tangent.subVectors(next, prev).setY(0).normalize();
    side.set(-tangent.z, 0, tangent.x).multiplyScalar(profile[i].halfWidth * 0.95);
    if (i > 0) along += line[i].distanceTo(line[i - 1]);

    const run = Math.max(Math.hypot(next.x - prev.x, next.z - prev.z), 1e-3);
    const slope = (prev.y - next.y) / run;

    for (let s = 0; s < 2; s++) {
      const k = i * 2 + s;
      const sign = s === 0 ? -1 : 1;
      positions.set([line[i].x + side.x * sign, line[i].y, line[i].z + side.z * sign], k * 3);
      uvs.set([s, along / 10], k * 2);
      slopes[k] = slope;
      mouth[k] = profile[i].t;
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('slope', new THREE.BufferAttribute(slopes, 1));
  geometry.setAttribute('along', new THREE.BufferAttribute(mouth, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Surface moving downstream; faster where the river is steeper.
  const slope = attribute<'float'>('slope', 'float');
  const speed = float(0.35).add(slope.mul(4));
  const flowV = uv().y.sub(time.mul(speed));
  const across = uv().x;
  const edge = abs(across.sub(0.5)).mul(2);

  const streaks = mx_noise_float(vec3(across.mul(3), flowV.mul(2.5), time.mul(0.15)));
  const ripples = smoothstep(0.35, 0.8, streaks).mul(0.18);
  const rapids = smoothstep(0.06, 0.2, slope).mul(smoothstep(0.1, 0.6, mx_noise_float(vec3(across.mul(6), flowV.mul(5), 1.7))));
  const shallowEdges = smoothstep(0.55, 1, edge);

  const water = mix(color('#3f8c94'), color('#86c3b5'), shallowEdges.mul(0.8));
  const river = mix(water.add(ripples), color('#f4eee0'), rapids.clamp(0, 0.85));
  // Over the last stretch the river takes on the sea's shallow turquoise and calms down.
  const nearSea = smoothstep(0.8, 1, attribute<'float'>('along', 'float'));
  const surface = mix(river, color('#86c3b5'), nearSea.mul(0.85));

  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0.05 });
  material.colorNode = surface;
  // Same daylight lift as the sea, so both waters dim together at dusk.
  material.emissiveNode = surface.mul(glow);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
