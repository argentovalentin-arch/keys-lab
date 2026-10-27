import * as THREE from 'three/webgpu';
import { createNoise2D, fbm } from '../lib/noise';

// World scale: 1 unit ≈ 1 metre at "stylised" scale. Sea level is y = 0.
export const TERRAIN_SIZE = 1800;
const ISLAND_RADIUS = 420;
const PEAK_HEIGHT = 135;
const SEA_FLOOR = -22;

const noise = createNoise2D(7);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Summits of the mountain chain running north–south in the west: [x, z, extra height].
 * Each is stretched along the chain so together they read as a range, not as cones.
 */
const PEAKS: Array<[number, number, number]> = [
  [-70, -230, 35],
  [-55, -130, 60],
  [-40, -40, 48],
  [-35, 40, 55],
  [-75, 120, 45],
  [-85, 210, 32],
];
/** Footprint of each summit: narrow across the chain, long along it. */
const PEAK_RADIUS_X = 75;
const PEAK_RADIUS_Z = 115;

/**
 * Crests in the north, between the plain and the chain: thin, knife-edged ridges,
 * far smaller than the mountains. [x1, z1, x2, z2, extra height, half-width].
 */
const CRESTS: Array<[number, number, number, number, number, number]> = [
  [-10, 170, 90, 255, 42, 38],
  [25, 115, 120, 180, 34, 32],
  [-35, 255, 40, 340, 38, 36],
];

/** Distance from (x, z) to the segment (ax, az)–(bx, bz). */
function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const u = Math.min(1, Math.max(0, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (ax + abx * u), z - (az + abz * u));
}

/** Island relief before the river is carved in. */
function baseHeight(x: number, z: number): number {
  const nx = x / ISLAND_RADIUS;
  const nz = z / ISLAND_RADIUS;

  // Domain warp gives the coastline its bays and capes.
  const wx = nx + 0.28 * fbm(noise, nx * 1.4 + 11.3, nz * 1.4, 3);
  const wz = nz + 0.28 * fbm(noise, nx * 1.4, nz * 1.4 - 7.1, 3);

  // Long and narrow north–south, like Corsica. A finer noise cuts the shore into small
  // coves between rocky points (see coastRockiness).
  const coves = noise(x * COVE_FREQUENCY + 40, z * COVE_FREQUENCY);
  const d = Math.hypot(wx * 1.35, wz * 0.64) + 0.045 * coves;
  const mask = 1 - smoothstep(0.32, 1.0, d);

  // Soft absolute value: sharp ridges alias into saw teeth on the grid.
  const r = noise(nx * 2.1 + 3.7, nz * 2.1);
  const ridge = 1 - Math.sqrt(r * r + 0.012);
  const base = 0.5 + 0.55 * fbm(noise, nx * 1.8, nz * 1.8, 5);
  const hills = 0.62 * ridge * ridge + 0.38 * base;

  // The east coast opens onto a long, low plain (like Corsica's plaine orientale),
  // gently rolling; the mountains keep to the west.
  const plain = smoothstep(-0.05, 0.3, wx);
  const lowland = 0.2 + 0.06 * fbm(noise, nx * 3, nz * 3, 3);
  const relief = Math.pow(mask, 1.6) * THREE.MathUtils.lerp(hills, lowland, plain);

  // Summits: the highest one wins where footprints overlap, roughened by noise so they are rocky.
  let peaks = 0;
  for (const [px, pz, height] of PEAKS) {
    const t = Math.max(0, 1 - Math.hypot((x - px) / PEAK_RADIUS_X, (z - pz) / PEAK_RADIUS_Z));
    // Smooth shoulders (t²(3 − 2t)) rather than a sharp cone point.
    peaks = Math.max(peaks, height * t * t * (3 - 2 * t) * (0.85 + 0.15 * noise(x * 0.05, z * 0.05)));
  }

  // Crests: a tent profile gives the sharp ridge line; the highest crest wins where they meet.
  let crests = 0;
  for (const [ax, az, bx, bz, height, halfWidth] of CRESTS) {
    const t = Math.max(0, 1 - segmentDistance(x, z, ax, az, bx, bz) / halfWidth);
    crests = Math.max(crests, height * Math.pow(t, 1.3) * (0.8 + 0.2 * noise(x * 0.04 + 5, z * 0.04)));
  }

  // Peaks stand at full height inland and fade out near the coast and towards the plain;
  // crests may reach a little further east, into the edge of the plain.
  const inland = smoothstep(0.1, 0.5, mask);
  const h = relief * PEAK_HEIGHT + mask * 14 + SEA_FLOOR
    + peaks * inland * (1 - plain)
    + crests * inland * (1 - 0.6 * plain);

  // Shore profile: in the coves the land stays low for longer, giving wide, gently
  // sloping beaches; on the rocky points it rises steeply straight out of the sea.
  let shore = h;
  if (h > 0 && h < SHORE_HEIGHT) {
    const exponent = THREE.MathUtils.lerp(1.8, 0.8, coastRockiness(x, z));
    shore = SHORE_HEIGHT * Math.pow(h / SHORE_HEIGHT, exponent);
  }
  return Math.max(shore, isletHeight(x, z));
}

/** Scale of the coves along the shore: about one cove or point every hundred metres. */
const COVE_FREQUENCY = 0.018;
/** Height below which the shore profile is reshaped into beaches or rocky points. */
const SHORE_HEIGHT = 14;

/** 0 in a sandy cove, 1 on a rocky point: where the shore juts out, it is rock. */
export function coastRockiness(x: number, z: number): number {
  return smoothstep(-0.1, 0.35, -noise(x * COVE_FREQUENCY + 40, z * COVE_FREQUENCY));
}

// ---------------------------------------------------------------- Islet

/** A rocky islet off the east coast, in front of the first stop, with its lighthouse. */
export const ISLET = { x: 620, z: 250, radius: 46, top: 30 };

/** Height of the islet (sea floor away from it): a rough granite dome. */
export function isletHeight(x: number, z: number): number {
  const r = Math.hypot(x - ISLET.x, z - ISLET.z);
  if (r > ISLET.radius) return SEA_FLOOR;
  const t = 1 - r / ISLET.radius;
  const rough = 0.75 + 0.25 * noise(x * 0.09 + 17, z * 0.09);
  return SEA_FLOOR + (ISLET.top - SEA_FLOOR) * Math.pow(t, 0.75) * rough;
}

// ---------------------------------------------------------------- River

/** River course in x/z, from the col between the two main peaks down to the east coast. */
const RIVER_COURSE: Array<[number, number]> = [
  [55, -68], [85, -52], [112, -66], [138, -84], [162, -70], [182, -76],
];
/** Half-width of the water upstream, and how far the valley sides reach beyond it (metres). */
export const RIVER_HALF_WIDTH = 7;

/** Half-width at t (0 source, 1 mouth): the river opens into a small estuary as it meets the sea. */
export function riverHalfWidth(t: number): number {
  return RIVER_HALF_WIDTH * (1 + smoothstep(0.7, 1, t));
}
const VALLEY_WIDTH = 45;
const BED_DEPTH = 1.6;

const riverPath = new THREE.CatmullRomCurve3(
  RIVER_COURSE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal',
).getSpacedPoints(120);
const riverLength: number[] = [0];
for (let i = 1; i < riverPath.length; i++) {
  riverLength.push(riverLength[i - 1] + riverPath[i].distanceTo(riverPath[i - 1]));
}
const riverTotal = riverLength[riverLength.length - 1];
const riverBounds = new THREE.Box2()
  .setFromPoints(riverPath.map((p) => new THREE.Vector2(p.x, p.z)))
  .expandByScalar(RIVER_HALF_WIDTH * 2 + VALLEY_WIDTH);
const probe = new THREE.Vector2();

const sourceHeight = baseHeight(riverPath[0].x, riverPath[0].z) - 10;

/** Water level along the river, t from source (0) to mouth (1); always downhill. */
export function riverBed(t: number): number {
  // Reaches sea level where the river meets the coast (t ≈ 0.8), then stays just below it
  // through the estuary, so the water never stands above the sea.
  return THREE.MathUtils.lerp(sourceHeight, -0.5, Math.pow(Math.min(t / 0.8, 1), 0.75));
}

/** Distance from (x, z) to the river's centre line, and how far along it the closest point is. */
export function riverQuery(x: number, z: number): { distance: number; t: number } {
  if (!riverBounds.containsPoint(probe.set(x, z))) return { distance: Infinity, t: 0 };
  let best = Infinity;
  let bestT = 0;
  for (let i = 1; i < riverPath.length; i++) {
    const a = riverPath[i - 1];
    const b = riverPath[i];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const u = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / len2));
    const dx = x - (a.x + abx * u);
    const dz = z - (a.z + abz * u);
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bestT = (riverLength[i - 1] + Math.sqrt(len2) * u) / riverTotal;
    }
  }
  return { distance: Math.sqrt(best), t: bestT };
}

/** The water surface along the river, source first: centre point, half-width, and t. */
export function riverProfile(): Array<{ position: THREE.Vector3; halfWidth: number; t: number }> {
  return riverCentreLine().map((position, i) => {
    const t = riverLength[i] / riverTotal;
    return { position, halfWidth: riverHalfWidth(t), t };
  });
}

/** Points along the river's centre line at the water surface, source first. */
export function riverCentreLine(): THREE.Vector3[] {
  // Slightly below bank level, so the water's edges tuck into the ground instead of floating.
  return riverPath.map((p, i) => new THREE.Vector3(p.x, riverBed(riverLength[i] / riverTotal) - 0.2, p.z));
}

/** Terrain height at a world-space (x, z). Also used to keep the camera above ground. */
export function heightAt(x: number, z: number): number {
  const h = baseHeight(x, z);
  const { distance, t } = riverQuery(x, z);
  if (distance === Infinity) return h;

  const bed = riverBed(t);
  const width = riverHalfWidth(t);
  if (distance < width) {
    // Rounded channel under the water.
    const k = 1 - distance / width;
    return Math.min(h, bed - BED_DEPTH * k * k);
  }
  // Valley sides: lower the land towards the water level.
  const side = smoothstep(width, width + VALLEY_WIDTH, distance);
  const valley = Math.min(h, bed + (h - bed) * side);
  // Where the river runs along a slope, the downhill side would sit below the water:
  // a low natural bank holds it in, then fades back into the land. Only on land: under
  // the sea a bank would build a jetty out from the mouth.
  if (distance > width + 12 || h < 0.5) return valley;
  const fade = smoothstep(width + 3, width + 12, distance);
  const bank = bed + 0.5 * (1 - fade);
  return THREE.MathUtils.lerp(Math.max(valley, bank), valley, fade);
}

const PALETTE = {
  seabed: new THREE.Color('#b9a57f'),
  sand: new THREE.Color('#e6d5aa'),
  maquisLight: new THREE.Color('#7f8a52'),
  maquisDark: new THREE.Color('#4e5a36'),
  gravel: new THREE.Color('#a39a84'),
  rock: new THREE.Color('#a69d8b'),
  summit: new THREE.Color('#ece3cf'),
};

export interface Island {
  mesh: THREE.Mesh;
  /** Heightfield as a half-float texture, sampled by the sea shader for depth and foam. */
  heightTexture: THREE.DataTexture;
}

export function createIsland(segments = 384): Island {
  const n = segments + 1;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const indices = new Uint32Array(segments * segments * 6);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / segments - 0.5) * TERRAIN_SIZE;
      const z = (j / segments - 0.5) * TERRAIN_SIZE;
      const k = (j * n + i) * 3;
      positions[k] = x;
      positions[k + 1] = heightAt(x, z);
      positions[k + 2] = z;
    }
  }

  let t = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], t);
      t += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // Colour by altitude and slope, with a little noise so bands are not ruler-straight.
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let v = 0; v < n * n; v++) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const flat = normals.getY(v);
    const jitter = noise(x * 0.02, z * 0.02) * 6;
    const h = y + jitter;

    const rocky = coastRockiness(x, z);
    const onIslet = Math.hypot(x - ISLET.x, z - ISLET.z) < ISLET.radius + 4;
    if (h < -1) c.copy(PALETTE.seabed);
    else if (onIslet) c.copy(PALETTE.rock).lerp(PALETTE.summit, smoothstep(10, 20, h) * 0.5);
    else if (h < 7) c.copy(PALETTE.sand).lerp(PALETTE.rock, smoothstep(0.45, 0.75, rocky));
    else {
      c.copy(PALETTE.maquisLight).lerp(PALETTE.maquisDark, smoothstep(-0.4, 0.6, noise(x * 0.008, z * 0.008)));
      c.lerp(PALETTE.rock, smoothstep(0.6, 0.4, flat));
      c.lerp(PALETTE.rock, smoothstep(95, 120, h));
      c.lerp(PALETTE.summit, smoothstep(122, 136, h));
      // Rocky points keep their bare rock a little way up from the sea.
      c.lerp(PALETTE.rock, smoothstep(0.45, 0.75, rocky) * (1 - smoothstep(7, 16, h)));
    }
    // Pale gravel banks where the river runs.
    const river = riverQuery(x, z);
    const banks = riverHalfWidth(river.t);
    if (river.distance < banks + 8 && y > -1) {
      c.lerp(PALETTE.gravel, 1 - smoothstep(banks + 2, banks + 8, river.distance));
    }
    colors.set([c.r, c.g, c.b], v * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardNodeMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  return { mesh, heightTexture: createHeightTexture(512) };
}

function createHeightTexture(size: number): THREE.DataTexture {
  const data = new Uint16Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1) - 0.5) * TERRAIN_SIZE;
      const z = (j / (size - 1) - 0.5) * TERRAIN_SIZE;
      data[j * size + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
