import { describe, it, expect, beforeEach } from 'vitest';
import { HeatSystem } from './HeatSystem';

describe('HeatSystem', () => {
  let heat: HeatSystem;

  beforeEach(() => {
    heat = new HeatSystem();
  });

  it('starts at 0 heat', () => {
    expect(heat.getHeat()).toBe(0);
    expect(heat.getHeatLevel()).toBe(0);
    expect(heat.getHeatLevelName()).toBe('Calm Waters');
    expect(heat.getArmedBonus()).toBe(0);
  });

  it('accumulates heat and transitions levels', () => {
    heat.addHeat(5);
    expect(heat.getHeat()).toBe(5);
    expect(heat.getHeatLevel()).toBe(0);

    heat.addHeat(15); // total 20
    expect(heat.getHeatLevel()).toBe(1);
    expect(heat.getHeatLevelName()).toBe('Noticed');
    expect(heat.getArmedBonus()).toBe(0.03);

    heat.addHeat(35); // total 55
    expect(heat.getHeatLevel()).toBe(3);
    expect(heat.getHeatLevelName()).toBe('Hunted');
    expect(heat.getArmedBonus()).toBe(0.14);
  });

  it('caps at 0 and 100', () => {
    heat.addHeat(150);
    expect(heat.getHeat()).toBe(100);

    heat.addHeat(-200);
    expect(heat.getHeat()).toBe(0);
  });

  it('decays over time', () => {
    heat.addHeat(50);
    heat.decayHeat(10, 1); // 10 seconds at rate 1/sec
    expect(heat.getHeat()).toBe(40);

    heat.decayHeat(100, 1); // decay past 0
    expect(heat.getHeat()).toBe(0);
  });

  it('tracks max heat', () => {
    heat.addHeat(80);
    expect(heat.getMaxHeat()).toBe(80);

    heat.addHeat(-30); // 50
    expect(heat.getMaxHeat()).toBe(80);

    heat.addHeat(60); // 100 (capped)
    expect(heat.getMaxHeat()).toBe(100);
  });

  it('resets correctly', () => {
    heat.addHeat(75);
    heat.resetRun();
    expect(heat.getHeat()).toBe(0);
    expect(heat.getMaxHeat()).toBe(0);
    expect(heat.getHeatLevel()).toBe(0);
  });

  it('save/restore via applyState', () => {
    heat.addHeat(65);
    const state = heat.getState();

    const heat2 = new HeatSystem();
    heat2.applyState({ heat: state.heat, maxHeat: 65 });
    expect(heat2.getHeat()).toBe(65);
    expect(heat2.getHeatLevel()).toBe(3);
    expect(heat2.getArmedBonus()).toBe(0.14);
  });
});
