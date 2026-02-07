// ===================================================================
//  Tutorial System — guides new players through first-run basics
// ===================================================================

const TUTORIAL_STEPS = [
  'WASD or Arrow Keys to move your ship',
  'Press Q or E to fire cannons',
  'Sail close to damaged ships to capture them',
  'Choose an upgrade to power up',
  'Survive 15 waves across 3 acts to claim victory!',
];

export class TutorialSystem {
  private currentStep: number;
  private started: boolean;
  private completed: boolean;
  private skipped: boolean;
  private stepWaitTimer: number;

  // DOM refs (lazy-init)
  private overlay: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private skipBtn: HTMLElement | null = null;

  constructor() {
    this.currentStep = 0;
    this.started = false;
    this.completed = false;
    this.skipped = false;
    this.stepWaitTimer = 0;
  }

  /* ---- public API ---- */

  isActive(): boolean {
    return this.started && !this.completed && !this.skipped;
  }

  hasEnded(): boolean {
    return this.started && !this.isActive();
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  getStepText(): string {
    if (this.currentStep < TUTORIAL_STEPS.length) {
      return TUTORIAL_STEPS[this.currentStep];
    }
    return '';
  }

  /**
   * Called each frame with gameplay condition flags.
   * Returns true when a step was just advanced.
   */
  advanceIfConditionMet(conditions: {
    moved: boolean;
    fired: boolean;
    captured: boolean;
    upgraded: boolean;
  }): boolean {
    if (!this.isActive()) return false;

    let shouldAdvance = false;

    switch (this.currentStep) {
      case 0: // "WASD or Arrow Keys to move"
        if (conditions.moved) shouldAdvance = true;
        break;
      case 1: // "Press Q or E to fire cannons"
        if (conditions.fired) shouldAdvance = true;
        break;
      case 2: // "Sail close to damaged ships to capture them"
        if (conditions.captured) shouldAdvance = true;
        break;
      case 3: // "Choose an upgrade to power up"
        if (conditions.upgraded) shouldAdvance = true;
        break;
      case 4: // "Survive 5 waves..." — time-based, handled in update()
        break;
    }

    if (shouldAdvance) {
      this.currentStep++;
      this.stepWaitTimer = 0;
      this.refreshUI();
      return true;
    }
    return false;
  }

  /**
   * Tick the tutorial timer.
   */
  update(dt: number): void {
    if (!this.isActive()) return;
    // Auto-advance removed to prevent "auto-dismissing" behavior
  }

  skip(): void {
    this.skipped = true;
    this.hideUI();
  }

  isCompleted(): boolean {
    return this.completed;
  }

  reset(): void {
    this.currentStep = 0;
    this.started = false;
    this.completed = false;
    this.skipped = false;
    this.stepWaitTimer = 0;
  }

  /* ---- UI helpers ---- */

  /** Call once at game start to wire up and show step 0 */
  start(): void {
    this.started = true;
    this.ensureElements();
    this.refreshUI();
  }

  private ensureElements(): void {
    if (!this.overlay) {
      this.overlay = document.getElementById('tutorial-overlay');
    }
    if (!this.textEl) {
      this.textEl = document.getElementById('tutorial-text');
    }
    if (!this.skipBtn) {
      this.skipBtn = document.getElementById('tutorial-skip');
      if (this.skipBtn) {
        this.skipBtn.addEventListener('click', () => this.skip(), { once: true });
      }
    }
  }

  private refreshUI(): void {
    this.ensureElements();
    if (!this.overlay || !this.textEl) return;

    if (this.currentStep >= TUTORIAL_STEPS.length || !this.isActive()) {
      this.hideUI();
      return;
    }

    this.overlay.style.display = 'flex';
    this.textEl.textContent = TUTORIAL_STEPS[this.currentStep];

    if (this.currentStep === TUTORIAL_STEPS.length - 1 && this.skipBtn) {
      this.skipBtn.textContent = 'Got it!';
    } else if (this.skipBtn) {
      this.skipBtn.textContent = 'Skip Tutorial';
    }
  }

  private hideUI(): void {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }
}
