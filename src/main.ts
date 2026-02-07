import * as THREE from 'three';
import { Ocean } from './Ocean';
import { createShipMesh, setShipLanterns, updateShipSails, addSurrenderFlag } from './Ship';
import {
  GoldBurst, WaterSplash, ScreenShake, WakeTrail,
  CannonSmoke, ExplosionEffect, RainSystem,
  MuzzleFlash, CannonballTrail, ShipBreakup, SpeedLines,
  FireEffect, FloatingDebris,
  KrakenTentacle, WhirlpoolEffect, SeaSerpentEffect,
  GhostShipEffect, FireShipExplosion, TreasureSparkle, VictoryConfetti,
} from './Effects';
import { UI } from './UI';
import type { CodexViewModel, CodexSectionView, DoctrineSetupOption, ChoicePromptOption } from './UI';
import { audio } from './Audio';
import { CombatSystem } from './Combat';
import { WeatherSystem } from './Weather';
import type { WeatherState } from './Weather';
import { ProgressionSystem } from './Progression';
import type { PlayerStats, Synergy } from './Progression';
import { screenJuice } from './Juice';
import { SkySystem } from './Sky';
import { PortScene } from './Port';
import { WorldSystem } from './World';
import { EnemyAISystem } from './EnemyAI';
import type { EnemyAIPressureProfile } from './EnemyAI';
import { CrewSystem } from './Crew';
import { EventSystem } from './Events';
import { TutorialSystem } from './Tutorial';
import type { MerchantV1, WaveConfigV1, EnemyType, RunStats, EventType, IslandType } from './Types';
import type { ShipClass, ShipClassConfig } from './Types';
import { ENEMY_TYPE_CONFIGS, CREW_ROLE_CONFIGS, SHIP_CLASS_CONFIGS } from './Types';
import { DevPanel } from './DevPanel';
import { EditorCamera } from './EditorCamera';
import { ScenarioEditor } from './ScenarioEditor';
import { EditorUI } from './EditorUI';
import type { Scenario, ScenarioWave } from './Scenario';
import { createEmptyScenario, createDefaultWave, scenarioWavesToWaveTable, scenarioFromURLHash } from './Scenario';
import { V2ContentRegistry } from './V2Content';
import type { V2Doctrine, V2EventCard } from './V2Content';
import { NarrativeSystem } from './NarrativeSystem';
import { MapNodeSystem } from './MapNodeSystem';
import type { MapNodeType } from './MapNodeSystem';
import { FactionSystem } from './FactionSystem';
import { EconomySystem } from './EconomySystem';
import { TelemetrySystem } from './TelemetrySystem';

// ===================================================================
//  Mobile detection
// ===================================================================

const isMobile = navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis;

// ===================================================================
//  Renderer & scene
// ===================================================================

const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x1e1828);
const fogDensity = 0.008;
scene.fog = new THREE.FogExp2(fogColor, fogDensity);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);

const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('game')!.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ===================================================================
//  Sky dome — uniform-driven colors for weather
// ===================================================================

const skyGeo = new THREE.SphereGeometry(420, 32, 32);
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    uSkyTop:     { value: new THREE.Color(0x03030a) },
    uSkyMid:     { value: new THREE.Color(0x100618) },
    uSkyHorizon: { value: new THREE.Color(0x552615) },
    uSunDir:     { value: new THREE.Vector3(0.4, 0.12, 0.3).normalize() },
    uTime:       { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uSkyTop;
    uniform vec3 uSkyMid;
    uniform vec3 uSkyHorizon;
    uniform vec3 uSunDir;
    uniform float uTime;
    varying vec3 vDir;
    void main() {
      float y = normalize(vDir).y;
      vec3 color = mix(uSkyHorizon, uSkyMid, smoothstep(-0.08, 0.25, y));
      color = mix(color, uSkyTop, smoothstep(0.25, 0.7, y));
      float sunDot = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
      color += vec3(1.0, 0.6, 0.2) * pow(sunDot, 32.0) * 0.6;
      color += vec3(1.0, 0.85, 0.5) * pow(sunDot, 256.0) * 1.0;
      // Aurora glow in night mode (when sky is dark)
      float nightness = 1.0 - smoothstep(0.0, 0.15, (uSkyTop.r + uSkyTop.g + uSkyTop.b) / 3.0);
      float auroraBand = smoothstep(0.3, 0.45, y) * smoothstep(0.65, 0.5, y);
      float xDir = normalize(vDir).x;
      float auroraWave = sin(xDir * 4.0 + uTime * 0.2) * 0.5 + 0.5;
      auroraWave *= sin(xDir * 7.0 - uTime * 0.15) * 0.3 + 0.7;
      vec3 auroraColor = mix(vec3(0.1, 0.8, 0.4), vec3(0.2, 0.3, 0.9), auroraWave);
      color += auroraColor * auroraBand * auroraWave * nightness * 0.15;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
});

const sky = new THREE.Mesh(skyGeo, skyMat);
sky.renderOrder = -1;
scene.add(sky);

// ===================================================================
//  Lighting
// ===================================================================

const sunDir = new THREE.Vector3(0.4, 0.6, 0.3).normalize();
const sun = new THREE.DirectionalLight(0xffeecc, 2.8);
sun.position.copy(sunDir.clone().multiplyScalar(100));
scene.add(sun);

const ambient = new THREE.AmbientLight(0x334466, 0.55);
scene.add(ambient);
scene.add(new THREE.HemisphereLight(0x7788bb, 0x443322, 0.45));

// ===================================================================
//  Ocean
// ===================================================================

const ocean = new Ocean(fogColor, fogDensity);
scene.add(ocean.mesh);

// ===================================================================
//  Player ship
// ===================================================================

let playerShipConfig = { speedTier: 0, armorTier: 0, weaponTier: 0 };
let playerGroup = createShipMesh(0x6b3a2a, 0xf5f0e6, 1, playerShipConfig);
scene.add(playerGroup);

let playerAngle = 0;
let playerSpeed = 0;
const playerPos = new THREE.Vector3(0, 0, 0);
const playerVel = new THREE.Vector3(0, 0, 0);
let juiceScale = 1;
let juiceVel = 0;
let recoilOffset = 0; // backward offset on cannon fire

// ===================================================================
//  Core systems
// ===================================================================

const progression = new ProgressionSystem();
const combat = new CombatSystem(scene);
const weather = new WeatherSystem(scene);
const ui = new UI();
const skySystem = new SkySystem(scene);
const world = new WorldSystem(scene);
const crew = new CrewSystem();
const events = new EventSystem();
const tutorial = new TutorialSystem();
const v2Content = V2ContentRegistry.createDefault();
const narrative = new NarrativeSystem((line) => {
  ui.showCaptainLog(line.text, line.tone);
});
const mapNodes = new MapNodeSystem(v2Content);
const factions = new FactionSystem(v2Content);
const economy = new EconomySystem();
const telemetry = new TelemetrySystem();

// Wire weather system to scene targets
weather.setTargets({
  fog: scene.fog as THREE.FogExp2,
  sunLight: sun,
  ambientLight: ambient,
  skyMaterial: skyMat,
  oceanMaterial: ocean.material,
});

// ===================================================================
//  Effects
// ===================================================================

const goldBurst = new GoldBurst(scene);
const waterSplash = new WaterSplash(scene);
const screenShake = new ScreenShake();
const wake = new WakeTrail(scene);
const cannonSmoke = new CannonSmoke(scene);
const explosionEffect = new ExplosionEffect(scene);
const rain = new RainSystem(scene, playerPos);
const muzzleFlash = new MuzzleFlash(scene);
const cannonballTrail = new CannonballTrail(scene);
const shipBreakup = new ShipBreakup(scene);
const speedLines = new SpeedLines(scene);
const fireEffect = new FireEffect(scene);
const floatingDebris = new FloatingDebris(scene);
const krakenTentacle = new KrakenTentacle(scene);
const whirlpoolEffect = new WhirlpoolEffect(scene);
const seaSerpentEffect = new SeaSerpentEffect(scene);
const fireShipExplosion = new FireShipExplosion(scene);
const treasureSparkle = new TreasureSparkle(scene);
const victoryConfetti = new VictoryConfetti(scene);

// ===================================================================
//  Port scene (lazy-created)
// ===================================================================

let portScene: PortScene | null = null;
let inPort = false;
let portTransitionTimer = 0;
let portTransitionPhase: 'entering' | 'active' | 'leaving' | 'none' = 'none';

// ===================================================================
//  Merchant ships
// ===================================================================

const merchants: MerchantV1[] = [];
let nextMerchantId = 0;
const SINK_DURATION = 4.0; // expanded for multi-stage sinking

// Boss names
const PIRATE_NAMES = [
  'Blackbeard', 'Red Bess', 'Iron Jack', 'The Kraken',
  'Bloody Mary', 'Captain Bones', 'Dead-Eye Pete', 'Sea Witch',
  'The Reaper', 'Barnacle Bill', 'Storm Fang', 'Dread Morgan',
];

const WEATHER_LOG_LINES: Record<WeatherState, string> = {
  clear: 'clear water and wide horizons',
  foggy: 'fogbanks thick enough to hide a broadside',
  stormy: 'black swells and thunder off the bow',
  night: 'moonlit currents and lantern-lit wakes',
};

const FACTION_ENEMY_BIAS: Record<string, EnemyType[]> = {
  free_captains: ['merchant_sloop', 'escort_frigate', 'fire_ship'],
  imperial_navy: ['escort_frigate', 'navy_warship'],
  redwake_corsairs: ['fire_ship', 'escort_frigate', 'merchant_sloop'],
  wraith_fleet: ['ghost_ship', 'escort_frigate'],
  merchant_consortium: ['merchant_sloop', 'merchant_galleon', 'escort_frigate'],
};

const FACTION_PRESSURE_PROFILES: Record<string, EnemyAIPressureProfile> = {
  free_captains: {
    speedMult: 1.06,
    turnRateMult: 1.08,
    fireCooldownMult: 0.95,
    fireRangeMult: 1.0,
    broadsideArcMult: 1.0,
    engageRangeMult: 1.05,
  },
  imperial_navy: {
    speedMult: 0.96,
    turnRateMult: 1.02,
    fireCooldownMult: 1.08,
    fireRangeMult: 1.14,
    broadsideArcMult: 1.18,
    engageRangeMult: 1.18,
  },
  redwake_corsairs: {
    speedMult: 1.12,
    turnRateMult: 1.12,
    fireCooldownMult: 0.9,
    fireRangeMult: 0.95,
    beelineExplodeRangeMult: 1.25,
    engageRangeMult: 1.08,
  },
  wraith_fleet: {
    speedMult: 1.02,
    turnRateMult: 1.1,
    fireCooldownMult: 0.92,
    fireRangeMult: 1.08,
    ghostPhaseIntervalMult: 0.82,
    engageRangeMult: 1.12,
  },
  merchant_consortium: {
    speedMult: 0.98,
    turnRateMult: 0.95,
    fireCooldownMult: 1.12,
    fireRangeMult: 0.94,
    fleeUrgencyMult: 1.2,
  },
};

const EVENT_START_LOG: Record<EventType, { message: string; tone: 'warning' | 'mystic' | 'neutral' | 'reward' }> = {
  kraken: { message: 'The sea is boiling. Kraken limbs off both beams!', tone: 'warning' },
  whirlpool: { message: 'A spinning maw forms ahead. Helm hard over.', tone: 'warning' },
  ghost_ship_event: { message: 'A phantom silhouette rises from the fog.', tone: 'mystic' },
  sea_serpent: { message: 'The serpent circles. Keep distance and survive.', tone: 'warning' },
  storm_surge: { message: 'Storm surge incoming. Build speed now.', tone: 'warning' },
  treasure_map: { message: 'A blood-stained chart points toward buried coin.', tone: 'reward' },
};

const EVENT_END_LOG: Record<EventType, { success: string; failure?: string; successTone: 'reward' | 'neutral'; failureTone?: 'warning' | 'neutral' }> = {
  kraken: {
    success: 'Kraken driven off. The crew cheers over shattered tentacles.',
    failure: 'The kraken vanished below and left the hull groaning.',
    successTone: 'reward',
    failureTone: 'warning',
  },
  whirlpool: {
    success: 'The vortex fades and the current settles.',
    successTone: 'neutral',
  },
  ghost_ship_event: {
    success: 'The ghostly wake thins into mist.',
    successTone: 'neutral',
  },
  sea_serpent: {
    success: 'The serpent dives deep. These waters are ours for now.',
    failure: 'The serpent left splintered planks in its wake.',
    successTone: 'reward',
    failureTone: 'warning',
  },
  storm_surge: {
    success: 'You rode the surge clean and kept command.',
    failure: 'The surge slammed the hull broadside.',
    successTone: 'reward',
    failureTone: 'warning',
  },
  treasure_map: {
    success: 'Treasure secured and stowed below deck.',
    successTone: 'reward',
  },
};

const CODEX_EVENT_TYPES: EventType[] = [
  'kraken',
  'whirlpool',
  'ghost_ship_event',
  'sea_serpent',
  'storm_surge',
  'treasure_map',
];

const CODEX_EVENT_NAMES: Record<EventType, string> = {
  kraken: 'Kraken',
  whirlpool: 'Whirlpool',
  ghost_ship_event: 'Ghost Ship',
  sea_serpent: 'Sea Serpent',
  storm_surge: 'Storm Surge',
  treasure_map: 'Treasure Map',
};

const CODEX_LANDMARK_TYPES: IslandType[] = ['rocky', 'sandy', 'jungle', 'fortress'];

const CODEX_LANDMARK_DETAILS: Record<IslandType, string> = {
  rocky: 'Jagged stone outcrops with narrow channels and hidden shoals.',
  sandy: 'Low-lying cays and bright shoals favored by smugglers.',
  jungle: 'Dense canopy islands with buried relic sites and serpent nests.',
  fortress: 'Fortified strongholds with batteries guarding key sea lanes.',
};

function getWaveLogLine(config: WaveConfigV1): string {
  const weatherLine = WEATHER_LOG_LINES[config.weather];
  if (config.bossName) {
    return `Wave ${config.wave}: ${weatherLine}. ${config.bossName} commands the enemy line.`;
  }
  return `Wave ${config.wave}: ${weatherLine}. ${config.totalShips} ships on the horizon.`;
}

function toWeatherState(value: string): WeatherState | null {
  if (value === 'clear' || value === 'foggy' || value === 'stormy' || value === 'night') return value;
  return null;
}

function getDominantFactionId(regionFactionIds: string[]): string | null {
  const spawnWeights = factions.getSpawnWeightMap(regionFactionIds);
  let dominantFactionId: string | null = null;
  let dominantWeight = -Infinity;
  for (const [id, weight] of spawnWeights) {
    if (weight > dominantWeight) {
      dominantWeight = weight;
      dominantFactionId = id;
    }
  }
  return dominantFactionId;
}

function applyFactionPressureProfileForRegion(regionFactionIds: string[]): string | null {
  const dominantFactionId = getDominantFactionId(regionFactionIds);
  if (!dominantFactionId) {
    EnemyAISystem.resetPressureProfile();
    return null;
  }
  const profile = FACTION_PRESSURE_PROFILES[dominantFactionId];
  if (profile) EnemyAISystem.setPressureProfile(profile);
  else EnemyAISystem.resetPressureProfile();
  return dominantFactionId;
}

function formatCodexLabel(raw: string): string {
  return raw
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDoctrineBonusLabel(doctrine: V2Doctrine): string {
  const speedPct = Math.round((doctrine.startingBonuses.speedMult - 1) * 100);
  const damagePct = Math.round((doctrine.startingBonuses.cannonDamageMult - 1) * 100);
  const healthPct = Math.round((doctrine.startingBonuses.maxHealthMult - 1) * 100);
  const sign = (n: number) => (n >= 0 ? `+${n}%` : `${n}%`);
  return `Speed ${sign(speedPct)} · Damage ${sign(damagePct)} · Hull ${sign(healthPct)}`;
}

function getDoctrineById(doctrineId: string): V2Doctrine | null {
  const found = v2Content.data.doctrines.find((doctrine) => doctrine.id === doctrineId);
  if (found) return found;
  return v2Content.data.doctrines[0] ?? null;
}

function getRunSetupDoctrineOptions(): DoctrineSetupOption[] {
  return v2Content.data.doctrines.map((doctrine) => ({
    id: doctrine.id,
    name: doctrine.name,
    summary: doctrine.summary,
    bonusLabel: formatDoctrineBonusLabel(doctrine),
  }));
}

function getRunSetupShipConfigs(): ShipClassConfig[] {
  const meta = progression.getMetaStatsV1();
  return (Object.values(SHIP_CLASS_CONFIGS) as ShipClassConfig[]).map((config) => {
    if (config.id !== 'galleon') {
      return { ...config, locked: false };
    }
    return { ...config, locked: !meta.galleonUnlocked };
  });
}

function buildCodexSection(
  title: string,
  defs: Array<{ id: string; name: string; detail: string }>,
  unlocked: Set<string>,
): CodexSectionView {
  const entries = defs.map((def) => ({
    id: def.id,
    name: def.name,
    detail: def.detail,
    unlocked: unlocked.has(def.id),
  }));
  const discovered = entries.filter(entry => entry.unlocked).length;
  return {
    title,
    discovered,
    total: entries.length,
    entries,
  };
}

function buildCodexViewModel(): CodexViewModel {
  const unlocked = new Set(progression.getCodexEntries());

  const regionDefs = v2Content.data.regions.map(region => ({
    id: `region:${region.id}`,
    name: region.name,
    detail: region.theme,
  }));

  const factionDefs = v2Content.data.factions.map(faction => ({
    id: `faction:${faction.id}`,
    name: faction.name,
    detail: faction.combatProfile,
  }));

  const enemyDefs = (Object.keys(ENEMY_TYPE_CONFIGS) as EnemyType[]).map((enemyType) => {
    const cfg = ENEMY_TYPE_CONFIGS[enemyType];
    const behaviorLabel = formatCodexLabel(cfg.behavior);
    const arms = cfg.armed ? 'Armed broadside threat.' : 'Primarily capture target.';
    return {
      id: `enemy:${enemyType}`,
      name: formatCodexLabel(enemyType),
      detail: `${behaviorLabel} pattern. Hull integrity ${cfg.hp}. ${arms}`,
    };
  });

  const eventDefs = CODEX_EVENT_TYPES.map(eventType => ({
    id: `event:${eventType}`,
    name: CODEX_EVENT_NAMES[eventType],
    detail: EVENT_START_LOG[eventType].message,
  }));

  const landmarkDefs = CODEX_LANDMARK_TYPES.map((landmarkType) => ({
    id: `landmark:${landmarkType}`,
    name: `${formatCodexLabel(landmarkType)} Isles`,
    detail: CODEX_LANDMARK_DETAILS[landmarkType],
  }));

  const sections = [
    buildCodexSection('Regions', regionDefs, unlocked),
    buildCodexSection('Factions', factionDefs, unlocked),
    buildCodexSection('Enemies', enemyDefs, unlocked),
    buildCodexSection('Events', eventDefs, unlocked),
    buildCodexSection('Landmarks', landmarkDefs, unlocked),
  ];

  const discovered = sections.reduce((sum, section) => sum + section.discovered, 0);
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  const completionPct = total > 0 ? Math.round((discovered / total) * 100) : 0;

  return {
    completionPct,
    discovered,
    total,
    sections,
  };
}

function unlockCodexEntry(entryId: string, label: string): void {
  const unlocked = progression.unlockCodexEntry(entryId);
  if (!unlocked) return;
  narrative.queue(`Codex updated: ${label}.`, 'mystic');
  ui.showCodexDiscoverySpotlight(label);
  telemetry.track('codex_unlock', { entryId });
}

function unlockRegionCodex(regionId: string): void {
  const region = v2Content.getRegion(regionId);
  if (!region) return;
  unlockCodexEntry(`region:${regionId}`, `Region: ${region.name}`);
}

function unlockFactionCodex(factionId: string): void {
  const faction = v2Content.getFaction(factionId);
  if (!faction) return;
  unlockCodexEntry(`faction:${factionId}`, `Faction: ${faction.name}`);
}

function unlockEnemyCodex(enemyType: EnemyType): void {
  unlockCodexEntry(`enemy:${enemyType}`, `Enemy: ${formatCodexLabel(enemyType)}`);
}

function unlockEventCodex(eventType: EventType): void {
  unlockCodexEntry(`event:${eventType}`, `Event: ${formatCodexLabel(eventType)}`);
}

function applyRegionalFactionReputationDelta(delta: number, reason: string): void {
  const region = mapNodes.getCurrentRegion();
  if (!region) return;
  const factionId = getDominantFactionId(region.factionPressure);
  if (!factionId) return;
  const score = factions.applyReputationDelta(factionId, delta);
  queueFactionReputationFeedback(factionId, delta);
  telemetry.track('faction_reputation', {
    faction: factionId,
    delta,
    score,
    reason,
  });
}

interface RegionalFactionContext {
  factionId: string | null;
  factionName: string | null;
  reputation: number;
}

interface PortMarketProfile {
  context: RegionalFactionContext;
  shopMultiplier: number;
  repairMultiplier: number;
  crewMultiplier: number;
  tierMultiplier: { common: number; rare: number; legendary: number };
  marketTitle: string;
  marketNotes: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPctLabel(multiplier: number): string {
  const delta = Math.round((multiplier - 1) * 100);
  return `${delta >= 0 ? '+' : ''}${delta}%`;
}

function getRegionalFactionContext(): RegionalFactionContext {
  const region = mapNodes.getCurrentRegion();
  if (!region) return { factionId: null, factionName: null, reputation: 0 };
  const factionId = getDominantFactionId(region.factionPressure);
  if (!factionId) return { factionId: null, factionName: null, reputation: 0 };
  return {
    factionId,
    factionName: v2Content.getFaction(factionId)?.name ?? null,
    reputation: factions.getReputation(factionId),
  };
}

function getPortMarketProfile(): PortMarketProfile {
  const context = getRegionalFactionContext();
  const rep = clamp(context.reputation, -100, 100);

  let shopMultiplier = 1 - rep * 0.002;
  let repairMultiplier = 1 - rep * 0.0016;
  let crewMultiplier = 1 - rep * 0.0013;
  const tierMultiplier = { common: 1, rare: 1, legendary: 1 };
  const marketNotes: string[] = [];

  switch (context.factionId) {
    case 'merchant_consortium':
      shopMultiplier *= 0.94;
      repairMultiplier *= 0.9;
      crewMultiplier *= 0.92;
      tierMultiplier.rare *= 0.95;
      marketNotes.push('Consortium quartermasters favor consistent trade ledgers.');
      break;
    case 'imperial_navy':
      shopMultiplier *= 1.08;
      repairMultiplier *= 1.12;
      crewMultiplier *= 1.08;
      tierMultiplier.rare *= 1.05;
      tierMultiplier.legendary *= 1.05;
      marketNotes.push('Imperial harbor taxes are active in this district.');
      break;
    case 'redwake_corsairs':
      shopMultiplier *= 0.98;
      repairMultiplier *= 1.06;
      crewMultiplier *= 0.94;
      tierMultiplier.common *= 0.92;
      tierMultiplier.legendary *= 1.12;
      marketNotes.push('Corsair brokers discount raiding tools, but premium guns cost extra.');
      break;
    case 'wraith_fleet':
      shopMultiplier *= 1.02;
      repairMultiplier *= 1.14;
      crewMultiplier *= 1.04;
      tierMultiplier.common *= 1.08;
      tierMultiplier.legendary *= 0.9;
      marketNotes.push('Wraith tariffs are volatile. Forbidden cargo trades cheaper.');
      break;
    case 'free_captains':
      shopMultiplier *= 0.96;
      repairMultiplier *= 0.97;
      crewMultiplier *= 0.88;
      marketNotes.push('Free captain enclaves reduce recruitment fees for known allies.');
      break;
  }

  shopMultiplier = clamp(shopMultiplier, 0.72, 1.42);
  repairMultiplier = clamp(repairMultiplier, 0.72, 1.42);
  crewMultiplier = clamp(crewMultiplier, 0.72, 1.42);
  tierMultiplier.common = clamp(tierMultiplier.common, 0.8, 1.25);
  tierMultiplier.rare = clamp(tierMultiplier.rare, 0.8, 1.25);
  tierMultiplier.legendary = clamp(tierMultiplier.legendary, 0.8, 1.25);

  if (context.factionName) {
    marketNotes.push(
      `${context.factionName} influence: shop ${toPctLabel(shopMultiplier)}, repair ${toPctLabel(repairMultiplier)}, crew ${toPctLabel(crewMultiplier)}.`,
    );
  } else {
    marketNotes.push('Neutral port authority keeps prices stable.');
  }

  return {
    context,
    shopMultiplier,
    repairMultiplier,
    crewMultiplier,
    tierMultiplier,
    marketTitle: context.factionName ? `${context.factionName} Exchange` : 'Neutral Harbor Exchange',
    marketNotes,
  };
}

function getRegionalEventPressureMultiplier(): number {
  const context = getRegionalFactionContext();
  const rep = clamp(context.reputation, -120, 120);
  let multiplier = 1 + (-rep / 240);

  switch (context.factionId) {
    case 'wraith_fleet':
    case 'redwake_corsairs':
      multiplier += 0.06;
      break;
    case 'merchant_consortium':
      multiplier -= 0.05;
      break;
    case 'imperial_navy':
      multiplier += 0.03;
      break;
  }

  return clamp(multiplier, 0.65, 1.55);
}

function applyFactionReputationDelta(factionId: string | null, delta: number, reason: string): void {
  if (!factionId) {
    applyRegionalFactionReputationDelta(delta, reason);
    return;
  }
  const score = factions.applyReputationDelta(factionId, delta);
  queueFactionReputationFeedback(factionId, delta);
  telemetry.track('faction_reputation', {
    faction: factionId,
    delta,
    score,
    reason,
  });
}

function getContractObjectiveProgress(objective: ActiveContractObjective): number {
  switch (objective.contractType) {
    case 'captures':
      return capturesThisWave;
    case 'armed_captures':
      return armedCapturesThisWave;
    case 'plunder_gold':
      return waveCaptureGold;
  }
}

function formatContractRewardLine(objective: ActiveContractObjective): string {
  const parts: string[] = [];
  if (objective.rewardSupplies > 0) parts.push(`+${objective.rewardSupplies} Supplies`);
  if (objective.rewardIntel > 0) parts.push(`+${objective.rewardIntel} Intel`);
  if (objective.rewardTokens > 0) parts.push(`+${objective.rewardTokens} Token${objective.rewardTokens > 1 ? 's' : ''}`);
  if (objective.rewardGold > 0) parts.push(`+${objective.rewardGold} Gold`);
  return parts.join(', ');
}

function formatContractPenaltyLine(objective: ActiveContractObjective): string {
  const parts: string[] = [];
  if (objective.penaltySupplies > 0) parts.push(`-${objective.penaltySupplies} Supplies`);
  if (objective.penaltyIntel > 0) parts.push(`-${objective.penaltyIntel} Intel`);
  return parts.join(', ');
}

function formatContractProgress(objective: ActiveContractObjective, progress: number): string {
  if (objective.contractType === 'plunder_gold') {
    return `${Math.round(progress).toLocaleString()} / ${objective.target.toLocaleString()} gold`;
  }
  return `${Math.round(progress)} / ${objective.target} ${objective.progressLabel}`;
}

function setupContractObjectiveForWave(
  wave: number,
  nodeType: MapNodeType | undefined,
  dominantFactionId: string | null,
): void {
  if (nodeType !== 'contract') {
    activeContractObjective = null;
    return;
  }

  const factionName = dominantFactionId
    ? (v2Content.getFaction(dominantFactionId)?.name ?? formatCodexLabel(dominantFactionId))
    : 'Local Brokers';
  const rep = dominantFactionId ? factions.getReputation(dominantFactionId) : 0;
  let contractType: ActiveContractObjective['contractType'] = 'captures';
  switch (dominantFactionId) {
    case 'merchant_consortium':
      contractType = 'plunder_gold';
      break;
    case 'imperial_navy':
      contractType = 'armed_captures';
      break;
    case 'redwake_corsairs':
      contractType = Math.random() < 0.5 ? 'captures' : 'plunder_gold';
      break;
    case 'wraith_fleet':
      contractType = 'armed_captures';
      break;
    case 'free_captains':
      contractType = Math.random() < 0.6 ? 'captures' : 'armed_captures';
      break;
    default:
      contractType = 'captures';
  }

  let target = 0;
  let progressLabel = '';
  let targetLabel = '';

  if (contractType === 'captures') {
    target = 2 + (wave >= 3 ? 1 : 0) + (rep <= -25 ? 1 : 0) - (rep >= 35 ? 1 : 0);
    target = clamp(target, 1, 5);
    progressLabel = 'captures';
    targetLabel = `${target} captures`;
  } else if (contractType === 'armed_captures') {
    target = 1 + (wave >= 2 ? 1 : 0) + (rep <= -20 ? 1 : 0) - (rep >= 40 ? 1 : 0);
    target = clamp(target, 1, 4);
    progressLabel = 'armed captures';
    targetLabel = `${target} armed captures`;
  } else {
    target = 450 + wave * 160 + (rep <= -20 ? 220 : 0) - (rep >= 40 ? 120 : 0);
    target = clamp(target, 350, 2200);
    target = Math.round(target / 50) * 50;
    progressLabel = 'plundered gold';
    targetLabel = `${target} gold`;
  }

  let rewardSupplies = 0;
  let rewardIntel = 1;
  let rewardTokens = 0;
  let rewardGold = 0;
  let penaltySupplies = 1;
  let penaltyIntel = 0;

  switch (dominantFactionId) {
    case 'merchant_consortium':
      rewardSupplies = 2;
      rewardIntel = 2;
      break;
    case 'imperial_navy':
      rewardIntel = 2;
      rewardTokens = 1;
      penaltyIntel = 1;
      break;
    case 'redwake_corsairs':
      rewardSupplies = 1;
      rewardTokens = 1;
      rewardGold = 120;
      break;
    case 'wraith_fleet':
      rewardIntel = 1;
      rewardTokens = 2;
      rewardGold = 80;
      penaltyIntel = 1;
      break;
    case 'free_captains':
      rewardSupplies = 2;
      rewardIntel = 1;
      break;
    default:
      rewardSupplies = 1;
      rewardIntel = 1;
  }

  if (contractType === 'plunder_gold') {
    rewardGold += 120;
  }
  if (contractType === 'armed_captures') {
    rewardTokens += 1;
  }

  activeContractObjective = {
    wave,
    factionId: dominantFactionId,
    factionName,
    contractType,
    target,
    rewardSupplies,
    rewardIntel,
    rewardTokens,
    rewardGold,
    penaltySupplies,
    penaltyIntel,
    progressLabel,
    targetLabel,
    announcedMidpoint: false,
    announcedComplete: false,
  };

  const rewardLine = formatContractRewardLine(activeContractObjective);
  ui.showCaptainLog(
    `Contract terms from ${factionName}: ${targetLabel}. Reward: ${rewardLine}.`,
    'neutral',
  );
  telemetry.track('contract_offer', {
    wave,
    faction: dominantFactionId ?? 'neutral',
    rep: Math.round(rep),
    type: contractType,
    target,
    rewardSupplies,
    rewardIntel,
    rewardTokens,
    rewardGold,
  });
}

function updateContractObjectiveTargetLabel(objective: ActiveContractObjective): void {
  if (objective.contractType === 'plunder_gold') {
    objective.target = Math.round(objective.target / 50) * 50;
    objective.targetLabel = `${objective.target} gold`;
    return;
  }
  objective.target = Math.round(objective.target);
  objective.targetLabel = `${objective.target} ${objective.progressLabel}`;
}

async function resolveContractNegotiationChoice(objective: ActiveContractObjective | null): Promise<void> {
  if (!objective || screensaverActive) return;

  const options: ChoicePromptOption[] = [
    {
      id: 'aggressive',
      label: 'Aggressive Terms',
      detail: 'Higher quota and stronger payout. Reputation hit if you fail.',
    },
    {
      id: 'balanced',
      label: 'Balanced Terms',
      detail: 'Standard contract terms and penalties.',
    },
    {
      id: 'cautious',
      label: 'Cautious Terms',
      detail: 'Lower quota and lighter penalties, but reduced rewards.',
    },
  ];

  const choice = await ui.showChoicePrompt(
    `${objective.factionName} Contract`,
    `Objective: ${objective.targetLabel}. Reward: ${formatContractRewardLine(objective)}. Penalty: ${formatContractPenaltyLine(objective) || 'None'}.`,
    options,
  );

  switch (choice) {
    case 'aggressive':
      objective.target *= objective.contractType === 'plunder_gold' ? 1.25 : 1.35;
      objective.rewardSupplies += 1;
      objective.rewardIntel += 1;
      objective.rewardTokens += 1;
      if (objective.contractType === 'plunder_gold') objective.rewardGold += 120;
      objective.penaltySupplies += 1;
      if (objective.contractType !== 'captures') objective.penaltyIntel += 1;
      break;
    case 'cautious':
      objective.target *= objective.contractType === 'plunder_gold' ? 0.74 : 0.7;
      objective.rewardSupplies = Math.max(0, objective.rewardSupplies - 1);
      objective.rewardIntel = Math.max(1, objective.rewardIntel - 1);
      objective.rewardTokens = Math.max(0, objective.rewardTokens - 1);
      objective.rewardGold = Math.max(0, Math.round(objective.rewardGold * 0.55));
      objective.penaltySupplies = Math.max(0, objective.penaltySupplies - 1);
      objective.penaltyIntel = Math.max(0, objective.penaltyIntel - 1);
      break;
    default:
      break;
  }

  if (objective.contractType !== 'plunder_gold') {
    objective.target = clamp(objective.target, 1, objective.contractType === 'armed_captures' ? 5 : 6);
  } else {
    objective.target = clamp(objective.target, 300, 2600);
  }
  updateContractObjectiveTargetLabel(objective);

  ui.showCaptainLog(
    `Contract terms confirmed (${choice || 'balanced'}): ${objective.targetLabel}. Reward ${formatContractRewardLine(objective)}.`,
    'neutral',
  );
  telemetry.track('contract_negotiation', {
    wave: objective.wave,
    faction: objective.factionId ?? 'neutral',
    choice: choice || 'balanced',
    target: objective.target,
    rewardSupplies: objective.rewardSupplies,
    rewardIntel: objective.rewardIntel,
    rewardTokens: objective.rewardTokens,
    rewardGold: objective.rewardGold,
    penaltySupplies: objective.penaltySupplies,
    penaltyIntel: objective.penaltyIntel,
  });
}

function resolveContractObjectiveOnWaveComplete(wave: number): void {
  const objective = activeContractObjective;
  if (!objective || objective.wave !== wave) return;

  const progress = getContractObjectiveProgress(objective);
  const success = progress >= objective.target;
  if (success) {
    if (objective.rewardSupplies > 0) economy.addSupplies(objective.rewardSupplies);
    economy.addIntel(objective.rewardIntel);
    if (objective.rewardTokens > 0) economy.addReputationTokens(objective.rewardTokens);
    if (objective.rewardGold > 0) progression.addScore(objective.rewardGold);
    applyFactionReputationDelta(objective.factionId, 0.9, 'contract_success');
    ui.showCaptainLog(
      `Contract fulfilled for ${objective.factionName}: ${formatContractRewardLine(objective)}.`,
      'reward',
    );
  } else {
    if (objective.penaltySupplies > 0) economy.addSupplies(-objective.penaltySupplies);
    if (objective.penaltyIntel > 0) economy.addIntel(-objective.penaltyIntel);
    applyFactionReputationDelta(objective.factionId, -1.1, 'contract_failure');
    ui.showCaptainLog(
      `Contract failed in ${objective.factionName} waters: ${formatContractPenaltyLine(objective)}.`,
      'warning',
    );
  }

  telemetry.track('contract_resolved', {
    wave,
    faction: objective.factionId ?? 'neutral',
    type: objective.contractType,
    success,
    progress,
    target: objective.target,
  });
  activeContractObjective = null;
}

function queueFactionReputationFeedback(factionId: string, delta: number): void {
  if (Math.abs(delta) < 0.01) return;
  const current = pendingFactionReputation.get(factionId) ?? 0;
  pendingFactionReputation.set(factionId, current + delta);
}

function updateFactionFeedback(dt: number): void {
  if (pendingFactionReputation.size === 0) return;
  factionFeedbackTimer -= dt;
  if (factionFeedbackTimer > 0) return;

  let selectedFactionId: string | null = null;
  let selectedDelta = 0;
  for (const [factionId, delta] of pendingFactionReputation) {
    if (!selectedFactionId || Math.abs(delta) > Math.abs(selectedDelta)) {
      selectedFactionId = factionId;
      selectedDelta = delta;
    }
  }
  if (!selectedFactionId) return;

  pendingFactionReputation.delete(selectedFactionId);
  const factionName = v2Content.getFaction(selectedFactionId)?.name ?? formatCodexLabel(selectedFactionId);
  const score = factions.getReputation(selectedFactionId);
  const deltaLabel = `${selectedDelta >= 0 ? '+' : ''}${selectedDelta.toFixed(1)}`;
  ui.showCaptainLog(
    `Standing with ${factionName}: ${deltaLabel} (${Math.round(score)}).`,
    selectedDelta >= 0 ? 'reward' : 'warning',
  );
  factionFeedbackTimer = 2.3;
}

function applyMapNodeToWaveConfig(base: WaveConfigV1): WaveConfigV1 {
  const node = mapNodes.getCurrentNode();
  if (!node) return base;

  const config: WaveConfigV1 = {
    ...base,
    enemyTypes: [...base.enemyTypes],
  };

  const nodeRegion = v2Content.getRegion(node.regionId);
  if (nodeRegion && nodeRegion.weatherBias.length > 0) {
    const weather = toWeatherState(nodeRegion.weatherBias[config.wave % nodeRegion.weatherBias.length]);
    if (weather) config.weather = weather;
  }

  switch (node.type) {
    case 'event':
      config.armedPercent = Math.min(0.9, config.armedPercent + 0.1);
      break;
    case 'contract':
      config.speedMultiplier *= 1.08;
      config.healthMultiplier *= 1.08;
      break;
    case 'port':
      config.isPortWave = true;
      break;
    case 'boss':
      if (!config.bossName) {
        config.bossName = 'Dread Commodore';
        config.bossHp = Math.max(config.bossHp, Math.round(280 * config.healthMultiplier));
      }
      if (!config.enemyTypes.includes('navy_warship')) config.enemyTypes.push('navy_warship');
      break;
  }

  return config;
}

function announceEventStart(type: EventType): void {
  const entry = EVENT_START_LOG[type];
  if (!entry) return;
  unlockEventCodex(type);
  telemetry.track('event_start', { type });
  narrative.queue(entry.message, entry.tone);
  ui.showCaptainLog(entry.message, entry.tone);
}

function announceEventEnd(type: EventType, success: boolean): void {
  const entry = EVENT_END_LOG[type];
  if (!entry) return;
  telemetry.track('event_end', { type, success });
  if (type !== 'treasure_map') {
    applyRegionalFactionReputationDelta(success ? 0.3 : -0.25, success ? 'event_success' : 'event_failure');
  }
  if (success) {
    narrative.queue(entry.success, entry.successTone);
    ui.showCaptainLog(entry.success, entry.successTone);
    return;
  }
  if (entry.failure) {
    narrative.queue(entry.failure, entry.failureTone ?? 'warning');
    ui.showCaptainLog(entry.failure, entry.failureTone ?? 'warning');
  }
}

function parseFollowupTrigger(trigger: string): { cardId: string; choice: string } | null {
  if (!trigger.startsWith('followup:')) return null;
  const parts = trigger.split(':');
  if (parts.length < 3) return null;
  const cardId = parts[1]?.trim();
  const choice = parts.slice(2).join(':').trim();
  if (!cardId || !choice) return null;
  return { cardId, choice };
}

function makeFollowupChoiceKey(cardId: string, choice: string): string {
  return `${cardId}:${choice}`;
}

function pruneFollowupChoices(currentWave: number): void {
  for (const [key, expiresWave] of pendingFollowupChoices) {
    if (expiresWave < currentWave) {
      pendingFollowupChoices.delete(key);
    }
  }
}

function queueFollowupChoice(cardId: string, choice: string): void {
  if (!choice || choice === 'none') return;
  const currentWave = progression.getCurrentWave();
  const key = makeFollowupChoiceKey(cardId, choice);
  pendingFollowupChoices.set(key, currentWave + 2);
}

function hasFollowupTrigger(trigger: string, currentWave: number): boolean {
  const parsed = parseFollowupTrigger(trigger);
  if (!parsed) return false;
  const key = makeFollowupChoiceKey(parsed.cardId, parsed.choice);
  const expiresWave = pendingFollowupChoices.get(key);
  return typeof expiresWave === 'number' && expiresWave >= currentWave;
}

function consumeFollowupTrigger(trigger: string): void {
  const parsed = parseFollowupTrigger(trigger);
  if (!parsed) return;
  const key = makeFollowupChoiceKey(parsed.cardId, parsed.choice);
  pendingFollowupChoices.delete(key);
}

function matchesV2EventCardTrigger(
  card: V2EventCard,
  nodeType: MapNodeType | undefined,
  currentWave: number,
): boolean {
  const trigger = card.trigger;
  if (trigger.startsWith('followup:')) {
    return hasFollowupTrigger(trigger, currentWave);
  }
  if (trigger === 'enter_event_node') return nodeType === 'event';
  if (trigger === 'enter_combat_node') return nodeType === 'combat' || nodeType === 'contract';
  if (trigger === 'act_finale') return nodeType === 'boss';
  if (trigger === 'high_infamy') return progression.getScore() >= 1200;
  return false;
}

function pickV2EventCard(
  nodeType: MapNodeType | undefined,
  regionId: string | undefined,
  dominantFactionId: string | null,
): V2EventCard | null {
  if (!regionId) return null;
  const currentWave = progression.getCurrentWave();
  pruneFollowupChoices(currentWave);
  const nowSec = time;
  const regionCfg = v2Content.getRegion(regionId);
  const eventBias = new Set(regionCfg?.eventDeckBias ?? []);
  const candidates = v2Content.data.events.filter((card) => {
    if (card.region !== regionId) return false;
    if (!matchesV2EventCardTrigger(card, nodeType, currentWave)) return false;
    if (card.factions.length > 0 && dominantFactionId && !card.factions.includes(dominantFactionId)) return false;
    const cooldownUntil = v2EventCardCooldowns.get(card.id) ?? 0;
    if (cooldownUntil > nowSec) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  const rolled = candidates.filter((card) => Math.random() < card.rarity);
  const pool = rolled.length > 0 ? rolled : candidates;
  const cardWeight = (card: V2EventCard) => card.rarity * (eventBias.has(card.id) ? 1.45 : 1);
  const weightTotal = pool.reduce((sum, card) => sum + cardWeight(card), 0);
  if (weightTotal <= 0) return null;
  let roll = Math.random() * weightTotal;
  for (const card of pool) {
    roll -= cardWeight(card);
    if (roll <= 0) {
      consumeFollowupTrigger(card.trigger);
      return card;
    }
  }
  const fallback = pool[pool.length - 1] ?? null;
  if (fallback) consumeFollowupTrigger(fallback.trigger);
  return fallback;
}

async function applyV2EventCard(
  card: V2EventCard,
  config: WaveConfigV1,
  dominantFactionId: string | null,
): Promise<void> {
  v2EventCardCooldowns.set(card.id, time + card.cooldownSec);
  const crewRoles = new Set(crew.getCrew().map((member) => member.role));
  const stats = progression.getPlayerStats();
  const econState = () => economy.getState();
  let logLine = '';
  let tone: 'warning' | 'neutral' | 'reward' | 'mystic' = 'neutral';
  let branch: 'success' | 'failure' | 'neutral' = 'neutral';
  let choice = 'none';

  switch (card.payload) {
    case 'spawn_fire_wave':
      config.armedPercent = clamp(config.armedPercent + 0.12, 0, 0.95);
      if (!config.enemyTypes.includes('fire_ship')) config.enemyTypes.push('fire_ship');
      logLine = 'Fire hulks sighted ahead. Corsair raiders primed the lane.';
      tone = 'warning';
      break;
    case 'contraband_manifest_choice': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Smuggler ledgers are aboard. Decide whether to forge papers or burn the books.',
        [
          {
            id: 'forge_manifest',
            label: 'Forge Manifest',
            detail: 'Costs 1 Intel. Better supply gain and smoother relations if successful.',
          },
          {
            id: 'burn_ledgers',
            label: 'Burn The Ledgers',
            detail: 'No Intel cost, but patrols tighten and reputation drops.',
          },
        ],
      );
      if (choice === 'forge_manifest') {
        if (econState().intel >= 1) {
          economy.addIntel(-1);
          economy.addSupplies(2);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'False manifests accepted. +2 Supplies, -1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'No intel cache to forge from. Inspectors confiscated a crate.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addIntel(1);
        config.armedPercent = clamp(config.armedPercent + 0.05, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
        logLine = 'Ledgers burned. +1 Intel but patrol guns are now on alert.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'corsair_blood_oath_choice': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Redwake captains offer a blood oath before battle.',
        [
          {
            id: 'take_oath',
            label: 'Take The Oath',
            detail: 'Faster attack tempo and token gain, but rougher combat conditions.',
          },
          {
            id: 'decline_oath',
            label: 'Keep Distance',
            detail: 'Safer route and modest supplies, at reputation cost.',
          },
        ],
      );
      if (choice === 'take_oath') {
        config.speedMultiplier *= 1.08;
        config.armedPercent = clamp(config.armedPercent + 0.1, 0, 0.95);
        economy.addReputationTokens(1);
        applyFactionReputationDelta(dominantFactionId, 0.5, 'v2_event_card_success');
        logLine = 'Oath accepted. Battle tempo rises and raiders fight harder. +1 Token.';
        tone = 'mystic';
        branch = 'success';
      } else {
        economy.addSupplies(1);
        applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
        logLine = 'Oath declined. +1 Supplies, but corsair trust is reduced.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'morale_tax_choice': {
      const hasQuartermaster = crewRoles.has('quartermaster');
      choice = await ui.showChoicePrompt(
        card.name,
        'Harbormasters demand passage toll for this lane.',
        [
          {
            id: 'pay_toll',
            label: 'Pay The Toll',
            detail: 'Spend 2 Supplies to keep passage calm and preserve standing.',
          },
          {
            id: 'run_blockade',
            label: 'Run The Blockade',
            detail: 'No supply cost, but risks penalties unless your crew can outfox patrols.',
          },
        ],
      );

      if (choice === 'pay_toll') {
        if (economy.spendSupplies(2)) {
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.45, 'v2_event_card_success');
          logLine = 'Toll paid and route secured. -2 Supplies, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Insufficient stores to pay full toll. Patrols seized a crate.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        const evasionStrength = (hasQuartermaster ? 1 : 0)
          + (crewRoles.has('navigator') ? 1 : 0)
          + (crewRoles.has('lookout') ? 1 : 0)
          + (stats.maxSpeed >= 15 ? 1 : 0);
        if (evasionStrength >= 2) {
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, -0.1, 'v2_event_card_neutral');
          logLine = 'Blockade slipped at nightfall. +2 Intel, only minor diplomatic heat.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          economy.addSupplies(-2);
          applyFactionReputationDelta(dominantFactionId, -0.55, 'v2_event_card_failure');
          logLine = 'Blockade run failed. -2 Supplies and heavier armed patrols.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'ghost_lantern_choice': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Lantern lights flicker through the fog. Choose stealth or challenge.',
        [
          {
            id: 'douse_lanterns',
            label: 'Douse Lanterns',
            detail: 'Safer if you have scouting crew, otherwise supplies may be lost.',
          },
          {
            id: 'challenge_phantoms',
            label: 'Challenge The Phantoms',
            detail: 'Adds ghost threats but can earn tokens.',
          },
        ],
      );
      if (choice === 'douse_lanterns') {
        if (crewRoles.has('lookout') || crewRoles.has('navigator')) {
          config.armedPercent = clamp(config.armedPercent - 0.08, 0, 0.95);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Lanterns out. We slipped the phantom line. +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.25, 'v2_event_card_failure');
          logLine = 'Course drifted in darkness. -1 Supplies.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (!config.enemyTypes.includes('ghost_ship')) config.enemyTypes.push('ghost_ship');
        config.healthMultiplier *= 1.05;
        economy.addReputationTokens(1);
        applyFactionReputationDelta(dominantFactionId, 0.1, 'v2_event_card_neutral');
        logLine = 'Phantoms challenged. Enemy hulls harden, but omens grant +1 Token.';
        tone = 'mystic';
        branch = 'neutral';
      }
      break;
    }
    case 'boss_hunter_spawn':
      if (!config.enemyTypes.includes('navy_warship')) config.enemyTypes.push('navy_warship');
      config.totalShips = Math.min(config.totalShips + 1, 14);
      logLine = 'Imperial hunter squadron joins the patrol roster.';
      tone = 'warning';
      break;
    case 'imperial_tax_choice': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Imperial clerks board for an immediate tax audit.',
        [
          {
            id: 'submit_audit',
            label: 'Submit To Audit',
            detail: 'Spend 1 Supplies for cleaner passage and better standing.',
          },
          {
            id: 'bribe_clerks',
            label: 'Bribe The Clerks',
            detail: 'Costs 2 Intel if available; failure triggers harsher patrol response.',
          },
        ],
      );
      if (choice === 'submit_audit') {
        if (economy.spendSupplies(1)) {
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.3, 'v2_event_card_success');
          logLine = 'Audit cleared. -1 Supplies, +1 Intel.';
          tone = 'neutral';
          branch = 'success';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.05, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'Manifest was short. Escorts now enforce tighter inspection.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (econState().intel >= 2) {
          economy.addIntel(-2);
          economy.addSupplies(2);
          applyFactionReputationDelta(dominantFactionId, 0.1, 'v2_event_card_neutral');
          logLine = 'Bribes accepted quietly. -2 Intel, +2 Supplies.';
          tone = 'reward';
          branch = 'neutral';
        } else {
          economy.addSupplies(-2);
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.45, 'v2_event_card_failure');
          logLine = 'Failed bribe attempt. -2 Supplies and heavier patrol response.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'blockade_grid_choice': {
      choice = await ui.showChoicePrompt(
        card.name,
        'A mine-linked blockade closes the shortest route.',
        [
          {
            id: 'cut_lane',
            label: 'Cut Through Mine Lane',
            detail: 'Fast route with higher payoff if you have speed/scouting.',
          },
          {
            id: 'detour_route',
            label: 'Take The Detour',
            detail: 'Safer but longer engagement profile.',
          },
        ],
      );
      if (choice === 'cut_lane') {
        if (crewRoles.has('navigator') || stats.maxSpeed >= 15) {
          config.totalShips = Math.max(3, config.totalShips - 1);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.15, 'v2_event_card_success');
          logLine = 'Mine lane pierced cleanly. -1 ship in enemy roster, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.totalShips = Math.min(14, config.totalShips + 1);
          config.armedPercent = clamp(config.armedPercent + 0.05, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.3, 'v2_event_card_failure');
          logLine = 'Lane breach failed. -2 Supplies and reinforcements arrive.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        config.healthMultiplier *= 0.98;
        config.speedMultiplier *= 0.97;
        economy.addSupplies(1);
        applyFactionReputationDelta(dominantFactionId, -0.05, 'v2_event_card_neutral');
        logLine = 'Detour taken. +1 Supplies, but slower approach and longer exchanges.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'relic_or_risk_choice': {
      const hasScoutCrew = crewRoles.has('lookout') || crewRoles.has('navigator');
      choice = await ui.showChoicePrompt(
        card.name,
        'A relic cache lies inland. Decide whether to commit a landing party.',
        [
          {
            id: 'land_party',
            label: 'Commit Landing Party',
            detail: 'Potential big gain. Failure risks supply losses and an angrier sea lane.',
          },
          {
            id: 'shadow_market',
            label: 'Sell Coordinates',
            detail: 'Take immediate Intel/Tokens but leave treasure behind.',
          },
        ],
      );

      if (choice === 'shadow_market') {
        economy.addIntel(2);
        economy.addReputationTokens(1);
        applyFactionReputationDelta(dominantFactionId, 0.15, 'v2_event_card_neutral');
        logLine = 'Coordinates sold through smugglers. +2 Intel, +1 Token.';
        tone = 'neutral';
        branch = 'neutral';
      } else {
        if (hasScoutCrew || stats.maxSpeed >= 15 || crewRoles.has('bosun')) {
          economy.addSupplies(2);
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, 0.35, 'v2_event_card_success');
          logLine = 'Landing party returned with relic crates. +2 Supplies, +2 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Rivals raided the beachhead first; escorts tighten patrol lines.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'jungle_relic_choice': {
      choice = await ui.showChoicePrompt(
        card.name,
        'A jungle shrine is exposed by tidebreak.',
        [
          {
            id: 'inland_raid',
            label: 'Launch Inland Raid',
            detail: 'Potentially large gain if your crew can secure the beachhead.',
          },
          {
            id: 'hire_guides',
            label: 'Hire Local Guides',
            detail: 'Costs 1 Supplies but improves intel and diplomatic outcomes.',
          },
        ],
      );
      if (choice === 'hire_guides') {
        if (economy.spendSupplies(1)) {
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, 0.22, 'v2_event_card_success');
          logLine = 'Guides hired. -1 Supplies, +2 Intel.';
          tone = 'neutral';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'Guide deal collapsed over payment. -1 Supplies in the scramble.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (crewRoles.has('bosun') || crewRoles.has('lookout') || stats.maxHealth >= 130) {
          economy.addReputationTokens(1);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.3, 'v2_event_card_success');
          logLine = 'Shrine seized. +1 Token, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.armedPercent = clamp(config.armedPercent + 0.07, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.32, 'v2_event_card_failure');
          logLine = 'Beachhead overrun. -2 Supplies and patrol lines harden.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'elite_monster_encounter':
      config.specialEvent = config.specialEvent ?? 'sea_serpent';
      config.healthMultiplier *= 1.08;
      logLine = 'Leviathan signs churn below. The next clash will be brutal.';
      tone = 'mystic';
      break;
    case 'abyss_pressure_choice': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Depth gauges spike. Choose a route through abyssal pressure fronts.',
        [
          {
            id: 'skim_surface',
            label: 'Skim Surface Currents',
            detail: 'Safer path with modest supplies gain.',
          },
          {
            id: 'dive_signal',
            label: 'Dive For Signal Echo',
            detail: 'High risk but can yield intel and tokens if the crew holds.',
          },
        ],
      );
      if (choice === 'skim_surface') {
        economy.addSupplies(1);
        config.speedMultiplier *= 0.99;
        applyFactionReputationDelta(dominantFactionId, -0.04, 'v2_event_card_neutral');
        logLine = 'Surface route held. +1 Supplies with slight speed drag.';
        tone = 'neutral';
        branch = 'neutral';
      } else {
        if (crewRoles.has('surgeon') || crewRoles.has('bosun') || stats.maxHealth >= 130) {
          economy.addIntel(2);
          economy.addReputationTokens(2);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'Pressure dive survived. +2 Intel, +2 Tokens.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.healthMultiplier *= 1.1;
          config.specialEvent = config.specialEvent ?? 'whirlpool';
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Dive failed. Hull strain rises and whirlpool signatures form.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'mutiny_whispers_choice': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Whispers spread through the lower deck after recent infamy spikes.',
        [
          {
            id: 'share_spoils',
            label: 'Share Extra Spoils',
            detail: 'Costs 1 Supplies, improves morale and grants token leverage.',
          },
          {
            id: 'crack_down',
            label: 'Crack Down Hard',
            detail: 'No cost, but unstable crews may trigger losses.',
          },
        ],
      );
      if (choice === 'share_spoils') {
        if (economy.spendSupplies(1)) {
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Spoils distributed. -1 Supplies, +1 Token.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addIntel(-1);
          applyFactionReputationDelta(dominantFactionId, -0.15, 'v2_event_card_failure');
          logLine = 'No supplies to distribute. Crew trust eroded.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (crew.getCrew().length >= 3 || crewRoles.has('bosun')) {
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.05, 'v2_event_card_neutral');
          logLine = 'Discipline restored by veteran officers. +1 Intel.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          economy.addSupplies(-1);
          config.totalShips = Math.min(14, config.totalShips + 1);
          applyFactionReputationDelta(dominantFactionId, -0.25, 'v2_event_card_failure');
          logLine = 'Harsh discipline backfired. -1 Supplies and enemy scouts close in.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'manifest_inspection_followup': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Consortium auditors demand proof for those forged manifests.',
        [
          {
            id: 'submit_docs',
            label: 'Submit Clean Documents',
            detail: 'Spend 1 Intel to keep consortium routes open.',
          },
          {
            id: 'scuttle_evidence',
            label: 'Scuttle Evidence',
            detail: 'No Intel cost, but patrol pressure rises.',
          },
        ],
      );
      if (choice === 'submit_docs') {
        if (econState().intel >= 1) {
          economy.addIntel(-1);
          economy.addSupplies(1);
          config.armedPercent = clamp(config.armedPercent - 0.04, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'Audit passed. -1 Intel, +1 Supplies and reduced patrol pressure.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.3, 'v2_event_card_failure');
          logLine = 'No supporting intel cache. Auditors seized cargo manifests.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addIntel(1);
        config.armedPercent = clamp(config.armedPercent + 0.06, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, -0.28, 'v2_event_card_failure');
        logLine = 'Evidence burned. +1 Intel, but escorts now run hot inspections.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'corsair_retribution_followup': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Redwake captains answer the burned-ledger insult with a tribute demand.',
        [
          {
            id: 'pay_blood_price',
            label: 'Pay Blood Price',
            detail: 'Spend 2 Supplies to avoid escalation and gain limited goodwill.',
          },
          {
            id: 'stand_and_fight',
            label: 'Stand And Fight',
            detail: 'No supply cost, but heavier combat and volatile outcomes.',
          },
        ],
      );
      if (choice === 'pay_blood_price') {
        if (economy.spendSupplies(2)) {
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.18, 'v2_event_card_neutral');
          logLine = 'Tribute paid. -2 Supplies, +1 Token and open passage.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.1, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Could not pay tribute. Corsair retaliation escalates immediately.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (!config.enemyTypes.includes('fire_ship')) config.enemyTypes.push('fire_ship');
        config.speedMultiplier *= 1.04;
        config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
        const disciplinedCrew = crewRoles.has('bosun') || crewRoles.has('gunner');
        applyFactionReputationDelta(dominantFactionId, disciplinedCrew ? 0.12 : -0.2, disciplinedCrew ? 'v2_event_card_success' : 'v2_event_card_failure');
        logLine = disciplinedCrew
          ? 'Battle stations held. Corsairs respect the stand, but combat heats up.'
          : 'Stand was chaotic. Retaliation hardens corsair aggression this wave.';
        tone = disciplinedCrew ? 'mystic' : 'warning';
        branch = disciplinedCrew ? 'success' : 'failure';
      }
      break;
    }
    case 'phantom_tithe_followup': {
      choice = await ui.showChoicePrompt(
        card.name,
        'The dead return for unpaid passage. They demand a spectral tithe.',
        [
          {
            id: 'offer_tokens',
            label: 'Offer Reputation Tokens',
            detail: 'Spend 1 Token to avoid a direct haunting strike.',
          },
          {
            id: 'deny_tithe',
            label: 'Deny The Tithe',
            detail: 'Refuse payment. High chance of an immediate ghost event.',
          },
        ],
      );
      if (choice === 'offer_tokens') {
        if (econState().reputationTokens >= 1) {
          economy.addReputationTokens(-1);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.08, 'v2_event_card_neutral');
          logLine = 'Tithe accepted by the dead. -1 Token, +1 Intel.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          config.specialEvent = config.specialEvent ?? 'ghost_ship_event';
          config.healthMultiplier *= 1.06;
          applyFactionReputationDelta(dominantFactionId, -0.28, 'v2_event_card_failure');
          logLine = 'No token tribute available. The dead mark our wake.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        config.specialEvent = config.specialEvent ?? 'ghost_ship_event';
        config.armedPercent = clamp(config.armedPercent + 0.06, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
        logLine = 'Tithe denied. A ghost escort is now hunting this route.';
        tone = 'mystic';
        branch = 'failure';
      }
      break;
    }
    case 'mutiny_trial_followup': {
      choice = await ui.showChoicePrompt(
        card.name,
        'After the crackdown, the crew demands a final judgment at sea.',
        [
          {
            id: 'pardon_ringleader',
            label: 'Pardon Ringleader',
            detail: 'Spend 1 Supplies to stabilize morale and gain intel.',
          },
          {
            id: 'make_example',
            label: 'Make An Example',
            detail: 'No immediate cost, but unsteady crews risk desertion effects.',
          },
        ],
      );
      if (choice === 'pardon_ringleader') {
        if (economy.spendSupplies(1)) {
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, 0.12, 'v2_event_card_success');
          logLine = 'Pardon granted. -1 Supplies, +2 Intel from restored cooperation.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'No stores to back the pardon. Grumbling persists below deck.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (crewRoles.has('bosun') || crew.getCrew().length >= 4) {
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.05, 'v2_event_card_neutral');
          logLine = 'Order enforced cleanly. +1 Token from hardened discipline.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          economy.addSupplies(-1);
          config.totalShips = Math.min(14, config.totalShips + 1);
          applyFactionReputationDelta(dominantFactionId, -0.3, 'v2_event_card_failure');
          logLine = 'Execution sparked panic. -1 Supplies and enemy scouts exploit the chaos.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'relic_hunters_followup': {
      choice = await ui.showChoicePrompt(
        card.name,
        'Competing hunter ships close in on your recovered relic routes.',
        [
          {
            id: 'ambush_hunters',
            label: 'Ambush Hunter Fleet',
            detail: 'Aggressive option with bigger upside for scouting crews.',
          },
          {
            id: 'split_haul',
            label: 'Split The Haul',
            detail: 'Lower conflict, steady supplies, smaller prestige gain.',
          },
        ],
      );
      if (choice === 'ambush_hunters') {
        if (crewRoles.has('lookout') || crewRoles.has('navigator') || stats.maxSpeed >= 15) {
          economy.addIntel(2);
          economy.addReputationTokens(1);
          config.totalShips = Math.max(3, config.totalShips - 1);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'Hunter fleet ambushed successfully. +2 Intel, +1 Token, fewer enemy hulls.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.28, 'v2_event_card_failure');
          logLine = 'Ambush failed. -2 Supplies and armed escorts now shadow us.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addSupplies(2);
        economy.addIntel(1);
        applyFactionReputationDelta(dominantFactionId, 0.12, 'v2_event_card_neutral');
        logLine = 'Haul split quietly. +2 Supplies, +1 Intel and reduced pursuit.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    default:
      logLine = 'Rumors shift the tide, but details remain uncertain.';
      tone = 'neutral';
      break;
  }

  if (choice !== 'none') {
    queueFollowupChoice(card.id, choice);
  }

  narrative.queue(`${card.name}: ${logLine}`, tone);
  ui.showCaptainLog(`${card.name}: ${logLine}`, tone);
  telemetry.track('v2_event_card', {
    id: card.id,
    payload: card.payload,
    trigger: card.trigger,
    region: card.region,
    faction: dominantFactionId ?? 'neutral',
    choice,
    branch,
  });
}

// Track active wave config (V1 with enemy types + boss info)
let activeWaveConfigV1: WaveConfigV1 | null = null;
let currentBoss: MerchantV1 | null = null;

interface ActiveContractObjective {
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

function spawnEnemy(enemyType: EnemyType, isBoss: boolean) {
  const waveConfig = activeWaveConfigV1 ?? progression.getWaveConfigV1();
  const props = EnemyAISystem.getSpawnProps(enemyType, isBoss, waveConfig);
  if (gameStarted && !screensaverActive) {
    unlockEnemyCodex(enemyType);
  }

  const angle = Math.random() * Math.PI * 2;
  const dist = 30 + Math.random() * 40;
  const px = playerPos.x + Math.cos(angle) * dist;
  const pz = playerPos.z + Math.sin(angle) * dist;

  const mesh = createShipMesh(props.hullColor, props.sailColor, props.scale);

  // Ghost ships get spectral effect
  if (enemyType === 'ghost_ship') {
    GhostShipEffect.applyGhostEffect(mesh, false);
  }

  if (weather.getCurrentState() === 'night') {
    setShipLanterns(mesh, true);
  }

  const heading = Math.random() * Math.PI * 2;
  mesh.position.set(px, 0, pz);
  scene.add(mesh);

  const m: MerchantV1 = {
    mesh,
    pos: new THREE.Vector3(px, 0, pz),
    heading,
    speed: props.speed,
    baseSpeed: props.baseSpeed,
    state: 'sailing',
    sinkTimer: 0,
    sinkPhase: 0,
    value: props.value,
    id: nextMerchantId++,
    hp: props.hp,
    maxHp: props.maxHp,
    armed: props.armed,
    fireTimer: props.fireTimer,
    hitRadius: props.hitRadius,
    scale: props.scale,
    zigzagTimer: 0,
    zigzagDir: Math.random() > 0.5 ? 1 : -1,
    convoyLeaderId: -1,
    convoyOffset: new THREE.Vector3(),
    chainSlowTimer: 0,
    isBoss: props.isBoss,
    bossEnraged: false,
    surrendering: false,
    enemyType: props.enemyType,
    phaseTimer: props.phaseTimer,
    isPhased: props.isPhased,
    explosionRadius: props.explosionRadius,
    hasTreasureMap: false,
    fleeTimer: props.fleeTimer,
    formationIndex: props.formationIndex,
    formationLeaderId: props.formationLeaderId,
  };

  merchants.push(m);
  if (lastIsNight) setShipLanterns(mesh, true);

  if (isBoss) {
    currentBoss = m;
    const bossName = waveConfig.bossName ?? `Captain ${PIRATE_NAMES[Math.floor(Math.random() * PIRATE_NAMES.length)]}`;
    ui.showBossHealthBar(bossName);
    ui.updateBossHealth(m.hp, m.maxHp);
    ui.showCaptainLog(`Enemy flagship sighted: ${bossName}.`, 'warning');
    audio.playBossWarning();
    audio.setBossMode(true);
  }
}

// ===================================================================
//  Game state
// ===================================================================

let gameStarted = false;
let gamePaused = false;
let combo = 0;
let lastCaptureTime = -Infinity;
let waveAnnouncePending = false;
let waveAnnounceTimer = 0;
let waveCompleteTimer = 0;
let creakTimer = 0;
let scoreAtWaveStart = 0;
let gameOverFired = false;

// Tutorial condition tracking
let tutorialMoved = false;
let tutorialFired = false;
let tutorialCaptured = false;
let tutorialUpgraded = false;
let islandDiscoveryScanTimer = 0;
const discoveredIslandSeeds = new Set<number>();
let v2HudRefreshTimer = 0;
let factionFeedbackTimer = 0;
const pendingFactionReputation = new Map<string, number>();
let capturesThisWave = 0;
let armedCapturesThisWave = 0;
let waveCaptureGold = 0;
let activeContractObjective: ActiveContractObjective | null = null;
const v2EventCardCooldowns = new Map<string, number>();
const pendingFollowupChoices = new Map<string, number>();
let codexOpen = false;
let codexResumePausedState = false;
let runSetupOpen = false;
let selectedRunShipClass: ShipClass = 'brigantine';
let selectedDoctrineId = v2Content.data.doctrines[0]?.id ?? '';
let beginWaveInProgress = false;

// Screensaver mode
let lastIsNight = false;
let screensaverActive = false;
let screensaverWeatherTimer = 0;
let screensaverWeatherIndex = 0;
const screensaverWeathers: Array<'clear' | 'foggy' | 'stormy' | 'night'> = ['clear', 'foggy', 'night', 'stormy'];
const screensaverShips: THREE.Group[] = [];

// Screensaver wave config — base stats for demo enemies
const screensaverWaveConfig: WaveConfigV1 = {
  wave: 1,
  totalShips: 4,
  armedPercent: 0.4,
  speedMultiplier: 1.0,
  healthMultiplier: 1.0,
  weather: 'clear',
  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate'],
  bossName: null,
  bossHp: 0,
  isPortWave: false,
  specialEvent: null,
};

// Autopilot state machine
type AutopilotState = 'idle' | 'seek_island' | 'seek_merchant' | 'engage';
let autopilotState: AutopilotState = 'idle';
let autopilotTimer = 0;
let autopilotTarget: THREE.Vector3 | null = null;
let autopilotTargetId = -1;
let screensaverSpawnTimer = 0;

// Dev/God mode flags
let devGodMode = false;
let devInstakill = false;

// Scenario editor state
let editorMode = false;
let editorPlayTestMode = false;
let scenarioEditor: ScenarioEditor | null = null;
let editorUI: EditorUI | null = null;
let editorCamera: EditorCamera | null = null;
let playTestScenario: Scenario | null = null;

const devPanel = new DevPanel({
  onSetGold: (v) => { progression.devSetScore(v); ui.updateScore(v); },
  onSetHealth: (v) => {
    progression.devSetHealth(v);
    const s = progression.getPlayerStats();
    ui.updateHealth(s.health, s.maxHealth);
  },
  onSetMaxSpeed: (v) => progression.devSetMaxSpeed(v),
  onSetDamage: (v) => { progression.devSetCannonDamage(v); syncUpgradesToCombat(); },
  onSetWave: (v) => progression.devSetWave(v),
  onToggleGodMode: (v) => { devGodMode = v; },
  onToggleInstakill: (v) => { devInstakill = v; },
  onSpawnEnemy: (type, isBoss) => spawnEnemy(type, isBoss),
  onSetWeather: (state) => weather.transitionTo(state, 2),
  onExportTelemetry: () => exportTelemetrySnapshot('dev_panel'),
  getState: () => ({
    gold: progression.getScore(),
    health: progression.getPlayerStats().health,
    maxHealth: progression.getPlayerStats().maxHealth,
    maxSpeed: progression.getPlayerStats().maxSpeed,
    damage: progression.getPlayerStats().cannonDamage,
    wave: progression.getCurrentWave(),
    weather: weather.getCurrentState(),
    godMode: devGodMode,
    instakill: devInstakill,
  }),
});

function exportTelemetrySnapshot(reason: string): string {
  const doctrine = progression.getActiveDoctrine();
  const snapshot = telemetry.buildExport({
    reason,
    wave: progression.getCurrentWave(),
    score: progression.getScore(),
    shipClass: progression.getShipClass(),
    doctrineId: doctrine?.id ?? 'none',
    doctrineName: doctrine?.name ?? 'None',
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `booty-hunt-telemetry-${stamp}.json`;
  try {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    telemetry.track('telemetry_export', {
      reason,
      totalEvents: snapshot.totalEvents,
      filename,
    });
    return `Telemetry exported: ${filename} (${snapshot.totalEvents} events)`;
  } catch {
    return 'Telemetry export failed.';
  }
}

function canOpenCodex(): boolean {
  if (!gameStarted || screensaverActive) return false;
  if (beginWaveInProgress) return false;
  if (inPort || waveCompleteInProgress) return false;
  const runSummary = document.getElementById('run-summary');
  if (runSummary && runSummary.style.display !== 'none') return false;
  return true;
}

function closeCodex(): void {
  if (!codexOpen) return;
  codexOpen = false;
  ui.hideCodex();
  gamePaused = codexResumePausedState;
  codexResumePausedState = false;
}

function openCodex(): void {
  if (!canOpenCodex()) return;
  if (codexOpen) return;
  codexResumePausedState = gamePaused;
  gamePaused = true;
  codexOpen = true;
  ui.showCodex(buildCodexViewModel());
  ui.onCodexClose(() => closeCodex());
}

function toggleCodex(): void {
  if (codexOpen) {
    closeCodex();
    return;
  }
  openCodex();
}

function openRunSetup(): void {
  if (gameStarted || screensaverActive || runSetupOpen) return;
  const shipConfigs = getRunSetupShipConfigs();
  const unlockedShip = shipConfigs.find((cfg) => !cfg.locked)?.id ?? 'brigantine';
  if (!shipConfigs.some((cfg) => cfg.id === selectedRunShipClass && !cfg.locked)) {
    selectedRunShipClass = unlockedShip;
  }
  const doctrines = getRunSetupDoctrineOptions();
  if (doctrines.length === 0) {
    startGame(selectedRunShipClass, selectedDoctrineId);
    return;
  }

  runSetupOpen = true;
  ui.showRunSetup(
    shipConfigs,
    doctrines,
    {
      shipClass: selectedRunShipClass,
      doctrineId: selectedDoctrineId,
    },
    (shipClass, doctrineId) => {
      runSetupOpen = false;
      selectedRunShipClass = shipClass;
      selectedDoctrineId = doctrineId;
      ui.hideShipSelect();
      startGame(shipClass, doctrineId);
    },
  );
}

// ===================================================================
//  Input: keyboard
// ===================================================================

const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key.startsWith('Arrow') || 'wasdqemcx'.includes(e.key.toLowerCase())) {
    e.preventDefault();
  }

  // Editor mode input handling
  if (editorMode && !editorPlayTestMode) {
    if (e.key === '`') { devPanel?.toggle(); return; }
    if (e.key === 'Escape') { exitEditorMode(); return; }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); scenarioEditor?.redo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); scenarioEditor?.undo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); scenarioEditor?.redo(); return; }
    if (e.key === 'Delete' && scenarioEditor && scenarioEditor.getSelectedIndex() >= 0) {
      scenarioEditor.removeIsland(scenarioEditor.getSelectedIndex());
      editorUI?.refresh();
      return;
    }
    // Let EditorCamera handle WASD
    return;
  }
  if (editorPlayTestMode) {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape') { exitPlayTestMode(); return; }
    if (e.key === '`') { devPanel?.toggle(); return; }
    // Fall through to normal game input handling for Q/E/WASD
  }

  if (runSetupOpen) {
    if (e.key.toLowerCase() === 'escape') {
      runSetupOpen = false;
      ui.hideShipSelect();
    }
    return;
  }
  if (!editorPlayTestMode) keys[e.key.toLowerCase()] = true;
  if (e.key === '`') { devPanel?.toggle(); return; }
  if (screensaverActive && e.key !== 'F5' && e.key !== 'F12') { stopScreensaver(); return; }
  if (!gameStarted && !screensaverActive && !editorMode && e.key !== 'F5' && e.key !== 'F12' && e.key.toLowerCase() !== 'c') {
    openRunSetup();
    return;
  }

  if (e.key.toLowerCase() === 'c' && gameStarted && !screensaverActive) {
    toggleCodex();
    return;
  }

  // Mute toggle
  if (e.key.toLowerCase() === 'm' && gameStarted) {
    const muted = audio.toggleMute();
    ui.setMuted(muted);
  }

  if (e.key.toLowerCase() === 'x' && gameStarted && !screensaverActive) {
    const message = exportTelemetrySnapshot('hotkey');
    ui.showCaptainLog(message, 'neutral');
  }

  // Cannon firing
  if (gameStarted && !gamePaused) {
    if (e.key.toLowerCase() === 'q') { firePort(); tutorialFired = true; }
    if (e.key.toLowerCase() === 'e') { fireStarboard(); tutorialFired = true; }
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ===================================================================
//  Cannon firing helpers
// ===================================================================

function firePort() {
  if (!combat.canFirePort) return;
  const stats = progression.getPlayerStats();
  const count = stats.fullBroadside ? 5 : 3;
  combat.fireBroadside(playerPos, playerAngle, 'port', stats.cannonDamage, playerSpeed, count);
  audio.playCannon();
  audio.playMuzzleBlast();

  // Muzzle flash + smoke from port side
  const sideDir = new THREE.Vector3(-Math.cos(playerAngle), 0.3, Math.sin(playerAngle));
  const smokeOrigin = playerPos.clone().add(sideDir.clone().multiplyScalar(1.5));
  smokeOrigin.y = playerPos.y + 0.8;
  cannonSmoke.emit(smokeOrigin, sideDir, 15);
  muzzleFlash.emit(smokeOrigin, sideDir);

  // Screen shake on fire
  screenShake.trigger(0.15);

  // Ship recoil
  recoilOffset = 0.3;
}

function fireStarboard() {
  if (!combat.canFireStarboard) return;
  const stats = progression.getPlayerStats();
  const count = stats.fullBroadside ? 5 : 3;
  combat.fireBroadside(playerPos, playerAngle, 'starboard', stats.cannonDamage, playerSpeed, count);
  audio.playCannon();
  audio.playMuzzleBlast();

  // Muzzle flash + smoke from starboard side
  const sideDir = new THREE.Vector3(Math.cos(playerAngle), 0.3, -Math.sin(playerAngle));
  const smokeOrigin = playerPos.clone().add(sideDir.clone().multiplyScalar(1.5));
  smokeOrigin.y = playerPos.y + 0.8;
  cannonSmoke.emit(smokeOrigin, sideDir, 15);
  muzzleFlash.emit(smokeOrigin, sideDir);

  // Screen shake on fire
  screenShake.trigger(0.15);

  // Ship recoil
  recoilOffset = 0.3;
}

// ===================================================================
//  Input: touch (virtual joystick + spyglass)
// ===================================================================

let touchFwd = 0;
let touchTurn = 0;
let touchSpyglass = false;
let joystickTouchId: number | null = null;
let spyglassTouchId: number | null = null;
let joystickCenterX = 0;
let joystickCenterY = 0;

const JOYSTICK_RADIUS = 55;
const joystickBase = document.getElementById('joystick-base')!;
const joystickThumb = document.getElementById('joystick-thumb')!;

function handleTouchStart(e: TouchEvent) {
  e.preventDefault();
  if (screensaverActive) { stopScreensaver(); return; }
  if (runSetupOpen) return;
  if (!gameStarted) {
    openRunSetup();
    return;
  }

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.clientX < innerWidth * 0.5) {
      if (joystickTouchId === null) {
        joystickTouchId = t.identifier;
        joystickCenterX = t.clientX;
        joystickCenterY = t.clientY;
        joystickBase.style.left = `${t.clientX}px`;
        joystickBase.style.top = `${t.clientY}px`;
        joystickBase.style.opacity = '1';
      }
    } else {
      spyglassTouchId = t.identifier;
      touchSpyglass = true;
    }
  }
}

function handleTouchMove(e: TouchEvent) {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joystickTouchId) {
      const dx = t.clientX - joystickCenterX;
      const dy = t.clientY - joystickCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, JOYSTICK_RADIUS);
      const angle = Math.atan2(dy, dx);
      const cx = Math.cos(angle) * clamped;
      const cy = Math.sin(angle) * clamped;

      joystickThumb.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
      touchTurn = -(cx / JOYSTICK_RADIUS);
      touchFwd = -(cy / JOYSTICK_RADIUS);
    }
  }
}

function handleTouchEnd(e: TouchEvent) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joystickTouchId) {
      joystickTouchId = null;
      joystickBase.style.opacity = '0';
      joystickThumb.style.transform = 'translate(-50%, -50%)';
      touchFwd = 0;
      touchTurn = 0;
    }
    if (t.identifier === spyglassTouchId) {
      spyglassTouchId = null;
      touchSpyglass = false;
    }
  }
}

window.addEventListener('touchstart', handleTouchStart, { passive: false });
window.addEventListener('touchmove', handleTouchMove, { passive: false });
window.addEventListener('touchend', handleTouchEnd);
window.addEventListener('touchcancel', handleTouchEnd);
window.addEventListener('mousedown', (e) => {
  if (screensaverActive) {
    stopScreensaver();
    return;
  }
  const target = e.target as HTMLElement;
  if (target.closest('#screensaver-btn, #editor-btn')) return;
  if (!gameStarted && !runSetupOpen && !editorMode && target.closest('#title')) {
    openRunSetup();
  }
});

// ===================================================================
//  Mobile UI tweaks
// ===================================================================

if (isMobile) {
  const hint = document.getElementById('title-hint');
  if (hint) hint.textContent = 'Touch to set sail';
  const ctrl = document.getElementById('controls');
  if (ctrl) ctrl.innerHTML = 'Left: Steer &bull; Right: Spyglass &bull; Buttons: Cannons &bull; Codex button';

  ui.showMobileCannonButtons(firePort, fireStarboard);
}

// ===================================================================
//  Game start & wave flow
// ===================================================================

// ===================================================================
//  Screensaver mode
// ===================================================================

function startScreensaver() {
  runSetupOpen = false;
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  closeCodex();
  v2EventCardCooldowns.clear();
  pendingFollowupChoices.clear();
  beginWaveInProgress = false;
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  screensaverActive = true;
  screensaverWeatherTimer = 0;
  screensaverWeatherIndex = 0;
  screensaverSpawnTimer = 0;
  ui.screensaverMode = true;
  ui.clearCaptainLog();

  audio.init();

  // Hide title
  const title = document.getElementById('title');
  if (title) {
    title.style.opacity = '0';
    title.style.pointerEvents = 'none';
  }

  // Set screensaver wave config for enemy spawning
  activeWaveConfigV1 = screensaverWaveConfig;

  // Generate world islands and feed reef data to ocean shader
  world.generateIslands();
  ocean.setReefPositions(world.getReefData());

  // Init player at origin, sailing forward
  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 8;

  // Init camera behind player
  camPos.set(-Math.sin(playerAngle) * 18, 14, -Math.cos(playerAngle) * 18);
  camPos.add(playerPos);
  camLookAt.copy(playerPos);

  // Init autopilot
  autopilotState = 'idle';
  autopilotTimer = 3 + Math.random() * 3;
  autopilotTarget = null;
  autopilotTargetId = -1;

  // Start with clear weather
  weather.transitionTo('clear', 2);
}

function stopScreensaver() {
  runSetupOpen = false;
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  closeCodex();
  v2EventCardCooldowns.clear();
  pendingFollowupChoices.clear();
  beginWaveInProgress = false;
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  screensaverActive = false;
  ui.screensaverMode = false;

  // Remove all merchants from scene
  for (const m of merchants) {
    scene.remove(m.mesh);
  }
  merchants.length = 0;

  // Remove old screensaverShips (backward compat)
  for (const ship of screensaverShips) {
    scene.remove(ship);
  }
  screensaverShips.length = 0;

  // Reset player
  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 0;

  // Dispose world islands
  world.dispose();

  // Reset combat (clear cannonballs)
  combat.portCooldown = 0;
  combat.starboardCooldown = 0;

  // Reset ocean position
  ocean.update(time, new THREE.Vector3());

  // Reset weather to clear
  weather.transitionTo('clear', 2);

  // Reset wave config
  activeWaveConfigV1 = null;

  // Show title again
  const title = document.getElementById('title');
  if (title) {
    title.style.opacity = '1';
    title.style.pointerEvents = '';
  }
}

function updateAutopilot(dt: number) {
  const turnRate = 2.2;
  const islands = world.getIslands();

  autopilotTimer -= dt;

  switch (autopilotState) {
    case 'idle': {
      // Sail forward with gentle wander
      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 10, 1 - Math.exp(-2 * dt));
      playerAngle += (Math.sin(time * 0.3) * 0.3) * dt;

      // After timer expires, pick a target
      if (autopilotTimer <= 0) {
        // Try to find a merchant first
        let nearestMerchant: MerchantV1 | null = null;
        let nearestMDist = Infinity;
        for (const m of merchants) {
          if (m.state === 'sinking') continue;
          const d = _tmpVec3A.copy(m.pos).sub(playerPos).length();
          if (d < nearestMDist) {
            nearestMDist = d;
            nearestMerchant = m;
          }
        }

        if (nearestMerchant && nearestMDist < 80) {
          autopilotState = 'seek_merchant';
          autopilotTarget = nearestMerchant.pos;
          autopilotTargetId = nearestMerchant.id;
          autopilotTimer = 30;
        } else if (islands.length > 0) {
          // Pick a random island to visit
          const island = islands[Math.floor(Math.random() * islands.length)];
          autopilotState = 'seek_island';
          autopilotTarget = island.pos;
          autopilotTimer = 20;
        } else {
          autopilotTimer = 3 + Math.random() * 3;
        }
      }
      break;
    }

    case 'seek_island': {
      if (!autopilotTarget) { autopilotState = 'idle'; autopilotTimer = 2; break; }

      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 10, 1 - Math.exp(-2 * dt));

      const toIsland = Math.atan2(
        autopilotTarget.x - playerPos.x,
        autopilotTarget.z - playerPos.z,
      );
      const diff = normalizeAngle(toIsland - playerAngle);
      playerAngle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);

      const dist = _tmpVec3A.copy(autopilotTarget).sub(playerPos).length();
      if (dist < 35 || autopilotTimer <= 0) {
        autopilotState = 'idle';
        autopilotTimer = 5 + Math.random() * 3;
      }
      break;
    }

    case 'seek_merchant': {
      // Check if target still exists
      const target = merchants.find(m => m.id === autopilotTargetId && m.state !== 'sinking');
      if (!target || autopilotTimer <= 0) {
        autopilotState = 'idle';
        autopilotTimer = 3 + Math.random() * 3;
        break;
      }

      autopilotTarget = target.pos;
      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 12, 1 - Math.exp(-2 * dt));

      const toTarget = Math.atan2(
        autopilotTarget.x - playerPos.x,
        autopilotTarget.z - playerPos.z,
      );
      const diff = normalizeAngle(toTarget - playerAngle);
      playerAngle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);

      const dist = _tmpVec3A.copy(autopilotTarget).sub(playerPos).length();
      if (dist < 25) {
        autopilotState = 'engage';
        autopilotTimer = 15;
      }
      break;
    }

    case 'engage': {
      const target = merchants.find(m => m.id === autopilotTargetId && m.state !== 'sinking');
      if (!target || autopilotTimer <= 0) {
        autopilotState = 'idle';
        autopilotTimer = 5 + Math.random() * 3;
        break;
      }

      autopilotTarget = target.pos;
      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 8, 1 - Math.exp(-2 * dt));

      // Circle the target
      const toTarget = Math.atan2(
        autopilotTarget.x - playerPos.x,
        autopilotTarget.z - playerPos.z,
      );
      const dist = _tmpVec3A.copy(autopilotTarget).sub(playerPos).length();

      // Orbit: steer perpendicular + slightly toward target
      const orbitAngle = toTarget + Math.PI / 2;
      const approachBlend = Math.max(0, (dist - 15) / 20);
      const desiredAngle = normalizeAngle(orbitAngle) * (1 - approachBlend) + normalizeAngle(toTarget) * approachBlend;
      const diff = normalizeAngle(desiredAngle - playerAngle);
      playerAngle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);

      // Fire broadsides when target is abeam (perpendicular)
      const relAngle = Math.abs(normalizeAngle(toTarget - playerAngle));
      if (relAngle > Math.PI / 4 && relAngle < Math.PI * 3 / 4 && dist < 30) {
        // Port side (target is to the left)
        if (normalizeAngle(toTarget - playerAngle) > 0 && combat.canFirePort) {
          firePort();
        }
        // Starboard side (target is to the right)
        if (normalizeAngle(toTarget - playerAngle) < 0 && combat.canFireStarboard) {
          fireStarboard();
        }
      }
      break;
    }
  }
}

// Wire up screensaver button
const screensaverBtn = document.getElementById('screensaver-btn');
if (screensaverBtn) {
  screensaverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startScreensaver();
  });
}
const codexToggleBtn = document.getElementById('codex-toggle');
if (codexToggleBtn) {
  codexToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCodex();
  });
}

// Wire up editor button
(window as any).__enterEditor = () => enterEditorMode();

// ===================================================================
//  Scenario Editor Functions
// ===================================================================

function enterEditorMode(scenario?: Scenario): void {
  if (editorMode) return;
  if (screensaverActive) stopScreensaver();
  if (gameStarted) return; // don't enter from mid-game

  // Close run setup if it raced open from the window mousedown
  if (runSetupOpen) {
    runSetupOpen = false;
    ui.hideShipSelect();
  }

  editorMode = true;
  editorPlayTestMode = false;

  // Hide title screen and game HUD
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.style.display = 'none';
  ui.hideAll();

  const sc = scenario ?? createEmptyScenario();

  // Lazy init editor systems
  if (!editorCamera) editorCamera = new EditorCamera();
  if (!scenarioEditor) scenarioEditor = new ScenarioEditor();
  if (!editorUI) {
    editorUI = new EditorUI({
      onToolChange: (tool) => scenarioEditor?.setTool(tool),
      onIslandTypeSelect: (type) => scenarioEditor?.setPlaceType(type),
      onIslandPropertyChange: (index, key, value) => {
        scenarioEditor?.updateIslandProperty(index, key as keyof import('./Scenario').ScenarioIsland, value as never);
      },
      onWaveAdd: () => {
        const s = editorUI?.getScenario();
        if (s) { s.waves.push(createDefaultWave()); editorUI?.refresh(); }
      },
      onWaveEdit: (index, wave) => {
        const s = editorUI?.getScenario();
        if (s && index >= 0 && index < s.waves.length) { s.waves[index] = wave; editorUI?.refresh(); }
      },
      onWaveDelete: (index) => {
        const s = editorUI?.getScenario();
        if (s && s.waves.length > 1) { s.waves.splice(index, 1); editorUI?.refresh(); }
      },
      onWaveReorder: (from, to) => {
        const s = editorUI?.getScenario();
        if (s && from >= 0 && from < s.waves.length && to >= 0 && to < s.waves.length) {
          const [moved] = s.waves.splice(from, 1);
          s.waves.splice(to, 0, moved);
          editorUI?.refresh();
        }
      },
      onWinConditionChange: (conditions) => {
        const s = editorUI?.getScenario();
        if (s) s.winConditions = conditions;
      },
      onSave: () => {},
      onLoad: (loadedScenario) => {
        exitEditorMode();
        enterEditorMode(loadedScenario);
      },
      onPlayTest: () => enterPlayTestMode(),
      onExitEditor: () => exitEditorMode(),
      onUndo: () => scenarioEditor?.undo(),
      onRedo: () => scenarioEditor?.redo(),
      onStartWeatherChange: (w) => {
        const s = editorUI?.getScenario();
        if (s) { s.startWeather = w; weather.transitionTo(w, 2); }
      },
    });
  }

  // Wire up editor ↔ UI callbacks
  scenarioEditor.onSelectionChanged = (index) => {
    const island = scenarioEditor?.getSelectedIsland() ?? null;
    editorUI?.refreshProperties(index, island);
  };
  scenarioEditor.onIslandsChanged = () => {
    editorUI?.refresh();
  };

  editorCamera.enable();
  scenarioEditor.enter(sc, scene, camera, world, ocean);
  editorUI.show(sc);

  // Set starting weather
  weather.transitionTo(sc.startWeather, 1);
}

function exitEditorMode(): void {
  if (!editorMode) return;
  editorMode = false;
  editorPlayTestMode = false;

  editorCamera?.disable();
  scenarioEditor?.exit();
  editorUI?.hide();

  // Dispose world and restore title
  world.dispose();

  ui.showAll();
  const titleEl = document.getElementById('title');
  if (titleEl) {
    titleEl.style.display = '';
    titleEl.style.opacity = '1';
  }
}

function enterPlayTestMode(): void {
  if (!editorMode || !editorUI || !scenarioEditor) return;

  const sc = editorUI.getScenario();
  if (!sc || sc.waves.length === 0) return;

  playTestScenario = sc;
  editorPlayTestMode = true;

  // Disable editor systems but keep editor mode flag
  editorCamera?.disable();
  scenarioEditor.exit();
  editorUI.hide();

  // Show game HUD
  ui.showAll();
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.style.display = 'none';

  // Reload islands into world from scenario
  const islands = sc.islands.map((si, i) => {
    const config = (window as any).__ISLAND_TYPE_CONFIGS ?? {};
    // Build Island objects from ScenarioIsland
    return {
      type: si.type as IslandType,
      name: `Island ${i + 1}`,
      pos: new THREE.Vector3(si.x, 0.8, si.z),
      radius: si.radius,
      reefRadius: si.radius * 1.6,
      hasTreasure: si.hasTreasure,
      treasureCollected: false,
      meshCreated: false,
      meshGroup: null as THREE.Group | null,
      seed: si.seed,
    };
  });
  world.loadIslands(islands);
  world.forceCreateAllMeshes();
  ocean.setReefPositions(world.getReefData());

  // Set custom wave table
  const waveTable = scenarioWavesToWaveTable(sc.waves);
  progression.reset();
  progression.initializeStats('brigantine');
  progression.setCustomWaveTable(waveTable);

  // Start game
  gameStarted = true;
  gamePaused = false;

  // Reset player position
  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 0;

  // Sync player stats
  syncUpgradesToCombat();
  const stats = progression.getPlayerStats();
  ui.updateHealth(stats.health, stats.maxHealth);
  ui.updateScore(0);

  // Begin first wave (simplified — no V2 overlays)
  beginPlayTestWave();
}

function beginPlayTestWave(): void {
  progression.startWave();
  const config = progression.getWaveConfigV1();
  activeWaveConfigV1 = config;
  progression.onWaveStart();
  scoreAtWaveStart = progression.getScore();

  // Apply crew bonuses
  progression.applyCrewBonuses(crew.getCrewBonuses());
  syncUpgradesToCombat();

  // Announce wave
  ui.showWaveAnnouncement(config.wave, config.bossName !== null);
  waveAnnouncePending = true;
  waveAnnounceTimer = 1.5;

  // Weather transition
  weather.transitionTo(config.weather, config.wave === 1 ? 1 : 10);
  audio.setWeatherIntensity(weather.getCurrentConfig().windIntensity);

  if (config.wave > 1) audio.playWaveComplete();

  // Trigger special event if wave specifies one
  if (config.specialEvent) {
    events.startEvent(config.specialEvent, playerPos, world.getIslands().length);
  }
}

function exitPlayTestMode(): void {
  if (!editorPlayTestMode || !playTestScenario) return;
  editorPlayTestMode = false;
  gameStarted = false;
  gamePaused = false;
  gameOverFired = false;

  // Clean up merchants
  for (let i = merchants.length - 1; i >= 0; i--) {
    scene.remove(merchants[i].mesh);
  }
  merchants.length = 0;
  currentBoss = null;

  // Reset progression
  progression.clearCustomWaveTable();
  progression.reset();

  // Hide game HUD
  ui.hideAll();
  ui.hideBossHealthBar();

  // Re-enter editor with the same scenario
  editorMode = false; // reset so enterEditorMode works
  enterEditorMode(playTestScenario);
  playTestScenario = null;
}

function startGame(shipClass: ShipClass = selectedRunShipClass, doctrineId: string = selectedDoctrineId) {
  const availableShips = getRunSetupShipConfigs();
  const fallbackShip = availableShips.find((cfg) => !cfg.locked)?.id ?? 'brigantine';
  if (!availableShips.some((cfg) => cfg.id === shipClass && !cfg.locked)) {
    shipClass = fallbackShip;
  }
  runSetupOpen = false;
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  closeCodex();
  v2EventCardCooldowns.clear();
  pendingFollowupChoices.clear();
  beginWaveInProgress = false;
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  selectedRunShipClass = shipClass;
  if (screensaverActive) stopScreensaver();
  gameStarted = true;
  gamePaused = false;
  for (const key of Object.keys(keys)) {
    keys[key] = false;
  }

  progression.reset();
  const doctrine = getDoctrineById(doctrineId);
  selectedDoctrineId = doctrine?.id ?? doctrineId;
  progression.initializeStats(shipClass, doctrine);
  syncUpgradesToCombat();

  camPos.copy(camera.position);
  camLookAt.set(0, 0, 0);

  audio.init();

  // Generate world islands and feed reef data to ocean shader
  world.generateIslands();
  const reefData = world.getReefData();
  ocean.setReefPositions(reefData);
  const runSeed = Math.floor(Math.random() * 0x7fffffff);
  mapNodes.startRun(runSeed);
  factions.reset();
  economy.resetRun();
  telemetry.resetRun();
  telemetry.track('run_start', {
    seed: runSeed,
    shipClass,
    doctrine: doctrine?.id ?? 'none',
  });
  discoveredIslandSeeds.clear();
  islandDiscoveryScanTimer = 0;
  v2HudRefreshTimer = 0;
  narrative.reset();
  ui.clearCaptainLog();
  ui.showCaptainLog(`We set course for ${world.getRegionName()}.`, 'neutral');
  if (doctrine) {
    ui.showCaptainLog(`Doctrine set: ${doctrine.name}. ${doctrine.summary}`, 'mystic');
  }
  narrative.onRunStart(world.getRegionName());
  const currentRegion = mapNodes.getCurrentRegion();
  if (currentRegion) {
    unlockRegionCodex(currentRegion.id);
    narrative.onRegionEntered(currentRegion.name, currentRegion.theme);
    const dominantFactionId = applyFactionPressureProfileForRegion(currentRegion.factionPressure);
    if (dominantFactionId) {
      unlockFactionCodex(dominantFactionId);
      const dominantFaction = v2Content.getFaction(dominantFactionId);
      if (dominantFaction) narrative.onFactionPressure(dominantFaction.name);
    }
  } else {
    EnemyAISystem.resetPressureProfile();
  }
  const currentNode = mapNodes.getCurrentNode();
  if (currentNode) narrative.onNodeStart(currentNode.label);

  // Start tutorial for new players
  tutorial.start();

  setTimeout(() => {
    ui.hideTitle();
    const healthBar = document.getElementById('health-bar');
    if (healthBar) healthBar.style.opacity = '1';
    const waveCounter = document.getElementById('wave-counter');
    if (waveCounter) waveCounter.style.opacity = '1';
    const cdPort = document.getElementById('cooldown-port');
    if (cdPort) cdPort.style.opacity = '1';
    const cdStarboard = document.getElementById('cooldown-starboard');
    if (cdStarboard) cdStarboard.style.opacity = '1';
    const minimap = document.getElementById('minimap-container');
    if (minimap) minimap.classList.add('show');
  }, 1200);

  beginWave();
}

async function beginWave() {
  if (beginWaveInProgress) return;
  beginWaveInProgress = true;
  gamePaused = true;
  try {
    // Start wave (progression state transition) and get V1 config
    progression.startWave();
    capturesThisWave = 0;
    armedCapturesThisWave = 0;
    waveCaptureGold = 0;
    const baseConfig = progression.getWaveConfigV1();
    const config = applyMapNodeToWaveConfig(baseConfig);
    activeWaveConfigV1 = config;
    progression.onWaveStart();
    scoreAtWaveStart = progression.getScore();

    // Apply crew bonuses to stats for this wave
    progression.applyCrewBonuses(crew.getCrewBonuses());
    syncUpgradesToCombat();
    const currentNode = mapNodes.getCurrentNode();
    const nodeRegion = currentNode ? v2Content.getRegion(currentNode.regionId) : null;
    if (nodeRegion) unlockRegionCodex(nodeRegion.id);
    const dominantFactionId = nodeRegion
      ? applyFactionPressureProfileForRegion(nodeRegion.factionPressure)
      : null;
    if (dominantFactionId) unlockFactionCodex(dominantFactionId);
    const dominantFactionName = dominantFactionId
      ? (v2Content.getFaction(dominantFactionId)?.name ?? null)
      : null;
    const eventCard = pickV2EventCard(currentNode?.type, nodeRegion?.id, dominantFactionId);
    if (eventCard) {
      await applyV2EventCard(eventCard, config, dominantFactionId);
    }
    setupContractObjectiveForWave(config.wave, currentNode?.type, dominantFactionId);
    if (activeContractObjective) {
      await resolveContractNegotiationChoice(activeContractObjective);
    }
    if (activeContractObjective?.contractType === 'armed_captures') {
      config.armedPercent = Math.max(config.armedPercent, 0.5);
      if (!config.enemyTypes.includes('escort_frigate')) config.enemyTypes.push('escort_frigate');
    } else if (activeContractObjective?.contractType === 'plunder_gold') {
      if (!config.enemyTypes.includes('merchant_galleon')) config.enemyTypes.push('merchant_galleon');
    }

    // Wave preview
    ui.showWavePreview(
      config.wave,
      config.weather,
      config.totalShips,
      config.armedPercent,
    );

    // Wave announcement
    ui.showWaveAnnouncement(config.wave, config.bossName !== null);
    waveAnnouncePending = true;
    waveAnnounceTimer = 1.5;
    ui.showCaptainLog(getWaveLogLine(config), config.bossName ? 'warning' : 'neutral');
    telemetry.track('wave_start', {
      wave: config.wave,
      weather: config.weather,
      ships: config.totalShips,
      boss: config.bossName ?? '',
    });
    if (currentNode) {
      narrative.onNodeStart(currentNode.label);
      telemetry.track('map_node_start', {
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        regionId: currentNode.regionId,
      });
    }

    // Weather transition
    weather.transitionTo(config.weather, config.wave === 1 ? 1 : 10);

    // Audio weather
    const weatherCfg = weather.getCurrentConfig();
    audio.setWeatherIntensity(weatherCfg.windIntensity);

    // Wave complete audio
    if (config.wave > 1) {
      audio.playWaveComplete();
    }

    // Trigger special event if wave specifies one
    if (config.specialEvent) {
      events.startEvent(config.specialEvent, playerPos, world.getIslands().length);
      announceEventStart(config.specialEvent);
    }
  } finally {
    beginWaveInProgress = false;
    ui.hideChoicePrompt();
    if (gameStarted) {
      gamePaused = false;
    }
  }
}

function spawnWaveFleet() {
  // Clear any remaining merchants from previous wave
  for (let i = merchants.length - 1; i >= 0; i--) {
    if (merchants[i].state !== 'sinking') {
      scene.remove(merchants[i].mesh);
      merchants.splice(i, 1);
    }
  }

  currentBoss = null;
  audio.setBossMode(false);

  const config = activeWaveConfigV1 ?? progression.getWaveConfigV1();

  // Use EnemyAI to build the spawn list from the V1 wave config
  const spawnList = EnemyAISystem.getSpawnList(config, config.wave);
  const nodeRegion = mapNodes.getCurrentRegion();
  const dominantFactionId = nodeRegion ? getDominantFactionId(nodeRegion.factionPressure) : null;
  if (dominantFactionId) {
    telemetry.track('faction_pressure', {
      faction: dominantFactionId,
      region: nodeRegion?.id ?? '',
    });
  }

  const factionBiasPool = dominantFactionId ? FACTION_ENEMY_BIAS[dominantFactionId] : null;
  const earlyWave = config.wave <= 2;
  let biasChance = earlyWave ? 0.2 : 0.45;
  if (dominantFactionId) {
    const rep = factions.getReputation(dominantFactionId);
    const hostility = clamp(-rep / 120, 0, 1);
    const trust = clamp(rep / 160, 0, 1);
    biasChance += hostility * 0.24;
    biasChance -= trust * 0.08;
  }
  biasChance = clamp(biasChance, 0.12, 0.8);

  for (const entry of spawnList) {
    let enemyType = entry.type;
    if (!entry.isBoss && factionBiasPool && factionBiasPool.length > 0 && Math.random() < biasChance) {
      enemyType = factionBiasPool[Math.floor(Math.random() * factionBiasPool.length)];
    }
    spawnEnemy(enemyType, entry.isBoss);
  }

  // Organize navy_warship formations
  EnemyAISystem.updateFormation(merchants);

  ui.updateWaveCounter(config.wave, config.totalShips, config.totalShips);
}

let waveCompleteInProgress = false;
async function onWaveComplete() {
  if (waveCompleteInProgress) return;
  waveCompleteInProgress = true;
  gamePaused = true;
  ui.hideBossHealthBar();
  resolveContractObjectiveOnWaveComplete(activeWaveConfigV1?.wave ?? progression.getCurrentWave());

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Show upgrade selection
  const choices = progression.getUpgradeChoices();
  const choiceIndex = await ui.showUpgradeScreen(
    choices.map(c => ({
      ...c,
      tier: c.tier,
    })),
    progression.getAcquiredUpgrades(),
  );
  const synergy = progression.selectUpgrade(choiceIndex);
  tutorialUpgraded = true;

  // Show synergy popup if triggered
  if (synergy) {
    ui.showSynergyPopup(synergy.name);
  }

  // Rebuild player ship visual if tiers changed
  rebuildPlayerShip();

  // Sync upgrade stats to combat system
  syncUpgradesToCombat();

  // Level up crew after each wave
  crew.levelUpAll();
  ui.updateCrewHUD(crew.getCrew().map(c => ({
    role: c.role,
    level: c.level,
    icon: CREW_ROLE_CONFIGS[c.role].icon,
  })));

  // Add meta gold (only wave earnings, not cumulative total)
  progression.addMetaGold(progression.getScore() - scoreAtWaveStart);
  economy.addReputationTokens(1);

  gamePaused = false;

  // Victory check — after final wave, show run summary
  if (progression.checkVictory() && editorPlayTestMode) {
    // Play-test victory: return to editor
    waveCompleteInProgress = false;
    exitPlayTestMode();
    return;
  }
  if (progression.checkVictory()) {
    closeCodex();
    pendingFactionReputation.clear();
    factionFeedbackTimer = 0;
    capturesThisWave = 0;
    armedCapturesThisWave = 0;
    waveCaptureGold = 0;
    activeContractObjective = null;
    telemetry.track('run_victory', { wave: progression.getCurrentWave() });
    gamePaused = true;
    waveCompleteInProgress = false;
    victoryConfetti.start();
    audio.playWaveComplete();
    progression.setFactionReputationSnapshot(factions.getReputationSnapshot());
    const runStats = progression.getRunStats();
    const unlocks = progression.checkUnlocks(runStats);
    const hostile = progression.getMostHostileFaction();
    const allied = progression.getMostAlliedFaction();
    const doctrine = progression.getActiveDoctrine();
    progression.saveHighScore();
    progression.saveMetaStats();
    ui.showRunSummary(runStats, unlocks, {
      codexCount: progression.getCodexEntryCount(),
      doctrineName: doctrine?.name ?? null,
      hostileFactionId: hostile?.id ?? null,
      hostileFactionScore: hostile?.score ?? null,
      alliedFactionId: allied?.id ?? null,
      alliedFactionScore: allied?.score ?? null,
    });
    ui.onRunSummaryRestart(() => {
      ui.hideRunSummary();
      restartGame();
    });
    return;
  }

  // Port visit on port waves
  const waveConfig = activeWaveConfigV1 ?? progression.getWaveConfigV1();
  const nextNode = mapNodes.advanceNode();
  if (nextNode) {
    telemetry.track('map_node_advance', {
      nextNodeId: nextNode.id,
      nextNodeType: nextNode.type,
      nextRegion: nextNode.regionId,
    });
    const nextRegionCfg = v2Content.getRegion(nextNode.regionId);
    if (nextRegionCfg) {
      unlockRegionCodex(nextRegionCfg.id);
      narrative.onRegionEntered(nextRegionCfg.name, nextRegionCfg.theme);
      const dominantFactionId = applyFactionPressureProfileForRegion(nextRegionCfg.factionPressure);
      if (dominantFactionId) {
        unlockFactionCodex(dominantFactionId);
        const faction = v2Content.getFaction(dominantFactionId);
        if (faction) narrative.onFactionPressure(faction.name);
      }
    } else {
      EnemyAISystem.resetPressureProfile();
    }
  }
  waveCompleteInProgress = false;
  if (editorPlayTestMode) {
    // Play-test: skip port visits, go straight to next wave
    beginPlayTestWave();
    return;
  }
  const shouldPort = waveConfig.isPortWave || nextNode?.type === 'port';
  if (shouldPort) {
    enterPort();
  } else {
    beginWave();
  }
}

function rebuildPlayerShip() {
  const newConfig = {
    speedTier: progression.getSpeedTier(),
    armorTier: progression.getArmorTier(),
    weaponTier: progression.getWeaponTier(),
  };

  if (newConfig.speedTier !== playerShipConfig.speedTier ||
      newConfig.armorTier !== playerShipConfig.armorTier ||
      newConfig.weaponTier !== playerShipConfig.weaponTier) {
    scene.remove(playerGroup);
    playerShipConfig = newConfig;
    playerGroup = createShipMesh(0x6b3a2a, 0xf5f0e6, 1, playerShipConfig);
    playerGroup.position.copy(playerPos);
    playerGroup.rotation.y = playerAngle;
    scene.add(playerGroup);

    if (weather.getCurrentState() === 'night') {
      setShipLanterns(playerGroup, true);
    }
  }
}

// ===================================================================
//  Port mode
// ===================================================================

function enterPort() {
  gamePaused = true;
  inPort = true;
  const marketProfile = getPortMarketProfile();
  const harborLabel = marketProfile.context.factionName
    ? `${marketProfile.context.factionName} harbor`
    : 'Port Royal';
  ui.showCaptainLog(`Dropping anchor at ${harborLabel} for repairs and rumors.`, 'neutral');
  audio.setPortMode(true);
  audio.playPortAmbience();

  // Create port scene
  portScene = new PortScene();
  scene.add(portScene.group);
  portScene.group.position.set(playerPos.x + 50, 0, playerPos.z);

  const stats = progression.getPlayerStats();
  const shopUpgrades = progression.getAvailableUpgradesForShop();
  const costMap: Record<string, number> = {};
  const tierMult = marketProfile.tierMultiplier;
  for (const u of shopUpgrades) {
    const baseCost = u.tier === 'legendary' ? 1500 : u.tier === 'rare' ? 500 : 200;
    const tierFactor = u.tier === 'legendary' ? tierMult.legendary : u.tier === 'rare' ? tierMult.rare : tierMult.common;
    costMap[u.id] = Math.max(75, Math.round(baseCost * marketProfile.shopMultiplier * tierFactor));
  }
  const repairCostPer10 = Math.max(35, Math.round(100 * marketProfile.repairMultiplier));
  const getCrewHireCost = (role: keyof typeof CREW_ROLE_CONFIGS): number => {
    return Math.max(90, Math.round(CREW_ROLE_CONFIGS[role].cost * marketProfile.crewMultiplier));
  };
  const mapCrewHireRows = (roles: Array<{ role: keyof typeof CREW_ROLE_CONFIGS } & { name: string; icon: string; bonusPerLevel: string }>) => {
    return roles.map(r => ({
      role: r.role,
      name: CREW_ROLE_CONFIGS[r.role].name,
      icon: CREW_ROLE_CONFIGS[r.role].icon,
      cost: getCrewHireCost(r.role),
      bonusPerLevel: CREW_ROLE_CONFIGS[r.role].bonusPerLevel,
    }));
  };
  telemetry.track('port_market', {
    faction: marketProfile.context.factionId ?? 'neutral',
    rep: Math.round(marketProfile.context.reputation),
    shopMult: Number(marketProfile.shopMultiplier.toFixed(3)),
    repairMult: Number(marketProfile.repairMultiplier.toFixed(3)),
    crewMult: Number(marketProfile.crewMultiplier.toFixed(3)),
  });

  ui.showPortUI(
    progression.getScore(),
    stats.health,
    stats.maxHealth,
    shopUpgrades.map(u => ({
      id: u.id,
      name: u.name,
      description: u.description,
      icon: u.icon,
      tier: u.tier,
      cost: costMap[u.id],
    })),
    (upgradeId: string) => {
      // Buy upgrade
      const cost = costMap[upgradeId];
      if (progression.purchaseUpgrade(upgradeId, cost)) {
        audio.playPurchase();
        applyRegionalFactionReputationDelta(0.35, 'port_upgrade_purchase');
        ui.updatePortGold(progression.getScore());
        const newStats = progression.getPlayerStats();
        ui.updatePortHealth(newStats.health, newStats.maxHealth);
        rebuildPlayerShip();
        syncUpgradesToCombat();
      }
    },
    (amount: number) => {
      // Repair
      const currentStats = progression.getPlayerStats();
      if (amount === -1) {
        // Full repair
        const needed = currentStats.maxHealth - currentStats.health;
        const cost = Math.ceil(needed / 10) * repairCostPer10;
        if (progression.repairHealth(needed, cost)) {
          audio.playPurchase();
          applyRegionalFactionReputationDelta(0.2, 'port_repair');
          ui.updatePortGold(progression.getScore());
          const newStats = progression.getPlayerStats();
          ui.updatePortHealth(newStats.health, newStats.maxHealth);
        }
      } else {
        const chunkCost = Math.ceil(amount / 10) * repairCostPer10;
        if (progression.repairHealth(amount, chunkCost)) {
          audio.playPurchase();
          applyRegionalFactionReputationDelta(0.12, 'port_repair');
          ui.updatePortGold(progression.getScore());
          const newStats = progression.getPlayerStats();
          ui.updatePortHealth(newStats.health, newStats.maxHealth);
        }
      }
    },
    () => {
      // Set sail
      leavePort();
    },
    {
      repairCostPer10,
      marketTitle: marketProfile.marketTitle,
      marketNotes: marketProfile.marketNotes,
    },
  );

  // Show crew hiring UI in tavern
  const availableRoles = crew.getAvailableRoles(progression.getMetaStatsV1());
  const gold = progression.getScore();
  const handleCrewHire = (role: string) => {
    const crewRole = role as keyof typeof CREW_ROLE_CONFIGS;
    const cost = getCrewHireCost(crewRole);
    const check = crew.canHire(crewRole, progression.getScore(), progression.getMetaStatsV1(), cost);
    if (check.canHire) {
      progression.addScore(-cost);
      crew.hire(crewRole);
      progression.addCrewHired();
      applyRegionalFactionReputationDelta(0.45, 'port_crew_hire');
      progression.applyCrewBonuses(crew.getCrewBonuses());
      audio.playPurchase();
      ui.updatePortGold(progression.getScore());
      ui.updateCrewHUD(crew.getCrew().map(c => ({
        role: c.role,
        level: c.level,
        icon: CREW_ROLE_CONFIGS[c.role].icon,
      })));
      // Refresh crew hire UI with the same handler
      const refreshRoles = crew.getAvailableRoles(progression.getMetaStatsV1());
      ui.showPortCrewHire(
        mapCrewHireRows(refreshRoles),
        progression.getScore(),
        handleCrewHire,
      );
    } else if (check.reason) {
      ui.showCaptainLog(check.reason, 'warning');
    }
  };
  ui.showPortCrewHire(
    mapCrewHireRows(availableRoles),
    gold,
    handleCrewHire,
  );
}

function leavePort() {
  ui.hidePortUI();
  ui.hidePortCrewHire();
  ui.showCaptainLog('Anchor up. Crew aboard. Back to open water.', 'neutral');
  audio.stopPortAmbience();
  audio.setPortMode(false);

  if (portScene) {
    portScene.dispose(scene);
    portScene = null;
  }

  inPort = false;
  gamePaused = false;
  beginWave();
}

async function onGameOver() {
  if (editorPlayTestMode) {
    exitPlayTestMode();
    return;
  }
  beginWaveInProgress = false;
  ui.hideChoicePrompt();
  closeCodex();
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  gamePaused = true;
  telemetry.track('run_game_over', {
    wave: progression.getCurrentWave(),
    score: progression.getScore(),
  });
  progression.saveHighScore();
  progression.setFactionReputationSnapshot(factions.getReputationSnapshot());
  progression.saveMetaStats();
  ui.hideBossHealthBar();

  await ui.showGameOver(
    progression.getScore(),
    progression.getCurrentWave(),
    progression.getHighScore(),
    progression.getHighWave(),
  );

  restartGame();
}

function restartGame() {
  runSetupOpen = false;
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  closeCodex();
  v2EventCardCooldowns.clear();
  pendingFollowupChoices.clear();
  beginWaveInProgress = false;
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  // Clear all merchants
  for (const m of merchants) {
    scene.remove(m.mesh);
  }
  merchants.length = 0;
  nextMerchantId = 0;
  currentBoss = null;

  // Reset player
  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 0;
  playerVel.set(0, 0, 0);
  juiceScale = 1;
  juiceVel = 0;
  recoilOffset = 0;
  combo = 0;
  lastCaptureTime = -Infinity;

  // Reset progression
  progression.reset();
  const doctrine = getDoctrineById(selectedDoctrineId);
  if (doctrine) {
    selectedDoctrineId = doctrine.id;
  }
  progression.initializeStats(selectedRunShipClass, doctrine);
  syncUpgradesToCombat();
  const runSeed = Math.floor(Math.random() * 0x7fffffff);
  mapNodes.startRun(runSeed);
  factions.reset();
  economy.resetRun();
  telemetry.resetRun();
  telemetry.track('run_restart', {
    reason: 'game_restart',
    shipClass: selectedRunShipClass,
    doctrine: doctrine?.id ?? 'none',
  });
  gameOverFired = false;
  waveCompleteInProgress = false;
  waveCompleteTimer = 0;
  waveAnnouncePending = false;
  waveAnnounceTimer = 0;
  activeWaveConfigV1 = null;
  ui.hideRunSummary();

  // Reset new systems
  world.dispose();
  world.generateIslands();
  ocean.setReefPositions(world.getReefData());
  crew.reset();
  events.reset();
  tutorial.reset();
  tutorial.start();
  tutorialMoved = false;
  tutorialFired = false;
  tutorialCaptured = false;
  tutorialUpgraded = false;
  islandDiscoveryScanTimer = 0;
  discoveredIslandSeeds.clear();
  v2HudRefreshTimer = 0;
  narrative.reset();
  ui.clearCaptainLog();
  ui.showCaptainLog(`Back through ${world.getRegionName()} we sail.`, 'neutral');
  if (doctrine) {
    ui.showCaptainLog(`Doctrine set: ${doctrine.name}. ${doctrine.summary}`, 'mystic');
  }
  narrative.onRunStart(world.getRegionName());
  const currentRegion = mapNodes.getCurrentRegion();
  if (currentRegion) {
    unlockRegionCodex(currentRegion.id);
    const dominantFactionId = applyFactionPressureProfileForRegion(currentRegion.factionPressure);
    if (dominantFactionId) {
      unlockFactionCodex(dominantFactionId);
      const dominantFaction = v2Content.getFaction(dominantFactionId);
      if (dominantFaction) narrative.onFactionPressure(dominantFaction.name);
    }
  } else {
    EnemyAISystem.resetPressureProfile();
  }

  // Clean up effects
  krakenTentacle.dispose();
  whirlpoolEffect.dispose();
  seaSerpentEffect.dispose();
  treasureSparkle.clear();
  victoryConfetti.stop();

  // Reset weather to clear
  weather.transitionTo('clear', 2);

  // Rebuild player ship
  scene.remove(playerGroup);
  playerShipConfig = { speedTier: 0, armorTier: 0, weaponTier: 0 };
  playerGroup = createShipMesh(0x6b3a2a, 0xf5f0e6, 1, playerShipConfig);
  scene.add(playerGroup);

  // Reset UI
  const stats = progression.getPlayerStats();
  ui.updateScore(0);
  ui.updateHealth(stats.health, stats.maxHealth);
  ui.hideCombo();
  ui.hideBossHealthBar();
  ui.hideEventWarning();
  ui.hideEventTimer();
  ui.hideTreasureMapIndicator();

  audio.setBossMode(false);

  gamePaused = false;
  beginWave();
}

// ===================================================================
//  Camera
// ===================================================================

const camPos = new THREE.Vector3(0, 20, 30);
const camLookAt = new THREE.Vector3();
let spyglassAmount = 0;

function updateCamera(dt: number) {
  const stats = progression.getPlayerStats();
  const speedRatio = Math.abs(playerSpeed) / stats.maxSpeed;
  const spyglass = (keys[' '] ?? false) || touchSpyglass;

  spyglassAmount = THREE.MathUtils.lerp(
    spyglassAmount, spyglass ? 1 : 0, 1 - Math.exp(-5 * dt),
  );

  const distBehind = THREE.MathUtils.lerp(18, 26, speedRatio);
  const camHeight = THREE.MathUtils.lerp(14, 19, speedRatio);
  const spyFwd = spyglassAmount * 14;
  const spyUp = spyglassAmount * 4;

  // Reuse module-level temp vectors to avoid per-frame allocations
  const behindDist = distBehind - spyFwd;
  _camTmpA.set(
    playerPos.x - Math.sin(playerAngle) * behindDist,
    playerPos.y + camHeight + spyUp,
    playerPos.z - Math.cos(playerAngle) * behindDist,
  );
  camPos.lerp(_camTmpA, 1 - Math.exp(-3.5 * dt));
  camera.position.copy(camPos).add(screenShake.offset);

  const lookAheadDist = spyglassAmount * 60;
  _camTmpA.set(
    playerPos.x + Math.sin(playerAngle) * lookAheadDist,
    playerPos.y,
    playerPos.z + Math.cos(playerAngle) * lookAheadDist,
  );
  camLookAt.lerp(_camTmpA, 1 - Math.exp(-5 * dt));
  camera.lookAt(camLookAt);

  const baseFov = THREE.MathUtils.lerp(56, 68, speedRatio);
  const targetFov = THREE.MathUtils.lerp(baseFov, 22, spyglassAmount);
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6 * dt));
  camera.updateProjectionMatrix();
  ui.setSpyglass(spyglass);
}

// ===================================================================
//  Reusable temp vectors (avoid per-frame allocations)
// ===================================================================

const _tmpVec3A = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpVec3C = new THREE.Vector3();
const _camTmpA = new THREE.Vector3();

// ===================================================================
//  Ship wave-tilt helper
// ===================================================================

function applyWaveTilt(
  mesh: THREE.Group, x: number, z: number,
  heading: number, t: number, dt: number, extraRoll = 0,
) {
  const waveScale = weather.getCurrentConfig().waveScale;
  const wave = ocean.getWaveInfo(x, z, t, waveScale);
  mesh.position.y = THREE.MathUtils.lerp(
    mesh.position.y, wave.height + 0.35, 1 - Math.exp(-8 * dt),
  );
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const fwdSlope = wave.slopeX * sinH + wave.slopeZ * cosH;
  const sideSlope = wave.slopeX * cosH - wave.slopeZ * sinH;
  mesh.rotation.y = heading;
  mesh.rotation.x = THREE.MathUtils.lerp(
    mesh.rotation.x, -Math.atan(fwdSlope) * 0.35, 1 - Math.exp(-6 * dt),
  );
  mesh.rotation.z = THREE.MathUtils.lerp(
    mesh.rotation.z, -Math.atan(sideSlope) * 0.35 + extraRoll, 1 - Math.exp(-6 * dt),
  );
}

// ===================================================================
//  Update: player
// ===================================================================

function updatePlayer(dt: number) {
  const stats = progression.getPlayerStats();
  const maxSpeed = stats.maxSpeed;

  const fwd = Math.max(-1, Math.min(1,
    (keys['w'] || keys['arrowup'] ? 1 : 0)
    - (keys['s'] || keys['arrowdown'] ? 1 : 0)
    + touchFwd,
  ));
  const turn = Math.max(-1, Math.min(1,
    (keys['a'] || keys['arrowleft'] ? 1 : 0)
    - (keys['d'] || keys['arrowright'] ? 1 : 0)
    + touchTurn,
  ));

  // Wind direction affects speed
  const weatherCfg = weather.getCurrentConfig();
  const windDir = weatherCfg.sunDirection;
  const shipForward = _tmpVec3A.set(Math.sin(playerAngle), 0, Math.cos(playerAngle));
  const windDot = shipForward.x * windDir.x + shipForward.z * windDir.z;
  const windSpeedMod = stats.stormImmunity ? 1.0 : 1.0 + windDot * 0.15;

  const effectiveMaxSpeed = maxSpeed * windSpeedMod;

  const targetSpd = fwd > 0 ? effectiveMaxSpeed * fwd : (fwd < 0 ? effectiveMaxSpeed * 0.3 * fwd : 0);
  if (Math.abs(fwd) > 0.05) {
    const accel = fwd > 0 ? 8 : 5;
    playerSpeed = THREE.MathUtils.lerp(playerSpeed, targetSpd, 1 - Math.exp(-accel * dt * 0.3));
  } else {
    playerSpeed *= Math.exp(-1.8 * dt);
  }

  const turnRate = 2.2;
  const speedFactor = Math.min(1, Math.abs(playerSpeed) / (effectiveMaxSpeed * 0.25));
  playerAngle += turn * turnRate * dt * speedFactor;

  // Apply recoil
  recoilOffset *= Math.exp(-12 * dt);

  const prevX = playerPos.x;
  const prevZ = playerPos.z;
  const recoilX = -Math.sin(playerAngle) * recoilOffset;
  const recoilZ = -Math.cos(playerAngle) * recoilOffset;
  playerPos.x += Math.sin(playerAngle) * playerSpeed * dt + recoilX * dt;
  playerPos.z += Math.cos(playerAngle) * playerSpeed * dt + recoilZ * dt;

  playerVel.set(
    (playerPos.x - prevX) / dt,
    0,
    (playerPos.z - prevZ) / dt,
  );

  juiceVel += (1 - juiceScale) * 35 * dt;
  juiceVel *= Math.exp(-6 * dt);
  juiceScale += juiceVel * dt;

  const turnLean = -turn * 0.14 * speedFactor;
  applyWaveTilt(playerGroup, playerPos.x, playerPos.z, playerAngle, time, dt, turnLean);
  playerGroup.position.x = playerPos.x;
  playerGroup.position.z = playerPos.z;
  playerGroup.scale.setScalar(juiceScale);

  // Update sail animation
  updateShipSails(playerGroup, time, weatherCfg.windIntensity);

  const sternWorld = _tmpVec3B.set(0, 0, -2.2)
    .applyAxisAngle(_tmpVec3C.set(0, 1, 0), playerAngle)
    .add(playerPos);
  wake.spawn(sternWorld, Math.abs(playerSpeed), dt);

  // Bioluminescent wake at night
  if (weather.getCurrentState() === 'night') {
    skySystem.spawnBioWake(sternWorld, Math.abs(playerSpeed), dt);
  }

  audio.setSpeedFactor(Math.abs(playerSpeed) / maxSpeed);

  creakTimer -= dt;
  if (creakTimer <= 0 && Math.abs(playerSpeed) > 2) {
    audio.playCreak();
    creakTimer = 4 + Math.random() * 6;
  }

  ui.updateHealth(stats.health, stats.maxHealth);
  ui.updateCooldowns(combat.canFirePort, combat.canFireStarboard);

  // Score count-up animation
  ui.updateScoreAnimated(progression.getScore());
  ui.updateScoreDisplay(dt);
}

// ===================================================================
//  Angle normalisation helper
// ===================================================================

function normalizeAngle(a: number): number {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ===================================================================
//  Update: merchants
// ===================================================================

function updateMerchants(dt: number) {
  const stats = progression.getPlayerStats();
  const captureDist = stats.captureRange;
  let nearestDist = Infinity;
  let nearestPos: THREE.Vector3 | null = null;

  const weatherCfg = weather.getCurrentConfig();
  const weatherIntensity = weatherCfg.windIntensity;

  // Minimap entity list
  const minimapEntities: Array<{x: number, z: number, type: 'merchant' | 'escort' | 'boss' | 'island'}> = [];

  // Update formations for navy warships
  EnemyAISystem.updateFormation(merchants);

  for (let i = merchants.length - 1; i >= 0; i--) {
    const m = merchants[i];

    // Multi-stage sinking
    if (m.state === 'sinking') {
      m.sinkTimer += dt;

      if (m.sinkTimer < 0.8) {
        m.mesh.rotation.z += dt * 0.8;
      } else if (m.sinkTimer < 1.5) {
        m.mesh.position.y -= dt * 0.8;
        m.mesh.rotation.z += dt * 0.3;
        fireEffect.emit(_tmpVec3A.copy(m.pos).add(_tmpVec3B.set(0, 1, 0)), 3);
      } else if (m.sinkTimer < 2.5) {
        if (m.sinkPhase < 3) {
          m.sinkPhase = 3;
          shipBreakup.emit(m.pos);
        }
        m.mesh.position.y -= dt * 2.5;
        m.mesh.rotation.x -= dt * 0.8;
        m.mesh.rotation.z += dt * 0.5;
        fireEffect.emit(_tmpVec3A.copy(m.pos).add(_tmpVec3B.set(0, 0.5, 0)), 2);
      } else {
        m.mesh.position.y -= dt * 3.0;
        m.mesh.rotation.z += dt * 0.2;
      }

      if (m.sinkTimer > SINK_DURATION) {
        scene.remove(m.mesh);
        merchants.splice(i, 1);
      }
      continue;
    }

    const dx = playerPos.x - m.pos.x;
    const dz = playerPos.z - m.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Chain shot slow timer
    if (m.chainSlowTimer > 0) {
      m.chainSlowTimer -= dt;
      m.speed = m.baseSpeed * 0.5;
    }

    // Update sail animation
    updateShipSails(m.mesh, time, weatherCfg.windIntensity);

    // Boss enrage check
    if (m.isBoss && !m.bossEnraged && m.hp <= m.maxHp * 0.5) {
      m.bossEnraged = true;
      m.baseSpeed *= 1.5;
      m.fireTimer = Math.min(m.fireTimer, 1.0);
    }

    if (m.isBoss) {
      ui.updateBossHealth(m.hp, m.maxHp);
    }

    // Surrender check for unarmed ships
    if (!m.armed && !m.isBoss && m.hp > 0 && m.hp < m.maxHp * 0.2 && !m.surrendering) {
      m.surrendering = true;
      m.state = 'surrendering';
      m.speed = 0;
      addSurrenderFlag(m.mesh);
      audio.playSurrender();
    }

    // Ghost ship phase update
    if (m.enemyType === 'ghost_ship') {
      EnemyAISystem.updateGhostPhase(m, dt);
      GhostShipEffect.applyGhostEffect(m.mesh, m.isPhased);
    }

    // Fire ship explosion check
    if (m.enemyType === 'fire_ship') {
      const explResult = EnemyAISystem.checkFireShipExplosion(m, playerPos);
      if (explResult && explResult.exploded) {
        fireShipExplosion.emit(m.pos, explResult.aoeRadius);
        explosionEffect.emit(m.pos, 40);
        screenShake.trigger(0.8);
        audio.playExplosion(m.pos, playerPos);

        // Damage player if in range (skip in screensaver or god mode — invincible)
        if (explResult.playerDamage > 0 && !screensaverActive && !devGodMode) {
          progression.addDamageTaken(explResult.playerDamage);
          const dead = progression.takeDamage(explResult.playerDamage);
          ui.updateHealth(stats.health, stats.maxHealth);
          if (dead && !gameOverFired) {
            gameOverFired = true;
            onGameOver();
          }
        }

        // Sink the fire ship
        m.state = 'sinking';
        m.sinkTimer = 0;
        m.sinkPhase = 0;
        m.speed = 0;
        if (!screensaverActive) progression.onShipDestroyed();
        continue;
      }
    }

    // Delegate AI movement to EnemyAISystem
    EnemyAISystem.updateAI(m, playerPos, playerAngle, dt, merchants);

    // Armed enemy firing (using EnemyAI's shouldFire check)
    m.fireTimer -= dt;
    if (EnemyAISystem.shouldFire(m, playerPos)) {
      const accuracy = Math.max(0.3, 0.7 - weatherIntensity * 0.3);
      combat.fireEscortShot(m.pos, m.heading, playerPos, playerVel, accuracy);
      audio.playExplosion(m.pos, playerPos);
      m.fireTimer = EnemyAISystem.getFireCooldown(m);

      const fireDir = _tmpVec3A.set(
        playerPos.x - m.pos.x, 0.3, playerPos.z - m.pos.z,
      ).normalize();
      const muzzlePos = _tmpVec3B.copy(m.pos).setY(m.pos.y + 0.8);
      cannonSmoke.emit(muzzlePos, fireDir, 8);
      muzzleFlash.emit(muzzlePos, fireDir);
    }

    // Apply position and wave tilt
    m.mesh.position.x = m.pos.x;
    m.mesh.position.z = m.pos.z;
    applyWaveTilt(m.mesh, m.pos.x, m.pos.z, m.heading, time, dt);
    m.pos.y = m.mesh.position.y;

    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPos = m.pos;
    }

    // Minimap data
    minimapEntities.push({
      x: m.pos.x, z: m.pos.z,
      type: m.isBoss ? 'boss' : m.armed ? 'escort' : 'merchant',
    });

    // Surrender capture
    if (m.surrendering && dist < captureDist) {
      const bonusMultiplier = 1.5 + (stats.boardingPartyBonus ?? 0);
      m.value = Math.round(m.value * bonusMultiplier);
      triggerCapture(m, i);
      continue;
    }

    // Capture (boarding)
    if (dist < captureDist && m.hp <= 0) {
      triggerCapture(m, i);
      continue;
    }

    if (dist < captureDist && !m.armed && !m.surrendering) {
      triggerCapture(m, i);
      continue;
    }

    // Despawn check (using EnemyAI)
    if (EnemyAISystem.shouldDespawn(m, playerPos)) {
      scene.remove(m.mesh);
      merchants.splice(i, 1);
      if (!screensaverActive) {
        progression.onShipDestroyed();
        ui.updateWaveCounter(
          progression.getCurrentWave(),
          progression.getShipsRemaining(),
          progression.getShipsTotal(),
        );
      }
    }
  }

  // Add islands to minimap
  for (const island of world.getIslands()) {
    minimapEntities.push({
      x: island.pos.x, z: island.pos.z,
      type: 'island' as const,
    });
  }

  // Update minimap
  ui.updateMinimap(
    { x: playerPos.x, z: playerPos.z },
    playerAngle,
    minimapEntities,
    stats.cursedCompass,
  );

  // Compass: point to treasure island if map active, else nearest ship
  const treasureIdx = events.getTreasureMapTarget();
  const islands = world.getIslands();
  if (treasureIdx >= 0 && treasureIdx < islands.length) {
    const tIsland = islands[treasureIdx];
    const tdx = tIsland.pos.x - playerPos.x;
    const tdz = tIsland.pos.z - playerPos.z;
    const tDist = Math.sqrt(tdx * tdx + tdz * tdz);
    const tAngle = Math.atan2(tdx, tdz);
    ui.updateCompass(tAngle - playerAngle);
    ui.updateDistance(tDist);
  } else if (nearestPos) {
    const dx = nearestPos.x - playerPos.x;
    const dz = nearestPos.z - playerPos.z;
    const worldAngle = Math.atan2(dx, dz);
    ui.updateCompass(worldAngle - playerAngle);
    ui.updateDistance(nearestDist);
  }

  // Combo timeout
  if (combo > 0 && performance.now() / 1000 - lastCaptureTime > 5) {
    combo = 0;
    ui.hideCombo();
  }
}

function triggerCapture(m: MerchantV1, _index: number) {
  if (m.state === 'sinking') return; // prevent double-capture

  // In screensaver mode, just sink the ship with visual effects — skip progression/UI
  if (screensaverActive) {
    goldBurst.emit(m.pos, 20);
    waterSplash.emit(m.pos, 20);
    screenShake.trigger(0.3);
    audio.playSplash();
    floatingDebris.emit(m.pos);
    m.state = 'sinking';
    m.sinkTimer = 0;
    m.sinkPhase = 0;
    m.speed = 0;
    return;
  }

  const now = performance.now() / 1000;
  combo = (now - lastCaptureTime < 5) ? combo + 1 : 1;
  lastCaptureTime = now;
  progression.updateBestCombo(combo);

  const reward = m.value * combo;
  capturesThisWave++;
  if (m.armed) armedCapturesThisWave++;
  waveCaptureGold += reward;
  if (activeContractObjective) {
    const progress = getContractObjectiveProgress(activeContractObjective);
    const halfwayTarget = activeContractObjective.contractType === 'plunder_gold'
      ? Math.round(activeContractObjective.target * 0.5)
      : Math.ceil(activeContractObjective.target * 0.5);

    if (!activeContractObjective.announcedMidpoint && progress >= halfwayTarget) {
      activeContractObjective.announcedMidpoint = true;
      ui.showCaptainLog(
        `Contract progress: ${formatContractProgress(activeContractObjective, progress)}.`,
        'neutral',
      );
    }
    if (!activeContractObjective.announcedComplete && progress >= activeContractObjective.target) {
      activeContractObjective.announcedComplete = true;
      ui.showCaptainLog(
        `Contract objective met: ${formatContractProgress(activeContractObjective, progress)}.`,
        'reward',
      );
    }
  }
  progression.addScore(reward);
  economy.addSupplies(1);
  if (m.armed) economy.addIntel(1);
  telemetry.track('ship_captured', {
    enemyType: m.enemyType,
    reward,
    combo,
    armed: m.armed,
  });
  applyRegionalFactionReputationDelta(m.isBoss ? -1.25 : -0.4, m.isBoss ? 'boss_capture' : 'ship_capture');
  ui.updateScoreAnimated(progression.getScore());
  ui.showCapture(`+${reward} Gold!`, combo);
  goldBurst.emit(m.pos, 30 + combo * 8);
  waterSplash.emit(m.pos, 20);
  screenShake.trigger(0.4 + combo * 0.12);
  juiceScale = 1.18;
  juiceVel = -4;

  // Audio
  audio.playCoinJingle(combo);
  audio.playSplash();
  if (combo > 1) audio.playComboTone(combo);

  // Combo juice effects
  if (combo >= 3) {
    screenJuice.triggerDramaticKill();
    screenJuice.triggerCombo();
  }

  // Boss defeat
  if (m.isBoss) {
    audio.playBossDefeat();
    audio.setBossMode(false);
    currentBoss = null;
    ui.hideBossHealthBar();
    progression.addScore(m.value * 4);
    economy.addReputationTokens(2);
  }

  // Roll for treasure map drop
  if (events.rollForTreasureMap()) {
    const islands = world.getIslands();
    if (islands.length > 0) {
      events.startEvent('treasure_map', playerPos, islands.length);
      ui.showTreasureMapIndicator();
      announceEventStart('treasure_map');
    }
  }

  // Tutorial: captured
  tutorialCaptured = true;

  // Float debris from sinking
  floatingDebris.emit(m.pos);

  // Sink the ship
  m.state = 'sinking';
  m.sinkTimer = 0;
  m.sinkPhase = 0;
  m.speed = 0;

  // Notify progression
  progression.onShipDestroyed();

  const wc = activeWaveConfigV1 ?? progression.getWaveConfigV1();
  ui.updateWaveCounter(
    wc.wave,
    progression.getShipsRemaining(),
    progression.getShipsTotal(),
  );
}

// ===================================================================
//  Combat: check cannonball hits
// ===================================================================

function syncUpgradesToCombat() {
  const stats = progression.getPlayerStats();
  combat.spreadReduction = stats.steadyHandsSpread ?? 1.0;
  combat.neptunesWrathActive = stats.neptunesWrath ?? false;
  combat.chainShotActive = stats.chainShotActive ?? false;
  combat.grapeshotActive = stats.grapeshotActive ?? false;
  combat.cooldownMultiplier = stats.cannonCooldown;
}

function updateCombat(dt: number) {
  // Build ghost miss map for phased ghost ships
  const ghostMissMap = EnemyAISystem.buildGhostMissMap(merchants);

  combat.update(dt);

  // Build target list for player cannonballs hitting merchants
  const targets: Array<{pos: THREE.Vector3, hitRadius: number, id: number}> = [];
  for (let i = 0; i < merchants.length; i++) {
    const m = merchants[i];
    if (m.state !== 'sinking') targets.push({ pos: m.pos, hitRadius: m.hitRadius, id: m.id });
  }

  // Add kraken tentacles as targets if event is active
  const currentEvent = events.getCurrentEvent();
  if (currentEvent && currentEvent.type === 'kraken' && currentEvent.active) {
    const tentData = currentEvent.data as Record<string, unknown>;
    const tentPositions = tentData['tentaclePositions'] as THREE.Vector3[] | undefined;
    const tentHp = tentData['tentacleHp'] as number[] | undefined;
    if (tentPositions && tentHp) {
      for (let t = 0; t < tentPositions.length; t++) {
        if (tentHp[t] > 0) {
          targets.push({ pos: tentPositions[t], hitRadius: 3, id: 10000 + t });
        }
      }
    }
  }

  const hits = combat.checkHits(targets, ghostMissMap);

  for (const hit of hits) {
    // Check if this is a kraken tentacle hit (id >= 10000)
    if (hit.targetId >= 10000) {
      const tentIndex = hit.targetId - 10000;
      progression.addDamageDealt(hit.damage);
      const destroyed = events.hitTentacle(tentIndex, hit.damage);
      explosionEffect.emit(hit.hitPos, 25);
      audio.playExplosion(hit.hitPos, playerPos);
      screenShake.trigger(0.3);
      if (destroyed) {
        goldBurst.emit(hit.hitPos, 15);
      }
      continue;
    }

    const m = merchants.find(m => m.id === hit.targetId);
    if (!m || m.state === 'sinking') continue;

    const dealt = devInstakill ? m.hp : Math.min(hit.damage, m.hp);
    if (dealt > 0) progression.addDamageDealt(dealt);
    if (devInstakill) m.hp = 0; else m.hp -= hit.damage;

    // Chain shot effect
    if (progression.getPlayerStats().chainShotActive) {
      m.chainSlowTimer = 3;
    }

    // Effects at hit point
    explosionEffect.emit(hit.hitPos, 20);
    audio.playExplosion(hit.hitPos, playerPos);
    screenShake.trigger(0.25);

    if (m.hp <= 0) {
      const idx = merchants.indexOf(m);
      if (idx >= 0) {
        triggerCapture(m, idx);
      }
    }
  }

  // Check enemy cannonballs hitting player
  const playerHit = combat.checkPlayerHit(playerPos, 2.8);
  if (playerHit) {
    // In screensaver, player is invincible — just show effects
    if (screensaverActive) {
      explosionEffect.emit(playerHit.hitPos, 15);
      screenShake.trigger(0.3);
    } else {
      explosionEffect.emit(playerHit.hitPos, 15);
      audio.playExplosion(playerHit.hitPos, playerPos);
      screenShake.trigger(0.6);

      if (!devGodMode) {
        const stats = progression.getPlayerStats();
        progression.addDamageTaken(playerHit.damage);
        const dead = progression.takeDamage(playerHit.damage);

        // Screen juice: damage flash + direction indicator
        const hitDx = playerHit.hitPos.x - playerPos.x;
        const hitDz = playerHit.hitPos.z - playerPos.z;
        const hitAngle = Math.atan2(hitDx, hitDz) - playerAngle;
        const normHitAngle = normalizeAngle(hitAngle);
        let dir: 'front' | 'back' | 'left' | 'right' = 'front';
        if (Math.abs(normHitAngle) < Math.PI / 4) dir = 'front';
        else if (Math.abs(normHitAngle) > Math.PI * 3 / 4) dir = 'back';
        else if (normHitAngle > 0) dir = 'left';
        else dir = 'right';
        screenJuice.triggerDamage(dir);

        ui.updateHealth(stats.health, stats.maxHealth);

        if (dead && !gameOverFired) {
          gameOverFired = true;
          onGameOver();
        }
      }
    }
  }
}

// ===================================================================
//  Weather update
// ===================================================================

function updateWeather(dt: number) {
  const result = weather.update(dt);

  rain.active = result.config.rainIntensity > 0.3;

  // Sky system updates
  const isNight = weather.getCurrentState() === 'night';
  skySystem.setStarVisibility(isNight ? 1 : 0);
  skySystem.setBioWakeActive(isNight);
  skySystem.update(dt, time, result.config.sunDirection, weather.getCurrentState());

  // Lightning
  if (result.lightning) {
    screenShake.trigger(0.3);
    skySystem.triggerLightning(playerPos);
    audio.playLightningCrack();
    if (result.thunderDelay > 0) {
      setTimeout(() => {
        audio.playThunder();
      }, result.thunderDelay * 1000);
    }
  }

  // Update lanterns only when night state changes
  if (isNight !== lastIsNight) {
    lastIsNight = isNight;
    setShipLanterns(playerGroup, isNight);
    for (const m of merchants) {
      if (m.state !== 'sinking') {
        setShipLanterns(m.mesh, isNight);
      }
    }
  }

  audio.setWeatherIntensity(result.config.windIntensity);

  // Weather affects cannon spread (stormy = more inaccurate)
  combat.weatherSpreadBonus = result.config.windIntensity * 2.5;
}

// ===================================================================
//  Update: world (islands, collisions, treasure)
// ===================================================================

let lodTimer = 0;

function updateWorld(dt: number) {
  // LOD: throttle to ~2 checks/sec instead of every frame
  lodTimer += dt;
  if (lodTimer >= 0.5) {
    lodTimer = 0;
    world.updateLOD(playerPos);
  }

  // Update animated island elements (fortress flags)
  world.updateAnimations(time, weather.getCurrentConfig().windIntensity);

  // Log newly discovered landmarks near the player
  islandDiscoveryScanTimer -= dt;
  if (islandDiscoveryScanTimer <= 0) {
    islandDiscoveryScanTimer = 0.6;
    let discoveredThisTick = false;
    for (const island of world.getIslands()) {
      if (discoveredIslandSeeds.has(island.seed)) continue;
      const dx = playerPos.x - island.pos.x;
      const dz = playerPos.z - island.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= 55) {
        discoveredIslandSeeds.add(island.seed);
        const typeLabel = island.type.charAt(0).toUpperCase() + island.type.slice(1);
        ui.showCaptainLog(`Landmark charted: ${island.name} (${typeLabel} isle).`, 'neutral');
        unlockCodexEntry(`landmark:${island.type}`, `Landmark: ${typeLabel} Isles`);
        discoveredThisTick = true;
      }
      if (discoveredThisTick) break;
    }
  }

  // Check island collision and reef damage
  const collision = world.checkCollision(playerPos, dt);
  if (collision.bounceDir) {
    playerPos.add(collision.bounceDir.multiplyScalar(dt));
    playerSpeed *= 0.5;
  }
  if (collision.reefDamage > 0 && !devGodMode) {
    progression.addDamageTaken(collision.reefDamage);
    const dead = progression.takeDamage(collision.reefDamage);
    const stats = progression.getPlayerStats();
    ui.updateHealth(stats.health, stats.maxHealth);
    if (dead && !gameOverFired) {
      gameOverFired = true;
      onGameOver();
    }
  }

  // Check treasure dig site
  const hasTreasureMap = events.getTreasureMapTarget() >= 0;
  const digIsland = world.checkDigSite(playerPos, hasTreasureMap);
  if (digIsland) {
    const treasureGold = 200 + Math.floor(Math.random() * 600);
    progression.addScore(treasureGold);
    progression.addTreasureFound();
    economy.addSupplies(3);
    economy.addIntel(2);
    telemetry.track('treasure_found', {
      island: digIsland.name,
      gold: treasureGold,
    });
    ui.showCapture(`+${treasureGold} Treasure!`, 1);
    ui.showCaptainLog(`We dug up ${treasureGold} gold at ${digIsland.name}.`, 'reward');
    goldBurst.emit(playerPos, 50);
    audio.playCoinJingle(3);
    world.collectTreasure(digIsland);
    events.clearTreasureMap();
    ui.hideTreasureMapIndicator();
    announceEventEnd('treasure_map', true);
  }

  // Sparkle effect on nearby treasure islands
  if (hasTreasureMap) {
    const islands = world.getIslands();
    const targetIdx = events.getTreasureMapTarget();
    if (targetIdx >= 0 && targetIdx < islands.length) {
      const island = islands[targetIdx];
      if (island.hasTreasure && !island.treasureCollected) {
        treasureSparkle.spawn(island.pos);
      }
    }
  }
}

// ===================================================================
//  Update: events (kraken, whirlpool, serpent, storm surge)
// ===================================================================

function updateEvents(dt: number) {
  const waveNum = progression.getCurrentWave();
  const weatherState = weather.getCurrentState();

  // Roll for random events once per second
  if (events.shouldRoll()) {
    const rollMultiplier = getRegionalEventPressureMultiplier();
    let eventType: EventType | null = null;

    if (rollMultiplier < 1) {
      if (Math.random() < rollMultiplier) {
        eventType = events.rollForEvent(waveNum, weatherState);
      }
    } else {
      eventType = events.rollForEvent(waveNum, weatherState);
      const extraRolls = Math.floor(rollMultiplier - 1);
      for (let i = 0; i < extraRolls && !eventType; i++) {
        eventType = events.rollForEvent(waveNum, weatherState);
      }
      const fractionalRoll = (rollMultiplier - 1) - extraRolls;
      if (!eventType && Math.random() < fractionalRoll) {
        eventType = events.rollForEvent(waveNum, weatherState);
      }
    }

    if (eventType) {
      events.startEvent(eventType, playerPos, world.getIslands().length);
      announceEventStart(eventType);

      // Spawn event-specific effects
      const evt = events.getCurrentEvent();
      if (evt) {
        switch (evt.type) {
          case 'kraken': {
            const tentPositions = evt.data['tentaclePositions'] as THREE.Vector3[] | undefined;
            if (tentPositions) krakenTentacle.spawn(tentPositions);
            audio.setEventMode('kraken');
            break;
          }
          case 'whirlpool':
            whirlpoolEffect.spawn(evt.pos);
            break;
          case 'sea_serpent':
            seaSerpentEffect.spawn(evt.pos);
            audio.setEventMode('sea_serpent');
            break;
          case 'ghost_ship_event':
            audio.setEventMode('ghost_ship_event');
            break;
          case 'storm_surge':
            weather.triggerStormSurge();
            break;
        }
      }
    }
  }

  // Per-frame event update
  const result = events.update(dt, playerPos, Math.abs(playerSpeed));

  // Apply event damage to player
  if (result.damageToPlayer > 0 && !devGodMode) {
    progression.addDamageTaken(result.damageToPlayer);
    const dead = progression.takeDamage(result.damageToPlayer);
    const stats = progression.getPlayerStats();
    ui.updateHealth(stats.health, stats.maxHealth);
    screenShake.trigger(0.3);
    if (dead && !gameOverFired) {
      gameOverFired = true;
      onGameOver();
    }
  }

  // Apply event gold reward
  if (result.goldReward > 0) {
    progression.addScore(result.goldReward);
    ui.showCapture(`+${result.goldReward} Gold!`, 1);
    goldBurst.emit(playerPos, 30);
    audio.playCoinJingle(2);
  }

  // Apply whirlpool pull force
  if (result.pullForce) {
    playerPos.add(result.pullForce.multiplyScalar(dt));
  }

  // Event UI: warning and timer
  if (result.warning) {
    ui.showEventWarning(result.warning);
  }

  const currentEvt = events.getCurrentEvent();
  const activeEventType = currentEvt?.type ?? null;
  if (currentEvt && currentEvt.active) {
    ui.showEventTimer(
      currentEvt.type,
      currentEvt.duration - currentEvt.timer,
      currentEvt.duration,
    );

    // Update event-specific effects
    if (currentEvt.type === 'kraken') {
      krakenTentacle.update(dt, time);
    } else if (currentEvt.type === 'whirlpool') {
      whirlpoolEffect.update(dt, time);
    } else if (currentEvt.type === 'sea_serpent') {
      const serpentDmg = seaSerpentEffect.update(dt, time, playerPos);
      if (serpentDmg > 0 && !devGodMode) {
        progression.addDamageTaken(serpentDmg * dt);
        const dead = progression.takeDamage(serpentDmg * dt);
        const stats = progression.getPlayerStats();
        ui.updateHealth(stats.health, stats.maxHealth);
        if (dead && !gameOverFired) {
          gameOverFired = true;
          onGameOver();
        }
      }
    }

    // Event weather overlay
    weather.setEventOverlay(currentEvt.type);
  }

  // Event completed
  if (result.eventComplete) {
    progression.addEventCompleted();
    if (activeEventType) {
      const success = result.goldReward > 0 || result.damageToPlayer <= 0;
      announceEventEnd(activeEventType, success);
    }
    ui.hideEventWarning();
    ui.hideEventTimer();
    krakenTentacle.dispose();
    whirlpoolEffect.dispose();
    seaSerpentEffect.dispose();
    audio.setEventMode(null);
    weather.setEventOverlay(null);
  }
}

// ===================================================================
//  Update: tutorial
// ===================================================================

function updateTutorial(dt: number) {
  if (!tutorial.isActive()) return;

  // Track movement condition
  if (Math.abs(playerSpeed) > 1) tutorialMoved = true;

  tutorial.advanceIfConditionMet({
    moved: tutorialMoved,
    fired: tutorialFired,
    captured: tutorialCaptured,
    upgraded: tutorialUpgraded,
  });
  tutorial.update(dt);
}

function updateV2Hud(dt: number) {
  v2HudRefreshTimer -= dt;
  if (v2HudRefreshTimer > 0) return;
  v2HudRefreshTimer = 0.2;
  const econ = economy.getState();
  ui.updateV2Resources(econ.supplies, econ.intel, econ.reputationTokens);
  const context = getRegionalFactionContext();
  ui.updateV2FactionStatus(context.factionName, context.reputation);
}

// ===================================================================
//  Wave lifecycle management
// ===================================================================

function updateWaveLifecycle(dt: number) {
  if (waveAnnouncePending) {
    waveAnnounceTimer -= dt;
    if (waveAnnounceTimer <= 0) {
      waveAnnouncePending = false;
      spawnWaveFleet();
    }
    return;
  }

  if (progression.getState() === 'wave_complete') {
    waveCompleteTimer += dt;
    if (waveCompleteTimer > 1.5) {
      waveCompleteTimer = -999;
      onWaveComplete();
    }
    return;
  }

  if (progression.getState() === 'active') {
    waveCompleteTimer = 0;
  }
}

// ===================================================================
//  Main loop
// ===================================================================

let time = 0;
let lastNow = -1;

function animate(now: number) {
  requestAnimationFrame(animate);
  if (lastNow < 0) { lastNow = now; return; }
  const rawDt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;

  // Get time scale from slow-motion juice
  const stats = progression.getPlayerStats();
  const healthPct = stats.health / stats.maxHealth * 100;
  const timeScale = screenJuice.update(rawDt, healthPct);

  const dt = rawDt * timeScale;
  time += dt;

  ocean.update(time, (gameStarted || screensaverActive) ? playerPos : new THREE.Vector3());
  skyMat.uniforms.uTime.value = time;

  if (gameStarted && !gamePaused) {
    updatePlayer(dt);
    updateMerchants(dt);
    updateCombat(dt);
    updateWeather(dt);
    updateWorld(dt);
    updateEvents(dt);
    updateTutorial(dt);
    updateV2Hud(dt);
    updateFactionFeedback(dt);
    updateWaveLifecycle(dt);
    updateCamera(dt);
    narrative.update(dt);
  } else if (gameStarted && gamePaused) {
    updateWeather(dt);
    updateV2Hud(dt);
    updateFactionFeedback(dt);
    updateCamera(dt);
    narrative.update(dt);
    // Update port scene if active
    if (portScene) {
      portScene.update(dt, time);
    }
  } else if (screensaverActive) {
    // Autopilot drives playerSpeed/playerAngle
    updateAutopilot(dt);

    // Move player based on autopilot output
    playerPos.x += Math.sin(playerAngle) * playerSpeed * dt;
    playerPos.z += Math.cos(playerAngle) * playerSpeed * dt;

    // Apply wave tilt & sails
    applyWaveTilt(playerGroup, playerPos.x, playerPos.z, playerAngle, time, dt);
    playerGroup.position.x = playerPos.x;
    playerGroup.position.z = playerPos.z;
    const weatherCfg = weather.getCurrentConfig();
    updateShipSails(playerGroup, time, weatherCfg.windIntensity);

    // Wake trail
    const sternWorld = _tmpVec3B.set(0, 0, -2.2)
      .applyAxisAngle(_tmpVec3C.set(0, 1, 0), playerAngle)
      .add(playerPos);
    wake.spawn(sternWorld, Math.abs(playerSpeed), dt);

    // Reuse real game systems
    updateMerchants(dt);
    updateCombat(dt);
    updateWeather(dt);

    // Island LOD & animations
    lodTimer += dt;
    if (lodTimer >= 0.5) {
      lodTimer = 0;
      world.updateLOD(playerPos);
    }
    world.updateAnimations(time, weatherCfg.windIntensity);

    // Follow camera
    updateCamera(dt);
    narrative.update(dt);

    // Periodic merchant spawning
    screensaverSpawnTimer += dt;
    if (screensaverSpawnTimer >= 12 + Math.random() * 8) {
      screensaverSpawnTimer = 0;
      if (merchants.length < 4) {
        const types: EnemyType[] = ['merchant_sloop', 'merchant_galleon', 'escort_frigate'];
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          spawnEnemy(types[Math.floor(Math.random() * types.length)], false);
        }
      }
    }

    // Weather cycling every 30s
    screensaverWeatherTimer += dt;
    if (screensaverWeatherTimer >= 30) {
      screensaverWeatherTimer = 0;
      screensaverWeatherIndex = (screensaverWeatherIndex + 1) % screensaverWeathers.length;
      weather.transitionTo(screensaverWeathers[screensaverWeatherIndex], 8);
    }
  } else if (editorMode && !editorPlayTestMode) {
    // Editor mode: fly-cam + ocean + weather visuals
    editorCamera?.update(dt, camera);
    scenarioEditor?.update(dt);
    const weatherCfg = weather.getCurrentConfig();
    weather.update(dt);
    world.updateAnimations(time, weatherCfg.windIntensity);
  } else {
    // Title screen camera orbit
    camera.position.set(
      Math.cos(time * 0.15) * 35,
      18 + Math.sin(time * 0.3) * 2,
      Math.sin(time * 0.15) * 35,
    );
    camera.lookAt(0, 0, 0);
    const waveScale = weather.getCurrentConfig().waveScale;
    const w = ocean.getWaveInfo(0, 0, time, waveScale);
    playerGroup.position.y = w.height + 0.35;
    playerGroup.rotation.x = -Math.atan(w.slopeZ) * 0.3;
    playerGroup.rotation.z = -Math.atan(w.slopeX) * 0.3;
    updateShipSails(playerGroup, time, 0.8);
    narrative.update(dt);
  }

  // Effects always update (even paused, for decay)
  goldBurst.update(dt);
  waterSplash.update(dt);
  screenShake.update(dt);
  wake.update(dt);
  cannonSmoke.update(dt);
  explosionEffect.update(dt);
  rain.update(dt, playerPos);
  muzzleFlash.update(dt);
  cannonballTrail.update(dt);
  shipBreakup.update(dt);
  fireEffect.update(dt);
  fireShipExplosion.update(dt);
  treasureSparkle.update(dt, time);
  victoryConfetti.update(dt);

  // Speed lines
  if (gameStarted && !gamePaused) {
    speedLines.update(dt, playerPos, playerAngle, Math.abs(playerSpeed));
  }

  // Floating debris
  const waveScale = weather.getCurrentConfig().waveScale;
  floatingDebris.update(dt, (x, z) => {
    return ocean.getWaveInfo(x, z, time, waveScale).height;
  }, playerPos);

  // Position sky dome at camera
  sky.position.copy(camera.position);
  skySystem.stars.position.copy(camera.position);

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// URL hash check: load shared scenario on startup
if (location.hash.startsWith('#scenario=')) {
  scenarioFromURLHash(location.hash).then(s => {
    if (s) enterEditorMode(s);
  });
}
