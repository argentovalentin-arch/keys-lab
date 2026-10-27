import './style.css';
import * as THREE from 'three/webgpu';
import Lenis from 'lenis';
import { createIsland } from './world/island';
import { createSea } from './world/sea';
import { createRiver } from './world/river';
import { Sky } from './world/sky';
import { createVegetation } from './world/vegetation';
import { createRocks } from './world/rocks';
import { createLighthouse } from './world/lighthouse';
import { CameraRig } from './core/cameraRig';
import { moodAt } from './core/timeOfDay';
import { Journey } from './ui/journey';
import { Loader } from './ui/loader';
import { Ambience } from './audio/ambience';
import type { LiveFact } from './content/stops';
import { FrameMonitor, TIERS, forcedTier, initialTier, type Tier } from './core/quality';

const CREAM = '#f4ecdc';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const fallback = document.querySelector<HTMLElement>('#fallback')!;
const backendLabel = document.querySelector<HTMLElement>('#backend')!;
const progressBar = document.querySelector<HTMLElement>('#progress')!;
const soundButton = document.querySelector<HTMLButtonElement>('#sound')!;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// `?webgl` forces the WebGL 2 backend, to test the fallback path on WebGPU browsers.
const forceWebGL = new URLSearchParams(location.search).has('webgl');
// Development only: `?cam=x,y,z,tx,ty,tz` pins the camera to inspect a spot up close.
// Development only: `?skip=shadows,vegetation,rocks,lighthouse` leaves parts out, to profile loading.
const skip = new Set(import.meta.env.DEV ? (new URLSearchParams(location.search).get('skip') ?? '').split(',') : []);
const debugCamera = import.meta.env.DEV
  ? new URLSearchParams(location.search).get('cam')?.split(',').map(Number) ?? null
  : null;

const loader = new Loader(reducedMotion);
const formatNumber = (n: number) => n.toLocaleString('fr-FR');

async function start(): Promise<void> {
  await loader.step('Préparation du rendu', 0.1);
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL });
  await renderer.init();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !skip.has('shadows');
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const isWebGPU = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  const backendName = isWebGPU ? 'WebGPU' : 'WebGL 2';
  backendLabel.textContent = `Rendu ${backendName}`;

  const tier = initialTier(isWebGPU);
  const settings = TIERS[tier];
  // Canvas size is applied in the render loop, once the canvas has a layout size.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));

  const scene = new THREE.Scene();
  const sky = new Sky(scene);
  scene.fog = new THREE.Fog(CREAM, 350, 2000);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 6000);

  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
  Object.assign(sun.shadow.camera, { left: -640, right: 640, top: 640, bottom: -640, near: 10, far: 2200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 1.5;
  const ambient = new THREE.HemisphereLight();
  scene.add(sun, sun.target, ambient);

  await loader.step('Relief de l’île', 0.3);
  const island = createIsland();
  const sea = createSea(island.heightTexture);
  scene.add(island.mesh, sea.mesh, createRiver(sea.glow));

  await loader.step('Maquis et pins', 0.55);
  const vegetation = createVegetation();
  vegetation.setDensity(settings.vegetation);
  // Reduced motion: the plants stand still (the sea keeps its slow, ambient movement).
  vegetation.setWind(!reducedMotion);
  if (!skip.has('vegetation')) scene.add(vegetation.group);
  const lighthouse = createLighthouse();
  if (!skip.has('rocks')) scene.add(createRocks());
  if (!skip.has('lighthouse')) scene.add(lighthouse.group);

  // Light, sky, fog and sea all follow the same mood so the day turns as one.
  const applyMood = (progress: number) => {
    const mood = moodAt(progress);
    sun.position.copy(mood.sunDirection).multiplyScalar(900);
    sun.color.copy(mood.sun);
    sun.intensity = mood.sunIntensity;
    ambient.color.copy(mood.hemiSky);
    ambient.groundColor.copy(mood.hemiGround);
    ambient.intensity = mood.hemiIntensity;
    sky.horizon.value.copy(mood.horizon);
    sky.zenith.value.copy(mood.zenith);
    sky.sunColor.value.copy(mood.sun);
    sky.sunDirection.value.copy(mood.sunDirection);
    scene.fog!.color.copy(mood.horizon);
    sea.glow.value = mood.seaGlow;
    lighthouse.setDusk(THREE.MathUtils.smoothstep(progress, 0.75, 1));
  };

  const rig = new CameraRig(camera);
  applyMood(0);

  // Compile every shader up front so the first scroll never stutters. On the WebGL 2
  // backend compileAsync can fail to settle (seen with three r186), so it gets a time limit:
  // anything left over compiles on the first render instead of blocking the loader.
  await loader.step('Compilation des shaders', 0.75);
  const compileStart = performance.now();
  const compiled = await Promise.race([
    renderer.compileAsync(scene, camera).then(() => true),
    new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 5000)),
  ]);
  if (!compiled) console.warn('KEYS Lab: shader precompilation timed out, continuing');
  if (import.meta.env.DEV) console.info(`KEYS Lab: scène prête à ${Math.round(compileStart)} ms, shaders précompilés en ${Math.round(performance.now() - compileStart)} ms`);
  const firstRenderStart = performance.now();

  // Per-frame figures shown in the "how it's made" sheets.
  const frameStats = { calls: 0, triangles: 0 };
  const terrainTriangles = (island.mesh.geometry.index?.count ?? 0) / 3;
  const live = (fact: LiveFact): string => {
    switch (fact) {
      case 'terrainTriangles': return formatNumber(terrainTriangles);
      case 'shrubs': return formatNumber(vegetation.drawn().shrubs);
      case 'pines': return formatNumber(vegetation.drawn().pines);
      case 'drawCalls': return formatNumber(frameStats.calls);
      case 'triangles': return formatNumber(frameStats.triangles);
      case 'backend': return backendName;
    }
  };

  const drawSize = new THREE.Vector2();
  const lenis = new Lenis({ autoRaf: false, lerp: reducedMotion ? 1 : 0.08 });
  const scrollToProgress = (target: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    lenis.scrollTo(target * max, { duration: reducedMotion ? 0 : 2.4, immediate: reducedMotion });
  };
  const journey = new Journey(
    camera, live, reducedMotion, (open) => (open ? lenis.stop() : lenis.start()), scrollToProgress,
  );

  // Step quality down if the device cannot keep up; a forced ?quality= stays put.
  const applyTier = (next: Tier) => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, TIERS[next].pixelRatio));
    drawSize.set(0, 0); // forces the canvas to be resized on the next frame
    vegetation.setDensity(TIERS[next].vegetation);
    console.info(`KEYS Lab: qualité ${next}`);
  };
  const monitor = new FrameMonitor(tier, applyTier, forcedTier() === null);
  console.info(`KEYS Lab: ${backendName}, qualité ${tier}`);

  const ambience = new Ambience();
  const listener = { position: camera.position, forward: new THREE.Vector3() };
  soundButton.addEventListener('click', async () => {
    const on = await ambience.toggle();
    soundButton.setAttribute('aria-pressed', String(on));
    soundButton.textContent = on ? 'Couper le son' : 'Activer le son';
  });

  const pointer = new THREE.Vector2();
  if (!reducedMotion) {
    window.addEventListener('pointermove', (e) => {
      pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    });
  }

  const viewport = { width: 0, height: 0 };

  const scrollProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? THREE.MathUtils.clamp(window.scrollY / max, 0, 1) : 0;
  };

  const timer = new THREE.Timer();
  let firstFrame = true;

  renderer.setAnimationLoop((now: number) => {
    timer.update(now);
    lenis.raf(now);

    const progress = scrollProgress();
    const dt = timer.getDelta();
    rig.update(progress, Math.min(dt, 0.1), pointer);
    if (debugCamera) {
      camera.position.set(debugCamera[0], debugCamera[1], debugCamera[2]);
      camera.lookAt(debugCamera[3], debugCamera[4], debugCamera[5]);
    }
    applyMood(rig.progress);
    camera.getWorldDirection(listener.forward);
    ambience.update(rig.progress, listener);
    progressBar.style.transform = `scaleX(${progress})`;

    // A hidden or collapsed viewport has no drawable surface yet; resize lazily once it does.
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (width !== drawSize.x || height !== drawSize.y) {
      drawSize.set(width, height);
      viewport.width = width;
      viewport.height = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    const renderStart = performance.now();
    renderer.render(scene, camera);
    const renderMs = performance.now() - renderStart;
    if (!firstFrame) monitor.sample(dt);
    frameStats.calls = renderer.info.render.calls;
    frameStats.triangles = renderer.info.render.triangles;

    journey.update(rig.progress, viewport);

    if (firstFrame) {
      firstFrame = false;
      if (import.meta.env.DEV) console.info(`KEYS Lab: premier rendu calculé en ${Math.round(renderMs)} ms, affiché ${Math.round(performance.now() - firstRenderStart)} ms après la scène prête`);
      void loader.finish();
    }
  });
}

start().catch((error: unknown) => {
  console.error('KEYS Lab: rendering unavailable', error);
  loader.hide();
  fallback.hidden = false;
});
