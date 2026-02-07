export class UI {
  private titleEl: HTMLElement;
  private scoreEl: HTMLElement;
  private compassEl: HTMLElement;
  private arrowEl: HTMLElement;
  private distanceEl: HTMLElement;
  private captureEl: HTMLElement;
  private vignetteEl: HTMLElement;
  private controlsEl: HTMLElement;
  private captureTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.titleEl = document.getElementById('title')!;
    this.scoreEl = document.getElementById('score')!;
    this.compassEl = document.getElementById('compass-container')!;
    this.arrowEl = document.getElementById('compass-arrow')!;
    this.distanceEl = document.getElementById('distance')!;
    this.captureEl = document.getElementById('capture-text')!;
    this.vignetteEl = document.getElementById('spyglass-vignette')!;
    this.controlsEl = document.getElementById('controls')!;
  }

  hideTitle() {
    this.titleEl.style.opacity = '0';
    setTimeout(() => (this.titleEl.style.display = 'none'), 1200);
    // Show HUD
    this.scoreEl.style.opacity = '1';
    this.compassEl.style.opacity = '1';
    this.distanceEl.style.opacity = '1';
    this.controlsEl.style.opacity = '1';
  }

  updateScore(score: number) {
    this.scoreEl.innerHTML = `<span class="label">Gold Plundered</span>${score.toLocaleString()}`;
  }

  /**
   * @param angle  Radians – 0 = up on screen, positive = clockwise.
   *               This should be the bearing from the player to the nearest target,
   *               relative to the camera's forward direction.
   */
  updateCompass(angle: number) {
    this.arrowEl.style.transform =
      `translate(-50%, 0) rotate(${angle}rad)`;
  }

  updateDistance(dist: number) {
    this.distanceEl.textContent = `${Math.round(dist)} leagues`;
  }

  showCapture(text: string) {
    if (this.captureTimeout) clearTimeout(this.captureTimeout);
    this.captureEl.textContent = text;
    this.captureEl.classList.add('show');
    this.captureTimeout = setTimeout(() => {
      this.captureEl.classList.remove('show');
    }, 1200);
  }

  setSpyglass(active: boolean) {
    if (active) {
      this.vignetteEl.classList.add('active');
    } else {
      this.vignetteEl.classList.remove('active');
    }
  }
}
