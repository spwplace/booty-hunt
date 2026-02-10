export interface HeatState {
  heat: number;       // 0-100
  heatLevel: number;  // 0-5
  armedBonus: number; // extra armed% from heat (0.0 to 0.25)
}

// Infamy Singularity: active heat effect descriptors
export interface HeatEffect {
  id: string;
  name: string;
  description: string;
  tier: 'wanted' | 'hunted' | 'infamous' | 'legendary';
}

const HEAT_LEVELS: { threshold: number; name: string; armedBonus: number }[] = [
  { threshold: 0,  name: 'Calm Waters', armedBonus: 0 },
  { threshold: 16, name: 'Noticed',     armedBonus: 0.03 },
  { threshold: 31, name: 'Wanted',      armedBonus: 0.08 },
  { threshold: 51, name: 'Hunted',      armedBonus: 0.14 },
  { threshold: 71, name: 'Infamous',    armedBonus: 0.20 },
  { threshold: 91, name: 'Legendary',   armedBonus: 0.25 },
];

export class HeatSystem {
  private heat = 0;
  private maxHeat = 0;

  resetRun(): void {
    this.heat = 0;
    this.maxHeat = 0;
  }

  getState(): HeatState {
    return {
      heat: this.heat,
      heatLevel: this.getHeatLevel(),
      armedBonus: this.getArmedBonus(),
    };
  }

  applyState(s: { heat: number; maxHeat?: number }): void {
    this.heat = Math.max(0, Math.min(100, s.heat));
    this.maxHeat = Math.max(this.maxHeat, s.maxHeat ?? this.heat);
  }

  addHeat(amount: number): void {
    this.heat = Math.max(0, Math.min(100, this.heat + amount));
    if (this.heat > this.maxHeat) this.maxHeat = this.heat;
  }

  decayHeat(dt: number, rate = 1): void {
    if (this.heat > 0) {
      this.heat = Math.max(0, this.heat - rate * dt);
    }
  }

  getHeatLevel(): number {
    for (let i = HEAT_LEVELS.length - 1; i >= 0; i--) {
      if (this.heat >= HEAT_LEVELS[i].threshold) return i;
    }
    return 0;
  }

  getHeatLevelName(): string {
    return HEAT_LEVELS[this.getHeatLevel()].name;
  }

  getArmedBonus(): number {
    return HEAT_LEVELS[this.getHeatLevel()].armedBonus;
  }

  getHeat(): number {
    return this.heat;
  }

  getMaxHeat(): number {
    return this.maxHeat;
  }

  // -----------------------------------------------------------------------
  // Infamy Singularity — threshold-based gameplay effects
  // -----------------------------------------------------------------------

  /** Wanted (31+): weather occasionally mutates to stormy/night */
  shouldMutateWeather(): boolean {
    return this.heat >= 31;
  }

  /** Wanted (31+): chance of weather mutation this tick (per-second probability) */
  getWeatherMutationChance(): number {
    if (this.heat < 31) return 0;
    if (this.heat >= 91) return 0.08;
    if (this.heat >= 71) return 0.05;
    if (this.heat >= 51) return 0.03;
    return 0.015;
  }

  /** Hunted (51+): map nodes can become corrupted (blocked or hazard-stacked) */
  shouldCorruptNode(): boolean {
    return this.heat >= 51;
  }

  /** Hunted (51+): probability a map node gets corrupted at generation time */
  getNodeCorruptionChance(): number {
    if (this.heat < 51) return 0;
    if (this.heat >= 91) return 0.40;
    if (this.heat >= 71) return 0.25;
    return 0.12;
  }

  /** Infamous (71+): ports refuse service (embargo) */
  isEmbargoActive(): boolean {
    return this.heat >= 71;
  }

  /** Get extra event pressure from heat — increases random event frequency */
  getEventPressureBonus(): number {
    if (this.heat < 31) return 0;
    if (this.heat >= 91) return 0.30;
    if (this.heat >= 71) return 0.20;
    if (this.heat >= 51) return 0.12;
    return 0.05;
  }

  /** Extra ships spawned due to infamy (bounty hunters) */
  getBountyHunterCount(): number {
    if (this.heat >= 91) return 3;
    if (this.heat >= 71) return 2;
    if (this.heat >= 51) return 1;
    return 0;
  }

  /** Get all currently active heat effects as descriptors */
  getActiveEffects(): HeatEffect[] {
    const effects: HeatEffect[] = [];
    if (this.heat >= 31) {
      effects.push({
        id: 'weather_mutation',
        name: 'Ill Omens',
        description: 'Weather shifts unpredictably toward storms and darkness.',
        tier: 'wanted',
      });
      effects.push({
        id: 'event_pressure',
        name: 'Restless Seas',
        description: 'Sea events grow more frequent.',
        tier: 'wanted',
      });
    }
    if (this.heat >= 51) {
      effects.push({
        id: 'node_corruption',
        name: 'Cursed Charts',
        description: 'Map routes become corrupted with additional hazards.',
        tier: 'hunted',
      });
      effects.push({
        id: 'bounty_hunters',
        name: 'Bounty Hunters',
        description: 'Extra armed ships join each wave.',
        tier: 'hunted',
      });
    }
    if (this.heat >= 71) {
      effects.push({
        id: 'port_embargo',
        name: 'Port Embargo',
        description: 'Ports refuse to trade with you.',
        tier: 'infamous',
      });
    }
    if (this.heat >= 91) {
      effects.push({
        id: 'legendary_fury',
        name: 'Legendary Fury',
        description: 'Maximum bounty hunter presence. The seas themselves hunt you.',
        tier: 'legendary',
      });
    }
    return effects;
  }
}
