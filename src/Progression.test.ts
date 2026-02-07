import { beforeEach, describe, expect, it } from 'vitest';
import { ProgressionSystem } from './Progression';
import { installLocalStorageMock } from './test/localStorageMock';

describe('ProgressionSystem runtime settings', () => {
  beforeEach(() => {
    installLocalStorageMock();
    localStorage.clear();
  });

  it('exposes default accessibility settings', () => {
    const progression = new ProgressionSystem();
    const settings = progression.getRuntimeSettings();

    expect(settings.accessibility.textScale).toBe(1);
    expect(settings.accessibility.motionIntensity).toBe(1);
    expect(settings.accessibility.flashIntensity).toBe(1);
    expect(settings.accessibility.colorblindMode).toBe('off');
  });

  it('updates partial accessibility settings without dropping others', () => {
    const progression = new ProgressionSystem();
    const before = progression.getRuntimeSettings();

    const after = progression.updateRuntimeSettings({
      accessibility: { flashIntensity: 0.35 },
    });

    expect(after.accessibility.flashIntensity).toBeCloseTo(0.35);
    expect(after.accessibility.textScale).toBe(before.accessibility.textScale);
    expect(after.accessibility.motionIntensity).toBe(before.accessibility.motionIntensity);
    expect(after.accessibility.colorblindMode).toBe(before.accessibility.colorblindMode);
  });

  it('clamps invalid accessibility values', () => {
    const progression = new ProgressionSystem();

    const settings = progression.updateRuntimeSettings({
      accessibility: {
        textScale: 99,
        motionIntensity: -2,
        flashIntensity: 2,
        colorblindMode: 'not-a-mode' as never,
      },
    });

    expect(settings.accessibility.textScale).toBe(1.4);
    expect(settings.accessibility.motionIntensity).toBe(0);
    expect(settings.accessibility.flashIntensity).toBe(1);
    expect(settings.accessibility.colorblindMode).toBe('off');
  });
});

describe('ProgressionSystem run snapshots', () => {
  beforeEach(() => {
    installLocalStorageMock();
    localStorage.clear();
  });

  it('restores run-level fields from a snapshot', () => {
    const source = new ProgressionSystem();
    source.initializeStats('sloop');
    source.addScore(425);
    const snapshot = source.getRunSnapshot();

    const target = new ProgressionSystem();
    target.initializeStats('brigantine');
    target.restoreRunSnapshot(snapshot);

    expect(target.getScore()).toBe(425);
    expect(target.getShipClass()).toBe('sloop');
    expect(target.getRunSnapshot().shipClass).toBe('sloop');
  });
});
