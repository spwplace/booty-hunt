import type { IslandType, WaveConfigV1, EnemyType } from './Types';
import type { WeatherState } from './Weather';

// ===================================================================
//  Scenario Data Model
// ===================================================================

export interface ScenarioIsland {
  type: IslandType;
  x: number;
  z: number;
  radius: number;
  hasTreasure: boolean;
  seed: number;
}

export interface ScenarioWave {
  totalShips: number;
  armedPercent: number;
  speedMultiplier: number;
  healthMultiplier: number;
  weather: WeatherState;
  enemyTypes: EnemyType[];
  bossName: string | null;
  bossHp: number;
  isPortWave: boolean;
  specialEvent: string | null;
}

export type WinConditionType = 'all_waves_cleared' | 'gold_target' | 'survive_duration' | 'defeat_boss';

export interface WinCondition {
  type: WinConditionType;
  value: number;
  bossWaveIndex?: number;
}

export interface Scenario {
  version: 1;
  name: string;
  author: string;
  description: string;
  createdAt: number;
  islands: ScenarioIsland[];
  waves: ScenarioWave[];
  winConditions: WinCondition[];
  startWeather: WeatherState;
}

// ===================================================================
//  Factory
// ===================================================================

export function createEmptyScenario(): Scenario {
  return {
    version: 1,
    name: 'Untitled Scenario',
    author: '',
    description: '',
    createdAt: Date.now(),
    islands: [],
    waves: [createDefaultWave()],
    winConditions: [{ type: 'all_waves_cleared', value: 0 }],
    startWeather: 'clear',
  };
}

export function createDefaultWave(): ScenarioWave {
  return {
    totalShips: 4,
    armedPercent: 0,
    speedMultiplier: 1.0,
    healthMultiplier: 1.0,
    weather: 'clear',
    enemyTypes: ['merchant_sloop', 'merchant_galleon'],
    bossName: null,
    bossHp: 0,
    isPortWave: false,
    specialEvent: null,
  };
}

// ===================================================================
//  JSON Serialization
// ===================================================================

export function scenarioToJSON(scenario: Scenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function scenarioFromJSON(json: string): Scenario | null {
  try {
    const data = JSON.parse(json);
    if (data && data.version === 1 && Array.isArray(data.waves)) {
      return data as Scenario;
    }
  } catch { /* invalid JSON */ }
  return null;
}

// ===================================================================
//  URL Hash Sharing (deflate + base64url)
// ===================================================================

export async function scenarioToURLHash(scenario: Scenario): Promise<string> {
  const json = JSON.stringify(scenario);
  const input = new TextEncoder().encode(json);
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const compressed = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }

  // base64url encode
  let b64 = btoa(String.fromCharCode(...compressed));
  b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return '#scenario=' + b64;
}

export async function scenarioFromURLHash(hash: string): Promise<Scenario | null> {
  try {
    const prefix = '#scenario=';
    if (!hash.startsWith(prefix)) return null;

    let b64 = hash.slice(prefix.length);
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';

    const binary = atob(b64);
    const compressed = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      compressed[i] = binary.charCodeAt(i);
    }

    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();

    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const decompressed = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }

    const json = new TextDecoder().decode(decompressed);
    return scenarioFromJSON(json);
  } catch { /* corrupted hash */ }
  return null;
}

// ===================================================================
//  localStorage CRUD
// ===================================================================

const SCENARIO_PREFIX = 'scenario-';

export function saveScenarioLocal(scenario: Scenario): void {
  const key = SCENARIO_PREFIX + scenario.name;
  try {
    localStorage.setItem(key, JSON.stringify(scenario));
  } catch { /* storage full */ }
}

export function loadScenarioLocal(name: string): Scenario | null {
  try {
    const raw = localStorage.getItem(SCENARIO_PREFIX + name);
    if (raw) return scenarioFromJSON(raw);
  } catch { /* corrupted */ }
  return null;
}

export function listScenariosLocal(): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SCENARIO_PREFIX)) {
      names.push(key.slice(SCENARIO_PREFIX.length));
    }
  }
  return names.sort();
}

export function deleteScenarioLocal(name: string): void {
  localStorage.removeItem(SCENARIO_PREFIX + name);
}

// ===================================================================
//  Wave Table Conversion
// ===================================================================

export function scenarioWavesToWaveTable(waves: ScenarioWave[]): WaveConfigV1[] {
  return waves.map((w, i) => ({
    wave: i + 1,
    totalShips: w.totalShips,
    armedPercent: w.armedPercent,
    speedMultiplier: w.speedMultiplier,
    healthMultiplier: w.healthMultiplier,
    weather: w.weather,
    enemyTypes: [...w.enemyTypes],
    bossName: w.bossName,
    bossHp: w.bossHp,
    isPortWave: w.isPortWave,
    specialEvent: w.specialEvent as WaveConfigV1['specialEvent'],
  }));
}

// ===================================================================
//  Win Condition Evaluation
// ===================================================================

export function checkScenarioWinConditions(
  conditions: WinCondition[],
  wavesCompleted: number,
  totalWaves: number,
  gold: number,
  timePlayed: number,
  bossDefeated: boolean,
): boolean {
  for (const cond of conditions) {
    switch (cond.type) {
      case 'all_waves_cleared':
        if (wavesCompleted < totalWaves) return false;
        break;
      case 'gold_target':
        if (gold < cond.value) return false;
        break;
      case 'survive_duration':
        if (timePlayed < cond.value) return false;
        break;
      case 'defeat_boss':
        if (!bossDefeated) return false;
        break;
    }
  }
  return true;
}
