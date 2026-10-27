import * as THREE from 'three/webgpu';
import gsap from 'gsap';
import { STOPS, type LiveFact, type Stop } from '../content/stops';
import { heightAt } from '../world/island';

/** How close to a stop (in route progress) its marker stays visible. */
const MARKER_RANGE = 0.09;

/**
 * Screen layer for the route: the current stop's title, the marker floating
 * over its point of interest, and the "how it's made" sheet it opens.
 */
export class Journey {
  private readonly title = document.querySelector<HTMLElement>('#stage-title')!;
  private readonly lead = document.querySelector<HTMLElement>('#stage-lead')!;
  private readonly marker = document.querySelector<HTMLButtonElement>('#marker')!;
  private readonly sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
  private readonly sheetTitle = document.querySelector<HTMLElement>('#sheet-title')!;
  private readonly sheetBody = document.querySelector<HTMLElement>('#sheet-body')!;
  private readonly sheetFacts = document.querySelector<HTMLElement>('#sheet-facts')!;
  private readonly stopButtons: HTMLButtonElement[];

  private readonly anchors: THREE.Vector3[];
  private readonly projected = new THREE.Vector3();
  private current = -1;
  private markerStop = 0;
  private openStop: Stop | null = null;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly live: (fact: LiveFact) => string,
    private readonly reducedMotion: boolean,
    private readonly onSheetToggle: (open: boolean) => void,
    onNavigate: (progress: number) => void,
  ) {
    // Step list: lets keyboard and touch users jump straight to a stop.
    const list = document.querySelector<HTMLOListElement>('#stops')!;
    this.stopButtons = STOPS.map((stop, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stops__button';
      button.innerHTML = `<span class="stops__number">${i + 1}</span><span class="stops__name">${stop.title}</span>`;
      button.setAttribute('aria-label', `Étape ${i + 1} : ${stop.title}`);
      button.addEventListener('click', () => onNavigate(stop.at));
      const item = document.createElement('li');
      item.append(button);
      list.append(item);
      return button;
    });

    this.anchors = STOPS.map(({ anchor: [x, z], lift }) => new THREE.Vector3(x, Math.max(heightAt(x, z), 0) + lift, z));

    this.marker.addEventListener('click', () => this.openSheet(STOPS[this.markerStop]));
    this.sheet.addEventListener('close', () => {
      this.openStop = null;
      this.onSheetToggle(false);
      this.marker.focus({ preventScroll: true });
    });
    // Click on the backdrop closes the sheet.
    this.sheet.addEventListener('click', (e) => {
      if (e.target === this.sheet) this.sheet.close();
    });
  }

  /** Call once per frame with the damped route progress. */
  update(progress: number, viewport: { width: number; height: number }): void {
    let nearest = 0;
    STOPS.forEach((stop, i) => {
      if (Math.abs(progress - stop.at) < Math.abs(progress - STOPS[nearest].at)) nearest = i;
    });
    if (nearest !== this.current) this.showStop(nearest);

    // Keep the marker on the closest stop while in range, hide it in between.
    const distance = Math.abs(progress - STOPS[nearest].at);
    this.projected.copy(this.anchors[nearest]).project(this.camera);
    const onScreen =
      this.projected.z < 1 && Math.abs(this.projected.x) < 0.92 && Math.abs(this.projected.y) < 0.85;
    const visible = distance < MARKER_RANGE && onScreen;

    this.markerStop = nearest;
    this.marker.classList.toggle('is-visible', visible);
    this.marker.tabIndex = visible ? 0 : -1;
    this.marker.setAttribute('aria-hidden', String(!visible));
    if (visible) {
      const x = (this.projected.x * 0.5 + 0.5) * viewport.width;
      // Never let the marker sit on the stop title and its lead.
      const below = this.lead.getBoundingClientRect().bottom + 40;
      const y = Math.max((-this.projected.y * 0.5 + 0.5) * viewport.height, below);
      this.marker.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }

    if (this.openStop) this.renderFacts(this.openStop);
  }

  private showStop(index: number): void {
    const stop = STOPS[index];
    const first = this.current === -1;
    this.current = index;
    this.stopButtons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    this.marker.setAttribute('aria-label', `Comment c’est fait : ${stop.sheet.title.toLowerCase()}`);

    if (this.reducedMotion || first) {
      this.setTitle(stop);
      return;
    }

    gsap.killTweensOf([this.title.children, this.lead]);
    gsap
      .timeline()
      .to(this.title.children, { yPercent: -110, duration: 0.35, ease: 'power2.in', stagger: 0.012 })
      .to(this.lead, { autoAlpha: 0, duration: 0.25 }, 0)
      .add(() => {
        // The new letters only exist once the title is rebuilt, so they animate from here.
        this.setTitle(stop);
        gsap.from(this.title.children, { yPercent: 110, duration: 0.7, ease: 'expo.out', stagger: 0.02 });
      })
      .to(this.lead, { autoAlpha: 1, duration: 0.5 }, '+=0.3');
  }

  /** Title is split into one span per letter so each can move on its own. */
  private setTitle(stop: Stop): void {
    this.title.setAttribute('aria-label', stop.title);
    this.title.replaceChildren(
      ...Array.from(stop.title).map((char) => {
        const span = document.createElement('span');
        span.textContent = char === ' ' ? ' ' : char;
        span.setAttribute('aria-hidden', 'true');
        return span;
      }),
    );
    this.lead.textContent = stop.lead;
  }

  private openSheet(stop: Stop): void {
    this.openStop = stop;
    this.sheetTitle.textContent = stop.sheet.title;
    this.sheetBody.replaceChildren(
      ...stop.sheet.body.map((text) => Object.assign(document.createElement('p'), { textContent: text })),
    );
    this.renderFacts(stop);
    this.sheet.showModal();
    this.onSheetToggle(true);
  }

  private renderFacts(stop: Stop): void {
    const rows = stop.sheet.facts.map((fact) => {
      const value = 'live' in fact ? this.live(fact.live) : fact.value;
      return `<div><dt>${fact.label}</dt><dd>${value}</dd></div>`;
    });
    const html = rows.join('');
    if (this.sheetFacts.innerHTML !== html) this.sheetFacts.innerHTML = html;
  }
}
