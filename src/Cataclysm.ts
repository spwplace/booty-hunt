// ===================================================================
//  Cataclysm Set-Pieces — Boss wave mega-spectacles
//  Eclipse (W5), Eruption (W10), Maelstrom (W15)
// ===================================================================

import type { WeatherState } from './Weather';

export type CataclysmType = 'eclipse' | 'eruption' | 'maelstrom';

export interface CataclysmConfig {
  type: CataclysmType;
  duration: number;
  waveNumber: number;
  weatherOverride: WeatherState;
  // Sky shader modifier targets
  skyDarken: number;          // 0-1, how much to darken the sky
  sunTint: [number, number, number]; // RGB multiplier for sun color
  // Ocean modifier targets
  waveScaleMultiplier: number;
  // Combat modifiers
  playerDamageBonus: number;  // multiplicative bonus during cataclysm
  enemySpeedBonus: number;    // multiplicative speed increase for enemies
  // Visual
  particleIntensity: number;  // 0-1 intensity for spectacle particles
}

// Predefined cataclysm configs
const CATACLYSM_CONFIGS: Record<CataclysmType, CataclysmConfig> = {
  eclipse: {
    type: 'eclipse',
    duration: 45,
    waveNumber: 5,
    weatherOverride: 'night',
    skyDarken: 0.8,
    sunTint: [0.3, 0.1, 0.4], // eerie purple-red eclipse light
    waveScaleMultiplier: 0.7,
    playerDamageBonus: 1.15,
    enemySpeedBonus: 0.9,     // enemies slow in the dark
    particleIntensity: 0.6,
  },
  eruption: {
    type: 'eruption',
    duration: 50,
    waveNumber: 10,
    weatherOverride: 'stormy',
    skyDarken: 0.4,
    sunTint: [1.0, 0.4, 0.1], // fiery orange sky
    waveScaleMultiplier: 1.8,  // massive waves
    playerDamageBonus: 1.25,
    enemySpeedBonus: 1.1,
    particleIntensity: 0.9,
  },
  maelstrom: {
    type: 'maelstrom',
    duration: 60,
    waveNumber: 15,
    weatherOverride: 'stormy',
    skyDarken: 0.6,
    sunTint: [0.2, 0.5, 0.8], // deep blue-grey
    waveScaleMultiplier: 2.5,  // extreme waves
    playerDamageBonus: 1.35,
    enemySpeedBonus: 1.2,
    particleIntensity: 1.0,
  },
};

export interface CataclysmState {
  active: boolean;
  type: CataclysmType | null;
  timer: number;
  duration: number;
  intensity: number; // 0-1, ramps up then down
}

export class CataclysmSystem {
  private state: CataclysmState = {
    active: false,
    type: null,
    timer: 0,
    duration: 0,
    intensity: 0,
  };

  reset(): void {
    this.state = { active: false, type: null, timer: 0, duration: 0, intensity: 0 };
  }

  /** Start a cataclysm at the appropriate boss wave */
  startForWave(waveNumber: number): CataclysmConfig | null {
    let type: CataclysmType | null = null;
    if (waveNumber === 5) type = 'eclipse';
    else if (waveNumber === 10) type = 'eruption';
    else if (waveNumber === 15) type = 'maelstrom';

    if (!type) return null;

    const config = CATACLYSM_CONFIGS[type];
    this.state = {
      active: true,
      type,
      timer: 0,
      duration: config.duration,
      intensity: 0,
    };
    return config;
  }

  /** Update the cataclysm timer. Returns current intensity (0-1). */
  update(dt: number): number {
    if (!this.state.active) return 0;

    this.state.timer += dt;

    // Intensity ramps up over first 20%, sustains at 1.0, then fades in last 15%
    const t = this.state.timer / this.state.duration;
    if (t < 0.2) {
      this.state.intensity = t / 0.2;
    } else if (t > 0.85) {
      this.state.intensity = (1 - t) / 0.15;
    } else {
      this.state.intensity = 1;
    }

    if (this.state.timer >= this.state.duration) {
      this.state.active = false;
      this.state.intensity = 0;
    }

    return this.state.intensity;
  }

  getState(): CataclysmState {
    return { ...this.state };
  }

  isActive(): boolean {
    return this.state.active;
  }

  getConfig(): CataclysmConfig | null {
    if (!this.state.type) return null;
    return CATACLYSM_CONFIGS[this.state.type];
  }

  /** Get the current combat damage multiplier (for player) */
  getPlayerDamageMultiplier(): number {
    if (!this.state.active || !this.state.type) return 1;
    return 1 + (CATACLYSM_CONFIGS[this.state.type].playerDamageBonus - 1) * this.state.intensity;
  }

  /** Get enemy speed multiplier */
  getEnemySpeedMultiplier(): number {
    if (!this.state.active || !this.state.type) return 1;
    return 1 + (CATACLYSM_CONFIGS[this.state.type].enemySpeedBonus - 1) * this.state.intensity;
  }

  /** Get wave scale multiplier for ocean shader */
  getWaveScaleMultiplier(): number {
    if (!this.state.active || !this.state.type) return 1;
    return 1 + (CATACLYSM_CONFIGS[this.state.type].waveScaleMultiplier - 1) * this.state.intensity;
  }
}

export { CATACLYSM_CONFIGS };
