import * as THREE from 'three/webgpu';
import { dot, max, mix, positionWorldDirection, pow, smoothstep, uniform } from 'three/tsl';

/**
 * Procedural sky drawn as the scene background: a horizon-to-zenith gradient
 * plus a sun disc and halo. All inputs are uniforms so the time of day can
 * move them every frame without recompiling the shader.
 */
export class Sky {
  readonly horizon = uniform(new THREE.Color());
  readonly zenith = uniform(new THREE.Color());
  readonly sunColor = uniform(new THREE.Color());
  readonly sunDirection = uniform(new THREE.Vector3(0, 1, 0));

  constructor(scene: THREE.Scene) {
    const dir = positionWorldDirection;
    const gradient = mix(this.horizon, this.zenith, smoothstep(0.0, 0.5, max(dir.y, 0)));

    const facing = max(dot(dir, this.sunDirection), 0);
    const halo = pow(facing, 6).mul(0.28).add(pow(facing, 48).mul(0.35));
    const disc = smoothstep(0.9993, 0.9997, facing);

    scene.backgroundNode = gradient.add(this.sunColor.mul(halo.add(disc)));
  }
}
