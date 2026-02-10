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

  // Infamy Singularity tests
  it('no effects at low heat', () => {
    heat.addHeat(20);
    expect(heat.shouldMutateWeather()).toBe(false);
    expect(heat.shouldCorruptNode()).toBe(false);
    expect(heat.isEmbargoActive()).toBe(false);
    expect(heat.getEventPressureBonus()).toBe(0);
    expect(heat.getBountyHunterCount()).toBe(0);
    expect(heat.getActiveEffects()).toHaveLength(0);
  });

  it('Wanted (31+): weather mutation and event pressure', () => {
    heat.addHeat(35);
    expect(heat.shouldMutateWeather()).toBe(true);
    expect(heat.getWeatherMutationChance()).toBeGreaterThan(0);
    expect(heat.shouldCorruptNode()).toBe(false);
    expect(heat.isEmbargoActive()).toBe(false);
    expect(heat.getEventPressureBonus()).toBe(0.05);
    expect(heat.getBountyHunterCount()).toBe(0);
    expect(heat.getActiveEffects()).toHaveLength(2);
    expect(heat.getActiveEffects()[0].tier).toBe('wanted');
  });

  it('Hunted (51+): node corruption and bounty hunters', () => {
    heat.addHeat(55);
    expect(heat.shouldCorruptNode()).toBe(true);
    expect(heat.getNodeCorruptionChance()).toBe(0.12);
    expect(heat.isEmbargoActive()).toBe(false);
    expect(heat.getBountyHunterCount()).toBe(1);
    expect(heat.getActiveEffects()).toHaveLength(4);
  });

  it('Infamous (71+): port embargo', () => {
    heat.addHeat(75);
    expect(heat.isEmbargoActive()).toBe(true);
    expect(heat.getBountyHunterCount()).toBe(2);
    expect(heat.getNodeCorruptionChance()).toBe(0.25);
    expect(heat.getActiveEffects()).toHaveLength(5);
  });

  it('Legendary (91+): maximum effects', () => {
    heat.addHeat(95);
    expect(heat.isEmbargoActive()).toBe(true);
    expect(heat.getBountyHunterCount()).toBe(3);
    expect(heat.getNodeCorruptionChance()).toBe(0.40);
    expect(heat.getWeatherMutationChance()).toBe(0.08);
    expect(heat.getEventPressureBonus()).toBe(0.30);
    expect(heat.getActiveEffects()).toHaveLength(6);
    expect(heat.getActiveEffects().some(e => e.id === 'legendary_fury')).toBe(true);
  });
});
