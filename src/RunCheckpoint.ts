import type { WaveConfigV1, ShipClass } from './Types';
import type { MapNodeSnapshot } from './MapNodeSystem';
import type { ProgressionRunSnapshot } from './Progression';
import type { RunEconomyState } from './EconomySystem';
import type { CrewMemberSnapshot } from './Crew';

export interface RunCheckpointContractSnapshot {
  wave: number;
  factionId: string | null;
  factionName: string;
  contractType: 'captures' | 'armed_captures' | 'plunder_gold';
  target: number;
  rewardSupplies: number;
  rewardIntel: number;
  rewardTokens: number;
  rewardGold: number;
  penaltySupplies: number;
  penaltyIntel: number;
  progressLabel: string;
  targetLabel: string;
  announcedMidpoint: boolean;
  announcedComplete: boolean;
}

export interface RunCheckpointV1 {
  version: 1;
  savedAt: string;
  shipClass: ShipClass;
  doctrineId: string;
  seed: number;
  progression: ProgressionRunSnapshot;
  map: MapNodeSnapshot;
  economy: RunEconomyState;
  factionReputation: Record<string, number>;
  crew: CrewMemberSnapshot[];
  activeWaveConfig: WaveConfigV1 | null;
  activeContractObjective: RunCheckpointContractSnapshot | null;
  capturesThisWave: number;
  armedCapturesThisWave: number;
  waveCaptureGold: number;
  heat?: number;
  maxHeat?: number;
}

const RUN_CHECKPOINT_KEY = 'booty-hunt-run-checkpoint-v1';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCrewRole(value: unknown): value is CrewMemberSnapshot['role'] {
  return value === 'navigator'
    || value === 'gunner'
    || value === 'surgeon'
    || value === 'lookout'
    || value === 'bosun'
    || value === 'quartermaster';
}

function parseCrewSnapshot(value: unknown): CrewMemberSnapshot[] {
  if (!Array.isArray(value)) return [];
  const crew: CrewMemberSnapshot[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<CrewMemberSnapshot>;
    if (!isCrewRole(raw.role)) continue;
    if (!isFiniteNumber(raw.level) || !isFiniteNumber(raw.maxLevel)) continue;
    if (typeof raw.name !== 'string') continue;
    crew.push({
      role: raw.role,
      level: raw.level,
      maxLevel: raw.maxLevel,
      name: raw.name,
    });
  }
  return crew;
}

export function saveRunCheckpoint(checkpoint: RunCheckpointV1): boolean {
  try {
    localStorage.setItem(RUN_CHECKPOINT_KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}

export function loadRunCheckpoint(): RunCheckpointV1 | null {
  try {
    const raw = localStorage.getItem(RUN_CHECKPOINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunCheckpointV1>;
    if (parsed.version !== 1) return null;
    if (!parsed.progression || !parsed.map || !parsed.economy) return null;
    if (!isFiniteNumber(parsed.seed)) return null;
    if (parsed.shipClass !== 'sloop' && parsed.shipClass !== 'brigantine' && parsed.shipClass !== 'galleon') return null;
    if (typeof parsed.doctrineId !== 'string') return null;
    if (!isFiniteNumber(parsed.capturesThisWave) || !isFiniteNumber(parsed.armedCapturesThisWave) || !isFiniteNumber(parsed.waveCaptureGold)) {
      return null;
    }
    return {
      ...(parsed as RunCheckpointV1),
      crew: parseCrewSnapshot(parsed.crew),
    };
  } catch {
    return null;
  }
}

export function clearRunCheckpoint(): void {
  try {
    localStorage.removeItem(RUN_CHECKPOINT_KEY);
  } catch {
    // ignore storage errors
  }
}

export function hasRunCheckpoint(): boolean {
  return loadRunCheckpoint() !== null;
}
