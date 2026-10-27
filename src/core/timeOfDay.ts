import * as THREE from 'three/webgpu';

/**
 * Lighting moods along the route. `at` is scroll progress; values in between
 * are blended, so the day slides from late morning to dusk as the visitor scrolls.
 */
interface Mood {
  at: number;
  sunDirection: THREE.Vector3;
  sun: THREE.Color;
  sunIntensity: number;
  horizon: THREE.Color;
  zenith: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  /** How much the sea glows on its own (keeps it bright at noon, lets it darken at dusk). */
  seaGlow: number;
}

const mood = (
  at: number, sun: [number, number, number], sunColor: string, sunIntensity: number,
  horizon: string, zenith: string, hemiSky: string, hemiGround: string, hemiIntensity: number, seaGlow: number,
): Mood => ({
  at,
  sunDirection: new THREE.Vector3(...sun).normalize(),
  sun: new THREE.Color(sunColor),
  sunIntensity,
  horizon: new THREE.Color(horizon),
  zenith: new THREE.Color(zenith),
  hemiSky: new THREE.Color(hemiSky),
  hemiGround: new THREE.Color(hemiGround),
  hemiIntensity,
  seaGlow,
});

const MOODS: Mood[] = [
  mood(0.0, [0.55, 0.78, -0.3], '#fff2da', 2.8, '#f4ecdc', '#c6d8d8', '#e3ece9', '#b9a57f', 1.3, 0.35),
  mood(0.5, [0.7, 0.5, -0.1], '#ffe9c8', 2.7, '#f3e5cc', '#b7cfd4', '#e0e6e0', '#b9a57f', 1.2, 0.32),
  mood(0.8, [0.8, 0.26, 0.3], '#ffcf96', 2.4, '#f4d3a8', '#9fb8c8', '#d6d2c6', '#a8906c', 0.95, 0.24),
  mood(1.0, [0.75, 0.1, 0.5], '#ffa262', 2.0, '#f2b48a', '#6f84a3', '#a8b4c8', '#8a6f58', 0.75, 0.16),
];

export interface MoodState {
  sunDirection: THREE.Vector3;
  sun: THREE.Color;
  sunIntensity: number;
  horizon: THREE.Color;
  zenith: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  seaGlow: number;
}

const state: MoodState = {
  sunDirection: new THREE.Vector3(),
  sun: new THREE.Color(),
  sunIntensity: 0,
  horizon: new THREE.Color(),
  zenith: new THREE.Color(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  hemiIntensity: 0,
  seaGlow: 0,
};

/** Blended mood at a given progress. Returns a shared object: read it, don't keep it. */
export function moodAt(progress: number): MoodState {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  let i = 0;
  while (i < MOODS.length - 2 && p > MOODS[i + 1].at) i++;
  const a = MOODS[i];
  const b = MOODS[i + 1];
  const t = THREE.MathUtils.smoothstep(p, a.at, b.at);

  state.sunDirection.lerpVectors(a.sunDirection, b.sunDirection, t).normalize();
  state.sun.lerpColors(a.sun, b.sun, t);
  state.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
  state.horizon.lerpColors(a.horizon, b.horizon, t);
  state.zenith.lerpColors(a.zenith, b.zenith, t);
  state.hemiSky.lerpColors(a.hemiSky, b.hemiSky, t);
  state.hemiGround.lerpColors(a.hemiGround, b.hemiGround, t);
  state.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t);
  state.seaGlow = THREE.MathUtils.lerp(a.seaGlow, b.seaGlow, t);
  return state;
}
