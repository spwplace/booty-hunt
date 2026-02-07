import type * as THREE from 'three';
import type { WeatherState } from './Weather';

// ===================================================================
//  Ship Classes
// ===================================================================

export type ShipClass = 'sloop' | 'brigantine' | 'galleon';

export interface ShipClassConfig {
  id: ShipClass;
  name: string;
  scale: number;
  speed: number;
  hp: number;
  cannonsPerSide: number;
  captureRange: number;
  dodgeBonus: number;
  upgradeBonus: number;
  damageBonus: number;
  description: string;
  icon: string;
  locked: boolean; // runtime override from meta
}

export const SHIP_CLASS_CONFIGS: Record<ShipClass, ShipClassConfig> = {
  sloop: {
    id: 'sloop',
    name: 'Sloop',
    scale: 0.5,
    speed: 18,
    hp: 70,
    cannonsPerSide: 2,
    captureRange: 5.5,
    dodgeBonus: 0.15,
    upgradeBonus: 0,
    damageBonus: 0,
    description: 'Fast and nimble. +15% dodge chance.',
    icon: '\u2693',
    locked: false,
  },
  brigantine: {
    id: 'brigantine',
    name: 'Brigantine',
    scale: 0.7,
    speed: 14,
    hp: 100,
    cannonsPerSide: 3,
    captureRange: 4.5,
    dodgeBonus: 0,
    upgradeBonus: 0.1,
    damageBonus: 0,
    description: 'Balanced vessel. Upgrades 10% more effective.',
    icon: '\u26F5',
    locked: false,
  },
  galleon: {
    id: 'galleon',
    name: 'Galleon',
    scale: 1.0,
    speed: 10,
    hp: 150,
    cannonsPerSide: 5,
    captureRange: 3.5,
    dodgeBonus: 0,
    upgradeBonus: 0,
    damageBonus: 0.3,
    description: 'Heavy firepower. +30% cannon damage.',
    icon: '\uD83D\uDEA2',
    locked: true,
  },
};

// ===================================================================
//  Enemy Types
// ===================================================================

export type EnemyType =
  | 'merchant_sloop'
  | 'merchant_galleon'
  | 'escort_frigate'
  | 'fire_ship'
  | 'ghost_ship'
  | 'navy_warship';

export interface EnemyTypeConfig {
  type: EnemyType;
  speedMin: number;
  speedMax: number;
  hp: number;
  armed: boolean;
  behavior: 'flee' | 'circle_strafe' | 'beeline' | 'phase' | 'formation';
  value: number;
  scale: number;
  hullColor: number;
  sailColor: number;
  specialTimer?: number;
  explosionRadius?: number;
  phaseDuration?: number;
  missChanceWhilePhased?: number;
}

export const ENEMY_TYPE_CONFIGS: Record<EnemyType, EnemyTypeConfig> = {
  merchant_sloop: {
    type: 'merchant_sloop',
    speedMin: 3, speedMax: 5,
    hp: 40, armed: false,
    behavior: 'flee', value: 50, scale: 0.5,
    hullColor: 0x8b6b4a, sailColor: 0xccaa22,
  },
  merchant_galleon: {
    type: 'merchant_galleon',
    speedMin: 0.8, speedMax: 1.5,
    hp: 120, armed: false,
    behavior: 'flee', value: 250, scale: 1.05,
    hullColor: 0x8b6b4a, sailColor: 0x2266cc,
  },
  escort_frigate: {
    type: 'escort_frigate',
    speedMin: 2, speedMax: 3,
    hp: 80, armed: true,
    behavior: 'circle_strafe', value: 150, scale: 0.8,
    hullColor: 0x3a2a2a, sailColor: 0x111111,
  },
  fire_ship: {
    type: 'fire_ship',
    speedMin: 4, speedMax: 6,
    hp: 30, armed: false,
    behavior: 'beeline', value: 100, scale: 0.6,
    hullColor: 0x5a2a0a, sailColor: 0xff4400,
    explosionRadius: 10,
  },
  ghost_ship: {
    type: 'ghost_ship',
    speedMin: 2, speedMax: 2,
    hp: 60, armed: true,
    behavior: 'phase', value: 1000, scale: 0.8,
    hullColor: 0x445566, sailColor: 0xaabbcc,
    phaseDuration: 3,
    missChanceWhilePhased: 0.5,
    specialTimer: 15,
  },
  navy_warship: {
    type: 'navy_warship',
    speedMin: 1.5, speedMax: 2,
    hp: 150, armed: true,
    behavior: 'formation', value: 300, scale: 1.0,
    hullColor: 0x1a2a4a, sailColor: 0x223366,
  },
};

// ===================================================================
//  Crew System
// ===================================================================

export type CrewRole =
  | 'navigator'
  | 'gunner'
  | 'surgeon'
  | 'lookout'
  | 'bosun'
  | 'quartermaster';

export interface CrewMember {
  role: CrewRole;
  level: number;
  maxLevel: number;
  name: string;
}

export interface CrewBonus {
  speedMult: number;
  damageMult: number;
  hpRegen: number;
  visionMult: number;
  maxHpBonus: number;
  goldMult: number;
}

export interface CrewRoleConfig {
  role: CrewRole;
  name: string;
  bonusPerLevel: string;
  maxLevel: number;
  cost: number;
  icon: string;
  locked: boolean; // runtime override from meta
}

export const CREW_ROLE_CONFIGS: Record<CrewRole, CrewRoleConfig> = {
  navigator: {
    role: 'navigator', name: 'Navigator',
    bonusPerLevel: '+3% speed', maxLevel: 5, cost: 200,
    icon: '\uD83E\uDDED', locked: false,
  },
  gunner: {
    role: 'gunner', name: 'Gunner',
    bonusPerLevel: '+5% damage', maxLevel: 5, cost: 300,
    icon: '\uD83D\uDCA3', locked: false,
  },
  surgeon: {
    role: 'surgeon', name: 'Surgeon',
    bonusPerLevel: '+1 HP regen/wave', maxLevel: 5, cost: 250,
    icon: '\uD83C\uDFE5', locked: false,
  },
  lookout: {
    role: 'lookout', name: 'Lookout',
    bonusPerLevel: '+8% vision range', maxLevel: 5, cost: 200,
    icon: '\uD83D\uDD2D', locked: false,
  },
  bosun: {
    role: 'bosun', name: 'Bosun',
    bonusPerLevel: '+5 max HP', maxLevel: 5, cost: 250,
    icon: '\u2699\uFE0F', locked: true,
  },
  quartermaster: {
    role: 'quartermaster', name: 'Quartermaster',
    bonusPerLevel: '+8% gold', maxLevel: 5, cost: 300,
    icon: '\uD83D\uDCB0', locked: true,
  },
};

// ===================================================================
//  Events
// ===================================================================

export type EventType =
  | 'kraken'
  | 'whirlpool'
  | 'ghost_ship_event'
  | 'sea_serpent'
  | 'storm_surge'
  | 'treasure_map';

export interface GameEvent {
  type: EventType;
  active: boolean;
  timer: number;
  duration: number;
  pos: THREE.Vector3;
  data: Record<string, unknown>;
}

// ===================================================================
//  Islands
// ===================================================================

export type IslandType = 'rocky' | 'sandy' | 'jungle' | 'fortress';

export interface Island {
  type: IslandType;
  name: string;
  pos: THREE.Vector3;
  radius: number;
  reefRadius: number;
  hasTreasure: boolean;
  treasureCollected: boolean;
  meshCreated: boolean;
  meshGroup: THREE.Group | null;
  seed: number;
}

// ===================================================================
//  Wave Config V1 (15-wave, 3-act arc)
// ===================================================================

export interface WaveConfigV1 {
  wave: number;
  totalShips: number;
  armedPercent: number;
  speedMultiplier: number;
  healthMultiplier: number;
  weather: WeatherState;
  enemyTypes: EnemyType[];
  bossName: string | null;
  bossHp: number;
  isPortWave: boolean;
  specialEvent: EventType | null;
}

export const WAVE_TABLE: WaveConfigV1[] = [
  // ── Act 1: Open Waters (waves 1-5) — sloops, galleons, frigates only ──
  { wave: 1,  totalShips: 4,  armedPercent: 0,    speedMultiplier: 1.00, healthMultiplier: 1.00, weather: 'clear',  enemyTypes: ['merchant_sloop', 'merchant_galleon'],                                              bossName: null,                 bossHp: 0,   isPortWave: false, specialEvent: null },
  { wave: 2,  totalShips: 5,  armedPercent: 0.10, speedMultiplier: 1.05, healthMultiplier: 1.05, weather: 'clear',  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate'],                             bossName: null,                 bossHp: 0,   isPortWave: false, specialEvent: null },
  { wave: 3,  totalShips: 5,  armedPercent: 0.20, speedMultiplier: 1.10, healthMultiplier: 1.10, weather: 'foggy',  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate'],                             bossName: null,                 bossHp: 0,   isPortWave: false, specialEvent: null },
  { wave: 4,  totalShips: 6,  armedPercent: 0.25, speedMultiplier: 1.15, healthMultiplier: 1.15, weather: 'foggy',  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate'],                             bossName: null,                 bossHp: 0,   isPortWave: false, specialEvent: null },
  { wave: 5,  totalShips: 7,  armedPercent: 0.30, speedMultiplier: 1.25, healthMultiplier: 1.25, weather: 'stormy', enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate'],                             bossName: 'Captain Blackbeard', bossHp: 300, isPortWave: true,  specialEvent: null },
  // ── Act 2: Contested Seas (waves 6-10) — fire ships & ghost ships enter ──
  { wave: 6,  totalShips: 7,  armedPercent: 0.30, speedMultiplier: 1.25, healthMultiplier: 1.30, weather: 'foggy',  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship'],              bossName: null,                 bossHp: 0,   isPortWave: false, specialEvent: null },
  { wave: 7,  totalShips: 8,  armedPercent: 0.35, speedMultiplier: 1.30, healthMultiplier: 1.35, weather: 'stormy', enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship'],              bossName: null,                 bossHp: 0,   isPortWave: false, specialEvent: 'ghost_ship_event' },
  { wave: 8,  totalShips: 8,  armedPercent: 0.40, speedMultiplier: 1.35, healthMultiplier: 1.40, weather: 'night',  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship'], bossName: null,                 bossHp: 0,   isPortWave: false, specialEvent: 'sea_serpent' },
  { wave: 9,  totalShips: 9,  armedPercent: 0.50, speedMultiplier: 1.45, healthMultiplier: 1.50, weather: 'stormy', enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship'], bossName: null,                 bossHp: 0,   isPortWave: false, specialEvent: null },
  { wave: 10, totalShips: 10, armedPercent: 0.55, speedMultiplier: 1.55, healthMultiplier: 1.55, weather: 'night',  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship'], bossName: 'Dread Commodore',    bossHp: 550, isPortWave: true,  specialEvent: null },
  // ── Act 3: The Gauntlet (waves 11-15) — navy warships, all 6 types ──
  { wave: 11, totalShips: 10, armedPercent: 0.55, speedMultiplier: 1.55, healthMultiplier: 1.60, weather: 'stormy', enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship', 'navy_warship'], bossName: null,             bossHp: 0,   isPortWave: false, specialEvent: 'storm_surge' },
  { wave: 12, totalShips: 11, armedPercent: 0.60, speedMultiplier: 1.65, healthMultiplier: 1.70, weather: 'night',  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship', 'navy_warship'], bossName: null,             bossHp: 0,   isPortWave: false, specialEvent: 'whirlpool' },
  { wave: 13, totalShips: 12, armedPercent: 0.65, speedMultiplier: 1.75, healthMultiplier: 1.80, weather: 'stormy', enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship', 'navy_warship'], bossName: null,             bossHp: 0,   isPortWave: false, specialEvent: null },
  { wave: 14, totalShips: 13, armedPercent: 0.70, speedMultiplier: 1.85, healthMultiplier: 1.90, weather: 'night',  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship', 'navy_warship'], bossName: null,             bossHp: 0,   isPortWave: false, specialEvent: 'kraken' },
  { wave: 15, totalShips: 14, armedPercent: 0.75, speedMultiplier: 2.00, healthMultiplier: 2.00, weather: 'stormy', enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate', 'fire_ship', 'ghost_ship', 'navy_warship'], bossName: 'Admiral Drake',  bossHp: 800, isPortWave: false, specialEvent: null },
];

// ===================================================================
//  Run Stats (for victory/game over screen)
// ===================================================================

export interface RunStats {
  gold: number;
  shipsDestroyed: number;
  wavesCompleted: number;
  maxCombo: number;
  damageDealt: number;
  damageTaken: number;
  eventsCompleted: number;
  treasuresFound: number;
  crewHired: number;
  timePlayed: number;
  shipClass: ShipClass;
  victory: boolean;
}

export interface RunHistoryEntry {
  date: string;            // ISO date
  shipClass: ShipClass;
  doctrine: string;
  seed: number;
  victory: boolean;
  wavesCompleted: number;
  gold: number;
  shipsDestroyed: number;
  maxCombo: number;
  damageDealt: number;
  timePlayed: number;
}

export type ColorblindMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface AccessibilitySettings {
  textScale: number;
  motionIntensity: number;
  flashIntensity: number;
  colorblindMode: ColorblindMode;
}

// ===================================================================
//  Merchant V1 (extends current Merchant)
// ===================================================================

export interface MerchantV1 {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  baseSpeed: number;
  state: 'sailing' | 'fleeing' | 'sinking' | 'surrendering';
  sinkTimer: number;
  sinkPhase: number;
  value: number;
  id: number;
  hp: number;
  maxHp: number;
  armed: boolean;
  fireTimer: number;
  hitRadius: number;
  scale: number;
  zigzagTimer: number;
  zigzagDir: number;
  convoyLeaderId: number;
  convoyOffset: THREE.Vector3;
  chainSlowTimer: number;
  isBoss: boolean;
  bossEnraged: boolean;
  surrendering: boolean;
  // V1 additions
  enemyType: EnemyType;
  phaseTimer: number;
  isPhased: boolean;
  explosionRadius: number;
  hasTreasureMap: boolean;
  fleeTimer: number;
  formationIndex: number;
  formationLeaderId: number;
}

// ===================================================================
//  Save Data V1
// ===================================================================

export interface SaveDataV1 {
  highScore: number;
  highWave: number;
  totalGold: number;
  totalShips: number;
  totalWaves: number;
  bestCombo: number;
  unlockedBonuses: string[];
  victories: number;
  victoryClasses: ShipClass[];
  galleonUnlocked: boolean;
  bosunUnlocked: boolean;
  quartermasterUnlocked: boolean;
  endlessModeUnlocked: boolean;
  tutorialCompleted: boolean;
  // Settings
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  // Accessibility
  textScale: number;
  motionIntensity: number;
  flashIntensity: number;
  colorblindMode: ColorblindMode;
  // V2 meta progression
  v2CodexDiscovered: string[];
  v2FactionReputation: Record<string, number>;
}
