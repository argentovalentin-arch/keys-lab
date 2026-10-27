import * as THREE from 'three/webgpu';
import { color, uniform } from 'three/tsl';
import { ISLET, heightAt } from './island';

/**
 * A red lighthouse on top of the islet: a tapering tower with a white band, a white
 * gallery, a glazed lantern and a dark cap, beside a small white keeper's house.
 * The lantern glows faintly by day and lights up as the sun goes down.
 */
export function createLighthouse(): { group: THREE.Group; setDusk(amount: number): void } {
  const group = new THREE.Group();
  const ground = heightAt(ISLET.x, ISLET.z);
  group.position.set(ISLET.x, ground - 0.5, ISLET.z);

  const paint = (hex: string, roughness = 0.7) =>
    new THREE.MeshStandardNodeMaterial({ color: hex, roughness, flatShading: true });
  const red = paint('#b3342b');
  const white = paint('#efe9dc');
  const dark = paint('#2a2c31', 0.5);

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Tower: red, with a white band two thirds of the way up.
  add(new THREE.CylinderGeometry(1.7, 2.3, 10, 12), red, 5);
  add(new THREE.CylinderGeometry(1.55, 1.7, 2.2, 12), white, 11.1);
  add(new THREE.CylinderGeometry(1.4, 1.55, 3, 12), red, 13.7);
  // Gallery, lantern and cap.
  add(new THREE.CylinderGeometry(2.1, 2.1, 0.35, 16), white, 15.4);
  const glow = uniform(0.3);
  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.2 });
  glass.colorNode = color('#fff3c4');
  glass.emissiveNode = color('#ffd27a').mul(glow);
  add(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12), glass, 16.5);
  add(new THREE.ConeGeometry(1.4, 1.4, 12), dark, 18.1);

  // Keeper's house at the foot of the tower.
  const house = add(new THREE.BoxGeometry(5, 3, 3.6), white, 1.5);
  house.position.set(4.2, 1.5, 1);
  const roof = add(new THREE.CylinderGeometry(0.01, 3.3, 1.6, 4, 1), red, 3.8);
  roof.position.set(4.2, 3.8, 1);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.05, 1, 0.75);

  return {
    group,
    setDusk(amount) {
      glow.value = 0.3 + 2.7 * amount;
    },
  };
}
