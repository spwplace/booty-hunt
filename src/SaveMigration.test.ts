import { beforeEach, describe, expect, it } from 'vitest';
import { ProgressionSystem } from './Progression';
import { installLocalStorageMock } from './test/localStorageMock';

const SAVE_KEY = 'booty-hunt-save';

describe('SaveData Migration and Persistence', () => {
  beforeEach(() => {
    installLocalStorageMock();
    localStorage.clear();
  });

  it('migrates legacy pre-V1 save data to V1 format', () => {
    // Mock a legacy save
    const legacySave = {
      highScore: 1000,
      highWave: 5,
      totalGold: 5000,
      totalShips: 100,
      totalWaves: 20,
      bestCombo: 10,
      unlockedBonuses: ['starting_speed'],
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(legacySave));

    const progression = new ProgressionSystem();
    const v1 = progression.getMetaStatsV1();

    expect(v1.highScore).toBe(1000);
    expect(v1.highWave).toBe(5);
    expect(v1.totalGold).toBe(5000);
    expect(v1.unlockedBonuses).toContain('starting_speed');
    // V1 specific fields should have defaults
    expect(v1.victories).toBe(0);
    expect(v1.galleonUnlocked).toBe(false);
    expect(v1.v2CodexDiscovered).toEqual([]);
  });

  it('handles corrupted save data by falling back to defaults', () => {
    localStorage.setItem(SAVE_KEY, 'not-json');
    const progression = new ProgressionSystem();
    expect(progression.getScore()).toBe(0);
    expect(progression.getMetaStatsV1().highScore).toBe(0);
  });
});

describe('Run-Complete Critical Path', () => {
  beforeEach(() => {
    installLocalStorageMock();
    localStorage.clear();
  });

  it('processes victory and triggers unlocks', () => {
    const progression = new ProgressionSystem();
    progression.initializeStats('brigantine');

    // Simulate winning the final wave
    // In Progression.ts, checkVictory uses runStats.wavesCompleted >= customFinalWave (default 15)
    for (let i = 0; i < 15; i++) {
      progression.onShipDestroyed(); // This increments wavesCompleted if shipsDestroyed >= shipsTotal
      // We need to actually set shipsTotal for each wave or mock it
      // For simplicity, let's just manipulate runStats directly via a private access if needed,
      // but let's try to use the public API.
    }

    // Actually, let's mock the runStats for checkUnlocks
    const runStats = progression.getRunStats();
    runStats.victory = true;
    runStats.shipClass = 'brigantine';

    const unlocks = progression.checkUnlocks(runStats);

    expect(unlocks).toContain('Galleon unlocked! A mighty vessel of war.');
    expect(unlocks).toContain('Endless Mode unlocked! Sail beyond the final wave.');

    const meta = progression.getMetaStatsV1();
    expect(meta.victories).toBe(1);
    expect(meta.galleonUnlocked).toBe(true);
    expect(meta.endlessModeUnlocked).toBe(true);
  });

  it('unlocks Bosun and Quartermaster after victory with 2 different classes', () => {
    const progression = new ProgressionSystem();

    // First victory with Brigantine
    const run1 = progression.getRunStats();
    run1.victory = true;
    run1.shipClass = 'brigantine';
    progression.checkUnlocks(run1);

    // Second victory with Sloop
    const run2 = progression.getRunStats();
    run2.victory = true;
    run2.shipClass = 'sloop';
    const unlocks = progression.checkUnlocks(run2);

    expect(unlocks).toContain('Bosun crew role unlocked! +5 max HP per level.');
    expect(unlocks).toContain('Quartermaster crew role unlocked! +8% gold per level.');

    const meta = progression.getMetaStatsV1();
    expect(meta.bosunUnlocked).toBe(true);
    expect(meta.quartermasterUnlocked).toBe(true);
  });
});
