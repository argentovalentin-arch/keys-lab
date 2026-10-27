import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cos, hash, instanceIndex, positionGeometry, positionLocal, sin, time, uniform, vec3 } from 'three/tsl';
import { createNoise2D } from '../lib/noise';
import { heightAt, riverHalfWidth, riverQuery } from './island';

const ISLAND_EXTENT = 520; // half-size of the square we scatter in; the island fits inside.

const densityNoise = createNoise2D(21);

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Steepness as the y component of the terrain normal (1 = flat). */
function flatness(x: number, z: number): number {
  const e = 2;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return 2 * e / Math.hypot(dx, 2 * e, dz);
}

interface ScatterRule {
  count: number;
  minHeight: number;
  maxHeight: number;
  minFlatness: number;
  /** Density-noise threshold: higher means tighter clumps. */
  clump: number;
  scale: [number, number];
}

function scatter(rule: ScatterRule, seed: number): THREE.Matrix4[] {
  const rand = seededRandom(seed);
  const matrices: THREE.Matrix4[] = [];
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let attempts = 0; matrices.length < rule.count && attempts < rule.count * 40; attempts++) {
    const x = (rand() * 2 - 1) * ISLAND_EXTENT;
    const z = (rand() * 2 - 1) * ISLAND_EXTENT;
    const y = heightAt(x, z);
    if (y < rule.minHeight || y > rule.maxHeight) continue;
    if (flatness(x, z) < rule.minFlatness) continue;
    const river = riverQuery(x, z);
    if (river.distance < riverHalfWidth(river.t) + 2) continue; // keep the river bed clear
    if (densityNoise(x * 0.012, z * 0.012) + rand() * 0.6 < rule.clump) continue;

    const s = THREE.MathUtils.lerp(rule.scale[0], rule.scale[1], rand());
    position.set(x, y - s * 0.15, z); // sink slightly so nothing floats on slopes
    rotation.setFromAxisAngle(up, rand() * Math.PI * 2);
    scale.set(s * (0.85 + rand() * 0.3), s * (0.8 + rand() * 0.4), s * (0.85 + rand() * 0.3));
    matrices.push(new THREE.Matrix4().compose(position, rotation, scale));
  }
  return matrices;
}

function paint(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Maquis shrub: a squashed low-poly blob. Unit size, base at y = 0. */
function shrubGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0); // polyhedra are already non-indexed
  g.scale(1, 0.62, 1);
  g.translate(0, 0.45, 0);
  return paint(g, '#ffffff');
}

/** Umbrella pine: slim trunk and a wide flat canopy. Unit height ≈ 1. */
function pineGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.8, 5).toNonIndexed();
  trunk.translate(0, 0.4, 0);
  const canopy = new THREE.IcosahedronGeometry(0.42, 0);
  canopy.scale(1, 0.32, 1);
  canopy.translate(0, 0.86, 0);
  return mergeGeometries([paint(trunk, '#6b5442'), paint(canopy, '#ffffff')])!;
}

/**
 * Gentle wind sway in the vertex shader; the higher a vertex sits, the more it moves.
 * Instancing runs before positionNode, so positionLocal is already placed on the island:
 * height comes from the raw geometry and `strength` is the sway at the top, in metres.
 */
/** Global wind scale: 1 normally, 0 when the visitor asked for reduced motion. */
const windScale = uniform(1);

function windMaterial(strength: number): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  const phase = hash(instanceIndex).mul(6.28);
  const gust = uniform(strength);
  const lean = positionGeometry.y.mul(positionGeometry.y).mul(gust).mul(windScale);
  material.positionNode = positionLocal.add(
    vec3(sin(time.mul(1.4).add(phase)), 0, cos(time.mul(1.1).add(phase.mul(1.3)))).mul(lean),
  );
  return material;
}

function instanced(
  geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], palette: string[], seed: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  const rand = seededRandom(seed);
  const color = new THREE.Color();
  matrices.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    color.set(palette[Math.floor(rand() * palette.length)]);
    mesh.setColorAt(i, color);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Instances span the whole island; the default bounds would cull them wrongly.
  mesh.computeBoundingSphere();
  return mesh;
}

export interface Vegetation {
  group: THREE.Group;
  /** Draw only this share (0–1) of each species. Scatter order is random, so any prefix is an even sample. */
  setDensity(share: number): void;
  setWind(on: boolean): void;
  /** Instances currently drawn. */
  drawn(): { shrubs: number; pines: number };
}

export function createVegetation(): Vegetation {
  const group = new THREE.Group();

  const shrubs = scatter(
    { count: 14000, minHeight: 5, maxHeight: 92, minFlatness: 0.6, clump: -0.2, scale: [1.8, 4.5] },
    3,
  );
  const shrubMesh = instanced(shrubGeometry(), windMaterial(0.25), shrubs, ['#6f7d45', '#5b6a3a', '#7e8a50', '#4c5a33', '#8a8a55'], 4);

  const pines = scatter(
    { count: 900, minHeight: 6, maxHeight: 55, minFlatness: 0.85, clump: 0.25, scale: [9, 16] },
    5,
  );
  const pineMesh = instanced(pineGeometry(), windMaterial(0.6), pines, ['#3f5132', '#4a5c37', '#36472c'], 6);
  group.add(shrubMesh, pineMesh);

  return {
    group,
    setDensity(share) {
      shrubMesh.count = Math.round(shrubs.length * share);
      pineMesh.count = Math.round(pines.length * share);
    },
    setWind(on) {
      windScale.value = on ? 1 : 0;
    },
    drawn: () => ({ shrubs: shrubMesh.count, pines: pineMesh.count }),
  };
}
