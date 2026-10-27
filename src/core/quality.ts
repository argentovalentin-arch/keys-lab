/**
 * Quality tiers. A first tier is picked from what the device tells us, then the
 * frame monitor steps it down if the scene cannot hold its frame rate. It never
 * steps back up, so quality does not flicker between two levels.
 */
export type Tier = 'high' | 'medium' | 'low';

export interface TierSettings {
  pixelRatio: number;
  /** Shadow map size; fixed for the session, set from the starting tier. */
  shadowMapSize: number;
  /** Share of the scattered vegetation that is drawn. */
  vegetation: number;
}

export const TIERS: Record<Tier, TierSettings> = {
  high: { pixelRatio: 2, shadowMapSize: 4096, vegetation: 1 },
  medium: { pixelRatio: 1.5, shadowMapSize: 2048, vegetation: 0.65 },
  low: { pixelRatio: 1, shadowMapSize: 2048, vegetation: 0.35 },
};

const ORDER: Tier[] = ['high', 'medium', 'low'];

/** `?quality=high|medium|low` forces a tier (and turns off automatic downgrades). */
export function forcedTier(): Tier | null {
  const value = new URLSearchParams(location.search).get('quality');
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}

export function initialTier(isWebGPU: boolean): Tier {
  const forced = forcedTier();
  if (forced) return forced;

  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const touch = window.matchMedia('(pointer: coarse)').matches;

  if (touch) return memory >= 8 ? 'medium' : 'low';
  if (!isWebGPU || memory <= 4 || cores <= 4) return 'medium';
  return 'high';
}

const WARMUP = 3; // seconds ignored after start: shader warm-up and loader exit
const WINDOW = 2; // seconds per measurement
const MIN_FPS = 42;

export class FrameMonitor {
  private elapsed = 0;
  private windowTime = 0;
  private windowFrames = 0;

  constructor(private tier: Tier, private readonly onDowngrade: (tier: Tier) => void, private readonly enabled = true) {}

  get current(): Tier {
    return this.tier;
  }

  /** Call once per rendered frame with its duration in seconds. */
  sample(dt: number): void {
    if (!this.enabled || this.tier === 'low') return;
    this.elapsed += dt;
    if (this.elapsed < WARMUP) return;
    // Long gaps mean a hidden tab or a breakpoint, not a slow GPU.
    if (dt > 0.25) {
      this.windowTime = this.windowFrames = 0;
      return;
    }
    this.windowTime += dt;
    this.windowFrames++;
    if (this.windowTime < WINDOW) return;

    const fps = this.windowFrames / this.windowTime;
    this.windowTime = this.windowFrames = 0;
    if (fps < MIN_FPS) {
      this.tier = ORDER[ORDER.indexOf(this.tier) + 1];
      this.onDowngrade(this.tier);
    }
  }
}
