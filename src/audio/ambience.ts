/**
 * Generative ambience built with the Web Audio API: no audio files.
 *
 * One soundscape per part of the route, crossfaded by route progress with long,
 * overlapping fades, and all sharing one synthetic reverb so they blend together:
 * - Le large, la côte: a wide stereo sea (rolling bed, overlapping waves and their foam),
 *   and a gull colony as the coast gets near. The rocky islet has its own surf, placed where
 *   it really is: a constant wash round the rocks, slow waves crashing on them, and a few
 *   gulls wheeling about the lighthouse;
 * - Le maquis: no sea; birds, pulsing cicadas and a light rustle of leaves, and the
 *   river, placed where it really is: louder and clearer as the camera gets close, panned
 *   towards its side of the screen. It rises as the sea fades and fades under the wind,
 *   so it carries the transitions from the coast to the crests;
 * - Les crêtes: a soft breeze through the grass, a skylark singing overhead, goat bells
 *   from a herd somewhere below, and a few dry grasshopper chirps;
 * - Les montagnes: summit wind in gusts, with whistles that rise as it blows, and the
 *   birds of the heights far off: a raptor, alpine choughs, a raven;
 * - Le soir: sunset. A faint, gentle lapping instead of waves, a blackbird singing the day
 *   out (another answering far off), one cricket starting at the very end, and the mix
 *   darkening a little as the day switches off.
 * Nothing is created until the visitor turns sound on (browsers require a gesture).
 */

import * as THREE from 'three/webgpu';
import { ISLET, riverCentreLine } from '../world/island';

/** Where the listener is and which way it faces; used to place the river. */
export interface Listener {
  position: THREE.Vector3;
  /** Normalised view direction. */
  forward: THREE.Vector3;
}

/**
 * One goat and its bell. Real herd bells are cheap, dented sheet metal: each one has its
 * own odd set of partials, short and clanky rather than ringing, and is shaken irregularly
 * by the animal's head. [ratio to the base, level, decay time constant in seconds].
 */
interface Goat {
  base: number;
  partials: Array<[number, number, number]>;
  pan: number;
  next: number;
}

/** Camera distance (m) at which the river is heard at full level, as from the maquis stop. */
const RIVER_NEAR = 230;
/** Camera distance (m) at which the islet's surf is heard at full level, as from the first stop. */
const ISLET_NEAR = 400;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const MASTER_LEVEL = 0.55;
/** Seconds between level updates: slow changes need no per-frame automation. */
const UPDATE_INTERVAL = 0.1;
/** Time constant for crossfades between soundscapes, in seconds. */
const GLIDE = 2;

/**
 * How much each soundscape is heard at a given route progress. Stops sit at
 * 0 (le large), 1/6 (la côte), 3/6 (le maquis), 4/6 (les crêtes), 5/6 (les montagnes), 1 (le soir).
 */
export function soundscapeMix(progress: number) {
  // The sea is gone before the maquis begins.
  const day = 1 - smoothstep(0.2, 0.36, progress);
  const evening = smoothstep(0.88, 1, progress);
  return {
    sea: 0.78 * day + 0.53 * evening,
    islet: day,
    gulls: smoothstep(0.04, 0.13, progress) * (1 - smoothstep(0.22, 0.34, progress)),
    maquis: smoothstep(0.3, 0.45, progress) * (1 - smoothstep(0.55, 0.65, progress)),
    // Wider than the maquis on both sides: it bridges sea → maquis → crests.
    river: smoothstep(0.2, 0.38, progress) * (1 - smoothstep(0.58, 0.72, progress)),
    ridge: smoothstep(0.55, 0.64, progress) * (1 - smoothstep(0.72, 0.8, progress)),
    mountain: 0.47 * smoothstep(0.7, 0.8, progress) * (1 - smoothstep(0.88, 0.98, progress)),
    evening,
  };
}

interface WaveVoice {
  body: GainNode;
  bodyFilter: BiquadFilterNode;
  foam: GainNode;
  pan: StereoPannerNode;
}

interface Whistle {
  filter: BiquadFilterNode;
  gain: GainNode;
  pitch: number;
  level: number;
}

const WHISTLES: Array<[pitch: number, level: number, pan: number]> = [
  [760, 2.2, -0.5],
  [1130, 1.65, 0.35],
  [1520, 1.1, 0.1],
];

export class AmbienceGraph {
  readonly output: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly space: ConvolverNode;
  private readonly seaBus: GainNode;
  private readonly gullBus: GainNode;
  private readonly maquisBus: GainNode;
  private readonly mountainBus: GainNode;
  private readonly ridgeBus: GainNode;
  private ridge = 0;
  private nextLark = 0;
  private readonly goats: Goat[] = [];
  private readonly rustle: GainNode;
  private nextRustle = 0;
  private nextHopper = 0;
  private readonly padBus: GainNode;
  private readonly duskBus: GainNode;
  private readonly riverBus: GainNode;
  private readonly riverTone: BiquadFilterNode;
  private readonly riverPan: StereoPannerNode;
  private readonly chatter: Array<{ gain: GainNode; level: number }> = [];
  private readonly riverLine = riverCentreLine();
  private nextChatter = 0;
  private nextRaptor = 0;
  private nextChoughs = 0;
  private nextRaven = 0;
  private river = 0;
  private readonly isletBus: GainNode;
  private readonly isletPan: StereoPannerNode;
  private readonly isletIn: BiquadFilterNode;
  private readonly isletSurge: GainNode;
  private readonly isletSplash: GainNode;
  private readonly isletSpray: GainNode;
  private islet = 0;
  private nextIsletWave = 0;
  private nextIsletGull = 0;
  private readonly isletPoint = new THREE.Vector3(ISLET.x, 5, ISLET.z);
  private nextCricket = 0;
  private readonly birdBus: GainNode;
  private readonly waves: WaveVoice[] = [];
  private readonly cicadas: Array<{ pulse: GainNode; period: number; next: number; phraseStart: number; phraseEnd: number }> = [];
  private readonly whistles: Whistle[] = [];
  private readonly windBody: GainNode;
  private readonly windAir: GainNode;
  private readonly white: AudioBuffer;
  private nextWave = 0;
  private waveVoice = 0;
  private nextBird = 0;
  private nextNearGull = 0;
  private nextFarGull = 0;
  private nextGust = 0;
  private nextBlackbird = 0;
  private evening = 0;
  private maquis = 0;
  private gulls = 0;
  private mountain = 0;
  private lastUpdate = -Infinity;

  constructor(private readonly ctx: BaseAudioContext, private readonly random: () => number = Math.random) {
    // Output chain: a low-pass that closes at dusk, then a gentle compressor.
    this.output = this.gain(0);
    this.tone = this.filter('lowpass', 7000, 0.5);
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.05;
    compressor.release.value = 0.6;
    this.tone.connect(compressor).connect(this.output).connect(ctx.destination);

    // Shared space: every layer sends a little into the same reverb, which glues them together.
    this.space = ctx.createConvolver();
    this.space.buffer = this.impulse(3.2);
    this.space.connect(this.gain(0.8)).connect(this.tone);

    const brown = this.brownNoise(6);
    this.white = this.whiteNoise(4);

    // --- Sea. Long stereo pink noise (left and right independent) gives width and never
    // audibly loops; each voice plays it at a slightly different speed so nothing lines up.
    // The sea's top end is softened and its sub-rumble removed before it reaches the bus.
    this.seaBus = this.bus(0.25);
    const pink = this.pinkNoise(14);
    const seaIn = this.filter('highpass', 45, 0.5);
    const seaShelf = this.ctx.createBiquadFilter();
    seaShelf.type = 'highshelf';
    seaShelf.frequency.value = 4500;
    seaShelf.gain.value = -7;
    seaIn.connect(seaShelf).connect(this.seaBus);

    // A rolling bed that never stops, breathing slowly.
    const bed = this.gain(0.1);
    const breath = this.ctx.createOscillator();
    breath.frequency.value = 0.05;
    breath.connect(this.gain(0.03)).connect(bed.gain);
    breath.start();
    this.loop(pink, 0.97).connect(this.filter('lowpass', 650, 0.5)).connect(bed).connect(seaIn);

    // Overlapping waves: a body that opens up as it breaks, and the foam that hisses back.
    for (let i = 0; i < 4; i++) {
      const pan = this.panner(0);
      pan.connect(seaIn);
      const bodyFilter = this.filter('lowpass', 300, 0.3);
      const body = this.gain(0);
      this.loop(pink, 0.95 + this.random() * 0.1).connect(bodyFilter).connect(body).connect(pan);
      const foam = this.gain(0);
      this.loop(pink, 0.95 + this.random() * 0.1)
        .connect(this.filter('highpass', 1800, 0.5))
        .connect(this.filter('lowpass', 7000, 0.5))
        .connect(foam)
        .connect(pan);
      this.waves.push({ body, bodyFilter, foam, pan });
    }

    // --- Islet: surf on the rocks. A constant wash, and per wave a rising surge, a splash
    // as it hits the rock (with a low thud) and a hiss of spray running back off it.
    // All through a distance filter and a panner, like the river.
    this.isletBus = this.bus(0.4);
    this.isletPan = this.panner(0);
    this.isletIn = this.filter('lowpass', 5000, 0.5);
    this.isletIn.connect(this.isletPan).connect(this.isletBus);
    this.loop(pink, 0.98)
      .connect(this.filter('highpass', 250, 0.5))
      .connect(this.filter('lowpass', 2500, 0.5))
      .connect(this.gain(0.035))
      .connect(this.isletIn);
    this.isletSurge = this.gain(0);
    this.loop(pink, 1.02).connect(this.filter('lowpass', 600, 0.5)).connect(this.isletSurge).connect(this.isletIn);
    this.isletSplash = this.gain(0);
    this.loop(pink, 0.97).connect(this.filter('bandpass', 1400, 0.6)).connect(this.isletSplash).connect(this.isletIn);
    this.isletSpray = this.gain(0);
    this.loop(pink, 1.03).connect(this.filter('highpass', 3000, 0.5)).connect(this.isletSpray).connect(this.isletIn);

    // --- Gulls over the coast: a distant colony and nearer birds, each call shaped on its own.
    this.gullBus = this.bus(0.5);

    // --- Maquis: birds (scheduled one by one), cicadas, a rustle of leaves.
    this.maquisBus = this.bus(0.12);
    this.birdBus = this.gain(1);
    this.birdBus.connect(this.maquisBus);

    // Cicadas (Cicada orni, the maquis cicada): a rhythmic "tchic-tchic-tchic". Each pulse is a
    // very fast train of tymbal clicks (noise chopped by a sawtooth at a few hundred hertz),
    // which gives the dry, metallic grain; pulses come four to six times a second.
    // [band centre, click rate, pan, distance low-pass, level]: one near, two further off.
    for (const [centre, clicks, pan, distance, level] of [
      [4300, 260, -0.55, 7500, 0.3],
      [5000, 300, 0.5, 5500, 0.17],
      [4700, 230, 0.1, 4500, 0.12],
    ] as const) {
      const grain = this.gain(0.5);
      const tymbal = this.ctx.createOscillator();
      tymbal.type = 'sawtooth';
      tymbal.frequency.value = clicks;
      tymbal.connect(this.gain(0.5)).connect(grain.gain);
      tymbal.start();
      const pulse = this.gain(0);
      this.loop(this.white)
        .connect(this.filter('bandpass', centre, 3.5))
        .connect(this.filter('highpass', 2800, 0.7))
        .connect(grain)
        .connect(pulse)
        .connect(this.filter('lowpass', distance, 0.5))
        .connect(this.gain(level))
        .connect(this.panner(pan))
        .connect(this.maquisBus);
      this.cicadas.push({ pulse, period: 0.17 + this.random() * 0.07, next: 0, phraseStart: 0, phraseEnd: 0 });
    }

    // Leaves: a light, high rustle whose level flickers irregularly. No slow low sweep:
    // that read as surf, as if the sea were still there.
    this.rustle = this.gain(0.03);
    this.loop(pink, 1.04)
      .connect(this.filter('highpass', 2200, 0.5))
      .connect(this.filter('lowpass', 6500, 0.5))
      .connect(this.rustle)
      .connect(this.maquisBus);

    // --- River: noise only, nothing pitched. A light low rumble, a steady wash of water, and
    // four wide bands whose levels flicker irregularly: water running over stones. The wash
    // does not swell slowly and the rumble stays small, so the river never sounds like surf.
    // All of it goes through a tone filter (closer = brighter) and a panner.
    this.riverBus = this.bus(0.3);
    this.riverTone = this.filter('lowpass', 3000, 0.5);
    this.riverPan = this.panner(0);
    this.riverTone.connect(this.riverPan).connect(this.riverBus);

    this.loop(pink, 1.01).connect(this.filter('lowpass', 350, 0.5)).connect(this.gain(0.025)).connect(this.riverTone);
    const wash = this.gain(0.07);
    this.loop(pink, 0.99)
      .connect(this.filter('highpass', 400, 0.5))
      .connect(this.filter('lowpass', 5000, 0.5))
      .connect(wash)
      .connect(this.riverTone);

    for (const [centre, level] of [[500, 0.05], [1100, 0.075], [2200, 0.06], [4000, 0.025]] as const) {
      const flicker = this.gain(level);
      this.loop(pink, 0.97 + this.random() * 0.06)
        .connect(this.filter('bandpass', centre, 1.2))
        .connect(flicker)
        .connect(this.riverTone);
      this.chatter.push({ gain: flicker, level });
    }

    // --- Crests: a soft breeze in the grass (a broad band plus a light hiss, both breathing
    // slowly); the skylark, goat bells and grasshoppers are scheduled one by one.
    this.ridgeBus = this.bus(0.3);
    // Five goats, each with its own bell: base pitch anywhere in a wide range, and its own
    // irregular partials, so no two bells agree and together they never form a tune.
    for (let i = 0; i < 5; i++) {
      const r = () => this.random();
      this.goats.push({
        base: 520 + r() * 800,
        partials: [
          [1, 1, 0.12 + r() * 0.08],
          [2.05 + r() * 0.6, 0.6 + r() * 0.3, 0.07 + r() * 0.06],
          [3.3 + r() * 0.9, 0.35 + r() * 0.3, 0.05 + r() * 0.04],
          [5.1 + r() * 1.4, 0.2 + r() * 0.2, 0.03 + r() * 0.03],
        ],
        pan: -0.75 + r() * 0.7,
        next: 0,
      });
    }
    const breeze = this.gain(0.06);
    const breezeDrift = this.ctx.createOscillator();
    breezeDrift.frequency.value = 0.07;
    breezeDrift.connect(this.gain(0.025)).connect(breeze.gain);
    breezeDrift.start();
    this.loop(pink, 0.96).connect(this.filter('bandpass', 700, 0.5)).connect(breeze).connect(this.ridgeBus);
    const grass = this.gain(0.012);
    const grassDrift = this.ctx.createOscillator();
    grassDrift.frequency.value = 0.09;
    grassDrift.connect(this.gain(0.006)).connect(grass.gain);
    grassDrift.start();
    this.loop(pink, 1.03)
      .connect(this.filter('highpass', 2500, 0.5))
      .connect(this.filter('lowpass', 7000, 0.5))
      .connect(grass)
      .connect(this.ridgeBus);

    // --- Mountains: summit wind. A low body and a breath of air that swell with each gust,
    // and narrow whistles whose pitch rises as the gust strengthens.
    this.mountainBus = this.bus(0.35);
    this.windBody = this.gain(0.1);
    this.loop(brown).connect(this.filter('bandpass', 380, 0.7)).connect(this.windBody).connect(this.mountainBus);
    this.windAir = this.gain(0.004);
    this.loop(this.white).connect(this.filter('bandpass', 3000, 0.5)).connect(this.windAir).connect(this.mountainBus);
    for (const [pitch, level, pan] of WHISTLES) {
      const filter = this.filter('bandpass', pitch, 22);
      const gain = this.gain(level * 0.15);
      this.loop(this.white).connect(filter).connect(gain).connect(this.panner(pan)).connect(this.mountainBus);
      this.whistles.push({ filter, gain, pitch, level });
    }

    // A very faint, distant rotor under the wind.
    const rotorBeat = this.gain(0.5);
    const blades = this.ctx.createOscillator();
    blades.frequency.value = 4.6;
    blades.connect(this.gain(0.5)).connect(rotorBeat.gain);
    blades.start();
    const rotorPan = this.panner(0);
    const pass = this.ctx.createOscillator();
    pass.frequency.value = 0.025;
    pass.connect(this.gain(0.6)).connect(rotorPan.pan);
    pass.start();
    this.loop(brown)
      .connect(this.filter('lowpass', 170, 0.7))
      .connect(rotorBeat)
      .connect(this.gain(0.03))
      .connect(rotorPan)
      .connect(this.mountainBus);

    // --- Sunset: blackbirds and a lone cricket, scheduled note by note, well inside the reverb.
    this.duskBus = this.bus(0.45);

    // --- Dusk: a very low root and fifth under the lapping.
    this.padBus = this.bus(0.4);
    const padTone = this.filter('lowpass', 420, 0.4);
    padTone.connect(this.padBus);
    for (const [freq, detune, level] of [[110, -3, 0.5], [164.81, 4, 0.3]] as const) {
      const osc = this.ctx.createOscillator();
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(this.gain(level)).connect(padTone);
      osc.start();
    }
  }

  fadeTo(on: boolean): void {
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(on ? MASTER_LEVEL : 0, now, on ? 0.8 : 0.2);
  }

  /** `listener` places the river; without it (e.g. offline tests) the river sits centred at full distance level. */
  update(progress: number, listener?: Listener): void {
    const now = this.ctx.currentTime;
    this.scheduleWaves(now);
    this.scheduleRiver(now);
    this.scheduleIslet(now);
    this.scheduleRustle(now);
    this.scheduleGulls(now);
    this.scheduleBirds(now);
    this.scheduleCicadas(now);
    this.scheduleDusk(now);
    this.scheduleGusts(now);
    this.scheduleSummitBirds(now);
    this.scheduleRidge(now);
    if (now - this.lastUpdate < UPDATE_INTERVAL) return;
    this.lastUpdate = now;

    const mix = soundscapeMix(progress);
    this.evening = mix.evening;
    this.maquis = mix.maquis;
    this.gulls = mix.gulls;
    this.mountain = mix.mountain;

    this.seaBus.gain.setTargetAtTime(mix.sea, now, GLIDE);
    this.gullBus.gain.setTargetAtTime(mix.gulls, now, GLIDE);
    this.maquisBus.gain.setTargetAtTime(mix.maquis, now, GLIDE);
    this.mountainBus.gain.setTargetAtTime(mix.mountain, now, GLIDE);
    this.ridge = mix.ridge;
    this.ridgeBus.gain.setTargetAtTime(1.8 * mix.ridge, now, GLIDE);
    this.padBus.gain.setTargetAtTime(0.012 * smoothstep(0.92, 1, progress), now, GLIDE * 2);
    this.duskBus.gain.setTargetAtTime(smoothstep(0.9, 1, progress), now, GLIDE * 2);

    // Islet: level from the route window and the real distance, side from the view direction.
    const isletPlace = listener ? this.placeAt(this.isletPoint, ISLET_NEAR, listener) : { nearness: 1, pan: 0 };
    this.islet = mix.islet * isletPlace.nearness;
    this.isletBus.gain.setTargetAtTime(this.islet, now, GLIDE);
    this.isletPan.pan.setTargetAtTime(isletPlace.pan, now, 0.6);
    this.isletIn.frequency.setTargetAtTime(2000 + 4000 * isletPlace.nearness, now, GLIDE);

    // River: level from the route window and the real distance, side from the view direction.
    const place = listener ? this.placeRiver(listener) : { nearness: 1, pan: 0 };
    this.river = mix.river * place.nearness;
    this.riverBus.gain.setTargetAtTime(2 * this.river, now, GLIDE);
    this.riverPan.pan.setTargetAtTime(place.pan, now, 0.6);
    this.riverTone.frequency.setTargetAtTime(1800 + 4200 * place.nearness, now, GLIDE);
    // Switching the day off: the mix loses some brightness, but keeps the birdsong clear.
    this.tone.frequency.setTargetAtTime(7000 - 3000 * mix.evening, now, GLIDE * 2);
  }

  /**
   * Waves overlap on four voices. Each swells slowly, opens up into a broadband crash as
   * it breaks, then draws back as a long hiss of foam while its filter closes again.
   * At sunset they shrink to a short, soft, dark lapping with no foam.
   */
  private scheduleWaves(now: number): void {
    while (this.nextWave < now + 1) {
      const start = Math.max(this.nextWave, now + 0.05);
      const voice = this.waves[this.waveVoice];
      this.waveVoice = (this.waveVoice + 1) % this.waves.length;
      const calm = this.evening;
      const r = () => this.random();

      const lerp = (day: number, night: number) => day + (night - day) * calm;
      // Daytime: long, slow swells that break gradually and draw back for a long time.
      const rise = lerp(4 + r() * 2.5, 0.9 + r() * 0.8);
      const fall = lerp(8 + r() * 4, 2.2 + r() * 1.5);
      const peak = (0.18 + r() * 0.12) * lerp(1, 0.55);
      const open = lerp(1400 + r() * 800, 420 + r() * 160);
      const breakAt = start + rise;

      voice.pan.pan.setTargetAtTime(r() * 1.2 - 0.6, start, 0.8);

      voice.body.gain.cancelScheduledValues(start);
      voice.body.gain.setTargetAtTime(peak, start, rise / 2.5);
      voice.body.gain.setTargetAtTime(0, breakAt, fall / 3.5);

      voice.bodyFilter.frequency.cancelScheduledValues(start);
      voice.bodyFilter.frequency.setTargetAtTime(open, start + rise * 0.4, rise / 3);
      voice.bodyFilter.frequency.setTargetAtTime(350, breakAt + 0.3, fall / 3);

      voice.foam.gain.cancelScheduledValues(start);
      // The crash builds over about a second rather than snapping in.
      voice.foam.gain.setTargetAtTime(peak * 0.25 * (1 - calm), breakAt - 0.6, lerp(0.5, 0.15));
      voice.foam.gain.setTargetAtTime(0, breakAt + 0.5, fall / 3);

      this.nextWave = start + lerp(6 + r() * 4, 1.4 + r() * 2);
    }
  }

  /**
   * How near the river is (1 within RIVER_NEAR metres, falling off beyond) and where it
   * sits left–right in the listener's view, from the closest point of its centre line.
   */
  private placeRiver({ position, forward }: Listener): { nearness: number; pan: number } {
    let closest = this.riverLine[0];
    let best = Infinity;
    for (const point of this.riverLine) {
      const d = point.distanceToSquared(position);
      if (d < best) {
        best = d;
        closest = point;
      }
    }
    return this.placeAt(closest, RIVER_NEAR, { position, forward });
  }

  /** Nearness (1 within `near` metres, falling off beyond) and left–right pan of a point. */
  private placeAt(point: THREE.Vector3, near: number, { position, forward }: Listener): { nearness: number; pan: number } {
    const distance = point.distanceTo(position);
    const nearness = Math.min(1, Math.pow(near / Math.max(distance, 1), 1.4));
    const toPoint = this.scratch.subVectors(point, position).setY(0).normalize();
    const right = this.scratch2.set(-forward.z, 0, forward.x).normalize();
    return { nearness, pan: THREE.MathUtils.clamp(toPoint.dot(right), -1, 1) * 0.7 };
  }

  /**
   * Islet surf: a wave every six to ten seconds. The surge swells over a couple of seconds,
   * the splash hits as it meets the rock, and the spray hisses back down for a few seconds.
   * Gulls call now and then about the lighthouse.
   */
  private scheduleIslet(now: number): void {
    if (this.islet < 0.02) {
      this.nextIsletWave = this.nextIsletGull = now + 1;
      return;
    }
    const r = () => this.random();
    while (this.nextIsletWave < now + 1) {
      const start = Math.max(this.nextIsletWave, now + 0.05);
      const swell = 1.6 + r() * 1.2;
      const hit = start + swell;
      const size = 0.6 + r() * 0.4;

      this.isletSurge.gain.cancelScheduledValues(start);
      this.isletSurge.gain.setTargetAtTime(0.12 * size, start, swell / 3);
      this.isletSurge.gain.setTargetAtTime(0, hit + 0.3, 1.2);

      this.isletSplash.gain.cancelScheduledValues(start);
      this.isletSplash.gain.setTargetAtTime(0.09 * size, hit - 0.1, 0.08);
      this.isletSplash.gain.setTargetAtTime(0, hit + 0.25, 0.7);

      this.isletSpray.gain.cancelScheduledValues(start);
      this.isletSpray.gain.setTargetAtTime(0.025 * size, hit, 0.15);
      this.isletSpray.gain.setTargetAtTime(0, hit + 0.6, 1.4);

      this.nextIsletWave = start + 6 + r() * 4;
    }
    while (this.nextIsletGull < now + 0.5) {
      const start = Math.max(this.nextIsletGull, now + 0.05);
      this.gullCall(start, 0.35 + r() * 0.3, 1000 + r() * 400, 0.12 + r() * 0.08, r() * 0.8 - 0.4, 0.3, this.isletIn);
      this.nextIsletGull = start + 4 + r() * 6;
    }
  }

  private readonly scratch = new THREE.Vector3();
  private readonly scratch2 = new THREE.Vector3();

  /** Leaves: the rustle's level flickers irregularly, like small gusts moving through the maquis. */
  private scheduleRustle(now: number): void {
    if (this.maquis < 0.02) {
      this.nextRustle = now + 0.2;
      return;
    }
    while (this.nextRustle < now + 0.3) {
      const start = Math.max(this.nextRustle, now + 0.02);
      this.rustle.gain.setTargetAtTime(0.03 * (0.15 + this.random() * 0.85), start, 0.05 + this.random() * 0.15);
      this.nextRustle = start + 0.12 + this.random() * 0.4;
    }
  }

  /** River texture: each band's level flickers on its own, a few tens of times a second. */
  private scheduleRiver(now: number): void {
    if (this.river < 0.02) {
      this.nextChatter = now + 0.2;
      return;
    }
    while (this.nextChatter < now + 0.3) {
      const start = Math.max(this.nextChatter, now + 0.02);
      for (const band of this.chatter) {
        band.gain.gain.setTargetAtTime(band.level * (0.35 + this.random() * 0.65), start, 0.02 + this.random() * 0.03);
      }
      this.nextChatter = start + 0.04 + this.random() * 0.07;
    }
  }

  /**
   * Crests. A skylark sings long, fast, warbling phrases from above, drifting across the sky;
   * a herd of goats moves somewhere below, each goat's bell with its own note; and now and
   * then a grasshopper gives a dry little run of clicks.
   */
  private scheduleRidge(now: number): void {
    if (this.ridge < 0.02) {
      this.nextLark = now + 1 + this.random() * 2;
      for (const goat of this.goats) goat.next = now + this.random() * 6;
      this.nextHopper = now + 1.5;
      return;
    }
    const r = () => this.random();

    while (this.nextLark < now + 0.5) {
      const start = Math.max(this.nextLark, now + 0.05);
      const length = 4 + r() * 5;
      const fromPan = r() * 1.2 - 0.6;
      const toPan = THREE.MathUtils.clamp(fromPan + (r() - 0.5) * 0.6, -0.8, 0.8);
      let t = start;
      while (t < start + length) {
        const k = (t - start) / length;
        const from = 2600 + r() * 2600;
        const to = from * (0.8 + r() * 0.45);
        const note = 0.03 + r() * 0.06;
        this.ridgeNote(t, note, from, to, 0.018 + r() * 0.01, fromPan + (toPan - fromPan) * k);
        t += note + 0.005 + r() * 0.025;
      }
      this.nextLark = t + 2 + r() * 4;
    }

    // Each goat shakes its bell on its own: a short, irregular burst of clanks as it moves
    // its head to graze, then a pause of a few seconds. No common rhythm, no tune.
    for (const goat of this.goats) {
      while (goat.next < now + 0.5) {
        let t = Math.max(goat.next, now + 0.05);
        const clanks = 1 + Math.floor(r() * 4);
        for (let i = 0; i < clanks; i++) {
          this.goatBell(goat, t, 0.4 + r() * 0.6);
          t += 0.08 + r() * 0.28;
        }
        goat.next = t + 1 + r() * 7;
      }
    }

    while (this.nextHopper < now + 0.5) {
      const start = Math.max(this.nextHopper, now + 0.05);
      const pan = r() * 1.4 - 0.7;
      const clicks = 3 + Math.floor(r() * 4);
      for (let i = 0; i < clicks; i++) this.click(start + i * (0.05 + r() * 0.02), 0.02, pan);
      this.nextHopper = start + 2 + r() * 4;
    }
  }

  private ridgeNote(start: number, length: number, from: number, to: number, level: number, pan: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + length);
    const env = this.gain(0);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(level, start + 0.006);
    env.gain.setTargetAtTime(0, start + length * 0.6, length / 5);
    osc.connect(env).connect(this.panner(pan)).connect(this.ridgeBus);
    osc.start(start);
    osc.stop(start + length * 2);
  }

  /**
   * One clank: the clapper's metallic knock (a burst of band-passed noise) and the bell's
   * own short, inharmonic partials, then often a weaker bounce of the clapper just after.
   */
  private goatBell(goat: Goat, start: number, force: number): void {
    const r = () => this.random();
    const out = this.filter('lowpass', 3500, 0.5); // distance: the herd is below, not close
    out.connect(this.gain(0.016)).connect(this.panner(goat.pan)).connect(this.ridgeBus);

    const strike = (t: number, strength: number) => {
      const knock = this.ctx.createBufferSource();
      knock.buffer = this.white;
      const knockEnv = this.gain(0);
      knockEnv.gain.setValueAtTime(0, t);
      knockEnv.gain.linearRampToValueAtTime(0.5 * strength, t + 0.001);
      knockEnv.gain.setTargetAtTime(0, t + 0.002, 0.006);
      knock.connect(this.filter('bandpass', 2400 + r() * 800, 1.2)).connect(knockEnv).connect(out);
      knock.start(t, r() * 3);
      knock.stop(t + 0.05);

      for (const [ratio, amp, decay] of goat.partials) {
        const osc = this.ctx.createOscillator();
        // Dented metal: every hit lands slightly off the bell's nominal partials.
        osc.frequency.value = goat.base * ratio * (0.99 + r() * 0.02);
        const env = this.gain(0);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(amp * strength * (0.6 + r() * 0.4), t + 0.002);
        env.gain.setTargetAtTime(0, t + 0.002, decay);
        osc.connect(env).connect(out);
        osc.start(t);
        osc.stop(t + decay * 6);
      }
    };

    strike(start, force);
    if (r() < 0.6) strike(start + 0.025 + r() * 0.035, force * (0.3 + r() * 0.2));
  }

  /** A dry click: a few milliseconds of high, band-passed noise. */
  private click(start: number, level: number, pan: number): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.white;
    const env = this.gain(0);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(level, start + 0.001);
    env.gain.setTargetAtTime(0, start + 0.002, 0.004);
    s.connect(this.filter('bandpass', 6500, 3)).connect(env).connect(this.panner(pan)).connect(this.ridgeBus);
    s.start(start, this.random() * 3);
    s.stop(start + 0.03);
  }

  /**
   * Birds of the heights, all far off and deep in the reverb: a raptor's long mewing cry,
   * small flocks of alpine choughs whistling, and now and then a raven croaking.
   */
  private scheduleSummitBirds(now: number): void {
    if (this.mountain < 0.02) {
      this.nextRaptor = now + 2 + this.random() * 3;
      this.nextChoughs = now + 4 + this.random() * 4;
      this.nextRaven = now + 8 + this.random() * 8;
      return;
    }
    const r = () => this.random();

    while (this.nextRaptor < now + 0.5) {
      const start = Math.max(this.nextRaptor, now + 0.05);
      const pan = r() * 1.4 - 0.7;
      this.raptorCry(start, pan, 1);
      // Often a second, shorter cry follows.
      if (r() < 0.5) this.raptorCry(start + 1.3 + r() * 0.6, pan, 0.7);
      this.nextRaptor = start + 7 + r() * 7;
    }

    while (this.nextChoughs < now + 0.5) {
      const start = Math.max(this.nextChoughs, now + 0.05);
      const centre = r() * 1.2 - 0.6;
      const calls = 2 + Math.floor(r() * 4);
      for (let i = 0; i < calls; i++) {
        const t = start + r() * 1.6;
        const f = 2900 + r() * 400;
        const osc = this.ctx.createOscillator();
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 1.2, t + 0.05);
        osc.frequency.exponentialRampToValueAtTime(f * 0.88, t + 0.17);
        this.voice(osc, t, 0.17, 0.012, 0.028 + r() * 0.012, centre + r() * 0.4 - 0.2, 4500);
      }
      this.nextChoughs = start + 9 + r() * 10;
    }

    while (this.nextRaven < now + 0.5) {
      const start = Math.max(this.nextRaven, now + 0.05);
      const pan = r() * 1.2 - 0.6;
      const croaks = 2 + Math.floor(r() * 2);
      for (let i = 0; i < croaks; i++) {
        const t = start + i * (0.42 + r() * 0.12);
        const f = 300 + r() * 50;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.22);
        // A fast flutter makes the croak rough, like a throat rather than a tone.
        const rough = this.ctx.createOscillator();
        rough.frequency.value = 42 + r() * 10;
        const roughness = this.gain(0.6);
        rough.connect(this.gain(0.4)).connect(roughness.gain);
        rough.start(t);
        rough.stop(t + 0.3);
        osc.connect(this.filter('bandpass', 900, 1.5)).connect(roughness);
        this.voice(roughness, t, 0.22, 0.02, 0.05, pan, 1800, osc);
      }
      this.nextRaven = start + 18 + r() * 17;
    }
  }

  /** A raptor's mewing cry: a quick rise, then a long fall, with a slight wavering. */
  private raptorCry(start: number, pan: number, scale: number): void {
    const r = () => this.random();
    const length = (0.9 + r() * 0.4) * scale;
    const base = 1800 + r() * 250;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, start);
    osc.frequency.linearRampToValueAtTime(base * 1.22, start + 0.14);
    osc.frequency.exponentialRampToValueAtTime(base * 0.68, start + length);
    const waver = this.ctx.createOscillator();
    waver.frequency.value = 6 + r() * 3;
    waver.connect(this.gain(base * 0.02)).connect(osc.frequency);
    waver.start(start);
    waver.stop(start + length + 0.3);
    const shaped = this.filter('bandpass', 2000, 1);
    osc.connect(shaped);
    this.voice(shaped, start, length, 0.08, 0.05 * scale, pan, 3500, osc);
  }

  /**
   * Plays a one-shot sound: envelope, distance low-pass, pan, then into the mountain bus.
   * `source` is the node fed in; `oscillator` (if different) is the one to start and stop.
   */
  private voice(
    source: AudioNode, start: number, length: number, attack: number, level: number, pan: number,
    distance: number, oscillator: OscillatorNode = source as OscillatorNode,
  ): void {
    const env = this.gain(0);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(level, start + attack);
    env.gain.setTargetAtTime(0, start + length * 0.7, length / 6);
    source.connect(this.filter('lowpass', distance, 0.5)).connect(env).connect(this.panner(pan)).connect(this.mountainBus);
    oscillator.start(start);
    oscillator.stop(start + length + 0.3);
  }

  /** A distant colony calling often and faintly, and nearer gulls that answer each other. */
  private scheduleGulls(now: number): void {
    if (this.gulls < 0.02) {
      this.nextNearGull = this.nextFarGull = now + 0.3;
      return;
    }
    const r = () => this.random();

    while (this.nextFarGull < now + 0.5) {
      const start = Math.max(this.nextFarGull, now + 0.05);
      this.gullCall(start, 0.3 + r() * 0.3, 1000 + r() * 500, 0.04 + r() * 0.04, r() * 1.8 - 0.9, 0);
      this.nextFarGull = start + 0.5 + r() * 1.3;
    }

    while (this.nextNearGull < now + 0.5) {
      const start = Math.max(this.nextNearGull, now + 0.05);
      const pan = r() * 1.6 - 0.8;
      const near = 0.4 + r() * 0.6;
      const level = 0.14 + r() * 0.12;
      const base = 950 + r() * 350;

      if (r() < 0.35) {
        // A "laughing" run: uneven spacing, falling pitch, fading out.
        const notes = 3 + Math.floor(r() * 4);
        let t = start;
        for (let i = 0; i < notes; i++) {
          this.gullCall(t, 0.12 + r() * 0.06, base * (1.15 - i * 0.035), level * (1 - i * 0.1), pan, near);
          t += 0.16 + r() * 0.1;
        }
      } else {
        this.gullCall(start, 0.4 + r() * 0.35, base, level, pan, near);
      }
      // Another gull often answers from somewhere else.
      if (r() < 0.4) {
        this.gullCall(start + 0.3 + r() * 0.6, 0.3 + r() * 0.25, base * (0.9 + r() * 0.25), level * 0.7, -pan * 0.8, near * 0.7);
      }
      this.nextNearGull = start + 1.4 + r() * 2.8;
    }
  }

  /**
   * One gull call. Pitch contour, vibrato and length vary on every call so no two sound alike;
   * two formant bands soften the raw sawtooth into the gull's nasal cry.
   * `near` (0–1) opens the filter and raises the level for closer birds.
   */
  private gullCall(
    start: number, length: number, base: number, level: number, pan: number, near: number,
    destination: AudioNode = this.gullBus,
  ): void {
    const r = () => this.random();
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 0.9, start);
    osc.frequency.exponentialRampToValueAtTime(base * (1.3 + r() * 0.3), start + length * (0.12 + r() * 0.18));
    osc.frequency.exponentialRampToValueAtTime(base * (0.7 + r() * 0.15), start + length);

    const vibrato = this.ctx.createOscillator();
    vibrato.frequency.value = 12 + r() * 10;
    vibrato.connect(this.gain(base * (0.015 + r() * 0.025))).connect(osc.frequency);

    const voice = this.gain(1);
    osc.connect(this.filter('bandpass', 1200, 3)).connect(this.gain(0.6)).connect(voice);
    osc.connect(this.filter('bandpass', 2400, 4)).connect(this.gain(0.4)).connect(voice);

    const env = this.gain(0);
    env.gain.setValueAtTime(0, start);
    env.gain.setTargetAtTime(level, start, 0.02);
    env.gain.setTargetAtTime(0, start + length * (0.55 + r() * 0.2), length * 0.15);

    voice
      .connect(this.filter('lowpass', 1500 + near * 1800, 0.6))
      .connect(env)
      .connect(this.panner(pan))
      .connect(destination);
    for (const node of [osc, vibrato]) {
      node.start(start);
      node.stop(start + length + 0.3);
    }
  }

  /** Summit gusts: the wind swells, its whistles climb, then it settles back, never to silence. */
  private scheduleGusts(now: number): void {
    if (this.mountain < 0.015) {
      this.nextGust = now + 0.3;
      return;
    }
    while (this.nextGust < now + 0.5) {
      const start = Math.max(this.nextGust, now + 0.05);
      const r = () => this.random();
      const strength = 0.35 + r() * 0.65;
      const rise = 1.2 + r() * 2;
      const fall = 2 + r() * 3;
      const settle = start + rise;

      this.windBody.gain.cancelScheduledValues(start);
      this.windBody.gain.setTargetAtTime(0.12 + 0.2 * strength, start, rise / 3);
      this.windBody.gain.setTargetAtTime(0.1, settle, fall / 3);
      this.windAir.gain.cancelScheduledValues(start);
      this.windAir.gain.setTargetAtTime(0.004 + 0.009 * strength, start, rise / 3);
      this.windAir.gain.setTargetAtTime(0.004, settle, fall / 3);

      for (const w of this.whistles) {
        w.filter.frequency.cancelScheduledValues(start);
        w.filter.frequency.setTargetAtTime(w.pitch * (1 + 0.22 * strength + r() * 0.05), start, rise / 3);
        w.filter.frequency.setTargetAtTime(w.pitch * (0.95 + r() * 0.06), settle, fall / 3);
        w.gain.gain.cancelScheduledValues(start);
        w.gain.gain.setTargetAtTime(w.level * strength * (0.6 + r() * 0.4), start, rise / 3);
        w.gain.gain.setTargetAtTime(w.level * 0.15, settle, fall / 3);
      }
      this.nextGust = start + 2.5 + r() * 3.5;
    }
  }

  /** Short sine calls: single chirps, little trills, and two-note whistles. */
  private scheduleBirds(now: number): void {
    if (this.maquis < 0.02) {
      this.nextBird = now + 0.5;
      return;
    }
    while (this.nextBird < now + 0.5) {
      const start = Math.max(this.nextBird, now + 0.05);
      const pan = this.random() * 1.4 - 0.7;
      const level = 0.1 + this.random() * 0.08;
      const kind = this.random();

      if (kind < 0.4) {
        const from = 3800 + this.random() * 900;
        this.note(start, 0.09, from, from * 0.68, level, pan);
      } else if (kind < 0.75) {
        const base = 3000 + this.random() * 1200;
        const notes = 4 + Math.floor(this.random() * 5);
        for (let i = 0; i < notes; i++) {
          const f = base + (this.random() - 0.5) * 300;
          this.note(start + i * 0.075, 0.045, f, f + 280, level * 0.8, pan);
        }
      } else {
        const f = 1900 + this.random() * 500;
        this.note(start, 0.2, f, f * 1.35, level, pan);
        this.note(start + 0.26, 0.24, f * 1.3, f * 1.05, level * 0.9, pan);
      }
      this.nextBird = start + 0.9 + this.random() * 2.8;
    }
  }

  private note(start: number, length: number, from: number, to: number, level: number, pan: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + length);
    const env = this.gain(0);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(level, start + Math.min(0.012, length / 3));
    env.gain.setTargetAtTime(0, start + length * 0.4, length / 4);
    osc.connect(env).connect(this.panner(pan)).connect(this.birdBus);
    osc.start(start);
    osc.stop(start + length * 2);
  }

  /**
   * Sunset. A blackbird sings short fluted phrases ending in a little twitter, now and then
   * answered by a second one further away. A single cricket only starts right at the end.
   */
  private scheduleDusk(now: number): void {
    const dusk = this.evening;
    const r = () => this.random();

    if (dusk < 0.3) {
      this.nextBlackbird = now + 1 + r() * 2;
    } else {
      while (this.nextBlackbird < now + 0.5) {
        const start = Math.max(this.nextBlackbird, now + 0.05);
        const end = this.blackbirdPhrase(start, 0.05, 0.35, 2200);
        if (r() < 0.35) this.blackbirdPhrase(end + 0.8 + r() * 1.2, 0.022, -0.6, 1600);
        this.nextBlackbird = end + 3.5 + r() * 3.5;
      }
    }

    if (dusk < 0.85) {
      this.nextCricket = now + 2;
      return;
    }
    while (this.nextCricket < now + 0.5) {
      const start = Math.max(this.nextCricket, now + 0.05);
      const pulses = 2 + Math.floor(r() * 2);
      for (let i = 0; i < pulses; i++) {
        this.softNote(start + i * (0.038 + r() * 0.006), 0.016, 4450 * (0.99 + r() * 0.02), 0.014, 0.25, this.duskBus);
      }
      // Hesitant, with pauses: the evening is only just starting.
      this.nextCricket = start + (r() < 0.3 ? 2 + r() * 3 : 0.7 + r() * 0.4);
    }
  }

  /**
   * One blackbird phrase: a few fluted notes gliding between degrees of a pentatonic scale,
   * then a quick high twitter. `lowFilter` darkens more distant birds. Returns its end time.
   */
  private blackbirdPhrase(start: number, level: number, pan: number, lowFilter: number): number {
    const r = () => this.random();
    const scale = [1568, 1760, 2093, 2349, 2637, 3136];
    const bus = this.filter('lowpass', lowFilter + 1500, 0.5);
    bus.connect(this.duskBus);
    let t = start;
    const notes = 3 + Math.floor(r() * 4);
    for (let i = 0; i < notes; i++) {
      const pitch = scale[Math.floor(r() * scale.length)] * (0.98 + r() * 0.04);
      const length = 0.12 + r() * 0.2;
      const glide = pitch * (r() < 0.5 ? 0.88 + r() * 0.06 : 1.06 + r() * 0.08);
      this.softNote(t, length, pitch, level * (0.7 + r() * 0.3), pan, bus, glide, 0.025);
      t += length + 0.05 + r() * 0.1;
    }
    if (r() < 0.7) {
      const twitters = 3 + Math.floor(r() * 3);
      for (let i = 0; i < twitters; i++) {
        const pitch = 3500 + r() * 700;
        this.softNote(t, 0.035, pitch, level * 0.45, pan, bus, pitch * 1.1);
        t += 0.05;
      }
    }
    return t;
  }

  /** A soft sine note: `attack` in seconds, optional glide down to `to`. */
  private softNote(
    start: number, length: number, pitch: number, level: number, pan: number, bus: AudioNode,
    to = pitch, attack = 0.004,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(pitch, start);
    if (to !== pitch) osc.frequency.exponentialRampToValueAtTime(to, start + length);
    const env = this.gain(0);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(level, start + attack);
    env.gain.setTargetAtTime(0, start + length * 0.6, length / 5);
    osc.connect(env).connect(this.panner(pan)).connect(bus);
    osc.start(start);
    osc.stop(start + length * 2);
  }

  /**
   * Each cicada sings phrases of a few seconds: regular pulses at its own tempo, swelling in
   * over the first second and easing off at the end, then falls silent for a few seconds.
   */
  private scheduleCicadas(now: number): void {
    const r = () => this.random();
    for (const cicada of this.cicadas) {
      if (this.maquis < 0.02) {
        cicada.next = cicada.phraseEnd = now + r() * 3;
        continue;
      }
      while (cicada.next < now + 0.5) {
        if (cicada.next >= cicada.phraseEnd) {
          // Rest, then a new phrase.
          cicada.phraseStart = Math.max(cicada.next, now) + 2 + r() * 5;
          cicada.phraseEnd = cicada.phraseStart + 3 + r() * 5;
          cicada.next = cicada.phraseStart;
          continue;
        }
        const t = Math.max(cicada.next, now + 0.02);
        const swell = Math.min(1, (t - cicada.phraseStart) / 0.9) * Math.min(1, (cicada.phraseEnd - t) / 0.6);
        const hold = 0.04 + r() * 0.02;
        const g = cicada.pulse.gain;
        g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(swell * (0.85 + r() * 0.15), t + 0.008);
        g.setValueAtTime(swell * 0.8, t + hold);
        g.linearRampToValueAtTime(0, t + hold + 0.025);
        cicada.next = t + cicada.period * (0.95 + r() * 0.1);
      }
    }
  }

  /** A soundscape bus: dry to the output, plus `send` of it into the shared reverb. */
  private bus(send: number): GainNode {
    const g = this.gain(0);
    g.connect(this.tone);
    g.connect(this.gain(send)).connect(this.space);
    return g;
  }

  private gain(value: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  private panner(pan: number): StereoPannerNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  private filter(type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  private loop(buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(0, this.random() * buffer.duration); // offset so layers don't share the same grain
    return s;
  }

  /** Stereo reverb tail: decaying noise, darkened over time like a real open-air space. */
  private impulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    const preDelay = Math.floor(rate * 0.02);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let smooth = 0;
      for (let i = preDelay; i < length; i++) {
        const t = (i - preDelay) / rate;
        // One-pole low-pass whose cutoff falls as the tail decays.
        const k = 0.5 * Math.exp(-t * 1.2) + 0.05;
        smooth += k * ((this.random() * 2 - 1) - smooth);
        data[i] = smooth * Math.exp(-t * 2.2) * 0.5;
      }
    }
    return buffer;
  }

  /**
   * Stereo pink noise (Paul Kellet's filter), left and right generated independently.
   * Fuller than brown noise, softer than white: the base of a natural-sounding sea.
   */
  private pinkNoise(seconds: number): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const w = this.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
      this.blendSeam(data);
    }
    return buffer;
  }

  /** Brown noise: integrated white noise, round and without hiss. */
  private brownNoise(seconds: number): AudioBuffer {
    let last = 0;
    return this.noiseBuffer(seconds, () => {
      last = (last + 0.02 * (this.random() * 2 - 1)) / 1.02;
      return last * 3.5;
    });
  }

  private whiteNoise(seconds: number): AudioBuffer {
    return this.noiseBuffer(seconds, () => this.random() * 2 - 1);
  }

  private noiseBuffer(seconds: number, sample: () => number): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = sample();
    this.blendSeam(data);
    return buffer;
  }

  /** Blend the end of a loop into its start so the seam never clicks. */
  private blendSeam(data: Float32Array): void {
    const length = data.length;
    const fade = Math.min(2048, length / 4);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[length - 1 - i] = data[length - 1 - i] * k + data[i] * (1 - k);
    }
  }
}

/** Live ambience for the page: owns the AudioContext and the on/off state. */
export class Ambience {
  private ctx: AudioContext | null = null;
  private graph: AmbienceGraph | null = null;
  private enabled = false;

  async toggle(): Promise<boolean> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.graph = new AmbienceGraph(this.ctx);
    }
    const ctx = this.ctx;
    this.enabled = !this.enabled;
    if (this.enabled) {
      await ctx.resume();
      this.graph!.fadeTo(true);
    } else {
      this.graph!.fadeTo(false);
      window.setTimeout(() => { if (!this.enabled) void ctx.suspend(); }, 1000);
    }
    return this.enabled;
  }

  update(progress: number, listener?: Listener): void {
    if (this.enabled) this.graph?.update(progress, listener);
  }
}
