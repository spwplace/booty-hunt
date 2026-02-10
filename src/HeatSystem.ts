export interface HeatState {
  heat: number;       // 0-100
  heatLevel: number;  // 0-5
  armedBonus: number; // extra armed% from heat (0.0 to 0.25)
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
}
