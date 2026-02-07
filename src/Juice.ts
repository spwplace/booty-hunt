// Juice.ts — Screen-level feedback effects (pure DOM/CSS, no Three.js)

function makeOverlay(id: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = id;
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.right = '0';
  el.style.bottom = '0';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '100';
  el.style.opacity = '0';
  document.body.appendChild(el);
  return el;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// 1. LowHealthVignette
// ---------------------------------------------------------------------------
class LowHealthVignette {
  private el: HTMLDivElement;
  private time = 0;

  constructor() {
    this.el = makeOverlay('low-health-vignette');
  }

  update(dt: number, healthPercent: number, flashIntensity: number): void {
    if (healthPercent >= 30) {
      this.el.style.opacity = '0';
      this.el.style.boxShadow = 'none';
      return;
    }

    this.time += dt;

    // Pulse rate increases as HP drops: range from ~2 Hz at 30% to ~6 Hz at 0%
    const severity = 1 - healthPercent / 30; // 0..1
    const pulseRate = 2 + severity * 4;
    const baseOpacity = 0.3 + severity * 0.4;
    const pulseAmplitude = 0.15 + severity * 0.15;
    const opacity = baseOpacity + Math.sin(this.time * pulseRate * Math.PI * 2) * pulseAmplitude;
    const clamped = Math.max(0, Math.min(1, opacity)) * flashIntensity;

    this.el.style.opacity = '1';
    this.el.style.boxShadow = `inset 0 0 80px 40px rgba(255,0,0,${clamped.toFixed(3)})`;
  }
}

// ---------------------------------------------------------------------------
// 2. HitDirectionIndicator
// ---------------------------------------------------------------------------
type HitDirection = 'left' | 'right' | 'front' | 'back';

class HitDirectionIndicator {
  private edges: Record<HitDirection, HTMLDivElement>;
  private timers: Record<HitDirection, number>;
  private static readonly FADE_DURATION = 0.6;
  private static readonly PEAK_OPACITY = 0.7;

  constructor() {
    const dirs: HitDirection[] = ['top', 'bottom', 'left', 'right'] as unknown as HitDirection[];
    this.edges = {} as Record<HitDirection, HTMLDivElement>;
    this.timers = { left: 0, right: 0, front: 0, back: 0 };

    // Map logical directions to edge positions
    const dirMap: Record<HitDirection, { side: string; style: Partial<CSSStyleDeclaration> }> = {
      front: {
        side: 'top',
        style: { top: '0', left: '0', right: '0', bottom: 'auto', height: '60px' },
      },
      back: {
        side: 'bottom',
        style: { top: 'auto', left: '0', right: '0', bottom: '0', height: '60px' },
      },
      left: {
        side: 'left',
        style: { top: '0', left: '0', right: 'auto', bottom: '0', width: '60px' },
      },
      right: {
        side: 'right',
        style: { top: '0', left: 'auto', right: '0', bottom: '0', width: '60px' },
      },
    };

    const gradients: Record<HitDirection, string> = {
      front: 'linear-gradient(to bottom, rgba(255,0,0,0.7), transparent)',
      back: 'linear-gradient(to top, rgba(255,0,0,0.7), transparent)',
      left: 'linear-gradient(to right, rgba(255,0,0,0.7), transparent)',
      right: 'linear-gradient(to left, rgba(255,0,0,0.7), transparent)',
    };

    for (const dir of ['front', 'back', 'left', 'right'] as HitDirection[]) {
      const el = document.createElement('div');
      el.id = `hit-indicator-${dir}`;
      el.style.position = 'fixed';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '100';
      el.style.opacity = '0';
      el.style.background = gradients[dir];

      const s = dirMap[dir].style;
      if (s.top !== undefined) el.style.top = s.top;
      if (s.bottom !== undefined) el.style.bottom = s.bottom;
      if (s.left !== undefined) el.style.left = s.left;
      if (s.right !== undefined) el.style.right = s.right;
      if (s.width) el.style.width = s.width;
      if (s.height) el.style.height = s.height;

      document.body.appendChild(el);
      this.edges[dir] = el;
    }
  }

  trigger(direction: HitDirection, intensity = 1): void {
    this.timers[direction] = HitDirectionIndicator.FADE_DURATION;
    this.edges[direction].style.opacity = String(HitDirectionIndicator.PEAK_OPACITY * intensity);
  }

  update(dt: number): void {
    for (const dir of ['front', 'back', 'left', 'right'] as HitDirection[]) {
      if (this.timers[dir] > 0) {
        this.timers[dir] -= dt;
        if (this.timers[dir] <= 0) {
          this.timers[dir] = 0;
          this.edges[dir].style.opacity = '0';
        } else {
          const t = this.timers[dir] / HitDirectionIndicator.FADE_DURATION;
          this.edges[dir].style.opacity = (t * HitDirectionIndicator.PEAK_OPACITY).toFixed(3);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. SlowMotion
// ---------------------------------------------------------------------------
class SlowMotion {
  timeScale = 1.0;
  private timer = 0;
  private static readonly RAMP_DURATION = 0.25;
  private static readonly SLOW_SCALE = 0.3;

  triggerDramaticKill(): void {
    this.timeScale = SlowMotion.SLOW_SCALE;
    this.timer = SlowMotion.RAMP_DURATION;
  }

  update(dt: number): number {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.timeScale = 1.0;
      } else {
        const t = 1 - this.timer / SlowMotion.RAMP_DURATION; // 0..1 as time progresses
        this.timeScale = SlowMotion.SLOW_SCALE + (1.0 - SlowMotion.SLOW_SCALE) * smoothstep(0, 1, t);
      }
    }
    return this.timeScale;
  }
}

// ---------------------------------------------------------------------------
// 4. DamageFlash
// ---------------------------------------------------------------------------
class DamageFlash {
  private el: HTMLDivElement;
  private timer = 0;
  private static readonly DURATION = 0.05;
  private static readonly PEAK_OPACITY = 0.4;

  constructor() {
    this.el = makeOverlay('damage-flash');
    this.el.style.backgroundColor = 'red';
  }

  trigger(intensity = 1): void {
    this.timer = DamageFlash.DURATION;
    this.el.style.opacity = String(DamageFlash.PEAK_OPACITY * intensity);
  }

  update(dt: number): void {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.el.style.opacity = '0';
      } else {
        const t = this.timer / DamageFlash.DURATION;
        this.el.style.opacity = (t * DamageFlash.PEAK_OPACITY).toFixed(3);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. ComboFlash
// ---------------------------------------------------------------------------
class ComboFlash {
  private el: HTMLDivElement;
  private timer = 0;
  private static readonly DURATION = 0.08;

  constructor() {
    this.el = makeOverlay('combo-flash');
    this.el.style.backgroundColor = 'rgba(255,215,0,0.3)';
  }

  trigger(intensity = 1): void {
    this.timer = ComboFlash.DURATION;
    this.el.style.opacity = String(Math.max(0, Math.min(1, intensity)));
  }

  update(dt: number): void {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.el.style.opacity = '0';
      } else {
        const t = this.timer / ComboFlash.DURATION;
        this.el.style.opacity = t.toFixed(3);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ScreenJuice singleton
// ---------------------------------------------------------------------------
class ScreenJuice {
  lowHealthVignette: LowHealthVignette;
  hitIndicator: HitDirectionIndicator;
  slowMotion: SlowMotion;
  damageFlash: DamageFlash;
  comboFlash: ComboFlash;
  private flashIntensity = 1;

  constructor() {
    this.lowHealthVignette = new LowHealthVignette();
    this.hitIndicator = new HitDirectionIndicator();
    this.slowMotion = new SlowMotion();
    this.damageFlash = new DamageFlash();
    this.comboFlash = new ComboFlash();
  }

  /** Updates all sub-effects. dt is REAL (unscaled) delta time. Returns current timeScale. */
  update(dt: number, healthPercent: number): number {
    this.lowHealthVignette.update(dt, healthPercent, this.flashIntensity);
    this.hitIndicator.update(dt);
    this.damageFlash.update(dt);
    this.comboFlash.update(dt);
    return this.slowMotion.update(dt);
  }

  /** Triggers damage flash + optional hit direction indicator. */
  triggerDamage(direction?: HitDirection): void {
    this.damageFlash.trigger(this.flashIntensity);
    if (direction) {
      this.hitIndicator.trigger(direction, this.flashIntensity);
    }
  }

  /** Triggers gold combo flash. */
  triggerCombo(): void {
    this.comboFlash.trigger(this.flashIntensity);
  }

  /** Triggers slow-motion ramp + combo flash for a dramatic kill. */
  triggerDramaticKill(): void {
    this.slowMotion.triggerDramaticKill();
    this.comboFlash.trigger(this.flashIntensity);
  }

  setFlashIntensity(value: number): void {
    this.flashIntensity = Math.max(0, Math.min(1, value));
  }
}

export const screenJuice = new ScreenJuice();
