import * as THREE from 'three/webgpu';
import { heightAt } from '../world/island';

// Route: from open sea in the east (the island seen side-on, its plain in front of the
// mountain chain), onto the eastern plain and its coast, over the maquis and its river,
// north to the crests, along the mountain chain, then out to sea looking back at dusk.
// getPoint (not getPointAt) reaches waypoint i exactly at progress i / 6, so stops can sit on waypoints.
const ROUTE: Array<[THREE.Vector3, THREE.Vector3]> = [
  [new THREE.Vector3(1000, 45, 180), new THREE.Vector3(0, 50, 0)],
  [new THREE.Vector3(330, 60, 330), new THREE.Vector3(170, 0, 140)],
  [new THREE.Vector3(330, 70, 90), new THREE.Vector3(130, 30, -40)],
  [new THREE.Vector3(330, 150, -230), new THREE.Vector3(60, 40, 40)],
  [new THREE.Vector3(260, 110, 400), new THREE.Vector3(30, 40, 220)],
  [new THREE.Vector3(-320, 190, 380), new THREE.Vector3(-50, 70, -60)],
  [new THREE.Vector3(-500, 140, -650), new THREE.Vector3(0, 50, 0)],
];

const MIN_CLEARANCE = 14;

export class CameraRig {
  private readonly positions = new THREE.CatmullRomCurve3(ROUTE.map(([p]) => p), false, 'centripetal');
  private readonly targets = new THREE.CatmullRomCurve3(ROUTE.map(([, t]) => t), false, 'centripetal');
  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private smoothed = 0;

  /** Damped route progress in [0, 1]; follows scroll with a little lag. */
  get progress(): number {
    return THREE.MathUtils.clamp(this.smoothed, 0, 1);
  }
  private sway = new THREE.Vector2();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.update(0, 1);
  }

  /**
   * @param goal scroll progress in [0, 1]
   * @param dt seconds since last frame
   * @param pointer normalised pointer in [-1, 1], used for a slight head turn
   */
  update(goal: number, dt: number, pointer = new THREE.Vector2()): void {
    // Exponential damping keeps motion smooth regardless of frame rate.
    const k = 1 - Math.exp(-dt * 4);
    this.smoothed += (goal - this.smoothed) * k;
    this.sway.lerp(pointer, 1 - Math.exp(-dt * 2.5));

    const t = this.progress;
    this.positions.getPoint(t, this.position);
    this.targets.getPoint(t, this.target);

    const ground = Math.max(heightAt(this.position.x, this.position.z), 0);
    this.position.y = Math.max(this.position.y, ground + MIN_CLEARANCE);

    this.camera.position.copy(this.position);
    this.look.copy(this.target);
    this.look.x += this.sway.x * 40;
    this.look.y += this.sway.y * 22;
    this.camera.lookAt(this.look);
  }
}
