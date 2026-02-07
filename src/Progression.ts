import type { WeatherState } from './Weather';
import type {
  AccessibilitySettings,
  ColorblindMode,
  ShipClass,
  CrewBonus,
  RunStats,
  RunHistoryEntry,
  WaveConfigV1,
  SaveDataV1,
} from './Types';
import { SHIP_CLASS_CONFIGS, WAVE_TABLE } from './Types';
import type { V2Doctrine } from './V2Content';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface WaveConfig {
  wave: number;
  totalShips: number;
  armedPercent: number;
  speedMultiplier: number;
  healthMultiplier: number;
  weather: WeatherState;
}

export type UpgradeTier = 'common' | 'rare' | 'legendary';

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: UpgradeTier;
  apply: (stats: PlayerStats) => void;
}

export interface PlayerStats {
  maxSpeed: number;
  cannonDamage: number;
  maxHealth: number;
  health: number;
  captureRange: number;
  cannonCooldown: number;
  armor: number;
  /** Set by "Plunderer's Fortune" -- gold multiplier */
  goldMultiplier?: number;
  /** Set by "Full Broadside" -- fire 5 cannonballs instead of 3 */
  fullBroadside?: boolean;
  /** Set by "Ghost Sails" -- chance to dodge incoming shots */
  ghostDodgeChance?: number;
  /** Hit ships lose 50% speed for 3s */
  chainShotActive?: boolean;
  /** Cannonball splits into 3 on proximity miss */
  grapeshotActive?: boolean;
  /** Escorts flee sooner */
  warDrums?: boolean;
  /** Extra gold % on captures */
  boardingPartyBonus?: number;
  /** -40% HP, +80% damage, +25% speed */
  davyJonesPact?: boolean;
  /** Survive one fatal blow per wave */
  phoenixSailsActive?: boolean;
  /** Track if phoenix sails used this wave */
  phoenixSailsUsed?: boolean;
  /** UI markers on all ships */
  cursedCompass?: boolean;
  /** Every 5th cannonball AoE */
  neptunesWrath?: boolean;
  /** Track shots for neptune's wrath */
  neptunesWrathCounter?: number;
  /** Extra flee detection range multiplier */
  lookoutEyeRange?: number;
  /** Cannon spread reduction multiplier */
  steadyHandsSpread?: number;
  /** HP regen between waves */
  hpRegenPerWave?: number;
  /** Immunity to storm speed penalty (from Ghost Captain synergy) */
  stormImmunity?: boolean;
  /** Cannons per side (set by ship class) */
  cannonsPerSide?: number;
  /** Dodge bonus from ship class */
  shipDodgeBonus?: number;
}

export interface ProgressionRunSnapshot {
  wave: number;
  state: GameState;
  score: number;
  shipsDestroyed: number;
  shipsTotal: number;
  stats: PlayerStats;
  acquiredUpgradeIds: string[];
  activeSynergies: string[];
  runStats: RunStats;
  runTimeSeconds: number;
  shipClass: ShipClass;
  upgradeBonus: number;
  endlessMode: boolean;
}

export interface RuntimeSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  accessibility: AccessibilitySettings;
}

// ---------------------------------------------------------------------------
// Synergy system
// ---------------------------------------------------------------------------

export interface Synergy {
  id: string;
  name: string;
  requiredUpgrades: string[];
  description: string;
  apply: (stats: PlayerStats) => void;
}

const SYNERGIES: Synergy[] = [
  {
    id: 'broadside_mastery',
    name: 'Broadside Mastery',
    requiredUpgrades: ['full_broadside', 'rapid_reload'],
    description: 'Full Broadside + Rapid Reload: +25% cannon damage',
    apply(stats) {
      stats.cannonDamage *= 1.25;
    },
  },
  {
    id: 'iron_fortress',
    name: 'Iron Fortress',
    requiredUpgrades: ['iron_hull', 'sea_dogs_grit'],
    description: "Iron Hull + Sea Dog's Grit: +3 HP regen per wave",
    apply(stats) {
      stats.hpRegenPerWave = (stats.hpRegenPerWave ?? 0) + 3;
    },
  },
  {
    id: 'treasure_fleet',
    name: 'Treasure Fleet',
    requiredUpgrades: ['plunderers_fortune', 'boarding_party'],
    description: "Plunderer's Fortune + Boarding Party: captures grant 3x gold",
    apply(stats) {
      stats.goldMultiplier = (stats.goldMultiplier ?? 1) * 3;
    },
  },
  {
    id: 'ghost_captain',
    name: 'Ghost Captain',
    requiredUpgrades: ['ghost_sails', 'faster_sails'],
    description: 'Ghost Sails + Faster Sails: immunity to storm speed penalty',
    apply(stats) {
      stats.stormImmunity = true;
    },
  },
];

// ---------------------------------------------------------------------------
// Upgrade pool -- 24 total
// ---------------------------------------------------------------------------

const UPGRADE_POOL: Upgrade[] = [
  // ---- Original 12 (with tiers) ----
  {
    id: 'faster_sails',
    name: 'Faster Sails',
    description: 'The wind favors the bold!',
    icon: '\u26F5',
    tier: 'common',
    apply(stats) {
      stats.maxSpeed *= 1.15;
    },
  },
  {
    id: 'reinforced_shot',
    name: 'Reinforced Shot',
    description: 'Heavier iron, deadlier impact',
    icon: '\uD83D\uDCA5',
    tier: 'common',
    apply(stats) {
      stats.cannonDamage *= 1.25;
    },
  },
  {
    id: 'repair_hull',
    name: 'Repair Hull',
    description: "Patch 'er up, boys!",
    icon: '\uD83D\uDD28',
    tier: 'common',
    apply(stats) {
      stats.health = Math.min(stats.health + 40, stats.maxHealth);
    },
  },
  {
    id: 'grappling_hooks',
    name: 'Grappling Hooks',
    description: 'No ship escapes yer reach',
    icon: '\uD83E\uDE9D',
    tier: 'common',
    apply(stats) {
      stats.captureRange *= 1.2;
    },
  },
  {
    id: 'iron_hull',
    name: 'Iron Hull',
    description: "She'll take a beatin' and keep floatin'",
    icon: '\uD83D\uDEE1\uFE0F',
    tier: 'common',
    apply(stats) {
      stats.maxHealth += 20;
      stats.health = Math.min(stats.health + 20, stats.maxHealth);
    },
  },
  {
    id: 'rapid_reload',
    name: 'Rapid Reload',
    description: 'Fire at will!',
    icon: '\uD83E\uDDE8',
    tier: 'common',
    apply(stats) {
      stats.cannonCooldown *= 0.85;
    },
  },
  {
    id: 'krakens_blessing',
    name: "Kraken's Blessing",
    description: 'The deep ones smile upon ye',
    icon: '\uD83D\uDC19',
    tier: 'rare',
    apply(stats) {
      stats.maxSpeed *= 1.1;
      stats.cannonDamage *= 1.1;
      stats.maxHealth += 10;
      stats.health = Math.min(stats.health + 10, stats.maxHealth);
    },
  },
  {
    id: 'plunderers_fortune',
    name: "Plunderer's Fortune",
    description: 'Every coin shines brighter',
    icon: '\uD83D\uDCB0',
    tier: 'rare',
    apply(stats) {
      stats.goldMultiplier = (stats.goldMultiplier ?? 1) * 2;
    },
  },
  {
    id: 'sea_dogs_grit',
    name: "Sea Dog's Grit",
    description: 'Scars make ye stronger',
    icon: '\uD83E\uDDB4',
    tier: 'common',
    apply(stats) {
      stats.armor = Math.max(0, stats.armor - 0.15);
    },
  },
  {
    id: 'full_broadside',
    name: 'Full Broadside',
    description: "Let 'em have it ALL",
    icon: '\uD83D\uDD25',
    tier: 'rare',
    apply(stats) {
      stats.fullBroadside = true;
    },
  },
  {
    id: 'ghost_sails',
    name: 'Ghost Sails',
    description: 'Now ye see me...',
    icon: '\uD83D\uDC7B',
    tier: 'legendary',
    apply(stats) {
      // Stack diminishingly -- first pick = 0.30, second pick adds more
      const current = stats.ghostDodgeChance ?? 0;
      stats.ghostDodgeChance = current + (1 - current) * 0.3;
    },
  },
  {
    id: 'treasure_magnet',
    name: 'Treasure Magnet',
    description: 'Gold finds its way to ye',
    icon: '\uD83E\uDDF2',
    tier: 'common',
    apply(stats) {
      stats.captureRange *= 1.4;
    },
  },

  // ---- New 12 upgrades ----

  // Common
  {
    id: 'lookouts_eye',
    name: "Lookout's Eye",
    description: 'Spot danger before it spots ye',
    icon: '\uD83D\uDD2D',
    tier: 'common',
    apply(stats) {
      stats.lookoutEyeRange = (stats.lookoutEyeRange ?? 1) * 1.15;
    },
  },
  {
    id: 'steady_hands',
    name: 'Steady Hands',
    description: 'Every shot finds its mark',
    icon: '\uD83C\uDFAF',
    tier: 'common',
    apply(stats) {
      stats.steadyHandsSpread = (stats.steadyHandsSpread ?? 1) * 0.8;
    },
  },
  {
    id: 'hardtack_rations',
    name: 'Hardtack Rations',
    description: 'Tough food for tough sailors',
    icon: '\uD83C\uDF5E',
    tier: 'common',
    apply(stats) {
      stats.hpRegenPerWave = (stats.hpRegenPerWave ?? 0) + 2;
    },
  },
  {
    id: 'tar_and_pitch',
    name: 'Tar & Pitch',
    description: 'Seal every crack and crevice',
    icon: '\uD83D\uDEE2\uFE0F',
    tier: 'common',
    apply(stats) {
      stats.maxHealth += 25;
      stats.health = Math.min(stats.health + 25, stats.maxHealth);
    },
  },

  // Rare
  {
    id: 'chain_shot',
    name: 'Chain Shot',
    description: 'Shred their rigging, slow them down',
    icon: '\u26D3\uFE0F',
    tier: 'rare',
    apply(stats) {
      stats.chainShotActive = true;
    },
  },
  {
    id: 'grapeshot',
    name: 'Grapeshot',
    description: 'One ball becomes three on a near miss',
    icon: '\uD83C\uDF47',
    tier: 'rare',
    apply(stats) {
      stats.grapeshotActive = true;
    },
  },
  {
    id: 'war_drums',
    name: 'War Drums',
    description: 'The beating drives fear into their hearts',
    icon: '\uD83E\uDD41',
    tier: 'rare',
    apply(stats) {
      stats.warDrums = true;
    },
  },
  {
    id: 'boarding_party',
    name: 'Boarding Party',
    description: 'Yer crew takes everything of value',
    icon: '\u2694\uFE0F',
    tier: 'rare',
    apply(stats) {
      stats.boardingPartyBonus = (stats.boardingPartyBonus ?? 0) + 0.25;
    },
  },

  // Legendary
  {
    id: 'davys_pact',
    name: "Davy's Pact",
    description: 'Trade yer life force for unholy power',
    icon: '\uD83D\uDC80',
    tier: 'legendary',
    apply(stats) {
      stats.davyJonesPact = true;
      stats.maxHealth = Math.round(stats.maxHealth * 0.6);
      stats.health = Math.min(stats.health, stats.maxHealth);
      stats.cannonDamage *= 1.8;
      stats.maxSpeed *= 1.25;
    },
  },
  {
    id: 'phoenix_sails',
    name: 'Phoenix Sails',
    description: 'Rise from the ashes once per wave',
    icon: '\uD83D\uDD25',
    tier: 'legendary',
    apply(stats) {
      stats.phoenixSailsActive = true;
      stats.phoenixSailsUsed = false;
    },
  },
  {
    id: 'cursed_compass',
    name: 'Cursed Compass',
    description: 'See all ships through fog and darkness',
    icon: '\uD83E\uDDED',
    tier: 'legendary',
    apply(stats) {
      stats.cursedCompass = true;
    },
  },
  {
    id: 'neptunes_wrath',
    name: "Neptune's Wrath",
    description: 'Every fifth shot unleashes the sea god',
    icon: '\uD83D\uDD31',
    tier: 'legendary',
    apply(stats) {
      stats.neptunesWrath = true;
      stats.neptunesWrathCounter = 0;
    },
  },
];

// ---------------------------------------------------------------------------
// Weather schedule helpers (used for endless mode beyond the final wave)
// ---------------------------------------------------------------------------

const WEATHER_CYCLE: WeatherState[] = [
  'clear',
  'clear',
  'foggy',
  'stormy',
  'night',
];

function weatherForWave(wave: number): WeatherState {
  if (wave <= WEATHER_CYCLE.length) {
    return WEATHER_CYCLE[wave - 1];
  }
  // After the introductory cycle, storms and night become more frequent.
  // We build a weighted pool that shifts toward rougher seas.
  const extraWaves = wave - WEATHER_CYCLE.length;
  const stormWeight = Math.min(0.15 + extraWaves * 0.05, 0.40);
  const nightWeight = Math.min(0.10 + extraWaves * 0.03, 0.25);
  const fogWeight = 0.15;
  const clearWeight = 1 - stormWeight - nightWeight - fogWeight;

  const roll = Math.random();
  if (roll < clearWeight) return 'clear';
  if (roll < clearWeight + fogWeight) return 'foggy';
  if (roll < clearWeight + fogWeight + stormWeight) return 'stormy';
  return 'night';
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const SAVE_KEY = 'booty-hunt-save';

/** Legacy save data (kept for backward compatibility in loadSave) */
interface SaveData {
  highScore: number;
  highWave: number;
  totalGold: number;
  totalShips: number;
  totalWaves: number;
  bestCombo: number;
  unlockedBonuses: string[];
}

/** Meta-persistence unlock definitions */
interface MetaUnlock {
  id: string;
  cost: number;
  description: string;
}

const META_UNLOCKS: MetaUnlock[] = [
  { id: 'starting_speed', cost: 500, description: '+5% starting speed' },
  { id: 'starting_upgrade', cost: 2000, description: 'Start with 1 random common upgrade' },
  { id: 'early_legendary', cost: 5000, description: 'Legendary upgrades available from wave 1' },
  { id: 'golden_hull', cost: 15000, description: 'Cosmetic golden hull' },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function parseColorblindMode(value: unknown): ColorblindMode {
  if (value === 'protanopia' || value === 'deuteranopia' || value === 'tritanopia') return value;
  return 'off';
}

function createDefaultSaveV1(): SaveDataV1 {
  return {
    highScore: 0,
    highWave: 0,
    totalGold: 0,
    totalShips: 0,
    totalWaves: 0,
    bestCombo: 0,
    unlockedBonuses: [],
    victories: 0,
    victoryClasses: [],
    galleonUnlocked: false,
    bosunUnlocked: false,
    quartermasterUnlocked: false,
    endlessModeUnlocked: false,
    tutorialCompleted: false,
    masterVolume: 1,
    musicVolume: 0.7,
    sfxVolume: 1,
    graphicsQuality: 'high',
    textScale: 1,
    motionIntensity: 1,
    flashIntensity: 1,
    colorblindMode: 'off',
    v2CodexDiscovered: [],
    v2FactionReputation: {},
  };
}

function loadSaveV1(): SaveDataV1 {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<SaveDataV1>;
      return {
        highScore: data.highScore ?? 0,
        highWave: data.highWave ?? 0,
        totalGold: data.totalGold ?? 0,
        totalShips: data.totalShips ?? 0,
        totalWaves: data.totalWaves ?? 0,
        bestCombo: data.bestCombo ?? 0,
        unlockedBonuses: data.unlockedBonuses ?? [],
        victories: data.victories ?? 0,
        victoryClasses: data.victoryClasses ?? [],
        galleonUnlocked: data.galleonUnlocked ?? false,
        bosunUnlocked: data.bosunUnlocked ?? false,
        quartermasterUnlocked: data.quartermasterUnlocked ?? false,
        endlessModeUnlocked: data.endlessModeUnlocked ?? false,
        tutorialCompleted: data.tutorialCompleted ?? false,
        masterVolume: clamp01(data.masterVolume ?? 1),
        musicVolume: clamp01(data.musicVolume ?? 0.7),
        sfxVolume: clamp01(data.sfxVolume ?? 1),
        graphicsQuality: data.graphicsQuality === 'low' || data.graphicsQuality === 'medium' || data.graphicsQuality === 'high'
          ? data.graphicsQuality
          : 'high',
        textScale: Number.isFinite(data.textScale) ? Math.max(0.8, Math.min(1.4, data.textScale as number)) : 1,
        motionIntensity: clamp01(data.motionIntensity ?? 1),
        flashIntensity: clamp01(data.flashIntensity ?? 1),
        colorblindMode: parseColorblindMode(data.colorblindMode),
        v2CodexDiscovered: Array.isArray(data.v2CodexDiscovered)
          ? data.v2CodexDiscovered.filter((v): v is string => typeof v === 'string')
          : [],
        v2FactionReputation: typeof data.v2FactionReputation === 'object' && data.v2FactionReputation !== null
          ? Object.fromEntries(
            Object.entries(data.v2FactionReputation as Record<string, unknown>)
              .filter(([, value]) => typeof value === 'number')
              .map(([key, value]) => [key, value as number]),
          )
          : {},
      };
    }
  } catch {
    // corrupted save -- ignore
  }
  return createDefaultSaveV1();
}

function writeSaveV1(data: SaveDataV1): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable -- swallow
  }
}

const RUN_HISTORY_KEY = 'booty_run_history';
const MAX_RUN_HISTORY = 10;

export function loadRunHistory(): RunHistoryEntry[] {
  try {
    const raw = localStorage.getItem(RUN_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RunHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveRunToHistory(entry: RunHistoryEntry): void {
  try {
    const history = loadRunHistory();
    history.unshift(entry);
    if (history.length > MAX_RUN_HISTORY) history.length = MAX_RUN_HISTORY;
    localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // storage full or unavailable
  }
}

// Keep legacy aliases for backward compat within this file
function loadSave(): SaveData {
  const v1 = loadSaveV1();
  return {
    highScore: v1.highScore,
    highWave: v1.highWave,
    totalGold: v1.totalGold,
    totalShips: v1.totalShips,
    totalWaves: v1.totalWaves,
    bestCombo: v1.bestCombo,
    unlockedBonuses: v1.unlockedBonuses,
  };
}

function writeSave(data: SaveData): void {
  // Merge legacy save fields into the full V1 save
  const current = loadSaveV1();
  current.highScore = data.highScore;
  current.highWave = data.highWave;
  current.totalGold = data.totalGold;
  current.totalShips = data.totalShips;
  current.totalWaves = data.totalWaves;
  current.bestCombo = data.bestCombo;
  current.unlockedBonuses = data.unlockedBonuses;
  writeSaveV1(current);
}

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle (in-place)
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Default player stats factory
// ---------------------------------------------------------------------------

function createDefaultStats(): PlayerStats {
  return {
    maxSpeed: 14,
    cannonDamage: 1.0,
    maxHealth: 100,
    health: 100,
    captureRange: 4.5,
    cannonCooldown: 1.0,
    armor: 1.0,
    goldMultiplier: 1,
    fullBroadside: false,
    ghostDodgeChance: 0,
    chainShotActive: false,
    grapeshotActive: false,
    warDrums: false,
    boardingPartyBonus: 0,
    davyJonesPact: false,
    phoenixSailsActive: false,
    phoenixSailsUsed: false,
    cursedCompass: false,
    neptunesWrath: false,
    neptunesWrathCounter: 0,
    lookoutEyeRange: 1,
    steadyHandsSpread: 1,
    hpRegenPerWave: 0,
    stormImmunity: false,
    cannonsPerSide: 3,
    shipDodgeBonus: 0,
  };
}

// ---------------------------------------------------------------------------
// Default run stats factory
// ---------------------------------------------------------------------------

function createDefaultRunStats(shipClass: ShipClass): RunStats {
  return {
    gold: 0,
    shipsDestroyed: 0,
    wavesCompleted: 0,
    maxCombo: 0,
    damageDealt: 0,
    damageTaken: 0,
    eventsCompleted: 0,
    treasuresFound: 0,
    crewHired: 0,
    timePlayed: 0,
    shipClass,
    victory: false,
  };
}

// ---------------------------------------------------------------------------
// Tier helpers
// ---------------------------------------------------------------------------

/** Tier weight table: [common, rare, legendary] cumulative */
const TIER_WEIGHTS = { common: 0.60, rare: 0.90, legendary: 1.00 };

function rollTier(): UpgradeTier {
  const r = Math.random();
  if (r < TIER_WEIGHTS.common) return 'common';
  if (r < TIER_WEIGHTS.rare) return 'rare';
  return 'legendary';
}

// ---------------------------------------------------------------------------
// Upgrade category helpers (for tier queries)
// ---------------------------------------------------------------------------

const SPEED_UPGRADES = new Set(['faster_sails', 'ghost_sails', 'davys_pact']);
const ARMOR_UPGRADES = new Set(['iron_hull', 'sea_dogs_grit', 'tar_and_pitch', 'repair_hull']);
const WEAPON_UPGRADES = new Set([
  'reinforced_shot', 'rapid_reload', 'full_broadside',
  'chain_shot', 'grapeshot', 'neptunes_wrath',
]);

// ---------------------------------------------------------------------------
// Victory constants
// ---------------------------------------------------------------------------

const FINAL_WAVE = 15;

// ---------------------------------------------------------------------------
// ProgressionSystem
// ---------------------------------------------------------------------------

export type GameState = 'pre_wave' | 'active' | 'wave_complete' | 'upgrading' | 'port' | 'game_over';

export class ProgressionSystem {
  private stats: PlayerStats;
  private wave: number;
  private state: GameState;
  private score: number;
  private shipsDestroyed: number;
  private shipsTotal: number;
  private currentWaveConfig: WaveConfig | null;
  private currentUpgradeChoices: Upgrade[];
  private highScore: number;
  private highWave: number;

  private acquiredUpgradeIds: string[];
  private activeSynergies: string[];
  private metaStats: SaveData;
  private metaStatsV1: SaveDataV1;

  // Ship class for current run
  private shipClass: ShipClass;
  private upgradeBonus: number;

  // Run stats tracking
  private runStats: RunStats;
  private runStartTime: number;

  // Endless mode flag
  private endlessMode: boolean;
  private activeDoctrine: V2Doctrine | null;

  // Custom wave table (for scenario editor play-test)
  private customWaveTable: WaveConfigV1[] | null = null;
  private customFinalWave: number = FINAL_WAVE;

  constructor() {
    this.stats = createDefaultStats();
    this.wave = 1;
    this.state = 'pre_wave';
    this.score = 0;
    this.shipsDestroyed = 0;
    this.shipsTotal = 0;
    this.currentWaveConfig = null;
    this.currentUpgradeChoices = [];
    this.acquiredUpgradeIds = [];
    this.activeSynergies = [];

    this.shipClass = 'brigantine';
    this.upgradeBonus = 0;
    this.endlessMode = false;
    this.activeDoctrine = null;

    const saveV1 = loadSaveV1();
    this.metaStatsV1 = saveV1;
    this.metaStats = {
      highScore: saveV1.highScore,
      highWave: saveV1.highWave,
      totalGold: saveV1.totalGold,
      totalShips: saveV1.totalShips,
      totalWaves: saveV1.totalWaves,
      bestCombo: saveV1.bestCombo,
      unlockedBonuses: saveV1.unlockedBonuses,
    };
    this.highScore = saveV1.highScore;
    this.highWave = saveV1.highWave;

    this.runStats = createDefaultRunStats(this.shipClass);
    this.runStartTime = Date.now();

    // Apply any meta-persistence bonuses on construction
    this.applyMetaBonuses();
  }

  // -----------------------------------------------------------------------
  // Ship Class Integration
  // -----------------------------------------------------------------------

  /**
   * Initialize stats based on the selected ship class.
   * Should be called at the start of a new run before beginWave().
   */
  initializeStats(shipClass: ShipClass = 'brigantine', doctrine: V2Doctrine | null = null): void {
    this.shipClass = shipClass;
    this.stats = createDefaultStats();
    this.acquiredUpgradeIds = [];
    this.activeSynergies = [];
    this.activeDoctrine = doctrine
      ? {
        ...doctrine,
        startingBonuses: { ...doctrine.startingBonuses },
      }
      : null;

    const config = SHIP_CLASS_CONFIGS[shipClass];

    // Apply ship class base stats
    this.stats.maxSpeed = config.speed;
    this.stats.maxHealth = config.hp;
    this.stats.health = config.hp;
    this.stats.captureRange = config.captureRange;
    this.stats.cannonsPerSide = config.cannonsPerSide;
    this.stats.cannonDamage = 1.0 + config.damageBonus;
    this.stats.shipDodgeBonus = config.dodgeBonus;

    // Sloop dodge bonus stacks with ghost sails
    if (config.dodgeBonus > 0) {
      this.stats.ghostDodgeChance = (this.stats.ghostDodgeChance ?? 0) + config.dodgeBonus;
    }

    if (this.activeDoctrine) {
      this.applyDoctrineBonuses(this.activeDoctrine);
    }

    // Store upgrade bonus for later use when applying upgrades
    this.upgradeBonus = config.upgradeBonus;

    // Reset run stats for new ship class
    this.runStats = createDefaultRunStats(shipClass);
    this.runStartTime = Date.now();

    // Re-apply meta bonuses on top of ship class stats
    this.applyMetaBonuses();
  }

  private applyDoctrineBonuses(doctrine: V2Doctrine): void {
    const bonuses = doctrine.startingBonuses;
    this.stats.maxSpeed *= bonuses.speedMult;
    this.stats.cannonDamage *= bonuses.cannonDamageMult;
    this.stats.maxHealth = Math.max(1, Math.round(this.stats.maxHealth * bonuses.maxHealthMult));
    this.stats.health = Math.min(this.stats.health, this.stats.maxHealth);
  }

  /** Get the current ship class */
  getShipClass(): ShipClass {
    return this.shipClass;
  }

  /** Get the upgrade bonus multiplier for the current ship class */
  getUpgradeBonus(): number {
    return this.upgradeBonus;
  }

  // -----------------------------------------------------------------------
  // Crew Bonus Integration
  // -----------------------------------------------------------------------

  /**
   * Apply crew bonuses to player stats. Call this whenever crew changes
   * or at the start of each wave.
   *
   * This applies bonuses on top of the current stats (multiplicative for
   * mults, additive for flat). The caller should ensure this is called
   * after initializeStats() and after upgrades are applied.
   */
  applyCrewBonuses(bonuses: CrewBonus): void {
    this.stats.maxSpeed *= bonuses.speedMult;
    this.stats.cannonDamage *= bonuses.damageMult;
    this.stats.lookoutEyeRange = (this.stats.lookoutEyeRange ?? 1) * bonuses.visionMult;
    this.stats.goldMultiplier = (this.stats.goldMultiplier ?? 1) * bonuses.goldMult;

    // Flat bonuses
    if (bonuses.maxHpBonus > 0) {
      this.stats.maxHealth += bonuses.maxHpBonus;
      this.stats.health = Math.min(this.stats.health + bonuses.maxHpBonus, this.stats.maxHealth);
    }
    if (bonuses.hpRegen > 0) {
      this.stats.hpRegenPerWave = (this.stats.hpRegenPerWave ?? 0) + bonuses.hpRegen;
    }
  }

  // -----------------------------------------------------------------------
  // Meta-persistence bonus application
  // -----------------------------------------------------------------------

  private applyMetaBonuses(): void {
    const bonuses = this.metaStats.unlockedBonuses;

    if (bonuses.includes('starting_speed')) {
      this.stats.maxSpeed *= 1.05;
    }

    if (bonuses.includes('starting_upgrade')) {
      // Apply one random common upgrade
      const commons = UPGRADE_POOL.filter((u) => u.tier === 'common');
      if (commons.length > 0) {
        const pick = commons[Math.floor(Math.random() * commons.length)];
        pick.apply(this.stats);
        this.acquiredUpgradeIds.push(pick.id);
      }
    }

    // 'early_legendary' and 'golden_hull' are checked via hasMetaBonus()
  }

  // -----------------------------------------------------------------------
  // Public API -- queries
  // -----------------------------------------------------------------------

  getPlayerStats(): PlayerStats {
    return this.stats;
  }

  getCurrentWave(): number {
    return this.wave;
  }

  getState(): GameState {
    return this.state;
  }

  getScore(): number {
    return this.score;
  }

  getHighScore(): number {
    return this.highScore;
  }

  getShipsRemaining(): number {
    return Math.max(0, this.shipsTotal - this.shipsDestroyed);
  }

  getShipsTotal(): number {
    return this.shipsTotal;
  }

  getAcquiredUpgrades(): string[] {
    return [...this.acquiredUpgradeIds];
  }

  getActiveSynergies(): string[] {
    return [...this.activeSynergies];
  }

  getMetaStats(): SaveData {
    return { ...this.metaStats };
  }

  getRuntimeSettings(): RuntimeSettings {
    return {
      masterVolume: this.metaStatsV1.masterVolume,
      musicVolume: this.metaStatsV1.musicVolume,
      sfxVolume: this.metaStatsV1.sfxVolume,
      graphicsQuality: this.metaStatsV1.graphicsQuality,
      accessibility: {
        textScale: this.metaStatsV1.textScale,
        motionIntensity: this.metaStatsV1.motionIntensity,
        flashIntensity: this.metaStatsV1.flashIntensity,
        colorblindMode: this.metaStatsV1.colorblindMode,
      },
    };
  }

  updateRuntimeSettings(
    patch: Partial<Omit<RuntimeSettings, 'accessibility'>> & { accessibility?: Partial<AccessibilitySettings> },
  ): RuntimeSettings {
    if (patch.masterVolume != null) {
      this.metaStatsV1.masterVolume = clamp01(patch.masterVolume);
    }
    if (patch.musicVolume != null) {
      this.metaStatsV1.musicVolume = clamp01(patch.musicVolume);
    }
    if (patch.sfxVolume != null) {
      this.metaStatsV1.sfxVolume = clamp01(patch.sfxVolume);
    }
    if (patch.graphicsQuality === 'low' || patch.graphicsQuality === 'medium' || patch.graphicsQuality === 'high') {
      this.metaStatsV1.graphicsQuality = patch.graphicsQuality;
    }
    if (patch.accessibility) {
      if (patch.accessibility.textScale != null && Number.isFinite(patch.accessibility.textScale)) {
        this.metaStatsV1.textScale = Math.max(0.8, Math.min(1.4, patch.accessibility.textScale));
      }
      if (patch.accessibility.motionIntensity != null) {
        this.metaStatsV1.motionIntensity = clamp01(patch.accessibility.motionIntensity);
      }
      if (patch.accessibility.flashIntensity != null) {
        this.metaStatsV1.flashIntensity = clamp01(patch.accessibility.flashIntensity);
      }
      if (patch.accessibility.colorblindMode != null) {
        this.metaStatsV1.colorblindMode = parseColorblindMode(patch.accessibility.colorblindMode);
      }
    }
    writeSaveV1(this.metaStatsV1);
    return this.getRuntimeSettings();
  }

  // -----------------------------------------------------------------------
  // Dev-only setters (for DevPanel)
  // -----------------------------------------------------------------------

  devSetHealth(value: number): void {
    this.stats.health = Math.max(0, Math.min(value, this.stats.maxHealth));
  }

  devSetScore(value: number): void {
    this.score = Math.max(0, value);
  }

  devSetWave(value: number): void {
    this.wave = Math.max(1, value);
  }

  devSetMaxSpeed(value: number): void {
    this.stats.maxSpeed = Math.max(1, value);
  }

  devSetCannonDamage(value: number): void {
    this.stats.cannonDamage = Math.max(0.1, value);
  }

  getMetaStatsV1(): SaveDataV1 {
    return { ...this.metaStatsV1 };
  }

  isTutorialCompleted(): boolean {
    return this.metaStatsV1.tutorialCompleted;
  }

  markTutorialCompleted(): void {
    if (this.metaStatsV1.tutorialCompleted) return;
    this.metaStatsV1.tutorialCompleted = true;
    writeSaveV1(this.metaStatsV1);
  }

  getActiveDoctrine(): { id: string; name: string; summary: string } | null {
    if (!this.activeDoctrine) return null;
    return {
      id: this.activeDoctrine.id,
      name: this.activeDoctrine.name,
      summary: this.activeDoctrine.summary,
    };
  }

  unlockCodexEntry(entryId: string): boolean {
    const id = entryId.trim();
    if (!id) return false;
    if (this.metaStatsV1.v2CodexDiscovered.includes(id)) return false;
    this.metaStatsV1.v2CodexDiscovered.push(id);
    writeSaveV1(this.metaStatsV1);
    return true;
  }

  getCodexEntryCount(): number {
    return this.metaStatsV1.v2CodexDiscovered.length;
  }

  getCodexEntries(): string[] {
    return [...this.metaStatsV1.v2CodexDiscovered];
  }

  setFactionReputationSnapshot(snapshot: Record<string, number>): void {
    this.metaStatsV1.v2FactionReputation = { ...snapshot };
  }

  getFactionReputationSnapshot(): Record<string, number> {
    return { ...this.metaStatsV1.v2FactionReputation };
  }

  getMostHostileFaction(): { id: string; score: number } | null {
    let result: { id: string; score: number } | null = null;
    for (const [id, score] of Object.entries(this.metaStatsV1.v2FactionReputation)) {
      if (!result || score < result.score) {
        result = { id, score };
      }
    }
    return result;
  }

  getMostAlliedFaction(): { id: string; score: number } | null {
    let result: { id: string; score: number } | null = null;
    for (const [id, score] of Object.entries(this.metaStatsV1.v2FactionReputation)) {
      if (!result || score > result.score) {
        result = { id, score };
      }
    }
    return result;
  }

  hasMetaBonus(id: string): boolean {
    return this.metaStats.unlockedBonuses.includes(id);
  }

  /** Returns 0-3 tier based on how many speed upgrades acquired */
  getSpeedTier(): number {
    let count = 0;
    for (const id of this.acquiredUpgradeIds) {
      if (SPEED_UPGRADES.has(id)) count++;
    }
    return Math.min(count, 3);
  }

  /** Returns 0-3 tier based on how many armor upgrades acquired */
  getArmorTier(): number {
    let count = 0;
    for (const id of this.acquiredUpgradeIds) {
      if (ARMOR_UPGRADES.has(id)) count++;
    }
    return Math.min(count, 3);
  }

  /** Returns 0-3 tier based on how many weapon upgrades acquired */
  getWeaponTier(): number {
    let count = 0;
    for (const id of this.acquiredUpgradeIds) {
      if (WEAPON_UPGRADES.has(id)) count++;
    }
    return Math.min(count, 3);
  }

  /** True if current wave is a boss wave (uses WAVE_TABLE or every 5th in endless) */
  isBossWave(): boolean {
    if (this.customWaveTable && this.wave >= 1 && this.wave <= this.customWaveTable.length) {
      return this.customWaveTable[this.wave - 1].bossName !== null;
    }
    if (this.wave <= FINAL_WAVE) {
      const entry = WAVE_TABLE[this.wave - 1];
      return entry.bossName !== null;
    }
    // Endless mode: boss every 5th wave past 12
    return this.wave % 5 === 0;
  }

  /** True if current wave is a port wave (from WAVE_TABLE) */
  isPortWave(): boolean {
    if (this.customWaveTable && this.wave >= 1 && this.wave <= this.customWaveTable.length) {
      return this.customWaveTable[this.wave - 1].isPortWave;
    }
    if (this.wave <= FINAL_WAVE) {
      return WAVE_TABLE[this.wave - 1].isPortWave;
    }
    // Endless mode: port every 3rd wave
    return (this.wave - FINAL_WAVE) % 3 === 0;
  }

  /** Check if endless mode is active */
  isEndlessMode(): boolean {
    return this.endlessMode;
  }

  /** Set endless mode */
  setEndlessMode(enabled: boolean): void {
    this.endlessMode = enabled;
  }

  /** Load a custom wave table (scenario editor play-test) */
  setCustomWaveTable(table: WaveConfigV1[]): void {
    this.customWaveTable = table;
    this.customFinalWave = table.length;
  }

  /** Clear custom wave table, reverting to default WAVE_TABLE */
  clearCustomWaveTable(): void {
    this.customWaveTable = null;
    this.customFinalWave = FINAL_WAVE;
  }

  // -----------------------------------------------------------------------
  // Wave configuration (now uses WAVE_TABLE for waves 1-12)
  // -----------------------------------------------------------------------

  /**
   * Get the WaveConfigV1 for a specific wave from the table.
   * Returns the table entry for waves 1-12, or generates config for endless.
   */
  getWaveConfigV1(wave?: number): WaveConfigV1 {
    const w = wave ?? this.wave;

    // Custom wave table takes priority (scenario editor play-test)
    if (this.customWaveTable && w >= 1 && w <= this.customWaveTable.length) {
      return { ...this.customWaveTable[w - 1] };
    }

    if (w >= 1 && w <= FINAL_WAVE) {
      return { ...WAVE_TABLE[w - 1] };
    }

    // Endless mode: generate scaling config beyond the final wave
    const endlessWave = w - FINAL_WAVE;
    return {
      wave: w,
      totalShips: Math.min(14 + endlessWave * 2, 24),
      armedPercent: Math.min(0.75 + endlessWave * 0.03, 0.95),
      speedMultiplier: 2.00 + endlessWave * 0.08,
      healthMultiplier: 2.00 + endlessWave * 0.12,
      weather: weatherForWave(w),
      enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship', 'navy_warship'],
      bossName: endlessWave % 3 === 0 ? 'Endless Dread' : null,
      bossHp: endlessWave % 3 === 0 ? 800 + endlessWave * 120 : 0,
      isPortWave: endlessWave % 2 === 0,
      specialEvent: null,
    };
  }

  /** Legacy getWaveConfig() -- returns the old WaveConfig format */
  getWaveConfig(): WaveConfig {
    const v1 = this.getWaveConfigV1();
    return {
      wave: v1.wave,
      totalShips: v1.totalShips,
      armedPercent: v1.armedPercent,
      speedMultiplier: v1.speedMultiplier,
      healthMultiplier: v1.healthMultiplier,
      weather: v1.weather,
    };
  }

  // -----------------------------------------------------------------------
  // Victory condition
  // -----------------------------------------------------------------------

  /**
   * Check if the player has achieved victory (completed all waves).
   */
  checkVictory(wave?: number): boolean {
    if (this.endlessMode) return false;
    // Victory happens when the final wave is completed
    return this.runStats.wavesCompleted >= this.customFinalWave;
  }

  // -----------------------------------------------------------------------
  // Run Stats Tracking
  // -----------------------------------------------------------------------

  /** Get current run stats snapshot */
  getRunStats(): RunStats {
    // Update time played
    this.runStats.timePlayed = (Date.now() - this.runStartTime) / 1000;
    this.runStats.gold = this.score;
    this.runStats.victory = this.checkVictory();
    return { ...this.runStats };
  }

  getRunSnapshot(): ProgressionRunSnapshot {
    return {
      wave: this.wave,
      state: this.state,
      score: this.score,
      shipsDestroyed: this.shipsDestroyed,
      shipsTotal: this.shipsTotal,
      stats: { ...this.stats },
      acquiredUpgradeIds: [...this.acquiredUpgradeIds],
      activeSynergies: [...this.activeSynergies],
      runStats: this.getRunStats(),
      runTimeSeconds: Math.max(0, (Date.now() - this.runStartTime) / 1000),
      shipClass: this.shipClass,
      upgradeBonus: this.upgradeBonus,
      endlessMode: this.endlessMode,
    };
  }

  restoreRunSnapshot(snapshot: ProgressionRunSnapshot): void {
    this.wave = Math.max(1, snapshot.wave);
    this.state = snapshot.state;
    this.score = Math.max(0, snapshot.score);
    this.shipsDestroyed = Math.max(0, snapshot.shipsDestroyed);
    this.shipsTotal = Math.max(0, snapshot.shipsTotal);
    this.stats = { ...snapshot.stats };
    this.acquiredUpgradeIds = [...snapshot.acquiredUpgradeIds];
    this.activeSynergies = [...snapshot.activeSynergies];
    this.runStats = { ...snapshot.runStats };
    this.runStartTime = Date.now() - Math.max(0, snapshot.runTimeSeconds) * 1000;
    this.shipClass = snapshot.shipClass;
    this.upgradeBonus = snapshot.upgradeBonus;
    this.endlessMode = snapshot.endlessMode;
  }

  /** Record damage dealt to enemies */
  addDamageDealt(amount: number): void {
    this.runStats.damageDealt += amount;
  }

  /** Record damage taken by the player */
  addDamageTaken(amount: number): void {
    this.runStats.damageTaken += amount;
  }

  /** Record an event completion */
  addEventCompleted(): void {
    this.runStats.eventsCompleted++;
  }

  /** Record a treasure found */
  addTreasureFound(): void {
    this.runStats.treasuresFound++;
  }

  /** Record a crew hire */
  addCrewHired(): void {
    this.runStats.crewHired++;
  }

  /** Update max combo in run stats */
  updateRunCombo(combo: number): void {
    if (combo > this.runStats.maxCombo) {
      this.runStats.maxCombo = combo;
    }
  }

  // -----------------------------------------------------------------------
  // Meta-Progression Expansion (SaveDataV1)
  // -----------------------------------------------------------------------

  /**
   * Check what new unlocks the player earned from this run.
   * Returns a list of unlock description strings.
   */
  checkUnlocks(runStats: RunStats): string[] {
    const unlocks: string[] = [];

    if (runStats.victory) {
      // Track victory
      this.metaStatsV1.victories++;

      // Track victory class
      if (!this.metaStatsV1.victoryClasses.includes(runStats.shipClass)) {
        this.metaStatsV1.victoryClasses.push(runStats.shipClass);
      }

      const uniqueClasses = this.metaStatsV1.victoryClasses.length;

      // Galleon unlock: first victory
      if (!this.metaStatsV1.galleonUnlocked && this.metaStatsV1.victories >= 1) {
        this.metaStatsV1.galleonUnlocked = true;
        unlocks.push('Galleon unlocked! A mighty vessel of war.');
      }

      // Endless mode unlock: first victory
      if (!this.metaStatsV1.endlessModeUnlocked && this.metaStatsV1.victories >= 1) {
        this.metaStatsV1.endlessModeUnlocked = true;
        unlocks.push('Endless Mode unlocked! Sail beyond the final wave.');
      }

      // Bosun/Quartermaster unlock: victory with 2 different ship classes
      if (uniqueClasses >= 2) {
        if (!this.metaStatsV1.bosunUnlocked) {
          this.metaStatsV1.bosunUnlocked = true;
          unlocks.push('Bosun crew role unlocked! +5 max HP per level.');
        }
        if (!this.metaStatsV1.quartermasterUnlocked) {
          this.metaStatsV1.quartermasterUnlocked = true;
          unlocks.push('Quartermaster crew role unlocked! +8% gold per level.');
        }
      }

      // Sync changes back to legacy metaStats
      this.syncV1ToLegacy();

      // Persist
      writeSaveV1(this.metaStatsV1);
    }

    return unlocks;
  }

  /**
   * Apply saved settings and unlocks from a SaveDataV1 object.
   */
  applySaveData(data: SaveDataV1): void {
    this.metaStatsV1 = { ...data };
    this.syncV1ToLegacy();
    this.highScore = data.highScore;
    this.highWave = data.highWave;
  }

  /** Sync V1 data back to legacy SaveData fields */
  private syncV1ToLegacy(): void {
    this.metaStats.highScore = this.metaStatsV1.highScore;
    this.metaStats.highWave = this.metaStatsV1.highWave;
    this.metaStats.totalGold = this.metaStatsV1.totalGold;
    this.metaStats.totalShips = this.metaStatsV1.totalShips;
    this.metaStats.totalWaves = this.metaStatsV1.totalWaves;
    this.metaStats.bestCombo = this.metaStatsV1.bestCombo;
    this.metaStats.unlockedBonuses = this.metaStatsV1.unlockedBonuses;
  }

  /** Sync legacy SaveData fields back to V1 */
  private syncLegacyToV1(): void {
    this.metaStatsV1.highScore = this.metaStats.highScore;
    this.metaStatsV1.highWave = this.metaStats.highWave;
    this.metaStatsV1.totalGold = this.metaStats.totalGold;
    this.metaStatsV1.totalShips = this.metaStats.totalShips;
    this.metaStatsV1.totalWaves = this.metaStats.totalWaves;
    this.metaStatsV1.bestCombo = this.metaStats.bestCombo;
    this.metaStatsV1.unlockedBonuses = this.metaStats.unlockedBonuses;
  }

  // -----------------------------------------------------------------------
  // Wave lifecycle
  // -----------------------------------------------------------------------

  startWave(): WaveConfig {
    const config = this.getWaveConfig();
    this.currentWaveConfig = config;
    this.shipsTotal = config.totalShips;
    this.shipsDestroyed = 0;
    this.state = 'active';
    return config;
  }

  /** Called at wave start to apply regen and reset per-wave state */
  onWaveStart(): void {
    // Apply HP regen between waves (upgrade regen + surgeon crew bonus)
    const regen = this.stats.hpRegenPerWave ?? 0;
    if (regen > 0) {
      this.stats.health = Math.min(
        this.stats.health + regen,
        this.stats.maxHealth,
      );
    }

    // Reset phoenix sails usage for this wave
    if (this.stats.phoenixSailsActive) {
      this.stats.phoenixSailsUsed = false;
    }
  }

  onShipDestroyed(): void {
    if (this.state !== 'active') return;

    this.shipsDestroyed++;
    this.runStats.shipsDestroyed++;

    // Track meta stats
    this.metaStats.totalShips++;

    if (this.shipsDestroyed >= this.shipsTotal) {
      this.state = 'wave_complete';
      this.metaStats.totalWaves++;
      this.runStats.wavesCompleted++;
    }
  }

  // -----------------------------------------------------------------------
  // Upgrade flow
  // -----------------------------------------------------------------------

  /**
   * Pick 3 unique upgrades from the pool using tier-weighted selection.
   * Tier weights: common 60%, rare 30%, legendary 10%.
   * Legendary only available wave 5+ (unless 'early_legendary' unlocked).
   * Already-acquired upgrades are excluded.
   * If ship class has upgradeBonus > 0, upgrade values are amplified.
   */
  getUpgradeChoices(): Upgrade[] {
    const earlyLegendary = this.hasMetaBonus('early_legendary');
    const legendaryAllowed = earlyLegendary || this.wave >= 5;

    // Build available pool excluding already acquired
    const acquired = new Set(this.acquiredUpgradeIds);
    const available = UPGRADE_POOL.filter((u) => !acquired.has(u.id));

    // Group available by tier
    const byTier: Record<UpgradeTier, Upgrade[]> = {
      common: [],
      rare: [],
      legendary: [],
    };
    for (const u of available) {
      byTier[u.tier].push(u);
    }

    // If legendary not allowed, redistribute legendary weight to common/rare
    const choices: Upgrade[] = [];
    const maxChoices = Math.min(3, available.length);

    // Shuffle each tier pool for random selection within tier
    shuffle(byTier.common);
    shuffle(byTier.rare);
    shuffle(byTier.legendary);

    // Track which upgrades we have already picked indices for
    const tierIdx: Record<UpgradeTier, number> = { common: 0, rare: 0, legendary: 0 };

    for (let i = 0; i < maxChoices; i++) {
      let tier = rollTier();

      // If legendary not allowed and we rolled legendary, re-roll as rare
      if (tier === 'legendary' && !legendaryAllowed) {
        tier = 'rare';
      }

      // Find next available from the tier, falling through if exhausted
      let pick: Upgrade | null = null;

      // Try the rolled tier first
      if (tierIdx[tier] < byTier[tier].length) {
        pick = byTier[tier][tierIdx[tier]];
        tierIdx[tier]++;
      }

      // Fallback order: common -> rare -> legendary
      if (!pick) {
        const fallbackOrder: UpgradeTier[] = ['common', 'rare', 'legendary'];
        for (const fb of fallbackOrder) {
          if (fb === 'legendary' && !legendaryAllowed) continue;
          if (tierIdx[fb] < byTier[fb].length) {
            pick = byTier[fb][tierIdx[fb]];
            tierIdx[fb]++;
            break;
          }
        }
      }

      if (pick) {
        choices.push(pick);
      }
    }

    this.currentUpgradeChoices = choices;
    this.state = 'upgrading';
    return this.currentUpgradeChoices;
  }

  /**
   * Select an upgrade by index. After applying the upgrade, checks for
   * new synergies. Returns any newly activated synergy or null.
   *
   * If the ship class has upgradeBonus > 0 (brigantine), the upgrade
   * is applied with amplified stats: numeric bonuses are multiplied by
   * (1 + upgradeBonus).
   */
  selectUpgrade(index: number): Synergy | null {
    if (this.state !== 'upgrading') return null;
    if (index < 0 || index >= this.currentUpgradeChoices.length) return null;

    const chosen = this.currentUpgradeChoices[index];

    // If upgrade bonus exists, wrap the apply with amplified stats
    if (this.upgradeBonus > 0) {
      this.applyUpgradeWithBonus(chosen);
    } else {
      chosen.apply(this.stats);
    }

    this.acquiredUpgradeIds.push(chosen.id);

    this.currentUpgradeChoices = [];
    this.wave++;
    this.state = 'pre_wave';

    // Check for newly unlocked synergies
    return this.checkSynergies();
  }

  /** Skip the upgrade phase (when pool is exhausted) — still advances wave. */
  skipUpgrade(): void {
    this.currentUpgradeChoices = [];
    this.wave++;
    this.state = 'pre_wave';
  }

  /**
   * Apply an upgrade with the ship class upgrade bonus.
   * For brigantine (10% bonus), numeric stat modifications are amplified.
   */
  private applyUpgradeWithBonus(upgrade: Upgrade): void {
    const mult = 1 + this.upgradeBonus;

    // Snapshot stats before apply
    const before = { ...this.stats };
    upgrade.apply(this.stats);

    // Amplify the differences for numeric multiplier stats
    // Speed: if maxSpeed changed multiplicatively
    if (this.stats.maxSpeed !== before.maxSpeed && before.maxSpeed > 0) {
      const ratio = this.stats.maxSpeed / before.maxSpeed;
      if (ratio !== 1) {
        const amplifiedRatio = 1 + (ratio - 1) * mult;
        this.stats.maxSpeed = before.maxSpeed * amplifiedRatio;
      }
    }

    // Cannon damage: if cannonDamage changed multiplicatively
    if (this.stats.cannonDamage !== before.cannonDamage && before.cannonDamage > 0) {
      const ratio = this.stats.cannonDamage / before.cannonDamage;
      if (ratio !== 1) {
        const amplifiedRatio = 1 + (ratio - 1) * mult;
        this.stats.cannonDamage = before.cannonDamage * amplifiedRatio;
      }
    }

    // Max health: if changed additively
    if (this.stats.maxHealth !== before.maxHealth) {
      const diff = this.stats.maxHealth - before.maxHealth;
      if (diff > 0) {
        const extraBonus = Math.round(diff * this.upgradeBonus);
        this.stats.maxHealth += extraBonus;
        // Also heal the extra
        if (this.stats.health > before.health) {
          this.stats.health = Math.min(this.stats.health + extraBonus, this.stats.maxHealth);
        }
      }
    }

    // Capture range: if changed multiplicatively
    if (this.stats.captureRange !== before.captureRange && before.captureRange > 0) {
      const ratio = this.stats.captureRange / before.captureRange;
      if (ratio !== 1) {
        const amplifiedRatio = 1 + (ratio - 1) * mult;
        this.stats.captureRange = before.captureRange * amplifiedRatio;
      }
    }

    // Cannon cooldown: if changed multiplicatively (smaller is better)
    if (this.stats.cannonCooldown !== before.cannonCooldown && before.cannonCooldown > 0) {
      const ratio = this.stats.cannonCooldown / before.cannonCooldown;
      if (ratio !== 1 && ratio < 1) {
        // Amplify the reduction
        const amplifiedRatio = 1 + (ratio - 1) * mult;
        this.stats.cannonCooldown = before.cannonCooldown * amplifiedRatio;
      }
    }

    // Armor: if reduced (smaller is better)
    if (this.stats.armor !== before.armor) {
      const diff = before.armor - this.stats.armor;
      if (diff > 0) {
        const extraBonus = diff * this.upgradeBonus;
        this.stats.armor = Math.max(0, this.stats.armor - extraBonus);
      }
    }

    // HP regen per wave: additive bonus
    if ((this.stats.hpRegenPerWave ?? 0) !== (before.hpRegenPerWave ?? 0)) {
      const diff = (this.stats.hpRegenPerWave ?? 0) - (before.hpRegenPerWave ?? 0);
      if (diff > 0) {
        this.stats.hpRegenPerWave = (this.stats.hpRegenPerWave ?? 0) + Math.round(diff * this.upgradeBonus);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Synergy system
  // -----------------------------------------------------------------------

  /**
   * Internal: checks if any new synergy conditions are met.
   * Returns the first newly activated synergy, or null.
   */
  private checkSynergies(): Synergy | null {
    const acquired = new Set(this.acquiredUpgradeIds);
    let newSynergy: Synergy | null = null;

    for (const synergy of SYNERGIES) {
      // Skip already active synergies
      if (this.activeSynergies.includes(synergy.id)) continue;

      // Check if all required upgrades are acquired
      const allMet = synergy.requiredUpgrades.every((id) => acquired.has(id));
      if (allMet) {
        synergy.apply(this.stats);
        this.activeSynergies.push(synergy.id);
        // Return only the first new synergy (caller can check again if needed)
        if (!newSynergy) {
          newSynergy = synergy;
        }
      }
    }

    return newSynergy;
  }

  // -----------------------------------------------------------------------
  // Port / shop system
  // -----------------------------------------------------------------------

  /**
   * Purchase an upgrade from the port shop. Deducts cost from score.
   * Returns true if purchase succeeded.
   */
  purchaseUpgrade(upgradeId: string, cost: number): boolean {
    if (this.score < cost) return false;

    const upgrade = UPGRADE_POOL.find((u) => u.id === upgradeId);
    if (!upgrade) return false;

    // Don't allow purchasing already-acquired upgrades
    if (this.acquiredUpgradeIds.includes(upgradeId)) return false;

    this.score -= cost;

    if (this.upgradeBonus > 0) {
      this.applyUpgradeWithBonus(upgrade);
    } else {
      upgrade.apply(this.stats);
    }

    this.acquiredUpgradeIds.push(upgradeId);

    // Check for synergies after purchasing
    this.checkSynergies();

    return true;
  }

  /**
   * Repair health at port. Deducts cost from score.
   * Returns true if repair succeeded.
   */
  repairHealth(amount: number, cost: number): boolean {
    if (this.score < cost) return false;
    if (this.stats.health >= this.stats.maxHealth) return false;

    this.score -= cost;
    this.stats.health = Math.min(this.stats.health + amount, this.stats.maxHealth);
    return true;
  }

  /** Get all upgrades the player hasn't acquired yet (for port shop) */
  getAvailableUpgradesForShop(): Upgrade[] {
    const acquired = new Set(this.acquiredUpgradeIds);
    return UPGRADE_POOL.filter((u) => !acquired.has(u.id));
  }

  // -----------------------------------------------------------------------
  // Combat helpers
  // -----------------------------------------------------------------------

  /**
   * Apply damage to the player, respecting armor.
   * `armor` starts at 1.0 and decreases toward 0 as upgrades are applied.
   * Effective damage = raw amount * armor.
   * Returns `true` if the player is now dead.
   */
  takeDamage(amount: number): boolean {
    if (this.state === 'game_over') return true;

    // Ghost Sails dodge check (includes ship class dodge bonus)
    if (this.stats.ghostDodgeChance && Math.random() < this.stats.ghostDodgeChance) {
      return false; // dodged!
    }

    const effective = amount * this.stats.armor;
    this.stats.health -= effective;
    this.runStats.damageTaken += effective;

    if (this.stats.health <= 0) {
      // Phoenix Sails: survive one fatal blow per wave
      if (
        this.stats.phoenixSailsActive &&
        !this.stats.phoenixSailsUsed
      ) {
        this.stats.phoenixSailsUsed = true;
        this.stats.health = Math.round(this.stats.maxHealth * 0.4);
        return false;
      }

      this.stats.health = 0;
      this.state = 'game_over';
      this.saveHighScore();
      return true;
    }
    return false;
  }


  // -----------------------------------------------------------------------
  // Score & meta gold
  // -----------------------------------------------------------------------

  addScore(amount: number): void {
    const multiplier = this.stats.goldMultiplier ?? 1;
    const boardingBonus = 1 + (this.stats.boardingPartyBonus ?? 0);
    this.score += Math.round(amount * multiplier * boardingBonus);
  }

  /** Add gold to persistent meta-stats (call with the raw gold earned) */
  addMetaGold(amount: number): void {
    this.metaStats.totalGold += amount;
  }

  /** Update best combo in meta-stats if the new combo is higher */
  updateBestCombo(combo: number): void {
    if (combo > this.metaStats.bestCombo) {
      this.metaStats.bestCombo = combo;
    }
    this.updateRunCombo(combo);
  }

  // -----------------------------------------------------------------------
  // Meta-persistence unlock purchasing
  // -----------------------------------------------------------------------

  /** Get available meta-unlock definitions */
  getMetaUnlocks(): MetaUnlock[] {
    return META_UNLOCKS.filter(
      (u) => !this.metaStats.unlockedBonuses.includes(u.id),
    );
  }

  /**
   * Purchase a meta-persistence unlock using totalGold.
   * Returns true if purchase succeeded.
   */
  purchaseMetaUnlock(unlockId: string): boolean {
    const unlock = META_UNLOCKS.find((u) => u.id === unlockId);
    if (!unlock) return false;
    if (this.metaStats.unlockedBonuses.includes(unlockId)) return false;
    if (this.metaStats.totalGold < unlock.cost) return false;

    this.metaStats.totalGold -= unlock.cost;
    this.metaStats.unlockedBonuses.push(unlockId);
    this.syncLegacyToV1();
    writeSaveV1(this.metaStatsV1);
    return true;
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  saveHighScore(): void {
    let updated = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.metaStats.highScore = this.highScore;
      updated = true;
    }
    if (this.wave > this.highWave) {
      this.highWave = this.wave;
      this.metaStats.highWave = this.highWave;
      updated = true;
    }
    if (updated) {
      this.syncLegacyToV1();
      writeSaveV1(this.metaStatsV1);
    }
  }

  /** Also persist meta-stats (call periodically or at wave end) */
  saveMetaStats(): void {
    this.metaStats.highScore = this.highScore;
    this.metaStats.highWave = this.highWave;
    this.syncLegacyToV1();
    writeSaveV1(this.metaStatsV1);
  }

  getHighWave(): number {
    return this.highWave;
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  reset(): void {
    // Persist high scores and meta-stats before wiping
    this.saveHighScore();
    this.saveMetaStats();

    this.stats = createDefaultStats();
    this.wave = 1;
    this.state = 'pre_wave';
    this.score = 0;
    this.shipsDestroyed = 0;
    this.shipsTotal = 0;
    this.currentWaveConfig = null;
    this.currentUpgradeChoices = [];
    this.acquiredUpgradeIds = [];
    this.activeSynergies = [];
    this.endlessMode = false;
    this.activeDoctrine = null;

    // Reload save for latest meta-stats (including any purchases)
    this.metaStatsV1 = loadSaveV1();
    this.metaStats = {
      highScore: this.metaStatsV1.highScore,
      highWave: this.metaStatsV1.highWave,
      totalGold: this.metaStatsV1.totalGold,
      totalShips: this.metaStatsV1.totalShips,
      totalWaves: this.metaStatsV1.totalWaves,
      bestCombo: this.metaStatsV1.bestCombo,
      unlockedBonuses: this.metaStatsV1.unlockedBonuses,
    };
    this.highScore = this.metaStatsV1.highScore;
    this.highWave = this.metaStatsV1.highWave;

    // Reset ship class to default
    this.shipClass = 'brigantine';
    this.upgradeBonus = 0;

    // Reset run stats
    this.runStats = createDefaultRunStats(this.shipClass);
    this.runStartTime = Date.now();

    // Apply meta-persistence bonuses for the new run
    this.applyMetaBonuses();
  }
}
