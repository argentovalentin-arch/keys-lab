import gsap from 'gsap';

/** Lets the browser paint the loader between heavy synchronous steps. */
const nextPaint = () =>
  new Promise<void>((resolve) => {
    // rAF alone stalls in background tabs; the timeout keeps loading moving.
    const done = () => resolve();
    requestAnimationFrame(done);
    window.setTimeout(done, 50);
  });

/** Loading screen that reports the real preparation steps of the scene. */
export class Loader {
  private readonly root = document.querySelector<HTMLElement>('#loader')!;
  private readonly label = document.querySelector<HTMLElement>('#loader-step')!;
  private readonly bar = document.querySelector<HTMLElement>('#loader-bar')!;

  constructor(private readonly reducedMotion: boolean) {}

  async step(label: string, fraction: number): Promise<void> {
    this.label.textContent = label;
    gsap.to(this.bar, { scaleX: fraction, duration: this.reducedMotion ? 0 : 0.5, ease: 'power2.out' });
    await nextPaint();
  }

  finish(): Promise<void> {
    if (this.reducedMotion) {
      this.root.classList.add('is-done');
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      gsap
        .timeline({ onComplete: () => { this.root.classList.add('is-done'); resolve(); } })
        .to(this.bar, { scaleX: 1, duration: 0.4, ease: 'power2.out' })
        .to(this.root.querySelectorAll('.loader__inner > *'), { autoAlpha: 0, y: -12, duration: 0.4, stagger: 0.05 })
        .to(this.root, { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.1');
    });
  }

  /** Hide immediately, e.g. when showing the fallback. */
  hide(): void {
    this.root.classList.add('is-done');
  }
}
