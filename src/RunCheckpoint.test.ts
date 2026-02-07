import { beforeEach, describe, expect, it } from 'vitest';
import { ProgressionSystem } from './Progression';
import {
  clearRunCheckpoint,
  loadRunCheckpoint,
  saveRunCheckpoint,
  type RunCheckpointV1,
} from './RunCheckpoint';
import { installLocalStorageMock } from './test/localStorageMock';

const RUN_CHECKPOINT_KEY = 'booty-hunt-run-checkpoint-v1';

function makeCheckpoint(): RunCheckpointV1 {
  const progression = new ProgressionSystem();
  progression.initializeStats('brigantine');

  return {
    version: 1,
    savedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    shipClass: 'brigantine',
    doctrineId: 'doctrine_test',
    seed: 123,
    progression: progression.getRunSnapshot(),
    map: {
      seed: 123,
      currentNodeId: null,
      visitedNodeIds: [],
    },
    economy: {
      supplies: 25,
      intel: 3,
      reputationTokens: 1,
    },
    factionReputation: {
      free_captains: 1.2,
    },
    crew: [
      {
        role: 'navigator',
        level: 2,
        maxLevel: 5,
        name: 'Salt Jack',
      },
    ],
    activeWaveConfig: null,
    activeContractObjective: null,
    capturesThisWave: 0,
    armedCapturesThisWave: 0,
    waveCaptureGold: 0,
  };
}

describe('RunCheckpoint persistence', () => {
  beforeEach(() => {
    installLocalStorageMock();
    localStorage.clear();
  });

  it('round-trips checkpoint payloads', () => {
    const checkpoint = makeCheckpoint();
    expect(saveRunCheckpoint(checkpoint)).toBe(true);

    const loaded = loadRunCheckpoint();
    expect(loaded).not.toBeNull();
    expect(loaded?.seed).toBe(checkpoint.seed);
    expect(loaded?.crew).toEqual(checkpoint.crew);
  });

  it('falls back to empty crew snapshots for older saves', () => {
    const checkpoint = makeCheckpoint();
    const { crew: _crew, ...legacyPayload } = checkpoint;
    localStorage.setItem(RUN_CHECKPOINT_KEY, JSON.stringify(legacyPayload));

    const loaded = loadRunCheckpoint();
    expect(loaded).not.toBeNull();
    expect(loaded?.crew).toEqual([]);
  });

  it('rejects malformed checkpoint payloads', () => {
    localStorage.setItem(RUN_CHECKPOINT_KEY, JSON.stringify({
      version: 1,
      shipClass: 'brigantine',
      doctrineId: 'x',
      seed: 'bad',
    }));

    expect(loadRunCheckpoint()).toBeNull();
    clearRunCheckpoint();
    expect(loadRunCheckpoint()).toBeNull();
  });
});
